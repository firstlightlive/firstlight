// ═══════════════════════════════════════════
// FIRST LIGHT — JOURNAL
// ═══════════════════════════════════════════

function selectMood(el) {
  el.parentElement.querySelectorAll('span').forEach(function(s) { s.classList.remove('active'); });
  el.classList.add('active');
}

function selectJtMood(el) {
  el.parentElement.querySelectorAll('span').forEach(function(s) { s.classList.remove('active'); });
  el.classList.add('active');
}

function saveJournal() {
  // Use reflectionDate if set (from date nav), else today
  var date = (typeof reflectionDate !== 'undefined' && reflectionDate) || getEffectiveToday();
  if (isDateLocked(date)) { showLockWarning(); return; }
  var activeMood = document.querySelector('#jMoodRow span.active');
  var entry = {
    date: date,
    aligned: document.getElementById('jAligned').value,
    notAligned: document.getElementById('jNotAligned').value,
    wins: document.getElementById('jWins').value,
    changes: document.getElementById('jChanges').value,
    improve: document.getElementById('jImprove').value,
    mood: activeMood ? activeMood.dataset.mood : '',
    energy: document.getElementById('jEnergy').value,
    thoughts: document.getElementById('jThoughts').value
  };
  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  all[date] = entry;
  localStorage.setItem('fl_journal', JSON.stringify(all));
  if (typeof syncSave === 'function') {
    syncSave('journal_entries', { date: date, entry: JSON.stringify(entry) }, 'date');
  }
  syncJournal(date, entry);
  markSaved();
  flashBtn(document.querySelector('#p-reflection .btn-primary'), 'SAVED ✓');
}

function saveJournalToday() {
  var date = getEffectiveToday();
  var activeMood = document.querySelector('#jtMoodRow span.active');
  var entry = {
    date: date,
    mood: activeMood ? activeMood.dataset.mood : '',
    energy: document.getElementById('jtEnergy').value,
    entry: document.getElementById('jtEntry').value
  };
  // Merge into unified fl_journal (not fl_journal_quick)
  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var existing = all[date] || {};
  // Preserve reflection fields if they exist, add quick journal fields
  existing.mood = entry.mood || existing.mood;
  existing.energy = entry.energy || existing.energy;
  existing.thoughts = entry.entry || existing.thoughts;
  existing.date = date;
  all[date] = existing;
  localStorage.setItem('fl_journal', JSON.stringify(all));
  if (typeof syncSave === 'function') {
    syncSave('journal_entries', { date: date, entry: JSON.stringify(existing) }, 'date');
  }
  // Migrate: also save to fl_journal_quick for backwards compat
  var qAll = JSON.parse(localStorage.getItem('fl_journal_quick') || '{}');
  qAll[date] = entry;
  localStorage.setItem('fl_journal_quick', JSON.stringify(qAll));
  syncJournal(date, existing);
  markSaved();
  flashBtn(document.querySelector('#p-journal-today .btn-primary'), 'SAVED ✓');
}

// Load today's reflection
(function() {
  var date = getEffectiveToday();
  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var entry = all[date];
  if (entry) {
    if (entry.aligned) document.getElementById('jAligned').value = entry.aligned;
    if (entry.notAligned) document.getElementById('jNotAligned').value = entry.notAligned;
    if (entry.wins) document.getElementById('jWins').value = entry.wins;
    if (entry.changes) document.getElementById('jChanges').value = entry.changes;
    if (entry.improve) document.getElementById('jImprove').value = entry.improve;
    if (entry.mood) { var m = document.querySelector('#jMoodRow span[data-mood="' + entry.mood + '"]'); if (m) m.classList.add('active'); }
    if (entry.energy) document.getElementById('jEnergy').value = entry.energy;
    if (entry.thoughts) document.getElementById('jThoughts').value = entry.thoughts;
  }
  // Load quick journal
  var qAll = JSON.parse(localStorage.getItem('fl_journal_quick') || '{}');
  var qEntry = qAll[date];
  if (qEntry) {
    if (qEntry.mood) { var m = document.querySelector('#jtMoodRow span[data-mood="' + qEntry.mood + '"]'); if (m) m.classList.add('active'); }
    if (qEntry.energy) document.getElementById('jtEnergy').value = qEntry.energy;
    if (qEntry.entry) document.getElementById('jtEntry').value = qEntry.entry;
  }
})();

