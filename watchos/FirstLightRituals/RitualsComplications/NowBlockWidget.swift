import SwiftUI
import WidgetKit

/// accessoryRectangular (Smart Stack) + accessoryInline — the NOW line.
struct NowBlockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FLNowBlock", provider: SnapshotProvider()) { entry in
            NowBlockView(entry: entry)
                .containerBackground(.black, for: .widget)
                .widgetURL(deepLink(entry))
        }
        .configurationDisplayName("Current Ritual")
        .description("The next ritual, right now.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline])
    }

    private func deepLink(_ entry: SnapshotEntry) -> URL? {
        if let block = entry.snap.currentBlockId {
            return URL(string: "firstlight://checklist?block=\(block)")
        }
        return URL(string: "firstlight://now")
    }
}

struct NowBlockView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    private let gold = Color(red: 0xF5 / 255, green: 0xA6 / 255, blue: 0x23 / 255)

    var body: some View {
        switch family {
        case .accessoryInline:
            Text(inlineText)
        default:
            rectangular
        }
    }

    private var inlineText: String {
        let s = entry.snap
        if let time = s.nextItemTime, let title = s.nextItemTitle {
            return "FL \(time) \(title.prefix(18))"
        }
        if let gap = s.gapName { return "FL \(gap)" }
        return "FL —"
    }

    private var rectangular: some View {
        let s = entry.snap
        return VStack(alignment: .leading, spacing: 2) {
            if let time = s.nextItemTime, let title = s.nextItemTitle {
                Text("▸ \(time) \(title.uppercased())")
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundStyle(gold)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let block = s.blockName {
                    Text("\(block) · \(s.blockDone)/\(s.blockTotal)")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.6))
                        .lineLimit(1)
                }
                Gauge(value: Double(s.blockDone), in: 0...Double(max(s.blockTotal, 1))) { EmptyView() }
                    .gaugeStyle(.accessoryLinearCapacity)
                    .tint(gold)
            } else if let gap = s.gapName {
                Text(gap)
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color(red: 0, green: 0xD4 / 255, blue: 1))
                if let next = s.nextBlockTime {
                    Text("next \(next)")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.6))
                }
            } else if let block = s.blockName {
                Text(block)   // "<PERIOD> SEALED"
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundStyle(gold)
                Text("◉ \(s.sealedDone ?? s.morningDone)/\(s.sealedTotal ?? s.morningTotal)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.6))
            } else {
                Text("FIRST LIGHT")
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundStyle(gold)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
