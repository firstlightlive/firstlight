import SwiftUI

/// Page 3 — concentric period rings + date/day-number + sync line + settings gear.
struct DayView: View {
    @Environment(RitualStore.self) private var store
    @Environment(SyncEngine.self) private var sync
    @Environment(AppRouter.self) private var router
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    if FLDate.graceActive() {
                        Text("editing yesterday · until 3:00")
                            .flMono(10, weight: .semibold)
                            .foregroundStyle(FLTheme.gold)
                            .padding(.vertical, 4).padding(.horizontal, 10)
                            .background(FLTheme.gold.opacity(0.12), in: Capsule())
                    }

                    rings
                        .frame(width: 124, height: 124)
                        .padding(.top, 2)

                    legend

                    Text(dateLine)
                        .flMono(11, weight: .semibold)
                        .foregroundStyle(.white.opacity(0.7))
                        .kerning(1)

                    if FLDate.isWeekendDay() {
                        Button {
                            router.navigate(to: .weekend)
                        } label: {
                            Text("▦ WEEKEND \(store.doneCount(.weekend))/\(store.totalCount(.weekend))")
                                .flMono(10, weight: .semibold)
                                .foregroundStyle(FLTheme.gold)
                        }
                        .buttonStyle(.plain)
                    }

                    Text(statusLine)
                        .flMono(9)
                        .foregroundStyle(.white.opacity(0.4))

                    Text(copyLine)
                        .flMono(10, weight: .medium)
                        .foregroundStyle(allSealed ? FLTheme.gold : .white.opacity(0.5))
                        .kerning(1)
                        .padding(.top, 2)
                }
                .frame(maxWidth: .infinity)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape.fill").font(.system(size: 13))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                }
            }
            .sheet(isPresented: $showSettings) { SettingsView() }
        }
    }

    private var rings: some View {
        ZStack {
            ring(period: .morning, diameter: 124)
            ring(period: .midday, diameter: 92)
            ring(period: .evening, diameter: 60)
        }
    }

    private func ring(period: Period, diameter: CGFloat) -> some View {
        let progress = CGFloat(store.pct(period)) / 100
        return ZStack {
            Circle().stroke(FLTheme.color(for: period).opacity(0.15), lineWidth: 6)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(FLTheme.color(for: period), style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: diameter, height: diameter)
        .onTapGesture {
            router.navigate(to: .checklist(period: period, blockId: nil))
        }
    }

    private var legend: some View {
        VStack(spacing: 2) {
            legendRow(.morning); legendRow(.midday); legendRow(.evening)
        }
    }

    private func legendRow(_ p: Period) -> some View {
        HStack(spacing: 6) {
            Circle().fill(FLTheme.color(for: p)).frame(width: 5, height: 5)
            Text("\(p.label) \(store.doneCount(p))/\(store.totalCount(p))")
                .flMono(10, weight: .medium)
                .foregroundStyle(missedRed(p) ? FLTheme.red : .white.opacity(0.75))
        }
    }

    /// Period window over + incomplete → red numerals (fact, not judgement).
    private func missedRed(_ p: Period) -> Bool {
        guard store.doneCount(p) < store.totalCount(p) else { return false }
        let mins = FLDate.istMinutesNow()
        switch p {
        case .morning: return mins > 11 * 60
        case .midday: return mins > 17 * 60 + 45
        case .evening: return false
        case .weekend: return false
        }
    }

    private var allSealed: Bool {
        Period.rituals.allSatisfy { store.doneCount($0) >= store.totalCount($0) }
    }

    private var dateLine: String {
        let f = DateFormatter()
        f.dateFormat = "EEE dd MMM"
        f.timeZone = FLDate.istTimeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        return "\(f.string(from: Date()).uppercased()) · DAY \(FLDate.chapterDay())"
    }

    private var statusLine: String {
        if let t = sync.lastSuccessAt {
            let f = DateFormatter(); f.dateFormat = "HH:mm"; f.timeZone = FLDate.istTimeZone
            return "last sync \(f.string(from: t)) ✓"
        }
        switch sync.status {
        case .keyMissing: return "no api key — settings"
        case .keyInvalid: return "key invalid — settings"
        default: return "not synced yet"
        }
    }

    private var copyLine: String {
        allSealed ? "DAY SEALED. 3:30 TOMORROW." : "THE DAY IS UNWRITTEN."
    }
}
