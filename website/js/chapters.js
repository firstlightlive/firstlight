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
  id: 2,
  name: 'ENDURANCE',
  start: '2026-06-20',
  rule: '5KM ANY MOTION DAILY',
  stakePerDay: 1500,
  escalations: 'FLAT — NO ESCALATION',
  status: 'ACTIVE',
  charity: { name: 'Akshaya Patra', upi: 'donate@akshayapatra' },
  menu: [
    '5 km walk (any pace)',
    '5 km run',
    '10 km cycle',
    '1 km swim',
    '30 min HR-elevated session (boxing / Zumba / gym / yoga)'
  ],
  exemption: 'HOSPITALIZATION ONLY',
  notes: 'Move every day — one item from the menu. Miss = ₹1,500 to Akshaya Patra (1 child fed for a full academic year), receipt published. No exemptions except hospitalization. Streak measures consecutive days of honesty (activity logged OR payment made).'
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
