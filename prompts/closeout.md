# Closeout Protocol — Gridiron GM Play

Run this at the end of every meaningful session.

## Steps

1. Update `context/CURRENT_STATE.md` — snapshot current feature set and status
2. Update `context/TASK_BOARD.md` — move completed items to Done, update backlog
3. Append to `context/DECISIONS.md` — record any new architectural decisions
4. Update `context/LATEST_HANDOFF.md` — what was done, mid-flight, and next moves
5. Append to `logs/WORK_LOG.md` — date + what changed + current state
6. Commit and push both repos if bridge contract changed
7. Update Claude memory files if running in Claude Code session

## Closeout checklist

- [ ] `context/CURRENT_STATE.md` updated with current version and feature list
- [ ] `context/TASK_BOARD.md` tasks moved correctly
- [ ] `context/DECISIONS.md` new entries added for any non-obvious choices
- [ ] `context/LATEST_HANDOFF.md` ready for cold-start next session
- [ ] `logs/WORK_LOG.md` new entry appended
- [ ] Bridge contract unchanged OR both repos updated in tandem
- [ ] Build passes (`npm run build`)
- [ ] Pushed to GitHub

## Bridge contract reminder

If you changed `gm_roster_export` or `gm_game_result` payloads, verify the corresponding change is in `gridiron-gm`'s `exportGameToPlay()` and `importPlayResult()` before closing out.
