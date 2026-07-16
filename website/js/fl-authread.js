// ═══════════════════════════════════════════════════════
// FL-AUTHREAD — upgrade anon Supabase REST reads to the logged-in session token.
//
// After the private tables are RLS-locked to the `authenticated` role, the
// signed-in owner must read them with a real session JWT, not the public anon
// key. Rather than rewrite every fetch() across every page, we patch window.fetch
// once: any call to <SUPA>/rest/v1/* whose Authorization is the anon key (or
// missing) is re-signed with fl_supabase_session.access_token. A stranger with
// no session is unaffected — and, being unable to pass the login gate, never
// reaches these pages anyway. Edge-function (/functions/v1) and Storage calls
// are left untouched.
//
// Load AFTER js/config.js (needs window.FL). Idempotent; never throws.
// ═══════════════════════════════════════════════════════
(function () {
  if (window.__flAuthReadPatched) return;
  window.__flAuthReadPatched = true;

  var orig = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var SUPA = (window.FL && window.FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url') || '';
      var ANON = (window.FL && window.FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key') || '';
      if (SUPA && ANON && url.indexOf(SUPA + '/rest/v1/') === 0) {
        var s = null;
        try { s = JSON.parse(localStorage.getItem('fl_supabase_session') || 'null'); } catch (e) { s = null; }
        if (s && s.access_token) {
          var bearer = 'Bearer ' + s.access_token;
          var anonBearer = 'Bearer ' + ANON;
          init = init || {};
          var h = init.headers;
          if (!h && typeof input === 'string') {
            init.headers = { apikey: ANON, Authorization: bearer };
          } else if (h instanceof Headers) {
            var a = h.get('Authorization');
            if (!a || a === anonBearer) { h.set('Authorization', bearer); if (!h.get('apikey')) h.set('apikey', ANON); }
          } else if (h && !Array.isArray(h)) {
            var cur = h.Authorization || h.authorization;
            if (!cur || cur === anonBearer) { h.Authorization = bearer; if (!h.apikey && !h.apiKey) h.apikey = ANON; }
          }
        }
      }
    } catch (e) { /* never break fetch */ }
    return orig.call(this, input, init);
  };
})();
