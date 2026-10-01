// Painterly trees and bushes built from leaf cards with spherical normals (so canopies shade
// like soft clouds), wind-swayed flowers, and mossy procedural rocks. Everything is instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, makeNoise, clamp, lerp } from './util.js';

export const foliageU = { uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uWind: { value: new THREE.Vector2(0.8, 0.45) }, uPlayer: { value: new THREE.Vector3(0, -99, 0) } };

// ---------------------------------------------------------------- leaf texture
function leafTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), r = mulberry32(5);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 95; i++) {
    // leaves crowd toward the middle of the card and thin out at its edge
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.4;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const l = 18 + r() * 16, w = l * (0.42 + r() * 0.16), v = 150 + Math.floor(r() * 105);
    g.save(); g.translate(x, y); g.rotate(a + (r() - 0.5) * 1.6);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.moveTo(0, -l / 2); g.quadraticCurveTo(w, 0, 0, l / 2); g.quadraticCurveTo(-w, 0, 0, -l / 2); g.fill();
    g.strokeStyle = `rgba(0,0,0,0.18)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -l / 2 + 2); g.lineTo(0, l / 2 - 2); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
let LEAF = null;
const leaf = () => LEAF || (LEAF = leafTexture());

// patch a standard material: wind sway by height, no back-face normal flip, light through leaves
function foliageMaterial({ map, color = 0xffffff, sway = 1, sss = 0.6, rough = 0.85, alphaTest = 0.45 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, ...(map ? { map } : {}), alphaTest: map ? alphaTest : 0, side: map ? THREE.DoubleSide : THREE.FrontSide, roughness: rough, metalness: 0 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, foliageU);
    sh.uniforms.uSway = { value: sway }; sh.uniforms.uSSS = { value: sss };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime, uSway; uniform vec2 uWind; varying vec3 vWP2;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 ip = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix * ip;
          #endif
          float hk = max(position.y, 0.0);
          float ph = ip.x * 0.21 + ip.z * 0.17;
          float s = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.25;
          vec2 sw = normalize(uWind) * (0.5 + s) * 0.022 * hk * uSway;
          transformed.xz += sw + vec2(sin(uTime * 3.1 + position.x * 2.0 + ph), cos(uTime * 2.7 + position.z * 2.0 + ph)) * 0.02 * hk * uSway;
        }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWP2 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #ifdef USE_INSTANCING
          vWP2 = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uSunDir, uSunCol; uniform float uSSS; varying vec3 vWP2;`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        // leaves right in front of the camera dissolve instead of filling the screen
        float camD = distance(vWP2, cameraPosition);
        if (camD < 3.2 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > smoothstep(1.0, 3.2, camD)) discard;`)
      .replace('#include <normal_fragment_begin>', `float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;`)
      .replace('#include <opaque_fragment>', `
        vec3 vd = normalize(vWP2 - cameraPosition);
        float back = pow(max(dot(vd, uSunDir), 0.0), 4.0);
        outgoingLight += diffuseColor.rgb * uSunCol * back * uSSS * 0.8;
        #include <opaque_fragment>`);
  };
  if (map) mat.userData.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
  return mat;
}

// ---------------------------------------------------------------- canopy geometry
// clusters: [[cx, cy, cz, radius], ...]; cards point every which way, normals point out of the canopy
function canopy(clusters, { cards = 22, size = 1.9, seed = 1, center } = {}) {
  const r = mulberry32(seed), geos = [];
  const cc = center || clusters.reduce((a, c) => a.add(new THREE.Vector3(c[0], c[1], c[2])), new THREE.Vector3()).multiplyScalar(1 / clusters.length);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const [x, y, z, rad] of clusters) {
    const n = Math.round(cards * (rad / 1.6) ** 1.4);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), d = rad * (0.45 + r() * 0.55);
      v.set(Math.cos(a) * s, u * 0.85, Math.sin(a) * s).multiplyScalar(d).add(new THREE.Vector3(x, y, z));
      const sz = size * (0.75 + r() * 0.5) * (rad / 1.6 * 0.4 + 0.6);
      const g = new THREE.PlaneGeometry(sz, sz);
      e.set(r() * Math.PI, r() * Math.PI, r() * Math.PI); q.setFromEuler(e);
      m.compose(v, q, new THREE.Vector3(1, 1, 1)); g.applyMatrix4(m);
      // spherical normals: blend the canopy-centre direction with the cluster's own bulge
      const pos = g.attributes.position, nor = g.attributes.normal, t = new THREE.Vector3(), t2 = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) {
        t.set(pos.getX(k), pos.getY(k), pos.getZ(k));
        t2.copy(t).sub(new THREE.Vector3(x, y, z)).normalize();
        t.sub(cc).normalize().lerp(t2, 0.45).normalize();
        nor.setXYZ(k, t.x, t.y, t.z);
      }
      geos.push(g);
    }
  }
  return mergeGeometries(geos);
}

