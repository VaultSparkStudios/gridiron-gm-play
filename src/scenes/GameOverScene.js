import { state, exportStats } from '../data/gameState.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const stats = exportStats();
    const won = state.score.team > state.score.opp;

    this.add.rectangle(W/2, H/2, W, H, 0x0a0f1a, 0.96);

    this.add.text(W/2, 70, won ? '🏆 VICTORY!' : '❌ DEFEAT', {
      fontSize: '40px', fontFamily: 'monospace', fontStyle: 'bold',
      color: won ? '#f59e0b' : '#ef4444',
      stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    const t = state.team?.ab || 'YOU';
    const o = state.opponent?.ab || 'OPP';
    this.add.text(W/2, 130, `${t} ${state.score.team} — ${state.score.opp} ${o}`, {
      fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: '#f1f5f9'
    }).setOrigin(0.5);

    // Stat box
    const ts = stats.team;
    const statLines = [
      `Passing Yards:  ${ts.passYds}`,
      `Rushing Yards:  ${ts.rushYds}`,
      `Touchdowns:     ${ts.td}`,
      `Interceptions:  ${ts.int}`,
      `Fumbles:        ${ts.fumble}`,
    ];

    this.add.rectangle(W/2, 265, 320, 145, 0x1e293b).setStrokeStyle(1, 0x334155);
    this.add.text(W/2, 200, 'YOUR STATS', { fontSize: '10px', fontFamily: 'monospace', fontStyle: 'bold', color: '#64748b', letterSpacing: 3 }).setOrigin(0.5);
    statLines.forEach((l, i) => {
      this.add.text(W/2 - 140, 215 + i * 22, l, { fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8' });
    });

    // Export notice
    this.add.text(W/2, 355, '✅ Stats saved — import to Gridiron GM to update your season', {
      fontSize: '9px', fontFamily: 'monospace', color: '#334155'
    }).setOrigin(0.5);

    // Buttons
    const playAgain = this.add.rectangle(W/2 - 90, 410, 160, 40, 0x22c55e).setInteractive({ useHandCursor: true });
    this.add.text(W/2 - 90, 410, 'PLAY AGAIN', { fontSize: '12px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5);
    playAgain.on('pointerdown', () => this.scene.start('Boot'));

    const menu = this.add.rectangle(W/2 + 90, 410, 160, 40, 0x1e293b).setInteractive({ useHandCursor: true }).setStrokeStyle(1, 0x334155);
    this.add.text(W/2 + 90, 410, 'MAIN MENU', { fontSize: '12px', fontFamily: 'monospace', fontStyle: 'bold', color: '#94a3b8' }).setOrigin(0.5);
    menu.on('pointerdown', () => this.scene.start('Boot'));

    playAgain.on('pointerover', () => playAgain.setFillStyle(0x16a34a));
    playAgain.on('pointerout',  () => playAgain.setFillStyle(0x22c55e));
  }
}
