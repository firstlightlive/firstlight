import SwiftUI
import UserNotifications

@main
struct FirstLightRitualsApp: App {
    @Environment(\.scenePhase) private var scenePhase

    @State private var store: RitualStore
    @State private var router: AppRouter
    @State private var sync: SyncEngine
    private let notificationDelegate = NotificationDelegate()

    init() {
        let store = RitualStore()
        let sync = SyncEngine()
        let router = AppRouter()
        store.syncEngine = sync
        sync.store = store
        _store = State(initialValue: store)
        _sync = State(initialValue: sync)
        _router = State(initialValue: router)

        notificationDelegate.store = store
        notificationDelegate.router = router
        UNUserNotificationCenter.current().delegate = notificationDelegate
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(router)
                .environment(sync)
                .preferredColorScheme(.dark)
                .onOpenURL { router.handle(url: $0) }
                .task { await firstRun() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                store.rollDayIfNeeded()
                Task {
                    await sync.flush()
                    await sync.pullMerge()
                }
            }
            if phase == .background {
                store.rollDayIfNeeded()   // merge any intent writes before saving
                DayStateIO.save(store.state)
                store.publishSnapshot()
                // heartbeat: full-state re-POST closes the web-clobber window
                sync.heartbeat(period: store.displayPeriod)
            }
        }

        WKNotificationScene(controller: NotificationController.self,
                            category: NotificationScheduler.categoryId)
    }

    private func firstRun() async {
        let granted = await NotificationScheduler.requestPermission()
        if granted {
            await NotificationScheduler.reschedule(seed: store.seed)
        }
        store.publishSnapshot()
    }
}
