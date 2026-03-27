import { state, exportStats, computeGrade } from '../data/gameState.js';
import { track } from '../utils/analytics.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const stats = exportStats();
    const won = state.score.team > state.score.opp;
    track('game_complete', { won:won?1:0, score_team:state.score.team, score_opp:state.score.opp, plays:state.plays });

    this.add.rectangle(W/2, H/2, W, H, 0x0a0f1a, 0.96);

    // INNO I19: Comeback win / rivalry win banner
    const _margin = Math.abs(state.score.team - state.score.opp);
    const _wasClose = _margin <= 7;
    const _isRival = state.isRival;
    const _headerColor = won ? (_isRival?'#f97316':_wasClose?'#fbbf24':'#f59e0b') : '#ef4444';
    const _headerText = won
      ? (_isRival ? '⚔️ RIVALRY WIN!' : _wasClose ? '🏆 CLUTCH VICTORY!' : '🏆 VICTORY!')
      : (_wasClose ? '💔 SO CLOSE...' : '❌ DEFEAT');
    this.add.text(W/2, 46, _headerText, {
      fontSize:'34px', fontFamily:'monospace', fontStyle:'bold',
      color:_headerColor, stroke:'#000', strokeThickness:4
    }).setOrigin(0.5);

    const t = state.team?.ab||'YOU', o = state.opponent?.ab||'OPP';
    this.add.text(W/2, 96, `${t} ${state.score.team} — ${state.score.opp} ${o}`, {
      fontSize:'22px', fontFamily:'monospace', fontStyle:'bold', color:'#f1f5f9'
    }).setOrigin(0.5);

    // P125: OT defeat card — special overlay for overtime losses
    if(!won&&state._isOT){
      const _otBg=this.add.rectangle(W/2,H/2,W,H,0x1a0a00,0.7).setDepth(5);
      this.add.text(W/2,H/2-60,'⏱ OT DEFEAT',{fontSize:'28px',fontFamily:'monospace',fontStyle:'bold',color:'#f97316',stroke:'#000',strokeThickness:5}).setOrigin(0.5).setDepth(6);
      this.add.text(W/2,H/2-30,'Came to overtime... but couldn\'t finish it.',{fontSize:'11px',fontFamily:'monospace',color:'#94a3b8'}).setOrigin(0.5).setDepth(6);
      this.add.text(W/2,H/2-12,'No shame in leaving it all on the field.',{fontSize:'10px',fontFamily:'monospace',color:'#64748b',fontStyle:'italic'}).setOrigin(0.5).setDepth(6);
      this.time.delayedCall(2200,()=>{this.tweens.add({targets:_otBg,alpha:0,duration:800});});
    }
    // Weather & rival badge
    const _badges=[];
    if(state.weather&&state.weather!=='clear')_badges.push({txt:state.weather==='snow'?'❄️ SNOW GAME':state.weather==='rain'?'🌧️ RAIN GAME':'💨 WIND',clr:'#93c5fd'});
    if(_isRival)_badges.push({txt:'⚔️ RIVALRY',clr:'#f97316'});
    if(_wasClose&&won)_badges.push({txt:'🔥 CLUTCH',clr:'#fbbf24'});
    if(_badges.length){let bx=W/2-(_badges.length-1)*52;_badges.forEach(b=>{this.add.rectangle(bx,116,96,16,0x1e293b).setStrokeStyle(1,Phaser.Display.Color.HexStringToColor(b.clr).color,0.8);this.add.text(bx,116,b.txt,{fontSize:'8px',fontFamily:'monospace',fontStyle:'bold',color:b.clr}).setOrigin(0.5);bx+=104;});}

    // GO2: Play of the Game
    if(state.bestPlay){
      this.add.text(W/2, 132, `⭐ PLAY OF THE GAME: ${state.bestPlay.name} — ${state.bestPlay.yards}yd ${state.bestPlay.type}`, {
        fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#f59e0b', stroke:'#000', strokeThickness:2
      }).setOrigin(0.5);
    }

    // Team stats box
    const ts = stats.team;
    this.add.rectangle(W/2-190, 200, 200, 130, 0x1e293b).setOrigin(0,0.5).setStrokeStyle(1,0x334155);
    this.add.text(W/2-90, 152, 'YOUR STATS', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#64748b', letterSpacing:2 }).setOrigin(0.5);
    [
      `Pass Yds:  ${ts.passYds}`,
      `Rush Yds:  ${ts.rushYds}`,
      `TDs:       ${ts.td}`,
      `INTs:      ${ts.int}`,
    ].forEach((l,i) => this.add.text(W/2-185, 167+i*22, l, { fontSize:'11px', fontFamily:'monospace', color:'#94a3b8' }));

    // Opponent stats box
    const os = stats.opp;
    this.add.rectangle(W/2+10, 200, 200, 130, 0x1e293b).setOrigin(0,0.5).setStrokeStyle(1,0x334155);
    this.add.text(W/2+110, 152, 'OPP STATS', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#64748b', letterSpacing:2 }).setOrigin(0.5);
    [
      `Rush Yds:  ${os.rushYds}`,
      `TDs:       ${os.td}`,
    ].forEach((l,i) => this.add.text(W/2+15, 167+i*22, l, { fontSize:'11px', fontFamily:'monospace', color:'#64748b' }));

    // GO1: player grade (shared computeGrade from gameState)
    const _gcol=g=>g==='A+'||g==='A'?'#22c55e':g==='B+'||g==='B'?'#3b82f6':g==='C'?'#f59e0b':g==='D'?'#f97316':'#ef4444';

    // Per-player breakdown
    const pdelta = stats.playerDeltas || [];
    if (pdelta.length > 0) {
      this.add.text(W/2, 252, 'PLAYER LOG', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#334155', letterSpacing:3 }).setOrigin(0.5);
      let row = 0;
      pdelta.forEach(p => {
        const parts = [];
        if (p.passYds)  parts.push(`${p.comp||0}/${p.att||0} ${p.passYds}py`);
        if (p.rushYds)  parts.push(`${p.rushAtt||0}ca ${p.rushYds}ry`);
        if (p.recYds)   parts.push(`${p.rec||0}rec ${p.recYds}ry`);
        if (p.td)       parts.push(`${p.td}TD`);
        if (p.int)      parts.push(`${p.int}INT`);
        if (parts.length === 0) return;
        const line = `${p.name.split(' ').pop()} (${p.pos}): ${parts.join(' ')}`;
        const g = computeGrade(p);
        this.add.text(W/2-10, 266+row*16, line, { fontSize:'9px', fontFamily:'monospace', color:'#475569' }).setOrigin(0.5);
        // GO1: grade badge
        if(g)this.add.text(W/2+W*0.28, 266+row*16, g, {fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:_gcol(g)}).setOrigin(0.5);
        row++;
      });
    }

    // MVP badge — top performer by total yards
    const _mvp = pdelta.length ? [...pdelta].sort((a,b)=>((b.passYds||0)+(b.rushYds||0)+(b.recYds||0))-((a.passYds||0)+(a.rushYds||0)+(a.recYds||0)))[0] : null;
    if(_mvp){
      const _mvpYds=((_mvp.passYds||0)+(_mvp.rushYds||0)+(_mvp.recYds||0));
      const _mvpTd=_mvp.td?` ${_mvp.td}TD`:'';
      this.add.rectangle(W/2,250,W-20,18,0x1e3a5f,0.55).setDepth(1).setStrokeStyle(1,0x3b82f6,0.5);
      this.add.text(W/2,250,`⭐ MVP: ${_mvp.name} (${_mvp.pos}) — ${_mvpYds}yds${_mvpTd}`,{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#7dd3fc'}).setOrigin(0.5);
    }

    // Drive chart — GO3: horizontal bar chart (width=yards gained, color=result)
    // Capped at 6 drives per side to avoid overlap with buttons
    if (state.drives && state.drives.length) {
      this.add.text(W/2, 264, 'DRIVE CHART', { fontSize:'7px', fontFamily:'monospace', fontStyle:'bold', color:'#334155', letterSpacing:3 }).setOrigin(0.5);
      const maxYd = Math.max(1, ...state.drives.map(d=>d.yards||1));
      let tRow=0, oRow=0;
      state.drives.slice(0,12).forEach(d => {
        const isTeam = d.poss==='team';
        if(isTeam && tRow>=6) return;
        if(!isTeam && oRow>=6) return;
        const row = isTeam ? tRow++ : oRow++;
        const x = isTeam ? W/2-190 : W/2+10;
        const clrH = (d.result==='TD'||d.result==='FG') ? 0x22c55e : (d.result==='INT'||d.result==='FUM') ? 0xef4444 : 0x475569;
        const clrT = (d.result==='TD'||d.result==='FG') ? '#22c55e' : (d.result==='INT'||d.result==='FUM') ? '#ef4444' : '#475569';
        const barW = Math.max(4, Math.round((d.yards||0)/maxYd*174));
        this.add.rectangle(x+barW/2, 274+row*13, barW, 7, clrH, 0.75).setOrigin(0.5);
        this.add.text(x, 274+row*13+1, `${d.yards||0}yd→${d.result}`, { fontSize:'7px', fontFamily:'monospace', color:clrT });
      });
    }

    // INNO I18: Grade distribution summary
    if(pdelta.length>0){
      const _grades=pdelta.map(p=>computeGrade(p)).filter(Boolean);
      const _gcounts={};_grades.forEach(g=>{_gcounts[g]=(_gcounts[g]||0)+1;});
      const _gradeOrder=['A+','A','B+','B','C','D','F'];
      const _gSummary=_gradeOrder.filter(g=>_gcounts[g]).map(g=>`${g}×${_gcounts[g]}`).join('  ');
      if(_gSummary){
        this.add.text(W/2,359,'TEAM PERFORMANCE',{fontSize:'7px',fontFamily:'monospace',fontStyle:'bold',color:'#334155',letterSpacing:2}).setOrigin(0.5);
        this.add.text(W/2,370,_gSummary,{fontSize:'10px',fontFamily:'monospace',fontStyle:'bold',color:'#60a5fa'}).setOrigin(0.5);
      }
    }

    // Injury report
    if (state.injuries && state.injuries.length > 0) {
      const injNames = state.injuries.map(i => {
        const pl = state.team?.players?.find(p => p.id === i.id);
        return `${pl?.name?.split(' ').pop() || i.pos} (${i.weeks}wk)`;
      }).join(', ');
      this.add.text(W/2, 385, `🚑 INJURED: ${injNames}`, {
        fontSize:'9px', fontFamily:'monospace', color:'#ef4444'
      }).setOrigin(0.5);
    }

    // Export notice
    this.add.text(W/2, 400, '✅ Stats saved — import to Gridiron GM to update your season', {
      fontSize:'9px', fontFamily:'monospace', color:'#334155'
    }).setOrigin(0.5);

    // INNO I78: cross-play personal records
    try{
      const _pr=JSON.parse(localStorage.getItem('gm_play_records')||'{}');
      const _newPR={};
      const _ts=state.stats?.team;
      if(_ts){
        if((_ts.passYds||0)>(_pr.passYds||0)){_newPR.passYds=_ts.passYds;}
        if((_ts.rushYds||0)>(_pr.rushYds||0)){_newPR.rushYds=_ts.rushYds;}
        if((_ts.td||0)>(_pr.td||0)){_newPR.td=_ts.td;}
      }
      const _merged={..._pr,..._newPR};
      localStorage.setItem('gm_play_records',JSON.stringify(_merged));
      const _prParts=[];
      if(_merged.passYds)_prParts.push(`PASS BEST: ${_merged.passYds}yd`);
      if(_merged.rushYds)_prParts.push(`RUSH BEST: ${_merged.rushYds}yd`);
      if(_merged.td)_prParts.push(`TD BEST: ${_merged.td}`);
      if(_prParts.length){
        this.add.text(W/2,413,`🏅 ${_prParts.join('  •  ')}`,{fontSize:'8px',fontFamily:'monospace',color:'#60a5fa'}).setOrigin(0.5);
        Object.keys(_newPR).forEach(()=>{
          const _badge=this.add.text(W/2,402,'✨ NEW RECORD!',{fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:'#fbbf24'}).setOrigin(0.5);
          this.tweens.add({targets:_badge,alpha:0,duration:1200,delay:600,onComplete:()=>_badge?.destroy()});
        });
      }
    }catch{}

    // INNO I55: highlight reel — replay best play as animated dot tween
    if(state.bestPlay){
      const _rlY=380;
      const _rlBall=this.add.circle(W/2-90,_rlY,5,0xfbbf24).setDepth(10).setAlpha(0);
      this.time.delayedCall(800,()=>{
        this.tweens.add({targets:_rlBall,alpha:1,duration:200});
        this.tweens.add({targets:_rlBall,x:W/2+90,y:_rlY-18,duration:900,ease:'Sine.easeOut',
          onComplete:()=>{
            this.add.text(W/2,_rlY+10,'⭐ BEST PLAY REPLAYED',{fontSize:'7px',fontFamily:'monospace',color:'#f59e0b'}).setOrigin(0.5);
            this.tweens.add({targets:_rlBall,alpha:0,duration:300});
          }
        });
      });
    }

    // I-7: Highlight Card button
    const hlCard = this.add.rectangle(W/2, 458, 160, 28, 0x1e293b).setInteractive({ useHandCursor:true }).setStrokeStyle(1,0xf59e0b,0.8);
    this.add.text(W/2, 458, '📷 HIGHLIGHT CARD', { fontSize:'9px', fontFamily:'monospace', fontStyle:'bold', color:'#f59e0b' }).setOrigin(0.5);
    hlCard.on('pointerover', ()=>hlCard.setFillStyle(0x2d1f00));
    hlCard.on('pointerout',  ()=>hlCard.setFillStyle(0x1e293b));
    hlCard.on('pointerdown', ()=>this._downloadHighlightCard());

    // Buttons
    const playAgain = this.add.rectangle(W/2-90, 490, 160, 36, 0x22c55e).setInteractive({ useHandCursor:true });
    this.add.text(W/2-90, 490, 'PLAY AGAIN', { fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#fff' }).setOrigin(0.5);
    playAgain.on('pointerdown', ()=>this.scene.start('Boot'));
    playAgain.on('pointerover', ()=>playAgain.setFillStyle(0x16a34a));
    playAgain.on('pointerout',  ()=>playAgain.setFillStyle(0x22c55e));

    const menu = this.add.rectangle(W/2+90, 490, 160, 36, 0x1e293b).setInteractive({ useHandCursor:true }).setStrokeStyle(1,0x334155);
    this.add.text(W/2+90, 490, 'MAIN MENU', { fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#94a3b8' }).setOrigin(0.5);
    menu.on('pointerdown', ()=>this.scene.start('Boot'));
  }

  // I-7: Download highlight stat card as PNG
  _downloadHighlightCard(){
    const gs={
      teamScore: state.score?.team||0,
      oppScore:  state.score?.opp||0,
      teamAb:    state.team?.ab||'TEAM',
      oppAb:     state.opponent?.ab||'OPP',
      week:      state.week||1,
    };
    // MVP from playerDeltas (exportStats already imported at top)
    const pdelta=(()=>{try{const s=exportStats?.();return s?.playerDeltas||[];}catch{return [];}})();
    const _mvp=pdelta.length?[...pdelta].sort((a,b)=>((b.passYds||0)+(b.rushYds||0)+(b.recYds||0))-((a.passYds||0)+(a.rushYds||0)+(a.recYds||0)))[0]:null;
    gs.mvp=_mvp?{name:_mvp.name,pos:_mvp.pos,yds:(_mvp.passYds||0)+(_mvp.rushYds||0)+(_mvp.recYds||0),td:_mvp.td||0}:null;
    const c=document.createElement('canvas');
    c.width=400;c.height=225;
    const ctx=c.getContext('2d');
    // Background
    const grad=ctx.createLinearGradient(0,0,400,225);
    grad.addColorStop(0,'#0a0f1a');grad.addColorStop(1,'#1e293b');
    ctx.fillStyle=grad;ctx.fillRect(0,0,400,225);
    // Amber border
    ctx.fillStyle='#f59e0b';ctx.fillRect(0,0,400,4);
    // Score
    ctx.fillStyle='#f1f5f9';ctx.textAlign='center';
    ctx.font='bold 48px monospace';
    ctx.fillText(`${gs.teamScore} - ${gs.oppScore}`,200,100);
    // Teams
    ctx.font='16px monospace';ctx.fillStyle='#94a3b8';
    ctx.fillText(`${gs.teamAb} vs ${gs.oppAb}`,200,130);
    // MVP
    if(gs.mvp){
      ctx.font='bold 12px monospace';ctx.fillStyle='#f59e0b';
      ctx.fillText(`MVP: ${gs.mvp.name||''} — ${gs.mvp.yds}yds${gs.mvp.td?` ${gs.mvp.td}TD`:''}`,200,160);
    }
    // Watermark
    ctx.font='9px monospace';ctx.fillStyle='#334155';ctx.textAlign='right';
    ctx.fillText('Gridiron GM',390,215);
    // Download
    const a=document.createElement('a');
    a.download=`highlight-wk${gs.week}.png`;
    a.href=c.toDataURL('image/png');a.click();
  }
}
