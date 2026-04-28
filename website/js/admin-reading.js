// ═══════════════════════════════════════════
// FIRST LIGHT — READING SYSTEM
// Morning Rule (1 of 25 per day) + Streak
// ═══════════════════════════════════════════

// ── 25 DAILY RULES — Cultural Wisdom Cycle ──
var DAILY_RULES = [
  {
    n: 1,
    title: 'THE PAUSE',
    origin: 'Japan',
    body: '<b>Do this:</b><br>Before you speak — breathe once.<br>Before you react — pause.<br>Before you decide — wait.<br><br>In every meeting, every confrontation, every moment of pressure — insert a pause between the stimulus and your response. The pause is where your power lives. Impulsive people give their power away. The man who pauses — chooses.',
    remember: 'The man who speaks after the pause wins the room. Every time.'
  },
  {
    n: 2,
    title: 'INVEST IN PEOPLE BEFORE YOU NEED THEM',
    origin: 'China',
    body: '<b>Do this:</b><br>Every week, reach out to one person you respect — with zero ask.<br>Share something useful. Congratulate them. Offer help.<br><br>Do not wait until you need a favour. The strongest networks are built by giving first, consistently, without keeping score. When you need help one day — and you will — these people will already be in your corner.',
    remember: 'Relationships are your real salary. Invest in them like a bank account.'
  },
  {
    n: 3,
    title: 'DO THE RIGHT THING EVEN WHEN NO ONE IS WATCHING',
    origin: 'Greece',
    body: '<b>Do this:</b><br>When no one is looking — be the same person you are in public.<br>Keep your promises when enforcement is zero.<br>Do the hard thing when the easy thing has no consequence.<br><br>Integrity is not a performance. It is who you are when the lights are off. Your character is defined in the moments no one sees.',
    remember: 'Your Bramacharya covenant, your 3:15 AM wake, Iron Covenant — this is exactly this rule.'
  },
  {
    n: 4,
    title: 'FINISH WHAT YOU START',
    origin: 'Germany',
    body: '<b>Do this:</b><br>Do not start new things until old things are done.<br>The project you abandoned is not behind you — it is draining you.<br><br>Every unfinished task is an open loop in your mind. It costs you energy, focus, and self-trust. Close the loops. Finish the work. Then — and only then — begin something new.',
    remember: 'Half-done work is not 50% done. It is 0% done. It is just a drain with no result.'
  },
  {
    n: 5,
    title: 'BECOME SO GOOD THEY CANNOT IGNORE YOU',
    origin: 'Japan',
    body: '<b>Do this:</b><br>Stop asking how to get noticed. Start asking how to get better.<br>Pick one skill. Go deeper than everyone else. Master it completely.<br><br>The world does not reward those who ask for attention. It rewards those who earn it through undeniable competence. Your work should be so good that people have no choice but to acknowledge it.',
    remember: 'Do not look for a better job. Become the person everyone is looking for.'
  },
  {
    n: 6,
    title: 'MAKE EVERY PERSON FEEL THEY MATTER',
    origin: 'New Zealand / Maori',
    body: '<b>Do this:</b><br>When someone speaks to you — put your phone down. Look at them.<br>Use their name. Ask a follow-up question. Remember details.<br><br>In the Maori tradition, every person carries mana — an inherent dignity. When you acknowledge that dignity, you create loyalty that money cannot buy. The smallest act of genuine attention changes people.',
    remember: 'Every person who leaves your presence feeling better about themselves becomes your lifelong supporter.'
  },
  {
    n: 7,
    title: 'EMPTY YOUR MIND BEFORE YOU PERFORM',
    origin: 'Japan',
    body: '<b>Do this:</b><br>Before any important task — presentation, workout, difficult conversation — empty your mind.<br>No rehearsal. No overthinking. No mental chatter.<br><br>The Japanese call it mushin — "no mind." Your best performance comes not from trying harder, but from releasing effort. Trust the preparation. Then let go and flow.',
    remember: 'Stop trying so hard. Start being fully present. That is when your best comes out.'
  },
  {
    n: 8,
    title: 'STOP PUSHING WHEN THINGS ARE NOT FLOWING',
    origin: 'China / Taoist wisdom',
    body: '<b>Do this:</b><br>When a path is blocked — do not smash through it. Step back. Look for the opening.<br>When energy is low — rest. When a decision feels forced — wait.<br><br>Water does not fight rocks. It flows around them — and over time, it wears them down. The Taoist principle of wu wei is not laziness. It is intelligent non-resistance. Work with the current, not against it.',
    remember: 'The hardest path is not always the best path. Working smart matters as much as working hard.'
  },
  {
    n: 9,
    title: 'START HARD CONVERSATIONS WITH A STORY, NOT AN ACCUSATION',
    origin: 'Pacific Islands',
    body: '<b>Do this:</b><br>When you need to address a difficult issue — do not lead with blame.<br>Start with a story. Start with context. Start with understanding.<br><br>In Pacific Island culture, conflicts are resolved through talanoa — open dialogue that begins with sharing, not accusing. When you lead with empathy, the other person\'s walls come down. That is when real resolution happens.',
    remember: 'Conversations that start with blame end in fights. Conversations that start with understanding end in solutions.'
  },
  {
    n: 10,
    title: 'LET YOUR ACTIONS SPEAK LOUDER THAN YOUR WORDS',
    origin: 'Ancient Rome',
    body: '<b>Do this:</b><br>Stop announcing your plans. Stop talking about what you will do.<br>Just do it. Then let others notice.<br><br>The Roman principle of res non verba — deeds, not words — is the foundation of earned respect. The world is full of people who talk. Be the one who does. Your results are your resume. Your consistency is your reputation.',
    remember: 'Your reputation is built by what you do, not what you say. Let the work speak.'
  },
  {
    n: 11,
    title: 'GIVE HONEST FEEDBACK — IT IS A GIFT',
    origin: 'Israel',
    body: '<b>Do this:</b><br>When someone asks for your opinion — give it honestly. Not cruelly. Honestly.<br>Do not soften the truth into meaninglessness. Do not hide behind politeness.<br><br>In Israeli culture, dugri means speaking straight. No wrapping, no sugar-coating. Honest feedback given with care is the greatest gift you can offer someone. It shows you respect them enough to tell the truth.',
    remember: 'The person who tells you the truth is your real friend. Be that person for others.'
  },
  {
    n: 12,
    title: 'ACCEPT THE WORST CASE, THEN ACT',
    origin: 'Japan / Samurai',
    body: '<b>Do this:</b><br>Before any major decision — ask: what is the absolute worst that can happen?<br>Accept it fully. Make peace with it. Then act.<br><br>The samurai practiced death meditation — imagining the worst so vividly that fear lost its grip. When you have already accepted the worst outcome, there is nothing left to fear. You become free to act with full commitment.',
    remember: 'Hesitation is not caution. It is fear in disguise. Accept the outcome. Then move.'
  },
  {
    n: 13,
    title: 'BRING YOUR BEST TO EVERY TASK — NOT JUST THE BIG ONES',
    origin: 'Ancient Greece',
    body: '<b>Do this:</b><br>The way you make your bed. The way you reply to an email. The way you greet a stranger.<br>Bring the same excellence to small tasks that you bring to big ones.<br><br>The Greeks called it arête — excellence as a habit, not an event. If you only show up for the spotlight, you are not disciplined. You are performing. True excellence is consistent, even when the task is small.',
    remember: 'How you do anything is how you do everything.'
  },
  {
    n: 14,
    title: 'ASK FOR HELP — IT IS NOT WEAKNESS',
    origin: 'Finland',
    body: '<b>Do this:</b><br>When you are stuck — say so. When you need support — ask for it.<br>Do not suffer in silence because you think strength means independence.<br><br>In Finnish culture, asking for help is a sign of talkoot — the communal spirit that says we are stronger together. The strongest people are not those who need nothing. They are those who know when to reach out.',
    remember: 'You are very good at giving. You are not as good at receiving. Fix that.'
  },
  {
    n: 15,
    title: 'NEVER EMBARRASS SOMEONE IN PUBLIC',
    origin: 'China',
    body: '<b>Do this:</b><br>If someone makes a mistake — correct them privately.<br>If someone says something wrong — redirect gently.<br>Never humiliate. Never call out. Never make someone lose face in front of others.<br><br>In Chinese culture, mianzi (face) is sacred. The person who protects another\'s dignity earns a loyalty that lasts generations. The person who destroys it creates an enemy for life.',
    remember: 'The people who remember you most are the ones whose dignity you saved.'
  },
  {
    n: 16,
    title: 'LET YOURSELF BE LOVED',
    origin: 'Japan',
    body: '<b>Do this:</b><br>When someone offers kindness — receive it fully. Do not deflect.<br>When someone says something good about you — do not argue. Say thank you.<br>When love comes toward you — let it land.<br><br>You are trained to give. You are trained to serve. But receiving is also a skill. A man who cannot accept love, cannot be fully loved. And a man who cannot be fully loved cannot give his best love back.',
    remember: 'A man who cannot be fully loved. And a man who cannot be fully loved cannot give his best love back.'
  },
  {
    n: 17,
    title: 'USE THE ACHE OF YOUR UNLIVED POTENTIAL AS FUEL',
    origin: 'Portugal / Saudade',
    body: '<b>Do this:</b><br>Feel the gap between who you are and who you could be.<br>Do not numb it. Do not distract from it. Use it.<br><br>The Portuguese call this saudade — a longing for something you have not yet become. That ache is not pain. It is signal. It is your future self calling you forward. Let it pull you out of bed. Let it push you through the workout. Let it fuel the work.',
    remember: 'Your 3:15 AM wake is the sound of that ache turning into action. Every morning you wake before dawn — you are already closing the gap.'
  },
  {
    n: 18,
    title: 'START BEFORE YOU ARE READY',
    origin: 'Japan',
    body: '<b>Do this:</b><br>Stop waiting for the perfect plan. Stop waiting for confidence.<br>Stop waiting for permission. Start now. Start messy. Start scared.<br><br>The Japanese say ichi-go ichi-e — this moment will never come again. If you wait until you are ready, you will wait forever. Readiness is a myth. Action creates readiness. Begin — and the path will reveal itself.',
    remember: 'Done imperfectly today beats perfect never. Begin.'
  },
  {
    n: 19,
    title: 'TRULY LISTEN — MAKE PEOPLE FEEL SEEN',
    origin: 'Africa / Zulu tradition',
    body: '<b>Do this:</b><br>When someone speaks — listen to understand, not to reply.<br>Do not formulate your response while they are still talking.<br>Give them the gift of your full, undivided attention.<br><br>In Zulu culture, the greeting sawubona means "I see you." Not just with eyes — but with full presence. When you truly see someone, they feel it. And a person who feels truly seen will trust you with things they trust no one else with.',
    remember: 'The people who feel truly heard by you will never leave — at work or in life.'
  },
  {
    n: 20,
    title: 'BE ON TIME — EVERY TIME',
    origin: 'Switzerland',
    body: '<b>Do this:</b><br>Arrive five minutes early. Every meeting. Every call. Every commitment.<br>Treat other people\'s time as sacred as your own.<br><br>Punctuality is not about clocks. It is about respect. When you are late, you are saying: my time matters more than yours. When you are early, you are saying: I honour this commitment. It is the simplest discipline — and the one most people fail.',
    remember: 'Punctuality is the easiest way to stand out. It requires zero talent. Just decide.'
  },
  {
    n: 21,
    title: 'ONE PERSON SPEAKS, EVERYONE ELSE LISTENS',
    origin: 'Native American / Lakota',
    body: '<b>Do this:</b><br>In group settings — do not interrupt. Do not talk over.<br>Let one person finish completely before the next begins.<br><br>The Lakota tradition of the talking stick ensures every voice is heard. The person holding the stick speaks. Everyone else listens — truly listens. Not waiting for their turn. Listening. The wisest leaders are those who create space for others to speak.',
    remember: 'The wisest voice in the room is not the loudest. It is the one that listened longest before speaking.'
  },
  {
    n: 22,
    title: 'YOUR DAILY ACTIONS ARE WRITING YOUR FUTURE',
    origin: 'Vikings / Norse',
    body: '<b>Do this:</b><br>Every action you take today is a vote for the person you are becoming.<br>Your morning routine. Your food choices. Your work ethic. Your words.<br><br>The Norse believed in wyrd — that your fate is not predetermined, but woven by your daily actions. Every choice is a thread. Every day is a row. You are weaving your saga right now, in real time. Make it worthy.',
    remember: 'You are not waiting for your life to happen. You are writing it. Today. Every choice.'
  },
  {
    n: 23,
    title: 'DO NOT GO TO EXTREMES — STAY IN THE MIDDLE',
    origin: 'China / Confucius',
    body: '<b>Do this:</b><br>Do not sprint so hard you burn out. Do not rest so much you lose momentum.<br>Find the sustainable middle. The zhongyong — the doctrine of the mean.<br><br>Confucius taught that excellence is not about extremes. It is about balance sustained over time. The person who trains at 80% every single day for years will always beat the person who goes 100% for three weeks and crashes.',
    remember: 'Doing your whole protocol at 80% intensity, every day, forever — beats doing it at 100% for 3 weeks and crashing.'
  },
  {
    n: 24,
    title: 'KNOW EXACTLY WHAT NEEDS YOU TODAY',
    origin: 'Japan / Okinawa / Ikigai',
    body: '<b>Do this:</b><br>Every morning, before you act — ask: what needs me today?<br>Not what do I want. Not what is easy. What needs me.<br><br>In Okinawa, ikigai is the reason you get out of bed. It is not a grand purpose — it is today\'s purpose. The intersection of what you love, what you are good at, what the world needs, and what sustains you. Find today\'s answer. Then go do it.',
    remember: '"I move toward becoming a man a family can be built around." That person is not here yet. But they need you to do the work today.'
  },
  {
    n: 25,
    title: 'YOUR FEAR OF STARTING IS THE REAL ENEMY',
    origin: 'Japan, Israel, Greece / Universal',
    body: '<b>Do this:</b><br>Name the thing you have been avoiding. Say it out loud.<br>Now — do the smallest possible version of it. Today. Right now.<br><br>The resistance you feel is not real. It is a story your mind tells to keep you safe. But safe is not where growth lives. Every great achievement in your life started with one clumsy, imperfect, terrifying first step. The fear never goes away. You just learn to move with it.',
    remember: 'The only thing standing between you and the next version of your life is starting badly. Begin today.'
  }
];

