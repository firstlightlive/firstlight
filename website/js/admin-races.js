// ═══════════════════════════════════════════
// FIRST LIGHT — RACES
// ═══════════════════════════════════════════

var _raceMapActiveId = null;
var _raceFilter = 'all';

// ── CAREER STATS BOX ──
function _raceStatBox(value, label, color) {
  return '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px 6px;text-align:center">' +
    '<div style="font-family:var(--font-mono);font-size:clamp(13px,2.5vw,18px);font-weight:700;color:' + color + ';line-height:1">' + value + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim);margin-top:4px">' + label + '</div>' +
    '</div>';
}

// ── DATE FORMAT ──
function _raceFmtDate(dateStr) {
  if (!dateStr) return '';
  var p = dateStr.split('-');
  var d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + p[0];
}

// ── RACE CARD ──
function _buildRaceCard(race) {
  var color = RACE_COLORS[race.type] || '#C0C0C0';
  var label = RACE_LABELS[race.type] || (race.type || 'RACE').toUpperCase();
  var isCompleted = race.status === 'completed';
  var isUpcoming = race.status === 'upcoming';
  var isMapActive = _raceMapActiveId === race.id;

  var statusColor = isCompleted ? 'var(--green)' : isUpcoming ? 'var(--cyan)' : race.status === 'dnf' ? 'var(--red)' : 'rgba(255,255,255,0.25)';
  var statusLabel = isCompleted ? '✓ COMPLETED' : isUpcoming ? '◷ UPCOMING' : race.status === 'dnf' ? '✗ DNF' : race.status === 'dns' ? '— DNS' : (race.status || '').toUpperCase();
  var borderColor = isCompleted ? 'rgba(0,230,118,0.15)' : isUpcoming ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.05)';
  var bgColor = isCompleted ? 'rgba(0,230,118,0.015)' : isUpcoming ? 'rgba(0,212,255,0.015)' : 'transparent';

  // Days until race (upcoming only)
  var daysLabel = '';
  if (isUpcoming && race.date) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var raceDay = new Date(race.date + 'T00:00:00');
    var diff = Math.round((raceDay - today) / 86400000);
    daysLabel = diff > 0 ? diff + ' DAYS AWAY' : diff === 0 ? 'RACE DAY 🏁' : Math.abs(diff) + ' DAYS AGO';
  }

  var html = '<div style="border:1px solid ' + borderColor + ';background:' + bgColor + ';border-left:3px solid ' + (isCompleted ? '#00E676' : isUpcoming ? '#00D4FF' : 'rgba(255,255,255,0.1)') + ';border-radius:10px;padding:16px;margin-bottom:10px">';

  // Top row: type pill + status pill + date (right)
  html += '<div style="display:flex;align-items:center;gap:7px;margin-bottom:11px;flex-wrap:wrap">';
  html += '<span style="font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:1px;padding:3px 8px;border-radius:3px;background:' + color + '22;color:' + color + '">' + label + '</span>';
  html += '<span style="font-family:var(--font-mono);font-size:9px;padding:3px 8px;border-radius:3px;border:1px solid ' + statusColor + '55;color:' + statusColor + '">' + statusLabel + '</span>';
  html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-left:auto">' + _raceFmtDate(race.date) + '</span>';
  html += '</div>';

  // Race name + sub
  html += '<div style="margin-bottom:12px">';
  html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--text);line-height:1.3;margin-bottom:3px">' + (race.name || '—') + '</div>';
  var sub = [race.shortName, race.location, race.country].filter(Boolean).join(' · ');
  if (sub) html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + sub + '</div>';
  html += '</div>';

  // Key metrics row
  html += '<div style="display:flex;align-items:flex-end;gap:20px;margin-bottom:14px;flex-wrap:wrap">';
  if (isCompleted) {
    if (race.finishTime) {
      html += '<div><div style="font-family:var(--font-mono);font-size:24px;font-weight:900;color:var(--green);letter-spacing:-1px;line-height:1">' + race.finishTime + '</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim);margin-top:3px">CHIP TIME</div></div>';
    }
    if (race.pace) html += _raceMini(race.pace, 'PACE/KM');
    if (race.position && race.position.overall) {
      html += _raceMini(race.position.overall + (race.position.totalOverall ? '/' + race.position.totalOverall : ''), 'OVERALL');
    }
    if (race.distance) html += _raceMini(race.distance + 'km', 'DIST');
    if (race.heartRate && race.heartRate.avg) html += _raceMini(race.heartRate.avg + ' bpm', 'AVG HR');
  } else if (isUpcoming) {
    if (daysLabel) html += '<div style="font-family:var(--font-mono);font-size:17px;font-weight:700;color:var(--cyan)">' + daysLabel + '</div>';
    if (race.targetTime) html += _raceMini(race.targetTime, 'TARGET');
    if (race.bib) html += _raceMini('#' + race.bib, 'BIB');
    if (race.distance) html += _raceMini(race.distance + 'km', 'DIST');
  } else {
    if (race.distance) html += _raceMini(race.distance + 'km', 'DIST');
  }
  html += '</div>';

  // Highlight quote
  if (race.highlight) {
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);font-style:italic;margin-bottom:12px;padding:8px 10px;background:rgba(255,255,255,0.02);border-left:2px solid rgba(255,255,255,0.1);border-radius:0 4px 4px 0">"' + race.highlight + '"</div>';
  }

  // Action buttons
  html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">';
  if (isCompleted) {
    var mapActive = isMapActive;
    html += '<button class="btn-copy" onclick="showRaceMap(\'' + race.id + '\')" style="font-size:10px;' + (mapActive ? 'color:var(--green);border-color:rgba(0,230,118,0.35);background:rgba(0,230,118,0.06)' : '') + '">📍 ' + (mapActive ? 'HIDE MAP' : 'VIEW ROUTE') + '</button>';
  }
  if (race.stravaUrl) html += '<a href="' + race.stravaUrl + '" target="_blank" class="btn-copy" style="font-size:10px;text-decoration:none;color:#FC4C02;border-color:rgba(252,76,2,0.25)">STRAVA</a>';
  if (race.officialResultsUrl) html += '<a href="' + race.officialResultsUrl + '" target="_blank" class="btn-copy" style="font-size:10px;text-decoration:none">RESULTS</a>';
  html += '<div style="margin-left:auto;display:flex;gap:6px">';
  html += '<button class="btn-copy" onclick="editRace(\'' + race.id + '\')" style="font-size:10px">EDIT</button>';
  html += '<button class="btn-copy" onclick="_raceDeleteConfirm(\'' + race.id + '\')" style="font-size:10px;color:rgba(255,82,82,0.55);border-color:rgba(255,82,82,0.12)">DEL</button>';
  html += '</div></div>';

  html += '</div>'; // end card
  return html;
}

