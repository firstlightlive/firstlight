// ═══════════════════════════════════════════
// FIRST LIGHT — JOURNAL V2
// Multi-note · Key Insights · Weekly/Monthly/Yearly Review
// ═══════════════════════════════════════════

// ── Type / Category constants ──
var JN_TYPE_COLORS = { quick:'#00D4FF', morning:'#F5A623', evening:'#a78bfa', idea:'#00E676', gratitude:'#FC4C02' };
var JN_TYPE_ICONS  = { quick:'⚡', morning:'🌅', evening:'🌙', idea:'💡', gratitude:'🙏' };
var JN_MOOD_EMOJIS = { angry:'😤', sad:'😔', neutral:'😐', okay:'🙂', good:'😊', great:'😁', fire:'🔥' };
var JN_MOOD_VALUES = { fire:10, great:9, good:7, okay:5, neutral:4, sad:2, angry:1 };
var JN_MOOD_COLORS = { fire:'#00E676', great:'#00E676', good:'#00E676', okay:'#F5A623', neutral:'#F5A623', sad:'#FF5252', angry:'#FF5252' };
var JN_CAT_COLORS  = { learning:'#00D4FF', decision:'#F5A623', milestone:'#00E676', gratitude:'#FC4C02', warning:'#FF5252' };
var JN_CAT_ICONS   = { learning:'📖', decision:'⚡', milestone:'🏆', gratitude:'🙏', warning:'⚠' };

// ── State ──
var _jnCurrentDate = null;
var _jnEditId = null;

// ══════════════════════════════════════════════════════
// STORAGE HELPERS
// ══════════════════════════════════════════════════════
function jnGetNotes(date) {
  try { return JSON.parse(localStorage.getItem('fl_journal_notes_' + date) || '[]'); } catch(e) { return []; }
}
function jnSetNotes(date, notes) {
  localStorage.setItem('fl_journal_notes_' + date, JSON.stringify(notes));
  var dates = JSON.parse(localStorage.getItem('fl_journal_note_dates') || '{}');
  dates[date] = true;
  localStorage.setItem('fl_journal_note_dates', JSON.stringify(dates));
}
function jnGetInsight(date) {
  try { return JSON.parse(localStorage.getItem('fl_journal_insight_' + date) || 'null'); } catch(e) { return null; }
}
function jnSetInsight(date, insight) {
  localStorage.setItem('fl_journal_insight_' + date, JSON.stringify(insight));
  var dates = JSON.parse(localStorage.getItem('fl_journal_insight_dates') || '{}');
  dates[date] = true;
  localStorage.setItem('fl_journal_insight_dates', JSON.stringify(dates));
}
function jnGetReflection(date) {
  try {
    var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
    var e = all[date];
    if (typeof e === 'string') { try { e = JSON.parse(e); } catch(ex) { e = null; } }
    return e || null;
  } catch(ex) { return null; }
}
function _escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════
// TODAY'S LOG — INIT
// ══════════════════════════════════════════════════════
function initJournalToday() {
  _jnCurrentDate = getEffectiveToday();
  var dateEl = document.getElementById('jnCurrentDate');
  if (dateEl) dateEl.textContent = _jnCurrentDate;
  _jnEditId = null;
  var addBtn = document.getElementById('jnAddBtn');
  if (addBtn) addBtn.textContent = '+ ADD NOTE';
  renderJournalNotesList(_jnCurrentDate);
  loadJournalInsight(_jnCurrentDate);
  updateJnCharCount();
  // Cmd/Ctrl+Enter shortcut in textarea
  var ta = document.getElementById('jnNoteText');
  if (ta && !ta._jnBound) {
    ta._jnBound = true;
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addJournalNote(); }
    });
  }
}

function updateJnCharCount() {
  var ta = document.getElementById('jnNoteText');
  var ct = document.getElementById('jnCharCount');
  if (ta && ct) ct.textContent = ta.value.length + ' chars';
}

// ══════════════════════════════════════════════════════
// ADD / EDIT / DELETE NOTE
// ══════════════════════════════════════════════════════
function addJournalNote() {
  var date = _jnCurrentDate || getEffectiveToday();
  var ta = document.getElementById('jnNoteText');
  if (!ta || !ta.value.trim()) { if (ta) ta.focus(); return; }

  var typeEl   = document.getElementById('jnNoteType');
  var moodEl   = document.querySelector('#jnNoteMoodRow span.active');
  var energyEl = document.getElementById('jnNoteEnergy');

  var note = {
    id: _jnEditId || ('note_' + Date.now() + '_' + Math.random().toString(36).slice(2,7)),
    date: date,
    ts: new Date().toISOString(),
    content: ta.value.trim(),
    type: typeEl ? typeEl.value : 'quick',
    mood: moodEl ? moodEl.dataset.mood : null,
    energy: energyEl ? parseInt(energyEl.value) : null
  };

  var notes = jnGetNotes(date);
  if (_jnEditId) {
    var ei = notes.findIndex(function(n) { return n.id === _jnEditId; });
    if (ei >= 0) { note.ts = notes[ei].ts; notes[ei] = note; }
    else notes.unshift(note);
    _jnEditId = null;
    var addBtn = document.getElementById('jnAddBtn');
    if (addBtn) addBtn.textContent = '+ ADD NOTE';
  } else {
    notes.unshift(note);
  }
  jnSetNotes(date, notes);

  if (typeof syncSave === 'function') { syncSave('journal_notes', note, 'id'); }

  // Reset form
  ta.value = '';
  if (typeEl) typeEl.value = 'quick';
  if (energyEl) { energyEl.value = 5; var ev = document.getElementById('jnNoteEnergyVal'); if (ev) ev.textContent = '5'; }
  document.querySelectorAll('#jnNoteMoodRow span').forEach(function(s) { s.classList.remove('active'); });
  updateJnCharCount();
  renderJournalNotesList(date);
  var btn = document.getElementById('jnAddBtn');
  if (btn) flashBtn(btn, 'SAVED ✓');
}

