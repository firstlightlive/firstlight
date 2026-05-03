/* ═══════════════════════════════════════════════════════
   FIRST LIGHT — Shared JavaScript
   Live counters, navigation, scroll animations, auth
   ═══════════════════════════════════════════════════════ */

// ── THEME SYSTEM — Dark / Light / Outdoor ──
function getTheme() { return localStorage.getItem('fl_theme') || 'auto'; }

function resolveTheme(pref) {
  if (pref === 'light' || pref === 'outdoor') return pref;
  // Default is always dark — no OS auto-detect, no schedule switching to light
  return 'dark';
}

function setTheme(theme) {
  localStorage.setItem('fl_theme', theme);
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
  document.querySelectorAll('[data-theme-btn]').forEach(function(b) {
    b.classList.toggle('active', b.dataset.themeBtn === theme);
  });
}

function toggleThemeSchedule(enabled) {
  localStorage.setItem('fl_theme_schedule', enabled ? 'true' : 'false');
  if (getTheme() === 'auto') setTheme('auto');
}

function initTheme() {
  document.documentElement.setAttribute('data-theme', resolveTheme(getTheme()));
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function() {
      if (getTheme() === 'auto') setTheme('auto');
    });
  }
  // Highlight active theme button
  var current = getTheme();
  document.querySelectorAll('[data-theme-btn]').forEach(function(b) {
    b.classList.toggle('active', b.dataset.themeBtn === current);
  });
}

// ── CONFIG — Live config system. Defaults here, overrides from localStorage ──
const FL_DEFAULTS = {
  STREAK_START: '2026-02-10',
  STAKE_PER_DAY: 15000,
  HANDLE_IG: '@firstlightlive',
  HANDLE_X: '@firstlightlive',
  INSTAGRAM_URL: 'https://www.instagram.com/firstlightlive',
  STRAVA_URL: 'https://www.strava.com/',
  X_URL: 'https://x.com/firstlightlive',
  GITHUB_URL: 'https://github.com/Anupamkumarar',
  SITE_URL: 'https://firstlight.live',
  AUTHORIZED_EMAIL: 'firstlightlive@gmail.com',
  OWNER: 'Anupam Kumar',
  BRAND: 'FIRST LIGHT',
  TAGLINE: 'No end date. No finish line. INFINITE.',
  CITY: 'Bangalore, India',
  MEDIA_BASE_URL: '',           // S3/GCP bucket base URL
  SUPABASE_URL: (window.FL && window.FL.SUPABASE_URL) || '',
  SUPABASE_ANON_KEY: (window.FL && window.FL.SUPABASE_ANON_KEY) || '',
  VERIFICATION_SOURCE: 'Apple Watch + Strava',
  MARATHON_TARGET: 'Standard Chartered Singapore Marathon',
  MARATHON_DATE: '2026-12-06',
  MARATHON_TIME: 'Sub 4:30:00',
};

// Ensure admin key is always available in localStorage (needed by profile, races, etc.)
if (!localStorage.getItem('fl_admin_key')) {
  var _ak = ['b8464678b573c885','c449958a9ea760c0','8b01279d01d3a1f9','96fc92b7364f10b7'];
  localStorage.setItem('fl_admin_key', _ak.join(''));
}

// Merge localStorage overrides with defaults
function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('fl_config') || '{}');
    var merged = Object.assign({}, FL_DEFAULTS, saved);
    // Ensure Supabase credentials from config.js are never lost
    if (window.FL && window.FL.SUPABASE_URL) merged.SUPABASE_URL = window.FL.SUPABASE_URL;
    if (window.FL && window.FL.SUPABASE_ANON_KEY) merged.SUPABASE_ANON_KEY = window.FL.SUPABASE_ANON_KEY;
    if (window.FL && window.FL.MAPBOX_TOKEN) merged.MAPBOX_TOKEN = window.FL.MAPBOX_TOKEN;
    return merged;
  } catch(e) { return Object.assign({}, FL_DEFAULTS); }
}

function saveConfig(updates) {
  try {
    const saved = JSON.parse(localStorage.getItem('fl_config') || '{}');
    Object.assign(saved, updates);
    localStorage.setItem('fl_config', JSON.stringify(saved));
    // Reload live config
    Object.assign(FL, saved);
  } catch(e) { console.error('Config save failed:', e); }
}

const FL = loadConfig();

// ── APPLY CONFIG TO ALL PAGES (dynamic link/text sync) ──
function applyConfig() {
  // Social links — update all footer + about links
  document.querySelectorAll('[data-link="instagram"]').forEach(el => { el.href = FL.INSTAGRAM_URL; });
  document.querySelectorAll('[data-link="x"]').forEach(el => { el.href = FL.X_URL; });
  document.querySelectorAll('[data-link="strava"]').forEach(el => { el.href = FL.STRAVA_URL; });
  document.querySelectorAll('[data-link="github"]').forEach(el => { el.href = FL.GITHUB_URL; });

  // Handle text
  document.querySelectorAll('[data-handle-ig]').forEach(el => { el.textContent = FL.HANDLE_IG; });
  document.querySelectorAll('[data-handle-x]').forEach(el => { el.textContent = FL.HANDLE_X; });

  // Owner name
  document.querySelectorAll('[data-owner]').forEach(el => { el.textContent = FL.OWNER; });

  // Brand name
  document.querySelectorAll('[data-brand]').forEach(el => { el.textContent = FL.BRAND; });

  // Tagline
  document.querySelectorAll('[data-tagline]').forEach(el => { el.textContent = FL.TAGLINE; });

  // City
  document.querySelectorAll('[data-city]').forEach(el => { el.textContent = FL.CITY; });

  // Current stake per day
  document.querySelectorAll('[data-stake]').forEach(el => {
    el.textContent = '₹' + formatINRFull(getCurrentStake(getDayNumber()));
  });

  // Verification source — "Tracked via X" / "Verified by X"
  const vs = FL.VERIFICATION_SOURCE || 'Apple Watch + Strava';
  document.querySelectorAll('[data-verify-tracked]').forEach(el => { el.textContent = 'Tracked via ' + vs; });
  document.querySelectorAll('[data-verify-by]').forEach(el => { el.textContent = 'Verified by ' + vs; });
  document.querySelectorAll('[data-verify-source]').forEach(el => { el.textContent = vs; });
  document.querySelectorAll('[data-verify-via]').forEach(el => { el.textContent = 'via ' + vs; });
}

// ── DAY CALCULATION ──
// Get current date/time in IST (UTC+5:30) — used everywhere
function getNowIST() {
  var now = new Date();
  // Convert to IST by adding 5:30 to UTC
  var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (5.5 * 3600000));
}

function getDayNumber() {
  const start = new Date(FL.STREAK_START + 'T00:00:00+05:30');
  const ist = getNowIST();
  const today = new Date(ist.getFullYear(), ist.getMonth(), ist.getDate());
  const diff = Math.floor((today - start) / 86400000);
  return Math.max(1, diff + 1);
}

function getUnclaimed(dayNum) {
  // Use stake schedule if available, otherwise flat rate
  if (typeof getCumulativeUnclaimed === 'function') return getCumulativeUnclaimed(dayNum);
  return dayNum * FL.STAKE_PER_DAY;
}

// ── VERIFIED DAY: only increments when proof exists in Supabase ──
var _verifiedDay = null; // cached after first check
var _verifiedChecked = false;

function getVerifiedDayNumber(callback) {
  // If already checked this page load, use cached value
  if (_verifiedChecked && _verifiedDay !== null) { if (callback) callback(_verifiedDay); return _verifiedDay; }

  var calendarDay = getDayNumber();
  var todayStr = getEffectiveToday();

  // Check if today's proof exists in Supabase
  var sbUrl = FL.SUPABASE_URL || 'https://edgnudrbysybefbqyijq.supabase.co';
  var sbKey = FL.SUPABASE_ANON_KEY || '';

  fetch(sbUrl + '/rest/v1/proof_archive?date=eq.' + todayStr + '&select=date,run_km', {
    headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    _verifiedChecked = true;
    if (data && data.length > 0 && data[0].run_km && parseFloat(data[0].run_km) > 0) {
      // Today's proof exists — show today's day number
      _verifiedDay = calendarDay;
    } else {
      // No proof for today — show yesterday's day number
      _verifiedDay = Math.max(1, calendarDay - 1);
    }
    if (callback) callback(_verifiedDay);
  })
  .catch(function(e) {
    // Network error — fall back to calendar day (don't penalize for network issues)
    _verifiedChecked = true;
    _verifiedDay = calendarDay;
    if (callback) callback(_verifiedDay);
  });

  return _verifiedDay || calendarDay;
}

// ── INDIAN CURRENCY FORMAT ──
function formatINR(num) {
  // Compact Indian notation: L (Lakh), Cr (Crore), Ar (Arab/100Cr), Kh (Kharab)
  if (num >= 1000000000000) return (num / 1000000000000).toFixed(1) + ' Kharab';   // 1 Kharab = 100 Arab
  if (num >= 10000000000) return (num / 10000000000).toFixed(1) + ' Arab';          // 1 Arab = 100 Crore
  if (num >= 10000000) return (num / 10000000).toFixed(1) + ' Cr';                  // 1 Crore = 100 Lakh
  if (num >= 100000) return (num / 100000).toFixed(1) + ' L';                       // 1 Lakh = 100K
  // Below 1 Lakh — use standard Indian comma format
  const str = num.toString();
  if (str.length <= 3) return str;
  let last3 = str.slice(-3);
  let rest = str.slice(0, -3);
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return rest + ',' + last3;
}

function formatINRFull(num) {
  // Full comma-separated format (for tooltips / detail views)
  const str = num.toString();
  if (str.length <= 3) return str;
  let last3 = str.slice(-3);
  let rest = str.slice(0, -3);
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return rest + ',' + last3;
}

// ── STAKE SCHEDULE — auto-compute daily stake + cumulative unclaimed ──
var STAKE_SCHEDULE = [
  { fromDay: 1, amount: 15000 },
  { fromDay: 101, amount: 20000 },
  { fromDay: 201, amount: 25000 },
  { fromDay: 366, amount: 30000 }
];

function getCurrentStake(day) {
  day = parseInt(day) || 1;
  var stake = STAKE_SCHEDULE[0].amount;
  for (var i = 0; i < STAKE_SCHEDULE.length; i++) {
    if (day >= STAKE_SCHEDULE[i].fromDay) stake = STAKE_SCHEDULE[i].amount;
  }
  return stake;
}

function getCumulativeUnclaimed(day) {
  day = parseInt(day) || 1;
  var total = 0;
  var prevEnd = 0;
  for (var i = 0; i < STAKE_SCHEDULE.length; i++) {
    var tierStart = STAKE_SCHEDULE[i].fromDay;
    var tierEnd = (i < STAKE_SCHEDULE.length - 1) ? STAKE_SCHEDULE[i + 1].fromDay - 1 : day;
    tierEnd = Math.min(tierEnd, day);
    if (tierStart > day) break;
    var daysInTier = tierEnd - tierStart + 1;
    if (daysInTier > 0) total += daysInTier * STAKE_SCHEDULE[i].amount;
  }
  return total;
}

function formatStakeINR(amount) {
  return new Intl.NumberFormat('en-IN').format(amount);
}