function _raceMini(value, label) {
  return '<div><div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text)">' + value + '</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim);margin-top:2px">' + label + '</div></div>';
}

function _raceDeleteConfirm(id) {
  var race = getRaces().find(function(r) { return r.id === id; });
  if (!race || !confirm('Delete "' + race.name + '"?\nThis cannot be undone.')) return;
  deleteRace(id);
  if (_raceMapActiveId === id) {
    _raceMapActiveId = null;
    var p = document.getElementById('raceMapPanel');
    if (p) { p.classList.add('hidden'); p.innerHTML = ''; }
  }
  renderRaceList();
}

// ── MAIN LIST RENDER ──
function renderRaceList() {
  var list = document.getElementById('raceList');
  var races = getRaces();

  // Career stats
  var stats = typeof computeCareerStats === 'function' ? computeCareerStats(races) : {};
  var completedRaces = races.filter(function(r) { return r.status === 'completed'; });
  var upcomingRaces  = races.filter(function(r) { return r.status === 'upcoming'; });

  var statsHtml = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">';
  statsHtml += _raceStatBox(completedRaces.length, 'RACES', 'var(--green)');
  statsHtml += _raceStatBox((stats.totalKm || 0) + 'km', 'TOTAL KM', 'var(--gold)');
  statsHtml += _raceStatBox((typeof formatRaceTime === 'function' ? formatRaceTime(stats.bestMarathon) : null) || '—', 'MARATHON PB', '#FF6B35');
  statsHtml += _raceStatBox((typeof formatRaceTime === 'function' ? formatRaceTime(stats.bestHalf) : null) || '—', 'HALF PB', 'var(--cyan)');
  statsHtml += '</div>';

  // Filter pills
  var filterHtml = '<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">';
  var fDefs = [
    { key: 'all',       label: 'ALL (' + races.length + ')' },
    { key: 'upcoming',  label: '◷ UPCOMING (' + upcomingRaces.length + ')' },
    { key: 'completed', label: '✓ DONE (' + completedRaces.length + ')' }
  ];
  fDefs.forEach(function(f) {
    var active = _raceFilter === f.key;
    filterHtml += '<button onclick="_raceFilter=\'' + f.key + '\';renderRaceList()" style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;padding:5px 12px;border-radius:4px;border:1px solid ' + (active ? 'var(--cyan)' : 'rgba(255,255,255,0.1)') + ';background:' + (active ? 'rgba(0,212,255,0.07)' : 'transparent') + ';color:' + (active ? 'var(--cyan)' : 'var(--text-muted)') + ';cursor:pointer;transition:all 0.15s">' + f.label + '</button>';
  });
  filterHtml += '</div>';

  // Filtered cards
  var filtered = races.filter(function(r) {
    if (_raceFilter === 'upcoming') return r.status === 'upcoming';
    if (_raceFilter === 'completed') return r.status === 'completed';
    return true;
  });

  var cardsHtml = '';
  if (!filtered.length) {
    cardsHtml = '<div style="text-align:center;padding:40px 16px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.07);border-radius:10px">';
    cardsHtml += '<div style="font-size:32px;margin-bottom:12px;opacity:0.2">🏅</div>';
    cardsHtml += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-dim)">No races in this category.</div>';
    cardsHtml += '</div>';
  } else {
    filtered.forEach(function(r) { cardsHtml += _buildRaceCard(r); });
  }

  list.innerHTML = statsHtml + filterHtml + cardsHtml;
}

