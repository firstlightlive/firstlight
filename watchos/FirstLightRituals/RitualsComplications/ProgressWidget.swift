import SwiftUI
import WidgetKit

/// accessoryCircular + accessoryCorner — current-period progress gauge.
struct ProgressWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FLProgress", provider: SnapshotProvider()) { entry in
            ProgressWidgetView(entry: entry)
                .containerBackground(.black, for: .widget)
                .widgetURL(URL(string: "firstlight://now"))
        }
        .configurationDisplayName("Ritual Progress")
        .description("Current period completion.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}

struct ProgressWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    private var periodInfo: (done: Int, total: Int, label: String) {
        let s = entry.snap
        // period by IST hour (never device tz) — matches the app's day math
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Kolkata") ?? .current
        let hour = cal.component(.hour, from: entry.date)
        if hour < 11 { return (s.morningDone, s.morningTotal, "M") }
        if hour < 18 { return (s.middayDone, s.middayTotal, "MID") }
        return (s.eveningDone, s.eveningTotal, "E")
    }

    var body: some View {
        let info = periodInfo
        Gauge(value: Double(info.done), in: 0...Double(max(info.total, 1))) {
            Text("FL")
        } currentValueLabel: {
            Text("\(info.done)")
                .font(.system(size: 16, weight: .bold, design: .monospaced))
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .tint(Color(red: 0xF5 / 255, green: 0xA6 / 255, blue: 0x23 / 255))
    }
}
