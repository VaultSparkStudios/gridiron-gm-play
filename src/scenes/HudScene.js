import { state } from '../data/gameState.js';

const C = { gn:'#22c55e', rd:'#ef4444', gd:'#f59e0b', bl:'#3b82f6', mt:'#64748b', tx:'#f1f5f9', bg:'#0f172a', cd:'#1e293b', bd:'#334155' };

export class HudScene extends Phaser.Scene {
  constructor() { super('Hud'); }

  create() {
    const W = this.scale.width;

    // Top bar background
    this.add.rectangle(W/2, 22, W, 44, 0x0f172a).setDepth(20);
    this.add.rectangle(W/2, 43, W, 1, 0x334155).setDepth(20);

    // Score
    this.scoreTxt = this.add.text(W/2, 14, this._scoreStr(), {
      fontSize:'18px', fontFamily:'monospace', fontStyle:'bold', color:C.gd
    }).setOrigin(0.5, 0).setDepth(21);

    // Down & distance
    this.downTxt = this.add.text(W/2, 32, this._downStr(), {
      fontSize:'11px', fontFamily:'monospace', color:C.mt
    }).setOrigin(0.5, 0).setDepth(21);

    // Quarter
    this.qtrTxt = this.add.text(12, 14, `Q${state.quarter}`, {
      fontSize:'13px', fontFamily:'monospace', fontStyle:'bold', color:C.bl
    }).setDepth(21);

    // Phase indicator
    this.phaseTxt = this.add.text(W-12, 14, '⏸ PRE-SNAP', {
      fontSize:'10px', fontFamily:'monospace', color:C.mt
    }).setOrigin(1, 0).setDepth(21);

    // H3: first-down progress bar — thin strip below HUD, fills as yards gained toward 1st down
    this._ydBarBg = this.add.rectangle(W/2, 46, W, 5, 0x1e293b, 0.9).setDepth(20);
    this._ydBar   = this.add.rectangle(2, 46, 2, 5, 0x22c55e, 1).setDepth(21).setOrigin(0, 0.5);
    this._updateYdBar();

    // Possession banner (just below HUD bar)
    this.possBanner = this.add.text(W/2, 50, '', {
      fontSize:'10px', fontFamily:'monospace', fontStyle:'bold', color:C.gn
    }).setOrigin(0.5, 0).setDepth(22).setAlpha(0);

    // Play result flash
    this.resultTxt = this.add.text(W/2, 470, '', {
      fontSize:'20px', fontFamily:'monospace', fontStyle:'bold',
      color:C.gn, stroke:'#000', strokeThickness:3
    }).setOrigin(0.5).setDepth(22).setAlpha(0);

    // Listen for events from FieldScene
    const field = this.scene.get('Field');
    if (field) {
      field.events.on('phaseChange',    this._onPhaseChange,    this);
      field.events.on('playResult',     this._onPlayResult,     this);
      field.events.on('possessionChange', this._onPossessionChange, this);
    }
    this.events.on('resetHud',           this._refresh,          this);
    this.events.on('playResult',          this._onPlayResult,     this);
    this.events.on('possessionChange',    this._onPossessionChange, this);
  }

  _scoreStr() {
    const t = state.team?.ab || 'YOU', o = state.opponent?.ab || 'OPP';
    return `${t} ${state.score.team} — ${state.score.opp} ${o}`;
  }

  _downStr() {
    if (state.possession === 'opp') {
      return `OPP BALL • ${state.yardLine} yd line • Q${state.quarter}`;
    }
    const dn = ['','1st','2nd','3rd','4th'][state.down] || '';
    return `${dn} & ${state.toGo} • Ball at ${state.yardLine} yd line • Q${state.quarter}`;
  }

  _onPhaseChange(phase) {
    const labels = { run:'🦶 RUNNING', pass:'🎯 PASSING', presnap:'⏸ PRE-SNAP', result:'✅ RESULT', ai_run:'🛡 DEFEND' };
    const colors = { run:C.gd, pass:C.bl, presnap:C.mt, result:C.gn, ai_run:C.rd };
    this.phaseTxt.setText(labels[phase] || phase.toUpperCase());
    this.phaseTxt.setColor(colors[phase] || C.mt);
  }

  _onPlayResult(result) {
    this.scoreTxt.setText(this._scoreStr());
    this.downTxt.setText(this._downStr());
    this.qtrTxt.setText(`Q${state.quarter}`);
    const col = result.td ? C.gd : result.turnover ? C.rd : result.yards > 0 ? C.gn : C.rd;
    this.resultTxt.setText(result.text).setColor(col).setAlpha(1);
    this.tweens.add({ targets:this.resultTxt, alpha:0, duration:1400, delay:600 });
    this._onPhaseChange('presnap');
    this._updateYdBar();
    // Score pop on TD or FG
    if(result.td||result.text?.includes('FG GOOD')){this.tweens.add({targets:this.scoreTxt,scaleX:1.5,scaleY:1.5,duration:160,yoyo:true,ease:'Bounce.easeOut'});}
  }

  _onPossessionChange(poss) {
    if (poss === 'opp') {
      this.possBanner.setText('⚠ OPPONENT\'S BALL — DEFEND!').setColor(C.rd).setAlpha(1);
      this.phaseTxt.setText('🛡 DEFEND').setColor(C.rd);
      this.tweens.add({ targets:this.possBanner, alpha:0, duration:1800, delay:1200 });
    } else {
      this.possBanner.setText('✅ YOUR BALL').setColor(C.gn).setAlpha(1);
      this.tweens.add({ targets:this.possBanner, alpha:0, duration:1400, delay:800 });
    }
    this._updateYdBar();
  }

  _refresh() {
    this.scoreTxt.setText(this._scoreStr());
    this.downTxt.setText(this._downStr());
    this.qtrTxt.setText(`Q${state.quarter}`);
    this.phaseTxt.setText('⏸ PRE-SNAP').setColor(C.mt);
    this._updateYdBar();
  }

  // H3: yards-to-go progress bar — fills as you gain yards toward the 1st down marker
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
