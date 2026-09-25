// Model loading and instanced drawing. Every placed copy of a model is one instance in a pool,
// so a whole city renders in a few hundred draw calls. Window pixels of the Kenney palettes
// become an emissive mask so buildings light up at night.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const gltfs = new Map();
export const info = new Map(); // path -> { size, center, min }

export function loadAll(paths, onProgress) {
  let done = 0;
  return Promise.all(paths.map(p => loader.loadAsync(p).then(g => {
    gltfs.set(p, g);
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.scene);
    info.set(p, { size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), min: box.min.clone() });
    onProgress?.(++done / paths.length);
  }).catch(e => { console.warn('model failed', p, e); onProgress?.(++done / paths.length); })));
}
export const gltf = p => gltfs.get(p);
// procedural meshes join the same instancing system under a made-up key
export function registerMesh(key, mesh) {
  const g = new THREE.Group(); g.add(mesh); g.updateMatrixWorld(true);
  gltfs.set(key, { scene: g, animations: [] });
  const box = new THREE.Box3().setFromObject(g);
  info.set(key, { size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), min: box.min.clone() });
}

// ---------------------------------------------------------------- night windows
const glowMats = [];         // materials whose emissive follows the night
const maskCache = new Map(); // image -> mask texture
function windowMask(tex) {
  const img = tex?.image; if (!img) return null;
  if (maskCache.has(img)) return maskCache.get(img);
  const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gg = p[i + 1], b = p[i + 2];
    // glassy blues and pale cyans read as windows
    // Kenney palettes: window glass is the light-blue gradient (#6794d9 to #d0e8ff); facades are greyer
    const win = b > 200 && b > r + 25 && gg > r + 18;
    p[i] = p[i + 1] = p[i + 2] = win ? 255 : 0; p[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = tex.flipY; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  maskCache.set(img, t);
  return t;
}
const matCache = new Map();
function prepMaterial(m, glow) {
  const key = m.uuid + (glow ? 'g' : '');
  if (matCache.has(key)) return matCache.get(key);
  const n = m.clone();
  if (n.map) n.map.anisotropy = 4;
  if (glow && n.map) {
    const mask = windowMask(n.map);
    if (mask) { n.emissiveMap = mask; n.emissive = new THREE.Color(0xffc27a); n.emissiveIntensity = 0; glowMats.push(n); }
  }
  matCache.set(key, n);
  return n;
}
export function setNight(k) { const v = Math.max(0, k - 0.15) * 3.2; for (const m of glowMats) m.emissiveIntensity = v; }

// ---------------------------------------------------------------- instance pools
const _m = new THREE.Matrix4(), _c = new THREE.Color();
class Pool {
  constructor(scene, path, { glow = false, shadow = true, receive = true, only = null, skip = null } = {}) {
    this.scene = scene; this.parts = []; this.cap = 0; this.free = []; this.top = 0; this.colors = [];
    const g = gltfs.get(path);
    if (!g) { this.missing = true; return; }
    g.scene.traverse(o => {
      if (!o.isMesh || (only && !only.includes(o.name)) || (skip && skip.includes(o.name))) return;
      this.parts.push({ geo: o.geometry, mat: prepMaterial(o.material, glow), local: o.matrixWorld.clone(), mesh: null });
    });
    this.shadow = shadow; this.receive = receive;
    this.grow(32);
  }
  grow(cap) {
    for (const p of this.parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, cap);
      im.castShadow = this.shadow; im.receiveShadow = this.receive; im.frustumCulled = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      if (p.mesh) {
        im.instanceMatrix.array.set(p.mesh.instanceMatrix.array);
        im.instanceColor.array.set(p.mesh.instanceColor.array);
        this.scene.remove(p.mesh); p.mesh.dispose();
      }
      im.count = this.top;
      this.scene.add(im);
      p.mesh = im;
    }
    this.cap = cap;
  }
  add(matrix, color = 0xffffff) {
    if (this.missing) return -1;
    let id = this.free.length ? this.free.pop() : this.top++;
    if (id >= this.cap) this.grow(this.cap * 2);
    for (const p of this.parts) p.mesh.count = this.top;
    this.set(id, matrix); this.tint(id, color);
    return id;
  }
  set(id, matrix) {
    if (id < 0) return;
    for (const p of this.parts) { _m.multiplyMatrices(matrix, p.local); p.mesh.setMatrixAt(id, _m); p.mesh.instanceMatrix.needsUpdate = true; }
  }
  tint(id, color) {
    if (id < 0) return;
    _c.set(color);
    for (const p of this.parts) { p.mesh.setColorAt(id, _c); p.mesh.instanceColor.needsUpdate = true; }
  }
  remove(id) {
    if (id < 0) return;
    _m.makeScale(0, 0, 0);
    for (const p of this.parts) { p.mesh.setMatrixAt(id, _m); p.mesh.instanceMatrix.needsUpdate = true; }
    this.free.push(id);
  }
}
const pools = new Map();
export function pool(scene, path, opts = {}) {
  const key = path + (opts.glow ? '#g' : '') + (opts.shadow === false ? '#ns' : '') + (opts.only ? '#o' + opts.only : '') + (opts.skip ? '#s' + opts.skip : '');
  if (!pools.has(key)) pools.set(key, new Pool(scene, path, opts));
  return pools.get(key);
}

// a model scaled so its footprint fits `fit` tiles, sitting on the ground, centred
export function fitScale(path, fit) { const i = info.get(path); if (!i) return 1; return fit / Math.max(i.size.x, i.size.z); }
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export function placeMatrix(path, x, y, z, yaw, scale, sy = 1) {
  const i = info.get(path) || { center: new THREE.Vector3(), min: new THREE.Vector3() };
  // shift so the model's footprint centre sits at (x, z) and its base at y
  const cx = -i.center.x * scale, cz = -i.center.z * scale, by = -i.min.y * scale * sy;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  _p.set(x + cx * cs + cz * sn, y + by, z - cx * sn + cz * cs);
  _q.setFromEuler(_e.set(0, yaw, 0)); _s.set(scale, scale * sy, scale);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
