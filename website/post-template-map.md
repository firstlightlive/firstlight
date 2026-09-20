# FIRST LIGHT — POST TEMPLATE MAP
# Which design ships for which outcome. The edge function picks by verdict.

| OUTCOME | TEMPLATE FILE | ART DIRECTION |
|---|---|---|
| Daily win — morning run (04:58) | post-v4-headlamp.html | THE BEAM — a headlamp cone carving the dark, day number lit in the beam. The night-run identity. |
| Daily win — standard day | post-v3-win.html | THE SUNRISE — half-risen sun, day number inside it, road to the light. |
| Record / longest day (PR) | post-v4-record.html | ELEVATION DATA-ART — the ride's profile drawn as a mountain, peak marker, axis labels. |
| Stack day (2+ sports) | post-v4-stack.html | TRIATHLON LANES — run/cycle/swim results board with effort bars. |
| Miss / debt opened | post-v3-miss.html | THE SUN WAITS — pre-dawn darkness, gold debt, "tomorrow the sun rises again." |
| Debt PAID | post-v4-receipt.html | PENANCE RECEIPT — thermal ledger receipt with PAID IN FULL stamp. Closes the loop. |
| Milestone (30/60/90/120/180) | post-v3-milestone.html | THE SUN RISEN — full dawn, rays, reward unlocked, next target. |
| Restart announcement | existing publish-restart-post.sh slides | RESTART_HERO / RESTART_RECORD / RESTART_RULE — unchanged. |
| Monthly recap | existing recap flow | Unchanged (identity + stats + rotated hashtags). |

## Selection rules (all classifier-safe, privacy-safe)
1. No links, no handles, no ₹, no hashtag curtains — every template complies.
2. No private language: "clean / sober / relapse" never appears. Streak / miss / km only.
3. Debt posts: distance only, never the reason. Receipt posts ship AFTER payment.
4. Milestones show the reward + the next target — the ladder is public, the reason is not.

## Caption pairing
- v3/v4 slides pair with _generateCaption() output (identity + proof stats + rotated hashtags).
- MISS captions: "MISS LOGGED — X KM CYCLE DEBT. PAYING IN DISTANCE."
- RECEIPT captions: "PAID. LEDGER CLEAR. 0 KM."