function trunk({ h = 3.4, r0 = 0.32, r1 = 0.14, lean = 0.2, branches = 3, seed = 1, color = 0x6b4a33 }) {
  const r = mulberry32(seed), geos = [];
  const mk = (from, to, ra, rb) => {
    const d = new THREE.Vector3().subVectors(to, from), len = d.length();
    const g = new THREE.CylinderGeometry(rb, ra, len, 7, 3); g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(from.x, from.y, from.z);
    geos.push(g);
  };
  const top = new THREE.Vector3(lean * (r() - 0.5) * 2, h, lean * (r() - 0.5) * 2), mid = top.clone().multiplyScalar(0.5).add(new THREE.Vector3((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3));
  mk(new THREE.Vector3(0, -0.3, 0), mid, r0, (r0 + r1) / 2); mk(mid, top, (r0 + r1) / 2, r1);
  for (let i = 0; i < branches; i++) {
    const a = r() * Math.PI * 2, y = h * (0.55 + r() * 0.3), len = 1 + r() * 1.2;
    const from = new THREE.Vector3(top.x * y / h, y, top.z * y / h);
    mk(from, from.clone().add(new THREE.Vector3(Math.cos(a) * len, len * 0.7, Math.sin(a) * len)), r1 * 1.1, r1 * 0.5);
  }
  // root flare
  const flare = new THREE.ConeGeometry(r0 * 1.9, 0.7, 7, 1, true); flare.translate(0, 0.05, 0); geos.push(flare);
  const g = mergeGeometries(geos.map(x => x.index ? x.toNonIndexed() : x));
  const col = new Float32Array(g.attributes.position.count * 3), c = new THREE.Color(color), c2 = new THREE.Color(color).multiplyScalar(0.62);
  for (let i = 0; i < g.attributes.position.count; i++) {
    const k = clamp(g.attributes.position.getY(i) / h, 0, 1), cc = c2.clone().lerp(c, 0.4 + k * 0.6);
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------- tree kinds
const KINDS = {
  oak: s => ({
    trunk: trunk({ h: 3.6, r0: 0.38, r1: 0.18, seed: s }),
    leaves: canopy([[0, 4.6, 0, 2.3], [1.5, 4.1, 0.6, 1.7], [-1.4, 4.3, -0.5, 1.8], [0.4, 5.7, -0.4, 1.7], [-0.5, 3.9, 1.4, 1.5], [0.9, 4.0, -1.4, 1.5]], { seed: s, cards: 24 }),
    tints: [0x5f9a3a, 0x6aa63f, 0x548f36, 0x76ad44], h: 7.5, r: 0.45,
  }),
  round: s => ({
    trunk: trunk({ h: 2.6, r0: 0.28, r1: 0.14, seed: s, branches: 2 }),
    leaves: canopy([[0, 3.6, 0, 2.0], [1.0, 3.2, 0.4, 1.3], [-0.9, 3.4, -0.3, 1.4], [0.2, 4.4, 0.1, 1.3]], { seed: s, cards: 22 }),
    tints: [0x83b84a, 0x6fae45, 0x93c052], h: 5.8, r: 0.35,
  }),
  birch: s => ({
    trunk: trunk({ h: 5.4, r0: 0.2, r1: 0.1, seed: s, branches: 2, lean: 0.35, color: 0xe8e2d6 }),
    leaves: canopy([[0, 5.6, 0, 1.4], [0.5, 4.6, 0.3, 1.2], [-0.4, 6.6, -0.2, 1.1], [0.2, 3.8, -0.4, 0.9]], { seed: s, cards: 20, size: 1.5 }),
    tints: [0x9cc860, 0xb1d06a, 0x8fc35a], h: 7.5, r: 0.25,
  }),
  pine: s => {
    const cl = []; for (let i = 0; i < 6; i++) { const y = 1.6 + i * 1.05, rad = 2.1 - i * 0.3; for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; cl.push([Math.cos(a) * rad * 0.35, y, Math.sin(a) * rad * 0.35, rad * 0.75]); } }
    cl.push([0, 7.9, 0, 0.6]);
    return { trunk: trunk({ h: 7.6, r0: 0.3, r1: 0.1, seed: s, branches: 0, color: 0x5e4030 }), leaves: canopy(cl, { seed: s, cards: 14, size: 1.5 }), tints: [0x3f7a43, 0x467f46, 0x3a6e3e, 0x4f8a4a], h: 9, r: 0.4 };
  },
  apple: s => ({
    trunk: trunk({ h: 2.0, r0: 0.24, r1: 0.13, seed: s, branches: 3, lean: 0.3 }),
    leaves: canopy([[0, 2.9, 0, 1.6], [0.9, 2.6, 0.3, 1.1], [-0.8, 2.7, -0.3, 1.2], [0.1, 3.5, 0.2, 1.1]], { seed: s, cards: 20 }),
    tints: [0x6aa840, 0x7bb34a], h: 4.4, r: 0.3,
  }),
  blossom: s => ({
    trunk: trunk({ h: 2.8, r0: 0.28, r1: 0.12, seed: s, branches: 4, lean: 0.5, color: 0x5a3c34 }),
    leaves: canopy([[0, 3.7, 0, 1.9], [1.3, 3.4, 0.4, 1.4], [-1.2, 3.5, -0.4, 1.5], [0.2, 4.6, 0.1, 1.3], [0.4, 3.2, -1.2, 1.2]], { seed: s, cards: 24 }),
    tints: [0xf6b8c8, 0xf2a6bc, 0xfac8d4], h: 6, r: 0.3,
  }),
  autumn: s => ({
    trunk: trunk({ h: 3.4, r0: 0.34, r1: 0.16, seed: s }),
    leaves: canopy([[0, 4.4, 0, 2.1], [1.4, 3.9, 0.6, 1.6], [-1.3, 4.1, -0.5, 1.7], [0.3, 5.4, -0.3, 1.5]], { seed: s, cards: 24 }),
    tints: [0xe39a3b, 0xd8792f, 0xeab54a, 0xc96a2c], h: 7, r: 0.4,
  }),
  bush: s => ({
    trunk: null,
    leaves: canopy([[0, 0.55, 0, 0.85], [0.6, 0.45, 0.2, 0.6], [-0.5, 0.5, -0.2, 0.65]], { seed: s, cards: 16, size: 1.1, center: new THREE.Vector3(0, 0.1, 0) }),
    tints: [0x4f8a3a, 0x5c9a40, 0x467c36], h: 1.4, r: 0,
  }),
};

export class Trees {
  constructor(scene) {
    this.scene = scene; this.list = [];           // { kind, x, y, z, s, yaw }
    this.meshes = [];
  }
  add(kind, x, y, z, s = 1, yaw = 0, tint) { this.list.push({ kind, x, y, z, s, yaw, tint }); }
  build() {
    const byKind = new Map();
    for (const t of this.list) { if (!byKind.has(t.kind)) byKind.set(t.kind, []); byKind.get(t.kind).push(t); }
    const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (const [kind, items] of byKind) {
      // two shape variants per kind so a forest never repeats exactly
      const variants = [KINDS[kind](11), KINDS[kind](23)];
      variants.forEach((v, vi) => {
        const mine = items.filter((_, i) => i % 2 === vi); if (!mine.length) return;
        const lm = foliageMaterial({ map: leaf(), sway: kind === 'bush' ? 0.6 : 1, sss: kind === 'pine' ? 0.35 : 0.7 });
        const leaves = new THREE.InstancedMesh(v.leaves, lm, mine.length);
        leaves.customDepthMaterial = lm.userData.depth;
        leaves.castShadow = true; leaves.receiveShadow = true;
        let trunkM = null;
        if (v.trunk) { trunkM = new THREE.InstancedMesh(v.trunk, barkMat, mine.length); trunkM.castShadow = true; trunkM.receiveShadow = true; }
        mine.forEach((t, i) => {
          m.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw), new THREE.Vector3(t.s, t.s, t.s));
          leaves.setMatrixAt(i, m); trunkM?.setMatrixAt(i, m);
          c.set(t.tint ?? v.tints[i % v.tints.length]); leaves.setColorAt(i, c);
        });
        leaves.computeBoundingSphere(); trunkM?.computeBoundingSphere();
        this.scene.add(leaves); if (trunkM) this.scene.add(trunkM);
        this.meshes.push(leaves); if (trunkM) this.meshes.push(trunkM);
      });
    }
  }
  static info(kind) { const k = KINDS[kind](11); return { h: k.h, r: k.r }; }
}

