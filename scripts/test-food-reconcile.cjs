// Offline browser regression for the Sep 27 reset and single-source food status.
// No production writes: local site server + mocked Supabase reads/writes.
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '../website');
const mime = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml'};
const cors = {'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};
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
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
  const writes = [];
  let food = null;
  async function makePage(iso, width = 390) {
    const page = await browser.newPage();
    await page.setViewport({width,height:844});
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument(fixed => {
      const NativeDate = Date;
      const at = new NativeDate(fixed).getTime();
      class TestDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [at])); }
        static now() { return at; }
      }
      window.Date = TestDate;
    }, iso);
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      if (url.includes('/rest/v1/config') && url.includes('RULES_CHECKIN_')) {
        const value = food ? [{value:JSON.stringify({food})}] : [];
        return req.respond({status:req.method()==='OPTIONS'?204:200,headers:cors,body:req.method()==='OPTIONS'?'':JSON.stringify(value)});
      }
      if (url.includes('/auth/v1/user')) {
        return req.respond({status:req.method()==='OPTIONS'?204:200,headers:cors,body:req.method()==='OPTIONS'?'':JSON.stringify({email:'firstlightlive@gmail.com'})});
      }
      if (/supabase\.co|googleapis\.com|gstatic\.com/.test(url)) {
        if (!['GET','HEAD','OPTIONS'].includes(req.method())) writes.push({method:req.method(),url});
        return req.respond({status:req.method()==='OPTIONS'?204:200,headers:cors,body:req.method()==='OPTIONS'?'':'[]'});
      }
      if (!['GET','HEAD','OPTIONS'].includes(req.method())) {
        writes.push({method:req.method(),url});
        return req.respond({status:204,body:''});
      }
      req.continue();
    });
    await page.goto(base + '/404.html', {waitUntil:'domcontentloaded'});
    await page.evaluate(() => {
      localStorage.setItem('fl_supabase_session', JSON.stringify({access_token:'offline-test',expires_at:4102444800,user:{email:'firstlightlive@gmail.com'}}));
      sessionStorage.setItem('fl_unlock_session', JSON.stringify({until:4102444800000}));
    });
    return page;
  }
  try {
    const discipline = await makePage('2026-09-28T12:00:00+05:30');
    await discipline.evaluate(() => {
      localStorage.setItem('fl_ch4_log', JSON.stringify({'2026-09-23':{logged:true,nightFood:true,penance:{cycle:0,run:0,walk:30}}}));
      localStorage.setItem('fl_ch4_cleared', JSON.stringify({cycle:0,run:0,walk:0}));
    });
    await discipline.goto(base + '/discipline.html', {waitUntil:'domcontentloaded'});
    const d = await discipline.evaluate(() => ({
      text:document.body.innerText,
      debt:document.getElementById('debtTotal').innerText,
      log:JSON.parse(localStorage.getItem('fl_ch4_log')),
      overflow:document.documentElement.scrollWidth-innerWidth,
      rulesLink:!!document.querySelector('a[href="rules.html"]')
    }));
    check(!d.text.includes('Solid food at night'), 'Discipline has no second food toggle');
    check(d.rulesLink, 'Discipline points to the owner food check-in');
    check(d.log['2026-09-27'].penance.walk === 0, 'Unlogged Sep 27 creates no local food-walk debt');
    check(d.log['2026-09-23'].nightFood === true, 'Older local history is preserved');
    check(d.debt.trim().startsWith('220') && d.log['2026-09-27'].penance.cycle === 220, 'Current-run debt excludes older food debt');
    check(d.overflow <= 2, 'Discipline repayment controls fit a 390px phone');
    await discipline.close();

    const punch = await makePage('2026-09-27T12:00:00+05:30');
    await punch.goto(base + '/punch.html', {waitUntil:'domcontentloaded'});
    await punch.evaluate(() => {
      window.__upserts = [];
      FL.upsert = async (table, row) => { window.__upserts.push({table,row}); return {ok:true}; };
    });
    check(await punch.$('#p-food-toggles') === null, 'Punch no longer offers a second food status');
    check((await punch.$eval('.p-food-link', a => a.getAttribute('href'))) === '/rules.html', 'Punch links to canonical check-in');
    await punch.click('#p-cta');
    await new Promise(resolve => setTimeout(resolve, 250));
    const upserts = await punch.evaluate(() => window.__upserts);
    const daily = upserts.find(item => item.table === 'daily_checkin');
    check(!!daily && !Object.hasOwn(daily.row, 'food_status'), 'Punch upsert omits the separate food_status field');
    await punch.close();

    const scanner = await makePage('2026-09-27T12:00:00+05:30');
    await scanner.evaluate(() => {
      document.body.innerHTML = '<div id="panel-food-scanner"></div>';
      localStorage.setItem('fl_aikey','offline-test-only');
      localStorage.setItem('fl_slips',JSON.stringify([{id:'older-slip',penalty:'20km_walk'}]));
      window.SB = {init:() => false};
      const originalFetch = window.fetch;
      window.fetch = (url, options) => {
        if(String(url).includes('generativelanguage.googleapis.com')){
          const finding={items:[{name:'sample',calories:100}],total:{calories:100,protein_g:1,carbs_g:2,fat_g:3,fiber_g:0},violations:[{rule:'1.1',item:'sample',reason:'possible frying'}],verdict:'VIOLATION',health_score:5,summary:'Review this meal'};
          return Promise.resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(finding)}]}}]}),{status:200,headers:{'content-type':'application/json'}}));
        }
        return originalFetch(url,options);
      };
    });
    await scanner.addScriptTag({url:base+'/js/admin-food.js'});
    const scan = await scanner.evaluate(async () => {
      renderFoodScanner();
      const input=document.getElementById('foodCameraInput');
      const files=new DataTransfer();
      files.items.add(new File([new Uint8Array([137,80,78,71])],'meal.png',{type:'image/png'}));
      input.files=files.files;
      await handleFoodCapture(input);
      return {result:document.getElementById('foodAnalysisResult').innerText,slips:JSON.parse(localStorage.getItem('fl_slips')),log:JSON.parse(localStorage.getItem('fl_food_log'))};
    });
    check(scan.result.includes('NO PENALTY CREATED'), 'AI food scan is advisory even when it flags a violation');
    check(scan.slips.length === 1 && scan.slips[0].id === 'older-slip', 'AI scan creates no new slip and preserves older slips');
    check(scan.log.length === 1 && scan.log[0].verdict === 'VIOLATION', 'AI meal analysis remains available as evidence');
    await scanner.close();

    const social = await makePage('2026-09-26T12:00:00+05:30');
    await social.evaluate(() => localStorage.setItem('fl_log', JSON.stringify({'2026-06-21':{done:true,day:2}})));
    await social.goto(base + '/app/index.html', {waitUntil:'domcontentloaded'});
    await new Promise(resolve => setTimeout(resolve, 500));
    const preview = await social.evaluate(() => ({
      day:document.getElementById('dayNum').value,
      date:document.getElementById('dateStr').textContent,
      badge:document.getElementById('foodCodeBadge').textContent,
      history:JSON.parse(localStorage.getItem('fl_log')),
      overflow:document.documentElement.scrollWidth-innerWidth
    }));
    check(preview.day === '1' && /27 SEP 2026/i.test(preview.date), 'Generator previews Day 1 on Sep 27, not Day 99');
    check(preview.badge.includes('UNCONFIRMED'), 'Generator never defaults food to CLEAN');
    check(Object.keys(preview.history).length === 1 && preview.history['2026-06-21'].done, 'Generator preserves history without fabricating completed days');
    check(preview.overflow <= 2, 'Generator fits a 390px phone');
    let blocked = await social.evaluate(() => { try { generateCaption(1); return false; } catch (e) { return /unconfirmed/i.test(e.message); } });
    check(blocked, 'Unconfirmed food blocks caption generation');
    await social.evaluate(() => igPublishCarousel());
    check(writes.length === 0, 'Unconfirmed food blocks publishing before any upload');
    await social.close();

    food = 'clean';
    const foodDay = await makePage('2026-09-27T12:00:00+05:30');
    await foodDay.goto(base + '/app/index.html', {waitUntil:'domcontentloaded'});
    await foodDay.evaluate(() => refreshCanonicalFoodStatus());
    const clean = await foodDay.evaluate(() => ({status:canonicalFoodStatus,badge:document.getElementById('foodCodeBadge').textContent,card:document.querySelector('[data-key="food"]').classList.contains('on')}));
    check(clean.status === 'clean' && clean.card && clean.badge.includes('CLEAN'), 'Generator mirrors explicit CLEAN from the check-in');
    await foodDay.evaluate(() => tap(document.querySelector('[data-key="food"]')));
    check(await foodDay.evaluate(() => canonicalFoodStatus === 'clean' && document.querySelector('[data-key="food"]').classList.contains('on')), 'Generator food state cannot be manually toggled');
    await foodDay.evaluate(() => {generatedFoodStatus='clean';generatedFoodDate=canonicalFoodDate;generatedRunDay=computeStreakDay();});
    food = 'broken';
    await foodDay.evaluate(() => refreshCanonicalFoodStatus());
    check(await foodDay.evaluate(() => canonicalFoodStatus === 'broken' && document.getElementById('foodCodeBadge').textContent.includes('BROKEN')), 'Generator mirrors explicit BROKEN');
    check(await foodDay.evaluate(() => generatedFoodStatus === null), 'Changing food status invalidates previously generated assets');
    await foodDay.evaluate(() => igPublishCarousel());
    check(writes.length === 0, 'Stale assets cannot publish after the check-in changes');
    await foodDay.close();

    food = null;
    const dayTwo = await makePage('2026-09-28T12:00:00+05:30');
    await dayTwo.goto(base + '/app/index.html', {waitUntil:'domcontentloaded'});
    check((await dayTwo.$eval('#dayNum', el => el.value)) === '2', 'Generator advances to Day 2 on Sep 28');
    check(await dayTwo.evaluate(() => !Object.hasOwn(JSON.parse(localStorage.getItem('fl_log')||'{}'),'2026-09-27')), 'Day 2 load does not invent a Day 1 success');
    await dayTwo.close();

    process.stdout.write('\n' + passed + '/' + passed + ' food/reset browser checks passed\n');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {console.error(error);server.close();process.exit(1);});
