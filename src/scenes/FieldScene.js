import { state } from '../data/gameState.js';

const FIELD_Y = 60;       // top of field area
const FIELD_H = 380;      // field height in px
const YARD_W = 6;         // px per yard (100 yards * 6 = 600px, centered in 800)
const FIELD_LEFT = 100;   // left end zone start x
const FIELD_RIGHT = 700;  // right end zone end x

function yardToX(yard) {
  return FIELD_LEFT + yard * YARD_W;
}

export class FieldScene extends Phaser.Scene {
  constructor() { super('Field'); }

  create() {
    const W = this.scale.width;

    this._drawField();
    this._createBall();
    this._createPlayers();
    this._setupInput();
    this._resetFormation();

    this.phase = 'presnap'; // 'presnap' | 'snap' | 'run' | 'pass' | 'result'
    this.events.on('playCalled', this._onPlayCalled, this);
  }

  _drawField() {
    const g = this.add.graphics();

    // Grass
    g.fillStyle(0x14532d); g.fillRect(FIELD_LEFT, FIELD_Y, 600, FIELD_H);

    // Yard lines every 10
    g.lineStyle(1, 0x166534, 0.6);
    for (let y = 0; y <= 100; y += 10) {
      const x = yardToX(y);
      g.lineBetween(x, FIELD_Y, x, FIELD_Y + FIELD_H);
    }
    // Hash marks every 5
    g.lineStyle(1, 0x166534, 0.3);
    for (let y = 5; y < 100; y += 10) {
      const x = yardToX(y);
      g.lineBetween(x, FIELD_Y, x, FIELD_Y + FIELD_H);
    }

    // End zones
    g.fillStyle(0x0f3d20);
    g.fillRect(0, FIELD_Y, FIELD_LEFT, FIELD_H);
    g.fillRect(FIELD_RIGHT, FIELD_Y, 100, FIELD_H);

    // End zone text
    this.add.text(50, FIELD_Y + FIELD_H/2, 'END\nZONE', { fontSize: '11px', fontFamily: 'monospace', color: '#166534', align: 'center' }).setOrigin(0.5);
    this.add.text(750, FIELD_Y + FIELD_H/2, 'END\nZONE', { fontSize: '11px', fontFamily: 'monospace', color: '#166534', align: 'center' }).setOrigin(0.5);

    // Yard numbers
    for (let y = 10; y <= 90; y += 10) {
      const label = y <= 50 ? y : 100 - y;
      this.add.text(yardToX(y), FIELD_Y + 10, String(label), { fontSize: '9px', fontFamily: 'monospace', color: '#166534' }).setOrigin(0.5, 0);
    }

    // Line of scrimmage (drawn dynamically in update)
    this.losLine = this.add.graphics();
    this.firstDownLine = this.add.graphics();
  }

  _createBall() {
    this.ball = this.add.circle(0, FIELD_Y + FIELD_H / 2, 6, 0xd97706);
    this.ball.setDepth(10);
  }

  _createPlayers() {
    const teamClr = Phaser.Display.Color.HexStringToColor(state.team?.clr || '#22c55e').color;
    const oppClr  = Phaser.Display.Color.HexStringToColor(state.opponent?.clr || '#ef4444').color;

    // Offense: QB + skill positions (user controlled = QB)
    this.qb  = this._makePlayer(teamClr, 'QB',  14);
    this.rb  = this._makePlayer(teamClr, 'RB',  14);
    this.wr1 = this._makePlayer(teamClr, 'WR1', 10);
    this.wr2 = this._makePlayer(teamClr, 'WR2', 10);
    this.te  = this._makePlayer(teamClr, 'TE',  12);
    this.offPlayers = [this.qb, this.rb, this.wr1, this.wr2, this.te];

    // Defense: DL, LB, 2x CB, S
    this.dl  = this._makePlayer(oppClr, 'DL', 14);
    this.lb  = this._makePlayer(oppClr, 'LB', 12);
    this.cb1 = this._makePlayer(oppClr, 'CB', 10);
    this.cb2 = this._makePlayer(oppClr, 'CB', 10);
    this.saf = this._makePlayer(oppClr, 'S',  11);
    this.defPlayers = [this.dl, this.lb, this.cb1, this.cb2, this.saf];

    // Receiver click targets (invisible; activated on pass plays)
    this.recTargets = [];
  }

