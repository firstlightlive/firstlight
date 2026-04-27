// ═══════════════════════════════════════════
// FIRST LIGHT — MASTERY
// ═══════════════════════════════════════════

var MASTERY_ITEMS = [
  {id:1, domain:'A', title:'Read 1 person\'s baseline', desc:'Observe normal body language, speech pace, eye contact, energy. Note deviations.', inputType:'text', placeholder:'Name + 1 observation',
   guide:'Pick one person you interact with today. Observe their NORMAL state — how they usually stand, speak, make eye contact, their energy level. Then note any deviations from that baseline. Deviations = they\'re hiding something, stressed, or excited.', source:'Pattern Recognition', track:'Write: Name + 1 specific observation about their baseline or deviation'},
  {id:2, domain:'A', title:'Feet First check', desc:'Notice where feet point in important conversations. Toward you = engaged.', inputType:'text', placeholder:'1 logged observation',
   guide:'In every important conversation today, glance at their feet. Feet pointing toward you = engaged and interested. Feet pointing toward the exit = they want to leave. Feet shuffling = uncomfortable. This is one of the hardest body parts to consciously control.', source:'Body Language', track:'Log 1 observation: who, where their feet pointed, what it meant'},
  {id:3, domain:'A', title:'Room Read within 60 seconds', desc:'5-point scan: power, comfort, anxiety, alliances, energy.', inputType:'checkbox',
   guide:'When entering ANY group setting (meeting, cafe, gym), do a rapid 5-point scan: (1) Who has power? (2) Who is comfortable? (3) Who is anxious? (4) What alliances exist? (5) What\'s the overall energy? This trains your social radar.', source:'Social Dynamics', track:'Done once per group entry. Mental scan completed.'},
  {id:4, domain:'A', title:'Make 3 predictions', desc:'Predict 3 things at morning. Score accuracy at night (0-3).', inputType:'predictions', placeholder:'3 predictions written',
   guide:'At morning planning, predict 3 things about people or situations you\'ll encounter today. Example: "My boss will be stressed about the deadline." "The new intern will ask for help." "The client call will run over 30 min." Score accuracy at night: 0-3.', source:'Pattern Recognition', track:'3 predictions written in morning. Accuracy scored at night (0/3, 1/3, 2/3, 3/3)'},
  {id:5, domain:'A', title:'Spot 3 cognitive biases', desc:'Name the bias specifically in yourself or others.', inputType:'text', placeholder:'3 biases named + context',
   guide:'Catch 3 cognitive biases today — in yourself OR others. Name the exact bias: confirmation bias (seeking info that confirms belief), anchoring (fixating on first number), halo effect (one good trait = everything good), sunk cost fallacy, availability bias, Dunning-Kruger.', source:'Human Psychology', track:'3 biases named with specific context where you spotted them'},
  {id:6, domain:'B', title:'Learn 5 new vocabulary words', desc:'Norman Lewis method. Learn idea, then word. Use each in 3 contexts.', inputType:'text', placeholder:'5 words with roots + usage',
   guide:'Use the Norman Lewis concept-cluster method: Learn the IDEA first, then the word. Example: the idea of "speaking against established beliefs" = HERESY. Then use each word in 3 contexts within 24 hours — written, spoken, and internal thought.', source:'Vocabulary Power (Norman Lewis)', track:'5 words written with their roots/meanings + usage examples'},
  {id:7, domain:'B', title:'3-Second Listening Rule', desc:'Wait 3 full seconds after other person finishes. Minimum 3 times today.', inputType:'checkbox',
   guide:'In every important conversation, after the other person stops talking — count "one thousand one, one thousand two, one thousand three" BEFORE responding. This gives them space to add more (they often do), shows deep respect, and prevents you from reactive responses. Do this minimum 3 times today.', source:'Active Listening', track:'3 conversations where you held the 3-second pause'},
  {id:8, domain:'B', title:'Give value to 3 people', desc:'Help, useful info, or genuine compliment. No expectation of return.', inputType:'text', placeholder:'3 names + what you gave',
   guide:'Proactively give value to 3 people today. Can be: helpful information, a genuine specific compliment, connecting them with someone, sharing a resource, or solving a small problem for them. The key: ZERO expectation of return. Pure investment in the relationship bank.', source:'Persuasion & Influence (Reciprocity)', track:'3 names + what value you gave each person'},
  {id:9, domain:'B', title:'Practice 1 storytelling framework', desc:'Hook > Tension > Resolution. Tell it to someone or write it down.', inputType:'text', placeholder:'1 story structured and delivered',
   guide:'Take any event from your day and restructure it as a story: HOOK (grab attention with a surprising opening) → TENSION (what was at stake? what could go wrong?) → RESOLUTION (what happened? what did you learn?). Tell it to someone or write it down. Great stories follow this arc.', source:'Storytelling', track:'1 story structured using Hook > Tension > Resolution'},
  {id:10, domain:'B', title:'Emotional Labeling 3x', desc:'"It seems like..." to label emotions in 3 interactions. (Chris Voss)', inputType:'text', placeholder:'3 labeling attempts + response',
   guide:'Chris Voss technique from "Never Split the Difference." In 3 separate interactions today, use: "It seems like you\'re feeling..." or "It sounds like this is important to you because..." Labels diffuse negative emotions and amplify positive ones. Watch how people respond — they\'ll usually confirm and open up.', source:'Persuasion & Negotiation (Chris Voss)', track:'3 labeling attempts + how the person responded'},
  {id:11, domain:'C', title:'Stoic Preparation (5 min)', desc:'What might challenge me? Pre-decide emotional response. Dichotomy of Control.', inputType:'checkbox',
   guide:'Every morning, spend 5 minutes on Stoic premeditatio malorum: What might challenge me today? A difficult meeting? Traffic? Bad news? For each, pre-decide your RESPONSE (not reaction). Apply Dichotomy of Control: What can I control? Focus only on that. What can\'t I control? Accept it in advance.', source:'Stoic Philosophy (Marcus Aurelius)', track:'Written in journal: challenges anticipated + pre-decided responses'},
  {id:12, domain:'C', title:'Emotional Check-in 3x/day', desc:'Rate 1-10 + name emotions. Morning + post-lunch + evening.', inputType:'emotional',
   guide:'3 times today — morning, post-lunch, evening — pause and ask: "What am I feeling right now? Rate it 1-10." Then NAME the specific emotion (not just "good" or "bad"). Anxious? Proud? Frustrated? Peaceful? Excited? Bored? Also do a body scan: Where is tension held? Jaw? Shoulders? Stomach?', source:'Emotional Intelligence', track:'3 scores (1-10) + specific emotions named + body tension noted'},
  {id:13, domain:'C', title:'Deep Work sessions completed', desc:'90-min focused blocks. Phone in bag, one task. Target: 3+', inputType:'number', placeholder:'Sessions (target 3+)',
   guide:'Count how many 90-minute focused blocks you completed today. Rules: Phone physically in bag (not just silent). One task only. Physical timer visible. No email, no Slack, no browsing. If you got interrupted, the block doesn\'t count. Target: minimum 3 sessions per day.', source:'Cal Newport — Deep Work', track:'Number of 90-min blocks completed (target: 3+)'},
  {id:14, domain:'C', title:'Apply 1 mental model', desc:'Inversion, Second-Order Thinking, First Principles, etc.', inputType:'text', placeholder:'Model named + application',
   guide:'Deliberately use one mental model in a real decision today. Options: Inversion (what would make this fail?), Second-Order Thinking (then what?), First Principles (what is fundamentally true?), Occam\'s Razor (simplest explanation), Circle of Competence (am I qualified to judge this?), Hanlon\'s Razor (don\'t assume malice).', source:'Cognitive Enhancement (Charlie Munger)', track:'Model name + how you applied it to a specific decision'},
  {id:15, domain:'C', title:'6-Second Rule', desc:'Pause 6 seconds before emotional reaction. Track catches vs. reactions.', inputType:'text', placeholder:'Pauses caught / reactions ratio',
   guide:'Before ANY emotional reaction today — anger, frustration, excitement, offense — force a 6-second pause. Breathe. Then respond deliberately. Track: How many times did you CATCH yourself and pause? How many times did you REACT without pausing? The ratio improves over weeks.', source:'Emotional Regulation', track:'Pauses caught / reactions ratio (e.g., 5 caught, 2 reactions = 5:2)'},
  {id:16, domain:'D', title:'15 min craft practice', desc:'Work on your ONE skill. Every single day. Mastery demands daily reps.', inputType:'number', placeholder:'Minutes (min 15)',
   guide:'Pick your ONE skill — the thing you want to be known for. Data architecture? Writing? Public speaking? Spend minimum 15 minutes deliberately practicing it. Not just doing it — PRACTICING. Pushing your edge. Working on weaknesses. Even on the worst days, 15 minutes is non-negotiable.', source:'Rule 5: Become So Good They Cannot Ignore You', track:'Minutes spent in deliberate practice (minimum 15)'},
  {id:17, domain:'D', title:'1 piece of content created', desc:'Write, record, design, or refine one piece of brand content.', inputType:'text', placeholder:'1 item created/refined',
   guide:'Build your brand daily. Create or refine ONE piece of content: a LinkedIn post, an Instagram carousel, a framework diagram, a blog draft, a presentation slide, a voice note script. Doesn\'t have to be published — just created or improved. Consistency compounds.', source:'Brand Building', track:'1 item created or refined — describe what'},
  {id:18, domain:'D', title:'Actions > Words audit', desc:'Did you complain? Announce plans vs executing? Let results speak?', inputType:'text', placeholder:'Y/N self-audit with note',
   guide:'Honest self-audit: Did you complain today? Did you announce plans instead of quietly executing? Did you talk about what you\'re going to do instead of just doing it? Did you let results speak? The gap between what you say and what you do is your credibility gap. Close it.', source:'Rule 10: Let Your Actions Speak Louder', track:'Y/N self-audit with honest note on where you talked vs acted'},
  {id:19, domain:'D', title:'"Am I doing this as well as I can?"', desc:'Ask once per hour during work. Make 1 small adjustment each time.', inputType:'number', placeholder:'Times asked + adjustments',
   guide:'Set an hourly reminder during work. Ask: "Am I doing this task as well as I possibly can right now?" If no — make 1 small adjustment immediately. Not a big overhaul. One micro-improvement. Excellence in small things builds excellence in everything.', source:'Rule 13: Bring Your Best to Every Task', track:'How many times you asked + adjustments made'},
  {id:20, domain:'D', title:'Write your WHY statement', desc:'"I exist to ___ so that ___." Refine by 1% each day.', inputType:'text', placeholder:'Written/recited. Refinement noted.',
   guide:'Every morning, write or recite: "I exist to [your purpose] so that [impact on others]." Example: "I exist to build systems of discipline so that my future family inherits strength, not chaos." Refine it by 1% each day until it is undeniable and feels like truth, not aspiration.', source:'Simon Sinek — Start With Why', track:'Written or recited. Note any refinement today.'},
  {id:21, domain:'E', title:'Make 1 person feel genuinely seen', desc:'Use their name, remember something, acknowledge before the agenda.', inputType:'text', placeholder:'Name + what you did',
   guide:'Before any agenda, transaction, or request — make ONE person feel genuinely seen today. Use their name. Remember something personal about them. Acknowledge them as a human, not a function. Ask "How can I make this person feel they matter?" The people who feel valued by you become lifelong allies.', source:'Rule 6: Make Every Person Feel They Matter', track:'Name + what you did to make them feel seen'},
  {id:22, domain:'E', title:'Start 1 hard conversation with story', desc:'"I noticed something. Can I share?" Not "You always..."', inputType:'text', placeholder:'1 conversation handled (or N/A)',
   guide:'If you need to have a difficult conversation today, start with a story, not an accusation. Say "I noticed something. Can I share it?" instead of "You always..." or "You never..." Listen to their side COMPLETELY before giving yours. End with "What do we want to build from here?"', source:'Rule 9: Start Hard Conversations with a Story', track:'1 conversation handled this way, or N/A if none needed'},
  {id:23, domain:'E', title:'Ho\'oponopono / Forgiveness (5 min)', desc:'4 phrases: I love you. I\'m sorry. Please forgive me. Thank you.', inputType:'text', placeholder:'5 min completed. Who directed at.',
   guide:'Hawaiian forgiveness practice. Direct 4 phrases at anyone you hold even mild resentment toward — including yourself: "I love you. I\'m sorry. Please forgive me. Thank you." 5 minutes. Eyes closed. Held resentment = chronic cortisol = accelerated aging. Forgiveness is not for them. It is for you.', source:'Ho\'oponopono / Osho', track:'5 minutes completed. Who you directed it at and what shifted.'},
  {id:24, domain:'E', title:'Invest in 1 relationship', desc:'Do one thing for someone before you need anything. Zero expectation.', inputType:'text', placeholder:'Name + what you invested',
   guide:'Do one thing for someone BEFORE you need anything from them. Share useful info. Give a genuine compliment. Make an introduction. Help solve a problem. The key: absolutely zero expectation of return. Relationships are your real salary. Invest in them like a bank account.', source:'Rule 2: Invest in People Before You Need Them', track:'Name + what you invested in them'},
  {id:25, domain:'E', title:'Accept worst case, then act', desc:'Name 1 fear. "I accept this might fail. Doing it anyway." Take 1 action.', inputType:'text', placeholder:'Fear named + action taken',
   guide:'Name 1 thing you are afraid to start or currently avoiding. Say out loud: "I accept that this might fail. I accept the worst case. I am doing it anyway." Then take ONE concrete action toward it today. Not thinking about it. Not planning. One action. Fear before action is normal. Action despite fear is courage.', source:'Rule 12: Accept the Worst Case, Then Act (Samurai)', track:'Fear named + specific action taken today'}
];

