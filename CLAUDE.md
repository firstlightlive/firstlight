## UI/UX Design Guidelines for FirstLight

### Design System
- Dark theme primary (#0A0C10 background)
- Font: IBM Plex Mono (headings, data) + Inter (body)
- Colors: Cyan (#00D4FF), Gold (#F5A623), Green (#00E676), Red (#FF5252), Strava Orange (#FC4C02)
- Border radius: 8-12px for cards, 4-6px for buttons
- All text mono-spaced in data displays

### Mobile-First Rules
- Test all changes at 375px (iPhone), 768px (iPad), 1024px+ (desktop)
- Minimum touch target: 44x44px
- No inline onclick handlers — use addEventListener in JS
- Use -webkit-tap-highlight-color: transparent on all interactive elements
- Use touch-action: manipulation to prevent 300ms delay
- All grids must collapse: 3-col → 2-col (tablet) → 1-col (mobile)
- Horizontal scrollable sections need -webkit-overflow-scrolling: touch
- Font sizes: use clamp() for responsive text

### Architecture Rules
- Vanilla JS only — no frameworks, no npm for frontend
- All data in Supabase (34 tables) + GCS for media
- localStorage as cache, Supabase as source of truth
- History lock: 3:00 AM IST grace window
- New features: new JS module (js/admin-{name}.js) + new panel in admin.html
- Never modify existing table schemas — use JSONB for flexibility
- Script load order matters — check admin.html before adding dependencies

### Files to Know
- app.js — core utils, auth, Supabase sync, streak calculators
- admin-core.js — switchPanel routing, date nav, createDateNav
- admin-init.js — dashboard widgets, mission status, buildDashboardStats()
- styles.css — all styling, 3 themes (dark/light/outdoor)
- Nav tabs (locked): STREAK | RULES | EVIDENCE | ACCOUNTABILITY | INSTAGRAM | STRAVA | RACES | PROGRAMS | ABOUT

### Testing Checklist
- Run node -c on all JS files before deploying
- Check nav consistency across all 11 HTML pages
- Verify no secrets in deployable code
- Test hamburger menu on mobile
- Deploy: firebase deploy --only hosting --project firstlightlive-5012b

### Deployment
- Firebase Hosting: firstlightlive-5012b.web.app
- Custom domain: firstlight.live
- Cloud Function: asia-south1/firstlight-sync (project-f050b6ba-60db-4eee-98a)
- Cloud Scheduler: 5 jobs (5:55 AM, 6:15 AM, 9 AM, 7 PM, 2 AM IST)
- GCS Bucket: gs://firstlightlive
- Supabase: edgnudrbysybefbqyijq.supabase.co

### Security Rules
- Never put API secrets in HTML or JS files
- Secrets stored in: scripts/.env (local) + Cloud Function env vars + Secret Manager (tokens)
- Private tables (brahma, journal, checkin, mastery, rituals) require authenticated role
- Public tables (instagram_posts, strava_activities, proof_archive, slips, comments) allow anon SELECT
- Slips are immutable — no delete, no core field update
- .gitignore must cover: .strava_*, .ig_*, .env, *.secret
