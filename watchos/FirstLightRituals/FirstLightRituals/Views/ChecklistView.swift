import SwiftUI

/// Page 2 — full block-grouped checklist with the period pill.
struct ChecklistView: View {
    @Environment(RitualStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var collapsed: Set<String> = []
    @State private var flashing: String?

    var body: some View {
        // The checklist always follows the store's display period (auto by IST
        // clock, or a 30-min manual override). Deep-links hand their period to
        // the store ONCE and are cleared — router.checklistPeriod never pins
        // the view permanently (review fix).
        let period = store.displayPeriod

        ScrollViewReader { proxy in
            List {
                // period pill
                Section {
                    periodPill(current: period)
                        .listRowBackground(Color.clear)
                }
                // weekend banner (Sat/Sun)
                if FLDate.isWeekendDay() {
                    Section {
                        Button {
                            router.navigate(to: .weekend)
                        } label: {
                            HStack {
                                Text("▦ WEEKEND TASKS \(store.doneCount(.weekend))/\(store.totalCount(.weekend))")
                                    .flMono(11, weight: .semibold)
                                    .foregroundStyle(FLTheme.gold)
                                Spacer()
                                Image(systemName: "chevron.right").font(.system(size: 10))
                                    .foregroundStyle(FLTheme.gold.opacity(0.6))
                            }
                        }
                        .listRowBackground(FLTheme.gold.opacity(0.08))
                    }
                }

                ForEach(store.seed.blocks(for: period)) { block in
                    blockSection(block: block, period: period)
                }
            }
            .listStyle(.plain)
            .onAppear { consumeRoutedPeriod() }
            .onChange(of: router.checklistPeriod) { _, _ in consumeRoutedPeriod() }
            .onChange(of: router.flashBlockId) { _, target in
                guard let target else { return }
                collapsed.remove(target)
                withAnimation { proxy.scrollTo(target, anchor: .top) }
                flashing = target
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    flashing = nil
                    router.flashBlockId = nil
                }
            }
        }
    }

    /// Deep-linked period → 30-min store override, then clear the router pin.
    private func consumeRoutedPeriod() {
        guard let p = router.checklistPeriod else { return }
        store.overridePeriod(p)
        router.checklistPeriod = nil
    }

    private func periodPill(current: Period) -> some View {
        HStack(spacing: 4) {
            ForEach(Period.rituals) { p in
                Button {
                    store.overridePeriod(p)
                } label: {
                    Text(p.label)
                        .flMono(10, weight: .bold)
                        .kerning(0.5)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(p == current ? FLTheme.color(for: p).opacity(0.2) : Color.clear,
                                    in: Capsule())
                        .foregroundStyle(p == current ? FLTheme.color(for: p) : .white.opacity(0.45))
                }
                .buttonStyle(.plain)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if store.isManualPeriod {
                Text("manual").flMono(8).foregroundStyle(.white.opacity(0.4)).offset(y: 10)
            }
        }
    }

    @ViewBuilder
    private func blockSection(block: RitualBlock, period: Period) -> some View {
        let tickable = block.items.filter { store.isTickable($0) }
        let done = tickable.filter { store.isCompleted($0.id, period: period) }.count
        let complete = done >= tickable.count && !tickable.isEmpty
        let pastWindow = FLDate.istMinutesNow() > FLDate.minutes(from: block.start24) + 120
        let isCollapsed = collapsed.contains(block.id) || (complete && !collapsed.contains("expanded.\(block.id)"))
        let cursorId = cursorItemId(period: period)

        Section {
            if !isCollapsed {
                ForEach(block.items) { item in
                    RitualRowView(item: item, period: period,
                                  isCursor: item.id == cursorId)
                }
            }
        } header: {
            Button {
                if isCollapsed {
                    collapsed.remove(block.id)
                    if complete { collapsed.insert("expanded.\(block.id)") }
                } else {
                    collapsed.insert(block.id)
                    collapsed.remove("expanded.\(block.id)")
                }
            } label: {
                HStack {
                    Text(block.shortName)
                        .flMono(10, weight: .bold).kerning(1)
                        .foregroundStyle(flashing == block.id ? FLTheme.gold : .white.opacity(0.6))
                        .lineLimit(1)
                    Spacer()
                    Text(complete ? "\(done)/\(tickable.count) ✓" : "\(done)/\(tickable.count)")
                        .flMono(10, weight: .bold)
                        .foregroundStyle(complete ? FLTheme.green
                                         : (pastWindow && done < tickable.count ? FLTheme.red.opacity(0.7) : .white.opacity(0.5)))
                }
            }
            .buttonStyle(.plain)
            .id(block.id)
        }
    }

    private func cursorItemId(period: Period) -> String? {
        if case .live(let item) = store.hero(period: period) { return item.id }
        return nil
    }
}
