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
 name: 'REBUILD',
 start: '2026-06-13',
 rule: '5KM RUN BEFORE 6:00 AM LOCAL',
 stakePerDay: 15000,
 escalations: 'NO BREAK CLAUSE',
 status: 'ACTIVE',
 notes: 'New rules from Chapter 02 onwards: flat stake, 5 km run before 6:00 AM local, 100 km weekly goal, miss = pay & continue (no reset).'
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
