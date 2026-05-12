// ═══════════════════════════════════════════
// FIRST LIGHT — FIRE CALCULATOR & NET WORTH TRACKER
// Financial Independence journey + monthly net worth snapshots
// ═══════════════════════════════════════════

// ── FIRE CONFIG DATA LAYER ──
function getFireConfig() {
  var defaults = {
    current_age: 30,
    target_monthly_income: 200000,
    current_corpus: 0,
    current_monthly_investment: 25000,
    current_monthly_income: 0,
    expected_return_rate: 8.0,
    inflation_rate: 6.0,
    swr: 3.5
  };
  try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem('fl_fire_config') || '{}')); }
  catch(e) { return defaults; }
}

function saveFireConfig(config) {
  localStorage.setItem('fl_fire_config', JSON.stringify(config));
  var SUPA = (typeof FL !== 'undefined' && FL.SUPABASE_URL) || '';
  var KEY = (typeof FL !== 'undefined' && FL.SUPABASE_ANON_KEY) || '';
  if (!SUPA || !KEY) return;
  var jwt = KEY;
  try {
    var ref = SUPA.split('//')[1].split('.')[0];
    var sess = JSON.parse(localStorage.getItem('sb-' + ref + '-auth-token') || 'null');
    if (sess && sess.access_token) jwt = sess.access_token;
  } catch(e) {}
  fetch(SUPA + '/rest/v1/finance_fire_config', {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(Object.assign({ id: 'default', updated_at: new Date().toISOString() }, config))
  }).catch(function() {});
}

// ── NET WORTH DATA LAYER ──
function getNetWorthSnapshots() {
  try { return JSON.parse(localStorage.getItem('fl_networth_snapshots') || '[]'); } catch(e) { return []; }
}

function saveNetWorthSnapshots(list) {
  localStorage.setItem('fl_networth_snapshots', JSON.stringify(list));
}

function addNetWorthSnapshot(snapshot) {
  var list = getNetWorthSnapshots();
  snapshot.id = snapshot.id || ('nw_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
  snapshot.created_at = snapshot.created_at || new Date().toISOString();
  var month = snapshot.snapshot_date.slice(0,7);
  list = list.filter(function(s) { return s.snapshot_date.slice(0,7) !== month; });
  list.push(snapshot);
  list.sort(function(a,b) { return a.snapshot_date > b.snapshot_date ? 1 : -1; });
  saveNetWorthSnapshots(list);
  var SUPA = (typeof FL !== 'undefined' && FL.SUPABASE_URL) || '';
  var KEY = (typeof FL !== 'undefined' && FL.SUPABASE_ANON_KEY) || '';
  if (!SUPA || !KEY) return;
  var jwt = KEY;
  try {
    var ref = SUPA.split('//')[1].split('.')[0];
    var sess = JSON.parse(localStorage.getItem('sb-' + ref + '-auth-token') || 'null');
    if (sess && sess.access_token) jwt = sess.access_token;
  } catch(e) {}
  fetch(SUPA + '/rest/v1/finance_networth', {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(snapshot)
  }).catch(function() {});
}

function deleteNetWorthSnapshot(id) {
  saveNetWorthSnapshots(getNetWorthSnapshots().filter(function(s) { return s.id !== id; }));
  if (typeof sbFetch === 'function') sbFetch('finance_networth', 'DELETE', null, '?id=eq.' + id);
  renderNetWorthPanel();
}

// ── NET WORTH COMPUTE ──
function computeNetWorth(s) {
  var assets =
    (parseFloat(s.bank_cash)||0) + (parseFloat(s.fd)||0) + (parseFloat(s.ppf_epf)||0) +
    (parseFloat(s.bonds)||0) + (parseFloat(s.mf_value)||0) + (parseFloat(s.stocks_india)||0) +
    (parseFloat(s.nps_value)||0) + (parseFloat(s.stocks_foreign)||0) + (parseFloat(s.gold_value)||0) +
    (parseFloat(s.property_value)||0) + (parseFloat(s.vehicle_value)||0) +
    (parseFloat(s.crypto)||0) + (parseFloat(s.other_assets)||0);
  var liabilities =
    (parseFloat(s.home_loan)||0) + (parseFloat(s.vehicle_loan)||0) +
    (parseFloat(s.personal_loan)||0) + (parseFloat(s.credit_card)||0) +
    (parseFloat(s.other_liabilities)||0);
  return { assets: assets, liabilities: liabilities, netWorth: assets - liabilities };
}

// ── FIRE MATH ENGINE ──
function computeFire(config) {
  var P = parseFloat(config.target_monthly_income) || 200000;
  var age = parseInt(config.current_age) || 30;
  var C0 = parseFloat(config.current_corpus) || 0;
  var M = parseFloat(config.current_monthly_investment) || 0;
  var r_annual = (parseFloat(config.expected_return_rate) || 8) / 100;
  var swr = (parseFloat(config.swr) || 3.5) / 100;

  var corpusNeeded = (P * 12) / swr;
  var progress = C0 > 0 ? Math.min(Math.round(C0 / corpusNeeded * 100), 100) : 0;

  function monthsToFI(rate, sip) {
    var rm = Math.pow(1 + rate, 1/12) - 1;
    var corpus = C0, n = 0;
    while (corpus < corpusNeeded && n < 720) { corpus = corpus * (1 + rm) + sip; n++; }
    return n < 720 ? n : null;
  }

  var baseM = monthsToFI(r_annual, M);
  var pessM = monthsToFI(0.06, M);
  var optM  = monthsToFI(0.10, M);

  var today = new Date();
  function fiDate(months) {
    if (months === null) return null;
    var d = new Date(today.getFullYear(), today.getMonth() + months, 1);
    return d.toLocaleString('default', { month: 'short' }) + ' ' + d.getFullYear();
  }

  var yearsToFI = baseM !== null ? Math.round(baseM / 12 * 10) / 10 : null;
  var ageAtFI   = yearsToFI !== null ? Math.round((age + yearsToFI) * 10) / 10 : null;

  // What-if levers
  var m5k  = monthsToFI(r_annual, M + 5000);
  var m10k = monthsToFI(r_annual, M + 10000);
  var save5k  = (baseM !== null && m5k !== null)  ? baseM - m5k  : 0;
  var save10k = (baseM !== null && m10k !== null) ? baseM - m10k : 0;

  // SIP needed to hit FI in exactly 10 years
  var n10 = 120;
  var rm  = Math.pow(1 + r_annual, 1/12) - 1;
  var fv  = Math.pow(1 + rm, n10);
  var sip10yr = Math.max(0, (corpusNeeded - C0 * fv) * rm / (fv - 1));

  // Year-by-year projection
  var projection = [];
  var pCorpus = C0;
  var curYear = today.getFullYear();
  for (var yr = 0; yr <= 25; yr++) {
    var pct = Math.min(Math.round(pCorpus / corpusNeeded * 100), 999);
    projection.push({ year: curYear + yr, age: age + yr, corpus: pCorpus, passiveIncome: pCorpus * swr / 12, pct: pct, fi: pct >= 100 });
    for (var mo = 0; mo < 12; mo++) pCorpus = pCorpus * (1 + rm) + M;
    if (pCorpus > corpusNeeded * 6) break;
  }

  // FI Milestones
  var milestones = [
    { label: 'BABY STEPS',   pct: 10,  corpus: corpusNeeded * 0.10, desc: 'You have started — keep going' },
    { label: 'COAST FI',     pct: 25,  corpus: corpusNeeded * 0.25, desc: 'Investments will coast to goal at current rate' },
    { label: 'LEAN FI',      pct: 50,  corpus: corpusNeeded * 0.50, desc: 'Half way — lean lifestyle is now funded' },
    { label: 'BARISTA FI',   pct: 75,  corpus: corpusNeeded * 0.75, desc: 'Part-time work closes the remaining gap' },
    { label: 'FULL FIRE',    pct: 100, corpus: corpusNeeded,         desc: 'Complete financial independence — you are free' }
  ];

  return { P, corpusNeeded, progress, C0, baseM, pessM, optM,
    baseFI: fiDate(baseM), pessFI: fiDate(pessM), optFI: fiDate(optM),
    yearsToFI, ageAtFI, save5k, save10k, sip10yr, projection, milestones, M, swr, age };
}

// ── FORMAT ──
function fireFmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '₹—';
  var abs = Math.abs(Math.round(n)), sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return sign + '₹' + (abs/10000000).toFixed(2) + ' Cr';
  if (abs >= 100000)   return sign + '₹' + (abs/100000).toFixed(2) + ' L';
  if (abs >= 1000)     return sign + '₹' + (abs/1000).toFixed(1) + 'K';
  return sign + '₹' + abs.toLocaleString('en-IN');
}

