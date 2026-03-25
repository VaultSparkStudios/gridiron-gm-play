# Current State — Gridiron GM Play

## Snapshot

- Date: 2026-03-25
- Overall status: Live on GitHub Pages, active development
- Current version: P73 — full backlog complete (paired with gridiron-gm v10.0)

## What exists

### Scenes
- BootScene — title screen; reads `gm_roster_export`; shows week, records, scheme badges; KICK OFF button
- FieldScene — full gameplay engine:
  - Run game: WASD runner, 5-man OL blocking (LT/LG/C/RG/RT), juke (SPACE), CB support
  - Pass game: route animation (quick/medium/deep/play-action), receiver targeting (🟢/🔴 zones)
  - Pass protection: 5-man OL pocket; beat timers scale with individual OL ovr from GM export
  - AI possession: opponent drives LEFT; user controls 'YOU' defender dot with WASD
  - Scheme-aware defense: 4-3, 3-4, Cover 2, Zone Blitz formations; man/zone coverage AI
  - Per-player stat tracking: `state.playerStats[id]` keyed by player id
  - Sound FX: tackle, TD fanfare, juke, sack, INT, whistle, first down, incomplete
  - TD flash animation, tackle squish tween
  - Mobile D-pad overlay (4-button, bottom-right)
- HudScene — persistent overlay: score, down/distance, possession banner
- PlayCallScene — 8-play menu (4 run + 4 pass); 88% opaque overlay
- GameOverScene — final score, per-player stat breakdown, drive chart, writes `gm_game_result`

### GM Bridge (full loop)
- GM schedule → 🎮 Play button → exports `gm_roster_export` → opens Play tab
- Boot reads export, shows matchup + records + schemes
- Gameplay with actual roster (LT/LG/C/RG/RT ratings affect pocket hold time)
- GameOver writes `gm_game_result` with playerDeltas
- GM 📥 Results button imports stats + marks scheduled game played with correct score

### OL System
- 5 individual dots: LT (blind side), LG, C, RG, RT at LOS
- Each lineman has separate beat timer weighted by their ovr from GM roster
- Run plays: each OL blocks nearest unblocked defender
- Pass plays: OL arcs in front of QB; blockers interpose between QB and rushers

### FieldScene additions (P6–P11)
- Defense dot labels: DE/DT, MLB/OLB, FS
- Drive tracking: `state.currentDrive` + `state.drives[]`
- P7: 4th-down panel, PAT choice, FG/punt handlers
- P8: Kickoff return mini-game (opening kick + user/AI returns)
- P9: Fumble mechanic (~4%, RB/QB str-weighted)
- P10: Halftime screen (4s overlay, 2nd-half kickoff); two-minute warning (plays 14 + 38)
- P11: QB scramble — `_sack()` 22% → QB WASD run; `_tackled()` uses runner pos for fumble

### Analytics (P11)
- `src/utils/analytics.js` — privacy-safe `sendBeacon` tracker, `VITE_ANALYTICS_URL` env var
- BootScene: `track('game_boot')`; GameOverScene: `track('game_complete', {won,score,plays})`
- `.env.example` documents setup; no-op if URL unset

### Infrastructure
- `.github/workflows/ci.yml` — Node 22, `npm ci && npm run build`, triggers on push/PR to master
- OG+Twitter meta tags in `index.html`; `public/images/cover.svg` (1200×630)

## In progress

- (none)

## Blockers

- None

## P36–P43 additions

- **P36: Pick-Six Return** — DB user-controlled run after INT; lb/lb2 blockers; qb/rb/wr1 pursuit
- **P37: Onside Kick** — post-score modal; rapid-tap RECOVER! 1.2s; ≥3 taps = bonus recovery
- **P38: QB Scramble Spin Move** — SPIN button DL <40px; `_spinUsed`; 70% break / 30% sack
- **P39: Fake Punt/Fake FG** — modal before punt/FG; 3s auto-dismiss to real
- **P40: Goal Line QB Sneak** — yardLine≥94 & toGo≤1; PUSH! mash 4/0.8s
- **P41: Drive Momentum Meter** — `_momentum` HUD bar; ±comp modifier per play
- **P42: Challenge Flag** — `_challengeUsed`; `_prePlayState` snapshot; 45% overturn
- **P43: 4th Quarter Comeback Mode** — `_comebackMode`; trailing 7+ Q4; comp bonus; banner

## P64–P68 additions

- **P64: No-Huddle Hurry-Up** — HURRY UP after incomplete; 15s saved; -5% comp next play; `_hurryUpActive/_hurryUpPenalty`
- **P65: Receiver Route Tree** — CURL/POST/CORNER/GO pre-snap selector; 3s auto-CURL; `_routeChoice {compMod,yardMod}`
- **P66: Defensive Pass Rush Lane** — INSIDE/OUTSIDE on AI passes; sack%/coverage% modifiers; `_rushLane`
- **P67: QB Checkdown Under Pressure** — 500ms window; 1-6yd guaranteed gain; no INT; CHECKDOWN! flash; `_checkdownFired`
- **P68: Red Zone Fade to Corner** — FADE ROUTE 3rd/4th &5+ inside 25; LOFT IT!; 48% catch / 18% INT / 34% inc; TD if in endzone; `_fadePlaying`

## Next 3 moves

1. Wire analytics endpoint — set `VITE_ANALYTICS_URL` in `.env.local`
2. Generate PNG OG image — open `../gridiron-gm/scripts/gen-og.html` in browser → `public/images/cover.png`
3. New backlog TBD — all current features complete
