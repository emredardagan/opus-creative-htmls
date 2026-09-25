// Toybox — shared 3D kit for the soft, toy-like games in this collection.
// One place for renderer setup, lighting, post effects, model loading,
// particles, pop-up text and tiny synth sound effects.
//
// Pages must provide this import map (versions pinned):
//   three, three/addons/, three/examples/jsm/, postprocessing, n8ao
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';

export { THREE };
export const ASSETS = new URL('../', import.meta.url).href; // …/assets/
export const kenney = path => `${ASSETS}kenney/${path}.glb`;

export const PALETTE = {
  sky: 0xbfe7ff,
  skyLow: 0xfdf1dc,
  grass: 0x9bd46a,
  grassDark: 0x8cc75d,
  grassEdge: 0x7fb452,
  road: 0x5a6070,
  roadLine: 0xf6f1e3,
  water: 0x5cc8e8,
  sand: 0xf1dca5,
  ink: 0x2b2d42,
};

// ---------- stage: renderer, scene, lights, post ----------
export function createStage({
  canvas,
  fov = 32,
  background = PALETTE.sky,
  fog = [28, 60],
  hdri = `${ASSETS}hdri/kloofendal_puresky_1k.hdr`,
  envIntensity = 0.55,
  ao = true,
  maxPixelRatio = 2,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  if (fog) scene.fog = new THREE.Fog(background, fog[0], fog[1]);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);

  // soft sky fill + warm sun
  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x8a9a5b, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const sunOffset = sun.position.clone();

  // image-based light from a CC0 Poly Haven sky (soft reflections, nicer shading)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envReady = hdri
    ? new HDRLoader().loadAsync(hdri).then(tex => {
        scene.environment = pmrem.fromEquirectangular(tex).texture;
        scene.environmentIntensity = envIntensity;
        tex.dispose();
      }).catch(() => {})
    : Promise.resolve();

  // post: ambient occlusion (contact shadows in every crease) + tone-mapped output
  let composer = null, aoPass = null;
  if (ao) {
    composer = new EffectComposer(renderer);
    aoPass = new N8AOPass(scene, camera, 1, 1);
    Object.assign(aoPass.configuration, {
      aoRadius: 1.2, distanceFalloff: 1.0, intensity: 2.2,
      color: new THREE.Color(0x2a3350), gammaCorrection: false,
    });
    aoPass.setQualityMode('Medium');
    composer.addPass(aoPass);
    composer.addPass(new OutputPass());
  }

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); composer.setPixelRatio(renderer.getPixelRatio()); }
  }
  addEventListener('resize', resize);
  resize();

  return {
    renderer, scene, camera, sun, hemi, composer, aoPass, envReady, resize,
    // keep the shadow frustum centred on the action
    followShadow(target) {
      sun.target.position.copy(target);
      sun.position.copy(target).add(sunOffset);
    },
    render() { composer ? composer.render() : renderer.render(scene, camera); },
  };
}

// ---------- models ----------
const loader = new GLTFLoader();
const cache = new Map();   // path -> Promise<gltf>
const ready = new Map();   // path -> gltf, once loaded

export function preload(paths, onProgress) {
  let done = 0;
  return Promise.all(paths.map(p => load(p).then(g => { onProgress?.(++done / paths.length); return g; })));
}

export function load(path) {
  if (!cache.has(path)) {
    cache.set(path, loader.loadAsync(path).then(gltf => {
      gltf.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          if (o.material?.map) o.material.map.anisotropy = 4;
        }
      });
      ready.set(path, gltf);
      return gltf;
    }));
  }
  return cache.get(path);
}

// Synchronous clone of an already-loaded model. Animated models get their own mixer.
export async function spawn(path, { scale = 1, shadows = true } = {}) {
  const gltf = await load(path);
  return cloneLoaded(gltf, { scale, shadows });
}

