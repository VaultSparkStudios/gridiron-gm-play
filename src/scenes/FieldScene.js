import { state } from '../data/gameState.js';
import { Sound } from '../utils/sound.js';

const FIELD_Y = 60;
const FIELD_H = 380;
const YARD_W = 6;
const FIELD_LEFT = 100;
const FIELD_RIGHT = 700;

function yardToX(y) { return FIELD_LEFT + y * YARD_W; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
// pixels/second from a speed rating
function pxs(spd, base, scale) { return base + (spd - 70) * scale; }

export class FieldScene extends Phaser.Scene {
  constructor() { super('Field'); }

  create() {
    this._drawField();
    this._createBall();
    this._createPlayers();
    this._setupInput();
    this._buildDPad();
    this.phase = 'presnap';
    this.jukeCD = 0;
    this._pendingPAT = false;
    this._pendingKickoffCover = false;
    this._aiAngle = 0; this._aiJukeCD = 0;
    this.aiDown = 1; this.aiToGo = 10;
    this._lastReceiver = null;
    this._passRushActive = false;
    this._pocketBeaten = [false, false, false, false, false];
    this.events.on('playCalled', this._onPlayCalled, this);
    this._resetFormation();
    this.time.delayedCall(400, () => this._startKickoffReturn());
  }

  // ─── FIELD ────────────────────────────────────────────────────────────────

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
    this.add.text(50,  FIELD_Y + FIELD_H/2, 'END\nZONE', { fontSize:'11px', fontFamily:'monospace', color:'#166534', align:'center' }).setOrigin(0.5);
    this.add.text(750, FIELD_Y + FIELD_H/2, 'END\nZONE', { fontSize:'11px', fontFamily:'monospace', color:'#166534', align:'center' }).setOrigin(0.5);
    for (let y = 10; y <= 90; y += 10) {
      this.add.text(yardToX(y), FIELD_Y + 10, String(y<=50?y:100-y), { fontSize:'9px', fontFamily:'monospace', color:'#166534' }).setOrigin(0.5, 0);
    }
    this.losLine      = this.add.graphics();
    this.firstDownLine = this.add.graphics();
    this.arcGfx        = this.add.graphics();
    this.add.text(4, FIELD_Y + FIELD_H + 8,
      'Offense: WASD / Juke: SPACE / Pass: click receiver  •  Defense: WASD to tackle',
      { fontSize:'9px', fontFamily:'monospace', color:'#334155' });
  }

  _createBall() { this.ball = this.add.circle(0, 0, 6, 0xd97706).setDepth(10); }

  // ─── PLAYERS ──────────────────────────────────────────────────────────────

  _createPlayers() {
    const tc = Phaser.Display.Color.HexStringToColor(state.team?.clr     || '#22c55e').color;
    const oc = Phaser.Display.Color.HexStringToColor(state.opponent?.clr || '#ef4444').color;
    this.qb  = this._dot(tc, 'QB',  14);  this.rb  = this._dot(tc, 'RB',  13);
    this.wr1 = this._dot(tc, 'WR',  10);  this.wr2 = this._dot(tc, 'WR',  10);
    this.te  = this._dot(tc, 'TE',  12);
    this.lt  = this._dot(tc, 'LT',  13);  this.lg  = this._dot(tc, 'LG',  13);
    this.c   = this._dot(tc, 'C',   13);  this.rg  = this._dot(tc, 'RG',  13);
    this.rt  = this._dot(tc, 'RT',  13);
    this.oLine = [this.lt, this.lg, this.c, this.rg, this.rt];
    this.offPlayers = [this.qb, this.rb, this.wr1, this.wr2, this.te, ...this.oLine];
    this.dl  = this._dot(oc, 'DE',  14);  this.dl2 = this._dot(oc, 'DT',  14);
    this.lb  = this._dot(oc, 'MLB', 12);  this.lb2 = this._dot(oc, 'OLB', 12);
    this.cb1 = this._dot(oc, 'CB',  10);  this.cb2 = this._dot(oc, 'CB',  10);
    this.saf = this._dot(oc, 'FS',  11);
    this.defPlayers = [this.dl, this.dl2, this.lb, this.lb2, this.cb1, this.cb2, this.saf];
    this.recTargets = [];
  }

  _dot(color, label, radius) {
    const g = this.add.graphics();
    g.fillStyle(color, 1); g.fillCircle(0, 0, radius);
    g.lineStyle(2, 0xffffff, 0.35); g.strokeCircle(0, 0, radius);
    const lbl = this.add.text(0, 0, label, { fontSize:'7px', fontFamily:'monospace', color:'#fff', fontStyle:'bold' }).setOrigin(0.5).setDepth(5);
    g._lbl = lbl; g._r = radius; g._origLabel = label;
    g.setDepth(4);
    return g;
  }

  _place(d, x, y) { d.x = x; d.y = y; if (d._lbl) { d._lbl.x = x; d._lbl.y = y; } }
  _show(d, vis)   { d.setVisible(vis); if (d._lbl) d._lbl.setVisible(vis); }
  _syncLbl(d)     { if (d._lbl) { d._lbl.x = d.x; d._lbl.y = d.y; } }

  // ─── INPUT + D-PAD ────────────────────────────────────────────────────────

  _setupInput() {
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,    w: Phaser.Input.Keyboard.KeyCodes.W,
      dn: Phaser.Input.Keyboard.KeyCodes.DOWN,  s: Phaser.Input.Keyboard.KeyCodes.S,
      lt: Phaser.Input.Keyboard.KeyCodes.LEFT,  a: Phaser.Input.Keyboard.KeyCodes.A,
      rt: Phaser.Input.Keyboard.KeyCodes.RIGHT, d: Phaser.Input.Keyboard.KeyCodes.D,
      sp: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
  }

  _buildDPad() {
    this._dpadState = { dx: 0, dy: 0 };
    const bx = 718, by = 452, sz = 44, gap = 2;
    [{ label:'▲',dx:0, dy:-1,ox:0,       oy:-(sz+gap) },
     { label:'▼',dx:0, dy: 1,ox:0,       oy: (sz+gap) },
     { label:'◀',dx:-1,dy: 0,ox:-(sz+gap),oy:0        },
     { label:'▶',dx: 1,dy: 0,ox: (sz+gap),oy:0        }].forEach(({ label,dx,dy,ox,oy }) => {
      const btn = this.add.rectangle(bx+ox, by+oy, sz, sz, 0x334155, 0.65).setDepth(50).setInteractive();
      this.add.text(bx+ox, by+oy, label, { fontSize:'14px', fontFamily:'monospace', color:'#94a3b8' }).setOrigin(0.5).setDepth(51);
      btn.on('pointerdown', ()=>{ this._dpadState.dx=dx; this._dpadState.dy=dy; });
      btn.on('pointerup',   ()=>{ if(this._dpadState.dx===dx)this._dpadState.dx=0; if(this._dpadState.dy===dy)this._dpadState.dy=0; });
      btn.on('pointerout',  ()=>{ if(this._dpadState.dx===dx)this._dpadState.dx=0; if(this._dpadState.dy===dy)this._dpadState.dy=0; });
    });
  }

  // ─── FORMATIONS ───────────────────────────────────────────────────────────

  _resetFormation() {
    const lx = yardToX(state.yardLine), cy = FIELD_Y + FIELD_H / 2;
    // Restore original labels
    [...this.offPlayers, ...this.defPlayers].forEach(d => { if (d._lbl && d._origLabel) d._lbl.setText(d._origLabel); });
    this.offPlayers.forEach(d => this._show(d, true));
    this.defPlayers.forEach(d => this._show(d, true));

    // Offense: QB slightly deeper; OL ON the line of scrimmage
    this._place(this.qb,  lx - 28, cy);
    this._place(this.rb,  lx - 50, cy + 20);
    this._place(this.wr1, lx - 6,  cy - 70);
    this._place(this.wr2, lx - 6,  cy + 70);
    this._place(this.te,  lx - 6,  cy - 34);
    // 5-man OL: C at center, guards ±14, tackles ±28 (all at LOS)
    this._place(this.lt,  lx, cy - 28);
    this._place(this.lg,  lx, cy - 14);
    this._place(this.c,   lx, cy);
    this._place(this.rg,  lx, cy + 14);
    this._place(this.rt,  lx, cy + 28);

    this._applySchemeFormation(lx, cy, state.opponent?.dcScheme || '4-3');
    this.ball.x = this.qb.x; this.ball.y = this.qb.y;
    this.phase = 'presnap';
    this.jukeCD = 0;
    this._clearPassRush();
    this._drawLines();
    this._clearArc();
    this.recTargets.forEach(r => r?.destroy?.()); this.recTargets = [];
  }

  _resetAIFormation() {
    const lx = yardToX(state.yardLine), cy = FIELD_Y + FIELD_H / 2;
    this._show(this.dl, true);  this._show(this.dl2, true);
    this._show(this.lb, true);  this._show(this.lb2, true);
    this._show(this.cb1, false); this._show(this.cb2, false); this._show(this.saf, false);
    this._place(this.dl,  lx + 10, cy);
    this._place(this.dl2, lx + 10, cy - 18);
    this._place(this.lb,  lx + 28, cy - 44);
    this._place(this.lb2, lx + 28, cy + 44);
    this.dl._lbl?.setText('RB'); this.dl2._lbl?.setText('OL');
    this.lb._lbl?.setText('WR'); this.lb2._lbl?.setText('WR');

    this.oLine.forEach(ol => this._show(ol, false));
    this._show(this.te, false);
    this._show(this.qb, true);  this._show(this.rb, true);
    this._show(this.wr1, true); this._show(this.wr2, true);
    this._place(this.rb,  lx - 15, cy);
    this._place(this.qb,  lx - 42, cy + 28);
    this._place(this.wr1, lx - 32, cy - 50);
    this._place(this.wr2, lx - 32, cy + 50);
    this.rb._lbl?.setText('YOU'); this.qb._lbl?.setText('LB');
    this.wr1._lbl?.setText('CB');  this.wr2._lbl?.setText('CB');

    this.userDef  = this.rb;
    this.aiRunner = this.dl;
    this.aiStartX = this.dl.x;
    this.ball.x = this.dl.x; this.ball.y = this.dl.y;
    this._aiAngle = 0; this._aiJukeCD = 0;

    const rData = state.opponent?.players?.find(p => ['DE','DL'].includes(p.pos)) || { spd: 78 };
    const dData = state.team?.players?.find(p => p.pos === 'QB')     || { spd: 66 };
    this._aiRunSpeed = pxs(rData.spd, 64, 0.9);
    this._defSpd     = pxs(dData.spd, 90, 1.2);
    this._clearPassRush();
    this._drawLines();
    this._clearArc();
    this.recTargets.forEach(r => r?.destroy?.()); this.recTargets = [];
  }

  _applySchemeFormation(lx, cy, dc) {
    switch (dc) {
      case '3-4':
        this._show(this.dl2, true); this._show(this.lb2, true);
        this._place(this.dl,  lx+14,cy-10); this._place(this.dl2,lx+14,cy+10);
        this._place(this.lb,  lx+40,cy-24); this._place(this.lb2,lx+40,cy+24);
        this._place(this.cb1, lx+20,cy-68); this._place(this.cb2,lx+20,cy+68);
        this._place(this.saf, lx+80,cy); break;
      case 'Cover 2':
        this._show(this.dl2, true); this._show(this.lb2, false);
        this._place(this.dl,  lx+16,cy); this._place(this.lb, lx+40,cy);
        this._place(this.cb1, lx+18,cy-54); this._place(this.cb2,lx+18,cy+54);
        this._place(this.saf, lx+105,cy-44); this._place(this.dl2,lx+105,cy+44); break;
      case 'Zone Blitz':
        this._show(this.dl2, false); this._show(this.lb2, true);
        this._place(this.dl,  lx+16,cy);
        this._place(this.lb,  lx+22,cy-28); this._place(this.lb2,lx+8,cy+30);
        this._place(this.cb1, lx+42,cy-58); this._place(this.cb2,lx+42,cy+58);
        this._place(this.saf, lx+92,cy); break;
      default: // 4-3
        this._show(this.dl2, false); this._show(this.lb2, false);
        this._place(this.dl,  lx+16,cy); this._place(this.lb, lx+42,cy+10);
        this._place(this.cb1, lx+22,cy-64); this._place(this.cb2,lx+22,cy+64);
        this._place(this.saf, lx+92,cy);
    }
  }

  _drawLines() {
    this.losLine.clear(); this.firstDownLine.clear();
    const lx = yardToX(state.yardLine);
    this.losLine.lineStyle(2, 0xfbbf24, 0.9);
    this.losLine.lineBetween(lx, FIELD_Y, lx, FIELD_Y + FIELD_H);
    if (state.possession === 'team') {
      const fdx = yardToX(Math.min(99, state.yardLine + state.toGo));
      this.firstDownLine.lineStyle(2, 0x22c55e, 0.7);
      this.firstDownLine.lineBetween(fdx, FIELD_Y, fdx, FIELD_Y + FIELD_H);
    } else {
      const fdx = yardToX(Math.max(1, state.yardLine - (this.aiToGo || 10)));
      this.firstDownLine.lineStyle(2, 0xef4444, 0.7);
      this.firstDownLine.lineBetween(fdx, FIELD_Y, fdx, FIELD_Y + FIELD_H);
    }
  }

  _clearArc() { this.arcGfx.clear(); }

  // ─── PLAY DISPATCH ────────────────────────────────────────────────────────

  _onPlayCalled(callId) {
    state.currentCall = callId;
    if      (callId === 'punt')                              this._doPunt();
    else if (callId === 'fg')                                this._attemptFG();
    else if (callId.startsWith('run_') || callId === 'scramble') this._startRun(callId);
    else if (callId.startsWith('pass_'))                    this._startPass(callId);
  }

  _doPunt() {
    this.phase = 'result';
    Sound.whistle();
    this._endPlay({ yards:0, text:'PUNT — possession flipped', type:'punt', turnover:true, td:false });
  }

  _attemptFG() {
    this.phase = 'result';
    const dist = (100 - state.yardLine) + 17;
    const made = Math.random() < Math.max(0.18, Math.min(0.96, 1.08 - dist * 0.013));
    Sound.whistle();
    if (made) {
      state.score.team += 3;
      state.yardLine = 20; // flip in _endPlay will give opponent their 80 (80 yds to score)
      this._pendingKickoffCover = true;
      this._tdFlash(`FG GOOD! ${dist} yds +3`, '#22c55e');
    } else {
      this._tdFlash(`FG NO GOOD — ${dist} yds`, '#ef4444');
    }
    this._endPlay({ yards:0, text: made ? `FG GOOD! +3` : `FG NO GOOD`, type: made ? 'fg' : 'fg_miss', turnover:true, td:false });
  }

  // ─── RUN GAME ─────────────────────────────────────────────────────────────

  _startRun(callId) {
    const isScramble = callId === 'scramble';
    const isOutside  = callId === 'run_outside';
    const isDraw     = callId === 'run_draw';
    this.runner     = isScramble ? this.qb : this.rb;
    this.startX     = this.runner.x;
    const pData     = state.team?.players?.find(p => p.pos === (isScramble ? 'QB' : 'RB')) || { ovr:78, spd:82, id:'rb1' };
    this._runnerData = pData;
    // Tuned: runner 72-90 px/s, QB scramble slightly slower
    this.runSpd = pxs(pData.spd, isScramble ? 58 : 72, 0.95) + (isOutside ? 8 : 0) + (isDraw ? 6 : 0);
    this.ball.x = this.runner.x; this.ball.y = this.runner.y;

    if (isDraw) {
      this.phase = 'run_draw_fake';
      this.tweens.add({ targets: this.qb, x: this.qb.x - 10, duration: 260, yoyo: true,
        onUpdate: () => this._syncLbl(this.qb),
        onComplete: () => { if (this.phase === 'run_draw_fake') this.phase = 'run'; }
      });
    } else {
      this.phase = 'run';
    }

    this._startOLBlocker();

    const dc = state.opponent?.dcScheme || '4-3';
    const rushers = [this.dl, this.lb];
    if (dc === '3-4' || dc === 'Zone Blitz') rushers.push(this.lb2);
    this._aiRushers(rushers);
    if (isOutside) this._aiCBsSupport();

    Sound.whistle();
    this.events.emit('phaseChange', 'run');
  }

  // 5-man OL: each lineman blocks assigned defender
  _startOLBlocker() {
    this.time.addEvent({ delay: 16, loop: true, callback: () => {
      if (this.phase !== 'run' && this.phase !== 'run_draw_fake') return;
      const blocked = new Set();
      this.oLine.forEach(ol => {
        if (!ol.visible) return;
        // Each OL finds nearest unblocked defender
        let nearestDef = null, nearestDist = 999;
        this.defPlayers.forEach(d => {
          if (!d.visible || blocked.has(d)) return;
          const dist = Math.hypot(d.x - ol.x, d.y - ol.y);
          if (dist < nearestDist) { nearestDist = dist; nearestDef = d; }
        });
        if (nearestDef) {
          blocked.add(nearestDef);
          const tx = this.runner.x * 0.4 + nearestDef.x * 0.6;
          const ty = this.runner.y * 0.4 + nearestDef.y * 0.6;
          ol.x += (tx - ol.x) * 0.09;
          ol.y += (ty - ol.y) * 0.09;
          this._syncLbl(ol);
        }
        // Push back any defender in contact with this lineman
        this.defPlayers.forEach(d => {
          if (!d.visible) return;
          const dx = d.x - ol.x, dy = d.y - ol.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 28 && dist > 0) {
            const force = (28 - dist) / 28 * 2.4;
            d.x += (dx/dist)*force; d.y += (dy/dist)*force;
            this._syncLbl(d);
          }
        });
      });
    }});
  }

  _aiRushers(dots) {
    const defData = state.opponent?.players || [];
    dots.forEach((dot, i) => {
      if (!dot.visible) return;
      const pPos  = i === 0 ? 'DE' : 'MLB';
      const pData = defData.find(p => p.pos === pPos) || { spd: 74 };
      // Tuned: defenders 38-52 px/s — fast enough to pressure, beatable with moves
      const spd = pxs(pData.spd, 38, 0.52) / 60; // convert to per-frame
      this.time.addEvent({ delay: 16, loop: true, callback: () => {
        if (this.phase !== 'run') return;
        const dx = this.runner.x - dot.x, dy = this.runner.y - dot.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 13) { this._tackled(); return; }
        dot.x += (dx/dist)*spd; dot.y += (dy/dist)*spd;
        this._syncLbl(dot);
      }});
    });
  }

  _aiCBsSupport() {
    [this.cb1, this.cb2].forEach(cb => {
      this.time.addEvent({ delay: 50, loop: true, callback: () => {
        if (this.phase !== 'run') return;
        const dx = this.runner.x - cb.x, dy = this.runner.y - cb.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 13) { this._tackled(); return; }
        if (dist > 90) { cb.x += (dx/dist)*0.55; cb.y += (dy/dist)*0.55; this._syncLbl(cb); }
      }});
    });
  }

  _doJuke() {
    this.jukeCD = 1600;
    this.runSpd *= 1.22;
    this.time.delayedCall(320, () => { this.runSpd *= 0.82; });
    Sound.juke();
    this.tweens.add({ targets: this.runner, scaleX: 1.4, scaleY: 1.4, duration: 140, yoyo: true, ease: 'Bounce.easeOut' });
    this.defPlayers.forEach(d => {
      if (!d.visible) return;
      const dx = d.x - this.runner.x, dy = d.y - this.runner.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 68 && dist > 0) {
        this.tweens.add({ targets: d, x: d.x+(dx/dist)*52, y: d.y+(dy/dist)*52, duration: 360, ease: 'Sine.easeOut',
          onUpdate: () => this._syncLbl(d) });
      }
    });
    if (this._jukeCDBar) this._jukeCDBar.destroy();
    this._jukeCDBar = this.add.rectangle(this.runner.x, this.runner.y - 22, 30, 4, 0xf59e0b).setDepth(20);
    this.tweens.add({ targets: this._jukeCDBar, scaleX: 0, duration: this.jukeCD, ease: 'Linear',
      onComplete: () => { this._jukeCDBar?.destroy(); this._jukeCDBar = null; }
    });
  }

  _tackled() {
    if (this.phase !== 'run') return;
    this.phase = 'result';
    Sound.tackle();
    if (this._jukeCDBar) { this._jukeCDBar.destroy(); this._jukeCDBar = null; }
    this.tweens.add({ targets: this.runner, scaleX: 0.65, scaleY: 0.65, duration: 180, yoyo: true });
    const yards = Math.round((this.runner.x - this.startX) / YARD_W);
    const rb = (state.team?.players || []).find(p => p.pos === 'RB') || { str: 70 };
    const fumCh = Math.max(0.02, 0.055 - (rb.str - 70) * 0.0006);
    if (Math.random() < fumCh) {
      Sound.incomplete();
      state.stats.team.fum = (state.stats.team.fum || 0) + 1;
      this._tdFlash('FUMBLE!', '#ef4444');
      this._endPlay({ yards: 0, text: 'FUMBLE! Possession lost.', type: 'fumble', turnover: true, td: false });
      return;
    }
    this._resolvePlay(1.0, 'tackle', yards);
  }

  // ─── PASS GAME ────────────────────────────────────────────────────────────

  _startPass(callId) {
    this.phase = 'pass_wait';
    this.passVariant = callId.replace('pass_', '');
    const isAction = this.passVariant === 'action';
    if (isAction) {
      this.tweens.add({ targets: this.rb, x: this.rb.x + 22, duration: 280, yoyo: true,
        onUpdate: () => this._syncLbl(this.rb) });
      this.passVariant = 'deep';
    }
    this._animateRoutes(this.passVariant);
    this._setupPocket();          // ← form OL/TE/RB protection pocket BEFORE pass rush
    this._startPassRush(isAction);
    Sound.whistle();
    this.events.emit('phaseChange', 'pass');
    this.time.delayedCall(isAction ? 850 : 550, () => this._buildReceiverTargets(isAction));
  }

  // 5-man OL forms protective pocket: LT/LG/C/RG/RT arc in front of QB
  _setupPocket() {
    this._pocketBeaten = [false, false, false, false, false];
    const qx = this.qb.x, qy = this.qb.y;
    // Get individual OL ratings from GM export (fall back to 77)
    const olPlayers = state.team?.players?.filter(p => ['LT','LG','C','RG','RT'].includes(p.pos)) || [];
    const getOvr = pos => olPlayers.find(p => p.pos === pos)?.ovr || 77;
    const positions = [
      { dot: this.lt, tx: qx + 24, ty: qy - 22, pos: 'LT' },  // left tackle
      { dot: this.lg, tx: qx + 18, ty: qy - 10, pos: 'LG' },  // left guard
      { dot: this.c,  tx: qx + 14, ty: qy,      pos: 'C'  },  // center
      { dot: this.rg, tx: qx + 18, ty: qy + 10, pos: 'RG' },  // right guard
      { dot: this.rt, tx: qx + 24, ty: qy + 22, pos: 'RT' },  // right tackle
    ];
    this._pocketDots    = positions.map(p => p.dot);
    this._pocketOvrs    = positions.map(p => getOvr(p.pos));
    positions.forEach(({ dot, tx, ty }) => {
      this.tweens.add({ targets: dot, x: tx, y: ty, duration: 200,
        onUpdate: () => this._syncLbl(dot) });
    });
  }

  _startPassRush(isPlayAction = false) {
    const rushDelay = isPlayAction ? 440 : 0;
    const dc = state.opponent?.dcScheme || '4-3';
    const rushers = [this.dl];
    if (dc === 'Zone Blitz') rushers.push(this.lb2);
    if (dc === '3-4')       rushers.push(this.dl2);

    const dlData = state.opponent?.players?.find(p => ['DE','DL'].includes(p.pos)) || { spd: 75 };
    this._passRushActive = true;

    // Each rusher is assigned a pocket blocker
    rushers.forEach((rusher, ri) => {
      if (!rusher.visible) return;

      // Rush speed: relatively slow while blocked (pocket absorbs); faster when free
      const blockedSpd  = pxs(dlData.spd - ri*3, 10, 0.10) / 60;   // crawl while blocked
      const freeSpd     = pxs(dlData.spd - ri*3, 46, 0.52) / 60;   // ~50 px/s when free

      // Pocket blocker assigned to this rusher (up to 5 OL)
      const blockerIdx = ri % 5;
      // Beat time scales with OL rating: elite OL holds longer
      const olOvr = this._pocketOvrs?.[blockerIdx] || 77;
      const beatMs = 1900 + (olOvr / 99) * 1400 + Math.random() * 800 + rushDelay;
      this.time.delayedCall(beatMs, () => {
        this._pocketBeaten[blockerIdx] = true;
        if (this.phase === 'pass_wait') this.pressureTxt?.setText('PRESSURE!');
      });

      this.time.delayedCall(rushDelay, () => {
        this.time.addEvent({ delay: 16, loop: true, callback: () => {
          if (!this._passRushActive) return;
          const dx = this.qb.x - rusher.x, dy = this.qb.y - rusher.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 14) { this._sack(); return; }

          // Block effect: nearly stop rusher if pocket blocker is in contact
          let spd = freeSpd;
          if (!this._pocketBeaten[blockerIdx]) {
            const blocker = this._pocketDots?.[blockerIdx];
            if (blocker) {
              const bdist = Math.hypot(rusher.x - blocker.x, rusher.y - blocker.y);
              if (bdist < 30) {
                // Almost fully stopped in contact; gradual release near edge of range
                spd = blockedSpd + freeSpd * Math.max(0, (bdist - 14) / 16);
              }
            }
          }

          rusher.x += (dx/dist)*spd; rusher.y += (dy/dist)*spd;
          this._syncLbl(rusher);
        }});
      });
    });

    // Pocket blockers move to stay between QB and their assigned rusher
    this.time.addEvent({ delay: 16, loop: true, callback: () => {
      if (!this._passRushActive) return;
      this._pocketDots?.forEach((blocker, i) => {
        if (this._pocketBeaten[i]) return;
        const rusher = rushers[i % rushers.length];
        if (!rusher?.visible) return;
        // Interpose: 35% toward QB, 65% toward rusher — stays in pass lane
        const tx = this.qb.x * 0.35 + rusher.x * 0.65;
        const ty = this.qb.y * 0.35 + rusher.y * 0.65;
        blocker.x += (tx - blocker.x) * 0.07;
        blocker.y += (ty - blocker.y) * 0.07;
        this._syncLbl(blocker);
      });
    }});

    this.pressureTxt = this.add.text(this.qb.x, this.qb.y - 34, '', {
      fontSize:'11px', fontFamily:'monospace', fontStyle:'bold', color:'#ef4444'
    }).setOrigin(0.5).setDepth(15);
    // "Throw it" warning fires 900ms after first blocker could be beaten
    this.time.addEvent({ delay: 2900+rushDelay, callback: ()=>{ if(this.phase==='pass_wait') this.pressureTxt?.setText('THROW IT!'); } });
  }

  _clearPassRush() {
    this._passRushActive = false;
    this._pocketBeaten = [false, false, false, false, false];
    this.pressureTxt?.destroy(); this.pressureTxt = null;
  }

  _sack() {
    if (this.phase !== 'pass_wait') return;
    this._clearPassRush(); this.phase = 'result';
    Sound.sack();
    this.recTargets.forEach(r => r?.destroy?.()); this.recTargets = [];
    const loss = Phaser.Math.Between(4, 11);
    this._endPlay({ yards:-loss, text:`SACK! -${loss} yards`, type:'sack', turnover:false, td:false });
  }

  _animateRoutes(variant) {
    const depth = { quick:32, medium:62, deep:110 }[variant] || 62;
    [{ p:this.wr1, ty: this.wr1.y + (variant==='quick'?22:variant==='deep'?-18:14) },
     { p:this.wr2, ty: this.wr2.y - (variant==='quick'?22:variant==='deep'?-18:14) },
     { p:this.te,  ty: this.te.y  + 16 },
     { p:this.rb,  ty: this.rb.y  - 8  }].forEach(({ p, ty }) => {
      const txd = p === this.rb ? 24 : p === this.te ? depth*0.65 : depth;
      const dur = variant==='quick'?420:variant==='deep'?880:620;
      this.tweens.add({ targets:p, x:p.x+txd, y:ty, duration:dur, ease:'Sine.easeOut',
        onUpdate:()=>this._syncLbl(p) });
    });
    // QB drops back
    this.tweens.add({ targets:this.qb, x:this.qb.x-16, duration:320, ease:'Sine.easeOut',
      onUpdate:()=>this._syncLbl(this.qb) });
  }

  _buildReceiverTargets(isPlayAction = false) {
    if (this.phase !== 'pass_wait') return;
    const dc = state.opponent?.dcScheme || '4-3';
    const isZone   = dc==='Cover 2' || dc==='Zone Blitz';
    const dbRatings = (state.opponent?.players||[]).filter(p=>['CB','S'].includes(p.pos)).map(p=>p.ovr);
    const receivers = [
      { dot:this.wr1, p:state.team?.players?.find(p=>p.pos==='WR')              || {spd:88,ovr:80,name:'WR', id:'wr1'} },
      { dot:this.wr2, p:state.team?.players?.filter(p=>p.pos==='WR')[1]          || {spd:84,ovr:76,name:'WR2',id:'wr2'} },
      { dot:this.te,  p:state.team?.players?.find(p=>p.pos==='TE')               || {spd:72,ovr:74,name:'TE', id:'te1'} },
      { dot:this.rb,  p:state.team?.players?.find(p=>p.pos==='RB')               || {spd:86,ovr:78,name:'RB', id:'rb1'} },
    ];
    receivers.forEach(({ dot, p }, i) => {
      const cbOvr = dbRatings[i % dbRatings.length] || 75;
      const actBonus = isPlayAction ? 16 : 0;
      const isOpen = (p.spd||80)+actBonus > (cbOvr+(isZone?-5:0))*0.94 && Math.random() < 0.54+((p.spd||80)+actBonus-cbOvr)/200;
      const zone = this.add.circle(dot.x, dot.y, 20, isOpen?0x22c55e:0xef4444, 0.32)
        .setDepth(8).setInteractive({ useHandCursor:true });
      const icon   = this.add.text(dot.x, dot.y-28, isOpen?'🟢':'🔴', {fontSize:'14px'}).setOrigin(0.5).setDepth(9);
      const nmTxt  = this.add.text(dot.x, dot.y+22, p.name||p.pos, {fontSize:'7px',fontFamily:'monospace',color:'#fff'}).setOrigin(0.5).setDepth(9);
      zone.on('pointerdown', ()=>{ if(this.phase!=='pass_wait') return; this._lastReceiver=p; this._throwTo(dot, isOpen); });
      zone.on('pointerover', ()=>zone.setAlpha(0.65));
      zone.on('pointerout',  ()=>zone.setAlpha(1));
      if (isOpen) this.tweens.add({ targets:zone, scaleX:1.2, scaleY:1.2, duration:520, yoyo:true, repeat:-1 });
      this.recTargets.push(zone, icon, nmTxt);
    });
    if (!isZone) this._aiManCoverage(); else this._aiZoneCoverage();
  }

  _aiManCoverage() {
    const cbData = (state.opponent?.players||[]).filter(p=>p.pos==='CB');
    [{ cb:this.cb1, wr:this.wr1, spd:cbData[0]?.spd||82 },
     { cb:this.cb2, wr:this.wr2, spd:cbData[1]?.spd||78 }].forEach(({ cb, wr, spd }) => {
      this.time.addEvent({ delay:16, loop:true, callback:()=>{
        if (this.phase!=='pass_wait' && this.phase!=='pass_flight') return;
        const dx=wr.x-cb.x, dy=wr.y-cb.y, dist=Math.sqrt(dx*dx+dy*dy);
        if (dist<8) return;
        const s=(spd/90)*0.95; // px/frame at 60fps
        cb.x+=(dx/dist)*s; cb.y+=(dy/dist)*s;
        this._syncLbl(cb);
      }});
    });
  }

  _aiZoneCoverage() {
    const lx=yardToX(state.yardLine), cy=FIELD_Y+FIELD_H/2;
    [{ dot:this.cb1, tx:lx+52,ty:cy-54 },
     { dot:this.cb2, tx:lx+52,ty:cy+54 },
     { dot:this.saf, tx:lx+112,ty:cy }].forEach(({ dot,tx,ty }) => {
      this.time.addEvent({ delay:16, loop:true, callback:()=>{
        if (this.phase!=='pass_wait') return;
        dot.x+=(tx-dot.x)*0.04; dot.y+=(ty-dot.y)*0.04; this._syncLbl(dot);
      }});
    });
  }

  _throwTo(receiverDot, isOpen) {
    if (this.phase!=='pass_wait') return;
    this.phase = 'pass_flight';
    this._clearPassRush();
    this.recTargets.forEach(r=>r?.destroy?.()); this.recTargets=[];
    this.pressureTxt?.destroy();
    const qteBonus = isOpen ? 1.18+Math.random()*0.18 : 0.38+Math.random()*0.14;
    const sx=this.ball.x, sy=this.ball.y, ex=receiverDot.x, ey=receiverDot.y;
    const peakY = Math.min(sy,ey)-38;
    let t=0; const dur=380;
    const arc = this.time.addEvent({ delay:16, loop:true, callback:()=>{
      t+=16/dur; if(t>1){arc.remove();this._clearArc();return;}
      const bx=Phaser.Math.Linear(sx,ex,t), by=(1-t)*(1-t)*sy+2*(1-t)*t*peakY+t*t*ey;
      this.ball.x=bx; this.ball.y=by;
      this.arcGfx.clear(); this.arcGfx.lineStyle(1,0xfbbf24,0.5); this.arcGfx.lineBetween(sx,sy,bx,by);
    }});
    this.time.delayedCall(dur+50, ()=>{ this._clearArc(); this._resolvePlay(qteBonus, isOpen?'complete':'covered'); });
  }

  // ─── PLAY RESOLUTION ──────────────────────────────────────────────────────

  _resolvePlay(qteBonus, type, rawYards) {
    this.phase = 'result';
    this._clearPassRush();
    const call  = state.currentCall || 'run_inside';
    const isRun  = call.startsWith('run_') || call==='scramble';
    const isPass = call.startsWith('pass_');
    const offP  = state.team?.players  || [];
    const defP  = state.opponent?.players || [];
    const qb = offP.find(p=>p.pos==='QB') || { ovr:80, spd:68, id:'qb1' };
    const rb = offP.find(p=>p.pos==='RB') || { ovr:78, spd:86, id:'rb1' };
    const db = defP.find(p=>['CB','S'].includes(p.pos)) || { ovr:76 };

    let yards = rawYards;
    if (yards === undefined) {
      if (isRun) {
        // Base 2–5 yards; speed differential adds 0–3 more
        const base = 2 + ((rb.spd - 70) * 0.10) + Phaser.Math.Between(-1, 5);
        yards = Math.round(base * qteBonus);
      } else if (isPass) {
        const variant = call.replace('pass_','');
        const isDeep = variant==='deep' || variant==='action';
        const intCh  = isDeep ? 0.11 : 0.04;
        const compCh = clamp(0.56+(qb.ovr-50)*0.004-(db.ovr-60)*0.002, 0.28, 0.88);
        if (type==='covered' && Math.random()<intCh*2) {
          Sound.int(); state.stats.team.int++;
          this._track(qb.id,'int',1);
          this._endPlay({ yards:0, text:'INTERCEPTED! Turnover.', type:'int', turnover:true, td:false }); return;
        }
        if (Math.random() > compCh*qteBonus) {
          Sound.incomplete(); this._track(qb.id,'att',1);
          this._endPlay({ yards:0, text:'Incomplete.', type:'inc', turnover:false, td:false }); return;
        }
        const base = isDeep ? Phaser.Math.Between(14,36) : variant==='quick' ? Phaser.Math.Between(3,8) : Phaser.Math.Between(6,15);
        yards = Math.round(base * qteBonus);
      }
    }

    const td = state.yardLine + (yards||0) >= 100;
    if (td)                      { Sound.td();        this._tdFlash('TOUCHDOWN! 🏈','#f59e0b'); state.stats.team.td++; }
    else if (yards >= state.toGo){ Sound.firstDown(); }
    else if (!td && yards <= 0)  { Sound.tackle(); }

    if (isRun) {
      state.stats.team.rushYds += Math.max(0, yards);
      const runner = call==='scramble' ? qb : rb;
      this._track(runner.id,'rushYds',Math.max(0,yards)); this._track(runner.id,'rushAtt',1);
      if (td) this._track(runner.id,'td',1);
    }
    if (isPass) {
      state.stats.team.passYds += Math.max(0, yards);
      this._track(qb.id,'passYds',Math.max(0,yards)); this._track(qb.id,'att',1); this._track(qb.id,'comp',1);
      if (this._lastReceiver) {
        this._track(this._lastReceiver.id,'recYds',Math.max(0,yards));
        this._track(this._lastReceiver.id,'rec',1);
        if (td) this._track(this._lastReceiver.id,'td',1);
      }
      this._lastReceiver = null;
    }

    const text = td ? `🏈 TOUCHDOWN! +${yards} yds!` : `${yards>0?'+':''}${yards} yards`;
    this._endPlay({ yards:yards||0, text, type:td?'td':(isRun?'run':'pass'), turnover:false, td });
  }

  _track(id, key, val) {
    if (!id) return;
    if (!state.playerStats[id]) state.playerStats[id] = {};
    state.playerStats[id][key] = (state.playerStats[id][key]||0) + val;
  }

  _endPlay(result) {
    state.lastResult = result;
    if (!state.currentDrive) state.currentDrive = { poss:'team', plays:0, yards:0, start:state.yardLine };
    state.currentDrive.plays++;
    state.currentDrive.yards += Math.max(0, result.yards || 0);
    let driveEnd = null;
    if (result.td) {
      driveEnd = 'TD';
      state.score.team += 6; state.yardLine=25; state.down=1; state.toGo=10; state.possession='team';
      this._pendingPAT = result.type === 'td'; // user TD only; AI TD goes through _aiTouchdown
    } else if (result.turnover) {
      driveEnd = result.type==='int'?'INT':result.type==='fumble'?'FUM':result.type==='fg'?'FG':result.type==='fg_miss'?'NO FG':'PUNT';
      state.possession='opp'; state.yardLine=Math.max(5,100-state.yardLine); state.down=1; state.toGo=10;
    } else {
      state.yardLine = Math.min(99, state.yardLine + result.yards);
      if (result.yards >= state.toGo) { state.down=1; state.toGo=10; }
      else { state.down++; state.toGo=Math.max(1,state.toGo-result.yards); }
      if (state.down > 4) { driveEnd='DOWNS'; state.possession='opp'; state.yardLine=Math.max(5,100-state.yardLine); state.down=1; state.toGo=10; }
    }
    if (driveEnd) { state.drives.push({...state.currentDrive, result:driveEnd}); state.currentDrive={poss:state.possession,plays:0,yards:0,start:state.yardLine}; }
    state.plays++;
    if (state.plays%8===0) state.quarter=Math.min(4,state.quarter+1);
    this.events.emit('playResult', result);
    const hud = this.scene.get('Hud');
    hud?.events?.emit('playResult', result);
    hud?.events?.emit('possessionChange', state.possession);
    this._afterPlay();
  }

  _afterPlay() {
    if (!state._halfShown && state.quarter>=3 && !this._pendingPAT) { state._halfShown=true; this.time.delayedCall(1600,()=>this._showHalftime()); return; }
    if (state.quarter>4 || state.plays>=40) {
      this.time.delayedCall(1600, ()=>this.scene.start('GameOver'));
    } else if (state.possession==='opp') {
      this.time.delayedCall(1800, ()=>{
        if (this._pendingKickoffCover) { this._pendingKickoffCover=false; this._startKickoffCover(); }
        else this._startAIDrive();
      });
    } else {
      this.time.delayedCall(1800, ()=>{
        if (this._pendingPAT) { this._pendingPAT=false; this._showPATChoice(); return; }
        if (!state._halfShown && state.quarter>=3) { state._halfShown=true; this._showHalftime(); return; }
        if ((state.plays===14&&!state._twoMin1)||(state.plays===38&&!state._twoMin2)) { if(state.plays===14)state._twoMin1=true; else state._twoMin2=true; this._showTwoMinWarning(()=>{ this._resetFormation(); this._drawLines(); const hud=this.scene.get('Hud'); hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','team'); this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall'); }); return; }
        this._resetFormation(); this._drawLines();
        const hud = this.scene.get('Hud');
        hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','team');
        this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall');
      });
    }
  }

  _showPATChoice() {
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const cleanup=()=>els.forEach(e=>e?.destroy?.());
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.8).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'EXTRA POINT',{fontSize:'20px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b'}).setOrigin(0.5).setDepth(61));
    els.push(this.add.text(W/2,H/2-34,'Choose your play:',{fontSize:'10px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(61));
    const mkBtn=(cx,cy,label,sub,hx,cb)=>{
      const b=this.add.rectangle(cx,cy,160,60,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const lbl=this.add.text(cx,cy-10,label,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);
      const s=this.add.text(cx,cy+10,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,lbl,s);
    };
    mkBtn(W/2-90,H/2+14,'KICK PAT','+1 pt  •  97%',0x22c55e,()=>this._resolvePAT('kick'));
    mkBtn(W/2+90,H/2+14,'GO FOR 2','+2 pts  •  45%',0x3b82f6,()=>this._resolvePAT('two'));
  }

  _resolvePAT(choice) {
    let pts=0, msg='', col='#f59e0b';
    if (choice==='kick') {
      const made=Math.random()<0.97;
      pts=made?1:0; msg=made?'PAT GOOD! +1':'PAT MISSED'; col=made?'#22c55e':'#ef4444';
    } else {
      const made=Math.random()<0.45;
      pts=made?2:0; msg=made?'2-PT GOOD! +2':'2-PT FAILED'; col=made?'#3b82f6':'#ef4444';
    }
    state.score.team+=pts;
    if (pts>0) Sound.td(); else Sound.incomplete();
    this._tdFlash(msg,col);
    const hud=this.scene.get('Hud');
    hud?.events?.emit('playResult',{text:msg,td:false,turnover:false,yards:0});
    state.possession='opp'; state.down=1; state.toGo=10;
    this.time.delayedCall(1600,()=>{
      if (state.quarter>4||state.plays>=40) { this.scene.start('GameOver'); return; }
      this._startKickoffCover();
    });
  }

  // ─── AI POSSESSION ────────────────────────────────────────────────────────

  _startAIDrive() {
    this.aiDown = 1; this.aiToGo = 10;
    this._aiDrivePlays = 0; this._aiDriveYards = 0; this._aiDriveStart = state.yardLine;
    this._resetAIFormation();
    this.phase = 'ai_run';
    const hud = this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','opp');
    Sound.whistle();
  }

  _userTackle() {
    if (this.phase!=='ai_run') return;
    this.phase = 'result';
    Sound.tackle();
    this.tweens.add({ targets:this.aiRunner, scaleX:0.6, scaleY:0.6, duration:200, yoyo:true });
    const yardsGiven = Math.max(0, Math.round((this.aiStartX - this.aiRunner.x) / YARD_W));
    this._resolveAIPlay(yardsGiven);
  }

  _aiTouchdown() {
    if (this.phase!=='ai_run') return;
    this.phase = 'result';
    Sound.td();
    this._tdFlash('OPPONENT TD! ☠️','#ef4444');
    state.score.opp += 7;
    state.stats.opp.td++;
    state.stats.opp.rushYds += Math.max(0, Math.round((this.aiStartX-FIELD_LEFT)/YARD_W));
    state.drives.push({ poss:'opp', plays:this._aiDrivePlays||1, yards:this._aiDriveYards||0, start:this._aiDriveStart||25, result:'TD' });
    this._aiDrivePlays=0; this._aiDriveYards=0;
    state.possession='team'; state.yardLine=25; state.down=1; state.toGo=10;
    state.plays++;
    if (state.plays%8===0) state.quarter=Math.min(4,state.quarter+1);
    const result = { text:'OPPONENT TOUCHDOWN! ☠️', td:true, yards:0, turnover:false };
    this.events.emit('playResult', result);
    const hud = this.scene.get('Hud');
    hud?.events?.emit('playResult', result); hud?.events?.emit('possessionChange','team');
    if (!state._halfShown && state.quarter>=3) { state._halfShown=true; this.time.delayedCall(1600,()=>this._showHalftime()); return; }
    if (state.quarter>4 || state.plays>=40) {
      this.time.delayedCall(2000, ()=>this.scene.start('GameOver'));
    } else {
      this.time.delayedCall(2400, ()=>this._startKickoffReturn());
    }
  }

  _resolveAIPlay(yardsGiven) {
    state.stats.opp.rushYds += yardsGiven;
    state.yardLine = Math.max(1, state.yardLine - yardsGiven);
    this._aiDrivePlays = (this._aiDrivePlays||0) + 1;
    this._aiDriveYards = (this._aiDriveYards||0) + yardsGiven;
    if (yardsGiven >= this.aiToGo) { this.aiDown=1; this.aiToGo=10; Sound.firstDown(); }
    else { this.aiDown++; this.aiToGo=Math.max(1,this.aiToGo-yardsGiven); }
    if (this.aiDown>4) { state.drives.push({poss:'opp',plays:this._aiDrivePlays,yards:this._aiDriveYards,start:this._aiDriveStart||25,result:'DOWNS'}); this._aiDrivePlays=0; this._aiDriveYards=0; state.possession='team'; state.yardLine=Math.max(5,100-state.yardLine); state.down=1; state.toGo=10; }
    state.plays++;
    if (state.plays%8===0) state.quarter=Math.min(4,state.quarter+1);
    const result = { text:`Stop! AI +${yardsGiven}yd${yardsGiven!==1?'s':''}`, yards:yardsGiven, td:false, turnover:false };
    this.events.emit('playResult', result);
    const hud = this.scene.get('Hud');
    hud?.events?.emit('playResult', result); hud?.events?.emit('possessionChange',state.possession);
    if (!state._halfShown && state.quarter>=3) { state._halfShown=true; this.time.delayedCall(1600,()=>this._showHalftime()); return; }
    if (state.quarter>4 || state.plays>=40) {
      this.time.delayedCall(1600, ()=>this.scene.start('GameOver'));
    } else if (state.possession==='opp') {
      this.time.delayedCall(1800, ()=>this._startAIDrive());
    } else {
      this.time.delayedCall(1800, ()=>{
        this._resetFormation(); this._drawLines();
        hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','team');
        this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall');
      });
    }
  }

  // ─── KICKOFF ──────────────────────────────────────────────────────────────

  _showKickoffFlash(msg, sub, cb) {
    const W=this.scale.width, H=this.scale.height;
    const bg=this.add.rectangle(W/2,H/2,W,H,0x0a0f1a,0.88).setDepth(55);
    const t=this.add.text(W/2,H/2-18,msg,{fontSize:'34px',fontFamily:'monospace',fontStyle:'bold',color:'#f1f5f9',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(56);
    const s=this.add.text(W/2,H/2+22,sub,{fontSize:'11px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(56);
    this.time.delayedCall(1300,()=>{
      this.tweens.add({targets:[bg,t,s],alpha:0,duration:380,onComplete:()=>{bg.destroy();t.destroy();s.destroy();cb();}});
    });
  }

  _showHalftime() {
    const W=this.scale.width, H=this.scale.height;
    const t=state.team?.ab||'YOU', o=state.opponent?.ab||'OPP';
    const bg=this.add.rectangle(W/2,H/2,W,H,0x0a0f1a,0.96).setDepth(62);
    const ht=this.add.text(W/2,H/2-100,'HALFTIME',{fontSize:'38px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(63);
    const sc=this.add.text(W/2,H/2-46,`${t}  ${state.score.team} — ${state.score.opp}  ${o}`,{fontSize:'26px',fontFamily:'monospace',fontStyle:'bold',color:'#f1f5f9'}).setOrigin(0.5).setDepth(63);
    const rush=this.add.text(W/2,H/2+8,`Rush: ${state.stats.team.rushYds||0} yds  •  ${state.stats.opp.rushYds||0} yds`,{fontSize:'10px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(63);
    const tds=this.add.text(W/2,H/2+28,`TDs: ${state.stats.team.td||0}  •  ${state.stats.opp.td||0}`,{fontSize:'10px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(63);
    const sub=this.add.text(W/2,H/2+68,'2nd Half Kickoff',{fontSize:'11px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(63);
    const els=[bg,ht,sc,rush,tds,sub];
    Sound.whistle();
    this.time.delayedCall(4000,()=>{
      this.tweens.add({targets:els,alpha:0,duration:500,onComplete:()=>{
        els.forEach(e=>e.destroy());
        state.possession='team'; state.down=1; state.toGo=10;
        this._startKickoffReturn();
      }});
    });
  }

  _showTwoMinWarning(cb) {
    const W=this.scale.width, H=this.scale.height;
    const bg=this.add.rectangle(W/2,H/2-60,W,52,0x1e293b,0.94).setDepth(62);
    const t=this.add.text(W/2,H/2-60,'⏱ TWO-MINUTE WARNING',{fontSize:'16px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(63);
    Sound.whistle();
    this.time.delayedCall(2200,()=>{
      this.tweens.add({targets:[bg,t],alpha:0,duration:400,onComplete:()=>{bg.destroy();t.destroy();cb();}});
    });
  }

  // User returns kickoff (game start or after AI TD)
  _startKickoffReturn() {
    const catchYard = Phaser.Math.Between(8,14);
    state.yardLine = catchYard; state.down=1; state.toGo=10; state.possession='team';
    this._showKickoffFlash('KICKOFF RETURN','WASD to return  •  SPACE to juke',()=>this._launchKickoffReturn(catchYard));
  }

  _launchKickoffReturn(catchYard) {
    const cy=FIELD_Y+FIELD_H/2;
    this.runner=this.rb; this.startX=yardToX(catchYard);
    const pData=state.team?.players?.find(p=>p.pos==='RB')||{ovr:78,spd:82,id:'rb1'};
    this._runnerData=pData;
    this.runSpd=pxs(pData.spd,72,0.95);
    state.currentCall='run_outside';
    // Restore all labels first
    [...this.offPlayers,...this.defPlayers].forEach(d=>{if(d._lbl&&d._origLabel)d._lbl.setText(d._origLabel);});
    // Place returner deep, hide other offense
    this._place(this.rb,yardToX(catchYard),cy);
    this.ball.x=this.rb.x; this.ball.y=this.rb.y;
    [this.qb,this.wr1,this.wr2,this.te,...this.oLine].forEach(d=>this._show(d,false));
    this._show(this.rb,true);
    // Spread coverage across midfield
    const cvgDots=[this.dl,this.dl2,this.lb,this.lb2,this.cb1,this.cb2,this.saf];
    const cvgYards=[38,44,50,54,58,62,68];
    const offsets=[-72,-40,-16,0,16,40,72];
    cvgDots.forEach((d,i)=>{this._place(d,yardToX(cvgYards[i]),cy+offsets[i]);this._show(d,true);d._lbl?.setText('CVG');});
    this.phase='run'; this.jukeCD=0;
    this._clearPassRush(); this._drawLines();
    this._aiRushers([this.dl,this.dl2,this.lb,this.lb2]);
    this._aiCBsSupport();
    // saf converges slowly
    this.time.addEvent({delay:16,loop:true,callback:()=>{
      if(this.phase!=='run')return;
      const dx=this.runner.x-this.saf.x,dy=this.runner.y-this.saf.y,dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<13){this._tackled();return;}
      if(dist>60){this.saf.x+=(dx/dist)*0.45;this.saf.y+=(dy/dist)*0.45;this._syncLbl(this.saf);}
    }});
    Sound.whistle();
    const hud=this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','team');
    this.events.emit('phaseChange','run');
  }

  // AI returns kickoff (after user TD or FG)
  _startKickoffCover() {
    const catchYard=Phaser.Math.Between(87,95);
    state.yardLine=catchYard; state.down=1; state.toGo=10; state.possession='opp';
    this._showKickoffFlash('KICKOFF','WASD to cover  •  tackle the returner',()=>this._startAIDrive());
  }

  _tdFlash(msg, col) {
    const W=this.scale.width, H=this.scale.height;
    const colMap={'#f59e0b':0xf59e0b,'#22c55e':0x22c55e,'#3b82f6':0x3b82f6,'#ef4444':0xef4444};
    const flash = this.add.rectangle(W/2,H/2,W,H, colMap[col]??0xef4444, 0.28).setDepth(50);
    const txt = this.add.text(W/2, H/2, msg, {
      fontSize:'40px', fontFamily:'monospace', fontStyle:'bold', color:col, stroke:'#000', strokeThickness:5
    }).setOrigin(0.5).setDepth(51);
    this.tweens.add({ targets:[flash,txt], alpha:0, duration:1200, delay:400,
      onComplete:()=>{ flash.destroy(); txt.destroy(); }
    });
  }

  // ─── UPDATE LOOP ──────────────────────────────────────────────────────────

  update(time, delta) {
    const k = this.keys, dp = this._dpadState;
    const dt = delta / 1000;

    // USER OFFENSE — run
    if (this.phase === 'run') {
      const spd = this.runSpd * dt;
      let moved = false;
      if (k.rt.isDown||k.d.isDown||dp.dx>0) { this.runner.x+=spd;       moved=true; }
      if (k.lt.isDown||k.a.isDown||dp.dx<0) { this.runner.x-=spd*0.65;  moved=true; }
      if (k.up.isDown||k.w.isDown||dp.dy<0) { this.runner.y-=spd*0.82;  moved=true; }
      if (k.dn.isDown||k.s.isDown||dp.dy>0) { this.runner.y+=spd*0.82;  moved=true; }
      if (moved) {
        this.runner.y=clamp(this.runner.y,FIELD_Y+10,FIELD_Y+FIELD_H-10);
        this.ball.x=this.runner.x; this.ball.y=this.runner.y;
        this._syncLbl(this.runner);
        if (this.runner.x>=FIELD_RIGHT||this.runner.y<=FIELD_Y||this.runner.y>=FIELD_Y+FIELD_H) { this._tackled(); return; }
      }
      this.jukeCD-=delta;
      if (Phaser.Input.Keyboard.JustDown(k.sp) && this.jukeCD<=0) this._doJuke();
      return;
    }

    // AI POSSESSION — user defends
    if (this.phase === 'ai_run') {
      this._aiJukeCD-=delta;
      // AI runner: smooth angle changes for variety
      if (Math.random()<0.012) this._aiAngle=(Math.random()-0.5)*0.5;
      const aispd = this._aiRunSpeed*dt;
      this.aiRunner.x -= aispd*Math.cos(this._aiAngle);
      this.aiRunner.y += aispd*Math.sin(this._aiAngle);
      this.aiRunner.y = clamp(this.aiRunner.y,FIELD_Y+10,FIELD_Y+FIELD_H-10);
      this._syncLbl(this.aiRunner);
      this.ball.x=this.aiRunner.x; this.ball.y=this.aiRunner.y;

      // Occasional AI juke: push away nearby defender
      if (this._aiJukeCD<=0 && Math.random()<0.003) {
        this._aiJukeCD=2400;
        const dx=this.userDef.x-this.aiRunner.x, dy=this.userDef.y-this.aiRunner.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if (dist<75 && dist>0) {
          this.tweens.add({ targets:this.userDef, x:this.userDef.x+(dx/dist)*46, y:this.userDef.y+(dy/dist)*46, duration:300,
            onUpdate:()=>this._syncLbl(this.userDef) });
        }
      }

      // User defender movement
      const dspd = this._defSpd*dt;
      if (k.rt.isDown||k.d.isDown||dp.dx>0) this.userDef.x+=dspd;
      if (k.lt.isDown||k.a.isDown||dp.dx<0) this.userDef.x-=dspd*0.9;
      if (k.up.isDown||k.w.isDown||dp.dy<0) this.userDef.y-=dspd;
      if (k.dn.isDown||k.s.isDown||dp.dy>0) this.userDef.y+=dspd;
      this.userDef.y=clamp(this.userDef.y,FIELD_Y+10,FIELD_Y+FIELD_H-10);
      this._syncLbl(this.userDef);

      if (Math.hypot(this.userDef.x-this.aiRunner.x, this.userDef.y-this.aiRunner.y) < 18) { this._userTackle(); return; }
      if (this.aiRunner.x <= FIELD_LEFT) { this._aiTouchdown(); return; }
    }
  }
}
