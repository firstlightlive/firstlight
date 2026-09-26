// Static guard for the four live day-counter epochs + the independent clocks.
//
// CLAUDE.md: "Four live epoch values must agree ... Disagreement = the site and
// the IG captions print different day numbers for the same day." That failure is
// invisible until a caption ships with the wrong Day N, so it gets a test with
// no browser and no network — it runs in milliseconds and can gate every deploy.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0, failed = 0;
function check(ok, message, detail) {
  if (ok) { passed++; process.stdout.write('  ✓ ' + message + '\n'); return; }
  failed++;
  process.stdout.write('  ✗ ' + message + (detail ? '\n      ' + detail : '') + '\n');
}
function grab(file, re, label) {
  const m = re.exec(read(file));
  if (!m) { check(false, 'could not read ' + label + ' from ' + file); return null; }
  return m[1];
}

process.stdout.write('\nEPOCH AGREEMENT\n');

const streakStart = grab('website/app.js',            /STREAK_START:\s*'(\d{4}-\d{2}-\d{2})'/,        'FL_DEFAULTS.STREAK_START');
const dayEpoch    = grab('supabase/functions/firstlight-sync/index.ts',
                                                      /const DAY_EPOCH = new Date\('(\d{4}-\d{2}-\d{2})T/, 'DAY_EPOCH');
const ch6Start    = grab('supabase/functions/firstlight-sync/index.ts',
                                                      /const CHAPTER_6_START = new Date\('(\d{4}-\d{2}-\d{2})T/, 'CHAPTER_6_START');
const gapStart    = grab('supabase/functions/firstlight-sync/index.ts',
                                                      /const GAP_START = new Date\('(\d{4}-\d{2}-\d{2})T/, 'GAP_START');
// Scope to the FL_CURRENT_CHAPTER block: the archived chapters above it carry
// their own frozen dayEpoch values (Chapter 04's is 2026-07-19), so a whole-file
// search finds the wrong one.
const chaptersSrc = read('website/js/chapters.js');
const currentBlock = chaptersSrc.slice(chaptersSrc.indexOf('FL_CURRENT_CHAPTER'));
function grabIn(src, re, label) {
  const m = re.exec(src);
  if (!m) { check(false, 'could not read ' + label); return null; }
  return m[1];
}
const chapEpoch = grabIn(currentBlock, /dayEpoch:\s*'(\d{4}-\d{2}-\d{2})'/, 'FL_CURRENT_CHAPTER.dayEpoch');
const chapStart = grabIn(currentBlock, /start:\s*'(\d{4}-\d{2}-\d{2})'/,    'FL_CURRENT_CHAPTER.start');
const appHtml     = grab('website/app/app.html',      /const STREAK_START='(\d{4}-\d{2}-\d{2})'/,     'app.html STREAK_START');

const all = { streakStart, dayEpoch, chapEpoch, appHtml };
const distinct = [...new Set(Object.values(all).filter(Boolean))];
check(distinct.length === 1,
  'the four live epochs agree (' + distinct.join(' / ') + ')',
  JSON.stringify(all));

check(ch6Start === dayEpoch, 'CHAPTER_6_START === DAY_EPOCH', ch6Start + ' vs ' + dayEpoch);
check(chapStart === chapEpoch, 'current chapter start === dayEpoch (one chapter, one epoch)', chapStart + ' vs ' + chapEpoch);
check(!!gapStart && gapStart < dayEpoch, 'GAP_START precedes DAY_EPOCH', gapStart + ' vs ' + dayEpoch);

// Every gap day must be covered by a FL_BREAKS entry, or the site renders a day
// number for a day that belongs to no chapter.
const breaks = read('website/js/chapters.js');
const lastBreak = /date:\s*'(\d{4}-\d{2}-\d{2})',\s*\n\s*through:\s*'(\d{4}-\d{2}-\d{2})',\s*\n\s*days:\s*(\d+)/g;
let m, last = null;
while ((m = lastBreak.exec(breaks))) last = m;
check(!!last && last[1] === gapStart,
  'the newest break starts at GAP_START', last ? last[1] + ' vs ' + gapStart : 'no break found');
if (last) {
  const dayBefore = new Date(dayEpoch + 'T00:00:00Z');
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const expectedThrough = dayBefore.toISOString().slice(0, 10);
  check(last[2] === expectedThrough,
    'the break runs through the day before DAY_EPOCH (no orphan day)', last[2] + ' vs ' + expectedThrough);
  const span = Math.round((new Date(last[2] + 'T00:00:00Z') - new Date(last[1] + 'T00:00:00Z')) / 86400000) + 1;
  check(Number(last[3]) === span, 'the break\'s days count matches its span', last[3] + ' vs ' + span);
}

process.stdout.write('\nINDEPENDENT CLOCKS\n');

// The screens-free house is NOT the workout run. Syncing it to DAY_EPOCH wipes
// clean days off a streak that never lapsed, which is what a previous edit did.
const recoveryDay1 = grab('website/js/admin-recovery.js', /var DAY1 = '(\d{4}-\d{2}-\d{2})'/, 'recovery DAY1');
check(recoveryDay1 === '2026-09-23',
  'recovery DAY1 stays at enforcement go-live 2026-09-23', String(recoveryDay1));
check(recoveryDay1 !== dayEpoch,
  'recovery clock is independent of the public day epoch', recoveryDay1 + ' vs ' + dayEpoch);

process.stdout.write('\nLIFETIME FRAMING\n');

const rec = read('website/js/admin-recovery.js');
check(!/THE 60-DAY SYSTEM/.test(rec), 'recovery panel is no longer titled a 60-day system');
check(/LIFETIME SYSTEM/.test(rec), 'recovery panel is titled a lifetime system');
check(/day:\s*365/.test(rec) && /day:\s*1825/.test(rec),
  'milestone ladder runs past one year (no implied finish line)');
check(!/60-Day System/.test(read('website/admin.html')), 'admin nav no longer says "60-Day System"');

const food = read('website/js/admin-food.js');
check(!/logs\.slice\(-500\)/.test(food), 'food log no longer truncates to 500 entries');
check(/food_log/.test(food), 'food module writes to the food_log table');
check(/onchange=/.test(food) === false, 'food module has no inline onchange handler');

const sw = read('website/sw.js');
['/rules.html', '/discipline.html', '/daily-sheet.html', '/food.html'].forEach(p => {
  check(sw.includes("'" + p + "'"), 'service worker precaches ' + p);
});

process.stdout.write('\nFOOD PAGE + CROSS-PAGE SYNC\n');

check(fs.existsSync(path.join(root, 'website/food.html')), 'the dedicated food page exists');
const page = read('website/food.html');
// The page must not become a fifth epoch source — it reads chapters.js.
check(/FL_CURRENT_CHAPTER\s*&&\s*window\.FL_CURRENT_CHAPTER\.dayEpoch|FL_CURRENT_CHAPTER&&window\.FL_CURRENT_CHAPTER\.dayEpoch/.test(page.replace(/\s+/g, ' ')) || /FL_CURRENT_CHAPTER/.test(page),
  'the food page takes its epoch from chapters.js, not a hardcoded copy');
check(/js\/admin-food\.js/.test(page), 'the food page reuses the shared food store (no second store)');
check(/FLFood\.logMeal/.test(page), 'the page logs through FLFood rather than its own write path');

const offline = read('website/js/fl-offline.js');
check(/BroadcastChannel/.test(offline), 'the change bus uses BroadcastChannel for cross-tab sync');
check(/fl_bus_ping/.test(offline), 'it has a storage-event fallback');
check(/access_token: token/.test(offline), 'realtime joins with the owner JWT so RLS tables actually stream');
check(/TAB_ID/.test(offline) && !/m\.tab === DEVICE_ID/.test(offline),
  'echo suppression keys on a per-tab id, not the shared device id');

const foodjs = read('website/js/admin-food.js');
check(/onChange/.test(foodjs) && /announce\(/.test(foodjs), 'the food store publishes and exposes changes');
check(/visibilitychange/.test(foodjs), 'it catches up when the page returns to the foreground');

const sql = read('supabase/food_log.sql');
check(/supabase_realtime ADD TABLE public\.food_log/.test(sql), 'the migration adds food_log to the realtime publication');
check(/REPLICA IDENTITY FULL/.test(sql), 'it sets REPLICA IDENTITY FULL so updates carry the row');
check(/REVOKE ALL ON public\.food_log FROM anon/.test(sql), 'anon is revoked — food history stays private');

process.stdout.write('\nWATCH RITUAL SYNC — failures must not be silent\n');

const fn = read('supabase/functions/firstlight-sync/index.ts');
// The ritual-sync auth block, isolated so these assertions cannot pass by
// matching some unrelated part of a 4,000-line file.
const rsStart = fn.indexOf("if (action === 'ritual-sync')");
check(rsStart > 0, 'the ritual-sync handler is present');
const rsBlock = fn.slice(rsStart, rsStart + 2000);
check(/_watchSyncHealthBump\(`auth:/.test(rsBlock),
  'an auth failure records telemetry (it used to 403 silently)');
check(/WATCH_KEY_NOT_CONFIGURED/.test(rsBlock) && /WATCH_KEY_MISMATCH/.test(rsBlock),
  'the 403 says WHICH auth problem it is');
check(/\^<\.\*>\$/.test(rsBlock) || /\^<\.\*>\$\/\.test/.test(rsBlock),
  'the <32-hex> placeholder key is detected as unconfigured');
check(/length < 16/.test(rsBlock), 'a too-short key is rejected as unconfigured');

check(/async function _watchSyncOk\(\)/.test(fn), 'a successful sync leaves a heartbeat');
check(/last_ok: new Date\(\)\.toISOString\(\)/.test(fn), 'the heartbeat records when it last worked');
check(/if \(lastOk\) h\.last_ok = lastOk/.test(fn), 'an error does not erase the last success');
check(/h\.last_error = detail/.test(fn), 'the latest error is retained for diagnosis');
check(fn.indexOf('await _watchSyncOk()') > fn.indexOf("from('rituals_log')"),
  'the heartbeat fires after the rituals_log write, not before it');

// The verdict must not read rituals_log — if it did, two months of silence
// would have auto-applied penance.
const ritualRefs = (fn.match(/rituals_log/g) || []).length;
const inSyncOnly = fn.slice(fn.indexOf('async function ritualSyncGet'), fn.indexOf('async function _watchSyncOk'));
check((inSyncOnly.match(/rituals_log/g) || []).length >= ritualRefs - 4,
  'rituals_log is confined to the sync path (the verdict never reads it)');

const pre = read('supabase/verify_state.sql');
check(/watch_api_key/.test(pre) && /PLACEHOLDER/.test(pre),
  'the read-only pre-flight flags a placeholder watch key');
check(/WATCH_SYNC_HEALTH/.test(pre), 'the pre-flight surfaces the watch telemetry');
check(!/INSERT|UPDATE|DELETE|ALTER|CREATE|DROP/i.test(pre.replace(/--.*$/gm, '')),
  'the pre-flight really is read-only');

process.stdout.write('\nNO MONEY ON A PUBLIC SURFACE\n');

// ₹ hides in FOUR spellings, and each survived a pass that only looked for the
// others: the literal character, the JS escape \\u20B9, the HTML entity &#8377;
// (how "₹1,500 PER MISS — TO AKSHAYA PATRA" stayed on the homepage), and plain
// "Rs." (drawn onto a published image). Check all four — but only in CONTENT:
// ₹ legitimately appears in explanatory comments and in the historical-chapter
// code paths that still price Chapters 01-03.
function contentOnly(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')     // HTML comments
    .replace(/^\s*\/\/.*$/gm, '')        // JS line comments
    .replace(/\/\*[\s\S]*?\*\//g, '');   // JS block comments
}
const MONEY = /₹|\\u20B9|&#8377;|&rupee;|Rs\.\s?[0-9]/i;
// These must be clean of money in rendered content. home-3d.js is excluded: it
// still holds the historical-chapter branch, guarded by FL.STAKE_PER_DAY.
[['website/index.html', 'index.html'],
 ['website/covenant.html', 'covenant.html'],
 ['website/app/index.html', 'the caption generator']].forEach(([f, label]) => {
  const bad = contentOnly(read(f)).split('\n').filter(l => MONEY.test(l));
  check(bad.length === 0, label + ' shows no money in any spelling'
    + (bad.length ? ' — e.g. ' + bad[0].trim().slice(0, 70) : ''));
});
check(/FL\.STAKE_PER_DAY\) return 0/.test(read('website/js/home-3d.js')),
  'home-3d.js gates its historical money path on a zero stake');

// The charity name is the other half of the footprint CLAUDE.md names. It may
// remain in ONE place: accountability.html's archived Chapter 01 slip renderer.
[['website/index.html','index.html'],
 ['website/covenant.html','covenant.html'],
 ['website/app/index.html','the caption generator']].forEach(([f,label]) => {
  check(!/akshaya/i.test(contentOnly(read(f))), label + ' does not name a charity');
});

// accountability.html keeps ₹ in ONE place only: rendering archived Chapter 01
// slips, which record what was actually paid at the time. The live mechanic
// must not mention money or a charity.
const acc = read('website/accountability.html');
check(!/DONATION MECHANIC/.test(acc), 'accountability.html no longer advertises a donation mechanic');
check(!/Akshaya Patra \(school meals\)/.test(acc), 'the charity pledge copy is gone from the live mechanic');
check(/PENANCE MECHANIC — PAID IN DISTANCE/.test(acc), 'it states the distance mechanic instead');
check(/Chapter 01 \/ REBUILD legacy/.test(acc), 'the archived Chapter 01 money rendering is deliberately kept');

// The generator must not promise anyone a payout, in any wording.
const gen = read('website/app/index.html');
['random follower','you get the cash','direct transfer','YOU GET PAID','CLAIM ₹'].forEach(ph => {
  check(!gen.includes(ph), 'generator has no "' + ph + '" payout promise');
});
check(!/\\n\\nwww\.firstlight\.live/.test(gen), 'no site link inside a published caption');

process.stdout.write('\nDISCIPLINE LEDGER — must not live on one device\n');

const disc = read('website/discipline.html');
check(/fl-discipline-sync\.js/.test(disc), 'discipline.html loads the sync module');
check(/fl-offline\.js/.test(disc), 'it loads the offline runtime (the write queue)');
check(/FLDisc\.syncDays/.test(disc), 'every local save mirrors to Supabase');
check(/FLDisc\.syncCleared/.test(disc), 'the paid-km ledger mirrors too');
check(/FLDisc\.stamp/.test(disc), 'a logged day is timestamped for last-write-wins');
check(/FLDisc\.init/.test(disc), 'it pulls the server record on boot');

const ds = read('website/js/fl-discipline-sync.js');
// The ordering bug this caught was real: a concurrent push overwrote a larger
// paid total before the merge could protect it.
check(/await pull\(\);[\s\S]{0,200}await syncDays\(\)/.test(ds),
  'reconcile pulls BEFORE it pushes (a concurrent push corrupts the ledger)');
check(/if \(num\(d\[k\]\) > num\(cl\[k\]\)\)/.test(ds),
  'paid km merge by MAX — a payment already made can never be erased');
check(/_busy/.test(ds), 'overlapping reconciles are guarded');

const dsql = read('supabase/discipline_log.sql');
check(/REVOKE ALL ON public\.discipline_log FROM anon/.test(dsql), 'the covenant record is private (anon revoked)');
check(/NO history-lock trigger/.test(dsql), 'no history lock — an older debt must stay payable');
check(/PRIMARY KEY \(date, kind\)/.test(dsql), 'one table holds both the day rows and the cleared ledger');
check(/supabase_realtime ADD TABLE public\.discipline_log/.test(dsql), 'it streams for cross-device sync');
check(read('website/sw.js').includes("'/js/fl-discipline-sync.js'"), 'the sync module is precached');
check(/discipline_log/.test(read('website/js/fl-offline.js')), 'discipline_log is prefetched for offline reads');

process.stdout.write('\nDEAD-CHANNEL ALARM — silence must be reported\n');
const fnSrc = read('supabase/functions/firstlight-sync/index.ts');
check(/async function _staleChannelCheck/.test(fnSrc), 'a stale-channel check exists');
check(/health_daily[\s\S]{0,40}2,[\s\S]{0,60}Apple Health/.test(fnSrc), 'Apple Health is watched');
check(/CHANNEL_ALERT_/.test(fnSrc), 'it is idempotent — one alert per channel per day');
check(/const staleReport = await _staleChannelCheck\(\)/.test(fnSrc), 'it rides the existing 21:30 cron (no new schedule)');

process.stdout.write('\nTABLE INVENTORY — must not drift\n');

// Re-derive the table list the same way the inventory was built. If someone
// starts using a new table and forgets to regenerate verify_tables.sql, the
// readiness check would quietly stop covering it — which is exactly how the
// "34 tables" figure in CLAUDE.md went 31 out of date.
function listBlock(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return [];
  const j = src.indexOf('];', i);
  return [...src.slice(i, j).matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
}
const appSrc = read('website/app.js');
const edgeSrc = read('supabase/functions/firstlight-sync/index.ts');
// Also scan the offline prefetch list and the standalone sync modules. The
// original derivation missed both, so discipline_log existed in the code while
// the readiness check silently did not cover it.
const offSrc = read('website/js/fl-offline.js');
const syncSrcs = ['website/js/fl-discipline-sync.js', 'website/js/admin-food.js']
  .map(f => read(f)).join('\n');
const derived = new Set([
  ...listBlock(appSrc, 'const SB_PUBLIC_TABLES'),
  ...listBlock(appSrc, 'const SB_NO_USERID_TABLES'),
  ...[...edgeSrc.matchAll(/from\('([a-z_]+)'\)/g)].map(m => m[1]),
  ...[...edgeSrc.matchAll(/supaUpsert\('([a-z_]+)'/g)].map(m => m[1]),
  ...[...offSrc.matchAll(/\['([a-z_]+)',\s*'\?select=/g)].map(m => m[1]),
  ...[...syncSrcs.matchAll(/var TABLE = '([a-z_]+)'/g)].map(m => m[1]),
  'food_log',
]);
['v1','functions','object','token','user','rpc'].forEach(x => derived.delete(x));

const inv = read('supabase/verify_tables.sql');
const covered = new Set([...inv.matchAll(/\('([a-z_]+)','(?:GO-LIVE|feature)'/g)].map(m => m[1]));
const uncovered = [...derived].filter(x => !covered.has(x)).sort();
check(uncovered.length === 0,
  'verify_tables.sql covers every table the code uses'
  + (uncovered.length ? ' — MISSING: ' + uncovered.join(', ') : ` (${covered.size} listed)`));
check(covered.size >= 60, `the inventory is complete (${covered.size} tables)`);

// The go-live tier must contain the tables Day 1 actually depends on.
['config','secrets','proof_archive','strava_activities','slips','health_daily','food_log','instagram_posts'].forEach(tb => {
  check(new RegExp(`\\('${tb}','GO-LIVE'`).test(inv), `${tb} is tagged GO-LIVE`);
});
check(/ANON CAN READ A PRIVATE TABLE/.test(inv), 'the check flags anon access to a private table');
check(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i.test(inv.replace(/--.*$/gm, '')),
  'verify_tables.sql is read-only');

check(fs.existsSync(path.join(root, 'scripts/check-phone-data.mjs')), 'the phone-data health check exists');
const chk = read('scripts/check-phone-data.mjs');
check(/active_calories/.test(chk) && !/active_energy/.test(chk),
  'the health check uses the real column name (active_calories)');
check(/Strava channel/.test(chk) && /training gap/.test(chk),
  'a quiet training week is not reported as a broken Strava channel');
check(/markable day/.test(chk), 'days before the check-in epoch are not counted as unmarked');
const pkg = JSON.parse(read('package.json'));
check(!!pkg.scripts['check:phone'], 'npm run check:phone is wired up');
['test:epoch','test:food','test:offline','test:page'].forEach(s => {
  check(pkg.scripts.test.includes(s), 'npm test runs ' + s);
});

process.stdout.write('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
