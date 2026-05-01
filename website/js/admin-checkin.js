// ═══════════════════════════════════════════
// FIRST LIGHT — TODAY CHECK-IN
// Unified daily seal: auto-pull signals + manual fields
// ═══════════════════════════════════════════

// ── DATA ──
function getCheckin(date) {
  try { return JSON.parse(localStorage.getItem('fl_checkin_' + date) || '{}'); } catch(e) { return {}; }
}

function saveCheckin(date, data) {
  if (isDateLocked(date)) { showLockWarning(); return; }
  localStorage.setItem('fl_checkin_' + date, JSON.stringify(data));
  if (typeof syncSave === 'function') {
    syncSave('daily_checkin', Object.assign({ date: date }, data), 'date');
  }
  markSaved();
}

function syncCheckin(date, data) {
  if (typeof sbFetch !== 'function' || (typeof SB !== 'undefined' && !SB.init())) return;
  var payload = Object.assign({}, data, { date: date });
  sbFetch('daily_checkin', 'POST', payload, '?on_conflict=date');
}

// ── AUTO-PULL SIGNALS ──
function pullCheckinSignals(date) {
  var signals = {};

  // Ritual percentages
  ['morning', 'midday', 'evening'].forEach(function(period) {
    var done = [];
    try { done = JSON.parse(localStorage.getItem('fl_rituals_' + period + '_' + date) || '[]'); } catch(e) {}
    var defs = typeof getRitualDefs === 'function' ? getRitualDefs(period) : [];
    var active = defs.filter(function(r) { return r.active !== false; });
    signals[period + '_pct'] = active.length > 0 ? Math.round(done.length / active.length * 100) : 0;
  });

  // Gym
  var gym = typeof getGymWorkout === 'function' ? getGymWorkout(date) : null;
  signals.gym_done = !!gym;

  // Deep work blocks
  var dw = null;
  try { dw = JSON.parse(localStorage.getItem('fl_deepwork_' + date) || 'null'); } catch(e) {}
  signals.deep_work_blocks = (dw && dw.blocks) ? dw.blocks.filter(function(b) { return b.done; }).length : 0;

  // Mastery
  if (typeof getMasteryDaily === 'function' && typeof computeMasteryStats === 'function') {
    var mData = getMasteryDaily(date);
    var mStats = computeMasteryStats(mData);
    signals.mastery_pct = mStats.pct || 0;
  } else {
    signals.mastery_pct = 0;
  }

  // Reading
  signals.reading_done = localStorage.getItem('fl_daily_rule_read_' + date) === '1';

  // Brahmacharya
  if (typeof getBrahmaDaily === 'function' && typeof isCleanDay === 'function') {
    var bData = getBrahmaDaily(date);
    signals.brahma_clean = isCleanDay(bData);
    signals.urge = bData.urge || 0;
  } else {
    signals.brahma_clean = true;
    signals.urge = 0;
  }

  return signals;
}

