// Default roster used when no GM save is imported.
// Shape mirrors Gridiron GM player objects.
export const DEFAULT_TEAM = {
  name: 'Your Team',
  ab: 'YT',
  clr: '#22c55e',
  ac: '#86efac',
  players: [
    { id: 'qb1', name: 'Alex Carter',   pos: 'QB', ovr: 82, spd: 68, str: 62 },
    { id: 'rb1', name: 'Marcus Webb',   pos: 'RB', ovr: 79, spd: 88, str: 74 },
    { id: 'wr1', name: 'DeShawn Hill',  pos: 'WR', ovr: 84, spd: 93, str: 58 },
    { id: 'wr2', name: 'Tyrell Banks',  pos: 'WR', ovr: 76, spd: 87, str: 55 },
    { id: 'te1', name: 'Jordan Cole',   pos: 'TE', ovr: 74, spd: 72, str: 80 },
    { id: 'ol1', name: 'OL Unit',       pos: 'OL', ovr: 77, spd: 55, str: 90 },
  ]
};

export const DEFAULT_OPPONENT = {
  name: 'Opponent',
  ab: 'OPP',
  clr: '#ef4444',
  ac: '#fca5a5',
  players: [
    { id: 'dl1', name: 'Reggie Stone', pos: 'DL', ovr: 80, spd: 72, str: 88 },
    { id: 'lb1', name: 'Carlos Vega',  pos: 'LB', ovr: 77, spd: 78, str: 82 },
    { id: 'cb1', name: 'Devon Nash',   pos: 'CB', ovr: 81, spd: 90, str: 65 },
    { id: 'cb2', name: 'Ray Foster',   pos: 'CB', ovr: 74, spd: 86, str: 62 },
    { id: 's1',  name: 'Mark Diaz',    pos: 'S',  ovr: 76, spd: 82, str: 70 },
  ]
};

// Load roster from GM export if available in localStorage
export function loadRoster() {
  try {
    const raw = localStorage.getItem('gm_roster_export');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { team: DEFAULT_TEAM, opponent: DEFAULT_OPPONENT };
}
