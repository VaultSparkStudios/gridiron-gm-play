// Shared mutable game state passed between scenes via registry
export const state = {
  // Rosters
  team: null,
  opponent: null,

  // Score & clock
  score: { team: 0, opp: 0 },
  quarter: 1,
  plays: 0,

  // Down & distance
  down: 1,
  toGo: 10,
  yardLine: 25,   // offensive team's yard line (1–99)
  possession: 'team', // 'team' | 'opp'

  // Current play
  currentCall: null,   // play call id
  lastResult: null,    // result object from play resolution

  // Per-drive stats (accumulated for export)
  stats: {
    team: { passYds: 0, rushYds: 0, td: 0, int: 0, fumble: 0 },
    opp:  { passYds: 0, rushYds: 0, td: 0, int: 0, fumble: 0 },
  }
};

export function resetState() {
  state.score = { team: 0, opp: 0 };
  state.quarter = 1;
  state.plays = 0;
  state.down = 1;
  state.toGo = 10;
  state.yardLine = 25;
  state.possession = 'team';
  state.currentCall = null;
  state.lastResult = null;
  state.stats = {
    team: { passYds: 0, rushYds: 0, td: 0, int: 0, fumble: 0 },
    opp:  { passYds: 0, rushYds: 0, td: 0, int: 0, fumble: 0 },
  };
}

export function exportStats() {
  const out = { ...state.stats, score: state.score, quarters: state.quarter };
  try { localStorage.setItem('gm_game_result', JSON.stringify(out)); } catch {}
  return out;
}
