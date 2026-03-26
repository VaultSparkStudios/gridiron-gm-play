// Web Audio beep utilities — no audio files needed
export const Sound = {
  _ctx: null,
  _get() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    return this._ctx;
  },
  play(freq, type = 'square', dur = 0.12, vol = 0.3) {
    try {
      const ctx = this._get(); if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch {}
  },
  td()        { this.play(523,'square',0.1,0.4); setTimeout(()=>this.play(659,'square',0.12,0.4),110); setTimeout(()=>this.play(784,'square',0.22,0.35),230); },
  tackle()    { this.play(140,'sawtooth',0.13,0.22); },
  juke()      { this.play(440,'sine',0.08,0.18); },
  sack()      { this.play(110,'sawtooth',0.16,0.28); },
  int()       { this.play(320,'square',0.09,0.2); setTimeout(()=>this.play(210,'sawtooth',0.13,0.2),80); },
  firstDown() { this.play(523,'sine',0.09,0.25); setTimeout(()=>this.play(659,'sine',0.12,0.25),100); },
  incomplete(){ this.play(200,'sine',0.09,0.12); },
  whistle()   { [820,930,1020,930].forEach((f,i)=>setTimeout(()=>this.play(f,'sine',0.07,0.18),i*55)); },
  bigPlay()   { [440,554,659,880].forEach((f,i)=>setTimeout(()=>this.play(f,'sine',0.14,0.3),i*80)); }, // ascending fanfare for 20+ yd gain
  fumble()    { this.play(90,'sawtooth',0.2,0.32); setTimeout(()=>this.play(65,'sawtooth',0.15,0.3),90); }, // heavy impact thud
  fg()        { this.play(622,'sine',0.1,0.14); setTimeout(()=>this.play(784,'sine',0.12,0.16),120); setTimeout(()=>this.play(988,'square',0.18,0.28),260); }, // rising "FG good" chime
  penalty()   { [400,300].forEach((f,i)=>setTimeout(()=>this.play(f,'square',0.12,0.18),i*160)); }, // double-tone penalty buzzer
  crowd(vol=0.12) { for(let i=0;i<6;i++) setTimeout(()=>this.play(120+Math.random()*40,'sine',0.08,vol),i*30); }, // crowd rumble
};
