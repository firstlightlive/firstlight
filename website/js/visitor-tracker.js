// Visitor Tracker — Updates visitor counter display
// Works with trackVisitor() in app.js (which does the actual tracking)
// CRITICAL: Must be included in EVERY deployment per user requirement

(function() {
  // Update the visitor counter display with live count from site_stats
  async function updateVisitorCounter() {
    try {
      var el = document.getElementById('visitorCount');
      if (!el) return;

      // Use sbFetch (from app.js) to query site_stats
      if (!window.sbFetch) {
        console.warn('[Visitor] sbFetch not available yet');
        return;
      }

      // Get total unique visitors across all time
      var stats = await sbFetch('site_stats', 'GET', null, '?select=total_visits,unique_visitors&order=date.desc&limit=1000');

      if (stats && Array.isArray(stats)) {
        var totalVisits = stats.reduce(function(sum, s) { return sum + (s.total_visits || 0); }, 0);
        el.textContent = totalVisits > 0 ? totalVisits.toLocaleString('en-IN') : '0';
        console.log('[Visitor] Counter updated:', totalVisits);
      } else {
        el.textContent = '0';
      }
    } catch (e) {
      console.warn('[Visitor] Count error:', e);
      var el = document.getElementById('visitorCount');
      if (el) el.textContent = '0';
    }
  }

  // Initialize when page loads
  function init() {
    // Wait for app.js to load and set up sbFetch
    var retries = 0;
    var waitForApp = setInterval(function() {
      if (window.sbFetch || retries > 30) {
        clearInterval(waitForApp);
        updateVisitorCounter();
      }
      retries++;
    }, 100);
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for manual calls
  window.updateVisitorCounter = updateVisitorCounter;
})();
