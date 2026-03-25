# Work Log — Gridiron GM Play

Append entries. Do not edit historical entries.

---

## 2026-03-25 (session 16 — P64–P68)

- Session: P64–P68 — 5 Phaser features
- P64: No-Huddle Hurry-Up (HURRY UP button after incomplete, 15s saved, -5% comp next play, _hurryUpActive/_hurryUpPenalty)
- P65: Receiver Route Tree (CURL/POST/CORNER/GO selector, 3s auto-CURL, _routeChoice compMod/yardMod)
- P66: Defensive Pass Rush Lane (INSIDE/OUTSIDE on AI passes, sack%/coverage% mods, _rushLane)
- P67: QB Checkdown Under Pressure (500ms window, 1-6yd guaranteed, no INT, CHECKDOWN! flash, _checkdownFired)
- P68: Red Zone Fade to Corner (FADE ROUTE 3rd/4th &5+ inside 25, LOFT IT!, 48%/18%/34%, _fadePlaying)
- Build clean; committed; context updated

---

## 2026-03-20

- Session: P1–P5 implementation
- P1: Phaser 3 scaffold — main.js, BootScene, FieldScene, HudScene, PlayCallScene, GameOverScene
- P2: Run game — WASD runner, OL blocker, juke (SPACE), CB support on outside run
- P3: Pass game — route animation by depth, pass rush, arc throw, receiver targeting zones
- P4: Scheme-aware defense — 4-3/3-4/Cover 2/Zone Blitz; man/zone coverage AI
- P5: GM Bridge — reads `gm_roster_export` on boot, writes `gm_game_result` on game over with playerDeltas
- Added: AI possession (opponent drives LEFT; user controls 'YOU' defender with WASD)
- Added: Sound FX (Web Audio API — no files)
- Added: TD flash animation, tackle squish tween
- Added: Mobile D-pad overlay
- Added: Possession banner in HudScene
- Added: 8-play PlayCallScene (draw play + play action)
- Fixed: Immediate sacks — implemented full 5-man pocket with beat timers (1.9–3.8s)
- Fixed: OL run blocking — interpose midpoint logic
- Fixed: PlayCallScene overlay 88% opaque (was 45%, field text bleeding through)
- State: Build passes, full GM↔Play loop working

---

## 2026-03-24 — 5-man OL + Studio OS compliance
- Feature: 5-man OL with individual positions (LT/LG/C/RG/RT) — paired with gridiron-gm POS change
  - Created `this.lt, this.lg, this.c, this.rg, this.rt` dots and `this.oLine` array
  - Formation: C at cy, guards ±14px, tackles ±28px at LOS
  - Beat timer scales with individual OL ovr from GM export
  - Run blocking: each lineman independently blocks nearest unblocked defender
  - Pocket: 5 OL form C-shape arc in front of QB
- Updated: defaultRoster.js with named starters (Trent Williams, Q. Nelson, etc.)
- Studio OS: Created full Studio OS structure (AGENTS.md, context/, logs/, docs/, prompts/)
- State: Build passes, 5-man OL working, Studio OS complete

---

## 2026-03-24 (continued) — P6 backlog clearance

- Session: Defense sub-positions, drive chart, drive tracking, CI
- FieldScene: Changed defense dot labels to DE/DT, MLB/OLB, FS (display only)
- FieldScene: Drive tracking — state.currentDrive accumulates plays/yards; pushed to state.drives on end; AI drives via instance props
- gameState.js: Added drives[] and currentDrive to state object and resetState()
- GameOverScene: Drive chart section — reads state.drives[], two-column layout (team left, opp right), green=TD, red=INT/FUM, gray=DOWNS
- .github/workflows/ci.yml: Node 22, npm ci + npm run build, triggers on push/PR to master
- Both repos build clean. gridiron-gm 303kB, gridiron-gm-play 1240kB (Phaser, pre-existing warning)
- State: Committed, not yet pushed

---

## 2026-03-24 — P10: Halftime + 2-min warning

- _afterPlay(): halftime check (!_halfShown && quarter>=3); 2-min warning at plays 14/38
- _resolveAIPlay() + _aiTouchdown(): halftime check added
- _showHalftime(): 4s overlay with score+stats → 2nd-half kickoff return
- _showTwoMinWarning(): banner + whistle, 2.2s, then cb()
- gameState.js: _halfShown, _twoMin1, _twoMin2 in resetState()

## 2026-03-24 — P11: QB scramble + OG image + analytics

- _sack(): 22% scramble — QB WASD, _startOLBlocker + _aiRushers + _aiCBsSupport + blue tdFlash
- _tackled(): fumble uses runner pos (QB or RB)
- src/utils/analytics.js: sendBeacon tracker (VITE_ANALYTICS_URL)
- BootScene: track('game_boot'); GameOverScene: track('game_complete')
- index.html: OG+Twitter meta tags; public/images/cover.svg; .env.example