// ── RULE CYCLING LOGIC ──
function getTodayRuleNumber() {
  return ((getDayNumber() - 1) % 25) + 1;
}

// ── RENDER DAILY RULE ──
function renderDailyRule() {
  var container = document.getElementById('daily-rule-container');
  if (!container) return;

  var ruleNum = getTodayRuleNumber();
  var rule = DAILY_RULES[ruleNum - 1];
  var dayNum = getDayNumber();
  var todayStr = getEffectiveToday();
  var readKey = 'fl_daily_rule_read_' + todayStr;
  var alreadyRead = !!localStorage.getItem(readKey);
  var streakData = computeReadingStreak();

  container.innerHTML =
    '<div class="reading-view">' +

      // Header
      '<div class="reading-header">' +
        '<span class="reading-day">DAY ' + dayNum + ' — RULE ' + ruleNum + ' OF 25</span>' +
      '</div>' +

      // Title
      '<h2 class="reading-title">' + rule.title + '</h2>' +

      // Origin
      '<div class="reading-origin">' + rule.origin + '</div>' +

      // Divider
      '<div class="reading-divider"></div>' +

      // Body
      '<div class="reading-body">' + rule.body + '</div>' +

      // Remember box
      '<div class="reading-remember">' +
        '<span class="reading-remember-label">REMEMBER</span>' +
        '<p>' + rule.remember + '</p>' +
      '</div>' +

      // Action button
      '<button class="btn-primary reading-mark-btn' + (alreadyRead ? ' reading-done' : '') + '" ' +
        'onclick="markDailyRuleRead(this)" ' +
        (alreadyRead ? 'disabled' : '') + '>' +
        (alreadyRead ? 'READ TODAY' : 'I HAVE READ THIS') +
      '</button>' +

      // Streak footer
      '<div class="reading-streak">' +
        '<span class="reading-streak-current">' + streakData.current + ' day streak</span>' +
        '<span class="reading-streak-best">Best: ' + streakData.longest + '</span>' +
      '</div>' +

    '</div>';

  // Inject scoped styles if not already present
  if (!document.getElementById('reading-styles')) {
    var style = document.createElement('style');
    style.id = 'reading-styles';
    style.textContent =
      '.reading-view { max-width: 640px; margin: 0 auto; padding: 24px 16px; }' +
      '.reading-header { margin-bottom: 8px; }' +
      '.reading-day { font-size: 11px; letter-spacing: 2px; color: var(--cyan, #00e5ff); font-weight: 600; }' +
      '.reading-title { font-size: 26px; font-weight: 800; color: #fff; margin: 8px 0 4px; line-height: 1.2; letter-spacing: 0.5px; }' +
      '.reading-origin { font-size: 12px; color: var(--gold, #ffd700); letter-spacing: 1.5px; margin-bottom: 16px; font-weight: 500; }' +
      '.reading-divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent); margin: 16px 0; }' +
      '.reading-body { font-size: 15px; line-height: 1.75; color: rgba(255,255,255,0.88); margin-bottom: 24px; }' +
      '.reading-body b { color: var(--cyan, #00e5ff); font-size: 12px; letter-spacing: 1.5px; display: block; margin-bottom: 8px; }' +
      '.reading-remember { border-left: 3px solid var(--gold, #ffd700); background: rgba(255,215,0,0.06); padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 24px; }' +
      '.reading-remember-label { font-size: 10px; letter-spacing: 2px; color: var(--gold, #ffd700); font-weight: 700; display: block; margin-bottom: 6px; }' +
      '.reading-remember p { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.92); margin: 0; font-style: italic; }' +
      '.reading-mark-btn { width: 100%; padding: 14px; font-size: 14px; letter-spacing: 2px; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s; background: var(--green, #00c853); color: #000; }' +
      '.reading-mark-btn:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }' +
      '.reading-mark-btn.reading-done { background: rgba(0,200,83,0.15); color: var(--green, #00c853); border: 1px solid rgba(0,200,83,0.3); cursor: default; }' +
      '.reading-streak { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.06); }' +
      '.reading-streak-current { font-size: 13px; color: var(--cyan, #00e5ff); font-weight: 600; }' +
      '.reading-streak-best { font-size: 12px; color: rgba(255,255,255,0.4); }';
    document.head.appendChild(style);
  }
}

