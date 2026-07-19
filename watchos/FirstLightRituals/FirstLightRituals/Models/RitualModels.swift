import Foundation

// MARK: - Periods

enum Period: String, Codable, CaseIterable, Identifiable {
    case morning, midday, evening, weekend
    var id: String { rawValue }

    /// The three ritual periods (weekend is a separate untimed list).
    static let rituals: [Period] = [.morning, .midday, .evening]

    var label: String { rawValue.uppercased() }
}

// MARK: - Seed (decoded from Resources/Rituals.json — generated, do not hand-edit)

struct RitualDef: Codable, Identifiable, Hashable {
    let id: String
    let time12: String      // display form, e.g. "4:17"
    let time24: String      // IST 24h "HH:MM" — ordering + scheduling key
    let title: String
    let desc: String
    let cat: String
    let active: Bool
    let tier: Int?          // 1 = keystone (antifragile core); nil/2 = bonus
}

struct RitualBlock: Codable, Identifiable, Hashable {
    let id: String          // e.g. "mblk0" — verbatim from web (ids skip mblk3/mblk5)
    let name: String
    let start24: String
    let items: [RitualDef]

    /// Short display name: "WAKE — ORAL CARE (3:30-3:40)" → "WAKE — ORAL CARE"
    var shortName: String {
        if let paren = name.firstIndex(of: "(") {
            return String(name[..<paren]).trimmingCharacters(in: .whitespaces)
        }
        return name
    }
}

struct WeekendTaskDef: Codable, Identifiable, Hashable {
    let id: String
    let label: String
}

struct SeedCatalog: Codable {
    struct PeriodBlocks: Codable { let blocks: [RitualBlock] }
    struct Weekend: Codable { let saturday: [WeekendTaskDef]; let sunday: [WeekendTaskDef] }
    struct TotalActive: Codable { let morning: Int; let midday: Int; let evening: Int }

    let version: String
    let total_active: TotalActive
    let periods: [String: PeriodBlocks]
    let weekend: Weekend

    func blocks(for period: Period) -> [RitualBlock] {
        periods[period.rawValue]?.blocks ?? []
    }

    func items(for period: Period) -> [RitualDef] {
        blocks(for: period).flatMap(\.items)
    }

    func activeItems(for period: Period) -> [RitualDef] {
        items(for: period).filter(\.active)
    }

    func totalActive(for period: Period) -> Int {
        switch period {
        case .morning: return total_active.morning
        case .midday: return total_active.midday
        case .evening: return total_active.evening
        case .weekend: return 0
        }
    }

    func weekendTasks(isSaturday: Bool) -> [WeekendTaskDef] {
        isSaturday ? weekend.saturday : weekend.sunday
    }

    static func loadBundled() -> SeedCatalog {
        guard let url = Bundle.main.url(forResource: "Rituals", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let seed = try? JSONDecoder().decode(SeedCatalog.self, from: data)
        else {
            fatalError("Rituals.json missing or malformed — run scripts/generate-watch-rituals.cjs and rebuild")
        }
        return seed
    }
}

// MARK: - Day state (persisted per IST day in the App Group)

struct DayState: Codable {
    var date: String                              // IST "YYYY-MM-DD"
    var completed: [String: Set<String>]          // period.rawValue -> ids
    var skipped: [String: Set<String>]            // NOW-view skip round-robin (not synced)
    var lastSyncAt: Date?

    init(date: String) {
        self.date = date
        self.completed = [:]
        self.skipped = [:]
        self.lastSyncAt = nil
    }

    func completedIds(_ period: Period) -> Set<String> {
        completed[period.rawValue] ?? []
    }

    mutating func setCompleted(_ ids: Set<String>, for period: Period) {
        completed[period.rawValue] = ids
    }
}
