// City simulation: growth, networks, coverage, economy, fires, milestones.
import { N, KIND, ZONE, ZONE_KEY, TOOLS, CAP, POWER_USE, MILESTONES, TERR, NAMES } from './config.js';
import { clamp, hash01, pickH } from './util.js';
import { NB4 } from './world.js';

const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Sim {
  constructor(world) {
    this.w = world;
    const n = N * N;
    this.roadDist = new Uint8Array(n);
    this.power = new Uint8Array(n);      // 1 = powered tile
    this.water = new Uint8Array(n);
    this.cover = { police: new Float32Array(n), fire: new Float32Array(n), health: new Float32Array(n), edu: new Float32Array(n) };
    this.land = new Float32Array(n);
    this.pollution = new Float32Array(n);
    this.crime = new Float32Array(n);
    this.dayAcc = 0;
    this.news = () => {};
    this.milestone = MILESTONES.findLastIndex(m => world.stats.pop >= m[0]);
    this.noPowerWarned = 0;
  }

  // ---------------------------------------------------------------- networks
  rebuildNetworks() {
    const w = this.w, n = N * N;
    // distance (in tiles) to the nearest road, capped at 3
    const rd = this.roadDist; rd.fill(9);
    const q = [];
    for (let i = 0; i < n; i++) if (w.kind[i] === KIND.ROAD) { rd[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % N, z = (i / N) | 0; if (rd[i] >= 3) continue;
      for (const [dx, dz] of NB4) { const X = x + dx, Z = z + dz; if (!w.in(X, Z)) continue; const j = w.idx(X, Z); if (rd[j] > rd[i] + 1) { rd[j] = rd[i] + 1; q.push(j); } }
    }
    // power: roads, rails and buildings conduct; each connected piece shares its plants
    const comp = new Int32Array(n).fill(-1), comps = [];
    const conducts = i => { const k = w.kind[i]; return k === KIND.ROAD || k === KIND.RAIL || k === KIND.BUILDING; };
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0 || !conducts(s)) continue;
      const c = { cap: 0, use: 0, bs: new Set() }, id = comps.length; comps.push(c);
      const st = [s]; comp[s] = id;
      while (st.length) {
        const i = st.pop(), x = i % N, z = (i / N) | 0;
        const b = w.bid[i] >= 0 ? w.buildings.get(w.bid[i]) : null; if (b) c.bs.add(b);
        for (const [dx, dz] of NB8) { const X = x + dx, Z = z + dz; if (!w.in(X, Z)) continue; const j = w.idx(X, Z); if (comp[j] < 0 && conducts(j)) { comp[j] = id; st.push(j); } }
      }
      for (const b of c.bs) { const f = TOOLS[b.type]?.fx; if (f?.power) c.cap += f.power; else c.use += b.lvl ? POWER_USE[b.type][b.lvl - 1] : 2; }
    }
    let cap = 0, use = 0;
    this.power.fill(0);
    for (const c of comps) {
      cap += c.cap; use += c.use;
      const ratio = c.use ? c.cap / c.use : 1;
      for (const b of c.bs) b.powered = c.cap > 0 && hash01(b.id, 3) < ratio;
    }
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0) { const b = w.bid[i] >= 0 ? w.buildings.get(w.bid[i]) : null; this.power[i] = b ? (b.powered ? 1 : 0) : comps[comp[i]].cap > 0 ? 1 : 0; }
    }
    // empty zoned tiles are "powered" if they touch a powered network
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0 || !w.zone[i]) continue;
      const x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of NB4) { const X = x + dx, Z = z + dz; if (w.in(X, Z) && this.power[w.idx(X, Z)]) { this.power[i] = 1; break; } }
    }
    this.compOf = comp;
    w.stats.powerCap = cap; w.stats.powerUse = use;
    w.dirty.net = false;
  }

  // ---------------------------------------------------------------- coverage maps
  rebuildCoverage() {
    const w = this.w, n = N * N;
    for (const k in this.cover) this.cover[k].fill(0);
    this.water.fill(0);
    const land = this.land; land.fill(0);
    const pol = this.pollution; pol.fill(0);
    const stampR = (arr, cx, cz, r, amt, mode = 'max') => {
      const R = Math.ceil(r);
      for (let z = Math.max(0, Math.floor(cz - R)); z <= Math.min(N - 1, Math.ceil(cz + R)); z++)
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(N - 1, Math.ceil(cx + R)); x++) {
          const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (d > r) continue;
          const v = amt * (1 - (d / r) ** 2 * 0.6), i = w.idx(x, z);
          if (mode === 'max') arr[i] = Math.max(arr[i], v); else arr[i] += v;
        }
    };
    for (const b of w.buildings.values()) {
      const cx = b.x + b.w / 2, cz = b.z + b.h / 2;
      const f = TOOLS[b.type]?.fx;
      if (f) {
        const on = b.powered || f.power || f.land;
        for (const k of ['police', 'fire', 'health', 'edu']) if (f[k] && on) stampR(this.cover[k], cx, cz, f[k], 1);
        if (f.water && b.powered) stampR(this.water, cx, cz, f.water, 1);
        if (f.land) stampR(land, cx, cz, f.landR, f.land, 'add');
        if (f.pollution) stampR(pol, cx, cz, f.polR, f.pollution, 'add');
      } else if (b.type === 'I') stampR(pol, cx, cz, 3 + b.lvl * 1.5, 0.28 + b.lvl * 0.12, 'add');
    }
    // trees soak up smog; the sea breeze helps too
    for (let i = 0; i < n; i++) {
      const x = i % N, z = (i / N) | 0;
      if (w.tree[i]) { pol[i] *= 0.7; land[i] += 0.05; }
      if (w.kind[i] === KIND.ROAD) pol[i] += 0.03;
      let sea = 0; for (let r = 1; r <= 4 && !sea; r++) if (w.nearWater(x, z, r)) sea = 1 - (r - 1) / 4;
      this.water[i] = this.water[i] > 0.05 ? 1 : 0;
      const cov = (this.cover.police[i] + this.cover.fire[i] + this.cover.health[i] + this.cover.edu[i]) / 4;
      land[i] = clamp(0.28 + land[i] + sea * 0.22 + cov * 0.25 - pol[i] * 0.55, 0, 1);
      pol[i] = clamp(pol[i], 0, 1);
    }
    w.dirty.cover = false;
  }

  // ---------------------------------------------------------------- one game day
  step(dtReal, speed) {
    if (!speed) return;
    this.dayAcc += dtReal * speed;
    const DAY = 0.5;
    let guard = 0;
    while (this.dayAcc >= DAY && guard++ < 6) { this.dayAcc -= DAY; this.day(); }
  }
  day() {
    const w = this.w;
    if (w.dirty.net) this.rebuildNetworks();
    if (w.dirty.cover) this.rebuildCoverage();
    const prevMonth = Math.floor(w.day / 30);
    w.day++;
    this.grow();
    this.fires();
    if (Math.floor(w.day / 30) !== prevMonth) this.month();
  }

  demand() {
    const s = this.w.stats, t = this.w.tax;
    let boost = 0; for (const b of this.w.buildings.values()) boost += TOOLS[b.type]?.fx?.demand || 0;
    const workers = s.pop * 0.55, jobs = s.jobsC + s.jobsI;
    const taxF = k => (0.09 - t[k]) * 7;
    s.demand = {
      R: clamp(((jobs + 60) / (workers + 30) - 1) * 1.1 + taxF('R') + boost + (s.happy - 0.5) * 0.6, -1, 1),
      C: clamp(((s.pop * 0.24 + 20) / (s.jobsC + 12) - 1) * 0.9 + taxF('C') + boost, -1, 1),
      I: clamp(((s.pop * 0.3 + 30) / (s.jobsI + 12) - 1) * 0.8 + taxF('I') + boost * 0.5, -1, 1),
    };
  }

  grow() {
    const w = this.w, n = N * N;
    this.demand();
    const D = w.stats.demand;
    // new buildings on empty zoned tiles
    const cand = [];
    for (let i = 0; i < n; i++) if (w.zone[i] && w.kind[i] === KIND.EMPTY && this.roadDist[i] <= 2 && this.power[i]) cand.push(i);
    const tries = Math.min(cand.length, 1 + Math.ceil(cand.length * 0.05));
    for (let t = 0; t < tries; t++) {
      const i = cand[Math.floor(Math.random() * cand.length)];
      if (w.kind[i] !== KIND.EMPTY) continue;
      const key = ZONE_KEY[w.zone[i]];
      if (Math.random() > D[key] * 0.8 + 0.18) continue;
      const x = i % N, z = (i / N) | 0;
      const b = w.growBuilding(x, z, key, 1);
      b.occ = 0.25;
      w.dirty.net = true;
    }
    // upgrades, occupancy and decline on a slice of buildings each day
    const all = [...w.buildings.values()];
    const slice = Math.max(4, Math.ceil(all.length / 10));
    for (let k = 0; k < slice; k++) {
      const b = all[Math.floor(Math.random() * all.length)];
      if (!b || !b.lvl) continue;
      const i = w.idx(b.x, b.z), key = b.type;
      const d = D[key];
      const svc = key === 'R' ? (this.cover.health[i] + this.cover.edu[i] + this.cover.police[i]) / 3 : (this.cover.police[i] + this.cover.fire[i]) / 2;
      const ok = b.powered && this.roadDist[i] <= 2;
      if (!ok) { b.bad++; b.occ = Math.max(0, b.occ - 0.15); }
      else { b.bad = Math.max(0, b.bad - 1); b.occ = Math.min(1, b.occ + (d > -0.2 ? 0.12 : -0.08)); }
      // grow taller
      const need = [0, 0.35, 0.52][b.lvl];
      if (b.lvl < 3 && ok && b.occ > 0.85 && d > 0.05 && (b.lvl < 2 || this.water[i]) && this.land[i] + svc * 0.3 > need + 0.12 && Math.random() < 0.35) {
        if (b.lvl === 2 && w.stats.pop < 900) continue;
        b.lvl++; b.occ = 0.5; b.name = pickH(NAMES[key], b.x, b.z, b.lvl);
        w.emit('building~', b); w.dirty.net = true;
      }
      // abandoned after a long stretch without power or road
      if (b.bad > 8 && !b.abandoned) { b.abandoned = true; w.emit('building~', b); }
      else if (b.abandoned && b.bad === 0) { b.abandoned = false; w.emit('building~', b); }
    }
    // totals
    let pop = 0, jc = 0, ji = 0, happy = 0, hw = 0;
    for (const b of w.buildings.values()) {
      if (!b.lvl || b.abandoned) continue;
      const cap = CAP[b.type][b.lvl - 1] * b.occ;
      if (b.type === 'R') {
        pop += cap;
        const i = w.idx(b.x, b.z);
        const h = 0.35 + this.land[i] * 0.4 + (this.cover.health[i] + this.cover.police[i] + this.cover.edu[i]) * 0.1 - this.pollution[i] * 0.3 + (b.powered ? 0 : -0.3);
        happy += h * cap; hw += cap;
      } else if (b.type === 'C') jc += cap; else ji += cap;
    }
    let parks = 0; for (const b of w.buildings.values()) parks += TOOLS[b.type]?.fx?.happy || 0;
    const taxMood = (0.09 - (w.tax.R + w.tax.C + w.tax.I) / 3) * 3;
    w.stats.pop = pop; w.stats.jobsC = jc; w.stats.jobsI = ji;
    w.stats.happy = clamp((hw ? happy / hw : 0.6) + Math.min(0.15, parks * 0.004) + taxMood, 0, 1);
    const m = MILESTONES.findLastIndex(x => pop >= x[0]);
    if (m > this.milestone) { this.milestone = m; this.news(`${w.name} is now a ${MILESTONES[m][1]}!`, 'milestone'); }
  }

  month() {
    const w = this.w, s = w.stats;
    const income = s.pop * w.tax.R * 1.25 + s.jobsC * w.tax.C * 1.4 + s.jobsI * w.tax.I * 1.3;
    let upkeep = 0, roads = 0;
    for (const b of w.buildings.values()) upkeep += TOOLS[b.type]?.upkeep || 0;
    for (let i = 0; i < N * N; i++) { if (w.kind[i] === KIND.ROAD) roads += w.terr[i] === TERR.WATER ? 1.2 : 0.4; else if (w.kind[i] === KIND.RAIL) roads += 0.6; }
    const expense = upkeep + roads;
    s.income = income; s.expense = expense;
    w.money += income - expense;
    w.history.push({ d: w.day, pop: Math.round(s.pop), money: Math.round(w.money), inc: Math.round(income), exp: Math.round(expense) });
    if (w.history.length > 120) w.history.shift();
    // advice, gently
    if (s.powerCap === 0 && [...w.buildings.values()].some(b => b.lvl) === false && this.anyZones()) this.news('Zones need power to grow. Build a wind turbine or a coal plant and connect it with a road.', 'tip');
    else if (s.powerUse > s.powerCap && Date.now() - this.noPowerWarned > 60000) { this.noPowerWarned = Date.now(); this.news('Brownouts! The city needs more power.', 'warn'); }
    else if (s.demand.R > 0.6 && Math.random() < 0.35) this.news('People want to move here. Zone more housing.', 'tip');
    else if (s.demand.C > 0.6 && Math.random() < 0.35) this.news('Shops are in demand. Zone some commercial areas.', 'tip');
    else if (s.demand.I > 0.6 && Math.random() < 0.35) this.news('Industry wants space to grow.', 'tip');
    if (w.money < 0) this.news('The treasury is in the red. Raise taxes or cut costs.', 'warn');
  }
  anyZones() { for (let i = 0; i < N * N; i++) if (this.w.zone[i]) return true; return false; }

  // ---------------------------------------------------------------- fires
  fires() {
    const w = this.w;
    for (const b of w.buildings.values()) {
      if (b.fire > 0) {
        const i = w.idx(b.x, b.z);
        b.fire += 1;
        const cover = this.cover.fire[i];
        if (Math.random() < 0.05 + cover * 0.35) { b.fire = 0; w.emit('building~', b); this.news(`Firefighters saved ${b.name || 'a building'}.`, 'info'); continue; }
        if (b.fire > 14) { this.news(`${b.name || 'A building'} burned down.`, 'warn'); w.removeBuilding(b, true); continue; }
        if (Math.random() < 0.08) { // spread to a neighbour
          const [dx, dz] = NB4[Math.floor(Math.random() * 4)];
          const nb = w.building(b.x + dx, b.z + dz); if (nb && !nb.fire && nb.lvl) { nb.fire = 1; w.emit('building~', nb); }
        }
      }
    }
    if (w.buildings.size > 60 && w.day > 90 && Math.random() < 0.006) {
      const all = [...w.buildings.values()].filter(b => b.lvl && !b.fire);
      const b = all[Math.floor(Math.random() * all.length)];
      if (b && Math.random() > this.cover.fire[w.idx(b.x, b.z)] * 0.8) { b.fire = 1; w.emit('building~', b); this.news(`Fire at ${b.name || 'a building'}!`, 'fire', b); }
    }
  }
}