  _makePlayer(color, label, radius) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, radius);
    g.lineStyle(2, 0xffffff, 0.4);
    g.strokeCircle(0, 0, radius);
    const lbl = this.add.text(0, 0, label, { fontSize: '7px', fontFamily: 'monospace', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(5);
    g._label = lbl;
    g._radius = radius;
    g.setDepth(4);
    return g;
  }

  _setupInput() {
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,    w: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN, s: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT, a: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
  }

  _resetFormation() {
    const losX = yardToX(state.yardLine);
    const cy = FIELD_Y + FIELD_H / 2;

    // Offense behind line of scrimmage
    this._place(this.qb,  losX - 30, cy);
    this._place(this.rb,  losX - 55, cy + 20);
    this._place(this.wr1, losX - 10, cy - 70);
    this._place(this.wr2, losX - 10, cy + 70);
    this._place(this.te,  losX - 10, cy - 35);

    // Defense at/beyond LOS
    this._place(this.dl,  losX + 16, cy);
    this._place(this.lb,  losX + 40, cy + 10);
    this._place(this.cb1, losX + 20, cy - 65);
    this._place(this.cb2, losX + 20, cy + 65);
    this._place(this.saf, losX + 90, cy);

    this.ball.x = this.qb.x;
    this.ball.y = this.qb.y;
    this.controlled = this.qb;
    this.phase = 'presnap';
    this._drawLines();
  }

  _place(obj, x, y) {
    obj.x = x; obj.y = y;
    if (obj._label) { obj._label.x = x; obj._label.y = y; }
  }

  _drawLines() {
    this.losLine.clear();
    this.firstDownLine.clear();
    const losX = yardToX(state.yardLine);
    this.losLine.lineStyle(2, 0xfbbf24, 0.9);
    this.losLine.lineBetween(losX, FIELD_Y, losX, FIELD_Y + FIELD_H);
    const fdX = yardToX(Math.min(99, state.yardLine + state.toGo));
    this.firstDownLine.lineStyle(2, 0x22c55e, 0.7);
    this.firstDownLine.lineBetween(fdX, FIELD_Y, fdX, FIELD_Y + FIELD_H);
  }

  _onPlayCalled(callId) {
    state.currentCall = callId;
    if (callId.startsWith('run_') || callId === 'scramble') {
      this._startRun(callId);
    } else if (callId.startsWith('pass_')) {
      this._startPass(callId);
    }
  }

  _startRun(callId) {
    this.phase = 'run';
    const playerData = state.team?.players?.find(p => p.pos === 'RB') || { ovr: 75, spd: 80 };
    this.runner = callId === 'scramble' ? this.qb : this.rb;
    this.controlled = this.runner;
    this.runSpd = 120 + (playerData.spd - 70) * 1.5;
    this.runYards = 0;
    this.startX = this.runner.x;
    this.ball.x = this.runner.x; this.ball.y = this.runner.y;
    this._aiDefenseRun();
    // Fire scene event so HUD shows run indicator
    this.events.emit('phaseChange', 'run');
  }

  _startPass(callId) {
    this.phase = 'pass_wait'; // wait for throw input
    this.passVariant = callId.replace('pass_', '');
    this._animateRoutes();
    this.events.emit('phaseChange', 'pass');
    // Create clickable receiver targets
    this._buildReceiverTargets();
  }

  _animateRoutes() {
    // WRs and TE start running their routes
    const targets = [
      { p: this.wr1, tx: this.wr1.x + 80, ty: this.wr1.y + (this.passVariant === 'deep' ? -30 : 20) },
      { p: this.wr2, tx: this.wr2.x + 80, ty: this.wr2.y + (this.passVariant === 'deep' ? 30 : -20) },
      { p: this.te,  tx: this.te.x  + 50, ty: this.te.y + 15 },
      { p: this.rb,  tx: this.rb.x  + 30, ty: this.rb.y },
    ];
    targets.forEach(({ p, tx, ty }) => {
      this.tweens.add({ targets: p, x: tx, y: ty, duration: 800, ease: 'Sine.easeOut',
        onUpdate: () => { if (p._label) { p._label.x = p.x; p._label.y = p.y; } }
      });
    });
    // Also move QBs label
    // QB steps back in pocket
    this.tweens.add({ targets: this.qb, x: this.qb.x - 15, duration: 400, ease: 'Sine.easeOut',
      onUpdate: () => { if (this.qb._label) { this.qb._label.x = this.qb.x; } }
    });
  }

  _buildReceiverTargets() {
    this.recTargets.forEach(r => r.destroy());
    this.recTargets = [];
    const dbRatings = state.opponent?.players?.filter(p => ['CB','S'].includes(p.pos)).map(p => p.ovr) || [75, 72];
    const receivers = [
      { dot: this.wr1, player: state.team?.players?.find(p => p.pos === 'WR') || { spd: 88, ovr: 80 } },
      { dot: this.wr2, player: state.team?.players?.filter(p => p.pos === 'WR')[1] || { spd: 84, ovr: 76 } },
      { dot: this.te,  player: state.team?.players?.find(p => p.pos === 'TE') || { spd: 72, ovr: 74 } },
      { dot: this.rb,  player: state.team?.players?.find(p => p.pos === 'RB') || { spd: 86, ovr: 78 } },
    ];

    this.time.delayedCall(700, () => {
      receivers.forEach(({ dot, player }, i) => {
        const cbOvr = dbRatings[i % dbRatings.length] || 75;
        const isOpen = (player.spd || 80) > cbOvr * 0.95 && Math.random() < 0.55;
        const zone = this.add.circle(dot.x, dot.y, 18, isOpen ? 0x22c55e : 0xef4444, 0.35)
          .setDepth(8).setInteractive({ useHandCursor: true });
        const icon = this.add.text(dot.x, dot.y - 28, isOpen ? '🟢' : '🔴', { fontSize: '14px' })
          .setOrigin(0.5).setDepth(9);

        zone._isOpen = isOpen;
        zone._icon = icon;
        zone._receiverDot = dot;

        zone.on('pointerdown', () => {
          if (this.phase !== 'pass_wait') return;
          this._throwTo(dot, isOpen);
        });
        zone.on('pointerover', () => zone.setAlpha(0.7));
        zone.on('pointerout',  () => zone.setAlpha(1));

        this.recTargets.push(zone);
        this.recTargets.push(icon);

        // Pulse open receivers
        if (isOpen) {
          this.tweens.add({ targets: zone, scaleX: 1.2, scaleY: 1.2, duration: 600, yoyo: true, repeat: -1 });
        }
      });
    });
  }

  _throwTo(receiverDot, isOpen) {
    this.phase = 'pass_flight';
    this.recTargets.forEach(r => { r.destroy?.(); });
    this.recTargets = [];

    const qteBonus = isOpen ? 1.2 + Math.random() * 0.2 : 0.4 + Math.random() * 0.2;
    // Animate ball flying to receiver
    this.tweens.add({
      targets: this.ball, x: receiverDot.x, y: receiverDot.y,
      duration: 400, ease: 'Sine.easeIn',
      onComplete: () => this._resolvePlay(qteBonus, isOpen ? 'complete' : 'covered')
    });
  }

  _aiDefenseRun() {
    const dlData = state.opponent?.players?.find(p => p.pos === 'DL') || { ovr: 78, spd: 72 };
    const lbData = state.opponent?.players?.find(p => p.pos === 'LB') || { ovr: 75, spd: 78 };
    // DL and LB converge on ball carrier
    [{ dot: this.dl, spd: dlData.spd }, { dot: this.lb, spd: lbData.spd }].forEach(({ dot, spd }) => {
      this.time.addEvent({ delay: 16, loop: true, callback: () => {
        if (this.phase !== 'run') return;
        const dx = this.runner.x - dot.x, dy = this.runner.y - dot.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 14) { this._tackled(); return; }
        const pursuit = (spd / 90) * 1.2;
        dot.x += (dx / dist) * pursuit; dot.y += (dy / dist) * pursuit;
        if (dot._label) { dot._label.x = dot.x; dot._label.y = dot.y; }
      }});
    });
  }

  _tackled() {
    if (this.phase !== 'run') return;
    this.phase = 'result';
    const yardsGained = Math.round((this.runner.x - this.startX) / YARD_W);
    this._resolvePlay(1.0, 'tackle', yardsGained);
  }

  _resolvePlay(qteBonus, type, rawYards) {
    this.phase = 'result';
    const call = state.currentCall || 'run_inside';
    const isRun = call.startsWith('run_') || call === 'scramble';
    const isPass = call.startsWith('pass_');

    const offPlayers = state.team?.players || [];
    const defPlayers = state.opponent?.players || [];
    const qb = offPlayers.find(p => p.pos === 'QB') || { ovr: 80, spd: 68 };
    const rb = offPlayers.find(p => p.pos === 'RB') || { ovr: 78, spd: 86 };
    const wr = offPlayers.find(p => p.pos === 'WR') || { ovr: 80, spd: 90 };
    const dl = defPlayers.find(p => p.pos === 'DL') || { ovr: 78, spd: 72 };
    const cb = defPlayers.find(p => p.pos === 'CB') || { ovr: 78, spd: 88 };

    let yards = rawYards;
    if (yards === undefined) {
      if (isRun) {
        const base = (rb.spd - 70) * 0.15 + Phaser.Math.Between(-2, 7);
        yards = Math.round(base * qteBonus);
      } else if (isPass) {
        const variant = call.replace('pass_', '');
        const base = variant === 'deep' ? Phaser.Math.Between(15, 35) : Phaser.Math.Between(3, 14);
        const comp = (qb.ovr - 50) * 0.004 + 0.58;
        const intCh = variant === 'deep' ? 0.10 : 0.04;
        if (type === 'covered' && Math.random() < intCh * 2) {
          state.stats.team.int++;
          this._endPlay({ yards: 0, text: `INT! Ball picked off!`, type: 'int', turnover: true, td: false });
          return;
        }
        if (Math.random() > comp * qteBonus) {
          this._endPlay({ yards: 0, text: 'Incomplete pass.', type: 'inc', turnover: false, td: false });
          return;
        }
        yards = Math.round(base * qteBonus);
      }
    }

    const td = state.yardLine + yards >= 100;
    if (td) state.stats.team.td++;
    if (isRun) state.stats.team.rushYds += yards;
    if (isPass) state.stats.team.passYds += yards;

    const text = td
      ? `🏈 TOUCHDOWN! +${yards} yards!`
      : `${yards > 0 ? '+' : ''}${yards} yards`;

    this._endPlay({ yards, text, type: td ? 'td' : isRun ? 'run' : 'pass', turnover: false, td });
  }

  _endPlay(result) {
    state.lastResult = result;
    if (result.td) {
      state.score.team += 7;
      state.yardLine = 25;
      state.down = 1; state.toGo = 10;
    } else if (result.turnover) {
      state.possession = 'opp';
      state.yardLine = Math.max(5, 100 - state.yardLine);
      state.down = 1; state.toGo = 10;
    } else {
      state.yardLine = Math.min(99, state.yardLine + result.yards);
      if (result.yards >= state.toGo) { state.down = 1; state.toGo = 10; }
      else { state.down++; state.toGo = Math.max(1, state.toGo - result.yards); }
      if (state.down > 4) {
        state.possession = 'opp';
        state.yardLine = Math.max(5, 100 - state.yardLine);
        state.down = 1; state.toGo = 10;
      }
    }
    state.plays++;
    if (state.plays % 8 === 0) { state.quarter = Math.min(4, state.quarter + 1); }

    this.events.emit('playResult', result);
    this.scene.get('Hud')?.events?.emit('playResult', result);

    if (state.quarter > 4 || state.plays >= 40) {
      this.time.delayedCall(1500, () => this.scene.start('GameOver'));
    } else {
      this.time.delayedCall(1800, () => {
        this._resetFormation();
        this.scene.get('Hud')?.events?.emit('resetHud');
        this.scene.launch('PlayCall');
        this.scene.bringToTop('PlayCall');
      });
    }
  }

  update() {
    if (this.phase !== 'run') return;
    const spd = this.runSpd * (1/60);
    const k = this.keys;
    let moved = false;
    if (k.right.isDown || k.d.isDown) { this.runner.x += spd; moved = true; }
    if (k.left.isDown  || k.a.isDown) { this.runner.x -= spd * 0.6; moved = true; }
    if (k.up.isDown    || k.w.isDown) { this.runner.y -= spd * 0.8; moved = true; }
    if (k.down.isDown  || k.s.isDown) { this.runner.y += spd * 0.8; moved = true; }

    if (moved) {
      this.ball.x = this.runner.x; this.ball.y = this.runner.y;
      if (this.runner._label) { this.runner._label.x = this.runner.x; this.runner._label.y = this.runner.y; }
      // Touchdown check
      if (this.runner.x >= FIELD_RIGHT) { this._tackled(); }
      // Out of bounds
      if (this.runner.y < FIELD_Y || this.runner.y > FIELD_Y + FIELD_H) { this._tackled(); }
    }
  }
}
