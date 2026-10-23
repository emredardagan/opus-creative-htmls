// The valley around Mirrormere: terrain, sky, light through the day, weather,
// trees and reeds, the dock, and everything that lives around the lake.
import * as THREE from 'three';
import * as A from './assets.js';
import { createWater } from './water.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- deterministic noise ----------
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + rand() * (b - a);
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 5, y * 2.1 + 3) * 0.3 + vnoise(x * 4.3 + 9, y * 4.3 + 1) * 0.15;

// ---------- the lake ----------
export const COVE_A = 2.75; // the lily cove, front-left of the dock
const angDist = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export function lakeR(a) {
  return 58 + 6 * Math.sin(3 * a + 0.5) + 4 * Math.cos(5 * a + 1.3) + 1.8 * Math.sin(7 * a + 2)
    + 12 * Math.exp(-Math.pow(angDist(a, COVE_A), 2) / 0.05);
}
export function heightAt(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const e = r - lakeR(a);
  if (e < 0) {
    const k = smooth(0, 50, -e);
    return -0.35 - 9 * Math.pow(k, 1.2) + (fbm(x * 0.12, z * 0.12) - 0.5) * 0.5 * smooth(0, 6, -e);
  }
  const beach = smooth(0, 7, e) * 1.1;
  const hills = smooth(8, 60, e) * (3 + 10 * fbm(x * 0.017 + 2, z * 0.017));
  const ridge = Math.pow(Math.abs(fbm(x * 0.006 + 7, z * 0.006 + 1) * 2 - 1), 0.7);
  const mountains = smooth(70, 170, e) * (22 + 46 * (1 - ridge) + 14 * fbm(x * 0.02, z * 0.02));
  const bumps = (fbm(x * 0.09, z * 0.09) - 0.4) * 1.1 * smooth(2, 8, e);
  return -0.35 + beach + hills + mountains + bumps;
}
export const depthAt = (x, z) => Math.max(0, -heightAt(x, z));
const polar = (a, r) => new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
export const COVE_CENTER = polar(COVE_A, lakeR(COVE_A) - 13);

export function zoneAt(x, z) {
  const d = depthAt(x, z);
  if (d < 0.08) return 'land';
  if (Math.hypot(x - COVE_CENTER.x, z - COVE_CENTER.z) < 16 && d < 4.5) return 'lily';
  if (d < 1.9) return 'shallows';
  if (d > 6.4) return 'deep';
  return 'open';
}
export const ZONE_NAME = { shallows: 'Shallows', lily: 'Lily pads', open: 'Open water', deep: 'Deep water', land: 'Too far — that\'s the shore' };

// ---------- fishing spots ----------
const DOCK_A = Math.PI / 2;
const DOCK_SHORE = lakeR(DOCK_A);
const DOCK_END = DOCK_SHORE - 11;
function spotFrom(pos, target, eye) {
  const d = target.clone().sub(pos);
  return { pos: pos.clone().setY(eye), yaw: Math.atan2(-d.x, -d.z) };
}
export const SPOTS = {
  dock: { name: 'Old Dock', desc: 'Where everyone starts. Shallows close in, open water further out, the deep middle for a long cast.',
    ...spotFrom(new THREE.Vector3(0, 0, DOCK_END + 3), new THREE.Vector3(-4, 0, -10), 1.62) },
  cove: { name: 'Lily Cove', desc: 'A sheltered bay full of lily pads, koi and frogs. Shallow and slow.',
    ...spotFrom(polar(COVE_A + 0.04, lakeR(COVE_A) - 25), polar(COVE_A - 0.08, lakeR(COVE_A) + 6), 1.45) },
  boat: { name: 'The Deep Middle', desc: 'Row out over the deepest water. Big fish, long fights, and the Old Mirror, if it exists.',
    ...spotFrom(new THREE.Vector3(10, 0, 12), new THREE.Vector3(-12, 0, -16), 1.25) },
};