function deleteJournalNote(date, noteId) {
  if (!confirm('Delete this note?')) return;
  var notes = jnGetNotes(date).filter(function(n) { return n.id !== noteId; });
  jnSetNotes(date, notes);
  renderJournalNotesList(date);
}

function editJournalNote(date, noteId) {
  var note = jnGetNotes(date).find(function(n) { return n.id === noteId; });
  if (!note) return;
  _jnEditId = noteId;
  var ta = document.getElementById('jnNoteText');
  var typeEl = document.getElementById('jnNoteType');
  var energyEl = document.getElementById('jnNoteEnergy');
  if (ta) { ta.value = note.content; ta.focus(); updateJnCharCount(); }
  if (typeEl) typeEl.value = note.type || 'quick';
  if (energyEl) {
    energyEl.value = note.energy || 5;
    var ev = document.getElementById('jnNoteEnergyVal');
    if (ev) ev.textContent = note.energy || 5;
  }
  document.querySelectorAll('#jnNoteMoodRow span').forEach(function(s) { s.classList.remove('active'); });
  if (note.mood) {
    var mEl = document.querySelector('#jnNoteMoodRow span[data-mood="' + note.mood + '"]');
    if (mEl) mEl.classList.add('active');
  }
  var addBtn = document.getElementById('jnAddBtn');
  if (addBtn) addBtn.textContent = 'UPDATE NOTE';
  var form = document.getElementById('jnCaptureForm');
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function selectJnMood(el) {
  el.parentElement.querySelectorAll('span').forEach(function(s) { s.classList.remove('active'); });
  el.classList.add('active');
}

// ══════════════════════════════════════════════════════
// RENDER NOTES LIST
// ══════════════════════════════════════════════════════
function renderJournalNotesList(date) {
  var container = document.getElementById('jnNotesList');
  var countEl   = document.getElementById('jnNotesCount');
  if (!container) return;
  var notes = jnGetNotes(date);
  if (countEl) countEl.textContent = notes.length ? '(' + notes.length + ')' : '';
  if (!notes.length) {
    container.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--text-dim);font-family:var(--font-mono);font-size:12px;letter-spacing:1px;border:1px dashed rgba(255,255,255,0.06);border-radius:10px">NO NOTES YET — START CAPTURING YOUR DAY</div>';
    return;
  }
  var html = '';
  notes.forEach(function(note) {
    var timeStr = '';
    try {
      var d = new Date(note.ts);
      var h = d.getHours(), m = d.getMinutes(), ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      timeStr = h + ':' + (m < 10 ? '0'+m : m) + ' ' + ampm;
    } catch(e) {}
    var tc = JN_TYPE_COLORS[note.type] || '#00D4FF';
    var ti = JN_TYPE_ICONS[note.type] || '⚡';
    var moodBadge = note.mood ? '<span style="font-size:15px" title="'+note.mood+'">' + (JN_MOOD_EMOJIS[note.mood]||'') + '</span>' : '';
    var energyBadge = note.energy ? '<span style="font-family:var(--font-mono);font-size:10px;padding:2px 6px;background:rgba(245,166,35,0.12);color:#F5A623;border-radius:4px">⚡'+note.energy+'</span>' : '';
    html += '<div style="position:relative;background:var(--bg3);border:1px solid '+tc+'1A;border-left:3px solid '+tc+';border-radius:10px;padding:14px 14px 12px 16px;margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">' +
      '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">'+timeStr+'</span>' +
      '<span style="padding:2px 8px;border-radius:4px;background:'+tc+'1A;color:'+tc+';font-family:var(--font-mono);font-size:9px;letter-spacing:1px;font-weight:700">'+ti+' '+(note.type||'quick').toUpperCase()+'</span>' +
      moodBadge + energyBadge +
      '<div style="margin-left:auto;display:flex;gap:4px">' +
      '<button onclick="editJournalNote(\''+date+'\',\''+note.id+'\')" style="background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.2);color:var(--cyan);font-size:10px;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:var(--font-mono);-webkit-tap-highlight-color:transparent">EDIT</button>' +
      '<button onclick="deleteJournalNote(\''+date+'\',\''+note.id+'\')" style="background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.2);color:var(--red);font-size:10px;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:var(--font-mono);-webkit-tap-highlight-color:transparent">✕</button>' +
      '</div></div>' +
      '<div style="font-size:13px;color:var(--text);line-height:1.75;white-space:pre-wrap">' + _escapeHtml(note.content) + '</div>' +
      '</div>';
  });
  container.innerHTML = html;
}

// ══════════════════════════════════════════════════════
// KEY INSIGHT
// ══════════════════════════════════════════════════════
function loadJournalInsight(date) {
  var insight = jnGetInsight(date);
  var textEl = document.getElementById('jnInsightText');
  var catEl  = document.getElementById('jnInsightCat');
  if (textEl) textEl.value = insight ? (insight.insight || '') : '';
  if (catEl)  catEl.value  = insight ? (insight.category || 'learning') : 'learning';
}

