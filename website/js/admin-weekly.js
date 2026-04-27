// ═══════════════════════════════════════════
// FIRST LIGHT — WEEKLY
// ═══════════════════════════════════════════

function buildWeeklyReview() {
  var container = document.getElementById('weeklyReviewContent');
  if (!container) return;
  var today = new Date();
  var isSunday = today.getDay() === 0;
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

  // Week runs Mon-Sun
  var monday = new Date(today);
  monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7));

  function buildWeekData(weekMonday) {
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(weekMonday); d.setDate(d.getDate() + i);
      var key = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
      var mornDone = JSON.parse(localStorage.getItem('fl_rituals_morning_' + key) || '[]');
      var eveDone = JSON.parse(localStorage.getItem('fl_rituals_evening_' + key) || '[]');
      var mornTotal = getRitualDefs('morning').filter(function(r){return r.active !== false}).length || 1;
      var eveTotal = getRitualDefs('evening').filter(function(r){return r.active !== false}).length || 1;
      days.push({ date:key, dayName:dayNames[d.getDay()], dayNum:d.getDate(), isToday:key===(today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0')),
        mornPct:Math.round(mornDone.length/mornTotal*100), evePct:Math.round(eveDone.length/eveTotal*100) });
    }
    var avgMorn = Math.round(days.reduce(function(s,d){return s+d.mornPct},0)/7);
    var avgEve = Math.round(days.reduce(function(s,d){return s+d.evePct},0)/7);
    return {days:days, avgMorn:avgMorn, avgEve:avgEve, overall:Math.round((avgMorn+avgEve)/2)};
  }

  var currentWeek = buildWeekData(monday);
  var html = '';

  // Lock banner on non-Sundays
  if (!isSunday) {
    html += '<div style="padding:16px;background:rgba(255,68,68,0.05);border:1px solid rgba(255,68,68,0.15);border-radius:8px;margin-bottom:20px;text-align:center">';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:#FF4444;letter-spacing:2px">REVIEW LOCKED — EDITABLE ON SUNDAYS ONLY</div></div>';
  }

  // KPIs
  var perfectDays = currentWeek.days.filter(function(d){return d.mornPct>=90&&d.evePct>=90}).length;
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px">';
  html += '<div class="panel-section" style="text-align:center;padding:20px;margin:0"><div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:var(--cyan)">'+currentWeek.avgMorn+'%</div><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-top:4px">AVG MORNING</div></div>';
  html += '<div class="panel-section" style="text-align:center;padding:20px;margin:0"><div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:var(--gold)">'+currentWeek.avgEve+'%</div><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-top:4px">AVG EVENING</div></div>';
  html += '<div class="panel-section" style="text-align:center;padding:20px;margin:0"><div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:var(--green)">'+perfectDays+'/7</div><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-top:4px">90%+ DAYS</div></div>';
  html += '<div class="panel-section" style="text-align:center;padding:20px;margin:0"><div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:var(--text)">'+currentWeek.overall+'%</div><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-top:4px">OVERALL</div></div>';
  html += '</div>';

  // Daily breakdown
  html += '<div class="panel-section"><div class="panel-section-title">THIS WEEK (MON-SUN)</div>';
  currentWeek.days.forEach(function(day) {
    var totalPct = Math.round((day.mornPct+day.evePct)/2);
    var barColor = totalPct>=90?'var(--green)':totalPct>=60?'var(--cyan)':totalPct>=30?'var(--gold)':'var(--red)';
    html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(0,212,255,0.04)">';
    html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:'+(day.isToday?'var(--cyan)':'var(--text-muted)')+';min-width:36px">'+day.dayName+'</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);min-width:24px">'+day.dayNum+'</div>';
    html += '<div style="flex:1;display:flex;align-items:center;gap:6px"><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);min-width:16px">AM</div><div style="flex:1;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+day.mornPct+'%;background:var(--cyan);border-radius:4px"></div></div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);min-width:28px;text-align:right">'+day.mornPct+'%</div></div>';
    html += '<div style="flex:1;display:flex;align-items:center;gap:6px"><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);min-width:16px">PM</div><div style="flex:1;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+day.evePct+'%;background:var(--gold);border-radius:4px"></div></div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);min-width:28px;text-align:right">'+day.evePct+'%</div></div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:'+barColor+';min-width:36px;text-align:right">'+totalPct+'%</div></div>';
  });
  html += '</div>';

  // 4-week history
  html += '<div class="panel-section"><div class="panel-section-title">4-WEEK HISTORY</div>';
  var prevOverall = null;
  for (var w = 0; w < 4; w++) {
    var wm = new Date(monday); wm.setDate(wm.getDate() - (w * 7));
    var wData = buildWeekData(wm);
    var label = (wm.getFullYear()+'-'+String(wm.getMonth()+1).padStart(2,'0')+'-'+String(wm.getDate()).padStart(2,'0'));
    var delta = prevOverall !== null ? wData.overall - prevOverall : 0;
    var arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
    var arrowCol = delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-dim)';
    html += '<div style="display:grid;grid-template-columns:100px 1fr 60px 50px;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(0,212,255,0.04)">';
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:'+(w===0?'var(--cyan)':'var(--text-muted)')+'">'+label+'</div>';
    html += '<div class="prog-bar" style="margin:0"><div class="prog-fill" style="width:'+wData.overall+'%;background:'+(wData.overall>=80?'var(--green)':'var(--gold)')+'"></div></div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);text-align:right">'+wData.overall+'%</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:'+arrowCol+';text-align:right">'+(w>0?arrow+Math.abs(delta):'')+'</div></div>';
    prevOverall = wData.overall;
  }
  html += '</div>';

  container.innerHTML = html;
}

