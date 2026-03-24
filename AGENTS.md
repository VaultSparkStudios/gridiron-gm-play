# Agent Instructions — Gridiron GM Play

## Repo identity

- Repo name: `gridiron-gm-play`
- GitHub: `VaultSparkStudios/gridiron-gm-play`
- Public URL: `https://vaultsparkstudios.com/gridiron-gm-play/`
- Type: Browser-based real-time football gameplay engine (Phaser 3, multi-scene)
- Studio: VaultSpark Studios
- **Companion repo:** `gridiron-gm` — these two repos form one combined product

## Relationship to gridiron-gm

This repo is the **Play module** of Gridiron GM. It does not run standalone in production.

- `gridiron-gm` is the GM (franchise management) app — React, single JSX file
- `gridiron-gm-play` is the Play (real-time gameplay) engine — Phaser 3, Vite, multi-scene
- They communicate via **localStorage bridge keys**:
  - `gm_roster_export` — GM writes; Play reads on boot
  - `gm_game_result` — Play writes on game over; GM reads on import

Changes to the bridge contract (key names, data shapes) must be coordinated across both repos in the same session.

## Read order

1. `context/PROJECT_BRIEF.md`
2. `context/SOUL.md`
3. `context/BRAIN.md`
4. `context/CURRENT_STATE.md`
5. `context/TASK_BOARD.md`
6. `context/LATEST_HANDOFF.md`

## Non-negotiable rules

- NEVER change `gm_roster_export` or `gm_game_result` key names without updating both repos simultaneously
- Multi-scene Phaser architecture — each scene is one file in `src/scenes/`
- Shared mutable state lives in `src/data/gameState.js` only
- Sound effects via `src/utils/sound.js` — Web Audio API, no audio files
- Match the existing compact, functional code style
- Every play-side change that affects exported stats or scores must be reflected in `gridiron-gm` `importPlayResult()`

## Session aliases

If the user says only `start`, follow `prompts/start.md`.

If the user says only `closeout`, follow `prompts/closeout.md`.

## After meaningful work

1. Update `context/CURRENT_STATE.md`
2. Update `context/TASK_BOARD.md`
3. Append to `context/DECISIONS.md` for architectural decisions
4. Update `context/LATEST_HANDOFF.md`
5. Append to `logs/WORK_LOG.md`
6. If bridge contract changed: note the corresponding change needed in `gridiron-gm`

## Escalate before changing

- localStorage bridge key names or payload shapes
- Scene names or registration order in `src/main.js`
- Public URL or slug
- Deployment workflows

## Key files

- `src/main.js` — Phaser config, registers all scenes
- `src/scenes/FieldScene.js` — main gameplay engine
- `src/scenes/BootScene.js` — title screen + GM export reader
- `src/scenes/HudScene.js` — persistent score/down overlay
- `src/scenes/PlayCallScene.js` — play call menu (8 plays)
- `src/scenes/GameOverScene.js` — final score + export trigger
- `src/data/gameState.js` — shared mutable state
- `src/data/defaultRoster.js` — fallback roster when no GM export
- `src/utils/sound.js` — Web Audio API helpers
- `docs/STUDIO_DEPLOYMENT_STANDARD.md` — deployment rules
