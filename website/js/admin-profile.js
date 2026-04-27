// ═══════════════════════════════════════════
// FIRST LIGHT — PROFILE
// Upload photos to GCS via Cloud Function
// ═══════════════════════════════════════════

var GCS_UPLOAD = 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=upload';
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

// ── UNIVERSAL GCS UPLOAD — works for profile, about, any photo ──
async function _uploadPhotoToGCS(file, folder, filenamePrefix, statusEl) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) {
    if (statusEl) { statusEl.textContent = 'Not an image file'; statusEl.style.color = 'var(--red)'; }
    return null;
  }
  if (file.size > 10 * 1024 * 1024) {
    if (statusEl) { statusEl.textContent = 'Image too large (max 10 MB)'; statusEl.style.color = 'var(--red)'; }
    return null;
  }

  if (statusEl) { statusEl.textContent = 'Uploading...'; statusEl.style.color = 'var(--gold)'; }

  try {
    var dataUrl = await new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });

    var ext = file.name.split('.').pop() || 'jpg';
    var filename = filenamePrefix + '_' + Date.now() + '.' + ext;

    var res = await fetch(GCS_UPLOAD, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': _getAdminKey() },
      body: JSON.stringify({ data: dataUrl, filename: filename, folder: folder })
    });

    if (!res.ok) {
      var errText = await res.text().catch(function() { return ''; });
      throw new Error('HTTP ' + res.status + ': ' + errText.substring(0, 100));
    }

    var data = await res.json();
    var url = data.url || data.publicUrl;
    if (!url) throw new Error(data.error || 'No URL returned');

    if (statusEl) { statusEl.textContent = 'Uploaded'; statusEl.style.color = 'var(--green)'; }
    return url;
  } catch(e) {
    console.error('[Profile Upload]', e);
    if (statusEl) { statusEl.textContent = 'Failed: ' + e.message; statusEl.style.color = 'var(--red)'; }
    return null;
  }
}

// ── UPLOAD PROFILE PHOTO ──
async function uploadProfilePhoto(file) {
  var status = document.getElementById('profileUploadStatus');
  var url = await _uploadPhotoToGCS(file, 'photos/profile', 'profile', status);
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
  var url = await _uploadPhotoToGCS(file, 'photos/about', 'about', status);
  if (url) {
    var urlEl = document.getElementById('aboutPhotoUrl');
    if (urlEl) urlEl.value = url;
    saveConfig({ ABOUT_PHOTO_URL: url });
    _saveConfigToSupabase('ABOUT_PHOTO_URL', url);
  }
}
 
