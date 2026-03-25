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
    this._defCall = 'cover2';
    this._aiAngle = 0; this._aiJukeCD = 0;
    this.aiDown = 1; this.aiToGo = 10;
    this._lastReceiver = null;
    this._passRushActive = false;
    this._pocketBeaten = [false, false, false, false, false];
    this._passRushMode = false; this._passRushCoverBreak = false; this._blitzBtn = null; this._rushThrowTimer = null;
    this._noHuddleActive = false; this._fadeEls = null; this._trickEls = null;
    this.events.on('playCalled', this._onPlayCalled, this);
    this._resetFormation();
    this._startWeather();
    this.time.delayedCall(400, () => this._startKickoffReturn());
  }

  _startWeather() {
    const wx = state.weather;
    if (wx === 'clear') return;
    const W = this.scale.width, H = this.scale.height;
    // Tint overlay
    const tc = wx==='rain' ? 0x1e3a5f : 0xdbeafe;
    this.add.rectangle(W/2, H/2, W, H, tc, 0.12).setDepth(1);
    // Animated drops/flakes
    const count = wx==='rain' ? 40 : 24;
    const drops = [];
    for (let i=0; i<count; i++) {
      const gfx = this.add.graphics().setDepth(190);
      drops.push({ gfx, x:Math.random()*W, y:Math.random()*H,
        spd: wx==='rain' ? 7+Math.random()*5 : 1+Math.random()*2,
        drift: (Math.random()-0.5)*0.8 });
    }
    this.time.addEvent({ delay:33, loop:true, callback:()=>{
      drops.forEach(d=>{
        d.x+=d.drift; d.y+=d.spd;
        if(d.y>H){ d.y=-8; d.x=Math.random()*W; }
        d.gfx.clear();
        if(wx==='rain'){
          d.gfx.lineStyle(1,0x93c5fd,0.45);
          d.gfx.lineBetween(d.x,d.y,d.x-1,d.y-5);
        } else {
          d.gfx.fillStyle(0xffffff,0.55);
          d.gfx.fillCircle(d.x,d.y,1.5);
        }
      });
    }});
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
    // P16: Red zone overlay (toggled in _drawLines)
    this._rzTint = this.add.rectangle(FIELD_RIGHT - 30, FIELD_Y + FIELD_H/2, 62, FIELD_H, 0xef4444, 0.07).setDepth(1).setVisible(false);
    this._rzIndicator = this.add.text(yardToX(90), FIELD_Y + 22, '◈ RED ZONE', {
      fontSize:'10px', fontFamily:'monospace', fontStyle:'bold', color:'#ef4444', stroke:'#000', strokeThickness:2
    }).setOrigin(0.5).setDepth(12).setVisible(false);
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
    // Kickoff return blockers (P18)
    this.blk1 = this._dot(tc, 'BLK', 10); this.blk2 = this._dot(tc, 'BLK', 10); this.blk3 = this._dot(tc, 'BLK', 10);
    this.kickBlocks = [this.blk1, this.blk2, this.blk3];
    this.kickBlocks.forEach(b => this._show(b, false));
    this._engagedCvg = new Set();
    // P19: Punt return blockers (opponent team color)
    const oc2 = Phaser.Display.Color.HexStringToColor(state.opponent?.clr || '#ef4444').color;
    this.puntBlk1 = this._dot(oc2,'BLK',10); this.puntBlk2 = this._dot(oc2,'BLK',10);
    this.puntBlocks = [this.puntBlk1, this.puntBlk2];
    this.puntBlocks.forEach(b=>this._show(b,false));
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
    if (state.yardLine >= 80 && state.possession === 'team') this._applyRedZoneFormation(cy);
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

  // P16: compress defensive formation inside the 20
  _applyRedZoneFormation(cy) {
    [this.cb1, this.cb2].forEach(cb => {
      if (!cb.visible) return;
      const dy = cb.y - cy;
      this._place(cb, cb.x - 8, cy + dy * 0.62);
    });
    if (this.saf.visible) this._place(this.saf, this.saf.x - 22, cy);
    if (this.lb.visible)  { const dy = this.lb.y - cy;  this._place(this.lb,  this.lb.x  - 6, cy + dy * 0.78); }
    if (this.lb2.visible) { const dy = this.lb2.y - cy; this._place(this.lb2, this.lb2.x - 6, cy + dy * 0.78); }
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
    // P16: red zone overlay
    const inRZ = state.possession === 'team' && state.yardLine >= 80;
    if (this._rzTint) this._rzTint.setVisible(inRZ);
    if (this._rzIndicator) this._rzIndicator.setVisible(inRZ);
  }

  _clearArc() { this.arcGfx.clear(); }

  // ─── PLAY DISPATCH ────────────────────────────────────────────────────────

  _onPlayCalled(callId) {
    state.currentCall = callId;
    // P17: False start ~4% (offensive penalty, -5 yards, no play)
    if (this.phase === 'presnap' && callId !== 'punt' && callId !== 'fg' && Math.random() < 0.04) {
      this.phase = 'result'; Sound.whistle();
      this._tdFlash('FALSE START — 5 yds', '#f59e0b');
      this._endPlay({ yards:-5, text:'FLAG — False Start. 5-yard penalty.', type:'penalty', turnover:false, td:false });
      return;
    }
    if      (callId === 'punt')                              this._doPunt();
    else if (callId === 'fg')                                this._attemptFG();
    else if (callId.startsWith('run_') || callId === 'scramble') {
      if (callId.startsWith('run_') && !this._noHuddleActive && Math.random() < 0.15) this._showTrickOption(callId);
      else this._startRun(callId);
    }
    else if (callId === 'screen_pass')                                    this._startScreenPass();
    else if (callId === 'pass_action')                                    this._startPlayAction();
    else if (callId.startsWith('pass_')) {
      if (state.yardLine <= 15 && !this._noHuddleActive) this._showFadeOption(callId);
      else this._startPass(callId);
    }
  }

  _doPunt() {
    this.phase = 'result';
    Sound.whistle();
    this._showKickoffFlash('PUNT','Control a defender — tackle the returner!',()=>this._launchPuntReturn());
  }

  _launchPuntReturn() {
    // Punt lands at opponent's ~35-45 yard line (from their endzone = their 35-45)
    // In our coordinate system: user attacks right (toward yard 100)
    // After punt, possession flips: opp starts at ~their 35 = our 55-65 yard line
    const catchYard = Phaser.Math.Between(55, 68);
    // P22: 5% muff chance
    if (Math.random() < 0.05) { this._launchMuffedPunt(catchYard); return; }
    const cy = FIELD_Y + FIELD_H / 2;
    const tc = Phaser.Display.Color.HexStringToColor(state.team?.clr || '#22c55e').color;
    const oc = Phaser.Display.Color.HexStringToColor(state.opponent?.clr || '#ef4444').color;

    // Hide all offense/defense
    [...this.offPlayers, ...this.defPlayers].forEach(d => this._show(d, false));

    // Place returner (opponent RB) at catch yard
    this._place(this.dl, yardToX(catchYard), cy);
    this.dl._lbl?.setText('RTR');
    this._show(this.dl, true);
    const rData = state.opponent?.players?.find(p => p.pos === 'RB') || { spd: 80 };
    this._aiRunSpeed = pxs(rData.spd, 72, 0.95);

    // Spawn 2 blockers ahead of returner (toward our endzone = decreasing x)
    this._show(this.puntBlk1, true); this._show(this.puntBlk2, true);
    this._place(this.puntBlk1, yardToX(catchYard - 8), cy - 22);
    this._place(this.puntBlk2, yardToX(catchYard - 8), cy + 22);

    // User controls LB as defender — placed downfield
    this._place(this.lb, yardToX(catchYard - 20), cy);
    this.lb._lbl?.setText('YOU');
    this._show(this.lb, true);
    const dData = state.team?.players?.find(p => p.pos === 'LB') || { spd: 76 };
    this._defSpd = pxs(dData.spd, 88, 1.1);

    // Additional AI defenders converge
    this._place(this.lb2, yardToX(catchYard - 30), cy - 44);
    this.lb2._lbl?.setText('DEF');
    this._show(this.lb2, true);
    this._place(this.cb1, yardToX(catchYard - 25), cy + 44);
    this.cb1._lbl?.setText('DEF');
    this._show(this.cb1, true);

    this.userDef = this.lb;
    this.puntRunner = this.dl;
    this.puntStartX = yardToX(catchYard);
    this._puntEngaged = new Set();

    this.ball.x = this.dl.x; this.ball.y = this.dl.y;
    this.phase = 'punt_return';
    this.jukeCD = 0;
    this._aiAngle = 0; this._aiJukeCD = 0;

    // AI converge defenders
    [this.lb2, this.cb1].forEach(d => {
      this.time.addEvent({ delay:16, loop:true, callback:()=>{
        if(this.phase!=='punt_return')return;
        const dx=this.puntRunner.x-d.x, dy=this.puntRunner.y-d.y, dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<14){this._puntTackled();return;}
        if(dist>55){d.x+=(dx/dist)*0.55;d.y+=(dy/dist)*0.55;this._syncLbl(d);}
      }});
    });

    Sound.whistle();
    const hud = this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','opp');
    this.events.emit('phaseChange','punt_return');
  }

  _puntTackled() {
    if(this.phase!=='punt_return')return;
    this.phase='result';
    // Calculate return yards (returner ran from catchYard toward user endzone = decreasing x)
    const retYards = Math.max(0, Math.round((this.puntStartX - this.puntRunner.x) / YARD_W));
    // Hide punt pieces
    this.puntBlocks?.forEach(b=>this._show(b,false));
    [this.dl,this.lb,this.lb2,this.cb1].forEach(d=>this._show(d,false));
    // Net punt: opponent gets ball at their catch position minus return yards
    const text = retYards > 15 ? `Punt return! ${retYards} yards by returner.` :
                 retYards > 0  ? `Return for ${retYards} yards.` : 'Fair catch — no return.';
    Sound.whistle();
    this._endPlay({ yards: 0, text, type:'punt', turnover:true, td:false, puntReturn:retYards });
  }

  _launchMuffedPunt(catchYard) {
    const cy = FIELD_Y + FIELD_H / 2;
    // Hide everyone, place loose ball
    [...this.offPlayers, ...this.defPlayers].forEach(d => this._show(d, false));
    this.puntBlocks?.forEach(b => this._show(b, false));
    this.ball.x = yardToX(catchYard); this.ball.y = cy;

    // User defender rushes for ball
    this._place(this.lb, yardToX(catchYard - 22), cy);
    this.lb._lbl?.setText('YOU');
    this._show(this.lb, true);
    const dData = state.team?.players?.find(p => p.pos === 'LB') || { spd: 76 };
    this._defSpd = pxs(dData.spd, 92, 1.1);

    // AI returner rushes for ball from opposite side
    this._place(this.dl, yardToX(catchYard + 8), cy + Phaser.Math.Between(-30, 30));
    this.dl._lbl?.setText('RTR');
    this._show(this.dl, true);

    this.userDef = this.lb;
    this.phase = 'muffed_punt';
    this._muffYard = catchYard;
    Sound.whistle();
    this._tdFlash('MUFFED PUNT! 💀', '#f59e0b');

    const hud = this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange', 'opp');
    this.events.emit('phaseChange', 'muffed_punt');

    // 2-second recovery window, then auto-resolve based on proximity
    this.time.delayedCall(2000, () => {
      if (this.phase !== 'muffed_punt') return;
      this.phase = 'result';
      const userDist = Math.hypot(this.lb.x - this.ball.x, this.lb.y - this.ball.y);
      const aiDist   = Math.hypot(this.dl.x - this.ball.x, this.dl.y - this.ball.y);
      const userRecovers = userDist < aiDist;
      this._show(this.lb, false); this._show(this.dl, false);
      if (userRecovers) {
        state.possession = 'team'; state.yardLine = catchYard; state.down = 1; state.toGo = 10;
        this._tdFlash('RECOVERED! 🎉', '#22c55e');
        this._endPlay({ yards: 0, text: `MUFFED PUNT recovered by ${state.team?.ab||'YOU'} at yard ${catchYard}!`, type: 'fumble', turnover: false, td: false });
      } else {
        this._endPlay({ yards: 0, text: 'Returner recovers the muff.', type: 'punt', turnover: true, td: false });
      }
    });
  }

  _attemptFG() {
    this.phase = 'result';
    const dist = (100 - state.yardLine) + 17;
    // P20: FG block — DL OVR scales block chance (base 8%, max ~18%)
    const dlOvr = state.opponent?.players?.filter(p=>p.pos==='DL').reduce((s,p,_,a)=>s+p.ovr/a.length,0)||70;
    const blockCh = Math.min(0.18, 0.04 + (dlOvr - 60) * 0.0015);
    const blocked = Math.random() < blockCh;
    Sound.whistle();
    if (blocked) {
      this._tdFlash('BLOCKED! 🚫', '#ef4444');
      // Opponent recovers at LOS, small chance of return TD
      const returnTD = Math.random() < 0.12;
      if (returnTD) {
        state.score.opp += 6;
        state.stats.opp.td++;
        this._tdFlash('RETURN TD! ☠️', '#ef4444');
        state.possession='team'; state.yardLine=25; state.down=1; state.toGo=10;
        const result={text:'FG BLOCKED — returned for TD! ☠️',td:true,yards:0,turnover:false};
        this.time.delayedCall(800,()=>{
          this.events.emit('playResult',result);
          const hud=this.scene.get('Hud');
          hud?.events?.emit('playResult',result); hud?.events?.emit('possessionChange','team');
          this.time.delayedCall(2200,()=>this._startKickoffReturn());
        });
      } else {
        this._endPlay({yards:0,text:'FG BLOCKED! Opponent ball at the spot.',type:'fg_miss',turnover:true,td:false});
      }
      return;
    }
    const made = Math.random() < Math.max(0.18, Math.min(0.96, 1.08 - dist * 0.013));
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
        if (this._engagedCvg?.has(dot)) return; // blocked by blocker
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
    Sound.tackle();
    if (this._jukeCDBar) { this._jukeCDBar.destroy(); this._jukeCDBar = null; }
    this.kickBlocks?.forEach(b => this._show(b, false));
    this._engagedCvg?.clear();
    this.tweens.add({ targets: this.runner, scaleX: 0.65, scaleY: 0.65, duration: 180, yoyo: true });
    const yards = Math.round((this.runner.x - this.startX) / YARD_W);
    if (yards > 7) {
      this.phase = 'fumble_risk';
      this._showFumbleRisk(yards);
    } else {
      this.phase = 'result';
      this._resolveTackle(yards, 99);
    }
  }

  // ─── P34: FUMBLE RISK ─────────────────────────────────────────────────────

  _showFumbleRisk(yards) {
    const W=this.scale.width, H=this.scale.height;
    let taps=0;
    const els=[];
    const bg=this.add.rectangle(W/2,H/2-30,200,56,0xef4444,0.92).setDepth(25).setInteractive({useHandCursor:true});
    const lbl=this.add.text(W/2,H/2-42,'💥 HOLD ON! TAP FAST!',{fontSize:'13px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(26);
    const ctr=this.add.text(W/2,H/2-18,'0 / 4',{fontSize:'11px',fontFamily:'monospace',color:'#fef08a'}).setOrigin(0.5).setDepth(26);
    els.push(bg,lbl,ctr);
    bg.on('pointerdown',()=>{ taps++; ctr.setText(`${taps} / 4`); });
    this.time.delayedCall(1400,()=>{
      els.forEach(e=>e?.destroy?.());
      this.phase='result';
      this._resolveTackle(yards, taps);
    });
  }

  _resolveTackle(yards, taps) {
    const runnerPos = this.runner === this.qb ? 'QB' : 'RB';
    const rb = (state.team?.players || []).find(p => p.pos === runnerPos) || { str: 70 };
    const wxFumM = state.weather==='snow'?1.5:state.weather==='rain'?1.3:1;
    let fumCh = Math.max(0.02, (0.055 - (rb.str - 70) * 0.0006) * wxFumM);
    if (taps < 2) fumCh = Math.min(0.60, fumCh * 4);
    else if (taps >= 4) fumCh *= 0.25;
    if (Math.random() < fumCh) {
      Sound.incomplete();
      state.stats.team.fum = (state.stats.team.fum || 0) + 1;
      this._tdFlash('FUMBLE!', '#ef4444');
      this._endPlay({ yards: 0, text: 'FUMBLE! Possession lost.', type: 'fumble', turnover: true, td: false });
      return;
    }
    const injCh = runnerPos === 'QB' ? 0.04 : 0.07;
    if (Math.random() < injCh) {
      const injPl = (state.team?.players || []).find(p => p.pos === runnerPos);
      if (injPl && !(state.injuries || []).find(x => x.id === injPl.id)) {
        if (!state.injuries) state.injuries = [];
        state.injuries.push({ id: injPl.id, pos: runnerPos, weeks: Math.floor(Math.random() * 4) + 1 });
        this._tdFlash(`${injPl.name.split(' ').pop()} INJURED`, '#ef4444');
      }
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
    const qbData = state.team?.players?.find(p=>p.pos==='QB')||{spd:66,ovr:72,id:'qb1'};
    if (Math.random() < 0.22) {
      this._clearPassRush();
      this.recTargets.forEach(r=>r?.destroy?.()); this.recTargets=[];
      state.currentCall='scramble';
      this.runner=this.qb; this.startX=this.qb.x; this._runnerData=qbData;
      this.runSpd=pxs(qbData.spd,54,0.9);
      this.phase='run';
      this._tdFlash('SCRAMBLE!','#3b82f6');
      this._startOLBlocker();
      const dc=state.opponent?.dcScheme||'4-3';
      const rushers=[this.dl,this.dl2,this.lb];
      if(dc==='3-4'||dc==='Zone Blitz') rushers.push(this.lb2);
      this._aiRushers(rushers); this._aiCBsSupport();
      this.events.emit('phaseChange','run');
      return;
    }
    this._clearPassRush(); this.phase = 'result';
    Sound.sack();
    this.recTargets.forEach(r => r?.destroy?.()); this.recTargets = [];
    const loss = Phaser.Math.Between(4, 11);
    // QB injury on sack (~5%)
    if (Math.random() < 0.05) {
      const qb = (state.team?.players || []).find(p => p.pos === 'QB');
      if (qb && !(state.injuries || []).find(x => x.id === qb.id)) {
        if (!state.injuries) state.injuries = [];
        state.injuries.push({ id: qb.id, pos: 'QB', weeks: Math.floor(Math.random() * 3) + 1 });
        this._tdFlash(`${qb.name.split(' ').pop()} INJURED`, '#ef4444');
      }
    }
    this._endPlay({ yards:-loss, text:`SACK! -${loss} yards`, type:'sack', turnover:false, td:false });
  }

  _animateRoutes(variant) {
    const rzMul = (state.yardLine >= 80 && state.possession === 'team') ? 0.52 : 1;
    const depth = ({ quick:32, medium:62, deep:110 }[variant] || 62) * rzMul;
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
      const rzCov = state.yardLine >= 80 ? 0.18 : 0;
      const isOpen = (p.spd||80)+actBonus > (cbOvr+(isZone?-5:0))*0.94 && Math.random() < 0.54+((p.spd||80)+actBonus-cbOvr)/200 - rzCov;
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
        const rzM = state.yardLine >= 80 ? 1.18 : 1;
        const s=(spd/90)*0.95*rzM; // px/frame at 60fps; faster in red zone
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
        const wxPassM = state.weather==='snow'?0.80:state.weather==='rain'?0.86:1;
        const compCh = clamp((0.56+(qb.ovr-50)*0.004-(db.ovr-60)*0.002)*wxPassM, 0.22, 0.88);
        if (type==='covered' && Math.random()<intCh*2) {
          Sound.int(); state.stats.team.int++;
          this._track(qb.id,'int',1);
          this._endPlay({ yards:0, text:'INTERCEPTED! Turnover.', type:'int', turnover:true, td:false }); return;
        }
        if (Math.random() > compCh*qteBonus) {
          // P17: Pass interference ~4% on incompletion
          if (Math.random() < 0.04) {
            Sound.whistle(); this._tdFlash('PASS INTERFERENCE!', '#f59e0b');
            this._track(qb.id,'att',1);
            this._endPlay({ yards:state.toGo, text:'FLAG — Pass Interference! Auto 1st down.', type:'penalty', turnover:false, td:false }); return;
          }
          Sound.incomplete(); this._track(qb.id,'att',1);
          this._endPlay({ yards:0, text:'Incomplete.', type:'inc', turnover:false, td:false }); return;
        }
        const base = isDeep ? Phaser.Math.Between(14,36) : variant==='quick' ? Phaser.Math.Between(3,8) : Phaser.Math.Between(6,15);
        yards = Math.round(base * qteBonus);
      }
    }

    // P17: Holding on run plays (~3% if gain > 3 yards)
    if (isRun && (yards||0) > 3 && Math.random() < 0.03) {
      Sound.whistle(); this._tdFlash('HOLDING — 10 yds back', '#f59e0b');
      yards = Math.max(-10, (yards||0) - 10);
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
    this.kickBlocks?.forEach(b => this._show(b, false));
    this._engagedCvg?.clear();
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
      if (result.yards >= state.toGo) { state.down=1; state.toGo=10; this._lastPlayGainedFirstDown=true; }
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
        // P30: two-minute drill — auto no-huddle
        if (state._drillMode) {
          [this.cb1,this.cb2].forEach(c=>{c.x+=(Math.random()-0.5)*20;c.y+=(Math.random()-0.5)*20;this._syncLbl(c);});
          if(this.lb.visible){this.lb.x+=(Math.random()-0.5)*14;this.lb.y+=(Math.random()-0.5)*14;this._syncLbl(this.lb);}
          const dTxt=this.add.text(this.scale.width/2,FIELD_Y-24,'⚡ 2-MIN DRILL',{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#fbbf24',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(20);
          this.time.delayedCall(900,()=>{dTxt?.destroy();this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');});
        } else if (state.down === 1 && state.toGo === 10 && this._lastPlayGainedFirstDown) {
          // P23: offer no-huddle after first down
          this._showNoHuddleOption();
        } else {
          this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall');
        }
        this._lastPlayGainedFirstDown = false;
      });
    }
  }

  _showNoHuddleOption() {
    const W=this.scale.width, H=this.scale.height;
    const bg=this.add.rectangle(W/2,H/2,W,H,0x000000,0.72).setDepth(58);
    const t=this.add.text(W/2,H/2-40,'FIRST DOWN!',{fontSize:'22px',fontFamily:'monospace',fontStyle:'bold',color:'#22c55e',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(59);
    const mkBtn=(cx,label,sub,hx,cb)=>{
      const b=this.add.rectangle(cx,H/2+12,158,60,0x0d1424).setDepth(59).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const l=this.add.text(cx,H/2+2,label,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(60);
      const s=this.add.text(cx,H/2+18,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(60);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{[bg,t,b,l,s].forEach(e=>e.destroy());cb();});
      return[b,l,s];
    };
    const launch=()=>{this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');};
    const launchNH=()=>{
      // No-huddle: defenders start slightly out of position
      [this.cb1,this.cb2].forEach(cb=>{cb.x+=(Math.random()-0.5)*18;cb.y+=(Math.random()-0.5)*18;this._syncLbl(cb);});
      if(this.lb.visible){this.lb.x+=(Math.random()-0.5)*12;this.lb.y+=(Math.random()-0.5)*12;this._syncLbl(this.lb);}
      this._onPlayCalled._noHuddle=true;
      this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');
    };
    mkBtn(W/2-88,'HUDDLE UP','Normal play call',0x334155,launch);
    mkBtn(W/2+88,'NO HUDDLE 🚀','Defense out of position',0x22c55e,launchNH);
    // Auto-dismiss after 3.5s
    this.time.delayedCall(3500,()=>{
      try{[bg,t].forEach(e=>e.destroy());}catch{}
      launch();
    });
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
    mkBtn(W/2+90,H/2+14,'GO FOR 2','+2 pts  •  MINI-GAME',0x3b82f6,()=>this._startTwoPointPlay());
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
      this._showKickoffChoice();
    });
  }

  // ─── P26: TWO-POINT MINI-GAME ─────────────────────────────────────────────

  _startTwoPointPlay() {
    const cy = FIELD_Y + FIELD_H / 2;
    // Hide all players, show only qb, wr1, dl
    [...this.offPlayers, ...this.defPlayers].forEach(d => this._show(d, false));
    this._show(this.qb, true); this._show(this.wr1, true); this._show(this.dl, true);
    this._place(this.qb,  yardToX(5),  cy);
    this._place(this.wr1, yardToX(3),  cy - 20);
    this._place(this.dl,  yardToX(8),  cy);
    this.ball.x = this.qb.x; this.ball.y = this.qb.y;
    // Banner
    const W = this.scale.width, H = this.scale.height;
    this._tpBanner = this.add.text(W/2, FIELD_Y - 20, 'GO FOR 2 — REACH THE END ZONE', {
      fontSize:'13px', fontFamily:'monospace', fontStyle:'bold', color:'#3b82f6',
      stroke:'#000', strokeThickness:3
    }).setOrigin(0.5).setDepth(20);
    this._tpTimerEl = this.add.text(W/2, FIELD_Y - 6, '3.5', {
      fontSize:'10px', fontFamily:'monospace', color:'#94a3b8'
    }).setOrigin(0.5).setDepth(20);
    this._tpTimer = 3500;
    this.phase = 'two_point';
  }

  _resolveTwoPoint(success, reason='') {
    if (this.phase !== 'two_point') return;
    this.phase = 'idle';
    try { this._tpBanner?.destroy(); this._tpTimerEl?.destroy(); } catch {}
    [...this.offPlayers, ...this.defPlayers].forEach(d => this._show(d, false));
    const pts = success ? 2 : 0;
    state.score.team += pts;
    const msg = success ? '2-PT GOOD! +2' : ('2-PT FAILED' + (reason ? ' — ' + reason : ''));
    const col = success ? '#3b82f6' : '#ef4444';
    if (pts > 0) Sound.td(); else Sound.incomplete();
    this._tdFlash(msg, col);
    const hud = this.scene.get('Hud');
    hud?.events?.emit('playResult', { text:msg, td:false, turnover:false, yards:0 });
    state.possession = 'opp'; state.down = 1; state.toGo = 10;
    this.time.delayedCall(1600, () => {
      if (state.quarter > 4 || state.plays >= 40) { this.scene.start('GameOver'); return; }
      this._showKickoffChoice();
    });
  }

  // ─── AI POSSESSION ────────────────────────────────────────────────────────

  _showGoalLineStand() {
    const cy = FIELD_Y + FIELD_H / 2;
    // Hide all, set up goal line formation
    [...this.offPlayers, ...this.defPlayers].forEach(d => this._show(d, false));
    // Stack 6 defenders at goal line
    const defY = [cy-40,cy-24,cy-8,cy+8,cy+24,cy+40];
    const defDots = [this.dl,this.dl2,this.lb,this.lb2,this.cb1,this.cb2];
    const goalX = yardToX(2);
    defDots.forEach((d,i)=>{ this._place(d, goalX-8, defY[i]); this._show(d,true); d._lbl?.setText('DEF'); });
    // User controls LB (middle)
    this.userDef = this.lb;
    this.lb._lbl?.setText('YOU');
    const dData = state.team?.players?.find(p=>p.pos==='LB')||{spd:76};
    this._defSpd = pxs(dData.spd, 90, 1.1);
    // AI runner
    this._place(this.rb, yardToX(10), cy);
    this.rb._lbl?.setText('RB');
    this._show(this.rb, true);
    const rData = state.opponent?.players?.find(p=>p.pos==='RB')||{spd:78,str:80};
    this._aiRunSpeed = pxs(rData.str||80, 52, 0.7); // use STR not SPD for goal line power
    this.aiRunner = this.rb;
    this.ball.x = this.rb.x; this.ball.y = this.rb.y;
    this.phase = 'goal_line';
    this._goalLineTimer = 4000; // 4 seconds to stop them
    Sound.whistle();
    this._tdFlash('GOAL LINE STAND! 🛡️', '#3b82f6');
    const hud = this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','opp');
    this.events.emit('phaseChange','goal_line');
  }

  _startAIDrive() {
    this.aiDown = 1; this.aiToGo = 10;
    this._aiDrivePlays = 0; this._aiDriveYards = 0; this._aiDriveStart = state.yardLine;
    // P24: goal line stand if AI is inside 3
    if (state.yardLine <= 3 && state.possession === 'opp') {
      this._showGoalLineStand();
      return;
    }
    this._resetAIFormation();
    // P25: hurry-up offense when AI trails by 7+ in Q4
    const isHurryUp = state.quarter >= 4 && (state.score.opp - state.score.team) >= 7;
    if (isHurryUp) {
      this._aiHurryUp = true;
      const W = this.scale.width;
      const hb = this.add.text(W/2, FIELD_Y+18, 'HURRY-UP OFFENSE — DEFEND THE PASS', {
        fontSize:'10px', fontFamily:'monospace', fontStyle:'bold', color:'#f97316', stroke:'#000', strokeThickness:2
      }).setOrigin(0.5).setDepth(25);
      this.time.delayedCall(1500, () => { hb?.destroy(); this._launchAIDrive(); });
    } else if (state._drillMode) {
      this._defCall='prevent'; this._aiHurryUp=false;
      const W=this.scale.width;
      const db=this.add.text(W/2,FIELD_Y+20,'⚡ 2-MIN DRILL — PREVENT DEFENSE',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#fbbf24',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(25);
      this.time.delayedCall(1400,()=>{db?.destroy();this._launchAIDrive();});
    } else {
      this._aiHurryUp = false;
      this._showDefCall(() => this._launchAIDrive());
    }
  }

  _launchAIDrive() {
    const call = this._defCall || 'cover2';
    if (call === 'man')          { this._defSpd *= 1.22; this._aiRunSpeed *= 1.06; }
    else if (call === 'blitz')   { this._aiRunSpeed *= 1.12; this._launchBlitzPursuer(); }
    else if (call === 'prevent') { this._aiRunSpeed *= 0.84; this._defSpd *= 0.88; }
    // P25: hurry-up overrides pass chance and speeds up AI RB
    const passCh = this._aiHurryUp ? 0.65 : ({cover2:0.35, man:0.45, blitz:0.55, prevent:0.20}[call] || 0.35);
    if (this._aiHurryUp) { this._aiRunSpeed *= 1.08; }
    if (Math.random() < passCh) { this._startAIPass(); return; }
    this.phase = 'ai_run';
    const hud = this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange', 'opp');
    Sound.whistle();
  }

  _startAIPass() {
    this.phase = 'ai_pass';
    this.dl._lbl?.setText('QB');
    // QB drops back
    this.tweens.add({ targets:this.dl, x:this.dl.x+28, duration:380,
      onUpdate:()=>{ this._syncLbl(this.dl); this.ball.x=this.dl.x; this.ball.y=this.dl.y; }
    });
    // Receiver runs route left (toward user end zone)
    const routeDepth = Phaser.Math.Between(30, 76);
    const routeY = this.lb.y + Phaser.Math.Between(-26, 26);
    this._aiRecTarget = { dot:this.lb, routeDepth, endX:this.lb.x-routeDepth, endY:routeY };
    this.tweens.add({ targets:this.lb, x:this.lb.x-routeDepth, y:routeY, duration:660, ease:'Sine.easeOut',
      onUpdate:()=>this._syncLbl(this.lb)
    });
    // Flash hint
    const W=this.scale.width;
    const ht=this.add.text(W/2, FIELD_Y+26, 'PASS PLAY — GET TO THE RECEIVER', {
      fontSize:'10px', fontFamily:'monospace', fontStyle:'bold', color:'#ef4444', stroke:'#000', strokeThickness:2
    }).setOrigin(0.5).setDepth(20);
    this.time.delayedCall(860, ()=>ht?.destroy());
    const hud=this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','opp');
    Sound.whistle();
    this._passRushMode = false; this._passRushCoverBreak = false;
    // Blitz button (top-right)
    const bx=W-52, by=FIELD_Y+18;
    const bBg=this.add.rectangle(bx,by,80,28,0xea580c).setDepth(21).setInteractive({useHandCursor:true});
    const bTx=this.add.text(bx,by,'⚡ BLITZ',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(22);
    this._blitzBtn=[bBg,bTx];
    const destroyBlitz=()=>{ if(this._blitzBtn){this._blitzBtn.forEach(e=>e?.destroy());this._blitzBtn=null;} };
    bBg.once('pointerdown',()=>this._activatePassRush());
    this._rushThrowTimer = this.time.delayedCall(720, ()=>{ destroyBlitz(); if(this.phase==='ai_pass'&&!this._passRushMode) this._aiThrow(); });
  }

  _activatePassRush() {
    if (this._blitzBtn) { this._blitzBtn.forEach(e=>e?.destroy()); this._blitzBtn=null; }
    this._passRushMode = true;
    this._rushThrowTimer?.remove();
    this._rushThrowTimer = this.time.delayedCall(1500, ()=>{ if(this.phase==='ai_pass') this._checkRushResult(); });
    const W=this.scale.width;
    const h=this.add.text(W/2, FIELD_Y+42, 'RUSH THE QB — WASD', {
      fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#f97316', stroke:'#000', strokeThickness:2
    }).setOrigin(0.5).setDepth(20);
    this.time.delayedCall(1400, ()=>h?.destroy());
  }

  _checkRushResult() {
    if (this.phase !== 'ai_pass') return;
    const dist = Math.hypot(this.userDef.x - this.dl.x, this.userDef.y - this.dl.y);
    if (dist < 22) {
      this.phase = 'result';
      Sound.tackle?.() || Sound.whistle?.();
      this._tdFlash('SACK! QB DOWN 🏈','#22c55e');
      this.aiDown++; this.aiToGo = Math.min(this.aiToGo+8, 30);
      state.stats.team.sacks = (state.stats.team.sacks||0)+1;
      const sackYards = Phaser.Math.Between(5,12);
      this._resolveAIPlay(-sackYards);
    } else {
      this._passRushCoverBreak = true;
      this._aiThrow();
    }
    this._passRushMode = false;
  }

  _aiThrow() {
    this.phase = 'ai_pass_flight';
    const rec = this._aiRecTarget;
    const sx=this.dl.x, sy=this.dl.y, ex=rec.dot.x, ey=rec.dot.y;
    const peakY = Math.min(sy,ey)-30;
    let t=0; const dur=320;
    const arc=this.time.addEvent({ delay:16, loop:true, callback:()=>{
      t+=16/dur; if(t>1){arc.remove();this._clearArc();this._resolveAIPass(rec);return;}
      const bx=Phaser.Math.Linear(sx,ex,t), by=(1-t)*(1-t)*sy+2*(1-t)*t*peakY+t*t*ey;
      this.ball.x=bx; this.ball.y=by;
      this.arcGfx.clear(); this.arcGfx.lineStyle(1,0xef4444,0.6); this.arcGfx.lineBetween(sx,sy,bx,by);
    }});
  }

  _resolveAIPass(rec) {
    this.phase='result'; this._clearArc();
    const call=this._defCall||'cover2';
    const defDist=Math.hypot(this.rb.x-rec.dot.x, this.rb.y-rec.dot.y);
    const intThresh=(call==='man'?56:call==='cover2'?44:32)-(this._passRushCoverBreak?20:0);
    this._passRushCoverBreak=false;
    if(defDist<intThresh){
      Sound.int();
      state.stats.team.int=(state.stats.team.int||0)+1;
      this._tdFlash('INTERCEPTED! 🏈','#22c55e');
      this.aiDown=4; this._resolveAIPlay(0); return;
    }
    const wrD=(state.opponent?.players||[]).find(p=>p.pos==='WR')||{ovr:78};
    const cbD=(state.team?.players||[]).find(p=>['CB','S'].includes(p.pos))||{ovr:75};
    const bonus=call==='blitz'?0.12:call==='prevent'?-0.06:0;
    const wxCatchM=state.weather==='snow'?0.80:state.weather==='rain'?0.86:1;
    const catchCh=Math.min(0.88,Math.max(0.22,(0.58+(wrD.ovr-cbD.ovr)*0.007+bonus)*wxCatchM));
    if(Math.random()>catchCh){ Sound.incomplete(); this._resolveAIPlay(0); return; }
    const yards=Math.max(1,Math.round(rec.routeDepth/YARD_W)+Phaser.Math.Between(-1,3));
    state.stats.opp.passYds=(state.stats.opp.passYds||0)+yards;
    if(state.yardLine-yards<=0){
      Sound.td(); this._tdFlash('OPPONENT TD! ☠️','#ef4444');
      state.score.opp+=7; state.stats.opp.td++;
      state.drives.push({poss:'opp',plays:(this._aiDrivePlays||0)+1,yards:(this._aiDriveYards||0)+yards,start:this._aiDriveStart||25,result:'TD'});
      this._aiDrivePlays=0; this._aiDriveYards=0;
      state.possession='team'; state.yardLine=25; state.down=1; state.toGo=10; state.plays++;
      if(state.plays%8===0)state.quarter=Math.min(4,state.quarter+1);
      const result={text:'OPPONENT TOUCHDOWN! ☠️',td:true,yards:0,turnover:false};
      this.events.emit('playResult',result);
      const hud=this.scene.get('Hud');
      hud?.events?.emit('playResult',result); hud?.events?.emit('possessionChange','team');
      if(!state._halfShown&&state.quarter>=3){state._halfShown=true;this.time.delayedCall(1600,()=>this._showHalftime());return;}
      if(state.quarter>4||state.plays>=40){this.time.delayedCall(2000,()=>this.scene.start('GameOver'));}
      else{this.time.delayedCall(2400,()=>this._startKickoffReturn());}
      return;
    }
    Sound.firstDown();
    this._resolveAIPlay(yards);
  }

  _launchBlitzPursuer() {
    const pursuer = this.c;
    this._place(pursuer, this.aiRunner.x + 40, this.aiRunner.y + Phaser.Math.Between(-40, 40));
    pursuer._lbl?.setText('LB');
    this._show(pursuer, true);
    const pData = (state.team?.players || []).find(p => p.pos === 'LB') || { spd: 74 };
    const spd = pxs(pData.spd, 44, 0.55) / 60;
    this.time.addEvent({ delay: 16, loop: true, callback: () => {
      if (this.phase !== 'ai_run') return;
      const dx = this.aiRunner.x - pursuer.x, dy = this.aiRunner.y - pursuer.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 18) { this._userTackle(); return; }
      pursuer.x += (dx/dist)*spd; pursuer.y += (dy/dist)*spd;
      this._syncLbl(pursuer);
    }});
  }

  _showDefCall(onSelect) {
    const W = this.scale.width, H = this.scale.height;
    const panelW = 370, panelH = 280;
    const px = W/2, py = H - panelH/2 - 8;
    const els = [];
    const cleanup = () => els.forEach(e => e?.destroy?.());
    els.push(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.88).setDepth(35));
    els.push(this.add.rectangle(px, py, panelW, panelH, 0x0d1424, 1).setDepth(36).setStrokeStyle(1, 0x334155));
    els.push(this.add.text(px, py - panelH/2 + 14, '🛡  CALL YOUR DEFENSE', {
      fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#f1f5f9', letterSpacing:2
    }).setOrigin(0.5, 0).setDepth(37));
    els.push(this.add.text(px, py - panelH/2 + 30, `OPP BALL  •  yd ${Math.max(1, 100 - state.yardLine)}`, {
      fontSize:'10px', fontFamily:'monospace', color:'#64748b'
    }).setOrigin(0.5, 0).setDepth(37));
    const DCALLS = [
      { id:'cover2',  label:'Cover 2',   tip:'Deep safeties — limit big plays', col:'#3b82f6' },
      { id:'man',     label:'Man Press', tip:'+22% DEF spd  •  AI +6% spd',     col:'#22c55e' },
      { id:'blitz',   label:'Blitz',     tip:'Extra pursuer  •  AI +12% spd',   col:'#ef4444' },
      { id:'prevent', label:'Prevent',   tip:'AI -16% spd  •  DEF -12% — safe', col:'#f59e0b' },
    ];
    const btnW = 166, btnH = 48, startY = py - panelH/2 + 72;
    DCALLS.forEach((c, i) => {
      const cx = i%2===0 ? px-96 : px+96;
      const cy = startY + Math.floor(i/2)*(btnH+6);
      const accent = Phaser.Display.Color.HexStringToColor(c.col).color;
      const bg = this.add.rectangle(cx, cy, btnW, btnH, 0x1a2438, 1)
        .setDepth(37).setStrokeStyle(1, accent, 0.35).setInteractive({ useHandCursor:true });
      const lbl = this.add.text(cx, cy-8, c.label, { fontSize:'11px', fontFamily:'monospace', fontStyle:'bold', color:'#e2e8f0' }).setOrigin(0.5).setDepth(38);
      const tip = this.add.text(cx, cy+9, c.tip, { fontSize:'8px', fontFamily:'monospace', color:'#475569' }).setOrigin(0.5).setDepth(38);
      bg.on('pointerover', ()=>{ bg.setFillStyle(accent,0.18); lbl.setColor(c.col); tip.setColor('#94a3b8'); });
      bg.on('pointerout',  ()=>{ bg.setFillStyle(0x1a2438,1); lbl.setColor('#e2e8f0'); tip.setColor('#475569'); });
      bg.on('pointerdown', ()=>{ cleanup(); this._defCall=c.id; onSelect(); });
      els.push(bg, lbl, tip);
    });
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
    state._drillMode=false;
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
      this.tweens.add({targets:[bg,t],alpha:0,duration:400,onComplete:()=>{bg.destroy();t.destroy();state._drillMode=true;cb();}});
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
    // P18: position wedge blockers ahead of returner
    this._engagedCvg.clear();
    const blkOffsets=[[-5,-30],[-5,0],[-5,30]];
    this.kickBlocks.forEach((b,i)=>{
      this._place(b,yardToX(catchYard+10)+blkOffsets[i][0],cy+blkOffsets[i][1]);
      this._show(b,true);
    });
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

  // P21: Kickoff choice — normal kickoff or onside attempt
  _showKickoffChoice() {
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const cleanup=()=>els.forEach(e=>e?.destroy?.());
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(60));
    els.push(this.add.text(W/2,H/2-70,'KICKOFF',{fontSize:'22px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    const mkBtn=(cx,cy,label,sub,hx,cb)=>{
      const b=this.add.rectangle(cx,cy,170,64,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const lbl=this.add.text(cx,cy-10,label,{fontSize:'13px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);
      const s=this.add.text(cx,cy+10,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,lbl,s);
    };
    mkBtn(W/2-95,H/2+10,'KICK DEEP','Normal kickoff',0x22c55e,()=>this._startKickoffCover());
    mkBtn(W/2+95,H/2+10,'ONSIDE','~15% recovery chance',0xf59e0b,()=>this._resolveOnsideKick());
  }

  // P21: Resolve onside kick attempt
  _resolveOnsideKick() {
    // Recovery chance: base 15%, improves slightly with ST OVR
    const stOvr = state.team?.players?.filter(p=>p.pos==='K').reduce((s,p,_,a)=>s+p.ovr/a.length,0)||70;
    const recoverCh = Math.min(0.28, 0.10 + (stOvr-60)*0.002);
    const recovered = Math.random() < recoverCh;
    Sound.whistle();
    if (recovered) {
      // User team recovers — start at ~50 yard line
      state.possession='team'; state.yardLine=50; state.down=1; state.toGo=10;
      this._tdFlash('ONSIDE RECOVERED! 🎉','#f59e0b');
      this.time.delayedCall(1800,()=>{
        this._resetFormation(); this._drawLines();
        const hud=this.scene.get('Hud');
        hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','team');
        this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall');
      });
    } else {
      // Opponent recovers at ~45 yard line
      state.possession='opp'; state.yardLine=Math.max(40,100-45); state.down=1; state.toGo=10;
      this._tdFlash('ONSIDE FAILED','#ef4444');
      this.time.delayedCall(1800,()=>{
        if(state.quarter>4||state.plays>=40){this.scene.start('GameOver');return;}
        this._startAIDrive();
      });
    }
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
      // P18: move kick blockers in wedge ahead of runner, check engagements
      if (this.kickBlocks?.[0]?.visible) {
        const blkOff=[[-5,-30],[-5,0],[-5,30]];
        this.kickBlocks.forEach((b,i)=>{
          if(!b.visible)return;
          const tx=this.runner.x+30+blkOff[i][0], ty=this.runner.y+blkOff[i][1];
          b.x+=(tx-b.x)*0.09; b.y+=(ty-b.y)*0.09; this._syncLbl(b);
        });
        const cvgDots=[this.dl,this.dl2,this.lb,this.lb2,this.cb1,this.cb2];
        cvgDots.forEach(cov=>{
          if(!cov.visible||this._engagedCvg.has(cov))return;
          this.kickBlocks.forEach(b=>{
            if(!b.visible)return;
            if(Math.hypot(b.x-cov.x,b.y-cov.y)<20){
              this._engagedCvg.add(cov);
              this.time.delayedCall(1800,()=>this._engagedCvg.delete(cov));
            }
          });
        });
      }
      return;
    }

    // P19: PUNT RETURN — user controls defender
    if (this.phase === 'punt_return') {
      const k = this.keys, dp = this._dpadState;
      const dt = delta / 1000;
      const spd = this._defSpd * dt;
      if (k.rt.isDown||k.d.isDown||dp.dx>0) { this.userDef.x+=spd; }
      if (k.lt.isDown||k.a.isDown||dp.dx<0) { this.userDef.x-=spd; }
      if (k.up.isDown||k.w.isDown||dp.dy<0) { this.userDef.y-=spd; }
      if (k.dn.isDown||k.s.isDown||dp.dy>0) { this.userDef.y+=spd; }
      this.userDef.y = clamp(this.userDef.y, FIELD_Y+10, FIELD_Y+FIELD_H-10);
      this._syncLbl(this.userDef);

      // AI returner runs toward user endzone (decreasing x)
      this._aiJukeCD -= delta;
      if(Math.random()<0.01) this._aiAngle=(Math.random()-0.5)*0.5;
      const aispd = this._aiRunSpeed * dt;
      this.puntRunner.x -= aispd * Math.cos(this._aiAngle);
      this.puntRunner.y += aispd * Math.sin(this._aiAngle) * 0.5;
      this.puntRunner.y = clamp(this.puntRunner.y, FIELD_Y+10, FIELD_Y+FIELD_H-10);
      this.ball.x = this.puntRunner.x; this.ball.y = this.puntRunner.y;
      this._syncLbl(this.puntRunner);

      // Move punt blockers ahead of returner
      if(this.puntBlocks?.[0]?.visible) {
        const blkOff = [[-5,-26],[-5,26]];
        this.puntBlocks.forEach((b,i)=>{
          if(!b.visible)return;
          const tx=this.puntRunner.x-24+blkOff[i][0], ty=this.puntRunner.y+blkOff[i][1];
          b.x+=(tx-b.x)*0.1; b.y+=(ty-b.y)*0.1; this._syncLbl(b);
          // Block user defender if in range
          if(!this._puntEngaged.has(b)&&Math.hypot(b.x-this.userDef.x,b.y-this.userDef.y)<22){
            this._puntEngaged.add(b);
            this.time.delayedCall(1400,()=>this._puntEngaged.delete(b));
          }
        });
      }
      // If user defender is blocked, slow them
      const isBlocked = [...this._puntEngaged].some(b=>Math.hypot(b.x-this.userDef.x,b.y-this.userDef.y)<30);

      // Check user tackle
      const dist = Math.hypot(this.puntRunner.x-this.userDef.x, this.puntRunner.y-this.userDef.y);
      if(dist<14 && !isBlocked) { this._puntTackled(); return; }

      // Returner scores if reaches user endzone
      if(this.puntRunner.x <= FIELD_LEFT) {
        this.phase='result';
        this.puntBlocks?.forEach(b=>this._show(b,false));
        state.score.opp += 6;
        state.stats.opp.td++;
        state.possession='team'; state.yardLine=25; state.down=1; state.toGo=10;
        this._tdFlash('PUNT RETURN TD! ☠️','#ef4444');
        const result={text:'PUNT RETURN TOUCHDOWN!',td:true,yards:0,turnover:false};
        this.events.emit('playResult',result);
        const hud=this.scene.get('Hud');
        hud?.events?.emit('playResult',result); hud?.events?.emit('possessionChange','team');
        this.time.delayedCall(2200,()=>this._startKickoffReturn());
        return;
      }
      return;
    }

    // P22: MUFFED PUNT — user rushes to ball
    if (this.phase === 'muffed_punt') {
      const k = this.keys, dp = this._dpadState, dt = delta / 1000;
      const spd = this._defSpd * dt;
      if (k.rt.isDown||k.d.isDown||dp.dx>0) this.userDef.x += spd;
      if (k.lt.isDown||k.a.isDown||dp.dx<0) this.userDef.x -= spd;
      if (k.up.isDown||k.w.isDown||dp.dy<0) this.userDef.y -= spd;
      if (k.dn.isDown||k.s.isDown||dp.dy>0) this.userDef.y += spd;
      this.userDef.y = clamp(this.userDef.y, FIELD_Y+10, FIELD_Y+FIELD_H-10);
      this._syncLbl(this.userDef);
      // AI rushes toward ball too
      const adx = this.ball.x - this.dl.x, ady = this.ball.y - this.dl.y, ad = Math.sqrt(adx*adx+ady*ady);
      if (ad > 5) { this.dl.x += (adx/ad)*spd*0.9; this.dl.y += (ady/ad)*spd*0.9; this._syncLbl(this.dl); }
      // User touches ball first — instant recovery
      const udist = Math.hypot(this.userDef.x - this.ball.x, this.userDef.y - this.ball.y);
      if (udist < 14) {
        this.phase = 'result';
        state.possession = 'team'; state.yardLine = this._muffYard; state.down = 1; state.toGo = 10;
        this._show(this.lb, false); this._show(this.dl, false);
        this._tdFlash('RECOVERED! 🎉', '#22c55e');
        this._endPlay({ yards:0, text:`MUFFED PUNT recovered by ${state.team?.ab||'YOU'}!`, type:'fumble', turnover:false, td:false });
        return;
      }
      return;
    }

    // P26: TWO-POINT MINI-GAME
    if (this.phase === 'two_point') {
      const spd = this.runSpd * dt;
      if (k.rt.isDown||k.d.isDown||dp.dx>0) { this.qb.x+=spd; }
      if (k.lt.isDown||k.a.isDown||dp.dx<0) { this.qb.x-=spd*0.65; }
      if (k.up.isDown||k.w.isDown||dp.dy<0) { this.qb.y-=spd*0.82; }
      if (k.dn.isDown||k.s.isDown||dp.dy>0) { this.qb.y+=spd*0.82; }
      this.qb.y = clamp(this.qb.y, FIELD_Y+10, FIELD_Y+FIELD_H-10);
      this.ball.x = this.qb.x; this.ball.y = this.qb.y;
      this._syncLbl(this.qb);
      // DL pursues QB at speed 55 px/s
      const ddx = this.qb.x - this.dl.x, ddy = this.qb.y - this.dl.y, ddist = Math.sqrt(ddx*ddx+ddy*ddy);
      if (ddist > 4) { const ds = 55*dt; this.dl.x += (ddx/ddist)*ds; this.dl.y += (ddy/ddist)*ds; this._syncLbl(this.dl); }
      // QB reaches end zone
      if (this.qb.x <= yardToX(0) + 8) { this._resolveTwoPoint(true); return; }
      // DL tackles QB
      if (ddist < 16) { this._resolveTwoPoint(false, 'TACKLED'); return; }
      // Timer
      this._tpTimer -= delta;
      if (this._tpTimerEl) this._tpTimerEl.setText((Math.max(0, this._tpTimer) / 1000).toFixed(1));
      if (this._tpTimer <= 0) { this._resolveTwoPoint(false, 'TIME'); return; }
      return;
    }

    // P24: GOAL LINE STAND
    if (this.phase === 'goal_line') {
      const k = this.keys, dp = this._dpadState, dt = delta / 1000;
      // User controls defender
      const spd = this._defSpd * dt;
      if (k.rt.isDown||k.d.isDown||dp.dx>0) this.userDef.x += spd;
      if (k.lt.isDown||k.a.isDown||dp.dx<0) this.userDef.x -= spd;
      if (k.up.isDown||k.w.isDown||dp.dy<0) this.userDef.y -= spd;
      if (k.dn.isDown||k.s.isDown||dp.dy>0) this.userDef.y += spd;
      this.userDef.y = clamp(this.userDef.y, FIELD_Y+10, FIELD_Y+FIELD_H-10);
      this._syncLbl(this.userDef);
      // AI runner powers forward
      const aispd = this._aiRunSpeed * dt;
      this.aiRunner.x -= aispd;
      this.ball.x = this.aiRunner.x; this.ball.y = this.aiRunner.y;
      this._syncLbl(this.aiRunner);
      this._goalLineTimer -= delta;
      // User tackle
      const udist = Math.hypot(this.userDef.x-this.aiRunner.x, this.userDef.y-this.aiRunner.y);
      if (udist < 16) {
        this.phase = 'result';
        [...this.offPlayers,...this.defPlayers].forEach(d=>this._show(d,false));
        this._tdFlash('STOPPED! 💪', '#22c55e');
        state.possession='team'; state.yardLine=Math.max(5,100-state.yardLine); state.down=1; state.toGo=10;
        const result={text:'Goal line stand! Turnover on downs.',yards:0,td:false,turnover:false};
        this.events.emit('playResult',result);
        const hud=this.scene.get('Hud');
        hud?.events?.emit('playResult',result); hud?.events?.emit('possessionChange','team');
        this.time.delayedCall(1800,()=>{
          this._resetFormation(); this._drawLines();
          hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','team');
          this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall');
        });
        return;
      }
      // AI scores if they reach the goal line or timer expires
      if (this.aiRunner.x <= FIELD_LEFT || this._goalLineTimer <= 0) {
        this.phase = 'result';
        [...this.offPlayers,...this.defPlayers].forEach(d=>this._show(d,false));
        this._aiTouchdown();
        return;
      }
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

    // AI POSSESSION — user covers receiver during pass play
    if (this.phase === 'ai_pass') {
      const dspd = (this._defSpd + (this._passRushMode ? 12 : 0)) * dt;
      if (k.rt.isDown||k.d.isDown||dp.dx>0) this.userDef.x+=dspd;
      if (k.lt.isDown||k.a.isDown||dp.dx<0) this.userDef.x-=dspd*0.9;
      if (k.up.isDown||k.w.isDown||dp.dy<0) this.userDef.y-=dspd;
      if (k.dn.isDown||k.s.isDown||dp.dy>0) this.userDef.y+=dspd;
      this.userDef.y=clamp(this.userDef.y,FIELD_Y+10,FIELD_Y+FIELD_H-10);
      this._syncLbl(this.userDef);
    }

    // P28: FADE ROUTE — catch handled by button tap
    if (this.phase === 'fade_route') { /* catch handled by button */ }
  }

  // ─── P28: RED ZONE FADE ROUTE ─────────────────────────────────────────────

  _showFadeOption(callId) {
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const cleanup=()=>{ els.forEach(e=>e?.destroy?.()); clearTimeout(this._fadeAutoTimer); };
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'RED ZONE — PLAY CALL',{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#ef4444',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    els.push(this.add.text(W/2,H/2-36,'Choose your play:',{fontSize:'10px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(61));
    const mkBtn=(cx,cy,label,sub,hx,cb,w=128)=>{
      const b=this.add.rectangle(cx,cy,w,60,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const lbl=this.add.text(cx,cy-10,label,{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);
      const s=this.add.text(cx,cy+10,sub,{fontSize:'7px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,lbl,s);
    };
    mkBtn(W/2-150,H/2+14,'NORMAL PASS','Standard route',0x22c55e,()=>this._startPass(callId));
    mkBtn(W/2,H/2+14,'⚡ SLANT','Hot route — quick inside',0x3b82f6,()=>this._startSlantRoute(callId));
    mkBtn(W/2+150,H/2+14,'🎯 FADE ROUTE','Corner — timing catch',0xf59e0b,()=>this._startFadeRoute());
    // Auto-dismiss to normal pass after 3s
    const cdEl=this.add.text(W/2,H/2+60,'Auto: 3s',{fontSize:'9px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);
    els.push(cdEl);
    let rem=3000; const tick=()=>{
      rem-=200; if(rem<=0){cleanup();this._startPass(callId);return;}
      cdEl?.setText?.('Auto: '+(rem/1000).toFixed(1)+'s');
      this._fadeAutoTimer=setTimeout(tick,200);
    };
    this._fadeAutoTimer=setTimeout(tick,200);
  }

  // ─── P29: TRICK PLAY ──────────────────────────────────────────────────────

  _showTrickOption(callId) {
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const cleanup=()=>{ els.forEach(e=>e?.destroy?.()); clearTimeout(this._trickAutoTimer); };
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'TRICK PLAY — PRE-SNAP',{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#a78bfa',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    els.push(this.add.text(W/2,H/2-36,'Catch the defense off guard:',{fontSize:'10px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(61));
    const mkBtn=(cx,cy,label,sub,hx,cb)=>{
      const b=this.add.rectangle(cx,cy,160,60,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const lbl=this.add.text(cx,cy-10,label,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);
      const s=this.add.text(cx,cy+10,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,lbl,s);
    };
    mkBtn(W/2-90,H/2+14,'NORMAL RUN','Standard carry',0x22c55e,()=>this._startRun(callId));
    mkBtn(W/2+90,H/2+14,'🎭 TRICK PLAY','Reverse / flea flicker',0xa78bfa,()=>this._startTrickPlay());
    const cdEl=this.add.text(W/2,H/2+60,'Auto: 3s',{fontSize:'9px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);
    els.push(cdEl);
    let rem=3000; const tick=()=>{
      rem-=200; if(rem<=0){cleanup();this._startRun(callId);return;}
      cdEl?.setText?.('Auto: '+(rem/1000).toFixed(1)+'s');
      this._trickAutoTimer=setTimeout(tick,200);
    };
    this._trickAutoTimer=setTimeout(tick,200);
  }

  _startTrickPlay() {
    const cy=FIELD_Y+FIELD_H/2, W=this.scale.width, H=this.scale.height;
    [...this.offPlayers,...this.defPlayers].forEach(d=>this._show(d,false));
    this._show(this.qb,true); this._show(this.rb,true); this._show(this.wr1,true);
    const qbX=yardToX(Math.max(5,state.yardLine-5));
    this._place(this.qb,qbX,cy); this._place(this.rb,qbX-20,cy+22); this._place(this.wr1,qbX+50,cy-35);
    this.qb._lbl?.setText('QB'); this.rb._lbl?.setText('RB'); this.wr1._lbl?.setText('WR');
    this.ball.x=this.qb.x; this.ball.y=this.qb.y;
    this.phase='trick_play'; this._trickEls=[];
    const banner=this.add.text(W/2,FIELD_Y-20,'🎭 TRICK PLAY — PITCH IT!',{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#a78bfa',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(20);
    this._trickEls.push(banner);
    // Handoff QB→RB (400ms), pitch RB→WR (400ms), WR runs reverse
    this.tweens.add({targets:this.ball,x:this.rb.x,y:this.rb.y,duration:400,ease:'Linear',onComplete:()=>{
      this.tweens.add({targets:this.ball,x:this.wr1.x,y:this.wr1.y,duration:350,ease:'Linear'});
      this.tweens.add({targets:this.wr1,x:yardToX(state.yardLine+18),y:cy-35,duration:700,delay:350});
      this._syncLbl(this.rb); this._syncLbl(this.wr1);
    }});
    this.tweens.add({targets:this.rb,x:qbX-5,y:cy+22,duration:400,ease:'Linear'});
    let pitchPressed=false;
    // PITCH! button at 650ms
    this._trickPitchTimer=this.time.delayedCall(650,()=>{
      const btn=this.add.text(W/2,H/2+30,'🏈 PITCH!',{fontSize:'20px',fontFamily:'monospace',fontStyle:'bold',color:'#a78bfa',backgroundColor:'#1e1b4b',padding:{x:16,y:10},stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(25).setInteractive({useHandCursor:true});
      btn.on('pointerdown',()=>{pitchPressed=true;btn.destroy();});
      this._trickEls.push(btn);
    });
    // Resolve at 1450ms
    this._trickResolveTimer=this.time.delayedCall(1450,()=>{
      if(this._trickEls){this._trickEls.forEach(e=>e?.destroy?.());this._trickEls=null;}
      this._resolveTrickPlay(pitchPressed);
    });
  }

  _resolveTrickPlay(pitchPressed) {
    const roll=Math.random();
    const bigT=pitchPressed?0.64:0.50;
    const midT=pitchPressed?0.90:0.80;
    let yards,text;
    if(roll<bigT){yards=Phaser.Math.Between(15,34);text=`🎭 REVERSE! Big gain — ${yards} yards!`;Sound.complete?.();}
    else if(roll<midT){yards=Phaser.Math.Between(3,11);text=`Trick play — ${yards} yard gain`;}
    else{yards=-Phaser.Math.Between(3,6);text=`Trick play sniffed out! ${yards} yards`;}
    const td=yards>0&&state.yardLine-yards<=0;
    if(td){Sound.td?.();this._tdFlash('TOUCHDOWN! 🎭','#a78bfa');}
    this._endPlay({yards,text,type:'run',turnover:false,td});
  }

  // ─── P31: RED ZONE SLANT ──────────────────────────────────────────────────

  _startSlantRoute(callId) {
    const cy=FIELD_Y+FIELD_H/2, W=this.scale.width;
    [...this.offPlayers,...this.defPlayers].forEach(d=>this._show(d,false));
    this._show(this.qb,true); this._show(this.wr1,true); this._show(this.cb1,true);
    const qbX=yardToX(Math.max(5,state.yardLine-5));
    this._place(this.qb,qbX,cy); this._place(this.wr1,qbX-10,cy-55); this._place(this.cb1,qbX-12,cy-55);
    this.qb._lbl?.setText('QB'); this.wr1._lbl?.setText('WR'); this.cb1._lbl?.setText('CB');
    this.ball.x=this.qb.x; this.ball.y=this.qb.y;
    this.phase='slant_route';
    const banner=this.add.text(W/2,FIELD_Y-20,'⚡ SLANT — QUICK INSIDE',{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#3b82f6',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(20);
    // WR cuts inside (toward cy), CB reacts
    this.tweens.add({targets:this.wr1,x:qbX+15,y:cy-10,duration:480,ease:'Quad.easeIn'});
    this.tweens.add({targets:this.cb1,x:qbX+12,y:cy-12,duration:520,ease:'Quad.easeIn',delay:60});
    // Ball snaps to WR at 500ms
    this.time.delayedCall(500,()=>{
      this.tweens.add({targets:this.ball,x:this.wr1.x,y:this.wr1.y,duration:200,ease:'Linear'});
    });
    this.time.delayedCall(820,()=>{banner?.destroy();this._resolveSlant();});
  }

  _resolveSlant() {
    const wrD=state.team?.players?.find(p=>p.pos==='WR')||{ovr:80};
    const cbD=state.opponent?.players?.find(p=>p.pos==='CB')||{ovr:75};
    const qbD=state.team?.players?.find(p=>p.pos==='QB')||{ovr:80};
    const cbPressChance=clamp((cbD.ovr-68)*0.007,0,0.14);
    const compRate=clamp(0.70+(qbD.ovr-70)*0.003+(wrD.ovr-70)*0.002,0.55,0.85);
    const roll=Math.random();
    if(roll<cbPressChance){
      if(Math.random()<0.38){Sound.incomplete?.();this._endPlay({yards:0,text:'SLANT PICKED OFF — CB jumped the route!',type:'int',turnover:true,td:false});}
      else{Sound.incomplete?.();this._endPlay({yards:0,text:'Slant defended — CB in press coverage',type:'inc',turnover:false,td:false});}
      return;
    }
    if(roll<compRate){
      const td=state.yardLine<=9&&Math.random()<0.38;
      if(td){Sound.td?.();this._tdFlash('TOUCHDOWN! ⚡','#3b82f6');this._endPlay({yards:state.yardLine,text:'TD — Slant over the middle!',type:'td',turnover:false,td:true});}
      else{const yds=Phaser.Math.Between(4,Math.min(11,state.yardLine-1));this._endPlay({yards:yds,text:`Slant — ${yds} yard gain`,type:'pass',turnover:false,td:false});}
      return;
    }
    Sound.incomplete?.();this._endPlay({yards:0,text:'Slant — incomplete',type:'inc',turnover:false,td:false});
  }

  _startFadeRoute() {
    this._noHuddleActive = true;
    const cy = FIELD_Y + FIELD_H / 2;
    const W = this.scale.width;
    [...this.offPlayers, ...this.defPlayers].forEach(d => this._show(d, false));
    this._show(this.qb, true); this._show(this.wr1, true); this._show(this.cb1, true);
    const qbX = yardToX(Math.max(5, state.yardLine - 5));
    this._place(this.qb,  qbX, cy);
    this._place(this.wr1, yardToX(2), FIELD_Y + 10);
    this._place(this.cb1, yardToX(2), FIELD_Y + 10);
    this.qb._lbl?.setText('QB'); this.wr1._lbl?.setText('WR'); this.cb1._lbl?.setText('CB');
    this.ball.x = this.qb.x; this.ball.y = this.qb.y;
    this.phase = 'fade_route';
    this._fadeEls = [];
    const banner = this.add.text(W/2, FIELD_Y - 20, 'FADE — TAP CATCH WHEN BALL ARRIVES', {
      fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#f59e0b', stroke:'#000', strokeThickness:3
    }).setOrigin(0.5).setDepth(20);
    this._fadeEls.push(banner);
    // Arc ball to WR corner over 1100ms
    this.tweens.add({
      targets: this.ball,
      x: yardToX(2), y: FIELD_Y + 10,
      duration: 1100,
      ease: 'Sine.easeOut',
      onUpdate: (tw) => {
        const prog = tw.progress;
        this.ball.y = Phaser.Math.Linear(this.qb.y, FIELD_Y + 10, prog) - Math.sin(prog * Math.PI) * 40;
      }
    });
    // Show catch button after 900ms
    let catchPressed = false;
    this._fadeCatchTimer = this.time.delayedCall(900, () => {
      if (this.phase !== 'fade_route') return;
      const bx = W/2, by = FIELD_Y + FIELD_H / 2;
      const bBg = this.add.rectangle(bx, by, 120, 36, 0xf97316).setDepth(21).setInteractive({useHandCursor:true});
      const bTx = this.add.text(bx, by, '🤲 CATCH!', {fontSize:'13px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(22);
      this._fadeEls.push(bBg, bTx);
      bBg.once('pointerdown', () => { catchPressed = true; });
    });
    // Resolve after 1400ms
    this._fadeResolveTimer = this.time.delayedCall(1400, () => {
      if (this.phase !== 'fade_route') return;
      this._resolveFade(catchPressed);
    });
  }

  _resolveFade(caught) {
    this._fadeEls?.forEach(e=>e?.destroy()); this._fadeEls=null;
    this._noHuddleActive = false;
    this.phase = 'result';
    if (!caught) { Sound.incomplete(); this._endPlay({yards:0,text:'FADE — INCOMPLETE',type:'pass',turnover:false,td:false}); return; }
    const wrOvr = (state.team?.players||[]).find(p=>p.pos==='WR')?.ovr || 75;
    const cbOvr = (state.opponent?.players||[]).find(p=>['CB','S'].includes(p.pos))?.ovr || 75;
    const catchCh = Math.min(0.85, Math.max(0.40, 0.60 + (wrOvr - cbOvr) * 0.008));
    if (Math.random() < catchCh) {
      Sound.td(); state.score.team += 6;
      state.stats.team.recTD = (state.stats.team.recTD||0)+1;
      this._tdFlash('TOUCHDOWN! FADE ROUTE 🙌','#22c55e');
      this._endPlay({yards:state.yardLine,text:'TD — Fade route to the corner!',type:'td',turnover:false,td:true});
    } else {
      Sound.incomplete();
      this._tdFlash('KNOCKED AWAY!','#ef4444');
      this._endPlay({yards:0,text:'Fade — pass broken up in end zone',type:'pass',turnover:false,td:false});
    }
  }

  // ─── P32: SCREEN PASS ─────────────────────────────────────────────────────

  _startScreenPass() {
    const cy=FIELD_Y+FIELD_H/2, W=this.scale.width, H=this.scale.height;
    this.phase='screen_pass';
    [...this.offPlayers,...this.defPlayers].forEach(d=>this._show(d,false));
    this._show(this.qb,true); this._show(this.rb,true); this._show(this.cb1,true);
    const qbX=yardToX(Math.max(5,state.yardLine-5));
    const flatX=yardToX(Math.max(8,state.yardLine-2));
    this._place(this.qb,qbX,cy); this._place(this.rb,qbX-18,cy+30); this._place(this.cb1,flatX+18,cy+32);
    this.qb._lbl?.setText('QB'); this.rb._lbl?.setText('RB'); this.cb1._lbl?.setText('CB');
    this.ball.x=this.qb.x; this.ball.y=this.qb.y;
    const banner=this.add.text(W/2,FIELD_Y-20,'🏈 SCREEN PASS — HIT THE FLAT',{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#22c55e',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(20);
    this._screenEls=[banner];
    this.tweens.add({targets:this.rb,x:flatX,y:cy+30,duration:580,ease:'Quad.easeOut',onUpdate:()=>this._syncLbl(this.rb)});
    let throwPressed=false;
    this._screenThrowTimer=this.time.delayedCall(520,()=>{
      if(this.phase!=='screen_pass')return;
      const btn=this.add.text(W/2,H/2,'🏈 THROW!',{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#22c55e',backgroundColor:'#052e16',padding:{x:14,y:8},stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(25).setInteractive({useHandCursor:true});
      btn.once('pointerdown',()=>{throwPressed=true;btn.destroy();});
      this._screenEls.push(btn);
    });
    this._screenResolveTimer=this.time.delayedCall(1300,()=>{
      if(this.phase!=='screen_pass')return;
      this._screenEls?.forEach(e=>e?.destroy?.()); this._screenEls=null;
      this.phase='result';
      if(!throwPressed){Sound.incomplete();this._endPlay({yards:0,text:'Screen — held too long, incomplete',type:'inc',turnover:false,td:false});return;}
      const rbOvr=(state.team?.players||[]).find(p=>p.pos==='RB')?.ovr||72;
      const cbOvr=(state.opponent?.players||[]).find(p=>['CB','S'].includes(p.pos))?.ovr||75;
      const roll=Math.random();
      if(roll<0.05){Sound.incomplete();state.stats.team.int=(state.stats.team.int||0)+1;this._tdFlash('SCREEN PICKED!','#ef4444');this._endPlay({yards:0,text:'Screen pass INTERCEPTED!',type:'int',turnover:true,td:false});return;}
      if(roll<0.20&&cbOvr>rbOvr+3){Sound.tackle();this._endPlay({yards:-2,text:'Screen sniffed out — stuffed for loss!',type:'run',turnover:false,td:false});return;}
      const yds=Phaser.Math.Between(3,10);
      const td=state.yardLine-yds<=0;
      if(td){Sound.td?.();this._tdFlash('TOUCHDOWN! 🏈','#22c55e');this._endPlay({yards:state.yardLine,text:'Screen pass TOUCHDOWN!',type:'td',turnover:false,td:true});}
      else{this._endPlay({yards:yds,text:`Screen pass — ${yds} yard gain`,type:'run',turnover:false,td:false});}
    });
  }

  // ─── P33: PLAY ACTION PASS ────────────────────────────────────────────────

  _startPlayAction() {
    const cy=FIELD_Y+FIELD_H/2, W=this.scale.width;
    this.phase='play_action';
    [...this.offPlayers,...this.defPlayers].forEach(d=>this._show(d,false));
    this._show(this.qb,true); this._show(this.rb,true); this._show(this.wr1,true); this._show(this.cb1,true);
    const qbX=yardToX(Math.max(5,state.yardLine-5));
    this._place(this.qb,qbX,cy); this._place(this.rb,qbX-18,cy+25);
    this._place(this.wr1,qbX+45,cy-52); this._place(this.cb1,qbX+48,cy-52);
    this.qb._lbl?.setText('QB'); this.rb._lbl?.setText('RB'); this.wr1._lbl?.setText('WR'); this.cb1._lbl?.setText('CB');
    this.ball.x=this.qb.x; this.ball.y=this.qb.y;
    const banner=this.add.text(W/2,FIELD_Y-20,'🎯 PLAY ACTION — DBs FROZEN!',{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#a78bfa',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(20);
    // QB fake: ball moves toward RB then snaps back
    this.tweens.add({targets:this.ball,x:this.rb.x,y:this.rb.y,duration:280,ease:'Linear',onComplete:()=>{
      this.tweens.add({targets:this.ball,x:this.qb.x,y:this.qb.y,duration:140,ease:'Linear'});
    }});
    this.tweens.add({targets:this.rb,x:this.rb.x+28,y:this.rb.y,duration:320,ease:'Quad.easeOut',onUpdate:()=>this._syncLbl(this.rb)});
    // CB bites on run fake — drifts upfield
    this.tweens.add({targets:this.cb1,x:this.cb1.x-28,y:this.cb1.y+18,duration:420,ease:'Quad.easeOut',onUpdate:()=>this._syncLbl(this.cb1)});
    this.time.delayedCall(680,()=>{ banner?.destroy(); this._resolvePlayAction(); });
  }

  _resolvePlayAction() {
    this.phase='result';
    const qbOvr=(state.team?.players||[]).find(p=>p.pos==='QB')?.ovr||78;
    const wrOvr=(state.team?.players||[]).find(p=>p.pos==='WR')?.ovr||75;
    const cbOvr=(state.opponent?.players||[]).find(p=>['CB','S'].includes(p.pos))?.ovr||75;
    const wxM=state.weather==='snow'?0.82:state.weather==='rain'?0.88:1;
    const compRate=Math.min(0.88,Math.max(0.42,(0.65+(qbOvr-70)*0.01+(wrOvr-cbOvr)*0.008)*wxM));
    const roll=Math.random();
    if(roll<0.04){Sound.incomplete?.();state.stats.team.int=(state.stats.team.int||0)+1;this._tdFlash('PLAY ACTION INT!','#ef4444');this._endPlay({yards:0,text:'Play action INT — defense not fooled!',type:'int',turnover:true,td:false});return;}
    if(roll<compRate+0.04){
      const yds=Phaser.Math.Between(10,28);
      const td=state.yardLine-yds<=0;
      if(td){Sound.td?.();this._tdFlash('TOUCHDOWN! 🎯','#a78bfa');this._endPlay({yards:state.yardLine,text:'Play Action TD — WR wide open!',type:'td',turnover:false,td:true});}
      else{Sound.firstDown?.();this._endPlay({yards:yds,text:`Play action — ${yds} yard gain`,type:'pass',turnover:false,td:false});}
      return;
    }
    Sound.incomplete?.();this._endPlay({yards:0,text:'Play action — WR covered, incomplete',type:'pass',turnover:false,td:false});
  }
}
