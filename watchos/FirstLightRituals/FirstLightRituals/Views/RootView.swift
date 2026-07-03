import SwiftUI

/// Vertical-page root: NOW / CHECKLIST / DAY / WEEKEND (Sat-Sun only).
struct RootView: View {
    @Environment(RitualStore.self) private var store
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.page) {
            NowHeroView()
                .tag(AppRouter.Page.now)
            ChecklistView()
                .tag(AppRouter.Page.checklist)
            DayView()
                .tag(AppRouter.Page.day)
            if FLDate.isWeekendDay() {
                WeekendView()
                    .tag(AppRouter.Page.weekend)
            }
        }
        .tabViewStyle(.verticalPage)
        .background(FLTheme.bg)
    }
}
