// Sound: Kenney CC0 sound effects (with a synth fallback when a browser can't
// decode Ogg) and a procedural synthwave loop whose tempo follows the sector.

const SCI = '../assets/kenney/sci-fi-sounds/';
const DIG = '../assets/kenney/digital-audio/';
const FILES = {
  shoot: SCI + 'laserRetro_000.ogg',
  shoot2: SCI + 'laserSmall_001.ogg',
  place: DIG + 'pepSound1.ogg',
  clear: DIG + 'zapThreeToneUp.ogg',
  link: DIG + 'threeTone1.ogg',
  junk: DIG + 'lowDown.ogg',
  crack: SCI + 'impactMetal_003.ogg',
  clank: SCI + 'impactMetal_001.ogg',
  bomb: SCI + 'explosionCrunch_000.ogg',
  boom: SCI + 'lowFrequency_explosion_001.ogg',
  power: DIG + 'powerUp2.ogg',
  use: DIG + 'phaserUp7.ogg',
  sector: DIG + 'powerUp10.ogg',
  warp: DIG + 'phaseJump1.ogg',
  shield: SCI + 'forceField_001.ogg',
  glitch: SCI + 'computerNoise_000.ogg',
  tick: DIG + 'tone1.ogg',
  fever: DIG + 'zapTwoTone.ogg',
};

// Am – F – C – G, the eternal synthwave progression (MIDI roots)
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.muted = false;
    try { this.muted = localStorage.getItem('backfill-muted') === '1'; } catch {}
    this.tempo = 108;
    this.intensity = 0;   // 0..1, opens the filter and adds layers
    this.fever = false;
    this.slow = false;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.55; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.32;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 2400; this.musicFilter.Q.value = 3;
    this.musicBus.connect(this.musicFilter).connect(this.master);

    // a short feedback delay gives the arps that wide 80s space
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.33;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.musicFilter);

    const n = ctx.sampleRate * 0.5;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    for (const [k, url] of Object.entries(FILES)) {
      fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b))
        .then(buf => { this.buffers[k] = buf; }).catch(() => {});
    }
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('backfill-muted', m ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  play(name, { rate = 1, gain = 1 } = {}) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const buf = this.buffers[name];
    if (buf) {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.playbackRate.value = rate;
      const g = ctx.createGain(); g.gain.value = gain;
      s.connect(g).connect(this.sfxBus);
      s.start();
      return;
    }
    this.synth(name, rate, gain);
  }

  // fallback blips so the game still sounds alive without Ogg support
  synth(name, rate, gain) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const tone = { shoot: [880, 440, 'square', .08], shoot2: [990, 500, 'square', .07], place: [520, 700, 'triangle', .08],
      clear: [500, 1400, 'sawtooth', .25], link: [400, 1600, 'sawtooth', .35], junk: [300, 90, 'sawtooth', .3],
      crack: [200, 80, 'square', .15], clank: [300, 150, 'square', .1], bomb: [120, 40, 'sawtooth', .4], boom: [90, 30, 'sawtooth', .6],
      power: [400, 1200, 'triangle', .3], use: [300, 1500, 'sawtooth', .35], sector: [440, 1760, 'triangle', .6],
      warp: [200, 2000, 'sine', .6], shield: [600, 200, 'sine', .4], glitch: [1800, 300, 'square', .12],
      tick: [1000, 1000, 'sine', .05], fever: [600, 1800, 'square', .3] }[name] || [440, 440, 'sine', .1];
    o.type = tone[2];
    o.frequency.setValueAtTime(tone[0] * rate, t);
    o.frequency.exponentialRampToValueAtTime(tone[1] * rate, t + tone[3]);
    g.gain.setValueAtTime(0.18 * gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + tone[3] + 0.05);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + tone[3] + 0.1);
  }

  // ---------- music ----------
  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
  }
  stopMusic() { this.playing = false; }

  update() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const target = this.slow ? 600 : this.fever ? 9000 : 1500 + this.intensity * 3500;
    this.musicFilter.frequency.setTargetAtTime(target, ctx.currentTime, 0.25);
    const spb = 60 / this.tempo / 4; // sixteenth notes
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextTime, spb);
      this.nextTime += spb * (this.slow ? 1.35 : 1);
      this.step = (this.step + 1) % 64;
    }
  }

  scheduleStep(step, t, spb) {
    const bar = Math.floor(step / 16), s = step % 16;
    const chord = CHORDS[bar];
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 1) this.hat(t, 0.05);
    if (this.intensity > 0.3 && s % 2 === 0 && s % 4 !== 0) this.hat(t, 0.025);
    // driving octave bass
    const bassNote = chord[0] - 24 + (s % 2 ? 12 : 0);
    this.voice(t, bassNote, spb * 0.9, 'sawtooth', 0.22, 700);
    // arpeggio
    if (this.intensity > 0.15 || this.fever) {
      const arp = [0, 1, 2, 1, 2, 0, 1, 2][s % 8];
      this.voice(t, chord[arp] + 12, spb * 0.8, 'square', 0.06, 3000, true);
    }
    // pad on each bar
    if (s === 0) for (const n of chord) this.voice(t, n, spb * 15, 'sawtooth', 0.035, 1400, false, 0.3);
    // fever lead
    if (this.fever && s % 4 === 2) this.voice(t, chord[(s / 2) % 3] + 24, spb * 1.5, 'square', 0.05, 5000, true);
  }

  voice(t, midi, dur, type, vol, cutoff, delayed = false, attack = 0.005) {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = o2.type = type;
    o.frequency.value = f; o2.frequency.value = f; o2.detune.value = 9;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(flt); o2.connect(flt); flt.connect(g).connect(this.musicBus);
    if (delayed) g.connect(this.delay);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.32);
  }
  snare(t) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    s.connect(f).connect(g).connect(this.musicBus); g.connect(this.delay);
    s.start(t); s.stop(t + 0.22);
  }
  hat(t, vol) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol * 4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random() * 0.3); s.stop(t + 0.06);
  }
}
