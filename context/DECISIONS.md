# Decisions — Gridiron GM Play

Append new entries. Do not erase historical reasoning.

---

### 2026-03-20 — Multi-scene Phaser 3 architecture

- Status: Permanent constraint
- Decision: Separate scenes for Boot, Field, Hud, PlayCall, GameOver; shared state via `gameState.js`
- Why: Each scene has a single responsibility; HudScene runs as persistent overlay without interrupting gameplay; PlayCallScene stops itself on selection keeping FieldScene alive underneath
- Follow-up: Never put persistent game state as FieldScene instance variables; always use `state` from gameState.js

---

### 2026-03-20 — localStorage bridge contract

- Status: Permanent contract (both repos must change together)
- Decision: Two keys: `gm_roster_export` (GM→Play) and `gm_game_result` (Play→GM)
- Why: Simplest possible IPC between two tabs; works offline, no server needed; stateless from Play's perspective (read on boot, write on game over)
- Follow-up: Any schema change to either key must be coordinated in same session across both repos

---

### 2026-03-20 — Web Audio API only (no audio files)

- Status: Permanent constraint
- Decision: All sound via `src/utils/sound.js` using WebAudio oscillators/buffers; zero audio files loaded
- Why: Keeps the app fully offline-first with no asset loading; consistent with gridiron-gm's zero-dependency philosophy
- Follow-up: Sound.td(), Sound.tackle(), Sound.juke(), Sound.sack(), Sound.int(), Sound.firstDown(), Sound.incomplete(), Sound.whistle()

---

### 2026-03-24 — 5-man OL with individual positions

- Status: Complete
- Decision: Replace single `this.ol` dot with `this.lt`, `this.lg`, `this.c`, `this.rg`, `this.rt` and `this.oLine` array
- Why: NFL authenticity; individual OL ovr from GM export now controls how long each lineman holds their block (pocket beat timer scales with ovr); mirrors gridiron-gm's POS array change from OL→LT/LG/C/RG/RT
- Follow-up: Beat timer = `1900 + (olOvr/99)*1400 + rand(800)ms`; run blocking iterates all 5 OL independently

---

### 2026-03-24 — pxs() speed system

- Status: Permanent constraint
- Decision: All dot movement speeds calculated via `pxs(rating, base, scale)` — never hardcode px/s
- Why: Player ratings from GM export directly affect gameplay feel; a fast RB should be noticeably faster than a slow one
- Tuning: runner 72-90px/s, defenders 38-52px/s, AI carrier 64-78px/s, user defender 90-108px/s
