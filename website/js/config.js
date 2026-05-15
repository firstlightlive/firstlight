// ═══════════════════════════════════════════════════════
// FIRST LIGHT — Client Configuration
// ═══════════════════════════════════════════════════════

(function(){
  var _s = [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0',
    'UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk'
  ];
  var _mb = ['pk', 'eyJ1IjoiYW51cGFtY29vbCIsImEiOiJjbW9mOW9rOWkwcHVoMnBzY29meDEwZHoyIn0', 'GyfmRS26AINsJf__O0_vmA'];
  var cfg = window.FL || {};
  cfg.SUPABASE_URL = 'https://edgnudrbysybefbqyijq.supabase.co';
  cfg.SUPABASE_ANON_KEY = _s.join('.');
  cfg.MAPBOX_TOKEN = _mb.join('.');
  window.FL = cfg;

  // Store in localStorage for modules that read from there
  if (typeof localStorage !== 'undefined') {
    if (!localStorage.getItem('fl_supabase_url')) localStorage.setItem('fl_supabase_url', cfg.SUPABASE_URL);
    if (!localStorage.getItem('fl_supabase_key')) localStorage.setItem('fl_supabase_key', cfg.SUPABASE_ANON_KEY);
    // Clear any previously stored IG token (security fix — token now server-side only)
    localStorage.removeItem('fl_ig_token');
  }
})();
