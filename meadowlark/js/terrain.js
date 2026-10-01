// The island's shape: an analytic height function baked into a 1 m grid, plus the masks
// (paths, water, grass) that everything else reads, and the ground mesh itself.
import * as THREE from 'three';
import { HALF, ISLAND_R, P, RIVER, FALL_INDEX, PATHS } from './layout.js';
import { makeNoise, smoothstep, clamp, lerp } from './util.js';

const { fbm, noise } = makeNoise(7);
export const N = HALF * 2 + 1;              // grid points per side
const H = new Float32Array(N * N);          // ground height
const WL = new Float32Array(N * N);         // water surface height (-99 = dry)
const PATH = new Float32Array(N * N);       // 0..1 path strength
const WET = new Float32Array(N * N);        // 0..1 closeness to a riverbank
const gi = (ix, iz) => iz * N + ix;

// distance from p to segment ab, and the parameter along it
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return [Math.sqrt(qx * qx + qz * qz), t];
}
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));

// the shape before rivers and paths
function baseHeight(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const wob = 1 + (fbm(Math.cos(a) * 1.7 + 3, Math.sin(a) * 1.7 + 3, 3) - 0.5) * 0.42 + Math.sin(a * 3 + 1) * 0.05;
  const d = r / (ISLAND_R * wob);
  const land = smoothstep(1.06, 0.8, d);
  let h = lerp(-9, 4.8, land) + Math.min(0, (1 - d)) * 6;
  h += Math.pow(land, 1.5) * ((fbm(x * 0.016 + 11, z * 0.016 - 4) - 0.5) * 11);
  h += land * (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 1.4;
  // plateau north of the cliff line; the west end softens into a walkable ramp
  const zc = P.plateau.z + Math.sin(x * 0.07) * 3 + (fbm(x * 0.03, 9.1) - 0.5) * 10 + (fbm(x * 0.12, 3.3) - 0.5) * 3;
  const soft = lerp(1.4, 13, smoothstep(-30, -50, x)) + lerp(0, 16, smoothstep(46, 70, x));
  const north = smoothstep(zc + soft, zc - soft, z) * smoothstep(0.98, 0.7, d);
  const plateau = P.plateau.h + (fbm(x * 0.03 + 5, z * 0.03, 3) - 0.5) * 5;
  // a ledge halfway up breaks the cliff into two steps
  const ledge = smoothstep(zc + soft + 4, zc + soft + 1.5, z) * (1 - north) * smoothstep(0.98, 0.7, d) * smoothstep(-34, -24, x) * smoothstep(52, 40, x);
  h = lerp(h, Math.max(h, P.plateau.h * 0.45 + (fbm(x * 0.08, 4.4) - 0.5) * 3), ledge * smoothstep(0.35, 0.65, fbm(x * 0.04, 2.2)));
  h = lerp(h, Math.max(h, plateau), north);
  // the mountain, the windmill hill, the lighthouse cape, the ruins knoll
  h += gauss(x, z, P.summit[0], P.summit[1], 19) * 29 * land;
  h += gauss(x, z, P.summit[0] + 18, P.summit[1] + 8, 12) * 9 * land;
  h += gauss(x, z, P.windmill.c[0], P.windmill.c[1], 15) * 10;
  h += gauss(x, z, P.lighthouse[0], P.lighthouse[1], 9) * 5;
  h += gauss(x, z, P.ruins[0], P.ruins[1], 10) * 4;
  h += gauss(x, z, P.islet[0], P.islet[1], 9) * 12;
  // gentle flats for the village and the orchard
  for (const f of [P.village, P.orchard]) {
    const k = smoothstep(f.r + 14, f.r * 0.6, Math.hypot(x - f.c[0], z - f.c[1]));
    h = lerp(h, f.h + (fbm(x * 0.05, z * 0.05) - 0.5) * 1.2, k);
  }
  return h;
}

// river level and width at the nearest point of the river polyline
function riverAt(x, z) {
  let best = 1e9, L = 0, w = 0, seg = -1, t = 0;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    const [d, tt] = segDist(x, z, a[0], a[1], b[0], b[1]);
    if (d < best) { best = d; seg = i; t = tt; L = lerp(a[2], b[2], tt); w = lerp(1.6, 4.4, smoothstep(0, RIVER.length - 1, i + tt)); }
  }
  // meander: wiggle the distance a little so banks are not ruler-straight
  return { d: best + (noise(x * 0.15, z * 0.15) - 0.5) * 1.2, L, w, seg, t };
}

