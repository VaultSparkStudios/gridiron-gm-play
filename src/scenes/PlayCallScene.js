import { state } from '../data/gameState.js';

const CALLS = [
  { id:'run_inside',  label:'Inside Run',   cat:'run',  tip:'RB up the gut' },
  { id:'run_outside', label:'Outside Run',  cat:'run',  tip:'Sweep the edge' },
  { id:'scramble',    label:'QB Scramble',  cat:'run',  tip:'QB takes off' },
  { id:'run_draw',    label:'Draw Play',    cat:'run',  tip:'RB delays — freezes D' },
  { id:'pass_quick',  label:'Quick Pass',   cat:'pass', tip:'Safe — low INT risk' },
  { id:'pass_medium', label:'Medium Route', cat:'pass', tip:'Balanced timing' },
  { id:'pass_deep',   label:'Deep Shot',    cat:'pass', tip:'High risk / reward' },
  { id:'pass_action', label:'Play Action',  cat:'pass', tip:'Fake run — freezes DBs' },
];

export class PlayCallScene extends Phaser.Scene {
  constructor() { super('PlayCall'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const panelW = 370, panelH = 310;
    const px = W/2, py = H - panelH/2 - 8;

    // Opaque dark backdrop — completely covers field text behind panel
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.88).setDepth(30);

    // Panel frame
    this.add.rectangle(px, py, panelW, panelH, 0x0d1424, 1)
      .setDepth(31).setStrokeStyle(1, 0x334155);

    // Header
    this.add.text(px, py - panelH/2 + 14, '🎮  CALL YOUR PLAY', {
      fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#f1f5f9', letterSpacing:2
    }).setOrigin(0.5, 0).setDepth(32);

    // Down & distance line
    const dn = ['','1st','2nd','3rd','4th'][state.down] || '';
    this.add.text(px, py - panelH/2 + 30, `${dn} & ${state.toGo}  •  Yd ${state.yardLine}`, {
      fontSize:'10px', fontFamily:'monospace', color:'#64748b'
    }).setOrigin(0.5, 0).setDepth(32);

    // Column headers
    const btnW=166, btnH=46, startY = py - panelH/2 + 68;
    this.add.text(px - 96, startY - 12, '🦶 RUN',  { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#f59e0b' }).setOrigin(0.5,0).setDepth(32);
    this.add.text(px + 96, startY - 12, '🏈 PASS', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#3b82f6' }).setOrigin(0.5,0).setDepth(32);

    const runs   = CALLS.filter(c=>c.cat==='run');
    const passes = CALLS.filter(c=>c.cat==='pass');
    runs.forEach((c,i)   => this._makeBtn(c, px - 96, startY + i * (btnH+5), btnW, btnH, '#f59e0b'));
    passes.forEach((c,i) => this._makeBtn(c, px + 96, startY + i * (btnH+5), btnW, btnH, '#3b82f6'));
  }

  _makeBtn(call, cx, cy, w, h, accentHex) {
    const accent = Phaser.Display.Color.HexStringToColor(accentHex).color;
    const bg = this.add.rectangle(cx, cy, w, h, 0x1a2438, 1)
      .setDepth(32).setStrokeStyle(1, accent, 0.35).setInteractive({ useHandCursor:true });
    const label = this.add.text(cx, cy - 8, call.label,
      { fontSize:'11px', fontFamily:'monospace', fontStyle:'bold', color:'#e2e8f0' }).setOrigin(0.5).setDepth(33);
    const tip = this.add.text(cx, cy + 9, call.tip,
      { fontSize:'8px', fontFamily:'monospace', color:'#475569' }).setOrigin(0.5).setDepth(33);

    bg.on('pointerover', ()=>{ bg.setFillStyle(accent, 0.18); label.setColor(accentHex); tip.setColor('#94a3b8'); });
    bg.on('pointerout',  ()=>{ bg.setFillStyle(0x1a2438, 1);  label.setColor('#e2e8f0'); tip.setColor('#475569'); });
    bg.on('pointerdown', ()=>this._select(call.id));
  }

  _select(callId) {
    const field = this.scene.get('Field');
    field?.events.emit('playCalled', callId);
    this.scene.stop();
  }
}
