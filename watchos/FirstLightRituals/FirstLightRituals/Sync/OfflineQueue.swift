import Foundation

/// One coalesced pending push per (date, period). The tick's DATE is captured
/// at tap time (in the entry), never at flush time — a 23:58 tick flushed at
/// 00:05 still lands on the right day (server grace window allows it).
///
/// `generation` increments on every coalesce. The flusher only deletes an
/// entry whose on-disk generation still equals the generation it pushed —
/// a tick that lands while a push is in flight bumps the generation, so the
/// newer entry survives and flushes next round (review fix: flush clobber).
struct QueueEntry: Codable, Identifiable {
    var id: String { "\(date)|\(period)" }
    let date: String
    let period: String
    var completed: [String]
    var removed: [String]
    var totalActive: Int
    var attempts: Int
    var nextAttemptAt: Date
    var generation: Int
}

struct SyncQueue: Codable {
    var entries: [QueueEntry] = []

    static var fileURL: URL {
        AppGroup.containerURL.appendingPathComponent("SyncQueue.json")
    }

    static func load() -> SyncQueue {
        guard let data = try? Data(contentsOf: fileURL),
              let q = try? JSONDecoder().decode(SyncQueue.self, from: data)
        else { return SyncQueue() }
        return q
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: SyncQueue.fileURL, options: .atomic)
    }

    /// Coalesce: replace the entry for this (date, period) with fresh full
    /// state, bumping its generation.
    mutating func upsert(date: String, period: Period, completed: [String],
                         removed: [String], totalActive: Int) {
        let key = "\(date)|\(period.rawValue)"
        if let i = entries.firstIndex(where: { $0.id == key }) {
            // union removed sets so an untick queued earlier isn't lost
            let mergedRemoved = Set(entries[i].removed).union(removed).subtracting(completed)
            entries[i].completed = completed
            entries[i].removed = Array(mergedRemoved)
            entries[i].totalActive = totalActive
            entries[i].nextAttemptAt = Date()   // fresh change → try now
            entries[i].generation += 1
        } else {
            entries.append(QueueEntry(date: date, period: period.rawValue,
                                      completed: completed, removed: removed,
                                      totalActive: totalActive, attempts: 0,
                                      nextAttemptAt: Date(), generation: 1))
        }
    }

    /// Backoff ladder: 5s → 15s → 60s → 5min (repeats at 5min).
    static func backoff(after attempts: Int) -> TimeInterval {
        switch attempts {
        case 0, 1: return 5
        case 2: return 15
        case 3: return 60
        default: return 300
        }
    }
}
