// Tiny WebAudio synth: UI blips, build sounds and an ambient bed of surf, gulls and night crickets.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.night = 0; this.gullT = 6; this.cricketT = 1; }
  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      this.ctx = new C(); this.out = this.ctx.createGain(); this.out.gain.value = this.on ? 0.5 : 0; this.out.connect(this.ctx.destination);
      this.surf();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setOn(v) { this.on = v; if (this.out) this.out.gain.setTargetAtTime(v ? 0.5 : 0, this.ctx.currentTime, 0.1); }
  tone(f, d = 0.12, { type = 'sine', vol = 0.2, slide = 0, delay = 0, attack = 0.008 } = {}) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + d + 0.05);
  }
  noise(d = 0.2, { vol = 0.2, freq = 1000, q = 1, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay, n = Math.ceil(this.ctx.sampleRate * d);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), a = b.getChannelData(0); for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(f).connect(g).connect(this.out); s.start(t);
  }
  click() { this.tone(880, 0.05, { type: 'triangle', vol: 0.08 }); }
  build(tool) {
    if (tool === 'bulldoze') { this.noise(0.35, { vol: 0.25, freq: 400, q: 0.6, type: 'lowpass' }); return; }
    if (tool && tool.startsWith('zone')) { this.tone(520, 0.08, { type: 'triangle', vol: 0.08 }); this.tone(780, 0.1, { type: 'triangle', vol: 0.06, delay: 0.05 }); return; }
    this.noise(0.12, { vol: 0.18, freq: 900, q: 1.2 }); this.tone(180, 0.12, { vol: 0.12, slide: -60 });
  }
  place() { this.noise(0.25, { vol: 0.2, freq: 300, q: 0.7, type: 'lowpass' }); [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.07, delay: 0.08 + i * 0.07 })); }
  grow() { this.tone(900 + Math.random() * 400, 0.08, { type: 'sine', vol: 0.025 }); }
  err() { this.tone(220, 0.14, { type: 'square', vol: 0.05 }); this.tone(180, 0.18, { type: 'square', vol: 0.05, delay: 0.1 }); }
  chime() { [659, 880, 1175].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.08, delay: i * 0.12 })); }
  // endless surf: looping filtered noise with slow swells
  surf() {
    const c = this.ctx, n = c.sampleRate * 4, b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0);
    let last = 0; for (let i = 0; i < n; i++) { last = last * 0.98 + (Math.random() * 2 - 1) * 0.02; a[i] = last * 6; }
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = c.createGain(); g.gain.value = 0.18;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.1; lfo.connect(lg).connect(g.gain); lfo.start();
    s.connect(f).connect(g).connect(this.out); s.start();
    this.surfGain = g;
  }
  update(dt, night, zoom) {
    if (!this.ctx || !this.on) return;
    this.night = night;
    this.gullT -= dt; this.cricketT -= dt;
    if (this.gullT <= 0 && night < 0.5) { this.gullT = 7 + Math.random() * 12; const f = 1300 + Math.random() * 300; for (let i = 0; i < 2 + Math.random() * 2; i++) this.tone(f, 0.22, { type: 'sawtooth', vol: 0.012, slide: -500, delay: i * 0.26, attack: 0.03 }); }
    if (this.cricketT <= 0 && night > 0.6) { this.cricketT = 0.9 + Math.random() * 1.4; for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 200, 0.04, { type: 'sine', vol: 0.012, delay: i * 0.07 }); }
  }
}