function showRaceForm(raceId) {
  document.getElementById('raceFormPanel').classList.remove('hidden');
  document.getElementById('raceEditId').value = raceId || '';
  if(!raceId) document.getElementById('raceForm').reset();
  document.getElementById('raceFormPanel').scrollIntoView({behavior:'smooth'});
}

function hideRaceForm() {
  document.getElementById('raceFormPanel').classList.add('hidden');
  document.getElementById('raceForm').reset();
  document.getElementById('raceEditId').value = '';
  document.getElementById('splitsContainer').innerHTML = '';
  document.getElementById('photosContainer').innerHTML = '';
  document.getElementById('videosContainer').innerHTML = '';
}

function editRace(id) {
  var race = getRaces().find(function(r) { return r.id === id; });
  if(!race) return;
  showRaceForm(id);
  document.getElementById('raceName').value = race.name || '';
  document.getElementById('raceShort').value = race.shortName || '';
  document.getElementById('raceDate').value = race.date || '';
  document.getElementById('raceLoc').value = race.location || '';
  document.getElementById('raceCountry').value = race.country || '';
  document.getElementById('raceType').value = race.type || 'marathon';
  document.getElementById('raceDist').value = race.distance || '';
  document.getElementById('raceStatus').value = race.status || 'upcoming';
  document.getElementById('resultsSection').style.display = race.status === 'completed' ? '' : 'none';
  document.getElementById('raceBib').value = race.bib || '';
  document.getElementById('raceBibPhoto').value = race.bibPhoto || '';
  document.getElementById('raceFinish').value = race.finishTime || '';
  document.getElementById('raceGun').value = race.gunTime || '';
  document.getElementById('racePace').value = race.pace || '';
  document.getElementById('raceTarget').value = race.targetTime || '';
  if(race.position) {
    document.getElementById('racePosOvr').value = race.position.overall || '';
    document.getElementById('racePosTot').value = race.position.totalOverall || '';
    document.getElementById('racePosGen').value = race.position.gender || '';
    document.getElementById('racePosGenTot').value = race.position.totalGender || '';
    document.getElementById('raceAgeGroup').value = race.position.ageGroupLabel || '';
    document.getElementById('racePosAge').value = race.position.ageGroup || '';
  }
  document.getElementById('splitsContainer').innerHTML = '';
  (race.splits || []).forEach(function(s) { addSplitRow(); var rows = document.querySelectorAll('#splitsContainer .form-row'); var last = rows[rows.length-1]; last.querySelector('.split-km').value = s.km; last.querySelector('.split-time').value = s.time || ''; last.querySelector('.split-pace').value = s.pace || ''; });
  document.getElementById('photosContainer').innerHTML = '';
  (race.photos || []).forEach(function(p) { addPhotoRow(); var rows = document.querySelectorAll('#photosContainer .form-row'); var last = rows[rows.length-1]; last.querySelector('.photo-url').value = p.url; last.querySelector('.photo-cap').value = p.caption || ''; });
  document.getElementById('videosContainer').innerHTML = '';
  (race.videos || []).forEach(function(v) { addVideoRow(); var rows = document.querySelectorAll('#videosContainer .form-row'); var last = rows[rows.length-1]; last.querySelector('.video-url').value = v.url; last.querySelector('.video-cap').value = v.caption || ''; });
  if(race.conditions) {
    document.getElementById('raceWeather').value = race.conditions.weather || '';
    document.getElementById('raceTerrain').value = race.conditions.terrain || '';
    document.getElementById('raceElev').value = race.conditions.elevation || '';
  }
  if(race.heartRate) { document.getElementById('raceHrAvg').value = race.heartRate.avg || ''; document.getElementById('raceHrMax').value = race.heartRate.max || ''; }
  document.getElementById('raceCal').value = race.calories || '';
  document.getElementById('raceStrava').value = race.stravaUrl || '';
  document.getElementById('raceResults').value = race.officialResultsUrl || '';
  document.getElementById('raceNotes').value = race.notes || '';
  document.getElementById('raceHighlight').value = race.highlight || '';
  document.getElementById('raceTags').value = (race.tags || []).join(', ');
}

