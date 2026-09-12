// ═══════════════════════════════════════════
// FIRST LIGHT — RITUALS
// ═══════════════════════════════════════════

var RITUAL_VERSION = '2026-08-23-v27'; // bump to auto-reset stored defs on next load

var RITUAL_DEFAULTS = {
  morning: [
    // WAKE — ORAL CARE (3:30-3:45)
    { id: 'm_alarm', tier: 1, block: 'WAKE \u2014 ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:30', title: 'Alarm \u2014 Wake immediately', desc: 'Zero negotiation. The alarm is a command, not a suggestion. Feet on cold floor activates cortisol awakening response. No snooze. Ever. 3:30 AM is decided at 8:45 PM the night before.', cat: 'BIOHACK' },
    { id: 'm_gratitude_wake', block: 'WAKE — ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:30', title: 'Wake gratitude - thank the universe', desc: 'On waking, before the feet hit the floor: thank the universe for this life, thank everyone, and thank all five elements - earth, water, fire, air, ether.', cat: 'SACRED' },
    { id: 'm_tongue_scraper', block: 'WAKE \u2014 ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:31', title: 'Tongue scraper (copper)', desc: 'Removes Ama (toxins). 30 seconds. Before any water or food enters the mouth. Ayurvedic morning detox.', cat: 'AYUR' },
    { id: 'm_oil_pull', block: 'WAKE \u2014 ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:32', title: 'Oil pull (coconut oil)', desc: 'Start swishing immediately before any water. Standing in bathroom. Mouth completely dry. Pulls bacteria, whitens teeth, strengthens gums. 3-4 min.', cat: 'AYUR' },
    { id: 'm_cold_dive', tier: 1, block: 'WAKE \u2014 ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:33', title: 'Cold water dive reflex', desc: 'While still swishing oil. Vagus nerve activated. Full wakefulness. Resets nervous system. BIOHACK.', cat: 'BIOHACK' },
    { id: 'm_spit_oil', block: 'WAKE \u2014 ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:35', title: 'Spit oil pull + rinse', desc: 'Spit into trash, not sink. Rinse mouth with warm water. Oil pulling complete \u2014 bacteria removed, gums strengthened.', cat: 'AYUR' },
    { id: 'm_brush', block: 'WAKE \u2014 ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:36', title: 'Brush teeth', desc: 'After oil pull, not before. Brush thoroughly. Clean slate before fenugreek water enters the system.', cat: 'AYUR' },
    { id: 'm_fenugreek', block: 'WAKE \u2014 ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:37', title: 'Fenugreek water (soaked overnight)', desc: 'Soak 1 tsp methi overnight in copper vessel. Copper ionises water, kills bacteria, thyroid support. Total 250ml.', cat: 'AYUR' },
    { id: 'm_collagen', block: 'WAKE \u2014 ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:40', title: 'Collagen 15g + amla (vit C)', desc: 'MOVED from 4:27 \u2014 evidence window is 30-60 min BEFORE tendon loading (Shaw & Baar 2017), so peak aminoacidemia lands on the run/gym. Amla = the ~50mg vitamin C co-factor (lemon squeeze is only ~15mg). Verify dose is 15g.', cat: 'FUEL' },
    { id: 'm_salt_water', block: 'WAKE \u2014 ORAL CARE (3:30-3:45)', blockId: 'mblk0', time: '3:42', title: 'Pre-run hydration \u2014 500-750ml + pinch of salt', desc: 'You train after an 8h overnight fast in Indian humidity. ~400-500mg sodium (pinch of salt, nimbu optional). Cheapest performance + clarity fix in the protocol. ACSM fluid replacement.', cat: 'FUEL' },
    // BRAHMA MUHURTA (3:45-4:05) — compressed for 4 AM schedule
    { id: 'm_marma', block: 'BRAHMA MUHURTA (3:45-4:05)', blockId: 'mblk1', time: '3:45', title: 'Marma point self-massage', desc: 'Vagbhata. Ajna 30s, Hridaya 30s, Nabhi 30s clockwise. 2 min. Full body energy activated. Pressure points.', cat: 'AYUR' },
    { id: 'm_pranayama', block: 'BRAHMA MUHURTA (3:45-4:05)', blockId: 'mblk1', time: '3:47', title: 'Pranayama (Nadi Shodhana)', desc: 'Nadi Shodhana or Kapalabhati. Open air rooftop. Phone away. 5 min compressed. SACRED.', cat: 'SACRED' },
    { id: 'm_japa', block: 'BRAHMA MUHURTA (3:45-4:05)', blockId: 'mblk1', time: '3:52', title: 'Japa (108 beads)', desc: 'Mala or silent. Phone away. Full presence. Do not suppress. Pure witnessing. Japa = concentration. This = equanimity.', cat: 'SACRED' },
    { id: 'm_thai_meditation', block: 'BRAHMA MUHURTA (3:45-4:05)', blockId: 'mblk1', time: '3:58', title: 'Thai forest meditation', desc: 'Sit still after Japa. Close eyes. A sound arises \u2014 note: sound. A thought \u2014 thinking. A sensation \u2014 sensation. Do not follow. Do not suppress. 3 min open awareness.', cat: 'MIND' },
    { id: 'm_hooponopono', block: 'BRAHMA MUHURTA (3:45-4:05)', blockId: 'mblk1', time: '4:00', title: "Ho'oponopono prayer (morning)", desc: "I love you. I'm sorry. Please forgive me. Thank you. Morning forgiveness - clear resentment before the day begins.", cat: 'SACRED' },
    { id: 'm_earthing', block: 'BRAHMA MUHURTA (3:45-4:05)', blockId: 'mblk1', time: '4:03', title: 'Earthing \u2014 bare feet on ground (SUNDAY ONLY)', desc: 'SUNDAY ONLY \u2014 not possible on weekdays. Eyes open to sky. 3 things spoken aloud. Step onto grass or earth. Bare skin contact. Morning gratitude is an opening, not a review.', cat: 'BIOHACK', active: false },
    { id: 'm_brahmacharya', block: 'BRAHMA MUHURTA (3:45-4:05)', blockId: 'mblk1', time: '4:02', title: 'Brahmacharya mala (intention set)', desc: '', cat: 'SACRED' },
    // STUDY 1+2 (4:05-5:45)
    { id: 'm_coffee', block: 'STUDY 1+2 (4:05-5:45)', blockId: 'mblk1b', time: '4:05', title: 'Coffee + L-theanine — phone-free', desc: "MOVED from 8:05 — the caffeine curve now rises INTO Study 1 and still fuels the 6:00 session. ONLY caffeine of the day (curfew 2 PM; the 3:30 slot is decaf). L-theanine 100-200mg = the studied calm-focus combo.", cat: 'MIND' },
    { id: 'm_study_12', tier: 1, block: 'STUDY 1+2 (4:05-5:45)', blockId: 'mblk1b', time: '4:15', title: 'STUDY 1+2 — 90 min: INTERVIEW PREP + CODING', desc: "Mission ②: interview preparation & coding — the hardest material gets the deepest block. Phone in another room, no electronics. WEDNESDAY: 40 min only, long run rolls 5:00.", cat: 'MIND' },
    // PRE-TRAIN (5:40-6:00)
    // STUDY 1+2 (4:05-5:45) inserted above; PRE-TRAIN below
    { id: 'm_oats', block: 'PRE-TRAIN (5:40-6:00)', blockId: 'mblk2', time: '5:40', title: 'Oats bowl (pre-train fuel)', desc: 'Small bowl before swim/run/gym. SUNDAY tri-day variant: short swim, then oats jar + banana in the car to the outskirts — long ride + brick run, 60g carbs/h on the bike. WEDNESDAY: bowl at 4:45 before the 5:00 long run.', cat: 'FUEL' },
    { id: 'm_carnitine_creatine', tier: 1, block: 'PRE-TRAIN (5:40-6:00)', blockId: 'mblk2', time: '5:45', title: 'Creatine 5g (daily \u2014 rest days too)', desc: 'Timing is irrelevant, DAILY saturation is everything \u2014 vegetarians have 20-30% lower stores and get the largest strength + cognition response (2024 meta-analyses). Never skip on rest days. L-carnitine moved to the 7:05 post-workout meal \u2014 fasted with water it never reaches muscle (needs carbs/insulin, Wall 2011 J Physiol).', cat: 'BIOHACK' },
    { id: 'm_hard_day_fuel', block: 'PRE-TRAIN (5:40-6:00)', blockId: 'mblk2', time: '5:47', title: 'Hard-day fuel \u2014 2-3 dates / 1 banana', desc: 'On interval / brick / long (>90 min) days \u2014 fasted stays only for easy Zone-2 \u226490 min (fasted training buys zero performance; IOC RED-S 2023). NEVER skip before punishment rides: 30-100km must always be fueled, 30-60g carbs/h during.', cat: 'FUEL' },
    { id: 'm_ikigai', block: 'PRE-TRAIN (5:40-6:00)', blockId: 'mblk2', time: '5:48', title: 'Ikigai spoken aloud', desc: 'I am not trying to win. I am refusing to stop. Said with conviction. Every single morning.', cat: 'MIND' },
    { id: 'm_visualization', tier: 1, block: 'PRE-TRAIN (5:40-6:00)', blockId: 'mblk2', time: '5:50', title: '2-min visualization - see the day executed', desc: 'Two minutes, eyes closed. Vividly rehearse the day going exactly as planned - the run, the work, the wins. Mental rehearsal primes the nervous system. Every single morning.', cat: 'MIND' },
    { id: 'm_sattu', block: 'PRE-TRAIN (5:40-6:00)', blockId: 'mblk2', time: '5:48', title: 'Sattu drink', desc: '100g Sattu + 350ml water + half lemon + pinch of salt. Takes under a minute. Drink steadily while driving.', cat: 'FUEL', active: false },
    { id: 'm_box_breathing', block: 'PRE-TRAIN (5:40-6:00)', blockId: 'mblk2', time: '5:52', title: 'Box breathing (4-4-4-4)', desc: 'Alert neutrality. Engine on, car stationary. 5 rounds. Then go. Navy SEAL protocol.', cat: 'MIND' },
    // RUN SLOT + SWIM
    { id: 'm_run_slot', tier: 1, block: 'RUNS — WEEKLY MAP', blockId: 'mblk2b', time: '5:00', title: 'RUN — We LONG 5:00 AM · Tu easy 4:15 PM · Su brick', desc: 'ONE long run per week: WEDNESDAY 5:00-7:00 AM (until Nov, then it swaps to Sunday and the ride shrinks). Tuesday 4:15 PM easy 40-50 min after market close — ends at the 5:30 recovery dinner. Sunday: brick 5-10k off the bike (15-21k version 1x/month max). Easy = 7:00-7:30/km, HR cap 145.', cat: 'MOVE' },
    { id: 'm_swim_slot', tier: 1, block: 'SWIM (6:00-6:50)', blockId: 'mblk2c', time: '6:00', title: 'SWIM — daily except Wednesday', desc: 'IN THE WATER AT 6:00 SHARP — scooty out the door 5:55. Skill sport: daily frequency, zero injury cost. Mon = easy recovery. Main sets Tue/Thu. Sat easy before the tempo ride. Sun short opener before the long ride + brick. Home ~7:00.', cat: 'MOVE' },
    // POST-TRAIN (7:15-7:45)
    { id: 'm_postworkout_meal', block: 'POST-TRAIN (7:15-7:45)', blockId: 'mblk4', time: '7:15', title: 'Post-workout meal FIRST (whey + carbs) + L-carnitine', desc: 'SELF-SERVE — never wait for the cook (he arrives 7:00-7:30, unpredictable): whey shake + yesterday-prepped poha/overnight oats from the fridge. Cook cooks LUNCH + tomorrow-morning prep, not breakfast. EAT BEFORE HOT SHOWER. 30-40g protein (whey/paneer — feeding 1 of 4, ~0.4g/kg each) + fast carbs within 20-30 min = anabolic window, doubly real after FASTED training (ISSN). Take L-carnitine HERE with the carbs — muscle uptake is insulin-dependent (Wall 2011). Hot shower after eating = vasodilation delivers nutrients.', cat: 'FUEL' },
    { id: 'm_hot_shower', block: 'POST-TRAIN (7:15-7:45)', blockId: 'mblk4', time: '7:25', title: 'Hot shower (38-42\u00b0C, 10 min)', desc: 'AFTER cool-down + meal. 38-42°C for 10 min. Vasodilation: blood vessels expand, nutrients delivered to worked muscles. Growth hormone mild pulse. Cortisol drops. Does NOT suppress mTOR (unlike cold after gym). Science: Scandinavian J Medicine 2024.', cat: 'SKIN' },
    { id: 'm_moisturiser', block: 'POST-TRAIN (7:15-7:45)', blockId: 'mblk4', time: '7:35', title: 'Moisturiser + sunscreen', desc: '', cat: 'SKIN' },
    { id: 'm_free_writing', block: 'POST-TRAIN (7:15-7:45)', blockId: 'mblk4', time: '7:42', title: 'Free writing', desc: '', cat: 'MIND' },
    { id: 'm_calf_dose', block: 'POST-TRAIN (7:15-7:45)', blockId: 'mblk4', time: '7:45', title: 'Calf + soleus micro-dose — 15 min (We AM + Tu PM)', desc: 'After the Wednesday long run (morning) and the Tuesday evening run, at home: heavy single-leg calf raises straight-knee + bent-knee (soleus) + hip stability. The soleus absorbs 6-8x bodyweight per stride — the #1 marathon-injury insurance. Non-negotiable through the entire run ramp.', cat: 'MOVE' },
    // STUDY 2 / GYM (7:30-8:50)
    { id: 'm_study_3', tier: 1, block: 'STUDY 2 / GYM (7:30-8:50)', blockId: 'mblk5b', time: '7:50', title: 'STUDY 2 — 60 min: STOCK MARKET (Tu/Th/Fr: GYM instead)', desc: 'Mon/Wed/Sat: study 7:50-8:50. GYM ×3 — TUE lower body + calves · THU upper + core · FRI full-body LIGHT (never heavy legs before the weekend rides). Scooty, after breakfast; on gym days study slides to 3:05 post-market. Race-taper weeks: gym drops to 1×.', cat: 'MIND' },
    // MID-MORNING (8:45-9:00)
    { id: 'm_ginger_shot', block: 'MID-MORNING (8:45-9:00)', blockId: 'mblk6', time: '8:45', title: 'Ginger lime shot', desc: '', cat: 'AYUR' },
    { id: 'm_chyawanprash', block: 'MID-MORNING (8:45-9:00)', blockId: 'mblk6', time: '8:46', title: 'Chyawanprash (1 tsp)', desc: 'MOVED from 3:38 AM \u2014 1 tsp is ~6-8g sugar; taken pre-dawn it broke the overnight fast before the entire training block. With breakfast the amla/immunity case stays, the fast stays intact.', cat: 'AYUR' },
    { id: 'm_oats_paneer', block: 'MID-MORNING (8:45-9:00)', blockId: 'mblk6', time: '8:47', title: 'Oats + paneer breakfast', desc: 'Post-gym meal at 7:05 already covers nutrition. This is removed from daily tracking.', cat: 'FUEL', active: false },
    { id: 'm_shata_pada', block: 'MID-MORNING (8:45-9:00)', blockId: 'mblk6', time: '8:48', title: 'Shata Pada (100 steps after meal)', desc: '', cat: 'AYUR' },
    { id: 'm_sunlight', tier: 1, block: 'MID-MORNING (8:45-9:00)', blockId: 'mblk6', time: '8:50', title: 'Sunlight exposure (5 min)', desc: '', cat: 'BIOHACK' },
    { id: 'm_vitamins', tier: 1, block: 'MID-MORNING (8:45-9:00)', blockId: 'mblk6', time: '8:52', title: 'Vitamins (D3+K2, algal Omega-3 ≥1g, B12)', desc: 'B12 250-500µg ADDED — 68-77% of unsupplemented lacto-vegetarians are functionally low; the single biggest vegetarian gap. Omega-3: verify label delivers ≥1000mg EPA+DHA (most veg caps are 200-300mg — switch to algal). D3 with a fat-containing meal is correct. Blood panel every 6 months: B12+MMA, ferritin, 25(OH)D, HbA1c, testosterone, T3, LFT.', cat: 'BIOHACK' },
    { id: 'm_cdp_choline', block: 'MID-MORNING (8:45-9:00)', blockId: 'mblk6', time: '8:53', title: 'CDP-Choline', desc: 'Not required daily \u2014 disabled from routine tracking. Re-enable manually on days of use.', cat: 'BIOHACK', active: false },
    { id: 'm_fruit_break', block: 'MID-MORNING (8:45-9:00)', blockId: 'mblk6', time: '8:53', title: 'Fruit break — jamun / pomegranate / berries', desc: 'Daily anthocyanin serving (≥50-100g) — memory + executive-function RCTs; rotate jamun (season), pomegranate, black grapes, frozen blueberries, fresh amla.', cat: 'FUEL' },
    { id: 'm_review_blocks', block: 'MID-MORNING (8:45-9:00)', blockId: 'mblk6', time: '8:54', title: 'Review time blocks for the day', desc: '', cat: 'MIND' },
    // STUDY 3 (9:00-9:40)
    { id: 'm_study_extra', tier: 1, block: 'STUDY 3 (9:00-9:40)', blockId: 'mblk6b', time: '9:00', title: 'STUDY 3 — moved to 3:05 PM (market opens 9:00)', desc: 'MOVED post-market — see midday. Market 9:00-3:00 owns this slot now.', cat: 'MIND', active: false },
    { id: 'm_deep_work', tier: 1, block: 'MARKET (9:00-3:00)', blockId: 'mblk7', time: '9:00', title: 'MARKET OPEN — at the desk 9:00-3:00', desc: 'Stock market hours, at the computer, untouchable. Deep-work discipline applies: phone away, no mid-session training thoughts. Lunch 1:30 at the desk (dabba).', cat: 'MIND' },
    { id: 'm_deep_study', tier: 1, block: 'DESK PREP (8:45-9:00)', blockId: 'mblk8', time: '10:30', title: '1-hour deep study - NO electronics on', desc: 'SUPERSEDED by STUDY 1+2+3 blocks — off daily tracking. One focused hour of study/learning with zero electronic devices switched on. Book, notes, pen. Single subject, pure input. Compounds over months.', cat: 'MIND', active: false },
    { id: 'm_dabba', block: 'DESK PREP (8:45-9:00)', blockId: 'mblk8', time: '8:45', title: 'Lunch dabba ready — desk lunch at 1:30', desc: "Cook arrives 7:00-7:30 (never exact — doesn't matter): SMART-LOCK CODE + entrance/kitchen CAMERA = he lets himself in, every entry logged, footage = accountability. You're usually home anyway (till 11:15). MENU CARD on the fridge decides what he cooks — never him. Dabba ready by ~9:30. Door closed for Study 2/3 — the card answers every question.", cat: 'FUEL' },
    { id: 'm_leave_office', block: 'DESK PREP (8:45-9:00)', blockId: 'mblk8', time: '8:50', title: 'Desk ready — market prep (office days: leave ~8:20)', desc: 'At the computer by 9:00 sharp, market hours 9:00-3:00. Evening chain unchanged: whatever the day held, night prep 7:30 → lights out 8:45 (Fri/Sat 8:30).', cat: 'MOVE' }
  ],
  evening: [
    // EVENING — 7 PM (work ends 7 PM hard stop)
    { id: 'e_laptop_close', tier: 1, block: 'EVENING \u2014 7 PM SHUTDOWN', blockId: 'eblk0', time: '7:00', title: 'Laptop close \u2014 HARD STOP', desc: 'Work ends \u2014 OUT of the office by 6:45-7:00 sharp, no "just 5 more minutes". Home ~7:15. The 8:45 lights-out is decided here, at the office door, not at home.', cat: 'SLEEP' },
    { id: 'e_phone_off', tier: 1, block: 'EVENING \u2014 7 PM SHUTDOWN', blockId: 'eblk0', time: '7:01', title: 'PHONE OFF \u2192 hall drawer (lives in the HALL, travels nowhere; ON 9:00)', desc: 'TERRITORY RULE (phone-rituals/ rulebook): phone lives in the hall drawer or the car DASH MOUNT (nav only) \u2014 never rooms/hand/pocket. ONE touch: 6:40-6:55 PM (log day + SYNC Strava/HAE + OTPs + cook menu) + answered calls. Emergency use = in the CAR only (never inside house/office). Watch eSIM = the world\'s door. Breach price: 10km walk (touch) / 30km (left hall) / 50km (feed) \u2014 daytime, flat, no compounding. Evening rituals tick on PAPER; 9:05 catch-up.', cat: 'MIND' },
    { id: 'e_internet_off', block: 'EVENING \u2014 7 PM SHUTDOWN', blockId: 'eblk0', time: '7:02', title: 'Internet OFF', desc: '', cat: 'SLEEP' },
    { id: 'e_sprout_mix', block: 'EVENING \u2014 7 PM SHUTDOWN', blockId: 'eblk0', time: '7:05', title: 'Sprout mix (moong/chana)', desc: 'Last food of the day. 1.5h before sleep. Light meal = stomach clear by 8:30 PM. Empty stomach sleep = full recovery mode. Growth hormone maximised. Evening Covenant begins.', cat: 'FUEL', active: false },
    { id: 'e_shata_pada', block: 'EVENING \u2014 7 PM SHUTDOWN', blockId: 'eblk0', time: '7:10', title: 'Shata Pada (100 steps)', desc: '', cat: 'AYUR' },
    // NIGHT PREP (7:12-7:22)
    { id: 'e_tomorrow_plan', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:12', title: 'Tomorrow planning (time blocks)', desc: 'Write tomorrow\'s plan NOW so 3:30 AM wake has zero decision-making. Pre-decide everything.', cat: 'MIND' },
    { id: 'e_copper_vessel', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:14', title: 'Fill copper vessel + soak methi + oats', desc: '', cat: 'AYUR' },
    { id: 'e_gym_bag', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:15', title: "Kit packed — tomorrow's sport", desc: "Tomorrow's kit every evening. SATURDAY EVE: bottles mixed + fridged, bike INTO the car, tires + chain checked, oats jar packed — Sunday = tri day (swim → long ride → brick). Zero morning decisions.", cat: 'MOVE' },
    { id: 'e_clothes', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:16', title: 'Clothes laid out (run + gym kit)', desc: '', cat: 'MIND' },
    { id: 'e_supplements_out', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:17', title: 'Supplements laid out', desc: '', cat: 'BIOHACK' },
    { id: 'e_keys', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:18', title: 'Keys + essentials ready', desc: '', cat: 'MIND' },
    { id: 'e_hot_water', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:19', title: 'Hot water ready (thermos)', desc: '', cat: 'AYUR' },
    { id: 'e_loban', block: 'NIGHT PREP (7:12-7:22)', blockId: 'eblk1', time: '7:20', title: 'Loban (frankincense) lit', desc: '', cat: 'SACRED' },
    // SKIN + OIL RITUALS (7:25-7:48)
    { id: 'e_cold_dive', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:25', title: 'Cold water dive reflex', desc: 'MOVED TO MORNING (post-run) - evening cold raises arousal and fights the magnesium + glycine sleep stack. Kept in the list, off daily tracking.', cat: 'BIOHACK', active: false },
    { id: 'e_coconut_oil', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:32', title: 'Coconut oil (face + body)', desc: '', cat: 'SKIN' },
    { id: 'e_nasya', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:35', title: 'Nasya oil (2 drops per nostril)', desc: 'Lubricates brain pathway. Improves sleep quality. Every night. 30 days = visible difference.', cat: 'AYUR' },
    { id: 'e_mula_bandha', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:40', title: 'Mula Bandha practice', desc: 'Root lock. Engage 10s, release, 10 reps. Ayurvedic energy conservation. Upward movement of Ojas.', cat: 'SACRED' },
    { id: 'e_abhyanga', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:42', title: 'Abhyanga (self oil massage)', desc: '', cat: 'AYUR' },
    { id: 'e_shilajit', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:45', title: 'Shilajit (ICP-MS COA-verified ONLY)', desc: 'ONLY with a batch-specific heavy-metals certificate (Pb/As/Cd/Hg/Tl, independent lab, <1yr old) \u2014 2024-25 testing found lead and thallium in "purified" resins; the word has no legal meaning. No COA = skip entirely (creatine + ashwagandha already cover its claimed benefits with better evidence). Max ONE dose/day. Warm water, alone.', cat: 'AYUR' },
    { id: 'e_olive_oil_navel', block: 'SKIN + OIL RITUALS (7:25-7:48)', blockId: 'eblk2', time: '7:47', title: 'Olive oil on navel', desc: '', cat: 'AYUR' },
    // WIND DOWN + SLEEP (7:50-8:05)
    { id: 'e_mag_triphala', tier: 1, block: 'WIND DOWN + SLEEP (7:50-8:05)', blockId: 'eblk3', time: '7:50', title: 'Magnesium glycinate + Glycine + Triphala (cycled)', desc: 'Magnesium GLYCINATE only (oxide barely absorbs), ≤350mg elemental + Glycine 3g (RCT: lowers core temp, faster sleep onset). Triphala now CYCLED — 3 wk on / 1 wk off (chronic daily use risks laxative dependency + CYP450 interactions). All in warm water.', cat: 'BIOHACK' },
    { id: 'e_warm_milk', block: 'WIND DOWN + SLEEP (7:50-8:05)', blockId: 'eblk3', time: '7:52', title: 'Milk + paneer + Ashwagandha — night closed', desc: '400-500ml + turmeric + black pepper + Ashwagandha 300-600mg ROOT extract only (India banned leaf in supplements, Apr 2026 — check label) + Jatamansi + 2 tbsp cottage cheese. CYCLE 8-12 wk on / 2-4 wk off; stop all herbals + get LFTs if dark urine/itching/jaundice (rare hepatotoxicity, LiverTox grade C). Casein overnight = muscle repair.', cat: 'AYUR' },
    // DAY CLOSE (8:05)
    { id: 'e_night_prep_confirm', block: 'DAY CLOSE (8:05)', blockId: 'eblk4', time: '8:05', title: 'Night prep confirmed \u2713', desc: '', cat: 'MIND' },
    { id: 'e_electronics_charge', block: 'DAY CLOSE (8:05)', blockId: 'eblk4', time: '8:06', title: 'All electronics on charge - OUTSIDE bedroom', desc: 'Every device (phone, watch, laptop) plugged in to charge OUTSIDE the bedroom. Bedroom is a no-device zone - removes the 3:30 AM temptation and the +10 km bedroom-device penalty.', cat: 'SLEEP' },
    // REFLECTION + SLEEP (8:05-8:45)
    { id: 'e_roman_examen', block: 'REFLECTION + SLEEP (8:05-8:45)', blockId: 'eblk5', time: '8:05', title: 'Roman Examen (review of conscience)', desc: '3 min written. What aligned. What did not. What changes tomorrow. Final line: Tomorrow I will improve [one specific micro-thing] by 1%. Kaizen. 1% daily = 37x better in one year.', cat: 'SACRED' },
    { id: 'e_3_wins', block: 'REFLECTION + SLEEP (8:05-8:45)', blockId: 'eblk5', time: '8:08', title: '3 Wins of the day', desc: '3 wins written + "This happened because..." Internal locus of control. Harvard: strongest longevity predictor.', cat: 'MIND' },
    { id: 'e_reverse_replay', block: 'REFLECTION + SLEEP (8:05-8:45)', blockId: 'eblk5', time: '8:12', title: 'Reverse day replay (end to start)', desc: '', cat: 'MIND' },
    { id: 'e_gratitude', block: 'REFLECTION + SLEEP (8:05-8:45)', blockId: 'eblk5', time: '8:15', title: 'Gratitude (3 things)', desc: '', cat: 'SACRED' },
    { id: 'e_trataka', block: 'REFLECTION + SLEEP (8:05-8:45)', blockId: 'eblk5', time: '8:18', title: 'Trataka (candle gazing)', desc: 'Fixed gaze on flame. 5 min. Sharpens concentration, improves eyesight, calms mind. SACRED.', cat: 'SACRED' },
    { id: 'e_hooponopono', block: 'REFLECTION + SLEEP (8:05-8:45)', blockId: 'eblk5', time: '8:22', title: "Ho\u2019oponopono prayer", desc: "4 phrases directed at anyone with mild irritation: I love you. I\u2019m sorry. Please forgive me. Thank you. Held resentment = chronic cortisol = accelerated aging. 3 min Hawaiian forgiveness.", cat: 'SACRED' },
    { id: 'e_cyclic_sighing', tier: 1, block: 'REFLECTION + SLEEP (8:05-8:45)', blockId: 'eblk5', time: '8:25', title: 'Cyclic sighing (5 min)', desc: '', cat: 'SLEEP' },
    { id: 'e_oral_care', block: 'REFLECTION + SLEEP (8:05-8:45)', blockId: 'eblk5', time: '8:40', title: 'Evening oral care - brush + interdental', desc: 'Two-minute fluoride brushing + interdental cleaning (floss or interdental brush). Last thing before bed. Overnight clean teeth prevent decay and gum disease.', cat: 'AYUR' },
    { id: 'e_lights_out', tier: 1, block: 'REFLECTION + SLEEP (8:05-8:45)', blockId: 'eblk5', time: '8:45', title: 'LIGHTS OUT', desc: '3:30 AM is decided here. 8:45 PM \u2192 3:30 AM = ~6h45m sleep (evidence-corrected up from 6h). The morning is won or lost in the first 60 seconds of this moment. FRI + SAT NIGHTS: lights out 8:30 — 7h before the weekend sessions (Sat tempo ride, Sun tri day).', cat: 'SLEEP' }
  ],
  midday: [
    // PRE-LUNCH RESET (12:00-1:25)
    { id: 'mid_posture_check', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '12:00', title: 'Posture reset + desk ergonomics', desc: 'Spine straight, shoulders back, monitor at eye level. 30 sec body scan. Prevent tech neck and lower back compression.', cat: 'BIOHACK' },
    { id: 'mid_eye_rest', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '12:05', title: '20-20-20 eye rule', desc: 'Every 20 minutes look at something 20 feet away for 20 seconds. Do a full 2-minute eye rest — palming, blinking, distance gaze.', cat: 'BIOHACK' },
    { id: 'mid_hydration', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '12:10', title: 'Hydration check (750ml by noon)', desc: 'Track water intake. Minimum 3L per day target. Copper vessel preferred. Room temperature or warm.', cat: 'BIOHACK' },
    { id: 'mid_stretch', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '1:00', title: 'Standing stretch (5 min)', desc: 'Neck rolls, shoulder shrugs, hip flexor stretch, hamstring stretch. Counter the damage of sitting. Every joint.', cat: 'MOVE' },
    { id: 'mid_breathwork', block: 'PRE-LUNCH RESET (12:00-1:25)', blockId: 'midblk0', time: '1:10', title: 'Box breathing (2 min)', desc: '4-4-4-4 pattern. Resets cortisol after morning deep work blocks. Parasympathetic activation before lunch.', cat: 'MIND' },
    // LUNCH WINDOW (1:30-2:00)
    { id: 'mid_lunch', tier: 1, block: 'LUNCH WINDOW (1:30-2:00)', blockId: 'midblk1', time: '1:30', title: 'Lunch — salad+dal FIRST, paneer/dahi, roti LAST', desc: 'EXACTLY 1:30 PM (time fixed — was listed 2:00 after the 1:50 post-lunch walk). EAT ORDER: salad + dal/paneer first, roti/rice last — cuts the glucose spike ~30-40% = no 2-4 PM fog. Millet (ragi/jowar/bajra) or brown rice > white rice. Paneer or dahi = protein feeding 2 of 4. No phone. Chew 32×.', cat: 'FUEL' },
    { id: 'mid_shata_pada', block: 'LUNCH WINDOW (1:30-2:00)', blockId: 'midblk1', time: '1:50', title: 'Shata Pada (100 steps after lunch)', desc: 'Walk 100 steps after every meal. Vagbhata prescription. Aids digestion, prevents insulin spikes. Non-negotiable.', cat: 'AYUR' },
    { id: 'mid_triphala_water', block: 'LUNCH WINDOW (1:30-2:00)', blockId: 'midblk1', time: '1:55', title: 'Warm water (copper vessel)', desc: 'Sip warm water 15-20 min after lunch. Never cold water with meals — kills Agni. Ayurvedic digestive fire protection.', cat: 'AYUR' },
    // AFTERNOON FUEL (3:30-4:00)
    { id: 'mid_study3', tier: 1, block: 'POST-MARKET (3:05-5:30)', blockId: 'midblk2a', time: '3:05', title: 'STUDY 3 — 40 min: MARKET REVIEW / flex (Tue: run 4:15 after)', desc: 'Post-market sitting: day review + either mission → 2h30 study daily. On gym days this carries the market-study slot. Tuesday: easy run 4:15-5:15 PM after this, ending at the 5:30 recovery dinner.', cat: 'MIND' },
    { id: 'mid_green_tea', block: 'AFTERNOON FUEL (3:30-4:00)', blockId: 'midblk2', time: '3:30', title: 'DECAF green tea + L-Theanine', desc: 'CAFFEINE CURFEW 2 PM — caffeine needs ~8.8h clearance before bed (Sleep Med Rev 2023 meta-analysis) and lights-out is 8:45. L-Theanine 200mg alone keeps the calm-focus effect; decaf keeps the ritual. Keep all tea ≥1h away from meals — tannins cut iron absorption 60-90% (vegetarian-critical).', cat: 'BIOHACK' },
    { id: 'mid_nuts', block: 'AFTERNOON FUEL (3:30-4:00)', blockId: 'midblk2', time: '3:35', title: 'Handful of soaked almonds/walnuts', desc: 'Brain fuel. Soaked overnight for better absorption. 8-10 almonds + 3 walnuts. Omega-3 for afternoon cognitive performance.', cat: 'FUEL' },
    { id: 'mid_sunlight', block: 'AFTERNOON FUEL (3:30-4:00)', blockId: 'midblk2', time: '3:40', title: 'Afternoon sunlight (5 min)', desc: 'Huberman protocol — late afternoon sun viewing helps set circadian clock for proper melatonin onset. No sunglasses. Direct exposure.', cat: 'BIOHACK' },
    { id: 'mid_gratitude_micro', block: 'AFTERNOON FUEL (3:30-4:00)', blockId: 'midblk2', time: '3:45', title: 'Micro-gratitude (1 thing)', desc: 'Pause. One specific thing from today. Say it internally. Resets hedonic adaptation. Afternoon anchor point.', cat: 'MIND' },
    // WRAP UP (5:00-5:30)
    { id: 'mid_task_review', block: 'WRAP UP (5:00-5:30)', blockId: 'midblk3', time: '5:00', title: 'End-of-work task review', desc: 'Review deep work blocks completed. Flag unfinished items for tomorrow. Capture loose threads before shutdown.', cat: 'MIND' },
    { id: 'mid_inbox_zero', block: 'WRAP UP (5:00-5:30)', blockId: 'midblk3', time: '5:10', title: 'Inbox zero pass', desc: 'Process remaining messages. Reply, delegate, or defer. Clean digital workspace before evening covenant begins.', cat: 'MIND' },
    { id: 'mid_shutdown', block: 'WRAP UP (5:00-5:30)', blockId: 'midblk3', time: '5:20', title: 'Shutdown ritual — "Shutdown complete"', desc: 'Cal Newport shutdown ritual. Review calendar for tomorrow. Say "Shutdown complete" out loud. Work brain OFF. Evening brain ON.', cat: 'MIND' },
    // DINNER (5:30) — the last solid meal made explicit
    { id: 'mid_dinner', tier: 1, block: 'FUEL TOP-UP (5:00-5:30)', blockId: 'midblk4', time: '5:00', title: '5 PM top-up — sattu shake / fruit + PB + 2 kiwis', desc: 'MANDATORY on big days (We long run, Sat ride, Sun tri-day, Tue run), optional otherwise. SATURDAY = DOUBLE (sattu 5:00 AND fruit/poha before 6) — Saturday is the highest-carb day; Sunday\'s tri-day is fueled today. Lunch is the day\'s biggest meal (tell the cook: athlete portion); this is the last food before the cutoff. Night = milk + paneer only — the 30g casein pre-sleep dose. 2 kiwis: RCT −35% sleep latency. Blanch any sprouts.', cat: 'FUEL' }
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
      html += '<div class="ritual-item' + (isDone ? ' done' : '') + (locked ? ' locked' : '') + (r.tier === 1 ? ' keystone' : '') + '" data-rid="' + r.id + '" ' + clickAttr + ' style="' + (r.tier === 1 ? 'border-left:3px solid rgba(245,166,35,0.75);' : '') + (locked ? 'opacity:0.7;cursor:not-allowed;' : '') + '">';
      html += '<div class="ritual-check">' + (isDone ? '\u2713' : '') + '</div>';
      html += '<div class="ritual-time">' + (r.time || '') + '</div>';
      html += '<div><div class="ritual-text">' + r.title + '</div>';
      if (r.desc) html += '<div class="ritual-info">' + r.desc + '</div>';
      html += '</div>';
      if (r.desc) html += '<span class="ritual-info-btn" onclick="toggleRitualInfo(event,this)">\u2139</span>';
      if (r.tier === 1) html += '<div class="ritual-keystone" title="Keystone - antifragile core" style="align-self:center;background:rgba(245,166,35,0.14);color:#F5A623;font-weight:700;font-size:8px;letter-spacing:1px;padding:3px 6px;border-radius:4px;margin-right:6px;border:1px solid rgba(245,166,35,0.4)">&#9670; KEY</div>';
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
 
