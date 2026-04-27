// ═══════════════════════════════════════════
// FIRST LIGHT — CONTENT
// ═══════════════════════════════════════════

var TAGS = {
  niche: ['#5amrunner','#morningrunner','#runstreak','#publicaccountability','#dailydiscipline','#morningdiscipline','#noexcusesrunning','#earlymorningrun','#5kchallenge','#fitnessaccountability'],
  medium: ['#disciplineovermotivation','#runningcommunity','#consistencyiskey','#gymlife','#morningroutine','#earlymorningworkout','#runnersofinstagram'],
  branded: ['#firstlightlive','#ironcovenantchallenge'],
  location: ['#bangalorerunners','#bengalurufitness','#blrrunners','#bangalorefitness','#whitefieldgym']
};
var selectedTags = [];

function renderTags() {
  ['niche','medium','branded','location'].forEach(function(cat) {
    var el = document.getElementById(cat + 'Tags');
    if (!el) return;
    el.innerHTML = TAGS[cat].map(function(tag) {
      return '<span class="tag-pill ' + (cat === 'location' ? 'niche' : cat) + ' ' + (selectedTags.includes(tag) ? 'active' : '') + '" onclick="toggleTag(\'' + tag + '\')">' + tag + '</span>';
    }).join('');
  });
  document.getElementById('todayTags').textContent = selectedTags.length ? selectedTags.join('  ') : 'Select 5 tags below...';
}

function toggleTag(tag) {
  var idx = selectedTags.indexOf(tag);
  if (idx >= 0) { selectedTags.splice(idx, 1); }
  else if (selectedTags.length < 5) { selectedTags.push(tag); }
  renderTags();
}

function copyTags(mode) {
  var text = selectedTags.join(' ');
  navigator.clipboard.writeText(text).then(function() {
    var btns = document.querySelectorAll('.btn-copy');
    btns.forEach(function(b) { if (b.textContent.includes(mode.toUpperCase())) { b.classList.add('copied'); b.textContent = 'COPIED ✓'; setTimeout(function() { b.classList.remove('copied'); b.textContent = mode === 'comment' ? 'COPY FOR FIRST COMMENT' : 'COPY FOR CAPTION'; }, 1500); }});
  });
}

// Auto-suggest today's tags
(function() {
  var day = getDayNumber();
  var rotations = [
    [0,1,2,0,0], [3,4,5,1,0], [6,7,8,2,1], [9,0,1,3,0],
    [2,3,4,4,1], [5,6,7,5,0], [8,9,0,6,1]
  ];
  var rot = rotations[day % rotations.length];
  selectedTags = [TAGS.niche[rot[0]], TAGS.niche[rot[1]], TAGS.niche[rot[2]], TAGS.medium[rot[3]], TAGS.branded[rot[4]]].filter(Boolean);
  renderTags();
})();

// ══════════════════════════════════════
// STORIES CHECKLIST
// ══════════════════════════════════════
function toggleStory(el) {
  el.classList.toggle('checked');
  el.querySelector('.story-check').textContent = el.classList.contains('checked') ? '✓' : '';
  // Persist
  var items = document.querySelectorAll('.story-step');
  var done = [];
  items.forEach(function(s, i) { if (s.classList.contains('checked')) done.push(i); });
  saveStoriesState(done);
  markSaved();
  var today = getEffectiveToday();
  sbFetch('stories_completions', 'POST', {date: today, done_indices: done}, '?on_conflict=date');
}

// ══════════════════════════════════════
// ENGAGEMENT TIMER
// ══════════════════════════════════════
var timerInterval = null;
var timerSeconds = 1200;

function updateTimerDisplay() {
  var m = Math.floor(timerSeconds / 60);
  var s = timerSeconds % 60;
  document.getElementById('engTimer').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  if (timerSeconds <= 0) { clearInterval(timerInterval); timerInterval = null;
    document.getElementById('engTimer').style.color = 'var(--green)';
    document.getElementById('engTimer').textContent = 'DONE ✓';
    try { if (Notification.permission === 'granted') new Notification('First Light', { body: '20-minute engagement protocol complete!' }); } catch(e) {}
    document.getElementById('engTimer').style.animation = 'pulse 1s ease-in-out 3'; }
}

function startTimer() {
  if (Notification.permission === 'default') Notification.requestPermission();
  if (timerInterval) return;
  document.getElementById('engTimer').style.color = 'var(--cyan)';
  timerInterval = setInterval(function() { timerSeconds--; updateTimerDisplay(); }, 1000);
}
function pauseTimer() { clearInterval(timerInterval); timerInterval = null; }
function resetTimer() { clearInterval(timerInterval); timerInterval = null; timerSeconds = 1200; document.getElementById('engTimer').style.color = 'var(--cyan)'; updateTimerDisplay(); }

// ══════════════════════════════════════
// ENGAGEMENT COUNTERS
// ══════════════════════════════════════
function adjustCounter(id, delta) {
  var el = document.getElementById(id);
  var v = Math.max(0, parseInt(el.textContent) + delta);
  el.textContent = v;
  setEngCounter(id, v);
  markSaved();
  var today = getEffectiveToday();
  syncEngagement(today,
    parseInt(document.getElementById('commentCount').textContent) || 0,
    parseInt(document.getElementById('storyCount').textContent) || 0,
    parseInt(document.getElementById('dmCount').textContent) || 0
  );
}

// ══════════════════════════════════════
// COPY BIO
// ══════════════════════════════════════
function copyBio() {
  var day = getDayNumber();
  var unclaimed = '₹' + formatINR(getUnclaimed(day));
  var bio = 'Miss 1 day = ₹15,000 to a follower. Cash.\n' + day + ' days. 0 misses. ' + unclaimed + ' unclaimed.\nRun + Gym + Food Code. Before 6AM. Daily.\nBLR | Follow to collect if I fail.';
  navigator.clipboard.writeText(bio).then(function() {
    var btn = document.querySelector('[onclick="copyBio()"]');
    btn.classList.add('copied'); btn.textContent = 'COPIED ✓';
    setTimeout(function() { btn.classList.remove('copied'); btn.textContent = 'COPY BIO'; }, 1500);
  });
}
 
