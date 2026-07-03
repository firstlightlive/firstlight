import SwiftUI
import WatchKit

/// Page 1 — the guided NOW view. One item, one 64pt tick.
struct NowHeroView: View {
    @Environment(RitualStore.self) private var store
    @Environment(SyncEngine.self) private var sync
    @Environment(\.isLuminanceReduced) private var dimmed

    @State private var tickDisabledUntil = Date.distantPast   // 700ms double-tap guard
    @State private var justTicked = false
    @State private var minuteTick = 0                          // re-render each minute

    private let minuteTimer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    var body: some View {
        let period = store.displayPeriod
        let hero = store.hero(period: period)

        VStack(spacing: 0) {
            header(period: period)
            Spacer(minLength: 4)
            switch hero {
            case .live(let item):
                heroCard(item: item, period: period, live: true)
            case .upcoming(let item, let mins):
                VStack(spacing: 6) {
                    Text("starts in \(mins)m")
                        .flMono(11, weight: .semibold)
                        .foregroundStyle(FLTheme.gold)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(FLTheme.gold.opacity(0.12), in: Capsule())
                    heroCard(item: item, period: period, live: false)
                }
            case .gap(let name, let nextBlock, let nextTime):
                gapCard(name: name, nextBlock: nextBlock, nextTime: nextTime, period: period)
            case .periodDone(let done, let total), .periodClosed(let done, let total):
                doneCard(done: done, total: total, period: period)
            }
            Spacer(minLength: 2)
        }
        .onReceive(minuteTimer) { _ in minuteTick += 1 }
        .id(minuteTick)   // recompute cursor every minute
    }

    // MARK: - Pieces

    private func header(period: Period) -> some View {
        VStack(spacing: 3) {
            // period progress ribbon
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(.white.opacity(0.08))
                    Rectangle().fill(FLTheme.color(for: period))
                        .frame(width: geo.size.width * CGFloat(store.pct(period)) / 100)
                }
            }
            .frame(height: 2)
            HStack {
                Text("\(period.label) \(store.doneCount(period))/\(store.totalCount(period))")
                    .flMono(10, weight: .semibold)
                    .foregroundStyle(.white.opacity(0.5))
                    .kerning(1)
                Spacer()
                syncDot
            }
        }
    }

    @ViewBuilder private var syncDot: some View {
        switch sync.status {
        case .idle: EmptyView()
        case .queued:
            Circle().fill(FLTheme.gold).frame(width: 6, height: 6)
                .opacity(0.9)
        case .failing, .keyInvalid, .keyMissing:
            Circle().fill(FLTheme.red).frame(width: 6, height: 6)
        }
    }

    private func heroCard(item: RitualDef, period: Period, live: Bool) -> some View {
        let behind = live && isBehind(item)
        return VStack(spacing: 6) {
            if let block = store.seed.blocks(for: period).first(where: { $0.items.contains(item) }) {
                Text(block.shortName)
                    .flMono(10, weight: .semibold)
                    .foregroundStyle(FLTheme.gold.opacity(0.85))
                    .kerning(1.5)
                    .lineLimit(1)
            }
            HStack(spacing: 4) {
                Text(item.time12)
                    .flMono(30, weight: .bold)
                    .foregroundStyle(behind ? FLTheme.red.opacity(0.7) : FLTheme.gold)
                if behind {
                    Text("·late").flMono(11).foregroundStyle(FLTheme.red.opacity(0.7))
                }
            }
            Text(item.title)
                .flMono(15, weight: .semibold)
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            if !item.desc.isEmpty {
                Text(firstSentence(item.desc))
                    .flMono(11)
                    .foregroundStyle(.white.opacity(0.55))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            if !dimmed {
                tickButton(item: item, period: period, live: live)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 25)
                .onEnded { value in
                    if value.translation.width < -25 {
                        store.skip(item.id, period: period)       // swipe left = skip
                    } else if value.translation.width > 25 {
                        untickLast(period: period)                // swipe right = back/untick
                    }
                }
        )
    }

    private func tickButton(item: RitualDef, period: Period, live: Bool) -> some View {
        Button {
            guard Date() >= tickDisabledUntil else { return }
            tickDisabledUntil = Date().addingTimeInterval(0.7)
            withAnimation(.spring(duration: 0.25)) { justTicked = true }
            store.tick(item.id, period: period)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                withAnimation { justTicked = false }
            }
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(FLTheme.gold.opacity(live ? 1 : 0.5), lineWidth: 2)
                    .frame(width: 64, height: 64)
                if justTicked {
                    Circle().fill(FLTheme.green).frame(width: 64, height: 64)
                }
                Image(systemName: "checkmark")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(justTicked ? .black : FLTheme.gold.opacity(live ? 1 : 0.5))
            }
            .frame(width: 72, height: 72)   // effective hit area
            .scaleEffect(justTicked ? 1.1 : 1.0)
        }
        .buttonStyle(.plain)
    }

    private func gapCard(name: String, nextBlock: String, nextTime: String, period: Period) -> some View {
        VStack(spacing: 8) {
            Text(name)
                .flMono(18, weight: .bold)
                .foregroundStyle(FLTheme.cyan)
                .kerning(2)
            Text(Date(), style: .time)
                .flMono(24, weight: .semibold)
                .foregroundStyle(.white.opacity(0.85))
            Text("Next: \(nextBlock) at \(nextTime)")
                .flMono(11)
                .foregroundStyle(.white.opacity(0.5))
                .lineLimit(2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func doneCard(done: Int, total: Int, period: Period) -> some View {
        let complete = done >= total
        return VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(.white.opacity(0.1), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: CGFloat(min(done, total)) / CGFloat(max(total, 1)))
                    .stroke(complete ? FLTheme.gold : .white.opacity(0.6),
                            style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 84, height: 84)
            .overlay {
                Text("\(done)/\(total)").flMono(16, weight: .bold)
                    .foregroundStyle(complete ? FLTheme.gold : .white)
            }
            Text(complete ? "\(period.label) SEALED" : "\(period.label) · IN PROGRESS")
                .flMono(12, weight: .bold)
                .foregroundStyle(complete ? FLTheme.gold : .white.opacity(0.7))
                .kerning(1.5)
        }
    }

    // MARK: - Helpers

    private func isBehind(_ item: RitualDef) -> Bool {
        FLDate.istMinutesNow() > FLDate.minutes(from: item.time24) + 15
    }

    private func firstSentence(_ s: String) -> String {
        if let dot = s.firstIndex(of: ".") { return String(s[...dot]) }
        return s
    }

    private func untickLast(period: Period) {
        // swipe right: untick the most recently completed item (by schedule order)
        let completed = store.state.completedIds(period)
        let ordered = store.seed.items(for: period)
            .filter { completed.contains($0.id) }
            .sorted { FLDate.minutes(from: $0.time24) < FLDate.minutes(from: $1.time24) }
        if let last = ordered.last {
            store.untick(last.id, period: period)
        }
    }
}
