import { state } from '../data/gameState.js';

const CALLS = [
  { id:'run_inside',  label:'Inside Run',   cat:'run',  tip:'RB up the gut' },
  { id:'run_outside', label:'Outside Run',  cat:'run',  tip:'Sweep the edge' },
  { id:'scramble',    label:'QB Scramble',  cat:'run',  tip:'QB takes off' },
  { id:'run_draw',    label:'Draw Play',    cat:'run',  tip:'RB delays — freezes D' },
  { id:'wildcat',     label:'Wildcat',      cat:'run',  tip:'RB takes snap — dual option' },
  { id:'end_around',  label:'End Around',   cat:'run',  tip:'WR takes snap — edge run' },
  { id:'read_option', label:'Read Option',  cat:'run',  tip:'QB reads DE — KEEP or PITCH' },
  { id:'pass_quick',  label:'Quick Pass',   cat:'pass', tip:'Safe — low INT risk' },
  { id:'pass_medium', label:'Medium Route', cat:'pass', tip:'Balanced timing' },
  { id:'pass_deep',   label:'Deep Shot',    cat:'pass', tip:'High risk / reward' },
  { id:'pass_action', label:'Play Action',  cat:'pass', tip:'Fake run — freezes DBs' },
  { id:'screen_pass',    label:'Screen Pass',   cat:'pass', tip:'RB flat — linemen release' },
  { id:'sideline_route', label:'Sideline Route', cat:'pass', tip:'WR out — clock stops' },
  { id:'te_seam',        label:'TE Seam',        cat:'pass', tip:'TE vertical — LB mismatch' },
  { id:'flea_flicker',   label:'Flea Flicker',   cat:'pass', tip:'Handoff → pitch back → deep' },
  // P98
  { id:'qb_kneel',       label:'QB Kneel',       cat:'run',  tip:'Lose 1 yd — kills clock' },
  // P107 / P109
  { id:'crossing_route', label:'Cross Route',    cat:'pass', tip:'TE cuts across — LB gap' },
  { id:'wr_bubble',      label:'WR Bubble',      cat:'pass', tip:'Quick flat — block develops' },
];

export class PlayCallScene extends Phaser.Scene {
  constructor() { super('PlayCall'); }

  // v37: Offensive formation data
  static get FORMATIONS() {
    return {
      shotgun: { label:'SHOTGUN', tip:'Pass boost · +8% comp · Deep routes', passBonus:0.08, runPenalty:-0.06, icon:'🎯' },
      i_form:  { label:'I-FORM',  tip:'Run power · +6% yards · Fumble shield', passBonus:-0.05, runBonus:0.06, icon:'💪' },
      pistol:  { label:'PISTOL',  tip:'Balanced · No modifiers · Reads D',  passBonus:0, runBonus:0, icon:'⚖️' },
      spread:  { label:'SPREAD',  tip:'WR space · +12% separation · Motion', passBonus:0.05, spreadBonus:true, icon:'↔️' },
    };
  }

  create() {
    if (state.down === 4) { this._show4thDown(); return; }
    if (state.possession !== 'team') { this._showCallGrid(); return; }
    this._showFormationSelect();
  }

  _showFormationSelect() {
    const W = this.scale.width, H = this.scale.height;
    const forms = PlayCallScene.FORMATIONS;
    const keys  = Object.keys(forms);
    const panelW = 370, panelH = 160;
    const px = W/2, py = H - panelH/2 - 8;

    const bg   = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.75).setDepth(30);
    const panel= this.add.rectangle(px, py, panelW, panelH, 0x0d1424, 1).setDepth(31).setStrokeStyle(1, 0x334155);

    this.add.text(px, py - panelH/2 + 10, 'SET FORMATION', {
      fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#94a3b8', letterSpacing:3
    }).setOrigin(0.5, 0).setDepth(32);

    const btnW = 82, btnH = 90, startX = px - ((keys.length-1) * (btnW+6))/2;
    keys.forEach((key, i) => {
      const f = forms[key];
      const cx = startX + i * (btnW + 6);
      const cy = py - panelH/2 + 76;
      const isActive = (state.offFormation || 'shotgun') === key;
      const accentHex = isActive ? '#38bdf8' : '#334155';
      const accent    = Phaser.Display.Color.HexStringToColor(accentHex).color;

      const box = this.add.rectangle(cx, cy, btnW, btnH, isActive ? 0x0c2233 : 0x111827, 1)
        .setDepth(31).setStrokeStyle(isActive ? 2 : 1, accent, isActive ? 0.9 : 0.5).setInteractive({ useHandCursor: true });

      this.add.text(cx, cy - 28, f.icon,    { fontSize:'18px', fontFamily:'monospace' }).setOrigin(0.5).setDepth(32);
      this.add.text(cx, cy - 4,  f.label,   { fontSize:'8px', fontFamily:'monospace', fontStyle:'bold', color: isActive ? '#38bdf8' : '#e2e8f0' }).setOrigin(0.5).setDepth(32);
      this.add.text(cx, cy + 14, f.tip,     { fontSize:'6px', fontFamily:'monospace', color:'#475569', wordWrap:{width:btnW-6}, align:'center' }).setOrigin(0.5, 0).setDepth(32);
      if (isActive) this.add.text(cx, cy - btnH/2 + 5, '✓', { fontSize:'7px', fontFamily:'monospace', color:'#38bdf8' }).setOrigin(0.5).setDepth(33);

      box.on('pointerover',  () => { if (!isActive) box.setFillStyle(0x1a2a3a, 1); });
      box.on('pointerout',   () => { if (!isActive) box.setFillStyle(0x111827, 1); });
      box.on('pointerdown',  () => {
        state.offFormation = key;
        this.children.removeAll(true);
        this._showCallGrid();
      });
    });

