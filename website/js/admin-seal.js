// ═══════════════════════════════════════════
// FIRST LIGHT — SEAL THE DAY
// ═══════════════════════════════════════════

var SEAL_AFFIRMATIONS = [
  '"The morning is won or lost in the first 60 seconds."',
  '"No end date. No finish line. INFINITE."',
  '"Miss 1 day = Rs.15,000. Zero misses. That is the standard."',
  '"Discipline is choosing what you want most over what you want now."',
  '"The body achieves what the mind believes."',
  '"Every day you don\'t quit is a day you win."',
  '"Small daily improvements are the key to staggering results."',
  '"Your future self is watching you right now through memories."',
  '"The iron covenant is not a suggestion. It is the law."',
  '"Day by day, what you choose, what you think, and what you do is who you become."'
];

function checkSealConditions() {
  var today = getEffectiveToday();
  if (localStorage.getItem('fl_seal_dismissed_' + today)) return;
  // Check evening rituals >= 80%
  var eveDone = JSON.parse(localStorage.getItem('fl_rituals_evening_' + today) || '[]');
  var eveDefs = getRitualDefs('evening').filter(function(r) { return r.active !== false; });
  var evePct = eveDefs.length > 0 ? eveDone.length / eveDefs.length : 0;
  // Check daily log exists
  var proof = getProofData();
  var logExists = proof.some(function(p) { return p.date === today; });
  if (evePct >= 0.8 && logExists) showSealOverlay(today);
}

function showSealOverlay(date) {
  var proof = getProofData().find(function(p) { return p.date === date; }) || {};
  var day = getDayNumber();
  var summaryHtml = '';
  if (proof.sleepHrs) summaryHtml += 'SLEEP: ' + proof.sleepHrs + 'h · ';
  if (proof.runKm) summaryHtml += 'RUN: ' + proof.runKm + ' km · ';
  summaryHtml += 'GYM: ' + (proof.gym ? 'YES' : 'NO') + ' · ';
  summaryHtml += 'FOOD: ' + (proof.foodClean ? 'CLEAN' : 'VIOLATION');
  document.getElementById('sealSummary').textContent = summaryHtml;
  document.getElementById('sealAffirmation').textContent = SEAL_AFFIRMATIONS[day % SEAL_AFFIRMATIONS.length];
  document.getElementById('sealStreak').textContent = 'DAY ' + day + ' — STREAK ALIVE';
  var ov = document.getElementById('sealOverlay');
  ov.style.display = 'flex';
}

function dismissSealOverlay() {
  document.getElementById('sealOverlay').style.display = 'none';
  localStorage.setItem('fl_seal_dismissed_' + getEffectiveToday(), '1');
}
 
