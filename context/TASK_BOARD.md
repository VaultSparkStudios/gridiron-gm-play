# Task Board — Gridiron GM Play

## Done (full history)

- [x] P1: Phaser 3 scaffold — Boot/Field/Hud/PlayCall/GameOver scenes
- [x] P2: Run game — WASD runner, OL blocker, juke (SPACE), CB support
- [x] P3: Pass game — route animation, pass rush, arc throw, receiver targeting
- [x] P4: Scheme-aware defense — 4-3/3-4/Cover 2/Zone Blitz; man/zone coverage AI
- [x] P5: GM Bridge — reads `gm_roster_export`, writes `gm_game_result` with playerDeltas
- [x] AI possession — opponent drives LEFT; user defends with WASD dot
- [x] Per-player stat tracking (`state.playerStats`)
- [x] Sound FX (Web Audio API — tackle, TD, juke, sack, INT, whistle, first down)
- [x] TD flash animation, tackle squish tween
- [x] Mobile D-pad overlay
- [x] Possession banner in HUD
- [x] 8-play PlayCallScene (Inside Run, Outside Run, QB Scramble, Draw Play, Quick Pass, Medium Route, Deep Shot, Play Action)
- [x] 88% opaque overlay (no text bleed-through)
- [x] Boot screen: week, records, scheme badges
- [x] Pass pocket blocking (OL/TE/RB → now 5-man OL)
- [x] OL run blocking — interpose between runner and defender
- [x] Speed tuning (pxs() system)
- [x] 5-man OL with named positions (LT/LG/C/RG/RT)
- [x] Individual OL ovr from GM export controls pocket hold time
- [x] defaultRoster.js updated with named OL starters
- [x] Studio OS structure — AGENTS.md, context/, logs/, docs/, prompts/

## In Progress

- (none)

## Backlog — Gameplay

- [ ] BootScene matchup card: LT ovr vs opponent top DE ovr (key matchup preview)
- [ ] Defense sub-positions: DE/DT (from DL) and MLB/OLB (from LB); FS/SS (from S)
- [ ] Special teams: kickoff play between possessions; field goal attempt in Phaser
- [ ] Momentum system: big play chains give run/pass bonus
- [ ] Replay highlight: brief animated replay of TD/INT/sack after play resolves
- [ ] 4th-down decision UI: punt / go for it / field goal option
- [ ] Drive chart: GameOverScene shows sequence of plays (run/pass/sack/TD) per drive

## Backlog — Infrastructure

- [ ] ci.yml workflow (build + lint check)
- [ ] OG image at `public/images/cover.png`
- [ ] Mobile layout improvements (larger D-pad, better touch targets)
