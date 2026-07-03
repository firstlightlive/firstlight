import Foundation

enum SyncStatus: Equatable {
    case idle            // synced / nothing pending
    case queued          // pending pushes (gold pulse dot)
    case failing         // >15 min of failures (red dot)
    case keyMissing      // no key configured
    case keyInvalid      // 403 — stop retrying until re-entered
}

/// Local-first sync: debounced pushes on change, pull-merge on foreground,
/// offline queue with backoff. The union-merge contract (server side) makes
/// every push idempotent and clobber-healing.
///
/// Concurrency model (review fixes): the whole engine is @MainActor, so queue
/// read-modify-writes only interleave at await points; generation checks make
/// those interleavings safe:
///  - an entry is deleted after push ONLY if its on-disk generation still
///    equals the pushed generation (ticks landing mid-flight survive)
///  - local state is replaced by merged_ids ONLY if no local mutation happened
///    since the entry was snapshotted (else union — adds are never lost)
///  - pullMerge subtracts pending removals before unioning server state
///    (unticks are never resurrected)
@Observable @MainActor
final class SyncEngine {
    private let api = APIClient()
    weak var store: RitualStore?

    private(set) var status: SyncStatus = .idle
    private(set) var lastSuccessAt: Date?
    private(set) var lastError: String?
    private var firstFailureAt: Date?

    // untick buffer per (date|period) — pushed ids are subtracted on success
    private var removedBuffer: [String: Set<String>] = [:]
    // dirty generation per (date|period) — mirrors the queue entry generation
    private var dirtyGen: [String: Int] = [:]
    private var debounceTask: Task<Void, Never>?
    private var isFlushing = false
    private var retryTask: Task<Void, Never>?

    var pendingCount: Int { SyncQueue.load().entries.count }

    init() {
        status = KeychainStore.loadKey() == nil ? .keyMissing : .idle
    }

    // MARK: - Store hooks

    func noteRemoved(_ id: String, period: Period, date: String) {
        let key = "\(date)|\(period.rawValue)"
        removedBuffer[key, default: []].insert(id)
    }

    /// Called on every tick/untick — coalesce into the queue and debounce a flush.
    func queuePush(period: Period, state: DayState, seed: SeedCatalog) {
        let key = "\(state.date)|\(period.rawValue)"
        var q = SyncQueue.load()
        q.upsert(date: state.date, period: period,
                 completed: Array(state.completedIds(period)),
                 removed: Array(removedBuffer[key] ?? []),
                 totalActive: seed.totalActive(for: period))
        q.save()
        dirtyGen[key] = q.entries.first(where: { $0.id == key })?.generation ?? ((dirtyGen[key] ?? 0) + 1)
        if status == .idle { status = .queued }

        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)   // 2s debounce
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    // MARK: - Flush

    func flush() async {
        guard KeychainStore.loadKey() != nil else { status = .keyMissing; return }
        if status == .keyInvalid { return }   // wait for a re-entered key
        if isFlushing { return }              // single-flight (main-actor serialized)
        isFlushing = true
        defer { isFlushing = false }

        var madeProgress = true
        while madeProgress {
            madeProgress = await flushOnce()
        }
        refreshStatus()
        scheduleRetryIfNeeded(SyncQueue.load())
    }

