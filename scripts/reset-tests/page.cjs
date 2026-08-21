// Deep functional test of website/reset.html in real headless Chromium.
// - fakes the clock (IST) deterministically
// - mocks the Supabase REST API in-memory (records every call)
// - seeds a session so the FL-PRIVATE-GATE doesn't redirect
const puppeteer = require('puppeteer');
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const PAGE = 'file://' + path.resolve(REPO, 'website/reset.html');

// IST wall-time -> epoch ms
function istEpoch(y, m, d, H, M) { return Date.UTC(y, m - 1, d, H, M) - 5.5 * 3600 * 1000; }
function istDateStr(epoch, offDays) {
  return new Date(epoch + (offDays || 0) * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

const results = [];
function check(name, cond, detail) { results.push({ name, pass: !!cond, detail: detail || '' }); }

// injected into the page BEFORE any page script runs
function inject(fixedEpoch, session, initialDb) {
  const RealDate = Date;
  function FD() { if (arguments.length === 0) return new RealDate(fixedEpoch); return new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments)))); }
  FD.now = function () { return fixedEpoch; };
  FD.UTC = RealDate.UTC; FD.parse = RealDate.parse; FD.prototype = RealDate.prototype;
  window.Date = FD;
  try { localStorage.clear(); localStorage.setItem('fl_supabase_session', JSON.stringify(session)); } catch (e) {}
  const db = initialDb; window.__db = db; window.__calls = []; let urgeId = 9000;
  function rowsOf(t) { return t === 'reset_urges' ? db.reset_urges.slice() : Object.keys(db[t]).map(k => db[t][k]); }
  function keyFor(t) { return t === 'reset_state' ? 'id' : t === 'reset_days' ? 'd' : t === 'reset_relapses' ? 'occurred_on' : t === 'reset_punishments' ? 'relapse_on' : null; }
  window.fetch = function (input, initr) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    initr = initr || {}; const method = (initr.method || 'GET').toUpperCase();
    const m = url.match(/\/rest\/v1\/([^?]+)(\?(.*))?$/);
    if (!m) return Promise.resolve(new Response('[]', { status: 200 }));
    const table = m[1], qs = m[3] || '';
    let body = null; try { body = initr.body ? JSON.parse(initr.body) : null; } catch (e) {}
    window.__calls.push({ method, table, qs, body });
    if (method === 'GET') return Promise.resolve(new Response(JSON.stringify(rowsOf(table)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (method === 'POST') {
      const oc = /on_conflict=/.test(qs);
      if (table === 'reset_urges') { const a = Array.isArray(body) ? body : [body]; a.forEach(r => { r.id = urgeId++; db.reset_urges.push(r); }); return Promise.resolve(new Response(JSON.stringify(a), { status: 201 })); }
      const key = keyFor(table); const a = Array.isArray(body) ? body : [body];
      a.forEach(r => { const k = r[key]; db[table][k] = oc ? Object.assign(db[table][k] || {}, r) : r; });
      return Promise.resolve(new Response(JSON.stringify(a), { status: 200 }));
    }
    if (method === 'PATCH') {
      const key = keyFor(table); const fm = qs.match(new RegExp(key + '=eq\\.([^&]+)')); const val = fm ? decodeURIComponent(fm[1]) : null;
      if (val != null && db[table][val]) Object.assign(db[table][val], body);
      return Promise.resolve(new Response(JSON.stringify([db[table][val]]), { status: 200 }));
    }
    if (method === 'DELETE') { const dm = qs.match(/([a-z_]+)=eq\.([^&]+)/); if (dm) { const v = decodeURIComponent(dm[2]); if (db[table] && db[table][v]) delete db[table][v]; } return Promise.resolve(new Response(null, { status: 204 })); }
    return Promise.resolve(new Response('[]', { status: 200 }));
  };
}

const emptyDb = (start) => ({ reset_state: { me: { id: 'me', start_date: start, manifesto: '' } }, reset_days: {}, reset_relapses: {}, reset_punishments: {}, reset_urges: [] });

async function boot(browser, epoch, db) {
  const page = await browser.newPage();
  page.on('pageerror', e => check('NO pageerror', false, String(e)));
  const session = { access_token: 'test.jwt', expires_at: Math.floor(epoch / 1000) + 100000 };
  await page.evaluateOnNewDocument(inject, epoch, session, db);
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => { const s = document.getElementById('syncState'); return s && /synced|offline|on-device/.test(s.textContent); }, { timeout: 8000 });
  await page.waitForFunction(() => window.__booted === undefined || true); // settle
  await new Promise(r => setTimeout(r, 120)); // allow sweep writes to flush
  return page;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const TODAY = [2026, 8, 16];

  // ── Scenario A: fresh start today, before noon — no sweep, day-1 UI ──
  {
    const ep = istEpoch(...TODAY, 8, 0);
    const start = istDateStr(ep, 0);
    const page = await boot(browser, ep, emptyDb(start));
    const st = await page.evaluate(() => ({
      days: document.getElementById('heroDays').textContent.trim(),
      punShown: document.getElementById('punSec').style.display,
      hasConfirmToday: !!document.querySelector('[data-confirm]'),
      relapses: Object.keys(window.__db.reset_relapses).length,
      dayline: document.getElementById('dayline').textContent.trim(),
    }));
    check('A1 fresh: 0 days clean', st.days === '0', st.days);
    check('A2 fresh: no punishment section', st.punShown === 'none', st.punShown);
    check('A3 fresh: confirm-today button present', st.hasConfirmToday, '');
    check('A4 fresh: NO auto relapse (yesterday<start)', st.relapses === 0, 'relapses=' + st.relapses);
    check('A5 fresh: dayline DAY 1', st.dayline === 'DAY 1', st.dayline);
    await page.close();
  }

  // ── Scenario B: click "I stayed clean today" → POST reset_days ──
  {
    const ep = istEpoch(...TODAY, 8, 0); const start = istDateStr(ep, 0);
    const page = await boot(browser, ep, emptyDb(start));
    await page.evaluate(() => document.querySelector('[data-confirm]').click());
    await page.waitForFunction(() => Object.keys(window.__db.reset_days).length === 1, { timeout: 4000 }).catch(() => {});
    const st = await page.evaluate((today) => {
      const calls = window.__calls.filter(c => c.method === 'POST' && c.table === 'reset_days');
      return {
        dayStored: !!window.__db.reset_days[today],
        cleanFlag: window.__db.reset_days[today] && window.__db.reset_days[today].clean,
        onConflict: calls[0] && /on_conflict=d/.test(calls[0].qs),
        btnDone: !!document.querySelector('.btn.done[disabled]'),
      };
    }, istDateStr(ep, 0));
    check('B1 confirm: reset_days row written', st.dayStored, '');
    check('B2 confirm: clean=true', st.cleanFlag === true, '');
    check('B3 confirm: upsert on_conflict=d', st.onConflict, '');
    check('B4 confirm: button shows DONE state', st.btnDone, '');
    await page.close();
  }

  // ── Scenario C: 3 missed days, AFTER noon → sweep auto-logs 3 relapses+punishments ──
  let sweptDb = null;
  {
    const ep = istEpoch(...TODAY, 13, 0); const start = istDateStr(ep, -3);
    const page = await boot(browser, ep, emptyDb(start));
    const st = await page.evaluate(() => {
      const rel = Object.values(window.__db.reset_relapses);
      const pun = Object.values(window.__db.reset_punishments);
      return {
        rel: rel.length, allAuto: rel.every(r => r.auto === true),
        pun: pun.length, kmEach: pun.every(p => p.cycle_km === 200 && p.walk_km === 50),
        owed: document.getElementById('sOwed').textContent.trim(),
        slips: document.getElementById('sSlips').textContent.trim(),
        punShown: document.getElementById('punSec').style.display,
        db: window.__db,
      };
    });
    check('C1 sweep: 3 auto relapses (start..yesterday)', st.rel === 3, 'rel=' + st.rel);
    check('C2 sweep: all auto=true', st.allAuto, '');
    check('C3 sweep: 3 punishments', st.pun === 3, 'pun=' + st.pun);
    check('C4 sweep: each 200 cycle / 50 walk', st.kmEach, '');
    check('C5 sweep: km owed = 3×250 = 750', st.owed === '750', st.owed);
    check('C6 sweep: relapse count stat = 3', st.slips === '3', st.slips);
    check('C7 sweep: penance section visible', st.punShown === 'block', st.punShown);
    sweptDb = st.db;
    await page.close();
  }

  // ── Scenario C2: idempotency — reboot with swept state, no new relapses ──
  {
    const ep = istEpoch(...TODAY, 13, 30);
    // rebuild db object cleanly from swept state
    const db = { reset_state: { me: { id: 'me', start_date: sweptDb.reset_state.me.start_date, manifesto: '' } },
      reset_days: {}, reset_relapses: sweptDb.reset_relapses, reset_punishments: sweptDb.reset_punishments, reset_urges: [] };
    const page = await boot(browser, ep, db);
    const st = await page.evaluate(() => ({
      rel: Object.keys(window.__db.reset_relapses).length,
      pun: Object.keys(window.__db.reset_punishments).length,
      newUpserts: window.__calls.filter(c => c.method === 'POST' && c.table === 'reset_relapses').length,
    }));
    check('C2-idem: still exactly 3 relapses (no dupes)', st.rel === 3, 'rel=' + st.rel);
    check('C2-idem: still 3 punishments', st.pun === 3, 'pun=' + st.pun);
    check('C2-idem: sweep issued 0 new relapse POSTs', st.newUpserts === 0, 'posts=' + st.newUpserts);
    await page.close();
  }

  // ── Scenario D: before noon, yesterday unconfirmed → grace warning, NOT swept ──
  {
    const ep = istEpoch(...TODAY, 8, 0); const start = istDateStr(ep, -2);
    const page = await boot(browser, ep, emptyDb(start));
    const st = await page.evaluate((yday) => ({
      rel: Object.keys(window.__db.reset_relapses).length,
      warn: document.getElementById('deadlineBox').className,
      warnText: document.getElementById('deadlineBox').textContent,
      hasConfirmYesterday: !!document.querySelector('[data-confirm="' + yday + '"]'),
      ydaySwept: !!window.__db.reset_relapses[yday],
    }), istDateStr(ep, -1));
    check('D1 grace: only 1 auto relapse (dayBeforeYesterday)', st.rel === 1, 'rel=' + st.rel);
    check('D2 grace: yesterday NOT auto-swept', st.ydaySwept === false, '');
    check('D3 grace: warn banner shown', /warn/.test(st.warn), st.warn);
    check('D4 grace: confirm-yesterday button present', st.hasConfirmYesterday, '');
    await page.close();
  }

  // ── Scenario E: manual relapse submit → relapse + punishment + reset streak ──
  {
    const ep = istEpoch(...TODAY, 20, 0); const start = istDateStr(ep, -1); const today = istDateStr(ep, 0);
    // seed yesterday confirmed clean so streak was 1 before relapse
    const db = emptyDb(start); db.reset_days[start] = { d: start, clean: true };
    const page = await boot(browser, ep, db);
    // pick two triggers, mood, site, story
    await page.evaluate(() => {
      document.querySelector('[data-chip="trig"][data-val="stressed"]').click();
      document.querySelector('[data-chip="trig"][data-val="late-night scroll"]').click();
      document.querySelector('[data-chip="mb"][data-val="numb"]').click();
      document.querySelector('[data-chip="ma"][data-val="shame"]').click();
      document.getElementById('rSites').value = 'instagram, reddit';
      document.getElementById('rDur').value = '25';
      document.getElementById('rStory').value = 'late night, doomscrolled into it';
    });
    await page.click('#rSubmit');
    await page.waitForFunction((t) => !!window.__db.reset_relapses[t], { timeout: 4000 }, today).catch(() => {});
    const st = await page.evaluate((today) => {
      const r = window.__db.reset_relapses[today];
      const p = window.__db.reset_punishments[today];
      return {
        rel: !!r, auto: r && r.auto, trg: r && r.triggers, sites: r && r.sites, dur: r && r.duration_min,
        mb: r && r.mood_before, ma: r && r.mood_after, story: r && r.story,
        pun: !!p, deadlineOk: p && p.deadline,
        days: document.getElementById('heroDays').textContent.trim(),
        heroDirty: /dirty/.test(document.getElementById('hero').className),
        ledgerHtml: document.getElementById('ledger').innerHTML,
        patShown: document.getElementById('patSec').style.display,
      };
    }, today);
    check('E1 relapse: row written', st.rel, '');
    check('E2 relapse: auto=false (manual)', st.auto === false, '');
    check('E3 relapse: 2 triggers captured', st.trg && st.trg.length === 2 && st.trg.includes('stressed'), JSON.stringify(st.trg));
    check('E4 relapse: sites split to array', Array.isArray(st.sites) && st.sites.length === 2 && st.sites[0] === 'instagram', JSON.stringify(st.sites));
    check('E5 relapse: duration=25', st.dur === 25, String(st.dur));
    check('E6 relapse: mood before/after', st.mb === 'numb' && st.ma === 'shame', st.mb + '/' + st.ma);
    check('E7 relapse: story saved', /doomscrolled/.test(st.story || ''), '');
    check('E8 relapse: punishment assigned w/ deadline', st.pun && !!st.deadlineOk, st.deadlineOk);
    check('E9 relapse: streak reset to 0', st.days === '0', st.days);
    check('E10 relapse: hero goes dirty', st.heroDirty, '');
    check('E11 relapse: appears in ledger', /instagram|logged/.test(st.ledgerHtml), '');
    check('E12 relapse: patterns section revealed', st.patShown === 'block', st.patShown);
    await page.close();
  }

  // ── Scenario F/G: burn-down + night start on an existing punishment ──
  {
    const ep = istEpoch(...TODAY, 21, 0); const start = istDateStr(ep, -1); const rday = istDateStr(ep, -1);
    const db = emptyDb(start);
    db.reset_relapses[rday] = { occurred_on: rday, triggers: ['stressed'], sites: [], auto: false };
    db.reset_punishments[rday] = { relapse_on: rday, assigned_on: rday, deadline: istDateStr(ep, 6), cycle_km: 200, walk_km: 50, cycle_done: 0, walk_done: 0, night_started: false };
    const page = await boot(browser, ep, db);
    // start night
    await page.click('[data-night="' + rday + '"]');
    await page.waitForFunction((d) => window.__db.reset_punishments[d].night_started === true, { timeout: 3000 }, rday).catch(() => {});
    // burn 200 cycle + 50 walk
    await page.evaluate((d) => {
      document.querySelector('input[data-burn="cycle"][data-on="' + d + '"]').value = '200';
      document.querySelector('input[data-burn="walk"][data-on="' + d + '"]').value = '50';
    }, rday);
    await page.click('[data-burnadd="' + rday + '"]');
    await new Promise(r => setTimeout(r, 200));
    const st = await page.evaluate((d) => {
      const p = window.__db.reset_punishments[d];
      const patch = window.__calls.filter(c => c.method === 'PATCH' && c.table === 'reset_punishments');
      return { night: p.night_started, cyc: p.cycle_done, wlk: p.walk_done, punShown: document.getElementById('punSec').style.display, owed: document.getElementById('sOwed').textContent.trim(), patchCount: patch.length };
    }, rday);
    check('F1 night: night_started PATCHed true', st.night === true, '');
    check('F2 burn: cycle_done 200', st.cyc === 200, String(st.cyc));
    check('F3 burn: walk_done 50', st.wlk === 50, String(st.wlk));
    check('F4 burn: km owed now 0', st.owed === '0', st.owed);
    check('F5 burn: cleared → penance section hidden', st.punShown === 'none', st.punShown);
    check('F6 patch calls issued', st.patchCount >= 2, 'n=' + st.patchCount);
    await page.close();
  }

  // ── Scenario H: urge modal → beat it → reset_urges insert ──
  {
    const ep = istEpoch(...TODAY, 22, 0); const start = istDateStr(ep, 0);
    const page = await boot(browser, ep, emptyDb(start));
    await page.click('#urgeFab');
    await page.waitForFunction(() => document.getElementById('urgeModal').classList.contains('show'), { timeout: 3000 });
    await page.click('#urgeBeat');
    await page.waitForFunction(() => window.__db.reset_urges.length === 1, { timeout: 3000 }).catch(() => {});
    const st = await page.evaluate(() => ({
      urges: window.__db.reset_urges.length,
      beaten: window.__db.reset_urges[0] && window.__db.reset_urges[0].beaten,
      stat: document.getElementById('sUrges').textContent.trim(),
      modalClosed: !document.getElementById('urgeModal').classList.contains('show'),
    }));
    check('H1 urge: reset_urges insert', st.urges === 1, '');
    check('H2 urge: beaten=true', st.beaten === true, '');
    check('H3 urge: hero counter = 1', st.stat === '1', st.stat);
    check('H4 urge: modal closed after action', st.modalClosed, '');
    await page.close();
  }

  // ── Scenario I: manifesto edit → upsert reset_state ──
  {
    const ep = istEpoch(...TODAY, 9, 0); const start = istDateStr(ep, 0);
    const page = await boot(browser, ep, emptyDb(start));
    await page.click('#manifestoBtn'); // enter edit
    await page.type('#manifestoEdit', 'Because I want my mornings back.');
    await page.click('#manifestoBtn'); // save
    await new Promise(r => setTimeout(r, 150));
    const st = await page.evaluate(() => ({
      saved: window.__db.reset_state.me.manifesto,
      shown: document.getElementById('manifestoView').textContent,
      urgeUsesIt: (function () { document.getElementById('urgeFab').click(); return document.getElementById('urgeWhy').textContent; })(),
    }));
    check('I1 manifesto: upserted to reset_state', /mornings back/.test(st.saved || ''), st.saved);
    check('I2 manifesto: rendered in view', /mornings back/.test(st.shown), '');
    check('I3 manifesto: urge modal shows it', /mornings back/.test(st.urgeUsesIt), '');
    await page.close();
  }

  // ── Scenario J (regression/boundary): JS sweep at EXACTLY 12:00 noon → yesterday due ──
  // Mirrors SQL REG-2a — completes the oracle==JS side of the cross-impl proof.
  {
    const ep = istEpoch(...TODAY, 12, 0); const start = istDateStr(ep, -1); const yday = istDateStr(ep, -1);
    const page = await boot(browser, ep, emptyDb(start));
    const st = await page.evaluate((y) => ({
      autoDays: Object.keys(window.__db.reset_relapses),
      ydayAuto: window.__db.reset_relapses[y] && window.__db.reset_relapses[y].auto,
    }), yday);
    check('J1 noon-boundary: JS sweeps yesterday at 12:00', st.autoDays.length === 1 && st.autoDays[0] === yday, JSON.stringify(st.autoDays));
    check('J2 noon-boundary: logged as auto', st.ydayAuto === true, '');
    await page.close();
  }

  // ── Scenario K (regression/boundary): JS sweep at 11:59 → yesterday still in grace ──
  // Mirrors SQL REG-2b.
  {
    const ep = istEpoch(...TODAY, 11, 59); const start = istDateStr(ep, -1); const yday = istDateStr(ep, -1);
    const page = await boot(browser, ep, emptyDb(start));
    const st = await page.evaluate((y) => ({
      autoDays: Object.keys(window.__db.reset_relapses),
      warn: /warn/.test(document.getElementById('deadlineBox').className),
      hasConfirmYesterday: !!document.querySelector('[data-confirm="' + y + '"]'),
    }), yday);
    check('K1 pre-noon-boundary: JS does NOT sweep yesterday at 11:59', st.autoDays.length === 0, JSON.stringify(st.autoDays));
    check('K2 pre-noon-boundary: grace warning shown', st.warn, '');
    check('K3 pre-noon-boundary: confirm-yesterday offered', st.hasConfirmYesterday, '');
    await page.close();
  }

  await browser.close();

  // ── report ──
  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  console.log('\n===== reset.html — headless Chromium functional tests =====');
  results.forEach(r => console.log((r.pass ? '  ✅ ' : '  ❌ ') + r.name + (r.pass ? '' : '   → ' + r.detail)));
  console.log(`\n  ${pass}/${results.length} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
