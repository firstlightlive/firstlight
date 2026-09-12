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
  },
  {
    id: 4,
    name: 'DISCIPLINE',
    start: '2026-07-27',
    end: '2026-09-03',
    // dayEpoch != start. This chapter's numbers CONTINUED from Chapter 03's Jul 19
    // epoch — the streak did not reset at the handover — so Jul 27 entered at Day 9
    // and the chapter closed on Day 47. Anything rendering a day number for an
    // archived row reads dayEpoch, never start, or every row here shifts by eight.
    dayEpoch: '2026-07-19',
    days: 39,
    rule: 'ANY WORKOUT ANCHORS THE DAY · 5 RITUALS',
    stakePerDay: 0,
    escalations: 'NONE — PENANCE IS DISTANCE',
    status: 'COMPLETE',
    closingNote: 'Thirty-nine days, Day 9 to Day 47, on the covenant that replaced money with distance. It did not end by choice: a nine-day fever (Sep 4–12) took it to zero. The chapter had only one size of day — all of it or none — so when the body broke, the whole system went with it. That is the lesson RETURN was built on.'
  }
];

// Every break in the record, oldest first. A break ends a chapter and resets the
// day number — it is the ONLY thing that does. Chapter handovers do not.
window.FL_BREAKS = [
  {
    date: '2026-06-09',
    reason: 'Missed daily run',
    stakePaid: 5000,
    acknowledged: true,
    graceDay: '2026-06-10',
    closed: 'CH01 FOUNDATION'
  },
  {
    date: '2026-09-04',
    through: '2026-09-12',
    days: 9,
    reason: 'Fever — nine days, no training',
    stakePaid: 0,
    acknowledged: true,
    closed: 'CH04 DISCIPLINE'
  }
];
// Back-compat: the most recent break.
window.FL_BREAK = window.FL_BREAKS[window.FL_BREAKS.length - 1];

window.FL_CURRENT_CHAPTER = {
  id: 5,
  name: 'RETURN',
  // ONE chapter, ONE epoch: start === dayEpoch. Chapter 04 ended at the fever
  // (Sep 3) and this chapter opened on the other side of it, so no chapter has to
  // hold two day-counter runs. Must stay equal to FL_DEFAULTS.STREAK_START
  // (app.js) and DAY_EPOCH (supabase/functions/firstlight-sync/index.ts).
  start: '2026-09-13',
  dayEpoch: '2026-09-13',
  rule: 'ANY WORKOUT ANCHORS THE DAY · 5 RITUALS · 3 DAY MODES',
  stakePerDay: 0,
  escalations: 'NONE — PENANCE IS DISTANCE',
  status: 'ACTIVE',
  penance: 'THE PUNISHMENT CYCLE — km, not ₹',
  rituals: [
    'Wake before 4:00 AM (watch-tracked) — miss = 30 km cycle',
    'Meditation at 3:45 AM (Brahma Muhurta) — miss = 30 km cycle',
    'Workout, daily — miss = 100 km cycle',
    'Journal, daily — miss = 30 km cycle',
    'Sleep 6.5 hours — miss = 30 km cycle'
  ],
  // Ramp back from the fever. The wake steps in, the lights-out steps with it;
  // Study 1+2 absorbs the whole cut so no ritual is what gets dropped.
  ramp: [
    { week: 1, from: '2026-09-13', to: '2026-09-19', wake: '4:30 AM', lightsOut: '9:45 PM' },
    { week: 2, from: '2026-09-20', to: '2026-09-26', wake: '4:00 AM', lightsOut: '9:15 PM' },
    { week: 3, from: '2026-09-27', to: null,         wake: '3:30 AM', lightsOut: '8:45 PM' }
  ],
  prohibitions: [
    'Masturbation / porn — 100 km cycle',
    'Solid food at night — 30 km walk',
    'Phone in any room — 50 km cycle',
    'Daytime sleep (4 AM – 5 PM) — 30 km cycle'
  ],
  exemption: 'HOSPITALIZATION ONLY',
  // What this chapter adds over DISCIPLINE: the day has a FLOOR. Chapter 04 had
  // one size of day and shattered when the body failed; a smaller day here still
  // holds the streak and carries no penance.
  dayModes: [
    'FULL — the whole protocol',
    'KEYSTONE — the tier-1 items only (late wake, travel, heavy load)',
    'ANCHOR — the 5 Covenant items only (ill, wrecked, broken sleep)'
  ],
  notes: 'No money this chapter. Every miss and every violation is paid in DISTANCE — the Punishment Cycle, logged in discipline.html. Any workout anchors the day; the 5 rituals and the prohibitions carry their own km. A KEYSTONE or ANCHOR day is a kept day: it holds the streak and carries no penance — the only failed day is an unlogged one. Unlogged by 11:59 PM IST = every punishment applies automatically. Only exemption: hospitalization.'
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