// ---------------------------------------------------------------- flowers
const FLOWER_COLS = [0xfff6e8, 0xffd84a, 0xff8fb0, 0xb59cff, 0x8cc8ff, 0xff7a5a, 0xffffff];
export class Flowers {
  constructor(scene) { this.scene = scene; this.list = []; }
  add(x, y, z, s, col) { this.list.push([x, y, z, s, col]); }
  build() {
    const n = this.list.length; if (!n) return;
    const stemG = new THREE.CylinderGeometry(0.012, 0.018, 1, 4, 2); stemG.translate(0, 0.5, 0);
    const petals = [];
    for (let i = 0; i < 5; i++) {
      const p = new THREE.CircleGeometry(0.075, 8); p.scale(1, 1.55, 1); p.translate(0, 0.1, 0); p.rotateZ(i * Math.PI * 2 / 5); petals.push(p);
    }
    const headG = mergeGeometries(petals); headG.rotateX(-Math.PI / 2 + 0.35); headG.translate(0, 1.0, 0);
    const eye = new THREE.SphereGeometry(0.045, 6, 4); eye.translate(0, 1.02, 0.02);
    const stemM = foliageMaterial({ color: 0x4f8a34, sway: 9 }), headM = foliageMaterial({ color: 0xffffff, sway: 9, sss: 0.9, rough: 0.7 });
    headM.side = THREE.DoubleSide;
    const eyeM = foliageMaterial({ color: 0xf2b52a, sway: 9 });
    const stems = new THREE.InstancedMesh(stemG, stemM, n), heads = new THREE.InstancedMesh(headG, headM, n), eyes = new THREE.InstancedMesh(eye, eyeM, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), r = mulberry32(9);
    this.list.forEach(([x, y, z, s, col], i) => {
      m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3)), new THREE.Vector3(s, s * (0.35 + r() * 0.25), s));
      stems.setMatrixAt(i, m); heads.setMatrixAt(i, m); eyes.setMatrixAt(i, m);
      c.set(col ?? FLOWER_COLS[Math.floor(r() * FLOWER_COLS.length)]); heads.setColorAt(i, c);
    });
    for (const im of [stems, heads, eyes]) { im.receiveShadow = true; im.computeBoundingSphere(); this.scene.add(im); }
    this.meshes = [stems, heads, eyes];
  }
}

