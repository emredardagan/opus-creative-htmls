// Model loading, cloning and instancing for the CC0 Quaternius / Kay Lousberg models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = new URL('../../assets/polypizza/lake/', import.meta.url).href;
const OLD = new URL('../../assets/polypizza/', import.meta.url).href;
const loader = new GLTFLoader();
const cache = new Map();

export const modelUrl = name => name.startsWith('../') ? OLD + name.slice(3) + '.glb' : `${BASE}${name}.glb`;

export function load(name) {
  if (!cache.has(name)) {
    cache.set(name, loader.loadAsync(modelUrl(name)).then(g => {
      g.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) {
            if (m.map) { m.map.anisotropy = 4; }
            if (m.metalness > 0.5 && !m.name?.toLowerCase().includes('metal')) m.metalness = 0;
            m.roughness = Math.max(m.roughness ?? 1, 0.55);
          }
        }
      });
      g.scene.updateMatrixWorld(true);
      g.box = new THREE.Box3().setFromObject(g.scene);
      return g;
    }));
  }
  return cache.get(name);
}

export const get = name => cache.get(name);

export async function preload(names, onProgress) {
  let done = 0;
  await Promise.all(names.map(n => load(n).then(() => onProgress?.(++done / names.length))));
}

const loaded = new Map();
export async function ready(names) { for (const n of names) loaded.set(n, await load(n)); }
export const gltf = name => loaded.get(name);

// Clone a model scaled so its largest (or chosen) dimension is `size`, sitting on y=0 and centred.
export function clone(name, { size = 1, axis = 'max', ground = true, center = true } = {}) {
  const g = loaded.get(name);
  const animated = g.animations.length > 0;
  const inner = animated ? SkeletonUtils.clone(g.scene) : g.scene.clone(true);
  const dim = g.box.getSize(new THREE.Vector3());
  const d = axis === 'max' ? Math.max(dim.x, dim.y, dim.z) : dim[axis];
  const s = size / (d || 1);
  inner.scale.multiplyScalar(s);
  const c = g.box.getCenter(new THREE.Vector3());
  inner.position.set(center ? -c.x * s : 0, ground ? -g.box.min.y * s : -c.y * s, center ? -c.z * s : 0);
  const root = new THREE.Group();
  root.add(inner);
  let mixer = null; const actions = {};
  if (animated) {
    mixer = new THREE.AnimationMixer(inner);
    for (const clip of g.animations) {
      const short = clip.name.split('|').pop();
      actions[short] = mixer.clipAction(clip);
    }
  }
  root.userData = { mixer, actions, scale: s, dims: dim.clone().multiplyScalar(s) };
  return root;
}

export function play(obj, name, { fade = 0.25, once = false, speed = 1 } = {}) {
  const { actions } = obj.userData;
  const a = actions[name] || Object.values(actions).find(x => x.getClip().name.includes(name));
  if (!a) return null;
  for (const o of Object.values(actions)) if (o !== a && o.isRunning()) o.fadeOut(fade);
  a.reset().setEffectiveTimeScale(speed).fadeIn(fade).play();
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  a.clampWhenFinished = once;
  return a;
}

// Many copies of a static model as InstancedMeshes (one per sub-mesh).
// placements: [{ x, y, z, ry, s }], `size` is the reference size for s=1.
export function instance(name, placements, { size = 1, axis = 'y', shadows = true } = {}) {
  const g = loaded.get(name);
  const dim = g.box.getSize(new THREE.Vector3());
  const d = axis === 'max' ? Math.max(dim.x, dim.y, dim.z) : dim[axis];
  const base = size / d;
  const c = g.box.getCenter(new THREE.Vector3());
  const offset = new THREE.Matrix4().makeTranslation(-c.x, -g.box.min.y, -c.z);
  const group = new THREE.Group();
  const meshes = [];
  g.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const mesh of meshes) {
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length);
    im.castShadow = shadows; im.receiveShadow = true;
    const local = mesh.matrixWorld.clone().premultiply(offset);
    placements.forEach((p, i) => {
      q.setFromAxisAngle(up, p.ry || 0);
      sv.setScalar(base * (p.s || 1));
      pv.set(p.x, p.y || 0, p.z);
      m.compose(pv, q, sv).multiply(local);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}