var MASTERY_DOMAINS = {
  A: {name:'People Reading & Social Intelligence', color:'#00D4FF', items:[1,2,3,4,5]},
  B: {name:'Communication & Influence', color:'#00E5A0', items:[6,7,8,9,10]},
  C: {name:'Mental Performance & Deep Work', color:'#F5A623', items:[11,12,13,14,15]},
  D: {name:'Brand, Creativity & Career', color:'#E040FB', items:[16,17,18,19,20]},
  E: {name:'Relationships, Wisdom & Inner Game', color:'#FF6B35', items:[21,22,23,24,25]}
};

var MASTERY_WEEKLY_ITEMS = [
  {id:'W1', title:'Body Language Log Review', desc:'Review all observations. Write 3 insights.', inputType:'textarea', placeholder:'3 insights from this week'},
  {id:'W2', title:'Social Dynamics Debrief', desc:'Where did you command respect? Lose frame? Red flags spotted?', inputType:'textarea', placeholder:'Written debrief'},
  {id:'W3', title:'Prediction Accuracy Score', desc:'Tally all 21 predictions (3/day x 7). Score and blind spots.', inputType:'score', placeholder:'Score: __/21 correct. Blind spots noted.'},
  {id:'W4', title:'Communication Skill Focus', desc:'Pick 1 chapter from Communication Mastery Bible. Do the exercises.', inputType:'textarea', placeholder:'Chapter + exercises completed'},
  {id:'W5', title:'Brand Strategy Review', desc:'Review positioning, one-liner, WHY. Refine 1 element.', inputType:'textarea', placeholder:'Element refined + what changed'},
  {id:'W6', title:'Mental Model Collection', desc:'Study 1 new model deeply. Write it in own words. Find 3 applications.', inputType:'textarea', placeholder:'Model name + 3 applications written'},
  {id:'W7', title:'Relationship Audit (PERMA)', desc:'P, E, R, M, A — each 1-10. Total /50. Who invested in you?', inputType:'perma', placeholder:'PERMA score __/50. 3 action items.'}
];

