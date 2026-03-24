import { state } from '../data/gameState.js';

const CALLS = [
  { id: 'run_inside',  label: 'Inside Run',   cat: 'run',  tip: 'RB up the gut — power move' },
  { id: 'run_outside', label: 'Outside Run',  cat: 'run',  tip: 'Sweep — use your speed' },
  { id: 'scramble',    label: 'QB Scramble',  cat: 'run',  tip: 'Take off — QB legs' },
  { id: 'pass_quick',  label: 'Quick Pass',   cat: 'pass', tip: 'Safe — low INT risk' },
  { id: 'pass_medium', label: 'Medium Route', cat: 'pass', tip: 'Balanced — WR timing' },
  { id: 'pass_deep',   label: 'Deep Shot',    cat: 'pass', tip: 'High risk / high reward' },
];

export class PlayCallScene extends Phaser.Scene {
  constructor() { super('PlayCall'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const panelW = 340, panelH = 260;
    const px = W/2, py = H - panelH/2 - 10;

    // Semi-transparent overlay
    this.overlay = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.45).setDepth(30);

    // Panel bg
    this.panel = this.add.rectangle(px, py, panelW, panelH, 0x0f172a, 0.97)
      .setDepth(31).setStrokeStyle(1, 0x334155);

    this.add.text(px, py - panelH/2 + 14, '🎮  CALL YOUR PLAY', {
      fontSize: '12px', fontFamily: 'monospace', fontStyle: 'bold', color: '#f1f5f9', letterSpacing: 2
    }).setOrigin(0.5, 0).setDepth(32);

    // Down info
    const dn = ['', '1st', '2nd', '3rd', '4th'][state.down] || '';
    this.add.text(px, py - panelH/2 + 32, `${dn} & ${state.toGo} • Yd ${state.yardLine}`, {
      fontSize: '10px', fontFamily: 'monospace', color: '#64748b'
    }).setOrigin(0.5, 0).setDepth(32);

    // Buttons — 2 columns (run | pass)
    const btnW = 148, btnH = 44;
    const startY = py - panelH/2 + 65;
    const runs  = CALLS.filter(c => c.cat === 'run');
    const passes = CALLS.filter(c => c.cat === 'pass');

    runs.forEach((c, i) => this._makeBtn(c, px - 88, startY + i * (btnH + 6), btnW, btnH, '#f59e0b'));
    passes.forEach((c, i) => this._makeBtn(c, px + 88, startY + i * (btnH + 6), btnW, btnH, '#3b82f6'));

    // Column headers
    this.add.text(px - 88, startY - 14, '🦶 RUN', { fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold', color: '#f59e0b' }).setOrigin(0.5, 0).setDepth(32);
    this.add.text(px + 88, startY - 14, '🏈 PASS', { fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold', color: '#3b82f6' }).setOrigin(0.5, 0).setDepth(32);
  }

  _makeBtn(call, cx, cy, w, h, accentHex) {
    const accent = Phaser.Display.Color.HexStringToColor(accentHex).color;
    const bg = this.add.rectangle(cx, cy, w, h, 0x1e293b, 1).setDepth(32).setStrokeStyle(1, accent, 0.4).setInteractive({ useHandCursor: true });
    const label = this.add.text(cx, cy - 7, call.label, { fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold', color: '#f1f5f9' }).setOrigin(0.5).setDepth(33);
    const tip   = this.add.text(cx, cy + 9, call.tip,   { fontSize: '8px',  fontFamily: 'monospace', color: '#64748b' }).setOrigin(0.5).setDepth(33);

    bg.on('pointerover', () => { bg.setFillStyle(accent, 0.2); label.setColor(accentHex); });
    bg.on('pointerout',  () => { bg.setFillStyle(0x1e293b, 1); label.setColor('#f1f5f9'); });
    bg.on('pointerdown', () => this._select(call.id));
  }

  _select(callId) {
    const field = this.scene.get('Field');
    field?.events.emit('playCalled', callId);
    this.scene.stop();
  }
}