// ---------------------------------------------------------------- rocks
const { noise: rn } = makeNoise(77);
function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (rn(v.x * 1.6 + seed, v.z * 1.6 + v.y * 1.2) - 0.5) * 0.55 + (rn(v.x * 4 + seed, v.y * 4) - 0.5) * 0.12;
    v.multiplyScalar(k); v.y = v.y > 0 ? v.y * 0.75 : v.y * 0.5;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals();
  const col = new Float32Array(ng.attributes.position.count * 3), n = ng.attributes.normal, c = new THREE.Color(), base = new THREE.Color(0x9a958d), moss = new THREE.Color(0x6f8f45), dark = new THREE.Color(0x77736c);
  for (let i = 0; i < n.count; i += 3) {
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, py = ng.attributes.position.getY(i);
    c.copy(base).lerp(dark, rn(i * 0.1, seed) * 0.6).lerp(moss, clamp((ny - 0.55) * 2.4, 0, 0.9) * (py > -0.1 ? 1 : 0.3));
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}
export class Rocks {
  constructor(scene) { this.scene = scene; this.list = []; }
  add(x, y, z, sx, sy, sz, yaw = 0) { this.list.push([x, y, z, sx, sy, sz, yaw]); }
  build() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    const vars = [rockGeometry(1), rockGeometry(7), rockGeometry(13)];
    vars.forEach((g, vi) => {
      const mine = this.list.filter((_, i) => i % 3 === vi); if (!mine.length) return;
      const im = new THREE.InstancedMesh(g, mat, mine.length), m = new THREE.Matrix4(), q = new THREE.Quaternion();
      mine.forEach(([x, y, z, sx, sy, sz, yaw], i) => { m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz)); im.setMatrixAt(i, m); });
      im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); this.scene.add(im);
    });
  }
}
export { foliageMaterial, leaf };