// ── RENDER ──
function renderCheckin() {
  var container = document.getElementById('checkin-container');
  if (!container) return;

  var date = getEffectiveToday();
  var locked = typeof isDateLocked === 'function' && isDateLocked(date);
  var existing = getCheckin(date);
  var signals = pullCheckinSignals(date);
  var day = typeof getDayNumber === 'function' ? getDayNumber() : '—';
  var disAttr = locked ? ' disabled' : '';
  var html = '';

  // Lock banner
  if (locked && typeof getLockBannerHTML === 'function') {
    html += getLockBannerHTML(date);
  }

  // Header
  html += '<div style="text-align:center;margin-bottom:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:32px;font-weight:900;color:var(--green);letter-spacing:3px">DAY ' + day + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:2px;margin-top:4px">' + date + '</div>';
  if (existing.sealed) {
    html += '<div style="margin-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--green);letter-spacing:2px">SEALED</div>';
  }
  html += '</div>';

  // ── AUTO-PULLED SECTION ──
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);letter-spacing:2px;margin-bottom:10px">AUTO-PULLED</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:24px">';

  var cards = [
    { label: 'MORNING',   value: signals.morning_pct + '%',  ok: signals.morning_pct >= 80, panel: 'morning' },
    { label: 'MIDDAY',    value: signals.midday_pct + '%',   ok: signals.midday_pct >= 80, panel: 'midday' },
    { label: 'EVENING',   value: signals.evening_pct + '%',  ok: signals.evening_pct >= 80, panel: 'evening' },
    { label: 'GYM',       value: signals.gym_done ? 'DONE' : 'SKIP', ok: signals.gym_done, panel: 'gym-log' },
    { label: 'DEEP WORK', value: signals.deep_work_blocks + ' blk', ok: signals.deep_work_blocks >= 2, panel: 'deepwork' },
    { label: 'MASTERY',   value: signals.mastery_pct + '%',  ok: signals.mastery_pct >= 50, panel: 'mastery-daily' },
    { label: 'READING',   value: signals.reading_done ? 'DONE' : 'NO', ok: signals.reading_done, panel: 'daily-rule' },
    { label: 'FORTRESS',  value: signals.brahma_clean ? 'CLEAN' : 'BREACH', ok: signals.brahma_clean, panel: 'brahma-log' },
    { label: 'STOCKS',    value: existing.stocks_done ? (existing.stocks_count || '✓') : 'NO', ok: existing.stocks_done === true },
    { label: 'READING',   value: existing.reading_15min ? '15m ✓' : 'NO', ok: existing.reading_15min === true },
    { label: 'NO PHONE',  value: existing.no_phone_office !== false ? 'CLEAN' : '20KM!', ok: existing.no_phone_office !== false }
  ];

  cards.forEach(function(c) {
    var col = c.ok ? 'var(--green)' : 'var(--red, #ff4444)';
    var icon = c.ok ? '&#10003;' : '&#10007;';
    html += '<div onclick="switchPanel(\'' + c.panel + '\')" style="background:var(--bg3);border:1px solid ' + (c.ok ? 'rgba(0,229,160,0.15)' : 'rgba(255,68,68,0.15)') + ';border-radius:8px;padding:10px 12px;text-align:center;cursor:pointer;transition:border-color 0.2s" onmouseover="this.style.borderColor=\'rgba(0,212,255,0.3)\'" onmouseout="this.style.borderColor=\'' + (c.ok ? 'rgba(0,229,160,0.15)' : 'rgba(255,68,68,0.15)') + '\'">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:2px;margin-bottom:4px">' + c.label + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + col + '">' + c.value + '</div>';
    html += '<div style="font-size:14px;color:' + col + ';margin-top:2px">' + icon + '</div>';
    html += '</div>';
  });

  html += '</div>';

  // ── MORNING CHECK-IN: APP DATA UPDATED ──
  var appUpdated = existing.app_updated === true;
  html += '<div style="margin-bottom:20px;padding:16px;background:' + (appUpdated ? 'rgba(0,229,160,0.04)' : 'rgba(255,59,92,0.06)') + ';border:2px solid ' + (appUpdated ? 'rgba(0,229,160,0.2)' : 'rgba(255,59,92,0.3)') + ';border-radius:12px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
  html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:' + (appUpdated ? 'var(--green)' : 'var(--red, #FF3B5C)') + '">MORNING CHECK-IN</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">MANDATORY</div>';
  html += '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text);margin-bottom:12px;line-height:1.6">Have you updated your data / schedule in the application today?</div>';
  html += '<div class="bf-toggle" style="margin-bottom:8px">';
  html += '<div class="bf-toggle-btn' + (appUpdated ? ' active-no' : '') + '" onclick="setAppUpdated(true)"' + disAttr + ' style="font-weight:700;font-size:13px;min-height:48px;display:flex;align-items:center;justify-content:center">YES — UPDATED</div>';
  html += '<div class="bf-toggle-btn' + (!appUpdated ? ' active-yes' : '') + '" onclick="setAppUpdated(false)"' + disAttr + ' style="font-weight:700;font-size:13px;min-height:48px;display:flex;align-items:center;justify-content:center">NOT YET</div>';
  html += '</div>';
  if (!appUpdated) {
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--red, #FF3B5C);letter-spacing:1px;line-height:1.6">';
    html += '⚠ PENALTY IF NOT COMPLETED BY END OF DAY:<br>';
    html += '20 KM WALK or 40 KM CYCLING — NO EXCEPTIONS';
    html += '</div>';
  } else {
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--green);letter-spacing:1px">✓ Marked as updated. No penalty.</div>';
  }
  html += '</div>';

  // ── MANUAL SECTION ──
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);letter-spacing:2px;margin-bottom:12px">MANUAL LOG</div>';
  html += '<div style="display:flex;flex-direction:column;gap:16px">';

  // Food clean toggle
  var foodClean = existing.food_clean !== false;
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">FOOD CLEAN</div>';
  html += '<div class="bf-toggle">';
  html += '<div class="bf-toggle-btn' + (foodClean ? ' active-no' : '') + '" onclick="setCheckinToggle(\'food_clean\',true)"' + disAttr + '>YES</div>';
  html += '<div class="bf-toggle-btn' + (!foodClean ? ' active-yes' : '') + '" onclick="setCheckinToggle(\'food_clean\',false)"' + disAttr + '>NO</div>';
  html += '</div>';
  html += '<div id="ci-violation-wrap" style="margin-top:6px;display:' + (foodClean ? 'none' : 'block') + '">';
  html += '<input type="text" class="form-input" style="font-size:11px;padding:8px 10px" placeholder="What was the violation?" id="ci-food-violation" value="' + ((existing.food_violation || '').replace(/"/g, '&quot;')) + '" oninput="setCheckinField(\'food_violation\',this.value)"' + disAttr + '>';
  html += '</div></div>';

  // Wake time (default 03:15)
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">WAKE TIME</div>';
  html += '<input type="time" class="form-input" style="font-size:12px;padding:8px 10px" id="ci-wake" value="' + (existing.wake_time || '03:15') + '" oninput="setCheckinField(\'wake_time\',this.value)"' + disAttr + '>';
  html += '</div>';

  // Lights out (default 20:30)
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">LIGHTS OUT</div>';
  html += '<input type="time" class="form-input" style="font-size:12px;padding:8px 10px" id="ci-lights" value="' + (existing.lights_out || '20:30') + '" oninput="setCheckinField(\'lights_out\',this.value)"' + disAttr + '>';
  html += '</div>';

  // Fortress stayed out toggle — Sunday rule: 1 PM, other days: 6 PM
  var isSunday = new Date().getDay() === 0;
  var fortressLabel = isSunday ? 'STAYED OUT UNTIL 1 PM (Sunday)' : 'STAYED OUT UNTIL 6 PM';
  var fortress = existing.fortress_stayed_out !== false;
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">' + fortressLabel + '</div>';
  html += '<div class="bf-toggle">';
  html += '<div class="bf-toggle-btn' + (fortress ? ' active-no' : '') + '" onclick="setCheckinToggle(\'fortress_stayed_out\',true)"' + disAttr + '>YES</div>';
  html += '<div class="bf-toggle-btn' + (!fortress ? ' active-yes' : '') + '" onclick="setCheckinToggle(\'fortress_stayed_out\',false)"' + disAttr + '>NO</div>';
  html += '</div></div>';

  // ── FORTRESS: NO SMARTPHONE IN OFFICE ──
  var noPhone = existing.no_phone_office !== false;
  html += '<div style="padding:14px;background:' + (noPhone ? 'rgba(0,229,160,0.04)' : 'rgba(255,59,92,0.06)') + ';border:2px solid ' + (noPhone ? 'rgba(0,229,160,0.15)' : 'rgba(255,59,92,0.25)') + ';border-radius:12px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
  html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:' + (noPhone ? 'var(--green)' : 'var(--red, #FF3B5C)') + '">FORTRESS — NO SMARTPHONE IN OFFICE</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">MANDATORY</div>';
  html += '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text);margin-bottom:10px;line-height:1.6">Only Nokia/basic phone allowed in office. No smartphone. No exceptions.</div>';
  html += '<div class="bf-toggle">';
  html += '<div class="bf-toggle-btn' + (noPhone ? ' active-no' : '') + '" onclick="setCheckinToggle(\'no_phone_office\',true)"' + disAttr + ' style="font-weight:700;font-size:12px;min-height:44px;display:flex;align-items:center;justify-content:center">NO SMARTPHONE — CLEAN</div>';
  html += '<div class="bf-toggle-btn' + (!noPhone ? ' active-yes' : '') + '" onclick="setCheckinToggle(\'no_phone_office\',false)"' + disAttr + ' style="font-weight:700;font-size:12px;min-height:44px;display:flex;align-items:center;justify-content:center">TOOK PHONE</div>';
  html += '</div>';
  if (!noPhone) {
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--red, #FF3B5C);letter-spacing:1px;margin-top:8px;line-height:1.6">';
    html += '⚠ PENALTY: 20 KM RUN — LOG A SLIP NOW';
    html += '</div>';
  }
  html += '</div>';

  // ── STOCK MARKET ANALYSIS ──
  var stocksDone = existing.stocks_done === true;
  var stockCount = existing.stocks_count || '';
  html += '<div style="padding:14px;background:rgba(212,168,67,0.04);border:1px solid rgba(212,168,67,0.15);border-radius:12px">';
  html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--gold);margin-bottom:8px">STOCK MARKET ANALYSIS</div>';
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:10px">Minimum 10-20 stocks analysed daily</div>';
  html += '<div class="bf-toggle" style="margin-bottom:8px">';
  html += '<div class="bf-toggle-btn' + (stocksDone ? ' active-no' : '') + '" onclick="setCheckinToggle(\'stocks_done\',true)"' + disAttr + '>DONE</div>';
  html += '<div class="bf-toggle-btn' + (!stocksDone ? ' active-yes' : '') + '" onclick="setCheckinToggle(\'stocks_done\',false)"' + disAttr + '>NOT YET</div>';
  html += '</div>';
  html += '<input type="number" class="form-input" style="font-size:11px;padding:8px 10px" placeholder="How many stocks analysed?" id="ci-stocks-count" value="' + stockCount + '" oninput="setCheckinField(\'stocks_count\',parseInt(this.value)||0)"' + disAttr + '>';
  html += '</div>';

  // ── SUNDAY: 2-HOUR DEEP STOCKS ANALYSIS ──
  if (isSunday) {
    var deepStocks = existing.deep_stocks === true;
    html += '<div style="padding:14px;background:rgba(245,166,35,0.04);border:1px solid rgba(245,166,35,0.15);border-radius:12px">';
    html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--gold);margin-bottom:8px">SUNDAY — 2-HOUR DEEP STOCKS ANALYSIS</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:10px">Weekly deep dive: sectors, watchlist, portfolio review</div>';
    html += '<div class="bf-toggle">';
    html += '<div class="bf-toggle-btn' + (deepStocks ? ' active-no' : '') + '" onclick="setCheckinToggle(\'deep_stocks\',true)"' + disAttr + '>COMPLETED 2 HOURS</div>';
    html += '<div class="bf-toggle-btn' + (!deepStocks ? ' active-yes' : '') + '" onclick="setCheckinToggle(\'deep_stocks\',false)"' + disAttr + '>NOT YET</div>';
    html += '</div></div>';
  }

  // ── READING — 15 MINUTES DAILY ──
  var readingDone = existing.reading_15min === true;
  html += '<div style="padding:14px;background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.12);border-radius:12px">';
  html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--cyan);margin-bottom:8px">READING — 15 MINUTES</div>';
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:10px">Read a book for minimum 15 minutes daily</div>';
  html += '<div class="bf-toggle">';
  html += '<div class="bf-toggle-btn' + (readingDone ? ' active-no' : '') + '" onclick="setCheckinToggle(\'reading_15min\',true)"' + disAttr + '>READ TODAY</div>';
  html += '<div class="bf-toggle-btn' + (!readingDone ? ' active-yes' : '') + '" onclick="setCheckinToggle(\'reading_15min\',false)"' + disAttr + '>NOT YET</div>';
  html += '</div></div>';

  // Weekend tasks (show only on Saturday & Sunday)
  var dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    html += '<div style="margin-top:8px;padding:14px;background:rgba(245,166,35,0.04);border:1px solid rgba(245,166,35,0.15);border-radius:8px">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--gold);font-weight:700;margin-bottom:10px">WEEKEND TASKS</div>';
    if (dayOfWeek === 6) {
      // Saturday
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:8px">SATURDAY</div>';
      var satTasks = [
        { id: 'sat_laundry', label: 'Laundry — wash + dry' },
        { id: 'sat_batch_cook', label: 'Batch cook — larger portions for Sunday' },
        { id: 'sat_steam', label: 'Steam bath — 15-20 min + cold rinse' },
        { id: 'sat_hammam', label: 'Hammam scrub — kessa mitt full body' },
        { id: 'sat_hair_oil', label: 'Brahmi/Bhringraj hair oiling — leave overnight' },
        { id: 'sat_face_mask', label: 'Kesar + raw milk face mask — 15 min' },
        { id: 'sat_car_clean', label: 'Car interior clean' }
      ];
      var weekTasks = existing._weekendTasks || {};
      satTasks.forEach(function(t) {
        var done = weekTasks[t.id];
        html += '<div onclick="toggleWeekendTask(\'' + t.id + '\')" style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-family:var(--font-mono);font-size:11px;color:' + (done ? 'var(--green)' : 'var(--text)') + '">';
        html += '<span style="width:18px;height:18px;border:1px solid ' + (done ? 'var(--green)' : 'rgba(255,255,255,0.15)') + ';border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px">' + (done ? '✓' : '') + '</span>';
        html += t.label + '</div>';
      });
    } else {
      // Sunday
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:8px">SUNDAY — CAN RETURN HOME AFTER 1 PM</div>';
      var sunTasks = [
        { id: 'sun_abhyanga', label: 'Abhyanga full body self-massage — 10-15 min' },
        { id: 'sun_park', label: 'Park or nature sit — 1 hour minimum (Shinrin-yoku)' },
        { id: 'sun_friluftsliv', label: 'Friluftsliv — 20-30 min purposeless walk' },
        { id: 'sun_steam', label: 'Steam bath — second compulsory session' },
        { id: 'sun_face_mask', label: 'Kesar + raw milk face mask' },
        { id: 'sun_hair', label: 'Brahmi or bhringraj hair oiling' },
        { id: 'sun_perma', label: 'PERMA weekly audit — P E R M A each 1-10' },
        { id: 'sun_grocery', label: 'Grocery + weekly prep + soak methi' },
        { id: 'sun_room', label: 'Full room reset + clothes fold + wardrobe' },
        { id: 'sun_rest', label: 'Rest — minimal tasks only' }
      ];
      var weekTasks = existing._weekendTasks || {};
      sunTasks.forEach(function(t) {
        var done = weekTasks[t.id];
        html += '<div onclick="toggleWeekendTask(\'' + t.id + '\')" style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-family:var(--font-mono);font-size:11px;color:' + (done ? 'var(--green)' : 'var(--text)') + '">';
        html += '<span style="width:18px;height:18px;border:1px solid ' + (done ? 'var(--green)' : 'rgba(255,255,255,0.15)') + ';border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px">' + (done ? '✓' : '') + '</span>';
        html += t.label + '</div>';
      });
    }
    html += '</div>';
  }

  // Device-free home toggle
  var deviceFree = existing.device_free !== false;
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">DEVICE-FREE HOME</div>';
  html += '<div class="bf-toggle">';
  html += '<div class="bf-toggle-btn' + (deviceFree ? ' active-no' : '') + '" onclick="setCheckinToggle(\'device_free\',true)"' + disAttr + '>YES</div>';
  html += '<div class="bf-toggle-btn' + (!deviceFree ? ' active-yes' : '') + '" onclick="setCheckinToggle(\'device_free\',false)"' + disAttr + '>NO</div>';
  html += '</div></div>';

  // Mood slider
  var mood = existing.mood || 5;
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">MOOD <span id="ci-mood-val" style="color:var(--green)">' + mood + '</span>/10</div>';
  html += '<input type="range" min="1" max="10" value="' + mood + '" style="width:100%" id="ci-mood" oninput="document.getElementById(\'ci-mood-val\').textContent=this.value;setCheckinField(\'mood\',parseInt(this.value))"' + disAttr + '>';
  html += '</div>';

  // Energy slider
  var energy = existing.energy || 5;
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">ENERGY <span id="ci-energy-val" style="color:var(--green)">' + energy + '</span>/10</div>';
  html += '<input type="range" min="1" max="10" value="' + energy + '" style="width:100%" id="ci-energy" oninput="document.getElementById(\'ci-energy-val\').textContent=this.value;setCheckinField(\'energy\',parseInt(this.value))"' + disAttr + '>';
  html += '</div>';

  // Journal note
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">ONE-LINE REFLECTION</div>';
  html += '<textarea class="form-input" style="font-size:12px;padding:10px;min-height:48px;resize:vertical" placeholder="How did today feel?" id="ci-journal" oninput="setCheckinField(\'journal_note\',this.value)"' + disAttr + '>' + (existing.journal_note || '') + '</textarea>';
  html += '</div>';

  html += '</div>'; // end manual section

  // Seal button
  if (!locked) {
    html += '<div style="text-align:center;margin-top:24px">';
    html += '<button class="btn-primary" id="ci-seal-btn" onclick="sealTheDay()" style="font-size:13px;letter-spacing:3px;padding:14px 40px">';
    html += existing.sealed ? 'RE-SEAL THE DAY' : 'SEAL THE DAY';
    html += '</button></div>';
  }

  container.innerHTML = html;
}

