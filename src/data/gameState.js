// Shared mutable game state passed between scenes via registry
export const state = {
  // Rosters
  team: null,
  opponent: null,

  // Score & clock
  score: { team: 0, opp: 0 },
  quarter: 1,
  plays: 0,
  // v36: 60-min game clock — 900s per quarter (15 min × 60s)
  clock: 900,
  clockRunning: false,

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

  // In-game injuries (written to gm_game_result for GM import)
  injuries: [],
  oppPlayerInjuries: [],   // opponent player injuries to send back to GM

  // Weather: 'clear' | 'rain' | 'snow'
  weather: 'clear',

  // GM bridge — set from gm_roster_export so exportStats can write it back
  gameId: null,

  // GO2: best single play of the game {name, yards, type}
  bestPlay: null,

  // B3: stadium upgrades from GM bridge (e.g. 'crowd_noise')
  stadiumUpgrades: [],

  // Bridge extras
  difficulty: 'normal',  // 'rookie'|'normal'|'veteran'|'hof'
  streak: 0,             // win streak (+) / losing streak (-) from GM
  isRival: false,        // rival matchup flag
  chemistry: 75,         // team chemistry (affects fumble chance)

  // INNO I29: play call history — last N calls for PlayCallScene sidebar
  callHistory: [],

  // Internal scene state — declared here so resetState() covers them
  _halfShown: false,
  _twoMin1: false,
  _twoMin2: false,
  _drillMode: false,
};

export function resetState() {
  state.score = { team: 0, opp: 0 };
  state.quarter = 1;
  state.plays = 0;
  state.clock = 900;
  state.clockRunning = false;
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
  state.injuries = [];
  state.oppPlayerInjuries = [];
  state.weather = 'clear';
  state.gameId = null;
  state.bestPlay = null;
  state.stadiumUpgrades = [];
  state.difficulty = 'normal';
  state.streak = 0;
  state.isRival = false;
  state.chemistry = 75;
  state.callHistory = [];
  state._halfShown = false;
  state._twoMin1 = false;
  state._twoMin2 = false;
  state._drillMode = false;
}

export function computeGrade(d) {
  let _sc=0;
  if(d.passYds){_sc+=Math.min(50,d.passYds/5);_sc+=(d.passTD||0)*12;_sc-=(d.ints||0)*14;}
  if(d.rushYds){_sc+=Math.min(40,d.rushYds/2.5);_sc+=(d.rtds||0)*10;}
  if(d.recYds){_sc+=Math.min(35,d.recYds/2.5);_sc+=(d.retds||0)*10;}
  return _sc<=0?null:_sc>=50?'A+':_sc>=40?'A':_sc>=30?'B+':_sc>=20?'B':_sc>=12?'C':_sc>=4?'D':'F';
}

export function exportStats() {
  const out = {
    ...state.stats,
    score: state.score,
    quarters: state.quarter,
    finalClock: state.clock,
    teamName: state.team?.name,
    oppName: state.opponent?.name,
    // Per-player deltas — GM reads these to update player season stats
    injuries: state.injuries || [],
    gameId: state.gameId || null,
    playerDeltas: state.team?.players?.map(p => {
      const ps = state.playerStats[p.id] || {};
      const d = { id:p.id, pos:p.pos, name:p.name, passYds:ps.passYds||0, att:ps.att||0, comp:ps.comp||0, passTD:ps.passTD||0, ints:ps.int||0, rushYds:ps.rushYds||0, rushAtt:ps.rushAtt||0, rtds:ps.rushTD||0, recYds:ps.recYds||0, rec:ps.rec||0, retds:ps.recTD||0, sacks:ps.sack||0, tkl:ps.tkl||0, defInts:ps.defInt||0, pd:ps.pd||0 };
      d.grade = computeGrade(d);
      return d;
    }) || [],
    // B-bridge: opponent player injuries sustained during Play
    oppPlayerInjuries: state.oppPlayerInjuries || [],
  };
  try { localStorage.setItem('gm_game_result', JSON.stringify(out)); } catch {}
  return out;
}