// ── MARK RULE AS READ ──
function markDailyRuleRead(btn) {
  var todayStr = getEffectiveToday();
  var readKey = 'fl_daily_rule_read_' + todayStr;

  // Prevent double-marking
  if (localStorage.getItem(readKey)) return;

  // Save locally
  localStorage.setItem(readKey, '1');
  var ruleNum = getTodayRuleNumber();

  // Visual feedback
  if (btn) {
    btn.textContent = 'READ TODAY';
    btn.classList.add('reading-done');
    btn.disabled = true;
  }
  if (typeof markSaved === 'function') markSaved();

  // Sync to Supabase
  syncReadingLog(todayStr, 'daily_rule', ruleNum);

  // Refresh streak display
  var streakData = computeReadingStreak();
  var currentEl = document.querySelector('.reading-streak-current');
  var bestEl = document.querySelector('.reading-streak-best');
  if (currentEl) currentEl.textContent = streakData.current + ' day streak';
  if (bestEl) bestEl.textContent = 'Best: ' + streakData.longest;
}

// ── SYNC TO SUPABASE (direct fetch — no SB.init dependency) ──
async function syncReadingLog(date, type, ruleNumber) {
  try {
    var sbUrl = FL.SUPABASE_URL || localStorage.getItem('fl_supabase_url') || '';
    var sbKey = FL.SUPABASE_ANON_KEY || localStorage.getItem('fl_supabase_key') || '';
    if (!sbUrl || !sbKey) return;
    // Check if already exists
    var checkResp = await fetch(sbUrl + '/rest/v1/reading_log?date=eq.' + date + '&type=eq.' + type + '&select=id', {
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey }
    });
    var existing = await checkResp.json();
    if (existing && existing.length > 0) return;
    // Insert
    await fetch(sbUrl + '/rest/v1/reading_log', {
      method: 'POST',
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ date: date, type: type, rule_number: ruleNumber, completed: true, completed_at: new Date().toISOString() })
    });
    console.log('[Reading] Synced to Supabase: ' + date);
  } catch (e) {
    console.warn('[Reading] Sync failed:', e);
  }
}

// ── BACKFILL: sync any localStorage reading entries to Supabase ──
function backfillReadingLog() {
  var streakStart = new Date('2026-02-10');
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.startsWith('fl_daily_rule_read_')) {
      var date = key.replace('fl_daily_rule_read_', '');
      if (date.length === 10) {
        var dayNum = Math.floor((new Date(date) - streakStart) / 86400000) + 1;
        var ruleNum = ((dayNum - 1) % 25) + 1;
        syncReadingLog(date, 'daily_rule', ruleNum);
      }
    }
  }
}

// Run backfill on page load (only syncs missing entries, safe to run multiple times)
setTimeout(backfillReadingLog, 3000);

// ── READING STREAK (wrapper) ──
function getReadingStreak() {
  return computeReadingStreak();
}
 
