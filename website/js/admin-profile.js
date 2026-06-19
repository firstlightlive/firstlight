// ═══════════════════════════════════════════
// FIRST LIGHT — PROFILE
// Upload photos to GCS via Cloud Function
// ═══════════════════════════════════════════

var _ADMIN_KEY_FALLBACK = localStorage.getItem('fl_admin_key');
function _getAdminKey() { return localStorage.getItem('fl_admin_key') || _ADMIN_KEY_FALLBACK; }

function loadProfile() {
  var url = FL.PROFILE_PHOTO_URL || '';
  var bio = FL.PROFILE_BIO || '';
  var aboutUrl = FL.ABOUT_PHOTO_URL || '';
  var urlEl = document.getElementById('profilePhotoUrl');
  var bioEl = document.getElementById('profileBio');
  var aboutUrlEl = document.getElementById('aboutPhotoUrl');
  var aboutPreview = document.getElementById('aboutPhotoPreview');

  if (urlEl) urlEl.value = url;
  if (bioEl) bioEl.value = bio;
  previewProfilePhoto();

  // Restore about photo URL + preview
  if (aboutUrlEl && aboutUrl) {
    aboutUrlEl.value = aboutUrl;
    if (aboutPreview) aboutPreview.innerHTML = '<img src="' + aboutUrl + '" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=\'NO PHOTO\'">';
  }

  // If missing locally, pull both from Supabase
  var sbUrl = (typeof FL !== 'undefined' && FL.SUPABASE_URL) || FL.SUPABASE_URL;
  var sbKey = (typeof FL !== 'undefined' && FL.SUPABASE_ANON_KEY) || FL.SUPABASE_ANON_KEY;

  if (!url || !aboutUrl) {
    fetch(sbUrl + '/rest/v1/config?key=in.(PROFILE_PHOTO_URL,ABOUT_PHOTO_URL)&select=key,value', { headers: { 'apikey': sbKey } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.length) return;
        data.forEach(function(row) {
          if (row.key === 'PROFILE_PHOTO_URL' && row.value && !url) {
            if (urlEl) urlEl.value = row.value;
            saveConfig({ PROFILE_PHOTO_URL: row.value });
            previewProfilePhoto();
          }
          if (row.key === 'ABOUT_PHOTO_URL' && row.value && !aboutUrl) {
            if (aboutUrlEl) aboutUrlEl.value = row.value;
            if (aboutPreview) aboutPreview.innerHTML = '<img src="' + row.value + '" style="width:100%;height:100%;object-fit:cover">';
            saveConfig({ ABOUT_PHOTO_URL: row.value });
          }
        });
      }).catch(function() {});
  }
}

function previewProfilePhoto() {
  var url = document.getElementById('profilePhotoUrl').value;
  var preview = document.getElementById('profilePhotoPreview');
  if (url) {
    preview.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=\'NO PHOTO\'">';
  } else {
    preview.innerHTML = 'NO PHOTO';
  }
}

function saveProfile() {
  saveConfig({
    PROFILE_PHOTO_URL: document.getElementById('profilePhotoUrl').value,
    PROFILE_BIO: document.getElementById('profileBio').value
  });
  if (SB.ready) {
    sbFetch('config', 'POST', {key:'PROFILE_PHOTO_URL', value: FL.PROFILE_PHOTO_URL}, '?on_conflict=key');
    sbFetch('config', 'POST', {key:'PROFILE_BIO', value: FL.PROFILE_BIO}, '?on_conflict=key');
  }
  flashBtn(document.querySelector('#p-profile .btn-primary'), 'SAVED');
}

