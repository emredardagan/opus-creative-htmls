// Everything that moves: traffic, pedestrians, trains, boats, planes, a helicopter, gulls and clouds.
import * as THREE from 'three';
import { N, K, PP, TOOLS } from './config.js';
import { pool, placeMatrix, fitScale, info, registerMesh } from './models.js';
import { clamp, lerp, damp, hash01 } from './util.js';

const tw = (x, z) => new THREE.Vector3(x - N / 2, 0, z - N / 2);
const CARS = ['sedan', 'sedan', 'taxi', 'suv', 'hatchback-sports', 'van', 'delivery', 'sedan-sports', 'suv-luxury', 'truck', 'police', 'garbage-truck'].map(n => K(`car-kit/${n}`));
const PEEP_COLS = [0xe8554e, 0x3d7fd8, 0xf2c14e, 0x3ccf7a, 0x9b6ad8, 0xf28ac0, 0x2b2d42, 0xffffff, 0xff9a3d, 0x5fc8d8];
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const right = d => [-d[1], d[0]];
const _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _S = new THREE.Vector3(), _P = new THREE.Vector3();

// a point and heading along a tile: enter moving along din, leave along dout, keeping lane offset L
function laneCurve(cx, cz, din, dout, L, t) {
  const ri = right(din), ro = right(dout);
  const p0 = [cx - din[0] * 0.5 + ri[0] * L, cz - din[1] * 0.5 + ri[1] * L];
  const p2 = [cx + dout[0] * 0.5 + ro[0] * L, cz + dout[1] * 0.5 + ro[1] * L];
  let p1;
  if (din[0] === dout[0] && din[1] === dout[1]) p1 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
  else if (din[0] === -dout[0] && din[1] === -dout[1]) p1 = [cx + din[0] * 0.35, cz + din[1] * 0.35];
  else p1 = [cx + ri[0] * L + ro[0] * L, cz + ri[1] * L + ro[1] * L];
  const u = 1 - t;
  const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], z = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
  const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dz = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  return { x, z, yaw: Math.atan2(dx, dz), turn: !(din[0] === dout[0] && din[1] === dout[1]) };
}
function nextDir(w, test, x, z, din, prefer) {
  const opts = DIRS.filter(d => test(x + d[0], z + d[1]) && !(d[0] === -din[0] && d[1] === -din[1]));
  if (!opts.length) return [-din[0], -din[1]];
  if (prefer) { const s = opts.find(d => d[0] === din[0] && d[1] === din[1]); if (s && Math.random() < prefer) return s; }
  return opts[Math.floor(Math.random() * opts.length)];
}