// ── POPULATE ALL COUNTERS ON PAGE ──
function updateCounters() {
  try {
    var isPublicPage = !document.getElementById('p-dashboard');
    var calendarDay = getDayNumber();

    function applyCounters(day) {
      try {
        var unclaimed = getUnclaimed(day);
        var dailyStake = (typeof getCurrentStake === 'function') ? getCurrentStake(day) : 15000;
        var dailyStakeStr = (typeof formatStakeINR === 'function') ? formatStakeINR(dailyStake) : new Intl.NumberFormat('en-IN').format(dailyStake);

        document.querySelectorAll('[data-day]').forEach(function(el) { el.textContent = day; });
        document.querySelectorAll('[data-unclaimed]').forEach(function(el) { el.textContent = '₹' + formatINRFull(unclaimed); });
        document.querySelectorAll('[data-unclaimed-plain]').forEach(function(el) { el.textContent = formatINRFull(unclaimed); });
        document.querySelectorAll('[data-stake-daily]').forEach(function(el) { el.textContent = dailyStakeStr; });
        document.querySelectorAll('[data-nav-day]').forEach(function(el) { el.textContent = 'DAY ' + day; });
      } catch(e) { console.error('applyCounters error:', e); }
    }

    // Always apply calendar day immediately (no blank page)
    applyCounters(calendarDay);

    if (isPublicPage) {
      // Then check if proof exists — update to verified day if different
      getVerifiedDayNumber(function(verifiedDay) {
        if (verifiedDay !== calendarDay) applyCounters(verifiedDay);
      });
    }
    // Streak status text
    var streakText = '';
    if (calendarDay >= 1000) streakText = calendarDay + ' DAYS — LEGENDARY';
    else if (calendarDay >= 365) streakText = Math.floor(calendarDay / 365) + '+ YEAR STREAK';
    else if (calendarDay >= 100) streakText = 'TRIPLE DIGITS — UNSTOPPABLE';
    else if (calendarDay >= 50) streakText = 'HALF CENTURY';
    else if (calendarDay >= 21) streakText = 'HABIT LOCKED';
    else if (calendarDay >= 7) streakText = 'WEEK ' + Math.ceil(calendarDay / 7) + ' — BUILDING';
    else streakText = 'BUILDING';
    document.querySelectorAll('[data-streak]').forEach(function(el) {
      el.textContent = streakText;
    });
  } catch(e) { console.error('updateCounters error:', e); }
}

// ── NAVIGATION ──
function initNav() {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');
  const mobile = document.querySelector('.nav-mobile');

  // Scroll effect
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // Mobile menu toggle — handled by inline script in each HTML page
  // (inline script runs before app.js to avoid FOUC, so we skip adding a duplicate handler here)

  if (toggle && mobile) {
    // Close on link click (safe to add — doesn't conflict with inline script)
    mobile.querySelectorAll('.nav-link').forEach(function(link) {
      link.addEventListener('click', function() {
        toggle.classList.remove('open');
        mobile.classList.remove('open');
        document.body.style.cssText = '';
      });
    });

    // Close on back button / escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && mobile.classList.contains('open')) {
        toggle.click();
      }
    });
  }

  // Highlight current page
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === path || (path === 'index.html' && href === '/') ||
        (path === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

// ── SCROLL REVEAL ANIMATIONS ──
function initReveal() {
  var els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  // Add animate class to enable the transition (content is visible by default)
  els.forEach(function(el) { el.classList.add('animate'); });

  try {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    els.forEach(function(el) { observer.observe(el); });
  } catch(e) {
    // If IntersectionObserver not supported, show everything
    els.forEach(function(el) { el.classList.add('visible'); });
  }
}

// ── SMOOTH SCROLL FOR ANCHOR LINKS ──
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      var href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      e.preventDefault();
      try {
        var target = document.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch(err) {}
    });
  });
}

// ── SUPABASE AUTH SYSTEM ──

function isLoggedIn() {
  var session = JSON.parse(localStorage.getItem('fl_supabase_session') || 'null');
  if (!session || !session.access_token) return false;
  if (session.expires_at && session.expires_at * 1000 < Date.now()) return false;
  return true;
}

function getAuthUserId() {
  var session = JSON.parse(localStorage.getItem('fl_supabase_session') || 'null');
  return session && session.user ? session.user.id : null;
}

function getAuthEmail() {
  var session = JSON.parse(localStorage.getItem('fl_supabase_session') || 'null');
  return session && session.user ? session.user.email : null;
}

async function supabaseSignIn(email, password) {
  var url = (FL.SUPABASE_URL || '') + '/auth/v1/token?grant_type=password';
  var key = FL.SUPABASE_ANON_KEY || '';
  try {
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'apikey': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await res.json();
    if (data.access_token) {
      localStorage.setItem('fl_supabase_session', JSON.stringify(data));
      logAuthEvent('login_success', email);
      return { success: true, user: data.user };
    }
    logAuthEvent('login_failed', email);
    return { success: false, error: data.error_description || data.msg || 'Login failed' };
  } catch (e) {
    return { success: false, error: 'Network error: ' + e.message };
  }
}

async function supabaseSignOut() {
  var session = JSON.parse(localStorage.getItem('fl_supabase_session') || 'null');
  if (session && session.access_token) {
    fetch((FL.SUPABASE_URL || '') + '/auth/v1/logout', {
      method: 'POST',
      headers: { 'apikey': FL.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + session.access_token }
    }).catch(function() {});
  }
  logAuthEvent('logout', getAuthEmail() || '');
  localStorage.removeItem('fl_supabase_session');
  window.location.href = 'login.html';
}

async function refreshSession() {
  var session = JSON.parse(localStorage.getItem('fl_supabase_session') || 'null');
  if (!session || !session.refresh_token) return false;
  try {
    var res = await fetch((FL.SUPABASE_URL || '') + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': FL.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    var data = await res.json();
    if (data.access_token) {
      localStorage.setItem('fl_supabase_session', JSON.stringify(data));
      return true;
    }
  } catch (e) {}
  localStorage.removeItem('fl_supabase_session');
  return false;
}

async function supabaseUpdatePassword(accessToken, newPassword) {
  try {
    var res = await fetch((FL.SUPABASE_URL || '') + '/auth/v1/user', {
      method: 'PUT',
      headers: {
        'apikey': FL.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: newPassword })
    });
    var data = await res.json();
    if (res.ok) return { success: true };
    return { success: false, error: data.error_description || data.msg || 'Update failed' };
  } catch (e) {
    return { success: false, error: 'Network error: ' + e.message };
  }
}

function requireAuth() {
  if (!isLoggedIn()) { window.location.href = 'login.html'; return false; }
  return true;
}

// Legacy compat — old code may call these
function setSession() { /* no-op — handled by supabaseSignIn */ }
function clearSession() { supabaseSignOut(); }

function logAuthEvent(event, email) {
  try {
    var key = FL.SUPABASE_ANON_KEY || '';
    var url = FL.SUPABASE_URL || '';
    if (!url || !key) return;
    fetch(url + '/rest/v1/auth_audit_log', {
      method: 'POST',
      headers: { 'apikey': key, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ event: event, email: email, user_agent: navigator.userAgent, success: event.includes('success') || event === 'logout' })
    }).catch(function() {});
  } catch (e) {}
}

// Inactivity timeout (30 min)
var _lastActivity = Date.now();
document.addEventListener('click', function() { _lastActivity = Date.now(); });
document.addEventListener('keydown', function() { _lastActivity = Date.now(); });
setInterval(function() {
  if (isLoggedIn() && Date.now() - _lastActivity > 30 * 60 * 1000 && window.location.pathname.indexOf('admin') > -1) supabaseSignOut();
}, 60000);

// Auto-refresh session every 50 min + flush sync queue + re-pull
setInterval(function() {
  if (isLoggedIn()) {
    refreshSession().then(function(ok) {
      if (ok) {
        console.log('[Session] Auto-refreshed. Flushing sync queue...');
        flushSyncQueue();
      }
    });
  }
}, 50 * 60 * 1000);

// Also flush sync queue every 2 minutes (catches failed syncs)
setInterval(function() {
  if (isLoggedIn() && navigator.onLine) {
    var queue = getSyncQueue();
    if (queue.length > 0) {
      console.log('[Sync] Auto-flush: ' + queue.length + ' pending items');
      flushSyncQueue();
    }
  }
}, 2 * 60 * 1000);

// ── STREAK CALENDAR BUILDER ──
function buildCalendar(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const start = new Date(FL.STREAK_START);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // INFINITE CALENDAR — dynamically calculates weeks from streak start to today + 4 week buffer
  // Grows automatically: 1 year = 53 cols, 2 years = 105 cols, 10 years = 522 cols, 30 years = 1566 cols
  const startDay = new Date(start);
  startDay.setDate(startDay.getDate() - startDay.getDay()); // Align to Sunday

  const endDay = new Date(today);
  endDay.setDate(endDay.getDate() + (6 - endDay.getDay()) + 28); // End of current week + 4 week buffer

  const totalDays = Math.ceil((endDay - startDay) / 86400000);
  const totalWeeks = Math.ceil(totalDays / 7);

  container.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const todayTime = today.getTime();
  const startTime = start.getTime();

  for (let w = 0; w < totalWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDay);
      date.setDate(date.getDate() + (w * 7 + d));
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      const dateTime = date.getTime();

      if (dateTime < startTime) {
        cell.className += ' future';
      } else if (dateTime === todayTime) {
        cell.className += ' today';
      } else if (dateTime < todayTime) {
        cell.className += ' done';
      } else {
        cell.className += ' future';
      }

      if (dateTime >= startTime && dateTime <= todayTime) {
        const dayNum = Math.floor((dateTime - startTime) / 86400000) + 1;
        cell.title = 'Day ' + dayNum;
      }

      fragment.appendChild(cell);
    }
  }
  container.appendChild(fragment);

  // Generate month labels above calendar columns
  const monthLabels = document.getElementById('streakMonthLabels');
  if (monthLabels) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let mlHtml = '';
    let lastMonth = -1;
    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = new Date(startDay);
      weekStart.setDate(weekStart.getDate() + (w * 7));
      const m = weekStart.getMonth();
      if (m !== lastMonth) {
        mlHtml += '<span style="min-width:' + (12 + 2) + 'px">' + months[m] + '</span>';
        lastMonth = m;
      } else {
        mlHtml += '<span style="min-width:' + (12 + 2) + 'px"></span>';
      }
    }
    monthLabels.innerHTML = mlHtml;
  }

  // Auto-scroll to show the current week (rightmost = most recent)
  container.scrollLeft = container.scrollWidth;
  if (monthLabels) monthLabels.scrollLeft = monthLabels.scrollWidth;

  // Sync calendar and month label scroll positions
  container.addEventListener('scroll', function() {
    if (monthLabels) monthLabels.scrollLeft = container.scrollLeft;
  });
}

// ── LOCAL DATA STORE (for proof archive / daily log) ──
function getProofData() {
  try {
    return JSON.parse(localStorage.getItem('fl_proof_data') || '[]');
  } catch(e) { return []; }
}

function saveProofEntry(entry) {
  if (isDateLocked(entry.date)) { showLockWarning(); return; }
  const data = getProofData();
  const idx = data.findIndex(d => d.date === entry.date);
  if (idx >= 0) data[idx] = entry;
  else data.push(entry);
  data.sort((a, b) => new Date(b.date) - new Date(a.date));
  localStorage.setItem('fl_proof_data', JSON.stringify(data));
  // Supabase sync
  syncDailyLog(entry);
}

function getTodayStats() {
  try {
    return JSON.parse(localStorage.getItem('fl_today_stats') || '{}');
  } catch(e) { return {}; }
}

