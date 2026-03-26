import { state } from '../data/gameState.js';

const C = { gn:'#22c55e', rd:'#ef4444', gd:'#f59e0b', bl:'#3b82f6', mt:'#64748b', tx:'#f1f5f9', bg:'#0a0f1a', cd:'#1e293b', bd:'#334155' };

export class HudScene extends Phaser.Scene {
  constructor() { super('Hud'); }

  create() {
    const W=this.scale.width;
    const HH=52; // HUD bar height

    // ── BACKGROUND ──────────────────────────────────────────────────────────
    this.add.rectangle(W/2, HH/2, W, HH, 0x050d18, 0.98).setDepth(20);
    this.add.rectangle(W/2, HH-0.5, W, 1.5, 0x1e3a5f, 0.85).setDepth(20);
    // Inner top highlight line
    this.add.rectangle(W/2, 0.5, W, 1, 0x1e3a5f, 0.5).setDepth(20);

    // ── TEAM COLOR ACCENTS (side bars) ────────────────────────────────────
    const tc=state.team?.clr||'#22c55e';
    const oc=state.opponent?.clr||'#ef4444';
    const tcInt=Phaser.Display.Color.HexStringToColor(tc).color;
    const ocInt=Phaser.Display.Color.HexStringToColor(oc).color;
    this.add.rectangle(3,HH/2,5,HH-4,tcInt,0.90).setDepth(21);
    this.add.rectangle(W-3,HH/2,5,HH-4,ocInt,0.90).setDepth(21);

    // ── TEAM SCORE BLOCKS ─────────────────────────────────────────────────
    // Left block background (team)
    this.add.rectangle(70,HH/2,130,HH-6,tcInt,0.10).setDepth(20);
    // Right block background (opponent)
    this.add.rectangle(W-70,HH/2,130,HH-6,ocInt,0.10).setDepth(20);

    // Vertical dividers
    this.add.rectangle(138,HH/2,1,HH-8,0x1e3a5f,0.7).setDepth(20);
    this.add.rectangle(W-138,HH/2,1,HH-8,0x1e3a5f,0.7).setDepth(20);

    // Team abbreviation (left)
    const tAb=(state.team?.ab||'YOU').toUpperCase();
    this.add.text(12,HH/2-9,tAb,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:tc,letterSpacing:2}).setOrigin(0,0.5).setDepth(21);
    // Team score (left, large)
    this.scoreTxtT=this.add.text(12,HH/2+6,String(state.score.team),{fontSize:'20px',fontFamily:'monospace',fontStyle:'bold',color:'#f1f5f9'}).setOrigin(0,0.5).setDepth(21);

