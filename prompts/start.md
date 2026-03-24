# Start Protocol — Gridiron GM Play

Run this at the beginning of every session.

## Steps

1. Read `AGENTS.md` for repo identity, bridge contract, and rules
2. Read `context/CURRENT_STATE.md` for where things stand
3. Read `context/TASK_BOARD.md` for what needs to be done
4. Read `context/LATEST_HANDOFF.md` for what was last worked on

## Startup brief format

After reading the above, produce a concise startup brief:

```
## Session Start — Gridiron GM Play

**Status:** [one line]
**Last work:** [one line]
**Active tasks:** [bullet list from TASK_BOARD.md]
**Blockers:** [any blockers, or "none"]
**Bridge status:** [is gm_roster_export/gm_game_result contract intact?]
**Ready to:** [what you can help with]
```

## Rules reminder

- Never change localStorage bridge keys without updating gridiron-gm simultaneously
- State changes go through gameState.js — not FieldScene instance vars
- Web Audio API only — no audio file imports
- Use pxs() for all movement speeds
- Match existing compact, functional code style
