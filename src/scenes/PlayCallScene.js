import { state } from '../data/gameState.js';

const CALLS = [
  { id:'run_inside',  label:'Inside Run',   cat:'run',  tip:'RB up the gut' },
  { id:'run_outside', label:'Outside Run',  cat:'run',  tip:'Sweep the edge' },
  { id:'scramble',    label:'QB Scramble',  cat:'run',  tip:'QB takes off' },
  { id:'run_draw',    label:'Draw Play',    cat:'run',  tip:'RB delays — freezes D' },
  { id:'wildcat',     label:'Wildcat',      cat:'run',  tip:'RB takes snap — dual option' },
  { id:'end_around',  label:'End Around',   cat:'run',  tip:'WR takes snap — edge run' },
  { id:'pass_quick',  label:'Quick Pass',   cat:'pass', tip:'Safe — low INT risk' },
  { id:'pass_medium', label:'Medium Route', cat:'pass', tip:'Balanced timing' },
  { id:'pass_deep',   label:'Deep Shot',    cat:'pass', tip:'High risk / reward' },
  { id:'pass_action', label:'Play Action',  cat:'pass', tip:'Fake run — freezes DBs' },
  { id:'screen_pass',    label:'Screen Pass',   cat:'pass', tip:'RB flat — linemen release' },
  { id:'sideline_route', label:'Sideline Route', cat:'pass', tip:'WR out — clock stops' },
  { id:'te_seam',        label:'TE Seam',        cat:'pass', tip:'TE vertical — LB mismatch' },
  { id:'flea_flicker',   label:'Flea Flicker',   cat:'pass', tip:'Handoff → pitch back → deep' },
];

export class PlayCallScene extends Phaser.Scene {
  constructor() { super('PlayCall'); }

  create() {
    if (state.down === 4) { this._show4thDown(); return; }
    this._showCallGrid();
  }

  _showCallGrid() {
    const W = this.scale.width, H = this.scale.height;
    const panelW = 370, panelH = 380;
    const px = W/2, py = H - panelH/2 - 8;

    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.88).setDepth(30);
    this.add.rectangle(px, py, panelW, panelH, 0x0d1424, 1).setDepth(31).setStrokeStyle(1, 0x334155);

    this.add.text(px, py - panelH/2 + 14, '🎮  CALL YOUR PLAY', {
      fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#f1f5f9', letterSpacing:2
    }).setOrigin(0.5, 0).setDepth(32);

    const dn = ['','1st','2nd','3rd','4th'][state.down] || '';
    this.add.text(px, py - panelH/2 + 30, `${dn} & ${state.toGo}  •  Yd ${state.yardLine}`, {
      fontSize:'10px', fontFamily:'monospace', color:'#64748b'
    }).setOrigin(0.5, 0).setDepth(32);

