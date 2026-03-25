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
  },

  // Per-player stat deltas keyed by player id
  playerStats: {},

  // Drive tracking
  drives: [],
  currentDrive: null,
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
  state.playerStats = {};
  state.drives = [];
  state.currentDrive = null;
}

export function exportStats() {
  const out = {
    ...state.stats,
    score: state.score,
    quarters: state.quarter,
    teamName: state.team?.name,
    oppName: state.opponent?.name,
    // Per-player deltas — GM reads these to update player season stats
    playerDeltas: state.team?.players?.map(p => {
      const ps = state.playerStats[p.id] || {};
      return {
        id: p.id, pos: p.pos, name: p.name,
        passYds: ps.passYds || 0,
        att:     ps.att     || 0,
        comp:    ps.comp    || 0,
        rushYds: ps.rushYds || 0,
        rushAtt: ps.rushAtt || 0,
        recYds:  ps.recYds  || 0,
        rec:     ps.rec     || 0,
        td:      ps.td      || 0,
        int:     ps.int     || 0,
      };
    }) || [],
  };
  try { localStorage.setItem('gm_game_result', JSON.stringify(out)); } catch {}
  return out;
}