// ── UNIVERSAL UPLOAD — Cloudflare R2 via /api/upload worker route ──
// folder = "profile" | "about" | "races" | "races/bib" | "races/{slug}"
// Stores under R2 key: photos/{folder}/{prefix}_{ts}.{ext}
// Public URL: https://firstlight.live/api/proofs/photos/{folder}/{prefix}_{ts}.{ext}
async function _uploadPhotoToR2(file, folder, filenamePrefix, statusEl, onProgress) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) {
    if (statusEl) { statusEl.textContent = 'Not an image file'; statusEl.style.color = 'var(--red)'; }
    return null;
  }
  if (file.size > 10 * 1024 * 1024) {
    if (statusEl) { statusEl.textContent = 'Image too large (max 10 MB)'; statusEl.style.color = 'var(--red)'; }
    return null;
  }

  var adminKey = (typeof FL !== 'undefined' && FL.ADMIN_API_KEY) || localStorage.getItem('fl_admin_api_key') || '';
  if (!adminKey) {
    if (statusEl) { statusEl.textContent = 'Missing admin key — login again'; statusEl.style.color = 'var(--red)'; }
    return null;
  }

  if (statusEl) { statusEl.textContent = 'Uploading to Cloudflare R2…'; statusEl.style.color = 'var(--gold)'; }

  // Normalize folder — strip a leading "photos/" if caller passed legacy path
  var normFolder = (folder || '').replace(/^photos\//, '').replace(/\/+$/, '');

  // Use XHR so we get a real progress event (fetch can't track upload bytes in browser)
  return new Promise(function(resolve) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://firstlight.live/api/upload');
      xhr.setRequestHeader('x-admin-key', adminKey);
      xhr.setRequestHeader('x-folder', normFolder);
      xhr.setRequestHeader('x-filename-prefix', filenamePrefix || 'img');
      xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg');
      if (xhr.upload && onProgress) {
        xhr.upload.addEventListener('progress', function(e) {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }
      xhr.onload = function() {
        try {
          var json = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300 && json.url) {
            if (statusEl) { statusEl.textContent = 'Uploaded to R2 (' + Math.round(json.bytes/1024) + ' KB)'; statusEl.style.color = 'var(--green)'; }
            resolve(json.url);
          } else {
            var msg = json.error || ('HTTP ' + xhr.status);
            if (statusEl) { statusEl.textContent = 'Failed: ' + msg; statusEl.style.color = 'var(--red)'; }
            console.error('[R2 Upload]', msg);
            resolve(null);
          }
        } catch (e) {
          if (statusEl) { statusEl.textContent = 'Parse error: ' + e.message; statusEl.style.color = 'var(--red)'; }
          resolve(null);
        }
      };
      xhr.onerror = function() {
        if (statusEl) { statusEl.textContent = 'Network error — check connection'; statusEl.style.color = 'var(--red)'; }
        resolve(null);
      };
      xhr.send(file);
    } catch (e) {
      console.error('[R2 Upload]', e);
      if (statusEl) { statusEl.textContent = 'Failed: ' + e.message; statusEl.style.color = 'var(--red)'; }
      resolve(null);
    }
  });
}

// Back-compat alias — old call sites pass folder like "photos/profile"; the new
// helper strips that and routes to /api/upload anyway.
async function _uploadPhotoToGCS(file, folder, filenamePrefix, statusEl) {
  return _uploadPhotoToR2(file, folder, filenamePrefix, statusEl);
}

// ── UPLOAD PROFILE PHOTO ──
async function uploadProfilePhoto(file) {
  var status = document.getElementById('profileUploadStatus');
  var url = await _uploadPhotoToR2(file, 'profile', 'profile', status, function(pct) {
    if (status) status.textContent = 'Uploading to R2 — ' + pct + '%';
  });
  if (url) {
    document.getElementById('profilePhotoUrl').value = url;
    saveConfig({ PROFILE_PHOTO_URL: url });
    previewProfilePhoto();
    // Always save to Supabase — direct fetch as fallback if SB not ready
    _saveConfigToSupabase('PROFILE_PHOTO_URL', url);
  }
}

function _saveConfigToSupabase(key, value) {
  var sbUrl = (typeof FL !== 'undefined' && FL.SUPABASE_URL) || FL.SUPABASE_URL;
  var sbKey = (typeof FL !== 'undefined' && FL.SUPABASE_ANON_KEY) || FL.SUPABASE_ANON_KEY;
  fetch(sbUrl + '/rest/v1/config?on_conflict=key', {
    method: 'POST',
    headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: key, value: value })
  }).catch(function(e) { console.warn('[Profile] Supabase config save failed:', e); });
}

// ── UPLOAD ABOUT PAGE PHOTO ──
async function uploadAboutPhoto(file) {
  var status = document.getElementById('aboutPhotoStatus');
  var url = await _uploadPhotoToR2(file, 'about', 'about', status, function(pct) {
    if (status) status.textContent = 'Uploading to R2 — ' + pct + '%';
  });
  if (url) {
    var urlEl = document.getElementById('aboutPhotoUrl');
    if (urlEl) urlEl.value = url;
    saveConfig({ ABOUT_PHOTO_URL: url });
    _saveConfigToSupabase('ABOUT_PHOTO_URL', url);
  }
}
 