function addSplitRow() {
  var c = document.getElementById('splitsContainer');
  var row = document.createElement('div');
  row.className = 'form-row';
  row.style.alignItems = 'end';
  row.innerHTML = '<div class="form-group" style="flex:1"><label class="form-label">KM</label><input type="number" step="0.1" class="form-input split-km" placeholder="5"></div>' +
    '<div class="form-group" style="flex:1"><label class="form-label">TIME</label><input type="text" class="form-input split-time" placeholder="H:MM:SS"></div>' +
    '<div class="form-group" style="flex:1"><label class="form-label">PACE</label><input type="text" class="form-input split-pace" placeholder="M:SS"></div>' +
    '<button type="button" style="padding:10px;color:var(--red);background:none;border:none;font-size:16px;cursor:pointer;margin-bottom:20px" onclick="this.parentElement.remove()">✕</button>';
  c.appendChild(row);
}

function addPhotoRow() {
  var c = document.getElementById('photosContainer');
  var row = document.createElement('div');
  row.className = 'form-row';
  row.style.alignItems = 'end';
  row.innerHTML = '<div class="form-group" style="flex:2"><label class="form-label">PHOTO URL</label><input type="url" class="form-input photo-url" placeholder="https://..."></div>' +
    '<div class="form-group" style="flex:1"><label class="form-label">CAPTION</label><input type="text" class="form-input photo-cap" placeholder="e.g. Finish line"></div>' +
    '<button type="button" style="padding:10px;color:var(--red);background:none;border:none;font-size:16px;cursor:pointer;margin-bottom:20px" onclick="this.parentElement.remove()">✕</button>';
  c.appendChild(row);
}

function addVideoRow() {
  var c = document.getElementById('videosContainer');
  var row = document.createElement('div');
  row.className = 'form-row';
  row.style.alignItems = 'end';
  row.innerHTML = '<div class="form-group" style="flex:2"><label class="form-label">VIDEO EMBED URL</label><input type="url" class="form-input video-url" placeholder="https://youtube.com/embed/..."></div>' +
    '<div class="form-group" style="flex:1"><label class="form-label">CAPTION</label><input type="text" class="form-input video-cap" placeholder="Race recap"></div>' +
    '<button type="button" style="padding:10px;color:var(--red);background:none;border:none;font-size:16px;cursor:pointer;margin-bottom:20px" onclick="this.parentElement.remove()">✕</button>';
  c.appendChild(row);
}

function prefillSplits() {
  document.getElementById('splitsContainer').innerHTML = '';
  var type = document.getElementById('raceType').value;
  var dist = parseFloat(document.getElementById('raceDist').value) || 42.195;
  var markers = [];
  if(type === '5k') markers = [1,2,3,4,5];
  else if(type === '10k') markers = [2,4,6,8,10];
  else if(type === 'half') markers = [5,10,15,21.1];
  else if(type === 'marathon') markers = [5,10,15,21.1,25,30,35,40,42.195];
  else markers = [5,10,15,20,25,30,35,40,45,50].filter(function(m) { return m <= dist; });
  if(!markers.includes(dist)) markers.push(dist);
  markers.forEach(function(km) { addSplitRow(); var rows = document.querySelectorAll('#splitsContainer .form-row'); var last = rows[rows.length-1]; last.querySelector('.split-km').value = km; });
}

