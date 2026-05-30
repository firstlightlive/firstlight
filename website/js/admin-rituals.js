// ═══════════════════════════════════════════
// FIRST LIGHT — RITUALS
// ═══════════════════════════════════════════

var RITUAL_VERSION = '2026-05-30-v4'; // bump to auto-reset stored defs on next load

var RITUAL_DEFAULTS = {
  morning: [
    // WAKE — ORAL CARE (4:00-4:10)
    { id: 'm_alarm', block: 'WAKE \u2014 ORAL CARE (4:00-4:10)', blockId: 'mblk0', time: '4:00', title: 'Alarm \u2014 Wake immediately', desc: 'Zero negotiation. The alarm is a command, not a suggestion. Feet on cold floor activates cortisol awakening response. No snooze. Ever. 4:00 AM is decided at 8:30 PM the night before.', cat: 'BIOHACK' },
    { id: 'm_tongue_scraper', block: 'WAKE \u2014 ORAL CARE (4:00-4:10)', blockId: 'mblk0', time: '4:01', title: 'Tongue scraper (copper)', desc: 'Removes Ama (toxins). 30 seconds. Before any water or food enters the mouth. Ayurvedic morning detox.', cat: 'AYUR' },
    { id: 'm_oil_pull', block: 'WAKE \u2014 ORAL CARE (4:00-4:10)', blockId: 'mblk0', time: '4:02', title: 'Oil pull (coconut oil)', desc: 'Start swishing immediately before any water. Standing in bathroom. Mouth completely dry. Pulls bacteria, whitens teeth, strengthens gums. 3-4 min.', cat: 'AYUR' },
    { id: 'm_cold_dive', block: 'WAKE \u2014 ORAL CARE (4:00-4:10)', blockId: 'mblk0', time: '4:03', title: 'Cold water dive reflex', desc: 'While still swishing oil. Vagus nerve activated. Full wakefulness. Resets nervous system. BIOHACK.', cat: 'BIOHACK' },
    { id: 'm_spit_oil', block: 'WAKE \u2014 ORAL CARE (4:00-4:10)', blockId: 'mblk0', time: '4:05', title: 'Spit oil pull + rinse', desc: 'Spit into trash, not sink. Rinse mouth with warm water. Oil pulling complete \u2014 bacteria removed, gums strengthened.', cat: 'AYUR' },
    { id: 'm_brush', block: 'WAKE \u2014 ORAL CARE (4:00-4:10)', blockId: 'mblk0', time: '4:06', title: 'Brush teeth', desc: 'After oil pull, not before. Brush thoroughly. Clean slate before fenugreek water enters the system.', cat: 'AYUR' },
    { id: 'm_fenugreek', block: 'WAKE \u2014 ORAL CARE (4:00-4:10)', blockId: 'mblk0', time: '4:07', title: 'Fenugreek water (soaked overnight)', desc: 'Soak 1 tsp methi overnight in copper vessel. Copper ionises water, kills bacteria, thyroid support. Total 250ml.', cat: 'AYUR' },
    { id: 'm_chyawanprash', block: 'WAKE \u2014 ORAL CARE (4:00-4:10)', blockId: 'mblk0', time: '4:08', title: 'Chyawanprash (1 tsp)', desc: '2-3 min after fenugreek. Empty stomach. Amla Vit C absorbed by 4:27 AM when collagen arrives \u2014 direct co-factor for synthesis. Immunity. Ojas.', cat: 'AYUR' },
    // BRAHMA MUHURTA (4:10-4:28) — compressed for 4 AM schedule
    { id: 'm_marma', block: 'BRAHMA MUHURTA (4:10-4:28)', blockId: 'mblk1', time: '4:10', title: 'Marma point self-massage', desc: 'Vagbhata. Ajna 30s, Hridaya 30s, Nabhi 30s clockwise. 2 min. Full body energy activated. Pressure points.', cat: 'AYUR' },
    { id: 'm_pranayama', block: 'BRAHMA MUHURTA (4:10-4:28)', blockId: 'mblk1', time: '4:12', title: 'Pranayama (Nadi Shodhana)', desc: 'Nadi Shodhana or Kapalabhati. Open air rooftop. Phone away. 5 min compressed. SACRED.', cat: 'SACRED' },
    { id: 'm_japa', block: 'BRAHMA MUHURTA (4:10-4:28)', blockId: 'mblk1', time: '4:17', title: 'Japa (108 beads)', desc: 'Mala or silent. Phone away. Full presence. Do not suppress. Pure witnessing. Japa = concentration. This = equanimity.', cat: 'SACRED' },
    { id: 'm_thai_meditation', block: 'BRAHMA MUHURTA (4:10-4:28)', blockId: 'mblk1', time: '4:23', title: 'Thai forest meditation', desc: 'Sit still after Japa. Close eyes. A sound arises \u2014 note: sound. A thought \u2014 thinking. A sensation \u2014 sensation. Do not follow. Do not suppress. 3 min open awareness.', cat: 'MIND' },
    { id: 'm_earthing', block: 'BRAHMA MUHURTA (4:10-4:28)', blockId: 'mblk1', time: '4:25', title: 'Earthing \u2014 bare feet on ground (SUNDAY ONLY)', desc: 'SUNDAY ONLY \u2014 not possible on weekdays. Eyes open to sky. 3 things spoken aloud. Step onto grass or earth. Bare skin contact. Morning gratitude is an opening, not a review.', cat: 'BIOHACK', active: false },
    { id: 'm_brahmacharya', block: 'BRAHMA MUHURTA (4:10-4:28)', blockId: 'mblk1', time: '4:26', title: 'Brahmacharya mala (intention set)', desc: '', cat: 'SACRED' },
    { id: 'm_collagen', block: 'BRAHMA MUHURTA (4:10-4:28)', blockId: 'mblk1', time: '4:27', title: 'Collagen peptides + lemon water', desc: 'Rooftop, empty stomach. Amino acids peak ~5:20 AM = mid-run. Vitamin C is the direct co-factor for collagen synthesis. 30 min clear gap before food.', cat: 'FUEL' },
    // PRE-RUN — SUPPLEMENTS (4:28-4:35)
    { id: 'm_carnitine_creatine', block: 'PRE-RUN \u2014 SUPPLEMENTS (4:28-4:35)', blockId: 'mblk2', time: '4:28', title: 'L-Carnitine + Creatine', desc: 'Drop tablet, dissolve 60 sec, add Creatine 5g, stir. Rinse glass. L-Carnitine 2000mg activates in 5-8 min. Run at 4:35 AM. FUEL.', cat: 'BIOHACK' },
    { id: 'm_ikigai', block: 'PRE-RUN \u2014 SUPPLEMENTS (4:28-4:35)', blockId: 'mblk2', time: '4:30', title: 'Ikigai spoken aloud', desc: 'I am not trying to win. I am refusing to stop. Said with conviction. Every single morning.', cat: 'MIND' },
    { id: 'm_sattu', block: 'PRE-RUN \u2014 SUPPLEMENTS (4:28-4:35)', blockId: 'mblk2', time: '4:31', title: 'Sattu drink', desc: '100g Sattu + 350ml water + half lemon + pinch of salt. Takes under a minute. Drink steadily while driving.', cat: 'FUEL' },
    { id: 'm_box_breathing', block: 'PRE-RUN \u2014 SUPPLEMENTS (4:28-4:35)', blockId: 'mblk2', time: '4:33', title: 'Box breathing (4-4-4-4)', desc: 'Alert neutrality. Engine on, car stationary. 5 rounds. Then go. Navy SEAL protocol.', cat: 'MIND' },
    // POST GYM — RECOVERY (7:00-7:40)
    { id: 'm_postworkout_meal', block: 'POST GYM \u2014 RECOVERY (7:00-7:40)', blockId: 'mblk4', time: '7:05', title: 'Post-workout meal FIRST (protein + carbs)', desc: 'EAT BEFORE HOT SHOWER. 20-40g protein + fast carbs within 20-30 min of gym end = anabolic window. Eggs / whey / paneer + banana or rice. mTOR pathway is open NOW. Hot shower after eating = vasodilation delivers nutrients to muscles. Science: PMC11780495 (2024).', cat: 'FUEL' },
    { id: 'm_hot_shower', block: 'POST GYM \u2014 RECOVERY (7:00-7:40)', blockId: 'mblk4', time: '7:20', title: 'Hot shower (38-42\u00b0C, 10 min)', desc: 'AFTER cool-down + meal. 38-42°C for 10 min. Vasodilation: blood vessels expand, nutrients delivered to worked muscles. Growth hormone mild pulse. Cortisol drops. Does NOT suppress mTOR (unlike cold after gym). Science: Scandinavian J Medicine 2024.', cat: 'SKIN' },
    { id: 'm_moisturiser', block: 'POST GYM \u2014 RECOVERY (7:00-7:40)', blockId: 'mblk4', time: '7:30', title: 'Moisturiser + sunscreen', desc: '', cat: 'SKIN' },
    { id: 'm_free_writing', block: 'POST GYM \u2014 RECOVERY (7:00-7:40)', blockId: 'mblk4', time: '7:35', title: 'Free writing (commute/office)', desc: '', cat: 'MIND' },
    // AT OFFICE — BREAKFAST (7:45-8:10)
    { id: 'm_ginger_shot', block: 'AT OFFICE \u2014 BREAKFAST (7:45-8:10)', blockId: 'mblk6', time: '7:45', title: 'Ginger lime shot', desc: '', cat: 'AYUR' },
    { id: 'm_oats_paneer', block: 'AT OFFICE \u2014 BREAKFAST (7:45-8:10)', blockId: 'mblk6', time: '7:50', title: 'Oats + paneer breakfast', desc: 'Post-gym meal at 7:05 already covers nutrition. This is removed from daily tracking.', cat: 'FUEL', active: false },
    { id: 'm_shata_pada', block: 'AT OFFICE \u2014 BREAKFAST (7:45-8:10)', blockId: 'mblk6', time: '7:58', title: 'Shata Pada (100 steps after meal)', desc: '', cat: 'AYUR' },
    { id: 'm_sunlight', block: 'AT OFFICE \u2014 BREAKFAST (7:45-8:10)', blockId: 'mblk6', time: '8:02', title: 'Sunlight exposure (5 min)', desc: '', cat: 'BIOHACK' },
    { id: 'm_vitamins', block: 'AT OFFICE \u2014 BREAKFAST (7:45-8:10)', blockId: 'mblk6', time: '8:04', title: 'Vitamins (D3+K2, Omega-3)', desc: '', cat: 'BIOHACK' },
    { id: 'm_cdp_choline', block: 'AT OFFICE \u2014 BREAKFAST (7:45-8:10)', blockId: 'mblk6', time: '8:06', title: 'CDP-Choline', desc: 'Not required daily \u2014 disabled from routine tracking. Re-enable manually on days of use.', cat: 'BIOHACK', active: false },
    { id: 'm_review_blocks', block: 'AT OFFICE \u2014 BREAKFAST (7:45-8:10)', blockId: 'mblk6', time: '8:10', title: 'Review time blocks for the day', desc: '', cat: 'MIND' }
  ],
  evening: [
    // EVENING — 7 PM (work ends 7 PM hard stop)
    { id: 'e_laptop_close', block: 'EVENING \u2014 7 PM SHUTDOWN', blockId: 'eblk0', time: '7:00', title: 'Laptop close \u2014 HARD STOP', desc: 'Work ends at 7 PM. Non-negotiable. Treated like the morning run \u2014 no exceptions, no "just 5 more minutes". 8:30 PM sleep is decided here.', cat: 'SLEEP' },
    { id: 'e_internet_off', block: 'EVENING \u2014 7 PM SHUTDOWN', blockId: 'eblk0', time: '7:02', title: 'Internet OFF', desc: '', cat: 'SLEEP' },
    { id: 'e_sprout_mix', block: 'EVENING \u2014 7 PM SHUTDOWN', blockId: 'eblk0', time: '7:05', title: 'Sprout mix (moong/chana)', desc: 'Last food of the day. 1.5h before sleep. Light meal = stomach clear by 8:30 PM. Empty stomach sleep = full recovery mode. Growth hormone maximised. Evening Covenant begins.', cat: 'FUEL' },
    { id: 'e_shata_pada', block: 'EVENING \u2014 7 PM SHUTDOWN', blockId: 'eblk0', time: '7:10', title: 'Shata Pada (100 steps)', desc: '', cat: 'AYUR' },
    // NIGHT PREP (7:12-7:22)
    { id: 'e_tomorrow_plan', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:12', title: 'Tomorrow planning (time blocks)', desc: 'Write tomorrow\'s plan NOW so 4 AM wake has zero decision-making. Pre-decide everything.', cat: 'MIND' },
    { id: 'e_copper_vessel', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:14', title: 'Fill copper vessel + soak methi', desc: '', cat: 'AYUR' },
    { id: 'e_gym_bag', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:15', title: 'Gym bag packed', desc: '', cat: 'MOVE' },
    { id: 'e_clothes', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:16', title: 'Clothes laid out (run + gym kit)', desc: '', cat: 'MIND' },
    { id: 'e_supplements_out', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:17', title: 'Supplements laid out', desc: '', cat: 'BIOHACK' },
    { id: 'e_keys', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:18', title: 'Keys + essentials ready', desc: '', cat: 'MIND' },
    { id: 'e_hot_water', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:19', title: 'Hot water ready (thermos)', desc: '', cat: 'AYUR' },
    { id: 'e_loban', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:20', title: 'Loban (frankincense) lit', desc: '', cat: 'SACRED' },
    // SKIN + OIL RITUALS (7:25-7:48)
    { id: 'e_cold_dive', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:25', title: 'Cold water dive reflex', desc: 'Evening dose. Resets nervous system after the day. Vagus nerve activation. Face submerge 30s.', cat: 'BIOHACK' },
    { id: 'e_coconut_oil', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:32', title: 'Coconut oil (face + body)', desc: '', cat: 'SKIN' },
    { id: 'e_nasya', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:35', title: 'Nasya oil (2 drops per nostril)', desc: 'Lubricates brain pathway. Improves sleep quality. Every night. 30 days = visible difference.', cat: 'AYUR' },
    { id: 'e_mula_bandha', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:40', title: 'Mula Bandha practice', desc: 'Root lock. Engage 10s, release, 10 reps. Ayurvedic energy conservation. Upward movement of Ojas.', cat: 'SACRED' },
    { id: 'e_abhyanga', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:42', title: 'Abhyanga (self oil massage)', desc: '', cat: 'AYUR' },
    { id: 'e_shilajit', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:45', title: 'Shilajit (purified resin)', desc: 'Evening dose \u2014 40 min after sprout mix. OR take in morning (pre-run fasted = also valid). Overnight recovery, testosterone, mitochondrial repair. Warm water, alone.', cat: 'AYUR' },
    { id: 'e_olive_oil_navel', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:47', title: 'Olive oil on navel', desc: '', cat: 'AYUR' },
    // WIND DOWN + SLEEP (7:50-8:05)
    { id: 'e_mag_triphala', block: 'WIND DOWN + SLEEP (7:50-8:05)', blockId: 'eblk3', time: '7:50', title: 'Magnesium + Triphala + Glycine', desc: 'Magnesium glycinate 400mg + Triphala + Glycine 3g. All in warm water. Glycine lowers core body temperature = sleep onset trigger. Completes collagen cycle.', cat: 'BIOHACK' },
    { id: 'e_warm_milk', block: 'WIND DOWN + SLEEP (7:50-8:05)', blockId: 'eblk3', time: '7:52', title: 'Warm milk + Ashwagandha', desc: '400-500ml + turmeric + black pepper + Ashwagandha 600mg + Jatamansi + 2 tbsp cottage cheese. Sip slowly. Casein protein overnight = muscle repair.', cat: 'AYUR' },
    // DAY CLOSE (8:05)
    { id: 'e_night_prep_confirm', block: 'DAY CLOSE (8:05)', blockId: 'eblk4', time: '8:05', title: 'Night prep confirmed \u2713', desc: '', cat: 'MIND' },
    // REFLECTION + SLEEP (8:05-8:30)
    { id: 'e_roman_examen', block: 'REFLECTION + SLEEP (8:05-8:30)', blockId: 'eblk5', time: '8:05', title: 'Roman Examen (review of conscience)', desc: '3 min written. What aligned. What did not. What changes tomorrow. Final line: Tomorrow I will improve [one specific micro-thing] by 1%. Kaizen. 1% daily = 37x better in one year.', cat: 'SACRED' },
    { id: 'e_3_wins', block: 'REFLECTION + SLEEP (8:05-8:30)', blockId: 'eblk5', time: '8:08', title: '3 Wins of the day', desc: '3 wins written + "This happened because..." Internal locus of control. Harvard: strongest longevity predictor.', cat: 'MIND' },
    { id: 'e_reverse_replay', block: 'REFLECTION + SLEEP (8:05-8:30)', blockId: 'eblk5', time: '8:12', title: 'Reverse day replay (end to start)', desc: '', cat: 'MIND' },
    { id: 'e_gratitude', block: 'REFLECTION + SLEEP (8:05-8:30)', blockId: 'eblk5', time: '8:15', title: 'Gratitude (3 things)', desc: '', cat: 'SACRED' },
    { id: 'e_trataka', block: 'REFLECTION + SLEEP (8:05-8:30)', blockId: 'eblk5', time: '8:18', title: 'Trataka (candle gazing)', desc: 'Fixed gaze on flame. 5 min. Sharpens concentration, improves eyesight, calms mind. SACRED.', cat: 'SACRED' },
    { id: 'e_hooponopono', block: 'REFLECTION + SLEEP (8:05-8:30)', blockId: 'eblk5', time: '8:22', title: "Ho\u2019oponopono prayer", desc: "4 phrases directed at anyone with mild irritation: I love you. I\u2019m sorry. Please forgive me. Thank you. Held resentment = chronic cortisol = accelerated aging. 3 min Hawaiian forgiveness.", cat: 'SACRED' },
    { id: 'e_cyclic_sighing', block: 'REFLECTION + SLEEP (8:05-8:30)', blockId: 'eblk5', time: '8:25', title: 'Cyclic sighing (5 min)', desc: '', cat: 'SLEEP' },
    { id: 'e_lights_out', block: 'REFLECTION + SLEEP (8:05-8:30)', blockId: 'eblk5', time: '8:30', title: 'LIGHTS OUT', desc: '4:00 AM is decided here. 8:30 PM \u2192 4:00 AM = 7.5h = 5 complete sleep cycles = natural wake at cycle boundary. Zero grogginess. The morning is won or lost in the first 60 seconds of this moment.', cat: 'SLEEP' }
  ],
  midday: [
    // PRE-LUNCH RESET (12:00-1:25)
    { id: 'mid_posture_check', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '12:00', title: 'Posture reset + desk ergonomics', desc: 'Spine straight, shoulders back, monitor at eye level. 30 sec body scan. Prevent tech neck and lower back compression.', cat: 'BIOHACK' },
    { id: 'mid_eye_rest', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '12:05', title: '20-20-20 eye rule', desc: 'Every 20 minutes look at something 20 feet away for 20 seconds. Do a full 2-minute eye rest — palming, blinking, distance gaze.', cat: 'BIOHACK' },
    { id: 'mid_hydration', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '12:10', title: 'Hydration check (750ml by noon)', desc: 'Track water intake. Minimum 3L per day target. Copper vessel preferred. Room temperature or warm.', cat: 'BIOHACK' },
    { id: 'mid_stretch', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '1:00', title: 'Standing stretch (5 min)', desc: 'Neck rolls, shoulder shrugs, hip flexor stretch, hamstring stretch. Counter the damage of sitting. Every joint.', cat: 'MOVE' },
    { id: 'mid_breathwork', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '1:10', title: 'Box breathing (2 min)', desc: '4-4-4-4 pattern. Resets cortisol after morning deep work blocks. Parasympathetic activation before lunch.', cat: 'MIND' },
    // LUNCH WINDOW (1:30-2:00)
    { id: 'mid_lunch', block: 'LUNCH WINDOW (1:30-2:00)', blockId: 'midblk1', time: '1:30', title: 'Lunch — dal, roti, sabzi, salad', desc: 'No white rice. No fried items. Food code applies. Eat mindfully — no phone, no laptop. Chew 32 times. Last solid meal before 6 PM sprout mix.', cat: 'FUEL' },
    { id: 'mid_shata_pada', block: 'LUNCH WINDOW (1:30-2:00)', blockId: 'midblk1', time: '1:50', title: 'Shata Pada (100 steps after lunch)', desc: 'Walk 100 steps after every meal. Vagbhata prescription. Aids digestion, prevents insulin spikes. Non-negotiable.', cat: 'AYUR' },
    { id: 'mid_triphala_water', block: 'LUNCH WINDOW (1:30-2:00)', blockId: 'midblk1', time: '1:55', title: 'Warm water (copper vessel)', desc: 'Sip warm water 15-20 min after lunch. Never cold water with meals — kills Agni. Ayurvedic digestive fire protection.', cat: 'AYUR' },
    // AFTERNOON FUEL (3:30-4:00)
    { id: 'mid_green_tea', block: 'AFTERNOON FUEL (3:30-4:00)', blockId: 'midblk2', time: '3:30', title: 'Green tea + L-Theanine', desc: 'Afternoon nootropic stack. L-Theanine 200mg + green tea. Calm focus without jitters. No coffee after 12 PM (sleep hygiene).', cat: 'BIOHACK' },
    { id: 'mid_nuts', block: 'AFTERNOON FUEL (3:30-4:00)', blockId: 'midblk2', time: '3:35', title: 'Handful of soaked almonds/walnuts', desc: 'Brain fuel. Soaked overnight for better absorption. 8-10 almonds + 3 walnuts. Omega-3 for afternoon cognitive performance.', cat: 'FUEL' },
    { id: 'mid_sunlight', block: 'AFTERNOON FUEL (3:30-4:00)', blockId: 'midblk2', time: '3:40', title: 'Afternoon sunlight (5 min)', desc: 'Huberman protocol — late afternoon sun viewing helps set circadian clock for proper melatonin onset. No sunglasses. Direct exposure.', cat: 'BIOHACK' },
    { id: 'mid_gratitude_micro', block: 'AFTERNOON FUEL (3:30-4:00)', blockId: 'midblk2', time: '3:45', title: 'Micro-gratitude (1 thing)', desc: 'Pause. One specific thing from today. Say it internally. Resets hedonic adaptation. Afternoon anchor point.', cat: 'MIND' },
    // WRAP UP (5:00-5:30)
    { id: 'mid_task_review', block: 'WRAP UP (5:00-5:30)', blockId: 'midblk3', time: '5:00', title: 'End-of-work task review', desc: 'Review deep work blocks completed. Flag unfinished items for tomorrow. Capture loose threads before shutdown.', cat: 'MIND' },
    { id: 'mid_inbox_zero', block: 'WRAP UP (5:00-5:30)', blockId: 'midblk3', time: '5:10', title: 'Inbox zero pass', desc: 'Process remaining messages. Reply, delegate, or defer. Clean digital workspace before evening covenant begins.', cat: 'MIND' },
    { id: 'mid_shutdown', block: 'WRAP UP (5:00-5:30)', blockId: 'midblk3', time: '5:20', title: 'Shutdown ritual — "Shutdown complete"', desc: 'Cal Newport shutdown ritual. Review calendar for tomorrow. Say "Shutdown complete" out loud. Work brain OFF. Evening brain ON.', cat: 'MIND' }
  ]
};

// ══════════════════════════════════════
// RITUAL DATA STORE (localStorage)
// ══════════════════════════════════════
function getRitualDefs(period) {
  var key = 'fl_ritual_defs_' + period;
  var vKey = 'fl_ritual_defs_ver_' + period;
  var stored = localStorage.getItem(key);
  var storedVer = localStorage.getItem(vKey);
  // If stored version matches current, use cached defs
  if (stored && storedVer === RITUAL_VERSION) {
    try { return JSON.parse(stored); } catch(e) {}
  }
  // Version mismatch or first load — reload from defaults
  var defs = RITUAL_DEFAULTS[period] || [];
  localStorage.setItem(key, JSON.stringify(defs));
  localStorage.setItem(vKey, RITUAL_VERSION);
  return defs;
}

function saveRitualDefs(period, defs) {
  localStorage.setItem('fl_ritual_defs_' + period, JSON.stringify(defs));
  localStorage.setItem('fl_ritual_defs_ver_' + period, RITUAL_VERSION);
}

function resetRitualsToDefaults(period) {
  if (!confirm('Reset ' + period + ' rituals to latest defaults? Your completion history is safe \u2014 only the ritual list resets.')) return;
  var defs = RITUAL_DEFAULTS[period] || [];
  localStorage.setItem('fl_ritual_defs_' + period, JSON.stringify(defs));
  localStorage.setItem('fl_ritual_defs_ver_' + period, RITUAL_VERSION);
  loadRitualManager(period);
  renderRituals(period);
  alert('\u2713 ' + period.charAt(0).toUpperCase() + period.slice(1) + ' rituals reset to v' + RITUAL_VERSION);
}

// ══════════════════════════════════════
// DYNAMIC RITUAL RENDERER
// ══════════════════════════════════════
var ritualCatColors = {
  SACRED: {bg:'rgba(255,153,51,0.08)',color:'#FF9933'},
  AYUR: {bg:'rgba(0,229,160,0.08)',color:'#00E5A0'},
  BIOHACK: {bg:'rgba(0,212,255,0.08)',color:'#00D4FF'},
  FUEL: {bg:'rgba(212,160,23,0.08)',color:'#D4A017'},
  MIND: {bg:'rgba(224,64,251,0.08)',color:'#E040FB'},
  MOVE: {bg:'rgba(255,65,54,0.08)',color:'#FF4136'},
  SKIN: {bg:'rgba(255,105,180,0.08)',color:'#FF69B4'},
  SLEEP: {bg:'rgba(112,174,255,0.08)',color:'#70AEFF'}
};

function renderRituals(period) {
  var defs = getRitualDefs(period);
  var container = document.getElementById(period + '-rituals-container');
  if (!container) return;

  // Use date override if set (from date nav), else today
  var dateStr = (typeof ritualDateOverride !== 'undefined' && ritualDateOverride[period]) || getEffectiveToday();
  var locked = isDateLocked(dateStr);
  var todayKey = 'fl_rituals_' + period + '_' + dateStr;
  var doneRaw = JSON.parse(localStorage.getItem(todayKey) || '[]');
  // Support both old index-based and new ID-based formats
  var doneIds = [];
  doneRaw.forEach(function(v) {
    if (typeof v === 'string') { doneIds.push(v); }
    else if (typeof v === 'number') {
      // Migrate old index to ID
      if (defs[v]) doneIds.push(defs[v].id);
    }
  });

  // Group by block
  var blocks = {};
  var blockOrder = [];
  defs.filter(function(r) { return r.active !== false; }).forEach(function(r) {
    if (!blocks[r.block]) { blocks[r.block] = []; blockOrder.push(r.block); }
    blocks[r.block].push(r);
  });

  var html = '';
  if (locked) html += getLockBannerHTML(dateStr);
  blockOrder.forEach(function(blockName) {
    var items = blocks[blockName];
    var blockDone = items.filter(function(r) { return doneIds.indexOf(r.id) >= 0; }).length;
    html += '<div class="ritual-block">';
    html += '<div class="ritual-block-title">' + blockName + ' <span class="ritual-block-count">' + blockDone + '/' + items.length + '</span></div>';
    items.forEach(function(r) {
      var isDone = doneIds.indexOf(r.id) >= 0;
      var cc = ritualCatColors[r.cat] || {bg:'rgba(255,255,255,0.05)',color:'var(--text-dim)'};
      var clickAttr = locked ? 'onclick="showLockWarning()"' : 'onclick="toggleRitualById(this,\'' + period + '\',\'' + r.id + '\')"';
      html += '<div class="ritual-item' + (isDone ? ' done' : '') + (locked ? ' locked' : '') + '" data-rid="' + r.id + '" ' + clickAttr + ' style="' + (locked ? 'opacity:0.7;cursor:not-allowed;' : '') + '">';
      html += '<div class="ritual-check">' + (isDone ? '\u2713' : '') + '</div>';
      html += '<div class="ritual-time">' + (r.time || '') + '</div>';
      html += '<div><div class="ritual-text">' + r.title + '</div>';
      if (r.desc) html += '<div class="ritual-info">' + r.desc + '</div>';
      html += '</div>';
      if (r.desc) html += '<span class="ritual-info-btn" onclick="toggleRitualInfo(event,this)">\u2139</span>';
      html += '<div class="ritual-cat" style="background:' + cc.bg + ';color:' + cc.color + '">' + r.cat + '</div>';
      html += '</div>';
    });
    html += '</div>';
  });

  container.innerHTML = html;
  updateRitualProgress();
}

// ══════════════════════════════════════
// RITUAL TOGGLE + SAVE (ID-based)
// ══════════════════════════════════════
function toggleRitualById(el, period, ritualId) {
  // History lock: check if date is locked
  var dateStr = (typeof ritualDateOverride !== 'undefined' && ritualDateOverride[period]) || getEffectiveToday();
  if (isDateLocked(dateStr)) { showLockWarning(); return; }
  el.classList.toggle('done');
  el.querySelector('.ritual-check').textContent = el.classList.contains('done') ? '\u2713' : '';
  saveRitualStateById(period);
}

function saveRitualStateById(period) {
  // Use date override if set (from date nav), else today
  var dateStr = (typeof ritualDateOverride !== 'undefined' && ritualDateOverride[period]) || getEffectiveToday();
  var todayKey = 'fl_rituals_' + period + '_' + dateStr;
  var items = document.querySelectorAll('#p-' + period + ' .ritual-item');
  var doneIds = [];
  items.forEach(function(item) {
    if (item.classList.contains('done') && item.dataset.rid) doneIds.push(item.dataset.rid);
  });
  localStorage.setItem(todayKey, JSON.stringify(doneIds));
  if (typeof _markLocalWrite === 'function') _markLocalWrite(todayKey);
  // Sync to Supabase
  if (typeof syncSave === 'function') {
    syncSave('rituals_log', { date: dateStr, period: period, completed_ids: JSON.stringify(doneIds) }, 'date,period');
  }
  syncRituals(dateStr, period, doneIds, items.length);
  markSaved();
  // Check seal conditions only for today's evening rituals
  if (period === 'evening' && dateStr === getEffectiveToday() && typeof checkSealConditions === 'function') checkSealConditions();
  updateRitualProgress();
}

// Legacy support for old toggleRitual calls
function toggleRitual(el, period) {
  el.classList.toggle('done');
  el.querySelector('.ritual-check').textContent = el.classList.contains('done') ? '\u2713' : '';
  saveRitualStateById(period);
}

function updateRitualProgress() {
  ['morning', 'midday', 'evening'].forEach(function(period) {
    var items = document.querySelectorAll('#p-' + period + ' .ritual-item');
    var done = document.querySelectorAll('#p-' + period + ' .ritual-item.done');
    var pct = items.length ? Math.round(done.length / items.length * 100) : 0;
    var el = document.getElementById('prog-' + period);
    if (el) el.style.width = pct + '%';
    var lbl = document.getElementById('prog-' + period + '-lbl');
    if (lbl) lbl.textContent = pct + '%';
    var totalEl = document.getElementById(period + '-total-pct');
    if (totalEl) totalEl.textContent = pct + '%';
  });
}

// ══════════════════════════════════════
// RITUAL MANAGER
// ══════════════════════════════════════
var currentMgrPeriod = 'morning';
var _raTab = 'morning';

function loadRitualManager(period) {
  currentMgrPeriod = period;
  // Update all 5 period buttons
  ['Morning','Midday','Evening','Weekly','Monthly'].forEach(function(p) {
    var el = document.getElementById('mgr' + p);
    if (el) el.className = 'btn btn-' + (period === p.toLowerCase() ? 'primary' : 'outline') + ' btn-sm';
  });

  var defs = getRitualDefs(period);
  var list = document.getElementById('ritualManagerList');

  var catColors = {
    SACRED:'#FF9933', AYUR:'#00E5A0', BIOHACK:'#00D4FF', FUEL:'#D4A017',
    MIND:'#E040FB', MOVE:'#FF4136', SKIN:'#FF69B4', SLEEP:'#70AEFF'
  };

  // Reset to defaults button
  var resetBtn = document.getElementById('ritualResetBtn');
  if (resetBtn) {
    resetBtn.onclick = function() { resetRitualsToDefaults(currentMgrPeriod); };
    resetBtn.textContent = 'RESET ' + period.toUpperCase() + ' TO DEFAULTS';
  }

  list.innerHTML = defs.map(function(r, i) {
    var opacity = r.active === false ? 'opacity:0.4;' : '';
    var cc = catColors[r.cat] || '#888';
    return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg3);border-radius:8px;margin-bottom:4px;' + opacity + '">' +
      '<div style="display:flex;flex-direction:column;gap:2px">' +
        '<button class="btn-copy" style="padding:4px 8px;font-size:10px" onclick="moveRitual(' + i + ',-1)">\u25B2</button>' +
        '<button class="btn-copy" style="padding:4px 8px;font-size:10px" onclick="moveRitual(' + i + ',1)">\u25BC</button>' +
      '</div>' +
      '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);min-width:40px">' + (r.time || '\u2014') + '</div>' +
      '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:12px;color:var(--text)">' + r.title + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + r.block + '</div></div>' +
      '<div style="font-family:var(--font-mono);font-size:8px;padding:2px 6px;border-radius:3px;background:rgba(255,255,255,0.04);color:' + cc + '">' + r.cat + '</div>' +
      '<button class="btn-copy" style="padding:4px 8px;font-size:9px" onclick="editRitualItem(' + i + ')">EDIT</button>' +
      '<button class="btn-copy" style="padding:4px 8px;font-size:9px;color:' + (r.active === false ? 'var(--green)' : 'var(--red)') + ';border-color:' + (r.active === false ? 'rgba(0,229,160,0.2)' : 'rgba(255,68,68,0.2)') + '" onclick="toggleRitualActive(' + i + ')">' + (r.active === false ? 'ENABLE' : 'DISABLE') + '</button>' +
    '</div>';
  }).join('');
}

function moveRitual(index, direction) {
  var defs = getRitualDefs(currentMgrPeriod);
  var newIndex = index + direction;
  if (newIndex < 0 || newIndex >= defs.length) return;
  var item = defs.splice(index, 1)[0];
  defs.splice(newIndex, 0, item);
  saveRitualDefs(currentMgrPeriod, defs);
  loadRitualManager(currentMgrPeriod);
  renderRituals(currentMgrPeriod);
}

function toggleRitualActive(index) {
  var defs = getRitualDefs(currentMgrPeriod);
  defs[index].active = defs[index].active === false ? true : false;
  saveRitualDefs(currentMgrPeriod, defs);
  loadRitualManager(currentMgrPeriod);
  renderRituals(currentMgrPeriod);
}

function editRitualItem(index) {
  var defs = getRitualDefs(currentMgrPeriod);
  var r = defs[index];
  document.getElementById('reId').value = index;
  document.getElementById('rePeriod').value = currentMgrPeriod;
  document.getElementById('reTitle').value = r.title;
  document.getElementById('reTime').value = r.time || '';
  document.getElementById('reBlock').value = r.block || '';
  document.getElementById('reCat').value = r.cat || 'BIOHACK';
  document.getElementById('reDesc').value = r.desc || '';
  document.getElementById('ritualEditForm').classList.remove('hidden');
  document.getElementById('ritualEditForm').scrollIntoView({behavior:'smooth'});
}

function addNewRitual() {
  document.getElementById('reId').value = 'new';
  document.getElementById('rePeriod').value = currentMgrPeriod;
  document.getElementById('reTitle').value = '';
  document.getElementById('reTime').value = '';
  document.getElementById('reBlock').value = '';
  document.getElementById('reCat').value = 'BIOHACK';
  document.getElementById('reDesc').value = '';
  document.getElementById('ritualEditForm').classList.remove('hidden');
  document.getElementById('ritualEditForm').scrollIntoView({behavior:'smooth'});
}

function saveRitualEdit() {
  var index = document.getElementById('reId').value;
  var period = document.getElementById('rePeriod').value;
  var defs = getRitualDefs(period);

  var ritual = {
    title: document.getElementById('reTitle').value,
    time: document.getElementById('reTime').value,
    block: document.getElementById('reBlock').value,
    cat: document.getElementById('reCat').value,
    desc: document.getElementById('reDesc').value,
    active: true
  };

  if (index === 'new') {
    ritual.id = period.charAt(0) + '_' + ritual.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30) + '_' + Date.now().toString(36);
    ritual.blockId = '';
    defs.push(ritual);
  } else {
    var i = parseInt(index);
    ritual.id = defs[i].id;
    ritual.blockId = defs[i].blockId || '';
    defs[i] = ritual;
  }

  saveRitualDefs(period, defs);
  loadRitualManager(period);
  renderRituals(period);
  document.getElementById('ritualEditForm').classList.add('hidden');
  flashBtn(document.querySelector('#p-manage-rituals .btn-primary'), 'SAVED \u2713');
}
 
