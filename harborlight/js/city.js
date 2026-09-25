// Turns the world's tiles and buildings into instanced scenery, and keeps it in sync.
import * as THREE from 'three';
import { N, K, PP, KIND, ZONE_COLOR, GROW, TINTS, TERR, TOOLS } from './config.js';
import { pool, placeMatrix, fitScale, info, setNight } from './models.js';
import { hash01, pickH, easeOutBack, clamp, lerp } from './util.js';

const ROAD = {
  straight: K('city-kit-roads/road-straight'), bend: K('city-kit-roads/road-bend'), tee: K('city-kit-roads/road-intersection'),
  cross: K('city-kit-roads/road-crossroad'), end: K('city-kit-roads/road-end'), square: K('city-kit-roads/road-square'),
};
// masks: 1 = north (z-1), 2 = east (x+1), 4 = south (z+1), 8 = west (x-1). Base mask of each piece at yaw 0.
const BASE = { straight: 5, bend: 6, tee: 7, end: 4 };
const rotMask = m => ((m & 1) ? 8 : 0) | ((m & 2) ? 1 : 0) | ((m & 4) ? 2 : 0) | ((m & 8) ? 4 : 0);
function roadPiece(m) {
  const bits = [1, 2, 4, 8].filter(b => m & b).length;
  const kind = m === 0 ? 'square' : bits === 1 ? 'end' : bits === 4 ? 'cross' : bits === 3 ? 'tee' : (m === 5 || m === 10) ? 'straight' : 'bend';
  if (kind === 'square' || kind === 'cross') return { kind, yaw: 0 };
  let b = BASE[kind];
  for (let k = 0; k < 4; k++) { if (b === m) return { kind, yaw: k * Math.PI / 2 }; b = rotMask(b); }
  return { kind, yaw: 0 };
}
export const TREES = ['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_cone', 'tree_tall', 'tree_blocks', 'tree_pineDefaultA'].map(n => K(`nature-kit/${n}`));
const FLOWERS = ['flower_redA', 'flower_yellowA', 'flower_purpleA', 'plant_bushSmall', 'grass_large'].map(n => K(`nature-kit/${n}`));
const LAMP = K('city-kit-roads/light-square');
const TREE_TINTS = [0xeef6d6, 0xe2efc6, 0xf4f9e6, 0xe6eec8, 0xdce9bc, 0xf0f4dc];
const tw = (x, z) => new THREE.Vector3(x - N / 2, 0, z - N / 2);   // tile coords -> world

