# Current State — Gridiron GM Play

## Snapshot

- Date: 2026-03-24
- Overall status: Live on GitHub Pages, active development
- Current version: P5 + 5-man OL (paired with gridiron-gm v3.6+)

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
- GameOverScene — final score, per-player stat breakdown, writes `gm_game_result`

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

## In progress

- Studio OS structure (just created this session)

## Blockers

- None

## Next 3 moves

1. BootScene matchup card — show key player-vs-player ratings (LT vs top DE)
2. Defense sub-positions: DE, DT, MLB, OLB, FS, SS labels
3. Special teams module (kickoffs, field goal attempts in Phaser)
