import { loadRoster } from '../data/defaultRoster.js';
import { state, resetState } from '../data/gameState.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    resetState();
    const { team, opponent } = loadRoster();
    state.team = team;
    state.opponent = opponent;

    // Title screen
    this.add.rectangle(W/2, H/2, W, H, 0x0a0f1a);

    this.add.text(W/2, H/2 - 80, 'GRIDIRON GM', {
      fontSize: '48px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#22c55e', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(W/2, H/2 - 32, 'PLAY', {
      fontSize: '22px', fontFamily: 'monospace', color: '#94a3b8', letterSpacing: 8
    }).setOrigin(0.5);

    this.add.text(W/2, H/2 + 10, `${team.name || 'Your Team'} vs ${opponent.name || 'Opponent'}`, {
      fontSize: '14px', fontFamily: 'monospace', color: '#64748b'
    }).setOrigin(0.5);

    // Play button
    const btn = this.add.rectangle(W/2, H/2 + 80, 200, 44, 0x22c55e, 1).setInteractive({ useHandCursor: true });
    this.add.text(W/2, H/2 + 80, 'KICK OFF', {
      fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fff'
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x16a34a));
    btn.on('pointerout',  () => btn.setFillStyle(0x22c55e));
    btn.on('pointerdown', () => {
      this.scene.start('Field');
      this.scene.start('Hud');
      this.scene.bringToTop('Hud');
    });

    // Controls hint
    this.add.text(W/2, H - 24, 'WASD / Arrow Keys to move • SPACE to snap • Click receivers to throw', {
      fontSize: '10px', fontFamily: 'monospace', color: '#334155'
    }).setOrigin(0.5);
  }
}
