# Brain — Gridiron GM Play

## Architecture heuristic

Multi-scene Phaser 3. Each concern lives in its own scene file. Shared state goes through `gameState.js` only — scenes never hold persistent game state as instance variables beyond the current render frame.

**Scene responsibilities:**
- `BootScene` — read GM export from localStorage; show matchup; launch Field+Hud
- `FieldScene` — all gameplay logic (run, pass, defense, AI possession, pocket, resolution)
- `HudScene` — read-only overlay (score, down/distance, possession banner); receives events from FieldScene
- `PlayCallScene` — play selection; emits `playCalled` event to FieldScene; stops itself on selection
- `GameOverScene` — display final score + stats; write `gm_game_result` to localStorage

## Feature addition heuristic

1. New game mechanic lives in `FieldScene.js`
2. New persistent state goes in `gameState.js` (also update `resetState()`)
3. New exported data goes in `exportStats()` in `gameState.js` AND in `importPlayResult()` in `gridiron-gm`
4. New UI overlay extends `HudScene.js` or `GameOverScene.js`
5. Sound effect goes in `src/utils/sound.js`

## Priorities

1. Game stability — builds must pass, no scene crash on load
2. GM bridge fidelity — exported stats must always match what GM can import
3. Gameplay feel — pocket hold, run physics, AI pressure should feel balanced and fair
4. Studio compliance — Studio OS structure, deployment standard, slug correctness

## Mental models

- **Bridge first**: every feature must ask "does this need to be exported to GM?" If yes, update both sides
- **Per-player tracking**: `state.playerStats[id]` accumulates every play; exported as `playerDeltas[]` at game over
- **Phase state machine**: FieldScene.phase = presnap → run|pass_wait|pass_flight|ai_run → result; no skipping phases
- **Speed in px/s via pxs()**: all movement uses `pxs(rating, base, scale)` — never hardcode pixel speeds

## Key constants

- Field: 800×500px canvas; FIELD_Y=60, FIELD_H=380, YARD_W=6px, FIELD_LEFT=100, FIELD_RIGHT=700
- OL formation: 5-man line at LOS — C at cy, guards ±14px, tackles ±28px
- Pocket: 5 OL blockers; beat timer = 1900 + (olOvr/99)*1400 + rand(800)ms
- Plays end after 40 total plays or 4 quarters (8 plays/quarter)
