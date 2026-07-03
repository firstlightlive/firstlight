import Foundation
import UserNotifications

/// 17 repeating local notifications, pinned to IST wall time via
/// DateComponents.timeZone (each repeating trigger = ONE pending request,
/// far under the 64 limit):
///  - 15 block starts (evening's two 20:05 blocks merge; 21:30 LIGHTS OUT is
///    its own dedicated slot)
///  - Sat 08:00 + Sun 08:00 weekend lists
/// .timeSensitive on 03:30 / 19:00 / 21:30 (requires the entitlement +
/// Sleep Focus allowing Time Sensitive for the 3:30 haptic to land).
enum NotificationScheduler {
    static let categoryId = "FL_BLOCK"
    static let actionTickFirst = "FL_TICK_FIRST"
    static let actionOpen = "FL_OPEN"

    struct Slot: Identifiable, Hashable {
        let id: String            // notification identifier, e.g. "fl.block.mblk0"
        let period: Period
        let blockId: String?      // nil for weekend slots
        let itemId: String?       // explicit target for "✓ Tick first" (lights-out)
        let title: String
        let body: String
        let hour: Int
        let minute: Int
        let weekday: Int?         // 1=Sun, 7=Sat — weekend slots only
        let timeSensitive: Bool
        let defaultOn: Bool
    }

    /// Build the canonical 17-slot table from the seed.
    static func slots(seed: SeedCatalog) -> [Slot] {
        var out: [Slot] = []
        let offByDefault: Set<Int> = [13 * 60 + 30, 15 * 60 + 30, 17 * 60]   // midday 13:30/15:30/17:00
        let sensitive: Set<Int> = [3 * 60 + 30, 19 * 60, 21 * 60 + 30]

        for period in Period.rituals {
            var seenStarts = Set<String>()
            for block in seed.blocks(for: period) {
                // merge blocks sharing a start time (evening 20:05 pair)
                guard !seenStarts.contains(block.start24) else { continue }
                seenStarts.insert(block.start24)

                // e_lights_out gets a dedicated slot below, not a block slot
                let items = block.items.filter { $0.active && $0.id != "e_lights_out" }
                guard !items.isEmpty else { continue }
                let mins = FLDate.minutes(from: block.start24)
                let bodyText = items.prefix(3).map { "\($0.time12) \($0.title)" }.joined(separator: " · ")
                out.append(Slot(
                    id: "fl.block.\(block.id)",
                    period: period, blockId: block.id, itemId: nil,
                    title: block.shortName,
                    body: bodyText + (items.count > 3 ? " …" : ""),
                    hour: mins / 60, minute: mins % 60, weekday: nil,
                    timeSensitive: sensitive.contains(mins),
                    defaultOn: !offByDefault.contains(mins)
                ))
            }
        }
        // dedicated 21:30 LIGHTS OUT — "✓ Tick first" must tick e_lights_out
        // itself, never an earlier wind-down item (review fix: explicit itemId)
        out.append(Slot(id: "fl.block.lightsout", period: .evening, blockId: "eblk5",
                        itemId: "e_lights_out",
                        title: "LIGHTS OUT", body: "3:30 AM is decided here.",
                        hour: 21, minute: 30, weekday: nil, timeSensitive: true, defaultOn: true))
        // weekend 08:00
        out.append(Slot(id: "fl.weekend.sat", period: .weekend, blockId: nil, itemId: nil,
                        title: "WEEKEND TASKS", body: "Saturday list — 7 tasks.",
                        hour: 8, minute: 0, weekday: 7, timeSensitive: false, defaultOn: true))
        out.append(Slot(id: "fl.weekend.sun", period: .weekend, blockId: nil, itemId: nil,
                        title: "WEEKEND TASKS", body: "Sunday list — 10 tasks.",
                        hour: 8, minute: 0, weekday: 1, timeSensitive: false, defaultOn: true))
        return out
    }

    // Per-slot enable prefs (App Group so Settings toggles persist)
    static func isEnabled(_ slot: Slot) -> Bool {
        let d = AppGroup.defaults
        if d.object(forKey: "notif.\(slot.id)") == nil { return slot.defaultOn }
        return d.bool(forKey: "notif.\(slot.id)")
    }

    static func setEnabled(_ enabled: Bool, slot: Slot, seed: SeedCatalog) {
        AppGroup.defaults.set(enabled, forKey: "notif.\(slot.id)")
        Task { await reschedule(seed: seed) }
    }

    static func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    /// Idempotent full reschedule: category + all enabled slots.
    static func reschedule(seed: SeedCatalog) async {
        let center = UNUserNotificationCenter.current()

        let tickFirst = UNNotificationAction(identifier: actionTickFirst, title: "✓ Tick first", options: [])
        let open = UNNotificationAction(identifier: actionOpen, title: "Open block", options: [.foreground])
        let category = UNNotificationCategory(identifier: categoryId, actions: [tickFirst, open],
                                              intentIdentifiers: [], options: [])
        center.setNotificationCategories([category])

        let all = slots(seed: seed)
        center.removePendingNotificationRequests(withIdentifiers: all.map(\.id))

        for slot in all where isEnabled(slot) {
            let content = UNMutableNotificationContent()
            content.title = slot.title
            content.body = slot.body
            content.categoryIdentifier = categoryId
            content.threadIdentifier = slot.period.rawValue
            content.userInfo = ["period": slot.period.rawValue,
                                "blockId": slot.blockId ?? "",
                                "itemId": slot.itemId ?? ""]
            if slot.timeSensitive { content.interruptionLevel = .timeSensitive }

            var comps = DateComponents()
            comps.hour = slot.hour
            comps.minute = slot.minute
            comps.timeZone = FLDate.istTimeZone      // IST pinning — travel-safe
            if let wd = slot.weekday { comps.weekday = wd }

            let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)
            let request = UNNotificationRequest(identifier: slot.id, content: content, trigger: trigger)
            try? await center.add(request)
        }
    }
}
