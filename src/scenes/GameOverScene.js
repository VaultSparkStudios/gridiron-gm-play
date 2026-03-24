import { state, exportStats } from '../data/gameState.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const stats = exportStats();
    const won = state.score.team > state.score.opp;

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

    // Export notice
    this.add.text(W/2, 368, '✅ Stats saved — import to Gridiron GM to update your season', {
      fontSize:'9px', fontFamily:'monospace', color:'#334155'
    }).setOrigin(0.5);

    // Buttons
    const playAgain = this.add.rectangle(W/2-90, 410, 160, 40, 0x22c55e).setInteractive({ useHandCursor:true });
    this.add.text(W/2-90, 410, 'PLAY AGAIN', { fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#fff' }).setOrigin(0.5);
    playAgain.on('pointerdown', ()=>this.scene.start('Boot'));
    playAgain.on('pointerover', ()=>playAgain.setFillStyle(0x16a34a));
    playAgain.on('pointerout',  ()=>playAgain.setFillStyle(0x22c55e));

    const menu = this.add.rectangle(W/2+90, 410, 160, 40, 0x1e293b).setInteractive({ useHandCursor:true }).setStrokeStyle(1,0x334155);
    this.add.text(W/2+90, 410, 'MAIN MENU', { fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#94a3b8' }).setOrigin(0.5);
    menu.on('pointerdown', ()=>this.scene.start('Boot'));
  }
}