// ── MASTERY: localStorage helpers ──
function getMasteryDaily(date) {
  try { return JSON.parse(localStorage.getItem('fl_mastery_daily_' + date) || '{}'); } catch(e) { return {}; }
}

function getMasteryWeekly(weekDate) {
  try { return JSON.parse(localStorage.getItem('fl_mastery_weekly_' + weekDate) || '{}'); } catch(e) { return {}; }
}

function getMasteryIdeas() {
  try { return JSON.parse(localStorage.getItem('fl_mastery_ideas') || '[]'); } catch(e) { return []; }
}

function getMasteryMonthly(month) {
  try { return JSON.parse(localStorage.getItem('fl_mastery_monthly_' + month) || '{}'); } catch(e) { return {}; }
}

// ── MASTERY: Compute stats from items ──
function computeMasteryStats(items) {
  var completed = 0, domainScores = {};
  Object.keys(MASTERY_DOMAINS).forEach(function(d) { domainScores[d] = 0; });
  for (var i = 1; i <= 25; i++) {
if (items[i] && items[i].done) {
  completed++;
  var item = MASTERY_ITEMS.find(function(m) { return m.id === i; });
  if (item) domainScores[item.domain]++;
}
  }
  return { completed: completed, pct: Math.round(completed / 25 * 100), domainScores: domainScores };
}

// ── MASTERY: Save daily data ──
function saveMasteryDaily(date, items) {
  if (isDateLocked(date)) { showLockWarning(); return; }
  localStorage.setItem('fl_mastery_daily_' + date, JSON.stringify(items));
  if (typeof syncSave === 'function') {
    syncSave('mastery_log', { date: date, items: JSON.stringify(items) }, 'date');
  }
  var stats = computeMasteryStats(items);
  syncMasteryDaily(date, items, stats.completed, stats.pct, stats.domainScores);
  updateMasteryDailyProgress(stats);
  markSaved();
}

function updateMasteryDailyProgress(stats) {
  var pct = stats.pct;
  var el1 = document.getElementById('mastery-daily-pct');
  var el2 = document.getElementById('mastery-daily-pct2');
  var bar = document.getElementById('mastery-daily-bar');
  var score = document.getElementById('mastery-daily-score');
  if (el1) el1.textContent = pct + '%';
  if (el2) el2.textContent = pct + '%';
  if (bar) bar.style.width = pct + '%';
  if (score) score.textContent = stats.completed + ' / 25';
  if (bar) bar.style.background = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
  // Also update dashboard card
  var dashPct = document.getElementById('dash-mastery-pct');
  var dashLbl = document.getElementById('dash-mastery-lbl');
  var dashBar = document.getElementById('dash-mastery-bar');
  if (dashPct) { dashPct.textContent = pct + '%'; dashPct.style.color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : pct > 0 ? 'var(--red)' : 'var(--cyan)'; }
  if (dashLbl) dashLbl.textContent = pct + '%';
  if (dashBar) { dashBar.style.width = pct + '%'; dashBar.style.background = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)'; }
}

// ── MASTERY: Date navigation ──
function masteryDateNav(dir) {
  var el = document.getElementById('masteryDate');
  if (dir === 0) { el.value = getEffectiveToday(); }
  else {
var d = new Date(el.value);
d.setDate(d.getDate() + dir);
el.value = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
  }
  renderMasteryDaily();
}

