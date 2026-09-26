// Browser regression for the two things that must survive the home WiFi going
// off for good: the lifetime food log, and the daily rules check-in.
// No production writes — local site server, mocked Supabase, forced offline.
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '../website');
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const cors = {'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,prefer','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','content-type':'application/json'};
let passed = 0;
function check(ok, message) {
  if (!ok) throw new Error(message);
  passed++;
  process.stdout.write('  ✓ ' + message + '\n');
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {'content-type': mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({headless:true, args:['--no-sandbox']});

  // Requests that reached the network, and how the mock should answer.
  let posts = [];
  let fnStatus = 200;       // status for the edge-function check-in
  let simulateOffline = false;

  async function makePage(iso, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    await page.setViewport({width: opts.width || 390, height: 844});
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument((fixed, offline) => {
      const NativeDate = Date;
      const at = new NativeDate(fixed).getTime();
      class TestDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [at])); }
        static now() { return at; }
      }
      window.Date = TestDate;
      if (offline) {
        // Forced offline WITHOUT killing page load, so the page's own
        // navigator.onLine branches are what gets exercised.
        Object.defineProperty(window.navigator, 'onLine', { get: () => false, configurable: true });
      }
    }, iso, !!opts.offline);

    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      const method = req.method();
      const isRemote = /supabase\.co|googleapis\.com|gstatic\.com/.test(url);
      if (!isRemote) { req.continue(); return; }
      if (method === 'OPTIONS') { req.respond({status: 204, headers: cors, body: ''}); return; }
      // Offline: every remote call fails the way a dead network fails.
      if (simulateOffline) { req.abort('internetdisconnected'); return; }
      if (url.includes('/functions/v1/firstlight-sync')) {
        posts.push({url, method, body: req.postData()});
        const ok = fnStatus === 200;
        req.respond({status: fnStatus, headers: cors,
          body: JSON.stringify(ok ? {ok:true, date:'2026-09-27', checkin:{food:'clean'}}
                                  : {error:'Only the current day from 2026-09-27 can be checked in.', detail:'date outside window'})});
        return;
      }
      if (url.includes('/auth/v1/user')) {
        req.respond({status:200, headers:cors, body: JSON.stringify({email:'firstlightlive@gmail.com'})});
        return;
      }
      if (url.includes('/rest/v1/food_log')) {
        if (method !== 'GET') posts.push({url, method, body: req.postData()});
        req.respond({status: method === 'GET' ? 200 : 201, headers: cors, body: '[]'});
        return;
      }
      if (method !== 'GET') posts.push({url, method, body: req.postData()});
      req.respond({status:200, headers:cors, body:'[]'});
    });

    await page.goto(base + '/404.html', {waitUntil:'domcontentloaded'});
    await page.evaluate(() => {
      // Every page in this run shares one origin, so state leaks between cases
      // unless each starts clean (the 700-row seed below would otherwise show
      // up in the next test's cache assertions).
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      localStorage.setItem('fl_supabase_session', JSON.stringify({
        access_token:'offline-test', refresh_token:'r', expires_at: 4102444800,
        user:{email:'firstlightlive@gmail.com'}
      }));
      sessionStorage.setItem('fl_unlock_session', JSON.stringify({until:4102444800000}));
    });
    return page;
  }

  try {
    // ═══ 1. FOOD — lifetime persistence ═══════════════════════════════
    process.stdout.write('\nFOOD LOG — LIFETIME\n');
    const food = await makePage('2026-09-27T12:00:00+05:30');
    await food.evaluate(() => {
      document.body.innerHTML = '<div id="panel-food-scanner"></div>';
      window.FL = {SUPABASE_URL:'https://edgnudrbysybefbqyijq.supabase.co', SUPABASE_ANON_KEY:'anon'};
      window.__ups = [];
      window.FL.upsert = async (table, row) => { window.__ups.push({table, row}); return {ok:true, status:201}; };
      window.FL.ownerToken = async () => 'tok';
    });
    await food.addScriptTag({url: base + '/js/admin-food.js'});
    await food.evaluate(() => renderFoodScanner());

    check(await food.evaluate(() => !!document.getElementById('fdmSave')),
      'hand-logging form is present (the no-AI, no-network path)');

    const manual = await food.evaluate(async () => {
      document.getElementById('fdmDesc').value = '3 roti, dal, sabzi';
      document.getElementById('fdmCal').value = '520';
      document.getElementById('fdmP').value = '18';
      document.getElementById('fdmSave').click();
      await new Promise(r => setTimeout(r, 120));
      return {
        ups: window.__ups,
        cache: JSON.parse(localStorage.getItem('fl_food_log') || '[]')
      };
    });
    check(manual.cache.length === 1 && manual.cache[0].summary === '3 roti, dal, sabzi',
      'a hand-logged meal lands in the local record immediately');
    check(manual.cache[0].verdict === 'UNREVIEWED',
      'a hand-logged meal is never auto-marked CLEAN');
    check(manual.ups.length === 1 && manual.ups[0].table === 'food_log',
      'the meal is pushed to the food_log table, not just localStorage');
    check(manual.ups[0].row.data && manual.ups[0].row.data.total.calories === 520,
      'macros travel in the JSONB payload');
    check(manual.ups[0].row.id && /^[0-9a-f-]{36}$/.test(manual.ups[0].row.id),
      'the client mints a uuid so a replayed write merges instead of duplicating');
    await food.close();

    // ═══ 2. FOOD — no 60-day / 500-entry horizon ══════════════════════
    const cap = await makePage('2026-09-27T12:00:00+05:30');
    await cap.evaluate(() => {
      document.body.innerHTML = '<div id="panel-food-scanner"></div>';
      window.FL = {SUPABASE_URL:'https://edgnudrbysybefbqyijq.supabase.co', SUPABASE_ANON_KEY:'anon'};
      window.FL.upsert = async () => ({ok:true, status:202});   // queued, i.e. offline
      window.FL.ownerToken = async () => 'tok';
      // 700 days of history, well past any 60-day or 500-row window.
      const seed = [];
      for (let i = 0; i < 700; i++) {
        const d = new Date(Date.UTC(2026, 8, 27) - i * 86400000).toISOString().slice(0, 10);
        seed.push({id:'old-' + i, date:d, time:'08:00', verdict:'CLEAN', synced:true,
                   total:{calories:400}, summary:'day ' + i, items:[]});
      }
      localStorage.setItem('fl_food_log', JSON.stringify(seed));
    });
    await cap.addScriptTag({url: base + '/js/admin-food.js'});
    const capRes = await cap.evaluate(async () => {
      renderFoodScanner();
      document.getElementById('fdmDesc').value = 'new meal';
      document.getElementById('fdmSave').click();
      await new Promise(r => setTimeout(r, 150));
      const rows = JSON.parse(localStorage.getItem('fl_food_log') || '[]');
      return {
        total: rows.length,
        oldestKept: rows[rows.length - 1].date,
        unsynced: rows.filter(r => !r.synced).length
      };
    });
    check(capRes.total === 701, 'a 700-day history is kept in full (no 500-row truncation)');
    check(capRes.oldestKept === '2024-10-28', 'the oldest day survives a new write');
    check(capRes.unsynced === 1, 'an unsynced meal stays flagged until the queue drains');
    await cap.close();

    // ═══ 3. FOOD — offline scan failure still leaves a usable path ═════
    process.stdout.write('\nFOOD LOG — OFFLINE\n');
    simulateOffline = true;
    const offFood = await makePage('2026-09-27T12:00:00+05:30', {offline:true});
    await offFood.evaluate(() => {
      document.body.innerHTML = '<div id="panel-food-scanner"></div>';
      window.FL = {SUPABASE_URL:'https://edgnudrbysybefbqyijq.supabase.co', SUPABASE_ANON_KEY:'anon'};
      window.FL.upsert = async () => { throw new Error('offline'); };
      window.FL.ownerToken = async () => 'tok';
    });
    await offFood.addScriptTag({url: base + '/js/admin-food.js'});
    const offRes = await offFood.evaluate(async () => {
      renderFoodScanner();
      document.getElementById('fdmDesc').value = 'offline dinner';
      document.getElementById('fdmSave').click();
      await new Promise(r => setTimeout(r, 150));
      return {
        cache: JSON.parse(localStorage.getItem('fl_food_log') || '[]'),
        msg: document.body.innerText
      };
    });
    check(offRes.cache.length === 1 && offRes.cache[0].summary === 'offline dinner',
      'a meal logged with no network is still recorded locally');
    check(offRes.cache[0].synced === false, 'it is marked unsynced, not silently "saved"');
    check(/OFFLINE/i.test(offRes.msg), 'the panel says it is offline rather than pretending otherwise');
    await offFood.close();

    // ═══ 4. RULES CHECK-IN — opens and records with no network ═════════
    process.stdout.write('\nRULES CHECK-IN — OFFLINE\n');
    const offRules = await makePage('2026-09-27T12:00:00+05:30', {offline:true});
    await offRules.evaluate(() => localStorage.setItem('fl_rules_owner', '1'));
    await offRules.goto(base + '/rules.html', {waitUntil:'domcontentloaded'});
    await new Promise(r => setTimeout(r, 600));
    const gate = await offRules.evaluate(() => ({
      appShown: document.getElementById('rules-app').style.display === 'block',
      authHidden: document.getElementById('auth-message').style.display === 'none',
      sync: document.getElementById('syncline').textContent,
      overflow: document.documentElement.scrollWidth - innerWidth
    }));
    check(gate.appShown && gate.authHidden, 'the check-in opens offline on a previously verified device');
    check(/OFFLINE/i.test(gate.sync), 'it states plainly that it is offline');
    check(gate.overflow <= 2, 'the check-in fits a 390px phone');

    const marked = await offRules.evaluate(async () => {
      document.getElementById('b-fd-clean').click();
      await new Promise(r => setTimeout(r, 250));
      return {
        local: JSON.parse(localStorage.getItem('fl_rules_local') || '{}'),
        pending: JSON.parse(localStorage.getItem('fl_rules_pending') || '[]'),
        mark: document.getElementById('mark-food').textContent,
        sync: document.getElementById('syncline').textContent
      };
    });
    check(marked.local['2026-09-27'] && marked.local['2026-09-27'].food === 'clean',
      'the mark is written locally the instant it is tapped');
    check(marked.pending.length === 1 && marked.pending[0].body.food === 'clean',
      'it is queued for the server, not dropped');
    check(/CLEAN/.test(marked.mark), 'the UI reflects the mark offline');
    check(/waiting to sync/i.test(marked.sync), 'the pending count is surfaced');
    await offRules.close();

    // ═══ 4b. RULES CHECK-IN — the normal online path still works ═══════
    process.stdout.write('\nRULES CHECK-IN — ONLINE\n');
    simulateOffline = false;
    fnStatus = 200;
    posts = [];
    const onRules = await makePage('2026-09-27T12:00:00+05:30');
    await onRules.goto(base + '/rules.html', {waitUntil:'domcontentloaded'});
    await new Promise(r => setTimeout(r, 600));
    const onRes = await onRules.evaluate(async () => {
      const shown = document.getElementById('rules-app').style.display === 'block';
      document.getElementById('b-fd-clean').click();
      await new Promise(r => setTimeout(r, 300));
      return {
        shown: shown,
        pending: JSON.parse(localStorage.getItem('fl_rules_pending') || '[]'),
        ownerFlag: localStorage.getItem('fl_rules_owner'),
        syncVisible: document.getElementById('syncline').style.display,
        mark: document.getElementById('mark-food').textContent
      };
    });
    check(onRes.shown, 'the check-in opens normally when online');
    check(onRes.ownerFlag === '1', 'an online owner verification unlocks later offline use');
    check(posts.some(x => x.url.includes('rules-checkin') && /"food":"clean"/.test(x.body || '')),
      'the mark is posted to the server when there is signal');
    check(onRes.pending.length === 0, 'an accepted mark is not left in the queue');
    check(onRes.syncVisible === 'none', 'the sync line stays hidden when everything is on the server');
    check(/CLEAN/.test(onRes.mark), 'the mark shows as CLEAN');
    await onRules.close();

    // ═══ 5. RULES CHECK-IN — a mark too late to record says so ═════════
    process.stdout.write('\nRULES CHECK-IN — LATE MARK IS NOT FAKED\n');
    simulateOffline = false;
    fnStatus = 400;
    posts = [];
    const late = await makePage('2026-09-27T12:00:00+05:30');
    await late.evaluate(() => {
      localStorage.setItem('fl_rules_owner', '1');
      // A mark captured days ago, whose check-in window has since closed.
      localStorage.setItem('fl_rules_pending', JSON.stringify([
        {body:{date:'2026-09-20', food:'clean'}, at: 1, field:'food'}
      ]));
    });
    await late.goto(base + '/rules.html', {waitUntil:'domcontentloaded'});
    await new Promise(r => setTimeout(r, 900));
    const lateRes = await late.evaluate(() => ({
      pending: JSON.parse(localStorage.getItem('fl_rules_pending') || '[]'),
      lateRows: JSON.parse(localStorage.getItem('fl_rules_late') || '[]'),
      sync: document.getElementById('syncline').textContent
    }));
    check(lateRes.pending.length === 0, 'a mark the server refuses stops being retried forever');
    check(lateRes.lateRows.length === 1 && lateRes.lateRows[0].body.date === '2026-09-20',
      'it is moved to the late list instead of being discarded');
    check(/LATE/.test(lateRes.sync), 'the page reports it as LATE rather than recorded');
    await late.close();

    // ═══ 6. LIFETIME SYSTEM PANEL — independent clock + its food section ═══
    process.stdout.write('\nLIFETIME SYSTEM PANEL\n');
    const rec = await makePage('2026-09-27T12:00:00+05:30');
    await rec.evaluate(() => {
      document.body.innerHTML = '<div id="recoveryRoot"></div>';
      window.FL = {SUPABASE_URL:'https://edgnudrbysybefbqyijq.supabase.co', SUPABASE_ANON_KEY:'anon'};
      window.FL.upsert = async () => ({ok:true, status:201});
      window.FL.ownerToken = async () => 'tok';
      localStorage.setItem('fl_food_log', JSON.stringify([
        {id:'m1', date:'2026-09-27', time:'08:30', verdict:'CLEAN', synced:true,
         total:{calories:450, protein_g:30, carbs_g:40, fat_g:12, fiber_g:6},
         summary:'oats and eggs', items:[]}
      ]));
    });
    await rec.addScriptTag({url: base + '/js/admin-food.js'});
    await rec.addScriptTag({url: base + '/js/admin-recovery.js'});
    await rec.evaluate(() => renderRecovery());
    await new Promise(r => setTimeout(r, 200));
    const recRes = await rec.evaluate(() => ({
      text: document.body.innerText,
      foodBox: (document.getElementById('recoveryFoodBox') || {}).innerText || '',
      overflow: document.documentElement.scrollWidth - innerWidth
    }));
    check(/LIFETIME SYSTEM/.test(recRes.text), 'the panel presents itself as a lifetime system');
    check(!/60-DAY SYSTEM/.test(recRes.text), 'the 60-day framing is gone from the rendered panel');
    check(/since 2026-09-23/.test(recRes.text),
      'the screens-free clock still runs from 2026-09-23, not the reset public epoch');
    check(/oats and eggs/.test(recRes.foodBox), 'the panel shows today\'s food from the shared lifetime log');
    check(/450/.test(recRes.foodBox), 'calories carry into the panel food section');
    check(/ONE YEAR/.test(recRes.text), 'the milestone ladder runs past a year');
    check(recRes.overflow <= 2, 'the lifetime panel fits a 390px phone');
    await rec.close();

    process.stdout.write('\n' + passed + '/' + passed + ' offline food + check-in checks passed\n');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error('\n✗ ' + e.message); server.close(); process.exit(1); });
