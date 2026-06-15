#!/usr/bin/env node
// ═══════════════════════════════════════════
// FIRSTLIGHT — GCS Upload Proxy Server
// Runs on localhost:3001, accepts file uploads,
// stores them in gs://firstlightlive, returns public URL.
// ═══════════════════════════════════════════

const http = require('http');
const { execSync } = require('child_process');
const crypto = require('crypto');

const PORT = 3001;
const BUCKET = 'gs://firstlightlive';

const server = http.createServer(function(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/upload')) {
    var body = [];
    var totalSize = 0;
    var maxSize = 20 * 1024 * 1024; // 20MB max

    req.on('data', function(chunk) {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        res.writeHead(413, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'File too large. Max 20MB.'}));
        req.destroy();
        return;
      }
      body.push(chunk);
    });

    req.on('end', function() {
      try {
        var buffer = Buffer.concat(body);

        // Parse the multipart form data
        var contentType = req.headers['content-type'] || '';
        var boundary = contentType.split('boundary=')[1];

        if (!boundary) {
          // If not multipart, try JSON with base64
          var json = JSON.parse(buffer.toString());
          var folder = json.folder || 'uploads';
          var filename = json.filename || 'file_' + Date.now();
          var ext = json.ext || '.jpg';
          var base64Data = json.data;

          if (!base64Data) {
            res.writeHead(400, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'No data provided'}));
            return;
          }

          // Decode base64
          var fileBuffer = Buffer.from(base64Data, 'base64');
          var uniqueName = folder + '/' + filename + '_' + crypto.randomBytes(4).toString('hex') + ext;
          var tmpPath = '/tmp/fl_upload_' + Date.now() + ext;

          require('fs').writeFileSync(tmpPath, fileBuffer);

          // Upload to GCS
          var gcsPath = BUCKET + '/' + uniqueName;
          execSync('gsutil -q cp "' + tmpPath + '" "' + gcsPath + '"');

          // Clean up temp file
          require('fs').unlinkSync(tmpPath);

          var publicUrl = 'https://storage.googleapis.com/firstlightlive/' + uniqueName;

          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({
            success: true,
            url: publicUrl,
            path: uniqueName,
            size: fileBuffer.length
          }));

          console.log('[Upload] ' + uniqueName + ' (' + (fileBuffer.length / 1024).toFixed(0) + ' KB)');
        } else {
          // Multipart form data parsing
          var parts = buffer.toString('binary').split('--' + boundary);
          var folder = 'uploads';
          var fileData = null;
          var fileName = 'file';
          var fileExt = '.jpg';

          parts.forEach(function(part) {
            if (part.indexOf('name="folder"') > -1) {
              var match = part.split('\r\n\r\n')[1];
              if (match) folder = match.trim().replace(/\r\n--$/, '');
            }
            if (part.indexOf('name="file"') > -1) {
              var headerEnd = part.indexOf('\r\n\r\n') + 4;
              var dataEnd = part.lastIndexOf('\r\n');
              fileData = Buffer.from(part.substring(headerEnd, dataEnd), 'binary');
              var fnMatch = part.match(/filename="([^"]+)"/);
              if (fnMatch) {
                fileName = fnMatch[1].replace(/\.[^.]+$/, '');
                fileExt = fnMatch[1].match(/\.[^.]+$/)?.[0] || '.jpg';
              }
            }
          });

          if (!fileData) {
            res.writeHead(400, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'No file found in upload'}));
            return;
          }

          var uniqueName = folder + '/' + fileName + '_' + crypto.randomBytes(4).toString('hex') + fileExt;
          var tmpPath = '/tmp/fl_upload_' + Date.now() + fileExt;

          require('fs').writeFileSync(tmpPath, fileData);

          var gcsPath = BUCKET + '/' + uniqueName;
          execSync('gsutil -q cp "' + tmpPath + '" "' + gcsPath + '"');

          require('fs').unlinkSync(tmpPath);

          var publicUrl = 'https://storage.googleapis.com/firstlightlive/' + uniqueName;

          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({
            success: true,
            url: publicUrl,
            path: uniqueName,
            size: fileData.length
          }));

          console.log('[Upload] ' + uniqueName + ' (' + (fileData.length / 1024).toFixed(0) + ' KB)');
        }
      } catch(e) {
        console.error('[Error]', e.message);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({status: 'ok', bucket: BUCKET}));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, function() {
  console.log('');
  console.log('  ◆ FirstLight GCS Upload Server');
  console.log('  Port: ' + PORT);
  console.log('  Bucket: ' + BUCKET);
  console.log('  Ready for uploads.');
  console.log('');
});