// Save race
document.getElementById('raceForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var editId = document.getElementById('raceEditId').value;
  var race = {
    id: editId || undefined,
    name: document.getElementById('raceName').value,
    shortName: document.getElementById('raceShort').value,
    date: document.getElementById('raceDate').value,
    location: document.getElementById('raceLoc').value,
    country: document.getElementById('raceCountry').value,
    type: document.getElementById('raceType').value,
    distance: parseFloat(document.getElementById('raceDist').value) || 0,
    status: document.getElementById('raceStatus').value,
    bib: document.getElementById('raceBib').value,
    bibPhoto: document.getElementById('raceBibPhoto').value,
    finishTime: document.getElementById('raceFinish').value,
    finishTimeSec: parseTimeToSec(document.getElementById('raceFinish').value),
    gunTime: document.getElementById('raceGun').value,
    pace: document.getElementById('racePace').value,
    targetTime: document.getElementById('raceTarget').value,
    position: {
      overall: parseInt(document.getElementById('racePosOvr').value) || 0,
      totalOverall: parseInt(document.getElementById('racePosTot').value) || 0,
      gender: parseInt(document.getElementById('racePosGen').value) || 0,
      totalGender: parseInt(document.getElementById('racePosGenTot').value) || 0,
      ageGroupLabel: document.getElementById('raceAgeGroup').value,
      ageGroup: parseInt(document.getElementById('racePosAge').value) || 0
    },
    splits: [].slice.call(document.querySelectorAll('#splitsContainer .form-row')).map(function(r) { return {
      km: parseFloat(r.querySelector('.split-km').value) || 0,
      time: r.querySelector('.split-time').value,
      pace: r.querySelector('.split-pace').value
    }; }).filter(function(s) { return s.km > 0; }),
    conditions: {
      weather: document.getElementById('raceWeather').value,
      terrain: document.getElementById('raceTerrain').value,
      elevation: document.getElementById('raceElev').value
    },
    heartRate: {
      avg: parseInt(document.getElementById('raceHrAvg').value) || 0,
      max: parseInt(document.getElementById('raceHrMax').value) || 0
    },
    calories: parseInt(document.getElementById('raceCal').value) || 0,
    photos: [].slice.call(document.querySelectorAll('#photosContainer .form-row')).map(function(r) { return {
      url: r.querySelector('.photo-url').value,
      caption: r.querySelector('.photo-cap').value
    }; }).filter(function(p) { return p.url; }),
    videos: [].slice.call(document.querySelectorAll('#videosContainer .form-row')).map(function(r) { return {
      url: r.querySelector('.video-url').value,
      caption: r.querySelector('.video-cap').value
    }; }).filter(function(v) { return v.url; }),
    stravaUrl: document.getElementById('raceStrava').value,
    officialResultsUrl: document.getElementById('raceResults').value,
    notes: document.getElementById('raceNotes').value,
    highlight: document.getElementById('raceHighlight').value,
    tags: document.getElementById('raceTags').value.split(',').map(function(t) { return t.trim(); }).filter(Boolean)
  };
  // Check for duplicate date — warn user
  var editId = race.id || document.getElementById('raceEditId').value;
  var existingOnDate = getRaces().find(function(r) { return r.date === race.date && r.id !== editId; });
  if (existingOnDate) {
    if (!confirm('A race already exists on ' + race.date + ' ("' + existingOnDate.name + '"). This will UPDATE that entry instead of creating a new one. Continue?')) return;
  }

  saveRace(race);
  renderRaceList();
  hideRaceForm();
  flashBtn(this.querySelector('.btn-primary'), 'SAVED ✓');
});

document.getElementById('raceType').addEventListener('change', function() {
  var dists = { '5k': 5, '10k': 10, 'half': 21.1, 'marathon': 42.195, 'ultra50k': 50, 'ultra100k': 100 };
  if(dists[this.value]) document.getElementById('raceDist').value = dists[this.value];
});

