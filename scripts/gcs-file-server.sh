#!/bin/bash
# ═══════════════════════════════════════════════════════
# FIRST LIGHT — GCS File Server (Local Proxy)
# Runs locally on port 3001 — handles file uploads/downloads
# Uses your authenticated gcloud credentials
#
# Usage: ./gcs-file-server.sh
# Then app.js uploads to http://127.0.0.1:3001/upload
# ═══════════════════════════════════════════════════════

PORT=3001
BUCKET="gs://firstlightlive_archive"

echo "🚀 FirstLight GCS File Server starting on port ${PORT}..."
echo "   Bucket: ${BUCKET}"
echo "   Endpoints:"
echo "     POST /upload?path=storage/voice/file.webm  — upload file"
echo "     GET  /file?path=storage/voice/file.webm    — download file"
echo "     GET  /list?prefix=storage/voice/            — list files"
echo ""

python3 -c "
import http.server
import subprocess
import json
import urllib.parse
import os
import tempfile

BUCKET = '${BUCKET}'
PORT = ${PORT}

class GCSHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path.startswith('/upload'):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            gcs_path = qs.get('path', [''])[0]
            if not gcs_path:
                self._json(400, {'error': 'Missing ?path= parameter'})
                return

            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            # Write to temp file
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(gcs_path)[1]) as f:
                f.write(body)
                tmp_path = f.name

            # Upload to GCS
            full_path = f'{BUCKET}/{gcs_path}'
            result = subprocess.run(['gcloud', 'storage', 'cp', tmp_path, full_path],
                                    capture_output=True, text=True)
            os.unlink(tmp_path)

            if result.returncode == 0:
                url = f'https://storage.googleapis.com/{BUCKET.replace(\"gs://\",\"\")}/{gcs_path}'
                self._json(200, {'success': True, 'path': gcs_path, 'url': url, 'size': content_length})
            else:
                self._json(500, {'error': result.stderr.strip()})
        else:
            self._json(404, {'error': 'Not found'})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if parsed.path == '/file':
            gcs_path = qs.get('path', [''])[0]
            if not gcs_path:
                self._json(400, {'error': 'Missing ?path='})
                return
            # Download from GCS to temp
            with tempfile.NamedTemporaryFile(delete=False) as f:
                tmp_path = f.name
            result = subprocess.run(['gcloud', 'storage', 'cp', f'{BUCKET}/{gcs_path}', tmp_path],
                                    capture_output=True, text=True)
            if result.returncode == 0:
                self.send_response(200)
                self._cors()
                # Guess content type
                ext = os.path.splitext(gcs_path)[1].lower()
                ct = {'.json':'application/json','.webm':'audio/webm','.jpg':'image/jpeg',
                      '.jpeg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.ndjson':'application/x-ndjson'}.get(ext, 'application/octet-stream')
                self.send_header('Content-Type', ct)
                with open(tmp_path, 'rb') as f:
                    data = f.read()
                self.send_header('Content-Length', len(data))
                self.end_headers()
                self.wfile.write(data)
                os.unlink(tmp_path)
            else:
                os.unlink(tmp_path)
                self._json(404, {'error': 'File not found'})

        elif parsed.path == '/list':
            prefix = qs.get('prefix', [''])[0]
            result = subprocess.run(['gcloud', 'storage', 'ls', '-l', f'{BUCKET}/{prefix}'],
                                    capture_output=True, text=True)
            files = []
            for line in result.stdout.strip().split('\n'):
                if line.startswith('gs://') or 'TOTAL:' in line or not line.strip():
                    continue
                parts = line.strip().split()
                if len(parts) >= 3:
                    files.append({'size': int(parts[0]) if parts[0].isdigit() else 0, 'modified': parts[1], 'path': parts[2].replace(f'{BUCKET}/', '')})
            self._json(200, {'files': files, 'count': len(files)})

        elif parsed.path == '/health':
            self._json(200, {'status': 'ok', 'bucket': BUCKET})

        else:
            self._json(404, {'error': 'Not found. Use /upload, /file, /list, /health'})

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, code, data):
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        body = json.dumps(data).encode()
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print(f'[GCS] {args[0]}')

server = http.server.HTTPServer(('127.0.0.1', PORT), GCSHandler)
print(f'✓ GCS File Server running on http://127.0.0.1:{PORT}')
server.serve_forever()
"