// ── MASTERY: Render daily check-in ──
function renderMasteryDaily() {
  var dateEl = document.getElementById('masteryDate');
  if (!dateEl.value) dateEl.value = getEffectiveToday();
  var date = dateEl.value;
  var data = getMasteryDaily(date);
  var container = document.getElementById('mastery-daily-container');
  var locked = isDateLocked(date);
  var html = '';
  if (locked) html += getLockBannerHTML(date);

  Object.keys(MASTERY_DOMAINS).forEach(function(domKey) {
var dom = MASTERY_DOMAINS[domKey];
var domDone = 0;
var itemsHtml = '';

dom.items.forEach(function(itemId) {
  var item = MASTERY_ITEMS.find(function(m) { return m.id === itemId; });
  var d = data[itemId] || {};
  var done = d.done ? ' done' : '';
  if (d.done) domDone++;

  itemsHtml += '<div class="ritual-item' + done + '" data-mastery="' + itemId + '">';
  itemsHtml += '<div class="ritual-check" onclick="toggleMasteryItem(' + itemId + ',event)">' + (d.done ? '✓' : '') + '</div>';
  itemsHtml += '<div style="flex:1">';
  itemsHtml += '<div class="ritual-text">' + itemId + '. ' + item.title + (item.guide ? ' <span onclick="event.stopPropagation();var g=document.getElementById(\'mastery-guide-' + itemId + '\');g.style.display=g.style.display===\'none\'?\'block\':\'none\'" style="cursor:pointer;font-size:12px;color:var(--cyan);margin-left:4px" title="How to do this">ℹ</span>' : '') + '</div>';
  itemsHtml += '<div class="ritual-desc">' + item.desc + '</div>';

  // Guide (expandable how-to)
  if (item.guide) {
    itemsHtml += '<div id="mastery-guide-' + itemId + '" style="display:none;margin-top:8px;padding:10px 12px;background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.1);border-radius:6px">';
    itemsHtml += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--cyan);margin-bottom:6px;font-weight:700">HOW TO DO THIS</div>';
    itemsHtml += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text);line-height:1.7">' + item.guide + '</div>';
    if (item.source) itemsHtml += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--gold);margin-top:6px;letter-spacing:1px">SOURCE: ' + item.source + '</div>';
    if (item.track) itemsHtml += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--green);margin-top:4px;letter-spacing:1px">TRACK: ' + item.track + '</div>';
    itemsHtml += '</div>';
  }

  // Expandable detail input
  var showDetail = d.expanded || false;
  itemsHtml += '<div class="mastery-detail" style="margin-top:8px;display:' + (showDetail ? 'block' : 'none') + '" id="mastery-detail-' + itemId + '">';

  if (item.inputType === 'text') {
    itemsHtml += '<input type="text" class="form-input" style="font-size:11px;padding:8px 10px" placeholder="' + (item.placeholder || '') + '" value="' + ((d.note || '').replace(/"/g, '&quot;')) + '" oninput="saveMasteryNote(' + itemId + ',this.value)">';
  } else if (item.inputType === 'number') {
    itemsHtml += '<input type="number" class="form-input" style="font-size:11px;padding:8px 10px;max-width:140px" placeholder="' + (item.placeholder || '0') + '" value="' + (d.value || '') + '" oninput="saveMasteryValue(' + itemId + ',this.value)">';
  } else if (item.inputType === 'predictions') {
    itemsHtml += '<textarea class="form-input" style="font-size:11px;padding:8px 10px" rows="2" placeholder="' + (item.placeholder || '') + '" oninput="saveMasteryNote(' + itemId + ',this.value)">' + (d.note || '') + '</textarea>';
    itemsHtml += '<div style="margin-top:6px;display:flex;align-items:center;gap:8px">';
    itemsHtml += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">ACCURACY (0-3):</span>';
    itemsHtml += '<input type="number" class="form-input" style="font-size:11px;padding:6px 8px;max-width:60px" min="0" max="3" value="' + (d.accuracy || '') + '" oninput="saveMasteryAccuracy(' + itemId + ',this.value)">';
    itemsHtml += '</div>';
  } else if (item.inputType === 'emotional') {
    itemsHtml += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">';
    itemsHtml += '<div><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);display:block;margin-bottom:4px">MORNING</span><input type="number" class="form-input" style="font-size:11px;padding:6px 8px" min="1" max="10" placeholder="1-10" value="' + (d.morning || '') + '" oninput="saveMasteryEmotional(' + itemId + ',\'morning\',this.value)"></div>';
    itemsHtml += '<div><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);display:block;margin-bottom:4px">LUNCH</span><input type="number" class="form-input" style="font-size:11px;padding:6px 8px" min="1" max="10" placeholder="1-10" value="' + (d.lunch || '') + '" oninput="saveMasteryEmotional(' + itemId + ',\'lunch\',this.value)"></div>';
    itemsHtml += '<div><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);display:block;margin-bottom:4px">EVENING</span><input type="number" class="form-input" style="font-size:11px;padding:6px 8px" min="1" max="10" placeholder="1-10" value="' + (d.evening || '') + '" oninput="saveMasteryEmotional(' + itemId + ',\'evening\',this.value)"></div>';
    itemsHtml += '</div>';
    itemsHtml += '<input type="text" class="form-input" style="font-size:11px;padding:8px 10px;margin-top:6px" placeholder="Named emotions..." value="' + ((d.note || '').replace(/"/g, '&quot;')) + '" oninput="saveMasteryNote(' + itemId + ',this.value)">';
  }

  itemsHtml += '</div>'; // end mastery-detail
  itemsHtml += '</div>'; // end flex:1

  // Expand button (for items with inputs beyond checkbox)
  if (item.inputType !== 'checkbox') {
    itemsHtml += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);cursor:pointer;padding:4px 8px;flex-shrink:0" onclick="event.stopPropagation();toggleMasteryDetail(' + itemId + ')">' + (showDetail ? '▲' : '▼') + '</span>';
  }

  itemsHtml += '</div>'; // end ritual-item
});

html += '<div class="panel-section" style="border-left:3px solid ' + dom.color + '">';
html += '<div class="ritual-block-title">' + domKey + '. ' + dom.name.toUpperCase() + '<span class="ritual-block-count">' + domDone + '/5</span></div>';
html += itemsHtml;
html += '</div>';
  });

  container.innerHTML = html;

  // Prevent clicks on inputs/textareas from triggering parent handlers
  container.querySelectorAll('input, textarea, select').forEach(function(el) {
el.addEventListener('click', function(e) { e.stopPropagation(); });
  });

  updateMasteryDailyProgress(computeMasteryStats(data));
}

function toggleMasteryItem(itemId, event) {
  event.stopPropagation();
  var date = document.getElementById('masteryDate').value;
  if (isDateLocked(date)) { showLockWarning(); return; }
  var data = getMasteryDaily(date);
  if (!data[itemId]) data[itemId] = {};
  data[itemId].done = !data[itemId].done;
  saveMasteryDaily(date, data);
  // Update just this item visually
  var el = document.querySelector('.ritual-item[data-mastery="' + itemId + '"]');
  if (el) {
el.classList.toggle('done', data[itemId].done);
el.querySelector('.ritual-check').textContent = data[itemId].done ? '✓' : '';
  }
  // Update domain count
  var stats = computeMasteryStats(data);
  Object.keys(MASTERY_DOMAINS).forEach(function(dk) {
var blocks = document.querySelectorAll('.panel-section[style*="' + MASTERY_DOMAINS[dk].color + '"] .ritual-block-count');
blocks.forEach(function(b) { b.textContent = stats.domainScores[dk] + '/5'; });
  });
  updateMasteryDailyProgress(stats);
}

function toggleMasteryDetail(itemId) {
  var el = document.getElementById('mastery-detail-' + itemId);
  if (!el) return;
  var visible = el.style.display !== 'none';
  el.style.display = visible ? 'none' : 'block';
  // Update arrow
  var arrow = el.closest('.ritual-item').querySelector('span[onclick*="toggleMasteryDetail"]');
  if (arrow) arrow.textContent = visible ? '▼' : '▲';
  // Save expanded state
  var date = document.getElementById('masteryDate').value;
  var data = getMasteryDaily(date);
  if (!data[itemId]) data[itemId] = {};
  data[itemId].expanded = !visible;
  localStorage.setItem('fl_mastery_daily_' + date, JSON.stringify(data));
}

