import { state, exportStats } from '../data/gameState.js';
import { track } from '../utils/analytics.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const stats = exportStats();
    const won = state.score.team > state.score.opp;
    track('game_complete', { won:won?1:0, score_team:state.score.team, score_opp:state.score.opp, plays:state.plays });

    this.add.rectangle(W/2, H/2, W, H, 0x0a0f1a, 0.96);

    this.add.text(W/2, 46, won ? '🏆 VICTORY!' : '❌ DEFEAT', {
      fontSize:'36px', fontFamily:'monospace', fontStyle:'bold',
      color:won?'#f59e0b':'#ef4444', stroke:'#000', strokeThickness:4
    }).setOrigin(0.5);

    const t = state.team?.ab||'YOU', o = state.opponent?.ab||'OPP';
    this.add.text(W/2, 96, `${t} ${state.score.team} — ${state.score.opp} ${o}`, {
      fontSize:'22px', fontFamily:'monospace', fontStyle:'bold', color:'#f1f5f9'
    }).setOrigin(0.5);

    // GO2: Play of the Game
    if(state.bestPlay){
      this.add.text(W/2, 120, `⭐ PLAY OF THE GAME: ${state.bestPlay.name} — ${state.bestPlay.yards}yd ${state.bestPlay.type}`, {
        fontSize:'10px', fontFamily:'monospace', fontStyle:'bold', color:'#f59e0b', stroke:'#000', strokeThickness:2
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

    // GO1: player grade function
    const _grade=p=>{let sc=0;if(p.passYds){sc+=Math.min(50,p.passYds/5);sc+=(p.passTD||0)*12;sc-=(p.ints||0)*14;}if(p.rushYds){sc+=Math.min(40,p.rushYds/2.5);sc+=(p.rtds||0)*10;}if(p.recYds){sc+=Math.min(35,p.recYds/2.5);sc+=(p.retds||0)*10;}if(sc<=0)return null;return sc>=50?'A+':sc>=40?'A':sc>=30?'B+':sc>=20?'B':sc>=12?'C':sc>=4?'D':'F';};
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
        const g = _grade(p);
        this.add.text(W/2-10, 266+row*16, line, { fontSize:'9px', fontFamily:'monospace', color:'#475569' }).setOrigin(0.5);
        // GO1: grade badge
        if(g)this.add.text(W/2+W*0.28, 266+row*16, g, {fontSize:'9px',fontFamily:'monospace',fontStyle:'bold',color:_gcol(g)}).setOrigin(0.5);
        row++;
      });
    }

    // Drive chart — GO3: horizontal bar chart (width=yards gained, color=result)
    if (state.drives && state.drives.length) {
      this.add.text(W/2, 348, 'DRIVE CHART', { fontSize:'7px', fontFamily:'monospace', fontStyle:'bold', color:'#334155', letterSpacing:3 }).setOrigin(0.5);
      const maxYd = Math.max(1, ...state.drives.map(d=>d.yards||1));
      let tRow=0, oRow=0;
      state.drives.slice(0,10).forEach(d => {
        const isTeam = d.poss==='team';
        const row = isTeam ? tRow++ : oRow++;
        const x = isTeam ? W/2-190 : W/2+10;
        const clrH = (d.result==='TD'||d.result==='FG') ? 0x22c55e : (d.result==='INT'||d.result==='FUM') ? 0xef4444 : 0x475569;
        const clrT = (d.result==='TD'||d.result==='FG') ? '#22c55e' : (d.result==='INT'||d.result==='FUM') ? '#ef4444' : '#475569';
        const barW = Math.max(4, Math.round((d.yards||0)/maxYd*174));
        this.add.rectangle(x+barW/2, 358+row*13, barW, 7, clrH, 0.75).setOrigin(0.5);
        this.add.text(x, 358+row*13+1, `${d.yards||0}yd→${d.result}`, { fontSize:'7px', fontFamily:'monospace', color:clrT });
      });
    }

    // Injury report
    if (state.injuries && state.injuries.length > 0) {
      const injNames = state.injuries.map(i => {
        const pl = state.team?.players?.find(p => p.id === i.id);
        return `${pl?.name?.split(' ').pop() || i.pos} (${i.weeks}wk)`;
      }).join(', ');
      this.add.text(W/2, 376, `🚑 INJURED: ${injNames}`, {
        fontSize:'9px', fontFamily:'monospace', color:'#ef4444'
      }).setOrigin(0.5);
    }

    // Export notice
    this.add.text(W/2, 392, '✅ Stats saved — import to Gridiron GM to update your season', {
      fontSize:'9px', fontFamily:'monospace', color:'#334155'
    }).setOrigin(0.5);

    // Buttons
    const playAgain = this.add.rectangle(W/2-90, 430, 160, 40, 0x22c55e).setInteractive({ useHandCursor:true });
    this.add.text(W/2-90, 430, 'PLAY AGAIN', { fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#fff' }).setOrigin(0.5);
    playAgain.on('pointerdown', ()=>this.scene.start('Boot'));
    playAgain.on('pointerover', ()=>playAgain.setFillStyle(0x16a34a));
    playAgain.on('pointerout',  ()=>playAgain.setFillStyle(0x22c55e));

    const menu = this.add.rectangle(W/2+90, 430, 160, 40, 0x1e293b).setInteractive({ useHandCursor:true }).setStrokeStyle(1,0x334155);
    this.add.text(W/2+90, 430, 'MAIN MENU', { fontSize:'12px', fontFamily:'monospace', fontStyle:'bold', color:'#94a3b8' }).setOrigin(0.5);
    menu.on('pointerdown', ()=>this.scene.start('Boot'));
  }
}
