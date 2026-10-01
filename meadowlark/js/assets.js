// Loads the CC0 glTF models once and hands out clones: static props are merged per material
// into cheap instanced batches, animated characters are cloned with their skeletons.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();
export const K = p => `../assets/kenney/${p}.glb`;
export const PP = n => `../assets/polypizza/${n}.glb`;

export function loadAll(paths, onProgress, tint = () => null) {
  let done = 0;
  return Promise.all([...new Set(paths)].map(p => loader.loadAsync(p).then(g => {
    g.scene.traverse(o => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m.map) m.map.anisotropy = 4; m.roughness = Math.max(m.roughness ?? 1, 0.7); m.metalness = 0; const c = tint(p); if (c && !m.userData.tinted) { m.color.multiply(new THREE.Color(c)); m.userData.tinted = true; } }
      }
    });
    cache.set(p, g); onProgress?.(++done / paths.length);
  }).catch(e => { console.warn('model failed', p, e); onProgress?.(++done / paths.length); })));
}
export const has = p => cache.has(p);
export const animations = p => cache.get(p)?.animations || [];

// a deep clone (with skeletons) for characters and anything that moves
export function clone(p) {
  const g = cache.get(p); if (!g) return new THREE.Group();
  return SkeletonUtils.clone(g.scene);
}

// ---------------------------------------------------------------- static batches
// Every place(path, matrix) call adds one instance; build() turns each (model, mesh) pair into
// one InstancedMesh, so a whole village of walls costs a few dozen draw calls.
const batches = new Map(); // path -> [matrix]
export function place(path, pos, yaw = 0, scale = 1, extra) {
  if (!cache.has(path)) return;
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
  const q = extra?.quat || new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const m = new THREE.Matrix4().compose(pos, q, s);
  if (!batches.has(path)) batches.set(path, []);
  batches.get(path).push({ m, tint: extra?.tint });
}
export function buildBatches(scene) {
  const out = [];
  for (const [path, items] of batches) {
    const root = cache.get(path).scene; root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, items.length);
      const local = o.matrixWorld;
      items.forEach((it, i) => {
        im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(it.m, local));
        if (it.tint !== undefined) im.setColorAt(i, new THREE.Color(it.tint));
      });
      if (items.some(it => it.tint !== undefined)) for (let i = 0; i < items.length; i++) if (items[i].tint === undefined) im.setColorAt(i, new THREE.Color(0xffffff));
      im.castShadow = im.receiveShadow = true; im.computeBoundingSphere();
      scene.add(im); out.push(im);
    });
  }
  batches.clear();
  return out;
}

// size of a model's bounding box (unscaled)
const boxes = new Map();
export function size(p) {
  if (!boxes.has(p)) { const g = cache.get(p); boxes.set(p, g ? new THREE.Box3().setFromObject(g.scene) : new THREE.Box3()); }
  return boxes.get(p);
}
