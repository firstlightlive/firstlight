// website/js/chapters.js
// FROZEN HISTORICAL RECORD — DO NOT EDIT COMPLETED CHAPTERS
// This file is the single source of truth for closed Chapters.
// When a Chapter closes, append a new entry. Never mutate existing ones.
// Used by streak.html (monument card), index.html (lifetime line), accountability.html (history).

window.FL_CHAPTERS = [
  {
    id: 1,
    name: 'FOUNDATION',
    start: '2026-02-10',
    end: '2026-06-08',
    days: 110,
    rule: '5KM RUN BEFORE 6 AM IST',
    stakePerDay: 5000,
    escalations: 'FULL',
    status: 'COMPLETE',
    closingNote: 'The first 110 days. No end date set. The body adapted. The system stood.'
  },
  {
    id: 2,
    name: 'ENDURANCE',
    start: '2026-06-20',
    end: '2026-07-18',
    days: 29,
    rule: '5KM ANY MOTION DAILY',
    stakePerDay: 1500,
    escalations: 'FLAT — NO ESCALATION',
    status: 'COMPLETE',
    closingNote: 'Any motion, every day — walk, run, cycle, swim, or a sweat session. The chapter that kept the streak alive through injury and dead sensors, then handed off to the morning run.'
  },
  {
    id: 3,
    name: 'FIRST LIGHT',
    start: '2026-07-19',
    end: '2026-07-26',
    days: 8,
    rule: 'ONE FROM THE MENU · AIM BEFORE 6AM',
    stakePerDay: 1500,
    escalations: 'FLAT — NO ESCALATION',
    status: 'COMPLETE',
    closingNote: 'Eight days chasing the 6 AM mark. One miss (Jul 25), paid. Short, but it set the anchor the day counter still runs from — the streak never reset when DISCIPLINE took over on Jul 27.'
  }
];

window.FL_BREAK = {
  date: '2026-06-09',
  reason: 'Missed daily run',
  stakePaid: 5000,
  acknowledged: true,
  graceDay: '2026-06-10'
};

window.FL_CURRENT_CHAPTER = {
  id: 4,
  name: 'DISCIPLINE',
  start: '2026-07-27',
  // dayEpoch != start. The chapter's IDENTITY began Jul 27. The DAY NUMBER was
  // reset by the fever break (Sep 4-12, 2026 — nine days, no training): Day 1 =
  // Sat 13 Sep 2026. Chapter rules, stakes and closed history are unchanged.
  // Must stay equal to FL_DEFAULTS.STREAK_START (app.js) and DAY_EPOCH (the edge
  // function). Anything rendering a day number reads dayEpoch — never start.
  dayEpoch: '2026-09-13',
  // The chapter's day-counter RUNS, oldest first. A break resets the day NUMBER
  // but not the chapter, so Chapter 04 has two runs. Any archived row is numbered
  // against the run whose date range contains it — that is how rows published
  // before the fever keep the day numbers they were published with. `dayEpoch`
  // above is always the LIVE run's epoch and must equal the last entry here.
  runs: [
    // Jul 27 entered the counter at Day 9 (it continued from Chapter 03's Jul 19
    // epoch — the streak did not reset at the handover) and reached Day 47 on Sep 3.
    { from: '2026-07-27', to: '2026-09-03', epoch: '2026-07-19' },
    // Fever break Sep 4–12: nine days, no training. Counter restarted at Day 1.
    { from: '2026-09-13', to: null,         epoch: '2026-09-13' }
  ],
  rule: 'ANY WORKOUT ANCHORS THE DAY · 5 RITUALS',
  stakePerDay: 0,
  escalations: 'NONE — PENANCE IS DISTANCE',
  status: 'ACTIVE',
  penance: 'THE PUNISHMENT CYCLE — km, not ₹',
  rituals: [
    'Wake before 4:00 AM (watch-tracked) — miss = 30 km cycle',
    'Meditation at 3:40 AM — miss = 30 km cycle',
    'Workout, daily — miss = 100 km cycle',
    'Journal, daily — miss = 30 km cycle',
    'Sleep 5.5 hours — miss = 30 km cycle'
  ],
  prohibitions: [
    'Masturbation / porn — 100 km cycle',
    'Solid food at night — 30 km walk',
    'Phone in any room — 50 km cycle',
    'Daytime sleep (4 AM – 5 PM) — 30 km cycle'
  ],
  exemption: 'HOSPITALIZATION ONLY',
  notes: 'No money this chapter. Every miss and every violation is paid in DISTANCE — the Punishment Cycle, logged in discipline.html. Any workout anchors the day; the 5 rituals and the prohibitions carry their own km. Unlogged by 11:59 PM IST = every punishment applies automatically. Only exemption: hospitalization.'
};

window.FL_LIFETIME = {
  daysCompleted: function() {
    var sum = 0;
    (window.FL_CHAPTERS || []).forEach(function(c) { sum += (c.days || 0); });
    return sum;
  },
  longestChapter: function() {
    var max = 0;
    (window.FL_CHAPTERS || []).forEach(function(c) { if ((c.days || 0) > max) max = c.days; });
    return max;
  }
};
