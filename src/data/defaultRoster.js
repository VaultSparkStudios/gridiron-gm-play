// Default roster used when no GM save is imported.
// Shape mirrors Gridiron GM player objects.
export const DEFAULT_TEAM = {
  name: 'Your Team',
  ab: 'YT',
  clr: '#22c55e',
  ac: '#86efac',
  players: [
    { id: 'qb1', name: 'Alex Carter',   pos: 'QB', ovr: 82, spd: 68, str: 62, jmp: 62 },
    { id: 'rb1', name: 'Marcus Webb',   pos: 'RB', ovr: 79, spd: 88, str: 74, jmp: 78 },
    { id: 'wr1', name: 'DeShawn Hill',  pos: 'WR', ovr: 84, spd: 93, str: 58, jmp: 90 },
    { id: 'wr2', name: 'Tyrell Banks',  pos: 'WR', ovr: 76, spd: 87, str: 55, jmp: 83 },
    { id: 'te1', name: 'Jordan Cole',   pos: 'TE', ovr: 74, spd: 72, str: 80, jmp: 74 },
    { id: 'lt1', name: 'Trent Williams', pos: 'LT', ovr: 88, spd: 56, str: 92, jmp: 58 },
    { id: 'lg1', name: 'Quenton Nelson', pos: 'LG', ovr: 85, spd: 54, str: 95, jmp: 55 },
    { id: 'c1',  name: 'Garrett Bradbury', pos: 'C', ovr: 78, spd: 55, str: 88, jmp: 52 },
    { id: 'rg1', name: 'Penei Sewell',   pos: 'RG', ovr: 83, spd: 57, str: 91, jmp: 57 },
    { id: 'rt1', name: 'Rashawn Slater', pos: 'RT', ovr: 84, spd: 56, str: 90, jmp: 60 },
  ]
};

export const DEFAULT_OPPONENT = {
  name: 'Opponent',
  ab: 'OPP',
  clr: '#ef4444',
  ac: '#fca5a5',
  players: [
    { id: 'dl1', name: 'Reggie Stone', pos: 'DE',  ovr: 80, spd: 72, str: 88, jmp: 64 },
    { id: 'lb1', name: 'Carlos Vega',  pos: 'MLB', ovr: 77, spd: 78, str: 82, jmp: 70 },
    { id: 'cb1', name: 'Devon Nash',   pos: 'CB',  ovr: 81, spd: 90, str: 65, jmp: 86 },
    { id: 'cb2', name: 'Ray Foster',   pos: 'CB',  ovr: 74, spd: 86, str: 62, jmp: 80 },
    { id: 's1',  name: 'Mark Diaz',    pos: 'FS',  ovr: 76, spd: 82, str: 70, jmp: 76 },
  ]
};

// Load roster from GM export if available in localStorage
// P5: Handles full GM export format including coaching schemes
export function loadRoster() {
  try {
    const raw = localStorage.getItem('gm_roster_export');
    if (raw) {
      const data = JSON.parse(raw);
      // Normalize — GM exports {team, opponent} or a raw team object
      if (data.team && data.opponent) return { team: data.team, opponent: data.opponent, week: data.week, season: data.season, gameId: data.gameId || null, stadiumUpgrades: data.stadiumUpgrades || [], streak: data.streak || 0, difficulty: data.difficulty || 'normal', isRival: data.isRival || false, chemistry: data.chemistry || 75, _bridgeTs: data._ts || null };
      // Single team object from older export format
      if (data.players) return { team: data, opponent: DEFAULT_OPPONENT };
    }
  } catch {}
  return { team: DEFAULT_TEAM, opponent: DEFAULT_OPPONENT };
}