// One-race-per-day enforcement: warn inline when date conflicts
document.getElementById('raceDate').addEventListener('change', function() {
  var date = this.value;
  var editId = document.getElementById('raceEditId').value;
  var existing = getRaces().find(function(r) { return r.date === date && r.id !== editId; });
  var warn = document.getElementById('raceDateWarn');
  if (!warn) {
    warn = document.createElement('div');
    warn.id = 'raceDateWarn';
    warn.style.cssText = 'font-family:var(--font-mono);font-size:10px;margin-top:6px;padding:8px 10px;border-radius:6px';
    this.parentElement.appendChild(warn);
  }
  if (existing) {
    warn.style.background = 'rgba(245,166,35,0.08)';
    warn.style.border = '1px solid rgba(245,166,35,0.25)';
    warn.style.color = 'var(--gold)';
    warn.innerHTML = '⚠ A race already exists on this date: <strong>' + existing.name + '</strong><br><span style="opacity:0.7">Saving will UPDATE that entry (one race per day rule).</span>';
  } else {
    warn.innerHTML = '';
    warn.style.cssText = 'font-family:var(--font-mono);font-size:10px;margin-top:6px;padding:0';
    warn.style.border = 'none';
    warn.style.background = 'transparent';
  }
});

renderRaceList();

// Load engagement counters
['commentCount','storyCount','dmCount'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.textContent = getEngCounter(id);
});

// Load stories state
(function() {
  var done = getStoriesState();
  var items = document.querySelectorAll('.story-step');
  done.forEach(function(i) { if (items[i]) { items[i].classList.add('checked'); items[i].querySelector('.story-check').textContent = '✓'; }});
})();

// ══════════════════════════════════════
// RACE ROUTE MAP — Mapbox GL JS
// Queries strava_activities by race date
// Reuses _smap* helpers from admin-slips.js
// ══════════════════════════════════════

function showRaceMap(id) {
  var panel = document.getElementById('raceMapPanel');
  if (!panel) return;

  // Toggle — click same race MAP button again to close
  if (_raceMapActiveId === id) {
    _raceMapActiveId = null;
    panel.classList.add('hidden');
    panel.innerHTML = '';
    renderRaceList();
    return;
  }

  var race = getRaces().find(function(r) { return r.id === id; });
  if (!race) return;

  _raceMapActiveId = id;
  renderRaceList(); // re-render to highlight active MAP button

  panel.classList.remove('hidden');
  panel.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
      '<div>' +
        '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--green)">' + (race.name || 'RACE').toUpperCase() + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:2px">STRAVA ROUTE · ' + (race.date || '') + '</div>' +
      '</div>' +
      '<button class="btn-copy" onclick="_raceMapActiveId=null;document.getElementById(\'raceMapPanel\').classList.add(\'hidden\');document.getElementById(\'raceMapPanel\').innerHTML=\'\';renderRaceList()" style="padding:4px 10px;font-size:10px">CLOSE ✕</button>' +
    '</div>' +
    '<div id="raceMapContainer" class="smap-wrap"></div>';

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  _renderRaceRouteMap('raceMapContainer', race);
}

