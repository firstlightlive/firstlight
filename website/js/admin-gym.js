// ═══════════════════════════════════════════
// FIRST LIGHT — GYM TRACKER
// PPL split, exercise logging, PR detection, analytics
// ═══════════════════════════════════════════

// ── EXERCISE DATABASE ──
var GYM_EXERCISES = {
  push: [
    {name:'Barbell Bench Press',muscle:'chest',type:'compound',defaultSets:4,defaultReps:'8-12'},
    {name:'Incline Dumbbell Press',muscle:'chest',type:'compound',defaultSets:3,defaultReps:'10-12'},
    {name:'Overhead Press (OHP)',muscle:'shoulders',type:'compound',defaultSets:4,defaultReps:'8-10'},
    {name:'Lateral Raises',muscle:'shoulders',type:'isolation',defaultSets:3,defaultReps:'12-15'},
    {name:'Cable Flyes',muscle:'chest',type:'isolation',defaultSets:3,defaultReps:'12-15'},
    {name:'Tricep Pushdowns',muscle:'triceps',type:'isolation',defaultSets:3,defaultReps:'12-15'},
    {name:'Overhead Tricep Extension',muscle:'triceps',type:'isolation',defaultSets:3,defaultReps:'10-12'},
    {name:'Face Pulls',muscle:'rear delts',type:'accessory',defaultSets:3,defaultReps:'15-20'}
  ],
  pull: [
    {name:'Deadlift',muscle:'back',type:'compound',defaultSets:4,defaultReps:'5-8'},
    {name:'Pull-Ups / Lat Pulldown',muscle:'back',type:'compound',defaultSets:4,defaultReps:'8-12'},
    {name:'Barbell Rows',muscle:'back',type:'compound',defaultSets:4,defaultReps:'8-10'},
    {name:'Seated Cable Row',muscle:'back',type:'compound',defaultSets:3,defaultReps:'10-12'},
    {name:'Dumbbell Curls',muscle:'biceps',type:'isolation',defaultSets:3,defaultReps:'10-12'},
    {name:'Hammer Curls',muscle:'biceps',type:'isolation',defaultSets:3,defaultReps:'10-12'},
    {name:'Face Pulls',muscle:'rear delts',type:'accessory',defaultSets:3,defaultReps:'15-20'},
    {name:'Shrugs',muscle:'traps',type:'isolation',defaultSets:3,defaultReps:'12-15'}
  ],
  legs: [
    {name:'Barbell Squat',muscle:'quads',type:'compound',defaultSets:4,defaultReps:'6-10'},
    {name:'Romanian Deadlift',muscle:'hamstrings',type:'compound',defaultSets:4,defaultReps:'8-10'},
    {name:'Leg Press',muscle:'quads',type:'compound',defaultSets:3,defaultReps:'10-12'},
    {name:'Bulgarian Split Squat',muscle:'quads',type:'compound',defaultSets:3,defaultReps:'10-12'},
    {name:'Leg Curls',muscle:'hamstrings',type:'isolation',defaultSets:3,defaultReps:'12-15'},
    {name:'Leg Extension',muscle:'quads',type:'isolation',defaultSets:3,defaultReps:'12-15'},
    {name:'Calf Raises',muscle:'calves',type:'isolation',defaultSets:4,defaultReps:'15-20'},
    {name:'Hip Thrusts',muscle:'glutes',type:'compound',defaultSets:3,defaultReps:'10-12'}
  ],
  functional: [
    {name:'Plank (timed)',muscle:'core',type:'stability',defaultSets:3,defaultReps:'60s'},
    {name:'Dead Bug',muscle:'core',type:'stability',defaultSets:3,defaultReps:'10 each'},
    {name:'Single-Leg RDL',muscle:'hamstrings',type:'functional',defaultSets:3,defaultReps:'10 each'},
    {name:'Copenhagen Plank',muscle:'adductors',type:'injury prevention',defaultSets:3,defaultReps:'30s'},
    {name:'Pallof Press',muscle:'core',type:'functional',defaultSets:3,defaultReps:'10 each'},
    {name:'Farmer Walks',muscle:'grip',type:'functional',defaultSets:3,defaultReps:'40m'}
  ]
};

