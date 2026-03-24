import { loadRoster } from '../data/defaultRoster.js';
import { state, resetState } from '../data/gameState.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    resetState();
    const { team, opponent, week, season } = loadRoster();
    state.team = team;
    state.opponent = opponent;

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

    // Kick Off button
    const btn = this.add.rectangle(W/2, H/2 + 74, 210, 46, 0x22c55e).setInteractive({ useHandCursor:true });
    this.add.text(W/2, H/2 + 74, 'KICK OFF', {
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