var _masteryNoteTimer = null;
function saveMasteryNote(itemId, value) {
  var date = document.getElementById('masteryDate').value;
  var data = getMasteryDaily(date);
  if (!data[itemId]) data[itemId] = {};
  data[itemId].note = value;
  clearTimeout(_masteryNoteTimer);
  _masteryNoteTimer = setTimeout(function() { saveMasteryDaily(date, data); }, 500);
}

function saveMasteryValue(itemId, value) {
  var date = document.getElementById('masteryDate').value;
  var data = getMasteryDaily(date);
  if (!data[itemId]) data[itemId] = {};
  data[itemId].value = parseInt(value) || 0;
  clearTimeout(_masteryNoteTimer);
  _masteryNoteTimer = setTimeout(function() { saveMasteryDaily(date, data); }, 500);
}

function saveMasteryAccuracy(itemId, value) {
  var date = document.getElementById('masteryDate').value;
  var data = getMasteryDaily(date);
  if (!data[itemId]) data[itemId] = {};
  data[itemId].accuracy = parseInt(value) || 0;
  clearTimeout(_masteryNoteTimer);
  _masteryNoteTimer = setTimeout(function() { saveMasteryDaily(date, data); }, 500);
}

function saveMasteryEmotional(itemId, period, value) {
  var date = document.getElementById('masteryDate').value;
  var data = getMasteryDaily(date);
  if (!data[itemId]) data[itemId] = {};
  data[itemId][period] = parseInt(value) || 0;
  clearTimeout(_masteryNoteTimer);
  _masteryNoteTimer = setTimeout(function() { saveMasteryDaily(date, data); }, 500);
}

// ══════════════════════════════════════
// MASTERY: WEEKLY REVIEW
// ══════════════════════════════════════

function getSunday(d) {
  var dt = new Date(d || new Date());
  dt.setDate(dt.getDate() - dt.getDay());
  return (dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'));
}

function masteryWeekNav(dir) {
  var el = document.getElementById('masteryWeekDate');
  if (dir === 0) { el.value = getSunday(); }
  else {
var d = new Date(el.value);
d.setDate(d.getDate() + (dir * 7));
el.value = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
  }
  renderMasteryWeekly();
}

function renderMasteryWeekly() {
  var dateEl = document.getElementById('masteryWeekDate');
  if (!dateEl.value) dateEl.value = getSunday();
  var weekDate = dateEl.value;
  var data = getMasteryWeekly(weekDate);
  var container = document.getElementById('mastery-weekly-container');
  var html = '';
  var totalDone = 0;

  MASTERY_WEEKLY_ITEMS.forEach(function(item) {
var d = data[item.id] || {};
var done = d.done;
if (done) totalDone++;

html += '<div class="panel-section">';
html += '<div style="display:flex;align-items:flex-start;gap:12px">';
html += '<div class="ritual-check' + (done ? '' : '') + '" style="' + (done ? 'background:var(--green);border-color:var(--green);color:#0A0C10;font-size:10px' : '') + '" onclick="toggleMasteryWeeklyItem(\'' + item.id + '\')">' + (done ? '✓' : '') + '</div>';
html += '<div style="flex:1">';
html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">' + item.id + '. ' + item.title + '</div>';
html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">' + item.desc + '</div>';

if (item.inputType === 'textarea' || item.inputType === 'score') {
  html += '<textarea class="form-input" rows="3" style="font-size:11px" placeholder="' + (item.placeholder || '') + '" oninput="saveMasteryWeeklyNote(\'' + item.id + '\',this.value)">' + (d.note || '') + '</textarea>';
  if (item.inputType === 'score') {
    html += '<div style="margin-top:8px;display:flex;align-items:center;gap:8px">';
    html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">CORRECT:</span>';
    html += '<input type="number" class="form-input" style="font-size:11px;padding:6px 8px;max-width:60px" min="0" max="21" value="' + (d.score || '') + '" oninput="saveMasteryWeeklyScore(\'' + item.id + '\',this.value)">';
    html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">/ 21</span>';
    html += '</div>';
  }
} else if (item.inputType === 'perma') {
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:8px">';
  ['P','E','R','M','A'].forEach(function(p) {
    html += '<div><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);display:block;margin-bottom:4px">' + p + '</span>';
    html += '<input type="number" class="form-input" style="font-size:11px;padding:6px 8px" min="1" max="10" placeholder="1-10" value="' + (d['perma_' + p] || '') + '" oninput="saveMasteryWeeklyPerma(\'' + item.id + '\',\'' + p + '\',this.value)"></div>';
  });
  html += '</div>';
  var permaTotal = ['P','E','R','M','A'].reduce(function(s,p) { return s + (parseInt(d['perma_' + p]) || 0); }, 0);
  html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--cyan);margin-bottom:8px">TOTAL: ' + permaTotal + ' / 50</div>';
  html += '<textarea class="form-input" rows="2" style="font-size:11px" placeholder="3 action items for next week..." oninput="saveMasteryWeeklyNote(\'' + item.id + '\',this.value)">' + (d.note || '') + '</textarea>';
}

html += '</div></div></div>';
  });

  container.innerHTML = html;
  var scoreEl = document.getElementById('mastery-weekly-score');
  if (scoreEl) scoreEl.textContent = totalDone + '/7';
}

function toggleMasteryWeeklyItem(id) {
  var weekDate = document.getElementById('masteryWeekDate').value;
  var data = getMasteryWeekly(weekDate);
  if (!data[id]) data[id] = {};
  data[id].done = !data[id].done;
  saveMasteryWeeklyData(weekDate, data);
  renderMasteryWeekly();
}

var _masteryWeekTimer = null;
function saveMasteryWeeklyNote(id, value) {
  var weekDate = document.getElementById('masteryWeekDate').value;
  var data = getMasteryWeekly(weekDate);
  if (!data[id]) data[id] = {};
  data[id].note = value;
  clearTimeout(_masteryWeekTimer);
  _masteryWeekTimer = setTimeout(function() { saveMasteryWeeklyData(weekDate, data); }, 500);
}

function saveMasteryWeeklyScore(id, value) {
  var weekDate = document.getElementById('masteryWeekDate').value;
  var data = getMasteryWeekly(weekDate);
  if (!data[id]) data[id] = {};
  data[id].score = parseInt(value) || 0;
  clearTimeout(_masteryWeekTimer);
  _masteryWeekTimer = setTimeout(function() { saveMasteryWeeklyData(weekDate, data); }, 500);
}

function saveMasteryWeeklyPerma(id, letter, value) {
  var weekDate = document.getElementById('masteryWeekDate').value;
  var data = getMasteryWeekly(weekDate);
  if (!data[id]) data[id] = {};
  data[id]['perma_' + letter] = parseInt(value) || 0;
  clearTimeout(_masteryWeekTimer);
  _masteryWeekTimer = setTimeout(function() { saveMasteryWeeklyData(weekDate, data); renderMasteryWeekly(); }, 500);
}