// WEEKLY SCHEDULE SYSTEM
// ══════════════════════════════════════

var weekOffset = 0;

// Day-specific tasks from the PDF
var WEEKLY_TASKS = {
  1: { // Monday
    title: 'MONDAY — HOUSE TASK',
    items: [
      { id: 'ht_mon', title: 'Laundry — wash + dry', desc: 'Weekly laundry rotation. 6:50 PM slot.', cat: 'MOVE' }
    ]
  },
  2: { // Tuesday
    title: 'TUESDAY — HOUSE TASK',
    items: [
      { id: 'ht_tue', title: 'Room deep clean — floor and surfaces', desc: 'Thorough clean. 6:50 PM slot.', cat: 'MOVE' }
    ]
  },
  3: { // Wednesday
    title: 'WEDNESDAY — HOUSE TASK + DEEP RITUALS',
    items: [
      { id: 'ht_wed', title: 'Clothes fold + wardrobe + Hair oiling + Abhyanga', desc: 'Brahmi/Bhringraj oiling. 6:50 PM slot.', cat: 'OIL' },
      { id: 'dr_wed_hair', title: 'Brahmi or bhringraj hair oiling — scalp massage 5 min, leave overnight', desc: 'Deep ritual. Evening.', cat: 'OIL' },
      { id: 'dr_wed_abhyanga', title: 'Abhyanga full body self-massage — warm sesame oil, 10 min before shower', desc: 'Warm sesame oil. Full body. Ayurvedic.', cat: 'AYUR' }
    ]
  },
  4: { // Thursday
    title: 'THURSDAY — HOUSE TASK',
    items: [
      { id: 'ht_thu', title: 'Bathroom + kitchen wipe', desc: '6:50 PM slot.', cat: 'MOVE' }
    ]
  },
  5: { // Friday
    title: 'FRIDAY — HOUSE TASK',
    items: [
      { id: 'ht_fri', title: 'Car interior clean', desc: '6:50 PM slot.', cat: 'MOVE' }
    ]
  },
  6: { // Saturday
    title: 'SATURDAY — DEEP RESTORATION',
    items: [
      { id: 'ht_sat', title: 'Batch cook — larger portions for Sunday', desc: '6:50 PM slot.', cat: 'FUEL' },
      { id: 'dr_sat_steam', title: 'Steam bath compulsory — 15-20 min, finish with cold rinse', desc: 'Deep restoration. Evening.', cat: 'BIOHACK' },
      { id: 'dr_sat_hammam', title: 'Hammam scrub — kessa mitt full body exfoliation after steam', desc: 'Full body exfoliation after steam.', cat: 'SKIN' },
      { id: 'dr_sat_hair', title: 'Brahmi or bhringraj hair oiling — leave overnight', desc: 'Scalp nourishment. Leave overnight.', cat: 'OIL' },
      { id: 'dr_sat_mask', title: 'Kesar + raw milk face mask — 2 strands saffron, 15 min, wash off', desc: 'Saffron face mask. 15 minutes.', cat: 'SKIN' }
    ]
  },
  0: { // Sunday
    title: 'SUNDAY — FULL RESET',
    items: [
      { id: 'ht_sun', title: 'Rest — minimal tasks only', desc: 'Recovery day for house tasks.', cat: 'MOVE' },
      { id: 'dr_sun_abhyanga', title: 'Abhyanga full body self-massage — warm sesame oil 10-15 min', desc: 'Morning. Before shower.', cat: 'AYUR' },
      { id: 'dr_sun_nature', title: 'Park or nature sit — 1 hour minimum. Solitude. No phone. Shinrin-yoku.', desc: 'Japanese forest bathing. Minimum 1 hour. Complete solitude.', cat: 'MOVE' },
      { id: 'dr_sun_walk', title: 'Friluftsliv — 20-30 min purposeless walk. No route. No destination.', desc: 'Norwegian outdoor philosophy. No phone. No destination.', cat: 'MOVE' },
      { id: 'dr_sun_steam', title: 'Steam bath — second compulsory session of the week', desc: 'Evening. Second session this week.', cat: 'BIOHACK' },
      { id: 'dr_sun_mask', title: 'Kesar + raw milk face mask', desc: 'Second mask this week.', cat: 'SKIN' },
      { id: 'dr_sun_hair', title: 'Brahmi or bhringraj hair oiling', desc: 'Evening hair treatment.', cat: 'OIL' },
      { id: 'dr_sun_grocery', title: 'Grocery + weekly prep + soak methi + room full deep reset', desc: 'Full prep for next week.', cat: 'FUEL' }
    ]
  }
};