var MUSCLE_COLORS = {
  chest:'#FF6B35',back:'#00D4FF',shoulders:'#F5A623',triceps:'#E040FB',biceps:'#FF69B4',
  quads:'#00E5A0',hamstrings:'#70AEFF',glutes:'#FF4136',calves:'#D4A017',core:'#00D4FF',
  traps:'#FF9933','rear delts':'#F5A623',adductors:'#70AEFF',grip:'#6B7A8E'
};

// ── STATE ──
var gymDate = null;
var gymCurrentSplit = null;
var gymWorkoutData = { split: null, exercises: [], energy_level: 5, notes: '' };
var gymTimerStart = 0;
var gymTimerInterval = null;

// ── DATA HELPERS ──
function getGymWorkout(date) {
  try {
    var w = JSON.parse(localStorage.getItem('fl_gym_workout_' + date) || 'null');
    if (w && typeof w.exercises === 'string') {
      try { w.exercises = JSON.parse(w.exercises); } catch(e) { w.exercises = []; }
    }
    return w;
  } catch(e) { return null; }
}

function getGymPRs() {
  try { return JSON.parse(localStorage.getItem('fl_gym_prs') || '{}'); } catch(e) { return {}; }
}

// ── DATE NAV ──
function initGymDateNav() {
  createDateNav('gym-log-date-nav', {
    days: 14,
    onSelect: function(dateStr) {
      gymDate = dateStr;
      loadGymWorkoutForDate(dateStr);
    }
  });
}

// ── SPLIT SELECTION ──
function selectGymSplit(split) {
  gymCurrentSplit = split;
  document.querySelectorAll('#gymSplitBtns .gym-split-btn').forEach(function(b) {
    b.classList.toggle('active', b.textContent.trim().toLowerCase() === split);
  });
  gymWorkoutData.split = split;
  // Don't auto-load all exercises — let user pick from library
  if (!gymWorkoutData.exercises || gymWorkoutData.exercises.length === 0) {
    gymWorkoutData.exercises = [];
  }
  renderExerciseCards();
  renderExercisePicker(split);
  startGymTimer();
}

function getLastSetsForExercise(name) {
  // Find the most recent workout containing this exercise
  for (var i = 1; i <= 14; i++) {
    var d = new Date(); d.setDate(d.getDate() - i);
    var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
    var w = getGymWorkout(ds);
    if (w && w.exercises) {
      var ex = w.exercises.find(function(e) { return e.name === name; });
      if (ex && ex.sets) return ex.sets.map(function(s) { return { weight: s.weight, reps: s.reps }; });
    }
  }
  return [];
}

