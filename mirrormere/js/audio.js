// Ambience beds that cross-fade with the hour and weather, CC0 one-shots,
// and a little synth for the clicks and chimes.
const BASE = new URL('../../assets/audio/mirrormere/', import.meta.url).href;

export class Audio {
  constructor() {
    this.ctx = null; this.buffers = {}; this.beds = {}; this.muted = false; this.musicOn = true;
    this.reelNode = null;
  }
  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.7; this.ambBus.connect(this.master);
    this.musBus = ctx.createGain(); this.musBus.gain.value = 0.32; this.musBus.connect(this.master);
    const names = ['amb-forest', 'amb-crickets', 'amb-rain', 'amb-lap', 'music-another-august', 'music-small-fire',
      'splash-01', 'splash-03', 'splash-04', 'splash-06', 'plop-a', 'plop-b', 'bubbles', 'swim'];
    await Promise.all(names.map(async n => {
      try {
        const r = await fetch(`${BASE}${n}.m4a`);
        this.buffers[n] = await ctx.decodeAudioData(await r.arrayBuffer());
      } catch { /* a missing sound shouldn't stop the game */ }
    }));
    for (const n of ['amb-forest', 'amb-crickets', 'amb-rain', 'amb-lap']) this.beds[n] = this.loop(n, this.ambBus);
    this.music = { a: this.loop('music-another-august', this.musBus), b: this.loop('music-small-fire', this.musBus) };
    this.ready = true;
  }
  loop(name, bus) {
    const buf = this.buffers[name];
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(bus);
    if (buf) {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      s.connect(g); s.start(0, Math.random() * buf.duration);
    }
    return g;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.1);
  }
  // night 0..1, rain 0..1
  setMood(night, rain) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, k = 1.5;
    this.beds['amb-forest'].gain.setTargetAtTime((1 - night) * (1 - rain * 0.7) * 0.55, t, k);
    this.beds['amb-crickets'].gain.setTargetAtTime(night * (1 - rain * 0.6) * 0.5, t, k);
    this.beds['amb-rain'].gain.setTargetAtTime(rain * 0.75, t, k);
    this.beds['amb-lap'].gain.setTargetAtTime(0.35, t, k);
    const on = this.musicOn ? 1 : 0;
    this.music.a.gain.setTargetAtTime(on * (1 - night) * 0.9, t, 3);
    this.music.b.gain.setTargetAtTime(on * night * 0.9, t, 3);
  }
  play(name, { vol = 1, rate = 1, delay = 0 } = {}) {
    const buf = this.buffers[name];
    if (!this.ctx || !buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g).connect(this.sfxBus); s.start(this.ctx.currentTime + delay);
  }
  splash(size = 1) {
    const pick = size > 1.3 ? 'splash-01' : size > 0.8 ? ['splash-04', 'splash-06'][Math.random() * 2 | 0] : 'splash-03';
    this.play(pick, { vol: Math.min(1, 0.35 + size * 0.4), rate: 1.15 - Math.min(size, 1.6) * 0.15 + Math.random() * 0.1 });
  }
  plop() { this.play(Math.random() < 0.5 ? 'plop-a' : 'plop-b', { vol: 0.7, rate: 0.9 + Math.random() * 0.3 }); }

  tone(freq, dur = 0.12, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur = 0.25, { vol = 0.2, freq = 1200, q = 0.7, type = 'bandpass', delay = 0, sweep = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + sweep), t + dur);
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.sfxBus); src.start(t);
  }
  whoosh() { this.noise(0.45, { vol: 0.35, freq: 500, sweep: 2200, q: 1.2 }); }
  click() { this.noise(0.02, { vol: 0.25, freq: 3200, q: 2 }); }
  snap() { this.tone(900, 0.08, { type: 'square', vol: 0.12, slide: -700 }); this.noise(0.18, { vol: 0.3, freq: 2400, q: 1 }); }
  bite() { this.tone(520, 0.09, { type: 'triangle', vol: 0.16 }); this.tone(780, 0.14, { type: 'triangle', vol: 0.16, delay: 0.08 }); }
  croak() {
    if (!this.ctx) return;
    for (let i = 0; i < 2; i++) this.tone(140 + Math.random() * 20, 0.09, { type: 'sawtooth', vol: 0.05, slide: -40, delay: i * 0.13 });
  }
  coin(n = 1) { for (let i = 0; i < Math.min(n, 6); i++) this.tone(1320 + i * 120, 0.12, { type: 'triangle', vol: 0.09, delay: i * 0.06 }); }
  fanfare(rarity) {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    const n = 2 + rarity;
    for (let i = 0; i < n; i++) this.tone(notes[i % notes.length] * (i >= 6 ? 2 : 1), 0.5, { type: 'triangle', vol: 0.13, delay: i * 0.09 });
    if (rarity >= 4) for (let i = 0; i < 5; i++) this.tone(2093 + i * 260, 0.4, { type: 'sine', vol: 0.05, delay: 0.5 + i * 0.07 });
  }
  uiTap() { this.tone(660, 0.06, { type: 'triangle', vol: 0.1 }); }
}