function saveMasteryWeeklyData(weekDate, items) {
  if (isWeekLocked(weekDate)) { showLockWarning(); return; }
  localStorage.setItem('fl_mastery_weekly_' + weekDate, JSON.stringify(items));
  var completed = 0;
  MASTERY_WEEKLY_ITEMS.forEach(function(wi) { if (items[wi.id] && items[wi.id].done) completed++; });
  syncMasteryWeekly(weekDate, items, completed);
  markSaved();
}

// ══════════════════════════════════════
// MASTERY: IDEAS HUB
// ══════════════════════════════════════

var _ideaFilter = 'all';

function addMasteryIdea() {
  var title = document.getElementById('ideaTitle').value.trim();
  if (!title) return;
  var ideas = getMasteryIdeas();
  var idea = {
id: Date.now(),
created_date: getEffectiveToday(),
title: title,
domain: document.getElementById('ideaDomain').value,
category: document.getElementById('ideaCategory').value,
content: document.getElementById('ideaContent').value.trim(),
status: 'active'
  };
  ideas.unshift(idea);
  localStorage.setItem('fl_mastery_ideas', JSON.stringify(ideas));
  syncMasteryIdea(idea);
  // Clear form
  document.getElementById('ideaTitle').value = '';
  document.getElementById('ideaContent').value = '';
  renderMasteryIdeas();
  markSaved();
}

function filterIdeas(cat, el) {
  _ideaFilter = cat;
  document.querySelectorAll('#p-mastery-ideas .tag-pill').forEach(function(p) { p.classList.remove('active'); });
  if (el) el.classList.add('active');
  renderMasteryIdeas();
}

function renderMasteryIdeas() {
  var ideas = getMasteryIdeas();
  var filtered = _ideaFilter === 'all' ? ideas : ideas.filter(function(i) { return i.category === _ideaFilter; });
  var container = document.getElementById('mastery-ideas-list');
  if (!filtered.length) {
container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);font-family:var(--font-mono);font-size:12px">No ideas yet. Start capturing!</div>';
return;
  }

  var catColors = {idea:'#00D4FF', research:'#00E5A0', experiment:'#F5A623', reflection:'#E040FB', resource:'#FF6B35'};
  var statusColors = {active:'var(--green)', in_progress:'var(--cyan)', done:'var(--text-dim)', archived:'var(--text-dim)'};
  var html = '';

  filtered.forEach(function(idea) {
var cc = catColors[idea.category] || '#888';
html += '<div class="panel-section" style="padding:20px;margin-bottom:12px">';
html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">';
html += '<div style="flex:1">';
html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
html += '<span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text)">' + idea.title + '</span>';
html += '<span style="font-family:var(--font-mono);font-size:8px;padding:2px 6px;border-radius:3px;background:' + cc + '18;color:' + cc + '">' + (idea.category || '').toUpperCase() + '</span>';
if (idea.domain && idea.domain !== 'general') html += '<span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">DOMAIN ' + idea.domain + '</span>';
html += '</div>';
if (idea.content) html += '<div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:8px">' + idea.content + '</div>';
html += '<div style="display:flex;align-items:center;gap:12px">';
html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + idea.created_date + '</span>';
html += '<span style="font-family:var(--font-mono);font-size:9px;color:' + (statusColors[idea.status] || 'var(--text-dim)') + '">' + (idea.status || 'active').toUpperCase() + '</span>';
html += '</div></div>';
html += '<div style="display:flex;gap:6px;flex-shrink:0">';
if (idea.status === 'active') html += '<button class="btn-copy" style="font-size:9px;padding:4px 8px" onclick="updateIdeaStatus(' + idea.id + ',\'in_progress\')">START</button>';
if (idea.status === 'in_progress') html += '<button class="btn-copy" style="font-size:9px;padding:4px 8px" onclick="updateIdeaStatus(' + idea.id + ',\'done\')">DONE</button>';
html += '<button class="btn-copy" style="font-size:9px;padding:4px 8px" onclick="updateIdeaStatus(' + idea.id + ',\'archived\')">ARCHIVE</button>';
html += '<button class="btn-copy" style="font-size:9px;padding:4px 8px;color:var(--red)" onclick="deleteMasteryIdea(' + idea.id + ')">DEL</button>';
html += '</div></div></div>';
  });

  container.innerHTML = html;
}

function updateIdeaStatus(id, status) {
  var ideas = getMasteryIdeas();
  var idea = ideas.find(function(i) { return i.id === id; });
  if (idea) {
idea.status = status;
localStorage.setItem('fl_mastery_ideas', JSON.stringify(ideas));
syncMasteryIdea(idea);
renderMasteryIdeas();
markSaved();
  }
}

function deleteMasteryIdea(id) {
  var ideas = getMasteryIdeas().filter(function(i) { return i.id !== id; });
  localStorage.setItem('fl_mastery_ideas', JSON.stringify(ideas));
  renderMasteryIdeas();
  markSaved();
}

// ══════════════════════════════════════
// MASTERY: ANALYTICS
// ══════════════════════════════════════

