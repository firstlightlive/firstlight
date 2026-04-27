// ═══════════════════════════════════════════
// FIRST LIGHT — DAILY
// ═══════════════════════════════════════════

var today=(function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0')})();
if(document.getElementById('logDate')){document.getElementById('logDate').value=today;document.getElementById('logDate').min=today;document.getElementById('logDate').max=today;}
if(document.getElementById('reflDate'))document.getElementById('reflDate').textContent=today;
if(document.getElementById('jtDate'))document.getElementById('jtDate').textContent=today;

var _logFood = document.getElementById('logFood');
if (_logFood) _logFood.addEventListener('change', function() {
  var vg = document.getElementById('violationGroup');
  if (vg) vg.style.display = this.checked ? 'none' : '';
});

var _logMood = document.getElementById('logMood');
if (_logMood) _logMood.addEventListener('input', function() {
  var mv = document.getElementById('moodVal');
  if (mv) mv.textContent = this.value;
});

var _dailyLogForm = document.getElementById('dailyLogForm');
if (_dailyLogForm) _dailyLogForm.addEventListener('submit', function(e) {
  e.preventDefault();
  saveProofEntry({
    date: document.getElementById('logDate').value,
    wakeTime: document.getElementById('logWakeTime').value,
    sleepHrs: parseFloat(document.getElementById('logSleepHrs').value) || 0,
    runKm: parseFloat(document.getElementById('logRunKm').value) || 0,
    runStart: document.getElementById('logRunStart').value,
    runPace: document.getElementById('logRunPace').value,
    gym: document.getElementById('logGym').checked,
    muscle: document.getElementById('logMuscle').value,
    foodClean: document.getElementById('logFood').checked,
    violation: document.getElementById('logViolation').value,
    brahma: document.getElementById('logBrahma').checked,
    japa: document.getElementById('logJapa').checked,
    nasya: document.getElementById('logNasya').checked,
    breach: document.getElementById('logBreach').checked,
    mood: parseInt(document.getElementById('logMood').value),
    notes: document.getElementById('logNotes').value
  });
  flashBtn(this.querySelector('.btn-primary'), 'SEALED ✓');
  setTimeout(function() { if (typeof checkSealConditions === 'function') checkSealConditions(); }, 500);
});

var _statsForm = document.getElementById('statsForm');
if (_statsForm) _statsForm.addEventListener('submit', function(e) {
  e.preventDefault();
  saveTodayStats({
    sleepHrs: parseFloat(document.getElementById('statSleep').value) || 0,
    runKm: parseFloat(document.getElementById('statRunKm').value) || 0,
    runTime: document.getElementById('statRunTime').value,
    gym: document.getElementById('statGym').checked
  });
  flashBtn(this.querySelector('.btn-primary'), 'UPDATED ✓');
});

// ── Deep Work Date Override ──
var deepworkDate = null;

function initDeepWorkDateNav() {
  createDateNav('deepwork-date-nav', {
    days: 7,
    onSelect: function(dateStr) {
      deepworkDate = dateStr;
      loadDeepWorkForDate(dateStr);
    }
  });
}

function updateDwSessions() {
  var checked = document.querySelectorAll('#dwBlocks input[type="checkbox"]:checked').length;
  var el = document.getElementById('dwSessions');
  if (el) el.textContent = checked;
}

function saveDeepWork() {
  var dateStr = deepworkDate || getEffectiveToday();
  if (isDateLocked(dateStr)) { showLockWarning(); return; }
  var key = 'fl_deepwork_' + dateStr;
  var blocks = [];
  document.querySelectorAll('#dwBlocks .dw-block').forEach(function(b) {
    blocks.push({
      time: b.querySelector('.dw-time input') ? b.querySelector('.dw-time input').value : '',
      task: b.querySelectorAll('input[type="text"]')[1] ? b.querySelectorAll('input[type="text"]')[1].value : '',
      category: b.querySelector('select') ? b.querySelector('select').value : '',
      done: b.querySelector('input[type="checkbox"]') ? b.querySelector('input[type="checkbox"]').checked : false
    });
  });
  var dwData = { blocks: blocks, bigWin: document.getElementById('dwBigWin').value };
  localStorage.setItem(key, JSON.stringify(dwData));
  // Sync to Supabase
  if (typeof syncSave === 'function') {
    syncSave('deepwork_log', { date: dateStr, blocks: JSON.stringify(dwData.blocks), big_win: dwData.bigWin || '' }, 'date');
  }
  syncDeepWork(dateStr, dwData);
  markSaved();
  flashBtn(document.querySelector('#p-deepwork .btn-primary'), 'SAVED ✓');
}

function loadDeepWorkForDate(dateStr) {
  var key = 'fl_deepwork_' + dateStr;
  var data = JSON.parse(localStorage.getItem(key) || 'null');
  var dwBlocks = document.querySelectorAll('#dwBlocks .dw-block');

  var isSunday = new Date(dateStr + 'T12:00:00').getDay() === 0;
  var maxSlots = isSunday ? 5 : 10;
  dwBlocks.forEach(function(b, idx) { b.style.display = idx < maxSlots ? '' : 'none'; });

  var sessionsLabel = document.querySelector('#p-deepwork .panel-section-title');
  if (sessionsLabel) {
    var countSpan = sessionsLabel.querySelector('#dwSessions');
    if (countSpan && countSpan.parentElement) {
      countSpan.parentElement.textContent = '';
      countSpan.parentElement.appendChild(document.createTextNode('Sessions done: '));
      countSpan.textContent = '0';
      countSpan.parentElement.appendChild(countSpan);
      countSpan.parentElement.appendChild(document.createTextNode('/' + maxSlots + (isSunday ? ' (Sunday)' : '')));
    }
  }

  dwBlocks.forEach(function(b) {
    var ti = b.querySelector('.dw-time input'); if (ti) ti.value = '';
    var txs = b.querySelectorAll('input[type="text"]'); if (txs[1]) txs[1].value = '';
    var sel = b.querySelector('select'); if (sel) sel.value = 'Deep Work';
    var cb = b.querySelector('input[type="checkbox"]'); if (cb) cb.checked = false;
  });
  var bw = document.getElementById('dwBigWin'); if (bw) bw.value = '';
  if (data) {
    (data.blocks || []).forEach(function(b, i) {
      if (!dwBlocks[i]) return;
      var ti = dwBlocks[i].querySelector('.dw-time input'); if (ti) ti.value = b.time || '';
      var txs = dwBlocks[i].querySelectorAll('input[type="text"]'); if (txs[1]) txs[1].value = b.task || '';
      var sel = dwBlocks[i].querySelector('select'); if (sel) sel.value = b.category || 'Deep Work';
      var cb = dwBlocks[i].querySelector('input[type="checkbox"]'); if (cb) cb.checked = b.done || false;
    });
    if (data.bigWin && bw) bw.value = data.bigWin;
  }
  updateDwSessions();

  var locked = isDateLocked(dateStr);
  var dwPanel = document.getElementById('p-deepwork');
  if (dwPanel) {
    var eb = dwPanel.querySelector('.lock-banner'); if (eb) eb.remove();
    var saveBtn = dwPanel.querySelector('.btn-primary');
    var inputs = dwPanel.querySelectorAll('input, select, textarea');
    if (locked) {
      var banner = document.createElement('div'); banner.className = 'lock-banner';
      banner.innerHTML = getLockBannerHTML(dateStr);
      var dn = document.getElementById('deepwork-date-nav');
      if (dn && dn.nextSibling) dn.parentNode.insertBefore(banner, dn.nextSibling);
      if (saveBtn) saveBtn.style.display = 'none';
      inputs.forEach(function(inp) { inp.disabled = true; inp.style.opacity = '0.6'; });
      dwPanel.querySelectorAll('.dw-timer-btn').forEach(function(b) { b.style.display = 'none'; });
    } else {
      if (saveBtn) saveBtn.style.display = '';
      inputs.forEach(function(inp) { inp.disabled = false; inp.style.opacity = ''; });
      dwPanel.querySelectorAll('.dw-timer-btn').forEach(function(b) { b.style.display = ''; });
    }
  }
}

loadDeepWorkForDate(getEffectiveToday());
 