    // Auto-proceed after 3s if no input (keep existing formation)
    this._fmTimer = this.time.delayedCall(3000, () => {
      if (this.scene.isActive('PlayCall')) {
        this.children.removeAll(true);
        this._showCallGrid();
      }
    });
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

    // INNO I57: coach headset quote based on situation
    const _quotes=[
      'Take what they give you.','Trust the process.','Protect the ball.','Make your reads.',
      'Execution wins games.','Know your assignments.','One play at a time.','Finish strong.',
      'Attack the weakness.','Clock management is key.','Stay disciplined.','Set the edge.',
    ];
    const _dn=state.down,_tg=state.toGo;
    const _sitQ=_dn===3&&_tg>=8?'Attack the weakness.':_dn===1?'Take what they give you.':_dn===4?'Finish strong.':_quotes[Math.floor(Math.random()*_quotes.length)];
    this.add.text(px, py - panelH/2 + 46, `💬 "${_sitQ}"`,{fontSize:'7px',fontFamily:'monospace',color:'#334155',fontStyle:'italic'}).setOrigin(0.5,0).setDepth(32);

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
      te_seam:     (_d===2&&_t>=5&&_t<=12),
      wildcat:       (_d<=2&&_t<=4&&state.yardLine>=60),
      crossing_route:(_d===2&&_t>=5&&_t<=12)||(_d===3&&_t>=3&&_t<=8),
      wr_bubble:     (_d===3&&_t>=2&&_t<=7),
    };
    const runs   = CALLS.filter(c=>c.cat==='run');
    const passes = CALLS.filter(c=>c.cat==='pass');
    runs.forEach((c,i)   => this._makeBtn(c, px - 96, startY + i * (btnH+3), btnW, btnH, '#f59e0b', !!hlMap[c.id]));
    passes.forEach((c,i) => this._makeBtn(c, px + 96, startY + i * (btnH+3), btnW, btnH, '#3b82f6', !!hlMap[c.id]));

    // INNO I29: play call history sidebar — last 5 calls as compact list
    const _hist = state.callHistory||[];
    if(_hist.length){
      const _hx = px - panelW/2 - 70, _hy = py - panelH/2;
      this.add.rectangle(_hx,py,130,panelH,0x0a1020,0.88).setDepth(31).setStrokeStyle(1,0x1e3a5f,0.6);
      this.add.text(_hx,_hy+12,'LAST PLAYS',{fontSize:'7px',fontFamily:'monospace',fontStyle:'bold',color:'#334155',letterSpacing:2}).setOrigin(0.5,0).setDepth(32);
      _hist.slice(-5).reverse().forEach((h,i)=>{
        const _col = h.type==='td'?'#f59e0b':h.yards<0?'#ef4444':h.yards>0?'#22c55e':'#475569';
        const _ydTxt = h.yards>0?`+${h.yards}`:`${h.yards}`;
        const _lbl = CALLS.find(c=>c.id===h.call)?.label||h.call;
        this.add.text(_hx,_hy+28+i*22,_lbl.substring(0,13),{fontSize:'8px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5,0).setDepth(32);
        this.add.text(_hx,_hy+40+i*22,h.type==='td'?'TOUCHDOWN':h.type==='int'?'INTERCEPT':h.type==='fum'?'FUMBLE':_ydTxt+' yds',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:_col}).setOrigin(0.5,0).setDepth(32);
      });
    }
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
    // INNO I29: annotate previous call with result, then record new call
    const _prev = state.callHistory[state.callHistory.length-1];
    if(_prev && !_prev.yards && state.lastResult){
      _prev.yards  = state.lastResult.yards || 0;
      _prev.type   = state.lastResult.td?'td':state.lastResult.turnover&&state.lastResult.text?.includes('INT')?'int':state.lastResult.turnover?'fum':'play';
    }
    state.callHistory = [...(state.callHistory||[]).slice(-9), {call:callId, yards:0, type:'play'}];
    const field = this.scene.get('Field');
    field?.events.emit('playCalled', callId);
    this.scene.stop();
  }
}
