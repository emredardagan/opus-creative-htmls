// The city's state: terrain, tiles, zones, buildings, money. Emits change events for the renderer.
import { N, TERR, KIND, ZONE, TOOLS, START_MONEY, NAMES } from './config.js';
import { makeNoise, mulberry32, smoothstep, hash01, pickH } from './util.js';

const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class World {
  constructor() {
    const n = N * N;
    this.terr = new Uint8Array(n);
    this.field = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.zone = new Uint8Array(n);
    this.tree = new Uint8Array(n);
    this.bid = new Int32Array(n).fill(-1);
    this.buildings = new Map();
    this.nextId = 1;
    this.money = START_MONEY;
    this.day = 0;
    this.tax = { R: 0.09, C: 0.09, I: 0.09 };
    this.name = 'Harborlight';
    this.seed = 1;
    this.listeners = [];
    this.dirty = { net: true, cover: true };
    this.stats = { pop: 0, jobsC: 0, jobsI: 0, happy: 0.6, demand: { R: 0.6, C: 0.3, I: 0.4 }, income: 0, expense: 0, powerCap: 0, powerUse: 0 };
    this.history = [];
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const l of this.listeners) l(type, data); }
  idx(x, z) { return z * N + x; }
  in(x, z) { return x >= 0 && z >= 0 && x < N && z < N; }
  building(x, z) { const id = this.bid[this.idx(x, z)]; return id >= 0 ? this.buildings.get(id) : null; }

  // ---------------------------------------------------------------- terrain
  generate(seed) {
    this.seed = seed;
    const { fbm } = makeNoise(seed);
    this.noise = fbm;
    const r = mulberry32(seed * 7 + 3);
    this.river = { phase: r() * 6, x0: 0.3 + r() * 0.08, bayX: 0.62 + r() * 0.2, bayZ: 0.8 + r() * 0.1 };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, z), f = this.fieldAt(x + 0.5, z + 0.5);
      this.field[i] = f;
      this.terr[i] = f < 0 ? TERR.WATER : f < 0.06 ? TERR.SAND : TERR.GRASS;
    }
    // forests and a few scattered trees
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, z);
      if (this.terr[i] !== TERR.GRASS) continue;
      const f = fbm(x * 0.11 + 91, z * 0.11 - 40);
      const centre = Math.hypot(x - N * 0.62, z - N * 0.45) < 9;   // keep a clearing for the first town
      if (!centre && (f > 0.6 || hash01(x, z, seed) < 0.035)) this.tree[i] = 1 + Math.floor(hash01(z, x, 7) * 250);
    }
  }
  // continuous land field in tile space (>0 land). Also used by the terrain mesh outside the map.
  fieldAt(u, v) {
    const fbm = this.noise, R = this.river;
    const cx = (u / N - 0.5) * 2, cz = (v / N - 0.5) * 2;
    const d = Math.pow(Math.pow(Math.abs(cx), 3.2) + Math.pow(Math.abs(cz), 3.2), 1 / 3.2);
    let f = 1.02 - d * 1.12 + (fbm(u * 0.055, v * 0.055) - 0.5) * 0.85 + (fbm(u * 0.17 + 40, v * 0.17) - 0.5) * 0.16;
    // a river cuts the island from the north shore to the south shore
    const rx = N * R.x0 + Math.sin(v * 0.1 + R.phase) * 4.5 + (fbm(v * 0.04, 7.3) - 0.5) * 9;
    const w = 1.45 + 0.6 * smoothstep(N * 0.3, N, v);
    f -= Math.exp(-((u - rx) ** 2) / (2 * w * w)) * 0.95;
    // a sheltered bay on the south-east shore
    const bx = N * R.bayX, bz = N * R.bayZ;
    f -= Math.exp(-((u - bx) ** 2 + ((v - bz) * 1.3) ** 2) / 55) * 0.8;
    return f;
  }
  isWater(x, z) { return !this.in(x, z) || this.terr[this.idx(x, z)] === TERR.WATER; }
  nearWater(x, z, r = 1) { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if ((dx || dz) && this.isWater(x + dx, z + dz)) return true; return false; }
  isRoad(x, z) { return this.in(x, z) && this.kind[this.idx(x, z)] === KIND.ROAD; }
  isRail(x, z) { return this.in(x, z) && this.kind[this.idx(x, z)] === KIND.RAIL; }
  mask(x, z, test) { let m = 0; if (test(x, z - 1)) m |= 1; if (test(x + 1, z)) m |= 2; if (test(x, z + 1)) m |= 4; if (test(x - 1, z)) m |= 8; return m; }

  // ---------------------------------------------------------------- tool footprint helpers
  footprint(tool, rot) { const s = TOOLS[tool].size || [1, 1]; return rot % 2 ? [s[1], s[0]] : [s[0], s[1]]; }
  count(type) { let n = 0; for (const b of this.buildings.values()) if (b.type === type) n++; return n; }

  canPlace(tool, x, z, rot = 0) {
    const T = TOOLS[tool];
    const [w, h] = this.footprint(tool, rot);
    if (T.max && this.count(tool) >= T.max) return { ok: false, why: `Only ${T.max} allowed` };
    let coast = false, rail = false;
    for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) {
      const X = x + dx, Z = z + dz;
      if (!this.in(X, Z)) return { ok: false, why: 'Off the map' };
      const i = this.idx(X, Z);
      if (this.terr[i] === TERR.WATER) return { ok: false, why: 'Needs dry land' };
      if (this.kind[i] !== KIND.EMPTY) return { ok: false, why: 'Something is in the way' };
      if (this.nearWater(X, Z)) coast = true;
      for (const [ax, az] of NB4) if (this.isRail(X + ax, Z + az)) rail = true;
    }
    if (T.place === 'coast' && !coast) return { ok: false, why: 'Must touch the water' };
    if (T.place === 'rail' && !rail) return { ok: false, why: 'Must be next to a railway' };
    if (this.money < T.cost) return { ok: false, why: 'Not enough money' };
    return { ok: true, w, h };
  }

  spend(v) { if (this.money < v) return false; this.money -= v; return true; }

  // ---------------------------------------------------------------- edits
  placeBuilding(tool, x, z, rot = 0, free = false) {
    const c = this.canPlace(tool, x, z, rot);
    if (!c.ok && !(free && c.why === 'Not enough money')) return c;
    if (!free) this.money -= TOOLS[tool].cost;
    if (TOOLS[tool].place === 'coast') rot = this.faceWater(x, z, c.w, c.h, rot);
    const b = { id: this.nextId++, type: tool, x, z, w: c.w, h: c.h, rot, born: this.day, name: TOOLS[tool].name, powered: true, watered: true, fire: 0 };
    this.stamp(b);
    this.emit('building+', b);
    this.dirty.net = this.dirty.cover = true;
    return { ok: true, b };
  }
  // grown zone building (1x1)
  growBuilding(x, z, zoneKey, lvl) {
    const i = this.idx(x, z);
    if (this.tree[i]) { this.tree[i] = 0; this.emit('tile', { x, z }); }
    const b = { id: this.nextId++, type: zoneKey, x, z, w: 1, h: 1, rot: this.faceRoad(x, z), lvl, born: this.day, name: pickH(NAMES[zoneKey], x, z, lvl), powered: true, watered: true, fire: 0, occ: 0.3, bad: 0 };
    this.stamp(b);
    this.emit('building+', b);
    this.dirty.net = true;
    return b;
  }
  stamp(b) {
    for (let dz = 0; dz < b.h; dz++) for (let dx = 0; dx < b.w; dx++) {
      const i = this.idx(b.x + dx, b.z + dz);
      this.kind[i] = KIND.BUILDING; this.bid[i] = b.id;
      if (b.type.length > 1) this.zone[i] = ZONE.NONE;
      if (this.tree[i]) { this.tree[i] = 0; this.emit('tile', { x: b.x + dx, z: b.z + dz }); }
    }
    this.buildings.set(b.id, b);
  }
  removeBuilding(b, rubble = false) {
    for (let dz = 0; dz < b.h; dz++) for (let dx = 0; dx < b.w; dx++) {
      const i = this.idx(b.x + dx, b.z + dz);
      this.kind[i] = rubble ? KIND.RUBBLE : KIND.EMPTY; this.bid[i] = -1;
      if (rubble) this.emit('tile', { x: b.x + dx, z: b.z + dz });
    }
    this.buildings.delete(b.id);
    this.emit('building-', b);
    this.dirty.net = this.dirty.cover = true;
  }
  // coastal buildings turn their front (+z side) towards the sea
  faceWater(x, z, w, h, rot) {
    const cx = x + w / 2, cz = z + h / 2; let best = rot, bs = -1;
    [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]].forEach(([dx, dz, r]) => { if ((r % 2) !== (rot % 2) && w !== h) return; let s = 0; for (let k = 1; k <= 3; k++) for (let o = -1; o <= 1; o++) { const X = Math.floor(cx + dx * (w / 2 + k - 0.5) + (dz ? o : 0)), Z = Math.floor(cz + dz * (h / 2 + k - 0.5) + (dx ? o : 0)); if (this.isWater(X, Z)) s++; } if (s > bs) { bs = s; best = r; } });
    return best;
  }
  // rotation (0..3) so the front faces the nearest road
  faceRoad(x, z) {
    const dirs = [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]];
    for (const [dx, dz, r] of dirs) if (this.isRoad(x + dx, z + dz)) return r;
    for (const [dx, dz, r] of dirs) if (this.isRoad(x + dx * 2, z + dz * 2)) return r;
    return Math.floor(hash01(x, z) * 4);
  }

  setRoad(x, z, kind = KIND.ROAD) {
    if (!this.in(x, z)) return false;
    const i = this.idx(x, z);
    if (this.kind[i] === kind) return false;
    if (this.kind[i] !== KIND.EMPTY && this.kind[i] !== KIND.RUBBLE) return false;
    const water = this.terr[i] === TERR.WATER;
    if (water && kind === KIND.RAIL) return false;
    const cost = (kind === KIND.ROAD ? TOOLS.road.cost : TOOLS.rail.cost) * (water ? 4 : 1);
    if (!this.spend(cost)) return false;
    this.kind[i] = kind; this.zone[i] = ZONE.NONE; this.tree[i] = 0;
    this.emit('tile', { x, z, neighbours: true });
    this.dirty.net = this.dirty.cover = true;
    return true;
  }
  setZone(x, z, zone) {
    if (!this.in(x, z)) return false;
    const i = this.idx(x, z);
    if (this.terr[i] === TERR.WATER || this.kind[i] === KIND.ROAD || this.kind[i] === KIND.RAIL) return false;
    if (this.kind[i] === KIND.BUILDING) { const b = this.building(x, z); if (!b || b.type.length > 1) return false; if (zone === 0) return false; }
    if (this.zone[i] === zone) return false;
    if (zone && !this.spend(TOOLS.zoneR.cost)) return false;
    // re-zoning a grown building knocks it down
    if (this.kind[i] === KIND.BUILDING) this.removeBuilding(this.building(x, z));
    this.zone[i] = zone;
    this.emit('tile', { x, z });
    return true;
  }
  plantTree(x, z) {
    if (!this.in(x, z)) return false;
    const i = this.idx(x, z);
    if (this.terr[i] === TERR.WATER || this.kind[i] !== KIND.EMPTY || this.tree[i]) return false;
    if (!this.spend(TOOLS.tree.cost)) return false;
    this.tree[i] = 1 + Math.floor(Math.random() * 250);
    this.emit('tile', { x, z });
    this.dirty.cover = true;
    return true;
  }
  bulldoze(x, z) {
    if (!this.in(x, z)) return false;
    const i = this.idx(x, z), k = this.kind[i];
    if (k === KIND.BUILDING) {
      const b = this.building(x, z);
      if (!this.spend(TOOLS.bulldoze.cost * b.w * b.h)) return false;
      this.removeBuilding(b);
      return true;
    }
    if (k === KIND.ROAD || k === KIND.RAIL || k === KIND.RUBBLE) {
      if (!this.spend(TOOLS.bulldoze.cost)) return false;
      this.kind[i] = KIND.EMPTY;
      this.emit('tile', { x, z, neighbours: true });
      this.dirty.net = this.dirty.cover = true;
      return true;
    }
    if (this.tree[i]) { if (!this.spend(TOOLS.bulldoze.cost)) return false; this.tree[i] = 0; this.emit('tile', { x, z }); return true; }
    if (this.zone[i]) { this.zone[i] = 0; this.emit('tile', { x, z }); return true; }
    return false;
  }

  // ---------------------------------------------------------------- save / load
  serialize() {
    const enc = a => btoa(String.fromCharCode(...new Uint8Array(a.buffer)));
    return {
      v: 1, name: this.name, seed: this.seed, money: this.money, day: this.day, tax: this.tax, nextId: this.nextId,
      kind: enc(this.kind), zone: enc(this.zone), tree: enc(this.tree), history: this.history.slice(-48),
      buildings: [...this.buildings.values()].map(b => ({ ...b })),
    };
  }
  static load(data) {
    const w = new World();
    w.generate(data.seed);
    const dec = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
    w.name = data.name; w.money = data.money; w.day = data.day; w.tax = data.tax; w.nextId = data.nextId; w.history = data.history || [];
    w.kind = dec(data.kind, Uint8Array); w.zone = dec(data.zone, Uint8Array); w.tree = dec(data.tree, Uint8Array);
    for (const b of data.buildings) { w.buildings.set(b.id, b); for (let dz = 0; dz < b.h; dz++) for (let dx = 0; dx < b.w; dx++) w.bid[w.idx(b.x + dx, b.z + dz)] = b.id; }
    return w;
  }
}
export { NB4 };