async function _renderRaceRouteMap(containerId, race) {
  var wrap = document.getElementById(containerId);
  if (!wrap) return;

  if (!race.date) {
    wrap.innerHTML = '<div class="smap-no-route">No race date set.</div>';
    return;
  }

  wrap.innerHTML = '<div class="smap-loading"><div class="smap-spinner"></div>Searching Strava for run on ' + race.date + '...</div>';

  try {
    if (typeof sbFetch !== 'function') {
      wrap.innerHTML = '<div class="smap-no-route">Supabase not configured.</div>';
      return;
    }

    // Compute next day for date range
    var d = new Date(race.date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    var nextDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    var acts = await sbFetch('strava_activities', 'GET', null,
      '?start_date_local=gte.' + race.date +
      '&start_date_local=lt.' + nextDate +
      '&type=in.(Run,Walk,VirtualRun)' +
      '&select=id,name,type,distance,moving_time,total_elevation_gain,calories,summary_polyline,start_date_local,average_speed' +
      '&order=distance.desc&limit=1');

    if (!acts || !acts.length) {
      wrap.innerHTML =
        '<div class="smap-no-route" style="padding:20px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim);line-height:1.7">' +
        '📍 No Strava run/walk found on <strong style="color:var(--text)">' + race.date + '</strong>.<br>' +
        'Make sure the race activity is synced to Strava on the same date as the race.</div>';
      return;
    }

    var act = acts[0];
    var uid = 'rm' + act.id;
    var typeColor = '#00E676'; // Race = green

    if (!act.summary_polyline) {
      wrap.innerHTML =
        '<div class="smap-no-route">📍 No GPS route (indoor or privacy zone). Found: ' + (act.name || act.type) + '</div>' +
        _smapBuildMetrics(act, uid);
      setTimeout(function() { _smapStartCountUp(act, uid); }, 200);
      return;
    }

    var coords = _smapDecodePolyline(act.summary_polyline);
    if (!coords || coords.length < 2) {
      wrap.innerHTML = '<div class="smap-no-route">📍 Could not decode GPS route data.</div>';
      return;
    }

    await _smapLoadGL();

    wrap.innerHTML =
      '<div class="smap-inner">' +
        '<div id="' + uid + '-canvas" class="smap-canvas"></div>' +
        '<div id="' + uid + '-stamp" class="smap-stamp" style="color:#00E676;border-color:rgba(0,230,118,0.4);text-shadow:0 0 20px rgba(0,230,118,0.5)">RACE<br>COMPLETE</div>' +
        '<div class="smap-badge" style="background:rgba(0,230,118,0.1);color:#00E676;border-color:rgba(0,230,118,0.3)">🏁 ' + (RACE_LABELS[race.type] || race.type || 'RACE').toUpperCase() + '</div>' +
      '</div>' +
      _smapBuildMetrics(act, uid);

    mapboxgl.accessToken = (window.FL && window.FL.MAPBOX_TOKEN) ? window.FL.MAPBOX_TOKEN : '';
    if (mapboxgl.config) mapboxgl.config.EVENTS_URL = null;

    var map = new mapboxgl.Map({
      container: uid + '-canvas',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: coords[0],
      zoom: 13,
      interactive: true,
      attributionControl: false
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    map.on('load', function() {
      var lngs = coords.map(function(c) { return c[0]; });
      var lats = coords.map(function(c) { return c[1]; });
      map.fitBounds(
        [[Math.min.apply(null, lngs), Math.min.apply(null, lats)],
         [Math.max.apply(null, lngs), Math.max.apply(null, lats)]],
        { padding: 50, duration: 0 }
      );

      // Ghost (dim full path)
      map.addSource('ghost-' + uid, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
      map.addLayer({ id: 'ghost-' + uid, type: 'line', source: 'ghost-' + uid,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': typeColor, 'line-width': 2, 'line-opacity': 0.18 }
      });

      // Animated route source
      map.addSource('route-' + uid, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [coords[0]] } } });

      // Glow layer
      map.addLayer({ id: 'glow-' + uid, type: 'line', source: 'route-' + uid,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': typeColor, 'line-width': 14, 'line-opacity': 0.1, 'line-blur': 8 }
      });

      // Main line
      map.addLayer({ id: 'route-' + uid, type: 'line', source: 'route-' + uid,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': typeColor, 'line-width': 4, 'line-opacity': 1 }
      });

      // Start marker
      var sEl = document.createElement('div'); sEl.className = 'smap-marker smap-marker-start';
      new mapboxgl.Marker({ element: sEl, anchor: 'center' }).setLngLat(coords[0]).addTo(map);

      // Animated draw
      var t0 = null;
      var animDur = Math.max(1800, Math.min(4000, coords.length * 5));

      (function animateRoute(ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / animDur, 1);
        var eased = 1 - Math.pow(1 - p, 2.5);
        var count = Math.max(2, Math.floor(eased * coords.length));
        map.getSource('route-' + uid).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords.slice(0, count) } });

        if (p < 1) {
          requestAnimationFrame(animateRoute);
        } else {
          // Finish marker
          var eEl = document.createElement('div'); eEl.className = 'smap-marker smap-marker-end';
          new mapboxgl.Marker({ element: eEl, anchor: 'center' }).setLngLat(coords[coords.length - 1]).addTo(map);

          // Stamp reveal
          var stamp = document.getElementById(uid + '-stamp');
          if (stamp) { stamp.style.opacity = '1'; stamp.style.transform = 'rotate(-14deg) translate(-50%,-50%) scale(1)'; }

          // Metrics count-up
          _smapStartCountUp(act, uid);
        }
      })(performance.now());
    });

    map.on('error', function(e) { console.warn('[RaceMap]', e.error); });

  } catch(e) {
    console.error('[RaceMap]', e);
    if (wrap) wrap.innerHTML = '<div class="smap-no-route">Error loading map: ' + (e.message || e) + '</div>';
  }
}

// ══════════════════════════════════════
// GCS PHOTO UPLOAD FOR RACES
// ══════════════════════════════════════

// Upload directly to Supabase Storage (free, permanent, no GCS)
async function checkGCSServer() {
  return true;
}