function saveTodayStats(stats) {
  localStorage.setItem('fl_today_stats', JSON.stringify(stats));
}

// ═══════════════════════════════════════════
// HISTORY LOCK SYSTEM
// Data locks at midnight. Once the date changes, previous day is permanently locked.
// No grace window. Log everything before 11:59 PM.
// Exception: Races are always editable (no lock check in saveRace).
// ═══════════════════════════════════════════

var LOCK_HOUR = 0; // Midnight — data locks when the date changes.

function getEffectiveToday() {
  // Always IST (UTC+5:30) — even if traveling in a different timezone
  var ist = getNowIST();
  var y = ist.getFullYear();
  var m = String(ist.getMonth() + 1).padStart(2, '0');
  var d = String(ist.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function isDateLocked(dateStr) {
  if (!dateStr) return false;
  var effectiveToday = getEffectiveToday();
  if (dateStr >= effectiveToday) return false; // Today = editable
  return true; // Any past date = locked permanently
}

function isWeekLocked(weekDateStr) {
  // A week is locked if ALL 7 days in that week are past the grace window
  if (!weekDateStr) return false;
  var weekEnd = new Date(weekDateStr);
  weekEnd.setDate(weekEnd.getDate() + 6);
  var today = getEffectiveToday();
  return (weekEnd.getFullYear()+'-'+String(weekEnd.getMonth()+1).padStart(2,'0')+'-'+String(weekEnd.getDate()).padStart(2,'0')) < today;
}

function isMonthLocked(monthStr) {
  // A month is locked if the ENTIRE month is past the grace window
  if (!monthStr) return false;
  var parts = monthStr.split('-');
  var lastDay = new Date(parseInt(parts[0]), parseInt(parts[1]), 0);
  var today = getEffectiveToday();
  return (lastDay.getFullYear()+'-'+String(lastDay.getMonth()+1).padStart(2,'0')+'-'+String(lastDay.getDate()).padStart(2,'0')) < today;
}

function showLockWarning() {
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(255,68,68,0.95);color:#fff;padding:12px 24px;border-radius:8px;font-family:var(--font-mono);font-size:12px;letter-spacing:1px;z-index:99999;pointer-events:none;animation:fadeInOut 2.5s ease';
  toast.textContent = '🔒 LOCKED — Historical data cannot be modified';
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 2500);
}

// Lock banner HTML (inject into panels viewing past dates)
function getLockBannerHTML(dateStr) {
  return '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(255,68,68,0.08);border:1px solid rgba(255,68,68,0.2);border-radius:8px;margin-bottom:16px">' +
    '<span style="font-size:18px">🔒</span>' +
    '<div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--red);letter-spacing:1px">' + dateStr + ' — LOCKED</div>' +
    '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">Historical data is permanent and cannot be modified.</div></div></div>';
}

// CSS animation for toast
(function() {
  if (!document.getElementById('lockAnimStyle')) {
    var s = document.createElement('style');
    s.id = 'lockAnimStyle';
    s.textContent = '@keyframes fadeInOut{0%{opacity:0;transform:translateX(-50%) translateY(-10px)}10%{opacity:1;transform:translateX(-50%) translateY(0)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-10px)}}';
    document.head.appendChild(s);
  }
})();

// ═══════════════════════════════════════════
// STREAK CALCULATORS — All 3 Life Rules + Reading
// Each returns { current, longest }
// STREAK_EPOCH: All streaks except Run & Food start from this date
// ═══════════════════════════════════════════
var STREAK_EPOCH = '2026-04-19';

function computeRunStreak() {
  var proof = getProofData();
  if (!proof || !proof.length) return { current: 0, longest: 0 };
  // Build a date map for gap detection
  var dateMap = {};
  proof.forEach(function(p) { dateMap[p.date] = p; });

  // Current streak: count backwards from today, break on missing date or runKm <= 0
  var today = getEffectiveToday();
  var current = 0;
  for (var i = 0; i < 400; i++) {
    var d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    var entry = dateMap[ds];
    if (entry && entry.runKm > 0) { current++; }
    else if (i === 0) { continue; } // Today might not have data yet
    else { break; }
  }

  // Longest streak: scan all dates chronologically, break on gaps
  proof.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  var longest = 0, streak = 0;
  for (var j = 0; j < proof.length; j++) {
    if (proof[j].runKm > 0) {
      // Check if this date is consecutive with previous
      if (j > 0 && streak > 0) {
        var prev = new Date(proof[j-1].date + 'T12:00:00');
        var curr = new Date(proof[j].date + 'T12:00:00');
        var diffDays = Math.round((curr - prev) / 86400000);
        if (diffDays > 1) streak = 0; // Gap detected
      }
      streak++;
      longest = Math.max(longest, streak);
    } else { streak = 0; }
  }
  return { current: current, longest: longest };
}

function computeFoodStreak() {
  var proof = getProofData();
  if (!proof || !proof.length) return { current: 0, longest: 0 };
  var dateMap = {};
  proof.forEach(function(p) { dateMap[p.date] = p; });

  var today = getEffectiveToday();
  var current = 0;
  for (var i = 0; i < 400; i++) {
    var d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    var entry = dateMap[ds];
    if (entry && entry.foodClean) { current++; }
    else if (i === 0) { continue; }
    else { break; }
  }

  proof.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  var longest = 0, streak = 0;
  for (var j = 0; j < proof.length; j++) {
    if (proof[j].foodClean) {
      if (j > 0 && streak > 0) {
        var prev = new Date(proof[j-1].date + 'T12:00:00');
        var curr = new Date(proof[j].date + 'T12:00:00');
        if (Math.round((curr - prev) / 86400000) > 1) streak = 0;
      }
      streak++;
      longest = Math.max(longest, streak);
    } else { streak = 0; }
  }
  return { current: current, longest: longest };
}

function computeFortressOutStreak() {
  var today = getEffectiveToday();
  var current = 0;
  // Current streak: walk backwards from today
  for (var i = 0; i < 365; i++) {
    var d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (ds < STREAK_EPOCH) break;
    var data = null;
    try { data = JSON.parse(localStorage.getItem('fl_brahma_daily_' + ds) || 'null'); } catch(e) {}
    if (data && data.stayed_out === true) { current++; }
    else if (i === 0) { continue; } // Today might not have data yet
    else { break; }
  }
  // Longest: scan forward from epoch
  var longest = 0, streak = 0;
  var epochDate = new Date(STREAK_EPOCH + 'T12:00:00');
  var todayDate = new Date(today + 'T12:00:00');
  var totalDays = Math.ceil((todayDate - epochDate) / 86400000);
  for (var k = 0; k <= totalDays; k++) {
    var d2 = new Date(epochDate); d2.setDate(d2.getDate() + k);
    var ds2 = d2.getFullYear() + '-' + String(d2.getMonth()+1).padStart(2,'0') + '-' + String(d2.getDate()).padStart(2,'0');
    var data2 = null;
    try { data2 = JSON.parse(localStorage.getItem('fl_brahma_daily_' + ds2) || 'null'); } catch(e) {}
    if (data2 && data2.stayed_out === true) { streak++; longest = Math.max(longest, streak); }
    else { streak = 0; }
  }
  return { current: current, longest: longest };
}

function computeJapaStreak() {
  var proof = getProofData();
  if (!proof || !proof.length) return { current: 0, longest: 0 };
  proof = proof.filter(function(p) { return p.date >= STREAK_EPOCH; });
  if (!proof.length) return { current: 0, longest: 0 };
  var dateMap = {};
  proof.forEach(function(p) { dateMap[p.date] = p; });

  var today = getEffectiveToday();
  var current = 0;
  for (var i = 0; i < 400; i++) {
    var d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (ds < STREAK_EPOCH) break;
    var entry = dateMap[ds];
    if (entry && entry.japa) { current++; }
    else if (i === 0) { continue; }
    else { break; }
  }

  proof.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  var longest = 0, streak = 0;
  for (var j = 0; j < proof.length; j++) {
    if (proof[j].japa) {
      if (j > 0 && streak > 0) {
        var prev = new Date(proof[j-1].date + 'T12:00:00');
        var curr = new Date(proof[j].date + 'T12:00:00');
        if (Math.round((curr - prev) / 86400000) > 1) streak = 0;
      }
      streak++;
      longest = Math.max(longest, streak);
    } else { streak = 0; }
  }
  return { current: current, longest: longest };
}

function computeReadingStreak() {
  var today = getEffectiveToday();
  // Current streak: walk backwards from today
  var current = 0;
  for (var i = 0; i < 365; i++) {
    var d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (ds < STREAK_EPOCH) break;
    if (localStorage.getItem('fl_daily_rule_read_' + ds)) { current++; }
    else if (i === 0) { continue; } // Today might not have read yet
    else { break; }
  }
  // Longest: scan forward from epoch
  var longest = 0, streak = 0;
  var epochDate = new Date(STREAK_EPOCH + 'T12:00:00');
  var todayDate = new Date(today + 'T12:00:00');
  var totalDays = Math.ceil((todayDate - epochDate) / 86400000);
  for (var k = 0; k <= totalDays; k++) {
    var d2 = new Date(epochDate); d2.setDate(d2.getDate() + k);
    var ds2 = d2.getFullYear() + '-' + String(d2.getMonth()+1).padStart(2,'0') + '-' + String(d2.getDate()).padStart(2,'0');
    if (localStorage.getItem('fl_daily_rule_read_' + ds2)) { streak++; longest = Math.max(longest, streak); }
    else streak = 0;
  }
  return { current: current, longest: longest };
}

// ── RACE PORTFOLIO DATA ──
function getRaces() {
  try { return JSON.parse(localStorage.getItem('fl_races') || '[]'); }
  catch(e) { return []; }
}

function saveRace(race) {
  const races = getRaces();
  race.id = race.id || generateRaceId(race);

  // One race per date — check if another race already exists on this date
  var dateConflict = races.findIndex(function(r) { return r.date === race.date && r.id !== race.id; });
  if (dateConflict >= 0) {
    // Update the existing race on that date instead of creating a new entry
    race.id = races[dateConflict].id;
    races[dateConflict] = race;
  } else {
    var idx = races.findIndex(r => r.id === race.id);
    if (idx >= 0) races[idx] = race;
    else races.push(race);
  }

  races.sort((a, b) => new Date(b.date) - new Date(a.date));
  localStorage.setItem('fl_races', JSON.stringify(races));
  if (typeof syncSave === 'function') {
    syncSave('races', race, 'id');
  }
}

function deleteRace(id) {
  const races = getRaces().filter(r => r.id !== id);
  localStorage.setItem('fl_races', JSON.stringify(races));
}

function generateRaceId(race) {
  return ((race.shortName || race.name) + '-' + race.date).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function computeCareerStats(races) {
  const done = races.filter(r => r.status === 'completed');
  const marathons = done.filter(r => r.type === 'marathon');
  const halfs = done.filter(r => r.type === 'half');
  return {
    totalRaces: done.length,
    totalKm: Math.round(done.reduce((s, r) => s + (r.distance || 0), 0) * 10) / 10,
    marathons: marathons.length,
    bestMarathon: marathons.reduce((b, r) => (!b || (r.finishTimeSec || Infinity) < b) ? r.finishTimeSec : b, null),
    bestHalf: halfs.reduce((b, r) => (!b || (r.finishTimeSec || Infinity) < b) ? r.finishTimeSec : b, null),
    totalTimeSec: done.reduce((s, r) => s + (r.finishTimeSec || 0), 0)
  };
}

function formatRaceTime(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function parseTimeToSec(str) {
  if (!str) return 0;
  const p = str.split(':').map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return 0;
}

const RACE_COLORS = {
  '5k': '#00D4FF', '10k': '#00E5A0', 'half': '#F5A623',
  'marathon': '#FF6B35', 'ultra50k': '#E040FB', 'ultra100k': '#FF4444', 'other': '#C0C0C0'
};

const RACE_LABELS = {
  '5k': '5K', '10k': '10K', 'half': 'HALF MARATHON',
  'marathon': 'MARATHON', 'ultra50k': 'ULTRA 50K', 'ultra100k': 'ULTRA 100K', 'other': 'OTHER'
};

// ── DATA EXPORT / IMPORT (critical for 30-year persistence) ──
function exportAllData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('fl_')) data[key] = localStorage.getItem(key);
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'firstlight_backup_' + getEffectiveToday() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return Object.keys(data).length;
}

function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        let count = 0;
        for (const [key, val] of Object.entries(data)) {
          if (key.startsWith('fl_')) { localStorage.setItem(key, val); count++; }
        }
        resolve(count);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ── LAST SAVED INDICATOR ──
function markSaved() {
  const el = document.getElementById('lastSaved');
  if (el) el.textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── ENGAGEMENT COUNTER PERSISTENCE ──
function getEngCounter(id) {
  const key = 'fl_eng_' + id + '_' + getEffectiveToday();
  return parseInt(localStorage.getItem(key) || '0');
}

function setEngCounter(id, val) {
  const key = 'fl_eng_' + id + '_' + getEffectiveToday();
  localStorage.setItem(key, val);
}

// ── STORIES CHECKLIST PERSISTENCE ──
function getStoriesState() {
  const key = 'fl_stories_' + getEffectiveToday();
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}

function saveStoriesState(doneIndices) {
  const key = 'fl_stories_' + getEffectiveToday();
  localStorage.setItem(key, JSON.stringify(doneIndices));
}

// Old getCurrentStake/getEscalatedUnclaimed removed — replaced by STAKE_SCHEDULE version (line ~213)

// ══════════════════════════════════════════════════════
// SUPABASE SYNC LAYER — Production Grade
// Three-layer: Memory → localStorage → Supabase
// Offline-first with sync queue, auto-retry, status indicator
// ══════════════════════════════════════════════════════

const SB = {
  url: null,
  key: null,
  ready: false,
  online: navigator.onLine,
  syncing: false,
  lastSync: null,
  init() {
    this.url = FL.SUPABASE_URL || localStorage.getItem('fl_supabase_url') || '';
    this.key = FL.SUPABASE_ANON_KEY || localStorage.getItem('fl_supabase_key') || '';
    this.ready = !!(this.url && this.key && this.url.includes('supabase.co'));
    return this.ready;
  },
  // Use JWT from Supabase Auth session if available, fall back to anon key for public pages
  _getToken() {
    var session = JSON.parse(localStorage.getItem('fl_supabase_session') || 'null');
    return (session && session.access_token) ? session.access_token : this.key;
  },
  headersGet() {
    return { 'apikey': this.key, 'Authorization': 'Bearer ' + this._getToken() };
  },
  headersUpsert() {
    return {
      'apikey': this.key, 'Authorization': 'Bearer ' + this._getToken(),
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };
  }
};

// ── SYNC QUEUE — survives page reload ──
function getSyncQueue() {
  try { return JSON.parse(localStorage.getItem('fl_sync_queue') || '[]'); } catch(e) { return []; }
}

// Safe localStorage write — catches QuotaExceededError
function safeLSSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch(e) {
    console.error('[Storage] QuotaExceeded or write failed for key:', key, e.message);
    // Try to free space by removing old sync queue entries
    try {
      var q = JSON.parse(localStorage.getItem('fl_sync_queue') || '[]');
      if (q.length > 50) {
        localStorage.setItem('fl_sync_queue', JSON.stringify(q.slice(-50)));
        localStorage.setItem(key, value); // retry
        return true;
      }
    } catch(e2) {}
    return false;
  }
}

function addToSyncQueue(table, data, query) {
  const queue = getSyncQueue();
  // Cap queue at 500 items
  if (queue.length >= 500) {
    console.warn('[Sync] Queue full (500). Dropping oldest.');
    queue.shift();
  }
  // Deduplicate
  const key = table + ':' + (data.date || data.id || data.week_start || data.month || data.key || JSON.stringify(data).slice(0, 50));
  const idx = queue.findIndex(q => q.key === key);
  const entry = { key, table, data, query, timestamp: Date.now(), retries: 0 };
  if (idx >= 0) queue[idx] = entry; else queue.push(entry);
  safeLSSet('fl_sync_queue', JSON.stringify(queue));
  updateSyncStatus();
}

function removeSyncQueueItem(key) {
  const queue = getSyncQueue().filter(q => q.key !== key);
  localStorage.setItem('fl_sync_queue', JSON.stringify(queue));
}

// ── SYNC STATUS INDICATOR ──
// Updates any element with id="syncStatusDot" and id="syncStatusText"
function updateSyncStatus() {
  const dot = document.getElementById('syncStatusDot');
  const txt = document.getElementById('syncStatusText');
  const queue = getSyncQueue();

  if (!SB.ready) {
    if (dot) { dot.className = 'sync-dot offline'; dot.title = 'Supabase not configured'; }
    if (txt) txt.textContent = 'NOT CONFIGURED';
    return;
  }

  if (!SB.online) {
    if (dot) { dot.className = 'sync-dot offline'; dot.title = 'Offline — ' + queue.length + ' queued'; }
    if (txt) txt.textContent = 'OFFLINE · ' + queue.length + ' QUEUED';
    return;
  }

  if (SB.syncing) {
    if (dot) { dot.className = 'sync-dot syncing'; dot.title = 'Syncing...'; }
    if (txt) txt.textContent = 'SYNCING (' + queue.length + ')';
    return;
  }

  if (queue.length > 0) {
    if (dot) { dot.className = 'sync-dot pending'; dot.title = queue.length + ' pending'; }
    if (txt) txt.textContent = queue.length + ' PENDING';
    return;
  }

  // All synced
  const lastTime = SB.lastSync ? new Date(SB.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  if (dot) { dot.className = 'sync-dot synced'; dot.title = 'Synced' + (lastTime ? ' at ' + lastTime : ''); }
  if (txt) txt.textContent = 'SYNCED' + (lastTime ? ' · ' + lastTime : '');
}

// ── CORE FETCH — with queue fallback ──
// Public tables that don't need user_id (anonymous access)
const SB_PUBLIC_TABLES = ['comments', 'comment_reactions', 'visitor_identities', 'auth_audit_log'];

async function sbFetch(table, method, body, query) {
  if (!SB.init()) {
    if (method !== 'GET' && body) addToSyncQueue(table, body, query);
    return null;
  }

  // Auto-inject user_id for authenticated writes to personal tables
  if (body && method !== 'GET' && SB_PUBLIC_TABLES.indexOf(table) < 0) {
    var uid = getAuthUserId();
    if (uid) body.user_id = uid;
  }

  const url = SB.url + '/rest/v1/' + table + (query || '');
  const opts = {
    method: method,
    headers: method === 'GET' ? SB.headersGet() : SB.headersUpsert()
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      console.warn('Supabase ' + method + ' ' + table + ':', res.status);
      if (method !== 'GET' && body) addToSyncQueue(table, body, query);
      return null;
    }
    SB.lastSync = Date.now();
    updateSyncStatus();
    if (method === 'GET') return await res.json();
    return true;
  } catch (e) {
    console.warn('Supabase sync error:', e.message);
    SB.online = false;
    if (method !== 'GET' && body) addToSyncQueue(table, body, query);
    updateSyncStatus();
    return null;
  }
}

// ── FLUSH SYNC QUEUE — process all pending items ──
async function flushSyncQueue() {
  if (!SB.init() || !SB.online || SB.syncing) return;
  const queue = getSyncQueue();
  if (queue.length === 0) return;

  SB.syncing = true;
  updateSyncStatus();
  let flushed = 0;

  for (const item of queue) {
    try {
      const url = SB.url + '/rest/v1/' + item.table + (item.query || '');
      const res = await fetch(url, {
        method: 'POST',
        headers: SB.headersUpsert(),
        body: JSON.stringify(item.data)
      });
      if (res.ok) {
        removeSyncQueueItem(item.key);
        flushed++;
      } else {
        item.retries = (item.retries || 0) + 1;
        if (item.retries >= 5) removeSyncQueueItem(item.key); // Give up after 5 tries
      }
    } catch (e) {
      SB.online = false;
      break; // Stop flushing if offline
    }
  }

  SB.syncing = false;
  SB.lastSync = flushed > 0 ? Date.now() : SB.lastSync;
  updateSyncStatus();
  return flushed;
}

// ── AUTO-PULL ON PAGE LOAD — merge remote into local ──
// ═══════════════════════════════════════════
// SYNC ENGINE v2 — PUSH-FIRST, TIMESTAMP-BASED, 10-YEAR ROBUST
// Rule 1: ALWAYS push local changes before pulling remote
// Rule 2: NEVER overwrite local data that is newer than remote
// Rule 3: Auto-refresh session before it expires
// ═══════════════════════════════════════════

// Track when each localStorage key was last written locally
function _markLocalWrite(key) {
  try {
    var ts = JSON.parse(localStorage.getItem('fl_write_timestamps') || '{}');
    ts[key] = Date.now();
    localStorage.setItem('fl_write_timestamps', JSON.stringify(ts));
  } catch(e) {}
}

function _getLocalWriteTime(key) {
  try {
    var ts = JSON.parse(localStorage.getItem('fl_write_timestamps') || '{}');
    return ts[key] || 0;
  } catch(e) { return 0; }
}

function _hasPendingSync(key) {
  // Check if this key has unsent changes in the sync queue
  try {
    var queue = JSON.parse(localStorage.getItem('fl_sync_queue') || '[]');
    return queue.some(function(q) { return q.key && q.key.indexOf(key) > -1; });
  } catch(e) { return false; }
}

// Safe merge: only write remote data to localStorage if local has NO pending changes
// and remote is not older than local
function _safeMerge(localKey, remoteData) {
  // Rule: if there's a pending sync for this key, NEVER overwrite local
  if (_hasPendingSync(localKey)) {
    console.log('[Sync] Skip merge for ' + localKey + ' — pending local changes');
    return false;
  }

  var localData = localStorage.getItem(localKey);

  // If local is empty, always accept remote
  if (!localData) {
    localStorage.setItem(localKey, JSON.stringify(remoteData));
    return true;
  }

  // If local has data, only accept remote if local was NOT written in the last 5 minutes
  // (gives user time to finish editing before remote overwrites)
  var localWriteTime = _getLocalWriteTime(localKey);
  var fiveMinAgo = Date.now() - 5 * 60 * 1000;

  if (localWriteTime > fiveMinAgo) {
    console.log('[Sync] Skip merge for ' + localKey + ' — local was written ' + Math.round((Date.now() - localWriteTime)/1000) + 's ago');
    return false;
  }

  // Remote wins only if local wasn't recently modified
  localStorage.setItem(localKey, JSON.stringify(remoteData));
  return true;
}

async function autoPullOnLoad() {
  if (!SB.init() || !SB.online) return;

  // RULE 1: PUSH FIRST — flush any pending local changes to Supabase BEFORE pulling
  var queue = getSyncQueue();
  if (queue.length > 0) {
    console.log('[Sync] Flushing ' + queue.length + ' pending items BEFORE pull...');
    await flushSyncQueue();
    // Re-check queue after flush
    queue = getSyncQueue();
    if (queue.length > 0) {
      console.warn('[Sync] ' + queue.length + ' items still pending after flush — skipping pull to protect local data');
      return; // Don't pull if we couldn't push — local data is more recent
    }
  }

  var today = getEffectiveToday();

  // Pull today's rituals
  try {
    var rituals = await sbFetch('daily_rituals', 'GET', null, '?date=eq.' + today);
    if (rituals) {
      rituals.forEach(function(r) {
        var key = 'fl_rituals_' + r.period + '_' + r.date;
        _safeMerge(key, r.done_indices || []);
      });
    }
  } catch(e) {}

  // Pull today's engagement counters
  try {
    var eng = await sbFetch('engagement_counters', 'GET', null, '?date=eq.' + today);
    if (eng && eng.length) {
      var e = eng[0];
      if (!localStorage.getItem('fl_eng_commentCount_' + today)) localStorage.setItem('fl_eng_commentCount_' + today, e.comments || 0);
      if (!localStorage.getItem('fl_eng_storyCount_' + today)) localStorage.setItem('fl_eng_storyCount_' + today, e.stories || 0);
      if (!localStorage.getItem('fl_eng_dmCount_' + today)) localStorage.setItem('fl_eng_dmCount_' + today, e.dms || 0);
    }
  } catch(e) {}

  // Pull this week's schedule
  try {
    var weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    var weekKey = (weekStart.getFullYear()+'-'+String(weekStart.getMonth()+1).padStart(2,'0')+'-'+String(weekStart.getDate()).padStart(2,'0'));
    var weekly = await sbFetch('weekly_schedule', 'GET', null, '?week_start=eq.' + weekKey);
    if (weekly && weekly.length) {
      _safeMerge('fl_weekly_' + weekKey, weekly[0].data || {});
    }
  } catch(e) {}

  // Pull stories for today
  try {
    var stories = await sbFetch('stories_completions', 'GET', null, '?date=eq.' + today);
    if (stories && stories.length) {
      _safeMerge('fl_stories_' + today, stories[0].done_indices || []);
    }
  } catch(e) {}

  // Pull today's mastery daily
  try {
    var masteryDaily = await sbFetch('mastery_daily', 'GET', null, '?date=eq.' + today);
    if (masteryDaily && masteryDaily.length) {
      _safeMerge('fl_mastery_daily_' + today, masteryDaily[0].items || {});
    }
  } catch(e) {}

  // Pull this week's mastery weekly
  try {
    var sunday = new Date();
    sunday.setDate(sunday.getDate() - sunday.getDay());
    var sundayStr = (sunday.getFullYear()+'-'+String(sunday.getMonth()+1).padStart(2,'0')+'-'+String(sunday.getDate()).padStart(2,'0'));
    var masteryWeekly = await sbFetch('mastery_weekly', 'GET', null, '?week_date=eq.' + sundayStr);
    if (masteryWeekly && masteryWeekly.length) {
      _safeMerge('fl_mastery_weekly_' + sundayStr, masteryWeekly[0].items || {});
    }
  } catch(e) {}

  // Pull today's brahma daily
  try {
    var brahmaToday = await sbFetch('brahma_daily', 'GET', null, '?date=eq.' + today);
    if (brahmaToday && brahmaToday.length) {
      _safeMerge('fl_brahma_daily_' + today, brahmaToday[0].items || {});
    }
  } catch(e) {}

  // Pull proof_archive — critical for streak graphs
  try {
    var proofData = await sbFetch('proof_archive', 'GET', null, '?select=*&order=date.desc');
    if (proofData && proofData.length) {
      var existing = getProofData();
      var existingMap = {};
      existing.forEach(function(p) { existingMap[p.date] = p; });
      proofData.forEach(function(r) {
        if (!existingMap[r.date] || (r.run_km && parseFloat(r.run_km) > 0 && (!existingMap[r.date].runKm || existingMap[r.date].runKm === 0))) {
          existingMap[r.date] = {
            date: r.date, sleepHrs: r.sleep_hrs ? parseFloat(r.sleep_hrs) : null,
            runKm: r.run_km ? parseFloat(r.run_km) : 0, gym: r.gym || false,
            foodClean: r.food_clean !== false, japa: true, mood: 7
          };
        }
      });
      var merged = Object.values(existingMap).sort(function(a,b) { return b.date > a.date ? 1 : -1; });
      localStorage.setItem('fl_proof_data', JSON.stringify(merged));
      if (typeof buildDashboardStats === 'function') buildDashboardStats();
    }
  } catch(e) {}

  SB.lastSync = Date.now();
  updateSyncStatus();
  console.log('[Sync] Pull complete');
}

// ── ONLINE/OFFLINE LISTENERS ──
window.addEventListener('online', () => {
  SB.online = true;
  updateSyncStatus();
  // Flush queue when back online
  setTimeout(flushSyncQueue, 1000);
});

window.addEventListener('offline', () => {
  SB.online = false;
  updateSyncStatus();
});

// ── PERIODIC QUEUE FLUSH — every 30 seconds ──
setInterval(() => {
  if (SB.online && SB.ready && getSyncQueue().length > 0) flushSyncQueue();
}, 30000);


// ── SYNC FUNCTIONS (called after localStorage save) ──

async function syncRituals(date, period, doneIndices, totalItems) {
  if (!SB.init()) return;
  const pct = totalItems > 0 ? Math.round(doneIndices.length / totalItems * 100) : 0;
  await sbFetch('daily_rituals', 'POST', {
    date: date, period: period, done_indices: doneIndices,
    total_items: totalItems, completion_pct: pct
  }, '?on_conflict=date,period');
}

async function syncJournal(date, entry) {
  if (!SB.init()) return;
  await sbFetch('journal_entries', 'POST', Object.assign({ date: date }, entry), '?on_conflict=date');
}

async function syncDailyLog(entry) {
  if (!SB.init()) return;
  await sbFetch('daily_logs', 'POST', {
    date: entry.date, wake_time: entry.wakeTime, sleep_hrs: entry.sleepHrs,
    run_km: entry.runKm, run_start: entry.runStart, run_pace: entry.runPace,
    gym: entry.gym, muscle: entry.muscle, food_clean: entry.foodClean,
    violation: entry.violation, brahma: entry.brahma, japa: entry.japa,
    nasya: entry.nasya, breach: entry.breach, mood: entry.mood, notes: entry.notes
  }, '?on_conflict=date');
}

async function syncRace(race) {
  if (!SB.init()) return;
  await sbFetch('races', 'POST', {
    id: race.id, name: race.name, short_name: race.shortName, date: race.date,
    location: race.location, country: race.country, type: race.type,
    distance: race.distance, status: race.status, bib: race.bib,
    bib_photo: race.bibPhoto, finish_time: race.finishTime,
    finish_time_sec: race.finishTimeSec, gun_time: race.gunTime, pace: race.pace,
    target_time: race.targetTime, position: race.position, splits: race.splits,
    conditions: race.conditions, heart_rate: race.heartRate, calories: race.calories,
    photos: race.photos, videos: race.videos, strava_url: race.stravaUrl,
    official_results_url: race.officialResultsUrl, notes: race.notes,
    highlight: race.highlight, tags: race.tags
  }, '?on_conflict=id');
}

async function syncWeeklyMetrics(weekDate, metrics) {
  if (!SB.init()) return;
  await sbFetch('weekly_metrics', 'POST', Object.assign({ week_date: weekDate }, metrics), '?on_conflict=week_date');
}

async function syncEngagement(date, comments, stories, dms) {
  if (!SB.init()) return;
  await sbFetch('engagement_counters', 'POST', {
    date: date, comments: comments, stories: stories, dms: dms
  }, '?on_conflict=date');
}

async function syncDeepWork(date, data) {
  if (!SB.init()) return;
  await sbFetch('deep_work_sessions', 'POST', {
    date: date, blocks: data.blocks || [], total_sessions: data.totalSessions || 0,
    total_hours: data.totalHours || 0, biggest_win: data.biggestWin || ''
  }, '?on_conflict=date');
}

async function syncWeeklySchedule(weekStart, data) {
  if (!SB.init()) return;
  await sbFetch('weekly_schedule', 'POST', {
    week_start: weekStart, data: data
  }, '?on_conflict=week_start');
}

async function syncMonthlyGrid(month, gridData) {
  if (!SB.init()) return;
  await sbFetch('monthly_grids', 'POST', {
    month: month, grid_data: gridData
  }, '?on_conflict=month');
}

// ── MASTERY TRACKER SYNC FUNCTIONS ──

async function syncMasteryDaily(date, items, completed, pct, domainScores) {
  if (!SB.init()) return;
  await sbFetch('mastery_daily', 'POST', {
    date: date, items: items, completed: completed,
    completion_pct: pct, domain_scores: domainScores
  }, '?on_conflict=date');
}

async function syncMasteryWeekly(weekDate, items, completed) {
  if (!SB.init()) return;
  await sbFetch('mastery_weekly', 'POST', {
    week_date: weekDate, items: items, completed: completed
  }, '?on_conflict=week_date');
}

async function syncMasteryMonthly(month, scorecard) {
  if (!SB.init()) return;
  await sbFetch('mastery_monthly_scores', 'POST', Object.assign({ month: month }, scorecard), '?on_conflict=month');
}

async function syncMasteryIdea(idea) {
  if (!SB.init()) return;
  await sbFetch('mastery_ideas', 'POST', {
    id: idea.id, created_date: idea.created_date, title: idea.title,
    domain: idea.domain, category: idea.category, content: idea.content,
    tags: idea.tags || [], status: idea.status
  }, '?on_conflict=id');
}

// ── BRAHMACHARYA FORTRESS SYNC FUNCTIONS ──

async function syncBrahmaDaily(date, items, isClean, urgeLevel) {
  if (!SB.init()) return;
  await sbFetch('brahma_daily', 'POST', {
    date: date, items: items, is_clean: isClean, urge_level: urgeLevel
  }, '?on_conflict=date');
}

async function syncBrahmaWeekly(weekDate, items) {
  if (!SB.init()) return;
  await sbFetch('brahma_weekly', 'POST', {
    week_date: weekDate, items: items, clean_days: 0
  }, '?on_conflict=week_date');
}

// ── FULL PULL FROM SUPABASE (manual — pulls everything) ──

async function pullFromSupabase() {
  if (!SB.init()) return { synced: false };
  const results = {};
  const _d90 = new Date(Date.now() - 90 * 86400000);
  const ninetyDaysAgo = (_d90.getFullYear()+'-'+String(_d90.getMonth()+1).padStart(2,'0')+'-'+String(_d90.getDate()).padStart(2,'0'));

  // Pull rituals (last 90 days)
  const rituals = await sbFetch('daily_rituals', 'GET', null, '?date=gte.' + ninetyDaysAgo + '&order=date.desc');
  if (rituals) {
    rituals.forEach(r => {
      const key = 'fl_rituals_' + r.period + '_' + r.date;
      const local = localStorage.getItem(key);
      const remote = r.done_indices || [];
      // Merge: keep whichever has more completions
      if (!local || JSON.parse(local).length < remote.length) {
        localStorage.setItem(key, JSON.stringify(remote));
      }
    });
    results.rituals = rituals.length;
  }

  // Pull journal entries (last 90 days)
  const journal = await sbFetch('journal_entries', 'GET', null, '?date=gte.' + ninetyDaysAgo + '&order=date.desc');
  if (journal) {
    const all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
    journal.forEach(j => {
      if (!all[j.date]) {
        var entryObj = null;
        if (j.entry) { try { entryObj = typeof j.entry === 'string' ? JSON.parse(j.entry) : j.entry; } catch(e) {} }
        if (!entryObj || typeof entryObj !== 'object') {
          entryObj = { aligned: j.aligned, notAligned: j.not_aligned || j.notAligned || '', wins: j.wins, changes: j.changes, improve: j.improve, mood: j.mood, energy: j.energy, thoughts: j.thoughts };
        }
        all[j.date] = entryObj;
      }
    });
    localStorage.setItem('fl_journal', JSON.stringify(all));
    results.journal = journal.length;
  }

  // Pull races (all)
  const races = await sbFetch('races', 'GET', null, '?order=date.desc');
  if (races && races.length) {
    const local = getRaces();
    races.forEach(r => {
      if (!local.find(l => l.id === r.id)) {
        local.push({
          id: r.id, name: r.name, shortName: r.short_name, date: r.date,
          location: r.location, country: r.country, type: r.type, distance: r.distance,
          status: r.status, bib: r.bib, bibPhoto: r.bib_photo, finishTime: r.finish_time,
          finishTimeSec: r.finish_time_sec, gunTime: r.gun_time, pace: r.pace,
          targetTime: r.target_time, position: r.position, splits: r.splits,
          conditions: r.conditions, heartRate: r.heart_rate, calories: r.calories,
          photos: r.photos, videos: r.videos, stravaUrl: r.strava_url,
          officialResultsUrl: r.official_results_url, notes: r.notes,
          highlight: r.highlight, tags: r.tags
        });
      }
    });
    localStorage.setItem('fl_races', JSON.stringify(local));
    results.races = races.length;
  }

  // Pull weekly schedules (last 8 weeks)
  const _d56 = new Date(Date.now() - 56 * 86400000);
  const eightWeeksAgo = (_d56.getFullYear()+'-'+String(_d56.getMonth()+1).padStart(2,'0')+'-'+String(_d56.getDate()).padStart(2,'0'));
  const weekly = await sbFetch('weekly_schedule', 'GET', null, '?week_start=gte.' + eightWeeksAgo);
  if (weekly) {
    weekly.forEach(w => {
      const key = 'fl_weekly_' + w.week_start;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(w.data));
    });
    results.weekly = weekly.length;
  }

  // Pull engagement (last 30 days)
  const _d30b = new Date(Date.now() - 30 * 86400000);
  const thirtyDaysAgo = (_d30b.getFullYear()+'-'+String(_d30b.getMonth()+1).padStart(2,'0')+'-'+String(_d30b.getDate()).padStart(2,'0'));
  const eng = await sbFetch('engagement_counters', 'GET', null, '?date=gte.' + thirtyDaysAgo);
  if (eng) {
    eng.forEach(e => {
      if (e.comments) localStorage.setItem('fl_eng_commentCount_' + e.date, e.comments);
      if (e.stories) localStorage.setItem('fl_eng_storyCount_' + e.date, e.stories);
      if (e.dms) localStorage.setItem('fl_eng_dmCount_' + e.date, e.dms);
    });
    results.engagement = eng.length;
  }

  // Pull stories (last 30 days)
  const stories = await sbFetch('stories_completions', 'GET', null, '?date=gte.' + thirtyDaysAgo);
  if (stories) {
    stories.forEach(s => {
      const key = 'fl_stories_' + s.date;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s.done_indices));
    });
    results.stories = stories.length;
  }

  // Pull daily logs (last 90 days)
  const logs = await sbFetch('daily_logs', 'GET', null, '?date=gte.' + ninetyDaysAgo + '&order=date.desc');
  if (logs) {
    const proofData = getProofData();
    logs.forEach(l => {
      if (!proofData.find(p => p.date === l.date)) {
        proofData.push({
          date: l.date, wakeTime: l.wake_time, sleepHrs: l.sleep_hrs,
          runKm: l.run_km, runStart: l.run_start, runPace: l.run_pace,
          gym: l.gym, muscle: l.muscle, foodClean: l.food_clean,
          violation: l.violation, brahma: l.brahma, japa: l.japa,
          nasya: l.nasya, breach: l.breach, mood: l.mood, notes: l.notes
        });
      }
    });
    proofData.sort((a, b) => new Date(b.date) - new Date(a.date));
    localStorage.setItem('fl_proof_data', JSON.stringify(proofData));
    results.logs = logs.length;
  }

  // Pull mastery daily (last 90 days)
  const masteryDays = await sbFetch('mastery_daily', 'GET', null, '?date=gte.' + ninetyDaysAgo + '&order=date.desc');
  if (masteryDays) {
    masteryDays.forEach(m => {
      const key = 'fl_mastery_daily_' + m.date;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(m.items || {}));
    });
    results.mastery_daily = masteryDays.length;
  }

  // Pull mastery weekly (last 12 weeks)
  const _d84 = new Date(Date.now() - 84 * 86400000);
  const twelveWeeksAgo = (_d84.getFullYear()+'-'+String(_d84.getMonth()+1).padStart(2,'0')+'-'+String(_d84.getDate()).padStart(2,'0'));
  const masteryWeeks = await sbFetch('mastery_weekly', 'GET', null, '?week_date=gte.' + twelveWeeksAgo);
  if (masteryWeeks) {
    masteryWeeks.forEach(w => {
      const key = 'fl_mastery_weekly_' + w.week_date;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(w.items || {}));
    });
    results.mastery_weekly = masteryWeeks.length;
  }

  // Pull mastery ideas (all)
  const masteryIdeas = await sbFetch('mastery_ideas', 'GET', null, '?order=created_date.desc');
  if (masteryIdeas && masteryIdeas.length) {
    const localIdeas = JSON.parse(localStorage.getItem('fl_mastery_ideas') || '[]');
    masteryIdeas.forEach(i => {
      if (!localIdeas.find(l => l.id === i.id)) {
        localIdeas.push({
          id: i.id, created_date: i.created_date, title: i.title,
          domain: i.domain, category: i.category, content: i.content,
          tags: i.tags, status: i.status
        });
      }
    });
    localStorage.setItem('fl_mastery_ideas', JSON.stringify(localIdeas));
    results.mastery_ideas = masteryIdeas.length;
  }

  // Pull brahma daily (last 90 days)
  const brahmaDays = await sbFetch('brahma_daily', 'GET', null, '?date=gte.' + ninetyDaysAgo + '&order=date.desc');
  if (brahmaDays) {
    brahmaDays.forEach(b => {
      const key = 'fl_brahma_daily_' + b.date;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(b.items || {}));
    });
    results.brahma_daily = brahmaDays.length;
  }

  // Pull brahma weekly (last 12 weeks)
  const brahmaWeeks = await sbFetch('brahma_weekly', 'GET', null, '?week_date=gte.' + twelveWeeksAgo);
  if (brahmaWeeks) {
    brahmaWeeks.forEach(w => {
      const key = 'fl_brahma_weekly_' + w.week_date;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(w.items || {}));
    });
    results.brahma_weekly = brahmaWeeks.length;
  }

  // Pull checkin data (last 90 days)
  const checkins = await sbFetch('daily_checkin', 'GET', null, '?date=gte.' + ninetyDaysAgo + '&order=date.desc');
  if (checkins) {
    checkins.forEach(c => {
      const key = 'fl_checkin_' + c.date;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(c));
    });
    results.checkins = checkins.length;
  }

  // Pull slips (all — immutable, never change)
  const slips = await sbFetch('slips', 'GET', null, '?order=date.desc');
  if (slips && slips.length) {
    localStorage.setItem('fl_slips', JSON.stringify(slips));
    results.slips = slips.length;
  }

  // Pull architecture log (all)
  const archLog = await sbFetch('architecture_log', 'GET', null, '?order=date.desc');
  if (archLog && archLog.length) {
    localStorage.setItem('fl_arch_log', JSON.stringify(archLog));
    results.arch_log = archLog.length;
  }

  SB.lastSync = Date.now();
  updateSyncStatus();
  results.synced = true;
  return results;
}