// ── FIELD SETTERS ──
function toggleWeekendTask(taskId) {
  var date = getEffectiveToday();
  var data = getCheckin(date);
  if (!data._weekendTasks) data._weekendTasks = {};
  data._weekendTasks[taskId] = !data._weekendTasks[taskId];
  saveCheckin(date, data);
  renderCheckin();
}

function setCheckinToggle(field, value) {
  var date = getEffectiveToday();
  if (typeof isDateLocked === 'function' && isDateLocked(date)) { showLockWarning(); return; }
  var data = getCheckin(date);
  data[field] = value;
  saveCheckin(date, data);
  // Show/hide violation field for food_clean
  if (field === 'food_clean') {
    var wrap = document.getElementById('ci-violation-wrap');
    if (wrap) wrap.style.display = value ? 'none' : 'block';
  }
  renderCheckin();
}

function setAppUpdated(value) {
  var date = getEffectiveToday();
  if (typeof isDateLocked === 'function' && isDateLocked(date)) { showLockWarning(); return; }
  var data = getCheckin(date);
  data.app_updated = value;
  if (value) data.app_updated_at = new Date().toISOString();
  saveCheckin(date, data);
  renderCheckin();
}

function setCheckinField(field, value) {
  var date = getEffectiveToday();
  if (typeof isDateLocked === 'function' && isDateLocked(date)) { showLockWarning(); return; }
  var data = getCheckin(date);
  data[field] = value;
  saveCheckin(date, data);
}

