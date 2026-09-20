// ═══════════════════════════════════════════
// FIRST LIGHT — RECOVERY (private 60-day system)
// Day counter · laps · debt ledger · milestones
// Storage: localStorage ONLY (private data never leaves the device).
// ═══════════════════════════════════════════

(function () {
  'use strict';

  var LS_KEY = 'fl_recovery_v1';
  var DAY1 = '2026-09-22'; // Must equal FL_DEFAULTS.STREAK_START · FL_CURRENT_CHAPTER.dayEpoch · DAY_EPOCH

  var PENALTY = {
    baseCycleKm: 100,        // BASE penalty — any device crossing the door
    extraHourDay: 50,        // cycle km per extra connected hour, daytime
    extraHourNight: 100,     // cycle km per extra connected hour, night
    nightStart: '21:30',
    usedKm: 200,             // device used inside the house
    nightKm: 300,            // device in bedroom / after 21:30
    lieKm: 400,              // faked exception / lying / guard off / WiFi re-enabled
    doubleKm: 500,           // never-miss-twice broken (2 slips in 7 days)
    dnsKm: 20,               // cycle km per 15-min blocked-site session
    doubleHours: 48          // unpaid debts double after this many hours
  };

  var MILESTONES = [
    { day: 1,   name: 'DAY ONE',        reward: 'The door closes. First check-in sent.' },
    { day: 2,   name: 'RACE PREP',      reward: 'Lightweight race shoes — bought before Saturday’s half marathon (equipment, allowed).' },
    { day: 7,   name: 'ONE WEEK',       reward: 'Signature dinner, no screens — ₹2,000' },
    { day: 14,  name: 'TWO WEEKS',      reward: 'A stack of physical books — ₹2,500' },
    { day: 30,  name: 'ONE MONTH',      reward: 'Leg compression machine — ~₹25,000. (No device returns at 30 — 90 days full, no loopholes.)' },
    { day: 45,  name: 'FORTY-FIVE',     reward: 'INSTA360 camera + a 4–5 day trip — SINGAPORE or DUBAI, your choice, filmed with the new camera — ~₹80,000 total, from savings' },
    { day: 60,  name: 'TWO MONTHS',     reward: 'Weekend trek + stay — ₹15,000 (humans + nature)' },
    { day: 75,  name: 'SEVENTY-FIVE',   reward: '15-day INDIA trip — ~₹50,000' },
    { day: 90,  name: 'NINETY DAYS',    reward: 'THE GUARD ITSELF — Raspberry Pi deployed to watch the permanently dry house + spa day — ₹15,000. The laptop never comes home — the machine is the only computer that ever lives here.' },
    { day: 120, name: 'ONE-TWENTY',     reward: 'Home gym setup — dumbbells, bench, resistance — ₹25,000 (your call; the ₹1.2L cycle you own is already the penance machine)' },
    { day: 180, name: 'HALF YEAR',      reward: '10-day INTERNATIONAL trip — a new country + ₹20,000 clothing shopping. Repeats every 180 clean days: next country each time.' }
  ];

  // ── state helpers ──────────────────────────────
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && s.laps && s.debts) return s;
    } catch (e) {}
    return { laps: [], debts: [], checkins: [], claimed: [] };
  }
  function save(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

  function localDate(offset) {
    var d = new Date();
    if (offset) d.setDate(d.getDate() + offset);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function dayNum() {
    var d1 = new Date(DAY1 + 'T00:00:00');
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var diff = Math.floor((now - d1) / 86400000) + 1;
    return diff > 0 ? diff : 0;
  }

  function lapDays(st) {
    var laps = st.laps.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    if (!laps.length) return dayNum();
    var last = new Date(laps[0].ts + 'T00:00:00');
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((now - last) / 86400000));
  }

  function lapsSince(st, sinceDay) {
    var since = new Date(DAY1 + 'T00:00:00');
    since.setDate(since.getDate() + (sinceDay - 1));
    var n = 0;
    st.laps.forEach(function (l) {
      if (new Date(l.ts + 'T00:00:00') >= since) n++;
    });
    return n;
  }

  function openDebtKm(st) {
    var total = 0;
    st.debts.forEach(function (d) {
      if (d.paid) return;
      total += debtKmNow(d);
    });
    return total;
  }

  function debtKmNow(d) {
    var km = d.km || 0;
    if (!d.paid && (Date.now() - new Date(d.opened).getTime()) > PENALTY.doubleHours * 3600000) km = km * 2;
    return km;
  }

  function fmtAge(iso) {
    var h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (h < 1) return 'just now';
    if (h < 48) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── render ─────────────────────────────────────
  function renderRecovery() {
    var root = document.getElementById('recoveryRoot');
    if (!root) return;
    var st = load();
    var d = dayNum();
    var lap = lapDays(st);
    var openKm = openDebtKm(st);

    var html = '';
    html += '<div style="padding:24px 0 8px">' +
      '<div class="cc-panel-title">⛓ RECOVERY — THE 60-DAY SYSTEM</div>' +
      '<div class="cc-panel-sub">Private. Local only. Honest logging is the whole game.</div></div>';

    // Guard status
    html += '<div style="font:500 10px var(--font-mono);color:var(--gold,#F5A623);letter-spacing:1px;margin-bottom:8px">' +
      '● GUARD STATUS: OFFLINE (Pi not deployed yet) — manual logging active. LAW FOR LIFE: the laptop never crosses the door, ever. No sessions at home. Only the 5 forced exceptions (illness · emergency · lockdown · festival · critical work), witnessed FIRST, daylight, table, logged, expires when the force ends. Interviews happen at the office or a coworking cabin.</div>';
    // Enforcement T-ZERO
    var tz = new Date('2026-09-22T06:00:00+05:30').getTime();
    var nowMs = Date.now();
    html += '<div style="font:600 10px var(--font-mono);color:' + (nowMs < tz ? 'var(--gold,#F5A623)' : 'var(--green,#00E676)') + ';letter-spacing:1px;margin-bottom:16px">' +
      (nowMs < tz
        ? '⏳ WIND-DOWN WINDOW — ' + Math.max(1, Math.ceil((tz - nowMs) / 60000)) + ' min left. Finish the laptop jobs. Move devices OUT. At 06:00 IST the rule is LIVE.'
        : '● ENFORCEMENT LIVE SINCE 06:00 IST TUE 22 SEP — no screens at home, WiFi OFF (permanent dead zone), bed = sleep only.') + '</div>';
    // Mission mode — interviews / declared work windows
    html += '<div style="font:500 10px var(--font-mono);color:var(--cyan,#00D4FF);letter-spacing:1px;margin-bottom:8px">● MISSION MODE (interviews): the laptop NEVER crosses the door. Interviews happen at the office, a coworking cabin, or a rented quiet room — declared to the witness with time + place. The streak survives, and the flat stays dry.</div>';
    // Travel protocol — reward trips and hotels
    html += '<div style="font:500 10px var(--font-mono);color:var(--cyan,#00D4FF);letter-spacing:1px;margin-bottom:16px">● TRAVEL PROTOCOL (reward trips, races, treks): declare dates + devices to the witness; hotel room = device at the desk, never in bed, bed = sleep only, nightly line continues from the trip. A declared trip is a reward, not a break.</div>';

    // Stat cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px">';
    html += statCard('DAY', d, 'since ' + DAY1);
    html += statCard('LAP', lap, lap === d ? 'first clean day' : 'days clean on this lap');
    html += statCard('LAPS', st.laps.length, 'total, honest, immutable');
    html += statCard('OPEN DEBT', openKm + ' km', 'cycle km — paid by cycle, walk, run or swim');
    html += '</div>';

    // Milestones
    html += sectionTitle('MILESTONES & REWARDS');
    html += '<div style="font:400 9px var(--font-mono);color:var(--text-dim,#6a6f78);margin-bottom:10px">TREAT BUDGET: ₹20,000/month — small rewards come from it, unspent rolls over. Trips from savings. Clean windows only. Witness pre-approves. Physical, offline, real-world only.</div>';
    var next = null;
    MILESTONES.forEach(function (m) {
      var unlocked = d >= m.day && lapsSince(st, m.day) === 0;
      if (!next && !unlocked) next = m;
    });
    if (next) {
      var prev = MILESTONES[MILESTONES.indexOf(next) - 1];
      var prevDay = prev ? prev.day : 0;
      var span = next.day - prevDay;
      var prog = Math.min(100, Math.round((d - prevDay) / span * 100));
      html += '<div style="margin-bottom:14px">' +
        '<div style="font:600 10px var(--font-mono);color:var(--text-muted,#8a8f98);letter-spacing:1px;margin-bottom:6px">' +
        'NEXT: ' + next.name + ' — DAY ' + next.day + ' · REWARD: ' + esc(next.reward) + '</div>' +
        '<div style="height:8px;background:var(--bg2,rgba(255,255,255,0.06));border-radius:4px;overflow:hidden">' +
        '<div style="height:100%;width:' + prog + '%;background:var(--cyan,#00D4FF)"></div></div>' +
        '<div style="font:500 8px var(--font-mono);color:var(--text-dim,#6a6f78);margin-top:4px">' + d + ' / ' + next.day + ' clean days</div></div>';
    } else {
      html += '<div style="font:600 10px var(--font-mono);color:var(--green,#00E676);margin-bottom:14px">ALL MILESTONES EARNED. THE MACHINE IS YOURS.</div>';
    }
    MILESTONES.forEach(function (m) {
      var unlocked = d >= m.day && lapsSince(st, m.day) === 0;
      html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;background:var(--bg2,rgba(255,255,255,0.03));border:1px solid ' +
        (unlocked ? 'rgba(0,230,118,0.35)' : 'rgba(255,255,255,0.06)') + ';border-radius:8px">' +
        '<span style="font:700 11px var(--font-mono);color:' + (unlocked ? 'var(--green,#00E676)' : 'var(--text-muted,#8a8f98)') + '">' +
        (unlocked ? '✓' : m.day) + '</span>' +
        '<div style="flex:1"><div style="font:600 10px var(--font-mono);color:var(--text,#e8eaf0)">' + m.name + '</div>' +
        '<div style="font:400 9px var(--font-mono);color:var(--text-dim,#6a6f78)">' + esc(m.reward) + '</div></div>' +
        '<span style="font:500 9px var(--font-mono);color:var(--text-dim,#6a6f78)">DAY ' + m.day + '</span></div>';
    });

    // Lap log
    html += sectionTitle('LAP LOG — HONEST SLIPS');
    html += '<div style="font:400 9px var(--font-mono);color:var(--text-dim,#6a6f78);margin-bottom:10px">A lap is data, not death. No oaths. Log it, pay it, back on the run the same day. Never miss twice. Laps are immutable — no delete.</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:10px">' +
      '<div><label class="rc-label">DATE</label><input type="date" id="rcLapDate" value="' + localDate() + '" class="rc-input"></div>' +
      '<div><label class="rc-label">MOOD</label><select id="rcLapMood" class="rc-input"><option>bored</option><option>lonely</option><option>stressed</option><option>tired</option><option>triggered</option><option>other</option></select></div>' +
      '<div><label class="rc-label">TRIGGER</label><input type="text" id="rcLapTrigger" placeholder="what happened 10 min before" class="rc-input"></div>' +
      '<div><label class="rc-label">DEVICE</label><select id="rcLapDevice" class="rc-input"><option>none</option><option>vnt_laptop</option><option>mac_laptop</option><option>iphone</option><option>phone2</option><option>tablet</option><option>other</option></select></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:14px">' +
      '<input type="text" id="rcLapNote" placeholder="3 lines max — time, mood, trigger. Data, not confession." class="rc-input" style="flex:1">' +
      '<button class="rc-btn rc-btn-danger" id="rcLapAdd">LOG LAP</button></div>';
    var lapsSorted = st.laps.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, 20);
    if (!lapsSorted.length) {
      html += '<div style="font:500 10px var(--font-mono);color:var(--green,#00E676);margin-bottom:14px">NO LAPS ON RECORD. DAY ' + d + ' · LAP ' + lap + '. KEEP IT THAT WAY.</div>';
    } else {
      lapsSorted.forEach(function (l) {
        html += '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;margin-bottom:6px;background:rgba(255,82,82,0.05);border:1px solid rgba(255,82,82,0.18);border-radius:8px">' +
          '<span style="font:700 10px var(--font-mono);color:var(--red,#FF5252);white-space:nowrap">' + esc(l.ts) + '</span>' +
          '<div style="flex:1"><span style="font:600 9px var(--font-mono);color:var(--text,#e8eaf0)">' + esc(l.mood || '?') + ' · ' + esc(l.device || '?') + '</span>' +
          '<div style="font:400 9px var(--font-mono);color:var(--text-dim,#6a6f78)">' + esc(l.trigger || '') + (l.note ? ' — ' + esc(l.note) : '') + '</div></div></div>';
      });
    }

    // Debt ledger
    html += sectionTitle('DEBT LEDGER — THE PENAL CODE');
    html += '<div style="font:400 9px var(--font-mono);color:var(--text-dim,#6a6f78);margin-bottom:10px">BASE: ' + PENALTY.baseCycleKm + ' km cycle (any connection) +' + PENALTY.extraHourDay + ' km per extra hour (day) / +' + PENALTY.extraHourNight + ' km (night) · USED ' + PENALTY.usedKm + ' · NIGHT ' + PENALTY.nightKm + ' · LIE/TAMPER ' + PENALTY.lieKm + ' · NEVER-MISS-TWICE ' + PENALTY.doubleKm + ' · DNS ' + PENALTY.dnsKm + ' · unpaid doubles at ' + PENALTY.doubleHours + 'h. Pay: 2 km cycle = 1 km walk/run · 1 km swim = 4.</div>';
    html += '<div style="font:400 9px var(--font-mono);color:var(--cyan,#00D4FF);background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.15);border-radius:8px;padding:8px 10px;margin-bottom:12px">QUALIFIED PENANCE: dedicated session labeled PENANCE · outdoors, GPS-logged · EXTRA (above the daily ritual workout) · within 48h · proof to witness (Strava/photo) · one session = one debt, no double-dip · indoor counts HALF · witness marks PAID.</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:10px">' +
      '<div><label class="rc-label">TYPE</label><select id="rcDebtType" class="rc-input"><option value="connection">connection (door)</option><option value="used">used in house</option><option value="night">bedroom / night</option><option value="lie">lie / tamper</option><option value="dns">blocked site (dns)</option><option value="double">never-miss-twice</option></select></div>' +
      '<div><label class="rc-label">DEVICE</label><select id="rcDebtDevice" class="rc-input"><option>vnt_laptop</option><option>mac_laptop</option><option>iphone</option><option>phone2</option><option>tablet</option><option>other</option></select></div>' +
      '<div><label class="rc-label">HOURS</label><input type="number" id="rcDebtHours" value="1" min="1" step="1" class="rc-input"></div>' +
      '<div><label class="rc-label">NIGHT?</label><select id="rcDebtNight" class="rc-input"><option value="0">no</option><option value="1">yes (after 21:30)</option></select></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:14px">' +
      '<div id="rcDebtPreview" style="flex:1;font:600 10px var(--font-mono);color:var(--cyan,#00D4FF)"></div>' +
      '<button class="rc-btn" id="rcDebtAdd">OPEN DEBT</button></div>';
    var debtsSorted = st.debts.slice().sort(function (a, b) { return a.opened < b.opened ? 1 : -1; });
    if (!debtsSorted.length) {
      html += '<div style="font:500 10px var(--font-mono);color:var(--text-dim,#6a6f78);margin-bottom:14px">NO DEBTS. CLEAN LEDGER.</div>';
    } else {
      debtsSorted.forEach(function (dd, i) {
        var km = debtKmNow(dd);
        var doubled = !dd.paid && km !== (dd.km || 0);
        html += '<div style="display:flex;gap:10px;align-items:center;padding:8px 10px;margin-bottom:6px;background:var(--bg2,rgba(255,255,255,0.03));border:1px solid ' +
          (dd.paid ? 'rgba(0,230,118,0.25)' : (doubled ? 'rgba(255,82,82,0.4)' : 'rgba(245,166,35,0.3)')) + ';border-radius:8px">' +
          '<div style="flex:1"><div style="font:700 10px var(--font-mono);color:' + (dd.paid ? 'var(--green,#00E676)' : 'var(--gold,#F5A623)') + '">' +
          esc(dd.device) + ' · ' + esc(dd.type) + ' · ' + (dd.hours || '—') + 'h → ' + km + ' KM' + (doubled ? ' (DOUBLED)' : '') + '</div>' +
          '<div style="font:400 8px var(--font-mono);color:var(--text-dim,#6a6f78)">' + fmtAge(dd.opened) + (dd.paid ? ' · PAID — ' + esc(dd.proof || 'proof accepted') : ' · OPEN') + '</div></div>' +
          (!dd.paid ? '<button class="rc-btn rc-btn-small" data-act="pay" data-i="' + i + '">PAY</button>' : '') +
          '<button class="rc-btn rc-btn-small" data-act="ignote" data-i="' + i + '">IG NOTE</button></div>';
      });
    }

    // Check-ins
    html += sectionTitle('NIGHTLY CHECK-IN — THE ONE LINE');
    html += '<div style="display:flex;gap:10px;margin-bottom:14px">' +
      '<button class="rc-btn rc-btn-green" id="rcCheckClean">TODAY: CLEAN — “Day ' + d + ', clean”</button>' +
      '<button class="rc-btn rc-btn-danger" id="rcCheckSlip">TODAY: SLIPPED — “back on it”</button></div>';
    var hist = st.checkins.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 14);
    if (hist.length) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
      hist.forEach(function (c) {
        html += '<span style="font:600 9px var(--font-mono);padding:4px 8px;border-radius:6px;color:' +
          (c.status === 'clean' ? 'var(--green,#00E676)' : 'var(--red,#FF5252)') + ';background:' +
          (c.status === 'clean' ? 'rgba(0,230,118,0.08)' : 'rgba(255,82,82,0.08)') + ';border:1px solid ' +
          (c.status === 'clean' ? 'rgba(0,230,118,0.25)' : 'rgba(255,82,82,0.25)') + '">' +
          esc(c.date.slice(5)) + ' ' + (c.status === 'clean' ? '✓' : '✗') + '</span>';
      });
      html += '</div>';
    }

    // Export / import
    html += sectionTitle('DATA');
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="rc-btn rc-btn-small" id="rcExport">EXPORT JSON</button>' +
      '<button class="rc-btn rc-btn-small" id="rcImport">IMPORT JSON</button>' +
      '<input type="file" id="rcImportFile" accept=".json" style="display:none"></div>';

    root.innerHTML = html;
    bindEvents(st);
  }

  function statCard(label, value, sub) {
    return '<div style="padding:14px;background:var(--bg2,rgba(255,255,255,0.03));border:1px solid rgba(0,212,255,0.15);border-radius:10px">' +
      '<div style="font:600 8px var(--font-mono);color:var(--text-muted,#8a8f98);letter-spacing:2px">' + label + '</div>' +
      '<div style="font:700 22px var(--font-mono);color:var(--cyan,#00D4FF);margin:4px 0 2px">' + value + '</div>' +
      '<div style="font:400 8px var(--font-mono);color:var(--text-dim,#6a6f78)">' + sub + '</div></div>';
  }

  function sectionTitle(t) {
    return '<div style="font:600 11px var(--font-mono);color:var(--text,#e8eaf0);letter-spacing:2px;border-left:3px solid var(--cyan,#00D4FF);padding-left:10px;margin:20px 0 10px">' + t + '</div>';
  }

  // ── events ─────────────────────────────────────
  function bindEvents(st) {
    var $ = function (id) { return document.getElementById(id); };

    function addLap() {
      var s = load();
      s.laps.push({
        ts: $('rcLapDate').value || localDate(),
        mood: $('rcLapMood').value,
        trigger: $('rcLapTrigger').value.trim(),
        device: $('rcLapDevice').value,
        note: $('rcLapNote').value.trim()
      });
      save(s);
      renderRecovery();
    }

    function previewDebt() {
      var el = $('rcDebtPreview');
      if (!el) return;
      var type = $('rcDebtType').value;
      var dev = $('rcDebtDevice').value;
      var hours = Math.max(1, Math.ceil(parseFloat($('rcDebtHours').value) || 0));
      var night = $('rcDebtNight').value === '1';
      var km = 0;
      if (type === 'connection') {
        var rate = night ? PENALTY.extraHourNight : PENALTY.extraHourDay;
        km = PENALTY.baseCycleKm + Math.max(0, hours - 1) * rate;
      } else if (type === 'used') { km = PENALTY.usedKm; }
      else if (type === 'night') { km = PENALTY.nightKm; }
      else if (type === 'lie') { km = PENALTY.lieKm; }
      else if (type === 'dns') { km = PENALTY.dnsKm * hours; }
      else { km = PENALTY.doubleKm; }
      el.textContent = 'DEBT: ' + km + ' km cycle (' + (km / 2) + ' km walk/run, ' + (km / 8) + ' km swim) — opens on submit';
      return km;
    }

    function addDebt() {
      var s = load();
      var type = $('rcDebtType').value;
      var dev = $('rcDebtDevice').value;
      var hours = Math.max(1, Math.ceil(parseFloat($('rcDebtHours').value) || 0));
      var night = $('rcDebtNight').value === '1';
      var km = previewDebt();
      s.debts.push({ opened: new Date().toISOString(), type: type, device: dev, hours: hours, night: night, km: km, paid: false, proof: '' });
      save(s);
      renderRecovery();
    }

    if ($('rcLapAdd')) $('rcLapAdd').addEventListener('click', addLap);
    if ($('rcDebtAdd')) $('rcDebtAdd').addEventListener('click', addDebt);
    ['rcDebtType', 'rcDebtDevice', 'rcDebtHours', 'rcDebtNight'].forEach(function (id) {
      if ($(id)) $(id).addEventListener('input', previewDebt);
    });

    if ($('rcCheckClean')) $('rcCheckClean').addEventListener('click', function () {
      var s = load();
      s.checkins = s.checkins.filter(function (c) { return c.date !== localDate(); });
      s.checkins.push({ date: localDate(), status: 'clean' });
      save(s); renderRecovery();
    });
    if ($('rcCheckSlip')) $('rcCheckSlip').addEventListener('click', function () {
      var s = load();
      s.checkins = s.checkins.filter(function (c) { return c.date !== localDate(); });
      s.checkins.push({ date: localDate(), status: 'slipped' });
      save(s); renderRecovery();
    });

    if ($('rcExport')) $('rcExport').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fl-recovery-' + localDate() + '.json';
      a.click();
    });
    if ($('rcImport')) $('rcImport').addEventListener('click', function () { $('rcImportFile').click(); });
    if ($('rcImportFile')) $('rcImportFile').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var data = JSON.parse(r.result);
          if (!data.laps || !data.debts) throw new Error('bad file');
          save(data);
          renderRecovery();
        } catch (err) { alert('Invalid recovery file'); }
      };
      r.readAsText(f);
    });

    root.querySelectorAll('[data-act="pay"]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = load();
        var i = parseInt(b.dataset.i, 10);
        var proof = prompt('Proof accepted by the witness. One line (e.g. Strava 30km walk):');
        if (proof === null) return;
        s.debts[i].paid = true;
        s.debts[i].proof = proof || 'proof accepted';
        save(s); renderRecovery();
      });
    });
    root.querySelectorAll('[data-act="ignote"]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = load();
        var dd = s.debts[parseInt(b.dataset.i, 10)];
        var km = debtKmNow(dd);
        var note = dd.type === 'dns'
          ? 'BLOCKED ACCESS LOGGED — ' + km + ' KM CYCLE DEBT.'
          : 'MISS LOGGED — ' + km + ' KM CYCLE DEBT. PAYING IN DISTANCE.';
        if (navigator.clipboard) navigator.clipboard.writeText(note);
        alert('IG note copied (never the reason):\n\n' + note);
      });
    });
  }

  var root = document.getElementById('recoveryRoot');
  window.renderRecovery = renderRecovery;
  if (root && document.querySelector('.cc-panel#p-recovery.active')) renderRecovery();
})();