var catColorsMap = {
  SACRED:{bg:'rgba(255,153,51,0.08)',c:'#FF9933'}, AYUR:{bg:'rgba(0,229,160,0.08)',c:'#00E5A0'},
  BIOHACK:{bg:'rgba(0,212,255,0.08)',c:'#00D4FF'}, FUEL:{bg:'rgba(212,160,23,0.08)',c:'#D4A017'},
  MIND:{bg:'rgba(224,64,251,0.08)',c:'#E040FB'}, MOVE:{bg:'rgba(255,65,54,0.08)',c:'#FF4136'},
  SKIN:{bg:'rgba(255,105,180,0.08)',c:'#FF69B4'}, SLEEP:{bg:'rgba(112,174,255,0.08)',c:'#70AEFF'},
  OIL:{bg:'rgba(245,166,35,0.08)',c:'#F5A623'}
};

function getWeekStart(offset) {
  var d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1 + (offset * 7)); // Monday
  d.setHours(0,0,0,0);
  return d;
}

function getWeekKey(offset) {
  var start = getWeekStart(offset);
  return (start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0')+'-'+String(start.getDate()).padStart(2,'0'));
}

function getWeeklyData(weekKey) {
  try { return JSON.parse(localStorage.getItem('fl_weekly_' + weekKey) || '{}'); } catch(e) { return {}; }
}

function saveWeeklyData(weekKey, data) {
  if (isWeekLocked(weekKey)) { showLockWarning(); return; }
  localStorage.setItem('fl_weekly_' + weekKey, JSON.stringify(data));
  if (typeof syncSave === 'function') {
    syncSave('weekly_schedule', { week_key: weekKey, data: JSON.stringify(data) }, 'week_key');
  }
  markSaved();
  syncWeeklySchedule(weekKey, data);
}

function changeWeek(dir) {
  if (dir === 0) weekOffset = 0;
  else weekOffset += dir;
  renderWeeklySchedule();
}

function renderWeeklySchedule() {
  var start = getWeekStart(weekOffset);
  var weekKey = (start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0')+'-'+String(start.getDate()).padStart(2,'0'));
  var data = getWeeklyData(weekKey);
  var today = new Date(); today.setHours(0,0,0,0);
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  // Week range label
  var end = new Date(start); end.setDate(end.getDate() + 6);
  var lbl = document.getElementById('weekRangeLabel');
  if (lbl) lbl.textContent = start.getDate() + ' ' + monthNames[start.getMonth()] + ' — ' + end.getDate() + ' ' + monthNames[end.getMonth()] + ' ' + end.getFullYear();

  // 7-day strip
  var strip = document.getElementById('weekDayStrip');
  if (strip) {
    var stripHtml = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(start); d.setDate(d.getDate() + i);
      var isToday = d.getTime() === today.getTime();
      var isPast = d < today;
      var dayKey = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
      // Count completed tasks for this day
      var dayNum = d.getDay();
      var tasks = WEEKLY_TASKS[dayNum] ? WEEKLY_TASKS[dayNum].items : [];
      var doneTasks = tasks.filter(function(t) { return data[t.id]; }).length;
      var pct = tasks.length ? Math.round(doneTasks / tasks.length * 100) : 0;
      var borderColor = isToday ? 'var(--cyan)' : 'rgba(0,212,255,0.06)';
      var bgColor = isToday ? 'var(--cyan-dim)' : 'var(--bg3)';
      var textColor = isToday ? 'var(--cyan)' : isPast ? 'var(--text-muted)' : 'var(--text-dim)';

      stripHtml += '<div style="text-align:center;padding:10px 4px;background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:8px;cursor:pointer" onclick="showDayTasks(' + dayNum + ',\'' + dayKey + '\')">';
      stripHtml += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:' + textColor + '">' + dayNames[d.getDay()] + '</div>';
      stripHtml += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:' + textColor + '">' + d.getDate() + '</div>';
      if (tasks.length > 0) {
        var dotColor = pct === 100 ? 'var(--green)' : pct > 0 ? 'var(--gold)' : 'var(--text-dim)';
        stripHtml += '<div style="font-family:var(--font-mono);font-size:8px;color:' + dotColor + ';margin-top:4px">' + doneTasks + '/' + tasks.length + '</div>';
      }
      stripHtml += '</div>';
    }
    strip.innerHTML = stripHtml;
  }

  // Today's section (or selected day)
  renderDayTasks(today.getDay(), (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0')), weekKey, data);
}

function showDayTasks(dayNum, dayKey) {
  var weekKey = getWeekKey(weekOffset);
  var data = getWeeklyData(weekKey);
  renderDayTasks(dayNum, dayKey, weekKey, data);
}

function renderDayTasks(dayNum, dayKey, weekKey, data) {
  var container = document.getElementById('weekDayDetails');
  if (!container) return;
  var dayNames = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  var tasks = WEEKLY_TASKS[dayNum];
  if (!tasks || !tasks.items.length) {
    container.innerHTML = '<div class="panel-section"><div style="text-align:center;padding:24px;font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">No specific tasks for ' + dayNames[dayNum] + '</div></div>';
    return;
  }

  var html = '<div class="panel-section"><div class="panel-section-title">' + tasks.title + ' — ' + dayKey + '</div>';
  tasks.items.forEach(function(item) {
    var isDone = !!data[item.id];
    var cc = catColorsMap[item.cat] || {bg:'rgba(255,255,255,0.05)',c:'var(--text-dim)'};
    html += '<div class="ritual-item' + (isDone ? ' done' : '') + '" data-wid="' + item.id + '" onclick="toggleWeeklyTask(this,\'' + item.id + '\')">';
    html += '<div class="ritual-check">' + (isDone ? '✓' : '') + '</div>';
    html += '<div><div class="ritual-text">' + item.title + '</div>';
    if (item.desc) html += '<div class="ritual-info">' + item.desc + '</div>';
    html += '</div>';
    if (item.desc) html += '<span class="ritual-info-btn" onclick="toggleRitualInfo(event,this)">ℹ</span>';
    html += '<div class="ritual-cat" style="background:' + cc.bg + ';color:' + cc.c + '">' + item.cat + '</div>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function toggleWeeklyTask(el, taskId) {
  el.classList.toggle('done');
  el.querySelector('.ritual-check').textContent = el.classList.contains('done') ? '✓' : '';
  // Auto-save immediately
  var weekKey = getWeekKey(weekOffset);
  var data = getWeeklyData(weekKey);
  data[taskId] = el.classList.contains('done') ? true : undefined;
  if (!data[taskId]) delete data[taskId];
  saveWeeklyData(weekKey, data);
  renderWeeklySchedule(); // Update strip counts
}

function toggleWeeklyItem(el) {
  el.classList.toggle('done');
  el.querySelector('.ritual-check').textContent = el.classList.contains('done') ? '✓' : '';
  var wid = el.getAttribute('data-wid');
  var weekKey = getWeekKey(weekOffset);
  var data = getWeeklyData(weekKey);
  data[wid] = el.classList.contains('done') ? true : undefined;
  if (!data[wid]) delete data[wid];
  saveWeeklyData(weekKey, data);
}

function autoSaveWeeklyField(el) {
  var field = el.getAttribute('data-wfield');
  if (!field) return;
  var weekKey = getWeekKey(weekOffset);
  var data = getWeeklyData(weekKey);
  data[field] = el.value;
  saveWeeklyData(weekKey, data);
}

function loadWeeklyState() {
  var weekKey = getWeekKey(weekOffset);
  var data = getWeeklyData(weekKey);
  // Restore weekly commitments
  document.querySelectorAll('#p-weekly [data-wid]').forEach(function(el) {
    var wid = el.getAttribute('data-wid');
    if (data[wid]) { el.classList.add('done'); el.querySelector('.ritual-check').textContent = '✓'; }
  });
  // Restore PERMA fields
  document.querySelectorAll('#p-weekly [data-wfield]').forEach(function(el) {
    var field = el.getAttribute('data-wfield');
    if (data[field]) el.value = data[field];
  });
}
 