// ── SEAL ──
function sealTheDay() {
  var date = getEffectiveToday();
  if (typeof isDateLocked === 'function' && isDateLocked(date)) { showLockWarning(); return; }

  var signals = pullCheckinSignals(date);
  var manual = getCheckin(date);

  var data = Object.assign({}, signals, {
    app_updated:          manual.app_updated === true,
    app_updated_at:       manual.app_updated_at || null,
    food_clean:           manual.food_clean !== false,
    food_violation:       manual.food_violation || '',
    wake_time:            manual.wake_time || '',
    lights_out:           manual.lights_out || '',
    fortress_stayed_out:  manual.fortress_stayed_out !== false,
    device_free:          manual.device_free !== false,
    mood:                 manual.mood || 5,
    energy:               manual.energy || 5,
    journal_note:         manual.journal_note || '',
    sealed:               true,
    sealed_at:            new Date().toISOString()
  });

  saveCheckin(date, data);

  // ── ENFORCEMENT: App data not updated → auto-create punishment slip ──
  if (!data.app_updated) {
    _createAppUpdateSlip(date);
  }

  var btn = document.getElementById('ci-seal-btn');
  if (btn && typeof flashBtn === 'function') flashBtn(btn, 'SEALED \u2713');

  renderCheckin();
}

