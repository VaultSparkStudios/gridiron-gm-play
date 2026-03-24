# Project Brief — Gridiron GM Play

## Identity

- Name: Gridiron GM Play
- Slug: `gridiron-gm-play`
- Type: Browser-based real-time football gameplay engine
- Status: Live — actively developed
- Owner: VaultSpark Studios
- **Part of:** Gridiron GM (dual-repo product)

## Why this exists

- Problem: Franchise GM simulators are pure simulation with no player agency during games
- Solution: A real-time Phaser 3 gameplay engine that connects to the GM app via localStorage bridge
- The combined Gridiron GM + Gridiron GM Play product lets you manage AND play your franchise

## Audience

Same as gridiron-gm: casual football fans and sim enthusiasts. Play adds real-time agency to franchise decisions.

## Success

- A player can export a scheduled matchup from the GM app, play the game in the Phaser engine with their actual roster, and have the result imported back into the franchise
- Full loop: GM → export → boot screen → play → game over → import result → franchise updated

## Scope

- In scope: Run game (WASD + juke), pass game (route animation + receiver targeting), pass protection (5-man OL pocket), AI possession (user defends), scheme-aware defense formations, per-player stat tracking, GM bridge export/import
- Out of scope: Multiplayer, persistent cloud saves, real NFL assets

## URLs

- Public: `https://vaultsparkstudios.com/gridiron-gm-play/`
- Companion GM app: `https://vaultsparkstudios.com/gridiron-gm/`
- Repo: `https://github.com/VaultSparkStudios/gridiron-gm-play`

## Bridge contract

```
gm_roster_export  (GM → Play):
  { team, opponent, week, season, gameId }
  team/opponent: { name, ab, clr, ac, ocScheme, dcScheme, record, players[] }
  players[]: { id, name, pos, ovr, spd, str, salary }

gm_game_result  (Play → GM):
  { score:{team,opp}, stats, playerDeltas[], gameId, week, oppName }
```
