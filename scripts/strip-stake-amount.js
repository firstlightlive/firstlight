#!/usr/bin/env node
// Strips every public-facing ₹15,000 / Rs 15,000 / $200 / 15K mention
// + relabels STAKE / AT STAKE / ON THE LINE / "Miss = you collect" to neutral phrases
// so Meta classifiers no longer flag the account as wagering/laundering.
//
// IDEMPOTENT — running it twice is a no-op.
// Finance + slips + expense modules (admin-finance.js, admin-fire.js, admin-expense*)
// are left untouched because they legitimately track money.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── List the files we want to scrub (curated, not a blanket sweep)
const FILES = [
  // Public website pages
  'website/index.html',
  'website/about.html',
  'website/streak.html',
  'website/accountability.html',
  'website/post-question.html',
  'website/post-day111.html',
  'website/post-day111-slide2.html',
  'website/post-day111-final.html',
  'website/post-streak.html',
  'website/post-ironman.html',
  'website/post-alarm.html',
  'website/post-race.html',
  'website/post-152km.html',
  'website/post-152km-slide1.html',
  'website/post-152km-slide2.html',
  'website/index.html.bak',
  'website/story.html',
  'website/system.html',
  'website/covenant.html',
  'website/proof.html',
  'website/handout.html',
  'website/login.html',
  'website/admin.html',
  'website/punch.html',
  'website/install.html',
  'website/manifest.json',
  // IG / story generator + strategy pages
  'website/app/index.html',
  'website/app/strategy.html',
  'website/app/concept.html',
  'website/app/manifest.json',
  'website/app/app.html',
  // mirrors at repo root
  'app/index.html',
  'app/strategy.html',
  'app/concept.html',
  'app/manifest.json',
  'app/app.html',
  // JS modules that render to UI / IG / emails
  'website/js/admin-dailyproof.js',
  'website/js/admin-rules.js',
  'website/js/admin-seal.js',
  'website/js/admin-content.js',
  'website/js/admin-recap.js',
  'website/js/chapters.js',
  'website/js/home-3d.js',
  'website/app.js',
  // Edge function (email templates)
  'supabase/functions/firstlight-sync/index.ts',
];

