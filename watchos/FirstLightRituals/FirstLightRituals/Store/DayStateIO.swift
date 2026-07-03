import Foundation
import WidgetKit

/// App-Group persistence for DayState + the widget snapshot.
enum DayStateIO {
    private static var dir: URL {
        let d = AppGroup.containerURL.appendingPathComponent("DayStates", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    static func url(for date: String) -> URL {
        dir.appendingPathComponent("\(date).json")
    }

    static func load(date: String) -> DayState {
        guard let data = try? Data(contentsOf: url(for: date)),
              let state = try? JSONDecoder().decode(DayState.self, from: data)
        else { return DayState(date: date) }
        return state
    }

    static func save(_ state: DayState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: url(for: state.date), options: .atomic)
    }

    /// Keep only the last 7 day files.
    static func prune() {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return }
        let sorted = files.filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent > $1.lastPathComponent }
        for stale in sorted.dropFirst(7) { try? fm.removeItem(at: stale) }
    }

    /// Rebuild the denormalized widget snapshot and poke WidgetKit.
    static func publishSnapshot(seed: SeedCatalog, state: DayState, now: Date = Date()) {
        let isSat = FLDate.isSaturday(now)
        let isSun = FLDate.isSunday(now)
        let period = FLDate.autoPeriod(now)
        let hero = CursorEngine.hero(seed: seed, period: period,
                                     completed: state.completedIds(period),
                                     skipped: state.skipped[period.rawValue] ?? [],
                                     now: now, isSunday: isSun)

        var snap = WidgetSnapshot.empty
        snap.date = state.date
        snap.isWeekendDay = isSat || isSun

        func doneCount(_ p: Period) -> Int {
            let active = Set(seed.activeItems(for: p).map(\.id))
            return state.completedIds(p).intersection(active).count
        }
        snap.morningDone = doneCount(.morning); snap.morningTotal = seed.totalActive(for: .morning)
        snap.middayDone = doneCount(.midday); snap.middayTotal = seed.totalActive(for: .midday)
        snap.eveningDone = doneCount(.evening); snap.eveningTotal = seed.totalActive(for: .evening)

        if snap.isWeekendDay {
            let tasks = seed.weekendTasks(isSaturday: isSat)
            snap.weekendTotal = tasks.count
            snap.weekendDone = state.completedIds(.weekend).intersection(Set(tasks.map(\.id))).count
        }

        switch hero {
        case .live(let item), .upcoming(let item, _):
            if let block = seed.blocks(for: period).first(where: { $0.items.contains(item) }) {
                snap.currentBlockId = block.id
                snap.blockName = block.shortName
                let tickable = block.items.filter { $0.active || ($0.id == "m_earthing" && isSun) }
                snap.blockTotal = tickable.count
                snap.blockDone = tickable.filter { state.completedIds(period).contains($0.id) }.count
            }
            snap.nextItemTime = item.time12
            snap.nextItemTitle = item.title
        case .gap(let name, _, let nextTime):
            snap.gapName = name
            snap.nextBlockTime = nextTime
        case .periodDone(let done, let total), .periodClosed(let done, let total):
            snap.blockName = "\(period.label) SEALED"
            snap.sealedDone = done
            snap.sealedTotal = total
        }

        snap.save()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
