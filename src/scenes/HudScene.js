import { state } from '../data/gameState.js';

const C = { gn: '#22c55e', rd: '#ef4444', gd: '#f59e0b', bl: '#3b82f6', mt: '#64748b', tx: '#f1f5f9', bg: '#0f172a', cd: '#1e293b', bd: '#334155' };

export class HudScene extends Phaser.Scene {
  constructor() { super('Hud'); }

  create() {
    const W = this.scale.width;

    // Top bar background
    this.add.rectangle(W/2, 22, W, 44, 0x0f172a).setDepth(20);
    this.add.rectangle(W/2, 43, W, 1, 0x334155).setDepth(20);

    // Score
    this.scoreTxt = this.add.text(W/2, 14, this._scoreStr(), {
      fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold', color: C.gd
    }).setOrigin(0.5, 0).setDepth(21);

    // Down & distance
    this.downTxt = this.add.text(W/2, 32, this._downStr(), {
      fontSize: '11px', fontFamily: 'monospace', color: C.mt
    }).setOrigin(0.5, 0).setDepth(21);

    // Quarter
    this.qtrTxt = this.add.text(12, 14, `Q${state.quarter}`, {
      fontSize: '13px', fontFamily: 'monospace', fontStyle: 'bold', color: C.bl
    }).setDepth(21);

    // Phase indicator
    this.phaseTxt = this.add.text(W - 12, 14, '⏸ PRE-SNAP', {
      fontSize: '10px', fontFamily: 'monospace', color: C.mt
    }).setOrigin(1, 0).setDepth(21);

    // Play result flash (bottom of screen)
    this.resultTxt = this.add.text(W/2, 470, '', {
      fontSize: '20px', fontFamily: 'monospace', fontStyle: 'bold',
      color: C.gn, stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(22).setAlpha(0);

    // Listen for events from FieldScene
    const field = this.scene.get('Field');
    if (field) {
      field.events.on('phaseChange', this._onPhaseChange, this);
      field.events.on('playResult', this._onPlayResult, this);
    }
    this.events.on('resetHud', this._refresh, this);
  }

  _scoreStr() {
    const t = state.team?.ab || 'YOU';
    const o = state.opponent?.ab || 'OPP';
    return `${t} ${state.score.team} — ${state.score.opp} ${o}`;
  }

  _downStr() {
    const dn = ['', '1st', '2nd', '3rd', '4th'][state.down] || '';
    return `${dn} & ${state.toGo} • Ball at ${state.yardLine} yd line • Q${state.quarter}`;
  }

  _onPhaseChange(phase) {
    const labels = { run: '🦶 RUNNING', pass: '🎯 PASSING', presnap: '⏸ PRE-SNAP', result: '✅ RESULT' };
    const colors = { run: C.gd, pass: C.bl, presnap: C.mt, result: C.gn };
    this.phaseTxt.setText(labels[phase] || phase.toUpperCase());
    this.phaseTxt.setColor(colors[phase] || C.mt);
  }

  _onPlayResult(result) {
    this.scoreTxt.setText(this._scoreStr());
    this.downTxt.setText(this._downStr());
    this.qtrTxt.setText(`Q${state.quarter}`);

    const col = result.td ? C.gd : result.turnover ? C.rd : result.yards > 0 ? C.gn : C.rd;
    this.resultTxt.setText(result.text).setColor(col).setAlpha(1);
    this.tweens.add({ targets: this.resultTxt, alpha: 0, duration: 1400, delay: 600 });
    this._onPhaseChange('presnap');
  }

  _refresh() {
    this.scoreTxt.setText(this._scoreStr());
    this.downTxt.setText(this._downStr());
    this.qtrTxt.setText(`Q${state.quarter}`);
    this.phaseTxt.setText('⏸ PRE-SNAP').setColor(C.mt);
  }
}
