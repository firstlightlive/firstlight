// Tiny assertion helper shared by the Node test files (unit.cjs, regression.cjs).
// Per-process state (each `node file.cjs` is a fresh process), so no reset needed.
let P = 0, F = 0; const fails = [];
const j = (v) => { try { return JSON.stringify(v); } catch (_e) { return String(v); } };

function ok(name, cond, detail = '') { if (cond) P++; else { F++; fails.push(name + (detail ? '   → ' + detail : '')); } }
function eq(name, got, want) { ok(name, j(got) === j(want), 'got ' + j(got) + ' · want ' + j(want)); }
function section(title) { console.log('\n— ' + title + ' —'); }

function report(title) {
  console.log('\n===== ' + title + ' =====');
  fails.forEach(f => console.log('  ❌ ' + f));
  console.log(`  ${P}/${P + F} passed, ${F} failed`);
  return F;
}
function done(title) { process.exit(report(title) ? 1 : 0); }

module.exports = { ok, eq, section, report, done };
