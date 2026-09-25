// A small starter village: a main street, side streets, zones, power, water and some houses already up.
import { N, KIND, TERR, ZONE } from './config.js';
import { hash01 } from './util.js';

function landScore(w, cx, cz) {
  let s = 0;
  for (let z = cz - 6; z <= cz + 6; z++) for (let x = cx - 11; x <= cx + 11; x++) if (w.in(x, z) && w.terr[w.idx(x, z)] !== TERR.WATER) s++;
  return s - Math.hypot(cx - N * 0.6, cz - N * 0.5) * 2;
}
export function seedVillage(w) {
  let best = null, bs = -1e9;
  for (let cz = 10; cz < N - 10; cz += 2) for (let cx = 14; cx < N - 14; cx += 2) { const s = landScore(w, cx, cz); if (s > bs) { bs = s; best = [cx, cz]; } }
  const [cx, cz] = best;
  const money = w.money; w.money = 1e9;
  const road = (x, z) => w.setRoad(x, z);
  for (let x = cx - 10; x <= cx + 10; x++) road(x, cz);
  for (const sx of [cx - 6, cx, cx + 6]) for (let z = cz - 5; z <= cz + 5; z++) road(sx, z);
  for (let x = cx - 6; x <= cx + 6; x++) road(x, cz - 5);
  // zones: homes to the north, shops on the main street, a little industry to the east
  const zone = (x, z, zn) => { if (w.in(x, z)) w.setZone(x, z, zn); };
  for (let z = cz - 4; z <= cz - 1; z++) for (let x = cx - 5; x <= cx + 5; x++) if (x !== cx) zone(x, z, ZONE.R);
  for (let z = cz - 7; z <= cz - 6; z++) for (let x = cx - 6; x <= cx + 6; x++) zone(x, z, ZONE.R);
  for (let x = cx - 9; x <= cx + 5; x++) if (x !== cx - 6 && x !== cx) zone(x, cz + 1, ZONE.C);
  for (let z = cz + 2; z <= cz + 5; z++) for (let x = cx - 5; x <= cx - 1; x++) zone(x, z, ZONE.R);
  for (let z = cz + 1; z <= cz + 4; z++) for (let x = cx + 7; x <= cx + 10; x++) zone(x, z, ZONE.I);
  // utilities and a couple of niceties
  const put = (t, x, z, r = 0) => w.placeBuilding(t, x, z, r, true);
  put('wind', cx + 8, cz - 2); put('wind', cx + 9, cz - 1); put('wind', cx + 10, cz - 2);
  put('watertower', cx + 1, cz + 2);
  put('park', cx + 1, cz - 2); put('park', cx - 7, cz + 2);
  put('church', cx + 2, cz + 2);
  // some houses already built
  for (let z = cz - 8; z <= cz + 6; z++) for (let x = cx - 10; x <= cx + 11; x++) {
    if (!w.in(x, z)) continue;
    const i = w.idx(x, z), zn = w.zone[i];
    if (!zn || w.kind[i] !== KIND.EMPTY || hash01(x, z, 5) > 0.72) continue;
    let near = false; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.isRoad(x + dx, z + dz)) near = true;
    if (!near) continue;
    const key = ['', 'R', 'C', 'I'][zn];
    const b = w.growBuilding(x, z, key, zn === ZONE.C && hash01(x, z) < 0.3 ? 2 : 1);
    b.occ = 0.8;
  }
  w.money = money;
  w.dirty.net = w.dirty.cover = true;
  return { cx, cz };
}