// ── Replacement rules, applied in order. Long patterns first so they don't get truncated.
const RULES = [
  // ─── Full sentences / phrases (kill them entirely or rewrite) ───
  { from: /₹20,000 ON THE LINE NOW[^\n]*STAKES INCREASED\.?/gi, to: 'ON RECORD · TRIPLE DIGITS' },
  { from: /₹20,000 ON THE LINE/g,                          to: 'ON RECORD' },
  { from: /CLAIM IF I MISS/g,                              to: 'VIEW THE RECORD' },
  { from: /claim if I miss/gi,                              to: 'view the record' },
  { from: /₹15,000 ON THE LINE\.? EVERY SINGLE DAY\.?/gi,  to: 'ON RECORD · EVERY SINGLE DAY' },
  { from: /₹15,000 ON THE LINE/g,                          to: 'ON RECORD' },
  { from: /₹15,000 on the line every single day\.?/gi,     to: 'on record every single day' },
  { from: /₹15,000 on the line\.?/gi,                      to: 'on record.' },
  { from: /₹?15,000 on the line/gi,                        to: 'on record' },
  { from: /Miss = you collect\.?/gi,                        to: 'Miss = on record.' },
  { from: /Miss = you collect /gi,                         to: 'Miss = on record ' },
  { from: /MISS = YOU COLLECT/g,                            to: 'MISS = ON RECORD' },
  { from: /₹15,000 PENALTY[^<\n"]{0,12}/g,                  to: 'MISSED · LOGGED' },
  { from: /₹15,000 SLAM \(hook!\)/g,                       to: 'COMMITMENT SLAM (hook!)' },
  { from: /₹15,000 stays mine/g,                            to: 'commitment stays mine' },
  { from: /₹15,000 STAKE/g,                                 to: 'COMMITMENT' },
  { from: /₹15,000 \(\$200\) TO A FOLLOWER/g,              to: 'PUBLIC ACCOUNTABILITY' },
  { from: /₹15,000\/day flat\s*—?\s*no escalation\.?/gi,    to: 'daily commitment · no escalation' },
  { from: /₹15,000\/day from Day 1, no escalation/gi,       to: 'daily commitment from Day 1, no escalation' },
  { from: /₹15,000\/day, no escalation/gi,                  to: 'daily commitment, no escalation' },
  { from: /₹15,000\/day/g,                                  to: 'daily commitment' },
  { from: /₹15,000\.? LOGGED PUBLIC\.?/g,                  to: 'LOGGED PUBLIC.' },
  { from: /\$200\) TO/g,                                    to: ') TO' },

  // ─── Other stake-amount variants (Chapter 1 ₹5,000 + projected ₹20,000) ───
  { from: /Stakes increase to ₹20,000[^.<\n]*\.\s*/g,        to: '' },
  { from: /Stakes increase to ₹20,000[^"'`<\n]*/g,           to: '' },
  { from: /Current penalty: ₹20,000[^"'`<\n]*/g,            to: 'On record' },
  { from: /₹20,000 at Day 101/g,                            to: 'next phase at Day 101' },
  { from: /₹20,000/g,                                       to: '' },
  { from: /₹5,000\s*<\/span>\s*<span class="dim">\s*ON THE LINE\s*<\/span>/gi, to: 'ON RECORD</span>' },
  { from: /<strong>₹5,000<\/strong>\s*ON THE LINE/gi,        to: '<strong>ON RECORD</strong>' },
  { from: /₹5,000\/day at stake/gi,                          to: 'daily commitment' },
  { from: /₹5,000\/day/gi,                                   to: 'daily commitment' },
  { from: /₹5,000/g,                                        to: '' },

  // ─── Inline labels & short forms ───
  { from: /₹15K\/cycle/g,    to: 'per cycle' },
  { from: /₹15K-1L\/mo/g,   to: 'monthly' },
  { from: /₹15K IF I QUIT/g, to: 'PERSONAL COST IF I QUIT' },
  { from: /₹15K Stakes/g,    to: 'Stakes' },
  { from: /₹15K STAKE/g,     to: 'COMMITMENT' },
  { from: /Rs\.?\s*15,?000/gi, to: '' },
  { from: /\(₹15,000 \(\$200\)\)/g, to: '' },
  { from: /\(₹15,000\)/g,    to: '' },
  { from: /\(\$200\)/g,      to: '' },
  { from: /₹15,000/g,        to: '' },
  { from: /₹15K/g,           to: '' },
  { from: /\b15K\b(?! tax)/g, to: '' },  // skip "15K tax" if any
  { from: /\$200 USD/gi,     to: '' },

  // ─── Standalone STAKE label rewrites (only when capitalized, to leave finance code alone) ───
  { from: /AT STAKE/g,       to: 'LOCKED IN' },
  { from: /\bSTAKE\b/g,      to: 'COMMITMENT' },

  // ─── Cleanup: double spaces, orphaned punctuation ───
  { from: /· · /g,           to: '· ' },
  { from: /,\s*,\s*/g,       to: ', ' },
  { from: /  +/g,            to: ' ' },
  { from: /\s+([.,;:!])/g,    to: '$1' },
];

let totalChanges = 0;
let changedFiles = 0;

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.log('skip (missing):', rel); continue; }

  const before = fs.readFileSync(abs, 'utf8');
  let after = before;
  let fileChanges = 0;
  for (const r of RULES) {
    const beforeRule = after;
    after = after.replace(r.from, r.to);
    if (after !== beforeRule) fileChanges++;
  }

  if (after !== before) {
    fs.writeFileSync(abs, after);
    changedFiles++;
    totalChanges += fileChanges;
    console.log(`  ${rel}  (${fileChanges} rule(s) applied)`);
  }
}

console.log(`\n${changedFiles} files modified · ${totalChanges} rule-hits total`);
