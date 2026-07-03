import AppIntents

/// Registers "Tick Ritual" as an App Shortcut so it appears in
/// Watch Settings → Action Button → Shortcut, and answers to Siri.
struct FLAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TickCurrentRitualIntent(),
            phrases: [
                "Tick ritual in \(.applicationName)",
                "Tick my ritual in \(.applicationName)"
            ],
            shortTitle: "Tick Ritual",
            systemImageName: "checkmark.circle.fill"
        )
    }
}
