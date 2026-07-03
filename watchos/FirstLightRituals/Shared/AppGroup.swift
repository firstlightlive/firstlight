import Foundation

/// Shared App Group between the watch app and the widget extension.
enum AppGroup {
    static let id = "group.live.firstlight.rituals"

    static var containerURL: URL {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    static var defaults: UserDefaults {
        UserDefaults(suiteName: id) ?? .standard
    }
}