// ---------- day palette ----------
// t: 0 = midnight, .25 = sunrise, .5 = noon, .75 = sunset
const KEYS = [
  { t: 0.00, top: 0x0a1534, hor: 0x2a3d6e, sun: 0x8fa8ff, sunI: 0.32, hemiS: 0x3a4f8a, hemiG: 0x1a2230, hemiI: 0.62, deep: 0x06203a, shal: 0x143c58, light: 0.42, cloud: 0x263258 },
  { t: 0.19, top: 0x0f1a3c, hor: 0x2a3560, sun: 0x8fa8ff, sunI: 0.25, hemiS: 0x2e3c6c, hemiG: 0x141a22, hemiI: 0.42, deep: 0x061a2a, shal: 0x10384a, light: 0.36, cloud: 0x242c50 },
  { t: 0.235, top: 0x3a4d8f, hor: 0xf3a07a, sun: 0xffa36b, sunI: 1.1, hemiS: 0x8f8fc0, hemiG: 0x3a3028, hemiI: 0.6, deep: 0x123048, shal: 0x3b6f7a, light: 0.62, cloud: 0xf2a08a },
  { t: 0.30, top: 0x5c9de2, hor: 0xffd9b0, sun: 0xffd2a0, sunI: 2.1, hemiS: 0xbcd8f0, hemiG: 0x5a5a40, hemiI: 0.8, deep: 0x0d3c52, shal: 0x3fa39a, light: 0.88, cloud: 0xfff0e0 },
  { t: 0.50, top: 0x3b8de6, hor: 0xc4e4f8, sun: 0xfff4e0, sunI: 2.7, hemiS: 0xcfe6ff, hemiG: 0x6a7048, hemiI: 0.95, deep: 0x0b4258, shal: 0x44b0a4, light: 1.0, cloud: 0xffffff },
  { t: 0.68, top: 0x4a82d0, hor: 0xf8d8a8, sun: 0xffd9a0, sunI: 2.3, hemiS: 0xc8d8f0, hemiG: 0x6a6040, hemiI: 0.85, deep: 0x0d3c52, shal: 0x3fa39a, light: 0.92, cloud: 0xfff2dc },
  { t: 0.745, top: 0x34407e, hor: 0xff8a52, sun: 0xff8848, sunI: 1.5, hemiS: 0xb08aa8, hemiG: 0x40302a, hemiI: 0.66, deep: 0x1a2c48, shal: 0x5a6a78, light: 0.66, cloud: 0xff9a78 },
  { t: 0.80, top: 0x161d48, hor: 0x7a4a78, sun: 0xb07ac0, sunI: 0.35, hemiS: 0x4a4278, hemiG: 0x1a1a24, hemiI: 0.48, deep: 0x0a1a30, shal: 0x203048, light: 0.42, cloud: 0x4a3a62 },
  { t: 0.87, top: 0x0a1534, hor: 0x2a3d6e, sun: 0x8fa8ff, sunI: 0.32, hemiS: 0x3a4f8a, hemiG: 0x1a2230, hemiI: 0.62, deep: 0x06203a, shal: 0x143c58, light: 0.42, cloud: 0x263258 },
  { t: 1.00, top: 0x0a1534, hor: 0x2a3d6e, sun: 0x8fa8ff, sunI: 0.32, hemiS: 0x3a4f8a, hemiG: 0x1a2230, hemiI: 0.62, deep: 0x06203a, shal: 0x143c58, light: 0.42, cloud: 0x263258 },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function sample(t) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = smooth(0, 1, (t - a.t) / (b.t - a.t));
  const out = {};
  for (const key of Object.keys(a)) {
    if (key === 't') continue;
    if (key.endsWith('I') || key === 'light') out[key] = lerp(a[key], b[key], k);
    else out[key] = _ca.set(a[key]).lerp(_cb.set(b[key]), k).clone();
  }
  return out;
}
export function phaseOf(t) {
  if (t >= 0.2 && t < 0.3) return 'dawn';
  if (t >= 0.3 && t < 0.7) return 'day';
  if (t >= 0.7 && t < 0.8) return 'dusk';
  return 'night';
}

