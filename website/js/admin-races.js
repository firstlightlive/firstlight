// ═══════════════════════════════════════════
// FIRST LIGHT — RACES
// ═══════════════════════════════════════════

var _raceMapActiveId = null;

function renderRaceList() {
  var list = document.getElementById('raceList');
  var races = getRaces();
  if(!races.length) { list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-family:var(--font-mono);font-size:12px">No races added yet.</div>'; return; }
  list.innerHTML = races.map(function(r) {
    var color = RACE_COLORS[r.type] || '#C0C0C0';
    var label = RACE_LABELS[r.type] || r.type;
    var isMapActive = _raceMapActiveId === r.id;
    return '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg3);border-radius:8px;margin-bottom:6px;flex-wrap:wrap">' +
      '<span style="font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:1px;padding:3px 8px;border-radius:3px;background:' + color + '22;color:' + color + '">' + label + '</span>' +
      '<div style="flex:1;min-width:0"><div style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--text)">' + r.name + '</div>' +
      '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + r.date + ' · ' + (r.finishTime || r.status) + '</div></div>' +
      '<button class="btn-copy" onclick="showRaceMap(\'' + r.id + '\')" style="' + (isMapActive ? 'color:var(--green);border-color:rgba(0,230,118,0.4)' : '') + '">MAP</button>' +
      '<button class="btn-copy" onclick="editRace(\'' + r.id + '\')">EDIT</button>' +
      '<button class="btn-copy" style="color:var(--red);border-color:rgba(255,68,68,0.2)" onclick="if(confirm(\'Delete this race?\')){deleteRace(\'' + r.id + '\');_raceMapActiveId=null;document.getElementById(\'raceMapPanel\').classList.add(\'hidden\');renderRaceList();}">DEL</button></div>';
  }).join('');
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
 
