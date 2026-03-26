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
    this._buildTimeoutBtn(); // P101: timeout button
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
    this._passRushMode = false; this._passRushCoverBreak = false; this._rushThrowTimer = null;
    this._noHuddleActive = false; this._fadeEls = null; this._trickEls = null;
    // P36-P43 flags
    this._spinUsed = false; this._challengeUsed = false; this._comebackMode = false;
    // P44-P48 flags
    this._audibleUsed = false; this._audibleActive = null; this._audibleBtn = null; this._audibleBtnTxt = null; this._audibleMenuEls = null;
    this._holdingRoll = false; this._squibKickTimer = null; this._bootlegEls = null; this._hmTimer = null;
    this._momentum = 50; this._momentumBar = null; this._momentumText = null; // overridden below by streak calc
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
    // INNO I15/I16/I20 [SIL]: persistent game-state flags (never reset per-play)
    this._trickPlayMem = false; this._maxDeficit = 0; this._comebackShown = false; this._weatherEscalated = false;
    // P81-P85 flags
    this._teSeamActive = false; this._dlStunt = false; this._crackBlock = false; this._pumpFake = false; this._wildcatActive = false; this._pumpFakeBonus = 0; this._pumpFakeBtn = null;
    // P86-P90 flags
    this._fleaFlickerActive = false; this._endAroundActive = false; this._qbSneakActive = false; this._blitzPackage = false; this._blitzBtn = null;
    // P91-P95 flags
    this._counterBtn = null; this._readOptionActive = false; this._readOptionChoice = false; this._secondReadActive = false; this._secondReadBtn = null; this._driveSummaryShown = false; this._fgIced = false;
    // P100-P103 flags
    this._defMiniGameUsed = false; this._replayStore = null; this._replayBtn = null;
    // P104-P110 flags
    this._returnLaneMod = 0; this._nlPumpBonus = 0; this._nlPumpEls = null; this._stripBtnShown = false; this._stripBtnEl = null;
    // INNO I12: QB hot/cold streak (+N = hot completions, -N = cold)
    this._qbStreak = 0;
    // INNO I13: disguise defense flag
    this._defDisguise = false;
    // P96-P97 flags
    this._coverageAssignMod = 0; this._jumpRouteActive = false; this._jumpRouteEls = null;
    this._jmpBonus = 0;
    // INNO I24: timer registry for clean scene shutdown; I32: fatigue visual ring
    this._timerRegistry = []; this._fatRingGfx = null;
    // INNO I51: user-controlled defensive dot during AI drives
    this._userDefActive = false; this._userDefDot = null;
    // INNO I52: half-time adjustment card selection
    this._htAdj = null;
    // INNO I56: mid-game weather progression flag
    this._wxProgressed = false;
    // INNO I61: AI no-repeat call log
    this._aiCallLog = [];
    // INNO I64: defensive pressure ring blitz bonus
    this._blitzPressureBonus = 0;
    // v27: I27/I33/I34/I35/I37/I38/P120-P125 flags
    this._fieldPosPenalty = false; this._freshDlUsed = false; this._freshDlH1 = 0; this._freshDlH2 = 0;
    this._doubleMoveActive = false; this._doubleMoveBtn = null; this._doubleMoveMod = 0;
    this._shuffleEls = null; this._shuffleUsedBonus = 0; this._persFoulChecked = false;
    this._crowdNoise = false; this._pressureBar = null;
    // Tendency tracker: rolling window of last 6 calls ('run'|'pass') for AI counter-calling
    this._callHistory = [];
    // Streak → starting momentum (+5 per win streak, -5 per loss streak, capped ±20)
    this._momentum = clamp(50 + clamp((state.streak||0)*5,-20,20), 30, 70);
    // Difficulty modifier (affects AI comp%, AI rush speed)
    this._diffMod = {rookie:-0.12, normal:0, veteran:0.08, hof:0.15}[state.difficulty||'normal']||0;
    // INNO I25: streak-driven difficulty nudge — each win tightens AI by ~1.2%
    const _dynNudge=clamp((state.streak||0)*0.012,-0.06,0.06); this._diffMod=clamp(this._diffMod+_dynNudge,-0.18,0.22);
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
    this._regTimer(this.time.addEvent({ delay:33, loop:true, callback:()=>{
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
    }}));
  }

  // ─── FIELD ────────────────────────────────────────────────────────────────

  _drawField() {
    // INNO I63: night game mode for rival/playoff games
    const _nightMode = state.isRival && Math.random()<0.5;
    this._nightMode = _nightMode;
    const g=this.add.graphics();
    // === ALTERNATING GRASS STRIPS (10-yard bands like broadcast view) ===
    for(let i=0;i<10;i++){g.fillStyle(i%2===0?(_nightMode?0x0a1f12:0x14532d):(_nightMode?0x0c2818:0x165e34),1);g.fillRect(FIELD_LEFT+i*60,FIELD_Y,60,FIELD_H);}
    // === END ZONES ===
    g.fillStyle(0x0c3018,1);
    g.fillRect(0,FIELD_Y,FIELD_LEFT,FIELD_H);
    g.fillRect(FIELD_RIGHT,FIELD_Y,100,FIELD_H);
    // === SIDELINES ===
    g.fillStyle(0xffffff,0.75); g.fillRect(FIELD_LEFT,FIELD_Y,600,2); g.fillRect(FIELD_LEFT,FIELD_Y+FIELD_H-2,600,2);
    // === HASH MARKS (every 1 yard, at 30% and 70% of field height) ===
    const _hY1=FIELD_Y+FIELD_H*0.30,_hY2=FIELD_Y+FIELD_H*0.70;
    g.fillStyle(0xffffff,0.38);
    for(let y=1;y<100;y++){const hx=yardToX(y);g.fillRect(hx-1,_hY1-3,2,6);g.fillRect(hx-1,_hY2-3,2,6);}
    // === 5-YARD LINES (minor) ===
    g.lineStyle(1,0x1a7a3a,0.38);
    for(let y=5;y<100;y+=10){const x=yardToX(y);g.lineBetween(x,FIELD_Y+2,x,FIELD_Y+FIELD_H-2);}
    // === 10-YARD LINES (major) ===
    g.lineStyle(1.5,0xffffff,0.20);
    for(let y=10;y<=90;y+=10){const x=yardToX(y);g.lineBetween(x,FIELD_Y+2,x,FIELD_Y+FIELD_H-2);}
    // === GOAL LINES (thick) ===
    g.lineStyle(3,0xffffff,0.88); g.lineBetween(FIELD_LEFT,FIELD_Y,FIELD_LEFT,FIELD_Y+FIELD_H); g.lineBetween(FIELD_RIGHT,FIELD_Y,FIELD_RIGHT,FIELD_Y+FIELD_H);
    // === MIDFIELD LINE + CENTER CIRCLE ===
    const _mfX=yardToX(50);
    g.lineStyle(2,0xffffff,0.28); g.lineBetween(_mfX,FIELD_Y,_mfX,FIELD_Y+FIELD_H);
    g.lineStyle(1.5,0xffffff,0.13); g.strokeCircle(_mfX,FIELD_Y+FIELD_H/2,38);
    // === YARD NUMBERS (top and bottom rows) ===
    for(let y=10;y<=90;y+=10){
      const num=y<=50?y:100-y,x=yardToX(y);
      this.add.text(x,FIELD_Y+18,String(num),{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#ffffff'}).setOrigin(0.5).setAlpha(0.40);
      this.add.text(x,FIELD_Y+FIELD_H-18,String(num),{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#ffffff'}).setOrigin(0.5).setAlpha(0.40);
    }
    // === E1: TEAM-COLORED ENDZONES + ABBREVIATED NAMES ===
    const _ezTc=Phaser.Display.Color.HexStringToColor(state.team?.clr||'#22c55e').color;
    const _ezOc=Phaser.Display.Color.HexStringToColor(state.opponent?.clr||'#ef4444').color;
    this.add.rectangle(50,FIELD_Y+FIELD_H/2,FIELD_LEFT,FIELD_H,_ezTc,0.28).setDepth(0);
    this.add.rectangle(750,FIELD_Y+FIELD_H/2,100,FIELD_H,_ezOc,0.28).setDepth(0);
    const _tAb=(state.team?.ab||'HOME').toUpperCase(),_oAb=(state.opponent?.ab||'AWAY').toUpperCase();
    this.add.text(50,FIELD_Y+FIELD_H/2,_tAb,{fontSize:'28px',fontFamily:'monospace',fontStyle:'bold',color:state.team?.clr||'#22c55e'}).setOrigin(0.5).setAlpha(0.38).setAngle(-90).setDepth(0);
    this.add.text(750,FIELD_Y+FIELD_H/2,_oAb,{fontSize:'28px',fontFamily:'monospace',fontStyle:'bold',color:state.opponent?.clr||'#ef4444'}).setOrigin(0.5).setAlpha(0.38).setAngle(-90).setDepth(0);
    // Dynamic line graphics
    this.losLine=this.add.graphics(); this.firstDownLine=this.add.graphics(); this.arcGfx=this.add.graphics();
    this.add.text(4,FIELD_Y+FIELD_H+8,'Offense: WASD / Juke: SPACE / Pass: click receiver  •  Defense: WASD to tackle',{fontSize:'9px',fontFamily:'monospace',color:'#1e293b'});
    // P16: Red zone overlay
    this._rzTint=this.add.rectangle(FIELD_RIGHT-30,FIELD_Y+FIELD_H/2,62,FIELD_H,0xef4444,0.07).setDepth(1).setVisible(false);
    this._rzIndicator=this.add.text(yardToX(90),FIELD_Y+22,'◈ RED ZONE',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#ef4444',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(12).setVisible(false);
  }

  _createBall() {
    const g=this.add.graphics().setDepth(10);
    g.fillStyle(0x7a3c10,1); g.fillEllipse(0,0,14,9);          // brown leather oval
    g.fillStyle(0xa05228,1); g.fillEllipse(-1.5,-1.5,8,5);     // specular highlight
    g.lineStyle(1,0x3b1c08,0.8); g.strokeEllipse(0,0,14,9);    // seam border
    g.lineStyle(1.4,0xffffff,0.88);
    [-2.5,0,2.5].forEach(dx=>g.lineBetween(dx,-3.8,dx,3.8));   // laces
    g.lineStyle(0.8,0xffffff,0.42);
    [-1.5,0,1.5].forEach(dy=>g.lineBetween(-3.2,dy,3.2,dy));   // cross-stitch
    this.ball=g;
  }

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

  // ─── Full top-down football player figure ─────────────────────────────────
  _dot(color, label, radius, ovr) {
    const c=this.add.container(0,0).setDepth(4);
    const g=this.add.graphics();
    const r=radius;
    // Shadow
    g.fillStyle(0x000000,0.28); g.fillEllipse(1.5,2.5,r*1.9,r*2.8);
    // Jersey / torso
    g.fillStyle(color,1); g.fillEllipse(0,r*0.45,r*1.28,r*1.55);
    // Shoulder pads (lightened oval wider than torso)
    const _lc=Phaser.Display.Color.IntegerToColor(color).lighten(16).color;
    g.fillStyle(_lc,1); g.fillEllipse(0,-r*0.06,r*1.88,r*0.82);
    // Jersey side stripes
    g.lineStyle(1,0xffffff,0.18);
    g.lineBetween(-r*0.70,r*0.05,-r*0.64,r*0.80);
    g.lineBetween( r*0.70,r*0.05, r*0.64,r*0.80);
    // Helmet (darkened, circle at top)
    const _dc=Phaser.Display.Color.IntegerToColor(color).darken(22).color;
    g.fillStyle(_dc,1); g.fillCircle(0,-r*0.55,r*0.68);
    // Helmet shine
    g.fillStyle(0xffffff,0.20); g.fillEllipse(-r*0.22,-r*0.74,r*0.40,r*0.27);
    // Facemask bars
    g.lineStyle(1.2,0xd4dce8,0.78);
    g.lineBetween(-r*0.44,-r*0.44,r*0.44,-r*0.44);  // lower bar
    g.lineBetween(-r*0.32,-r*0.58,r*0.32,-r*0.58);  // upper bar
    g.lineBetween(0,-r*0.42,0,-r*0.34);              // chin bar
    // OVR aura (V2 preserved + enhanced)
    if(ovr){
      const ga=Math.min(0.8,0.10+(ovr-60)*0.011);
      g.lineStyle(1.5,0xffffff,ga*0.5); g.strokeEllipse(0,r*0.15,r*2.02,r*3.0);
      if(ovr>=85){g.lineStyle(2,0xfbbf24,0.52);g.strokeEllipse(0,r*0.12,r*2.18,r*3.18);}
      if(ovr>=92){g.lineStyle(1.5,0xfde68a,0.30);g.strokeEllipse(0,r*0.10,r*2.44,r*3.55);}
    }
    // Position label on jersey
    const lbl=this.add.text(0,r*0.44,label,{
      fontSize:`${Math.max(5,Math.floor(r*0.60))}px`,
      fontFamily:'monospace',fontStyle:'bold',color:'#ffffff',
      stroke:'#00000099',strokeThickness:1.5
    }).setOrigin(0.5);
    c.add([g,lbl]);
    c._lbl=lbl; c._r=r; c._origLabel=label; c._g=g;
    return c;
  }

  _place(d, x, y) { d.x=x; d.y=y; if(d.type!=='Container'&&d._lbl){d._lbl.x=x;d._lbl.y=y;} }
  _show(d, vis)   { d.setVisible(vis); if(d.type!=='Container'&&d._lbl)d._lbl.setVisible(vis); }
  _syncLbl(d)     { if(d.type!=='Container'&&d._lbl){d._lbl.x=d.x;d._lbl.y=d.y;} }
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

  // FIX P8: centralized per-play flag reset — call from any code path that starts a new play
  _resetPlayFlags() {
    this._spinUsed = false;
    this._holdingRoll = false;
    this._motionUsed = false;
    this._hurryUpActive = false;
    this._qbSneakActive = false;
    this._fleaFlickerActive = false;
    this._endAroundActive = false;
    this._blitzPackage = false;
    this._readOptionActive = false;
    this._readOptionChoice = false;
    this._secondReadActive = false;
    this._checkdownActive = false;
    this._defDisguise = false;
    this._jumpRouteActive = false;
    this._jmpBonus = 0;
    this._coverageAssignMod = 0;
    this._returnLaneMod = 0;
    this._stripBtnShown = false;
    this._nlPumpBonus = 0;
    // INNO I14 [SIL]: reset play-clock shake flag each play
    this._playClockShook = false;
    // INNO I15 [SIL]: trick play memory — per-play penalty flag (trickPlayMem persists)
    this._trickMemCovPenalty = false;
    // Destroy transient UI elements
    this._nlPumpEls?.forEach(e=>e?.destroy?.()); this._nlPumpEls = null;
    this._jumpRouteEls?.forEach(e=>e?.destroy?.()); this._jumpRouteEls = null;
    this._stripBtnEl?.forEach(e=>e?.destroy?.()); this._stripBtnEl = null;
    this._secondReadBtn?.destroy?.(); this._secondReadBtn = null;
    this._blitzBtn?.destroy?.(); this._blitzBtn = null;
    this._counterBtn?.destroy?.(); this._counterBtn = null;
    this._replayBtn?.forEach(e=>e?.destroy()); this._replayBtn = null; this._replayStore = null;
  }

  _resetFormation() {
    // INNO I51: clean up user safety dot on formation reset
    this._userDefActive=false; this._userDefLbl?.destroy(); this._userDefLbl=null;
    if(this._userDefDot)this._show(this._userDefDot,false);
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
    // FIX P8: use centralized flag reset
    this._resetPlayFlags();
    // P105: Spike button available in 2-min drill
    if(state._drillMode&&state.possession==='team')this.time.delayedCall(100,()=>this._showSpikeBtnDrill());
    // H1: reset play clock each snap
    if(state.possession==='team'){this._playClockMs=40000;this._playClockEl?.setColor('#94a3b8').setText('⏱ 40');}else{this._playClockEl?.setText('');}
    // P82: show DL stunt button when defending; P89: show Blitz Package alongside
    if(state.possession!=='team'){this.time.delayedCall(200,()=>this._showDLStuntBtn());this.time.delayedCall(400,()=>this._showBlitzBtn());}
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
    const lx=yardToX(state.yardLine);
    // LOS: thick gold with triangle end-caps
    this.losLine.lineStyle(3,0xfbbf24,0.88); this.losLine.lineBetween(lx,FIELD_Y,lx,FIELD_Y+FIELD_H);
    this.losLine.fillStyle(0xfbbf24,0.88);
    this.losLine.fillTriangle(lx-6,FIELD_Y,lx+6,FIELD_Y,lx,FIELD_Y+11);
    this.losLine.fillTriangle(lx-6,FIELD_Y+FIELD_H,lx+6,FIELD_Y+FIELD_H,lx,FIELD_Y+FIELD_H-11);
    if(state.possession==='team'){
      const fdx=yardToX(Math.min(99,state.yardLine+state.toGo));
      this.firstDownLine.lineStyle(3,0x22c55e,0.78); this.firstDownLine.lineBetween(fdx,FIELD_Y,fdx,FIELD_Y+FIELD_H);
      this.firstDownLine.fillStyle(0x22c55e,0.78);
      this.firstDownLine.fillTriangle(fdx-6,FIELD_Y,fdx+6,FIELD_Y,fdx,FIELD_Y+11);
      this.firstDownLine.fillTriangle(fdx-6,FIELD_Y+FIELD_H,fdx+6,FIELD_Y+FIELD_H,fdx,FIELD_Y+FIELD_H-11);
    } else {
      const fdx=yardToX(Math.max(1,state.yardLine-(this.aiToGo||10)));
      this.firstDownLine.lineStyle(3,0xef4444,0.78); this.firstDownLine.lineBetween(fdx,FIELD_Y,fdx,FIELD_Y+FIELD_H);
    }
    const inRZ=state.possession==='team'&&state.yardLine>=80;
    if(this._rzTint)this._rzTint.setVisible(inRZ);
    if(this._rzIndicator)this._rzIndicator.setVisible(inRZ);
  }

  _clearArc() { this.arcGfx.clear(); }

  // ─── PLAY DISPATCH ────────────────────────────────────────────────────────

  _onPlayCalled(callId) {
    state.currentCall = callId;
    // Tendency tracker — record call type for AI counter-calling
    if(callId!=='punt'&&callId!=='fg'){const _ct=(callId.startsWith('run_')||callId==='scramble'||callId==='wildcat'||callId==='end_around'||callId==='qb_sneak'||callId==='read_option')?'run':'pass';this._callHistory.push(_ct);if(this._callHistory.length>6)this._callHistory.shift();}
    // Snap flash — white pulse radiates from ball on snap
    if(callId!=='punt'&&callId!=='fg')this._snapFlash();
    // P42: save pre-play state for challenge flag
    this._savePrePlayState();
    // P45: Audible override
    if(this._audibleActive&&state.possession==='team'){const forced=this._audibleActive;this._audibleActive=null;this._audibleUsed=true;if(forced==='run')callId='run_middle';else if(forced==='pass')callId='pass_short';state.currentCall=callId;this._tdFlash('AUDIBLE CALLED','#f59e0b');}
    // P48: generate holding roll at snap for pass plays
    if(callId.startsWith('pass_')||callId==='sideline_route')this._holdingRoll=Math.random()<0.08;
    // P72: track 3rd down attempts
    if(state.down===3){this._thirdDownAtt++;this._updateThirdHUD();}
    // P71: show MOTION button for pass plays before snap
    if((callId.startsWith('pass_')||callId==='sideline_route'||callId==='te_seam')&&state.possession==='team'&&!this._motionActive){this._showMotionBtn(callId);return;}
    // P84: show PUMP FAKE button for pass plays
    this._pumpFakeBonus=0;
    // P82: DL stunt reset each play
    this._dlStunt=false;
    // P83: crack block reset each play
    this._crackBlock=false;
    // P89: blitz package reset each play
    this._blitzPackage=false;
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
    else if (callId === 'fg') {
      // P95: Field Goal Ice — 8% chance opponent calls timeout before kick
      if (!this._fgIced && Math.random() < 0.08) {
        this._fgIced = true;
        const W = this.scale.width;
        const iceCard = this.add.rectangle(W/2, FIELD_Y + FIELD_H/2, 160, 56, 0x0f172a, 0.95).setDepth(55).setStrokeStyle(2, 0xf59e0b);
        const iceTxt = this.add.text(W/2, FIELD_Y + FIELD_H/2 - 10, '⏱️ TIMEOUT CALLED\nOpponent ices the kicker!', {fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',align:'center'}).setOrigin(0.5).setDepth(56);
        this.time.delayedCall(2200, () => { iceCard.destroy(); iceTxt.destroy(); this._showFakeFGOption(); });
      } else {
        this._fgIced = false;
        this._showFakeFGOption();
      }
    }
    else if (callId.startsWith('run_') || callId === 'scramble') {
      if (callId.startsWith('run_') && state.toGo<=1 && state.yardLine>=94) {
        this._tryGoalLineSneak(()=>{ if(!this._noHuddleActive&&Math.random()<0.15)this._showTrickOption(callId);else this._startRun(callId); });
      } else if (callId.startsWith('run_') && !this._noHuddleActive && Math.random() < 0.15) {
        this._showTrickOption(callId);
      } else {
        this._startRun(callId);
      }
    }
    else if (callId === 'te_seam')                                        this._startTESeam();
    else if (callId === 'wildcat')                                        this._startWildcat();
    else if (callId === 'sideline_route')                                 this._startSidelineRoute();
    else if (callId === 'screen_pass')                                    this._startScreenPass();
    else if (callId === 'flea_flicker')                                   this._startFleaFlicker();
    else if (callId === 'end_around')                                     this._startEndAround();
    else if (callId === 'qb_sneak')                                       this._startQBSneak();
    else if (callId === 'read_option')                                    this._startReadOption();
    else if (callId === 'qb_kneel')                                       this._startQBKneel();
    else if (callId === 'crossing_route')                                  this._startCrossingRoute();
    else if (callId === 'wr_bubble')                                       this._startWRBubble();
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
    // INNO I28: FG trajectory arc — animated ball path toward uprights
    {const _fgBall=this.add.circle(this.qb.x,this.qb.y,4,made?0x22c55e:0xef4444).setDepth(16);const _fgEndX=FIELD_RIGHT-8;const _fgPeakY=FIELD_Y-28;let _fgT=0;const _fgTk=this.time.addEvent({delay:16,repeat:26,callback:()=>{_fgT+=1/26;const _mx=this.qb.x+(_fgEndX-this.qb.x)*_fgT;const _my=this.qb.y+(_fgPeakY-this.qb.y)*Math.sin(Math.PI*_fgT);_fgBall.setPosition(_mx,_my);if(_fgT>=1)_fgBall?.destroy();}});}
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
      // INNO I65: snap count fake visual — QB counts before handoff
      if(isDraw&&state.possession==='team'){
        let _cnt=0;
        const _cEl=this.add.text(this.qb.x-14,this.qb.y-20,'',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#fbbf24'}).setDepth(20);
        const _cTk=this.time.addEvent({delay:120,repeat:2,callback:()=>{_cnt++;_cEl.setText(`${_cnt}...`);}});
        this.time.delayedCall(380,()=>{_cEl?.destroy();});
      }
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
    // INNO I62: run hole reading — flash gap indicators between OL dots
    if(state.possession==='team'){
      const _rhG=this.add.graphics().setDepth(9);
      const _gaps=[[this.lt,this.lg],[this.lg,this.c],[this.c,this.rg],[this.rg,this.rt]];
      _gaps.forEach(([a,b])=>{
        if(!a?.visible||!b?.visible)return;
        const _mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        const _nearDef=this.defPlayers.some(d=>d.visible&&Math.hypot(d.x-_mid.x,d.y-_mid.y)<28);
        _rhG.fillStyle(_nearDef?0xef4444:0x22c55e,0.55);
        _rhG.fillTriangle(_mid.x-5,_mid.y+6,_mid.x+5,_mid.y+6,_mid.x,_mid.y-6);
      });
      this.time.delayedCall(300,()=>_rhG?.destroy());
    }
    // P83: Crack block 20% chance on runs
    if(!isScramble&&state.possession==='team')this._tryCrackBlock(()=>{});
    // P75: Scramble Slide option inside own 20
    if(isScramble && state.yardLine<=20){ this.time.delayedCall(200,()=>this._showSlideOption()); }
    // P76: Red Zone Run Option inside opp 20
    if(!isScramble && state.yardLine>=80){ this.time.delayedCall(200,()=>this._showRZRunChoice()); }
  }

  // 5-man OL: each lineman blocks assigned defender
  _startOLBlocker() {
    this._regTimer(this.time.addEvent({ delay: 16, loop: true, callback: () => {
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
    }}));
  }

  _aiRushers(dots) {
    const defData = state.opponent?.players || [];
    dots.forEach((dot, i) => {
      if (!dot.visible) return;
      const pPos  = i === 0 ? 'DE' : 'MLB';
      const pData = defData.find(p => p.pos === pPos) || { spd: 74 };
      // Tuned: defenders 38-52 px/s — fast enough to pressure, beatable with moves
      const spd = pxs(pData.spd, 38, 0.52) / 60; // convert to per-frame
      this._regTimer(this.time.addEvent({ delay: 16, loop: true, callback: () => {
        if (this.phase !== 'run') return;
        if (this._engagedCvg?.has(dot)) return; // blocked by blocker
        const dx = this.runner.x - dot.x, dy = this.runner.y - dot.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 13) { this._tackled(); return; }
        dot.x += (dx/dist)*spd; dot.y += (dy/dist)*spd;
        this._syncLbl(dot);
      }}));
    });
  }

  _aiCBsSupport() {
    [this.cb1, this.cb2].forEach(cb => {
      this._regTimer(this.time.addEvent({ delay: 50, loop: true, callback: () => {
        if (this.phase !== 'run') return;
        const dx = this.runner.x - cb.x, dy = this.runner.y - cb.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 13) { this._tackled(); return; }
        if (dist > 90) { cb.x += (dx/dist)*0.55; cb.y += (dy/dist)*0.55; this._syncLbl(cb); }
      }}));
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
    // INNO I20 [SIL]: 2nd half weather escalation — additional fumble multiplier
    const _wxEscMul = this._weatherEscalated?(state.weather==='snow'?1.4:state.weather==='rain'?1.25:1):1;
    // Chemistry < 50 adds butterfingers: +10% base fumble chance
    const _chemMul = (state.chemistry||75) < 50 ? 1.10 : 1.0;
    let fumCh = Math.max(0.02, (0.055 - (rb.str - 70) * 0.0006) * wxFumM * _wxEscMul * _chemMul);
    if (taps < 2) fumCh = Math.min(0.60, fumCh * 4);
    else if (taps >= 4) fumCh *= 0.25;
    // INNO I22: safety closes in on long gains — extra strip pressure
    if(yards>=8){const _sSp=(state.team?.players||[]).find(p=>p.pos==='S')?.spd||74; if(Math.random()<(_sSp/100)*0.18) fumCh=Math.min(0.85,fumCh*2.2);}
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
        this._showInjuryFlash(injPl.name.split(' ').pop());
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
    // P84: Show pump fake button briefly on pass plays
    if(state.possession==='team')this._showPumpFakeBtn(()=>{});
    // P106: No-look pump fake — appears 250ms after snap
    if(state.possession==='team')this.time.delayedCall(250,()=>this._showNoLookPump());
    // P54: Show QB reads overlay before receivers are clickable
    if (state.possession === 'team') { this._qbReadsActive = true; this._showQBReads(); }
    // INNO I30: receiver separation dot — green=open, yellow=contested, red=covered
    if(state.possession==='team') this.time.delayedCall(200,()=>{if(this.phase!=='pass_wait')return;[this.wr1,this.wr2,this.te].forEach(r=>{if(!r?.visible)return;const _nearCB=Math.min(Math.hypot(r.x-(this.cb1?.x||r.x+60),r.y-(this.cb1?.y||r.y)),Math.hypot(r.x-(this.cb2?.x||r.x+60),r.y-(this.cb2?.y||r.y)));const _sc=_nearCB>55?0x22c55e:_nearCB>28?0xfbbf24:0xef4444;const _sg=this.add.circle(r.x,r.y-16,4,_sc,0.8).setDepth(18);this.time.delayedCall(700,()=>_sg?.destroy());});});
    this.time.delayedCall(isAction ? 850 : 550, () => this._buildReceiverTargets(isAction));
    // P93: Second Read Toggle button
    if (state.possession === 'team') {
      this.time.delayedCall(400, () => {
        if (this.phase !== 'pass_wait') return;
        this._secondReadActive = false;
        this._secondReadBtn = this.add.text(this.qb.x + 34, this.qb.y + 14, '👁 2ND READ', {
          fontSize:'8px', fontFamily:'monospace', fontStyle:'bold', color:'#ffffff',
          backgroundColor:'#1d4ed8', padding:{x:4,y:3}
        }).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
        this._secondReadBtn.on('pointerdown', () => {
          this._secondReadActive = !this._secondReadActive;
          this._secondReadBtn?.setText(this._secondReadActive ? '👁 1ST READ' : '👁 2ND READ');
          this._secondReadBtn?.setStyle({backgroundColor: this._secondReadActive ? '#7c3aed' : '#1d4ed8'});
        });
      });
    }
    // P121: Pocket shuffle step — sidestep +8% completion chance, destroys once used
    if(state.possession==='team'){
      this.time.delayedCall(600,()=>{
        if(this.phase!=='pass_wait')return;
        const _sbtn=this.add.text(this.qb.x-34,this.qb.y+28,'↔ SHUFFLE',{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',backgroundColor:'#0f766e',padding:{x:3,y:2}}).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
        this._shuffleEls=_sbtn;
        _sbtn.on('pointerdown',()=>{if(this.phase!=='pass_wait')return;const _x=this.qb.x+(Math.random()<0.5?-8:8);this.qb.setX(clamp(_x,FIELD_LEFT+8,FIELD_RIGHT-8));_sbtn.setStyle({backgroundColor:'#134e4a'});_sbtn.setAlpha(0.5);_sbtn.disableInteractive();this._shuffleUsedBonus=0.08;});
        this.time.delayedCall(2600,()=>_sbtn?.destroy?.());
      });
    }
    // P123: WR double move SHAKE! — +15% comp on covered deep pass
    if(state.possession==='team'&&!this._doubleMoveActive){
      this.time.delayedCall(800,()=>{
        if(this.phase!=='pass_wait')return;
        const _db=this.add.text(this.qb.x+34,this.qb.y+28,'SHAKE!',{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#fbbf24',backgroundColor:'#78350f',padding:{x:3,y:2}}).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
        this._doubleMoveBtn=_db;
        _db.on('pointerdown',()=>{if(this.phase!=='pass_wait')return;this._doubleMoveActive=true;this._doubleMoveMod=0.15;_db.setStyle({backgroundColor:'#451a03'});_db.setAlpha(0.5);_db.disableInteractive();});
        this.time.delayedCall(2200,()=>_db?.destroy?.());
      });
    }
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
        // INNO I33: pocket collapse tween — OL dot converges 10px toward QB
        const _bl=this._pocketDots?.[blockerIdx];if(_bl){this.tweens.add({targets:_bl,x:_bl.x+(this.qb.x-_bl.x)*0.25,y:_bl.y+(this.qb.y-_bl.y)*0.25,duration:200,ease:'Quad.easeIn'});}
      });

      this.time.delayedCall(rushDelay, () => {
        this.time.addEvent({ delay: 16, loop: true, callback: () => {
          if (!this._passRushActive) return;
          const dx = this.qb.x - rusher.x, dy = this.qb.y - rusher.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 14) { this._sack(); return; }
          // P108: Strip-sack button when DL closes within 35px
          if(dist<35&&!this._stripBtnShown){this._stripBtnShown=true;this._showStripBtn();}

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
    // P91: Pass Rush Counter Move button
    this.time.delayedCall(700 + rushDelay, () => {
      if (!this._passRushActive || this._counterBtn) return;
      this._counterBtn = this.add.text(this.qb.x + 34, this.qb.y - 12, '🥊 COUNTER', {
        fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#ffffff',
        backgroundColor:'#7c3aed', padding:{x:5,y:3}
      }).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
      this._counterBtn.on('pointerdown', () => {
        if (!this._counterBtn) return;
        this._counterBtn.destroy(); this._counterBtn = null;
        const olOvr = this._pocketOvrs?.[0] || 77;
        const breakChance = 0.55 + (olOvr - 70) * 0.005;
        if (Math.random() < breakChance) {
          // Counter works — re-block the first beaten rusher for 1200ms
          this._pocketBeaten[0] = false;
          this.pressureTxt?.setText('COUNTER! Rusher reset');
          this.time.delayedCall(1200, () => { this._pocketBeaten[0] = true; });
        } else {
          this.pressureTxt?.setText('Counter FAILED!');
        }
      });
    });
  }

  _clearPassRush() {
    this._passRushActive = false;
    this._pocketBeaten = [false, false, false, false, false];
    this.pressureTxt?.destroy(); this.pressureTxt = null;
    this._spinBtn?.destroy(); this._spinBtn = null; this._spinBtnTxt?.destroy(); this._spinBtnTxt = null;
    // P91: destroy counter button
    this._counterBtn?.destroy(); this._counterBtn = null;
    // P93: destroy second read button
    this._secondReadBtn?.destroy(); this._secondReadBtn = null; this._secondReadActive = false;
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
        this._showInjuryFlash(qb.name.split(' ').pop());
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
    // B-bridge: credit sack to user's top DL/LB
    const _sackDef = (state.team?.players||[]).find(p=>['DL','LB'].includes(p.pos)&&p.id);
    if (_sackDef) this._track(_sackDef.id, 'sack', 1);
    this._endPlay({ yards:-loss, text:`SACK! -${loss} yards`, type:'sack', turnover:false, td:false });
  }

  _animateRoutes(variant) {
    const rzMul = (state.yardLine >= 80 && state.possession === 'team') ? 0.52 : 1;
    const depth = ({ quick:32, medium:62, deep:110 }[variant] || 62) * rzMul;
    // INNO I23: pre-snap route arcs — brief dotted path preview before receivers move
    if(state.possession==='team'){
      const _rg=this.add.graphics().setDepth(7).setAlpha(0.55);
      [{ p:this.wr1, ty: this.wr1.y + (variant==='quick'?22:variant==='deep'?-18:14) },
       { p:this.wr2, ty: this.wr2.y - (variant==='quick'?22:variant==='deep'?-18:14) },
       { p:this.te,  ty: this.te.y  + 16 },
       { p:this.rb,  ty: this.rb.y  - 8  }].forEach(({ p, ty }) => {
        const txd = p === this.rb ? 24 : p === this.te ? depth*0.65 : depth;
        _rg.lineStyle(1,0x60a5fa,0.6);
        _rg.beginPath(); _rg.moveTo(p.x,p.y); _rg.lineTo(p.x+txd, ty); _rg.strokePath();
      });
      this.tweens.add({targets:_rg, alpha:0, duration:360, delay:80, onComplete:()=>_rg?.destroy()});
    }
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
    // P67: mark checkdown window open for 1.2s after receivers appear
    this._checkdownActive=true;
    this.time.delayedCall(1200,()=>{this._checkdownActive=false;});
    const dc = state.opponent?.dcScheme || '4-3';
    const isZone   = dc==='Cover 2' || dc==='Zone Blitz';
    const dbRatings = (state.opponent?.players||[]).filter(p=>['CB','S'].includes(p.pos)).map(p=>p.ovr);
    const _wr1P = state.team?.players?.find(p=>p.pos==='WR')              || {spd:88,ovr:80,name:'WR', id:'wr1'};
    const _wr2P = state.team?.players?.filter(p=>p.pos==='WR')[1]          || {spd:84,ovr:76,name:'WR2',id:'wr2'};
    // P93: swap WR1/WR2 when second read is active
    const receivers = [
      { dot:this.wr1, p:this._secondReadActive ? _wr2P : _wr1P },
      { dot:this.wr2, p:this._secondReadActive ? _wr1P : _wr2P },
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
      // FIX P2: clean up no-look pump fake UI elements on checkdown path
      this._nlPumpEls?.forEach(e=>e?.destroy?.()); this._nlPumpEls=null; this._nlPumpBonus=0;
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
    // E3: wind drift — full strength on deep, half on medium
    const _wdMul=this.passVariant==='deep'?1.4:this.passVariant==='medium'?0.7:0;
    const _wdY=(_wdMul>0&&this._wind&&this._wind.mph>8)?((this._wind.dir==='↑'?-1:this._wind.dir==='↓'?1:0)*(this._wind.mph-8)*_wdMul):0;
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
          // Base 2–5 yards; speed differential adds 0–3 more; tendency: -1 if last 3 all run
          const _last3r=this._callHistory.slice(-3);const _tendRunPen=(_last3r.length===3&&_last3r.every(c=>c==='run'))?-1:0;
          base = 2 + ((rb.spd - 70) * 0.10 * fatMul) + Phaser.Math.Between(-1, 5) + _tendRunPen;
        }
        yards = Math.round(base * qteBonus);
        // INNO I52 applied: run-first adjustment adds rush yards base
        if(this._htAdj==='run')yards=Math.round(yards+8*Math.random());
        // INNO I15 [SIL]: trick play memory — defense keys on end around repeat
        if(this._trickMemCovPenalty&&this._endAroundActive){yards=Math.max(-2,yards-3);}
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
        // Tendency: AI keys on pass if last 3 calls were all pass — -6% comp
        const _last3t=this._callHistory.slice(-3);const _tendPassPen=(_last3t.length===3&&_last3t.every(c=>c==='pass'))?-0.06:0;
        // p.conf bridge: QB confidence +3% if conf≥75, -5% if conf<40
        const _confBonus=(qb.conf||60)>=75?0.03:(qb.conf||60)<40?-0.05:0;
        // Contract year boost: QB in final year of contract +4%
        const _cyBonus=qb.contractYear?0.04:0;
        // Difficulty: veteran/hof AI coverage tightens
        const _diffCovPen=this._diffMod>0?this._diffMod*0.4:0;
        // P64: Hurry-up -5% comp penalty (FIX P1: moved before use to avoid TDZ)
        const _hurryPenalty = this._hurryUpActive ? -0.05 : 0;
        this._hurryUpActive = false;
        // INNO I12: QB hot/cold streak modifier
        const _streakMod = (this._qbStreak||0)>=3?0.08:(this._qbStreak||0)<=-2?-0.05:0;
        let compCh = clamp((0.56+(qb.ovr-50)*0.004-(db.ovr-60)*0.002+momBonus+cbBonus+matchupBonus+qbInjPenalty-defForm.coverageBonus+_hurryPenalty+_tendPassPen+_confBonus+_cyBonus-_diffCovPen+_streakMod)*wxPassM, 0.22, 0.88);
        // INNO I15 [SIL]: trick play memory — defense anticipates flea flicker repeat
        if(this._trickMemCovPenalty&&this._fleaFlickerActive){compCh=Math.max(0.10,compCh-0.20);}
        // P71: motion pre-snap +10% comp on one route
        if(this._motionUsed){compCh=Math.min(0.92,compCh+0.10);this._motionUsed=false;}
        // P54: QB reads modifier
        const qbRead = this._qbReadChoice || 'primary';
        if (qbRead === 'checkdown') { compCh = Math.min(0.92, compCh + 0.15); }
        else if (qbRead === 'go_route') { compCh = Math.max(0.10, compCh - 0.20); }
        // P54: expanded audible hot-route bonus
        const audibleRoute = this._activeAudible ? AUDIBLE_ROUTES[this._activeAudible] : null;
        if (audibleRoute) { compCh = clamp(compCh + audibleRoute.passBonus, 0.10, 0.92); }
        // INNO I52 applied: quick strikes adjustment
        if(this._htAdj==='quick'&&(this.passVariant==='quick'||variant==='quick'||variant==='medium'))compCh=Math.min(0.96,compCh+0.05);
        // P84: pump fake bonus +10% comp
        if(this._pumpFakeBonus){compCh=Math.min(0.92,compCh+this._pumpFakeBonus);this._pumpFakeBonus=0;}
        // P106: no-look pump fake bonus +14% comp
        if(this._nlPumpBonus){compCh=Math.min(0.92,compCh+this._nlPumpBonus);this._nlPumpBonus=0;}
        // P82: DL stunt — opponent sack bonus (only applies when opp has possession)
        if(this._dlStunt&&state.possession!=='team'){intCh=Math.min(0.30,intCh+0.08);this._dlStunt=false;}
        // P89: Blitz package — higher INT/sack but risky if broken
        if(this._blitzPackage&&state.possession!=='team'){if(Math.random()<0.40){intCh=Math.min(0.35,intCh+0.15);}this._blitzPackage=false;}
        // B4: QB personality modifiers — 'clutch' +8% in Q4; 'money' -8% when fatigued
        const _qbPerso=qb.personality;
        if(_qbPerso==='clutch'&&state.quarter>=4)compCh=Math.min(0.92,compCh+0.08);
        if(_qbPerso==='money'&&(this._fatigue[qb.id]||0)>70)compCh=Math.max(0.10,compCh-0.08);
        // B3: crowd noise home field — -5% comp for opponent when crowd upgrade active
        if(this._crowdNoise&&state.possession!=='team')compCh=Math.max(0.05,compCh-0.05);
        // INNO I38: field position penalty — drives starting yardLine<=10 get -4% comp
        if(this._fieldPosPenalty)compCh=Math.max(0.08,compCh-0.04);
        // P121: pocket shuffle step bonus
        if(this._shuffleUsedBonus){compCh=Math.min(0.92,compCh+this._shuffleUsedBonus);this._shuffleUsedBonus=0;}
        // P123: WR double move bonus
        if(this._doubleMoveActive){compCh=Math.min(0.92,compCh+this._doubleMoveMod);this._doubleMoveActive=false;this._doubleMoveMod=0;}
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
          // INNO I12: track incompletions for QB cold streak
          this._qbStreak=Math.max(-3,(this._qbStreak||0)-1);if(this._qbStreak===-2)this._broadcastBanner('❄️ QB STRUGGLING','#93c5fd');
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
    if (td) {
      Sound.td(); state.stats.team.td++;
      // Endorsement activation toast
      const _scorer=this._lastReceiver||(call==='scramble'?qb:rb);
      if(_scorer?.endorsed){this._broadcastBanner(`💰 ${_scorer.name?.split(' ').pop()} ENDORSEMENT PAYS OFF!`,'#f59e0b');}
      else{this._tdFlash('TOUCHDOWN! 🏈','#f59e0b');}
    }
    else if (yards >= state.toGo){ Sound.firstDown(); }
    else if (!td && yards <= 0)  { Sound.tackle(); }
    // Broadcast lower-third on big gains (15+ yards, non-TD)
    if (!td && (yards||0) >= 15) {
      const _gainer=isRun?(call==='scramble'?qb:rb):this._lastReceiver;
      // INNO I11: star player designation for OVR >= 85
      if(_gainer){const _isStar=(_gainer.ovr||70)>=85;const _nm=_gainer.name?.split(' ').pop()||_gainer.pos;this._broadcastBanner((_isStar?'⭐ ':'')+_nm+' — '+yards+' YDS'+(_isStar&&yards>=20?' 🔥':''),'#22c55e');}
    }

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
    // P83: crack block bonus +2-4 yds on run
    if(isRun&&this._crackBlock){const cbYds=Phaser.Math.Between(2,4);yards=Math.min(yards+cbYds,99-state.yardLine);this._crackBlock=false;}
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
    // INNO I12: QB hot/cold streak tracking
    if(isPass){
      if(yards>0){this._qbStreak=Math.min(5,(this._qbStreak||0)+1);if(this._qbStreak===3)this._broadcastBanner('🔥 QB ON A HOT STREAK','#f59e0b');}
      else{this._qbStreak=Math.max(-3,(this._qbStreak||0)-1);if(this._qbStreak===-2)this._broadcastBanner('❄️ QB STRUGGLING','#93c5fd');}
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
    // P102: store replay trail on significant plays
    this._storeReplayTrail(result.yards||0, result.text||'');
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
      // INNO I58: end zone celebration — dot spins and ball arcs on TD
      if(this.runner){
        this.tweens.add({targets:this.runner,angle:360,duration:480,ease:'Quad.easeOut',onComplete:()=>{this.runner.angle=0;}});
        const _cb=this.add.circle(this.runner.x,this.runner.y,5,0xfbbf24).setDepth(16);
        this.tweens.add({targets:_cb,y:this.runner.y-32,alpha:0,duration:500,onComplete:()=>_cb?.destroy()});
      }
      this._pendingPAT = result.type === 'td'; // user TD only; AI TD goes through _aiTouchdown
    } else if (result.turnover) {
      driveEnd = result.type==='int'?'INT':result.type==='fumble'?'FUM':result.type==='fg'?'FG':result.type==='fg_miss'?'NO FG':'PUNT';
      state.possession='opp'; state.yardLine=Math.max(5,100-state.yardLine); state.down=1; state.toGo=10;
    } else {
      state.yardLine = Math.min(99, state.yardLine + result.yards);
      if (result.yards >= state.toGo) { state.down=1; state.toGo=10; this._lastPlayGainedFirstDown=true;
        // INNO I35: first-down conversion flash — LOS line pulses bright green 400ms
        const _fdFlash=this.add.graphics().setDepth(28);_fdFlash.lineStyle(4,0x22c55e,0.9);const _fdx=FIELD_LEFT+(state.yardLine/100)*FIELD_W;_fdFlash.lineBetween(_fdx,FIELD_Y,_fdx,FIELD_Y+FIELD_H);this.tweens.add({targets:_fdFlash,alpha:0,duration:400,onComplete:()=>_fdFlash?.destroy?.()});
      }
      else { state.down++; state.toGo=Math.max(1,state.toGo-result.yards); }
      // P51: offensive holding — repeat the down (undo the increment)
      if(this._p51Hold){this._p51Hold=false;state.down=Math.max(1,state.down-1);state.toGo=Math.min(state.toGo+10,40);}
      if (state.down > 4) { driveEnd='DOWNS'; state.possession='opp'; state.yardLine=Math.max(5,100-state.yardLine); state.down=1; state.toGo=10; }
    }
    if (driveEnd) {
      state.drives.push({...state.currentDrive, result:driveEnd}); state.currentDrive={poss:state.possession,plays:0,yards:0,start:state.yardLine};
      // P94: Drive Summary Card — 2-second overlay
      if (!this._driveSummaryShown) {
        this._driveSummaryShown = true;
        const dr = state.drives[state.drives.length-1];
        const W = this.scale.width;
        const card = this.add.rectangle(W/2, FIELD_Y + FIELD_H/2, 140, 52, 0x0f172a, 0.92).setDepth(50).setStrokeStyle(2, 0x60a5fa);
        const resColor = driveEnd==='TD'?0xf59e0b:driveEnd==='FG'?0x22c55e:0xef4444;
        const lbl = this.add.text(W/2, FIELD_Y + FIELD_H/2 - 14, `— DRIVE END: ${driveEnd} —`, {fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:Phaser.Display.Color.IntegerToColor(resColor).rgba}).setOrigin(0.5).setDepth(51);
        const detail = this.add.text(W/2, FIELD_Y + FIELD_H/2 + 4, `${dr.plays||0} plays • ${dr.yards||0} yds`, {fontSize:'9px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(51);
        this.time.delayedCall(2000, () => { card.destroy(); lbl.destroy(); detail.destroy(); this._driveSummaryShown = false; });
      }
    }
    state.plays++;
    if (state.plays%8===0) { state.quarter=Math.min(4,state.quarter+1); this._recoverFatigue(); }
    // P100: 100-play milestone flash
    if(state.plays===100){const W=this.scale.width;const m=this.add.text(W/2,FIELD_Y+FIELD_H/2,'🎖️ 100 PLAYS PLAYED!',{fontSize:'18px',fontFamily:'monospace',fontStyle:'bold',color:'#fbbf24',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(60);this.tweens.add({targets:m,alpha:0,y:m.y-40,delay:800,duration:1200,onComplete:()=>m?.destroy?.()});}
    // P41: momentum drain on turnover
    if(result.turnover) this._updateMomentum(-12);
    // INNO I27: turnover celebration flash — gold "TURNOVER!" 800ms before ball reset
    if(result.turnover&&(result.type==='int'||result.type==='fumble')){const W=this.scale.width;const _tf=this.add.text(W/2,FIELD_Y+FIELD_H/2-20,'TURNOVER!',{fontSize:'22px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(55);this.tweens.add({targets:_tf,scaleX:1.3,scaleY:1.3,yoyo:true,duration:220,onComplete:()=>{this.tweens.add({targets:_tf,alpha:0,duration:400,onComplete:()=>_tf?.destroy?.()});}});}
    this.events.emit('playResult', result);
    const hud = this.scene.get('Hud');
    hud?.events?.emit('playResult', result);
    hud?.events?.emit('possessionChange', state.possession);
    // P42: offer challenge on turnovers (INT/fumble) if not yet used
    if(!this._challengeUsed && result.turnover && (result.type==='int'||result.type==='fumble')) {
      this.time.delayedCall(600, ()=>this._showChallengeOption());
    }
    // INNO I16 [SIL]: comeback tracking — track max deficit; show overlay when user erases it
    const _curDef=state.score.opp-state.score.team;
    if(_curDef>this._maxDeficit)this._maxDeficit=_curDef;
    if(!this._comebackShown&&this._maxDeficit>=7&&state.score.team>=state.score.opp&&result.td){this._comebackShown=true;this.time.delayedCall(400,()=>this._broadcastBanner(`🔥 COMEBACK! Erased ${this._maxDeficit}-pt deficit`,'#f59e0b'));}
    // P77: Penalty flag — 3% chance on AI plays, show Accept/Decline
    if(state.possession==='opp'&&!result.td&&!result.turnover&&Math.random()<0.03){
      this.time.delayedCall(400,()=>this._showPenaltyChoice('OFFENSIVE HOLDING',10,'team'));
      return;
    }
    this._afterPlay();
  }

  _afterPlay() {
    // INNO I56: mid-game weather progression check for user plays
    if(state.quarter>=3&&!this._wxProgressed){
      this._wxProgressed=true;
      const _wxUp={clear:'rain',rain:'snow',snow:'snow'};
      if(Math.random()<0.25){
        const _newWx=_wxUp[state.weather];
        if(_newWx&&_newWx!==state.weather){
          state.weather=_newWx;
          const _W=this.scale.width;
          const _wxT=this.add.text(_W/2,FIELD_Y+40,`🌧 WEATHER CHANGE — ${_newWx.toUpperCase()}`,{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#93c5fd',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(25);
          this.time.delayedCall(2000,()=>_wxT?.destroy());
        }
      }
    }
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
    // FIX P3: track all created elements so auto-dismiss cleans up buttons too
    const _nhEls=[bg,t,...mkBtn(W/2-88,'HUDDLE UP','Normal play call',0x334155,launch),...mkBtn(W/2+88,'NO HUDDLE 🚀','Defense out of position',0x22c55e,launchNH)];
    // Auto-dismiss after 3.5s
    this.time.delayedCall(3500,()=>{
      try{_nhEls.forEach(e=>e?.destroy?.());}catch{}
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
    // P100: Defensive play call mini-game (once per drive, skip in hurry-up/drill)
    if(!this._defMiniGameUsed && state.quarter<=4 && !state._drillMode) {
      this._defMiniGameUsed=true;
      this._showDefPlayCall(()=>{ this._defMiniGameUsed=false; this._launchAIDrive(); });
      return;
    }
    this._defMiniGameUsed=false;
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
    // INNO I13: Disguise — AI reads a random coverage instead of real call
    const _calls=['cover2','man','blitz','prevent'];
    const call = this._defDisguise ? _calls[Math.floor(Math.random()*_calls.length)] : (this._defCall || 'cover2');
    this._defDisguise = false;
    // INNO I26: zone coverage visual — brief arc overlay for Cover2/Prevent
    if(call==='cover2'||call==='prevent'){const _zvG=this.add.graphics().setDepth(8);_zvG.lineStyle(1,call==='cover2'?0x3b82f6:0x7c3aed,0.35);_zvG.strokeEllipse(FIELD_LEFT+FIELD_W*0.3,FIELD_Y+FIELD_H*0.3,FIELD_W*0.52,FIELD_H*0.55);_zvG.strokeEllipse(FIELD_LEFT+FIELD_W*0.7,FIELD_Y+FIELD_H*0.3,FIELD_W*0.52,FIELD_H*0.55);this.time.delayedCall(900,()=>_zvG?.destroy());}
    // INNO I17: AI personality — adapt strategy to score/down situation
    const _aiScore=state.score.opp, _usScore=state.score.team, _aiDiff=_aiScore-_usScore;
    const _aiIsLosingBig=_aiDiff<-10&&state.quarter>=3;
    const _aiIsWinningBig=_aiDiff>10&&state.quarter>=3;
    const _aiPersonality = _aiIsLosingBig?'desperate':_aiIsWinningBig?'conservative':'balanced';
    // Desperate: hurry-up pass-heavy; Conservative: run more to bleed clock
    if(_aiPersonality==='desperate')this._aiHurryUp=true;
    // Reset _defSpd to base before applying call modifier (prevents stacking across drives)
    const _dBase = state.team?.players?.find(p=>p.pos==='QB')||{spd:66};
    this._defSpd = pxs(_dBase.spd, 90, 1.2);
    if (call === 'man')          { this._defSpd *= 1.22; this._aiRunSpeed *= 1.06; }
    else if (call === 'blitz')   { this._aiRunSpeed *= 1.12; this._launchBlitzPursuer();
      // INNO I34: blitz telegraph — LB dots nudge 15px forward pre-snap (only if !_defDisguise at call time)
      if(this._pocketDots?.length){const _bTgt=this._pocketDots.slice(0,2);_bTgt.forEach(d=>{if(!d)return;this.tweens.add({targets:d,y:d.y-15,duration:180,yoyo:true,ease:'Quad.easeOut'});});}
    }
    else if (call === 'prevent') { this._aiRunSpeed *= 0.84; this._defSpd *= 0.88; }
    // P25: hurry-up overrides pass chance and speeds up AI RB
    // INNO I17: personality modifies AI pass tendency
    let passCh = this._aiHurryUp ? 0.65 : ({cover2:0.35, man:0.45, blitz:0.55, prevent:0.20}[call] || 0.35);
    if(_aiPersonality==='conservative') passCh=Math.max(0.12, passCh-0.15); // run heavy to bleed clock
    if(_aiPersonality==='desperate') passCh=Math.min(0.80, passCh+0.20); // pass heavy to catch up
    if (this._aiHurryUp) { this._aiRunSpeed *= 1.08; }
    // INNO I21: down & distance matrix — tune AI pass tendency per situation
    if(this.aiDown===2&&this.aiToGo<=3) passCh=Math.min(passCh,0.30);
    if(this.aiDown===3&&this.aiToGo>=8) passCh=Math.min(0.88,passCh+0.22);
    if(this.aiDown===3&&this.aiToGo<=3) passCh=Math.max(0.10,passCh-0.20);
    if(state.yardLine<=15) passCh=Math.min(0.50,passCh);
    // INNO I37: AI red zone tendency — at yardLine>=90 run at 65%+ rate
    if(state.yardLine>=90) passCh=Math.max(0.08,passCh-0.25);
    // INNO I61: AI no-repeat — prevent 3 consecutive same play type
    const _aiLast3=(this._aiCallLog||[]).slice(-3);
    const _allRun=_aiLast3.length>=3&&_aiLast3.every(t=>t==='run');
    const _allPass=_aiLast3.length>=3&&_aiLast3.every(t=>t==='pass');
    if(_allRun) passCh=Math.max(passCh,0.72); // force pass
    if(_allPass) passCh=Math.min(passCh,0.28); // force run
    const _aiCallType=Math.random()<passCh?'pass':'run';
    this._aiCallLog=[...(this._aiCallLog||[]).slice(-4),_aiCallType];
    if (_aiCallType==='pass') { this._startAIPass(); return; }
    this.phase = 'ai_run';
    this._stackItBonus = false;
    const hud = this.scene.get('Hud');
    hud?.events?.emit('resetHud'); hud?.events?.emit('possessionChange', 'opp');
    Sound.whistle();
    // INNO I51: give user a controllable S dot to defend
    this._userDefActive=true;
    const _udX=FIELD_LEFT+80, _udY=FIELD_Y+FIELD_H/2;
    this._userDefDot=this._userDefDot||this.add.circle(_udX,_udY,8,0x60a5fa).setDepth(12);
    this._place(this._userDefDot,_udX,_udY); this._show(this._userDefDot,true);
    const _udLbl=this.add.text(_udX,_udY,'S',{fontSize:'7px',fontFamily:'monospace',color:'#fff'}).setOrigin(0.5).setDepth(13);
    this._userDefLbl=_udLbl;
    const _udHint=this.add.text(this.scale.width/2,FIELD_Y+FIELD_H+14,'WASD to move your Safety — tackle the runner!',{fontSize:'9px',fontFamily:'monospace',color:'#60a5fa'}).setOrigin(0.5).setDepth(20);
    this.time.delayedCall(2400,()=>_udHint?.destroy());
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
    // INNO I64: pressure ring — shrinks toward AI QB; BLITZ at close range = bonus sack
    {const _prG=this.add.graphics().setDepth(9); let _prR=100; let _prDone=false;
    this._regTimer(this.time.addEvent({delay:32,loop:true,callback:()=>{
      if(this.phase!=='ai_pass'||_prDone){_prG?.destroy();return;}
      _prR-=4; _prG.clear();
      _prG.lineStyle(1.5,_prR<40?0xef4444:0xf59e0b,0.5);
      _prG.strokeCircle(this.dl.x,this.dl.y,Math.max(10,_prR));
      if(_prR<=30&&!_prDone){_prDone=true;this._blitzPressureBonus=(this._blitzPressureBonus||0)+0.15;_prG?.destroy();}
    }}));}
    this._passRushMode = false; this._passRushCoverBreak = false;
    // P66: Rush Lane choice
    this._rushLaneBonus = null;
    this.time.delayedCall(100,()=>this._showRushLane());
    // P74: Bump Coverage
    this.time.delayedCall(120,()=>this._showBumpCoverage());
    // P96: Coverage Assignment
    this._coverageAssignMod=0; this.time.delayedCall(140,()=>this._showCoverageAssign());
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
    // INNO I64: apply pressure ring blitz bonus to sack check
    const _prSackBonus=this._blitzPressureBonus||0; this._blitzPressureBonus=0;
    if (dist < 22 || (dist < 40 && (_rlSackBonus>0||_prSackBonus>0) && Math.random()<(_rlSackBonus+_prSackBonus))) {
      this.phase = 'result';
      Sound.tackle?.() || Sound.whistle?.();
      this._tdFlash('SACK! QB DOWN 🏈','#22c55e');
      this.aiDown++; this.aiToGo = Math.min(this.aiToGo+8, 30);
      state.stats.team.sacks = (state.stats.team.sacks||0)+1;
      const _blitzLB=(state.team?.players||[]).find(p=>p.pos==='LB'&&p.id); if(_blitzLB)this._track(_blitzLB.id,'sack',1);
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
    this._jumpRouteActive = false;
    // P97: Jump Route — brief window mid-flight
    this.time.delayedCall(140, ()=>this._showJumpRoute());
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
    const intThresh=(call==='man'?56:call==='cover2'?44:32)-(this._passRushCoverBreak?20:0)+(this._coverageAssignMod||0)+(this._jumpRouteActive?22:0);
    this._passRushCoverBreak=false; this._coverageAssignMod=0; this._jumpRouteActive=false;
    if(defDist<intThresh){
      Sound.int();
      state.stats.team.int=(state.stats.team.int||0)+1;
      this._tdFlash('INTERCEPTED! 🏈','#22c55e');
      const _intCB=(state.team?.players||[]).find(p=>['CB','S'].includes(p.pos)&&p.id); if(_intCB)this._track(_intCB.id,'defInt',1);
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
    // Difficulty: veteran/hof AI gets comp boost; rookie/easy AI gets penalty
    const catchCh=Math.min(0.88,Math.max(0.22,(0.58+(wrD.ovr-cbD.ovr)*0.007+bonus+hurryMod+(this._diffMod||0)*0.5)*wxCatchM));
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
      // P99: Onside kick option if trailing late
      else if(state.quarter>=4&&(state.score.opp-state.score.team)>=8){this.time.delayedCall(2000,()=>this._showOnsideKickOption());}
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
    this._regTimer(this.time.addEvent({ delay: 16, loop: true, callback: () => {
      if (this.phase !== 'ai_run') return;
      const dx = this.aiRunner.x - pursuer.x, dy = this.aiRunner.y - pursuer.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 18) { this._userTackle(); return; }
      pursuer.x += (dx/dist)*spd; pursuer.y += (dy/dist)*spd;
      this._syncLbl(pursuer);
    }}));
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
    // INNO I13: Disguise Defense toggle — AI can't read your coverage call
    let _disguiseOn=false;
    const _dgy=startY+2*(btnH+6)+8;
    const _dgBg=this.add.rectangle(px,_dgy,340,30,0x0d1020).setDepth(37).setStrokeStyle(1,0x7c3aed,0.5).setInteractive({useHandCursor:true});
    const _dgTx=this.add.text(px,_dgy,'🎭 DISGUISE COVERAGE — AI can\'t read your call',{fontSize:'8px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(38);
    _dgBg.on('pointerdown',()=>{_disguiseOn=!_disguiseOn;this._defDisguise=_disguiseOn;_dgBg.setFillStyle(_disguiseOn?0x3b0764:0x0d1020);_dgTx.setColor(_disguiseOn?'#a78bfa':'#94a3b8');});
    els.push(_dgBg,_dgTx);
    // P124: Fresh DL sub — once per half, +12% next blitz sack chance
    const _freshH=state.quarter<=2?'H1':'H2';
    const _freshUsed=_freshH==='H1'?this._freshDlH1:this._freshDlH2;
    const _fry=_dgy+36;
    const _frBg=this.add.rectangle(px,_fry,340,26,_freshUsed?0x0d1020:0x0f2820).setDepth(37).setStrokeStyle(1,_freshUsed?0x1e293b:0x22c55e,0.5).setInteractive({useHandCursor:true});
    const _frTx=this.add.text(px,_fry,_freshUsed?'🔄 FRESH DL — used this half':'🔄 FRESH DL SUB — +12% sack (once/half)',{fontSize:'8px',fontFamily:'monospace',color:_freshUsed?'#334155':'#86efac'}).setOrigin(0.5).setDepth(38);
    if(!_freshUsed){_frBg.on('pointerdown',()=>{this._freshDlUsed=true;if(_freshH==='H1')this._freshDlH1=1;else this._freshDlH2=1;this._aiRunSpeed*=1.12;_frBg.setFillStyle(0x0d1020);_frTx.setColor('#334155');this._tdFlash('🔄 FRESH DL — sack bonus active','#22c55e');});}
    els.push(_frBg,_frTx);
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
    // INNO I31: AI 2-min urgency — reduce inter-play delay when AI is trailing late
    const _i31Urgent = state._drillMode && state.score.opp < state.score.team;
    state.stats.opp.rushYds += yardsGiven;
    state.yardLine = Math.max(1, state.yardLine - yardsGiven);
    this._aiDrivePlays = (this._aiDrivePlays||0) + 1;
    this._aiDriveYards = (this._aiDriveYards||0) + yardsGiven;
    if (yardsGiven >= this.aiToGo) { this.aiDown=1; this.aiToGo=10; Sound.firstDown(); }
    else { this.aiDown++; this.aiToGo=Math.max(1,this.aiToGo-yardsGiven); }
    // P122: personal foul — 8% chance on AI run >8yds
    if(yardsGiven>8&&!this._persFoulChecked&&Math.random()<0.08){this._persFoulChecked=true;const _pfT=this.add.text(this.scale.width/2,FIELD_Y+FIELD_H/2-30,'🚩 PERSONAL FOUL! +15 yds, Auto 1st',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#fde047',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(30);this.time.delayedCall(1600,()=>_pfT?.destroy?.());state.yardLine=Math.max(1,state.yardLine-15);this.aiDown=1;this.aiToGo=10;}
    else if(yardsGiven<=8){this._persFoulChecked=false;}
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
    const _tklDef=(state.team?.players||[]).find(p=>['LB','CB','S'].includes(p.pos)&&p.id); if(_tklDef)this._track(_tklDef.id,'tkl',1);
    // B-bridge: opponent player injury chance on hard tackle
    if(yardsGiven>0 && Math.random()<0.04){ const _oppHurt=(state.opponent?.players||[]).find(p=>['RB','WR','QB'].includes(p.pos)&&p.id); if(_oppHurt&&!state.oppPlayerInjuries.find(i=>i.id===_oppHurt.id)) state.oppPlayerInjuries.push({id:_oppHurt.id,pos:_oppHurt.pos,name:_oppHurt.name,type:'game'}); }
    const result = { text:`Stop! AI +${yardsGiven}yd${yardsGiven!==1?'s':''}`, yards:yardsGiven, td:false, turnover:false };
    this.events.emit('playResult', result);
    const hud = this.scene.get('Hud');
    hud?.events?.emit('playResult', result); hud?.events?.emit('possessionChange',state.possession);
    // INNO I56: mid-game weather progression — 25% chance weather worsens at Q3
    if(state.quarter>=3&&!this._wxProgressed){
      this._wxProgressed=true;
      const _wxUp={clear:'rain',rain:'snow',snow:'snow'};
      if(Math.random()<0.25){
        const _newWx=_wxUp[state.weather];
        if(_newWx&&_newWx!==state.weather){
          state.weather=_newWx;
          const _W=this.scale.width;
          const _wxT=this.add.text(_W/2,FIELD_Y+40,`🌧 WEATHER CHANGE — ${_newWx.toUpperCase()}`,{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#93c5fd',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(25);
          this.time.delayedCall(2000,()=>_wxT?.destroy());
        }
      }
    }
    if (!state._halfShown && state.quarter>=3) { state._halfShown=true; this.time.delayedCall(1600,()=>this._showHalftime()); return; }
    if (state.quarter>4 || state.plays>=40) {
      this.time.delayedCall(1600, ()=>this.scene.start('GameOver'));
    } else if (state.possession==='opp') {
      this.time.delayedCall(_i31Urgent?700:1800, ()=>this._startAIDrive());
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
    // Weather escalation: wind shifts direction/intensity at halftime
    if(this._wind){const _wdirs=['←','→','↑','↓'];this._wind={dir:_wdirs[Phaser.Math.Between(0,3)],mph:clamp((this._wind.mph||8)+Phaser.Math.Between(-3,5),3,22)};}
    // INNO I20 [SIL]: weather escalation in 2nd half — rain/snow worsens
    if(state.weather==='rain'||state.weather==='snow'){this._weatherEscalated=true;}
    const W=this.scale.width, H=this.scale.height;
    const t=state.team?.ab||'YOU', o=state.opponent?.ab||'OPP';
    const bg=this.add.rectangle(W/2,H/2,W,H,0x0a0f1a,0.96).setDepth(62);
    const ht=this.add.text(W/2,H/2-100,'HALFTIME',{fontSize:'38px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(63);
    const sc=this.add.text(W/2,H/2-46,`${t}  ${state.score.team} — ${state.score.opp}  ${o}`,{fontSize:'26px',fontFamily:'monospace',fontStyle:'bold',color:'#f1f5f9'}).setOrigin(0.5).setDepth(63);
    // Halftime comparison bars
    const _els=[bg,ht,sc];
    const _barStats=[
      {lbl:'PASS',tv:state.stats.team.passYds||0,ov:state.stats.opp.passYds||0},
      {lbl:'RUSH',tv:state.stats.team.rushYds||0,ov:state.stats.opp.rushYds||0},
      {lbl:'TDs', tv:state.stats.team.td||0,      ov:state.stats.opp.td||0, scale:10},
    ];
    _barStats.forEach(({lbl,tv,ov,scale},i)=>{
      const _max=Math.max(1,tv,ov);const _barMaxW=120;const _y=H/2+14+i*24;
      this.add.text(W/2-_barMaxW-6,_y,lbl,{fontSize:'8px',fontFamily:'monospace',color:'#334155'}).setOrigin(1,0.5).setDepth(63);
      // Team bar (left-aligned from center)
      const _tw=Math.round((tv/_max)*_barMaxW);
      if(_tw>0){const _tb=this.add.rectangle(W/2-_barMaxW+_tw/2,_y,_tw,10,0x22c55e,0.85).setDepth(63);_els.push(_tb);}
      this.add.text(W/2-_barMaxW-12,_y,String(tv),{fontSize:'8px',fontFamily:'monospace',color:'#22c55e'}).setOrigin(1,0.5).setDepth(63);
      // Opp bar (right-aligned from center)
      const _ow=Math.round((ov/_max)*_barMaxW);
      if(_ow>0){const _ob=this.add.rectangle(W/2+_barMaxW-_ow/2,_y,_ow,10,0xef4444,0.85).setDepth(63);_els.push(_ob);}
      this.add.text(W/2+_barMaxW+12,_y,String(ov),{fontSize:'8px',fontFamily:'monospace',color:'#ef4444'}).setOrigin(0,0.5).setDepth(63);
    });
    // Wind update badge if changed
    if(this._wind){const _wEl=this.add.text(W/2,H/2+82,`💨 Wind shifts: ${this._wind.dir} ${this._wind.mph}mph`,{fontSize:'9px',fontFamily:'monospace',color:'#64748b'}).setOrigin(0.5).setDepth(63);_els.push(_wEl);}
    // INNO I20 [SIL]: weather escalation warning panel
    if(this._weatherEscalated){const _wxWarn=this.add.text(W/2,H/2+96,`⚠ ${state.weather==='snow'?'SNOW':'RAIN'} INTENSIFIES — fumble risk up 2nd half`,{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#ef4444'}).setOrigin(0.5).setDepth(63);_els.push(_wxWarn);}
    const sub=this.add.text(W/2,H/2+(this._weatherEscalated?110:98),'2nd Half Kickoff',{fontSize:'11px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(63);
    _els.push(sub);
    // INNO I52: half-time adjustment cards — pick 1 of 3 coaching tweaks
    const _adjCards=[
      {label:'QUICK STRIKES',desc:'+5% comp% on quick/medium routes',fn:()=>{this._htAdj='quick';}},
      {label:'TIGHTEN UP',   desc:'+6% INT chance on opp passes',   fn:()=>{this._htAdj='def';}},
      {label:'RUN FIRST',    desc:'+8 rush yards base this half',    fn:()=>{this._htAdj='run';}},
    ];
    const el_depth=63;
    const panelH=220; const px=W/2; const py=H/2;
    const _adjY=py+panelH/2-54;
    const _adjTitle=this.add.text(px,_adjY-18,'COACHING ADJUSTMENT',{fontSize:'7px',fontFamily:'monospace',fontStyle:'bold',color:'#334155',letterSpacing:2}).setOrigin(0.5).setDepth(el_depth+2);
    _els.push(_adjTitle);
    _adjCards.forEach((ac,i)=>{
      const _ax=px+(i-1)*126;
      const _ab=this.add.rectangle(_ax,_adjY+12,112,36,0x1e293b).setDepth(el_depth+2).setStrokeStyle(1,0x475569,0.7).setInteractive({useHandCursor:true});
      const _al=this.add.text(_ax,_adjY+5,ac.label,{fontSize:'7px',fontFamily:'monospace',fontStyle:'bold',color:'#e2e8f0'}).setOrigin(0.5).setDepth(el_depth+3);
      const _ad=this.add.text(_ax,_adjY+18,ac.desc,{fontSize:'6px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(el_depth+3);
      _ab.on('pointerover',()=>_ab.setFillStyle(0x334155,1));
      _ab.on('pointerout',()=>_ab.setFillStyle(0x1e293b,1));
      _ab.on('pointerdown',()=>{ac.fn();_al.setColor('#22c55e');_adjCards.forEach((_,j)=>{if(j!==i)_ab.setAlpha(0.4);});});
      _els.push(_ab,_al,_ad);
    });
    Sound.whistle();
    this.time.delayedCall(4000,()=>{
      this.tweens.add({targets:_els,alpha:0,duration:500,onComplete:()=>{
        _els.forEach(e=>e?.destroy?.());
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
    // INNO I38: set field position penalty flag if starting inside own 10
    this._fieldPosPenalty = catchYard <= 10;
    this._showReturnLaneChoice(catchYard);
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
    mkBtn(W/2+165,H/2+10,'ONSIDE','~15% recovery',0xf59e0b,()=>this._showOnsideDirectionChoice());
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
  _resolveOnsideKick(dirBonus=0) {
    const W = this.scale.width, H = this.scale.height;
    const stOvr = state.team?.players?.filter(p=>p.pos==='K').reduce((s,p,_,a)=>s+p.ovr/a.length,0)||70;
    const baseRecoverCh = Math.min(0.28, 0.10 + (stOvr-60)*0.002) + dirBonus;
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

  // Broadcast lower-third: slides up from bottom, persists 2.2s
  _broadcastBanner(msg, col) {
    const W=this.scale.width, H=this.scale.height;
    const bg=this.add.rectangle(W/2,H,W,28,0x050d18,0.92).setDepth(52);
    const accent=this.add.rectangle(0,H,4,28,Phaser.Display.Color.HexStringToColor(col||'#22c55e').color,1).setDepth(53).setOrigin(0,0.5);
    const txt=this.add.text(W/2-2,H,'● '+msg,{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:col||'#22c55e',stroke:'#000',strokeThickness:2}).setOrigin(0.5,0.5).setDepth(53);
    const targetY=H-14;
    this.tweens.add({targets:[bg,accent,txt],y:targetY,duration:220,ease:'Sine.easeOut',onComplete:()=>{
      this.time.delayedCall(2200,()=>this.tweens.add({targets:[bg,accent,txt],y:H+20,duration:260,ease:'Sine.easeIn',onComplete:()=>{bg.destroy();accent.destroy();txt.destroy();}}));
    }});
  }

  // Snap flash — white pulse from ball position on snap
  _snapFlash() {
    const gfx=this.add.graphics().setDepth(49);
    let r=0;
    const t=this.time.addEvent({delay:16,loop:true,callback:()=>{
      r+=4; gfx.clear(); if(r>44){t.remove();gfx.destroy();return;}
      gfx.lineStyle(2,0xffffff,Math.max(0,0.7-(r/44)*0.7));
      gfx.strokeCircle(this.ball.x,this.ball.y,r);
    }});
  }

  // ─── UPDATE LOOP ──────────────────────────────────────────────────────────

  update(time, delta) {
    const k = this.keys, dp = this._dpadState;
    const dt = delta / 1000;
    // V3: clear trail when not actively running
    if(this.phase!=='run'&&this._trailPts?.length){this._trailPts=[];this._trailGfx?.clear();}

    // Player spotlight — 3 stars under ball carrier if hot game (50+ rush / 120+ pass)
    if(this.phase==='run'&&this.runner){
      const _rId=this._runnerData?.id;const _rStats=_rId?state.playerStats[_rId]:null;
      const _isHot=(_rStats?.rushYds||0)>=50||(_rStats?.passYds||0)>=120;
      if(_isHot&&!this._spotlightGfx){
        this._spotlightGfx=this.add.graphics().setDepth(4);
      }
      if(this._spotlightGfx){
        this._spotlightGfx.clear();
        if(_isHot){
          this._spotlightGfx.fillStyle(0xfbbf24,0.85);
          [-8,0,8].forEach(ox=>this._spotlightGfx.fillTriangle(this.runner.x+ox-4,this.runner.y+16,this.runner.x+ox+4,this.runner.y+16,this.runner.x+ox,this.runner.y+11));
        }
      }
    } else if(this._spotlightGfx){this._spotlightGfx.clear();}

    // Field degradation: desaturate grass alpha after 20+ plays
    if(!this._fieldDegraded&&state.plays>=20){this._fieldDegraded=true;this.tweens.add({targets:this.children.list.filter(c=>c.type==='Rectangle'&&c.y>FIELD_Y&&c.y<FIELD_Y+FIELD_H&&c.fillColor===0x14532d),alpha:0.82,duration:2000});}

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
      // INNO I14 [SIL]: pressure escalation — pulse + camera shake once at ≤5s
      if(_pcs<=5&&!this._playClockShook){this._playClockShook=true;this.cameras.main.shake(180,0.004);this.tweens.add({targets:this._playClockEl,scaleX:1.6,scaleY:1.6,duration:130,yoyo:true,ease:'Back.easeOut'});}
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
        // INNO I32: fatigue visual — dim runner + orange ring when fatigued
        if(this._runnerData?.id){const _fat=this._fatigue?.[this._runnerData.id]||0;if(_fat>60){this.runner.setAlpha(1-(_fat-60)/200);if(!this._fatRingGfx)this._fatRingGfx=this.add.graphics().setDepth(14);this._fatRingGfx.clear();this._fatRingGfx.lineStyle(2,0xf97316,(_fat-60)/80);this._fatRingGfx.strokeCircle(this.runner.x,this.runner.y,10);}else{this.runner.setAlpha(1);this._fatRingGfx?.clear();}}
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
      // INNO I51: user controls safety during AI run
      if(this._userDefActive&&this._userDefDot?.visible){
        const _k=this.keys,_dp=this._dpadState,_dt=delta/1000,_us=this._defSpd*_dt*0.85;
        if(_k.rt.isDown||_k.d.isDown||_dp.dx>0){this._userDefDot.x+=_us;}
        if(_k.lt.isDown||_k.a.isDown||_dp.dx<0){this._userDefDot.x-=_us;}
        if(_k.up.isDown||_k.w.isDown||_dp.dy<0){this._userDefDot.y-=_us;}
        if(_k.dn.isDown||_k.s.isDown||_dp.dy>0){this._userDefDot.y+=_us;}
        this._userDefDot.x=clamp(this._userDefDot.x,FIELD_LEFT,FIELD_RIGHT);
        this._userDefDot.y=clamp(this._userDefDot.y,FIELD_Y,FIELD_Y+FIELD_H);
        if(this._userDefLbl){this._userDefLbl.setPosition(this._userDefDot.x,this._userDefDot.y);}
        if(this.aiRunner&&Math.hypot(this._userDefDot.x-this.aiRunner.x,this._userDefDot.y-this.aiRunner.y)<16){
          this._userDefActive=false; this._show(this._userDefDot,false); this._userDefLbl?.destroy();
          this._userTackle();
          return;
        }
      }
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
          // INNO I53: formation shift visual when audible changes alignment
          [this.wr1,this.wr2,this.te,this.rb].forEach((d,i)=>{
            if(!d?.visible)return;
            const _shifts=[{x:d.x+12,y:d.y-8},{x:d.x-12,y:d.y+8},{x:d.x,y:d.y-14},{x:d.x+8,y:d.y}];
            const _shift=_shifts[i]||{x:d.x,y:d.y};
            this.tweens.add({targets:d,x:_shift.x,y:_shift.y,duration:220,ease:'Sine.easeOut',yoyo:true,onUpdate:()=>this._syncLbl(d)});
          });
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
      flash.destroy();this._isOT=true;state._isOT=true;state.quarter=5;state.plays=0;
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

  // ─── P96: Coverage Assignment ───
  _showCoverageAssign() {
    if(this.phase!=='ai_pass')return;
    const W=this.scale.width,H=this.scale.height;
    const els=[];const cleanup=()=>els.forEach(e=>e?.destroy?.());
    const bg=this.add.rectangle(W/2,FIELD_Y+68,220,44,0x0f172a,0.92).setDepth(50);
    const ht=this.add.text(W/2,FIELD_Y+54,'🛡️ ASSIGN COVERAGE',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#38bdf8',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(51);
    els.push(bg,ht);
    const cbD=(state.team?.players||[]).find(p=>p.pos==='CB')||{ovr:75,name:'CB'};
    const wrD=(state.opponent?.players||[]).find(p=>p.pos==='WR')||{ovr:78,name:'WR'};
    [{label:'TIGHT\nMAN',note:`CB${cbD.ovr} vs WR${wrD.ovr}`,mod:14,color:0x22c55e},
     {label:'SOFT\nZONE',note:'Safer vs deep',mod:-8,color:0x3b82f6}
    ].forEach((opt,i)=>{
      const bx=W/2-60+i*120;
      const rb=this.add.rectangle(bx,FIELD_Y+72,106,30,opt.color,0.22).setDepth(51).setInteractive({useHandCursor:true});
      const rt=this.add.text(bx,FIELD_Y+68,opt.label,{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#fff',align:'center'}).setOrigin(0.5).setDepth(52);
      const rs=this.add.text(bx,FIELD_Y+82,opt.note,{fontSize:'7px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(52);
      rb.on('pointerover',()=>rb.setAlpha(0.55));rb.on('pointerout',()=>rb.setAlpha(1));
      rb.on('pointerdown',()=>{ this._coverageAssignMod=opt.mod; cleanup(); this._tdFlash(opt.label.replace('\n',' '),'#38bdf8'); });
      els.push(rb,rt,rs);
    });
    this.time.delayedCall(1800,()=>cleanup());
  }
  // ─── P97: Jump Route ───
  _showJumpRoute() {
    if(this.phase!=='ai_pass_flight')return;
    const W=this.scale.width,H=this.scale.height;
    const bg=this.add.rectangle(W/2,H/2+48,180,30,0xf59e0b,1).setDepth(35).setInteractive({useHandCursor:true});
    const tx=this.add.text(W/2,H/2+48,'✋ JUMP ROUTE!',{fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#000',stroke:'#fff',strokeThickness:1}).setOrigin(0.5).setDepth(36);
    this._jumpRouteEls=[bg,tx];
    const destroy=()=>{ if(this._jumpRouteEls){this._jumpRouteEls.forEach(e=>e?.destroy());this._jumpRouteEls=null;} };
    bg.once('pointerdown',()=>{ destroy(); this._jumpRouteActive=true; this._tdFlash('✋ JUMPED!','#f59e0b'); });
    this.time.delayedCall(420,()=>{destroy();
      // P120: extended jump route — 2nd window 300ms later, slightly lower INT boost (+15 vs +22)
      this.time.delayedCall(300,()=>{
        if(this.phase!=='ai_pass_flight'||this._jumpRouteActive)return;
        const bg2=this.add.rectangle(W/2,H/2+48,180,26,0xfbbf24,1).setDepth(35).setInteractive({useHandCursor:true});
        const tx2=this.add.text(W/2,H/2+48,'⬆ LATE JUMP',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#000'}).setOrigin(0.5).setDepth(36);
        bg2.once('pointerdown',()=>{bg2.destroy();tx2.destroy();this._jumpRouteActive=true;this._coverageAssignMod=-7;this._tdFlash('⬆ LATE JUMP!','#fbbf24');});
        this.time.delayedCall(350,()=>{bg2?.destroy?.();tx2?.destroy?.();});
      });
    });
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

  // ─── P81: TE Seam Route ───
  _startTESeam() {
    this._teSeamActive = true;
    this.phase = 'pass';
    Sound.whistle();
    const W=this.scale.width,H=this.scale.height;
    const te = this.te || this.rb;
    const teStart = { x: te.x, y: te.y };
    const teData = state.team?.players?.find(p=>p.pos==='TE') || {ovr:76,spd:74};
    const defLB = state.opponent?.players?.find(p=>['LB','S'].includes(p.pos)) || {ovr:74};
    // Animate TE running seam upfield
    this.tweens.add({ targets: te, x: te.x + 180, duration: 900, ease: 'Sine.easeIn', onUpdate: ()=>this._syncLbl(te) });
    const fl=this.add.text(W/2,FIELD_Y+FIELD_H/2-18,'TE SEAM',{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#22c55e',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(22);
    this.time.delayedCall(300,()=>fl?.destroy());
    // Show pump fake button briefly
    this._showPumpFakeBtn(()=>{
      this.time.delayedCall(600,()=>{
        const catchCh = teData.ovr > defLB.ovr ? 0.70 : 0.50;
        const caught = Math.random() < (catchCh + this._pumpFakeBonus);
        const yds = caught ? Phaser.Math.Between(8,18) : 0;
        this._teSeamActive = false;
        this._tdFlash(caught?`✅ TE SEAM — ${yds} yds`:'❌ TE SEAM — Incomplete','#22c55e');
        this._resolvePlay(1.0, caught?'complete':'covered', yds);
      });
    });
  }

  // ─── P82: DL Stunts ───
  _showDLStuntBtn() {
    if(state.possession==='team')return; // Only when defending
    const W=this.scale.width,H=this.scale.height;
    const bg=this.add.rectangle(W/2,FIELD_Y+FIELD_H+38,100,22,0xef4444,0.9).setDepth(22).setInteractive({useHandCursor:true});
    const tx=this.add.text(W/2,FIELD_Y+FIELD_H+38,'🌀 STUNT',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(23);
    const destroy=()=>{bg?.destroy();tx?.destroy();};
    bg.once('pointerdown',()=>{destroy();this._dlStunt=true;this._tdFlash('DL STUNT! +8% SACK','#ef4444');});
    this.time.delayedCall(2000,()=>destroy());
  }

  // ─── P83: WR Crack Block ───
  _tryCrackBlock(onDone) {
    if(Math.random()>0.20){onDone();return;}
    this._crackBlock=true;
    const wr=this.wr1||this.rb;const cb=this.cb1||this.lb;
    this._tdFlash('CRACK BLOCK!','#f59e0b');
    this.tweens.add({targets:wr,x:cb.x-20,y:cb.y,duration:400,ease:'Quad.easeOut',onUpdate:()=>this._syncLbl(wr),onComplete:()=>{
      this.tweens.add({targets:cb,x:cb.x+30,duration:200,onUpdate:()=>this._syncLbl(cb),onComplete:()=>onDone()});
    }});
  }

  // ─── P84: Pump Fake ───
  _showPumpFakeBtn(onDone) {
    const W=this.scale.width,H=this.scale.height;
    const bg=this.add.rectangle(W/2,FIELD_Y+FIELD_H+38,100,22,0x7c3aed,0.9).setDepth(22).setInteractive({useHandCursor:true});
    const tx=this.add.text(W/2,FIELD_Y+FIELD_H+38,'🎭 PUMP!',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(23);
    const destroy=()=>{bg?.destroy();tx?.destroy();};
    let done=false;
    bg.once('pointerdown',()=>{
      if(done)return;done=true;destroy();
      this._pumpFake=true;
      this._tdFlash('PUMP FAKE!','#a78bfa');
      // QB fake throw animation — slight body movement
      this.tweens.add({targets:this.qb,x:this.qb.x-6,duration:100,yoyo:true,onUpdate:()=>this._syncLbl(this.qb)});
      // CBs pause 200ms
      const cb1=this.cb1,cb2=this.cb2;
      const origX1=cb1?.x,origX2=cb2?.x;
      if(cb1)cb1.setActive(false);if(cb2)cb2.setActive(false);
      this.time.delayedCall(200,()=>{if(cb1)cb1.setActive(true);if(cb2)cb2.setActive(true);});
      this._pumpFakeBonus=0.10;
    });
    this.time.delayedCall(800,()=>{if(!done){done=true;destroy();}onDone();});
  }

  // ─── P85: Wildcat Package ───
  _startWildcat() {
    this._wildcatActive=true;
    this.phase='presnap';
    Sound.whistle();
    const W=this.scale.width,H=this.scale.height;
    const rbData=state.team?.players?.find(p=>p.pos==='RB')||{ovr:78,spd:86,str:75};
    const fl=this.add.text(W/2,FIELD_Y+FIELD_H/2-24,'⚡ WILDCAT',{fontSize:'14px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(22);
    this.time.delayedCall(800,()=>fl?.destroy());
    // Show KEEP or PASS option
    const bg=this.add.rectangle(W/2,H/2+60,240,28,0x1e293b,0.95).setDepth(23).setStrokeStyle(1,0xf59e0b);
    const kBg=this.add.rectangle(W/2-60,H/2+60,110,28,0x166534,1).setDepth(24).setInteractive({useHandCursor:true});
    const kTx=this.add.text(W/2-60,H/2+60,'🏃 KEEP (RB Run)',{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#86efac'}).setOrigin(0.5).setDepth(25);
    const pBg=this.add.rectangle(W/2+60,H/2+60,110,28,0x7c3aed,1).setDepth(24).setInteractive({useHandCursor:true});
    const pTx=this.add.text(W/2+60,H/2+60,'🏈 PASS (Option)',{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#e9d5ff'}).setOrigin(0.5).setDepth(25);
    const els=[bg,kBg,kTx,pBg,pTx];
    const destroy=()=>{els.forEach(e=>e?.destroy());this._wildcatActive=false;};
    kBg.once('pointerdown',()=>{
      destroy();this.phase='run';
      const strBonus=(rbData.str||70)/200;
      const yds=Math.round((2+strBonus*4+Phaser.Math.Between(-1,4)));
      this._tdFlash(`🏃 WILDCAT KEEP — ${yds} yds`,'#f59e0b');
      this._resolvePlay(1.0,'run',yds);
    });
    pBg.once('pointerdown',()=>{
      destroy();this.phase='pass';
      const caught=Math.random()<0.40;
      const yds=caught?Phaser.Math.Between(8,20):0;
      this._tdFlash(caught?`🏈 WILDCAT PASS — ${yds} yds`:'❌ WILDCAT PASS — Incomplete','#a78bfa');
      this._resolvePlay(1.0,caught?'complete':'covered',yds);
    });
    this.time.delayedCall(4000,()=>{if(this._wildcatActive){destroy();this.phase='run';const yds=Phaser.Math.Between(1,5);this._tdFlash(`WILDCAT AUTO — ${yds} yds`,'#f59e0b');this._resolvePlay(1.0,'run',yds);}});
  }

  // ─── P86: Flea Flicker ───
  _startFleaFlicker() {
    this._fleaFlickerActive = true;
    this.phase = 'pass';
    // INNO I15 [SIL]: trick play consequence memory — defense anticipates if used before
    if(this._trickPlayMem){this._trickMemCovPenalty=true;this._tdFlash('⚠ DEFENSE READS TRICK','#ef4444');}
    this._trickPlayMem = true;
    Sound.whistle();
    const W = this.scale.width, H = this.scale.height;
    const qbData = state.team?.players?.find(p => p.pos === 'QB') || { ovr: 78, acc: 80 };
    const wrData = state.team?.players?.find(p => p.pos === 'WR') || { ovr: 76, spd: 86 };
    // Animate handoff to RB then pitch back to QB
    const fl = this.add.text(W/2, FIELD_Y+FIELD_H/2-22, '🔄 FLEA FLICKER!', { fontSize:'13px', fontFamily:'monospace', fontStyle:'bold', color:'#f59e0b', stroke:'#000', strokeThickness:2 }).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: this.rb, x: this.rb.x + 30, duration: 400, ease:'Quad.easeOut', yoyo:true, onUpdate:()=>this._syncLbl(this.rb) });
    this.time.delayedCall(600, () => {
      fl?.destroy();
      // Defenders commit to run — deep pass window
      const defComp = Math.min(0.88, 0.42 + (qbData.acc||70)/200 + (wrData.ovr||70)/200);
      const intRisk = Math.random() < 0.10; // 10% INT risk on trick play
      if (intRisk) {
        this._tdFlash('❌ FLEA FLICKER — INTERCEPTED!', '#ef4444');
        state.turnovers = (state.turnovers || 0) + 1;
        this._resolvePlay(1.0, 'int', 0);
      } else {
        const caught = Math.random() < defComp;
        const yds = caught ? Phaser.Math.Between(12, 28) : 0;
        this._tdFlash(caught ? `✅ FLEA FLICKER — ${yds} yds!` : '❌ FLEA FLICKER — Incomplete', caught ? '#f59e0b' : '#ef4444');
        this._resolvePlay(1.0, caught ? 'complete' : 'covered', yds);
      }
      this._fleaFlickerActive = false;
    });
  }

  // ─── P87: End Around ───
  _startEndAround() {
    this._endAroundActive = true;
    this.phase = 'run';
    // INNO I15 [SIL]: trick play consequence memory
    if(this._trickPlayMem){this._trickMemCovPenalty=true;this._tdFlash('⚠ DEFENSE READS TRICK','#ef4444');}
    this._trickPlayMem = true;
    Sound.whistle();
    const W = this.scale.width;
    const wrData = state.team?.players?.find(p => p.pos === 'WR') || { ovr: 76, spd: 88 };
    const spdMod = (wrData.spd || 80) / 100;
    this._tdFlash('🏃 END AROUND', '#38bdf8');
    // Animate WR motioning to center then sweeping outside
    const wr = this.wr1 || this.rb;
    const origX = wr.x, origY = wr.y;
    this.tweens.add({ targets: wr, x: this.qb.x + 8, y: this.qb.y, duration: 300, ease:'Quad.easeIn', onUpdate:()=>this._syncLbl(wr), onComplete:()=>{
      this.tweens.add({ targets: wr, x: origX + 80, y: origY, duration: 500, ease:'Quad.easeOut', onUpdate:()=>this._syncLbl(wr), onComplete:()=>{
        const yds = Math.round(3 + spdMod * 9 + (Math.random() < 0.20 ? Phaser.Math.Between(3,6) : 0));
        this._tdFlash(`END AROUND — ${yds} yds`, '#38bdf8');
        this._resolvePlay(1.0, 'run', Math.min(yds, 18));
        this._endAroundActive = false;
      }});
    }});
  }

  // ─── P88: QB Sneak ───
  _startQBSneak() {
    this._qbSneakActive = true;
    this.phase = 'run';
    Sound.whistle();
    const qbData = state.team?.players?.find(p => p.pos === 'QB') || { str: 70 };
    const strMod = (qbData.str || 70) / 100;
    this._tdFlash('💪 QB SNEAK', '#7dd3fc');
    // Animate QB diving forward
    this.tweens.add({ targets: this.qb, x: this.qb.x + 18, duration: 300, ease:'Quad.easeIn', yoyo:true, onUpdate:()=>this._syncLbl(this.qb), onComplete:()=>{
      const yds = Math.round(0.5 + strMod * 3.5);
      const clamped = Math.max(1, Math.min(4, yds));
      this._tdFlash(`QB SNEAK — ${clamped} yd${clamped===1?'':'s'}`, '#7dd3fc');
      this._resolvePlay(1.0, 'run', clamped);
      this._qbSneakActive = false;
    }});
  }

  // ─── P92: Read Option ───
  _startReadOption() {
    this._readOptionActive = true;
    this.phase = 'run';
    Sound.whistle();
    const qbData = state.team?.players?.find(p => p.pos === 'QB') || { spd: 72, ovr: 72 };
    const rbData = state.team?.players?.find(p => p.pos === 'RB') || { spd: 86, ovr: 78 };
    const W = this.scale.width;
    // Show KEEP / PITCH choice to user
    const keepBg = this.add.rectangle(W/2 - 44, FIELD_Y+FIELD_H+38, 76, 24, 0x14532d, 0.95).setDepth(22).setInteractive({useHandCursor:true});
    const keepTx = this.add.text(W/2 - 44, FIELD_Y+FIELD_H+38, `🏃 KEEP (${qbData.spd} SPD)`, {fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#86efac'}).setOrigin(0.5).setDepth(23);
    const pitchBg = this.add.rectangle(W/2 + 44, FIELD_Y+FIELD_H+38, 76, 24, 0x1e3a5f, 0.95).setDepth(22).setInteractive({useHandCursor:true});
    const pitchTx = this.add.text(W/2 + 44, FIELD_Y+FIELD_H+38, `🏈 PITCH (${rbData.spd} SPD)`, {fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#7dd3fc'}).setOrigin(0.5).setDepth(23);
    const cleanup = () => { keepBg.destroy(); keepTx.destroy(); pitchBg.destroy(); pitchTx.destroy(); };
    const resolve = (isKeep) => {
      cleanup();
      const runner = isKeep ? qbData : rbData;
      const spdMod = (runner.spd || 80) / 100;
      const yds = Math.max(-2, Math.round((Math.random() * 14 * spdMod) - 1));
      const td = state.yardLine + yds >= 100;
      this._tdFlash(isKeep ? `QB KEEP — ${yds}yds` : `PITCH to RB — ${yds}yds`, isKeep ? '#86efac' : '#7dd3fc');
      const pid = isKeep ? qbData.id : rbData.id;
      if (pid) { if(!state.playerStats[pid]) state.playerStats[pid]={}; state.playerStats[pid].rushAtt=(state.playerStats[pid].rushAtt||0)+1; state.playerStats[pid].rushYds=(state.playerStats[pid].rushYds||0)+Math.max(0,yds); if(td)state.playerStats[pid].rushTD=(state.playerStats[pid].rushTD||0)+1; }
      this._resolvePlay(1.0, 'run', yds, td ? 100 : undefined);
      this._readOptionActive = false;
    };
    keepBg.once('pointerdown', () => resolve(true));
    pitchBg.once('pointerdown', () => resolve(false));
    // Auto-resolve if no choice in 3s
    this.time.delayedCall(3000, () => { if (this._readOptionActive) { cleanup(); resolve(Math.random() < 0.5); } });
  }

  // ─── P98: QB Kneel ───
  _startQBKneel() {
    this.phase = 'result';
    Sound.whistle?.();
    this._snapFlash?.();
    const loss = 1;
    const W = this.scale.width;
    const fl = this.add.text(W/2, FIELD_Y+FIELD_H/2-10, '🏈 QB KNEEL — Clock runs', {fontSize:'13px',fontFamily:'monospace',fontStyle:'bold',color:'#60a5fa',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(30);
    this.time.delayedCall(1200, ()=>fl?.destroy());
    this._endPlay({ yards:-loss, text:`QB Kneel — -${loss} yd (clock)`, type:'run', turnover:false, td:false });
  }
  // ─── P99: Onside Kick Recovery ───
  _showOnsideKickOption() {
    if(this.phase!=='result'&&this.phase!=='kickoff')return;
    const W=this.scale.width,H=this.scale.height;
    const els=[];const cleanup=()=>els.forEach(e=>e?.destroy?.());
    const bg=this.add.rectangle(W/2,H/2-10,W,H,0x000000,0.85).setDepth(55);
    const ht=this.add.text(W/2,H/2-40,'⚡ ONSIDE KICK OPTION',{fontSize:'14px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(56);
    const sub=this.add.text(W/2,H/2-18,'Trailing by 8+? Try to recover!',{fontSize:'9px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(56);
    els.push(bg,ht,sub);
    const mkBtn=(x,label,color,cb)=>{const b=this.add.rectangle(x,H/2+14,110,28,color,1).setDepth(57).setInteractive({useHandCursor:true});const t=this.add.text(x,H/2+14,label,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(58);els.push(b,t);b.once('pointerdown',()=>{cleanup();cb();});};
    mkBtn(W/2-64,'ONSIDE KICK',0xef4444,()=>{const rec=Math.random()<0.28;this._tdFlash(rec?'RECOVERED!🏈':'Onside lost…',rec?'#22c55e':'#ef4444');if(rec){state.possession='team';state.yardLine=50;state.down=1;state.toGo=10;state.plays++;if(state.plays%8===0)state.quarter=Math.min(4,state.quarter+1);const hud=this.scene.get('Hud');hud?.events?.emit('possessionChange','team');this.time.delayedCall(1800,()=>{this._resetFormation();this._drawLines();hud?.events?.emit('resetHud');this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');});}else{this.time.delayedCall(1600,()=>this._startAIDrive());}});
    mkBtn(W/2+64,'DEEP KICK',0x334155,()=>{ cleanup(); this.time.delayedCall(400,()=>this._launchKickoffReceiver()); });
    this.time.delayedCall(4000,()=>{cleanup();this.time.delayedCall(400,()=>this._launchKickoffReceiver());});
  }
  // ─── P89: Blitz Package button ───
  _showBlitzBtn() {
    if (state.possession === 'team') return;
    const W = this.scale.width, H = this.scale.height;
    const bg = this.add.rectangle(W/2 + 60, FIELD_Y+FIELD_H+38, 88, 22, 0x7c3aed, 0.9).setDepth(22).setInteractive({ useHandCursor:true });
    const tx = this.add.text(W/2 + 60, FIELD_Y+FIELD_H+38, '🚀 BLITZ', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#e9d5ff' }).setOrigin(0.5).setDepth(23);
    this._blitzBtn = [bg, tx];
    const destroy = () => { bg?.destroy(); tx?.destroy(); this._blitzBtn = null; };
    bg.once('pointerdown', () => { destroy(); this._blitzPackage = true; this._tdFlash('BLITZ CALLED! +INT chance', '#a78bfa'); });
    this.time.delayedCall(2000, () => destroy());
  }

  // ─── P77: Penalty Accept/Decline ───
  _showPenaltyChoice(penaltyName,yards,beneficiary) {
    const W=this.scale.width,H=this.scale.height;
    // INNO I54: penalty flag arc animation
    {const _fg=this.add.rectangle((this.qb?.x||W/2)+20,(this.qb?.y||FIELD_Y+FIELD_H/2)-10,8,8,0xfbbf24).setDepth(20);
    this.tweens.add({targets:_fg,x:W/2,y:FIELD_Y+FIELD_H/2,duration:420,ease:'Quad.easeOut',onComplete:()=>{this.tweens.add({targets:_fg,alpha:0,duration:300,onComplete:()=>_fg?.destroy()});}});}
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

  // ─── P100: Defensive Play Call Mini-Game ───
  _showDefPlayCall(onChoice) {
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const bg=this.add.rectangle(W/2, H/2-20, W*0.92, 100, 0x0f172a, 0.94).setDepth(60).setStrokeStyle(2, 0x3b82f6);
    const ht=this.add.text(W/2, H/2-58, '🛡️ CALL YOUR DEFENSE', {fontSize:'12px',fontFamily:'monospace',fontStyle:'bold',color:'#7dd3fc',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(61);
    els.push(bg, ht);
    const calls=[
      {key:'man',   label:'MAN',     color:0xef4444, bonus:{covB:0.12, sackB:-0.02}, tip:'Tight coverage, pressure risks'},
      {key:'zone',  label:'ZONE',    color:0x3b82f6, bonus:{covB:0.06, sackB:0.00},  tip:'Balanced — solid vs short routes'},
      {key:'blitz', label:'BLITZ',   color:0xa78bfa, bonus:{covB:-0.08,sackB:0.08},  tip:'Big sack chance, coverage gaps'},
      {key:'prevent',label:'PREVENT',color:0x22c55e, bonus:{covB:0.20, sackB:-0.05}, tip:'Bend-don\'t-break, stops deep ball'},
    ];
    calls.forEach((c,i)=>{
      const x=W/2-145+i*96; const y=H/2-14;
      const rb=this.add.rectangle(x,y,88,26,c.color,0.85).setDepth(62).setInteractive({useHandCursor:true});
      const rt=this.add.text(x,y,c.label,{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(63);
      const tp=this.add.text(x,y+20,c.tip,{fontSize:'5px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(63);
      els.push(rb,rt,tp);
      rb.once('pointerdown',()=>{
        this._defMiniGameBonus=c.bonus;
        this._tdFlash(`${c.label} D called`,`#${c.color.toString(16).padStart(6,'0')}`);
        els.forEach(e=>e?.destroy());
        this.time.delayedCall(400,()=>onChoice(c));
      });
    });
    // auto-pick zone after 4s
    this.time.delayedCall(4000,()=>{
      if(els[0]?.active){ this._defMiniGameBonus={covB:0.06,sackB:0}; els.forEach(e=>e?.destroy()); onChoice(calls[1]); }
    });
  }

  // ─── P101: Timeout Management ───
  _buildTimeoutBtn() {
    const W=this.scale.width, H=this.scale.height;
    if(!this._timeoutsLeft) this._timeoutsLeft=3;
    if(this._toBtn) return;
    const bg=this.add.rectangle(W-46, FIELD_Y+FIELD_H+38, 80, 22, 0x1e3a5f, 0.9).setDepth(22).setInteractive({useHandCursor:true});
    const tx=this.add.text(W-46, FIELD_Y+FIELD_H+38, `⏱️ TO(${this._timeoutsLeft})`, {fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#7dd3fc'}).setOrigin(0.5).setDepth(23);
    this._toBtn=[bg,tx];
    const use=()=>{
      if(this._timeoutsLeft<=0||this.phase==='result'){this._tdFlash('No timeouts left!','#ef4444');return;}
      this._timeoutsLeft--;
      tx.setText(`⏱️ TO(${this._timeoutsLeft})`);
      this._tdFlash('TIMEOUT CALLED — Clock stopped','#7dd3fc');
      this._toCalledThisPlay=true;
      // If 4th down, prompt go-for-it or punt
      if(state.down===4&&state.toGo<=5&&state.possession==='team'){
        this.time.delayedCall(800,()=>this._show4thDownModal());
      }
    };
    bg.on('pointerdown',use);
  }
  _show4thDownModal() {
    const W=this.scale.width, H=this.scale.height;
    const els=[];
    const bg=this.add.rectangle(W/2,H/2-10,W*0.88,76,0x0f172a,0.96).setDepth(64).setStrokeStyle(2,0xf59e0b);
    const ht=this.add.text(W/2,H/2-42,`4TH & ${state.toGo} — WHAT DO YOU DO?`,{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b'}).setOrigin(0.5).setDepth(65);
    els.push(bg,ht);
    const choices=[{l:'GO FOR IT',c:0x22c55e,fn:()=>{this.scene.launch('PlayCall');this.scene.bringToTop('PlayCall');}},{l:'PUNT',c:0xef4444,fn:()=>{state.possession='opp';state.yardLine=Math.max(5,100-state.yardLine-35);state.down=1;state.toGo=10;this._tdFlash('PUNT — field flipped','#94a3b8');this.time.delayedCall(800,()=>this._startAIDrive());}},{l:'FIELD GOAL',c:0x3b82f6,fn:()=>{const dist=state.yardLine;const made=Math.random()<(dist<=30?0.90:dist<=45?0.72:0.48);if(made){state.score.team+=3;this._tdFlash('FIELD GOAL — GOOD! +3','#22c55e');}else this._tdFlash('FG NO GOOD!','#ef4444');state.possession='opp';state.yardLine=Math.max(5,100-state.yardLine);state.down=1;state.toGo=10;this.time.delayedCall(1200,()=>this._startAIDrive());}}];
    choices.forEach((ch,i)=>{
      const x=W/2-130+i*130; const y=H/2+8;
      const rb=this.add.rectangle(x,y,110,24,ch.c,0.9).setDepth(66).setInteractive({useHandCursor:true});
      const rt=this.add.text(x,y,ch.l,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(67);
      els.push(rb,rt);
      rb.once('pointerdown',()=>{els.forEach(e=>e?.destroy());ch.fn();});
    });
    this.time.delayedCall(6000,()=>{ if(els[0]?.active){ els.forEach(e=>e?.destroy()); this.scene.launch('PlayCall'); this.scene.bringToTop('PlayCall'); } });
  }

  // ─── P102: Replay Engine ───
  _storeReplayTrail(yards, playText) {
    if(!this._replayStore) this._replayStore=[];
    const ballX=this.ball?.x||400; const ballY=this.ball?.y||300;
    this._replayStore=[{x:ballX-yards*YARD_W, y:ballY},{x:ballX, y:ballY}, playText];
    if(Math.abs(yards)>=10 || playText?.includes('TD') || playText?.includes('INT')) {
      this._buildReplayBtn(yards, playText);
    }
  }
  _buildReplayBtn(yards, playText) {
    this._replayBtn?.forEach(e=>e?.destroy());
    const W=this.scale.width, H=this.scale.height;
    const bg=this.add.rectangle(W-46, FIELD_Y+FIELD_H+16, 80, 20, 0x334155, 0.9).setDepth(22).setInteractive({useHandCursor:true});
    const tx=this.add.text(W-46, FIELD_Y+FIELD_H+16, '▶ REPLAY', {fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:'#94a3b8'}).setOrigin(0.5).setDepth(23);
    this._replayBtn=[bg,tx];
    bg.on('pointerdown',()=>this._runReplay(yards, playText));
    this.time.delayedCall(5000,()=>{ this._replayBtn?.forEach(e=>e?.destroy()); this._replayBtn=null; });
  }
  _runReplay(yards, playText) {
    if(!this._replayStore) return;
    const W=this.scale.width, H=this.scale.height;
    const overlay=this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.6).setDepth(70);
    const lbl=this.add.text(W/2, FIELD_Y+12, '▶ REPLAY', {fontSize:'9px',fontFamily:'monospace',color:'#60a5fa',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(71);
    const playLbl=this.add.text(W/2, H-36, playText||'', {fontSize:'9px',fontFamily:'monospace',color:'#e2e8f0'}).setOrigin(0.5).setDepth(71);
    const [from, to] = this._replayStore;
    const dot=this.add.circle(from.x, from.y, 6, 0xf59e0b).setDepth(72);
    this.tweens.add({targets:dot, x:to.x, y:to.y, duration:900, ease:'Linear', onComplete:()=>{
      this.time.delayedCall(400,()=>{ overlay?.destroy(); lbl?.destroy(); playLbl?.destroy(); dot?.destroy(); });
    }});
  }

  // ─── P103: Injury Flash ───
  _showInjuryFlash(playerName) {
    const W=this.scale.width, H=this.scale.height;
    const flash=this.add.rectangle(W/2,H/2,W,H,0xff0000,0.35).setDepth(80);
    this.tweens.add({targets:flash,alpha:0,duration:600,onComplete:()=>flash?.destroy()});
    const lbl=this.add.text(W/2, H/2-20, `🚑 INJURY — ${playerName||'Player Down'}`, {fontSize:'13px',fontFamily:'monospace',fontStyle:'bold',color:'#fca5a5',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(81);
    // Cart icon (simple rectangle train)
    const cart=this.add.rectangle(-30, H/2+30, 28, 14, 0xfef3c7).setDepth(81);
    const cartW=this.add.rectangle(-20, H/2+24, 8, 8, 0xef4444).setDepth(82);
    this.tweens.add({targets:[cart,cartW], x:`+=${W+60}`, duration:2200, ease:'Linear', onComplete:()=>{ cart?.destroy(); cartW?.destroy(); }});
    this.time.delayedCall(2500,()=>lbl?.destroy());
  }

  // ─── P104: KO Return Lane Choice ───────────────────────────────────────────
  _showReturnLaneChoice(catchYard) {
    const W=this.scale.width, H=this.scale.height;
    const els=[]; const cleanup=()=>{clearTimeout(this._rlTimer);els.forEach(e=>e?.destroy?.());};
    const mods=[{label:'◀ LEFT',sub:'Outside sweep',ydMod:3,clr:0x22c55e},{label:'MIDDLE',sub:'Up the gut',ydMod:0,clr:0x3b82f6},{label:'RIGHT ▶',sub:'Cut inside',ydMod:1,clr:0xf59e0b}].sort(()=>Math.random()-.5);
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.80).setDepth(60));
    els.push(this.add.text(W/2,H/2-68,'⬆ PICK YOUR RETURN LANE',{fontSize:'14px',fontFamily:'monospace',fontStyle:'bold',color:'#f1f5f9',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(61));
    mods.forEach((m,i)=>{
      const cx=W/2+(i-1)*155, cy=H/2+10;
      const b=this.add.rectangle(cx,cy,140,56,0x0d1424).setDepth(61).setStrokeStyle(2,m.clr,0.7).setInteractive({useHandCursor:true});
      const lbl=this.add.text(cx,cy-10,m.label,{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#'+m.clr.toString(16).padStart(6,'0')}).setOrigin(0.5).setDepth(62);
      const sub=this.add.text(cx,cy+10,m.sub,{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(62);
      b.on('pointerover',()=>b.setFillStyle(m.clr,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();this._showKickoffFlash('KICKOFF RETURN',`${m.label} — WASD to run!`,()=>this._launchKickoffReturn(catchYard+m.ydMod));});
      els.push(b,lbl,sub);
    });
    let _ar=4000;const _ael=this.add.text(W/2,H/2+60,'Auto: 4s',{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(61);els.push(_ael);
    const _atk=()=>{_ar-=200;if(_ar<=0){cleanup();this._showKickoffFlash('KICKOFF RETURN','WASD to return!',()=>this._launchKickoffReturn(catchYard));return;}_ael.setText('Auto: '+(_ar/1000).toFixed(1)+'s');this._rlTimer=setTimeout(_atk,200);};
    this._rlTimer=setTimeout(_atk,200);
  }

  // ─── P105: 2-Min Drill Spike Button ────────────────────────────────────────
  _showSpikeBtnDrill() {
    if(!state._drillMode||this.phase!=='presnap')return;
    const W=this.scale.width;
    const bg=this.add.rectangle(W/2-66,FIELD_Y+FIELD_H+38,84,22,0x1e293b).setDepth(23).setStrokeStyle(1,0xef4444,0.8).setInteractive({useHandCursor:true});
    const tx=this.add.text(W/2-66,FIELD_Y+FIELD_H+38,'⏰ SPIKE',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#ef4444'}).setOrigin(0.5).setDepth(24);
    const els=[bg,tx]; const cleanup=()=>els.forEach(e=>e?.destroy?.());
    bg.on('pointerdown',()=>{if(this.phase!=='presnap')return;cleanup();this.phase='result';this._tdFlash('QB SPIKE! Clock stopped!','#ef4444');this._endPlay({yards:0,text:'QB spike — clock stopped.',type:'incomplete',turnover:false,td:false});});
    this.time.delayedCall(5000,()=>cleanup());
  }

  // ─── P106: No-Look Pump Fake ────────────────────────────────────────────────
  _showNoLookPump() {
    if(this.phase!=='pass_wait')return;
    const W=this.scale.width;
    const bg=this.add.rectangle(W/2+92,FIELD_Y+FIELD_H+38,88,22,0x1e293b).setDepth(23).setStrokeStyle(1,0xa78bfa,0.8).setInteractive({useHandCursor:true});
    const tx=this.add.text(W/2+92,FIELD_Y+FIELD_H+38,'👁 NO LOOK',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#a78bfa'}).setOrigin(0.5).setDepth(24);
    this._nlPumpEls=[bg,tx]; const cleanup=()=>{this._nlPumpEls?.forEach(e=>e?.destroy?.());this._nlPumpEls=null;};
    bg.on('pointerdown',()=>{
      if(this.phase!=='pass_wait')return; cleanup(); this._nlPumpBonus=0.14;
      this._tdFlash('NO LOOK!','#a78bfa');
      if(this.cb1)this.tweens.add({targets:this.cb1,x:this.wr1.x-20,y:this.wr1.y,duration:400,ease:'Linear'});
    });
    this.time.delayedCall(900,()=>cleanup());
  }

  // ─── P107: Crossing Route ───────────────────────────────────────────────────
  _startCrossingRoute() {
    const W=this.scale.width, H=this.scale.height;
    this.phase='pass_wait'; this.passVariant='medium';
    this.events.emit('phaseChange','pass'); Sound.whistle?.();
    this._setupPocket(); this._startPassRush(false);
    const teData=state.team?.players?.find(p=>p.pos==='TE')||{ovr:74,spd:72,id:'te1'};
    const cy=FIELD_Y+FIELD_H/2;
    this.tweens.add({targets:this.te,x:this.te.x+95,y:cy-20,duration:480,ease:'Sine.out',onUpdate:()=>this._syncLbl(this.te)});
    this.tweens.add({targets:this.lb,x:this.lb.x+55,y:cy,duration:540,ease:'Sine.out',onUpdate:()=>this._syncLbl(this.lb)});
    this.time.delayedCall(500,()=>{
      if(this.phase!=='pass_wait')return;
      const bg=this.add.rectangle(W/2,FIELD_Y+FIELD_H+24,80,24,0x22c55e,0.9).setDepth(23).setInteractive({useHandCursor:true});
      const tx=this.add.text(W/2,FIELD_Y+FIELD_H+24,'🏈 THROW!',{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#fff'}).setOrigin(0.5).setDepth(24);
      const els=[bg,tx]; const cleanup=()=>els.forEach(e=>e?.destroy?.());
      bg.on('pointerdown',()=>{
        if(this.phase!=='pass_wait')return; cleanup(); this.phase='pass_flight'; this._clearPassRush();
        this.recTargets?.forEach(r=>r?.destroy?.()); this.recTargets=[];
        const lbOvr=(state.opponent?.players?.find(p=>p.pos==='LB')||{ovr:76}).ovr;
        const compCh=clamp(0.62+(teData.ovr-70)*0.006-(lbOvr-70)*0.004,0.30,0.84);
        const caught=Math.random()<compCh; const isINT=!caught&&Math.random()<0.08;
        const yds=caught?Phaser.Math.Between(7,14):0;
        if(caught){this._flashCarrierName(this.te,teData.name?.split(' ').pop()||'TE');}
        const txt=caught?`Crossing route — TE for ${yds} yards${yds+state.yardLine>=100?' TD!':''}`:isINT?'INTERCEPTION! LB jumps the cross!':'Crossing route — incomplete';
        this.time.delayedCall(400,()=>this._endPlay({yards:caught?yds:0,text:txt,type:caught?'pass':'incomplete',turnover:isINT,td:caught&&yds+state.yardLine>=100}));
      });
      this.time.delayedCall(2500,()=>{if(this.phase==='pass_wait'){cleanup();this.phase='pass_flight';this._clearPassRush();this.recTargets?.forEach(r=>r?.destroy?.());this.recTargets=[];this.time.delayedCall(200,()=>this._endPlay({yards:0,text:'Cross route — sacked off pressure',type:'incomplete',turnover:false,td:false}));}});
    });
  }

  // ─── P108: Defensive Strip-Sack Button ─────────────────────────────────────
  _showStripBtn() {
    if(this.phase!=='pass_wait')return;
    const W=this.scale.width;
    const bg=this.add.rectangle(W-78,FIELD_Y+FIELD_H+60,76,22,0x7f1d1d,0.9).setDepth(23).setStrokeStyle(1,0xef4444,0.8).setInteractive({useHandCursor:true});
    const tx=this.add.text(W-78,FIELD_Y+FIELD_H+60,'💥 STRIP!',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fca5a5'}).setOrigin(0.5).setDepth(24);
    this._stripBtnEl=[bg,tx]; const cleanup=()=>{this._stripBtnEl?.forEach(e=>e?.destroy?.());this._stripBtnEl=null;};
    bg.on('pointerdown',()=>{
      if(this.phase!=='pass_wait')return; cleanup();
      if(Math.random()<0.22){
        this.phase='result';this._clearPassRush();this.recTargets?.forEach(r=>r?.destroy?.());this.recTargets=[];
        this._tdFlash('FORCED FUMBLE!','#ef4444');
        this.time.delayedCall(600,()=>this._endPlay({yards:-3,text:'STRIP-SACK! Defense forces fumble!',type:'fumble',turnover:true,td:false}));
      }else{this._tdFlash('Strip attempt failed','#64748b');}
    });
    this.time.delayedCall(800,()=>cleanup());
  }

  // ─── P109: WR Bubble Screen ─────────────────────────────────────────────────
  _startWRBubble() {
    const W=this.scale.width, H=this.scale.height;
    this.phase='pass_wait'; this.passVariant='quick';
    this.events.emit('phaseChange','pass'); Sound.whistle?.();
    const wr1Data=state.team?.players?.find(p=>p.pos==='WR')||{ovr:80,spd:88,id:'wr1'};
    const cbOvr=(state.opponent?.players?.filter(p=>p.pos==='CB')[0]||{ovr:75}).ovr;
    this.tweens.add({targets:this.wr1,y:this.wr1.y-46,x:this.wr1.x+28,duration:340,ease:'Sine.out',onUpdate:()=>this._syncLbl(this.wr1)});
    this.time.delayedCall(400,()=>{
      if(this.phase!=='pass_wait')return;
      const cuts=[{label:'CUT IN',yds:[4,9]},{label:'STRAIGHT',yds:[2,6]},{label:'CUT OUT',yds:[5,13]}];
      const els=[]; const cleanup=()=>els.forEach(e=>e?.destroy?.());
      cuts.forEach((c,i)=>{
        const cx=W/2+(i-1)*118, cy=H-46;
        const b=this.add.rectangle(cx,cy,108,32,0x0d1424).setDepth(26).setStrokeStyle(1,0x3b82f6,0.8).setInteractive({useHandCursor:true});
        const lt=this.add.text(cx,cy,c.label,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#7dd3fc'}).setOrigin(0.5).setDepth(27);
        els.push(b,lt);
        b.on('pointerover',()=>b.setFillStyle(0x3b82f6,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
        b.on('pointerdown',()=>{
          if(this.phase!=='pass_wait')return; cleanup(); this.phase='result';
          const compCh=clamp(0.70+(wr1Data.spd-75)*0.005-(cbOvr-70)*0.004,0.35,0.88);
          const caught=Math.random()<compCh; const yds=caught?Phaser.Math.Between(...c.yds):0;
          const txt=caught?`WR bubble — ${c.label} for ${yds} yards`:'WR bubble — knocked away';
          if(caught)this._flashCarrierName(this.wr1,wr1Data.name?.split(' ').pop()||'WR');
          this.time.delayedCall(300,()=>this._endPlay({yards:yds,text:txt,type:caught?'pass':'incomplete',turnover:false,td:yds+state.yardLine>=100}));
        });
      });
      this.time.delayedCall(3500,()=>{if(this.phase==='pass_wait'){cleanup();this.phase='result';this.time.delayedCall(200,()=>this._endPlay({yards:0,text:'WR bubble — pressure disrupts the throw',type:'incomplete',turnover:false,td:false}));}});
    });
  }

  // ─── P110: Onside Direction Choice ─────────────────────────────────────────
  _showOnsideDirectionChoice() {
    const W=this.scale.width, H=this.scale.height;
    const _mods=([0.08,0.01,-0.04]).sort(()=>Math.random()-.5);
    const _dirs=[{label:'◀ LEFT',mod:_mods[0]},{label:'CENTER',mod:_mods[1]},{label:'RIGHT ▶',mod:_mods[2]}];
    const els=[]; const cleanup=()=>{clearTimeout(this._odTimer);els.forEach(e=>e?.destroy?.());};
    els.push(this.add.rectangle(W/2,H/2,W,H,0x000000,0.82).setDepth(62));
    els.push(this.add.text(W/2,H/2-64,'⚡ ONSIDE KICK DIRECTION',{fontSize:'14px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(63));
    _dirs.forEach((d,i)=>{
      const cx=W/2+(i-1)*136, cy=H/2+10;
      const b=this.add.rectangle(cx,cy,124,52,0x0d1424).setDepth(63).setStrokeStyle(2,0xf59e0b,0.7).setInteractive({useHandCursor:true});
      const lt=this.add.text(cx,cy,d.label,{fontSize:'11px',fontFamily:'monospace',fontStyle:'bold',color:'#f59e0b'}).setOrigin(0.5).setDepth(64);
      els.push(b,lt);
      b.on('pointerover',()=>b.setFillStyle(0xf59e0b,0.18));b.on('pointerout',()=>b.setFillStyle(0x0d1424,1));
      b.on('pointerdown',()=>{cleanup();this._resolveOnsideKick(d.mod);});
    });
    let _ar=3000;const _ael=this.add.text(W/2,H/2+52,'Auto: 3s',{fontSize:'8px',fontFamily:'monospace',color:'#475569'}).setOrigin(0.5).setDepth(63);els.push(_ael);
    const _atk=()=>{_ar-=200;if(_ar<=0){cleanup();this._resolveOnsideKick(0);return;}_ael.setText('Auto: '+(_ar/1000).toFixed(1)+'s');this._odTimer=setTimeout(_atk,200);};
    this._odTimer=setTimeout(_atk,200);
  }

  // INNO I24: timer registry helpers — store all loop timers for clean shutdown
  _regTimer(t){ this._timerRegistry.push(t); return t; }
  shutdown(){ this._timerRegistry?.forEach(t=>{try{t.remove();}catch{}}); this._timerRegistry=[]; }

}