// ══════════════════════════════════════
// JOURNAL ARCHIVE
// ══════════════════════════════════════
function renderJournalArchive() {
  var container = document.getElementById('journalArchiveList');
  var search = (document.getElementById('journalSearch').value || '').toLowerCase();
  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var qAll = JSON.parse(localStorage.getItem('fl_journal_quick') || '{}');
  // Include voice entry dates
  var voiceEntries = (typeof getVoiceEntries === 'function') ? getVoiceEntries() : [];
  var voiceDates = {};
  voiceEntries.forEach(function(v) { voiceDates[v.date] = true; });
  // Merge all dates
  var dateSet = Object.assign({}, all, qAll);
  Object.keys(voiceDates).forEach(function(d) { dateSet[d] = dateSet[d] || true; });
  var dates = Object.keys(dateSet).sort().reverse();
  if (!dates.length) { container.innerHTML = '<div class="panel-section" style="text-align:center;color:var(--text-muted)">No journal entries yet.</div>'; return; }
  var html = '';
  dates.forEach(function(d) {
    var j = all[d] || {};
    var q = qAll[d] || {};
    var dayVoice = voiceEntries.filter(function(v) { return v.date === d; });
    var voiceText = dayVoice.map(function(v) { return v.transcript || ''; }).join(' ');
    var preview = j.aligned || j.thoughts || q.entry || voiceText.substring(0, 120) || '';
    // Search in text + voice transcripts
    if (search && preview.toLowerCase().indexOf(search) === -1 && d.indexOf(search) === -1 && voiceText.toLowerCase().indexOf(search) === -1) return;
    var moodEmojis = {angry:'😤',sad:'😔',neutral:'😐',okay:'🙂',good:'😊',great:'😁',fire:'🔥'};
    var mood = moodEmojis[j.mood || q.mood] || '';
    var hasVoice = dayVoice.length > 0;
    html += '<div class="journal-entry" onclick="this.querySelector(\'.je-full\').style.display=this.querySelector(\'.je-full\').style.display===\'none\'?\'block\':\'none\'">' +
      '<div class="journal-date">' + d + ' ' + mood + (hasVoice ? ' <span style="font-size:12px" title="' + dayVoice.length + ' voice entries">🎙</span>' : '') + '</div>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-top:6px">' + (preview.substring(0, 120) || 'No content') + (preview.length > 120 ? '...' : '') + '</div>' +
      '<div class="je-full" style="display:none;margin-top:12px;font-size:13px;color:var(--text);line-height:1.7;white-space:pre-wrap">' +
      (j.aligned ? '<strong style="color:var(--cyan)">ALIGNED:</strong> ' + j.aligned + '\n\n' : '') +
      (j.notAligned ? '<strong style="color:var(--red)">NOT ALIGNED:</strong> ' + j.notAligned + '\n\n' : '') +
      (j.wins ? '<strong style="color:var(--gold)">WINS:</strong> ' + j.wins + '\n\n' : '') +
      (j.changes ? '<strong style="color:var(--green)">CHANGES:</strong> ' + j.changes + '\n\n' : '') +
      (j.improve ? '<strong style="color:var(--cyan)">1% IMPROVE:</strong> ' + j.improve + '\n\n' : '') +
      (j.thoughts ? '<strong>THOUGHTS:</strong> ' + j.thoughts + '\n\n' : '') +
      (q.entry ? '<strong>JOURNAL:</strong> ' + q.entry + '\n\n' : '') +
      (hasVoice ? (typeof renderVoiceEntriesForDate === 'function' ? renderVoiceEntriesForDate(d) : '') : '') +
      '</div></div>';
  });
  container.innerHTML = html || '<div class="panel-section" style="text-align:center;color:var(--text-muted)">No matching entries.</div>';
}

// ══════════════════════════════════════
// JOURNAL CALENDAR REVIEW
// ══════════════════════════════════════
var _journalCalYear = new Date().getFullYear();
var _journalCalMonth = new Date().getMonth(); // 0-based

