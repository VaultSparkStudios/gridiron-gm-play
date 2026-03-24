# Soul — Gridiron GM Play

## Identity

Gridiron GM Play is the heartbeat of the Gridiron GM franchise. It turns a spreadsheet game into a lived experience. When you snap the ball, you're not watching a simulation — you're running it.

## Emotional promise

The player should feel the pressure: the pocket collapsing, the window closing on a wide receiver, the linebacker closing fast on a third-and-short run. Every play should feel like it matters because it does — the result goes back into your franchise.

## What makes it distinctly ours

- Real-time gameplay tied to your actual GM roster: your LT's rating determines how long the pocket holds
- No assets, no install, no backend — pure Phaser 3 in the browser
- The bridge to the GM app makes every GM decision feel consequential
- Mobile-playable with D-pad overlay

## Anti-drift rules

- Do NOT decouple from the GM bridge — the localStorage loop is the whole point
- Do NOT add game modes that don't connect back to the franchise
- Do NOT import audio files — Web Audio API only (offline-first)
- Do NOT change the localStorage bridge key names without updating both repos
- Do NOT remove the per-player stat tracking — it feeds back into GM season stats

## Tone

Fast. Physical. Readable. The field is a canvas of dots — clean, functional, never cluttered. Feedback is immediate: tackle squish, TD flash, PRESSURE! text. The game feels alive without being flashy.

## Design principle

Every mechanic should have franchise meaning. Juking a linebacker matters because you needed that first down to win the game. The pocket holding 3.2 seconds matters because you spent a draft pick on a left tackle. GM decisions and Play outcomes are the same loop.