// ---------------------------------------------------------------- composed buildings
const com = c => K(`city-kit-commercial/building-${c}`), ind = c => K(`city-kit-industrial/${c}`);
const tree = (x, z, s = 0.45, i = 0) => ({ m: TREES[i % 4], x, z, fit: s, yaw: i * 1.3 });
const box = (x, y, z, sx, sy, sz, tint, yaw = 0) => ({ p: 'box', x, y, z, sx, sy, sz, tint, yaw });
function specFor(b) {
  const t = b.type;
  switch (t) {
    case 'coal': return [{ m: ind('building-m'), x: -0.25, z: 0.1, fit: 1.3, tint: 0xf2eee8 }, { m: ind('chimney-large'), x: 0.55, z: -0.5, fit: 0.62, sy: 1.5, smoke: 1 }, { m: ind('detail-tank-large'), x: 0.5, z: 0.55, fit: 0.7 }, box(0, 0, 0, 2, 0.02, 2, 0x8d8f96)];
    case 'wind': return [{ m: ind('windmill'), x: 0, z: 0, s: 0.95, skip: ['blades'], yaw: Math.PI / 2 }, { m: ind('windmill'), x: 0, z: 0, s: 0.95, only: ['blades'], yaw: Math.PI / 2, blades: true }];
    case 'solar': return [-0.5, 0.5].flatMap(x => [-0.5, 0.5].map(z => ({ m: ind('solar-panel-landscape-group'), x, z, fit: 0.9 }))).concat([box(0, 0, 0, 2, 0.015, 2, 0xb9c49a)]);
    case 'watertower': return [{ m: ind('water-tower'), x: 0, z: 0, fit: 0.72 }];
    case 'pump': return [{ m: ind('detail-tank'), x: -0.1, z: -0.1, fit: 0.6, tint: 0xd7ecff }, { m: ind('chimney-small'), x: 0.3, z: 0.3, fit: 0.22 }, box(0, 0, 0, 0.95, 0.02, 0.95, 0x9aa3ad)];
    case 'police': return [{ m: com('g'), x: 0, z: -0.12, fit: 0.78, tint: 0xa9c4ff }, { m: K('car-kit/police'), x: 0.25, z: 0.37, fit: 0.26, yaw: Math.PI / 2 }, { p: 'flag', x: -0.38, z: 0.36, sx: 1, sy: 1, sz: 1, tint: 0x3d6fd8 }];
    case 'fire': return [{ m: ind('building-h'), x: 0, z: -0.12, fit: 0.86, tint: 0xff8f80 }, { m: K('car-kit/firetruck'), x: -0.12, z: 0.36, fit: 0.28, yaw: Math.PI / 2 }, { m: PP('fire-hydrant'), x: 0.38, z: 0.38, fit: 0.08 }];
    case 'hospital': return [{ m: com('n'), x: -0.1, z: -0.2, fit: 1.4, tint: 0xffffff }, { m: PP('sign-hospital'), x: -0.1, y: 0.5, z: 0.52, fit: 0.28, yaw: Math.PI / 2 }, { p: 'helipad', x: 0.62, y: 0.035, z: 0.62, sx: 0.62, sy: 1, sz: 0.62 }, { m: K('car-kit/ambulance'), x: -0.55, z: 0.75, fit: 0.28, yaw: Math.PI / 2 }, box(0, 0, 0, 2, 0.02, 2, 0xc9cdd6)];
    case 'school': return [{ m: com('e'), x: 0, z: -0.3, fit: 1.55, tint: 0xffe0a0 }, box(0.2, 0, 0.55, 1.4, 0.015, 0.7, 0xd9785a), { p: 'flag', x: -0.75, z: 0.5, sx: 1, sy: 1, sz: 1, tint: 0xf2c14e }, tree(-0.75, -0.75, 0.4, 1), tree(0.8, 0.8, 0.4, 2), { m: PP('bench'), x: 0.6, z: 0.3, fit: 0.28 }];
    case 'university': return [box(0, 0, 0, 3, 0.02, 3, 0x9fd06c), { m: com('l'), x: -0.75, z: -0.85, fit: 1.25, tint: 0xf4c3a0 }, { m: com('j'), x: 0.85, z: -0.7, fit: 1.2, tint: 0xf2dcb8, yaw: -Math.PI / 2 }, { m: PP('church'), x: -0.9, z: 0.8, fit: 0.8, tint: 0xfff3e0 }, { m: PP('horse-statue'), x: 0.3, z: 0.55, fit: 0.32 }, box(0.3, 0, 0.55, 0.5, 0.08, 0.5, 0xd8d2c4), tree(1.1, 1.1, 0.5, 0), tree(1.15, 0.2, 0.45, 3), tree(-0.2, 1.2, 0.45, 2), box(0.3, 0.001, 0, 0.3, 0.02, 3, 0xe8dcc0)];
    case 'station': return [box(0, 0, 0.18, 2, 0.08, 0.62, 0xc9c4b8), { m: com('k'), x: 0, z: -0.22, fit: 1.3, tint: 0xe6e0ff }, { m: PP('bench'), x: -0.6, y: 0.08, z: 0.28, fit: 0.2 }, { m: PP('bench'), x: 0.6, y: 0.08, z: 0.28, fit: 0.2 }];
    case 'park': return [box(0, 0, 0, 0.96, 0.02, 0.96, 0x88cf5c), tree(-0.25, -0.2, 0.45, 0), tree(0.28, 0.25, 0.38, 1), { m: PP('bench'), x: 0.15, z: -0.3, fit: 0.26 }, { m: FLOWERS[0], x: -0.3, z: 0.3, fit: 0.18 }, { m: FLOWERS[1], x: -0.1, z: 0.35, fit: 0.16 }, { m: FLOWERS[3], x: 0.35, z: -0.1, fit: 0.2 }];
    case 'plaza': return [box(0, 0, 0, 2, 0.03, 2, 0xe9e1d0), { m: PP('fountain'), x: 0, z: 0, fit: 1.0, fountain: 1 }, ...[[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]].map(([x, z], i) => tree(x, z, 0.42, i)), { m: PP('bench'), x: 0, z: -0.8, fit: 0.28 }, { m: PP('bench'), x: 0, z: 0.8, fit: 0.28, yaw: Math.PI }, { m: LAMP, x: -0.8, z: 0, s: 0.9, lamp: 1 }, { m: LAMP, x: 0.8, z: 0, s: 0.9, yaw: Math.PI, lamp: 1 }];
    case 'bigpark': return [box(0, 0, 0, 3, 0.02, 3, 0x8fd460), { p: 'pond', x: 0.35, y: 0.03, z: 0.25, sx: 1.5, sy: 1, sz: 1.1 }, box(0.35, 0.01, 0.25, 1.62, 0.02, 1.22, 0xd9cfa8), ...Array.from({ length: 11 }, (_, i) => { const a = i / 11 * Math.PI * 2; return tree(Math.cos(a) * 1.15 + (i % 3) * 0.05, Math.sin(a) * 1.15, 0.45 + (i % 3) * 0.08, i); }), { m: PP('bench'), x: -0.55, z: -0.35, fit: 0.28, yaw: 0.6 }, { m: PP('horse-statue'), x: -0.6, z: 0.5, fit: 0.28 }, ...[0, 1, 2, 3, 4].map(i => ({ m: FLOWERS[i], x: -0.2 + i * 0.12, z: -0.75, fit: 0.16 }))];
    case 'playground': return [box(0, 0, 0, 0.96, 0.02, 0.96, 0xf2d9a6), box(-0.2, 0, -0.15, 0.08, 0.35, 0.08, 0xe8554e), box(-0.2, 0.3, 0.05, 0.1, 0.03, 0.45, 0xf2c14e), box(0.25, 0, -0.2, 0.04, 0.32, 0.04, 0x3d7fd8), box(0.25, 0, 0.2, 0.04, 0.32, 0.04, 0x3d7fd8), box(0.25, 0.3, 0, 0.05, 0.04, 0.44, 0x3d7fd8), box(0.18, 0.08, -0.08, 0.1, 0.02, 0.08, 0x2b2d42), box(0.18, 0.08, 0.08, 0.1, 0.02, 0.08, 0x2b2d42), tree(-0.3, 0.33, 0.3, 2), { m: PP('bench'), x: 0.3, z: 0.38, fit: 0.22 }];
    case 'campsite': return [{ m: PP('tent'), x: -0.4, z: -0.3, fit: 0.5, tint: 0xffffff }, { m: PP('tent'), x: 0.45, z: -0.45, fit: 0.45, tint: 0x9fd0ff, yaw: 0.6 }, { m: PP('tent'), x: 0.2, z: 0.5, fit: 0.45, tint: 0xa8f0a0, yaw: -0.4 }, box(-0.25, 0, 0.35, 0.16, 0.05, 0.16, 0x6a4a3a), tree(-0.8, 0.7, 0.45, 1), tree(0.8, 0.3, 0.42, 2), { campfire: [-0.25, 0.1, 0.35] }];
    case 'cityhall': return [box(0, 0, 0, 2, 0.03, 2, 0xe9e1d0), { m: com('m'), x: 0, z: -0.35, fit: 1.2, tint: 0xfff0d4 }, { m: PP('fountain'), x: 0, z: 0.55, fit: 0.7, fountain: 1 }, { p: 'flag', x: -0.7, z: 0.7, sx: 1.3, sy: 1.3, sz: 1.3, tint: 0xe8554e }, { p: 'flag', x: 0.7, z: 0.7, sx: 1.3, sy: 1.3, sz: 1.3, tint: 0x3d7fd8 }, tree(-0.8, -0.8, 0.4, 0), tree(0.8, -0.8, 0.4, 1)];
    case 'church': return [{ m: PP('church'), x: 0, z: 0, fit: 0.72 }, tree(0.38, 0.38, 0.3, 3)];
    case 'lighthouse': return [{ m: PP('lighthouse'), x: 0, z: 0, fit: 0.72, beacon: 1 }, box(0, 0, 0, 0.9, 0.04, 0.9, 0xcfc7b4)];
    case 'marina': return [{ m: PP('dock-long'), x: -0.1, y: -0.05, z: 0.95, fit: 1.35, marina: 1 }, box(0, 0, -0.3, 2, 0.03, 1.4, 0xd9cfb8), { m: PP('bench'), x: -0.5, y: 0.03, z: -0.2, fit: 0.26 }, { m: K('watercraft-kit/boat-sail-a'), x: -0.75, y: -0.16, z: 1.45, fit: 0.34, yaw: 0.2 }, { m: K('watercraft-kit/boat-speed-a'), x: 0.6, y: -0.16, z: 1.35, fit: 0.3, yaw: -0.3 }, { m: K('watercraft-kit/boat-fishing-small'), x: 0.75, y: -0.16, z: 1.95, fit: 0.3, yaw: 1.3 }, { p: 'flag', x: 0.8, z: -0.8, sx: 1, sy: 1, sz: 1, tint: 0x16a3b5 }];
    case 'stadium': return [box(0, 0, 0, 3, 0.02, 3, 0xbfc5cf), { p: 'pitch', x: 0, y: 0.02, z: 0, sx: 1.9, sy: 1, sz: 1.3 }, { p: 'stands', x: 0, z: 0, sx: 0.88, sy: 0.9, sz: 0.9 }, ...[[-1.35, -1.25], [1.35, -1.25], [-1.35, 1.25], [1.35, 1.25]].map(([x, z]) => ({ p: 'mast', x, z, sx: 1, sy: 1, sz: 1, flood: 1 }))];
    case 'funfair': return [box(0, 0, 0, 3, 0.02, 3, 0xe8dcc0), { m: PP('ferris-wheel'), x: -0.6, z: -0.7, s: 1.8 }, { p: 'carousel', x: 0.65, z: 0.55, sx: 1.2, sy: 1.2, sz: 1.2, spin: 1 }, { m: PP('tent'), x: 0.8, z: -0.6, fit: 0.6, tint: 0xffc0c8 }, { m: PP('tent'), x: -0.7, z: 0.8, fit: 0.55, tint: 0xfff0a0, yaw: 0.8 }, tree(1.2, 1.2, 0.35, 1), tree(-1.2, 1.2, 0.35, 2)];
    case 'observatory': return [box(0, 0, 0, 0.9, 0.12, 0.9, 0xd9dde6), { m: PP('satellite-dish'), x: 0, y: 0.12, z: 0, fit: 0.78 }];
    case 'statue': return [box(0, 0, 0, 0.6, 0.12, 0.6, 0xd8d2c4), { m: PP('horse-statue'), x: 0, y: 0.12, z: 0, fit: 0.42, tint: 0xc8a05a }, tree(0.35, 0.35, 0.22, 0)];
    case 'airport': return [
      box(0, 0, 0, 7, 0.01, 3, 0x9aa3ad), { p: 'runway', x: 0, z: 0.72, sx: 6.8, sy: 1, sz: 1.1 }, box(-1.2, 0.005, -0.5, 4, 0.012, 0.9, 0x7d8594),
      { m: com('k'), x: -2.1, z: -1.05, fit: 1.8, tint: 0xe6f0ff }, { m: K('city-kit-commercial/building-skyscraper-e'), x: 0.4, z: -1.05, fit: 0.42, tint: 0xf0f4ff },
      { m: ind('building-s'), x: 2.2, z: -0.95, fit: 1.6, tint: 0xeeeeee }, { p: 'jet', x: -1.2, y: 0, z: -0.45, sx: 0.8, sy: 0.8, sz: 0.8, yaw: Math.PI / 2 }, { p: 'jet', x: 0.4, y: 0, z: -0.45, sx: 0.8, sy: 0.8, sz: 0.8, yaw: -Math.PI / 2, tint: 0xfff0e0 }, { airport: 1 }];
    default: return [box(0, 0, 0, 0.9, 0.5, 0.9, 0xcccccc)];
  }
}