export function cloneLoaded(gltf, { scale = 1, shadows = true } = {}) {
  const animated = gltf.animations.length > 0;
  const object = animated ? SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
  object.scale.setScalar(scale);
  if (!shadows) object.traverse(o => { if (o.isMesh) o.castShadow = false; });
  let mixer = null, actions = {};
  if (animated) {
    mixer = new THREE.AnimationMixer(object);
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  }
  return { object, mixer, actions };
}

// The loaded glTF for a path (after preload), for synchronous cloning in game loops.
export const loaded = path => ready.get(path);

// ---------- particles (Kenney particle pack sprites) ----------
export class Bursts {
  constructor(scene, max = 240) {
    this.scene = scene;
    this.tex = {};
    this.pool = [];
    this.live = [];
    const tl = new THREE.TextureLoader();
    for (const n of ['star_06', 'spark_05', 'smoke_04', 'circle_05', 'magic_03', 'twirl_02', 'light_01', 'dirt_02', 'trace_03']) {
      const t = tl.load(`${ASSETS}kenney/particles/${n}.png`);
      t.colorSpace = THREE.SRGBColorSpace;
      this.tex[n] = t;
    }
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
      s.visible = false;
      scene.add(s);
      this.pool.push(s);
    }
  }
  emit(pos, {
    tex = 'circle_05', count = 12, color = 0xffffff, colors = null, speed = [1.5, 3.5], up = 2.5,
    life = [0.4, 0.8], size = [0.25, 0.5], gravity = -6, spread = 1, grow = 1.2, additive = false, drag = 0.9,
  } = {}) {
    const rnd = (a) => Array.isArray(a) ? a[0] + Math.random() * (a[1] - a[0]) : a;
    for (let i = 0; i < count && this.pool.length; i++) {
      const s = this.pool.pop();
      const m = s.material;
      m.map = this.tex[tex];
      m.color.set(colors ? colors[(Math.random() * colors.length) | 0] : color);
      m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.opacity = 1;
      m.rotation = Math.random() * Math.PI * 2;
      m.needsUpdate = true;
      s.position.copy(pos);
      const a = Math.random() * Math.PI * 2, sp = rnd(speed);
      const sz = rnd(size);
      s.scale.setScalar(sz);
      s.visible = true;
      s.userData = {
        v: new THREE.Vector3(Math.cos(a) * sp * spread, rnd(up), Math.sin(a) * sp * spread),
        life: rnd(life), age: 0, size: sz, gravity, grow, drag, spin: (Math.random() - 0.5) * 4,
      };
      this.live.push(s);
    }
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i], u = s.userData;
      u.age += dt;
      const k = u.age / u.life;
      if (k >= 1) { s.visible = false; this.live.splice(i, 1); this.pool.push(s); continue; }
      u.v.y += u.gravity * dt;
      u.v.multiplyScalar(Math.pow(u.drag, dt * 10));
      s.position.addScaledVector(u.v, dt);
      s.material.opacity = 1 - k * k;
      s.material.rotation += u.spin * dt;
      s.scale.setScalar(u.size * (1 + (u.grow - 1) * k));
    }
  }
}

// ---------- pop-up text that tracks a 3D point ----------
export function popText(stage, pos, text, cls = '') {
  const el = document.createElement('div');
  el.className = `tb-pop ${cls}`;
  el.textContent = text;
  document.body.append(el);
  const p = pos.clone();
  const t0 = performance.now();
  const tick = () => {
    const k = (performance.now() - t0) / 900;
    if (k >= 1) { el.remove(); return; }
    const v = p.clone().setY(p.y + k * 0.8).project(stage.camera);
    el.style.transform = `translate(-50%, -50%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) scale(${k < 0.15 ? 0.6 + k * 2.7 : 1})`;
    el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    requestAnimationFrame(tick);
  };
  tick();
}

// ---------- tiny synth for game sounds ----------
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.5;
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  tone(freq, dur = 0.1, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.3, { vol = 0.3, freq = 1200, q = 0.8, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.out); src.start(t);
  }
}

// ---------- helpers ----------
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
