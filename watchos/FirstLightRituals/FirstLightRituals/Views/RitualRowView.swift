import SwiftUI

/// 52pt checklist row: time (gold mono) · title + cat · tick circle.
/// Whole row toggles. Completed rows dim to 35%, never reorder.
struct RitualRowView: View {
    @Environment(RitualStore.self) private var store
    let item: RitualDef
    let period: Period
    let isCursor: Bool

    var body: some View {
        let done = store.isCompleted(item.id, period: period)
        let tickable = store.isTickable(item)
        let inactive = !tickable

        HStack(spacing: 8) {
            if isCursor {
                Rectangle().fill(FLTheme.gold).frame(width: 2)
            }
            Text(item.time12)
                .flMono(12, weight: .medium)
                .foregroundStyle(FLTheme.gold.opacity(done ? 0.4 : 0.9))
                .frame(width: 40, alignment: .trailing)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title)
                    .flMono(13, weight: .medium)
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .strikethrough(done, color: .white.opacity(0.4))
                HStack(spacing: 4) {
                    Text(item.cat).flMono(8).foregroundStyle(.white.opacity(0.3)).kerning(1)
                    if inactive {
                        Text("off").flMono(8).foregroundStyle(.white.opacity(0.35))
                    } else if item.id == "m_earthing" {
                        Text("SUN · optional").flMono(8).foregroundStyle(FLTheme.gold.opacity(0.6))
                    }
                }
            }
            Spacer(minLength: 2)
            ZStack {
                Circle()
                    .strokeBorder(done ? FLTheme.green : .white.opacity(0.4), lineWidth: 1.5)
                    .frame(width: 24, height: 24)
                if done {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(FLTheme.green)
                }
                if inactive {
                    Text("—").flMono(11).foregroundStyle(.white.opacity(0.3))
                }
            }
        }
        .frame(minHeight: 44)
        .opacity(inactive ? 0.25 : (done ? 0.35 : 1))
        .contentShape(Rectangle())
        .onTapGesture {
            guard tickable else { return }
            if done { store.untick(item.id, period: period) }
            else { store.tick(item.id, period: period) }
        }
        .listRowBackground(isCursor ? FLTheme.surface : Color.clear)
    }
}
