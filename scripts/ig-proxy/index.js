const https = require('https');

exports.igProxy = (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Auth check
  const adminKey = req.headers['x-admin-key'] || '';
  if (adminKey !== 'b8464678b573c885c449958a9ea760c08b01279d01d3a1f996fc92b7364f10b7') {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }

  const { url } = req.body || {};
  if (!url || !url.includes('graph.facebook.com')) {
    res.status(400).json({ error: 'Missing or invalid url parameter' }); return;
  }

  // Make the actual HTTP POST to Facebook Graph API
  const parsed = new URL(url);
  const options = {
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers: { 'Content-Length': 0 }
  };

  const fbReq = https.request(options, (fbRes) => {
    let body = '';
    fbRes.on('data', (chunk) => body += chunk);
    fbRes.on('end', () => {
      try {
        res.status(fbRes.statusCode).json(JSON.parse(body));
      } catch (e) {
        res.status(fbRes.statusCode).json({ raw: body });
      }
    });
  });

  fbReq.on('error', (e) => {
    res.status(500).json({ error: e.message });
  });

  fbReq.end();
};