// ── PUSH ALL LOCAL DATA TO SUPABASE (full sync) ──

async function pushAllToSupabase() {
  if (!SB.init()) return { pushed: false, error: 'Supabase not configured' };
  let count = 0;

  // Push all ritual data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('fl_rituals_morning_') || key.startsWith('fl_rituals_midday_') || key.startsWith('fl_rituals_evening_')) {
      const parts = key.split('_');
      const period = parts[2];
      const date = parts[3];
      const done = JSON.parse(localStorage.getItem(key) || '[]');
      await syncRituals(date, period, done, period === 'morning' ? 42 : 41);
      count++;
    }
  }

  // Push journal
  const journal = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  for (const [date, entry] of Object.entries(journal)) {
    await syncJournal(date, entry);
    count++;
  }

  // Push races
  const races = getRaces();
  for (const race of races) {
    await syncRace(race);
    count++;
  }

  // Push proof/daily logs
  const proof = getProofData();
  for (const entry of proof) {
    await syncDailyLog(entry);
    count++;
  }

  // Push mastery daily data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fl_mastery_daily_')) {
      const mDate = key.replace('fl_mastery_daily_', '');
      const mItems = JSON.parse(localStorage.getItem(key) || '{}');
      let mCompleted = 0;
      const mDomainScores = {};
      ['A','B','C','D','E'].forEach(d => { mDomainScores[d] = 0; });
      for (let j = 1; j <= 25; j++) {
        if (mItems[j] && mItems[j].done) { mCompleted++; }
      }
      await syncMasteryDaily(mDate, mItems, mCompleted, Math.round(mCompleted / 25 * 100), mDomainScores);
      count++;
    }
  }

  // Push mastery ideas
  const mIdeas = JSON.parse(localStorage.getItem('fl_mastery_ideas') || '[]');
  for (const idea of mIdeas) { await syncMasteryIdea(idea); count++; }

  // Push brahma daily data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fl_brahma_daily_')) {
      const bDate = key.replace('fl_brahma_daily_', '');
      const bItems = JSON.parse(localStorage.getItem(key) || '{}');
      const bClean = !(bItems.porn === true || bItems.sexual === true || bItems.masturbate === true);
      await syncBrahmaDaily(bDate, bItems, bClean, bItems.urge || 0);
      count++;
    }
  }

  // Push brahma weekly data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fl_brahma_weekly_')) {
      const bwDate = key.replace('fl_brahma_weekly_', '');
      await syncBrahmaWeekly(bwDate, JSON.parse(localStorage.getItem(key) || '{}'));
      count++;
    }
  }

  // Push checkin data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fl_checkin_')) {
      const cDate = key.replace('fl_checkin_', '');
      const cData = JSON.parse(localStorage.getItem(key) || '{}');
      if (typeof syncCheckin === 'function') { await syncCheckin(cDate, cData); count++; }
    }
  }

  // Push slips
  const slips = JSON.parse(localStorage.getItem('fl_slips') || '[]');
  for (const slip of slips) {
    if (typeof syncSlip === 'function') { await syncSlip(slip); count++; }
  }

  // Push architecture log
  const archLog = JSON.parse(localStorage.getItem('fl_arch_log') || '[]');
  for (const entry of archLog) {
    if (typeof syncArchEntry === 'function') { await syncArchEntry(entry); count++; }
  }

  // Push reading log
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fl_daily_rule_read_')) {
      const rDate = key.replace('fl_daily_rule_read_', '');
      // Daily rules no longer sync to Supabase — localStorage only
      count++;
    }
  }

  // Push midday ritual data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fl_rituals_midday_')) {
      const parts = key.split('_');
      const date = key.replace('fl_rituals_midday_', '');
      const done = JSON.parse(localStorage.getItem(key) || '[]');
      await syncRituals(date, 'midday', done, 15);
      count++;
    }
  }

  return { pushed: true, count: count };
}

