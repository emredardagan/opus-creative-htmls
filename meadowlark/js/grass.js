// Meadow grass: hundreds of thousands of curved blades in 16 m chunks around the player,
// swaying in gusts of wind, parting where you walk and glowing when the low sun is behind them.
import * as THREE from 'three';
import { HALF, P } from './layout.js';
import { heightAt, pathAt, waterAt, slopeAt, wetAt } from './terrain.js';
import { makeNoise, mulberry32, smoothstep, clamp } from './util.js';

const { fbm } = makeNoise(31);
const CH = 16;                      // chunk size in metres
const blockers = [];                // circles where no grass grows: [x, z, r]
export const blockGrass = (x, z, r) => blockers.push([x, z, r]);

export const grassU = {
  uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3(0, -99, 0) }, uFocus: { value: new THREE.Vector3() },
  uFar: { value: 64 }, uWind: { value: new THREE.Vector2(0.8, 0.45) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 1, 1) }, uSSS: { value: 1 },
  uBase: { value: new THREE.Color(0x3c6a22) }, uTipA: { value: new THREE.Color(0x9fcb55) }, uTipB: { value: new THREE.Color(0xe2d370) },
  uTipC: { value: new THREE.Color(0x5e9a3a) },
};

// height of grass at a spot (0 = none); this is the one place that decides where grass grows
export function grassHeight(x, z) {
  const h = heightAt(x, z);
  if (h < 1.25 || waterAt(x, z) > -50) return 0;
  if (slopeAt(x, z) > 0.42) return 0;
  const p = pathAt(x, z); if (p > 0.55) return 0;
  for (const b of blockers) { const dx = x - b[0], dz = z - b[1]; if (dx * dx + dz * dz < b[2] * b[2]) return 0; }
  const v = P.village.c, dv = Math.hypot(x - v[0], z - v[1]);
  let g = 0.42 + fbm(x * 0.045, z * 0.045, 3) * 0.55;               // rolling patches of taller meadow
  g *= 1 - smoothstep(26, 8, dv) * 0.55;                             // trimmed lawns in the village
  g *= 1 - p * 0.9;                                                  // short at the path edges
  g *= 0.75 + smoothstep(1.25, 2.4, h) * 0.25;                       // thin near the beach
  g *= 1 - wetAt(x, z) * 0.25;
  if (h > 44) g *= 0.75;                                              // wind-cut grass on the summit
  return clamp(g, 0, 1.15);
}