export function bake() {
  const pond = P.pond;
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const x = ix - HALF, z = iz - HALF, i = gi(ix, iz);
    let h = baseHeight(x, z), wl = h < 0.2 ? 0 : -99, wet = 0;
    // rivers carve a channel and raise low banks so the water never floats
    const r = riverAt(x, z);
    if (r.seg !== FALL_INDEX && r.d < r.w * 3.2) {
      const core = smoothstep(r.w, r.w * 0.35, r.d), bank = smoothstep(r.w * 3.2, r.w * 1.3, r.d);
      const bed = r.L - lerp(0.7, 1.4, smoothstep(0, 4, r.w));
      if (r.L > 0.05) h = lerp(h, Math.max(h, r.L + 0.35), bank * (1 - core));
      h = lerp(h, Math.min(h, bed), core);
      if (r.d < r.w * 1.05) wl = Math.max(wl, r.L);
      wet = Math.max(wet, bank);
    }
    if (r.seg === FALL_INDEX && r.d < 3.4) {
      // the notch the waterfall pours through
      h = lerp(h, Math.min(h, lerp(RIVER[FALL_INDEX][2], pond.level, smoothstep(0.2, 0.8, r.t)) - 0.6), smoothstep(3.4, 1.4, r.d));
      wet = 1;
    }
    // the pond under the falls
    const pd = Math.hypot(x - pond.c[0], z - pond.c[1]) + (noise(x * 0.2, z * 0.2) - 0.5) * 2;
    if (pd < pond.r * 2) {
      const core = smoothstep(pond.r, pond.r * 0.2, pd), bank = smoothstep(pond.r * 2, pond.r * 1.1, pd);
      h = lerp(h, Math.max(h, pond.level + 0.4), bank * (1 - core));
      h = lerp(h, Math.min(h, pond.level - 2.2 * (1 - (pd / pond.r) ** 2)), core);
      if (pd < pond.r * 1.02) wl = Math.max(wl, pond.level);
      wet = Math.max(wet, bank);
    }
    H[i] = h; WL[i] = wl; WET[i] = wet;
  }
  // paths: strength by distance to each polyline, then soften bumps under them
  for (const p of PATHS) for (let s = 0; s < p.pts.length - 1; s++) {
    const [ax, az] = p.pts[s], [bx, bz] = p.pts[s + 1];
    const x0 = Math.floor(Math.min(ax, bx) - 4), x1 = Math.ceil(Math.max(ax, bx) + 4), z0 = Math.floor(Math.min(az, bz) - 4), z1 = Math.ceil(Math.max(az, bz) + 4);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const ix = x + HALF, iz = z + HALF; if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
      const [d] = segDist(x, z, ax, az, bx, bz);
      const k = smoothstep(p.w * 0.5 + 1.1, p.w * 0.5 - 0.2, d + (noise(x * 0.4, z * 0.4) - 0.5) * 0.9);
      const i = gi(ix, iz); PATH[i] = Math.max(PATH[i], k);
    }
  }
  // one blur pass under paths so they read as worn ground
  const src = H.slice();
  for (let iz = 1; iz < N - 1; iz++) for (let ix = 1; ix < N - 1; ix++) {
    const i = gi(ix, iz); if (PATH[i] <= 0 || WL[i] > -50) continue;
    const avg = (src[i - 1] + src[i + 1] + src[i - N] + src[i + N] + src[i] * 2) / 6;
    H[i] = lerp(src[i], avg, PATH[i]);
  }
}

// ---------------------------------------------------------------- queries
function bilerp(A, x, z) {
  const fx = clamp(x + HALF, 0, N - 1.001), fz = clamp(z + HALF, 0, N - 1.001);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = gi(ix, iz);
  return lerp(lerp(A[i], A[i + 1], tx), lerp(A[i + N], A[i + N + 1], tx), tz);
}
export const heightAt = (x, z) => (Math.abs(x) > HALF || Math.abs(z) > HALF) ? -12 : bilerp(H, x, z);
export const pathAt = (x, z) => bilerp(PATH, x, z);
export const wetAt = (x, z) => bilerp(WET, x, z);
export function waterAt(x, z) {
  if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) return 0;
  const ix = Math.round(x + HALF), iz = Math.round(z + HALF);
  return WL[gi(ix, iz)];
}
const _n = new THREE.Vector3();
export function normalAt(x, z, out = _n) {
  const e = 0.7;
  return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}