    const btnW=166, btnH=38, startY = py - panelH/2 + 68;
    this.add.text(px - 96, startY - 12, '🦶 RUN',  { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#f59e0b' }).setOrigin(0.5,0).setDepth(32);
    this.add.text(px + 96, startY - 12, '🏈 PASS', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#3b82f6' }).setOrigin(0.5,0).setDepth(32);

    // P1: situational play highlights based on down & distance
    const _d=state.down, _t=state.toGo;
    const hlMap={
      run_inside:  (_d<=2&&_t<=3),
      run_outside: (_d===1&&_t>=5),
      run_draw:    (_d===2&&_t>=6),
      scramble:    (_d===3&&_t<=4),
      pass_quick:  (_d>=3&&_t<=6)||(_d===2&&_t<=8),
      pass_medium: (_d===2&&_t>=5&&_t<=10)||(_d===3&&_t>=5&&_t<=10),
      pass_deep:   (_d===1&&_t>=10)||(_d===3&&_t>=12),
      pass_action: (_d<=2&&_t>=4),
      screen_pass: (_d===3&&_t>=7&&_t<=14),
      sideline_route:(_d===3&&_t>=3&&state.quarter>=4),
      end_around:  (_d<=2&&_t<=5),
      flea_flicker:(_d===1&&_t>=10),
    };
    const runs   = CALLS.filter(c=>c.cat==='run');
    const passes = CALLS.filter(c=>c.cat==='pass');
    runs.forEach((c,i)   => this._makeBtn(c, px - 96, startY + i * (btnH+3), btnW, btnH, '#f59e0b', !!hlMap[c.id]));
    passes.forEach((c,i) => this._makeBtn(c, px + 96, startY + i * (btnH+3), btnW, btnH, '#3b82f6', !!hlMap[c.id]));
  }

  _show4thDown() {
    const W = this.scale.width, H = this.scale.height;
    const panelW = 370, panelH = 210;
    const px = W/2, py = H - panelH/2 - 8;

    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.88).setDepth(30);
    this.add.rectangle(px, py, panelW, panelH, 0x0d1424, 1).setDepth(31).setStrokeStyle(1, 0x7c3aed);

    this.add.text(px, py - panelH/2 + 14, '⚠  4TH DOWN DECISION', {
      fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#f59e0b', letterSpacing:2
    }).setOrigin(0.5, 0).setDepth(32);
    this.add.text(px, py - panelH/2 + 32, `4th & ${state.toGo}  •  Yd ${state.yardLine}`, {
      fontSize:'10px', fontFamily:'monospace', color:'#64748b'
    }).setOrigin(0.5, 0).setDepth(32);

    const fgDist = (100 - state.yardLine) + 17;
    const fgAvail = state.yardLine >= 62;
    const btnY = py - panelH/2 + 108;

    // PUNT — always available
    this._make4thBtn(px - 120, btnY, 'PUNT', 'Flip field — safe', 0x475569, '#94a3b8', () => this._select('punt'));

    // FG — range-gated
    if (fgAvail) {
      this._make4thBtn(px, btnY, 'FIELD GOAL', `${fgDist} yd attempt`, 0x166534, '#22c55e', () => this._select('fg'));
    } else {
      this.add.rectangle(px, btnY, 110, 62, 0x1a2438).setDepth(31).setStrokeStyle(1, 0x1e293b);
      this.add.text(px, btnY - 9, 'FIELD GOAL', { fontSize:'9px', fontFamily:'monospace', color:'#1e293b' }).setOrigin(0.5).setDepth(32);
      this.add.text(px, btnY + 8, `${fgDist} yds — out of range`, { fontSize:'7px', fontFamily:'monospace', color:'#1e293b' }).setOrigin(0.5).setDepth(32);
    }

    // GO FOR IT — reveals normal call grid
    this._make4thBtn(px + 120, btnY, 'GO FOR IT', 'Call a play', 0x78350f, '#f59e0b', () => {
      this.children.removeAll(true);
      this._showCallGrid();
    });
    // P88: QB Sneak — short yardage option
    if (state.toGo <= 2) {
      this._make4thBtn(px, btnY + 76, 'QB SNEAK', `${state.toGo} yd dive`, 0x1e3a5f, '#7dd3fc', () => this._select('qb_sneak'));
    }
  }

  _make4thBtn(cx, cy, label, sub, bgHex, textHex, cb) {
    const accent = Phaser.Display.Color.HexStringToColor(textHex).color;
    const bg = this.add.rectangle(cx, cy, 110, 62, bgHex, 0.22)
      .setDepth(31).setStrokeStyle(1, accent, 0.65).setInteractive({ useHandCursor:true });
    this.add.text(cx, cy - 10, label, { fontSize:'10px', fontFamily:'monospace', fontStyle:'bold', color:textHex }).setOrigin(0.5).setDepth(32);
    this.add.text(cx, cy + 10, sub,   { fontSize:'7px',  fontFamily:'monospace', color:'#475569' }).setOrigin(0.5).setDepth(32);
    bg.on('pointerover', ()=>bg.setFillStyle(bgHex, 0.5));
    bg.on('pointerout',  ()=>bg.setFillStyle(bgHex, 0.22));
    bg.on('pointerdown', cb);
  }

  _makeBtn(call, cx, cy, w, h, accentHex, highlight=false) {
    const accent = Phaser.Display.Color.HexStringToColor(accentHex).color;
    const bgBase = highlight ? 0x0f2218 : 0x1a2438;
    const bg = this.add.rectangle(cx, cy, w, h, bgBase, 1)
      .setDepth(32).setStrokeStyle(highlight?2:1, accent, highlight?0.80:0.35).setInteractive({ useHandCursor: true });
    const label = this.add.text(cx, cy - 8, call.label,
      { fontSize:'11px', fontFamily:'monospace', fontStyle:'bold', color: highlight?accentHex:'#e2e8f0' }).setOrigin(0.5).setDepth(33);
    const tip = this.add.text(cx, cy + 9, call.tip,
      { fontSize:'8px', fontFamily:'monospace', color:'#475569' }).setOrigin(0.5).setDepth(33);
    // P1: situational badge
    if(highlight)this.add.text(cx+w/2-6,cy-h/2+3,'★',{fontSize:'8px',fontFamily:'monospace',color:accentHex}).setOrigin(1,0).setDepth(34);

    bg.on('pointerover', ()=>{ bg.setFillStyle(accent, 0.22); label.setColor(accentHex); tip.setColor('#94a3b8'); });
    bg.on('pointerout',  ()=>{ bg.setFillStyle(bgBase, 1);    label.setColor(highlight?accentHex:'#e2e8f0'); tip.setColor('#475569'); });
    bg.on('pointerdown', ()=>this._select(call.id));
  }

  _select(callId) {
    const field = this.scene.get('Field');
    field?.events.emit('playCalled', callId);
    this.scene.stop();
  }
}
