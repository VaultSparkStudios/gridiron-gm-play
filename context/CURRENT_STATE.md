# Current State — Gridiron GM Play

## Snapshot

- Date: 2026-03-24
- Overall status: Live on GitHub Pages, active development
- Current version: P6 — defense sub-positions + drive chart + CI (paired with gridiron-gm v3.7)

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

### FieldScene additions (P6)
- Defense dot labels: DE/DT (was generic DL), MLB/OLB (was generic LB), FS (was S)
- Drive tracking: `state.currentDrive` accumulates team drives; `_aiDrivePlays/_aiDriveYards/_aiDriveStart` for AI
- Drives pushed to `state.drives[]` on TD, turnover (INT/FUM/punt), or DOWNS

### Infrastructure
- `.github/workflows/ci.yml` — Node 22, `npm ci && npm run build`, triggers on push/PR to master

## In progress

- (none)

## Blockers

- None

## Next 3 moves

1. BootScene matchup card — show key player-vs-player ratings (LT vs top DE)
2. Special teams module (kickoffs, field goal attempts in Phaser)
3. OG image `public/images/cover.png`