export const specParts = type => specFor({ type, rot: 0, x: 0, z: 0, w: 1, h: 1 }).filter(p => !p.campfire && !p.airport);

export class CityRenderer {
  constructor(stage, world, sim, fx) {
    this.stage = stage; this.w = world; this.sim = sim; this.fx = fx; this.scene = stage.scene;
    this.tileH = new Map();     // tile index -> instance handles
    this.bH = new Map();        // building id -> { parts, ... }
    this.anims = [];
    this.blades = []; this.spinners = []; this.beacons = []; this.floods = []; this.smokers = []; this.fountains = []; this.fires = new Set();
    this.lampHandles = [];
    this.overlayMode = null;
    world.on((type, d) => this.onEvent(type, d));
  }
  // ---------------------------------------------------------------- full build (load / new city)
  buildAll() {
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) this.refreshTile(x, z);
    for (const b of this.w.buildings.values()) this.addBuilding(b, false);
    this.paintOverlay();
  }
  onEvent(type, d) {
    if (type === 'tile') {
      this.refreshTile(d.x, d.z);
      if (d.neighbours) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.refreshTile(d.x + dx, d.z + dz);
      this.paintTile(d.x, d.z); this.stage._overlayDirty = true;
    } else if (type === 'building+') { this.addBuilding(d, true); for (let dz = 0; dz < d.h; dz++) for (let dx = 0; dx < d.w; dx++) this.paintTile(d.x + dx, d.z + dz); this.stage._overlayDirty = true; }
    else if (type === 'building-') { this.removeBuilding(d); for (let dz = 0; dz < d.h; dz++) for (let dx = 0; dx < d.w; dx++) this.paintTile(d.x + dx, d.z + dz); this.stage._overlayDirty = true; }
    else if (type === 'building~') { this.removeBuilding(d); this.addBuilding(d, !d.fire && !d.abandoned); }
  }
  // ---------------------------------------------------------------- tiles: roads, rails, trees, rubble
  clearTile(i) { const hs = this.tileH.get(i); if (hs) for (const h of hs) h.pool.remove(h.id); this.tileH.delete(i); }
  add(list, path, m, color, opts) { const p = pool(this.scene, path, opts); const id = p.add(m, color); list.push({ pool: p, id }); return id; }
  refreshTile(x, z) {
    const w = this.w; if (!w.in(x, z)) return;
    const i = w.idx(x, z); this.clearTile(i);
    const hs = []; const c = tw(x + 0.5, z + 0.5), k = w.kind[i];
    if (k === KIND.ROAD) this.drawRoad(x, z, c, hs);
    else if (k === KIND.RAIL) this.drawRail(x, z, c, hs);
    else if (k === KIND.RUBBLE) {
      for (let j = 0; j < 5; j++) { const s = 0.12 + hash01(x, z, j) * 0.18; this.add(hs, 'box', new THREE.Matrix4().compose(new THREE.Vector3(c.x + (hash01(j, x, z) - 0.5) * 0.6, 0, c.z + (hash01(z, j, x) - 0.5) * 0.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hash01(x, j) * 3, 0)), new THREE.Vector3(s, s * 0.6, s)), [0x7a746c, 0x5a544e, 0x9a8f80][j % 3]); }
    }
    if (w.tree[i] && k === KIND.EMPTY) {
      const n = 1 + Math.floor(hash01(x, z, 11) * 2.2);
      for (let j = 0; j < n; j++) {
        const path = TREES[(w.tree[i] + j * 3) % TREES.length];
        const s = fitScale(path, 0.5 + hash01(x, z, j + 20) * 0.35) * 1.15;
        const ox = n === 1 ? (hash01(x, z, 3) - 0.5) * 0.3 : (j ? 0.2 : -0.2) + (hash01(x, j) - 0.5) * 0.15, oz = n === 1 ? (hash01(z, x, 5) - 0.5) * 0.3 : (j ? -0.15 : 0.18);
        this.add(hs, path, placeMatrix(path, c.x + ox, 0, c.z + oz, hash01(x, z, j) * 6.28, s), TREE_TINTS[(w.tree[i] + j) % TREE_TINTS.length]);
      }
    }
    if (hs.length) this.tileH.set(i, hs);
  }
  drawRoad(x, z, c, hs) {
    const w = this.w, m = w.mask(x, z, (a, b) => w.isRoad(a, b));
    const water = w.terr[w.idx(x, z)] === TERR.WATER;
    const { kind, yaw } = roadPiece(m);
    const y = water ? 0.02 : 0.0;
    this.add(hs, ROAD[kind], placeMatrix(ROAD[kind], c.x, y, c.z, yaw, 1), 0xffffff, { shadow: false });
    if (water) {
      // a stone bridge: deck, railings, piers into the water
      const alongX = (m & 10) && !(m & 5);
      const Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, alongX ? Math.PI / 2 : 0, 0));
      const put = (lx, ly, lz, sx, sy, sz, col) => { const v = new THREE.Vector3(lx, ly, lz).applyQuaternion(Q); this.add(hs, 'box', new THREE.Matrix4().compose(v.add(c), Q, new THREE.Vector3(sx, sy, sz)), col); };
      put(0, -0.16, 0, 1.02, 0.18, 1.0, 0xcfc4ae);
      put(-0.49, 0.02, 0, 0.05, 0.1, 1.0, 0xe8e0cc); put(0.49, 0.02, 0, 0.05, 0.1, 1.0, 0xe8e0cc);
      if ((alongX ? x : z) % 2 === 0) { put(-0.3, -1.4, 0, 0.16, 1.26, 0.2, 0xb8ad96); put(0.3, -1.4, 0, 0.16, 1.26, 0.2, 0xb8ad96); }
      return;
    }
    // street lamps on some straight pieces, glowing after dusk
    if (kind === 'straight' && (x * 7 + z * 3) % 3 === 0) {
      const alongX = m === 10, side = (x + z) % 2 ? 1 : -1;
      const lx = alongX ? 0 : side * 0.44, lz = alongX ? side * 0.44 : 0;
      const armYaw = alongX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.add(hs, LAMP, placeMatrix(LAMP, c.x + lx, 0, c.z + lz, armYaw, 0.95), 0xffffff);
      const arm = new THREE.Vector3(0, 0, -0.19).applyAxisAngle(new THREE.Vector3(0, 1, 0), armYaw);
      const bx = c.x + lx + arm.x, bz = c.z + lz + arm.z;
      this.add(hs, 'bulb', new THREE.Matrix4().compose(new THREE.Vector3(bx, 0.55, bz), new THREE.Quaternion(), new THREE.Vector3(0.05, 0.03, 0.05)), 0xffffff, { shadow: false });
      this.add(hs, 'pool', new THREE.Matrix4().compose(new THREE.Vector3(bx, 0.03, bz), new THREE.Quaternion(), new THREE.Vector3(1.3, 1, 1.3)), 0xffffff, { shadow: false, receive: false });
    }
  }
  drawRail(x, z, c, hs) {
    const w = this.w, m = w.mask(x, z, (a, b) => w.isRail(a, b) || (w.building(a, b)?.type === 'station' && !w.isRail(a, b) && false));
    const segs = [];
    const edge = { 1: [0, -0.5], 2: [0.5, 0], 4: [0, 0.5], 8: [-0.5, 0] };
    const bits = [1, 2, 4, 8].filter(b => m & b);
    if (bits.length === 2 && !(m === 5 || m === 10)) {
      // quarter circle between the two edge midpoints, centred on their shared corner
      const [a, b] = bits.map(k => edge[k]); const cx = a[0] + b[0], cz = a[1] + b[1];
      const a0 = Math.atan2(a[1] - cz, a[0] - cx), a1 = Math.atan2(b[1] - cz, b[0] - cx);
      let d = a1 - a0; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      const pts = []; for (let s = 0; s <= 6; s++) { const t = a0 + d * s / 6; pts.push([cx + Math.cos(t) * 0.5, cz + Math.sin(t) * 0.5]); }
      for (let s = 0; s < 6; s++) segs.push([pts[s], pts[s + 1]]);
    } else {
      const ends = bits.length ? bits.map(k => edge[k]) : [[0, -0.5], [0, 0.5]];
      if (bits.length === 1) ends.push([-ends[0][0], -ends[0][1]]);
      for (const e of ends) segs.push([[0, 0], e]);
    }
    for (const [p, q] of segs) {
      const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
      const mx = c.x + (p[0] + q[0]) / 2, mz = c.z + (p[1] + q[1]) / 2;
      const Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      const put = (lx, ly, sx, sy, sz, col, lz = 0) => { const v = new THREE.Vector3(lx, ly, lz).applyQuaternion(Q); this.add(hs, 'box', new THREE.Matrix4().compose(new THREE.Vector3(mx + v.x, ly, mz + v.z), Q, new THREE.Vector3(sx, sy, sz)), col, { shadow: false }); };
      put(0, 0, 0.46, 0.035, len + 0.02, 0x9c9486);
      const n = Math.max(1, Math.round(len / 0.13));
      for (let s = 0; s < n; s++) put(0, 0.03, 0.4, 0.025, 0.05, 0x6b4a34, (s + 0.5) / n * len - len / 2);
      put(-0.12, 0.055, 0.025, 0.03, len + 0.01, 0xc9ced6); put(0.12, 0.055, 0.025, 0.03, len + 0.01, 0xc9ced6);
    }
  }
  // ---------------------------------------------------------------- buildings
  partsFor(b) {
    if (b.lvl) {
      const list = GROW[b.type][b.lvl - 1];
      const path = pickH(list, b.x, b.z, b.lvl);
      const fit = b.type === 'R' && b.lvl === 1 ? 0.84 : 0.9;
      let tint = pickH(TINTS[b.type], b.x * 3, b.z, b.lvl);
      if (b.abandoned) tint = 0xb8aea2;
      const parts = [{ m: path, x: 0, z: 0, fit, tint, yaw: 0, glow: true }];
      if (b.type === 'R' && b.lvl === 1 && hash01(b.x, b.z, 77) < 0.45) parts.push(tree(0.36 * (hash01(b.z, 1) > 0.5 ? 1 : -1), -0.36, 0.26, b.x));
      if (b.type === 'I' && b.lvl >= 2 && hash01(b.x, b.z, 9) < 0.6) parts.push({ m: ind(`shipping-container-${pickH(['a', 'b', 'c'], b.x, b.z)}`), x: 0.33, z: 0.36, fit: 0.2, yaw: Math.PI / 2 });
      return parts;
    }
    return specFor(b);
  }
  addBuilding(b, animate) {
    const parts = this.partsFor(b);
    const [W0, H0] = TOOLS[b.type]?.size || [1, 1];
    const yaw0 = b.rot * Math.PI / 2;
    const center = tw(b.x + b.w / 2, b.z + b.h / 2);
    const Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw0, 0));
    const handles = [];
    const rec = { b, handles, center, anim: null, top: 0.5 };
    for (const p of parts) {
      if (p.campfire) { const v = new THREE.Vector3(p.campfire[0], 0, p.campfire[2]).applyQuaternion(Q).add(center); this.smokers.push({ b, pos: v.setY(0.1), fire: true, rate: 8 }); continue; }
      if (p.airport) { rec.airport = true; continue; }
      const off = new THREE.Vector3(p.x || 0, 0, p.z || 0).applyQuaternion(Q);
      const X = center.x + off.x, Z = center.z + off.z, Y = p.y || 0, yaw = yaw0 + (p.yaw || 0);
      let m, path;
      if (p.p) {
        path = p.p;
        m = new THREE.Matrix4().compose(new THREE.Vector3(X, Y, Z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(p.sx, p.sy, p.sz));
      } else {
        path = p.m;
        const s = p.s || fitScale(path, p.fit || 0.9);
        m = placeMatrix(path, X, Y, Z, yaw, s, p.sy || 1);
        { const inf = info.get(path); if (inf) rec.top = Math.max(rec.top, Y + inf.size.y * s * (p.sy || 1)); }
        if (p.smoke) { const inf = info.get(path); this.smokers.push({ b, pos: new THREE.Vector3(X, Y + (inf ? inf.size.y * s * (p.sy || 1) : 1), Z), rate: 5 }); }
        if (p.beacon) { const inf = info.get(path); this.beacons.push({ b, pos: new THREE.Vector3(X, Y + (inf ? inf.size.y * s * 0.9 : 2), Z), mesh: this.makeBeam() }); }
        if (p.fountain) this.fountains.push({ b, pos: new THREE.Vector3(X, Y + 0.25 * (p.fit || 1), Z) });
      }
      const opts = { glow: !!p.glow || (!!p.m && /city-kit-(commercial|industrial|suburban)/.test(p.m)), only: p.only, skip: p.skip };
      const pl = pool(this.scene, path, opts);
      const id = pl.add(animate ? new THREE.Matrix4().makeScale(0, 0, 0) : m, p.tint ?? 0xffffff);
      handles.push({ pool: pl, id, m });
      if (p.blades) { const inf = info.get(path); this.blades.push({ b, pool: pl, id, m, pivot: new THREE.Vector3(-0.24 * (p.s || 1), 1.68 * (p.s || 1), 0), yaw, spd: 2 + hash01(b.id) * 1.5 }); }
      if (p.spin) this.spinners.push({ b, pool: pl, id, m, yaw, X, Y, Z, s: [p.sx, p.sy, p.sz] });
      if (p.flood) this.floods.push({ b, pos: new THREE.Vector3(X, 1.12, Z), handle: this.addFloodGlow(X, Z, center) });
    }
    if (b.lvl && b.type === 'I' && b.lvl >= 2 && hash01(b.id, 5) < 0.7) { const inf = info.get(parts[0].m); const s = fitScale(parts[0].m, 0.9); this.smokers.push({ b, pos: new THREE.Vector3(center.x + (hash01(b.id) - 0.5) * 0.4, (inf ? inf.size.y * s : 1) + 0.05, center.z + (hash01(b.id, 2) - 0.5) * 0.4), rate: 0.6 + b.lvl * 0.4 }); }
    if (b.fire) this.fires.add(b);
    rec.airportRec = rec.airport ? { center, yaw: yaw0 } : null;
    this.bH.set(b.id, rec);
    if (animate) { rec.anim = { t: 0 }; this.anims.push(rec); this.fx.dust(center, Math.max(b.w, b.h)); }
    this.airportChanged = true;
  }
  removeBuilding(b) {
    const rec = this.bH.get(b.id); if (!rec) return;
    for (const h of rec.handles) h.pool.remove(h.id);
    this.bH.delete(b.id);
    const keep = e => e.b !== b;
    this.blades = this.blades.filter(keep); this.spinners = this.spinners.filter(keep); this.smokers = this.smokers.filter(keep); this.fountains = this.fountains.filter(keep);
    this.beacons = this.beacons.filter(e => { if (e.b === b) { this.scene.remove(e.mesh); return false; } return true; });
    this.floods = this.floods.filter(e => { if (e.b === b) { e.handle.forEach(h => h.pool.remove(h.id)); return false; } return true; });
    this.fires.delete(b);
    this.anims = this.anims.filter(r => r !== rec);
    this.airportChanged = true;
  }
  makeBeam() {
    const g = new THREE.ConeGeometry(0.9, 9, 20, 1, true); g.translate(0, -4.5, 0); g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uO: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uO; varying vec2 vUv; void main(){ float a = pow(vUv.y, 2.0) * uO; gl_FragColor = vec4(vec3(1.0, 0.92, 0.7) * a * 1.6, a); }' }));
    m.visible = false; this.scene.add(m); return m;
  }
  addFloodGlow(X, Z, center) {
    const hs = [];
    this.add(hs, 'bulb', new THREE.Matrix4().compose(new THREE.Vector3(X, 1.13, Z), new THREE.Quaternion(), new THREE.Vector3(0.2, 0.1, 0.2)), 0xffffff, { shadow: false });
    const d = new THREE.Vector3(center.x - X, 0, center.z - Z).multiplyScalar(0.55);
    this.add(hs, 'pool', new THREE.Matrix4().compose(new THREE.Vector3(X + d.x, 0.04, Z + d.z), new THREE.Quaternion(), new THREE.Vector3(3.2, 1, 3.2)), 0xffffff, { shadow: false, receive: false });
    return hs;
  }

  // ---------------------------------------------------------------- overlay (zones + data maps)
  paintTile(x, z) {
    if (this.overlayMode) return;
    const w = this.w, i = w.idx(x, z), o = this.stage.terrain.overlay;
    const zn = w.zone[i];
    if (zn && w.kind[i] === KIND.EMPTY) { const c = ZONE_COLOR[zn]; o.set(i, c[0], c[1], c[2], 0.26); }
    else if (w.kind[i] === KIND.RUBBLE) o.set(i, 0.35, 0.3, 0.26, 0.5);
    else o.set(i, 0, 0, 0, 0);
  }
  paintOverlay(mode = this.overlayMode) {
    this.overlayMode = mode;
    const w = this.w, s = this.sim, o = this.stage.terrain.overlay;
    if (!mode) { for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) this.paintTile(x, z); o.commit(); return; }
    const heat = (i, v, a = 0.62) => { const r = v < 0.5 ? 1 : 1 - (v - 0.5) * 2, g = v < 0.5 ? v * 2 : 1; o.set(i, r * 0.95, g * 0.85, 0.2, a); };
    for (let i = 0; i < N * N; i++) {
      if (w.terr[i] === TERR.WATER) { o.set(i, 0, 0, 0, 0); continue; }
      const dev = w.kind[i] !== KIND.EMPTY || w.zone[i];
      if (mode === 'power') o.set(i, ...(s.power[i] ? [1, 0.86, 0.2] : [0.95, 0.3, 0.3]), dev ? 0.6 : 0.08);
      else if (mode === 'water') o.set(i, ...(s.water[i] ? [0.3, 0.7, 1] : [0.6, 0.55, 0.5]), s.water[i] ? 0.55 : dev ? 0.35 : 0.05);
      else if (mode === 'land') heat(i, s.land[i]);
      else if (mode === 'pollution') heat(i, 1 - s.pollution[i], 0.25 + s.pollution[i] * 0.6);
      else { const v = s.cover[mode][i]; o.set(i, 0.3, 0.75, 1, v * 0.62); }
    }
    o.commit();
  }

  // ---------------------------------------------------------------- floating status icons
  updateIcons(dt, t) {
    const p = pool(this.scene, 'icon-bolt', { shadow: false });
    this.icons = this.icons || new Map();
    this.iconT = (this.iconT || 0) - dt;
    if (this.iconT <= 0) {
      this.iconT = 0.6;
      const want = new Set();
      for (const b of this.w.buildings.values()) if (b.powered === false && !TOOLS[b.type]?.fx?.power && this.w.day - b.born > 3) want.add(b.id);
      for (const [id, h] of this.icons) if (!want.has(id) || !this.bH.has(id)) { p.remove(h.id); this.icons.delete(id); }
      for (const id of want) if (!this.icons.has(id) && this.bH.has(id)) { const r = this.bH.get(id); this.icons.set(id, { id: p.add(new THREE.Matrix4()), c: r.center, y: r.top + 0.35, ph: Math.random() * 6 }); }
    }
    const q = this.stage.camera.quaternion, M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3(0.36, 0.36, 0.36);
    for (const h of this.icons.values()) p.set(h.id, M.compose(P.set(h.c.x, h.y + Math.sin(t * 3 + h.ph) * 0.06, h.c.z), q, S));
    if (p.parts[0]) p.parts[0].mesh.renderOrder = 10;
  }
  // ---------------------------------------------------------------- per frame
  update(dt, t, night) {
    setNight(night);
    this.updateIcons(dt, t);
    // construction pop
    for (let k = this.anims.length - 1; k >= 0; k--) {
      const r = this.anims[k]; r.anim.t += dt * 1.6;
      const e = r.anim.t >= 1 ? 1 : easeOutBack(r.anim.t), sq = 1 + (1 - e) * 0.25;
      const A = new THREE.Matrix4().makeTranslation(r.center.x, 0, r.center.z).multiply(new THREE.Matrix4().makeScale(sq > 1 ? 1 / Math.sqrt(sq) : 1, Math.max(0.001, e), sq > 1 ? 1 / Math.sqrt(sq) : 1)).multiply(new THREE.Matrix4().makeTranslation(-r.center.x, 0, -r.center.z));
      for (const h of r.handles) h.pool.set(h.id, new THREE.Matrix4().multiplyMatrices(A, h.m));
      if (r.anim.t >= 1) { for (const h of r.handles) h.pool.set(h.id, h.m); this.anims.splice(k, 1); }
    }
    // wind turbines
    for (const bl of this.blades) {
      const a = t * bl.spd;
      const piv = bl.pivot.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), bl.yaw);
      const base = new THREE.Vector3().setFromMatrixPosition(bl.m);
      const P = base.clone().add(piv);
      const R = new THREE.Matrix4().makeTranslation(P.x, P.y, P.z).multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), bl.yaw), a)).multiply(new THREE.Matrix4().makeTranslation(-P.x, -P.y, -P.z));
      bl.pool.set(bl.id, new THREE.Matrix4().multiplyMatrices(R, bl.m));
    }
    for (const sp of this.spinners) sp.pool.set(sp.id, new THREE.Matrix4().compose(new THREE.Vector3(sp.X, sp.Y, sp.Z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sp.yaw + t * 0.8, 0)), new THREE.Vector3(...sp.s)));
    for (const bc of this.beacons) { bc.mesh.visible = night > 0.15; bc.mesh.position.copy(bc.pos); bc.mesh.rotation.y = t * 0.9; bc.mesh.material.uniforms.uO.value = night * 0.55; }
    // chimneys, campfires, fountains, fires
    for (const s of this.smokers) { if (s.b.powered === false && !s.fire) continue; if (Math.random() < dt * s.rate) s.fire ? this.fx.flame(s.pos, 0.35) : this.fx.smoke(s.pos, 0.9); }
    for (const f of this.fountains) if (Math.random() < dt * 20) this.fx.spray(f.pos);
    for (const b of this.fires) { const c = tw(b.x + 0.5, b.z + 0.5); if (Math.random() < dt * 30) this.fx.flame(c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6)), 1); if (Math.random() < dt * 8) this.fx.smoke(c.clone().setY(1), 1.6, 0x4a4a52); }
    // night lights
    const nb = pool(this.scene, 'bulb', { shadow: false });
    if (nb.parts[0]) nb.parts[0].mat.color.setRGB(1, 0.78, 0.5).multiplyScalar(0.3 + night * 3.2);
    const lp = pool(this.scene, 'pool', { shadow: false, receive: false });
    if (lp.parts[0]) lp.parts[0].mat.color.setRGB(1, 0.7, 0.4).multiplyScalar(night * 0.55);
  }
}
