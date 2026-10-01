// All sound is synthesised: wind, birdsong, the stream, crickets at night, footsteps by surface,
// little UI chimes, animal voices, and a slow generative music box over a warm pad.
export class Sfx {
  constructor() { this.on = true; this.ctx = null; this.vol = 0.8; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const c = this.ctx = new A();
    this.master = c.createGain(); this.master.gain.value = this.on ? this.vol : 0; this.master.connect(c.destination);
    // a soft room so everything sits together
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(2.6); const vg = c.createGain(); vg.gain.value = 0.32; this.verb.connect(vg).connect(this.master);
    this.fxBus = c.createGain(); this.fxBus.gain.value = 0.9; this.fxBus.connect(this.master); this.fxBus.connect(this.verb);
    const noise = this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // wind: filtered noise breathing slowly
    this.wind = this.loopNoise(380, 0.4, 0.0); this.stream = this.loopNoise(1400, 1.2, 0.0, 'bandpass'); this.sea = this.loopNoise(500, 0.6, 0.0);
    this.cr = 0; this.birdT = 2; this.musicT = 0; this.beat = 0;
    this.musicGain = c.createGain(); this.musicGain.gain.value = 0.0; this.musicGain.connect(this.master); this.musicGain.connect(this.verb);
    this.musicGain.gain.linearRampToValueAtTime(0.5, c.currentTime + 6);
  }
  impulse(sec) {
    const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    return b;
  }
  loopNoise(freq, q, gain, type = 'lowpass') {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(this.master); s.start();
    return { f, g };
  }
  setOn(v) { this.on = v; if (this.master) this.master.gain.setTargetAtTime(v ? this.vol : 0, this.ctx.currentTime, 0.1); }
  // ---------------------------------------------------------------- building blocks
  tone(freq, dur, { type = 'sine', vol = 0.2, attack = 0.005, slide = 0, delay = 0, dest, filter } = {}) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o; if (filter) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); n = f; }
    n.connect(g).connect(dest || this.fxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, freq, { vol = 0.2, q = 1, type = 'bandpass', delay = 0, slide = 0 } = {}) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.fxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // ---------------------------------------------------------------- game sounds
  step(surface) {
    const m = { grass: [2400, 0.07, 0.05], dirt: [900, 0.06, 0.07], wood: [520, 0.08, 0.12], stone: [1500, 0.05, 0.08], water: [700, 0.18, 0.08] }[surface] || [1800, 0.06, 0.05];
    this.burst(m[1], m[0] * (0.85 + Math.random() * 0.3), { vol: m[2], q: 0.8 });
    if (surface === 'wood') this.tone(140 + Math.random() * 30, 0.08, { type: 'triangle', vol: 0.05 });
  }
  jump() { this.tone(330, 0.16, { type: 'triangle', vol: 0.07, slide: 1.6 }); this.burst(0.1, 1600, { vol: 0.04 }); }
  land(k) { this.burst(0.12 + k * 0.1, 500, { vol: 0.08 + k * 0.1, type: 'lowpass' }); }
  glide() { this.burst(0.5, 600, { vol: 0.06, slide: 2.5, q: 0.6 }); this.tone(520, 0.25, { type: 'sine', vol: 0.05, slide: 1.5 }); }
  splash() { this.burst(0.45, 900, { vol: 0.2, slide: 0.4, q: 0.5 }); this.burst(0.25, 2600, { vol: 0.08, delay: 0.05 }); }
  pickup() { [784, 988, 1319].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.09, delay: i * 0.06 })); }
  feather() { [1047, 1319, 1568, 2093, 2637].forEach((f, i) => { this.tone(f, 0.7, { vol: 0.08, delay: i * 0.07 }); this.tone(f * 2, 0.4, { vol: 0.02, delay: i * 0.07 }); }); }
  chime(n) { const s = [784, 880, 988, 1175, 1319, 1568, 1760]; this.tone(s[n % 7], 1.2, { vol: 0.1 }); this.tone(s[n % 7] * 1.5, 0.8, { vol: 0.03, delay: 0.02 }); }
  quest() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.08, delay: i * 0.1 })); }
  complete() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.55, { type: 'triangle', vol: 0.09, delay: i * 0.09 })); this.tone(262, 1.4, { type: 'sine', vol: 0.1, delay: 0.3 }); }
  talk(kind) { const p = this.voice(kind); this.tone(p * 1.2, 0.12, { type: 'triangle', vol: 0.07, slide: 1.3 }); }
  voice(kind) { return { fox: 520, cow: 220, bunny: 760, penguin: 400, bee: 900, cat: 660, deer: 440 }[kind] || 500; }
  blip(kind) { const p = this.voice(kind) * (0.85 + Math.random() * 0.35); this.tone(p, 0.06, { type: 'square', vol: 0.025, filter: 1800 }); }
  mew() { this.tone(900, 0.35, { type: 'triangle', vol: 0.06, slide: 0.6 }); this.tone(1200, 0.2, { type: 'sine', vol: 0.03, slide: 0.7, delay: 0.05 }); }
  cast() { this.burst(0.35, 1200, { vol: 0.06, slide: 2.5, q: 2 }); }
  plop() { this.tone(420, 0.18, { vol: 0.12, slide: 0.4 }); }
  bite() { this.tone(300, 0.12, { vol: 0.15, slide: 0.5 }); this.burst(0.25, 1100, { vol: 0.12 }); }
  reel() { for (let i = 0; i < 10; i++) this.burst(0.03, 3000, { vol: 0.05, delay: i * 0.04 }); }
  whoosh() { this.burst(1.6, 300, { vol: 0.3, slide: 4, q: 0.5 }); this.tone(110, 1.8, { type: 'sawtooth', vol: 0.05, filter: 400 }); }
  firework() { this.burst(0.6, 500, { vol: 0.25, type: 'lowpass', delay: 0.05 }); for (let i = 0; i < 12; i++) this.burst(0.05, 4000 + Math.random() * 2000, { vol: 0.03, delay: 0.3 + Math.random() * 0.9 }); }
  ui() { this.tone(660, 0.08, { type: 'triangle', vol: 0.05 }); }
  bird(pan = 0) {
    // a short trill: a few quick chirps sweeping up or down
    const base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 4), up = Math.random() < 0.5;
    for (let i = 0; i < n; i++) this.tone(base * (1 + i * 0.04), 0.07 + Math.random() * 0.05, { vol: 0.025, slide: up ? 1.35 : 0.72, delay: i * 0.09, attack: 0.01 });
  }
  cricket() { for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.03, { type: 'square', vol: 0.01, delay: i * 0.05, filter: 6000 }); }
  // ---------------------------------------------------------------- per frame ambience + music
  update(dt, { night, nearWater, nearSea, height, speed }) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const windAmt = 0.03 + Math.min(0.12, height / 400) + Math.min(0.05, speed / 200);
    this.wind.g.gain.setTargetAtTime(windAmt, t, 0.6); this.wind.f.frequency.setTargetAtTime(300 + Math.sin(t * 0.3) * 120 + height * 6, t, 0.5);
    this.stream.g.gain.setTargetAtTime(nearWater * 0.07, t, 0.3);
    this.sea.g.gain.setTargetAtTime(nearSea * (0.05 + Math.sin(t * 0.5) * 0.02), t, 0.4);
    this.birdT -= dt;
    if (this.birdT <= 0) { this.birdT = 1.2 + Math.random() * 3.5; if (night < 0.5) this.bird(); }
    this.cr -= dt; if (night > 0.5 && this.cr <= 0) { this.cr = 0.4 + Math.random() * 0.9; this.cricket(); }
    // music: a chord every two bars, a music-box note on some beats
    this.musicT -= dt;
    if (this.musicT <= 0) {
      const beat = 60 / (night > 0.5 ? 58 : 70); this.musicT += beat;
      const prog = [[62, 66, 69, 74], [59, 62, 66, 71], [55, 59, 62, 67], [57, 61, 64, 69]];
      const bar = Math.floor(this.beat / 8) % 4, ch = prog[bar], mf = m => 440 * Math.pow(2, (m - 69) / 12);
      if (this.beat % 8 === 0) for (const m of ch) { this.tone(mf(m - 12), beat * 8.5, { type: 'triangle', vol: 0.025, attack: 1.4, dest: this.musicGain, filter: 900 }); }
      const scale = [62, 64, 66, 69, 71, 74, 76, 78, 81];
      if (Math.random() < (this.beat % 2 ? 0.25 : 0.55)) {
        const m = scale[Math.floor(Math.random() * scale.length)];
        this.tone(mf(m), 1.8, { type: 'sine', vol: 0.05, dest: this.musicGain }); this.tone(mf(m) * 3, 0.6, { type: 'sine', vol: 0.008, dest: this.musicGain });
      }
      this.beat++;
    }
  }
}