export class Agents {
  constructor(stage, world, sim, fx) {
    this.stage = stage; this.w = world; this.sim = sim; this.fx = fx; this.scene = stage.scene;
    this.cars = []; this.peeps = []; this.trains = []; this.boats = []; this.ships = []; this.planes = []; this.gulls = []; this.clouds = [];
    registerMesh('tail', new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a })));
    registerMesh('head', new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2d0 })));
    this.heliT = 0; this.flyT = 8; this.airT = 5;
    this.initClouds(); this.initGulls(); this.initShips();
  }
  roadTiles() { const w = this.w, out = []; for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (w.isRoad(x, z)) out.push([x, z]); return out; }

  // ---------------------------------------------------------------- cars
  spawnCar(tiles) {
    const w = this.w, [x, z] = tiles[Math.floor(Math.random() * tiles.length)];
    const opts = DIRS.filter(d => w.isRoad(x + d[0], z + d[1])); if (!opts.length) return;
    const din = opts[Math.floor(Math.random() * opts.length)];
    const path = CARS[Math.floor(Math.random() * CARS.length)];
    const p = pool(this.scene, path), s = fitScale(path, 0.4);
    const car = { x, z, din, dout: nextDir(w, (a, b) => w.isRoad(a, b), x, z, din, 0.6), t: Math.random(), speed: 0, max: 0.9 + Math.random() * 0.5, pool: p, path, s, id: p.add(new THREE.Matrix4()), life: 40 + Math.random() * 80, lights: [] };
    const hp = pool(this.scene, 'head', { shadow: false }), tp = pool(this.scene, 'tail', { shadow: false }), gp = pool(this.scene, 'pool', { shadow: false, receive: false });
    car.lights = [[hp, hp.add(new THREE.Matrix4())], [hp, hp.add(new THREE.Matrix4())], [tp, tp.add(new THREE.Matrix4())], [gp, gp.add(new THREE.Matrix4())]];
    this.cars.push(car);
  }
  removeCar(c) { c.pool.remove(c.id); for (const [p, id] of c.lights) p.remove(id); }
  updateCars(dt, night) {
    const w = this.w, test = (a, b) => w.isRoad(a, b);
    const roads = this._roads || (this._roads = this.roadTiles());
    const target = Math.min(170, Math.floor(roads.length * 0.35 + w.stats.pop / 14));
    if (this.cars.length < target && roads.length > 1 && Math.random() < 0.5) this.spawnCar(roads);
    // occupancy for simple queueing
    const occ = new Map();
    for (const c of this.cars) { const k = c.x + c.z * N; if (!occ.has(k)) occ.set(k, []); occ.get(k).push(c); }
    const M = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      c.life -= dt;
      if (!w.isRoad(c.x, c.z) || (c.life < 0 && this.cars.length > target * 0.8) || this.cars.length > target + 10) { this.removeCar(c); this.cars.splice(i, 1); continue; }
      const cx = c.x - N / 2 + 0.5, cz = c.z - N / 2 + 0.5;
      const here = laneCurve(cx, cz, c.din, c.dout, 0.17, c.t);
      // brake for the car in front
      let block = false;
      const nk = (c.x + c.dout[0]) + (c.z + c.dout[1]) * N;
      for (const k of [c.x + c.z * N, nk]) for (const o of occ.get(k) || []) {
        if (o === c) continue;
        const oh = laneCurve(o.x - N / 2 + 0.5, o.z - N / 2 + 0.5, o.din, o.dout, 0.17, o.t);
        const dx = oh.x - here.x, dz = oh.z - here.z, d = Math.hypot(dx, dz);
        const fx = Math.sin(here.yaw), fz = Math.cos(here.yaw);
        if (d < 0.42 && (dx * fx + dz * fz) > 0.05 && Math.cos(oh.yaw - here.yaw) > 0.3) block = true;
      }
      c.speed = damp(c.speed, block ? 0 : c.max * (here.turn ? 0.6 : 1), block ? 14 : 3, dt);
      c.t += c.speed * dt;
      if (c.t >= 1) {
        c.t -= 1; c.x += c.dout[0]; c.z += c.dout[1]; c.din = c.dout;
        if (!w.isRoad(c.x, c.z)) { this.removeCar(c); this.cars.splice(i, 1); continue; }
        c.dout = nextDir(w, test, c.x, c.z, c.din, 0.55);
      }
      const p = laneCurve(c.x - N / 2 + 0.5, c.z - N / 2 + 0.5, c.din, c.dout, 0.17, Math.min(1, c.t));
      const y = w.terr[w.idx(c.x, c.z)] === 0 ? 0.03 : 0.012;
      c.pool.set(c.id, placeMatrix(c.path, p.x, y, p.z, p.yaw, c.s));
      // lights after dusk
      if (night > 0.25) {
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = fz, rz = -fx, L = info.get(c.path).size.z * c.s * 0.5;
        const put = (k, ox, oz, sy, s) => c.lights[k][0].set(c.lights[k][1], M.compose(_P.set(p.x + fx * ox + rx * oz, y + sy, p.z + fz * ox + rz * oz), _Q.identity(), _S.set(s, s, s)));
        put(0, L, 0.07, 0.06, 0.035); put(1, L, -0.07, 0.06, 0.035); put(2, -L, 0, 0.07, 0.03);
        c.lights[3][0].set(c.lights[3][1], M.compose(_P.set(p.x + fx * (L + 0.28), 0.03, p.z + fz * (L + 0.28)), _Q.setFromEuler(_E.set(0, p.yaw, 0)), _S.set(0.35, 1, 0.6)));
      } else for (const [pl, id] of c.lights) pl.set(id, zero);
    }
    const hp = pool(this.scene, 'head', { shadow: false }); hp.parts[0].mat.color.setRGB(1, 0.95, 0.8).multiplyScalar(2.5);
    const tp = pool(this.scene, 'tail', { shadow: false }); tp.parts[0].mat.color.setRGB(1, 0.1, 0.08).multiplyScalar(2.2);
  }

  // ---------------------------------------------------------------- pedestrians
  updatePeeps(dt, t) {
    const w = this.w, roads = this._roads || [];
    const target = Math.min(260, Math.floor(w.stats.pop / 4));
    const p = pool(this.scene, 'peep');
    while (this.peeps.length < target && roads.length) {
      const [x, z] = roads[Math.floor(Math.random() * roads.length)];
      const opts = DIRS.filter(d => w.isRoad(x + d[0], z + d[1])); if (!opts.length) break;
      const din = opts[Math.floor(Math.random() * opts.length)];
      this.peeps.push({ x, z, din, dout: nextDir(w, (a, b) => w.isRoad(a, b), x, z, din, 0.5), t: Math.random(), side: Math.random() < 0.5 ? 0.43 : -0.43, sp: 0.18 + Math.random() * 0.12, id: p.add(new THREE.Matrix4(), PEEP_COLS[Math.floor(Math.random() * PEEP_COLS.length)]), ph: Math.random() * 6 });
    }
    while (this.peeps.length > target + 5) { const q = this.peeps.pop(); p.remove(q.id); }
    const M = new THREE.Matrix4();
    for (let i = this.peeps.length - 1; i >= 0; i--) {
      const q = this.peeps[i];
      if (!w.isRoad(q.x, q.z)) { p.remove(q.id); this.peeps.splice(i, 1); continue; }
      q.t += q.sp * dt;
      if (q.t >= 1) { q.t -= 1; q.x += q.dout[0]; q.z += q.dout[1]; q.din = q.dout; if (!w.isRoad(q.x, q.z)) { p.remove(q.id); this.peeps.splice(i, 1); continue; } q.dout = nextDir(w, (a, b) => w.isRoad(a, b), q.x, q.z, q.din, 0.4); }
      const c = laneCurve(q.x - N / 2 + 0.5, q.z - N / 2 + 0.5, q.din, q.dout, q.side, Math.min(1, q.t));
      const bob = Math.abs(Math.sin(t * 9 + q.ph)) * 0.015;
      p.set(q.id, M.compose(_P.set(c.x, 0.02 + bob, c.z), _Q.setFromEuler(_E.set(0, c.yaw, Math.sin(t * 9 + q.ph) * 0.08)), _S.set(1, 1, 1)));
    }
  }

  // ---------------------------------------------------------------- trains
  updateTrains(dt) {
    const w = this.w;
    const stations = [...w.buildings.values()].filter(b => b.type === 'station');
    const want = Math.min(4, stations.length);
    while (this.trains.length < want) { if (!this.spawnTrain(stations[this.trains.length])) break; }
    while (this.trains.length > want) this.removeTrain(this.trains.pop());
    const test = (a, b) => w.isRail(a, b);
    for (let k = this.trains.length - 1; k >= 0; k--) {
      const tr = this.trains[k];
      if (!w.isRail(tr.x, tr.z)) { this.removeTrain(tr); this.trains.splice(k, 1); continue; }
      if (tr.wait > 0) { tr.wait -= dt; tr.speed = 0; }
      else tr.speed = damp(tr.speed, 1.5, 1.2, dt);
      tr.t += tr.speed * dt;
      while (tr.t >= 1) {
        tr.t -= 1; tr.x += tr.dout[0]; tr.z += tr.dout[1]; tr.din = tr.dout;
        if (!w.isRail(tr.x, tr.z)) { tr.x -= tr.din[0]; tr.z -= tr.din[1]; tr.dout = [-tr.din[0], -tr.din[1]]; tr.din = tr.dout; this.reverse(tr); break; }
        const opts = DIRS.filter(d => test(tr.x + d[0], tr.z + d[1]) && !(d[0] === -tr.din[0] && d[1] === -tr.din[1]));
        if (!opts.length) { tr.dout = [-tr.din[0], -tr.din[1]]; tr.wait = 1.5; }
        else tr.dout = opts.find(d => d[0] === tr.din[0] && d[1] === tr.din[1]) && Math.random() < 0.7 ? tr.din : opts[Math.floor(Math.random() * opts.length)];
        // stop at stations
        if (tr.stopCool <= 0) for (const [dx, dz] of DIRS) { const b = w.building(tr.x + dx, tr.z + dz); if (b?.type === 'station') { tr.wait = 3; tr.stopCool = 6; break; } }
      }
      tr.stopCool -= dt;
      const lane = tr.dout[0] === -tr.din[0] && tr.dout[1] === -tr.din[1] ? 0.001 : 0;
      const h = laneCurve(tr.x - N / 2 + 0.5, tr.z - N / 2 + 0.5, tr.din, tr.dout, lane, Math.min(1, tr.t));
      const last = tr.hist[tr.hist.length - 1];
      if (!last || Math.hypot(h.x - last[0], h.z - last[1]) > 0.03) tr.hist.push([h.x, h.z]);
      if (tr.hist.length > 400) tr.hist.splice(0, 100);
      // place each car at its distance behind the head along the recorded path
      let need = 0, j = tr.hist.length - 1, acc = 0;
      for (let ci = 0; ci < tr.cars.length; ci++) {
        const car = tr.cars[ci];
        need = ci * 0.82;
        while (j > 0 && acc + Math.hypot(tr.hist[j][0] - tr.hist[j - 1][0], tr.hist[j][1] - tr.hist[j - 1][1]) < need) { acc += Math.hypot(tr.hist[j][0] - tr.hist[j - 1][0], tr.hist[j][1] - tr.hist[j - 1][1]); j--; }
        const a = tr.hist[Math.max(0, j - 1)], b = tr.hist[j];
        const px = ci === 0 ? h.x : b[0], pz = ci === 0 ? h.z : b[1];
        const yaw = ci === 0 ? h.yaw : Math.atan2(b[0] - a[0], b[1] - a[1]);
        car.pool.set(car.id, placeMatrix(car.path, px, 0.05, pz, yaw, car.s));
      }
    }
  }
  spawnTrain(st) {
    const w = this.w; let start = null;
    for (let dz = -1; dz <= st.h && !start; dz++) for (let dx = -1; dx <= st.w && !start; dx++) if (w.isRail(st.x + dx, st.z + dz)) start = [st.x + dx, st.z + dz];
    if (!start) return false;
    const opts = DIRS.filter(d => w.isRail(start[0] + d[0], start[1] + d[1]));
    const din = opts[0] || [1, 0];
    const sets = [['train-electric-city-a', 'train-electric-city-b', 'train-electric-city-c'], ['train-locomotive-passenger-a', 'train-carriage-box', 'train-carriage-container-red', 'train-carriage-tank'], ['train-electric-bullet-a', 'train-electric-bullet-b', 'train-electric-bullet-c'], ['train-diesel-a', 'train-carriage-lumber', 'train-carriage-coal', 'train-carriage-container-blue']];
    const set = sets[this.trains.length % sets.length];
    const cars = set.map((n, i) => { const path = K(`train-kit/${n}`); const p = pool(this.scene, path); return { path, pool: p, s: fitScale(path, 0.78) * 0.62, id: p.add(new THREE.Matrix4()) }; });
    this.trains.push({ x: start[0], z: start[1], din, dout: din, t: 0, speed: 0, wait: 2, stopCool: 0, hist: [], cars });
    return true;
  }
  reverse(tr) { tr.cars.reverse(); tr.hist = []; tr.wait = 1.2; }
  removeTrain(tr) { for (const c of tr.cars) c.pool.remove(c.id); }

  // ---------------------------------------------------------------- sea
  seaDepth(x, z) { return this.stage.terrain.heightAt(x + N / 2, z + N / 2); }
  initShips() {
    const kinds = ['ship-cargo-a', 'ship-cargo-b', 'ship-ocean-liner', 'ship-large', 'boat-tug-a'];
    for (let i = 0; i < 5; i++) {
      const path = K(`watercraft-kit/${kinds[i]}`), p = pool(this.scene, path);
      const r = 58 + i * 7, a = Math.random() * 6.28;
      this.ships.push({ path, pool: p, s: fitScale(path, i === 4 ? 0.8 : 2.4), id: p.add(new THREE.Matrix4()), a, r, sp: (0.006 + Math.random() * 0.006) * (i % 2 ? 1 : -1), ph: Math.random() * 6 });
    }
  }
  updateSea(dt, t) {
    const w = this.w;
    const marinas = [...w.buildings.values()].filter(b => b.type === 'marina').length;
    const want = 6 + marinas * 5;
    const kinds = ['boat-sail-a', 'boat-sail-b', 'boat-speed-a', 'boat-fishing-small', 'boat-row-small', 'boat-speed-c'].map(n => K(`watercraft-kit/${n}`)).concat([PP('sail-boat')]);
    while (this.boats.length < want) {
      const path = kinds[this.boats.length % kinds.length], p = pool(this.scene, path);
      const pos = this.randomSea(); if (!pos) break;
      this.boats.push({ path, pool: p, s: fitScale(path, path.includes('sail') ? 0.45 : 0.38), id: p.add(new THREE.Matrix4()), pos, yaw: Math.random() * 6, target: this.randomSea(), sp: 0.35 + Math.random() * 0.4, ph: Math.random() * 6 });
    }
    for (const b of this.boats) {
      const to = b.target; const dx = to.x - b.pos.x, dz = to.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d < 1) b.target = this.randomSea() || b.target;
      let want = Math.atan2(dx, dz);
      // feel ahead for land
      const ax = b.pos.x + Math.sin(b.yaw) * 1.4, az = b.pos.z + Math.cos(b.yaw) * 1.4;
      if (this.seaDepth(ax, az) > -0.35) { want = b.yaw + 1.2; if (Math.random() < 0.05) b.target = this.randomSea() || b.target; }
      let dy = want - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += clamp(dy, -1, 1) * dt * 0.8;
      b.pos.x += Math.sin(b.yaw) * b.sp * dt; b.pos.z += Math.cos(b.yaw) * b.sp * dt;
      const m = placeMatrix(b.path, b.pos.x, -0.16 + Math.sin(t * 1.6 + b.ph) * 0.02, b.pos.z, b.yaw, b.s);
      m.multiply(new THREE.Matrix4().makeRotationZ(Math.sin(t * 1.3 + b.ph) * 0.05));
      b.pool.set(b.id, m);
      if (Math.random() < dt * 6) this.fx.wake(new THREE.Vector3(b.pos.x - Math.sin(b.yaw) * 0.25, -0.1, b.pos.z - Math.cos(b.yaw) * 0.25), new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw)));
    }
    for (const s of this.ships) {
      s.a += s.sp * dt;
      const x = Math.cos(s.a) * s.r, z = Math.sin(s.a) * s.r * 0.85, yaw = Math.atan2(-Math.sin(s.a) * Math.sign(s.sp), Math.cos(s.a) * 0.85 * Math.sign(s.sp));
      s.pool.set(s.id, placeMatrix(s.path, x, -0.2 + Math.sin(t + s.ph) * 0.03, z, yaw, s.s));
      if (Math.random() < dt * 5) this.fx.wake(new THREE.Vector3(x, -0.1, z), new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)));
    }
  }
  randomSea() {
    for (let k = 0; k < 40; k++) {
      const x = (Math.random() - 0.5) * (N + 30), z = (Math.random() - 0.5) * (N + 30);
      if (this.seaDepth(x, z) < -0.55) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  // ---------------------------------------------------------------- sky: jets, airport traffic, helicopter
  jet() { const p = pool(this.scene, 'jet'); return { pool: p, id: p.add(new THREE.Matrix4(), [0xffffff, 0xfff0e8, 0xe8f4ff][Math.floor(Math.random() * 3)]) }; }
  updateSky(dt, t) {
    this.flyT -= dt;
    if (this.flyT <= 0) {
      this.flyT = 20 + Math.random() * 25;
      const a = Math.random() * 6.28, j = this.jet();
      this.planes.push({ ...j, mode: 'fly', p: new THREE.Vector3(Math.cos(a) * 90, 16 + Math.random() * 4, Math.sin(a) * 90), v: new THREE.Vector3(-Math.cos(a + 0.3), 0, -Math.sin(a + 0.3)).multiplyScalar(7), life: 30 });
    }
    // airport: landings and take-offs along the runway
    const ap = [...this.w.buildings.values()].find(b => b.type === 'airport');
    if (ap) {
      this.airT -= dt;
      if (this.airT <= 0) {
        this.airT = 16 + Math.random() * 10;
        const c = tw(ap.x + ap.w / 2, ap.z + ap.h / 2), yaw = ap.rot * Math.PI / 2;
        const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw), side = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const rw = c.clone().addScaledVector(side, 0.72);
        const j = this.jet();
        this.planes.push({ ...j, mode: Math.random() < 0.5 ? 'land' : 'takeoff', t: 0, rw, along, life: 40 });
      }
    }
    const M = new THREE.Matrix4();
    for (let i = this.planes.length - 1; i >= 0; i--) {
      const pl = this.planes[i]; pl.life -= dt;
      let pos, yaw, pitch = 0, roll = 0;
      if (pl.mode === 'fly') {
        pl.p.addScaledVector(pl.v, dt); pos = pl.p; yaw = Math.atan2(pl.v.x, pl.v.z);
        if (Math.random() < dt * 25) this.fx.contrail(pos.clone().addScaledVector(pl.v, -0.12));
      } else {
        pl.t += dt;
        // landing: glide in from far along the runway axis, flare, roll out. Take-off is the reverse, then climb away.
        const T = pl.t;
        let s, h;
        if (pl.mode === 'land') { s = T < 9 ? lerp(-40, -3, T / 9) : lerp(-3, 2.6, 1 - Math.pow(1 - clamp((T - 9) / 4, 0, 1), 2)); h = T < 9 ? lerp(9, 0.25, Math.pow(T / 9, 1.1)) : 0.02; pitch = T < 9 ? -0.08 : 0; }
        else { const k = clamp(T / 4, 0, 1); s = lerp(-3, 2, k * k) + (T > 4 ? (T - 4) * 6 : 0); h = T > 3.2 ? Math.pow(T - 3.2, 1.6) * 0.9 : 0.02; pitch = T > 3.2 ? 0.18 : 0; }
        pos = pl.rw.clone().addScaledVector(pl.along, s).setY(h);
        yaw = Math.atan2(pl.along.x, pl.along.z);
        if (pl.mode === 'land' && T > 15) pl.life = 0;
      }
      pl.pool.set(pl.id, M.compose(pos, _Q.setFromEuler(_E.set(-pitch, yaw, roll, 'YXZ')), _S.set(1.1, 1.1, 1.1)));
      if (pl.life <= 0 || pos.length() > 140) { pl.pool.remove(pl.id); this.planes.splice(i, 1); }
    }
    // helicopter over the city once there is a police station or hospital
    const has = [...this.w.buildings.values()].some(b => b.type === 'police' || b.type === 'hospital');
    const hb = PP('helicopter');
    if (has && !this.heli) {
      const body = pool(this.scene, hb, { skip: ['Cube_4'] }), rotor = pool(this.scene, hb, { only: ['Cube_4'] });
      this.heli = { body, rotor, bid: body.add(new THREE.Matrix4()), rid: rotor.add(new THREE.Matrix4()), c: new THREE.Vector3(), a: 0 };
    }
    if (this.heli) {
      const h = this.heli; h.a += dt * 0.25;
      if (Math.random() < dt * 0.05) h.c.set((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
      const px = h.c.x + Math.cos(h.a) * 7, pz = h.c.z + Math.sin(h.a) * 7, yaw = Math.atan2(-Math.sin(h.a), Math.cos(h.a)) + Math.PI;
      h.pos = h.pos || new THREE.Vector3(px, 5, pz); h.pos.x = damp(h.pos.x, px, 0.6, dt); h.pos.z = damp(h.pos.z, pz, 0.6, dt); h.pos.y = 5 + Math.sin(t * 0.7) * 0.3;
      const s = fitScale(hb, 0.9);
      h.body.set(h.bid, placeMatrix(hb, h.pos.x, h.pos.y, h.pos.z, yaw, s));
      const rm = placeMatrix(hb, h.pos.x, h.pos.y, h.pos.z, yaw, s);
      const hub = new THREE.Vector3(h.pos.x, h.pos.y + 1.3 * s, h.pos.z);
      rm.premultiply(new THREE.Matrix4().makeTranslation(-hub.x, -hub.y, -hub.z)).premultiply(new THREE.Matrix4().makeRotationY(t * 18)).premultiply(new THREE.Matrix4().makeTranslation(hub.x, hub.y, hub.z));
      h.rotor.set(h.rid, rm);
    }
  }

  // ---------------------------------------------------------------- gulls and clouds
  initGulls() {
    const p = pool(this.scene, 'gull', { shadow: true });
    for (let i = 0; i < 14; i++) this.gulls.push({ id: p.add(new THREE.Matrix4()), c: new THREE.Vector3((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60), r: 3 + Math.random() * 5, a: Math.random() * 6, h: 3 + Math.random() * 3, sp: (0.3 + Math.random() * 0.3) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 6 });
    this.gullPool = p;
  }
  initClouds() {
    const p = pool(this.scene, 'cloud', { shadow: true, receive: false });
    for (let i = 0; i < 12; i++) this.clouds.push({ id: p.add(new THREE.Matrix4()), p: new THREE.Vector3((Math.random() - 0.5) * 120, 14 + Math.random() * 5, (Math.random() - 0.5) * 120), s: 2.2 + Math.random() * 2.4, yaw: Math.random() * 6 });
    this.cloudPool = p;
  }
  updateAmbient(dt, t) {
    const M = new THREE.Matrix4();
    for (const g of this.gulls) {
      g.a += g.sp * dt;
      const x = g.c.x + Math.cos(g.a) * g.r, z = g.c.z + Math.sin(g.a) * g.r, yaw = Math.atan2(-Math.sin(g.a), Math.cos(g.a)) * Math.sign(g.sp) + (g.sp < 0 ? Math.PI : 0);
      const flap = 0.6 + Math.abs(Math.sin(t * 7 + g.ph)) * 0.8;
      this.gullPool.set(g.id, M.compose(_P.set(x, g.h + Math.sin(t + g.ph) * 0.3, z), _Q.setFromEuler(_E.set(0, yaw, g.sp * 0.4)), _S.set(0.8, flap * 0.8, 0.8)));
    }
    const tgt = this.stage.view.target, wind = this.fx.wind;
    for (const c of this.clouds) {
      c.p.x += wind.x * dt * 1.4; c.p.z += wind.z * dt * 1.4;
      if (c.p.x - tgt.x > 70) c.p.x -= 140; if (c.p.x - tgt.x < -70) c.p.x += 140;
      if (c.p.z - tgt.z > 70) c.p.z -= 140; if (c.p.z - tgt.z < -70) c.p.z += 140;
      this.cloudPool.set(c.id, M.compose(c.p, _Q.setFromEuler(_E.set(0, c.yaw, 0)), _S.set(c.s, c.s * 0.8, c.s)));
    }
  }
  update(dt, t, night) {
    if (this.w._roadsDirty !== false) { this._roads = this.roadTiles(); this.w._roadsDirty = false; }
    this.updateCars(dt, night); this.updatePeeps(dt, t); this.updateTrains(dt); this.updateSea(dt, t); this.updateSky(dt, t); this.updateAmbient(dt, t);
  }
}