// ── EXERCISE PICKER — user chooses which exercises to do ──
function renderExercisePicker(split) {
  var picker = document.getElementById('gymExercisePicker');
  if (!picker) return;
  var library = getExerciseLibrary();
  var exercises = library[split] || [];
  var alreadyAdded = gymWorkoutData.exercises.map(function(e) { return e.name; });

  var html = '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:10px;font-weight:700">TAP TO ADD EXERCISES</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
  exercises.forEach(function(ex) {
    var mc = MUSCLE_COLORS[ex.muscle] || '#6B7A8E';
    var added = alreadyAdded.indexOf(ex.name) >= 0;
    html += '<div onclick="' + (added ? '' : 'addExerciseToWorkout(\'' + ex.name.replace(/'/g, "\\'") + '\',\'' + split + '\')') + '" style="padding:8px 12px;border-radius:6px;font-family:var(--font-mono);font-size:11px;cursor:' + (added ? 'default' : 'pointer') + ';transition:all 0.2s;' +
      (added ? 'background:rgba(0,230,118,0.1);border:1px solid rgba(0,230,118,0.3);color:var(--green);opacity:0.6' : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:var(--text)') + '">' +
      (added ? '✓ ' : '+ ') + ex.name +
      '<span style="font-size:8px;color:' + mc + ';margin-left:6px">' + ex.muscle.toUpperCase() + '</span></div>';
  });
  html += '</div>';
  picker.innerHTML = html;
}

function addExerciseToWorkout(name, split) {
  var library = getExerciseLibrary();
  var ex = (library[split] || []).find(function(e) { return e.name === name; });
  if (!ex) return;
  // Check not already added
  if (gymWorkoutData.exercises.some(function(e) { return e.name === name; })) return;

  var lastSets = getLastSetsForExercise(name);
  // Minimum 5 sets: 1 warm-up + 3 working + 1 cool-down
  var sets;
  if (lastSets.length >= 5) {
    sets = lastSets;
  } else {
    sets = [
      { weight: '', reps: '', label: 'WARM-UP' },
      { weight: '', reps: '', label: '' },
      { weight: '', reps: '', label: '' },
      { weight: '', reps: '', label: '' },
      { weight: '', reps: '', label: 'COOL-DOWN' }
    ];
    // Fill from last workout if available
    if (lastSets.length > 0) {
      lastSets.forEach(function(ls, i) {
        if (sets[i]) { sets[i].weight = ls.weight; sets[i].reps = ls.reps; }
      });
    }
  }

  gymWorkoutData.exercises.push({ name: ex.name, muscle: ex.muscle, sets: sets });
  renderExerciseCards();
  renderExercisePicker(split);
}

// ── RENDER EXERCISE CARDS ──
function renderExerciseCards() {
  var container = document.getElementById('gymExerciseList');
  if (!container) return;
  var html = '';
  gymWorkoutData.exercises.forEach(function(ex, idx) {
    var mc = MUSCLE_COLORS[ex.muscle] || '#6B7A8E';
    html += '<div class="gym-exercise-card" data-ex-idx="' + idx + '">';
    html += '<div class="gym-exercise-header">';
    html += '<div><span class="gym-exercise-name">' + ex.name + '</span> <span class="gym-muscle-badge" style="background:' + mc + '22;color:' + mc + '">' + (ex.muscle || '').toUpperCase() + '</span></div>';
    html += '<div style="display:flex;gap:4px"><button class="gym-add-btn" onclick="addGymSet(' + idx + ')">+ SET</button><button class="gym-remove-btn" onclick="removeGymExercise(' + idx + ')" title="Remove">&times;</button></div>';
    html += '</div>';
    // Set headers
    html += '<div class="gym-set-row" style="opacity:0.5"><div class="gym-set-num">SET</div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);text-align:center">KG</div><div></div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);text-align:center">REPS</div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);text-align:center">TYPE</div></div>';
    // Sets
    html += '<div class="gym-set-grid">';
    (ex.sets || []).forEach(function(set, si) {
      var isPR = set.isPR || false;
      var isWarmup = si === 0 || (set.label && set.label === 'WARM-UP');
      var isCooldown = si === (ex.sets.length - 1) || (set.label && set.label === 'COOL-DOWN');
      var setLabel = isWarmup ? 'W' : isCooldown ? 'C' : String(si);
      var rowColor = isWarmup ? 'rgba(0,176,255,0.04)' : isCooldown ? 'rgba(0,230,118,0.04)' : '';
      html += '<div class="gym-set-row" style="' + (rowColor ? 'background:' + rowColor + ';border-radius:4px;' : '') + '">';
      html += '<div class="gym-set-num" style="' + (isWarmup ? 'color:#00B0FF' : isCooldown ? 'color:#00E676' : '') + '">' + setLabel + '</div>';
      html += '<input type="number" class="gym-set-input" value="' + (set.weight || '') + '" placeholder="0" step="0.5" onchange="updateGymSet(' + idx + ',' + si + ',\'weight\',this.value)">';
      html += '<div class="gym-set-x">&times;</div>';
      html += '<input type="number" class="gym-set-input" value="' + (set.reps || '') + '" placeholder="0" onchange="updateGymSet(' + idx + ',' + si + ',\'reps\',this.value)">';
      if (isPR) {
        html += '<span class="gym-pr-badge">🏆 PR</span>';
      } else if (isWarmup) {
        html += '<span style="font-family:var(--font-mono);font-size:8px;color:#00B0FF;letter-spacing:1px">WARM</span>';
      } else if (isCooldown) {
        html += '<span style="font-family:var(--font-mono);font-size:8px;color:#00E676;letter-spacing:1px">COOL</span>';
      } else {
        html += '<div></div>';
      }
      html += '</div>';
    });
    html += '</div></div>';
  });

  if (gymWorkoutData.exercises.length === 0) {
    html = '<div style="text-align:center;padding:32px;color:var(--text-dim);font-family:var(--font-mono);font-size:12px">' +
      '<div style="font-size:32px;margin-bottom:12px">💪</div>' +
      'Select a split above, then tap exercises below to add them to your workout.' +
      '<div style="font-size:10px;color:var(--text-dim);margin-top:8px">Each exercise gets 5 sets: warm-up → 3 working → cool-down</div></div>';
  }
  container.innerHTML = html;
}

// ── SET MANAGEMENT ──
function addGymSet(exIdx) {
  if (gymWorkoutData.exercises[exIdx]) {
    gymWorkoutData.exercises[exIdx].sets.push({ weight: '', reps: '' });
    renderExerciseCards();
  }
}

function removeGymExercise(exIdx) {
  gymWorkoutData.exercises.splice(exIdx, 1);
  renderExerciseCards();
  renderExercisePicker(gymCurrentSplit || 'push');
}

function updateGymSet(exIdx, setIdx, field, value) {
  if (!gymWorkoutData.exercises[exIdx] || !gymWorkoutData.exercises[exIdx].sets[setIdx]) return;
  gymWorkoutData.exercises[exIdx].sets[setIdx][field] = value === '' ? '' : (parseFloat(value) || 0);
  // Check PR
  var set = gymWorkoutData.exercises[exIdx].sets[setIdx];
  if (set.weight > 0 && set.reps > 0) {
    var isPR = checkPR(gymWorkoutData.exercises[exIdx].name, set.weight, set.reps);
    gymWorkoutData.exercises[exIdx].sets[setIdx].isPR = isPR;
    if (isPR) renderExerciseCards(); // Re-render to show badge
  }
}

// ── ADD EXERCISE DROPDOWN ──
function showAddExerciseDropdown() {
  var dd = document.getElementById('gymAddDropdown');
  if (!dd) return;
  if (dd.style.display !== 'none') { dd.style.display = 'none'; return; }
  var split = gymCurrentSplit || 'push';
  var allExercises = [];
  var lib = getExerciseLibrary();
  Object.keys(lib).forEach(function(s) {
    lib[s].forEach(function(ex) {
      if (!gymWorkoutData.exercises.find(function(e) { return e.name === ex.name; })) {
        allExercises.push(ex);
      }
    });
  });
  var html = '<div class="panel-section" style="padding:12px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">ADD EXERCISE</div>';
  allExercises.forEach(function(ex) {
    var mc = MUSCLE_COLORS[ex.muscle] || '#6B7A8E';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-radius:6px;transition:background 0.15s" onmouseover="this.style.background=\'var(--bg3)\'" onmouseout="this.style.background=\'transparent\'" onclick="addCustomExerciseToWorkout(\'' + ex.name.replace(/'/g, "\\'") + '\',\'' + ex.muscle + '\')">';
    html += '<span class="gym-muscle-badge" style="background:' + mc + '22;color:' + mc + '">' + ex.muscle.toUpperCase() + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:12px;color:var(--text)">' + ex.name + '</span>';
    html += '</div>';
  });
  html += '</div>';
  dd.innerHTML = html;
  dd.style.display = 'block';
}

function addCustomExerciseToWorkout(name, muscle) {
  gymWorkoutData.exercises.push({ name: name, muscle: muscle, sets: [{ weight: '', reps: '' }, { weight: '', reps: '' }, { weight: '', reps: '' }] });
  document.getElementById('gymAddDropdown').style.display = 'none';
  renderExerciseCards();
}

// ── PR DETECTION (Epley Formula) ──
function checkPR(exerciseName, weight, reps) {
  if (!weight || !reps) return false;
  var prs = getGymPRs();
  var estimated1RM = weight * (1 + reps / 30);
  var current = prs[exerciseName];
  if (!current || estimated1RM > (current.estimated1RM || 0)) {
    prs[exerciseName] = { weight: weight, reps: reps, estimated1RM: Math.round(estimated1RM * 10) / 10, date: (gymDate || getEffectiveToday()) };
    localStorage.setItem('fl_gym_prs', JSON.stringify(prs));
    if (typeof syncSave === 'function') {
      syncSave('gym_prs', { exercise: exerciseName, weight: weight, reps: reps, estimated_1rm: Math.round(estimated1RM * 10) / 10, date: (gymDate || getEffectiveToday()) }, 'exercise');
    }
    return true;
  }
  return false;
}

// ── TIMER ──
function startGymTimer() {
  if (gymTimerInterval) return;
  gymTimerStart = Date.now();
  gymTimerInterval = setInterval(function() {
    var secs = Math.round((Date.now() - gymTimerStart) / 1000);
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    var el = document.getElementById('gymTimer');
    if (el) el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }, 1000);
}

// ── SAVE ──
function saveGymWorkout() {
  var dateStr = gymDate || getEffectiveToday();
  if (isDateLocked(dateStr)) { showLockWarning(); return; }
  var duration = gymTimerStart ? Math.round((Date.now() - gymTimerStart) / 60000) : 0;
  var data = {
    split: gymCurrentSplit,
    duration_minutes: duration,
    energy_level: parseInt(document.getElementById('gymEnergy').value) || 5,
    notes: document.getElementById('gymNotes').value,
    exercises: gymWorkoutData.exercises.map(function(ex) {
      return { name: ex.name, muscle: ex.muscle, sets: ex.sets.filter(function(s) { return s.weight !== '' || s.reps !== ''; }) };
    })
  };
  localStorage.setItem('fl_gym_workout_' + dateStr, JSON.stringify(data));
  if (typeof syncSave === 'function') {
    syncSave('gym_workouts', {
      date: dateStr,
      split: data.split || '',
      duration_minutes: data.duration_minutes || 0,
      energy_level: data.energy_level || 5,
      notes: data.notes || '',
      exercises: data.exercises || []
    }, 'date');
  }
  clearInterval(gymTimerInterval); gymTimerInterval = null;
  markSaved();
  flashBtn(document.querySelector('#p-gym-log .btn-primary'), 'SAVED ✓');
}

function loadGymWorkoutForDate(dateStr) {
  var data = getGymWorkout(dateStr);
  clearInterval(gymTimerInterval); gymTimerInterval = null;
  if (document.getElementById('gymTimer')) document.getElementById('gymTimer').textContent = '00:00';
  if (data) {
    gymCurrentSplit = data.split;
    gymWorkoutData = { split: data.split, exercises: data.exercises || [], energy_level: data.energy_level || 5, notes: data.notes || '' };
    document.querySelectorAll('#gymSplitBtns .gym-split-btn').forEach(function(b) { b.classList.toggle('active', b.textContent.trim().toLowerCase() === data.split); });
    if (document.getElementById('gymEnergy')) document.getElementById('gymEnergy').value = data.energy_level || 5;
    if (document.getElementById('gymEnergyVal')) document.getElementById('gymEnergyVal').textContent = data.energy_level || 5;
    if (document.getElementById('gymNotes')) document.getElementById('gymNotes').value = data.notes || '';
    if (data.duration_minutes) {
      var el = document.getElementById('gymTimer');
      if (el) el.textContent = String(Math.floor(data.duration_minutes / 60)).padStart(2,'0') + ':' + String(data.duration_minutes % 60).padStart(2,'0');
    }
    renderExerciseCards();
  } else {
    gymCurrentSplit = null;
    gymWorkoutData = { split: null, exercises: [], energy_level: 5, notes: '' };
    document.querySelectorAll('#gymSplitBtns .gym-split-btn').forEach(function(b) { b.classList.remove('active'); });
    if (document.getElementById('gymEnergy')) document.getElementById('gymEnergy').value = 5;
    if (document.getElementById('gymNotes')) document.getElementById('gymNotes').value = '';
    renderExerciseCards();
  }

  // Lock UI for past dates
  var locked = isDateLocked(dateStr);
  var gymPanel = document.getElementById('p-gym-log');
  if (gymPanel) {
    var existingBanner = gymPanel.querySelector('.lock-banner');
    if (existingBanner) existingBanner.remove();
    var saveBtn = gymPanel.querySelector('.btn-primary');
    if (locked) {
      var banner = document.createElement('div');
      banner.className = 'lock-banner';
      banner.innerHTML = getLockBannerHTML(dateStr);
      var dateNav = document.getElementById('gym-date-nav');
      if (dateNav && dateNav.nextSibling) dateNav.parentNode.insertBefore(banner, dateNav.nextSibling);
      if (saveBtn) saveBtn.style.display = 'none';
      gymPanel.querySelectorAll('input, select, textarea').forEach(function(inp) { inp.disabled = true; inp.style.opacity = '0.6'; });
      gymPanel.querySelectorAll('.gym-split-btn, .btn-copy').forEach(function(b) { b.style.pointerEvents = 'none'; b.style.opacity = '0.5'; });
    } else {
      if (saveBtn) saveBtn.style.display = '';
      gymPanel.querySelectorAll('input, select, textarea').forEach(function(inp) { inp.disabled = false; inp.style.opacity = ''; });
      gymPanel.querySelectorAll('.gym-split-btn, .btn-copy').forEach(function(b) { b.style.pointerEvents = ''; b.style.opacity = ''; });
    }
  }
}

// ── SYNC ──
function syncGymWorkout(date, data) {
  if (!SB.init()) return;
  sbFetch('gym_workouts', 'POST', {
    date: date, split: data.split, duration_minutes: data.duration_minutes,
    energy_level: data.energy_level, notes: data.notes, exercises: data.exercises
  }, '?on_conflict=date');
}

// ── ANALYTICS ──
function buildGymAnalytics() {
  var container = document.getElementById('gymAnalyticsContent');
  if (!container) return;
  var today = new Date();
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  var splitColors = { push:'#FF6B35', pull:'#00D4FF', legs:'#00E5A0', functional:'#F5A623', rest:'var(--bg3)' };

  // Gather data
  var weekSessions = 0, monthSessions = 0, weekVolume = 0, monthPRs = 0;
  var weekDays = [];
  var muscleVolume = {};
  var prs = getGymPRs();
  var thisMonth = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');

  for (var i = 6; i >= 0; i--) {
    var d = new Date(today); d.setDate(d.getDate() - i);
    var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
    var w = getGymWorkout(ds);
    weekDays.push({ date: ds, dayName: dayNames[d.getDay()], workout: w });
    var wExercises = w ? (Array.isArray(w.exercises) ? w.exercises : []) : [];
    if (w && w.split !== 'rest' && (w.split || wExercises.length > 0)) {
      weekSessions++;
      wExercises.forEach(function(ex) {
        (ex.sets || []).forEach(function(s) {
          var vol = (s.weight || 0) * (s.reps || 0);
          weekVolume += vol;
          if (!muscleVolume[ex.muscle]) muscleVolume[ex.muscle] = 0;
          muscleVolume[ex.muscle] += vol;
        });
      });
    }
  }

  // Month sessions
  for (var m = 0; m < 30; m++) {
    var md = new Date(today); md.setDate(md.getDate() - m);
    var mds = (md.getFullYear()+'-'+String(md.getMonth()+1).padStart(2,'0')+'-'+String(md.getDate()).padStart(2,'0'));
    var mw = getGymWorkout(mds);
    var mwEx = mw ? (Array.isArray(mw.exercises) ? mw.exercises : []) : [];
    if (mw && mw.split !== 'rest' && (mw.split || mwEx.length > 0)) monthSessions++;
  }

  // Month PRs
  Object.values(prs).forEach(function(pr) { if (pr.date && pr.date.startsWith(thisMonth)) monthPRs++; });

  // Gym streak
  var streak = 0;
  for (var s = 0; s < 365; s++) {
    var sd = new Date(today); sd.setDate(sd.getDate() - s);
    var sds = (sd.getFullYear()+'-'+String(sd.getMonth()+1).padStart(2,'0')+'-'+String(sd.getDate()).padStart(2,'0'));
    var sw = getGymWorkout(sds);
    var swEx = sw ? (Array.isArray(sw.exercises) ? sw.exercises : []) : [];
    if (sw && sw.split !== 'rest' && (sw.split || swEx.length > 0)) streak++;
    else if (s > 0) break;
  }

  var html = '';

  // KPI Cards
  html += '<div class="ra-kpi-grid">';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:var(--cyan)">' + weekSessions + '</div><div class="ra-kpi-label">THIS WEEK</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val">' + monthSessions + '</div><div class="ra-kpi-label">THIS MONTH</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:var(--green)">' + streak + '</div><div class="ra-kpi-label">GYM STREAK</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:var(--gold)">' + Math.round(weekVolume).toLocaleString() + '</div><div class="ra-kpi-label">WEEK VOLUME (KG)</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:var(--gold)">' + monthPRs + '</div><div class="ra-kpi-label">PRs THIS MONTH</div></div>';
  html += '</div>';

  // Weekly Split Map
  html += '<div class="panel-section"><div class="panel-section-title">THIS WEEK — SPLIT MAP</div>';
  html += '<div class="gym-heatmap">';
  weekDays.forEach(function(wd) {
    var split = wd.workout ? wd.workout.split : null;
    var bg = split ? (splitColors[split] || 'var(--bg3)') + '33' : 'var(--bg3)';
    var col = split ? (splitColors[split] || 'var(--text-dim)') : 'var(--text-dim)';
    var isToday = wd.date === (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'));
    html += '<div class="gym-heat-cell" style="background:' + bg + ';' + (isToday ? 'border-color:var(--cyan)' : '') + '">';
    html += '<div style="font-size:9px;letter-spacing:1px;color:' + (isToday ? 'var(--cyan)' : 'var(--text-dim)') + '">' + wd.dayName + '</div>';
    html += '<div style="font-size:12px;font-weight:700;color:' + col + ';margin-top:4px">' + (split ? split.toUpperCase() : '—') + '</div>';
    html += '</div>';
  });
  html += '</div></div>';

  // Muscle Volume Breakdown
  html += '<div class="panel-section"><div class="panel-section-title">MUSCLE VOLUME (7 DAYS)</div>';
  var maxVol = Math.max.apply(null, Object.values(muscleVolume).concat([1]));
  Object.keys(muscleVolume).sort(function(a, b) { return muscleVolume[b] - muscleVolume[a]; }).forEach(function(m) {
    var pct = Math.round(muscleVolume[m] / maxVol * 100);
    var mc = MUSCLE_COLORS[m] || '#6B7A8E';
    html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(var(--cyan-r),0.04)">';
    html += '<span class="gym-muscle-badge" style="background:' + mc + '22;color:' + mc + ';min-width:80px;text-align:center">' + m.toUpperCase() + '</span>';
    html += '<div style="flex:1;height:12px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:' + mc + ';border-radius:4px"></div></div>';
    html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text);min-width:60px;text-align:right">' + Math.round(muscleVolume[m]).toLocaleString() + ' kg</span>';
    html += '</div>';
  });
  if (!Object.keys(muscleVolume).length) html += '<div style="text-align:center;padding:16px;color:var(--text-dim);font-family:var(--font-mono);font-size:11px">No workout data this week</div>';
  html += '</div>';

  // PR Wall
  html += '<div class="panel-section"><div class="panel-section-title">🏆 PR WALL</div>';
  var prList = Object.entries(prs).sort(function(a, b) { return (b[1].date || '').localeCompare(a[1].date || ''); });
  if (prList.length) {
    prList.forEach(function(pr) {
      html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(var(--cyan-r),0.04)">';
      html += '<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);flex:1">' + pr[0] + '</span>';
      html += '<span style="font-family:var(--font-mono);font-size:12px;color:var(--gold);font-weight:700">' + pr[1].weight + 'kg × ' + pr[1].reps + '</span>';
      html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + (pr[1].date || '') + '</span>';
      html += '</div>';
    });
  } else {
    html += '<div style="text-align:center;padding:16px;color:var(--text-dim);font-family:var(--font-mono);font-size:11px">No PRs yet. Start logging!</div>';
  }
  html += '</div>';

  container.innerHTML = html;
}

// ── EXERCISE LIBRARY ──
var _currentLibSplit = 'push';

// Load custom exercises from localStorage + merge with defaults
function getExerciseLibrary() {
  var custom = {};
  try { custom = JSON.parse(localStorage.getItem('fl_custom_exercises') || '{}'); } catch(e) {}
  var merged = {};
  // Start with defaults
  Object.keys(GYM_EXERCISES).forEach(function(split) {
    merged[split] = GYM_EXERCISES[split].slice();
  });
  // Add custom exercises
  Object.keys(custom).forEach(function(split) {
    if (!merged[split]) merged[split] = [];
    custom[split].forEach(function(ex) {
      // Avoid duplicates by name
      if (!merged[split].some(function(e) { return e.name === ex.name; })) {
        merged[split].push(ex);
      }
    });
  });
  return merged;
}

function saveCustomExercise(split, exercise) {
  var custom = {};
  try { custom = JSON.parse(localStorage.getItem('fl_custom_exercises') || '{}'); } catch(e) {}
  if (!custom[split]) custom[split] = [];
  custom[split].push(exercise);
  localStorage.setItem('fl_custom_exercises', JSON.stringify(custom));
}

function removeExercise(split, name) {
  // Remove from custom exercises
  var custom = {};
  try { custom = JSON.parse(localStorage.getItem('fl_custom_exercises') || '{}'); } catch(e) {}
  if (custom[split]) {
    custom[split] = custom[split].filter(function(ex) { return ex.name !== name; });
    localStorage.setItem('fl_custom_exercises', JSON.stringify(custom));
  }
  renderExerciseLibrary(_currentLibSplit);
}

function showAddExerciseForm() {
  document.getElementById('addExerciseForm').classList.remove('hidden');
  document.getElementById('newExSplit').value = _currentLibSplit;
  document.getElementById('newExName').value = '';
  document.getElementById('newExName').focus();
}

function hideAddExerciseForm() {
  document.getElementById('addExerciseForm').classList.add('hidden');
}

function saveNewExercise() {
  var name = document.getElementById('newExName').value.trim();
  if (!name) { alert('Enter exercise name'); return; }
  var split = document.getElementById('newExSplit').value;
  var exercise = {
    name: name,
    muscle: document.getElementById('newExMuscle').value,
    type: document.getElementById('newExType').value,
    defaultSets: parseInt(document.getElementById('newExSets').value) || 3,
    defaultReps: document.getElementById('newExReps').value || '10-12',
    custom: true
  };
  saveCustomExercise(split, exercise);
  hideAddExerciseForm();
  renderExerciseLibrary(split);
  flashBtn(document.querySelector('#p-gym-exercises .btn-primary'), 'ADDED ✓');
}

function renderExerciseLibrary(split) {
  split = split || 'push';
  _currentLibSplit = split;
  var container = document.getElementById('gymLibraryList');
  if (!container) return;
  document.querySelectorAll('#gymLibTabs .gym-split-btn').forEach(function(b) {
    b.classList.toggle('active', b.textContent.trim().toLowerCase() === split);
  });
  var library = getExerciseLibrary();
  var exercises = library[split] || [];
  var html = '';
  exercises.forEach(function(ex, i) {
    var mc = MUSCLE_COLORS[ex.muscle] || '#6B7A8E';
    var isCustom = ex.custom === true;
    html += '<div class="gym-exercise-card" style="padding:12px;' + (isCustom ? 'border-left:3px solid var(--green);' : '') + '">';
    html += '<div style="display:flex;align-items:center;gap:10px">';
    html += '<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);flex:1">' + ex.name + '</span>';
    html += '<span class="gym-muscle-badge" style="background:' + mc + '22;color:' + mc + '">' + ex.muscle.toUpperCase() + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:1px">' + ex.type.toUpperCase() + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + ex.defaultSets + ' × ' + ex.defaultReps + '</span>';
    if (isCustom) {
      html += '<button class="btn-copy" style="padding:2px 6px;font-size:8px;color:var(--red);border-color:rgba(255,68,68,0.2)" onclick="removeExercise(\'' + split + '\',\'' + ex.name.replace(/'/g, "\\'") + '\')">✗</button>';
    }
    html += '</div></div>';
  });
  html += '<div style="text-align:center;padding:12px;font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + exercises.length + ' exercises in ' + split.toUpperCase() + '</div>';
  container.innerHTML = html;
}

// ── INIT ──
function renderGymLog() {
  var dateStr = gymDate || getEffectiveToday();
  loadGymWorkoutForDate(dateStr);
}
 