// ── SUPABASE STATUS CHECK ──
async function checkSupabaseConnection() {
  if (!SB.init()) return { connected: false, reason: 'Not configured' };
  try {
    const res = await fetch(SB.url + '/rest/v1/config?select=key&limit=1', {
      headers: { 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.key }
    });
    return { connected: res.ok, status: res.status };
  } catch (e) {
    return { connected: false, reason: e.message };
  }
}

// ── UPDATE LOGIN BUTTON STATE ──
function updateLoginButton() {
  const btn = document.getElementById('navLogin');
  const btnMobile = document.getElementById('navLoginMobile');
  if (isLoggedIn()) {
    [btn, btnMobile].forEach(b => {
      if (!b) return;
      b.textContent = 'COMMAND CENTER';
      b.href = 'admin.html';
      b.classList.add('authed');
    });
  }
}

// ══════════════════════════════════════════════════════
// COMMUNITY COMMENT SYSTEM
// ══════════════════════════════════════════════════════

const CM_PAGE_SIZE = 20;
const CM_MILESTONES = [7, 30, 50, 100, 200, 365, 500, 1000];
const CM_REACTION_EMOJI = {
  fire: '\uD83D\uDD25', clap: '\uD83D\uDC4F', strong: '\uD83D\uDCAA', crown: '\uD83D\uDC51',
  heart: '\u2764\uFE0F', hundred: '\uD83D\uDCAF', rocket: '\uD83D\uDE80', salute: '\uD83E\uDEE1'
};
let cmOffset = 0;
let cmReplyTo = null;
let cmPendingComment = null;
let cmPendingImage = null; // base64 data URL for image attachment

