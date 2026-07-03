import Foundation
import SwiftUI
import WatchKit

/// Single source of truth for the UI. Local-first: every mutation persists to
/// the App Group immediately and enqueues a sync push; the network never gates
/// a tick.
@Observable @MainActor
final class RitualStore {
    let seed: SeedCatalog
    private(set) var state: DayState
    var syncEngine: SyncEngine?

    // Checklist period pill: auto by IST clock, manual override sticks 30 min.
    private var manualPeriod: Period?
    private var manualPeriodUntil: Date?

    init(seed: SeedCatalog = .loadBundled()) {
        self.seed = seed
        self.state = DayStateIO.load(date: FLDate.effectiveToday())
        DayStateIO.prune()
    }

    // MARK: - Day roll / disk refresh

    /// Called on launch/foreground AND before every mutation (review fixes):
    ///  - if the IST effective day changed, swap state (a tick straddling
    ///    3:00 AM must never be filed on the locked day)
    ///  - otherwise union the disk file into memory: the Action-Button intent
    ///    and notification actions write to disk out-of-process; a resident
    ///    stale store must never clobber those ticks.
    func rollDayIfNeeded() {
        let today = FLDate.effectiveToday()
        guard today == state.date else {
            DayStateIO.save(state)
            state = DayStateIO.load(date: today)
            publishSnapshot()
            return
        }
        let disk = DayStateIO.load(date: state.date)
        var changed = false
        for p in Period.allCases {
            let extra = disk.completedIds(p).subtracting(state.completedIds(p))
            if !extra.isEmpty {
                state.setCompleted(state.completedIds(p).union(extra), for: p)
                changed = true
            }
        }
        if changed {
            DayStateIO.save(state)
            publishSnapshot()
        }
    }

    // MARK: - Period selection

    var displayPeriod: Period {
        if let p = manualPeriod, let until = manualPeriodUntil, Date() < until { return p }
        return FLDate.autoPeriod()
    }

    var isManualPeriod: Bool {
        manualPeriod != nil && (manualPeriodUntil.map { Date() < $0 } ?? false)
    }

    func overridePeriod(_ p: Period) {
        if p == FLDate.autoPeriod() {
            manualPeriod = nil; manualPeriodUntil = nil
        } else {
            manualPeriod = p
            manualPeriodUntil = Date().addingTimeInterval(30 * 60)
        }
    }

    // MARK: - Tick / untick

    func isCompleted(_ id: String, period: Period) -> Bool {
        state.completedIds(period).contains(id)
    }

    func tick(_ id: String, period: Period, haptic: Bool = true) {
        rollDayIfNeeded()   // date captured at tap time; merge any intent writes
        var ids = state.completedIds(period)
        guard !ids.contains(id) else { return }   // dupes are no-ops
        ids.insert(id)
        state.setCompleted(ids, for: period)
        state.skipped[period.rawValue]?.remove(id)
        persistAndQueue(period: period)
        if haptic { WKInterfaceDevice.current().play(.success) }
    }

    func untick(_ id: String, period: Period, haptic: Bool = true) {
        rollDayIfNeeded()
        var ids = state.completedIds(period)
        guard ids.contains(id) else { return }
        ids.remove(id)
        state.setCompleted(ids, for: period)
        syncEngine?.noteRemoved(id, period: period, date: state.date)
        persistAndQueue(period: period)
        if haptic { WKInterfaceDevice.current().play(.retry) }
    }

    func skip(_ id: String, period: Period) {
        rollDayIfNeeded()
        var s = state.skipped[period.rawValue] ?? []
        s.insert(id)
        state.skipped[period.rawValue] = s
        DayStateIO.save(state)
        WKInterfaceDevice.current().play(.click)
        publishSnapshot()
    }

    // MARK: - Derived

    func hero(period: Period? = nil) -> HeroState {
        let p = period ?? displayPeriod
        return CursorEngine.hero(seed: seed, period: p,
                                 completed: state.completedIds(p),
                                 skipped: state.skipped[p.rawValue] ?? [],
                                 isSunday: FLDate.isSunday())
    }

    func doneCount(_ period: Period) -> Int {
        if period == .weekend {
            let tasks = seed.weekendTasks(isSaturday: FLDate.isSaturday())
            return state.completedIds(.weekend).intersection(Set(tasks.map(\.id))).count
        }
        let active = Set(seed.activeItems(for: period).map(\.id))
        return state.completedIds(period).intersection(active).count
    }

    func totalCount(_ period: Period) -> Int {
        if period == .weekend {
            return seed.weekendTasks(isSaturday: FLDate.isSaturday()).count
        }
        return seed.totalActive(for: period)
    }

    func pct(_ period: Period) -> Int {
        let total = totalCount(period)
        guard total > 0 else { return 0 }
        return min(100, Int((Double(doneCount(period)) / Double(total) * 100).rounded()))
    }

    /// m_earthing Sunday rule: tickable Sundays, never in the denominator.
    func isTickable(_ item: RitualDef) -> Bool {
        item.active || (item.id == "m_earthing" && FLDate.isSunday())
    }

    // MARK: - Sync plumbing

    /// Reconcile with the server's merged_ids after a successful push,
    /// or with server state on pull (union — never drop local adds).
    func applyServer(ids: [String], period: Period, union: Bool) {
        let server = Set(ids)
        let local = state.completedIds(period)
        state.setCompleted(union ? local.union(server) : server, for: period)
        state.lastSyncAt = Date()
        DayStateIO.save(state)
        publishSnapshot()
    }

    private func persistAndQueue(period: Period) {
        DayStateIO.save(state)
        publishSnapshot()
        syncEngine?.queuePush(period: period, state: state, seed: seed)
    }

    func publishSnapshot() {
        DayStateIO.publishSnapshot(seed: seed, state: state)
    }
}
