import Foundation
import SwiftUI

/// Navigation state + the single firstlight:// route parser shared by
/// widgets (widgetURL), notifications, and intents.
///   firstlight://now
///   firstlight://checklist?period=morning&block=mblk1
///   firstlight://day
///   firstlight://weekend
@Observable
final class AppRouter {
    enum Page: Int { case now = 0, checklist = 1, day = 2, weekend = 3 }
    enum Route: Equatable {
        case now
        case checklist(period: Period?, blockId: String?)
        case day
        case weekend
    }

    var page: Page = .now
    var checklistPeriod: Period?
    var flashBlockId: String?         // scroll anchor + 600ms gold flash target

    func navigate(to route: Route) {
        switch route {
        case .now:
            page = .now
        case .checklist(let period, let blockId):
            checklistPeriod = period
            flashBlockId = blockId
            page = .checklist
        case .day:
            page = .day
        case .weekend:
            page = .weekend
        }
    }

    func handle(url: URL) {
        guard url.scheme == "firstlight" else { return }
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let q: (String) -> String? = { name in comps?.queryItems?.first { $0.name == name }?.value }
        switch url.host {
        case "checklist":
            navigate(to: .checklist(period: q("period").flatMap(Period.init(rawValue:)),
                                    blockId: q("block")))
        case "day": navigate(to: .day)
        case "weekend": navigate(to: .weekend)
        default: navigate(to: .now)
        }
    }
}
