import AppIntents
import Foundation
import WidgetKit

/// One press of the Ultra Action Button (via the Shortcut slot) = tick the
/// current NOW ritual. Runs in-process with the app possibly backgrounded, so:
///  - state is re-loaded from disk (never trust cached memory)
///  - confirmation is the dialog snippet (background haptics are unreliable)
///  - 5s idempotence window: a second press is a no-op (pocket-press guard)
struct TickCurrentRitualIntent: AppIntent {
    static let title: LocalizedStringResource = "Tick Ritual"
    static let description = IntentDescription("Tick the current FirstLight ritual.")
    static let openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        // idempotence window
        let d = AppGroup.defaults
        let last = d.double(forKey: "intent.lastTickAt")
        let now = Date().timeIntervalSince1970
        if now - last < 5 {
            return .result(dialog: "already ticked — open app to advance")
        }

        let seed = SeedCatalog.loadBundled()
        let date = FLDate.effectiveToday()
        var state = DayStateIO.load(date: date)   // fresh from disk
        let period = FLDate.autoPeriod()
        let hero = CursorEngine.hero(seed: seed, period: period,
                                     completed: state.completedIds(period),
                                     skipped: state.skipped[period.rawValue] ?? [],
                                     isSunday: FLDate.isSunday())

        switch hero {
        case .live(let item), .upcoming(let item, _):
            var ids = state.completedIds(period)
            ids.insert(item.id)
            state.setCompleted(ids, for: period)
            DayStateIO.save(state)
            d.set(now, forKey: "intent.lastTickAt")
            DayStateIO.publishSnapshot(seed: seed, state: state)

            // queue-then-best-effort sync (foreground flush catches up)
            var q = SyncQueue.load()
            q.upsert(date: date, period: period,
                     completed: Array(ids), removed: [],
                     totalActive: seed.totalActive(for: period))
            q.save()

            let active = Set(seed.activeItems(for: period).map(\.id))
            let done = ids.intersection(active).count
            let early: String = {
                if case .upcoming = hero { return " ·early" } else { return "" }
            }()
            return .result(dialog: "✓ \(item.time12) \(item.title) — \(done)/\(seed.totalActive(for: period))\(early)")

        case .gap(let name, let nextBlock, let nextTime):
            // never blind-tick during a gap
            return .result(dialog: "No ritual now (\(name)). Next: \(nextBlock) at \(nextTime).")

        case .periodDone(let done, let total), .periodClosed(let done, let total):
            return .result(dialog: "\(period.rawValue.uppercased()) SEALED \(done)/\(total)")
        }
    }
}
