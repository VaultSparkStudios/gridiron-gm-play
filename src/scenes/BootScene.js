import { loadRoster } from '../data/defaultRoster.js';
import { state, resetState } from '../data/gameState.js';
import { track } from '../utils/analytics.js';


export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    resetState();
    const { team, opponent, week, season, gameId, stadiumUpgrades, streak, difficulty, isRival, chemistry } = loadRoster();
    state.team = team;
    state.opponent = opponent;
    state.gameId = gameId || null;
    state.stadiumUpgrades = stadiumUpgrades || [];
    state.streak = streak || 0;
    state.difficulty = difficulty || 'normal';
    state.isRival = isRival || false;
    state.chemistry = chemistry || 75;
    const wxRoll = Math.random();
    state.weather = wxRoll < 0.60 ? 'clear' : wxRoll < 0.83 ? 'rain' : 'snow';
    track('game_boot', { week: week||0, season: season||0 });

    this.add.rectangle(W/2, H/2, W, H, 0x0a0f1a);

    this.add.text(W/2, H/2 - 100, 'GRIDIRON GM', {
      fontSize:'48px', fontFamily:'monospace', fontStyle:'bold',
      color:'#22c55e', stroke:'#000', strokeThickness:4
    }).setOrigin(0.5);

    this.add.text(W/2, H/2 - 52, 'PLAY', {
      fontSize:'22px', fontFamily:'monospace', color:'#94a3b8', letterSpacing:8
    }).setOrigin(0.5);

    // Matchup line
    const tName = team.name     || 'Your Team';
    const oName = opponent.name || 'Opponent';
    this.add.text(W/2, H/2 - 14, `${tName}  vs  ${oName}`, {
      fontSize:'15px', fontFamily:'monospace', fontStyle:'bold', color:'#f1f5f9'
    }).setOrigin(0.5);

    // Records & week
    const tRec = team.record     || '';
    const oRec = opponent.record || '';
    const weekStr = week   ? `Week ${week}` : '';
    const recStr  = (tRec || oRec) ? `${tRec}  •  ${oRec}` : '';
    const subLine = [weekStr, recStr].filter(Boolean).join('   |   ');
    if (subLine) {
      this.add.text(W/2, H/2 + 10, subLine, {
        fontSize:'10px', fontFamily:'monospace', color:'#64748b'
      }).setOrigin(0.5);
    }

    // Scheme badges
    const schemes = [team.ocScheme, team.dcScheme, opponent.dcScheme].filter(Boolean);
    if (schemes.length) {
      this.add.text(W/2, H/2 + 26, schemes.join('  /  '), {
        fontSize:'9px', fontFamily:'monospace', color:'#334155'
      }).setOrigin(0.5);
    }

    // Key matchup card
    const tPlayers = team.players     || [];
    const oPlayers = opponent.players || [];
    const tLT  = tPlayers.find(p => p.pos === 'LT') || tPlayers.find(p => ['LT','LG','C','RG','RT'].includes(p.pos));
    const oDE  = oPlayers.reduce((best, p) => (['DE','DL'].includes(p.pos) && (!best || p.ovr > best.ovr)) ? p : best, null);
    const tQB  = tPlayers.find(p => p.pos === 'QB');
    const oCB  = oPlayers.reduce((best, p) => (p.pos === 'CB' && (!best || p.ovr > best.ovr)) ? p : best, null);

    const matchups = [];
    if (tLT && oDE)  matchups.push({ label: 'LT vs DE', home: tLT.name  || 'LT',  homeOvr: tLT.ovr,  away: oDE.name  || 'DE',  awayOvr: oDE.ovr });
    if (tQB && oCB)  matchups.push({ label: 'QB vs CB', home: tQB.name  || 'QB',  homeOvr: tQB.ovr,  away: oCB.name  || 'CB',  awayOvr: oCB.ovr });

    if (matchups.length) {
      const mx = W/2, my = H/2 + 42;
      this.add.text(mx, my, 'KEY MATCHUPS', {
        fontSize:'7px', fontFamily:'monospace', fontStyle:'bold', color:'#334155', letterSpacing:3
      }).setOrigin(0.5);
      matchups.forEach(({ label, home, homeOvr, away, awayOvr }, i) => {
        const y = my + 11 + i * 14;
        const adv = homeOvr >= awayOvr ? '#22c55e' : '#ef4444';
        const homeShort = home.split(' ').pop();
        const awayShort = away.split(' ').pop();
        this.add.text(mx, y, `${homeShort} (${homeOvr})  vs  ${awayShort} (${awayOvr})`, {
          fontSize:'8px', fontFamily:'monospace', color:'#64748b'
        }).setOrigin(0.5);
        this.add.text(mx + 94, y, homeOvr >= awayOvr ? '▲' : '▼', {
          fontSize:'9px', fontFamily:'monospace', color: adv
        }).setOrigin(0.5);
      });
    }

    // Rival intro card
    if (state.isRival) {
      const rivBg = this.add.rectangle(W/2, H/2 + 64, W-24, 24, 0xf97316, 0.15).setStrokeStyle(1, 0xf97316, 0.7);
      this.add.text(W/2, H/2 + 64, '🔥 RIVALRY GAME', {
        fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#f97316', letterSpacing:3
      }).setOrigin(0.5);
      this.tweens.add({ targets: rivBg, alpha: 0.06, duration: 700, yoyo: true, repeat: -1 });
    }

    // Streak badge — offset avoids rivalry card (rival: 80, no rival: 64)
    if (Math.abs(state.streak) >= 2) {
      const sCol = state.streak > 0 ? '#22c55e' : '#ef4444';
      const sLbl = state.streak > 0 ? `🔥 W${state.streak} STREAK` : `❄️ L${Math.abs(state.streak)} STREAK`;
      this.add.text(W/2, H/2 + (state.isRival ? 80 : 64), sLbl, {
        fontSize:'8px', fontFamily:'monospace', fontStyle:'bold', color: sCol, letterSpacing:2
      }).setOrigin(0.5);
    }

    // Weather badge — fixed at H/2+92 so streak/rival badges never overlap
    const wxLabel = { clear:'☀️ CLEAR', rain:'🌧️ RAIN', snow:'❄️ SNOW' }[state.weather];
    const wxClr   = { clear:'#f59e0b',  rain:'#3b82f6',  snow:'#93c5fd'  }[state.weather];
    this.add.text(W/2, H/2 + 92, wxLabel, {
      fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:wxClr, letterSpacing:3
    }).setOrigin(0.5);

    // Difficulty badge (I25/I46)
    const _dLabel = { rookie:'CASUAL', normal:'STANDARD', veteran:'VETERAN', hof:'HARDCORE', casual:'CASUAL', standard:'STANDARD', hardcore:'HARDCORE' }[state.difficulty]||'STANDARD';
    const _dClr   = { casual:'#22c55e', rookie:'#22c55e', standard:'#3b82f6', normal:'#3b82f6', veteran:'#f59e0b', hardcore:'#ef4444', hof:'#ef4444' }[state.difficulty]||'#3b82f6';
    this.add.text(W - 10, 10, `${_dLabel}`, { fontSize:'7px', fontFamily:'monospace', fontStyle:'bold', color:_dClr, letterSpacing:2 }).setOrigin(1,0);

    // Kick Off button
    const btn = this.add.rectangle(W/2, H/2 + 100, 210, 46, 0x22c55e).setInteractive({ useHandCursor:true });
    this.add.text(W/2, H/2 + 100, 'KICK OFF', {
      fontSize:'16px', fontFamily:'monospace', fontStyle:'bold', color:'#fff'
    }).setOrigin(0.5);
    btn.on('pointerover', ()=>btn.setFillStyle(0x16a34a));
    btn.on('pointerout',  ()=>btn.setFillStyle(0x22c55e));
    btn.on('pointerdown', ()=>{
      this.scene.start('Field');
      this.scene.start('Hud');
      this.scene.bringToTop('Hud');
    });

    this.add.text(W/2, H - 24,
      'WASD / Arrows to move  •  SPACE to juke  •  Click receivers to throw',
      { fontSize:'10px', fontFamily:'monospace', color:'#334155' }
    ).setOrigin(0.5);
  }
}