function buildMasteryAnalytics() {
  var today = new Date();
  var todayStr = (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'));

  // Gather last 90 days of data
  var days = [];
  for (var i = 0; i < 90; i++) {
var d = new Date(today);
d.setDate(d.getDate() - i);
var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
var data = getMasteryDaily(ds);
var stats = computeMasteryStats(data);
days.push({ date: ds, pct: stats.pct, completed: stats.completed, domainScores: stats.domainScores });
  }

  // KPI: Today %
  var todayData = days[0];
  document.getElementById('mk-today').textContent = todayData.pct + '%';
  document.getElementById('mk-today').style.color = todayData.pct >= 80 ? 'var(--green)' : todayData.pct >= 50 ? 'var(--gold)' : 'var(--red)';

  // KPI: 7-day avg
  var last7 = days.slice(0, 7);
  var avg7 = last7.length ? Math.round(last7.reduce(function(s,d) { return s + d.pct; }, 0) / last7.length) : 0;
  document.getElementById('mk-week').textContent = avg7 + '%';
  document.getElementById('mk-week').style.color = avg7 >= 80 ? 'var(--green)' : avg7 >= 50 ? 'var(--gold)' : 'var(--red)';

  // KPI: Streak (consecutive days >= 80%)
  var streak = 0;
  for (var s = 0; s < days.length; s++) {
if (days[s].pct >= 80) streak++;
else break;
  }
  document.getElementById('mk-streak').textContent = streak;
  document.getElementById('mk-streak').style.color = streak >= 7 ? 'var(--green)' : streak >= 3 ? 'var(--gold)' : 'var(--text)';

  // KPI: Best & Weakest domain (30-day)
  var domTotals = {};
  var domCount = 0;
  Object.keys(MASTERY_DOMAINS).forEach(function(dk) { domTotals[dk] = 0; });
  var last30 = days.slice(0, 30);
  last30.forEach(function(day) {
if (day.completed > 0) {
  domCount++;
  Object.keys(day.domainScores).forEach(function(dk) { domTotals[dk] += day.domainScores[dk]; });
}
  });
  var bestDom = 'A', weakDom = 'A', bestVal = -1, weakVal = 999;
  Object.keys(domTotals).forEach(function(dk) {
if (domTotals[dk] > bestVal) { bestVal = domTotals[dk]; bestDom = dk; }
if (domTotals[dk] < weakVal) { weakVal = domTotals[dk]; weakDom = dk; }
  });
  document.getElementById('mk-best').textContent = bestDom;
  document.getElementById('mk-best').style.color = MASTERY_DOMAINS[bestDom].color;
  document.getElementById('mk-weak').textContent = weakDom;
  document.getElementById('mk-weak').style.color = 'var(--red)';

  // 7-day bar chart
  var chartHtml = '';
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  for (var c = 6; c >= 0; c--) {
var day = last7[c];
var barH = Math.max(2, day.pct * 1.4);
var barColor = day.pct >= 80 ? 'var(--green)' : day.pct >= 50 ? 'var(--gold)' : day.pct > 0 ? 'var(--red)' : 'var(--bg3)';
var dd = new Date(day.date);
chartHtml += '<div class="ra-week-col">';
chartHtml += '<div class="ra-week-pct" style="color:' + barColor + '">' + day.pct + '%</div>';
chartHtml += '<div class="ra-week-bar" style="height:' + barH + 'px;background:' + barColor + '"></div>';
chartHtml += '<div class="ra-week-label">' + dayNames[dd.getDay()] + '</div>';
chartHtml += '</div>';
  }
  document.getElementById('mastery-week-chart').innerHTML = chartHtml;

  // Domain breakdown (30-day avg)
  var domBarsHtml = '';
  Object.keys(MASTERY_DOMAINS).forEach(function(dk) {
var dom = MASTERY_DOMAINS[dk];
var avgPct = domCount > 0 ? Math.round(domTotals[dk] / domCount / 5 * 100) : 0;
domBarsHtml += '<div class="ra-month-row">';
domBarsHtml += '<div style="font-family:var(--font-mono);font-size:11px;color:' + dom.color + '">' + dk + '. ' + dom.name.split(' ')[0].toUpperCase() + '</div>';
domBarsHtml += '<div class="ra-month-bar-wrap"><div class="ra-month-bar" style="width:' + avgPct + '%;background:' + dom.color + '"></div></div>';
domBarsHtml += '<div class="ra-month-pct" style="color:' + dom.color + '">' + avgPct + '%</div>';
domBarsHtml += '<div></div>';
domBarsHtml += '</div>';
  });
  document.getElementById('mastery-domain-bars').innerHTML = domBarsHtml;

  // 90-day heat map
  var hmHtml = '';
  for (var h = 89; h >= 0; h--) {
var day = days[h];
var bg = 'var(--bg3)';
if (day.pct >= 90) bg = 'var(--green)';
else if (day.pct >= 70) bg = 'rgba(0,229,160,0.7)';
else if (day.pct >= 50) bg = 'rgba(0,229,160,0.4)';
else if (day.pct > 0) bg = 'rgba(0,229,160,0.2)';
var dd = new Date(day.date);
hmHtml += '<span style="width:14px;height:14px;border-radius:2px;display:inline-block;background:' + bg + '" title="' + day.date + ' — ' + day.pct + '%"></span>';
  }
  document.getElementById('mastery-heatmap').innerHTML = hmHtml;
}

// ══════════════════════════════════════
// MASTERY: MONTHLY SCORECARD
// ══════════════════════════════════════

function renderMasteryMonthly() {
  var monthEl = document.getElementById('masteryMonth');
  if (!monthEl.value) monthEl.value = getEffectiveToday().slice(0, 7);
  var month = monthEl.value;
  var data = getMasteryMonthly(month);
  var container = document.getElementById('mastery-monthly-container');

  var html = '';

  // Daily score
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">DAILY MASTERY SCORE</div>';
  html += '<div class="ra-kpi-grid" style="grid-template-columns:repeat(3,1fr)">';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:var(--cyan)">' + (data.daily_score || 0) + '</div><div class="ra-kpi-label">ITEMS COMPLETED</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val">' + (data.daily_possible || 750) + '</div><div class="ra-kpi-label">POSSIBLE</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:' + ((data.daily_pct || 0) >= 80 ? 'var(--green)' : 'var(--gold)') + '">' + (data.daily_pct || 0) + '%</div><div class="ra-kpi-label">PERCENTAGE</div></div>';
  html += '</div></div>';

  // Weekly score
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">WEEKLY MASTERY SCORE</div>';
  html += '<div class="ra-kpi-grid" style="grid-template-columns:repeat(3,1fr)">';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:var(--cyan)">' + (data.weekly_score || 0) + '</div><div class="ra-kpi-label">ITEMS COMPLETED</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val">' + (data.weekly_possible || 28) + '</div><div class="ra-kpi-label">POSSIBLE</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:' + ((data.weekly_pct || 0) >= 85 ? 'var(--green)' : 'var(--gold)') + '">' + (data.weekly_pct || 0) + '%</div><div class="ra-kpi-label">PERCENTAGE</div></div>';
  html += '</div></div>';

  // Domain breakdown
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">DOMAIN BREAKDOWN</div>';
  var db = data.domain_breakdown || {};
  Object.keys(MASTERY_DOMAINS).forEach(function(dk) {
var dom = MASTERY_DOMAINS[dk];
var pct = db[dk] || 0;
html += '<div class="ra-month-row">';
html += '<div style="font-family:var(--font-mono);font-size:11px;color:' + dom.color + '">' + dk + '. ' + dom.name.split('&')[0].trim().toUpperCase() + '</div>';
html += '<div class="ra-month-bar-wrap"><div class="ra-month-bar" style="width:' + pct + '%;background:' + dom.color + '"></div></div>';
html += '<div class="ra-month-pct" style="color:' + dom.color + '">' + pct + '%</div>';
html += '<div></div></div>';
  });
  html += '</div>';

  // Prediction accuracy
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">PREDICTION ACCURACY</div>';
  html += '<div class="ra-kpi-grid" style="grid-template-columns:repeat(3,1fr)">';
  html += '<div class="ra-kpi"><div class="ra-kpi-val">' + (data.prediction_total || 0) + '</div><div class="ra-kpi-label">TOTAL PREDICTIONS</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val">' + (data.prediction_correct || 0) + '</div><div class="ra-kpi-label">CORRECT</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:var(--cyan)">' + (data.prediction_pct || 0) + '%</div><div class="ra-kpi-label">ACCURACY</div></div>';
  html += '</div>';
  html += '<div class="form-group" style="margin-top:12px"><label class="form-label" style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);display:block;margin-bottom:6px">BIGGEST BLIND SPOT</label>';
  html += '<input type="text" class="form-input" value="' + ((data.prediction_blind_spot || '').replace(/"/g, '&quot;')) + '" oninput="saveMasteryMonthlyField(\'' + month + '\',\'prediction_blind_spot\',this.value)" placeholder="What pattern do you consistently miss?"></div>';
  html += '</div>';

  // Qualitative fields
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">TOP 3 WINS</div>';
  for (var w = 0; w < 3; w++) {
var wins = data.top_wins || [];
html += '<input type="text" class="form-input" style="margin-bottom:8px" value="' + ((wins[w] || '').replace(/"/g, '&quot;')) + '" oninput="saveMasteryMonthlyWin(\'' + month + '\',' + w + ',this.value)" placeholder="Win ' + (w + 1) + '...">';
  }
  html += '</div>';

  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">TOP 3 AREAS FOR IMPROVEMENT</div>';
  for (var imp = 0; imp < 3; imp++) {
var imps = data.top_improvements || [];
html += '<input type="text" class="form-input" style="margin-bottom:8px" value="' + ((imps[imp] || '').replace(/"/g, '&quot;')) + '" oninput="saveMasteryMonthlyImp(\'' + month + '\',' + imp + ',this.value)" placeholder="Improvement ' + (imp + 1) + '...">';
  }
  html += '</div>';

  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">KEY INSIGHT / PATTERN DISCOVERED</div>';
  html += '<textarea class="form-input" rows="3" oninput="saveMasteryMonthlyField(\'' + month + '\',\'key_insight\',this.value)" placeholder="What pattern did you discover this month?">' + (data.key_insight || '') + '</textarea>';
  html += '</div>';

  container.innerHTML = html;
}

var _masteryMonthTimer = null;
function saveMasteryMonthlyField(month, field, value) {
  if (isMonthLocked(month)) { showLockWarning(); return; }
  var data = getMasteryMonthly(month);
  data[field] = value;
  clearTimeout(_masteryMonthTimer);
  _masteryMonthTimer = setTimeout(function() {
localStorage.setItem('fl_mastery_monthly_' + month, JSON.stringify(data));
syncMasteryMonthly(month, data);
markSaved();
  }, 500);
}

function saveMasteryMonthlyWin(month, idx, value) {
  if (isMonthLocked(month)) { showLockWarning(); return; }
  var data = getMasteryMonthly(month);
  if (!data.top_wins) data.top_wins = ['','',''];
  data.top_wins[idx] = value;
  clearTimeout(_masteryMonthTimer);
  _masteryMonthTimer = setTimeout(function() {
localStorage.setItem('fl_mastery_monthly_' + month, JSON.stringify(data));
syncMasteryMonthly(month, data);
markSaved();
  }, 500);
}

function saveMasteryMonthlyImp(month, idx, value) {
  if (isMonthLocked(month)) { showLockWarning(); return; }
  var data = getMasteryMonthly(month);
  if (!data.top_improvements) data.top_improvements = ['','',''];
  data.top_improvements[idx] = value;
  clearTimeout(_masteryMonthTimer);
  _masteryMonthTimer = setTimeout(function() {
localStorage.setItem('fl_mastery_monthly_' + month, JSON.stringify(data));
syncMasteryMonthly(month, data);
markSaved();
  }, 500);
}

function calculateMonthlyScores() {
  var month = document.getElementById('masteryMonth').value;
  if (!month) return;
  var year = parseInt(month.split('-')[0]);
  var mon = parseInt(month.split('-')[1]) - 1;
  var daysInMonth = new Date(year, mon + 1, 0).getDate();
  var data = getMasteryMonthly(month);

  // Daily scores
  var totalCompleted = 0;
  var domainTotals = {};
  var domainDays = 0;
  var predTotal = 0, predCorrect = 0;
  Object.keys(MASTERY_DOMAINS).forEach(function(dk) { domainTotals[dk] = 0; });

  for (var d = 1; d <= daysInMonth; d++) {
var ds = month + '-' + String(d).padStart(2, '0');
var dayData = getMasteryDaily(ds);
var stats = computeMasteryStats(dayData);
totalCompleted += stats.completed;
if (stats.completed > 0) {
  domainDays++;
  Object.keys(stats.domainScores).forEach(function(dk) { domainTotals[dk] += stats.domainScores[dk]; });
}
// Prediction accuracy (item 4)
if (dayData[4] && dayData[4].done) {
  predTotal += 3;
  predCorrect += (parseInt(dayData[4].accuracy) || 0);
}
  }

  data.daily_score = totalCompleted;
  data.daily_possible = 25 * daysInMonth;
  data.daily_pct = data.daily_possible > 0 ? Math.round(totalCompleted / data.daily_possible * 100) : 0;

  // Domain breakdown
  var db = {};
  Object.keys(MASTERY_DOMAINS).forEach(function(dk) {
db[dk] = domainDays > 0 ? Math.round(domainTotals[dk] / domainDays / 5 * 100) : 0;
  });
  data.domain_breakdown = db;

  // Weekly scores
  var weeklyCompleted = 0;
  var sundays = [];
  for (var wd = 1; wd <= daysInMonth; wd++) {
var wds = month + '-' + String(wd).padStart(2, '0');
var dt = new Date(wds);
if (dt.getDay() === 0) sundays.push(wds);
  }
  sundays.forEach(function(sun) {
var wData = getMasteryWeekly(sun);
MASTERY_WEEKLY_ITEMS.forEach(function(wi) {
  if (wData[wi.id] && wData[wi.id].done) weeklyCompleted++;
});
  });
  data.weekly_score = weeklyCompleted;
  data.weekly_possible = sundays.length * 7;
  data.weekly_pct = data.weekly_possible > 0 ? Math.round(weeklyCompleted / data.weekly_possible * 100) : 0;

  // Prediction accuracy
  data.prediction_total = predTotal;
  data.prediction_correct = predCorrect;
  data.prediction_pct = predTotal > 0 ? Math.round(predCorrect / predTotal * 100) : 0;

  localStorage.setItem('fl_mastery_monthly_' + month, JSON.stringify(data));
  syncMasteryMonthly(month, data);
  renderMasteryMonthly();
  markSaved();
}

(function updateDashboardMastery() {
  var today = getEffectiveToday();
  var data = getMasteryDaily(today);
  var stats = computeMasteryStats(data);
  var pctEl = document.getElementById('dash-mastery-pct');
  var lblEl = document.getElementById('dash-mastery-lbl');
  var barEl = document.getElementById('dash-mastery-bar');
  if (pctEl) pctEl.textContent = stats.pct + '%';
  if (pctEl) pctEl.style.color = stats.pct >= 80 ? 'var(--green)' : stats.pct >= 50 ? 'var(--gold)' : stats.pct > 0 ? 'var(--red)' : 'var(--cyan)';
  if (lblEl) lblEl.textContent = stats.pct + '%';
  if (barEl) { barEl.style.width = stats.pct + '%'; barEl.style.background = stats.pct >= 80 ? 'var(--green)' : stats.pct >= 50 ? 'var(--gold)' : 'var(--red)'; }
})();
 
