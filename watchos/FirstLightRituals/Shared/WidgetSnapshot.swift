import Foundation

/// Denormalized state written by the app on every mutation and read by the
/// widget extension. The widget never touches the network or Keychain.
struct WidgetSnapshot: Codable {
    var date: String                 // IST effective day "YYYY-MM-DD"
    var currentBlockId: String?
    var blockName: String?
    var nextItemTime: String?        // "4:17" display form
    var nextItemTitle: String?
    var blockDone: Int
    var blockTotal: Int
    var morningDone: Int
    var morningTotal: Int
    var middayDone: Int
    var middayTotal: Int
    var eveningDone: Int
    var eveningTotal: Int
    var weekendDone: Int
    var weekendTotal: Int
    var isWeekendDay: Bool
    var gapName: String?             // set when between blocks (e.g. "RUN + GYM")
    var nextBlockTime: String?       // "7:00" when in a gap
    // Sealed-state counts for the CURRENT period (optional: older snapshots
    // on disk decode without them)
    var sealedDone: Int?
    var sealedTotal: Int?

    static let empty = WidgetSnapshot(
        date: "", currentBlockId: nil, blockName: nil, nextItemTime: nil,
        nextItemTitle: nil, blockDone: 0, blockTotal: 0,
        morningDone: 0, morningTotal: 27, middayDone: 0, middayTotal: 15,
        eveningDone: 0, eveningTotal: 30, weekendDone: 0, weekendTotal: 0,
        isWeekendDay: false, gapName: nil, nextBlockTime: nil,
        sealedDone: nil, sealedTotal: nil
    )

    static var fileURL: URL {
        AppGroup.containerURL.appendingPathComponent("WidgetSnapshot.json")
    }

    static func load() -> WidgetSnapshot {
        guard let data = try? Data(contentsOf: fileURL),
              let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else { return .empty }
        return snap
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: WidgetSnapshot.fileURL, options: .atomic)
    }
}