function navigateJournalCal(dir) {
  _journalCalMonth += dir;
  if (_journalCalMonth > 11) { _journalCalMonth = 0; _journalCalYear++; }
  if (_journalCalMonth < 0) { _journalCalMonth = 11; _journalCalYear--; }
  renderJournalCalendar();
}

function renderJournalCalendar() {
  var grid = document.getElementById('journalCalGrid');
  var label = document.getElementById('journalCalLabel');
  if (!grid || !label) return;

  var months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  label.textContent = months[_journalCalMonth] + ' ' + _journalCalYear;

  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var firstDay = new Date(_journalCalYear, _journalCalMonth, 1);
  var lastDay = new Date(_journalCalYear, _journalCalMonth + 1, 0);
  var daysInMonth = lastDay.getDate();
  // Monday = 0, Sunday = 6
  var startDow = (firstDay.getDay() + 6) % 7;

  var html = '';
  // Header row
  var dayNames = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
  for (var h = 0; h < 7; h++) {
    html += '<div style="text-align:center;font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);padding:6px 0">' + dayNames[h] + '</div>';
  }

  // Empty cells before first day
  for (var e = 0; e < startDow; e++) {
    html += '<div></div>';
  }

  // Day cells
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = _journalCalYear + '-' + String(_journalCalMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var entry = all[dateStr];
    var bg = 'rgba(255,255,255,0.03)';
    var border = '1px solid rgba(255,255,255,0.06)';
    var textColor = 'var(--text-dim)';

    if (entry && entry.mood) {
      var moodMap = {fire:10, great:9, good:7, okay:5, neutral:4, sad:2, angry:1};
      var moodVal = moodMap[entry.mood] || 0;
      if (moodVal >= 7) { bg = 'rgba(0,230,118,0.15)'; border = '1px solid rgba(0,230,118,0.3)'; textColor = '#00E676'; }
      else if (moodVal >= 4) { bg = 'rgba(245,166,35,0.15)'; border = '1px solid rgba(245,166,35,0.3)'; textColor = '#F5A623'; }
      else { bg = 'rgba(255,82,82,0.15)'; border = '1px solid rgba(255,82,82,0.3)'; textColor = '#FF5252'; }
    } else if (entry) {
      bg = 'rgba(0,212,255,0.08)'; border = '1px solid rgba(0,212,255,0.2)'; textColor = 'var(--text-muted)';
    }

    var isToday = dateStr === todayStr;
    var todayRing = isToday ? 'box-shadow:0 0 0 2px var(--cyan);' : '';

    html += '<div onclick="renderJournalDayDetail(\'' + dateStr + '\')" style="' +
      'text-align:center;padding:8px 4px;border-radius:8px;cursor:pointer;' +
      'background:' + bg + ';border:' + border + ';' + todayRing +
      'font-family:var(--font-mono);font-size:13px;font-weight:700;color:' + textColor + ';' +
      'min-height:44px;display:flex;align-items:center;justify-content:center;' +
      'transition:transform 0.15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation' +
      '" onmouseenter="this.style.transform=\'scale(1.1)\'" onmouseleave="this.style.transform=\'scale(1)\'">' +
      d + '</div>';
  }

  grid.innerHTML = html;
}

