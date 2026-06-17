// Visitor Tracking System — Track every pageview
// CRITICAL: This must be included in EVERY deployment

const VisitorTracker = (() => {
  const STORAGE_KEY = 'fl_visitor_tracked';
  const VISITOR_TABLE = 'visitor_logs';

  // Track pageview (once per session)
  async function trackPageview() {
    try {
      // Check if already tracked this session
      if (sessionStorage.getItem(STORAGE_KEY)) return;

      // Get Supabase
      if (!window.supabase) return;

      const { data: { session } } = await supabase.auth.getSession();
      const now = new Date().toISOString();
      const userAgent = navigator.userAgent;
      const page = window.location.pathname;

      // Log visitor
      await supabase.from(VISITOR_TABLE).insert({
        visited_at: now,
        page: page,
        user_agent: userAgent,
        session_id: session?.user?.id || 'anon',
        ip_address: null // Can't get client IP, server will log it
      });

      // Mark as tracked for this session
      sessionStorage.setItem(STORAGE_KEY, 'true');
      console.log('[Visitor] Tracked pageview');
    } catch (e) {
      console.warn('[Visitor] Track error:', e);
    }
  }

  // Get total visitors (unique sessions)
  async function getTotalVisitors() {
    try {
      if (!window.supabase) return 0;

      // Count unique visitors
      const { data, error } = await supabase
        .from(VISITOR_TABLE)
        .select('session_id', { count: 'exact', head: true });

      if (error) throw error;
      return data ? data.length : 0;
    } catch (e) {
      console.warn('[Visitor] Count error:', e);
      return 0;
    }
  }

  // Update display
  async function updateDisplay() {
    const el = document.getElementById('visitorCount');
    if (!el) return;

    el.textContent = 'loading...';
    const count = await getTotalVisitors();
    el.textContent = count > 0 ? count.toLocaleString('en-IN') : '0';
  }

  // Initialize on load
  function init() {
    trackPageview().then(updateDisplay);
  }

  return { init, getTotalVisitors, updateDisplay };
})();

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => VisitorTracker.init());
} else {
  VisitorTracker.init();
}