async function uploadToGCS(file, folder) {
  return new Promise(function(resolve, reject) {
    try {
      var ext = file.name.split('.').pop() || 'jpg';
      var name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + Date.now() + '.' + ext;
      var path = folder + '/' + name;
      var sbUrl = FL.SUPABASE_URL;
      var sbKey = FL.SUPABASE_ANON_KEY;

      fetch(sbUrl + '/storage/v1/object/media/' + path, {
        method: 'POST',
        headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey, 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' },
        body: file
      })
      .then(function(r) {
        if (!r.ok) throw new Error('Upload HTTP ' + r.status);
        return r.json();
      })
      .then(function() {
        var url = sbUrl + '/storage/v1/object/public/media/' + path;
        console.log('[Storage] Uploaded: ' + url);
        resolve(url);
      })
      .catch(function(e) { reject(e.message || 'Upload failed'); });
    } catch(e) { reject(e.message || 'Processing error'); }
  });
}

async function uploadRacePhotos(files) {
  var progress = document.getElementById('uploadProgress');
  var container = document.getElementById('photosContainer');
  if (!files || !files.length) return;

  progress.textContent = 'Checking GCS server...';
  progress.style.color = 'var(--gold)';

  var serverOk = await checkGCSServer();
  if (!serverOk) {
    progress.textContent = '✗ GCS Upload Server is not running! Run: node scripts/gcs-upload-server.js';
    progress.style.color = 'var(--red)';
    alert('GCS Upload Server is not running.\n\nOpen Terminal and run:\nnode scripts/gcs-upload-server.js');
    return;
  }

  progress.textContent = 'Uploading ' + files.length + ' photo(s) to Google Cloud...';
  var uploaded = 0;

  for (var i = 0; i < files.length; i++) {
    try {
      progress.textContent = 'Uploading ' + (i + 1) + '/' + files.length + ' (' + files[i].name + ')...';
      var url = await uploadToGCS(files[i], 'photos/races');
      uploaded++;

      // Add URL to photos container with preview
      var row = document.createElement('div');
      row.className = 'form-row';
      row.style.cssText = 'margin-bottom:6px;align-items:center;padding:6px;background:rgba(0,230,118,0.04);border:1px solid rgba(0,230,118,0.12);border-radius:6px';
      row.innerHTML = '<img src="' + url + '" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--surface-border)">' +
        '<div class="form-group" style="flex:1;margin:0 8px"><input type="url" class="form-input photo-url" value="' + url + '" readonly style="font-size:9px;color:var(--green)" onclick="this.select()"></div>' +
        '<span style="font-family:var(--font-mono);font-size:8px;color:var(--green)">GCS ✓</span>' +
        '<button type="button" class="btn-copy" style="padding:4px 8px;font-size:9px;color:var(--red);margin-left:4px" onclick="this.parentElement.remove()">✗</button>';
      container.appendChild(row);
    } catch(e) {
      progress.textContent = '✗ Failed (' + files[i].name + '): ' + e;
      progress.style.color = 'var(--red)';
      console.error('[GCS Upload]', e);
    }
  }

  if (uploaded > 0) {
    progress.textContent = uploaded + ' photo(s) uploaded to Google Cloud ✓';
    progress.style.color = 'var(--green)';
  }
  setTimeout(function() { progress.textContent = ''; progress.style.color = ''; }, 5000);
}

async function uploadBibPhoto(file) {
  if (!file) return;
  var progress = document.getElementById('uploadProgress');

  var serverOk = await checkGCSServer();
  if (!serverOk) {
    progress.textContent = '✗ GCS Upload Server is not running!';
    progress.style.color = 'var(--red)';
    alert('GCS Upload Server is not running.\n\nOpen Terminal and run:\nnode scripts/gcs-upload-server.js');
    return;
  }

  progress.textContent = 'Uploading bib photo...';
  progress.style.color = 'var(--gold)';

  try {
    var url = await uploadToGCS(file, 'photos/bibs');
    document.getElementById('raceBibPhoto').value = url;
    progress.textContent = 'Bib photo uploaded to GCS ✓ — ' + url;
    progress.style.color = 'var(--green)';
  } catch(e) {
    progress.textContent = '✗ Bib upload failed: ' + e;
    progress.style.color = 'var(--red)';
    console.error('[GCS Bib Upload]', e);
  }
  setTimeout(function() { progress.textContent = ''; progress.style.color = ''; }, 5000);
}

// ══════════════════════════════════════
// RITUAL DEFINITIONS (DATA-DRIVEN)
 