function saveJournalInsight() {
  var date   = _jnCurrentDate || getEffectiveToday();
  var textEl = document.getElementById('jnInsightText');
  var catEl  = document.getElementById('jnInsightCat');
  if (!textEl || !textEl.value.trim()) { if (textEl) textEl.focus(); return; }
  var existing = jnGetInsight(date);
  var insight = {
    id: (existing && existing.id) || ('ins_' + Date.now()),
    date: date,
    insight: textEl.value.trim(),
    category: catEl ? catEl.value : 'learning',
    created_at: new Date().toISOString()
  };
  jnSetInsight(date, insight);
  if (typeof syncSave === 'function') { syncSave('journal_insights', insight, 'id'); }
  var btn = document.getElementById('jnSaveInsightBtn');
  if (btn) flashBtn(btn, 'LOCKED IN ✓');
}

// ══════════════════════════════════════════════════════
// END-OF-DAY REFLECTION (mood selector for legacy compat)
// ══════════════════════════════════════════════════════
function selectMood(el) {
  el.parentElement.querySelectorAll('span').forEach(function(s) { s.classList.remove('active'); });
  el.classList.add('active');
}

function saveJournal() {
  var date = (typeof reflectionDate !== 'undefined' && reflectionDate) || getEffectiveToday();
  if (isDateLocked(date)) { showLockWarning(); return; }
  var activeMood = document.querySelector('#jMoodRow span.active');
  var entry = {
    date: date,
    aligned:    document.getElementById('jAligned')    ? document.getElementById('jAligned').value    : '',
    notAligned: document.getElementById('jNotAligned') ? document.getElementById('jNotAligned').value : '',
    wins:       document.getElementById('jWins')       ? document.getElementById('jWins').value       : '',
    changes:    document.getElementById('jChanges')    ? document.getElementById('jChanges').value    : '',
    improve:    document.getElementById('jImprove')    ? document.getElementById('jImprove').value    : '',
    mood:       activeMood ? activeMood.dataset.mood : '',
    energy:     document.getElementById('jEnergy') ? document.getElementById('jEnergy').value : '5',
    thoughts:   document.getElementById('jThoughts')   ? document.getElementById('jThoughts').value   : '',
    updatedAt:  new Date().toISOString()
  };
  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  all[date] = entry;
  localStorage.setItem('fl_journal', JSON.stringify(all));
  if (typeof syncSave === 'function') {
    syncSave('journal_entries', { date: date, entry: JSON.stringify(entry) }, 'date');
  }
  markSaved();
  var btn = document.querySelector('#p-reflection .btn-primary');
  if (btn) flashBtn(btn, 'SAVED ✓');
}

// ══════════════════════════════════════════════════════
// ARCHIVE — Calendar
// ══════════════════════════════════════════════════════
var _journalCalYear  = new Date().getFullYear();
var _journalCalMonth = new Date().getMonth();

function navigateJournalCal(dir) {
  _journalCalMonth += dir;
  if (_journalCalMonth > 11) { _journalCalMonth = 0; _journalCalYear++; }
  if (_journalCalMonth < 0)  { _journalCalMonth = 11; _journalCalYear--; }
  renderJournalCalendar();
}