function bladeGeometry() {
  // 5 levels: two verts per level, one tip vertex; y runs 0..1
  const seg = 5, pos = [], idx = [];
  for (let i = 0; i < seg; i++) {
    const t = i / seg, w = 0.5 * (1 - Math.pow(t, 1.4) * 0.9);
    pos.push(-w, t, 0, w, t, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < seg - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (seg - 1) * 2; idx.push(a, a + 1, seg * 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  g.setIndex(idx);
  return g;
}

function makeMaterial() {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, grassU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aOff; attribute vec4 aShape;
      uniform float uTime, uFar; uniform vec3 uPlayer, uFocus; uniform vec2 uWind;
      varying float vT; varying float vSeed; varying vec3 vWP;
      float gh21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(gh21(i), gh21(i+vec2(1,0)), f.x), mix(gh21(i+vec2(0,1)), gh21(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`)
      .replace('#include <begin_vertex>', `
        float t = position.y;
        vec2 wp = aOff.xz;
        float dist = distance(wp, uFocus.xz);
        float hgt = aShape.x * smoothstep(uFar, uFar * 0.72, dist);
        float c = cos(aOff.w), s = sin(aOff.w);
        vec3 p = vec3(position.x * aShape.y * c, 0.0, -position.x * aShape.y * s);
        // gusts roll across the meadow as big soft waves, with a little flutter on top
        float g = gvn(wp * 0.035 - uWind * uTime * 0.09) ;
        float gust = smoothstep(0.25, 0.85, g);
        float flutter = sin(uTime * 3.1 + aShape.z * 6.28 + wp.x * 0.7) * 0.5 + sin(uTime * 4.7 + wp.y * 1.1) * 0.25;
        vec2 bend = normalize(uWind) * (0.12 + gust * 0.6) + vec2(cos(aShape.z * 6.28), sin(aShape.z * 6.28)) * 0.16;
        bend += normalize(uWind) * flutter * (0.05 + gust * 0.1);
        // walking through it pushes the blades aside
        vec2 away = wp - uPlayer.xz; float pd = length(away);
        float push = smoothstep(1.25, 0.15, pd) * step(abs(uPlayer.y - aOff.y), 2.2);
        bend += (away / max(pd, 0.001)) * push * 1.5;
        float tt = t * t;
        p.xz += bend * tt * hgt;
        p.y = t * hgt * (1.0 - 0.32 * min(length(bend), 1.3) * tt);
        vec3 transformed = p + aOff.xyz;
        vT = t; vSeed = aShape.w; vWP = transformed;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uBase, uTipA, uTipB, uTipC, uSunDir, uSunCol; uniform float uSSS;
      varying float vT; varying float vSeed; varying vec3 vWP;
      float fh21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float fvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(fh21(i), fh21(i+vec2(1,0)), f.x), mix(fh21(i+vec2(0,1)), fh21(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <normal_fragment_begin>', `float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float pa = fvn(vWP.xz * 0.06) * 0.65 + fvn(vWP.xz * 0.21) * 0.35;
        vec3 tip = mix(uTipC, uTipA, smoothstep(0.3, 0.55, pa));
        tip = mix(tip, uTipB, smoothstep(0.62, 0.8, pa) * 0.85);
        tip *= 0.86 + vSeed * 0.28;
        diffuseColor.rgb = mix(uBase, tip, smoothstep(0.0, 0.85, vT));
        diffuseColor.rgb *= mix(0.7, 1.0, smoothstep(0.0, 0.45, vT));`)
      .replace('#include <opaque_fragment>', `
        // light through the blades when the sun is behind them
        vec3 vd = normalize(vWP - cameraPosition);
        float back = pow(max(dot(vd, uSunDir), 0.0), 3.0);
        outgoingLight += diffuseColor.rgb * uSunCol * back * vT * vT * 0.9 * uSSS;
        outgoingLight += diffuseColor.rgb * 0.12 * vT;
        #include <opaque_fragment>`);
  };
  return mat;
}

export class Grass {
  constructor(scene, { density = 16 } = {}) {
    this.scene = scene; this.density = density;
    this.blade = bladeGeometry(); this.mat = makeMaterial();
    this.chunks = new Map(); this.group = new THREE.Group(); this.group.name = 'grass'; scene.add(this.group);
  }
  key(cx, cz) { return cx + ',' + cz; }
  build(cx, cz) {
    const r = mulberry32((cx * 73856093) ^ (cz * 19349663)), x0 = cx * CH, z0 = cz * CH;
    const max = Math.round(CH * CH * this.density), off = new Float32Array(max * 4), shp = new Float32Array(max * 4);
    let n = 0, minY = 1e9, maxY = -1e9;
    for (let k = 0; k < max; k++) {
      const x = x0 + r() * CH, z = z0 + r() * CH, g = grassHeight(x, z);
      if (g <= 0.05 || r() > Math.min(1, g * 2.2)) continue;
      const y = heightAt(x, z);
      off.set([x, y - 0.03, z, r() * Math.PI * 2], n * 4);
      shp.set([(0.32 + r() * 0.36) * g * 1.1, 0.075 + r() * 0.055, r(), r()], n * 4);
      n++; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (!n) return { mesh: null };
    // shuffle once so the first k blades are always an even subset for distance thinning
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      for (let q = 0; q < 4; q++) { let t = off[i * 4 + q]; off[i * 4 + q] = off[j * 4 + q]; off[j * 4 + q] = t; t = shp[i * 4 + q]; shp[i * 4 + q] = shp[j * 4 + q]; shp[j * 4 + q] = t; }
    }
    const g = new THREE.InstancedBufferGeometry();
    g.index = this.blade.index; g.attributes.position = this.blade.attributes.position; g.attributes.normal = this.blade.attributes.normal;
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off.subarray(0, n * 4), 4));
    g.setAttribute('aShape', new THREE.InstancedBufferAttribute(shp.subarray(0, n * 4), 4));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + CH / 2, (minY + maxY) / 2 + 0.5, z0 + CH / 2), CH * 0.75 + (maxY - minY));
    const mesh = new THREE.Mesh(g, this.mat); mesh.receiveShadow = true; mesh.castShadow = false;
    this.group.add(mesh);
    return { mesh, n };
  }
  update(focus) {
    grassU.uFocus.value.copy(focus);
    const far = grassU.uFar.value, fcx = Math.floor(focus.x / CH), fcz = Math.floor(focus.z / CH), rad = Math.ceil(far / CH) + 1;
    const want = new Set();
    let built = 0;
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const cx = fcx + dx, cz = fcz + dz;
      if (Math.abs(cx * CH) > HALF + CH || Math.abs(cz * CH) > HALF + CH) continue;
      const mx = cx * CH + CH / 2, mz = cz * CH + CH / 2, d = Math.hypot(mx - focus.x, mz - focus.z) - CH * 0.7;
      if (d > far) continue;
      const k = this.key(cx, cz); want.add(k);
      let c = this.chunks.get(k);
      if (!c) { if (built > 2) continue; c = this.build(cx, cz); this.chunks.set(k, c); built++; }
      if (c.mesh) {
        // thin the far chunks: full near the player, a quarter at the edge
        const f = d < 22 ? 1 : d < 40 ? 0.5 : 0.28;
        c.mesh.geometry.instanceCount = Math.max(1, Math.floor(c.n * f));
        c.mesh.visible = true;
      }
    }
    for (const [k, c] of this.chunks) if (!want.has(k)) {
      if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
      this.chunks.delete(k);
    }
  }
  prewarm(focus) { for (let i = 0; i < 80; i++) this.update(focus); }
}