// ── AUTO-PUNISHMENT: App data not updated by end of day ──
function _createAppUpdateSlip(date) {
  var slip = {
    id: 'slip_app_' + date + '_' + Date.now(),
    date: date,
    rule: 'App Data Update',
    category: 'DISCIPLINE VIOLATION',
    description: 'Failed to update application data/schedule for the day.',
    function_met: false,
    upstream_gap: 'Did not open and update the FirstLight app with daily stats.',
    insight: 'Application data must be updated daily — no exceptions.',
    penalty_type: '20km walk OR 40km cycling',
    penalty_km: 20,
    penalty_cycling_km: 40,
    penalty_status: 'pending',
    proof_url: null,
    created_at: new Date().toISOString(),
    immutable: true
  };

  // Save to localStorage slips array
  var slips = [];
  try { slips = JSON.parse(localStorage.getItem('fl_slips') || '[]'); } catch(e) {}

  // Check if slip already exists for this date (prevent duplicates on re-seal)
  var exists = slips.some(function(s) { return s.rule === 'App Data Update' && s.date === date; });
  if (exists) return;

  slips.push(slip);
  localStorage.setItem('fl_slips', JSON.stringify(slips));

  // Sync to Supabase
  if (typeof syncSave === 'function') {
    syncSave('slips', slip, 'id');
  }
  if (typeof sbFetch === 'function') {
    sbFetch('slips', 'POST', slip, '?on_conflict=id');
  }

  // Alert the user
  alert('⚠ PENALTY CREATED\n\nApp data was not updated today.\n\nPunishment: 20 KM walk OR 40 KM cycling\n\nThis slip is PERMANENT and cannot be deleted.');
}
 
