// Browser regression for the dedicated food page and cross-page sync.
// Covers: the calendar's tracked/untracked/clean/broken classification, the
// three-way miss breakdown, day detail, and that two open surfaces stay in
// step without a reload. No production writes.
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '../website');
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const cors = {'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,prefer','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','content-type':'application/json'};
let passed = 0;
function check(ok, message) {
  if (!ok) throw new Error(message);
  passed++;
  process.stdout.write('  ✓ ' + message + '\n');
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://l').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {'content-type': mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});

// The server-side truth this run pretends to have.
let FOOD_ROWS = [];
let CHECKINS = {};          // date -> {screens,food,night,note}
let writes = [];

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({headless:true, args:['--no-sandbox']});

  async function makePage(iso, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    await page.setViewport({width: opts.width || 390, height: 900});
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument(fixed => {
      const N = Date; const at = new N(fixed).getTime();
      class T extends N { constructor(...a){ super(...(a.length?a:[at])); } static now(){ return at; } }
      window.Date = T;
    }, iso);
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url(), method = req.method();
      if (!/supabase\.co|googleapis\.com/.test(url)) { req.continue(); return; }
      if (method === 'OPTIONS') { req.respond({status:204, headers:cors, body:''}); return; }
      if (url.includes('/auth/v1/user')) {
        req.respond({status:200, headers:cors, body:JSON.stringify({email:'firstlightlive@gmail.com'})}); return;
      }
      if (url.includes('/rest/v1/food_log')) {
        if (method === 'GET') { req.respond({status:200, headers:cors, body:JSON.stringify(FOOD_ROWS)}); return; }
        writes.push({table:'food_log', body:req.postData()});
        try { FOOD_ROWS = [JSON.parse(req.postData())].concat(FOOD_ROWS); } catch(e) {}
        req.respond({status:201, headers:cors, body:'[]'}); return;
      }
      if (url.includes('/rest/v1/config')) {
        const out = [];
        for (const d of Object.keys(CHECKINS)) out.push({key:'RULES_CHECKIN_'+d, value:JSON.stringify(CHECKINS[d])});
        req.respond({status:200, headers:cors, body:JSON.stringify(out)}); return;
      }
      if (method !== 'GET') writes.push({url, method});
      req.respond({status:200, headers:cors, body:'[]'});
    });
    await page.goto(base + '/404.html', {waitUntil:'domcontentloaded'});
    await page.evaluate(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch(e) {}
      localStorage.setItem('fl_supabase_session', JSON.stringify({
        access_token:'t', refresh_token:'r', expires_at:4102444800, user:{email:'firstlightlive@gmail.com'}}));
      localStorage.setItem('fl_rules_owner', '1');
    });
    return page;
  }

  try {
    // Day 1 = 2026-09-27. "Today" is Oct 3 → Day 7, so there is a real window
    // with a mix of tracked, untracked, clean and broken days.
    const TODAY = '2026-10-03T14:00:00+05:30';
    FOOD_ROWS = [
      {id:'a1', date:'2026-09-27', meal_time:'08:10', source:'scan',   verdict:'CLEAN',     calories:420, summary:'oats, eggs', data:{items:[],total:{calories:420,protein_g:28,carbs_g:40,fat_g:12,fiber_g:6}}},
      {id:'a2', date:'2026-09-27', meal_time:'13:30', source:'manual', verdict:'UNREVIEWED',calories:600, summary:'rice, dal',  data:{items:[],total:{calories:600,protein_g:22,carbs_g:90,fat_g:10,fiber_g:8}}},
      {id:'b1', date:'2026-09-28', meal_time:'09:00', source:'scan',   verdict:'VIOLATION', calories:700, summary:'samosa',     data:{items:[],total:{calories:700,protein_g:8,carbs_g:70,fat_g:40,fiber_g:3},violations:[{rule:'1.1',item:'samosa',reason:'fried'}]}},
      {id:'d1', date:'2026-09-30', meal_time:'20:00', source:'manual', verdict:'UNREVIEWED',calories:500, summary:'khichdi',    data:{items:[],total:{calories:500,protein_g:18,carbs_g:70,fat_g:9,fiber_g:7}}},
      {id:'e1', date:'2026-10-03', meal_time:'07:45', source:'manual', verdict:'UNREVIEWED',calories:300, summary:'fruit bowl', data:{items:[],total:{calories:300,protein_g:4,carbs_g:60,fat_g:2,fiber_g:9}}}
    ];
    CHECKINS = {
      '2026-09-27': {screens:'clean', food:'clean',  night:'clean'},
      '2026-09-28': {screens:'clean', food:'broken', night:'clean', note:'party, ate fried'},
      '2026-09-30': {screens:'clean', food:'clean',  night:'clean'}
      // Sep 29, Oct 1, Oct 2 = no marks; Sep 29/Oct 1/Oct 2 also have no meals.
    };

    process.stdout.write('\nFOOD PAGE — CALENDAR\n');
    const page = await makePage(TODAY);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + '/food.html', {waitUntil:'domcontentloaded'});
    await new Promise(r => setTimeout(r, 1200));

    check(errs.length === 0, 'the page loads with no JS errors' + (errs.length ? ': ' + errs[0] : ''));
    check(await page.evaluate(() => document.getElementById('food-app').style.display === 'block'),
      'the owner gate opens the page');

    const cells = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('#calendar button.cell[data-d]').forEach(b => {
        out[b.dataset.d] = b.className.replace('cell', '').trim();
      });
      return out;
    });
    check(/\bclean\b/.test(cells['2026-09-27']), 'Sep 27 (tracked + marked clean) renders CLEAN');
    check(/\bbroken\b/.test(cells['2026-09-28']), 'Sep 28 (owner marked BROKEN) renders BROKEN');
    check(/\btracked\b/.test(cells['2026-10-03']), 'Oct 3 (meals logged, not yet marked) renders TRACKED');
    check(/\bgap\b/.test(cells['2026-09-29']), 'Sep 29 (nothing logged) renders NOT TRACKED');
    check(/\bpre\b/.test(cells['2026-09-26']), 'Sep 26 (before Day 1) is shown as outside the run');
    check(/\bvoid\b/.test(cells['2026-10-04'] || 'void'), 'future days are inert');
    check(/\btoday\b/.test(cells['2026-10-03']), 'today is ringed');

    process.stdout.write('\nFOOD PAGE — STATS\n');
    const stats = await page.evaluate(() => document.getElementById('stats').innerText);
    check(/DAYS TRACKED/.test(stats) && /\b4\b/.test(stats), 'days-tracked counts the 4 distinct logged days');
    check(/MEALS LOGGED/.test(stats) && /\b5\b/.test(stats), 'meals-logged counts all 5 meals');
    check(/BREAKS/.test(stats), 'breaks are counted separately from gaps');
    check(/AI FLAGS/.test(stats), 'AI flags are counted separately from breaks');

    process.stdout.write('\nFOOD PAGE — THE MISSES (three kinds, never mixed)\n');
    const misses = await page.evaluate(() => document.getElementById('misses').innerText);
    check(/BROKEN[\s\S]*only one that costs 50 km/i.test(misses), 'section 1 names the owner-marked break as the only costed one');
    check(/FOOD CODE BROKEN/.test(misses) && /28 SEP/i.test(misses), 'the Sep 28 break is listed with its date');
    check(/NOT TRACKED[\s\S]*not a penalty by itself/i.test(misses), 'section 2 states an untracked day is not itself a penalty');
    check(/29 SEP/i.test(misses) && /01 OCT/i.test(misses), 'the untracked days are listed');
    check(/AI FLAGGED[\s\S]*never create debt/i.test(misses), 'section 3 keeps AI flags advisory');
    check(/no debt/.test(misses), 'the AI-flagged row says no debt');

    process.stdout.write('\nFOOD PAGE — DAY DETAIL\n');
    await page.evaluate(() => document.querySelector('#calendar button.cell[data-d="2026-09-28"]').click());
    await new Promise(r => setTimeout(r, 250));
    const det = await page.evaluate(() => document.getElementById('detail').innerText);
    check(/FOOD CODE BROKEN — 50 KM OWED/.test(det), 'the detail shows the break and what it costs');
    check(/party, ate fried/.test(det), 'the day note from the check-in is shown');
    check(/samosa/.test(det), 'the meal is listed');
    check(/Rule 1\.1/.test(det) && /ADVISORY/.test(det), 'the AI reason shows, labelled advisory');
    check(/700/.test(det), 'the macro totals render');

    await page.evaluate(() => document.querySelector('#calendar button.cell[data-d="2026-09-29"]').click());
    await new Promise(r => setTimeout(r, 250));
    const det2 = await page.evaluate(() => document.getElementById('detail').innerText);
    check(/NOT TRACKED — NO MEAL LOGGED/.test(det2), 'an untracked day says exactly that, with no invented verdict');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(overflow <= 2, 'the page fits a 390px phone with no horizontal scroll');
    await page.close();

    // ═══ CROSS-PAGE SYNC ═════════════════════════════════════════════
    process.stdout.write('\nCROSS-PAGE SYNC\n');
    const p2 = await makePage(TODAY);
    await p2.goto(base + '/food.html', {waitUntil:'domcontentloaded'});
    await new Promise(r => setTimeout(r, 1000));

    check(await p2.evaluate(() => !!(window.FL && typeof FL.onChange === 'function' && typeof FL.emit === 'function')),
      'the change bus is exposed on FL');
    check(await p2.evaluate(() => !!(window.FLFood && typeof FLFood.onChange === 'function')),
      'the food store exposes onChange for other surfaces');

    // A subscriber must hear a local write.
    const heard = await p2.evaluate(async () => {
      const seen = [];
      FLFood.onChange(m => seen.push(m.source));
      FLFood.logMeal({date:'2026-10-03', time:'19:00', source:'manual', items:[],
        total:{calories:250}, violations:[], verdict:'UNREVIEWED', summary:'bus test'});
      await new Promise(r => setTimeout(r, 400));
      return seen;
    });
    check(heard.length > 0, 'a write notifies subscribers on the same page');

    // The page repaints itself: the new meal appears without a reload.
    await new Promise(r => setTimeout(r, 700));
    check(await p2.evaluate(() => document.getElementById('detail').innerText.includes('bus test')
                              || document.body.innerText.includes('bus test')),
      'the page repaints to show the new meal without a reload');

    // Simulate ANOTHER tab/page writing: a storage event carrying a bus ping.
    const crossTab = await p2.evaluate(async () => {
      const seen = [];
      FLFood.onChange(m => seen.push(m.source));
      // What another tab's FL.emit() leaves behind, with a different tab id.
      const ping = JSON.stringify({type:'food_log', detail:null, tab:'some-other-tab', at:Date.now()});
      localStorage.setItem('fl_bus_ping', ping);
      window.dispatchEvent(new StorageEvent('storage', {key:'fl_bus_ping', newValue:ping}));
      await new Promise(r => setTimeout(r, 400));
      return seen;
    });
    check(crossTab.includes('tab'), 'a write from another tab reaches this page as source=tab');

    // Our own tab's ping must NOT echo back and cause a loop.
    const noEcho = await p2.evaluate(async () => {
      const seen = [];
      FLFood.onChange(m => seen.push(m.source));
      const ping = JSON.stringify({type:'food_log', detail:null, tab:FL.tabId, at:Date.now()});
      window.dispatchEvent(new StorageEvent('storage', {key:'fl_bus_ping', newValue:ping}));
      await new Promise(r => setTimeout(r, 300));
      return seen;
    });
    check(!noEcho.includes('tab'), 'a page ignores its own bus ping (no render loop)');
    await p2.close();

    // The compact widget registered by renderInto must repaint too.
    process.stdout.write('\nWIDGET REPAINT (Lifetime System panel)\n');
    const p3 = await makePage(TODAY);
    await p3.evaluate(() => {
      document.body.innerHTML = '<div id="box"></div>';
      window.FL = {SUPABASE_URL:'https://edgnudrbysybefbqyijq.supabase.co', SUPABASE_ANON_KEY:'anon'};
      window.FL.upsert = async () => ({ok:true, status:201});
      window.FL.ownerToken = async () => 't';
    });
    await p3.addScriptTag({url: base + '/js/admin-food.js'});
    const widget = await p3.evaluate(async () => {
      FLFood.renderInto(document.getElementById('box'), {compact:true});
      const before = document.getElementById('box').innerText;
      FLFood.logMeal({date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),
        time:'21:00', source:'manual', items:[], total:{calories:333},
        violations:[], verdict:'UNREVIEWED', summary:'widget repaint probe'});
      await new Promise(r => setTimeout(r, 400));
      return {before, after: document.getElementById('box').innerText};
    });
    check(!/widget repaint probe/.test(widget.before), 'the widget starts without the new meal');
    check(/widget repaint probe/.test(widget.after), 'the widget repaints itself on a write elsewhere');
    check(/333/.test(widget.after), 'the widget picks up the new calories');
    await p3.close();

    // Regression: the sync wiring must not repaint the panel out from under a
    // transient view. Saving a scanned meal used to trigger a full re-render
    // that detached #foodAnalysisResult before the verdict was ever visible.
    process.stdout.write('\nREGRESSION — a local write must not wipe a transient view\n');
    const p4 = await makePage(TODAY);
    await p4.evaluate(() => { document.body.innerHTML = '<div id="panel-food-scanner"></div>'; });
    // Load the REAL runtime here (not a stub FL): the cross-tab listener lives
    // in fl-offline.js, so a hand-rolled window.FL would not exercise the bus
    // at all and the external-repaint case would silently prove nothing.
    await p4.addScriptTag({url: base + '/js/config.js'});
    await p4.addScriptTag({url: base + '/js/fl-offline.js'});
    await p4.addScriptTag({url: base + '/js/admin-food.js'});
    await new Promise(r => setTimeout(r, 400));
    check(await p4.evaluate(() => typeof FL.onChange === 'function'),
      'the real offline runtime is in play for this case');
    const keep = await p4.evaluate(async () => {
      renderFoodScanner();
      const res = document.getElementById('foodAnalysisResult');
      res.innerHTML = '<div id="probe">TRANSIENT VERDICT — NO PENALTY CREATED</div>';
      const node = document.getElementById('probe');
      FLFood.logMeal({date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),
        time:'12:00', source:'manual', items:[], total:{calories:100},
        violations:[], verdict:'UNREVIEWED', summary:'probe meal'});
      await new Promise(r => setTimeout(r, 900));
      return {
        stillThere: !!document.getElementById('probe'),
        stillAttached: node.isConnected,
        text: (document.getElementById('foodAnalysisResult') || {}).innerText || ''
      };
    });
    check(keep.stillThere && keep.stillAttached, 'a transient scan result survives the save that follows it');
    check(/NO PENALTY CREATED/.test(keep.text), 'the advisory verdict is still readable after the write');

    // But a change from ELSEWHERE should repaint once the transient view is gone.
    const repaint = await p4.evaluate(async () => {
      document.getElementById('foodAnalysisResult').innerHTML = '';
      const ping = JSON.stringify({type:'food_log', detail:null, tab:'other-tab', at:Date.now()});
      localStorage.setItem('fl_bus_ping', ping);
      window.dispatchEvent(new StorageEvent('storage', {key:'fl_bus_ping', newValue:ping}));
      await new Promise(r => setTimeout(r, 800));
      return document.getElementById('panel-food-scanner').innerText;
    });
    check(/probe meal/.test(repaint), 'the panel does repaint for an external change once nothing transient is showing');
    await p4.close();

    process.stdout.write('\n' + passed + '/' + passed + ' food page + sync checks passed\n');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error('\n✗ ' + e.message); server.close(); process.exit(1); });