function renderJournalCalendar() {
  var grid  = document.getElementById('journalCalGrid');
  var label = document.getElementById('journalCalLabel');
  if (!grid || !label) return;

  var months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  label.textContent = months[_journalCalMonth] + ' ' + _journalCalYear;

  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var firstDay   = new Date(_journalCalYear, _journalCalMonth, 1);
  var daysInMonth = new Date(_journalCalYear, _journalCalMonth + 1, 0).getDate();
  var startDow   = (firstDay.getDay() + 6) % 7;
  var today      = getEffectiveToday();

  var html = '';
  var dayNames = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
  dayNames.forEach(function(d) {
    html += '<div style="text-align:center;font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);padding:6px 0">'+d+'</div>';
  });
  for (var e = 0; e < startDow; e++) html += '<div></div>';

  for (var d = 1; d <= daysInMonth; d++) {
    var ds = _journalCalYear + '-' + String(_journalCalMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var entry = all[ds];
    if (typeof entry === 'string') { try { entry = JSON.parse(entry); } catch(ex) { entry = null; } }
    var hasNotes   = jnGetNotes(ds).length > 0;
    var hasInsight = !!jnGetInsight(ds);

    var bg = 'rgba(255,255,255,0.03)', border = '1px solid rgba(255,255,255,0.06)', textColor = 'var(--text-dim)';
    if (entry && entry.mood) {
      var mv = JN_MOOD_VALUES[entry.mood] || 0;
      if (mv >= 7)      { bg = 'rgba(0,230,118,0.15)'; border = '1px solid rgba(0,230,118,0.3)'; textColor = '#00E676'; }
      else if (mv >= 4) { bg = 'rgba(245,166,35,0.15)'; border = '1px solid rgba(245,166,35,0.3)'; textColor = '#F5A623'; }
      else              { bg = 'rgba(255,82,82,0.15)';  border = '1px solid rgba(255,82,82,0.3)';  textColor = '#FF5252'; }
    } else if (entry || hasNotes) {
      bg = 'rgba(0,212,255,0.08)'; border = '1px solid rgba(0,212,255,0.2)'; textColor = 'var(--text-muted)';
    }

    var isToday    = ds === today;
    var todayRing  = isToday ? 'box-shadow:0 0 0 2px var(--cyan);' : '';
    var insightDot = hasInsight ? '<div style="width:5px;height:5px;border-radius:50%;background:#F5A623;margin:2px auto 0"></div>' : '<div style="height:7px"></div>';

    html += '<div onclick="renderJournalDayDetail(\''+ds+'\')" style="text-align:center;padding:8px 4px 4px;border-radius:8px;cursor:pointer;background:'+bg+';border:'+border+';'+todayRing+'font-family:var(--font-mono);font-size:13px;font-weight:700;color:'+textColor+';min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:transform 0.15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation" onmouseenter="this.style.transform=\'scale(1.08)\'" onmouseleave="this.style.transform=\'scale(1)\'">'+d+insightDot+'</div>';
  }

  grid.innerHTML = html;
  renderJournalArchive();
}

// ── Day Detail ──
function renderJournalDayDetail(date) {
  var detailWrap = document.getElementById('journalDayDetail');
  var titleEl    = document.getElementById('journalDayDetailTitle');
  var bodyEl     = document.getElementById('journalDayDetailBody');
  if (!detailWrap || !titleEl || !bodyEl) return;

  var parts = date.split('-');
  var dt = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  titleEl.textContent = dayNames[dt.getDay()] + ', ' + date;

  var entry   = jnGetReflection(date);
  var notes   = jnGetNotes(date);
  var insight = jnGetInsight(date);

  if (!entry && !notes.length && !insight) {
    bodyEl.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--text-dim);font-family:var(--font-mono);font-size:13px;letter-spacing:1px">NO ENTRY FOR THIS DATE</div>';
    detailWrap.style.display = '';
    detailWrap.scrollIntoView({ behavior:'smooth', block:'nearest' });
    return;
  }

  var html = '';

  // Key Insight banner
  if (insight) {
    var cc = JN_CAT_COLORS[insight.category] || '#00D4FF';
    var ci = JN_CAT_ICONS[insight.category]  || '📖';
    html += '<div style="background:'+cc+'12;border:1px solid '+cc+'33;border-left:4px solid '+cc+';border-radius:10px;padding:16px;margin-bottom:20px">' +
      '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:'+cc+';margin-bottom:8px;font-weight:700">'+ci+' KEY INSIGHT — '+(insight.category||'learning').toUpperCase()+'</div>' +
      '<div style="font-size:14px;font-weight:600;color:var(--text);line-height:1.65">"'+_escapeHtml(insight.insight)+'"</div>' +
      '</div>';
  }

  // Mood + Energy
  if (entry && (entry.mood || entry.energy)) {
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">';
    if (entry.mood) {
      var mc = JN_MOOD_COLORS[entry.mood] || 'var(--text-muted)';
      html += '<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:'+mc+'22;border:1px solid '+mc+'44;font-family:var(--font-mono);font-size:12px;color:'+mc+'">'+(JN_MOOD_EMOJIS[entry.mood]||'')+' MOOD: '+entry.mood.toUpperCase()+'</div>';
    }
    if (entry.energy) {
      var ev = parseInt(entry.energy)||0;
      var ec = ev>=7?'#00E676':ev>=4?'#F5A623':'#FF5252';
      html += '<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:'+ec+'22;border:1px solid '+ec+'44;font-family:var(--font-mono);font-size:12px;color:'+ec+'">⚡ ENERGY: '+entry.energy+'/10</div>';
    }
    html += '</div>';
  }

  // Notes
  if (notes.length) {
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:12px;font-weight:700">NOTES ('+notes.length+')</div>';
    notes.forEach(function(note) {
      var timeStr = '';
      try { var d2=new Date(note.ts); var h=d2.getHours(),m=d2.getMinutes(); timeStr=(h<10?'0'+h:h)+':'+(m<10?'0'+m:m); } catch(e) {}
      var tc = JN_TYPE_COLORS[note.type]||'#00D4FF';
      html += '<div style="background:rgba(255,255,255,0.02);border-left:3px solid '+tc+';border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:8px">' +
        '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:5px">'+timeStr+' · '+(note.type||'quick').toUpperCase()+'</div>' +
        '<div style="font-size:13px;color:var(--text);line-height:1.7;white-space:pre-wrap">'+_escapeHtml(note.content)+'</div>' +
        '</div>';
    });
  }

  // Reflection fields
  if (entry) {
    if (entry.aligned)    html += _jnDetailBlock('ALIGNED',    entry.aligned,    '#00E676', true);
    if (entry.notAligned) html += _jnDetailBlock('NOT ALIGNED',entry.notAligned, '#FF5252', true);
    if (entry.wins)       html += _jnDetailBlock('WINS',       entry.wins,       '#F5A623', false);
    if (entry.changes)    html += _jnDetailBlock('CHANGES',    entry.changes,    '#00E676', false);
    if (entry.improve)    html += _jnDetailBlock('1% IMPROVE', entry.improve,    '#00D4FF', false);
    if (entry.thoughts)   html += _jnDetailBlock('THOUGHTS',   entry.thoughts,   'var(--text-muted)', false);
  }

  bodyEl.innerHTML = html;
  detailWrap.style.display = '';
  detailWrap.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function _jnDetailBlock(title, content, color, asBullets) {
  var h = '<div style="margin-bottom:16px">';
  h += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:'+color+';margin-bottom:8px;font-weight:700">'+title+'</div>';
  if (asBullets) {
    var lines = content.split(/[\n,]+/).map(function(l){return l.trim();}).filter(function(l){return l;});
    h += '<ul style="margin:0;padding-left:18px;color:var(--text);font-size:13px;line-height:1.8">';
    lines.forEach(function(l){ h += '<li>'+_escapeHtml(l)+'</li>'; });
    h += '</ul>';
  } else {
    h += '<div style="color:var(--text);font-size:13px;line-height:1.8;white-space:pre-wrap">'+_escapeHtml(content)+'</div>';
  }
  h += '</div>';
  return h;
}

// ── Archive list ──
function renderJournalArchive() {
  var container = document.getElementById('journalArchiveList');
  if (!container) return;
  var search = ((document.getElementById('journalSearch')||{}).value||'').toLowerCase();

  // Collect all dates
  var dateSet = {};
  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  Object.keys(all).forEach(function(d){ if(d.match(/^\d{4}-\d{2}-\d{2}$/)) dateSet[d]=true; });
  var noteDates = JSON.parse(localStorage.getItem('fl_journal_note_dates')||'{}');
  var insDates  = JSON.parse(localStorage.getItem('fl_journal_insight_dates')||'{}');
  Object.keys(noteDates).forEach(function(d){ dateSet[d]=true; });
  Object.keys(insDates).forEach(function(d){ dateSet[d]=true; });

  var dates = Object.keys(dateSet).sort().reverse();
  if (!dates.length) {
    container.innerHTML = '<div class="panel-section" style="text-align:center;color:var(--text-muted);font-family:var(--font-mono);font-size:13px">No journal entries yet.</div>';
    return;
  }

  var html = '', shown = 0;
  dates.forEach(function(d) {
    var entry = all[d];
    if (typeof entry === 'string') { try { entry = JSON.parse(entry); } catch(ex){ entry=null; } }
    var notes   = jnGetNotes(d);
    var insight = jnGetInsight(d);

    var searchTarget = [
      entry ? JSON.stringify(entry) : '',
      notes.map(function(n){ return n.content; }).join(' '),
      insight ? insight.insight : ''
    ].join(' ').toLowerCase();
    if (search && searchTarget.indexOf(search) === -1 && d.indexOf(search) === -1) return;

    shown++;
    var mood = entry && entry.mood ? (JN_MOOD_EMOJIS[entry.mood]||'') : '';
    var noteCount    = notes.length;
    var hasReflection = !!(entry && (entry.aligned || entry.thoughts || entry.wins));
    var hasInsight   = !!insight;
    var preview = (insight ? insight.insight : null) || (entry ? (entry.aligned||entry.thoughts) : null) || (notes.length ? notes[0].content : null) || '';
    var insightCatColor = hasInsight ? (JN_CAT_COLORS[insight.category]||'#F5A623') : '#F5A623';

    html += '<div onclick="this.querySelector(\'.je-full\').style.display=this.querySelector(\'.je-full\').style.display===\'none\'?\'block\':\'none\'" style="cursor:pointer;background:var(--bg3);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:10px;transition:border-color 0.15s" onmouseenter="this.style.borderColor=\'rgba(0,212,255,0.2)\'" onmouseleave="this.style.borderColor=\'rgba(255,255,255,0.06)\'">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
      '<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:2px;color:var(--cyan);font-weight:700">'+d+' '+mood+'</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
      (noteCount ? '<span style="padding:2px 7px;border-radius:4px;background:rgba(0,212,255,0.1);color:var(--cyan);font-family:var(--font-mono);font-size:9px;font-weight:700">'+noteCount+' NOTES</span>' : '') +
      (hasReflection ? '<span style="padding:2px 7px;border-radius:4px;background:rgba(0,230,118,0.1);color:#00E676;font-family:var(--font-mono);font-size:9px;font-weight:700">REFLECTION</span>' : '') +
      (hasInsight ? '<span style="padding:2px 7px;border-radius:4px;background:'+insightCatColor+'1A;color:'+insightCatColor+';font-family:var(--font-mono);font-size:9px;font-weight:700">'+(JN_CAT_ICONS[insight.category]||'💡')+' INSIGHT</span>' : '') +
      '</div></div>' +
      (preview ? '<div style="font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.65;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">'+_escapeHtml(preview.substring(0,180))+'</div>' : '') +
      '<div class="je-full" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)">' +
      _jnBuildFullEntry(d, entry, notes, insight) + '</div></div>';
  });

  if (!shown) {
    container.innerHTML = '<div class="panel-section" style="text-align:center;color:var(--text-muted);font-family:var(--font-mono);font-size:13px">No matching entries.</div>';
    return;
  }
  container.innerHTML = html;
}

function _jnBuildFullEntry(date, entry, notes, insight) {
  var html = '';
  if (insight) {
    var cc = JN_CAT_COLORS[insight.category]||'#00D4FF';
    html += '<div style="background:'+cc+'0F;border:1px solid '+cc+'2A;border-left:4px solid '+cc+';border-radius:8px;padding:12px;margin-bottom:12px">' +
      '<div style="font-family:var(--font-mono);font-size:9px;color:'+cc+';margin-bottom:4px;letter-spacing:1px">'+(JN_CAT_ICONS[insight.category]||'💡')+' KEY INSIGHT</div>' +
      '<div style="font-size:13px;font-weight:600;color:var(--text)">"'+_escapeHtml(insight.insight)+'"</div></div>';
  }
  notes.forEach(function(note) {
    var tc = JN_TYPE_COLORS[note.type]||'#00D4FF';
    var timeStr='';
    try { var d2=new Date(note.ts);var h=d2.getHours(),m=d2.getMinutes();timeStr=(h<10?'0'+h:h)+':'+(m<10?'0'+m:m); } catch(e) {}
    html += '<div style="border-left:3px solid '+tc+';padding:8px 12px;margin-bottom:8px;background:rgba(255,255,255,0.02);border-radius:0 6px 6px 0">' +
      '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:3px">'+timeStr+' · '+(note.type||'quick').toUpperCase()+'</div>' +
      '<div style="font-size:12px;color:var(--text-muted);line-height:1.65">'+_escapeHtml(note.content.substring(0,250))+(note.content.length>250?'…':'')+'</div></div>';
  });
  if (entry) {
    if (entry.aligned)    html += '<div style="margin-bottom:7px"><span style="font-family:var(--font-mono);font-size:9px;color:#00E676;letter-spacing:1px">ALIGNED: </span><span style="font-size:12px;color:var(--text-muted)">'+_escapeHtml(entry.aligned)+'</span></div>';
    if (entry.notAligned) html += '<div style="margin-bottom:7px"><span style="font-family:var(--font-mono);font-size:9px;color:#FF5252;letter-spacing:1px">NOT ALIGNED: </span><span style="font-size:12px;color:var(--text-muted)">'+_escapeHtml(entry.notAligned)+'</span></div>';
    if (entry.wins)       html += '<div style="margin-bottom:7px"><span style="font-family:var(--font-mono);font-size:9px;color:#F5A623;letter-spacing:1px">WINS: </span><span style="font-size:12px;color:var(--text-muted)">'+_escapeHtml(entry.wins)+'</span></div>';
    if (entry.improve)    html += '<div style="margin-bottom:7px"><span style="font-family:var(--font-mono);font-size:9px;color:#00D4FF;letter-spacing:1px">1% IMPROVE: </span><span style="font-size:12px;color:var(--text-muted)">'+_escapeHtml(entry.improve)+'</span></div>';
    if (entry.thoughts)   html += '<div style="margin-bottom:7px"><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:1px">THOUGHTS: </span><span style="font-size:12px;color:var(--text-muted)">'+_escapeHtml(entry.thoughts)+'</span></div>';
  }
  return html || '<div style="color:var(--text-dim);font-size:12px;font-family:var(--font-mono)">No content</div>';
}

// ══════════════════════════════════════════════════════
// REVIEW — Weekly / Monthly / Yearly
// ══════════════════════════════════════════════════════
var _jnReviewMode = 'week';

function switchJournalReview(mode) {
  _jnReviewMode = mode;
  document.querySelectorAll('.jrv-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.mode===mode); });
  renderJournalReview();
}

function renderJournalReview() {
  var container = document.getElementById('jnReviewContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-dim);font-family:var(--font-mono);font-size:12px">LOADING...</div>';
  if (_jnReviewMode === 'week')  { renderJournalReviewWeek(container); return; }
  if (_jnReviewMode === 'month') { renderJournalReviewMonth(container); return; }
  renderJournalReviewYear(container);
}

function _jnStatCard(label, value, color) {
  return '<div style="background:var(--bg3);border:1px solid '+color+'22;border-radius:10px;padding:14px;text-align:center">' +
    '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);margin-bottom:6px">'+label+'</div>' +
    '<div style="font-family:var(--font-mono);font-size:clamp(16px,3vw,22px);font-weight:700;color:'+color+'">'+value+'</div>' +
    '</div>';
}

function _jnCollectInsightsForMonth(mk) {
  var results = [];
  var dates = JSON.parse(localStorage.getItem('fl_journal_insight_dates')||'{}');
  Object.keys(dates).forEach(function(d) {
    if (d.startsWith(mk)) {
      var ins = jnGetInsight(d);
      if (ins) results.push({ date: d, insight: ins });
    }
  });
  results.sort(function(a,b){ return a.date>b.date?1:-1; });
  return results;
}

// ── WEEK ──
function renderJournalReviewWeek(container) {
  var all   = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var today = getEffectiveToday();
  var days  = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate()-i);
    days.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
  }

  var moodSum=0, moodCount=0, energySum=0, energyCount=0, notesCount=0, reflCount=0;
  var allInsights = [];
  days.forEach(function(d) {
    var entry = all[d];
    if (typeof entry==='string'){try{entry=JSON.parse(entry);}catch(e){entry=null;}}
    var ins   = jnGetInsight(d);
    var notes = jnGetNotes(d);
    notesCount += notes.length;
    if (entry && (entry.aligned||entry.thoughts||entry.wins)) reflCount++;
    if (entry && entry.mood) { moodSum += JN_MOOD_VALUES[entry.mood]||5; moodCount++; }
    if (entry && entry.energy) { energySum += parseInt(entry.energy)||5; energyCount++; }
    if (ins) allInsights.push({ date:d, insight:ins });
  });

  var avgMood   = moodCount   ? (moodSum/moodCount).toFixed(1)   : '—';
  var avgEnergy = energyCount ? (energySum/energyCount).toFixed(1) : '—';
  var moodColor = avgMood!=='—' ? (parseFloat(avgMood)>=7?'#00E676':parseFloat(avgMood)>=4?'#F5A623':'#FF5252') : 'var(--text-muted)';

  var html = '';
  // Stats
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:24px">';
  html += _jnStatCard('AVG MOOD',     avgMood+'/10',       moodColor);
  html += _jnStatCard('AVG ENERGY',   avgEnergy+'/10',     '#00D4FF');
  html += _jnStatCard('REFLECTIONS',  reflCount+'/7',      reflCount>=5?'#00E676':'#F5A623');
  html += _jnStatCard('NOTES',        String(notesCount),  '#a78bfa');
  html += '</div>';

  // Mood bars
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px;font-weight:700">MOOD — LAST 7 DAYS</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;align-items:end;height:80px;margin-bottom:4px">';
  days.forEach(function(d) {
    var entry = all[d];
    if (typeof entry==='string'){try{entry=JSON.parse(entry);}catch(e){entry=null;}}
    var mv  = entry && entry.mood ? (JN_MOOD_VALUES[entry.mood]||0) : 0;
    var col = entry && entry.mood ? (JN_MOOD_COLORS[entry.mood]||'#00D4FF') : 'rgba(255,255,255,0.05)';
    var emoji = entry && entry.mood ? (JN_MOOD_EMOJIS[entry.mood]||'') : '';
    html += '<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;height:80px">' +
      '<div style="font-size:13px">'+emoji+'</div>' +
      '<div style="width:100%;border-radius:4px 4px 0 0;background:'+col+';min-height:4px;height:'+Math.max(4,mv/10*55)+'px;transition:height 0.3s"></div>' +
      '</div>';
  });
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:24px">';
  days.forEach(function(d){ html += '<div style="text-align:center;font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">'+d.slice(8)+'</div>'; });
  html += '</div>';

  // Insights
  if (allInsights.length) {
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px;font-weight:700">KEY INSIGHTS THIS WEEK ('+allInsights.length+')</div>';
    allInsights.forEach(function(item) {
      var cc = JN_CAT_COLORS[item.insight.category]||'#00D4FF';
      var ci = JN_CAT_ICONS[item.insight.category]||'📖';
      html += '<div style="background:'+cc+'0E;border:1px solid '+cc+'2A;border-left:4px solid '+cc+';border-radius:8px;padding:12px 14px;margin-bottom:8px">' +
        '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:5px">'+ci+' '+(item.insight.category||'learning').toUpperCase()+' · '+item.date+'</div>' +
        '<div style="font-size:13px;color:var(--text);line-height:1.65">'+_escapeHtml(item.insight.insight)+'</div></div>';
    });
  } else {
    html += '<div style="text-align:center;padding:20px;color:var(--text-dim);font-family:var(--font-mono);font-size:12px;border:1px dashed rgba(255,255,255,0.06);border-radius:8px">NO KEY INSIGHTS CAPTURED THIS WEEK<br><span style="font-size:10px;margin-top:4px;display:block">Go to Today\'s Log → add your main insight</span></div>';
  }

  // Best day
  var bestDay = null, bestMv = 0;
  days.forEach(function(d) {
    var entry=all[d]; if(typeof entry==='string'){try{entry=JSON.parse(entry);}catch(e){entry=null;}}
    if (entry && entry.mood && (JN_MOOD_VALUES[entry.mood]||0) > bestMv) { bestMv=JN_MOOD_VALUES[entry.mood]; bestDay=d; }
  });
  if (bestDay) {
    var be=all[bestDay]; if(typeof be==='string'){try{be=JSON.parse(be);}catch(e){be=null;}}
    if (be) {
      html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin:20px 0 10px;font-weight:700">BEST DAY</div>';
      html += '<div style="background:rgba(0,230,118,0.07);border:1px solid rgba(0,230,118,0.18);border-radius:10px;padding:14px">' +
        '<div style="font-family:var(--font-mono);font-size:11px;color:#00E676;margin-bottom:6px">'+bestDay+' '+(JN_MOOD_EMOJIS[be.mood]||'')+'</div>' +
        (be.wins ? '<div style="font-size:13px;color:var(--text-muted)">'+_escapeHtml(be.wins.substring(0,220))+'</div>' : '') +
        '</div>';
    }
  }
  container.innerHTML = html;
}

// ── MONTH ──
function renderJournalReviewMonth(container) {
  var today = getEffectiveToday();
  var currMk = today.substring(0,7);
  var yr = parseInt(currMk.split('-')[0]);
  var mo = parseInt(currMk.split('-')[1]) - 1;
  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var mDates = Object.keys(all).filter(function(d){ return d.startsWith(currMk); });
  var moodSum=0, moodCount=0, energySum=0, energyCount=0;
  mDates.forEach(function(d) {
    var e=all[d]; if(typeof e==='string'){try{e=JSON.parse(e);}catch(ex){return;}}
    if (e && e.mood) { moodSum += JN_MOOD_VALUES[e.mood]||5; moodCount++; }
    if (e && e.energy) { energySum += parseInt(e.energy)||5; energyCount++; }
  });
  var allInsights = _jnCollectInsightsForMonth(currMk);

  var html = '';
  // Stats
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:24px">';
  html += _jnStatCard('DAYS JOURNALED', String(mDates.length), '#00D4FF');
  html += _jnStatCard('AVG MOOD',   moodCount?(moodSum/moodCount).toFixed(1)+'/10':'—', '#00E676');
  html += _jnStatCard('KEY INSIGHTS', String(allInsights.length), '#F5A623');
  html += '</div>';

  // Mini calendar
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px;font-weight:700">'+monthNames[mo].toUpperCase()+' '+yr+' — MOOD CALENDAR</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:24px">';
  var dayH = ['M','T','W','T','F','S','S'];
  dayH.forEach(function(d){ html+='<div style="text-align:center;font-family:var(--font-mono);font-size:9px;color:var(--text-dim);padding:4px 0">'+d+'</div>'; });
  var firstDay=new Date(yr,mo,1), daysInMonth=new Date(yr,mo+1,0).getDate(), startDow=(firstDay.getDay()+6)%7;
  for(var e=0;e<startDow;e++) html+='<div></div>';
  for(var d=1;d<=daysInMonth;d++) {
    var ds=yr+'-'+String(mo+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var entry=all[ds]; if(typeof entry==='string'){try{entry=JSON.parse(entry);}catch(ex){entry=null;}}
    var hasIns = !!jnGetInsight(ds);
    var bg=entry&&entry.mood?(JN_MOOD_COLORS[entry.mood]||'#00D4FF')+'33':'rgba(255,255,255,0.03)';
    var border=entry&&entry.mood?'1px solid '+(JN_MOOD_COLORS[entry.mood]||'#00D4FF')+'55':'1px solid rgba(255,255,255,0.05)';
    var insDot = hasIns ? '<div style="width:4px;height:4px;border-radius:50%;background:#F5A623;margin:1px auto 0"></div>' : '';
    html += '<div style="text-align:center;padding:5px 2px;border-radius:6px;background:'+bg+';border:'+border+';font-family:var(--font-mono);font-size:11px;color:var(--text)">' +
      (entry&&entry.mood?(JN_MOOD_EMOJIS[entry.mood]||d):d)+insDot+'</div>';
  }
  html += '</div>';

  // Insights grouped by category
  if (allInsights.length) {
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px;font-weight:700">ALL INSIGHTS — '+monthNames[mo].toUpperCase()+'</div>';
    var bycat = {};
    allInsights.forEach(function(item){ var c=item.insight.category||'learning'; if(!bycat[c]) bycat[c]=[]; bycat[c].push(item); });
    Object.keys(bycat).sort().forEach(function(cat) {
      var cc=JN_CAT_COLORS[cat]||'#00D4FF', ci=JN_CAT_ICONS[cat]||'📖';
      html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:'+cc+';margin:12px 0 8px;font-weight:700">'+ci+' '+cat.toUpperCase()+' ('+bycat[cat].length+')</div>';
      bycat[cat].forEach(function(item) {
        html += '<div style="background:'+cc+'0C;border-left:3px solid '+cc+';border-radius:0 6px 6px 0;padding:10px 12px;margin-bottom:6px">' +
          '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:3px">'+item.date+'</div>' +
          '<div style="font-size:13px;color:var(--text);line-height:1.65">'+_escapeHtml(item.insight.insight)+'</div></div>';
      });
    });
  } else {
    html += '<div style="text-align:center;padding:20px;color:var(--text-dim);font-family:var(--font-mono);font-size:12px;border:1px dashed rgba(255,255,255,0.06);border-radius:8px">NO INSIGHTS THIS MONTH YET</div>';
  }
  container.innerHTML = html;
}

// ── YEAR ──
function renderJournalReviewYear(container) {
  var today = getEffectiveToday();
  var yr    = parseInt(today.split('-')[0]);
  var all   = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var insDates   = JSON.parse(localStorage.getItem('fl_journal_insight_dates')||'{}');

  var monthStats = [];
  for (var m = 0; m < 12; m++) {
    var mk = yr + '-' + String(m+1).padStart(2,'0');
    var mDates = Object.keys(all).filter(function(d){ return d.startsWith(mk); });
    var mSum=0, mCount=0, mIns=0;
    mDates.forEach(function(d){
      var e=all[d]; if(typeof e==='string'){try{e=JSON.parse(e);}catch(ex){return;}}
      if (e&&e.mood){mSum+=JN_MOOD_VALUES[e.mood]||5;mCount++;}
    });
    Object.keys(insDates).forEach(function(d){ if(d.startsWith(mk)) mIns++; });
    monthStats.push({ month:m, key:mk, days:mDates.length, avgMood:mCount?mSum/mCount:0, insights:mIns });
  }

  var html = '';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:14px;font-weight:700">'+yr+' — YEAR IN REVIEW</div>';

  // Bar chart
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;color:var(--text-dim);margin-bottom:8px">MOOD BY MONTH</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:3px;align-items:end;height:90px;margin-bottom:4px">';
  var currMo = new Date().getMonth();
  monthStats.forEach(function(s) {
    var col = s.avgMood>=7?'#00E676':s.avgMood>=4?'#F5A623':s.avgMood>0?'#FF5252':'rgba(255,255,255,0.05)';
    var isFuture = s.month > currMo && yr >= new Date().getFullYear();
    html += '<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:90px">' +
      (s.days>0&&!isFuture ? '<div style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">'+s.days+'d</div>' : '<div></div>') +
      '<div style="width:100%;border-radius:3px 3px 0 0;background:'+(isFuture?'rgba(255,255,255,0.03)':col)+';min-height:2px;height:'+Math.max(isFuture?2:(s.days?4:2),s.avgMood/10*65)+'px"></div>' +
      '</div>';
  });
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:3px;margin-bottom:24px">';
  monthStats.forEach(function(s){ html+='<div style="text-align:center;font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">'+monthNames[s.month].substring(0,1)+'</div>'; });
  html += '</div>';

  // Summary
  var totalDays = monthStats.reduce(function(a,s){return a+s.days;},0);
  var totalIns  = monthStats.reduce(function(a,s){return a+s.insights;},0);
  var best = monthStats.reduce(function(b,s){return s.avgMood>b.avgMood?s:b;}, monthStats[0]);
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:24px">';
  html += _jnStatCard('DAYS JOURNALED', String(totalDays), '#00D4FF');
  html += _jnStatCard('KEY INSIGHTS',   String(totalIns),  '#F5A623');
  html += _jnStatCard('BEST MONTH', best&&best.days?monthNames[best.month]:'—', '#00E676');
  html += '</div>';

  // Milestones
  var milestones = [];
  Object.keys(insDates).forEach(function(d) {
    if (d.startsWith(String(yr)+'-')) {
      var ins = jnGetInsight(d);
      if (ins && ins.category==='milestone') milestones.push({ date:d, insight:ins });
    }
  });
  milestones.sort(function(a,b){ return a.date>b.date?1:-1; });
  if (milestones.length) {
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:#00E676;margin-bottom:12px;font-weight:700">🏆 MILESTONES '+yr+' ('+milestones.length+')</div>';
    milestones.forEach(function(item) {
      html += '<div style="background:rgba(0,230,118,0.07);border:1px solid rgba(0,230,118,0.18);border-left:4px solid #00E676;border-radius:8px;padding:12px 14px;margin-bottom:8px">' +
        '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:5px">'+item.date+'</div>' +
        '<div style="font-size:13px;font-weight:600;color:var(--text)">'+_escapeHtml(item.insight.insight)+'</div></div>';
    });
  } else {
    html += '<div style="text-align:center;padding:20px;color:var(--text-dim);font-family:var(--font-mono);font-size:12px;border:1px dashed rgba(255,255,255,0.06);border-radius:8px">NO MILESTONES RECORDED THIS YEAR<br><span style="font-size:10px;margin-top:4px;display:block">Add insights with category MILESTONE to track them</span></div>';
  }
  container.innerHTML = html;
}
