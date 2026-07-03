import SwiftUI

/// FirstLight design language — dark-only, gold/mono.
enum FLTheme {
    static let bg = Color(red: 0x0A / 255, green: 0x0C / 255, blue: 0x10 / 255)      // #0A0C10
    static let surface = Color(red: 0x12 / 255, green: 0x15 / 255, blue: 0x1B / 255) // #12151B
    static let surfaceHi = Color(red: 0x1C / 255, green: 0x1F / 255, blue: 0x26 / 255)
    static let gold = Color(red: 0xF5 / 255, green: 0xA6 / 255, blue: 0x23 / 255)    // #F5A623
    static let cyan = Color(red: 0x00 / 255, green: 0xD4 / 255, blue: 0xFF / 255)    // #00D4FF
    static let green = Color(red: 0x00 / 255, green: 0xE6 / 255, blue: 0x76 / 255)   // #00E676
    static let red = Color(red: 0xFF / 255, green: 0x52 / 255, blue: 0x52 / 255)     // #FF5252

    static func color(for period: Period) -> Color {
        switch period {
        case .morning: return gold
        case .midday: return cyan
        case .evening: return green
        case .weekend: return gold
        }
    }
}

extension View {
    /// Canonical mono text style (SF Mono via font design).
    func flMono(_ size: CGFloat, weight: Font.Weight = .regular) -> some View {
        font(.system(size: size, weight: weight)).fontDesign(.monospaced)
    }
}
