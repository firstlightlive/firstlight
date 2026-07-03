import SwiftUI

/// Settings: API key entry + validation, per-block notification toggles,
/// Sleep-Focus + charging setup cards, sync detail, Action Button pointer.
struct SettingsView: View {
    @Environment(RitualStore.self) private var store
    @Environment(SyncEngine.self) private var sync
    @Environment(\.dismiss) private var dismiss

    @State private var keyInput = ""
    @State private var keyState: KeyState = .unknown
    enum KeyState { case unknown, validating, valid, invalid, unverified }

    var body: some View {
        List {
            // ── API key ──
            Section("SYNC KEY") {
                SecureField("watch api key", text: $keyInput)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .flMono(12)
                Button {
                    saveAndValidate()
                } label: {
                    HStack {
                        Text(keyState == .validating ? "validating…" : "Save & validate")
                            .flMono(12, weight: .semibold)
                        Spacer()
                        switch keyState {
                        case .valid: Image(systemName: "checkmark.circle.fill").foregroundStyle(FLTheme.green)
                        case .invalid: Image(systemName: "xmark.circle.fill").foregroundStyle(FLTheme.red)
                        case .unverified: Image(systemName: "clock.badge.questionmark").foregroundStyle(FLTheme.gold)
                        default: EmptyView()
                        }
                    }
                }
                .disabled(keyInput.isEmpty || keyState == .validating)
                if KeychainStore.loadKey() != nil {
                    Text("key stored in watch keychain")
                        .flMono(9).foregroundStyle(.white.opacity(0.4))
                }
            }

            // ── Sync detail ──
            Section("SYNC") {
                LabeledContent { Text(syncStatusText).flMono(10) } label: { Text("status").flMono(10) }
                if let t = sync.lastSuccessAt {
                    LabeledContent { Text(t, style: .time).flMono(10) } label: { Text("last success").flMono(10) }
                }
                if sync.pendingCount > 0 {
                    LabeledContent { Text("\(sync.pendingCount)").flMono(10) } label: { Text("queued").flMono(10) }
                }
                if let err = sync.lastError {
                    Text(err).flMono(9).foregroundStyle(FLTheme.red.opacity(0.8)).lineLimit(2)
                }
                Button { Task { await sync.flush(); await sync.pullMerge() } } label: {
                    Text("Retry now").flMono(12, weight: .semibold).foregroundStyle(FLTheme.gold)
                }
            }

            // ── Notifications ──
            Section("BLOCK REMINDERS") {
                ForEach(NotificationScheduler.slots(seed: store.seed)) { slot in
                    NotifToggleRow(slot: slot, seed: store.seed)
                }
            }

            // ── Setup cards ──
            Section("SETUP") {
                VStack(alignment: .leading, spacing: 4) {
                    Text("3:30 AM HAPTIC").flMono(10, weight: .bold).foregroundStyle(FLTheme.gold)
                    Text("iPhone → Settings → Focus → Sleep → allow Time Sensitive notifications. Sleep with the watch ON (charge 7–9:30 PM).")
                        .flMono(9).foregroundStyle(.white.opacity(0.6))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("ACTION BUTTON").flMono(10, weight: .bold).foregroundStyle(FLTheme.gold)
                    Text("Watch Settings → Action Button → Shortcut → \"Tick Ritual\". One press = tick the current ritual.")
                        .flMono(9).foregroundStyle(.white.opacity(0.6))
                }
            }

            Section {
                Text("defs \(store.seed.version)")
                    .flMono(8).foregroundStyle(.white.opacity(0.3))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .listRowBackground(Color.clear)
            }
        }
        .navigationTitle("Settings")
    }

    private var syncStatusText: String {
        switch sync.status {
        case .idle: return "synced ✓"
        case .queued: return "queued"
        case .failing: return "failing"
        case .keyMissing: return "no key"
        case .keyInvalid: return "key invalid"
        }
    }

    private func saveAndValidate() {
        let trimmed = keyInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        // Never destroy a working key on a typo or a dead network:
        // remember the previous key so we can restore it on a true 403.
        let previousKey = KeychainStore.loadKey()
        KeychainStore.saveKey(trimmed)
        keyState = .validating
        Task {
            let verdict = await APIClient().validateKeyDetailed()
            await MainActor.run {
                switch verdict {
                case .valid:
                    keyState = .valid
                    keyInput = ""
                    sync.keyUpdated()
                case .invalid:
                    // truly rejected — restore whatever worked before
                    if let previousKey { KeychainStore.saveKey(previousKey) }
                    else { KeychainStore.deleteKey() }
                    keyState = .invalid
                case .unreachable:
                    // keep the new key; sync will verify on first successful push
                    keyState = .unverified
                    keyInput = ""
                    sync.keyUpdated()
                }
            }
        }
    }
}

private struct NotifToggleRow: View {
    let slot: NotificationScheduler.Slot
    let seed: SeedCatalog
    @State private var isOn: Bool

    init(slot: NotificationScheduler.Slot, seed: SeedCatalog) {
        self.slot = slot
        self.seed = seed
        _isOn = State(initialValue: NotificationScheduler.isEnabled(slot))
    }

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 1) {
                Text(slot.title).flMono(10, weight: .medium).lineLimit(1)
                Text(String(format: "%02d:%02d", slot.hour, slot.minute) + (slot.timeSensitive ? " · TS" : ""))
                    .flMono(8).foregroundStyle(.white.opacity(0.4))
            }
        }
        .tint(FLTheme.gold)
        .onChange(of: isOn) { _, v in
            NotificationScheduler.setEnabled(v, slot: slot, seed: seed)
        }
    }
}
