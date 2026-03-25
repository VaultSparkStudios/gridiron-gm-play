import { state, exportStats } from '../data/gameState.js';
import { track } from '../utils/analytics.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const stats = exportStats();
    const won = state.score.team > state.score.opp;
    track('game_complete', { won:won?1:0, score_team:state.score.team, score_opp:state.score.opp, plays:state.plays });

    this.add.rectangle(W/2, H/2, W, H, 0x0a0f1a, 0.96);

    this.add.text(W/2, 46, won ? '🏆 VICTORY!' : '❌ DEFEAT', {
      fontSize:'36px', fontFamily:'monospace', fontStyle:'bold',
      color:won?'#f59e0b':'#ef4444', stroke:'#000', strokeThickness:4
    }).setOrigin(0.5);

    const t = state.team?.ab||'YOU', o = state.opponent?.ab||'OPP';
    this.add.text(W/2, 96, `${t} ${state.score.team} — ${state.score.opp} ${o}`, {
      fontSize:'22px', fontFamily:'monospace', fontStyle:'bold', color:'#f1f5f9'
    }).setOrigin(0.5);

    // Team stats box
    const ts = stats.team;
    this.add.rectangle(W/2-190, 200, 200, 130, 0x1e293b).setOrigin(0,0.5).setStrokeStyle(1,0x334155);
    this.add.text(W/2-90, 152, 'YOUR STATS', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#64748b', letterSpacing:2 }).setOrigin(0.5);
    [
      `Pass Yds:  ${ts.passYds}`,
      `Rush Yds:  ${ts.rushYds}`,
      `TDs:       ${ts.td}`,
      `INTs:      ${ts.int}`,
    ].forEach((l,i) => this.add.text(W/2-185, 167+i*22, l, { fontSize:'11px', fontFamily:'monospace', color:'#94a3b8' }));

    // Opponent stats box
    const os = stats.opp;
    this.add.rectangle(W/2+10, 200, 200, 130, 0x1e293b).setOrigin(0,0.5).setStrokeStyle(1,0x334155);
    this.add.text(W/2+110, 152, 'OPP STATS', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#64748b', letterSpacing:2 }).setOrigin(0.5);
    [
      `Rush Yds:  ${os.rushYds}`,
      `TDs:       ${os.td}`,
    ].forEach((l,i) => this.add.text(W/2+15, 167+i*22, l, { fontSize:'11px', fontFamily:'monospace', color:'#64748b' }));

    // Per-player breakdown
    const pdelta = stats.playerDeltas || [];
    if (pdelta.length > 0) {
      this.add.text(W/2, 252, 'PLAYER LOG', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#334155', letterSpacing:3 }).setOrigin(0.5);
      let row = 0;
      pdelta.forEach(p => {
        const parts = [];
        if (p.passYds)  parts.push(`${p.comp||0}/${p.att||0} ${p.passYds}py`);
        if (p.rushYds)  parts.push(`${p.rushAtt||0}ca ${p.rushYds}ry`);
        if (p.recYds)   parts.push(`${p.rec||0}rec ${p.recYds}ry`);
        if (p.td)       parts.push(`${p.td}TD`);
        if (p.int)      parts.push(`${p.int}INT`);
        if (parts.length === 0) return;
        const line = `${p.name.split(' ').pop()} (${p.pos}): ${parts.join(' ')}`;
        this.add.text(W/2, 266+row*16, line, { fontSize:'9px', fontFamily:'monospace', color:'#475569' }).setOrigin(0.5);
        row++;
      });
    }

    // Drive chart
    if (state.drives && state.drives.length) {
      this.add.text(W/2, 348, 'DRIVE CHART', { fontSize:'7px', fontFamily:'monospace', fontStyle:'bold', color:'#334155', letterSpacing:3 }).setOrigin(0.5);
      let tRow=0, oRow=0;
      state.drives.slice(0,10).forEach(d => {
        const isTeam = d.poss==='team';
        const row = isTeam ? tRow++ : oRow++;
        const x = isTeam ? W/2-190 : W/2+10;
        const col = (d.result==='TD'||d.result==='FG') ? '#22c55e' : (d.result==='INT'||d.result==='FUM') ? '#ef4444' : '#475569';
        this.add.text(x, 358+row*12, `${d.plays}pl · ${d.yards}yd → ${d.result}`, { fontSize:'8px', fontFamily:'monospace', color:col });
      });
    }

    // Injury report
    if (state.injuries && state.injuries.length > 0) {
      const injNames = state.injuries.map(i => {
        const pl = state.team?.players?.find(p => p.id === i.id);
        return `${pl?.name?.split(' ').pop() || i.pos} (${i.weeks}wk)`;
      }).join(', ');
      this.add.text(W/2, 376, `🚑 INJURED: ${injNames}`, {
        fontSize:'9px', fontFamily:'monospace', color:'#ef4444'
      }).setOrigin(0.5);
    }

    // Export notice
    this.add.text(W/2, 392, '✅ Stats saved — import to Gridiron GM to update your season', {
      fontSize:'9px', fontFamily:'monospace', color:'#334155'
    }).setOrigin(0.5);

    // Buttons
    const playAgain = this.add.rectangle(W/2-90, 430, 160, 40, 0x22c55e).setInteractive({ useHandCursor:true });
    this.add.text(W/2-90, 430, 'PLAY AGAIN', { fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#fff' }).setOrigin(0.5);
    playAgain.on('pointerdown', ()=>this.scene.start('Boot'));
    playAgain.on('pointerover', ()=>playAgain.setFillStyle(0x16a34a));
    playAgain.on('pointerout',  ()=>playAgain.setFillStyle(0x22c55e));

    const menu = this.add.rectangle(W/2+90, 430, 160, 40, 0x1e293b).setInteractive({ useHandCursor:true }).setStrokeStyle(1,0x334155);
    this.add.text(W/2+90, 430, 'MAIN MENU', { fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#94a3b8' }).setOrigin(0.5);
    menu.on('pointerdown', ()=>this.scene.start('Boot'));
  }
}