    /// One pass over due entries. Returns true if any entry succeeded
    /// (so the loop re-runs and picks up entries coalesced mid-flight).
    private func flushOnce() async -> Bool {
        let due = SyncQueue.load().entries.filter { $0.nextAttemptAt <= Date() }
        guard !due.isEmpty else { return false }
        var progressed = false

        for entry in due {
            guard let period = Period(rawValue: entry.period) else {
                var q = SyncQueue.load()
                q.entries.removeAll { $0.id == entry.id }
                q.save()
                continue
            }
            do {
                let resp = try await api.push(date: entry.date, period: period,
                                              completed: entry.completed,
                                              removed: entry.removed,
                                              totalActive: entry.totalActive)
                progressed = true
                lastSuccessAt = Date(); firstFailureAt = nil; lastError = nil

                // Remove the entry ONLY if nothing newer was coalesced mid-flight.
                var q = SyncQueue.load()
                if let i = q.entries.firstIndex(where: { $0.id == entry.id }) {
                    if q.entries[i].generation == entry.generation {
                        q.entries.remove(at: i)
                    }
                    // else: newer entry pending — leave it for the next pass
                }
                q.save()

                // Clear ONLY the removed ids this push actually carried.
                let key = entry.id
                removedBuffer[key]?.subtract(entry.removed)
                if removedBuffer[key]?.isEmpty == true { removedBuffer[key] = nil }

                // Reconcile local state: replace only if still at the pushed
                // generation; otherwise union (never drop a newer local tick).
                if let store, store.state.date == resp.date {
                    let clean = (dirtyGen[key] ?? entry.generation) == entry.generation
                    store.applyServer(ids: resp.merged_ids, period: period, union: !clean)
                }
            } catch let SyncError.http(status: code, code: errCode) {
                switch code {
                case 403:
                    status = .keyInvalid
                    lastError = "key invalid"
                    return progressed
                case 400:
                    // malformed — drop, log, move on (never wedge the queue)
                    var q = SyncQueue.load()
                    q.entries.removeAll { $0.id == entry.id }
                    q.save()
                    lastError = "dropped: \(errCode ?? "400")"
                case 409:
                    // day locked — drop, flag
                    var q = SyncQueue.load()
                    q.entries.removeAll { $0.id == entry.id }
                    q.save()
                    lastError = "not synced — day locked"
                default:
                    bumpBackoff(entry: entry, message: errCode ?? "HTTP \(code)")
                }
            } catch {
                bumpBackoff(entry: entry, message: (error as? SyncError).map { "\($0)" } ?? error.localizedDescription)
            }
        }
        return progressed
    }

    private func bumpBackoff(entry: QueueEntry, message: String) {
        var q = SyncQueue.load()
        if let i = q.entries.firstIndex(where: { $0.id == entry.id }) {
            q.entries[i].attempts += 1
            q.entries[i].nextAttemptAt = Date().addingTimeInterval(SyncQueue.backoff(after: q.entries[i].attempts))
        }
        q.save()
        if firstFailureAt == nil { firstFailureAt = Date() }
        lastError = message
    }

    private func scheduleRetryIfNeeded(_ q: SyncQueue) {
        retryTask?.cancel()
        guard let next = q.entries.map(\.nextAttemptAt).min(), status != .keyInvalid else { return }
        let delay = max(1, next.timeIntervalSinceNow)
        retryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    private func refreshStatus() {
        if KeychainStore.loadKey() == nil { status = .keyMissing; return }
        if status == .keyInvalid { return }
        let q = SyncQueue.load()
        if q.entries.isEmpty { status = .idle }
        else if let first = firstFailureAt, Date().timeIntervalSince(first) > 15 * 60 { status = .failing }
        else { status = .queued }
    }

    /// Key re-entered in Settings — reset the invalid latch and retry.
    func keyUpdated() {
        status = KeychainStore.loadKey() == nil ? .keyMissing : .queued
        firstFailureAt = nil; lastError = nil
        Task { await flush() }
    }

    // MARK: - Pull (foreground)

    /// Union server state into local view — after subtracting every removal
    /// still pending on this device (queue entries + buffer), so an unticked
    /// item can't be resurrected by its own stale server copy.
    func pullMerge() async {
        guard KeychainStore.loadKey() != nil, status != .keyInvalid else { return }
        guard let store else { return }
        let date = store.state.date
        guard let resp = try? await api.getState(date: date) else { return }
        // day may have rolled during the await — never apply to the wrong day
        guard store.state.date == date, resp.date == date else { return }

        let queued = SyncQueue.load().entries
        func pendingRemovals(_ p: Period) -> Set<String> {
            let key = "\(date)|\(p.rawValue)"
            var out = removedBuffer[key] ?? []
            if let e = queued.first(where: { $0.id == key }) { out.formUnion(e.removed) }
            return out
        }

        for p in Period.rituals {
            if let ids = resp.periods[p.rawValue]?.completed_ids, !ids.isEmpty {
                let filtered = ids.filter { !pendingRemovals(p).contains($0) }
                if !filtered.isEmpty { store.applyServer(ids: filtered, period: p, union: true) }
            }
        }
        if !resp.weekend_tasks.completed_ids.isEmpty {
            let filtered = resp.weekend_tasks.completed_ids.filter { !pendingRemovals(.weekend).contains($0) }
            if !filtered.isEmpty { store.applyServer(ids: filtered, period: .weekend, union: true) }
        }
        lastSuccessAt = Date()
        refreshStatus()
    }

    /// End-of-period / background heartbeat: full-state re-POST closes the
    /// web-clobber window (wired from scenePhase .background).
    func heartbeat(period: Period) {
        guard let store else { return }
        queuePush(period: period, state: store.state, seed: store.seed)
    }
}
