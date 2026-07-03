import Foundation
import UserNotifications
import WidgetKit

/// Handles notification actions. "✓ Tick first" runs in the background —
/// loads state fresh from disk, ticks the block's first incomplete tickable
/// item, persists, queues sync. Default tap routes into the app.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    var store: RitualStore?
    var router: AppRouter?

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let periodRaw = info["period"] as? String ?? ""
        let blockId = info["blockId"] as? String ?? ""
        let itemId = info["itemId"] as? String ?? ""
        guard let period = Period(rawValue: periodRaw) else { return }

        switch response.actionIdentifier {
        case NotificationScheduler.actionTickFirst:
            await tickFirstIncomplete(period: period, blockId: blockId, itemId: itemId)
        default:
            // actionOpen or default tap → deep-link into the block
            await MainActor.run {
                if period == .weekend {
                    router?.navigate(to: .weekend)
                } else {
                    router?.navigate(to: .checklist(period: period, blockId: blockId.isEmpty ? nil : blockId))
                }
            }
        }
    }

    @MainActor
    private func tickFirstIncomplete(period: Period, blockId: String, itemId: String = "") {
        guard let store else { return }
        store.rollDayIfNeeded()
        // Explicit target (e.g. LIGHTS OUT → e_lights_out) wins over
        // first-incomplete-in-block.
        if !itemId.isEmpty {
            if !store.isCompleted(itemId, period: period) {
                store.tick(itemId, period: period, haptic: false)
            }
            return
        }
        if period == .weekend {
            let tasks = store.seed.weekendTasks(isSaturday: FLDate.isSaturday())
            if let first = tasks.first(where: { !store.isCompleted($0.id, period: .weekend) }) {
                store.tick(first.id, period: .weekend, haptic: false)
            }
            return
        }
        let blocks = store.seed.blocks(for: period)
        let block = blocks.first { $0.id == blockId } ?? blocks.first
        guard let block else { return }
        if let first = block.items.first(where: { store.isTickable($0) && !store.isCompleted($0.id, period: period) }) {
            store.tick(first.id, period: period, haptic: false)
        }
    }
}