// ---------- sky dome ----------
const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFrag = /* glsl */`
  uniform vec3 uTop, uHorizon, uSunDir, uSunColor, uMoonDir, uCloudColor;
  uniform float uStars, uCloud, uTime, uFog;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + 3.1; a *= .5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.9, h), 0.6));
    if (h < 0.0) col = uHorizon * 0.85;
    float sd = dot(d, normalize(uSunDir));
    col += uSunColor * (pow(max(sd, 0.), 6.) * 0.22 + pow(max(sd, 0.), 48.) * 0.45);
    col += uSunColor * smoothstep(0.9994, 0.99975, sd) * 6.0;
    // moon and stars
    float md = dot(d, normalize(uMoonDir));
    col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99935, 0.9996, md) * 2.2 + pow(max(md, 0.), 200.) * 0.25) * uStars;
    if (uStars > 0.01) {
      vec3 sp = d * 260.0;
      vec3 c = floor(sp);
      float s = hash(c);
      vec3 o = vec3(hash(c + 1.3), hash(c + 2.7), hash(c + 4.1)) - 0.5;
      float star = smoothstep(0.22, 0.0, length(fract(sp) - 0.5 - o * 0.5)) * step(0.985, s);
      float tw = 0.6 + 0.4 * sin(uTime * (2.0 + s * 5.0) + s * 40.0);
      col += vec3(0.9, 0.95, 1.0) * star * tw * uStars * smoothstep(0.02, 0.25, h) * (1.0 - uCloud * 0.8);
      // a faint milky band
      float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.6, -0.75))) * 3.2, 2.0));
      col += vec3(0.35, 0.4, 0.6) * band * fbm(d.xz * 6.0 + d.y * 3.0) * 0.25 * uStars * smoothstep(0.05, 0.4, h);
    }
    // clouds on a high plane
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.004, uTime * 0.0016);
      float n = fbm(uv);
      float cov = smoothstep(0.62 - uCloud * 0.42, 0.95 - uCloud * 0.32, n);
      float edge = smoothstep(0.0, 0.25, h);
      float lit = pow(max(sd, 0.0), 3.0);
      vec3 cc = uCloudColor * (0.82 + 0.25 * n) + uSunColor * lit * 0.35;
      col = mix(col, cc, cov * edge * 0.92);
    }
    col = mix(col, uHorizon, uFog * (1.0 - smoothstep(-0.05, 0.5, h)) * 0.95);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// soft round sprite for splashes, fireflies, sparkles
export function dotTexture(soft = 0.5) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(soft, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- the world ----------
export const MODELS = [
  'pine-a', 'pine-b', 'pine-c', 'pine-trees', 'pine-autumn', 'birch', 'bush', 'bush-flowers', 'fern', 'grass', 'tall-grass', 'grass-wispy',
  'flowers', 'flower-group', 'rock', 'rock-large', 'rock-medium', 'rocks', 'lilypad', 'frog', 'mushroom', 'stump', 'log-moss',
  'dock', 'boat', 'shack', 'hut', 'bonfire', 'lantern', 'post-lantern', 'kitty', 'fishing-rod-b', 'fish-d',
];

export function createWorld(renderer, { mobile = false } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 900);
  scene.add(camera);
  scene.fog = new THREE.Fog(0xcfe6f5, 70, 320);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a7048, 0.9);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 220 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 4;
  scene.add(hemi, sun, sun.target);

  // ---- sky ----
  const skyU = {
    uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0.4, 0.5, -0.8) }, uCloudColor: { value: new THREE.Color() },
    uStars: { value: 0 }, uCloud: { value: 0.35 }, uTime: { value: 0 }, uFog: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24),
    new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // environment light from the sky itself, refreshed as the day turns
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(sky.geometry, sky.material);
  envScene.add(envSky);
  let envRT = null;
  function refreshEnv() {
    const old = envRT;
    envRT = pmrem.fromScene(envScene, 0, 1, 1000);
    scene.environment = envRT.texture;
    old?.dispose();
  }

  // ---- terrain ----
  const SIZE = 560, SEG = mobile ? 180 : 250;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const C = (h) => new THREE.Color(h);
  const sandWet = C(0x8a7a58), bed = C(0x2f4a44), sand = C(0xe9d6a4), grassA = C(0x7aa956), grassB = C(0x587f3f), forest = C(0x3f6a36),
    rockC = C(0x6f7a78), rockD = C(0x56605f), snow = C(0xeef2f6), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const r = Math.hypot(x, z), e = r - lakeR(Math.atan2(z, x));
    const slope = Math.abs(heightAt(x + 1, z) - h) + Math.abs(heightAt(x, z + 1) - h);
    const n = fbm(x * 0.05, z * 0.05);
    if (h < -0.2) tmp.copy(sandWet).lerp(bed, smooth(0.2, 6, -h));
    else if (e < 2.5) tmp.copy(sand).lerp(sandWet, smooth(0.3, -0.3, h) * 0.6);
    else {
      tmp.copy(grassA).lerp(grassB, smooth(0.35, 0.7, n)).lerp(forest, smooth(10, 30, e) * 0.7);
      tmp.lerp(sand, smooth(5, 2.5, e));
      if (slope > 1.1) tmp.lerp(n > 0.5 ? rockC : rockD, smooth(1.1, 2.0, slope));
      if (h > 24) tmp.lerp(forest.clone().lerp(rockD, 0.35), smooth(16, 30, h));
      if (h > 34) tmp.lerp(rockC, smooth(34, 52, h));
      if (h > 60 + n * 10) tmp.lerp(snow, smooth(60 + n * 10, 68 + n * 10, h));
    }
    const v = 0.94 + hash(x * 0.7, z * 0.3) * 0.1;
    cols[i * 3] = tmp.r * v; cols[i * 3 + 1] = tmp.g * v; cols[i * 3 + 2] = tmp.b * v;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---- lake depth texture for the water shader ----
  const DN = 224, DR = 96;
  const dd = new Uint8Array(DN * DN);
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
    const x = -DR + (i + 0.5) / DN * DR * 2, z = -DR + (j + 0.5) / DN * DR * 2;
    dd[j * DN + i] = Math.min(255, depthAt(x, z) / 10 * 255);
  }
  const depthTex = new THREE.DataTexture(dd, DN, DN, THREE.RedFormat, THREE.UnsignedByteType);
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;
  // the shader samples uv = (xz - rect.xy) / rect.zw; plane uv maps x→u, z→v
  const water = createWater({ size: DR * 2, depthTex, depthRect: [-DR, -DR, DR * 2, DR * 2], pixelRatio: renderer.getPixelRatio() });
  scene.add(water);
  const wu = water.material.uniforms;

  // ---- vegetation ----
  const placed = [];
  const okDist = (x, z, d) => placed.every(p => (p.x - x) ** 2 + (p.z - z) ** 2 > d * d);
  const nearSpot = (x, z, d) => Object.values(SPOTS).some(s => (s.pos.x - x) ** 2 + (s.pos.z - z) ** 2 < d * d);
  const dockLine = (x, z) => Math.abs(x) < 3.2 && z > DOCK_END - 1 && z < DOCK_SHORE + 6;
  function scatter(n, eMin, eMax, minGap, { avoidSpots = 6, slopeMax = 1.4, tries = 30 } = {}) {
    const out = [];
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < tries; t++) {
        const a = rand() * TAU, e = rr(eMin, eMax);
        const r = lakeR(a) + e;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) > SIZE / 2 - 10 || Math.abs(z) > SIZE / 2 - 10) continue;
        const y = heightAt(x, z);
        if (Math.abs(heightAt(x + 1, z) - y) + Math.abs(heightAt(x, z + 1) - y) > slopeMax) continue;
        if (dockLine(x, z) || nearSpot(x, z, avoidSpots) || !okDist(x, z, minGap)) continue;
        const p = { x, y: y - 0.05, z, ry: rand() * TAU, s: rr(0.8, 1.25) };
        if (minGap > 1.5) placed.push(p);
        out.push(p);
        break;
      }
    }
    return out;
  }
  const add = o => { scene.add(o); return o; };
  // tree trunks read as glowing stubs in warm light, so tone them down
  for (const n of ['pine-a', 'pine-b', 'pine-c', 'pine-trees', 'pine-autumn', 'birch']) {
    A.gltf(n).scene.traverse(o => { if (o.isMesh && /bark|wood/i.test(o.material.name)) o.material.color.multiplyScalar(0.42); });
  }
  const tree = mobile ? 0.65 : 1;
  add(A.instance('pine-a', scatter(44 * tree, 7, 70, 4.2), { size: 9 }));
  add(A.instance('pine-b', scatter(30 * tree, 9, 80, 4.2), { size: 11 }));
  add(A.instance('pine-c', scatter(14 * tree, 12, 70, 5), { size: 13 }));
  add(A.instance('pine-trees', scatter(40 * tree, 30, 120, 9, { slopeMax: 3 }), { size: 14 }));
  add(A.instance('birch', scatter(14, 4, 30, 3.5), { size: 8 }));
  add(A.instance('pine-autumn', scatter(12, 8, 50, 4), { size: 9 }));
  add(A.instance('birch', scatter(10, 2.5, 8, 4), { size: 7 }));
  add(A.instance('bush', scatter(36, 2, 26, 1.8), { size: 1.4 }));
  add(A.instance('bush-flowers', scatter(22, 2, 18, 1.8), { size: 1.3 }));
  add(A.instance('fern', scatter(40, 6, 40, 1.2), { size: 1.1, shadows: false }));
  add(A.instance('grass', scatter(140, 1.5, 22, 0), { size: 0.7, shadows: false }));
  add(A.instance('grass-wispy', scatter(90, 1, 14, 0), { size: 0.8, shadows: false }));
  add(A.instance('flowers', scatter(60, 2, 18, 0), { size: 0.55, shadows: false }));
  add(A.instance('flower-group', scatter(26, 2, 16, 0), { size: 0.7, shadows: false }));
  add(A.instance('mushroom', scatter(30, 8, 40, 0), { size: 0.35, shadows: false }));
  add(A.instance('stump', scatter(8, 6, 30, 2), { size: 0.8 }));
  add(A.instance('log-moss', scatter(7, 4, 25, 3), { size: 2.6, axis: 'max' }));
  add(A.instance('rock', scatter(16, -1.5, 3, 3, { slopeMax: 3 }), { size: 2.0 }));
  add(A.instance('rock', scatter(30, -1, 10, 1.5, { slopeMax: 3 }), { size: 1.1 }));
  add(A.instance('rock-medium', scatter(18, 10, 60, 3, { slopeMax: 4 }), { size: 2.6 }));
  add(A.instance('rocks', scatter(30, -0.6, 3, 0.8, { slopeMax: 3 }), { size: 0.5, shadows: false }));
  // reeds along the waterline
  const reeds = scatter(mobile ? 150 : 230, -1.6, 0.6, 0, { avoidSpots: 2.5 });
  add(A.instance('tall-grass', reeds, { size: 1.6, shadows: false }));

  // lily pads: thick in the cove, a few around the edges
  const pads = [];
  for (let i = 0; i < 70; i++) {
    const a = rand() * TAU, r = Math.sqrt(rand()) * 14;
    const x = COVE_CENTER.x + Math.cos(a) * r, z = COVE_CENTER.z + Math.sin(a) * r;
    if (depthAt(x, z) < 0.3 || nearSpot(x, z, 3.6)) continue;
    pads.push({ x, y: 0.02, z, ry: rand() * TAU, s: rr(0.6, 1.4) });
  }
  for (let i = 0; i < 40; i++) {
    const a = rand() * TAU, r = lakeR(a) - rr(1.5, 6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (dockLine(x, z) || nearSpot(x, z, 3)) continue;
    pads.push({ x, y: 0.02, z, ry: rand() * TAU, s: rr(0.6, 1.2) });
  }
  add(A.instance('lilypad', pads, { size: 1.3, axis: 'max', shadows: false }));

  // ---- the old dock ----
  // the deck sits about half a metre above the water; the posts disappear below
  const dock = new THREE.Group();
  const seg = A.clone('dock', { size: 2.5, axis: 'x' });
  const segLen = seg.userData.dims.z, segH = seg.userData.dims.y;
  for (let z = DOCK_END - 0.6; z < DOCK_SHORE + 3; z += segLen * 0.99) {
    const s = A.clone('dock', { size: 2.5, axis: 'x' });
    s.position.set(0, 0.6 - segH, z + segLen / 2);
    dock.add(s);
  }
  scene.add(dock);
  const dockTop = new THREE.Box3().setFromObject(dock).max.y;
  SPOTS.dock.pos.y = dockTop + 1.45;

  // lanterns at the end of the dock (lit at night)
  const lights = [];
  function lamp(model, x, y, z, size, color, dist) {
    const m = A.clone(model, { size });
    m.position.set(x, y, z);
    scene.add(m);
    const l = new THREE.PointLight(color, 0, dist, 1.6);
    l.position.set(x, y + size * 0.75, z);
    scene.add(l);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(0.3), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.scale.setScalar(model === 'bonfire' ? size * 3 : size * 0.6);
    glow.position.copy(l.position);
    if (model !== 'bonfire') glow.position.y -= size * 0.18;
    scene.add(glow);
    lights.push({ l, glow, base: 1, flicker: model === 'bonfire' });
    return m;
  }
  lamp('post-lantern', -1.15, dockTop - 0.05, DOCK_END + 2.8, 1.5, 0xffb062, 14);
  lamp('post-lantern', -1.08, dockTop - 0.05, DOCK_END + 6, 1.9, 0xffb062, 12);

  // the boat tied up beside the dock (and rowed out for the deep spot)
  const boat = A.clone('boat', { size: 4.2, axis: 'max' });
  const boatAlongX = boat.userData.dims.x > boat.userData.dims.z;
  const mooredBoat = { pos: new THREE.Vector3(2.75, -0.2, DOCK_END + 3.5), ry: boatAlongX ? Math.PI / 2 : 0 };
  boat.position.copy(mooredBoat.pos); boat.rotation.y = mooredBoat.ry;
  scene.add(boat);

  // a cosy camp on the far shore: shack, hut, bonfire and lanterns that glow across the water
  const campA = -1.75;
  const campP = polar(campA, lakeR(campA) + 6);
  const shack = A.clone('shack', { size: 6 });
  shack.position.set(campP.x, heightAt(campP.x, campP.z) - 0.1, campP.z);
  shack.lookAt(0, shack.position.y, 0);
  scene.add(shack);
  const hutP = polar(campA + 0.16, lakeR(campA + 0.16) + 9);
  const hut = A.clone('hut', { size: 6.5 });
  hut.position.set(hutP.x, heightAt(hutP.x, hutP.z) - 0.1, hutP.z);
  hut.lookAt(0, hut.position.y, 0);
  scene.add(hut);
  const fireP = polar(campA + 0.07, lakeR(campA + 0.07) + 2.2);
  lamp('bonfire', fireP.x, heightAt(fireP.x, fireP.z), fireP.z, 1.4, 0xff7a2a, 30);
  const lanP = polar(campA - 0.08, lakeR(campA - 0.08) + 1.2);
  lamp('post-lantern', lanP.x, heightAt(lanP.x, lanP.z), lanP.z, 2.2, 0xffb062, 18);
  // a lamp on the cove rocks
  const coveSpot = SPOTS.cove.pos;
  const coveRock = A.clone('rock-large', { size: 6 });
  coveRock.scale.y *= 0.55;
  coveRock.position.set(coveSpot.x, 0.38 - coveRock.userData.dims.y * 0.55, coveSpot.z);
  coveRock.rotation.y = 0.7;
  scene.add(coveRock);
  const crTop = new THREE.Box3().setFromObject(coveRock).max.y;
  SPOTS.cove.pos.y = crTop + 1.25;
  SPOTS.cove.floor = crTop;
  SPOTS.dock.floor = dockTop;
  SPOTS.boat.floor = 0.35;
  const lampCove = polar(COVE_A + 0.48, lakeR(COVE_A + 0.48) + 0.8);
  lamp('lantern', lampCove.x, heightAt(lampCove.x, lampCove.z), lampCove.z, 0.8, 0xffb062, 10);

  // ---- the cat ----
  const cat = A.clone('kitty', { size: 0.44, axis: 'y' });
  A.play(cat, 'Idle');
  scene.add(cat);

  // ---- Gilbert the fishmonger, who lives under the dock ----
  const gilbert = A.clone('fish-d', { size: 1.5, axis: 'y' });
  gilbert.visible = false;
  scene.add(gilbert);

  // ---- frogs on lily pads ----
  const frogs = [];
  for (let i = 0; i < 4; i++) {
    const p = pads[(i * 7 + 3) % pads.length];
    const f = A.clone('frog', { size: 0.42, axis: 'max' });
    f.position.set(p.x, 0.07, p.z); f.rotation.y = rand() * TAU;
    A.play(f, 'Frog_Idle', { speed: 0.7 });
    scene.add(f);
    frogs.push({ obj: f, next: rr(4, 14), home: f.position.clone() });
  }

  // ---- birds crossing the sky ----
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -1, 0.2, -0.2, 0, 0, -0.15, 0, 0, 0.25, 0, 0, -0.15, 1, 0.2, -0.2], 3));
  birdGeo.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2a38, side: THREE.DoubleSide, fog: true });
  const birds = new THREE.Group(); birds.visible = false; birds.userData.t = 0; scene.add(birds);
  const flock = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(birdGeo.clone(), birdMat);
    b.scale.setScalar(0.45);
    birds.add(b);
    flock.push({ m: b, off: new THREE.Vector3(rr(-6, 6), rr(-1.5, 1.5), rr(-6, 6)), ph: rand() * TAU });
  }
  let flockT = 0, flockDir = new THREE.Vector3(), flockStart = new THREE.Vector3();

  // ---- fireflies ----
  const FF = mobile ? 90 : 160;
  const ffGeo = new THREE.BufferGeometry();
  const ffPos = new Float32Array(FF * 3), ffBase = [];
  const spotList = Object.values(SPOTS);
  for (let i = 0; i < FF; i++) {
    let x, z;
    if (i % 3 === 0) {
      // a few drift close to wherever you are fishing
      const s = spotList[i % spotList.length], a = rand() * TAU, r = rr(2.5, 14);
      x = s.pos.x + Math.cos(a) * r; z = s.pos.z + Math.sin(a) * r;
    } else {
      const a = rand() * TAU, r = lakeR(a) + rr(-2, 10);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    ffBase.push({ x, z, y: Math.max(0.2, heightAt(x, z)) + rr(0.4, 2.2), ph: rand() * TAU, sp: rr(0.3, 0.8) });
  }
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffMat = new THREE.PointsMaterial({ size: 0.38, map: dotTexture(0.25), color: 0xd8ff7a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // ---- rain ----
  const RN = mobile ? 900 : 1600;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RN * 6);
  const rainSeed = [];
  for (let i = 0; i < RN; i++) rainSeed.push([rr(-25, 25), rr(0, 18), rr(-30, 6), rr(14, 20)]);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xc8d8ea, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);
  water.hideInMirror.push(rain, fireflies);

  // ---- splashes and sparkles ----
  const sprTex = dotTexture(0.45);
  const sprites = [];
  for (let i = 0; i < 140; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprTex, transparent: true, depthWrite: false, color: 0xffffff }));
    s.visible = false; scene.add(s);
    sprites.push({ s, live: false });
  }
  function burst(p, { n = 14, color = 0xeaf6ff, speed = 2.6, up = 3.2, size = 0.16, life = 0.8, gravity = -9, additive = false } = {}) {
    let made = 0;
    for (const sp of sprites) {
      if (sp.live) continue;
      sp.live = true; sp.s.visible = true;
      sp.s.position.copy(p);
      const a = Math.random() * TAU, v = Math.random() * speed;
      sp.v = new THREE.Vector3(Math.cos(a) * v, up * (0.5 + Math.random() * 0.7), Math.sin(a) * v);
      sp.age = 0; sp.life = life * (0.6 + Math.random() * 0.6); sp.g = gravity; sp.size = size * (0.6 + Math.random() * 0.8);
      sp.s.material.color.set(color);
      sp.s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (++made >= n) break;
    }
  }
  function updateSprites(dt) {
    for (const sp of sprites) {
      if (!sp.live) continue;
      sp.age += dt;
      const k = sp.age / sp.life;
      if (k >= 1 || sp.s.position.y < -0.1) { sp.live = false; sp.s.visible = false; continue; }
      sp.v.y += sp.g * dt;
      sp.s.position.addScaledVector(sp.v, dt);
      sp.s.material.opacity = 1 - k * k;
      sp.s.scale.setScalar(sp.size * (1 + k * 0.5));
    }
  }

  // ---- fish shadows gliding under the surface ----
  const shTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 32, 2, 64, 32, 60);
    gr.addColorStop(0, 'rgba(8,20,28,.85)'); gr.addColorStop(0.5, 'rgba(8,20,28,.45)'); gr.addColorStop(1, 'rgba(8,20,28,0)');
    g.fillStyle = gr; g.save(); g.scale(1, 0.5); g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.restore(); g.fill();
    // a little tail
    g.fillStyle = 'rgba(8,20,28,.35)'; g.beginPath(); g.moveTo(10, 32); g.lineTo(0, 20); g.lineTo(0, 44); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.55, fog: true });
  const shadows = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), shadowMat.clone());
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.025;
    m.renderOrder = 2;
    scene.add(m);
    water.hideInMirror.push(m);
    shadows.push({ m, a: rand() * TAU, sp: rr(0.4, 1), tx: 0, tz: 0, t: 0, free: true });
  }

  // ---- fish that leap out of the water now and then ----
  const jumpers = [];
  let jumpIn = 6;

  // ---- spot handling ----
  let spot = 'dock';
  function placeSpot(id) {
    spot = id;
    const s = SPOTS[id];
    camera.position.copy(s.pos);
    camera.rotation.set(-0.06, s.yaw, 0, 'YXZ');
    // the cat sits just left of you, facing the water
    const left = new THREE.Vector3(-Math.cos(s.yaw), 0, Math.sin(s.yaw));
    const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    const cp = s.pos.clone().addScaledVector(left, id === 'boat' ? 0.5 : 0.62).addScaledVector(fwd, id === 'boat' ? 1.9 : id === 'cove' ? 2.0 : 2.9);
    cp.y = s.floor;
    cat.position.copy(cp);
    cat.rotation.y = s.yaw + Math.PI;
    if (id === 'boat') {
      boat.position.set(s.pos.x, -0.15, s.pos.z);
      boat.rotation.y = s.yaw + (boatAlongX ? Math.PI / 2 : 0);
    } else {
      boat.position.copy(mooredBoat.pos); boat.rotation.y = mooredBoat.ry;
    }
    sun.target.position.copy(s.pos).addScaledVector(fwd, 14);
    for (const sh of shadows) sh.free && resetShadow(sh, true);
  }
  function resetShadow(sh, any) {
    const s = SPOTS[spot];
    for (let t = 0; t < 20; t++) {
      const fwd = s.yaw + rr(-0.9, 0.9);
      const d = rr(4, 22);
      const x = s.pos.x - Math.sin(fwd) * d, z = s.pos.z - Math.cos(fwd) * d;
      if (depthAt(x, z) > 0.8) { sh.m.position.set(x, 0.025, z); break; }
    }
    sh.a = rand() * TAU; sh.t = rr(2, 6);
    const sc = rr(0.6, 1.4);
    sh.m.scale.set(sc, sc, 1);
    sh.m.material.opacity = 0;
  }

  // ---- clock & weather state ----
  const state = { t: 0.3, wind: 0.25, rain: 0, fog: 0, cloud: 0.35, envTimer: 0, night: 0 };
  const sunDir = new THREE.Vector3();
  const E = new THREE.Vector3(0.75, 0, 0.66).normalize(), W = new THREE.Vector3(-0.62, 0, -0.78).normalize();
  function applyClock() {
    const t = state.t;
    const P = sample(t);
    const a = (t - 0.25) * TAU;
    const hz = E.clone().lerp(W, (1 - Math.cos(a)) / 2).normalize();
    sunDir.copy(hz).multiplyScalar(Math.max(0.1, Math.abs(Math.cos(a)))).setY(Math.sin(a) * 0.82).normalize();
    const moonDir = new THREE.Vector3(-0.28, 0.2 + Math.max(0, -Math.sin(a)) * 0.14, -0.95).normalize();
    const night = smooth(0.02, -0.12, sunDir.y);
    state.night = night;
    const fog = state.fog, rain = state.rain, grey = Math.max(fog * 0.8, rain * 0.65, state.cloud > 0.6 ? (state.cloud - 0.6) * 1.2 : 0);
    const greyCol = new THREE.Color(0x9aa4ae).multiplyScalar(lerp(1, 0.25, night));
    skyU.uTop.value.copy(P.top).lerp(greyCol, grey * 0.75);
    skyU.uHorizon.value.copy(P.hor).lerp(greyCol, grey * 0.6);
    skyU.uSunColor.value.copy(P.sun).multiplyScalar((1 - night) * (1 - grey * 0.7));
    skyU.uSunDir.value.copy(sunDir);
    skyU.uMoonDir.value.copy(moonDir);
    skyU.uStars.value = night * (1 - fog);
    skyU.uCloud.value = state.cloud;
    skyU.uCloudColor.value.copy(P.cloud).lerp(greyCol, grey * 0.5);
    skyU.uFog.value = fog;

    // the key light follows the sun by day and the moon by night
    const keyDir = night > 0.5 ? moonDir : sunDir;
    sun.position.copy(sun.target.position).addScaledVector(keyDir, 120);
    sun.color.copy(night > 0.5 ? new THREE.Color(0x9fb4ff) : P.sun);
    sun.intensity = (night > 0.5 ? 0.6 : P.sunI * smooth(-0.02, 0.12, sunDir.y)) * (1 - grey * 0.6) + (night > 0.5 ? 0 : 0);
    hemi.color.copy(P.hemiS).lerp(greyCol, grey * 0.5);
    hemi.groundColor.copy(P.hemiG);
    hemi.intensity = P.hemiI * (1 + grey * 0.2);

    const fogCol = skyU.uHorizon.value.clone().lerp(skyU.uTop.value, 0.4).lerp(greyCol, fog * 0.5);
    scene.fog.color.copy(fogCol);
    scene.fog.near = lerp(150, 8, fog) * lerp(1, 0.6, rain);
    scene.fog.far = lerp(700, 150, fog) * lerp(1, 0.55, rain);
    renderer.toneMappingExposure = lerp(1.0, 1.25, night);

    wu.uDeep.value.copy(P.deep); wu.uShallow.value.copy(P.shal).lerp(greyCol, grey * 0.3);
    wu.uSkyTint.value.copy(skyU.uTop.value);
    wu.uSunColor.value.copy(night > 0.5 ? new THREE.Color(0xbcd0ff).multiplyScalar(0.7 * (1 - fog)) : skyU.uSunColor.value);
    wu.uSunDir.value.copy(night > 0.5 ? moonDir : sunDir);
    wu.uFogColor.value.copy(fogCol);
    wu.uFogNear.value = scene.fog.near; wu.uFogFar.value = scene.fog.far;
    wu.uWind.value = state.wind;
    wu.uRain.value = rain;
    wu.uLight.value = P.light * (1 - grey * 0.25);

    // lamps come on at dusk
    const lampOn = smooth(0.25, 0.8, Math.max(night, smooth(0.08, -0.02, sunDir.y), fog * 0.6));
    for (const L of lights) { L.on = lampOn; }
    ffMat.opacity = night * (1 - rain) * 0.95;
    rainMat.opacity = rain * 0.55;
  }

  function update(dt, time) {
    skyU.uTime.value = time;
    wu.uTime.value = time;
    sky.position.copy(camera.position);
    applyClock();
    state.envTimer -= dt;
    if (state.envTimer <= 0) { refreshEnv(); state.envTimer = 3; }

    for (const L of lights) {
      const f = L.flicker ? 0.75 + 0.25 * Math.sin(time * 13) * Math.sin(time * 7.3 + 1) : 0.95 + 0.05 * Math.sin(time * 3 + L.l.position.x);
      L.l.intensity = L.on * (L.flicker ? 30 : 3.2) * f;
      L.glow.material.opacity = L.on * (L.flicker ? 0.9 : 0.55) * f;
    }

    // cat
    cat.userData.mixer?.update(dt);
    gilbert.userData.mixer?.update(dt);
    for (const f of frogs) {
      f.obj.userData.mixer.update(dt);
      f.next -= dt;
      if (f.next <= 0) {
        f.next = rr(6, 18);
        A.play(f.obj, 'Frog_Jump', { once: true });
        f.hop = 0.6; f.obj.rotation.y += rr(-1, 1);
        setTimeout(() => A.play(f.obj, 'Frog_Idle', { speed: 0.7 }), 900);
        hooks.onFrog?.(f.obj.position);
      }
      if (f.hop > 0) { f.hop -= dt; f.obj.position.y = 0.07 + Math.sin((1 - f.hop / 0.6) * Math.PI) * 0.25; }
    }

    // birds: a loose flock every so often by day
    flockT -= dt;
    if (flockT <= 0 && state.night < 0.3 && state.rain < 0.5) {
      flockT = rr(25, 55);
      const s = SPOTS[spot];
      const side = rand() < 0.5 ? -1 : 1;
      const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
      const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
      flockStart.copy(s.pos).addScaledVector(fwd, rr(40, 80)).addScaledVector(right, side * 90).setY(rr(14, 26));
      flockDir.copy(right).multiplyScalar(-side).addScaledVector(fwd, rr(-0.3, 0.3)).normalize();
      birds.userData.t = 0;
      birds.visible = true;
    }
    if (birds.visible) {
      birds.userData.t += dt;
      const bt = birds.userData.t;
      birds.position.copy(flockStart).addScaledVector(flockDir, bt * 9);
      birds.lookAt(birds.position.clone().add(flockDir));
      for (const b of flock) {
        b.m.position.copy(b.off).add(new THREE.Vector3(0, Math.sin(bt * 1.3 + b.ph) * 0.4, 0));
        const flap = Math.sin(bt * 9 + b.ph) * 0.6;
        const p = b.m.geometry.attributes.position;
        p.setY(1, 0.2 + flap); p.setY(5, 0.2 + flap); p.needsUpdate = true;
      }
      if (bt > 22) birds.visible = false;
    }

    // fireflies
    if (ffMat.opacity > 0.01) {
      for (let i = 0; i < FF; i++) {
        const b = ffBase[i];
        ffPos[i * 3] = b.x + Math.sin(time * b.sp + b.ph) * 1.2;
        ffPos[i * 3 + 1] = b.y + Math.sin(time * b.sp * 1.7 + b.ph * 2) * 0.5;
        ffPos[i * 3 + 2] = b.z + Math.cos(time * b.sp * 0.8 + b.ph) * 1.2;
      }
      ffGeo.attributes.position.needsUpdate = true;
      ffMat.size = 0.3 + Math.sin(time * 3) * 0.05;
    }

    // rain streaks around the camera
    if (state.rain > 0.02) {
      const c = camera.position, yaw = SPOTS[spot].yaw;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      for (let i = 0; i < RN; i++) {
        const r = rainSeed[i];
        r[1] -= r[3] * dt;
        if (r[1] < 0) { r[1] += 18; r[0] = rr(-25, 25); r[2] = rr(-34, 4); if (rand() < 0.04) water.ripple(c.x + r[0] * cs + r[2] * sn, c.z - r[0] * sn + r[2] * cs, 0.25); }
        const x = c.x + r[0] * cs + r[2] * sn, z = c.z - r[0] * sn + r[2] * cs;
        rainPos[i * 6] = x; rainPos[i * 6 + 1] = r[1]; rainPos[i * 6 + 2] = z;
        rainPos[i * 6 + 3] = x + 0.05; rainPos[i * 6 + 4] = r[1] + 0.55; rainPos[i * 6 + 5] = z + 0.08;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // fish shadows wander; one may be borrowed by the fishing code
    for (const sh of shadows) {
      if (!sh.free) continue;
      sh.t -= dt;
      if (sh.t <= 0) { sh.t = rr(2, 6); sh.a += rr(-1.4, 1.4); }
      const nx = sh.m.position.x + Math.cos(sh.a) * sh.sp * dt, nz = sh.m.position.z + Math.sin(sh.a) * sh.sp * dt;
      if (depthAt(nx, nz) < 0.6) { sh.a += Math.PI; }
      else sh.m.position.set(nx, 0.025, nz);
      sh.m.rotation.z = -sh.a;
      sh.m.material.opacity = Math.min(0.5, sh.m.material.opacity + dt * 0.3) * (1 - state.night * 0.5);
      if (sh.m.position.distanceTo(camera.position) > 34) resetShadow(sh);
    }

    // leaping fish
    jumpIn -= dt;
    if (jumpIn <= 0) { jumpIn = rr(7, 18); hooks.spawnJumper?.(); }
    for (let i = jumpers.length - 1; i >= 0; i--) {
      const j = jumpers[i];
      j.t += dt;
      const k = j.t / j.dur;
      j.obj.userData.mixer?.update(dt);
      j.obj.position.lerpVectors(j.a, j.b, k);
      j.obj.position.y = Math.sin(k * Math.PI) * j.h - 0.2;
      j.obj.rotation.z = (0.5 - k) * 2.4 * j.dir;
      if (k >= 1) { scene.remove(j.obj); jumpers.splice(i, 1); hooks.onJumpEnd?.(j.b); }
    }

    updateSprites(dt);
  }

  const hooks = {};
  placeSpot('dock');
  refreshEnv();

  return {
    scene, camera, water, sun, hemi, cat, gilbert, boat, shadows, jumpers, state, hooks,
    burst, update, placeSpot, resetShadow, refreshEnv,
    get spot() { return spot; },
    get sunDir() { return sunDir; },
    dockTop,
  };
}
