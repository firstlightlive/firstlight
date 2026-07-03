import SwiftUI
import UserNotifications
import WatchKit

/// Custom long-look (WKNotificationScene — content extensions don't exist on
/// watchOS). Dark card, gold block title, mono body.
struct NotificationView: View {
    let title: String
    let body_: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("◆ FIRST LIGHT")
                .flMono(11, weight: .bold)
                .foregroundStyle(FLTheme.gold.opacity(0.8))
                .kerning(2)
            Text(title)
                .flMono(16, weight: .bold)
                .foregroundStyle(FLTheme.gold)
            Text(body_)
                .flMono(12)
                .foregroundStyle(.white.opacity(0.75))
                .lineLimit(4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(FLTheme.surface, in: RoundedRectangle(cornerRadius: 12))
    }
}

final class NotificationController: WKUserNotificationHostingController<NotificationView> {
    private var titleText = ""
    private var bodyText = ""

    override var body: NotificationView {
        NotificationView(title: titleText, body_: bodyText)
    }

    override func didReceive(_ notification: UNNotification) {
        titleText = notification.request.content.title
        bodyText = notification.request.content.body
    }
}