function renderJournalDayDetail(date) {
  var detailWrap = document.getElementById('journalDayDetail');
  var titleEl = document.getElementById('journalDayDetailTitle');
  var bodyEl = document.getElementById('journalDayDetailBody');
  if (!detailWrap || !titleEl || !bodyEl) return;

  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var entry = all[date];

  // Format date nicely
  var parts = date.split('-');
  var dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  titleEl.textContent = dayNames[dt.getDay()] + ', ' + date;

  if (!entry) {
    bodyEl.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--text-dim);font-family:var(--font-mono);font-size:13px;letter-spacing:1px">NO ENTRY FOR THIS DATE</div>';
    detailWrap.style.display = '';
    detailWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  var html = '';

  // Mood + Energy badges
  var moodEmojis = {angry:'😤',sad:'😔',neutral:'😐',okay:'🙂',good:'😊',great:'😁',fire:'🔥'};
  var moodColors = {angry:'#FF5252',sad:'#FF5252',neutral:'#F5A623',okay:'#F5A623',good:'#00E676',great:'#00E676',fire:'#00E676'};

  html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">';
  if (entry.mood) {
    var mc = moodColors[entry.mood] || 'var(--text-muted)';
    html += '<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:' + mc + '22;border:1px solid ' + mc + '44;font-family:var(--font-mono);font-size:12px;color:' + mc + '">' +
      (moodEmojis[entry.mood] || '') + ' MOOD: ' + entry.mood.toUpperCase() + '</div>';
  }
  if (entry.energy) {
    var eVal = parseInt(entry.energy) || 0;
    var ec = eVal >= 7 ? '#00E676' : eVal >= 4 ? '#F5A623' : '#FF5252';
    html += '<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:' + ec + '22;border:1px solid ' + ec + '44;font-family:var(--font-mono);font-size:12px;color:' + ec + '">⚡ ENERGY: ' + entry.energy + '/10</div>';
  }
  html += '</div>';

  // Aligned / Not Aligned as bullet lists
  if (entry.aligned) {
    html += _journalDetailBlock('ALIGNED', entry.aligned, '#00E676', true);
  }
  if (entry.notAligned) {
    html += _journalDetailBlock('NOT ALIGNED', entry.notAligned, '#FF5252', true);
  }

  // Text blocks
  if (entry.wins) { html += _journalDetailBlock('WINS', entry.wins, '#F5A623', false); }
  if (entry.changes) { html += _journalDetailBlock('CHANGES', entry.changes, '#00E676', false); }
  if (entry.improve) { html += _journalDetailBlock('1% IMPROVE', entry.improve, '#00D4FF', false); }
  if (entry.thoughts) { html += _journalDetailBlock('THOUGHTS', entry.thoughts, 'var(--text-muted)', false); }

  bodyEl.innerHTML = html;
  detailWrap.style.display = '';
  detailWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _journalDetailBlock(title, content, color, asBullets) {
  var h = '<div style="margin-bottom:16px">';
  h += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:' + color + ';margin-bottom:8px;font-weight:700">' + title + '</div>';
  if (asBullets) {
    var lines = content.split(/[\n,]+/).map(function(l) { return l.trim(); }).filter(function(l) { return l; });
    h += '<ul style="margin:0;padding-left:18px;color:var(--text);font-size:13px;line-height:1.8">';
    lines.forEach(function(l) { h += '<li>' + l + '</li>'; });
    h += '</ul>';
  } else {
    h += '<div style="color:var(--text);font-size:13px;line-height:1.8;white-space:pre-wrap">' + content + '</div>';
  }
  h += '</div>';
  return h;
}

// ══════════════════════════════════════
// MONTHLY GRID
// ══════════════════════════════════════
var MONTHLY_GRIDS = {
  morning: [
    'Wake+Scraper+Oil+Dive',
    'Brush+Fenugreek',
    'Marma+Pranayama+Japa',
    'Chyawanprash+Collagen',
    'Run—Iron Covenant',
    'Stability+Gym',
    'Barefoot sunlight 5min',
    'Ikigai spoken aloud',
    'All supplements taken',
    'Deep work blocks done'
  ],
  evening: [
    'Ginger+lime before meal',
    'No food after 6 PM',
    'Loban+Dive reflex',
    'Gua Sha+Coconut oil',
    'Nasya+Mula Bandha+Abhyanga',
    'Shilajit 7:00 PM',
    'Milk+Ashwagandha 8:00',
    'Examen+Wins+Replay',
    'Gratitude+Trataka+Tape',
    'Lights out 8:00 PM'
  ],
  weekly: [
    'Wed—Hair+Abhyanga',
    'Thu—Swim+Sauna',
    'Sat—Swim+Sauna+Hammam',
    'Sun—Nature+Swim+Sauna',
    'Sun—PERMA audit',
    'Social covenant',
    'Ekadasi fast (2x/month)'
  ],
  supplements: [
    'Collagen+lemon (3:58)',
    'Creatine+L-Carnitine (4:00)',
    'D3+K2+Omega-3+CDP',
    'Mucuna/Tyrosine (NEVER both)',
    'PM—Shilajit (7:00)',
    'PM—Mg+Triphala+Glycine',
    'PM—Milk+Ashwa+B.seed (8:00)'
  ],
  metrics: [
    'Weight (kg)',
    'Sleep (hrs) / Run (km)'
  ]
};
 
