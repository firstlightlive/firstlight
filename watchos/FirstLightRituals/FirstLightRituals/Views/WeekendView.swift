import SwiftUI

/// Page 4 (Sat/Sun only) — untimed weekend task list with gold progress bar.
struct WeekendView: View {
    @Environment(RitualStore.self) private var store

    var body: some View {
        let isSat = FLDate.isSaturday()
        let tasks = store.seed.weekendTasks(isSaturday: isSat)
        let done = store.doneCount(.weekend)

        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(isSat ? "SATURDAY" : "SUNDAY")
                        .flMono(14, weight: .bold)
                        .foregroundStyle(FLTheme.gold)
                        .kerning(2)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.white.opacity(0.08))
                            Capsule().fill(FLTheme.gold)
                                .frame(width: tasks.isEmpty ? 0 : geo.size.width * CGFloat(done) / CGFloat(tasks.count))
                        }
                    }
                    .frame(height: 3)
                    Text("\(done)/\(tasks.count)")
                        .flMono(10, weight: .semibold)
                        .foregroundStyle(.white.opacity(0.5))
                }
                .listRowBackground(Color.clear)
            }

            ForEach(tasks) { task in
                let checked = store.isCompleted(task.id, period: .weekend)
                HStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .strokeBorder(checked ? FLTheme.green : .white.opacity(0.4), lineWidth: 1.5)
                            .frame(width: 22, height: 22)
                        if checked {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(FLTheme.green)
                        }
                    }
                    Text(task.label)
                        .flMono(12, weight: .medium)
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .strikethrough(checked, color: .white.opacity(0.4))
                    Spacer()
                }
                .frame(minHeight: 44)
                .opacity(checked ? 0.4 : 1)
                .contentShape(Rectangle())
                .onTapGesture {
                    if checked { store.untick(task.id, period: .weekend) }
                    else { store.tick(task.id, period: .weekend) }
                }
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
    }
}
