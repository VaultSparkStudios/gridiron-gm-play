import { state } from '../data/gameState.js';

const FIELD_Y = 60;
const FIELD_H = 380;
const YARD_W = 6;
const FIELD_LEFT = 100;
const FIELD_RIGHT = 700;

function yardToX(y) { return FIELD_LEFT + y * YARD_W; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export class FieldScene extends Phaser.Scene {
  constructor() { super('Field'); }

  create() {
    this._drawField();
    this._createBall();
    this._createPlayers();
    this._setupInput();
    this._resetFormation();
    this.phase = 'presnap';
    this.jukeCD = 0;
    this.passRushTimer = null;
    this.events.on('playCalled', this._onPlayCalled, this);
    // Launch play call menu immediately
    this.time.delayedCall(200, () => {
      this.scene.launch('PlayCall');
      this.scene.bringToTop('PlayCall');
    });
  }

  // ─── FIELD DRAW ───────────────────────────────────────────────────────────

  _drawField() {
    const g = this.add.graphics();
    g.fillStyle(0x14532d); g.fillRect(FIELD_LEFT, FIELD_Y, 600, FIELD_H);
    g.lineStyle(1, 0x166534, 0.6);
    for (let y = 0; y <= 100; y += 10) { const x = yardToX(y); g.lineBetween(x, FIELD_Y, x, FIELD_Y + FIELD_H); }
    g.lineStyle(1, 0x166534, 0.3);
    for (let y = 5; y < 100; y += 10) { const x = yardToX(y); g.lineBetween(x, FIELD_Y, x, FIELD_Y + FIELD_H); }
    g.fillStyle(0x0f3d20);
    g.fillRect(0, FIELD_Y, FIELD_LEFT, FIELD_H);
    g.fillRect(FIELD_RIGHT, FIELD_Y, 100, FIELD_H);
    this.add.text(50, FIELD_Y + FIELD_H/2, 'END\nZONE', { fontSize:'11px', fontFamily:'monospace', color:'#166534', align:'center' }).setOrigin(0.5);
    this.add.text(750, FIELD_Y + FIELD_H/2, 'END\nZONE', { fontSize:'11px', fontFamily:'monospace', color:'#166534', align:'center' }).setOrigin(0.5);
    for (let y = 10; y <= 90; y += 10) {
      const label = y <= 50 ? y : 100 - y;
      this.add.text(yardToX(y), FIELD_Y + 10, String(label), { fontSize:'9px', fontFamily:'monospace', color:'#166534' }).setOrigin(0.5, 0);
    }
    this.losLine = this.add.graphics();
    this.firstDownLine = this.add.graphics();
    this.arcGfx = this.add.graphics();
    // Controls legend
    this.add.text(4, FIELD_Y + FIELD_H + 8, 'Run: WASD/Arrows  •  Juke: SPACE  •  Pass: click receiver', { fontSize:'9px', fontFamily:'monospace', color:'#334155' });
  }

  _createBall() {
    this.ball = this.add.circle(0, 0, 6, 0xd97706).setDepth(10);
  }

  // ─── PLAYERS ──────────────────────────────────────────────────────────────

  _createPlayers() {
    const tc = Phaser.Display.Color.HexStringToColor(state.team?.clr     || '#22c55e').color;
    const oc = Phaser.Display.Color.HexStringToColor(state.opponent?.clr || '#ef4444').color;

    // Offense
    this.qb  = this._dot(tc, 'QB',  14);
    this.rb  = this._dot(tc, 'RB',  13);
    this.wr1 = this._dot(tc, 'WR',  10);
    this.wr2 = this._dot(tc, 'WR',  10);
    this.te  = this._dot(tc, 'TE',  12);
    this.ol  = this._dot(tc, 'OL',  13); // blocker
    this.offPlayers = [this.qb, this.rb, this.wr1, this.wr2, this.te, this.ol];

    // Defense
    this.dl  = this._dot(oc, 'DL', 14);
    this.dl2 = this._dot(oc, 'DL', 14); // P4: 3-4 has extra DL
    this.lb  = this._dot(oc, 'LB', 12);
    this.lb2 = this._dot(oc, 'LB', 12); // P4: blitz/3-4 lb
    this.cb1 = this._dot(oc, 'CB', 10);
    this.cb2 = this._dot(oc, 'CB', 10);
    this.saf = this._dot(oc, 'S',  11);
    this.defPlayers = [this.dl, this.dl2, this.lb, this.lb2, this.cb1, this.cb2, this.saf];

    this.recTargets = [];
    this._jukeFlash = null;
  }

  _dot(color, label, radius) {
    const g = this.add.graphics();
    g.fillStyle(color, 1); g.fillCircle(0, 0, radius);
    g.lineStyle(2, 0xffffff, 0.35); g.strokeCircle(0, 0, radius);
    const lbl = this.add.text(0, 0, label, { fontSize:'7px', fontFamily:'monospace', color:'#fff', fontStyle:'bold' }).setOrigin(0.5).setDepth(5);
    g._lbl = lbl; g._r = radius; g._hide = false;
    g.setDepth(4);
    return g;
  }

  _place(d, x, y) {
    d.x = x; d.y = y;
    if (d._lbl) { d._lbl.x = x; d._lbl.y = y; }
  }

  _show(d, vis) {
    d.setVisible(vis); if (d._lbl) d._lbl.setVisible(vis);
  }

  // ─── INPUT ────────────────────────────────────────────────────────────────

  _setupInput() {
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,    w: Phaser.Input.Keyboard.KeyCodes.W,
      dn: Phaser.Input.Keyboard.KeyCodes.DOWN,  s: Phaser.Input.Keyboard.KeyCodes.S,
      lt: Phaser.Input.Keyboard.KeyCodes.LEFT,  a: Phaser.Input.Keyboard.KeyCodes.A,
      rt: Phaser.Input.Keyboard.KeyCodes.RIGHT, d: Phaser.Input.Keyboard.KeyCodes.D,
      sp: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
  }

  // ─── FORMATION ────────────────────────────────────────────────────────────

  _resetFormation() {
    const lx = yardToX(state.yardLine);
    const cy = FIELD_Y + FIELD_H / 2;
    const dc = state.opponent?.dcScheme || '4-3';

    // Offense
    this._place(this.qb,  lx - 30, cy);
    this._place(this.rb,  lx - 55, cy + 22);
    this._place(this.wr1, lx - 8,  cy - 72);
    this._place(this.wr2, lx - 8,  cy + 72);
    this._place(this.te,  lx - 8,  cy - 36);
    this._place(this.ol,  lx - 10, cy);

    // P4 — scheme-based defensive formation
    this._applySchemeFormation(lx, cy, dc);

    this.ball.x = this.qb.x; this.ball.y = this.qb.y;
    this.phase = 'presnap';
    this.jukeCD = 0;
    this._clearPassRush();
    this._drawLines();
    this._clearArc();

    // Clean up old receiver targets
    this.recTargets.forEach(r => r?.destroy?.());
    this.recTargets = [];
  }

  // P4 — scheme-aware formation
  _applySchemeFormation(lx, cy, dc) {
    switch (dc) {
      case '3-4':
        // 3 DL, 4 LB — extra LB, tighter DL
        this._show(this.dl2, true);
        this._show(this.lb2, true);
        this._place(this.dl,  lx + 14, cy - 10);
        this._place(this.dl2, lx + 14, cy + 10);
        this._place(this.lb,  lx + 40, cy - 25);
        this._place(this.lb2, lx + 40, cy + 25);
        this._place(this.cb1, lx + 18, cy - 70);
        this._place(this.cb2, lx + 18, cy + 70);
        this._place(this.saf, lx + 80, cy);
        break;
      case 'Cover 2':
        // 2 safeties deep, CBs play short, standard DL
        this._show(this.dl2, false);
        this._show(this.lb2, false);
        this._place(this.dl,  lx + 14, cy);
        this._place(this.lb,  lx + 38, cy);
        this._place(this.cb1, lx + 18, cy - 55);
        this._place(this.cb2, lx + 18, cy + 55);
        this._place(this.saf, lx + 100, cy - 45); // split safeties deep
        // dl2 used as extra safety in cover 2
        this._show(this.dl2, true);
        this._place(this.dl2, lx + 100, cy + 45);
        this._show(this.lb2, false);
        break;
      case 'Zone Blitz':
        // LB blitzes, zone drops
        this._show(this.dl2, false);
        this._show(this.lb2, true);
        this._place(this.dl,  lx + 14, cy);
        this._place(this.lb,  lx + 20, cy - 30); // lb2 blitzes off edge
        this._place(this.lb2, lx + 8,  cy + 32);
        this._place(this.cb1, lx + 40, cy - 60);
        this._place(this.cb2, lx + 40, cy + 60);
        this._place(this.saf, lx + 90, cy);
        this._show(this.dl2, false);
        break;
      default: // 4-3
        this._show(this.dl2, false);
        this._show(this.lb2, false);
        this._place(this.dl,  lx + 14, cy);
        this._place(this.lb,  lx + 40, cy + 12);
        this._place(this.cb1, lx + 20, cy - 66);
        this._place(this.cb2, lx + 20, cy + 66);
        this._place(this.saf, lx + 90, cy);
    }
  }

  _drawLines() {
    this.losLine.clear(); this.firstDownLine.clear();
    const lx = yardToX(state.yardLine);
    this.losLine.lineStyle(2, 0xfbbf24, 0.9);
    this.losLine.lineBetween(lx, FIELD_Y, lx, FIELD_Y + FIELD_H);
    const fdx = yardToX(Math.min(99, state.yardLine + state.toGo));
    this.firstDownLine.lineStyle(2, 0x22c55e, 0.7);
    this.firstDownLine.lineBetween(fdx, FIELD_Y, fdx, FIELD_Y + FIELD_H);
  }

  _clearArc() { this.arcGfx.clear(); }

  // ─── PLAY DISPATCH ────────────────────────────────────────────────────────

  _onPlayCalled(callId) {
    state.currentCall = callId;
    if (callId.startsWith('run_') || callId === 'scramble') this._startRun(callId);
    else if (callId.startsWith('pass_')) this._startPass(callId);
  }

  // ─── P2: RUN GAME ─────────────────────────────────────────────────────────

  _startRun(callId) {
    this.phase = 'run';
    const isScramble = callId === 'scramble';
    const isOutside = callId === 'run_outside';
    this.runner = isScramble ? this.qb : this.rb;
    this.startX = this.runner.x;
    const pData = state.team?.players?.find(p => p.pos === (isScramble ? 'QB' : 'RB')) || { ovr:78, spd:82 };
    this.runSpd = 110 + (pData.spd - 70) * 1.6 + (isOutside ? 15 : 0);
    this.ball.x = this.runner.x; this.ball.y = this.runner.y;

    // OL trails runner for blocking
    this._startOLBlocker();

    // AI: DL + LB converge; 3-4 / Zone Blitz adds lb2 rush too
    const dc = state.opponent?.dcScheme || '4-3';
    const rushers = [this.dl];
    if (dc === '3-4' || dc === 'Zone Blitz') rushers.push(this.lb2);
    rushers.push(this.lb);
    this._aiRushers(rushers);

    // CBs drift toward play if outside run
    if (isOutside) this._aiCBsSupport();

    this.events.emit('phaseChange', 'run');
  }

  _startOLBlocker() {
    this.time.addEvent({ delay: 16, loop: true, key: 'ol_block', callback: () => {
      if (this.phase !== 'run') return;
      // OL trails runner by ~20px
      this.ol.x += (this.runner.x - 20 - this.ol.x) * 0.09;
      this.ol.y += (this.runner.y - this.ol.y) * 0.09;
      if (this.ol._lbl) { this.ol._lbl.x = this.ol.x; this.ol._lbl.y = this.ol.y; }
      // Repel nearby defenders
      this.defPlayers.forEach(d => {
        const dx = d.x - this.ol.x, dy = d.y - this.ol.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 26 && dist > 0) { d.x += (dx / dist) * 1.8; d.y += (dy / dist) * 1.8; if (d._lbl) { d._lbl.x = d.x; d._lbl.y = d.y; } }
      });
    }});
  }

  _aiRushers(dots) {
    const defData = state.opponent?.players || [];
    dots.forEach((dot, i) => {
      if (!dot.visible) return;
      const p = defData.find(p => p.pos === (i === 0 ? 'DL' : 'LB')) || { spd: 74 };
      this.time.addEvent({ delay: 16, loop: true, callback: () => {
        if (this.phase !== 'run') return;
        const dx = this.runner.x - dot.x, dy = this.runner.y - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 13) { this._tackled(); return; }
        const spd = (p.spd / 90) * 1.25;
        dot.x += (dx / dist) * spd; dot.y += (dy / dist) * spd;
        if (dot._lbl) { dot._lbl.x = dot.x; dot._lbl.y = dot.y; }
      }});
    });
  }

  _aiCBsSupport() {
    [this.cb1, this.cb2].forEach(cb => {
      this.time.addEvent({ delay: 50, loop: true, callback: () => {
        if (this.phase !== 'run') return;
        const dx = this.runner.x - cb.x, dy = this.runner.y - cb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 13) { this._tackled(); return; }
        if (dist > 80) { cb.x += (dx / dist) * 0.6; cb.y += (dy / dist) * 0.6; if (cb._lbl) { cb._lbl.x = cb.x; cb._lbl.y = cb.y; } }
      }});
    });
  }

  // P2: Juke — SPACE key pushes nearby defenders and grants brief speed burst
  _doJuke() {
    this.jukeCD = 1600;
    this.runSpd *= 1.25;
    this.time.delayedCall(300, () => { this.runSpd *= 0.8; });

    // Flash runner
    this.tweens.add({ targets: this.runner, scaleX: 1.35, scaleY: 1.35, duration: 140, yoyo: true, ease: 'Bounce.easeOut' });

    // Push nearby defenders
    this.defPlayers.forEach(d => {
      if (!d.visible) return;
      const dx = d.x - this.runner.x, dy = d.y - this.runner.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 65 && dist > 0) {
        const pushX = d.x + (dx / dist) * 50, pushY = d.y + (dy / dist) * 50;
        this.tweens.add({ targets: d, x: pushX, y: pushY, duration: 350, ease: 'Sine.easeOut',
          onUpdate: () => { if (d._lbl) { d._lbl.x = d.x; d._lbl.y = d.y; } }
        });
      }
    });

    // Juke cooldown bar
    if (this._jukeCDBar) this._jukeCDBar.destroy();
    this._jukeCDBar = this.add.rectangle(this.runner.x, this.runner.y - 22, 30, 4, 0xf59e0b).setDepth(20);
    this.tweens.add({ targets: this._jukeCDBar, scaleX: 0, duration: this.jukeCD, ease: 'Linear',
      onComplete: () => { this._jukeCDBar?.destroy(); this._jukeCDBar = null; }
    });
  }

  _tackled() {
    if (this.phase !== 'run') return;
    this.phase = 'result';
    if (this._jukeCDBar) { this._jukeCDBar.destroy(); this._jukeCDBar = null; }
    const yardsGained = Math.round((this.runner.x - this.startX) / YARD_W);
    this._resolvePlay(1.0, 'tackle', yardsGained);
  }

  // ─── P3: PASS GAME ────────────────────────────────────────────────────────

  _startPass(callId) {
    this.phase = 'pass_wait';
    this.passVariant = callId.replace('pass_', '');
    this._animateRoutes(this.passVariant);
    this._startPassRush();
    this.events.emit('phaseChange', 'pass');
    this.time.delayedCall(600, () => this._buildReceiverTargets());
  }

  // P3: Route depths vary by variant
  _animateRoutes(variant) {
    const depthMap = { quick: 35, medium: 65, deep: 115 };
    const depth = depthMap[variant] || 60;
    const routes = [
      // WR1: slant in (quick), curl (medium), go route (deep)
      { p: this.wr1, tx: this.wr1.x + depth,       ty: this.wr1.y + (variant === 'quick' ? 25 : variant === 'deep' ? -20 : 15) },
      // WR2: mirror
      { p: this.wr2, tx: this.wr2.x + depth,       ty: this.wr2.y - (variant === 'quick' ? 25 : variant === 'deep' ? -20 : 15) },
      // TE: short cross
      { p: this.te,  tx: this.te.x  + depth * 0.7, ty: this.te.y  + 18 },
      // RB: flat/screen
      { p: this.rb,  tx: this.rb.x  + 28,          ty: this.rb.y  - 10 },
    ];
    routes.forEach(({ p, tx, ty }) => {
      const dur = variant === 'quick' ? 450 : variant === 'deep' ? 900 : 650;
      this.tweens.add({ targets: p, x: tx, y: ty, duration: dur, ease: 'Sine.easeOut',
        onUpdate: () => { if (p._lbl) { p._lbl.x = p.x; p._lbl.y = p.y; } }
      });
    });
    // QB drops back in pocket
    this.tweens.add({ targets: this.qb, x: this.qb.x - 18, duration: 350, ease: 'Sine.easeOut',
      onUpdate: () => { if (this.qb._lbl) { this.qb._lbl.x = this.qb.x; } }
    });
  }

  // P3: DL rushes QB — sack if they reach him
  _startPassRush() {
    const dc = state.opponent?.dcScheme || '4-3';
    const rushers = [this.dl];
    if (dc === 'Zone Blitz') rushers.push(this.lb2);
    if (dc === '3-4') rushers.push(this.dl2);

    const dlData = state.opponent?.players?.find(p => p.pos === 'DL') || { spd: 75 };
    this._passRushActive = true;

    rushers.forEach((dot, i) => {
      if (!dot.visible) return;
      const spd = ((dlData.spd + i * -3) / 90) * 1.1;
      this.time.addEvent({ delay: 16, loop: true, callback: () => {
        if (!this._passRushActive) return;
        const dx = this.qb.x - dot.x, dy = this.qb.y - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 14) { this._sack(); return; }
        dot.x += (dx / dist) * spd; dot.y += (dy / dist) * spd;
        if (dot._lbl) { dot._lbl.x = dot.x; dot._lbl.y = dot.y; }
      }});
    });

    // P3: Pressure warning text
    this.pressureTxt = this.add.text(this.qb.x, this.qb.y - 30, '', {
      fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ef4444'
    }).setOrigin(0.5).setDepth(15);

    this.time.addEvent({ delay: 1200, callback: () => { if (this.phase === 'pass_wait') this.pressureTxt?.setText('PRESSURE!'); } });
    this.time.addEvent({ delay: 2200, callback: () => { if (this.phase === 'pass_wait') this.pressureTxt?.setText('THROW IT!'); } });
  }

  _clearPassRush() {
    this._passRushActive = false;
    this.pressureTxt?.destroy(); this.pressureTxt = null;
  }

  _sack() {
    if (this.phase !== 'pass_wait') return;
    this._clearPassRush();
    this.phase = 'result';
    this.recTargets.forEach(r => r?.destroy?.());
    this.recTargets = [];
    const loss = Phaser.Math.Between(4, 12);
    this._endPlay({ yards: -loss, text: `SACK! -${loss} yards`, type: 'sack', turnover: false, td: false });
  }

  // P3+P4: Build receiver click targets; coverage based on scheme
  _buildReceiverTargets() {
    if (this.phase !== 'pass_wait') return;
    const dc = state.opponent?.dcScheme || '4-3';
    const isZone = dc === 'Cover 2' || dc === 'Zone Blitz';
    const defPlayers = state.opponent?.players || [];
    const dbRatings = defPlayers.filter(p => ['CB','S'].includes(p.pos)).map(p => p.ovr);

    const receivers = [
      { dot: this.wr1, p: state.team?.players?.find(p => p.pos === 'WR') || { spd:88, ovr:80, name:'WR' } },
      { dot: this.wr2, p: state.team?.players?.filter(p => p.pos === 'WR')[1] || { spd:84, ovr:76, name:'WR2' } },
      { dot: this.te,  p: state.team?.players?.find(p => p.pos === 'TE') || { spd:72, ovr:74, name:'TE' } },
      { dot: this.rb,  p: state.team?.players?.find(p => p.pos === 'RB') || { spd:86, ovr:78, name:'RB' } },
    ];

    receivers.forEach(({ dot, p }, i) => {
      const cbOvr = dbRatings[i % dbRatings.length] || 75;
      // P4: Zone gives flat coverage bonus; man gives speed matchup
      const zonePenalty = isZone ? -5 : 0;
      const isOpen = (p.spd || 80) > (cbOvr + zonePenalty) * 0.95 && Math.random() < 0.52 + ((p.spd || 80) - cbOvr) / 200;

      const zone = this.add.circle(dot.x, dot.y, 20, isOpen ? 0x22c55e : 0xef4444, 0.35)
        .setDepth(8).setInteractive({ useHandCursor: true });
      const icon = this.add.text(dot.x, dot.y - 30, isOpen ? '🟢' : '🔴', { fontSize:'15px' })
        .setOrigin(0.5).setDepth(9);
      const nameTxt = this.add.text(dot.x, dot.y + 24, p.name || p.pos, { fontSize:'7px', fontFamily:'monospace', color:'#fff' })
        .setOrigin(0.5).setDepth(9);

      zone._isOpen = isOpen;
      zone.on('pointerdown', () => { if (this.phase !== 'pass_wait') return; this._throwTo(dot, isOpen); });
      zone.on('pointerover', () => zone.setAlpha(0.7));
      zone.on('pointerout',  () => zone.setAlpha(1));
      if (isOpen) this.tweens.add({ targets: zone, scaleX: 1.18, scaleY: 1.18, duration: 550, yoyo: true, repeat: -1 });

      this.recTargets.push(zone, icon, nameTxt);
    });

    // P4: CBs run man coverage (follow WRs) unless zone
    if (!isZone) this._aiManCoverage();
    else this._aiZoneCoverage();
  }

  // P4: Man coverage — CBs shadow WR1/WR2
  _aiManCoverage() {
    const cbData = state.opponent?.players?.filter(p => p.pos === 'CB') || [];
    [{ cb: this.cb1, wr: this.wr1, spd: cbData[0]?.spd || 82 },
     { cb: this.cb2, wr: this.wr2, spd: cbData[1]?.spd || 78 }].forEach(({ cb, wr, spd }) => {
      this.time.addEvent({ delay: 16, loop: true, callback: () => {
        if (this.phase !== 'pass_wait' && this.phase !== 'pass_flight') return;
        const dx = wr.x - cb.x, dy = wr.y - cb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 8) return;
        const s = (spd / 90) * 1.05;
        cb.x += (dx / dist) * s; cb.y += (dy / dist) * s;
        if (cb._lbl) { cb._lbl.x = cb.x; cb._lbl.y = cb.y; }
      }});
    });
  }

  // P4: Zone coverage — CBs and S hold area zones
  _aiZoneCoverage() {
    const lx = yardToX(state.yardLine);
    const cy = FIELD_Y + FIELD_H / 2;
    const zones = [
      { dot: this.cb1, tx: lx + 50, ty: cy - 55 },
      { dot: this.cb2, tx: lx + 50, ty: cy + 55 },
      { dot: this.saf, tx: lx + 110, ty: cy },
    ];
    zones.forEach(({ dot, tx, ty }) => {
      this.time.addEvent({ delay: 16, loop: true, callback: () => {
        if (this.phase !== 'pass_wait') return;
        dot.x += (tx - dot.x) * 0.04; dot.y += (ty - dot.y) * 0.04;
        if (dot._lbl) { dot._lbl.x = dot.x; dot._lbl.y = dot.y; }
      }});
    });
  }

  // P3: Throw with arc tween
  _throwTo(receiverDot, isOpen) {
    if (this.phase !== 'pass_wait') return;
    this.phase = 'pass_flight';
    this._clearPassRush();
    this.recTargets.forEach(r => r?.destroy?.());
    this.recTargets = [];
    this.pressureTxt?.destroy();

    const qteBonus = isOpen ? 1.2 + Math.random() * 0.2 : 0.4 + Math.random() * 0.15;
    const startX = this.ball.x, startY = this.ball.y;
    const endX = receiverDot.x, endY = receiverDot.y;
    const peakY = Math.min(startY, endY) - 40; // arc peak

    // Draw throw arc
    let t = 0;
    const dur = 400;
    const arcTimer = this.time.addEvent({ delay: 16, loop: true, callback: () => {
      t += 16 / dur;
      if (t > 1) { arcTimer.remove(); this._clearArc(); return; }
      const bx = Phaser.Math.Linear(startX, endX, t);
      const by = (1-t)*(1-t)*startY + 2*(1-t)*t*peakY + t*t*endY;
      this.ball.x = bx; this.ball.y = by;
      this.arcGfx.clear();
      this.arcGfx.lineStyle(1, 0xfbbf24, 0.5);
      this.arcGfx.lineBetween(startX, startY, bx, by);
    }});

    this.time.delayedCall(dur + 50, () => {
      this._clearArc();
      this._resolvePlay(qteBonus, isOpen ? 'complete' : 'covered');
    });
  }

  // ─── PLAY RESOLUTION ──────────────────────────────────────────────────────

  _resolvePlay(qteBonus, type, rawYards) {
    this.phase = 'result';
    this._clearPassRush();
    const call = state.currentCall || 'run_inside';
    const isRun  = call.startsWith('run_') || call === 'scramble';
    const isPass = call.startsWith('pass_');
    const offP   = state.team?.players || [];
    const defP   = state.opponent?.players || [];
    const qb = offP.find(p => p.pos === 'QB') || { ovr:80, spd:68 };
    const rb = offP.find(p => p.pos === 'RB') || { ovr:78, spd:86 };
    const dl = defP.find(p => p.pos === 'DL') || { ovr:78 };
    const db = defP.find(p => ['CB','S'].includes(p.pos)) || { ovr:76 };

    let yards = rawYards;
    if (yards === undefined) {
      if (isRun) {
        const base = 2 + ((rb.spd - 70) * 0.12) + Phaser.Math.Between(-2, 6);
        yards = Math.round(base * qteBonus);
      } else if (isPass) {
        const variant = call.replace('pass_', '');
        const intCh = variant === 'deep' ? 0.12 : 0.04;
        const sackCh = variant === 'deep' ? 0.04 : 0.02;
        const compCh = clamp(0.58 + (qb.ovr - 50) * 0.004 - (db.ovr - 60) * 0.002, 0.3, 0.9);
        // INT on covered throw
        if (type === 'covered' && Math.random() < intCh * 2) {
          state.stats.team.int++;
          this._endPlay({ yards: 0, text: 'INTERCEPTED! Turnover.', type: 'int', turnover: true, td: false }); return;
        }
        if (Math.random() > compCh * qteBonus) {
          this._endPlay({ yards: 0, text: 'Incomplete.', type: 'inc', turnover: false, td: false }); return;
        }
        const base = variant === 'deep' ? Phaser.Math.Between(16, 38) : variant === 'quick' ? Phaser.Math.Between(3, 9) : Phaser.Math.Between(7, 16);
        yards = Math.round(base * qteBonus);
      }
    }

    const td = state.yardLine + (yards || 0) >= 100;
    if (td)    state.stats.team.td++;
    if (isRun) state.stats.team.rushYds += Math.max(0, yards);
    if (isPass) state.stats.team.passYds += Math.max(0, yards);

    const text = td ? `🏈 TOUCHDOWN! +${yards} yds!` : `${yards > 0 ? '+' : ''}${yards} yards`;
    this._endPlay({ yards: yards || 0, text, type: td ? 'td' : (isRun ? 'run' : 'pass'), turnover: false, td });
  }

  _endPlay(result) {
    state.lastResult = result;
    if (result.td) {
      state.score.team += 7; state.yardLine = 25; state.down = 1; state.toGo = 10;
    } else if (result.turnover) {
      state.possession = 'opp';
      state.yardLine = Math.max(5, 100 - state.yardLine);
      state.down = 1; state.toGo = 10;
    } else {
      state.yardLine = Math.min(99, state.yardLine + result.yards);
      if (result.yards >= state.toGo) { state.down = 1; state.toGo = 10; }
      else { state.down++; state.toGo = Math.max(1, state.toGo - result.yards); }
      if (state.down > 4) { state.possession = 'opp'; state.yardLine = Math.max(5, 100 - state.yardLine); state.down = 1; state.toGo = 10; }
    }
    state.plays++;
    if (state.plays % 8 === 0) state.quarter = Math.min(4, state.quarter + 1);

    this.events.emit('playResult', result);
    this.scene.get('Hud')?.events?.emit('playResult', result);

    if (state.quarter > 4 || state.plays >= 40) {
      this.time.delayedCall(1600, () => this.scene.start('GameOver'));
    } else {
      this.time.delayedCall(1900, () => {
        this._resetFormation();
        this._drawLines();
        this.scene.get('Hud')?.events?.emit('resetHud');
        this.scene.launch('PlayCall');
        this.scene.bringToTop('PlayCall');
      });
    }
  }

  // ─── UPDATE LOOP ──────────────────────────────────────────────────────────

  update(time, delta) {
    if (this.phase !== 'run') return;
    const spd = this.runSpd * (delta / 1000);
    const k = this.keys;
    let moved = false;
    if (k.rt.isDown || k.d.isDown) { this.runner.x += spd;       moved = true; }
    if (k.lt.isDown || k.a.isDown) { this.runner.x -= spd * 0.65; moved = true; }
    if (k.up.isDown || k.w.isDown) { this.runner.y -= spd * 0.82; moved = true; }
    if (k.dn.isDown || k.s.isDown) { this.runner.y += spd * 0.82; moved = true; }

    if (moved) {
      this.runner.y = clamp(this.runner.y, FIELD_Y + 10, FIELD_Y + FIELD_H - 10);
      this.ball.x = this.runner.x; this.ball.y = this.runner.y;
      if (this.runner._lbl) { this.runner._lbl.x = this.runner.x; this.runner._lbl.y = this.runner.y; }
      if (this.runner.x >= FIELD_RIGHT) { this._tackled(); return; }
      if (this.runner.y <= FIELD_Y || this.runner.y >= FIELD_Y + FIELD_H) { this._tackled(); return; }
    }

    // P2: Juke on SPACE
    this.jukeCD -= delta;
    if (Phaser.Input.Keyboard.JustDown(k.sp) && this.jukeCD <= 0) this._doJuke();
  }
}