// ── PANEL STATE ──
var _fireTab = 'calculator';

// ── FIRE PANEL ──
function renderFirePanel(tab) {
  var container = document.getElementById('fire-container');
  if (!container) return;
  if (tab) _fireTab = tab;
  var tabs = [
    { id: 'calculator', label: 'CALCULATOR', icon: '◈' },
    { id: 'projection',  label: 'PROJECTION',  icon: '▦' }
  ];
  var html = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:20px">';
  tabs.forEach(function(t) {
    var active = _fireTab === t.id;
    html += '<button onclick="renderFirePanel(\'' + t.id + '\')" style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;padding:6px 14px;border-radius:6px;border:1px solid ' + (active ? '#00E676' : 'rgba(0,230,118,0.2)') + ';background:' + (active ? 'rgba(0,230,118,0.08)' : 'transparent') + ';color:' + (active ? '#00E676' : 'var(--text-muted)') + ';cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation">' + t.icon + ' ' + t.label + '</button>';
  });
  html += '</div><div id="fire-tab-body"></div>';
  container.innerHTML = html;
  var body = document.getElementById('fire-tab-body');
  if (!body) return;
  if (_fireTab === 'calculator') body.innerHTML = _buildFireCalc();
  else if (_fireTab === 'projection') body.innerHTML = _buildFireProjection();
}

