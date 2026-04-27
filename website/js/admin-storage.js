// ═══════════════════════════════════════════
// FIRST LIGHT — GCS Storage Helper
// Uploads/downloads files via local GCS proxy server
// Server: scripts/gcs-file-server.sh on port 3001
// ═══════════════════════════════════════════

var GCS_SERVER = 'https://asia-south1-project-f050b6ba-60db-4eee-98a.cloudfunctions.net/firstlight-sync';

// Storage paths
var STORAGE_PATHS = {
  voice: 'storage/voice',         // Voice journal recordings (.webm)
  profile: 'storage/profile',     // Profile photos (.jpg, .png)
  media: 'storage/media',         // Race photos, Instagram posts, content
  progress: 'storage/progress',   // Body progress photos (private)
  backups: 'storage/backups'      // JSON exports, data backups
};

// ── CHECK SERVER ──
async function isGcsServerRunning() {
  try {
    var res = await fetch(GCS_SERVER + '/health', { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch (e) { return false; }
}

// ── UPLOAD FILE ──
async function uploadToGcs(file, category, filename) {
  if (!filename) {
    var ext = file.name ? file.name.split('.').pop() : (file.type ? file.type.split('/')[1] : 'bin');
    filename = Date.now() + '.' + ext;
  }

  var path = (STORAGE_PATHS[category] || 'storage/misc') + '/' + getEffectiveToday().replace(/-/g, '/') + '/' + filename;

  try {
    var res = await fetch(GCS_SERVER + '/upload?path=' + encodeURIComponent(path), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    var data = await res.json();
    if (data.success) {
      console.log('[GCS] Uploaded: ' + path + ' (' + data.size + ' bytes)');
      return { success: true, path: path, url: data.url, size: data.size };
    }
    console.error('[GCS] Upload failed:', data.error);
    return { success: false, error: data.error };
  } catch (e) {
    console.error('[GCS] Server not running. Start: scripts/gcs-file-server.sh');
    return { success: false, error: 'GCS server not running on port 3001. Run scripts/gcs-file-server.sh' };
  }
}

// ── UPLOAD BLOB (for voice recordings, generated content) ──
async function uploadBlobToGcs(blob, category, filename) {
  var path = (STORAGE_PATHS[category] || 'storage/misc') + '/' + getEffectiveToday().replace(/-/g, '/') + '/' + (filename || Date.now() + '.bin');

  try {
    var res = await fetch(GCS_SERVER + '/upload?path=' + encodeURIComponent(path), {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob
    });
    var data = await res.json();
    if (data.success) {
      console.log('[GCS] Uploaded blob: ' + path);
      return { success: true, path: path, url: data.url };
    }
    return { success: false, error: data.error };
  } catch (e) {
    return { success: false, error: 'GCS server offline' };
  }
}

// ── DOWNLOAD FILE ──
async function downloadFromGcs(path) {
  try {
    var res = await fetch(GCS_SERVER + '/file?path=' + encodeURIComponent(path));
    if (res.ok) return await res.blob();
    return null;
  } catch (e) { return null; }
}

// ── LIST FILES ──
async function listGcsFiles(category) {
  var prefix = (STORAGE_PATHS[category] || 'storage/' + category) + '/';
  try {
    var res = await fetch(GCS_SERVER + '/list?prefix=' + encodeURIComponent(prefix));
    var data = await res.json();
    return data.files || [];
  } catch (e) { return []; }
}

// ── BACKUP DATA TO GCS ──
async function backupToGcs() {
  var data = {};
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.startsWith('fl_')) data[key] = localStorage.getItem(key);
  }
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var filename = 'firstlight_backup_' + getEffectiveToday() + '.json';
  return await uploadBlobToGcs(blob, 'backups', filename);
}

// ── STATUS INDICATOR ──
(async function checkGcsOnLoad() {
  var running = await isGcsServerRunning();
  console.log('[GCS] File server: ' + (running ? 'ONLINE ✓' : 'OFFLINE — run scripts/gcs-file-server.sh'));
})();
 
