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

// P54: Expanded audible hot routes
const AUDIBLE_ROUTES = {
  'screen': { label:'RB SCREEN', passBonus:0.10, yardsBase:5,  risk:'low'    },
  'slant':  { label:'SLANT',     passBonus:0.15, yardsBase:8,  risk:'low'    },
  'fade':   { label:'FADE',      passBonus:-0.10,yardsBase:18, risk:'high'   },
  'out':    { label:'OUT ROUTE', passBonus:0.08, yardsBase:10, risk:'medium' },
};
// P55: Defensive formation variants
const DEF_FORMATIONS = {
  '4-3':    { coverageBonus:0,     sackBonus:0.02,  label:'4-3'    },
  '3-4':    { coverageBonus:0.05,  sackBonus:0,     label:'3-4'    },
  'nickel': { coverageBonus:0.12,  sackBonus:-0.01, label:'NICKEL' },
  'dime':   { coverageBonus:0.18,  sackBonus:-0.02, label:'DIME'   },
  'blitz':  { coverageBonus:-0.10, sackBonus:0.06,  label:'BLITZ'  },
};

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
    // P36-P43 flags
    this._spinUsed = false; this._challengeUsed = false; this._comebackMode = false;
    // P44-P48 flags
    this._audibleUsed = false; this._audibleActive = null; this._audibleBtn = null; this._audibleBtnTxt = null; this._audibleMenuEls = null;
    this._holdingRoll = false; this._squibKickTimer = null; this._bootlegEls = null; this._hmTimer = null;
    this._momentum = 50; this._momentumBar = null; this._momentumText = null;
    this._prePlayState = null;
    // P49-P53 flags
    this._matchupWR1 = 75; this._matchupWR2 = 75; this._matchupEls = [];
    this._fgBlockEls = []; this._qbInjured = false; this._qbInjEl = null;
    this._clockMgmtEls = []; this._p51Hold = false;
    // P54-P58: new feature flags
    this._fatigue = {};
    this._qbReadsActive = false; this._qbReadChoice = 'primary'; this._readOverlayElems = [];
    this._activeAudible = null; this._audibleMenuShown = false; this._audibleMenuElems = [];
    this._defFormation = '4-3'; this._defFormElems = [];
    // P59-P63 flags
    this._isOT = false; this._wind = null; this._stackItEls = []; this._stackItBonus = false;
    // P64-P68 flags
    this._hurryUpEls = []; this._hurryUpActive = false; this._routeTreeEls = []; this._routeTreeChoice = null;
    this._rushLaneEls = []; this._rushLaneBonus = null;
    this._checkdownActive = false; this._fadeBtnEls = [];
    // P69-P73 flags
    this._piChecked = false; this._hurryUpDef = 0; this._motionActive = false; this._motionUsed = false; this._motionBtn = null; this._motionEls = [];
    this._thirdDownAtt = 0; this._thirdDownConv = 0; this._thirdHUD = null; this._thirdHUDTxt = null;
    // P74-P78 flags
    this._bumpCovEls = []; this._slideEls = []; this._rzRunEls = []; this._penaltyEls = []; this._twoMinFired1 = false; this._twoMinFired2 = false;
    // P80 flags: H1 play clock, G4 jump ball, B3 crowd noise, G3 pressure bar
    this._playClockMs = 0; this._playClockEl = null;
    this._jmpBonus = 0;
    this._crowdNoise = false; this._pressureBar = null;
    // V3: speed trail graphics
    this._trailGfx = this.add.graphics().setDepth(3);
    this._trailPts = [];
    this.events.on('playCalled', this._onPlayCalled, this);
    this._resetFormation();
    this._startWeather();
    this._buildMomentumHUD();
    this._buildThirdDownHUD();
    // P62: roll wind once per game
    const _wdirs=['←','→','↑','↓'];this._wind={dir:_wdirs[Phaser.Math.Between(0,3)],mph:Phaser.Math.Between(3,18)};
    // E3: persistent wind badge on field
    if(this._wind.mph>=4)this.add.text(FIELD_RIGHT-58,FIELD_Y-14,`${this._wind.dir} ${this._wind.mph}mph`,{fontSize:'8px',fontFamily:'monospace',color:'#64748b'}).setDepth(12);
    // B3: crowd noise badge if GM stadium has upgrade
    if((state.stadiumUpgrades||[]).includes('crowd_noise')){this._crowdNoise=true;this.add.text(FIELD_LEFT+8,FIELD_Y-14,'📢 CROWD',{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b'}).setDepth(12);}
    // H1: play clock text (updated each presnap)
    this._playClockEl=this.add.text(FIELD_RIGHT-62,FIELD_Y+FIELD_H+22,'',{fontSize:'10px',fontFamily:'monospace',color:'#94a3b8'}).setDepth(12);
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
    // E1: team-colored endzone overlays using GM bridge colors
    const _ezTc=Phaser.Display.Color.HexStringToColor(state.team?.clr||'#22c55e').color;
    const _ezOc=Phaser.Display.Color.HexStringToColor(state.opponent?.clr||'#ef4444').color;
    this.add.rectangle(50,FIELD_Y+FIELD_H/2,FIELD_LEFT,FIELD_H,_ezTc,0.22).setDepth(0);
    this.add.rectangle(750,FIELD_Y+FIELD_H/2,100,FIELD_H,_ezOc,0.22).setDepth(0);
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
    const tp = state.team?.players||[], op = state.opponent?.players||[];
    // V1: radius from attributes — high STR = bigger dot, high SPD = slightly smaller
    const _pxR = p => { if(!p)return 12; const s=p.str||70,v=p.spd||75; return clamp(Math.round(12+(s-70)/9-(v>82?1:0)),9,16); };
    const qbP=tp.find(p=>p.pos==='QB'), rbP=tp.find(p=>p.pos==='RB');
    const wr1P=tp.find(p=>p.pos==='WR'), wr2P=tp.filter(p=>p.pos==='WR')[1];
    const teP=tp.find(p=>p.pos==='TE');
    const ltP=tp.find(p=>p.pos==='LT'), lgP=tp.find(p=>p.pos==='LG'), cP=tp.find(p=>p.pos==='C');
    const rgP=tp.find(p=>p.pos==='RG'), rtP=tp.find(p=>p.pos==='RT');
    this.qb =this._dot(tc,'QB', _pxR(qbP),  qbP?.ovr);  this.rb =this._dot(tc,'RB', _pxR(rbP),  rbP?.ovr);
    this.wr1=this._dot(tc,'WR', _pxR(wr1P), wr1P?.ovr); this.wr2=this._dot(tc,'WR', _pxR(wr2P), wr2P?.ovr);
    this.te =this._dot(tc,'TE', _pxR(teP),  teP?.ovr);
    this.lt =this._dot(tc,'LT', _pxR(ltP),  ltP?.ovr);  this.lg =this._dot(tc,'LG', _pxR(lgP),  lgP?.ovr);
    this.c  =this._dot(tc,'C',  _pxR(cP),   cP?.ovr);   this.rg =this._dot(tc,'RG', _pxR(rgP),  rgP?.ovr);
    this.rt =this._dot(tc,'RT', _pxR(rtP),  rtP?.ovr);
    this.oLine=[this.lt,this.lg,this.c,this.rg,this.rt];
    this.offPlayers=[this.qb,this.rb,this.wr1,this.wr2,this.te,...this.oLine];
    const dlP=op.find(p=>['DE','DL'].includes(p.pos)), dl2P=op.filter(p=>['DE','DL','DT'].includes(p.pos))[1];
    const lbP=op.find(p=>['MLB','LB'].includes(p.pos)), lb2P=op.filter(p=>['OLB','LB'].includes(p.pos))[0];
    const cb1P=op.find(p=>p.pos==='CB'), cb2P=op.filter(p=>p.pos==='CB')[1];
    const safP=op.find(p=>['S','FS','SS'].includes(p.pos));
    this.dl =this._dot(oc,'DE', _pxR(dlP),  dlP?.ovr);  this.dl2=this._dot(oc,'DT', _pxR(dl2P), dl2P?.ovr);
    this.lb =this._dot(oc,'MLB',_pxR(lbP),  lbP?.ovr);  this.lb2=this._dot(oc,'OLB',_pxR(lb2P), lb2P?.ovr);
    this.cb1=this._dot(oc,'CB', _pxR(cb1P), cb1P?.ovr); this.cb2=this._dot(oc,'CB', _pxR(cb2P), cb2P?.ovr);
    this.saf=this._dot(oc,'FS', _pxR(safP), safP?.ovr);
    this.defPlayers=[this.dl,this.dl2,this.lb,this.lb2,this.cb1,this.cb2,this.saf];
    this.recTargets=[];
    // Kickoff return blockers (P18)
    this.blk1=this._dot(tc,'BLK',10); this.blk2=this._dot(tc,'BLK',10); this.blk3=this._dot(tc,'BLK',10);
    this.kickBlocks=[this.blk1,this.blk2,this.blk3];
    this.kickBlocks.forEach(b=>this._show(b,false));
    this._engagedCvg=new Set();
    // P19: Punt return blockers (opponent team color)
    const oc2=Phaser.Display.Color.HexStringToColor(state.opponent?.clr||'#ef4444').color;
    this.puntBlk1=this._dot(oc2,'BLK',10); this.puntBlk2=this._dot(oc2,'BLK',10);
    this.puntBlocks=[this.puntBlk1,this.puntBlk2];
    this.puntBlocks.forEach(b=>this._show(b,false));
  }

  _dot(color, label, radius, ovr) {
    const g = this.add.graphics();
    g.fillStyle(color, 1); g.fillCircle(0, 0, radius);
    // V2: glow ring alpha scales with OVR — elite players glow brighter
    const ga = ovr ? Math.min(0.9, 0.15+(ovr-60)*0.015) : 0.35;
    g.lineStyle(2, 0xffffff, ga); g.strokeCircle(0, 0, radius);
    // V2: gold outer ring for elite players (OVR 85+)
    if(ovr&&ovr>=85){ g.lineStyle(1.5,0xfbbf24,0.65); g.strokeCircle(0,0,radius+3); }
    const lbl = this.add.text(0, 0, label, { fontSize:'7px', fontFamily:'monospace', color:'#fff', fontStyle:'bold' }).setOrigin(0.5).setDepth(5);
    g._lbl = lbl; g._r = radius; g._origLabel = label;
    g.setDepth(4);
    return g;
  }

  _place(d, x, y) { d.x = x; d.y = y; if (d._lbl) { d._lbl.x = x; d._lbl.y = y; } }
  _show(d, vis)   { d.setVisible(vis); if (d._lbl) d._lbl.setVisible(vis); }
  _syncLbl(d)     { if (d._lbl) { d._lbl.x = d.x; d._lbl.y = d.y; } }
  // V12: flash ball carrier / receiver last name above their dot
  _flashCarrierName(dot, name) {
    if(!dot||!name)return;
    const t=this.add.text(dot.x,dot.y-26,name,{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#f1f5f9',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(15);
    this.tweens.add({targets:t,alpha:0,y:t.y-20,duration:900,ease:'Quad.easeOut',onComplete:()=>t?.destroy()});
  }

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
    // H1: reset play clock each snap
    if(state.possession==='team'){this._playClockMs=40000;this._playClockEl?.setColor('#94a3b8').setText('⏱ 40');}else{this._playClockEl?.setText('');}
    this._spinUsed = false; // P38: reset per play
    this._holdingRoll = false; // P48: reset per play
    this._audibleActive = this._audibleActive||null; // P45: preserve audible across presnap
    this._clearPassRush();
    this._drawLines();
    this._clearArc();
    this.recTargets.forEach(r => r?.destroy?.()); this.recTargets = [];
    // P49: clear old matchup HUD then rebuild
    this._matchupEls.forEach(e=>e?.destroy?.());this._matchupEls=[];
    this._buildMatchupHUD();
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
    // P42: save pre-play state for challenge flag
    this._savePrePlayState();
    // P45: Audible override
    if(this._audibleActive&&state.possession==='team'){const forced=this._audibleActive;this._audibleActive=null;this._audibleUsed=true;if(forced==='run')callId='run_middle';else if(forced==='pass')callId='pass_short';state.currentCall=callId;this._tdFlash('AUDIBLE CALLED','#f59e0b');}
    // P48: generate holding roll at snap for pass plays
    if(callId.startsWith('pass_')||callId==='sideline_route')this._holdingRoll=Math.random()<0.08;
    // P72: track 3rd down attempts
    if(state.down===3){this._thirdDownAtt++;this._updateThirdHUD();}
    // P71: show MOTION button for pass plays before snap
    if((callId.startsWith('pass_')||callId==='sideline_route')&&state.possession==='team'&&!this._motionActive){this._showMotionBtn(callId);return;}
    // P56: Goal line formation flash
    if(this._isGoalLine()&&state.possession==='team')this._applyGoalLineFormation();
    // P17: False start ~4% (offensive penalty, -5 yards, no play); P43: +5% AI false start in comeback mode
    const falseStartCh = 0.04; // base chance — comebackMode would increase OPPONENT's false starts, but we just log ours
    if (this.phase === 'presnap' && callId !== 'punt' && callId !== 'fg' && Math.random() < falseStartCh) {
      this.phase = 'result'; Sound.whistle();
      this._tdFlash('FALSE START — 5 yds', '#f59e0b');
      this._endPlay({ yards:-5, text:'FLAG — False Start. 5-yard penalty.', type:'penalty', turnover:false, td:false });
      return;
    }
    if      (callId === 'punt')                              this._showFakePuntOption();
    else if (callId === 'fg')                                this._showFakeFGOption();
    else if (callId.startsWith('run_') || callId === 'scramble') {
      if (callId.startsWith('run_') && state.toGo<=1 && state.yardLine>=94) {
        this._tryGoalLineSneak(()=>{ if(!this._noHuddleActive&&Math.random()<0.15)this._showTrickOption(callId);else this._startRun(callId); });
      } else if (callId.startsWith('run_') && !this._noHuddleActive && Math.random() < 0.15) {
        this._showTrickOption(callId);
      } else {
        this._startRun(callId);
      }
    }
    else if (callId === 'sideline_route')                                 this._startSidelineRoute();
    else if (callId === 'screen_pass')                                    this._startScreenPass();
    else if (callId === 'pass_action')                                    this._startPlayAction();
    else if (callId.startsWith('pass_')) {
      // P44: Hail Mary on 4th & long from deep in own territory
      if(state.down===4&&state.toGo>=15&&state.yardLine<55&&state.possession==='team'){this._showHailMaryOption(callId);}
      // P46: Red Zone Bootleg — 25% chance inside the 25
      else if(state.yardLine>=75&&(callId==='pass_short'||callId==='pass_medium')&&Math.random()<0.25){this._startBootleg(callId);}
      else if (state.yardLine <= 15 && !this._noHuddleActive) this._showFadeOption(callId);
      else this._startPass(callId);
    }
  }

  _doPunt() {
    this.phase = 'result';
    Sound.whistle();
    // P62: show wind on punt
    if(this._wind){const wt=this.add.text(this.scale.width/2,FIELD_Y-12,`WIND ${this._wind.dir} ${this._wind.mph}mph`,{fontSize:'9px',fontFamily:'monospace',color:this._wind.mph>12?'#ff6b35':'#ffd700',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(25);this.time.delayedCall(2500,()=>wt?.destroy());}
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
    // P62: wind modifier
    const _wm=this._wind;const windAccMod=_wm?(_wm.dir==='↓'?_wm.mph*0.3:_wm.dir==='↑'?-_wm.mph*0.5:-_wm.mph*0.8):0;
    if(_wm){const wt=this.add.text(this.scale.width/2,FIELD_Y-12,`WIND ${_wm.dir} ${_wm.mph}mph`,{fontSize:'9px',fontFamily:'monospace',color:_wm.mph>12?'#ff6b35':'#ffd700',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(25);this.time.delayedCall(2200,()=>wt?.destroy());}
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
    const made = Math.random() < Math.max(0.08, Math.min(0.96, 1.08 - dist*0.013 + windAccMod/100));
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
    // V12: flash runner name at handoff
    this._flashCarrierName(this.runner, pData.name?.split(' ').pop()||(isScramble?'QB':'RB'));

    if (isDraw) {
      this.phase = 'run_draw_fake';
      this.tweens.add({ targets: this.qb, x: this.qb.x - 10, duration: 260, yoyo: true,
        onUpdate: () => this._syncLbl(this.qb),
        onComplete: () => { if (this.phase === 'run_draw_fake') this.phase = 'run'; }
      });
    } else {
      this.phase = 'run';
    }

    // G7: OL surge animation — linemen burst forward at snap
    this.oLine.forEach(ol=>{ if(!ol.visible)return; this.tweens.add({targets:ol,x:ol.x+18,duration:180,ease:'Quad.easeOut',yoyo:true,onUpdate:()=>this._syncLbl(ol)}); });
    this._startOLBlocker();

    const dc = state.opponent?.dcScheme || '4-3';
    const rushers = [this.dl, this.lb];
    if (dc === '3-4' || dc === 'Zone Blitz') rushers.push(this.lb2);
    this._aiRushers(rushers);
    if (isOutside) this._aiCBsSupport();

    Sound.whistle();
    this.events.emit('phaseChange', 'run');
    // P75: Scramble Slide option inside own 20
    if(isScramble && state.yardLine<=20){ this.time.delayedCall(200,()=>this._showSlideOption()); }
    // P76: Red Zone Run Option inside opp 20
    if(!isScramble && state.yardLine>=80){ this.time.delayedCall(200,()=>this._showRZRunChoice()); }
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
    // V3: clear speed trail on tackle
    this._trailPts=[]; this._trailGfx?.clear();
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
    const rb = (state.team?.players || []).find(p => p.pos === runnerPos) || { str: 70, id: runnerPos.toLowerCase()+'1' };
    // P55: apply fatigue to runner
    if (rb.id) this._applyFatigue(rb.id, runnerPos === 'QB' ? 12 : 8);
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
    this._piChecked = false; // P69: reset PI flag each play
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
    // P54: Show QB reads overlay before receivers are clickable
    if (state.possession === 'team') { this._qbReadsActive = true; this._showQBReads(); }
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
    // G3: visual pressure bar — fills over rush duration, color shifts red when critical
    const _pbX=FIELD_RIGHT+12, _pbDur=3600+rushDelay, _pbObj={pct:0};
    const _pbBg=this.add.rectangle(_pbX,FIELD_Y+FIELD_H/2,8,FIELD_H,0x1e293b,0.7).setDepth(11);
    const _pbGfx=this.add.graphics().setDepth(12);
    const _pbLbl=this.add.text(_pbX,FIELD_Y-11,'⚡',{fontSize:'8px',fontFamily:'monospace',color:'#ef4444'}).setOrigin(0.5).setDepth(12);
    this._pressureBar={bg:_pbBg,gfx:_pbGfx,lbl:_pbLbl};
    this.tweens.add({targets:_pbObj,pct:1,duration:_pbDur,ease:'Sine.easeIn',
      onUpdate:()=>{if(!_pbGfx.scene)return;const h=Math.round(FIELD_H*_pbObj.pct);_pbGfx.clear();_pbGfx.fillStyle(_pbObj.pct>0.8?0xef4444:_pbObj.pct>0.5?0xf97316:0xf59e0b,0.82);_pbGfx.fillRect(_pbX-4,FIELD_Y+FIELD_H-h,8,h);},
      onComplete:()=>{},
    });
  }

  _clearPassRush() {
    this._passRushActive = false;
    this._pocketBeaten = [false, false, false, false, false];
    this.pressureTxt?.destroy(); this.pressureTxt = null;
    this._spinBtn?.destroy(); this._spinBtn = null; this._spinBtnTxt?.destroy(); this._spinBtnTxt = null;
    // G3: destroy pressure bar
    this._pressureBar?.bg?.destroy(); this._pressureBar?.gfx?.destroy(); this._pressureBar?.lbl?.destroy(); this._pressureBar = null;
  }

  // P38: QB Scramble Spin Move — show SPIN button when DL within 40px during pass_wait
  _checkSpinButton() {
    if (this._spinUsed || this.phase !== 'pass_wait') return;
    const dist = Math.hypot(this.dl.x - this.qb.x, this.dl.y - this.qb.y);
    if (dist < 40 && !this._spinBtn) {
      const W = this.scale.width;
      this._spinBtn = this.add.rectangle(W/2, FIELD_Y + FIELD_H + 22, 80, 26, 0xf97316).setDepth(21).setInteractive({useHandCursor:true});
      this._spinBtnTxt = this.add.text(W/2, FIELD_Y + FIELD_H + 22, '🌀 SPIN', {fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(22);
      this._spinBtn.once('pointerdown', () => this._doSpin());
    } else if (dist >= 40 && this._spinBtn) {
      this._spinBtn?.destroy(); this._spinBtn = null;
      this._spinBtnTxt?.destroy(); this._spinBtnTxt = null;
    }
  }

  _doSpin() {
    if (this._spinUsed || this.phase !== 'pass_wait') return;
    this._spinUsed = true;
    this._spinBtn?.destroy(); this._spinBtn = null;
    this._spinBtnTxt?.destroy(); this._spinBtnTxt = null;
    const success = Math.random() < 0.70;
    if (success) {
      this._tdFlash('SPIN MOVE! 🌀', '#3b82f6');
      // Push DL away from QB
      const dx = this.qb.x - this.dl.x, dy = this.qb.y - this.dl.y, dist = Math.hypot(dx, dy);
      if (dist > 0) this.tweens.add({ targets: this.dl, x: this.dl.x - (dx/dist)*55, y: this.dl.y - (dy/dist)*55, duration: 400, onUpdate: () => this._syncLbl(this.dl) });
      // Buy extra 1.2s of pocket time — delay all beatenMs by re-clearing pocket
      this._pocketBeaten = [false, false, false, false, false];
      this.time.delayedCall(1200, () => { if (this.phase === 'pass_wait') this._pocketBeaten = [true, true, true, true, true]; });
    } else {
      this._tdFlash('SPIN MISSED! 💨', '#ef4444');
      // DL breaks through faster
      this.time.delayedCall(200, () => { if (this.phase === 'pass_wait') this._sack(); });
    }
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
    // QB injury on sack (~5% existing + P52: 4% shake-up)
    if (Math.random() < 0.05) {
      const qb = (state.team?.players || []).find(p => p.pos === 'QB');
      if (qb && !(state.injuries || []).find(x => x.id === qb.id)) {
        if (!state.injuries) state.injuries = [];
        state.injuries.push({ id: qb.id, pos: 'QB', weeks: Math.floor(Math.random() * 3) + 1 });
        this._tdFlash(`${qb.name.split(' ').pop()} INJURED`, '#ef4444');
      }
    }
    // P52: QB shaken up — 4% chance, affects comp %
    if (!this._qbInjured && Math.random() < 0.04) {
      this._qbInjured = true;
      this._tdFlash('⚠️ QB SHAKEN UP', '#f97316');
      this.time.delayedCall(1500, () => {
        if (this._qbInjEl) { this._qbInjEl.destroy(); this._qbInjEl = null; }
        this._qbInjEl = this.add.text(this.qb.x, this.qb.y - 28, 'QB ⚠️',
          {fontSize:'8px',fontFamily:'monospace',color:'#f97316',stroke:'#000',strokeThickness:1}).setDepth(18);
      });
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
    // P65: show route tree selector
    if(state.possession==='team') this.time.delayedCall(100,()=>this._showRouteTree());
    // P67: mark checkdown window open for 0.5s after receivers appear
    this._checkdownActive=true;
    this.time.delayedCall(500,()=>{this._checkdownActive=false;});
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
      // P71: motion pre-snap reduces coverage 8% on WR1 (index 0)
      const motionCovBonus = (this._motionActive && i===0) ? 8 : 0;
      const rzCov = state.yardLine >= 80 ? 0.18 : 0;
      const isOpen = (p.spd||80)+actBonus+motionCovBonus > (cbOvr+(isZone?-5:0))*0.94 && Math.random() < 0.54+((p.spd||80)+actBonus+motionCovBonus-cbOvr)/200 - rzCov;
      const zone = this.add.circle(dot.x, dot.y, 20, isOpen?0x22c55e:0xef4444, 0.32)
        .setDepth(8).setInteractive({ useHandCursor:true });
      const icon   = this.add.text(dot.x, dot.y-28, isOpen?'🟢':'🔴', {fontSize:'14px'}).setOrigin(0.5).setDepth(9);
      const nmTxt  = this.add.text(dot.x, dot.y+22, p.name||p.pos, {fontSize:'7px',fontFamily:'monospace',color:'#fff'}).setOrigin(0.5).setDepth(9);
      zone.on('pointerdown', ()=>{ if(this.phase!=='pass_wait') return; this._lastReceiver=p; this._flashCarrierName(dot,p.name?.split(' ').pop()||p.pos); this._throwTo(dot, isOpen); });
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
    // P67: QB Checkdown Under Pressure — if thrown within 0.5s of receivers appearing, guarantee short gain
    if(this._checkdownActive){
      this._checkdownActive=false;
      this.phase='result';
      const cdYds=Phaser.Math.Between(1,6);
      this._clearPassRush();
      this.recTargets?.forEach(r=>r?.destroy?.());this.recTargets=[];
      this.pressureTxt?.destroy();
      Sound.whistle?.();
      this._tdFlash('CHECKDOWN! +'+cdYds,'#22c55e');
      this._endPlay({yards:cdYds,text:'QB checkdown under pressure — '+cdYds+' yards',type:'pass',turnover:false,td:state.yardLine+cdYds>=100});
      return;
    }
    this.phase = 'pass_flight';
    this._clearPassRush();
    this.recTargets.forEach(r=>r?.destroy?.()); this.recTargets=[];
    this.pressureTxt?.destroy();
    const qteBonus = isOpen ? 1.18+Math.random()*0.18 : 0.38+Math.random()*0.14;
    const sx=this.ball.x, sy=this.ball.y, ex=receiverDot.x, ey=receiverDot.y;
    // E3: wind drift on deep passes (cross-wind shifts y-landing)
    const _wdY=(this.passVariant==='deep'&&this._wind&&this._wind.mph>8)?((this._wind.dir==='↑'?-1:this._wind.dir==='↓'?1:0)*(this._wind.mph-8)*1.4):0;
    const eyW=ey+_wdY;
    const peakY = Math.min(sy,eyW)-38;
    let t=0; const dur=380;
    const arc = this.time.addEvent({ delay:16, loop:true, callback:()=>{
      t+=16/dur; if(t>1){arc.remove();this._clearArc();return;}
      const bx=Phaser.Math.Linear(sx,ex,t), by=(1-t)*(1-t)*sy+2*(1-t)*t*peakY+t*t*eyW;
      this.ball.x=bx; this.ball.y=by;
      this.arcGfx.clear(); this.arcGfx.lineStyle(1,0xfbbf24,0.5); this.arcGfx.lineBetween(sx,sy,bx,by);
    }});
    // G4: jump ball LEAP button for deep passes — uses WR jmp attribute
    if(this.passVariant==='deep'&&state.possession==='team'){
      const _wrData=(state.team?.players||[]).find(p=>p.pos==='WR');
      const _jmpEl=[]; const _jW=this.scale.width;
      const _jBg=this.add.rectangle(_jW/2,FIELD_Y+FIELD_H+24,92,24,0x7c3aed,1).setDepth(23).setInteractive({useHandCursor:true});
      const _jTx=this.add.text(_jW/2,FIELD_Y+FIELD_H+24,'🤸 LEAP!',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(24);
      _jmpEl.push(_jBg,_jTx);
      const _jClean=()=>_jmpEl.forEach(e=>{try{e.destroy();}catch{}});
      _jBg.once('pointerdown',()=>{this._jmpBonus=((_wrData?.jmp||70)-65)*0.008+0.14;_jClean();this._tdFlash('🤸 LEAP!','#a78bfa');});
      this.time.delayedCall(dur+40,()=>_jClean());
    }
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
        // P55: fatigue multiplier on runner speed
        const runner = call==='scramble' ? qb : rb;
        const fatMul = this._getFatigueMultiplier(runner.id);
        // P56: Goal line package — short yardage calculation
        let base;
        if (this._isGoalLine()) {
          base = Math.floor(Math.random() * 3); // 0, 1, or 2 yards
          if ((rb.str || 70) > 75 && Math.random() < 0.35) base = Math.min(2, base + 1);
        } else {
          // Base 2–5 yards; speed differential adds 0–3 more
          base = 2 + ((rb.spd - 70) * 0.10 * fatMul) + Phaser.Math.Between(-1, 5);
        }
        yards = Math.round(base * qteBonus);
      } else if (isPass) {
        const variant = call.replace('pass_','');
        const isDeep = variant==='deep' || variant==='action';
        let intCh  = isDeep ? 0.11 : 0.04;
        const wxPassM = state.weather==='snow'?0.80:state.weather==='rain'?0.86:1;
        // P41: momentum bonus to completion; P43: comeback mode +5% WR speed approximated as +3% comp
        const momBonus=(this._momentum-50)*0.0008;
        const cbBonus=this._comebackMode?0.03:0;
        // P49: matchup advantage on comp%; P52: QB shaken up -8%
        const matchupBonus=(((this._matchupWR1||75)-(db.ovr||75))*0.0008);
        const qbInjPenalty=this._qbInjured?-0.08:0;
        // P55: defensive formation coverage/sack bonus
        const defForm = DEF_FORMATIONS[this._defFormation] || DEF_FORMATIONS['4-3'];
        intCh = Math.max(0.01, intCh - defForm.coverageBonus * 0.5);
        let compCh = clamp((0.56+(qb.ovr-50)*0.004-(db.ovr-60)*0.002+momBonus+cbBonus+matchupBonus+qbInjPenalty-defForm.coverageBonus+_hurryPenalty)*wxPassM, 0.22, 0.88);
        // P64: Hurry-up -5% comp penalty
        const _hurryPenalty = this._hurryUpActive ? -0.05 : 0;
        this._hurryUpActive = false;
        // P71: motion pre-snap +10% comp on one route
        if(this._motionUsed){compCh=Math.min(0.92,compCh+0.10);this._motionUsed=false;}
        // P54: QB reads modifier
        const qbRead = this._qbReadChoice || 'primary';
        if (qbRead === 'checkdown') { compCh = Math.min(0.92, compCh + 0.15); }
        else if (qbRead === 'go_route') { compCh = Math.max(0.10, compCh - 0.20); }
        // P54: expanded audible hot-route bonus
        const audibleRoute = this._activeAudible ? AUDIBLE_ROUTES[this._activeAudible] : null;
        if (audibleRoute) { compCh = clamp(compCh + audibleRoute.passBonus, 0.10, 0.92); }
        // B4: QB personality modifiers — 'clutch' +8% in Q4; 'money' -8% when fatigued
        const _qbPerso=qb.personality;
        if(_qbPerso==='clutch'&&state.quarter>=4)compCh=Math.min(0.92,compCh+0.08);
        if(_qbPerso==='money'&&(this._fatigue[qb.id]||0)>70)compCh=Math.max(0.10,compCh-0.08);
        // B3: crowd noise home field — -5% comp for opponent when crowd upgrade active
        if(this._crowdNoise&&state.possession!=='team')compCh=Math.max(0.05,compCh-0.05);
        // G4: jump ball — tap LEAP on a covered deep pass to boost completion via WR jmp
        if(this._jmpBonus){if(type==='covered'&&Math.random()<this._jmpBonus){type='complete';qteBonus=Math.max(qteBonus,0.85);}this._jmpBonus=0;}
        if (type==='covered' && Math.random()<intCh*2) {
          Sound.int(); state.stats.team.int++;
          this._track(qb.id,'int',1);
          this._endPlay({ yards:0, text:'INTERCEPTED! Turnover.', type:'int', turnover:true, td:false }); return;
        }
        if (Math.random() > compCh*qteBonus) {
          // P69: Pass interference — 12% on deep incomplete, 4% otherwise; _piChecked prevents double-flag
          const piCh = (isDeep&&!this._piChecked) ? 0.12 : 0.04;
          this._piChecked = true;
          if (Math.random() < piCh) {
            Sound.whistle(); this._tdFlash('PASS INTERFERENCE! +15 yds', '#f59e0b');
            this._track(qb.id,'att',1);
            const piYards = 15;
            this._endPlay({ yards:piYards, text:`FLAG — Pass Interference! +${piYards} yds, Auto 1st down.`, type:'penalty', turnover:false, td:state.yardLine+piYards>=100 }); return;
          }
          Sound.incomplete(); this._track(qb.id,'att',1);
          this._endPlay({ yards:0, text:'Incomplete.', type:'inc', turnover:false, td:false }); return;
        }
        let base = isDeep ? Phaser.Math.Between(14,36) : variant==='quick' ? Phaser.Math.Between(3,8) : Phaser.Math.Between(6,15);
        // P54: audible route overrides base yards
        if (audibleRoute) { base = audibleRoute.yardsBase + Phaser.Math.Between(-2, 4); this._activeAudible = null; }
        // P54: QB read modifies yards
        if (qbRead === 'checkdown') base = Math.round(base * 0.6);
        else if (qbRead === 'go_route') base = Math.round(base * 1.8);
        this._qbReadChoice = 'primary'; // reset
        // P65: Route tree choice modifiers
        if(this._routeTreeChoice){
          compCh=clamp(compCh+this._routeTreeChoice.compMod,0.08,0.94);
          base=Math.round(base*this._routeTreeChoice.yardMod);
          this._routeTreeChoice=null;
        }
        yards = Math.round(base * qteBonus);
      }
    }

    // P17: Holding on run plays (~3% if gain > 3 yards)
    if (isRun && (yards||0) > 3 && Math.random() < 0.03) {
      Sound.whistle(); this._tdFlash('HOLDING — 10 yds back', '#f59e0b');
      yards = Math.max(-10, (yards||0) - 10);
    }
    // P51: Offensive Holding — 6% on runs >6 yards, -10 yards, repeat down
    if (isRun && (yards||0) > 6 && Math.random() < 0.06) {
      Sound.whistle();
      const flagGfx=this.add.rectangle(this.scale.width/2,FIELD_Y+FIELD_H/2,10,34,0xfde047,1).setDepth(30);
      this.time.delayedCall(1400,()=>flagGfx?.destroy());
      this._tdFlash('🚩 OFF HOLDING — -10 yds, repeat down','#fde047');
      // Repeat down: undo down increment later via modified result
      this._p51Hold=true;
      yards=(yards||0)-10;
    }
    const td = state.yardLine + (yards||0) >= 100;
    if (td)                      { Sound.td();        this._tdFlash('TOUCHDOWN! 🏈','#f59e0b'); state.stats.team.td++; }
    else if (yards >= state.toGo){ Sound.firstDown(); }
    else if (!td && yards <= 0)  { Sound.tackle(); }

    if (isRun) {
      state.stats.team.rushYds += Math.max(0, yards);
      const runner = call==='scramble' ? qb : rb;
      this._track(runner.id,'rushYds',Math.max(0,yards)); this._track(runner.id,'rushAtt',1);
      if (td) this._track(runner.id,'rushTD',1);
    }
    if (isPass) {
      state.stats.team.passYds += Math.max(0, yards);
      this._track(qb.id,'passYds',Math.max(0,yards)); this._track(qb.id,'att',1); this._track(qb.id,'comp',1);
      if (this._lastReceiver) {
        this._track(this._lastReceiver.id,'recYds',Math.max(0,yards));
        this._track(this._lastReceiver.id,'rec',1);
        if (td) { this._track(this._lastReceiver.id,'recTD',1); this._track(qb.id,'passTD',1); }
        // GO2: track POTG
        if(yards>0&&(!state.bestPlay||yards>(state.bestPlay.yards||0))){state.bestPlay={name:this._lastReceiver.name?.split(' ').pop()||this._lastReceiver.pos,yards,type:td?'REC TD':'REC'};}
      }
      this._lastReceiver = null;
    }
    // GO2: track POTG for runs
    if(isRun&&yards>0&&(!state.bestPlay||yards>(state.bestPlay.yards||0))){const _bpr=call==='scramble'?qb:rb;state.bestPlay={name:_bpr.name?.split(' ').pop()||'RB',yards,type:td?'RUSH TD':'RUSH'};}

    // P72: track 3rd down conversions
    if(state.down===3&&yards>=(state.toGo||10)){this._thirdDownConv++;this._updateThirdHUD();}
    // P41: update momentum on play result
    if(td) this._updateMomentum(15);
    else if(yards>=(state.toGo||10)) this._updateMomentum(8);
    else if(yards>0) this._updateMomentum(3);
    else this._updateMomentum(-6);
    // P72: momentum boost if 3rd down rate >=50% with >= 4 attempts
    if(this._thirdDownAtt>=4&&this._thirdDownConv/this._thirdDownAtt>=0.50){this._updateMomentum(20);this._thirdDownAtt=0;this._thirdDownConv=0;this._updateThirdHUD();}
    // P43: check comeback mode each play
    this._checkComebackMode();
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
    // P48: Defensive Holding check — on pass plays, incomplete or short gain
    if(this._holdingRoll&&state.possession==='team'&&(state.currentCall||'').startsWith('pass_')&&!result.td&&!result.turnover){
      const gain=result.yards||0;
      if(gain<8){
        const flagGfx=this.add.rectangle(this.scale.width/2,FIELD_Y+FIELD_H/2-40,8,30,0xfde047,1).setDepth(30);
        this.time.delayedCall(1200,()=>flagGfx?.destroy());
        this._tdFlash('🚩 DEF HOLDING — 5yds / Auto 1st','#fde047');
        result={...result,yards:(gain||0)+5,text:'🚩 DEFENSIVE HOLDING — 5 yds, Auto First Down',type:'penalty',turnover:false,td:false};
        state.toGo=10; // auto first down applied via result yards in endPlay flow
      }
    }
    this._holdingRoll=false;
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
      // P51: offensive holding — repeat the down (undo the increment)
      if(this._p51Hold){this._p51Hold=false;state.down=Math.max(1,state.down-1);state.toGo=Math.min(state.toGo+10,40);}
      if (state.down > 4) { driveEnd='DOWNS'; state.possession='opp'; state.yardLine=Math.max(5,100-state.yardLine); state.down=1; state.toGo=10; }
    }
    if (driveEnd) { state.drives.push({...state.currentDrive, result:driveEnd}); state.currentDrive={poss:state.possession,plays:0,yards:0,start:state.yardLine}; }
    state.plays++;
    if (state.plays%8===0) { state.quarter=Math.min(4,state.quarter+1); this._recoverFatigue(); }
    // P41: momentum drain on turnover
    if(result.turnover) this._updateMomentum(-12);
    this.events.emit('playResult', result);
    const hud = this.scene.get('Hud');
    hud?.events?.emit('playResult', result);
    hud?.events?.emit('possessionChange', state.possession);
    // P42: offer challenge on turnovers (INT/fumble) if not yet used
    if(!this._challengeUsed && result.turnover && (result.type==='int'||result.type==='fumble')) {
      this.time.delayedCall(600, ()=>this._showChallengeOption());
    }
    // P77: Penalty flag — 3% chance on AI plays, show Accept/Decline
    if(state.possession==='opp'&&!result.td&&!result.turnover&&Math.random()<0.03){
      this.time.delayedCall(400,()=>this._showPenaltyChoice('OFFENSIVE HOLDING',10,'team'));
      return;
    }
    this._afterPlay();
  }

  _afterPlay() {
    if (!state._halfShown && state.quarter>=3 && !this._pendingPAT) { state._halfShown=true; this.time.delayedCall(1600,()=>this._showHalftime()); return; }
    if (state.quarter>4 || state.plays>=40) {
      // P60: overtime on tie
      if (!this._isOT && state.score.team===state.score.opp) { this.time.delayedCall(1600,()=>this._showOTCoinFlip()); }
      else { this.time.delayedCall(1600, ()=>this.scene.start('GameOver')); }
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
        // P64: Hurry-Up offer after incomplete pass
        if(state.lastResult?.type==='inc'&&state.possession==='team'){
          this.time.delayedCall(200,()=>this._showHurryUp());
        }
        // P68: Red Zone Fade button on 3rd/4th & 5+ inside 25
        if(state.possession==='team'&&state.yardLine>=75&&state.down>=3&&state.toGo>=5){
          this.time.delayedCall(300,()=>this._showFadeRoute());
        }
        // P53: clock management takes priority in Q4 comeback even over drill mode
        const _q4Comeback = state.quarter>=4 && (state.score.opp-state.score.team)>=1 && (state.score.opp-state.score.team)<=8 && (state.lastResult?.type==='run'||state.lastResult?.type==='inc');
        if (_q4Comeback) {
          this._showClockMgmt(state.lastResult?.type==='inc'?'spike':'oob');
        // P30: two-minute drill — auto no-huddle
        } else if (state._drillMode) {
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
    mkBtn(W/2+90,H/2+14,'GO FOR 2','+2 pts  •  RUN / PASS',0x3b82f6,()=>this._showTwoPointChoice());
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
    // P43: comeback mode — AI gets +5% false start chance
    if(this._comebackMode && Math.random()<0.05){
      const W=this.scale.width;
      const fsT=this.add.text(W/2,FIELD_Y+30,'⚠️ AI FALSE START — 5 yards!',{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(20);
      this.time.delayedCall(1400,()=>{fsT?.destroy();});
      state.yardLine=Math.max(1,state.yardLine+5);
      this._drawLines();
    }
    const call = this._defCall || 'cover2';
    if (call === 'man')          { this._defSpd *= 1.22; this._aiRunSpeed *= 1.06; }
    else if (call === 'blitz')   { this._aiRunSpeed *= 1.12; this._launchBlitzPursuer(); }
    else if (call === 'prevent') { this._aiRunSpeed *= 0.84; this._defSpd *= 0.88; }
    // P25: hurry-up overrides pass chance and speeds up AI RB
    const passCh = this._aiHurryUp ? 0.65 : ({cover2:0.35, man:0.45, blitz:0.55, prevent:0.20}[call] || 0.35);
    if (this._aiHurryUp) { this._aiRunSpeed *= 1.08; }
    if (Math.random() < passCh) { this._startAIPass(); return; }
    this.phase = 'ai_run';
    this._stackItBonus = false;
    const hud = this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange', 'opp');
    Sound.whistle();
    // P63: show defensive run stop button
    this.time.delayedCall(300,()=>this._showDefRunStop());
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
    // P66: Rush Lane choice
    this._rushLaneBonus = null;
    this.time.delayedCall(100,()=>this._showRushLane());
    // P74: Bump Coverage
    this.time.delayedCall(120,()=>this._showBumpCoverage());
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
    // P66: apply rush lane sack bonus
    const _rlSackBonus = this._rushLaneBonus?.sackCh||0;
    const _rlCovBonus = this._rushLaneBonus?.covCh||0;
    this._rushLaneBonus=null;
    if (dist < 22 || (dist < 40 && _rlSackBonus>0 && Math.random()<_rlSackBonus)) {
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
      // P36: Pick-six return mini-game
      this._launchPickSixReturn(rec.dot);
      return;
    }
    const wrD=(state.opponent?.players||[]).find(p=>p.pos==='WR')||{ovr:78};
    const cbD=(state.team?.players||[]).find(p=>['CB','S'].includes(p.pos))||{ovr:75};
    const bonus=call==='blitz'?0.12:call==='prevent'?-0.06:0;
    const wxCatchM=state.weather==='snow'?0.80:state.weather==='rain'?0.86:1;
    // P70: apply hurry-up defense modifier (positive = prevent D, negative = aggressive D)
    const hurryMod=this._hurryUpDef||0;
    const catchCh=Math.min(0.88,Math.max(0.22,(0.58+(wrD.ovr-cbD.ovr)*0.007+bonus+hurryMod)*wxCatchM));
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
    const cleanup = () => { els.forEach(e => e?.destroy?.()); this._clearDefFormSelector(); };
    els.push(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.88).setDepth(35));
    els.push(this.add.rectangle(px, py, panelW, panelH, 0x0d1424, 1).setDepth(36).setStrokeStyle(1, 0x334155));
    els.push(this.add.text(px, py - panelH/2 + 14, '🛡  CALL YOUR DEFENSE', {
      fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#f1f5f9', letterSpacing:2
    }).setOrigin(0.5, 0).setDepth(37));
    els.push(this.add.text(px, py - panelH/2 + 30, `OPP BALL  •  yd ${Math.max(1, 100 - state.yardLine)}`, {
      fontSize:'10px', fontFamily:'monospace', color:'#64748b'
    }).setOrigin(0.5, 0).setDepth(37));
    // P55: Show def formation selector alongside coverage call
    this._showDefFormationSelector();
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
      // P70: Hurry-Up Defense — Q4, score within 8
      const diff=Math.abs((state.score.team||0)-(state.score.opp||0));
      if(state.quarter>=4&&diff<=8){this.time.delayedCall(600,()=>this._showHurryUpDefense());}
      else{this.time.delayedCall(2400, ()=>this._startKickoffReturn());}
    }
  }

  // ─── P36: PICK-SIX RETURN ────────────────────────────────────────────────

  _launchPickSixReturn(intDot) {
    const cy = FIELD_Y + FIELD_H / 2;
    const W = this.scale.width;
    [...this.offPlayers, ...this.defPlayers].forEach(d => this._show(d, false));
    // DB runs from interception spot toward opponent endzone (left side)
    const dbData = state.team?.players?.find(p=>['CB','S'].includes(p.pos)) || {spd:82};
    this._pickSixDot = this.lb;
    this._place(this.lb, intDot.x, intDot.y);
    this.lb._lbl?.setText('DB');
    this._show(this.lb, true);
    this._pickSixSpd = pxs(dbData.spd, 78, 0.95);
    // AI tackler (QB) chases from behind
    this._show(this.dl, true);
    this._place(this.dl, intDot.x + 60, cy + Phaser.Math.Between(-30, 30));
    this.dl._lbl?.setText('QB');
    this._pickSixTackler = this.dl;
    this._pickSixTacklerSpd = pxs(72, 55, 0.7);
    this.ball.x = this.lb.x; this.ball.y = this.lb.y;
    this.phase = 'pick_six_return';
    const banner = this.add.text(W/2, FIELD_Y - 20, '🏈 PICK-SIX! RUN IT BACK! WASD', {
      fontSize:'13px', fontFamily:'monospace', fontStyle:'bold', color:'#22c55e', stroke:'#000', strokeThickness:3
    }).setOrigin(0.5).setDepth(20);
    this.time.delayedCall(5000, () => { if (this.phase === 'pick_six_return') this._resolvePickSixReturn(false); banner?.destroy(); });
    const hud = this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','team');
    this.events.emit('phaseChange','pick_six_return');
  }

  _resolvePickSixReturn(scoredTD) {
    if (this.phase !== 'pick_six_return') return;
    this.phase = 'result';
    this._show(this.lb, false); this._show(this.dl, false);
    if (scoredTD) {
      Sound.td(); state.score.team += 6; state.stats.team.td++;
      this._tdFlash('PICK SIX! 🏈 +6', '#22c55e');
      state.possession='team'; state.yardLine=25; state.down=1; state.toGo=10;
      const result = {text:'PICK SIX! DB returns INT for TD!',td:true,yards:0,turnover:false};
      this.events.emit('playResult',result);
      const hud=this.scene.get('Hud');
      hud?.events?.emit('playResult',result); hud?.events?.emit('possessionChange','team');
      this.time.delayedCall(2200,()=>this._showPATChoice());
    } else {
      // Tackled — DB tackled during return, team gets ball at current position
      const returnYd = Math.max(0, Math.round((yardToX(state.yardLine) - this.lb.x) / YARD_W));
      const newYard = Math.min(99, state.yardLine + returnYd);
      state.possession='team'; state.yardLine=newYard; state.down=1; state.toGo=10;
      const result={text:`INT return! ${returnYd} yards. Team ball at yd ${newYard}.`,yards:returnYd,td:false,turnover:false};
      this.events.emit('playResult',result);
      const hud=this.scene.get('Hud');
      hud?.events?.emit('playResult',result); hud?.events?.emit('possessionChange','team');
      this.time.delayedCall(1800,()=>{ this._resetFormation(); this._drawLines(); hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','team'); this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall'); });
    }
  }

  _resolveAIPlay(yardsGiven) {
    state.stats.opp.rushYds += yardsGiven;
    state.yardLine = Math.max(1, state.yardLine - yardsGiven);
    this._aiDrivePlays = (this._aiDrivePlays||0) + 1;
    this._aiDriveYards = (this._aiDriveYards||0) + yardsGiven;
    if (yardsGiven >= this.aiToGo) { this.aiDown=1; this.aiToGo=10; Sound.firstDown(); }
    else { this.aiDown++; this.aiToGo=Math.max(1,this.aiToGo-yardsGiven); }
    // P59: AI punts from outside FG range on 4th down
    if (this.aiDown===4 && state.yardLine>42 && state.possession==='opp') {
      state.plays++;if(state.plays%8===0)state.quarter=Math.min(4,state.quarter+1);
      state.drives.push({poss:'opp',plays:this._aiDrivePlays,yards:this._aiDriveYards,start:this._aiDriveStart||25,result:'PUNT'});
      this._aiDrivePlays=0;this._aiDriveYards=0;
      const rp={text:'AI punts — choose your return!',yards:yardsGiven,td:false,turnover:false};
      this.events.emit('playResult',rp);const hudp=this.scene.get('Hud');hudp?.events?.emit('playResult',rp);
      this.time.delayedCall(1200,()=>this._showAIPuntDecision());
      return;
    }
    // P50: AI 4th down — if in FG range show block option, else turnover on downs
    if (this.aiDown===4 && state.yardLine<=42 && state.possession==='opp') {
      state.plays++;
      if(state.plays%8===0)state.quarter=Math.min(4,state.quarter+1);
      const r4={text:`AI goes for FG from ${state.yardLine} yd`,yards:yardsGiven,td:false,turnover:false};
      this.events.emit('playResult',r4);const hud4=this.scene.get('Hud');
      hud4?.events?.emit('playResult',r4);
      this.time.delayedCall(1000,()=>this._showAIFGBlock());
      return;
    }
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
    // P52: QB recovers at halftime
    this._qbInjured=false;
    if(this._qbInjEl){this._qbInjEl.destroy();this._qbInjEl=null;}
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
    // P78: quarter-aware label
    const qLbl=state.quarter<=2?'HALF':'GAME';
    const bg=this.add.rectangle(W/2,H/2-60,W,52,0x1e293b,0.94).setDepth(62);
    const t=this.add.text(W/2,H/2-60,`⏱ TWO-MINUTE WARNING — ${qLbl}`,{fontSize:'14px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(63);
    // P78: free clock save button
    const toBtn=this.add.rectangle(W/2,H/2-32,160,22,0x0ea5e9,1).setDepth(64).setInteractive({useHandCursor:true});
    const toTxt=this.add.text(W/2,H/2-32,'⏰ FREE TIMEOUT — SAVE CLOCK',{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(65);
    let saved=false;
    toBtn.once('pointerdown',()=>{saved=true;this._tdFlash('⏰ TIMEOUT SAVED — CLOCK STOPPED','#0ea5e9');toBtn.destroy();toTxt.destroy();});
    Sound.whistle();
    this.time.delayedCall(2800,()=>{
      if(!saved){toBtn.destroy();toTxt.destroy();}
      this.tweens.add({targets:[bg,t],alpha:0,duration:400,onComplete:()=>{bg.destroy();t.destroy();state._drillMode=true;cb();}});
    });
  }

  // User returns kickoff (game start or after AI TD)
  _startKickoffReturn() {
    this._audibleUsed=false; this._audibleActive=null; // P45: reset audible on new possession
    // P54: reset expanded audible state on new drive
    this._audibleMenuShown=false; this._activeAudible=null;
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
    els.push(this.add.text(W/2,H/2-70,'KICKOFF STRATEGY',{fontSize:'20px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    const mkBtn=(cx,cy,label,sub,hx,cb)=>{
      const b=this.add.rectangle(cx,cy,160,60,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const lbl=this.add.text(cx,cy-10,label,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);
      const s=this.add.text(cx,cy+10,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,lbl,s);
    };
    // P47: Squib kick option
    mkBtn(W/2-165,H/2+10,'KICK DEEP','Normal kickoff',0x22c55e,()=>this._startKickoffCover());
    mkBtn(W/2,H/2+10,'SQUIB KICK','Opp ball at 30',0x64748b,()=>this._doSquibKick());
    mkBtn(W/2+165,H/2+10,'ONSIDE','~15% recovery',0xf59e0b,()=>this._resolveOnsideKick());
    // P47: auto-dismiss to deep kick after 3s
    let rem=3000;const cdEl=this.add.text(W/2,H/2+56,'Auto: 3s',{fontSize:'9px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);els.push(cdEl);
    const tick=()=>{rem-=200;if(rem<=0){cleanup();this._startKickoffCover();return;}cdEl.setText('Auto: '+(rem/1000).toFixed(1)+'s');this._squibKickTimer=setTimeout(tick,200);};
    this._squibKickTimer=setTimeout(tick,200);
    cleanup._orig=()=>{clearTimeout(this._squibKickTimer);els.forEach(e=>e?.destroy?.());};
  }

  // P47: Squib kick resolution
  _doSquibKick() {
    clearTimeout(this._squibKickTimer);
    if(this._squibEls)this._squibEls.forEach(e=>e?.destroy?.());
    state.possession='opp'; state.yardLine=30; state.down=1; state.toGo=10;
    this._tdFlash('SQUIB — Opp ball at 30','#64748b');
    this.time.delayedCall(1800,()=>{
      if(state.quarter>4||state.plays>=40){this.scene.start('GameOver');return;}
      this._startAIDrive();
    });
  }

  // P21: Resolve onside kick attempt — P37 enhanced with rapid-tap mechanic
  _resolveOnsideKick() {
    const W = this.scale.width, H = this.scale.height;
    const stOvr = state.team?.players?.filter(p=>p.pos==='K').reduce((s,p,_,a)=>s+p.ovr/a.length,0)||70;
    const baseRecoverCh = Math.min(0.28, 0.10 + (stOvr-60)*0.002);
    let taps = 0; const els = [];
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'ONSIDE KICK! TAP FAST!',{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    const ctr = this.add.text(W/2,H/2-28,'0 / 3 taps to recover',{fontSize:'12px',fontFamily:'monospace',color:'#fef08a'}).setOrigin(0.5).setDepth(61);
    els.push(ctr);
    const tapBtn = this.add.rectangle(W/2,H/2+20,180,60,0xf59e0b).setDepth(61).setInteractive({useHandCursor:true});
    const tapTx = this.add.text(W/2,H/2+20,'TAP!',{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#000'}).setOrigin(0.5).setDepth(62);
    els.push(tapBtn,tapTx);
    tapBtn.on('pointerdown',()=>{ taps++; ctr.setText(`${taps} / 3 taps`); tapBtn.setScale(0.9); this.time.delayedCall(80,()=>tapBtn.setScale(1)); });
    const cdEl = this.add.text(W/2,H/2+68,'1.5s',{fontSize:'10px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);
    els.push(cdEl);
    let rem = 1500; const tick = ()=>{rem-=200;if(rem<=0){resolve();return;} cdEl.setText((rem/1000).toFixed(1)+'s'); this._onsideTimer=setTimeout(tick,200);};
    const resolve = () => {
      els.forEach(e=>e?.destroy?.()); clearTimeout(this._onsideTimer);
      const tapBonus = taps >= 3 ? 0.20 : taps >= 1 ? 0.08 : 0;
      const recovered = Math.random() < (baseRecoverCh + tapBonus);
      Sound.whistle();
      if (recovered) {
        state.possession='team'; state.yardLine=50; state.down=1; state.toGo=10;
        this._tdFlash('ONSIDE RECOVERED! 🎉','#f59e0b');
        this.time.delayedCall(1800,()=>{
          this._resetFormation(); this._drawLines();
          const hud=this.scene.get('Hud');
          hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange','team');
          this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall');
        });
      } else {
        state.possession='opp'; state.yardLine=Math.max(40,100-45); state.down=1; state.toGo=10;
        this._tdFlash('ONSIDE FAILED','#ef4444');
        this.time.delayedCall(1800,()=>{
          if(state.quarter>4||state.plays>=40){this.scene.start('GameOver');return;}
          this._startAIDrive();
        });
      }
    };
    this._onsideTimer = setTimeout(tick, 200);
  }

  // AI returns kickoff (after user TD or FG)
  _startKickoffCover() {
    const catchYard=Phaser.Math.Between(87,95);
    state.yardLine=catchYard; state.down=1; state.toGo=10; state.possession='opp';
    this._showKickoffFlash('KICKOFF','WASD to cover  •  tackle the returner',()=>this._startAIDrive());
  }

  // ─── P39: FAKE PUNT / FAKE FG ────────────────────────────────────────────

  _showFakePuntOption() {
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());clearTimeout(this._fakePuntTimer);};
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'4th DOWN — PUNT OR FAKE?',{fontSize:'16px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    const mkBtn=(cx,cy,label,sub,hx,cb)=>{
      const b=this.add.rectangle(cx,cy,160,60,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const l=this.add.text(cx,cy-10,label,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);
      const s=this.add.text(cx,cy+10,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,l,s);
    };
    mkBtn(W/2-90,H/2+14,'PUNT IT','Safe — give up the ball',0x64748b,()=>this._doPunt());
    mkBtn(W/2+90,H/2+14,'🎭 FAKE IT!','Risky — pass or run',0xf97316,()=>this._doFakePunt());
    const cdEl=this.add.text(W/2,H/2+68,'Auto: 3s',{fontSize:'9px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);
    els.push(cdEl);
    let rem=3000;const tick=()=>{rem-=200;if(rem<=0){cleanup();this._doPunt();return;} cdEl.setText('Auto: '+(rem/1000).toFixed(1)+'s');this._fakePuntTimer=setTimeout(tick,200);};
    this._fakePuntTimer=setTimeout(tick,200);
  }

  _doFakePunt() {
    this.phase='result'; Sound.whistle();
    this._tdFlash('🎭 FAKE PUNT!','#f97316');
    const qbOvr=(state.team?.players||[]).find(p=>p.pos==='QB')?.ovr||75;
    const roll=Math.random();
    const success=roll<Math.min(0.62,0.40+(qbOvr-70)*0.004);
    if(success){ const yds=Phaser.Math.Between(state.toGo,state.toGo+12); this._endPlay({yards:yds,text:`FAKE PUNT works! +${yds} yards — 1st down!`,type:'run',turnover:false,td:state.yardLine+yds>=100}); }
    else { this._endPlay({yards:0,text:'FAKE PUNT sniffed out! Turnover on downs.',type:'punt',turnover:true,td:false}); }
  }

  _showFakeFGOption() {
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());clearTimeout(this._fakeFGTimer);};
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'FIELD GOAL — REAL OR FAKE?',{fontSize:'16px',fontFamily:'monospace',fontStyle:'bold',color:'#eab308',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    const mkBtn=(cx,cy,label,sub,hx,cb)=>{
      const b=this.add.rectangle(cx,cy,160,60,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const l=this.add.text(cx,cy-10,label,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);
      const s=this.add.text(cx,cy+10,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,l,s);
    };
    mkBtn(W/2-90,H/2+14,'REAL KICK','Attempt the FG',0x22c55e,()=>this._attemptFG());
    mkBtn(W/2+90,H/2+14,'🎭 FAKE IT!','Pass or run attempt',0xf97316,()=>this._doFakeFG());
    const cdEl=this.add.text(W/2,H/2+68,'Auto: 3s',{fontSize:'9px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);
    els.push(cdEl);
    let rem=3000;const tick=()=>{rem-=200;if(rem<=0){cleanup();this._attemptFG();return;} cdEl.setText('Auto: '+(rem/1000).toFixed(1)+'s');this._fakeFGTimer=setTimeout(tick,200);};
    this._fakeFGTimer=setTimeout(tick,200);
  }

  _doFakeFG() {
    this.phase='result'; Sound.whistle();
    this._tdFlash('🎭 FAKE FG!','#f97316');
    const wrOvr=(state.team?.players||[]).find(p=>p.pos==='WR')?.ovr||75;
    const roll=Math.random();
    const success=roll<Math.min(0.55,0.38+(wrOvr-70)*0.003);
    if(success){ const yds=Phaser.Math.Between(state.toGo,state.toGo+15); const td=state.yardLine+yds>=100; if(td)this._tdFlash('FAKE FG TOUCHDOWN! 🎭','#f97316'); this._endPlay({yards:yds,text:`FAKE FG works! +${yds} yards${td?' — TOUCHDOWN!':''}`,type:td?'td':'pass',turnover:false,td}); }
    else { this._endPlay({yards:0,text:'FAKE FG exposed! Turnover on downs.',type:'fg_miss',turnover:true,td:false}); }
  }

  // ─── P40: GOAL LINE QB SNEAK ──────────────────────────────────────────────

  _tryGoalLineSneak(onSkip) {
    if(state.toGo>1||state.yardLine<94){onSkip();return;}
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const cleanup=()=>els.forEach(e=>e?.destroy?.());
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'QB SNEAK — MASH!',{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#22c55e',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    let taps=0; const needed=4;
    const ctr=this.add.text(W/2,H/2-22,`0 / ${needed}`,{fontSize:'14px',fontFamily:'monospace',color:'#fef08a'}).setOrigin(0.5).setDepth(61);
    els.push(ctr);
    const bar=this.add.rectangle(W/2,H/2+12,0,14,0x22c55e).setDepth(61);
    const barBg=this.add.rectangle(W/2,H/2+12,200,14,0x1e293b).setDepth(60).setStrokeStyle(1,0x334155);
    els.push(barBg,bar);
    const btn=this.add.rectangle(W/2,H/2+52,180,46,0x16a34a).setDepth(61).setInteractive({useHandCursor:true});
    const btx=this.add.text(W/2,H/2+52,'TAP! TAP! TAP!',{fontSize:'14px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(62);
    els.push(btn,btx);
    btn.on('pointerdown',()=>{ taps++; ctr.setText(`${taps} / ${needed}`); bar.width=Math.min(200,(taps/needed)*200); btn.setScale(0.93); this.time.delayedCall(60,()=>btn.setScale(1)); });
    this.time.delayedCall(800,()=>{
      cleanup();
      const qbStr=(state.team?.players||[]).find(p=>p.pos==='QB')?.str||65;
      const success=taps>=needed&&Math.random()<clamp(0.50+(qbStr-65)*0.005,0.35,0.75);
      const sneakYds=state.toGo||1;const sneakTD=state.yardLine+sneakYds>=100;
      if(success){ Sound.td?.(); this._tdFlash('SNEAK FOR THE TD! 💪','#22c55e'); this._endPlay({yards:sneakYds,text:sneakTD?'QB SNEAK — TOUCHDOWN!':'QB sneak — 1st down!',type:sneakTD?'td':'run',turnover:false,td:sneakTD}); }
      else if(taps>=needed){ this._endPlay({yards:1,text:'QB sneak — just enough for the 1st!',type:'run',turnover:false,td:false}); }
      else { this._endPlay({yards:0,text:'QB sneak stuffed at the line.',type:'run',turnover:false,td:false}); }
    });
  }

  // ─── P41: DRIVE MOMENTUM METER ────────────────────────────────────────────

  _buildMomentumHUD() {
    const W=this.scale.width;
    this._momentumText = this.add.text(W/2, FIELD_Y - 36, '⚡ MOM', {fontSize:'8px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(15);
    const barW=100, barX=W/2-barW/2, barY=FIELD_Y-26;
    this.add.rectangle(W/2, barY, barW, 8, 0x1e293b).setDepth(14);
    this._momentumBar = this.add.rectangle(barX + (this._momentum/100)*barW/2, barY, (this._momentum/100)*barW, 8, 0x22c55e).setDepth(15).setOrigin(0,0.5);
    this._momentumBar.x = barX;
  }

  _updateMomentum(delta) {
    this._momentum = clamp(this._momentum + delta, 0, 100);
    const W=this.scale.width, barW=100, barX=W/2-barW/2;
    if(this._momentumBar){ this._momentumBar.width = (this._momentum/100)*barW; }
    const col = this._momentum>65?0x22c55e:this._momentum>35?0xeab308:0xef4444;
    if(this._momentumBar) this._momentumBar.fillColor=col;
    if(this._momentumText) this._momentumText.setText(`⚡ ${Math.round(this._momentum)}%`);
  }

  // ─── P42: CHALLENGE FLAG ─────────────────────────────────────────────────

  _savePrePlayState() {
    this._prePlayState = { yardLine:state.yardLine, down:state.down, toGo:state.toGo, possession:state.possession, scoreTeam:state.score.team, scoreOpp:state.score.opp };
  }

  _showChallengeOption() {
    if(this._challengeUsed||!this._prePlayState)return;
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());clearTimeout(this._chalTimer);};
    els.push(this.add.rectangle(W/2,FIELD_Y+FIELD_H/2-30,300,82,0x0d1424,0.94).setDepth(58).setStrokeStyle(1,0xef4444,0.8));
    els.push(this.add.text(W/2,FIELD_Y+FIELD_H/2-56,'🚩 CHALLENGE? (1 per game)',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#ef4444'}).setOrigin(0.5).setDepth(59));
    const mkBtn=(cx,label,hx,cb)=>{
      const b=this.add.rectangle(cx,FIELD_Y+FIELD_H/2-20,120,34,0x0d1424).setDepth(59).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const l=this.add.text(cx,FIELD_Y+FIELD_H/2-20,label,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(60);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,l);
    };
    mkBtn(W/2-72,'🚩 THROW FLAG',0xef4444,()=>{
      this._challengeUsed=true;
      const overturned=Math.random()<0.45;
      if(overturned){
        Object.assign(state,{yardLine:this._prePlayState.yardLine,down:this._prePlayState.down,toGo:this._prePlayState.toGo,possession:this._prePlayState.possession});
        state.score.team=this._prePlayState.scoreTeam; state.score.opp=this._prePlayState.scoreOpp;
        this._tdFlash('CHALLENGE: OVERTURNED! ✅','#22c55e');
        this.time.delayedCall(2000,()=>{ this._resetFormation(); this._drawLines(); const hud=this.scene.get('Hud'); hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange',state.possession); this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall'); });
      } else {
        this._tdFlash('CHALLENGE FAILED — STANDS 🚩','#ef4444');
      }
    });
    mkBtn(W/2+72,'NO CHALLENGE',0x334155,()=>cleanup());
    let rem=4000;const tick=()=>{rem-=200;if(rem<=0){cleanup();return;} this._chalTimer=setTimeout(tick,200);};
    this._chalTimer=setTimeout(tick,200);
  }

  // ─── P43: 4TH QUARTER COMEBACK MODE ──────────────────────────────────────

  _checkComebackMode() {
    const wasActive=this._comebackMode;
    this._comebackMode = state.quarter>=4 && (state.score.opp-state.score.team)>=7;
    if(this._comebackMode&&!wasActive){
      const W=this.scale.width;
      const cb=this.add.text(W/2,FIELD_Y+FIELD_H/2,'⚡ COMEBACK MODE',{fontSize:'16px',fontFamily:'monospace',fontStyle:'bold',color:'#3b82f6',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(20);
      this.tweens.add({targets:cb,alpha:0,y:cb.y-30,duration:2000,onComplete:()=>cb.destroy()});
    }
  }

  _tdFlash(msg, col) {
    const W=this.scale.width, H=this.scale.height;
    const colMap={'#f59e0b':0xf59e0b,'#22c55e':0x22c55e,'#3b82f6':0x3b82f6,'#ef4444':0xef4444,'#f97316':0xf97316,'#a78bfa':0xa78bfa,'#eab308':0xeab308};
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
    // V3: clear trail when not actively running
    if(this.phase!=='run'&&this._trailPts?.length){this._trailPts=[];this._trailGfx?.clear();}

    // P45: Show audible button during presnap (user possession) — build once, destroy when not presnap
    if(this.phase==='presnap'&&state.possession==='team'&&!this._audibleUsed){
      if(!this._audibleBtn)this._buildAudibleBtn();
    } else if(this.phase!=='presnap'&&this._audibleBtn){
      this._destroyAudibleBtn();
    }
    // P54: Show expanded hot-route audible menu during presnap (user offense)
    if(this.phase==='presnap'&&state.possession==='team'){
      if(!this._audibleMenuShown)this._showAudibleMenu();
    } else if(this.phase!=='presnap'&&this._audibleMenuShown){
      this._audibleMenuElems.forEach(e=>{try{e.destroy();}catch{}});this._audibleMenuElems=[];this._audibleMenuShown=false;
    }
    // H1: play clock countdown during presnap user offense
    if(this.phase==='presnap'&&state.possession==='team'&&this._playClockMs>0){
      this._playClockMs-=delta;
      const _pcs=Math.ceil(this._playClockMs/1000);
      this._playClockEl?.setColor(_pcs<=5?'#ef4444':_pcs<=10?'#f59e0b':'#94a3b8').setText(`⏱ ${_pcs}`);
      if(this._playClockMs<=0){this._playClockMs=-1;this.phase='result';Sound.whistle?.();this._tdFlash('⏱ DELAY OF GAME — 5 yds','#f59e0b');this._endPlay({yards:-5,text:'Delay of Game. 5-yard penalty.',type:'penalty',turnover:false,td:false});}
    }

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
        // V3: speed trail for fast runners (SPD > 80)
        if(this._runnerData?.spd>80){
          this._trailPts.push({x:this.runner.x,y:this.runner.y});
          if(this._trailPts.length>7)this._trailPts.shift();
          this._trailGfx.clear();
          for(let _ti=1;_ti<this._trailPts.length;_ti++){const _ta=(_ti/this._trailPts.length)*0.5;this._trailGfx.lineStyle(3,0xfbbf24,_ta);this._trailGfx.lineBetween(this._trailPts[_ti-1].x,this._trailPts[_ti-1].y,this._trailPts[_ti].x,this._trailPts[_ti].y);}
        }
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
      const aispd = (this._stackItBonus?this._aiRunSpeed*0.48:this._aiRunSpeed)*dt; // P63: stack bonus slows runner
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

    // P38: check spin button during pass_wait
    if (this.phase === 'pass_wait') this._checkSpinButton();

    // P36: pick_six_return — DB runs to opponent endzone, WASD control
    if (this.phase === 'pick_six_return') {
      const spd = this._pickSixSpd * dt;
      if (k.rt.isDown||k.d.isDown||dp.dx>0) this._pickSixDot.x -= spd;
      if (k.lt.isDown||k.a.isDown||dp.dx<0) this._pickSixDot.x += spd * 0.65;
      if (k.up.isDown||k.w.isDown||dp.dy<0) this._pickSixDot.y -= spd;
      if (k.dn.isDown||k.s.isDown||dp.dy>0) this._pickSixDot.y += spd;
      this._pickSixDot.y = clamp(this._pickSixDot.y, FIELD_Y+10, FIELD_Y+FIELD_H-10);
      this.ball.x = this._pickSixDot.x; this.ball.y = this._pickSixDot.y;
      this._syncLbl(this._pickSixDot);
      // AI tackler chases
      if (this._pickSixTackler) {
        const dx=this._pickSixDot.x-this._pickSixTackler.x, dy=this._pickSixDot.y-this._pickSixTackler.y, dist=Math.hypot(dx,dy);
        if(dist>4){ const ts=this._pickSixTacklerSpd*dt; this._pickSixTackler.x+=(dx/dist)*ts; this._pickSixTackler.y+=(dy/dist)*ts; this._syncLbl(this._pickSixTackler); }
        if(dist<14){ this._resolvePickSixReturn(false); return; }
      }
      // Reaches opponent endzone (left side = user defends right, INT runner goes left)
      if (this._pickSixDot.x <= FIELD_LEFT) { this._resolvePickSixReturn(true); return; }
    }

    // P43: 4th Quarter Comeback Mode — speed boost for WRs (applied via _comebackMode flag in pass logic)
    // (flags are checked in _buildReceiverTargets and _startAIDrive — no per-frame work needed here)
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

  // ─── P44: HAIL MARY ──────────────────────────────────────────────────────

  _showHailMaryOption(callId) {
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());clearTimeout(this._hmTimer);};
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'HAIL MARY? 🙏',{fontSize:'20px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    els.push(this.add.text(W/2,H/2-32,'4th & Long from deep — launch it?',{fontSize:'9px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(61));
    const mkBtn=(cx,cy,label,sub,hx,cb)=>{
      const b=this.add.rectangle(cx,cy,160,60,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const l=this.add.text(cx,cy-10,label,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);
      const s=this.add.text(cx,cy+10,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,l,s);
    };
    mkBtn(W/2-90,H/2+14,'HEAVE IT 🙏','8% TD / 22% INT / 70% inc',0xf59e0b,()=>this._doHailMary());
    mkBtn(W/2+90,H/2+14,'NORMAL PASS','Standard play',0x334155,()=>{ if(state.yardLine<=15&&!this._noHuddleActive)this._showFadeOption(callId);else this._startPass(callId); });
    let rem=2500;const cdEl=this.add.text(W/2,H/2+60,'Auto: 2.5s',{fontSize:'9px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);els.push(cdEl);
    const tick=()=>{rem-=200;if(rem<=0){cleanup();if(state.yardLine<=15&&!this._noHuddleActive)this._showFadeOption(callId);else this._startPass(callId);return;}cdEl.setText('Auto: '+(rem/1000).toFixed(1)+'s');this._hmTimer=setTimeout(tick,200);};
    this._hmTimer=setTimeout(tick,200);
  }

  _doHailMary() {
    this.phase='hail_mary';
    Sound.whistle();
    this._tdFlash('HAIL MARY! 🙏','#f59e0b');
    // QB winds back
    this.tweens.add({targets:this.qb,x:this.qb.x-30,duration:600,ease:'Sine.easeOut',onUpdate:()=>this._syncLbl(this.qb)});
    // WRs sprint deep
    [this.wr1,this.wr2,this.te].forEach(wr=>{if(wr.visible)this.tweens.add({targets:wr,x:Math.min(FIELD_RIGHT-10,wr.x+200),duration:1200,ease:'Sine.easeIn',onUpdate:()=>this._syncLbl(wr)});});
    // Ball arc
    const sx=this.ball.x,sy=this.ball.y;
    const ex=FIELD_RIGHT-20,ey=FIELD_Y+FIELD_H/2;
    const peakY=FIELD_Y-30;
    let t=0;const dur=1500;
    this.arcGfx.clear();
    const arc=this.time.addEvent({delay:16,loop:true,callback:()=>{
      t+=16/dur;if(t>1){arc.remove();this._clearArc();this.time.delayedCall(400,()=>this._resolveHailMary());return;}
      const bx=Phaser.Math.Linear(sx,ex,t),by=(1-t)*(1-t)*sy+2*(1-t)*t*peakY+t*t*ey;
      this.ball.x=bx;this.ball.y=by;
      this.arcGfx.clear();this.arcGfx.lineStyle(2,0xfbbf24,0.5);this.arcGfx.lineBetween(sx,sy,bx,by);
    }});
  }

  _resolveHailMary() {
    this.phase='result';this._clearArc();
    const roll=Math.random();
    if(roll<0.08){
      Sound.td?.();this._tdFlash('HAIL MARY TOUCHDOWN! 🙏🏈','#f59e0b');
      state.score.team+=6;state.yardLine=25;state.down=1;state.toGo=10;state.possession='team';
      this._pendingPAT=true;
      const res={yards:100-state.yardLine,text:'HAIL MARY TOUCHDOWN! Unbelievable!',td:true,type:'td',turnover:false};
      this.events.emit('playResult',res);const hud=this.scene.get('Hud');hud?.events?.emit('playResult',res);hud?.events?.emit('possessionChange','team');
      this.time.delayedCall(1800,()=>this._showPATChoice());
    } else if(roll<0.30){
      Sound.int?.();this._tdFlash('INTERCEPTED! ☠️','#ef4444');
      state.stats.team.int=(state.stats.team.int||0)+1;
      this._endPlay({yards:0,text:'Hail Mary INTERCEPTED — opp ball at 20',type:'int',turnover:true,td:false});
      state.yardLine=20;
    } else {
      Sound.incomplete?.();this._tdFlash('INCOMPLETE — TURNOVER ON DOWNS','#475569');
      this._endPlay({yards:0,text:'Hail Mary incomplete. Turnover on downs.',type:'punt',turnover:true,td:false});
    }
  }

  // ─── P45: AUDIBLE SYSTEM ─────────────────────────────────────────────────

  _buildAudibleBtn() {
    if(this._audibleBtn)return;
    const W=this.scale.width,H=this.scale.height;
    this._audibleBtn=this.add.rectangle(80,H-32,70,26,0x334155,0.9).setDepth(25).setInteractive({useHandCursor:true});
    this._audibleBtnTxt=this.add.text(80,H-32,'AUDIBLE',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#94a3b8'}).setOrigin(0.5).setDepth(26);
    this._audibleBtn.on('pointerdown',()=>this._toggleAudibleMenu());
  }

  _toggleAudibleMenu() {
    if(this._audibleMenuEls){this._audibleMenuEls.forEach(e=>e?.destroy?.());this._audibleMenuEls=null;return;}
    if(this._audibleUsed){this._tdFlash('1 audible per drive','#475569');return;}
    const W=this.scale.width,H=this.scale.height;
    const els=[];
    const mkOpt=(cx,cy,label,key,hx)=>{
      const b=this.add.rectangle(cx,cy,80,30,0x0d1424,1).setDepth(30).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});
      const l=this.add.text(cx,cy,label,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(31);
      b.on('pointerdown',()=>{this._audibleActive=key;this._audibleMenuEls?.forEach(e=>e?.destroy?.());this._audibleMenuEls=null;this._tdFlash('AUDIBLE CALLED','#f59e0b');this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');});
      els.push(b,l);
    };
    mkOpt(80,H-70,'RUN','run',0x22c55e);mkOpt(80,H-100,'PASS','pass',0x3b82f6);
    this._audibleMenuEls=els;
  }

  _destroyAudibleBtn() {
    this._audibleBtn?.destroy();this._audibleBtnTxt?.destroy();this._audibleBtn=null;this._audibleBtnTxt=null;
    this._audibleMenuEls?.forEach(e=>e?.destroy?.());this._audibleMenuEls=null;
  }

  // ─── P46: RED ZONE BOOTLEG ───────────────────────────────────────────────

  _startBootleg(callId) {
    this.phase='bootleg';
    const W=this.scale.width,H=this.scale.height;
    this._tdFlash('BOOTLEG CALLED 🏃','#3b82f6');
    // QB moves right; WR cuts inside
    this.tweens.add({targets:this.qb,x:this.qb.x+80,duration:600,ease:'Linear',onUpdate:()=>{this._syncLbl(this.qb);this.ball.x=this.qb.x;this.ball.y=this.qb.y;}});
    const startWrX=this.wr1.x;
    this.tweens.add({targets:this.wr1,x:this.wr1.x+40,y:this.wr1.y+30,duration:600,ease:'Sine.easeOut',onUpdate:()=>this._syncLbl(this.wr1)});
    let thrown=false;
    const throwBtn=this.add.text(W/2,H/2,'THROW 🏈',{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#22c55e',backgroundColor:'#052e16',padding:{x:14,y:8},stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(25).setInteractive({useHandCursor:true});
    this._bootlegEls=[throwBtn];
    throwBtn.once('pointerdown',()=>{if(this.phase!=='bootleg')return;thrown=true;throwBtn.destroy();this._resolveBootlegThrow();});
    this.time.delayedCall(1000,()=>{
      if(this.phase!=='bootleg')return;
      throwBtn.destroy();
      if(!thrown){this._resolveBootlegScramble();}
    });
  }

  _resolveBootlegThrow() {
    if(this.phase!=='bootleg')return;
    this.phase='result';
    this._bootlegEls?.forEach(e=>e?.destroy?.());
    const qbOvr=(state.team?.players||[]).find(p=>p.pos==='QB')?.ovr||75;
    const cbOvr=(state.opponent?.players||[]).find(p=>['CB','S'].includes(p.pos))?.ovr||75;
    const roll=Math.random();
    if(roll<0.04){
      Sound.int?.();state.stats.team.int=(state.stats.team.int||0)+1;
      this._tdFlash('BOOTLEG INT! CB reads it!','#ef4444');
      this._endPlay({yards:0,text:'Bootleg pass INTERCEPTED — CB read the route',type:'int',turnover:true,td:false});
    } else if(roll<0.04+0.65){
      const yds=Phaser.Math.Between(6,14);const td=state.yardLine+yds>=100;
      Sound.firstDown?.();if(td)Sound.td?.();
      if(td)this._tdFlash('BOOTLEG TOUCHDOWN! 🏈','#22c55e');
      this._endPlay({yards:yds,text:td?'Bootleg TD!':'Bootleg complete — '+yds+' yds',type:td?'td':'pass',turnover:false,td});
    } else {
      Sound.incomplete?.();this._tdFlash('Bootleg — incomplete','#475569');
      this._endPlay({yards:0,text:'Bootleg — pass incomplete',type:'inc',turnover:false,td:false});
    }
  }

  _resolveBootlegScramble() {
    if(this.phase!=='bootleg')return;
    this.phase='result';
    this._bootlegEls?.forEach(e=>e?.destroy?.());
    const yds=Phaser.Math.Between(2,9);const td=state.yardLine+yds>=100;
    Sound.tackle?.();if(td)Sound.td?.();
    this._endPlay({yards:yds,text:td?'QB bootleg scramble — TOUCHDOWN!':'QB scrambles for '+yds+' yards',type:td?'td':'run',turnover:false,td});
  }

  // P49: WR vs CB matchup HUD ─────────────────────────────────────────────
  _buildMatchupHUD() {
    const wr1Data=state.team?.players?.find(p=>p.pos==='WR')||{ovr:80,name:'WR1'};
    const wr2Data=(state.team?.players||[]).filter(p=>p.pos==='WR')[1]||{ovr:76,name:'WR2'};
    const cb1Data=state.opponent?.players?.find(p=>p.pos==='CB')||{ovr:75,name:'CB1'};
    const cb2Data=(state.opponent?.players||[]).filter(p=>p.pos==='CB')[1]||{ovr:73,name:'CB2'};
    this._matchupWR1=wr1Data.ovr||80;this._matchupWR2=wr2Data.ovr||76;
    const diff1=this._matchupWR1-(cb1Data.ovr||75),diff2=this._matchupWR2-(cb2Data.ovr||75);
    const col1=diff1>4?'#22c55e':diff1<-4?'#ef4444':'#f59e0b';
    const col2=diff2>4?'#22c55e':diff2<-4?'#ef4444':'#f59e0b';
    const wr1n=(wr1Data.name||'WR1').split(' ').pop();const wr2n=(wr2Data.name||'WR2').split(' ').pop();
    const W=this.scale.width;
    const bg=this.add.rectangle(W/2,FIELD_Y-18,320,22,0x0a0f1a,0.78).setDepth(19);
    const t1=this.add.text(W/2-70,FIELD_Y-18,`${wr1n} ${this._matchupWR1>cb1Data.ovr?'▲':'▼'} CB`,{fontSize:'8px',fontFamily:'monospace',color:col1,stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(20);
    const t2=this.add.text(W/2+70,FIELD_Y-18,`${wr2n} ${this._matchupWR2>cb2Data.ovr?'▲':'▼'} CB`,{fontSize:'8px',fontFamily:'monospace',color:col2,stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(20);
    const lbl=this.add.text(W/2,FIELD_Y-18,'MATCHUP',{fontSize:'7px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(20);
    this._matchupEls=[bg,t1,t2,lbl];
    this.time.delayedCall(2800,()=>{this._matchupEls.forEach(e=>e?.destroy?.());this._matchupEls=[];});
  }

  // P50: FG Block Attempt ──────────────────────────────────────────────────
  _showAIFGBlock() {
    const W=this.scale.width,H=this.scale.height;
    const dist=100-state.yardLine+17;
    const dlData=state.team?.players?.find(p=>['DE','DL'].includes(p.pos))||{ovr:75};
    const blockBase=0.18+((dlData.ovr||75)-70)*0.004;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());this._fgBlockEls=[];};
    const bg=this.add.rectangle(W/2,H/2,W,H,0x000000,0.68).setDepth(60);
    const ht=this.add.text(W/2,H/2-60,`AI FIELD GOAL — ${dist} YDS`,{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#ef4444',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61);
    const sub=this.add.text(W/2,H/2-36,'Rush the kicker!',{fontSize:'10px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(61);
    els.push(bg,ht,sub);this._fgBlockEls=els;
    // Block button appears 0.8s after overlay
    this.time.delayedCall(800,()=>{
      const bBg=this.add.rectangle(W/2,H/2+18,200,46,0x22c55e).setDepth(61).setInteractive({useHandCursor:true});
      const bTx=this.add.text(W/2,H/2+18,'BLOCK IT! 🙅',{fontSize:'14px',fontFamily:'monospace',fontStyle:'bold',color:'#0a0f1a',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(62);
      els.push(bBg,bTx);
      bBg.on('pointerover',()=>bBg.setFillStyle(0x16a34a));bBg.on('pointerout',()=>bBg.setFillStyle(0x22c55e));
      bBg.on('pointerdown',()=>{
        cleanup();
        const blocked=Math.random()<clamp(blockBase,0.05,0.40);
        if(blocked){
          Sound.whistle?.();this._tdFlash('FG BLOCKED! 🚫','#22c55e');
          state.drives.push({poss:'opp',plays:this._aiDrivePlays||0,yards:this._aiDriveYards||0,start:this._aiDriveStart||25,result:'NO FG'});
          this._aiDrivePlays=0;this._aiDriveYards=0;
          state.possession='team';state.yardLine=Math.max(5,100-state.yardLine);state.down=1;state.toGo=10;
          const r={text:'FG BLOCKED! Ball returned.',yards:0,td:false,turnover:true,type:'fg_miss'};
          this.events.emit('playResult',r);const hud=this.scene.get('Hud');
          hud?.events?.emit('playResult',r);hud?.events?.emit('possessionChange','team');
          this._afterPlay();
        } else {
          this._resolveAIFG(dist);
        }
      });
    });
    // Auto-resolve after 3s if no button pressed
    this.time.delayedCall(3200,()=>{if(els[0]?.active){cleanup();this._resolveAIFG(dist);}});
  }
  _resolveAIFG(dist) {
    const made=dist<=52&&Math.random()<(0.88-Math.max(0,dist-35)*0.02);
    if(made){Sound.td?.();this._tdFlash('AI FG GOOD — +3!','#ef4444');state.score.opp+=3;}
    else{Sound.whistle?.();this._tdFlash('AI FG NO GOOD','#22c55e');}
    state.drives.push({poss:'opp',plays:this._aiDrivePlays||0,yards:this._aiDriveYards||0,start:this._aiDriveStart||25,result:made?'FG':'NO FG'});
    this._aiDrivePlays=0;this._aiDriveYards=0;
    state.possession='team';state.yardLine=Math.max(5,made?25:100-state.yardLine);state.down=1;state.toGo=10;
    const r={text:made?`AI FG GOOD +3`:`AI FG NO GOOD`,yards:0,td:false,turnover:true,type:made?'fg':'fg_miss'};
    state.plays++;if(state.plays%8===0)state.quarter=Math.min(4,state.quarter+1);
    this.events.emit('playResult',r);const hud=this.scene.get('Hud');
    hud?.events?.emit('playResult',r);hud?.events?.emit('possessionChange','team');
    if(!state._halfShown&&state.quarter>=3){state._halfShown=true;this.time.delayedCall(1600,()=>this._showHalftime());return;}
    if(state.quarter>4||state.plays>=40){this.time.delayedCall(1600,()=>this.scene.start('GameOver'));}
    else{this.time.delayedCall(2000,()=>this._startKickoffReturn());}
  }

  // ─── P54: QB READS SYSTEM ────────────────────────────────────────────────

  _showQBReads() {
    if (!this._qbReadsActive) return;
    this._clearReadOverlay();
    const W = this.scale.width, H = this.scale.height;
    const reads = [
      { x: W*0.28, y: H*0.55, type:'checkdown', label:'CHECK\nDOWN', clr:0xeab308 },
      { x: W*0.50, y: H*0.45, type:'primary',   label:'PRIMARY',     clr:0x22c55e },
      { x: W*0.72, y: H*0.38, type:'go_route',  label:'GO\nROUTE',   clr:0xef4444 },
    ];
    reads.forEach(r => {
      const circ = this.add.circle(r.x, r.y, 22, r.clr, 0.28).setDepth(30);
      const border = this.add.circle(r.x, r.y, 22, 0, 0).setStrokeStyle(2, r.clr).setDepth(31);
      const txt = this.add.text(r.x, r.y, r.label, { fontSize:'7px', fontFamily:'monospace', color:'#fff', fontStyle:'bold', align:'center' }).setOrigin(0.5).setDepth(32);
      circ.setInteractive().on('pointerdown', () => { this._qbReadChoice = r.type; this._clearReadOverlay(); this._qbReadsActive = false; });
      this._readOverlayElems.push(circ, border, txt);
    });
    this.time.delayedCall(2500, () => { if(this._qbReadsActive){ this._clearReadOverlay(); this._qbReadsActive=false; } });
  }

  _clearReadOverlay() {
    this._readOverlayElems.forEach(e => { try { e.destroy(); } catch(e2) {} });
    this._readOverlayElems = [];
  }

  // ─── P55: PLAYER FATIGUE ─────────────────────────────────────────────────

  _applyFatigue(pid, amount) {
    if (!pid) return;
    this._fatigue[pid] = Math.min(100, (this._fatigue[pid] || 0) + amount);
    this._updateFatigueHUD();
  }

  _getFatigueMultiplier(pid) {
    const f = this._fatigue[pid] || 0;
    if (f < 30) return 1.0;
    if (f < 60) return 0.93;
    if (f < 80) return 0.85;
    return 0.75;
  }

  _recoverFatigue() {
    Object.keys(this._fatigue).forEach(pid => {
      this._fatigue[pid] = Math.max(0, (this._fatigue[pid] || 0) - 20);
    });
    this._updateFatigueHUD();
  }

  _updateFatigueHUD() {
    if (this._fatigueEl) { try { this._fatigueEl.destroy(); } catch{} this._fatigueEl = null; }
    const qb = state.team?.players?.find(p=>p.pos==='QB');
    const rb = state.team?.players?.find(p=>p.pos==='RB');
    const qbF = qb ? (this._fatigue[qb.id] || 0) : 0;
    const rbF = rb ? (this._fatigue[rb.id] || 0) : 0;
    const maxF = Math.max(qbF, rbF);
    if (maxF < 60) return;
    const W = this.scale.width;
    const who = maxF === qbF ? 'QB' : 'RB';
    this._fatigueEl = this.add.text(W - 8, FIELD_Y + FIELD_H + 10, `${who} TIRED`, {
      fontSize:'8px', fontFamily:'monospace', color:'#f97316', stroke:'#000', strokeThickness:1
    }).setOrigin(1, 0).setDepth(18);
    this.time.delayedCall(2000, () => { try { this._fatigueEl?.destroy(); this._fatigueEl=null; } catch{} });
  }

  // ─── P56: GOAL LINE PACKAGE ──────────────────────────────────────────────

  _isGoalLine() { return state.yardLine >= 93; }

  _applyGoalLineFormation() {
    const glBanner = this.add.text(this.scale.width * 0.5, this.scale.height * 0.15,
      'GOAL LINE STAND', { fontSize:'11px', fontFamily:'monospace', color:'#ffd700', fontStyle:'bold', stroke:'#000', strokeThickness:2 }
    ).setOrigin(0.5).setDepth(25);
    this.time.delayedCall(1500, () => { try { glBanner.destroy(); } catch {} });
  }

  // ─── P57: EXPANDED AUDIBLE MENU ──────────────────────────────────────────

  _showAudibleMenu() {
    if (this._audibleMenuShown || state.possession !== 'team') return;
    this._audibleMenuShown = true;
    const W = this.scale.width, H = this.scale.height;
    const routes = Object.entries(AUDIBLE_ROUTES);
    this._audibleMenuElems = [];
    routes.forEach(([key, r], i) => {
      const x = W * 0.18 + i * 62;
      const y = H * 0.89;
      const active = this._activeAudible === key;
      const bg = this.add.rectangle(x, y, 56, 18, active ? 0x1d4ed8 : 0x1e293b).setDepth(20).setStrokeStyle(1, active ? 0x3b82f6 : 0x334155);
      const txt = this.add.text(x, y, r.label, { fontSize:'6px', fontFamily:'monospace', color: active ? '#fff' : '#94a3b8', fontStyle: active ? 'bold' : 'normal' }).setOrigin(0.5).setDepth(21);
      bg.setInteractive().on('pointerdown', () => {
        this._activeAudible = this._activeAudible === key ? null : key;
        // Refresh menu to show active state
        this._audibleMenuElems.forEach(e => { try { e.destroy(); } catch {} });
        this._audibleMenuElems = [];
        this._audibleMenuShown = false;
        this._showAudibleMenu();
        if (this._activeAudible) {
          const flash = this.add.text(W/2, H/2 - 40, `AUDIBLE: ${r.label}`, {
            fontSize:'13px', fontFamily:'monospace', color:'#eab308', fontStyle:'bold', stroke:'#000', strokeThickness:2
          }).setOrigin(0.5).setDepth(30);
          this.time.delayedCall(900, () => { try { flash.destroy(); } catch {} });
        }
      });
      this._audibleMenuElems.push(bg, txt);
    });
  }

  // ─── P58: DEFENSIVE FORMATION SELECTOR ───────────────────────────────────

  _showDefFormationSelector() {
    this._clearDefFormSelector();
    const W = this.scale.width;
    const fKeys = Object.keys(DEF_FORMATIONS);
    this._defFormElems = [];
    fKeys.forEach((key, i) => {
      const x = W - 175 + i * 38;
      const y = 28;
      const active = this._defFormation === key;
      const bg = this.add.rectangle(x, y, 32, 14, active ? 0x1d4ed8 : 0x1e293b)
        .setDepth(20).setStrokeStyle(1, active ? 0x3b82f6 : 0x334155);
      const txt = this.add.text(x, y, DEF_FORMATIONS[key].label, {
        fontSize:'6px', fontFamily:'monospace', color: active ? '#fff' : '#64748b', fontStyle: active ? 'bold' : 'normal'
      }).setOrigin(0.5).setDepth(21);
      bg.setInteractive().on('pointerdown', () => { this._defFormation = key; this._showDefFormationSelector(); });
      this._defFormElems.push(bg, txt);
    });
  }

  _clearDefFormSelector() {
    if (this._defFormElems) { this._defFormElems.forEach(e => { try { e.destroy(); } catch {} }); this._defFormElems = []; }
  }

  // P53: Clock Management Mode ─────────────────────────────────────────────
  _showClockMgmt(mode) {
    const W=this.scale.width,H=this.scale.height;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());this._clockMgmtEls=[];};
    const proceed=()=>{cleanup();this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');};
    const bg=this.add.rectangle(W/2,H/2+10,W,72,0x0a0f1a,0.90).setDepth(58);
    const label=mode==='spike'?'SPIKE IT?':'OUT OF BOUNDS?';
    const subText=mode==='spike'?'Stop the clock — lose a down':'Stay in bounds — use clock';
    const ht=this.add.text(W/2,H/2-16,label,{fontSize:'16px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(59);
    const sub=this.add.text(W/2,H/2+2,subText,{fontSize:'8px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(59);
    els.push(bg,ht,sub);this._clockMgmtEls=els;
    const mkBtn=(cx,lbl,hx,cb)=>{
      const b=this.add.rectangle(cx,H/2+28,130,30,0x0d1424).setDepth(59).setStrokeStyle(1,hx,0.8).setInteractive({useHandCursor:true});
      const bt=this.add.text(cx,H/2+28,lbl,{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(60);
      b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();cb();});
      els.push(b,bt);
    };
    if(mode==='spike'){
      mkBtn(W/2-72,'✅ SPIKE IT',0x22c55e,()=>{
        // Spike: stop clock, lose a down, stay at current yard line
        state.down=Math.min(4,state.down+1);state.toGo=Math.max(1,state.toGo);
        this._tdFlash('CLOCK STOPPED ⏱','#f59e0b');
        this._resetFormation();this._drawLines();
        const hud=this.scene.get('Hud');hud?.events?.emit('resetHud');hud?.events?.emit('possessionChange','team');
        if(state.down>4){state.possession='opp';state.yardLine=Math.max(5,100-state.yardLine);state.down=1;state.toGo=10;this.time.delayedCall(1200,()=>this._startAIDrive());}
        else{this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');}
      });
      mkBtn(W/2+72,'❌ STAY IN',0x64748b,proceed);
    } else {
      mkBtn(W/2-72,'✅ OUT OF BOUNDS',0x22c55e,()=>{
        this._tdFlash('CLOCK STOPPED ⏱','#f59e0b');
        this._resetFormation();this._drawLines();
        const hud=this.scene.get('Hud');hud?.events?.emit('resetHud');hud?.events?.emit('possessionChange','team');
        this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');
      });
      mkBtn(W/2+72,'❌ STAY IN',0x64748b,proceed);
    }
    this.time.delayedCall(4000,()=>{if(els[0]?.active)proceed();});
  }

  // ─── P59: AI PUNT RETURN DECISION ────────────────────────────────────────
  _showAIPuntDecision() {
    const W=this.scale.width,H=this.scale.height;
    const catchYd=Phaser.Math.Between(55,70); // yards from user's end zone = user's 30-45 yard line
    const windAdj=this._wind&&(this._wind.dir==='←'||this._wind.dir==='→')?-Phaser.Math.Between(2,7):(this._wind?.dir==='↓'?Phaser.Math.Between(2,5):0);
    const els=[];const cleanup=()=>els.forEach(e=>e?.destroy?.());
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.78).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'AI PUNT',{fontSize:'22px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    els.push(this.add.text(W/2,H/2-36,'You receive at your own '+(100-catchYd)+'-yard line',{fontSize:'9px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(61));
    const mkBtn=(cx,label,sub,hx,cb)=>{const b=this.add.rectangle(cx,H/2+14,160,60,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});const l=this.add.text(cx,H/2+4,label,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);const s=this.add.text(cx,H/2+20,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));b.on('pointerdown',()=>{cleanup();cb();});els.push(b,l,s);};
    const setupPlay=()=>{state.possession='team';state.down=1;state.toGo=10;this._resetFormation();this._drawLines();const h=this.scene.get('Hud');h?.events?.emit('resetHud');h?.events?.emit('possessionChange','team');this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');};
    const doFairCatch=()=>{state.yardLine=catchYd;const r={text:'Fair catch — your ball!',yards:0,td:false,turnover:true,type:'punt'};this.events.emit('playResult',r);const hud=this.scene.get('Hud');hud?.events?.emit('playResult',r);hud?.events?.emit('possessionChange','team');this.time.delayedCall(1200,()=>setupPlay());};
    const doReturn=()=>{const lEls=[];const lClean=()=>lEls.forEach(e=>e?.destroy?.());lEls.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.78).setDepth(60));lEls.push(this.add.text(W/2,H/2-50,'CHOOSE RETURN LANE',{fontSize:'16px',fontFamily:'monospace',fontStyle:'bold',color:'#22c55e',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(61));const mkL=(cx,lane,avgYd,fumbCh)=>{const b=this.add.rectangle(cx,H/2+10,150,54,0x0d1424).setDepth(61).setStrokeStyle(1,0x22c55e,0.6).setInteractive({useHandCursor:true});const l=this.add.text(cx,H/2,lane,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#22c55e'}).setOrigin(0.5).setDepth(62);const s=this.add.text(cx,H/2+16,avgYd+'yd avg • '+Math.round(fumbCh*100)+'% fumb',{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);b.on('pointerover',()=>b.setFillStyle(0x22c55e,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));b.on('pointerdown',()=>{lClean();const gained=Math.max(0,Phaser.Math.Between(avgYd-7,avgYd+8)+windAdj);const fumble=Math.random()<fumbCh;if(fumble){this._tdFlash('FUMBLE! ☠️','#ef4444');state.possession='opp';state.yardLine=Math.max(1,100-catchYd+gained);state.down=1;state.toGo=10;const rf={text:'FUMBLE! AI recovers.',yards:0,td:false,turnover:true,type:'fum'};this.events.emit('playResult',rf);const hf=this.scene.get('Hud');hf?.events?.emit('playResult',rf);hf?.events?.emit('possessionChange','opp');this.time.delayedCall(1600,()=>this._startAIDrive());}else{this._tdFlash(`RETURN +${gained}yds!`,'#22c55e');state.yardLine=Math.max(5,catchYd-gained);const rs={text:`Return +${gained}yds`,yards:gained,td:false,turnover:true,type:'punt'};this.events.emit('playResult',rs);const hs=this.scene.get('Hud');hs?.events?.emit('playResult',rs);hs?.events?.emit('possessionChange','team');this.time.delayedCall(1200,()=>setupPlay());}});lEls.push(b,l,s);};mkL(W/2-155,'LEFT',10,0.12);mkL(W/2,'MIDDLE',15,0.06);mkL(W/2+155,'RIGHT',10,0.12);const cdL=this.add.text(W/2,H/2+56,'Auto: 1.5s',{fontSize:'9px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);lEls.push(cdL);let remL=1500;const tickL=()=>{remL-=200;if(remL<=0){lClean();doFairCatch();return;}cdL.setText('Auto: '+(remL/1000).toFixed(1)+'s');this.time.delayedCall(200,tickL);};this.time.delayedCall(200,tickL);};
    mkBtn(W/2-90,'FAIR CATCH','Safe — no return yards',0x22c55e,doFairCatch);
    mkBtn(W/2+90,'RETURN','Risk it for extra yards',0xf97316,doReturn);
    const cdEl=this.add.text(W/2,H/2+68,'Auto: 2.5s',{fontSize:'9px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);
    els.push(cdEl);let rem=2500;const tick=()=>{rem-=200;if(rem<=0){cleanup();doFairCatch();return;}cdEl.setText('Auto: '+(rem/1000).toFixed(1)+'s');this.time.delayedCall(200,tick);};this.time.delayedCall(200,tick);
  }

  // ─── P60: OVERTIME MECHANIC ───────────────────────────────────────────────
  _showOTCoinFlip() {
    const W=this.scale.width,H=this.scale.height;
    const flash=this.add.text(W/2,H/2,'OVERTIME!',{fontSize:'38px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(70);
    this.tweens.add({targets:flash,scaleX:1.25,scaleY:1.25,duration:400,yoyo:true,repeat:2,onComplete:()=>{
      flash.destroy();this._isOT=true;state.quarter=5;state.plays=0;
      const els=[];const cleanup=()=>els.forEach(e=>e?.destroy?.());
      els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(68));
      els.push(this.add.text(W/2,H/2-62,'COIN FLIP — SUDDEN DEATH',{fontSize:'14px',fontFamily:'monospace',fontStyle:'bold',color:'#ffd700',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(69));
      els.push(this.add.text(W/2,H/2-40,'First score wins!',{fontSize:'9px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(69));
      const mkBtn=(cx,label,hx,guessWin)=>{const b=this.add.rectangle(cx,H/2+14,150,56,0x0d1424).setDepth(69).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});const l=this.add.text(cx,H/2+14,label,{fontSize:'14px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(70);b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));b.on('pointerdown',()=>{cleanup();const userWins=Math.random()<0.5;if(userWins){this._tdFlash(guessWin+' — YOU WIN TOSS! ⚡','#22c55e');state.possession='team';state.yardLine=75;state.down=1;state.toGo=10;this.time.delayedCall(1800,()=>{this._resetFormation();this._drawLines();const h=this.scene.get('Hud');h?.events?.emit('resetHud');h?.events?.emit('possessionChange','team');this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');});}else{this._tdFlash('AI WINS TOSS','#ef4444');state.possession='opp';state.yardLine=25;state.down=1;state.toGo=10;this.time.delayedCall(1800,()=>this._startAIDrive());}});els.push(b,l);};
      mkBtn(W/2-80,'HEADS',0xffd700,'HEADS');mkBtn(W/2+80,'TAILS',0x94a3b8,'TAILS');
    }});
  }

  // ─── P61: TWO-POINT PLAY CHOICE ──────────────────────────────────────────
  _showTwoPointChoice() {
    const W=this.scale.width,H=this.scale.height;
    const els=[];const cleanup=()=>els.forEach(e=>e?.destroy?.());
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.8).setDepth(60));
    els.push(this.add.text(W/2,H/2-60,'TWO-POINT ATTEMPT',{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#3b82f6',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(61));
    els.push(this.add.text(W/2,H/2-36,'Choose your play:',{fontSize:'9px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(61));
    const qbData=state.team?.players?.find(p=>p.pos==='QB')||{ovr:78};const rbData=state.team?.players?.find(p=>p.pos==='RB')||{ovr:75};
    const passRate=Math.round(clamp(40+(qbData.ovr-70)*0.8,30,72));const runRate=Math.round(clamp(35+(rbData.ovr-70)*0.7,25,65));
    const mkBtn=(cx,label,sub,hx,cb)=>{const b=this.add.rectangle(cx,H/2+14,160,60,0x0d1424).setDepth(61).setStrokeStyle(1,hx,0.7).setInteractive({useHandCursor:true});const l=this.add.text(cx,H/2+4,label,{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#'+hx.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);const s=this.add.text(cx,H/2+20,sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);b.on('pointerover',()=>b.setFillStyle(hx,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));b.on('pointerdown',()=>{cleanup();cb();});els.push(b,l,s);};
    mkBtn(W/2-90,'RUN IT','QB sneak mini-game • '+runRate+'% base',0xf97316,()=>this._startTwoPointPlay());
    mkBtn(W/2+90,'PASS IT',passRate+'% success • Stat-based',0x3b82f6,()=>{const success=Math.random()*100<passRate;if(success){state.score.team+=2;this._tdFlash('TWO-POINT PASS! +2 🎯','#22c55e');}else{this._tdFlash('2PT PASS INCOMPLETE','#ef4444');}state.possession='opp';state.yardLine=25;state.down=1;state.toGo=10;this._pendingKickoffCover=true;const r={text:success?'TWO-POINT CONVERSION! +2':'2PT attempt fails',td:false,yards:0,turnover:false};this.events.emit('playResult',r);const hud=this.scene.get('Hud');hud?.events?.emit('playResult',r);hud?.events?.emit('possessionChange','team');this.time.delayedCall(1800,()=>this._afterPlay());});
    const cdEl=this.add.text(W/2,H/2+68,'Auto: 3s',{fontSize:'9px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);
    els.push(cdEl);let rem=3000;const tick=()=>{rem-=200;if(rem<=0){cleanup();this._startTwoPointPlay();return;}cdEl.setText('Auto: '+(rem/1000).toFixed(1)+'s');this.time.delayedCall(200,tick);};this.time.delayedCall(200,tick);
  }

  // ─── P63: DEFENSIVE RUN STOP ─────────────────────────────────────────────
  _showDefRunStop() {
    if(this.phase!=='ai_run')return;
    const W=this.scale.width,H=this.scale.height;
    const els=[];const cleanup=()=>{els.forEach(e=>e?.destroy?.());this._stackItEls=[];};
    const bg=this.add.rectangle(W/2,H-72,200,46,0xdc2626).setDepth(30).setInteractive({useHandCursor:true});
    const tx=this.add.text(W/2,H-72,'STACK IT! 💪',{fontSize:'13px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(31);
    const cd=this.add.text(W/2,H-50,'1.2s',{fontSize:'8px',fontFamily:'monospace',color:'#fca5a5'}).setOrigin(0.5).setDepth(31);
    els.push(bg,tx,cd);this._stackItEls=els;
    bg.on('pointerover',()=>bg.setFillStyle(0xb91c1c));bg.on('pointerout',()=>bg.setFillStyle(0xdc2626));
    bg.on('pointerdown',()=>{if(this.phase!=='ai_run')return;cleanup();this._stackItBonus=true;const fl=this.add.text(W/2,H/2-20,'STACKED! 💪',{fontSize:'20px',fontFamily:'monospace',fontStyle:'bold',color:'#22c55e',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(35);this.tweens.add({targets:fl,alpha:0,y:fl.y-30,duration:900,onComplete:()=>fl?.destroy?.()});});
    let rem=1200;const tick=()=>{rem-=200;if(rem<=0||this.phase!=='ai_run'){cleanup();return;}cd.setText((rem/1000).toFixed(1)+'s');this.time.delayedCall(200,tick);};this.time.delayedCall(200,tick);
  }
  // ─── P64: No-Huddle Hurry-Up ───────────────────────────────────────────────
  _showHurryUp() {
    if(state.possession!=='team'||this.phase!=='presnap')return;
    const W=this.scale.width,H=this.scale.height;
    const els=this._hurryUpEls;
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());this._hurryUpEls=[];};
    const bg=this.add.rectangle(W/2,H-100,240,46,0xd97706,0.92).setDepth(32).setInteractive({useHandCursor:true});
    const tx=this.add.text(W/2,H-108,'\u26a1 HURRY-UP! (-5% comp)',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#000'}).setOrigin(0.5).setDepth(33);
    const st=this.add.text(W/2,H-92,'Snap fast \u2014 saves 15s',{fontSize:'7px',fontFamily:'monospace',color:'#1c1917'}).setOrigin(0.5).setDepth(33);
    els.push(bg,tx,st);this._hurryUpEls=els;
    let rem=2200;const tick=()=>{rem-=200;if(rem<=0||this.phase!=='presnap'){cleanup();return;}this.time.delayedCall(200,tick);};this.time.delayedCall(200,tick);
    bg.on('pointerover',()=>bg.setFillStyle(0xb45309,0.95));bg.on('pointerout',()=>bg.setFillStyle(0xd97706,0.92));
    bg.on('pointerdown',()=>{
      cleanup();
      state.plays=Math.max(0,(state.plays||0)-1);
      [this.cb1,this.cb2,this.lb].forEach(d=>{if(d?.visible){d.x+=(Math.random()-0.5)*22;d.y+=(Math.random()-0.5)*22;this._syncLbl(d);}});
      this._hurryUpActive=true;
      this._tdFlash('\u26a1 HURRY-UP SNAP',0xd97706);
      this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');
    });
  }

  // ─── P65: Receiver Route Tree ──────────────────────────────────────────────────
  _showRouteTree() {
    if(state.possession!=='team'||this.phase!=='pass_wait')return;
    if(this._routeTreeEls.length>0)return;
    const W=this.scale.width,H=this.scale.height;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());this._routeTreeEls=[];};
    const routes=[
      {label:'CURL',compMod:+0.08,yardMod:0.75,color:0x22c55e},
      {label:'POST',compMod:+0.02,yardMod:1.20,color:0x3b82f6},
      {label:'CORNER',compMod:-0.05,yardMod:1.35,color:0xf59e0b},
      {label:'GO',compMod:-0.12,yardMod:1.70,color:0xef4444},
    ];
    const bg=this.add.rectangle(W/2,H-88,W*0.9,52,0x0f172a,0.88).setDepth(28);
    const ht=this.add.text(W/2,H-110,'ROUTE TREE',{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#94a3b8'}).setOrigin(0.5).setDepth(29);
    els.push(bg,ht);
    routes.forEach((r,i)=>{
      const bx=W*0.14+i*(W*0.24);
      const rb=this.add.rectangle(bx,H-88,W*0.22,36,r.color,0.22).setDepth(29).setInteractive({useHandCursor:true});
      const rt=this.add.text(bx,H-91,r.label,{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(30);
      const rs=this.add.text(bx,H-79,(r.compMod>0?'+':'')+Math.round(r.compMod*100)+'% comp',{fontSize:'7px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(30);
      rb.on('pointerover',()=>rb.setAlpha(0.55));rb.on('pointerout',()=>rb.setAlpha(1));
      rb.on('pointerdown',()=>{
        if(this.phase!=='pass_wait')return;
        this._routeTreeChoice={...r};
        cleanup();
        this._tdFlash(r.label+' ROUTE',r.color);
      });
      els.push(rb,rt,rs);
    });
    this._routeTreeEls=els;
    this.time.delayedCall(3000,()=>cleanup());
  }

  // ─── P66: Defensive Pass Rush Lane ─────────────────────────────────────────────
  _showRushLane() {
    if(state.possession!=='opp'||this.phase!=='ai_pass')return;
    const W=this.scale.width,H=this.scale.height;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());this._rushLaneEls=[];};
    const bg=this.add.rectangle(W/2,H/2-50,280,64,0x0f172a,0.90).setDepth(50);
    const ht=this.add.text(W/2,H/2-74,'\U0001f3c8 PASS RUSH LANE',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#f97316',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(51);
    els.push(bg,ht);
    [{label:'INSIDE\nRUSH',mod:{sackCh:+0.12,covCh:-0.06},color:0xef4444},
     {label:'OUTSIDE\nRUSH',mod:{sackCh:+0.04,covCh:+0.08},color:0x3b82f6}
    ].forEach((lane,i)=>{
      const bx=W/2-70+i*140;
      const rb=this.add.rectangle(bx,H/2-44,120,44,lane.color,0.22).setDepth(51).setInteractive({useHandCursor:true});
      const rt=this.add.text(bx,H/2-44,lane.label,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',align:'center'}).setOrigin(0.5).setDepth(52);
      rb.on('pointerover',()=>rb.setAlpha(0.55));rb.on('pointerout',()=>rb.setAlpha(1));
      rb.on('pointerdown',()=>{this._rushLaneBonus=lane.mod;cleanup();this._tdFlash(lane.label.replace('\\n',' '),lane.color);});
      els.push(rb,rt);
    });
    this._rushLaneEls=els;
    this.time.delayedCall(2000,()=>cleanup());
  }

  // ─── P68: Red Zone Fade to Corner ────────────────────────────────────────────
  _showFadeRoute() {
    if(state.possession!=='team')return;
    if(state.yardLine<75||(state.down<3)||(state.toGo<5))return;
    if(this._fadeBtnEls.length>0)return;
    const W=this.scale.width,H=this.scale.height;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());this._fadeBtnEls=[];};
    const bg=this.add.rectangle(W*0.82,FIELD_Y+32,130,38,0x7c3aed,0.90).setDepth(28).setInteractive({useHandCursor:true});
    const tx=this.add.text(W*0.82,FIELD_Y+28,'\u2728 FADE ROUTE',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#e9d5ff',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(29);
    const st=this.add.text(W*0.82,FIELD_Y+40,'RZ corner fade',{fontSize:'7px',fontFamily:'monospace',color:'#a78bfa'}).setOrigin(0.5).setDepth(29);
    els.push(bg,tx,st);this._fadeBtnEls=els;
    bg.on('pointerover',()=>bg.setFillStyle(0x6d28d9,0.95));bg.on('pointerout',()=>bg.setFillStyle(0x7c3aed,0.90));
    bg.on('pointerdown',()=>{
      cleanup();
      if(this.phase!=='presnap')return;
      const wrData=state.team?.players?.find(p=>p.pos==='WR')||{ovr:80};
      const cbData=state.opponent?.players?.find(p=>p.pos==='CB')||{ovr:78};
      const catchCh=0.48+((wrData.ovr||80)-(cbData.ovr||78))*0.005;
      const caught=Math.random()<catchCh;
      const td=caught&&(state.yardLine+Phaser.Math.Between(18,28)>=100);
      this.phase='result';
      if(td){Sound.td?.();this._tdFlash('FADE TD! \u2728','#a78bfa');this._endPlay({yards:100-state.yardLine,text:'FADE ROUTE TOUCHDOWN! Corner of the endzone!',type:'td',turnover:false,td:true});}
      else if(caught){const fy=Phaser.Math.Between(12,Math.min(24,100-state.yardLine-1));this._endPlay({yards:fy,text:'Fade complete \u2014 '+fy+' yard gain to the corner',type:'pass',turnover:false,td:false});}
      else{Sound.incomplete?.();this._endPlay({yards:0,text:'FADE \u2014 incomplete. CB had great coverage.',type:'inc',turnover:false,td:false});}
    });
    this.time.delayedCall(4500,()=>cleanup());
  }

  // ─── P70: Hurry-Up Defense ───────────────────────────────────────────────
  _showHurryUpDefense() {
    const W=this.scale.width,H=this.scale.height;
    const els=[];
    const cleanup=()=>{els.forEach(e=>e?.destroy?.());};
    const choices=[
      {label:'PREVENT D',sub:'Soft coverage — stop big plays',mod:-0.08,col:'#38bdf8',bg:0x0c4a6e},
      {label:'AGGRESSIVE D',sub:'Press coverage — force incompletions',mod:0.12,col:'#f97316',bg:0x78350f},
    ];
    const overlay=this.add.rectangle(W/2,H/2,W,H,0x000000,0.72).setDepth(40);
    const panel=this.add.rectangle(W/2,H/2,320,150,0x0d1424,1).setDepth(41).setStrokeStyle(1,0xef4444);
    const title=this.add.text(W/2,H/2-55,'⚡ HURRY-UP OFFENSE',{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#ef4444',letterSpacing:2}).setOrigin(0.5).setDepth(42);
    const sub=this.add.text(W/2,H/2-38,'Opponent is in hurry-up mode — choose your defense',{fontSize:'8px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(42);
    let cd=3;
    const cdTxt=this.add.text(W/2,H/2+52,'Auto-selecting in '+cd+'s',{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(42);
    els.push(overlay,panel,title,sub,cdTxt);
    const tick=this.time.addEvent({delay:1000,repeat:2,callback:()=>{cd--;cdTxt.setText('Auto-selecting in '+cd+'s');if(cd<=0){cleanup();tick.remove();this._hurryUpDef=-0.05;this.time.delayedCall(200,()=>this._startKickoffReturn());}}});
    choices.forEach((c,i)=>{
      const cx=W/2-80+i*160,cy=H/2+6;
      const accent=Phaser.Display.Color.HexStringToColor(c.col).color;
      const btn=this.add.rectangle(cx,cy,140,60,c.bg,0.25).setDepth(41).setStrokeStyle(1,accent,0.7).setInteractive({useHandCursor:true});
      const lt=this.add.text(cx,cy-10,c.label,{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:c.col}).setOrigin(0.5).setDepth(42);
      const st=this.add.text(cx,cy+10,c.sub,{fontSize:'7px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(42);
      btn.on('pointerover',()=>btn.setFillStyle(c.bg,0.5));
      btn.on('pointerout',()=>btn.setFillStyle(c.bg,0.25));
      btn.on('pointerdown',()=>{cleanup();tick.remove();this._hurryUpDef=c.mod;this.time.delayedCall(200,()=>this._startKickoffReturn());});
      els.push(btn,lt,st);
    });
  }

  // ─── P71: Motion Pre-Snap ───────────────────────────────────────────────
  _showMotionBtn(callId) {
    if(this._motionEls.length>0)return;
    const W=this.scale.width;
    const cleanup=()=>{this._motionEls.forEach(e=>e?.destroy?.());this._motionEls=[];this._motionBtn=null;};
    const bg=this.add.rectangle(W*0.18,FIELD_Y+32,100,36,0x1d4ed8,0.88).setDepth(28).setInteractive({useHandCursor:true});
    const tx=this.add.text(W*0.18,FIELD_Y+28,'🏃 MOTION',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#bfdbfe',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(29);
    const st=this.add.text(W*0.18,FIELD_Y+40,'WR decoy -8% cov',{fontSize:'7px',fontFamily:'monospace',color:'#60a5fa'}).setOrigin(0.5).setDepth(29);
    const skipTx=this.add.text(W*0.18,FIELD_Y+52,'[tap to snap]',{fontSize:'6px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(29);
    this._motionEls=[bg,tx,st,skipTx];
    bg.on('pointerover',()=>bg.setFillStyle(0x1e40af,0.95));
    bg.on('pointerout',()=>bg.setFillStyle(0x1d4ed8,0.88));
    bg.on('pointerdown',()=>{
      cleanup();
      this._motionActive=true;
      this._tdFlash('WR IN MOTION','#60a5fa');
      // Tween WR1 left 30px then snap
      this.tweens.add({targets:this.wr1,x:this.wr1.x-30,duration:500,ease:'Sine.easeInOut',
        onUpdate:()=>this._syncLbl(this.wr1),
        onComplete:()=>{this._motionActive=false;this._motionUsed=true;this._dispatchPassPlay(callId);}
      });
    });
    // skip motion button — tap anywhere else to snap without motion
    const skipBtn=this.add.rectangle(W/2,FIELD_Y-18,120,22,0x1e293b,0.7).setDepth(28).setInteractive({useHandCursor:true});
    const skipTxt=this.add.text(W/2,FIELD_Y-18,'Skip → Snap',{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(29);
    this._motionEls.push(skipBtn,skipTxt);
    skipBtn.on('pointerdown',()=>{cleanup();this._dispatchPassPlay(callId);});
    this.time.delayedCall(3000,()=>{if(this._motionEls.length>0){cleanup();this._dispatchPassPlay(callId);}});
  }

  _dispatchPassPlay(callId) {
    if(callId==='sideline_route'){this._startSidelineRoute();return;}
    if(callId==='screen_pass'){this._startScreenPass();return;}
    if(callId==='pass_action'){this._startPlayAction();return;}
    if(state.down===4&&state.toGo>=15&&state.yardLine<55&&state.possession==='team'){this._showHailMaryOption(callId);return;}
    if(state.yardLine>=75&&(callId==='pass_short'||callId==='pass_medium')&&Math.random()<0.25){this._startBootleg(callId);return;}
    if(state.yardLine<=15&&!this._noHuddleActive){this._showFadeOption(callId);return;}
    this._startPass(callId);
  }

  // ─── P72: Third Down Conversion HUD ─────────────────────────────────────
  _buildThirdDownHUD() {
    const W=this.scale.width;
    this._thirdHUD=this.add.rectangle(W-54,FIELD_Y+52,90,28,0x0d1424,0.88).setDepth(8).setStrokeStyle(1,0x334155);
    this._thirdHUDTxt=this.add.text(W-54,FIELD_Y+52,'3rd: 0/0 (—)',{fontSize:'7px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(9);
  }

  _updateThirdHUD() {
    if(!this._thirdHUDTxt)return;
    const att=this._thirdDownAtt,conv=this._thirdDownConv;
    const pct=att>0?Math.round(conv/att*100):0;
    const col=pct>=50?'#22c55e':pct>=33?'#eab308':'#ef4444';
    this._thirdHUDTxt.setText(`3rd: ${conv}/${att} (${att>0?pct+'%':'—'})`).setColor(col);
  }

  // ─── P73: Sideline Route ────────────────────────────────────────────────
  _startSidelineRoute() {
    this._piChecked=false;
    this.phase='pass_wait';
    this.passVariant='sideline';
    this._animateRoutes('quick');
    this._setupPocket();
    this._startPassRush(false);
    Sound.whistle();
    this.events.emit('phaseChange','pass');
    // WR1 tweens right 60px for sideline route
    this.time.delayedCall(200,()=>{
      this.tweens.add({targets:this.wr1,x:this.wr1.x+60,duration:400,ease:'Sine.easeOut',
        onUpdate:()=>this._syncLbl(this.wr1),
        onComplete:()=>this._resolveSidelineRoute()
      });
    });
    // Auto-resolve after 2.5s
    this.time.delayedCall(2500,()=>{if(this.phase==='pass_wait')this._resolveSidelineRoute();});
  }

  _resolveSidelineRoute() {
    if(this.phase!=='pass_wait')return;
    this.phase='result';
    this._clearPassRush();
    const wrData=state.team?.players?.find(p=>p.pos==='WR')||{ovr:80,spd:88};
    const cbData=state.opponent?.players?.find(p=>p.pos==='CB')||{ovr:78};
    const catchCh=0.78+(((wrData.spd||88)-(cbData.ovr||78))*0.003);
    const motionBonus=this._motionActive?0.08:0;
    const caught=Math.random()<(catchCh+motionBonus);
    const yards=caught?Phaser.Math.Between(4,8):0;
    const td=caught&&state.yardLine+yards>=100;
    const qb=state.team?.players?.find(p=>p.pos==='QB')||{id:'qb1',ovr:80};
    const wr=state.team?.players?.find(p=>p.pos==='WR')||{id:'wr1'};
    if(caught){
      Sound.firstDown?.();
      state.stats.team.passYds+=yards;
      this._track(qb.id,'passYds',yards);this._track(qb.id,'att',1);this._track(qb.id,'comp',1);
      this._track(wr.id,'recYds',yards);this._track(wr.id,'rec',1);
      if(td){Sound.td?.();this._tdFlash('SIDELINE TD! 🏈','#22c55e');this._track(wr.id,'recTD',1);this._track(qb.id,'passTD',1);}
      else{this._tdFlash('SIDELINE CATCH — CLOCK STOPS','#38bdf8');}
    } else {
      Sound.incomplete?.();
    }
    // P72: 3rd down conversion tracking
    if(state.down===3&&yards>=(state.toGo||10)){this._thirdDownConv++;this._updateThirdHUD();}
    this._updateMomentum(caught?6:-2);
    this._checkComebackMode();
    const text=td?`🏈 SIDELINE TOUCHDOWN!`:(caught?`Sideline catch — ${yards} yds (clock stops)`:'Sideline route — incomplete');
    this._endPlay({yards:yards||0,text,type:td?'td':'pass',turnover:false,td,clockStop:caught&&!td});
  }

  // ─── P74: Defensive Back Bump Coverage ───
  _showBumpCoverage() {
    if(this.phase!=='ai_pass')return;
    const W=this.scale.width;
    const bg=this.add.rectangle(W-62,FIELD_Y+52,100,24,0x7c3aed,1).setDepth(23).setInteractive({useHandCursor:true});
    const tx=this.add.text(W-62,FIELD_Y+52,'💢 BUMP!',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(24);
    this._bumpCovEls=[bg,tx];
    const destroy=()=>{this._bumpCovEls.forEach(e=>e?.destroy());this._bumpCovEls=[];};
    bg.once('pointerdown',()=>{
      destroy();
      // Bump: push receiver off route, +20% INT chance this play
      const rec=this._aiRecTarget;
      if(rec&&rec.dot){rec.dot.x+=Phaser.Math.Between(12,24);rec.dot.y+=(Math.random()-0.5)*30;this._syncLbl(rec.dot);}
      this._passRushCoverBreak=true;
      this._tdFlash('💢 DB BUMP — route disrupted','#7c3aed');
    });
    this.time.delayedCall(680,()=>destroy());
  }

  // ─── P75: Scramble Slide ───
  _showSlideOption() {
    if(this.phase!=='run')return;
    const W=this.scale.width,H=this.scale.height;
    const bg=this.add.rectangle(W/2,H/2+54,140,26,0x0ea5e9,1).setDepth(23).setInteractive({useHandCursor:true});
    const tx=this.add.text(W/2,H/2+54,'🛸 SLIDE — Protect QB',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(24);
    this._slideEls=[bg,tx];
    const destroy=()=>{this._slideEls.forEach(e=>e?.destroy());this._slideEls=[];};
    bg.once('pointerdown',()=>{
      destroy();
      if(this.phase!=='run')return;
      // Slide: end run early, gain current distance but no fumble risk, QB safe
      const dist=Math.max(0,this.runner.x-this.startX);
      const pxPerYd=(this.scale.width)/100;
      const rawYds=Math.min(Math.round(dist/pxPerYd),4);
      this._tdFlash(`🛸 QB SLIDE — ${rawYds} yds`,'#0ea5e9');
      this._resolvePlay(1.0,'run',rawYds);
    });
    this.time.delayedCall(1200,()=>destroy());
  }

  // ─── P76: Red Zone Run Option ───
  _showRZRunChoice() {
    if(this.phase!=='run')return;
    const W=this.scale.width,H=this.scale.height;
    const bg=this.add.rectangle(W/2,H/2+80,210,26,0xea580c,1).setDepth(23);
    const tx=this.add.text(W/2,H/2+80,'RED ZONE — 🏋️ DIVE  |  💨 SWEEP',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(24);
    const dBg=this.add.rectangle(W/2-55,H/2+80,96,26,0xef4444,0).setDepth(25).setInteractive({useHandCursor:true});
    const sBg=this.add.rectangle(W/2+55,H/2+80,96,26,0x22c55e,0).setDepth(25).setInteractive({useHandCursor:true});
    this._rzRunEls=[bg,tx,dBg,sBg];
    const destroy=()=>{this._rzRunEls.forEach(e=>e?.destroy());this._rzRunEls=[];};
    dBg.once('pointerdown',()=>{ destroy(); this._tdFlash('🏋️ POWER DIVE','#ef4444'); if(this._resolvePlay)this._rzRunBonus={type:'dive',bonus:0.12}; });
    sBg.once('pointerdown',()=>{ destroy(); this._tdFlash('💨 SWEEP OUTSIDE','#22c55e'); if(this._resolvePlay)this._rzRunBonus={type:'sweep',bonus:0.08}; });
    this.time.delayedCall(1500,()=>destroy());
  }

  // ─── P77: Penalty Accept/Decline ───
  _showPenaltyChoice(penaltyName,yards,beneficiary) {
    const W=this.scale.width,H=this.scale.height;
    const bg=this.add.rectangle(W/2,H/2-20,W*0.9,80,0x1e293b,0.96).setDepth(50).setStrokeStyle(2,0xfde047);
    const hd=this.add.text(W/2,H/2-54,'🚩 FLAG ON THE PLAY',{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#fde047'}).setOrigin(0.5).setDepth(51);
    const nm=this.add.text(W/2,H/2-38,`${penaltyName} — ${yards} yds`,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(51);
    const aBg=this.add.rectangle(W/2-50,H/2-10,88,22,0x22c55e,1).setDepth(52).setInteractive({useHandCursor:true});
    const aTx=this.add.text(W/2-50,H/2-10,'✅ ACCEPT',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(53);
    const dBg=this.add.rectangle(W/2+50,H/2-10,88,22,0xef4444,1).setDepth(52).setInteractive({useHandCursor:true});
    const dTx=this.add.text(W/2+50,H/2-10,'❌ DECLINE',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(53);
    this._penaltyEls=[bg,hd,nm,aBg,aTx,dBg,dTx];
    const destroy=()=>{this._penaltyEls.forEach(e=>e?.destroy());this._penaltyEls=[];};
    const accept=()=>{
      destroy();
      // Accept: apply yards in favor of beneficiary
      if(beneficiary==='team'){state.yardLine=Math.min(99,state.yardLine+yards);state.down=1;state.toGo=10;}
      else{state.yardLine=Math.max(1,state.yardLine-yards);if(state.down<4)state.down=Math.max(1,state.down-1);}
      this._tdFlash(`✅ PENALTY ACCEPTED — ${yards} yds`,'#22c55e');
      this.time.delayedCall(600,()=>this._afterPlay());
    };
    const decline=()=>{ destroy(); this._tdFlash('❌ PENALTY DECLINED','#ef4444'); this.time.delayedCall(400,()=>this._afterPlay()); };
    aBg.once('pointerdown',accept); dBg.once('pointerdown',decline);
    this.time.delayedCall(3000,()=>{ if(this._penaltyEls.length>0)decline(); });
  }

}