export const slopeAt = (x, z) => 1 - normalAt(x, z).y;

// a height texture for the water and the grass shaders
export function heightTexture() {
  const d = new Float32Array(N * N); d.set(H);
  const t = new THREE.DataTexture(d, N, N, THREE.RedFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- the ground mesh
const C = {
  grass: new THREE.Color(0x76a845), grassWarm: new THREE.Color(0xa7c255), grassDeep: new THREE.Color(0x4f8338),
  plateau: new THREE.Color(0x6c9e44), dirt: new THREE.Color(0xb48d62), dirtDark: new THREE.Color(0x8e6a48),
  sand: new THREE.Color(0xead6a4), wetSand: new THREE.Color(0xbfa47a), rock: new THREE.Color(0x9b968e), rockDark: new THREE.Color(0x6f6c6a),
  moss: new THREE.Color(0x7c8f52), seabed: new THREE.Color(0x9fb39a), mud: new THREE.Color(0x7d7353),
};
export function groundColor(x, z, h, slope, out = new THREE.Color()) {
  const p = pathAt(x, z), wet = wetAt(x, z);
  const warm = fbm(x * 0.03 + 40, z * 0.03, 3), deep = smoothstep(0.55, 0.75, fbm(x * 0.02 - 20, z * 0.02 + 7, 3));
  out.copy(C.grass).lerp(C.grassWarm, smoothstep(0.42, 0.7, warm)).lerp(C.grassDeep, deep * 0.8);
  if (h > 14) out.lerp(C.plateau, 0.5);
  // near water: darker, muddier
  out.lerp(C.mud, wet * 0.35);
  // beaches
  const beach = smoothstep(2.1, 0.9, h + (noise(x * 0.2, z * 0.2) - 0.5) * 0.8) * (1 - wet * 0.8);
  out.lerp(C.sand, beach);
  if (h < 0.2) out.copy(C.wetSand).lerp(C.seabed, smoothstep(0, -4, h));
  // paths
  out.lerp(C.dirt, p * 0.92).lerp(C.dirtDark, p * smoothstep(0.5, 0.8, noise(x * 0.6, z * 0.6)) * 0.3);
  // rock on steep slopes and high up
  const rock = Math.max(smoothstep(0.34, 0.52, slope), smoothstep(46, 50, h) * 0.5);
  out.lerp(slope > 0.6 ? C.rockDark : C.rock, rock);
  if (rock > 0.3 && slope < 0.55) out.lerp(C.moss, 0.25);
  return out;
}

export function buildGround(scene) {
  const seg = N - 1;
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), ix = Math.round(x + HALF), iz = Math.round(z + HALF);
    const h = H[gi(ix, iz)]; pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    groundColor(pos.getX(i), pos.getZ(i), pos.getY(i), 1 - nrm.getY(i), c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos; varying vec3 vWN;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // fine speckle so close-up ground never looks flat
        float sp = vn(vWPos.xz * 3.1) * 0.6 + vn(vWPos.xz * 11.0) * 0.4;
        diffuseColor.rgb *= 0.88 + sp * 0.24;
        // cliffs: warm sandstone strata, darker cracks, streaks of moss on the ledges
        float steep = smoothstep(0.78, 0.55, vWN.y);
        if (steep > 0.0) {
          float wob = vn(vWPos.xz * 0.35) * 2.0 + vn(vWPos.xz * 1.3) * 0.4;
          float strata = sin(vWPos.y * 2.4 + wob) * 0.5 + 0.5;
          float crack = smoothstep(0.62, 0.8, vn(vec2(vWPos.x + vWPos.z, vWPos.y * 0.25) * 1.7));
          vec3 rockA = vec3(0.26, 0.20, 0.14), rockB = vec3(0.13, 0.10, 0.075);
          vec3 rock = mix(rockA, rockB, strata * 0.55 + crack * 0.45);
          rock *= 0.85 + vn(vWPos.xy * 4.0 + vWPos.zy * 3.0) * 0.3;
          float moss = smoothstep(0.62, 0.75, vWN.y) * smoothstep(0.4, 0.7, vn(vWPos.xz * 0.6));
          rock = mix(rock, vec3(0.08, 0.15, 0.035), moss * 0.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, rock, steep);
        }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.name = 'ground';
  scene.add(mesh);
  return mesh;
}
