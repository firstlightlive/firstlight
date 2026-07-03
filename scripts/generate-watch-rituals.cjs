#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// FIRST LIGHT — watchOS ritual seed generator
// Extracts RITUAL_DEFAULTS (website/js/admin-rituals.js) + weekend task arrays
// (website/js/admin-checkin.js) and emits the bundled seed consumed by the
// watch app: watchos/FirstLightRituals/FirstLightRituals/Resources/Rituals.json
//
// The web JS stays the single source of truth. After editing rituals there:
//   node scripts/generate-watch-rituals.js   → rebuild the watch app in Xcode.
//
// No browser code is executed — object/array literals are brace-matched out
// of the source text and evaluated in an empty VM context.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const RITUALS_JS = path.join(ROOT, 'website/js/admin-rituals.js');
const CHECKIN_JS = path.join(ROOT, 'website/js/admin-checkin.js');
const OUT = path.join(ROOT, 'watchos/FirstLightRituals/FirstLightRituals/Resources/Rituals.json');

// ── Literal extraction: find `marker`, then brace/bracket-match to the end ──
function extractLiteral(src, marker, open, close) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  const start = src.indexOf(open, at);
  if (start < 0) throw new Error(`opening '${open}' not found after ${marker}`);
  let depth = 0, inStr = null, esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${open}${close} for ${marker}`);
}
function evalLiteral(text) {
  return vm.runInNewContext(`(${text})`, Object.create(null), { timeout: 1000 });
}

// ── Time conversion: web 12h strings → IST 24h "HH:MM" (plan D-table) ──────
// morning: as-is (all AM). midday: hour 12 stays, 1–5 → +12. evening: hour 12
// stays, else +12.
function to24(time12, period) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time12).trim());
  if (!m) throw new Error(`bad time "${time12}"`);
  let h = parseInt(m[1], 10);
  const min = m[2];
  if (period === 'morning') {
    // as-is; morning items run 3:30 → 8:10
  } else if (period === 'midday') {
    if (h >= 1 && h <= 5) h += 12;          // 1:30 → 13:30 … 5:20 → 17:20
  } else if (period === 'evening') {
    if (h !== 12) h += 12;                   // 7:00 → 19:00, 9:30 → 21:30
  } else {
    throw new Error(`bad period ${period}`);
  }
  if (h < 0 || h > 23) throw new Error(`hour out of range for "${time12}" (${period})`);
  return String(h).padStart(2, '0') + ':' + min;
}

// ── Extract sources ─────────────────────────────────────────────────────────
const ritualsSrc = fs.readFileSync(RITUALS_JS, 'utf8');
const checkinSrc = fs.readFileSync(CHECKIN_JS, 'utf8');

const versionMatch = /var\s+RITUAL_VERSION\s*=\s*'([^']+)'/.exec(ritualsSrc);
if (!versionMatch) throw new Error('RITUAL_VERSION not found');
const version = versionMatch[1];

const defaults = evalLiteral(extractLiteral(ritualsSrc, 'var RITUAL_DEFAULTS', '{', '}'));
const satTasks = evalLiteral(extractLiteral(checkinSrc, 'var satTasks', '[', ']'));
const sunTasks = evalLiteral(extractLiteral(checkinSrc, 'var sunTasks', '[', ']'));

// ── Build periods/blocks ────────────────────────────────────────────────────
const periods = {};
const totalActive = {};
for (const period of ['morning', 'midday', 'evening']) {
  const items = defaults[period];
  if (!Array.isArray(items) || !items.length) throw new Error(`no items for ${period}`);
  const blocks = [];
  const byBlock = new Map();
  for (const it of items) {
    if (!/^[a-z0-9_]+$/.test(it.id)) throw new Error(`bad id ${it.id}`);
    if (!byBlock.has(it.blockId)) {
      byBlock.set(it.blockId, { id: it.blockId, name: it.block, start24: null, items: [] });
      blocks.push(byBlock.get(it.blockId));
    }
    const b = byBlock.get(it.blockId);
    const entry = {
      id: it.id,
      time12: it.time,
      time24: to24(it.time, period),
      title: it.title,
      desc: it.desc || '',
      cat: it.cat || '',
      active: it.active !== false
    };
    b.items.push(entry);
    if (b.start24 === null || entry.time24 < b.start24) b.start24 = entry.time24;
  }
  periods[period] = { blocks };
  totalActive[period] = items.filter(i => i.active !== false).length;
}

const seed = {
  version,
  generated_at_note: 'run scripts/generate-watch-rituals.js to regenerate — do not hand-edit',
  generated_from: ['website/js/admin-rituals.js', 'website/js/admin-checkin.js'],
  total_active: totalActive,
  periods,
  weekend: {
    saturday: satTasks.map(t => ({ id: t.id, label: t.label })),
    sunday: sunTasks.map(t => ({ id: t.id, label: t.label }))
  }
};

// ── Assertions (fail loudly on drift) ───────────────────────────────────────
function assert(cond, msg) { if (!cond) throw new Error(`ASSERT: ${msg}`); }
assert(periods.morning.blocks.reduce((s, b) => s + b.items.length, 0) === 30, 'morning must have 30 items');
assert(totalActive.morning === 27, `morning active must be 27, got ${totalActive.morning}`);
assert(periods.midday.blocks.reduce((s, b) => s + b.items.length, 0) === 15, 'midday must have 15 items');
assert(totalActive.midday === 15, `midday active must be 15, got ${totalActive.midday}`);
assert(periods.evening.blocks.reduce((s, b) => s + b.items.length, 0) === 30, 'evening must have 30 items');
assert(totalActive.evening === 30, `evening active must be 30, got ${totalActive.evening}`);
assert(seed.weekend.saturday.length === 7, 'saturday must have 7 tasks');
assert(seed.weekend.sunday.length === 10, 'sunday must have 10 tasks');
assert(seed.weekend.saturday.every(t => /^sat_[a-z_]+$/.test(t.id)), 'sat ids');
assert(seed.weekend.sunday.every(t => /^sun_[a-z_]+$/.test(t.id)), 'sun ids');
// time24 spot checks from the plan
const find = (p, id) => periods[p].blocks.flatMap(b => b.items).find(i => i.id === id);
assert(find('morning', 'm_alarm').time24 === '03:30', 'm_alarm 03:30');
assert(find('midday', 'mid_lunch').time24 === '13:30', 'mid_lunch 13:30');
assert(find('midday', 'mid_posture_check').time24 === '12:00', 'mid_posture_check 12:00');
assert(find('evening', 'e_laptop_close').time24 === '19:00', 'e_laptop_close 19:00');
assert(find('evening', 'e_lights_out').time24 === '21:30', 'e_lights_out 21:30');
const inactive = ['morning', 'midday', 'evening']
  .flatMap(p => periods[p].blocks.flatMap(b => b.items)).filter(i => !i.active).map(i => i.id).sort();
assert(JSON.stringify(inactive) === JSON.stringify(['m_cdp_choline', 'm_earthing', 'm_oats_paneer']),
  `inactive set drifted: ${inactive.join(',')}`);

// ── Write ───────────────────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(seed, null, 2) + '\n');
console.log(`✓ Rituals.json v${version}`);
console.log(`  morning ${periods.morning.blocks.length} blocks / 30 items / ${totalActive.morning} active`);
console.log(`  midday  ${periods.midday.blocks.length} blocks / 15 items / ${totalActive.midday} active`);
console.log(`  evening ${periods.evening.blocks.length} blocks / 30 items / ${totalActive.evening} active`);
console.log(`  weekend sat ${seed.weekend.saturday.length} / sun ${seed.weekend.sunday.length}`);
console.log(`  → ${path.relative(ROOT, OUT)}`);