// ── CALCULATOR TAB ──
function _buildFireCalc() {
  var config = getFireConfig();

  // Auto-detect from real data
  var today = new Date();
  var autoSIP = 0, autoIncome = 0, investedTotal = 0;
  if (typeof getFinInvestments === 'function') {
    var invs = getFinInvestments();
    investedTotal = invs.reduce(function(s,i){ return s+(parseFloat(i.amount)||0); }, 0);
    var cut = new Date(today.getFullYear(), today.getMonth()-6, 1);
    var recent = invs.filter(function(i){ return new Date(i.date) >= cut; });
    autoSIP = Math.round(recent.reduce(function(s,i){ return s+(parseFloat(i.amount)||0); },0) / 6);
  }
  if (typeof getFinIncome === 'function') {
    var incTotal = 0, incMos = 0;
    for (var mi = 1; mi <= 6; mi++) {
      var mDate = new Date(today.getFullYear(), today.getMonth()-mi, 1);
      var inc = getFinIncome(mDate.getFullYear(), mDate.getMonth());
      var mSum = inc.reduce(function(s,i){ return s+(parseFloat(i.amount)||0); }, 0);
      if (mSum > 0) { incTotal += mSum; incMos++; }
    }
    if (incMos > 0) autoIncome = Math.round(incTotal / incMos);
  }

  var fire = computeFire(config);
  var pct = fire.progress;
  var pColor = pct >= 100 ? '#00E676' : pct >= 75 ? '#00E676' : pct >= 50 ? '#F5A623' : pct >= 25 ? '#00D4FF' : '#FF5252';
  var html = '';

  // ── HERO CARD ──
  html += '<div style="padding:20px;background:linear-gradient(135deg,rgba(0,230,118,0.07) 0%,rgba(0,212,255,0.03) 100%);border:1px solid rgba(0,230,118,0.2);border-radius:14px;margin-bottom:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:3px;color:rgba(0,230,118,0.6);margin-bottom:8px">FINANCIAL INDEPENDENCE GOAL</div>';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">';
  html += '<div><div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:#00E676;line-height:1">' + fireFmt(config.target_monthly_income) + '</div><div style="font-family:var(--font-mono);font-size:10px;color:rgba(0,230,118,0.6);margin-top:3px">passive income / month</div></div>';
  html += '<div style="text-align:right"><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">CORPUS NEEDED</div><div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--text)">' + fireFmt(fire.corpusNeeded) + '</div><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">at ' + config.swr + '% SWR</div></div>';
  html += '</div>';
  // Big progress bar
  html += '<div style="margin-bottom:6px;display:flex;justify-content:space-between">';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">Built: <span style="color:' + pColor + ';font-weight:700">' + fireFmt(fire.C0) + '</span></div>';
  html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:' + pColor + '">' + pct + '%</div>';
  html += '</div>';
  html += '<div style="height:14px;background:rgba(0,0,0,0.4);border-radius:7px;overflow:hidden;position:relative">';
  html += '<div style="position:absolute;inset:0;display:flex">';
  [25,50,75].forEach(function(p){ html += '<div style="flex:' + p + ';border-right:1px solid rgba(255,255,255,0.06)"></div>'; });
  html += '</div>';
  html += '<div style="height:100%;width:' + Math.min(pct,100) + '%;background:linear-gradient(90deg,' + pColor + ',rgba(0,230,118,0.4));border-radius:7px;transition:width 0.6s;position:relative;z-index:1"></div>';
  html += '</div>';
  html += '<div style="display:flex;justify-content:space-between;margin-top:4px;font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">';
  ['₹0','25%','50%','75%', fireFmt(fire.corpusNeeded)].forEach(function(l){ html += '<span>' + l + '</span>'; });
  html += '</div>';
  if (fire.C0 < fire.corpusNeeded) {
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:6px">Remaining: <span style="color:' + pColor + '">' + fireFmt(fire.corpusNeeded - fire.C0) + '</span></div>';
  }
  html += '</div>';

  // ── AT CURRENT PACE ──
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">AT YOUR CURRENT PACE</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">';
  function fCard(label, val, sub, color) {
    return '<div style="padding:12px 8px;background:var(--bg3);border:1px solid rgba(0,212,255,0.06);border-radius:10px;text-align:center">' +
      '<div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1.5px;color:var(--text-dim);margin-bottom:5px">' + label + '</div>' +
      '<div style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:' + (color||'var(--text)') + '">' + val + '</div>' +
      (sub ? '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-top:2px">' + sub + '</div>' : '') +
      '</div>';
  }
  html += fCard('FI DATE', fire.baseFI || '—', 'estimated', '#00E676');
  html += fCard('YEARS AWAY', fire.yearsToFI !== null ? fire.yearsToFI + ' yrs' : '—', 'from today', 'var(--gold)');
  html += fCard('AGE AT FI', fire.ageAtFI !== null ? fire.ageAtFI : '—', 'years old', 'var(--cyan)');
  html += '</div>';

  // ── 3 SCENARIOS ──
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">RETURN SCENARIOS</div>';
  html += '<div style="overflow-x:auto;margin-bottom:20px">';
  html += '<table style="width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:10px;min-width:260px">';
  html += '<thead><tr style="border-bottom:1px solid rgba(0,212,255,0.08)">';
  [['', ''], ['CONSERVATIVE', '#FF5252'], ['BASE CASE', '#00E676'], ['OPTIMISTIC', 'var(--gold)']].forEach(function(h) {
    html += '<th style="padding:7px 5px;color:' + (h[1]||'var(--text-dim)') + ';font-weight:400;text-align:' + (h[0]===''?'left':'center') + ';font-size:9px">' + h[0] + '</th>';
  });
  html += '</tr></thead><tbody>';
  var scenRows = [
    { label: 'Return', vals: ['6%', config.expected_return_rate + '%', '10%'] },
    { label: 'FI Date', vals: [fire.pessFI||'—', fire.baseFI||'—', fire.optFI||'—'] },
    { label: 'Years', vals: [
      fire.pessM !== null ? Math.round(fire.pessM/12*10)/10 + 'y' : '—',
      fire.yearsToFI !== null ? fire.yearsToFI + 'y' : '—',
      fire.optM  !== null ? Math.round(fire.optM/12*10)/10 + 'y' : '—'
    ]},
    { label: 'SIP for 10yr FI', vals: ['—', fireFmt(fire.sip10yr) + '/mo', '—'] }
  ];
  scenRows.forEach(function(row) {
    html += '<tr style="border-bottom:1px solid rgba(0,212,255,0.03)">';
    html += '<td style="padding:7px 5px;color:var(--text-muted)">' + row.label + '</td>';
    row.vals.forEach(function(v, i) {
      var c = i===0 ? '#FF5252' : i===1 ? '#00E676' : 'var(--gold)';
      html += '<td style="text-align:center;padding:7px 5px;color:' + c + ';font-weight:' + (i===1?'700':'400') + '">' + v + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // ── WHAT-IF LEVERS ──
  if (fire.save5k > 0 || fire.save10k > 0) {
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">WHAT-IF LEVERS</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px">';
    function lever(icon, text, saving) {
      if (saving <= 0) return '';
      var y = Math.floor(saving/12), m = saving % 12;
      var t = (y > 0 ? y + 'y ' : '') + (m > 0 ? m + 'm ' : '') + 'earlier';
      return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(0,230,118,0.03);border:1px solid rgba(0,230,118,0.1);border-radius:8px">' +
        '<span style="font-size:18px">' + icon + '</span>' +
        '<div style="flex:1;font-family:var(--font-mono);font-size:10px;color:var(--text)">' + text + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#00E676">-' + t + '</div>' +
        '</div>';
    }
    html += lever('💹', 'Invest ₹5,000 more per month', fire.save5k);
    html += lever('🚀', 'Invest ₹10,000 more per month', fire.save10k);
    html += '</div>';
  }

  // ── FI MILESTONES ──
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">FI MILESTONES</div>';
  html += '<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:20px">';
  fire.milestones.forEach(function(m) {
    var done = pct >= m.pct;
    var curr = !done && pct >= (m.pct - 26);
    var bdr  = done ? 'rgba(0,230,118,0.25)' : curr ? 'rgba(0,212,255,0.2)' : 'rgba(0,212,255,0.04)';
    var bg   = done ? 'rgba(0,230,118,0.05)' : 'transparent';
    var clr  = done ? '#00E676' : curr ? 'var(--cyan)' : 'var(--text-dim)';
    html += '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:' + bg + ';border:1px solid ' + bdr + ';border-radius:8px;opacity:' + (done||curr?'1':'0.45') + '">';
    html += '<div style="font-size:18px">' + (done ? '✅' : curr ? '→' : '○') + '</div>';
    html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:10px;font-weight:' + (done||curr?'700':'400') + ';color:' + clr + '">' + m.pct + '% — ' + m.label + '</div><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-top:1px">' + m.desc + '</div></div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:' + clr + ';text-align:right">' + fireFmt(m.corpus) + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // ── CONFIGURE ──
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">YOUR NUMBERS</div>';
  html += '<div class="panel-section" style="border-color:rgba(0,230,118,0.15);padding:14px">';
  if (investedTotal > 0) {
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);padding:6px 10px;background:rgba(0,212,255,0.03);border-radius:6px;margin-bottom:12px">From your investment log: cost basis = <span style="color:var(--cyan)">' + fireFmt(investedTotal) + '</span> — enter current <em>market value</em> below.</div>';
  }
  function fInput(id, label, val, hint) {
    return '<div style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
      '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">' + label + '</div>' +
      (hint ? '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + hint + '</div>' : '') +
      '</div>' +
      '<input type="number" id="' + id + '" value="' + (val||0) + '" style="width:100%;box-sizing:border-box;padding:9px 10px;background:var(--bg3);border:1px solid rgba(0,230,118,0.15);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:13px">' +
      '</div>';
  }
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div>' + fInput('fire-age', 'CURRENT AGE', config.current_age, '') + '</div>';
  html += '<div>' + fInput('fire-target', 'TARGET PASSIVE INCOME / MO (₹)', config.target_monthly_income, 'your FI goal') + '</div>';
  html += '</div>';
  html += fInput('fire-corpus', 'CURRENT PORTFOLIO MARKET VALUE (₹)', config.current_corpus, 'total value today — MF + stocks + FD + PPF + NPS');
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div>' + fInput('fire-sip', 'MONTHLY INVESTMENT (₹)', config.current_monthly_investment, autoSIP ? 'auto-detected: ' + fireFmt(autoSIP) + '/mo' : '') + '</div>';
  html += '<div>' + fInput('fire-income', 'MONTHLY INCOME (₹)', config.current_monthly_income, autoIncome ? 'auto-detected: ' + fireFmt(autoIncome) + '/mo' : '') + '</div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">';
  html += '<div>' + fInput('fire-return', 'RETURN RATE (%)', config.expected_return_rate, '') + '</div>';
  html += '<div>' + fInput('fire-inflation', 'INFLATION (%)', config.inflation_rate, 'India ~6%') + '</div>';
  html += '<div>' + fInput('fire-swr', 'SWR (%)', config.swr, '3–4% for India') + '</div>';
  html += '</div>';
  html += '<button onclick="fireCalcSave()" id="fire-save-btn" style="width:100%;margin-top:4px;padding:13px;background:rgba(0,230,118,0.1);color:#00E676;font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;border:1px solid rgba(0,230,118,0.3);border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent">SAVE & RECALCULATE</button>';
  html += '</div>';

  return html;
}

// ── PROJECTION TAB ──
function _buildFireProjection() {
  var config = getFireConfig();
  var fire = computeFire(config);
  var html = '';

  // Corpus bar chart
  var maxC = Math.max.apply(null, fire.projection.map(function(p){ return p.corpus; }));
  maxC = maxC || 1;
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">CORPUS GROWTH CHART</div>';
  html += '<div style="display:flex;gap:3px;align-items:flex-end;height:90px;margin-bottom:20px;overflow-x:auto">';
  fire.projection.forEach(function(p) {
    var h = Math.max(Math.round((p.corpus/maxC)*70), 2);
    var c = p.fi ? '#00E676' : p.pct >= 75 ? '#F5A623' : p.pct >= 50 ? '#00D4FF' : 'rgba(0,212,255,0.35)';
    html += '<div style="min-width:20px;flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
    html += '<div style="font-family:var(--font-mono);font-size:5px;color:var(--text-dim)">' + (p.fi ? '🔥' : p.pct + '%') + '</div>';
    html += '<div style="width:100%;background:' + c + ';height:' + h + 'px;border-radius:2px 2px 0 0"></div>';
    html += '<div style="font-family:var(--font-mono);font-size:6px;color:var(--text-dim)">\'' + String(p.year).slice(2) + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Year-by-year table
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">YEAR-BY-YEAR BREAKDOWN</div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:10px;min-width:300px">';
  html += '<thead><tr style="border-bottom:1px solid rgba(0,212,255,0.1)">';
  ['AGE','YEAR','CORPUS','FI%','PASSIVE/MO'].forEach(function(h) {
    html += '<th style="padding:6px 4px;color:var(--text-dim);font-weight:400;text-align:right;white-space:nowrap">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';
  var fireDone = false;
  fire.projection.forEach(function(p) {
    var fi = p.fi;
    if (fi && !fireDone) {
      fireDone = true;
      html += '<tr><td colspan="5" style="padding:5px 4px;font-family:var(--font-mono);font-size:8px;color:#00E676;text-align:center;letter-spacing:2px;background:rgba(0,230,118,0.05)">🔥 FINANCIAL INDEPENDENCE — AGE ' + p.age + '</td></tr>';
    }
    html += '<tr style="border-bottom:1px solid rgba(0,212,255,0.03);background:' + (fi?'rgba(0,230,118,0.03)':'transparent') + '">';
    var tc = fi ? '#00E676' : 'var(--text)';
    html += '<td style="padding:6px 4px;text-align:right;color:' + tc + ';font-weight:' + (fi?'700':'400') + '">' + p.age + '</td>';
    html += '<td style="padding:6px 4px;text-align:right;color:var(--text-muted)">' + p.year + '</td>';
    html += '<td style="padding:6px 4px;text-align:right;color:' + tc + ';font-weight:' + (fi?'700':'400') + '">' + fireFmt(p.corpus) + '</td>';
    html += '<td style="padding:6px 4px;text-align:right;color:' + (p.pct>=100?'#00E676':p.pct>=75?'#F5A623':'var(--cyan)') + ';font-weight:' + (fi?'700':'400') + '">' + (p.pct>=999?'🔥':p.pct+'%') + '</td>';
    html += '<td style="padding:6px 4px;text-align:right;color:' + (fi?'#00E676':'var(--text-muted)') + '">' + fireFmt(p.passiveIncome) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // Passive income note
  html += '<div style="margin-top:16px;padding:12px 14px;background:rgba(0,212,255,0.03);border:1px solid rgba(0,212,255,0.08);border-radius:8px">';
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">PASSIVE INCOME SOURCES AT FI</div>';
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);line-height:2">';
  html += 'SWR corpus drawdown → <span style="color:#00E676">' + fireFmt(fire.corpusNeeded * fire.swr / 12) + '/mo</span><br>';
  html += 'FD / bond interest → add to net worth tracker → update corpus above<br>';
  html += 'Rental income → add property in net worth → count towards corpus<br>';
  html += 'Dividend income → reinvest till FI, then let it flow as passive income<br>';
  html += 'Foreign stocks → USD dividends + appreciation act as inflation hedge';
  html += '</div></div>';
  return html;
}

// ── NET WORTH PANEL ──
function renderNetWorthPanel() {
  var container = document.getElementById('networth-container');
  if (!container) return;
  var snaps = getNetWorthSnapshots();
  var latest = snaps.length > 0 ? snaps[snaps.length-1] : null;
  var prev   = snaps.length > 1 ? snaps[snaps.length-2] : null;
  var lNW = latest ? computeNetWorth(latest) : null;
  var pNW = prev   ? computeNetWorth(prev)   : null;
  var html = '';

  // ── HERO ──
  if (lNW) {
    var change = pNW ? lNW.netWorth - pNW.netWorth : 0;
    var changePct = (pNW && pNW.netWorth > 0) ? Math.round(change/pNW.netWorth*100) : 0;
    var nwColor = lNW.netWorth >= 0 ? '#00E676' : '#FF5252';
    html += '<div style="padding:20px;background:linear-gradient(135deg,rgba(0,212,255,0.05),rgba(245,166,35,0.03));border:1px solid rgba(0,212,255,0.15);border-radius:14px;margin-bottom:20px">';
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:3px;color:var(--text-dim);margin-bottom:4px">NET WORTH — ' + (latest.snapshot_date||'').slice(0,7) + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:36px;font-weight:700;color:' + nwColor + ';line-height:1">' + fireFmt(lNW.netWorth) + '</div>';
    if (pNW) html += '<div style="font-family:var(--font-mono);font-size:10px;color:' + (change>=0?'#00E676':'#FF5252') + ';margin-top:5px">' + (change>=0?'+':'') + fireFmt(change) + ' (' + (change>=0?'+':'') + changePct + '%) from ' + (prev.snapshot_date||'').slice(0,7) + '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">';
    html += '<div style="padding:10px 12px;background:rgba(0,230,118,0.06);border-radius:8px"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);letter-spacing:2px">TOTAL ASSETS</div><div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:#00E676;margin-top:3px">' + fireFmt(lNW.assets) + '</div></div>';
    html += '<div style="padding:10px 12px;background:rgba(255,82,82,0.05);border-radius:8px"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);letter-spacing:2px">LIABILITIES</div><div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:#FF5252;margin-top:3px">' + fireFmt(lNW.liabilities) + '</div></div>';
    html += '</div></div>';

    // Asset breakdown bars
    var assetGroups = [
      { label: 'BANK & CASH',    icon: '🏦', keys: ['bank_cash'],                         color: '#00D4FF' },
      { label: 'FIXED INCOME',   icon: '📊', keys: ['fd','ppf_epf','bonds'],               color: '#F5A623' },
      { label: 'INDIAN MARKET',  icon: '📈', keys: ['mf_value','stocks_india','nps_value'], color: '#00E676' },
      { label: 'FOREIGN STOCKS', icon: '🌐', keys: ['stocks_foreign'],                      color: '#CE93D8' },
      { label: 'GOLD',           icon: '🥇', keys: ['gold_value'],                          color: '#F5A623' },
      { label: 'REAL ESTATE',    icon: '🏠', keys: ['property_value'],                      color: '#A1887F' },
      { label: 'VEHICLE',        icon: '🚗', keys: ['vehicle_value'],                       color: '#90A4AE' },
      { label: 'OTHER',          icon: '📦', keys: ['crypto','other_assets'],               color: '#9E9E9E' }
    ];
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">ASSET BREAKDOWN</div>';
    html += '<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:20px">';
    assetGroups.forEach(function(g) {
      var total = g.keys.reduce(function(s,k){ return s+(parseFloat(latest[k])||0); }, 0);
      if (!total) return;
      var pct = lNW.assets > 0 ? Math.min(Math.round(total/lNW.assets*100),100) : 0;
      html += '<div style="display:flex;align-items:center;gap:8px">';
      html += '<span style="font-size:15px;min-width:22px">' + g.icon + '</span>';
      html += '<div style="flex:1">';
      html += '<div style="display:flex;justify-content:space-between;margin-bottom:3px"><div style="font-family:var(--font-mono);font-size:9px;color:var(--text)">' + g.label + '</div><div style="font-family:var(--font-mono);font-size:10px;color:' + g.color + ';font-weight:700">' + fireFmt(total) + ' <span style="color:var(--text-dim);font-weight:400">(' + pct + '%)</span></div></div>';
      html += '<div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + g.color + ';border-radius:2px"></div></div>';
      html += '</div></div>';
    });
    html += '</div>';

    // Liabilities list
    var liabDefs = [
      { key: 'home_loan',         label: 'Home Loan',     icon: '🏠' },
      { key: 'vehicle_loan',      label: 'Vehicle Loan',  icon: '🚗' },
      { key: 'personal_loan',     label: 'Personal Loan', icon: '💳' },
      { key: 'credit_card',       label: 'Credit Card',   icon: '💳' },
      { key: 'other_liabilities', label: 'Other',         icon: '📦' }
    ];
    var anyLiab = liabDefs.some(function(l){ return parseFloat(latest[l.key]||0) > 0; });
    if (anyLiab) {
      html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">LIABILITIES</div>';
      html += '<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:20px">';
      liabDefs.forEach(function(l) {
        var v = parseFloat(latest[l.key]||0);
        if (!v) return;
        html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0"><span>' + l.icon + '</span><div style="flex:1;font-family:var(--font-mono);font-size:10px;color:var(--text)">' + l.label + '</div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#FF5252">' + fireFmt(v) + '</div></div>';
      });
      html += '</div>';
    }
  } else {
    html += '<div style="text-align:center;padding:32px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No snapshots yet.<br><br>Fill in your numbers below and hit SAVE SNAPSHOT.</div>';
  }

  // ── HISTORY CHART ──
  if (snaps.length > 1) {
    var maxNW = Math.max.apply(null, snaps.map(function(s){ return computeNetWorth(s).netWorth; }));
    maxNW = maxNW || 1;
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">NET WORTH HISTORY</div>';
    html += '<div style="display:flex;gap:4px;align-items:flex-end;height:65px;margin-bottom:20px">';
    snaps.slice(-12).forEach(function(s) {
      var nw = computeNetWorth(s).netWorth;
      var h = Math.max(Math.round((Math.abs(nw)/maxNW)*50), 2);
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
      html += '<div style="width:100%;background:' + (nw>=0?'var(--cyan)':'#FF5252') + ';height:' + h + 'px;border-radius:2px 2px 0 0"></div>';
      html += '<div style="font-family:var(--font-mono);font-size:6px;color:var(--text-dim)">' + (s.snapshot_date||'').slice(2,7) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // ── ADD SNAPSHOT FORM ──
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  var pre = latest || {};
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">ADD / UPDATE SNAPSHOT</div>';
  html += '<div class="panel-section" style="border-color:rgba(0,212,255,0.12);padding:14px">';
  html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-bottom:12px;line-height:1.7">One snapshot per month. Saving the same month overwrites the previous entry. Use <strong>current market value</strong> — not cost basis.</div>';
  html += '<div style="margin-bottom:10px"><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:4px">SNAPSHOT DATE</div><input type="date" id="nw-date" value="' + today + '" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--bg3);border:1px solid rgba(0,212,255,0.15);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:12px"></div>';

  var sections = [
    { title: 'LIQUID', color: '#00D4FF', fields: [
      { id:'nw-bank',    key:'bank_cash',    label:'Bank accounts + cash (all accounts combined)' }
    ]},
    { title: 'FIXED INCOME', color: '#F5A623', fields: [
      { id:'nw-fd',      key:'fd',           label:'Fixed Deposits (total FD value across banks)' },
      { id:'nw-ppf',     key:'ppf_epf',      label:'PPF + EPF (current balance)' },
      { id:'nw-bonds',   key:'bonds',         label:'Bonds + Debt mutual funds (current value)' }
    ]},
    { title: 'MARKET — current value today, not what you invested', color: '#00E676', fields: [
      { id:'nw-mf',      key:'mf_value',     label:'Mutual Funds (total current NAV value)' },
      { id:'nw-stocks',  key:'stocks_india', label:'Indian Stocks (total current market value)' },
      { id:'nw-nps',     key:'nps_value',    label:'NPS (current balance)' }
    ]},
    { title: 'FOREIGN', color: '#CE93D8', fields: [
      { id:'nw-foreign', key:'stocks_foreign', label:'US + International Stocks (INR equivalent value)' }
    ]},
    { title: 'PHYSICAL ASSETS', color: '#A1887F', fields: [
      { id:'nw-gold',     key:'gold_value',    label:'Gold — jewelry + bars + coins (INR value today)' },
      { id:'nw-property', key:'property_value', label:'Real estate + land (current market value)' },
      { id:'nw-vehicle',  key:'vehicle_value',  label:'Vehicle (current resale value)' }
    ]},
    { title: 'OTHER', color: '#9E9E9E', fields: [
      { id:'nw-crypto',   key:'crypto',        label:'Crypto (current value)' },
      { id:'nw-other',    key:'other_assets',  label:'Business stake + angel investments + other' }
    ]},
    { title: 'LIABILITIES — outstanding balances only', color: '#FF5252', fields: [
      { id:'nw-homeloan',  key:'home_loan',         label:'Home loan outstanding' },
      { id:'nw-carloan',   key:'vehicle_loan',       label:'Vehicle loan outstanding' },
      { id:'nw-personal',  key:'personal_loan',      label:'Personal loan outstanding' },
      { id:'nw-cc',        key:'credit_card',         label:'Credit card outstanding' },
      { id:'nw-otherliab', key:'other_liabilities',  label:'Any other liabilities' }
    ]}
  ];

  sections.forEach(function(sec) {
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:' + sec.color + ';margin:14px 0 8px">' + sec.title + '</div>';
    sec.fields.forEach(function(f) {
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
      html += '<div style="flex:1;font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">' + f.label + '</div>';
      html += '<input type="number" id="' + f.id + '" value="' + (parseFloat(pre[f.key])||0) + '" style="width:115px;padding:7px 8px;background:var(--bg3);border:1px solid rgba(0,212,255,0.12);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:12px;text-align:right">';
      html += '</div>';
    });
  });

  html += '<div style="margin-top:10px"><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:4px">NOTES (optional)</div><input type="text" id="nw-notes" value="' + (pre.notes||'') + '" placeholder="e.g. post-bonus, added FD..." style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--bg3);border:1px solid rgba(0,212,255,0.12);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:11px"></div>';
  html += '<button onclick="nwSaveSnapshot()" id="nw-save-btn" style="width:100%;margin-top:12px;padding:13px;background:var(--cyan);color:#0A0C10;font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;border:none;border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent">SAVE SNAPSHOT</button>';
  html += '</div>';

  // Snapshot history
  if (snaps.length > 0) {
    html += '<div style="margin-top:20px;font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">HISTORY</div>';
    snaps.slice().reverse().slice(0,12).forEach(function(s) {
      var nw = computeNetWorth(s);
      html += '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(0,212,255,0.04)">';
      html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + (s.snapshot_date||'') + '</div>' + (s.notes ? '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + s.notes + '</div>' : '') + '</div>';
      html += '<div style="text-align:right"><div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + (nw.netWorth>=0?'#00E676':'#FF5252') + '">' + fireFmt(nw.netWorth) + '</div><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">Assets ' + fireFmt(nw.assets) + '</div></div>';
      html += '<span onclick="deleteNetWorthSnapshot(\'' + s.id + '\')" style="color:var(--text-dim);cursor:pointer;font-size:16px;padding:0 6px;opacity:0.45;-webkit-tap-highlight-color:transparent">×</span>';
      html += '</div>';
    });
  }

  container.innerHTML = html;
}

// ── ACTIONS ──
function fireCalcSave() {
  var ids = ['fire-age','fire-target','fire-corpus','fire-sip','fire-income','fire-return','fire-inflation','fire-swr'];
  var missing = ids.some(function(id){ return !document.getElementById(id); });
  if (missing) return;
  var config = {
    current_age: parseInt(document.getElementById('fire-age').value)||30,
    target_monthly_income: parseFloat(document.getElementById('fire-target').value)||200000,
    current_corpus: parseFloat(document.getElementById('fire-corpus').value)||0,
    current_monthly_investment: parseFloat(document.getElementById('fire-sip').value)||0,
    current_monthly_income: parseFloat(document.getElementById('fire-income').value)||0,
    expected_return_rate: parseFloat(document.getElementById('fire-return').value)||8,
    inflation_rate: parseFloat(document.getElementById('fire-inflation').value)||6,
    swr: parseFloat(document.getElementById('fire-swr').value)||3.5
  };
  saveFireConfig(config);
  if (typeof markSaved === 'function') markSaved();
  renderFirePanel('calculator');
  renderFireDashboardWidget();
  var btn = document.getElementById('fire-save-btn');
  if (btn) { var o = btn.textContent; btn.textContent = '✓ SAVED & RECALCULATED'; setTimeout(function(){ btn.textContent = o; }, 2000); }
}

function nwSaveSnapshot() {
  var get = function(id) { var el = document.getElementById(id); return el ? parseFloat(el.value)||0 : 0; };
  var snapshot = {
    snapshot_date: (document.getElementById('nw-date')||{}).value || new Date().toISOString().slice(0,10),
    bank_cash: get('nw-bank'), fd: get('nw-fd'), ppf_epf: get('nw-ppf'), bonds: get('nw-bonds'),
    mf_value: get('nw-mf'), stocks_india: get('nw-stocks'), nps_value: get('nw-nps'),
    stocks_foreign: get('nw-foreign'), gold_value: get('nw-gold'),
    property_value: get('nw-property'), vehicle_value: get('nw-vehicle'),
    crypto: get('nw-crypto'), other_assets: get('nw-other'),
    home_loan: get('nw-homeloan'), vehicle_loan: get('nw-carloan'),
    personal_loan: get('nw-personal'), credit_card: get('nw-cc'),
    other_liabilities: get('nw-otherliab'),
    notes: ((document.getElementById('nw-notes')||{}).value||'').trim()
  };
  addNetWorthSnapshot(snapshot);
  if (typeof markSaved === 'function') markSaved();
  renderNetWorthPanel();
  renderFireDashboardWidget();
  var btn = document.getElementById('nw-save-btn');
  if (btn) { var o = btn.textContent; btn.textContent = '✓ SAVED'; btn.style.background = 'var(--green)'; setTimeout(function(){ btn.textContent = o; btn.style.background = 'var(--cyan)'; }, 2000); }
}

// ── DASHBOARD WIDGET ──
function renderFireDashboardWidget() {
  var el = document.getElementById('fire-dashboard-widget');
  if (!el) return;
  var config = getFireConfig();
  var fire = computeFire(config);
  var snaps = getNetWorthSnapshots();
  var lNW = snaps.length > 0 ? computeNetWorth(snaps[snaps.length-1]) : null;
  var pColor = fire.progress >= 100 ? '#00E676' : fire.progress >= 50 ? '#F5A623' : 'var(--cyan)';

  el.innerHTML =
    '<div class="panel-section" style="border-color:rgba(0,230,118,0.15);background:rgba(0,230,118,0.01)">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-bottom:10px" onclick="switchPanel(\'fire\')">' +
    '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">🔥</span>' +
    '<div><div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);letter-spacing:1px">FIRE JOURNEY</div>' +
    '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">Target ' + fireFmt(config.target_monthly_income) + '/mo · Corpus ' + fireFmt(fire.corpusNeeded) + '</div>' +
    '</div></div>' +
    '<div style="text-align:right"><div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:' + pColor + ';line-height:1">' + fire.progress + '%</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted)">FI PROGRESS</div></div>' +
    '</div>' +
    '<div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:8px">' +
    '<div style="height:100%;width:' + Math.min(fire.progress,100) + '%;background:linear-gradient(90deg,' + pColor + ',rgba(0,230,118,0.4));border-radius:3px;transition:width 0.5s"></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">FI Date: <span style="color:' + pColor + '">' + (fire.baseFI||'enter your numbers') + '</span></div>' +
    (lNW ? '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">Net Worth: <span style="color:var(--cyan);font-weight:700">' + fireFmt(lNW.netWorth) + '</span></div>' : '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)"><span onclick="switchPanel(\'networth\')" style="cursor:pointer;color:var(--cyan)">Add net worth →</span></div>') +
    '</div></div>';
}

// ── BOOTSTRAP FROM SUPABASE ──
(function _fireLoadFromSupabase() {
  var SUPA = (typeof FL !== 'undefined' && FL.SUPABASE_URL) || '';
  var KEY  = (typeof FL !== 'undefined' && FL.SUPABASE_ANON_KEY) || '';
  if (!SUPA || !KEY) return;
  var jwt = KEY;
  try {
    var ref = SUPA.split('//')[1].split('.')[0];
    var sess = JSON.parse(localStorage.getItem('sb-' + ref + '-auth-token') || 'null');
    if (sess && sess.access_token) jwt = sess.access_token;
  } catch(e) {}
  var headers = { 'apikey': KEY, 'Authorization': 'Bearer ' + jwt };

  // FIRE config
  fetch(SUPA + '/rest/v1/finance_fire_config?id=eq.default', { headers: headers })
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(data) {
      if (!data || !data.length) return;
      if (!localStorage.getItem('fl_fire_config')) {
        localStorage.setItem('fl_fire_config', JSON.stringify(data[0]));
        renderFireDashboardWidget();
      }
    }).catch(function(){});

  // Net worth snapshots
  fetch(SUPA + '/rest/v1/finance_networth?order=snapshot_date.asc', { headers: headers })
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(data) {
      if (!data || !data.length) return;
      var local = getNetWorthSnapshots();
      var ids = {};
      local.forEach(function(s){ ids[s.id] = true; });
      var added = 0;
      data.forEach(function(s){ if (!ids[s.id]) { local.push(s); added++; } });
      if (added > 0) {
        local.sort(function(a,b){ return a.snapshot_date > b.snapshot_date ? 1 : -1; });
        saveNetWorthSnapshots(local);
        renderFireDashboardWidget();
      }
    }).catch(function(){});

  // Annual budgets (fix data loss)
  fetch(SUPA + '/rest/v1/finance_annual_budgets', { headers: headers })
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(data) {
      if (!data || !data.length) return;
      var byYear = {};
      data.forEach(function(b){
        if (!byYear[b.year]) byYear[b.year] = {};
        byYear[b.year][b.category] = parseFloat(b.annual_budget);
      });
      Object.keys(byYear).forEach(function(yr) {
        var lkey = 'fl_finance_annual_budgets_' + yr;
        var local = {};
        try { local = JSON.parse(localStorage.getItem(lkey)||'{}'); } catch(e) {}
        localStorage.setItem(lkey, JSON.stringify(Object.assign({}, byYear[yr], local)));
      });
    }).catch(function(){});
})();

setTimeout(renderFireDashboardWidget, 400);