    // Opponent abbreviation (right)
    const oAb=(state.opponent?.ab||'OPP').toUpperCase();
    this.add.text(W-12,HH/2-9,oAb,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:oc,letterSpacing:2}).setOrigin(1,0.5).setDepth(21);
    // Opponent score (right, large)
    this.scoreTxtO=this.add.text(W-12,HH/2+6,String(state.score.opp),{fontSize:'20px',fontFamily:'monospace',fontStyle:'bold',color:'#f1f5f9'}).setOrigin(1,0.5).setDepth(21);

    // ── CENTER: QUARTER + DOWN & DISTANCE ─────────────────────────────────
    this.qtrTxt=this.add.text(W/2,6,`Q${state.quarter}`,{
      fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#3b82f6',letterSpacing:3
    }).setOrigin(0.5,0).setDepth(21);

    this.downTxt=this.add.text(W/2,19,this._downStr(),{
      fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#f1f5f9'
    }).setOrigin(0.5,0).setDepth(21);

    // Phase indicator (small, right side of center)
    this.phaseTxt=this.add.text(W-14,38,'⏸ PRE-SNAP',{
      fontSize:'8px',fontFamily:'monospace',color:'#475569'
    }).setOrigin(1,0).setDepth(21);

    // INNO I12 [SIL]: QB streak indicator — 🔥 hot / ❄️ cold badge
    this.streakTxt=this.add.text(W/2+10,38,'',{
      fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b'
    }).setOrigin(0,0).setDepth(21);

    // ── H3: FIRST-DOWN PROGRESS BAR ────────────────────────────────────────
    this._ydBarBg=this.add.rectangle(W/2,HH+3,W,5,0x0f172a,0.95).setDepth(20);
    this._ydBar=this.add.rectangle(2,HH+3,2,5,0x22c55e,1).setDepth(21).setOrigin(0,0.5);
    this._updateYdBar();

    // ── POSSESSION BANNER ──────────────────────────────────────────────────
    this.possBanner=this.add.text(W/2,HH+10,'',{
      fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:C.gn
    }).setOrigin(0.5,0).setDepth(22).setAlpha(0);

    // ── PLAY RESULT FLASH (mid-screen) ─────────────────────────────────────
    this.resultTxt=this.add.text(W/2,456,'',{
      fontSize:'22px',fontFamily:'monospace',fontStyle:'bold',
      color:C.gn,stroke:'#000000',strokeThickness:4
    }).setOrigin(0.5).setDepth(22).setAlpha(0);

    // Keep scoreTxt alias for backward compat
    this.scoreTxt=this.scoreTxtT;

    // ── EVENT LISTENERS ────────────────────────────────────────────────────
    const field=this.scene.get('Field');
    if(field){
      field.events.on('phaseChange',      this._onPhaseChange,      this);
      field.events.on('playResult',       this._onPlayResult,       this);
      field.events.on('possessionChange', this._onPossessionChange, this);
    }
    this.events.on('resetHud',           this._refresh,            this);
    this.events.on('playResult',         this._onPlayResult,       this);
    this.events.on('possessionChange',   this._onPossessionChange, this);
  }

  _scoreStr() {
    const t=state.team?.ab||'YOU',o=state.opponent?.ab||'OPP';
    return `${t} ${state.score.team} — ${state.score.opp} ${o}`;
  }

  _downStr() {
    if(state.possession==='opp') return `OPP BALL  •  DEF`;
    const dn=['','1ST','2ND','3RD','4TH'][state.down]||'';
    return `${dn} & ${state.toGo}  •  YD ${state.yardLine}`;
  }

  _onPhaseChange(phase) {
    const labels={run:'🦶 RUNNING',pass:'🎯 PASSING',presnap:'⏸ PRE-SNAP',result:'✅ RESULT',ai_run:'🛡 DEFEND'};
    const colors={run:C.gd,pass:C.bl,presnap:C.mt,result:C.gn,ai_run:C.rd};
    this.phaseTxt.setText(labels[phase]||phase.toUpperCase());
    this.phaseTxt.setColor(colors[phase]||C.mt);
  }

  _onPlayResult(result) {
    this.scoreTxtT.setText(String(state.score.team));
    this.scoreTxtO.setText(String(state.score.opp));
    this.downTxt.setText(this._downStr());
    this.qtrTxt.setText(`Q${state.quarter}`);
    const col=result.td?C.gd:result.turnover?C.rd:result.yards>0?C.gn:C.rd;
    this.resultTxt.setText(result.text).setColor(col).setAlpha(1);
    this.tweens.add({targets:this.resultTxt,alpha:0,duration:1400,delay:600});
    this._onPhaseChange('presnap');
    this._updateYdBar();
    // INNO I12 [SIL]: update QB streak badge
    const _qs=this.scene.get('Field')?._qbStreak||0;
    if(this.streakTxt){if(_qs>=3){this.streakTxt.setText('🔥 HOT').setColor('#f59e0b');}else if(_qs<=-2){this.streakTxt.setText('❄️ COLD').setColor('#93c5fd');}else{this.streakTxt.setText('');} }
    // Score bug pulse — flash team color side bar on any scoring play
    const _scored = result.td || result.text?.includes('FG GOOD') || result.text?.includes('+3') || result.text?.includes('PICK SIX') || result.text?.includes('PAT');
    if (_scored) {
      const _isOppScore = result.text?.includes('OPP') || (result.turnover && result.td);
      const tgt = _isOppScore ? this.scoreTxtO : this.scoreTxtT;
      this.tweens.add({ targets:tgt, scaleX:1.65, scaleY:1.65, duration:160, yoyo:true, ease:'Bounce.easeOut' });
      // Flash the side accent bar
      const tc = _isOppScore ? (state.opponent?.clr||'#ef4444') : (state.team?.clr||'#22c55e');
      const pulseClr = Phaser.Display.Color.HexStringToColor(tc).color;
      const pBar = this.add.rectangle(_isOppScore ? this.scale.width-3 : 3, 26, 5, 44, pulseClr, 1).setDepth(25);
      this.tweens.add({ targets:pBar, alpha:0, duration:600, onComplete:()=>pBar.destroy() });
    }
  }

  _onPossessionChange(poss) {
    if(poss==='opp'){
      this.possBanner.setText('⚠ OPPONENT\'S BALL — DEFEND!').setColor(C.rd).setAlpha(1);
      this.phaseTxt.setText('🛡 DEFEND').setColor(C.rd);
      this.tweens.add({targets:this.possBanner,alpha:0,duration:1800,delay:1200});
    } else {
      this.possBanner.setText('✅ YOUR BALL').setColor(C.gn).setAlpha(1);
      this.tweens.add({targets:this.possBanner,alpha:0,duration:1400,delay:800});
    }
    this._updateYdBar();
  }

  _refresh() {
    this.scoreTxtT.setText(String(state.score.team));
    this.scoreTxtO.setText(String(state.score.opp));
    this.downTxt.setText(this._downStr());
    this.qtrTxt.setText(`Q${state.quarter}`);
    this.phaseTxt.setText('⏸ PRE-SNAP').setColor(C.mt);
    this._updateYdBar();
  }

  // H3: yards-to-go progress bar
  _updateYdBar() {
    if(!this._ydBar)return;
    const W=this.scale.width;
    if(state.possession!=='team'){this._ydBar.setDisplaySize(0,5);return;}
    const toGo=state.toGo||10;
    const pct=Math.max(0,Math.min(1,(10-toGo)/10));
    const col=toGo<=3?0xf59e0b:0x22c55e;
    this._ydBar.setDisplaySize(Math.max(2,(W-4)*pct),5).setFillStyle(col);
  }
}