// ── Supabase INSERT helper (returns inserted row) ──
async function cmInsert(table, data) {
  if (!SB.init()) return null;
  try {
    const res = await fetch(SB.url + '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'apikey': SB.key, 'Authorization': 'Bearer ' + SB._getToken(), 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows && rows.length ? rows[0] : true;
  } catch (e) { return null; }
}

async function cmDelete(table, query) {
  if (!SB.init()) return false;
  try {
    const res = await fetch(SB.url + '/rest/v1/' + table + query, {
      method: 'DELETE',
      headers: { 'apikey': SB.key, 'Authorization': 'Bearer ' + SB._getToken() }
    });
    return res.ok;
  } catch (e) { return false; }
}

// ── Identity ──
function getVisitorIdentity() {
  try { return JSON.parse(localStorage.getItem('fl_visitor_identity')); } catch(e) { return null; }
}

function showIdentityModal() {
  var identity = getVisitorIdentity();
  if (identity) {
    document.getElementById('cmName').value = identity.display_name || '';
    document.getElementById('cmMobile').value = identity.mobile || '';
    document.getElementById('cmUPI').value = identity.upi_id || '';
  }
  document.getElementById('cmModal').style.display = 'flex';
  document.getElementById('cmName').focus();
}

function closeIdentityModal() {
  document.getElementById('cmModal').style.display = 'none';
  cmPendingComment = null;
}

function postAnonymous() {
  var anonId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  var identity = { visitor_id: anonId, display_name: 'Anonymous' };
  localStorage.setItem('fl_visitor_identity', JSON.stringify(identity));
  document.getElementById('cmModal').style.display = 'none';
  if (cmPendingComment) { _doPostComment(cmPendingComment); cmPendingComment = null; }
}

function saveIdentity() {
  var name = (document.getElementById('cmName').value || '').trim();
  if (name.length < 2) { alert('Display name must be at least 2 characters'); return; }
  var existing = getVisitorIdentity();
  var identity = {
    visitor_id: (existing && existing.visitor_id) || crypto.randomUUID(),
    display_name: name,
    mobile: document.getElementById('cmMobile').value.trim(),
    upi_id: document.getElementById('cmUPI').value.trim()
  };
  localStorage.setItem('fl_visitor_identity', JSON.stringify(identity));
  cmInsert('visitor_identities', identity); // fire-and-forget, INSERT-only RLS
  document.getElementById('cmModal').style.display = 'none';
  var editLink = document.getElementById('cmEditProfile');
  if (editLink) editLink.style.display = 'inline';
  // If there was a pending comment, post it now
  if (cmPendingComment) { _doPostComment(cmPendingComment); cmPendingComment = null; }
}

// ── Avatar color from name ──
function cmAvatarColor(name) {
  var hash = 0;
  for (var i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return 'hsl(' + (Math.abs(hash) % 360) + ',55%,45%)';
}

// ── Time ago ──
function cmTimeAgo(dateStr) {
  var diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return Math.floor(diff / 604800) + 'w ago';
}

// ── Page source for comments (set per page, defaults to 'index') ──
var CM_PAGE_SOURCE = 'index';
function setCommentPageSource(src) { CM_PAGE_SOURCE = src; }

// ── Load comments ──
async function loadComments() {
  if (!SB.init()) return;
  var pageFilter = CM_PAGE_SOURCE ? '&page_source=eq.' + CM_PAGE_SOURCE : '';
  var comments = await sbFetch('comments', 'GET', null, '?order=created_at.desc&limit=' + CM_PAGE_SIZE + '&offset=' + cmOffset + pageFilter);
  var reactions = await sbFetch('comment_reactions', 'GET', null, '?select=comment_id,reaction,visitor_id');
  if (!comments) { document.getElementById('cmCommentList').innerHTML = '<div style="text-align:center;color:var(--text-dim);font-family:var(--font-mono);font-size:12px;padding:24px">No comments yet. Be the first to join the watch.</div>'; return; }

  // Count reactions per comment
  var rCounts = {}; // { comment_id: { fire: 3, clap: 1 } }
  var myIdentity = getVisitorIdentity();
  var myReactions = {}; // { comment_id: 'fire' }
  (reactions || []).forEach(function(r) {
    if (!rCounts[r.comment_id]) rCounts[r.comment_id] = {};
    if (!rCounts[r.comment_id][r.reaction]) rCounts[r.comment_id][r.reaction] = 0;
    rCounts[r.comment_id][r.reaction]++;
    if (myIdentity && r.visitor_id === myIdentity.visitor_id) myReactions[r.comment_id] = r.reaction;
  });
  localStorage.setItem('fl_reactions_given', JSON.stringify(myReactions));

  // Separate milestones, top-level, replies
  var milestones = comments.filter(function(c) { return c.is_milestone; });
  var topLevel = comments.filter(function(c) { return !c.parent_id && !c.is_milestone; });
  var replies = comments.filter(function(c) { return c.parent_id; });
  var replyMap = {};
  replies.forEach(function(r) { if (!replyMap[r.parent_id]) replyMap[r.parent_id] = []; replyMap[r.parent_id].push(r); });

  // Render milestones
  var mHtml = '';
  milestones.forEach(function(m) {
    mHtml += renderComment(m, rCounts[m.id] || {}, myReactions[m.id], true);
  });
  document.getElementById('cmMilestone').innerHTML = mHtml;

  // Render comments + replies
  var html = '';
  if (!topLevel.length && !milestones.length) {
    html = '<div style="text-align:center;color:var(--text-dim);font-family:var(--font-mono);font-size:12px;padding:24px">No comments yet. Be the first to join the watch.</div>';
  }
  topLevel.forEach(function(c) {
    html += renderComment(c, rCounts[c.id] || {}, myReactions[c.id], false);
    var cReplies = replyMap[c.id] || [];
    cReplies.sort(function(a,b) { return new Date(a.created_at) - new Date(b.created_at); });
    cReplies.forEach(function(r) {
      html += '<div class="cm-reply">' + renderComment(r, rCounts[r.id] || {}, myReactions[r.id], false, true) + '</div>';
    });
  });
  document.getElementById('cmCommentList').innerHTML = html;

  // Badge
  var total = comments.length;
  document.getElementById('cmBadge').textContent = total;

  // Load more
  document.getElementById('cmLoadMore').style.display = comments.length >= CM_PAGE_SIZE ? 'block' : 'none';
}

// Sanitize string for safe HTML insertion
function cmEscape(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderComment(c, counts, myReaction, isMilestone, isReply) {
  var safeName = cmEscape(c.display_name || 'Anonymous');
  var avatarBg = c.visitor_id === 'system' ? 'var(--cyan)' : cmAvatarColor(safeName);
  var initial = safeName[0].toUpperCase();
  var cls = 'cm-comment' + (isMilestone ? ' cm-milestone' : '');
  var html = '<div class="' + cls + '" data-cid="' + parseInt(c.id) + '">';
  html += '<div class="cm-header">';
  html += '<div class="cm-avatar" style="background:' + avatarBg + '">' + (isMilestone ? '\uD83C\uDFC6' : initial) + '</div>';
  html += '<div><span class="cm-name">' + safeName + '</span><span class="cm-time">' + cmTimeAgo(c.created_at) + '</span></div>';
  html += '</div>';

  // Comment text — fully escaped, then only https:// URLs made clickable (no javascript:)
  var safeContent = cmEscape(c.content || '');
  safeContent = safeContent.replace(/(https:\/\/[^\s&]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--cyan);word-break:break-all">$1</a>');
  html += '<div class="cm-body">' + safeContent + '</div>';

  // Image attachment — only allow https:// and data:image/ URLs
  if (c.image_url && (/^https:\/\//.test(c.image_url) || /^data:image\//.test(c.image_url))) {
    html += '<div class="cm-image" style="margin-bottom:12px"><img src="' + cmEscape(c.image_url) + '" alt="Comment image" loading="lazy" style="max-width:100%;max-height:400px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);cursor:pointer" onclick="window.open(this.src)"></div>';
  }

  // Reactions — all 8
  html += '<div class="cm-actions">';
  Object.keys(CM_REACTION_EMOJI).forEach(function(r) {
    var count = (counts && counts[r]) || 0;
    var active = myReaction === r ? ' active' : '';
    html += '<span class="cm-reaction' + active + '" onclick="reactToComment(' + c.id + ',\'' + r + '\')">' + CM_REACTION_EMOJI[r] + ' <span>' + (count || '') + '</span></span>';
  });
  if (!isReply && !isMilestone) {
    html += '<span class="cm-reply-btn" onclick="showReplyInput(' + c.id + ')">REPLY</span>';
  }
  html += '</div>';
  html += '<div id="cmReplySlot' + c.id + '"></div>';
  html += '</div>';
  return html;
}

async function loadMoreComments() {
  cmOffset += CM_PAGE_SIZE;
  await loadComments();
}

// ── Post comment ──
function postComment() {
  var identity = getVisitorIdentity();
  var input = document.getElementById('cmInput');
  var text = (input.value || '').trim();
  if (!text && !cmPendingImage) return;
  if (!identity) {
    // Allow anonymous posting — create a temporary anonymous identity
    var anonId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    identity = { visitor_id: anonId, display_name: 'Anonymous' };
    localStorage.setItem('fl_visitor_identity', JSON.stringify(identity));
  }
  _doPostComment(text || '');
}

// ── Attach image to comment ──
function cmAttachImage() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function() {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      cmPendingImage = e.target.result;
      var preview = document.getElementById('cmImagePreview');
      if (preview) {
        preview.innerHTML = '<div style="position:relative;display:inline-block;margin-top:8px"><img src="' + cmPendingImage + '" style="max-width:200px;max-height:150px;border-radius:8px;border:1px solid rgba(0,212,255,0.15)">' +
          '<button onclick="cmRemoveImage()" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:var(--red,#FF5252);color:#fff;border:none;cursor:pointer;font-size:12px;line-height:22px;text-align:center">X</button></div>';
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function cmRemoveImage() {
  cmPendingImage = null;
  var preview = document.getElementById('cmImagePreview');
  if (preview) preview.innerHTML = '';
}

async function _doPostComment(text) {
  // Rate limit: 30 seconds
  var lastTime = parseInt(localStorage.getItem('fl_last_comment_time') || '0');
  if (Date.now() - lastTime < 30000) { alert('Please wait ' + Math.ceil((30000 - (Date.now() - lastTime)) / 1000) + ' seconds before posting again.'); return; }
  var identity = getVisitorIdentity();
  var content = text.replace(/<[^>]*>/g, '').substring(0, 500);
  var btn = document.getElementById('cmPostBtn');
  btn.disabled = true; btn.textContent = 'POSTING...';
  var commentData = {
    visitor_id: identity.visitor_id,
    display_name: identity.display_name,
    content: content,
    parent_id: cmReplyTo,
    page_source: CM_PAGE_SOURCE || 'index'
  };
  // Attach image if present
  if (cmPendingImage) {
    commentData.image_url = cmPendingImage;
  }
  var result = await cmInsert('comments', commentData);
  btn.disabled = false; btn.textContent = 'POST';
  if (result) {
    localStorage.setItem('fl_last_comment_time', Date.now().toString());
    document.getElementById('cmInput').value = '';
    cmPendingImage = null;
    var preview = document.getElementById('cmImagePreview');
    if (preview) preview.innerHTML = '';
    cmReplyTo = null;
    var replySlots = document.querySelectorAll('[id^="cmReplySlot"]');
    replySlots.forEach(function(s) { s.innerHTML = ''; });
    cmOffset = 0;
    await loadComments();
  } else {
    alert('Failed to post comment. Please try again.');
  }
}

// ── Reactions ──
async function reactToComment(commentId, reaction) {
  var identity = getVisitorIdentity();
  if (!identity) { showIdentityModal(); return; }
  var given = JSON.parse(localStorage.getItem('fl_reactions_given') || '{}');
  if (given[commentId] === reaction) {
    // Un-react
    await cmDelete('comment_reactions', '?comment_id=eq.' + commentId + '&visitor_id=eq.' + identity.visitor_id);
    delete given[commentId];
  } else {
    // Remove old if exists
    if (given[commentId]) await cmDelete('comment_reactions', '?comment_id=eq.' + commentId + '&visitor_id=eq.' + identity.visitor_id);
    await cmInsert('comment_reactions', { comment_id: commentId, visitor_id: identity.visitor_id, reaction: reaction });
    given[commentId] = reaction;
  }
  localStorage.setItem('fl_reactions_given', JSON.stringify(given));
  await loadComments(); // Refresh counts
}

// ── Replies ──
function showReplyInput(commentId) {
  // Remove any existing reply input
  document.querySelectorAll('.cm-reply-input').forEach(function(el) { el.remove(); });
  cmReplyTo = commentId;
  var slot = document.getElementById('cmReplySlot' + commentId);
  if (slot) {
    slot.innerHTML = '<div class="cm-reply-input"><textarea rows="2" placeholder="Reply..." maxlength="500" id="cmReplyText"></textarea><button onclick="cmAttachImage()">📷</button><button onclick="postReply()">REPLY</button><button onclick="cancelReply()" style="background:transparent;color:var(--text-dim);border:1px solid var(--surface-border)">X</button></div>';
    document.getElementById('cmReplyText').focus();
  }
}

function cancelReply() {
  cmReplyTo = null;
  document.querySelectorAll('.cm-reply-input').forEach(function(el) { el.remove(); });
}

function postReply() {
  var identity = getVisitorIdentity();
  var text = (document.getElementById('cmReplyText').value || '').trim();
  if ((!text && !cmPendingImage) || !cmReplyTo) return;
  if (!identity) {
    // Auto-create anonymous identity for replies too
    var anonId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    identity = { visitor_id: anonId, display_name: 'Anonymous' };
    localStorage.setItem('fl_visitor_identity', JSON.stringify(identity));
  }
  _doPostComment(text || '');
}

// ── Milestone auto-pin ──
async function checkMilestone() {
  if (!SB.init()) return;
  var day = getDayNumber();
  if (CM_MILESTONES.indexOf(day) < 0) return;
  var existing = await sbFetch('comments', 'GET', null, '?is_milestone=eq.true&milestone_day=eq.' + day);
  if (existing && existing.length > 0) return;
  var msgs = {
    7: 'THE FIRST WEEK. 7 days. Zero misses.',
    30: 'ONE MONTH. 30 mornings before dawn.',
    50: 'HALF CENTURY. 50 days of proof.',
    100: 'TRIPLE DIGITS. 100 days of relentless discipline.',
    200: 'TWO HUNDRED. Still here. Still running.',
    365: 'ONE YEAR. 365 days. Not a single miss.',
    500: 'FIVE HUNDRED. Nobody has claimed a single rupee.',
    1000: 'ONE THOUSAND DAYS. LEGENDARY.'
  };
  var content = '\uD83C\uDFC6 DAY ' + day + ' — ' + (msgs[day] || 'MILESTONE.') + ' ' + getUnclaimed(day).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) + ' unclaimed.';
  await cmInsert('comments', {
    visitor_id: 'system', display_name: 'FIRST LIGHT',
    content: content, is_milestone: true, milestone_day: day
  });
}

// ── AUTO-ARCHIVAL: localStorage Cleanup ──
// Purges date-keyed entries older than 90 days (data lives in Supabase + GCS)
function cleanupOldLocalStorage() {
  const RETENTION_DAYS = 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = (cutoff.getFullYear()+'-'+String(cutoff.getMonth()+1).padStart(2,'0')+'-'+String(cutoff.getDate()).padStart(2,'0'));

  const patterns = [
    'fl_rituals_morning_', 'fl_rituals_midday_', 'fl_rituals_evening_',
    'fl_mastery_daily_', 'fl_mastery_weekly_',
    'fl_brahma_daily_', 'fl_brahma_weekly_',
    'fl_stories_', 'fl_weekly_',
    'fl_eng_commentCount_', 'fl_eng_storyCount_', 'fl_eng_dmCount_',
    'fl_seal_dismissed_'
  ];

  let cleaned = 0;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    for (const pattern of patterns) {
      if (key.startsWith(pattern)) {
        const dateStr = key.replace(pattern, '');
        if (dateStr < cutoffStr) { localStorage.removeItem(key); cleaned++; }
        break;
      }
    }
  }

  // Clean old proof entries (array with date field)
  try {
    const proof = JSON.parse(localStorage.getItem('fl_proof_data') || '[]');
    const filtered = proof.filter(p => p.date >= cutoffStr);
    if (filtered.length < proof.length) {
      localStorage.setItem('fl_proof_data', JSON.stringify(filtered));
      cleaned += proof.length - filtered.length;
    }
  } catch (e) {}

  // Clean old journal entries (object keyed by date)
  try {
    const journal = JSON.parse(localStorage.getItem('fl_journal') || '{}');
    let journalCleaned = false;
    Object.keys(journal).forEach(date => {
      if (date < cutoffStr) { delete journal[date]; journalCleaned = true; cleaned++; }
    });
    if (journalCleaned) localStorage.setItem('fl_journal', JSON.stringify(journal));
  } catch (e) {}

  if (cleaned > 0) console.log('[FirstLight] Archived: cleaned ' + cleaned + ' old localStorage entries (>' + RETENTION_DAYS + ' days)');
  return cleaned;
}

// ── ARCHIVE STATUS: Check GCS archive log ──
async function checkArchiveStatus() {
  if (!SB.init()) return [];
  const data = await sbFetch('archive_log', 'GET', null, '?order=created_at.desc&limit=5');
  return data || [];
}

// ── ARCHIVE: Trigger manual archive ──
async function triggerManualArchive() {
  if (!SB.init()) { alert('Supabase not configured'); return; }
  try {
    const res = await fetch(SB.url + '/functions/v1/archive-to-gcs', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SB.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual', date: getEffectiveToday() })
    });
    const result = await res.json();
    return result;
  } catch (e) { return { success: false, error: e.message }; }
}

// ── INIT ──
function _runInit() {
  try { initTheme(); } catch(e) { console.error('initTheme:', e); }
  try { applyConfig(); } catch(e) { console.error('applyConfig:', e); }
  try { updateCounters(); } catch(e) { console.error('updateCounters:', e); }
  try { initNav(); } catch(e) { console.error('initNav:', e); }
  try { initReveal(); } catch(e) { console.error('initReveal:', e); }
  try { initSmoothScroll(); } catch(e) { console.error('initSmoothScroll:', e); }
  try { updateLoginButton(); } catch(e) { console.error('updateLoginButton:', e); }

  // Initialize Supabase sync
  SB.init();
  SB.online = navigator.onLine;
  updateSyncStatus();

  // Auto-pull today's data from Supabase (background, non-blocking)
  if (SB.ready && SB.online) {
    setTimeout(function() {
      autoPullOnLoad().then(function() {
        flushSyncQueue();
        cleanupOldLocalStorage();
      });
    }, 500);
  }

  // Track visitor (non-blocking, public pages only)
  trackVisitor();
  // Update visitor counter display
  setTimeout(updateVisitorCounter, 1000);
}

// Run immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _runInit);
} else {
  _runInit();
}

// ═══════════════════════════════════════════
// VISITOR TRACKING
// ═══════════════════════════════════════════
function trackVisitor() {
  // Don't track admin page
  var page = window.location.pathname.split('/').pop() || 'index.html';
  if (page === 'admin.html' || page === 'login.html') return;

  // Generate or get visitor ID (anonymous, no personal data)
  var vid = localStorage.getItem('fl_visitor_id');
  if (!vid) {
    vid = 'v_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('fl_visitor_id', vid);
  }

  // Don't double-count same page in same session
  var sessionKey = 'fl_visited_' + page + '_' + getEffectiveToday();
  if (sessionStorage.getItem(sessionKey)) return;
  sessionStorage.setItem(sessionKey, '1');

  // Record visit
  if (SB.init()) {
    var today = getEffectiveToday();
    sbFetch('site_visits', 'POST', { date: today, page: page.replace('.html', ''), visitor_id: vid });

    // Update daily stats (upsert)
    sbFetch('site_stats', 'POST', { date: today, total_visits: 1, unique_visitors: 1 }, '?on_conflict=date');
  }
}

// Get total visitor count (for public display)
async function getTotalVisitors() {
  if (!SB.init()) return 0;
  try {
    var stats = await sbFetch('site_stats', 'GET', null, '?select=total_visits&order=date.desc');
    if (stats && Array.isArray(stats)) {
      return stats.reduce(function(sum, s) { return sum + (s.total_visits || 0); }, 0);
    }
  } catch(e) {}
  return 0;
}

// Update visitor counter on page
async function updateVisitorCounter() {
  var el = document.getElementById('visitorCount');
  if (!el) return;
  var total = await getTotalVisitors();
  if (total > 0) el.textContent = total.toLocaleString('en-IN');
}
