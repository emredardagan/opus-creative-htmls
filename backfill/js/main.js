// Backfill — rows of bricks roll down a neon highway. Shoot bricks up the
// lanes to plug the gaps; a full row clears. Endless, sector after sector.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWorld, CELL_W, CELL_D, DANGER_Z, SPAWN_Z } from './scene.js';
import { brickGeo, MATS, materialFor, ghostMat, BRICK_H, ROW_COLORS } from './bricks.js';
import { createFx } from './fx.js';
import { Audio } from './audio.js';
import { sectorInfo, makeRows, mulberry32, seedFromString, POWERS } from './levels.js';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const today = () => new Date().toISOString().slice(0, 10);

const world = createWorld($('c'));
const { scene, camera, board } = world;
const fx = createFx(board);
const audio = new Audio();

const SHIP_Z = 0.9;
const SHOT_SPEED = 44;
const MAX_BARRIER = 5;

// ---------- game state ----------
const G = {
  state: 'title', mode: 'classic', rng: Math.random,
  sectorIdx: 0, sector: null, lanes: 4,
  rows: [], frontZ: -9, linkSeq: 0, prevGaps: null,
  score: 0, shownScore: 0, combo: 0, comboTimer: 0, bestCombo: 0,
  fever: 0, barrier: 3, power: null, phaseShots: 0, spreadShots: 0, slowT: 0,
  sectorCleared: 0, totalCleared: 0, shots: 0, junk: 0,
  lane: 1, cooldown: 0, projectiles: [],
  warpT: 0, warpStep: 0, shake: 0, fovKick: 0, alarmT: 0, t: 0, scroll: 6,
  startTime: 0,
};

const laneX = (i, lanes = G.lanes) => (i - (lanes - 1) / 2) * CELL_W;
const rowZ = i => G.frontZ - i * CELL_D;
const CELL_Y = BRICK_H / 2 + 0.02;

// ---------- ship ----------
const ship = new THREE.Group();
board.add(ship);
const shipBody = new THREE.Group();
ship.add(shipBody);
const shipGlow = new THREE.PointLight(0xff3fb4, 1.2, 4, 1.6);
shipGlow.position.set(0, 0.4, -0.4);
ship.add(shipGlow);
const flame = new THREE.Mesh(
  new THREE.ConeGeometry(0.16, 0.9, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x2ef2ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
);
flame.rotation.x = -Math.PI / 2;
flame.position.set(0, 0.25, 0.95);
ship.add(flame);
const underGlow = new THREE.Mesh(
  new THREE.CircleGeometry(0.9, 32),
  new THREE.MeshBasicMaterial({ color: 0xff3fb4, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    map: new THREE.TextureLoader().load('../assets/kenney/particles/circle_05.png') })
);
underGlow.rotation.x = -Math.PI / 2;
underGlow.position.y = 0.03;
ship.add(underGlow);
new GLTFLoader().loadAsync('../assets/kenney/space-kit/craft_racer.glb').then(gltf => {
  const m = gltf.scene;
  m.traverse(o => {
    if (!o.isMesh) return;
    const old = o.material;
    o.material = new THREE.MeshStandardMaterial({
      color: old.color, metalness: 0.7, roughness: 0.3,
      emissive: old.color.clone().multiplyScalar(0.04),
    });
  });
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3());
  const s = 1.25 / Math.max(size.x, size.z);
  m.scale.setScalar(s);
  m.rotation.y = Math.PI;
  const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
  m.position.set(-c.x, -box.min.y * s + 0.05, -c.z);
  shipBody.add(m);
}).catch(() => {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0xddddff, metalness: 0.7, roughness: 0.3 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.35;
  shipBody.add(m);
});

// ---------- aim beam + ghost ----------
const beam = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0x2ef2ff) }, uTime: world.uniforms.uTime },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main(){
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float a = pow(edge, 3.0) * 0.32 + smoothstep(0.92, 1.0, 1.0 - abs(vUv.x - 0.5) * 2.0 + 0.9) * 0.0;
        float dash = step(0.5, fract(vUv.y * 10.0 - uTime * 3.0)) * 0.15;
        a += dash * edge;
        a *= smoothstep(0.0, 0.15, vUv.y);
        gl_FragColor = vec4(uColor * a * 1.5, a);
      }`,
  })
);
beam.rotation.x = -Math.PI / 2;
beam.position.y = 0.03;
board.add(beam);
const ghost = new THREE.Mesh(brickGeo, ghostMat);
board.add(ghost);

// ---------- HUD ----------
const hud = {
  score: $('score'), best: $('best'), sectorNum: $('sectorNum'), sectorName: $('sectorName'), bar: $('sectorBar'),
  pips: $('pips'), combo: $('combo'), power: $('btnPower'), powerIcon: $('powerIcon'), powerName: $('powerName'),
  fever: $('fever'), banner: $('banner'), popups: $('popups'), flash: $('flash'),
};
function bestKey() { return G.mode === 'daily' ? `backfill-daily-${today()}` : 'backfill-best'; }

function renderPips(lost = -1) {
  hud.pips.innerHTML = '';
  const n = Math.max(3, G.barrier, lost + 1);
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'pip' + (i >= G.barrier ? ' off' : '') + (i === lost ? ' lost' : '');
    hud.pips.appendChild(p);
  }
}
function renderSector() {
  hud.sectorNum.textContent = `S${G.sectorIdx + 1}`;
  hud.sectorName.textContent = G.sector.name;
  hud.bar.style.width = `${Math.min(100, (G.sectorCleared / G.sector.target) * 100)}%`;
  hud.bar.parentElement.classList.toggle('final', !!G.finalWave);
  if (G.finalWave) hud.sectorName.textContent = `CLEAR THE BOARD · ${G.rows.length}`;
}
function renderPower() {
  const el = hud.power;
  el.classList.remove('empty', 'active');
  if (G.phaseShots > 0 || G.spreadShots > 0 || G.slowT > 0) {
    const key = G.phaseShots > 0 ? 'phase' : G.spreadShots > 0 ? 'spread' : 'slow';
    const left = key === 'phase' ? G.phaseShots : key === 'spread' ? G.spreadShots : Math.ceil(G.slowT);
    el.classList.add('active');
    hud.powerIcon.className = `ph-bold ${POWERS[key].icon}`;
    hud.powerName.textContent = `${POWERS[key].name} ${left}${key === 'slow' ? 's' : ''}`;
    if (G.power) hud.powerName.textContent += ' +1';
    return;
  }
  if (!G.power) {
    el.classList.add('empty');
    hud.powerIcon.className = 'ph-bold ph-lightning';
    hud.powerName.textContent = 'EMPTY';
    return;
  }
  hud.powerIcon.className = `ph-bold ${POWERS[G.power].icon}`;
  hud.powerName.textContent = POWERS[G.power].name;
}
function renderCombo() {
  const m = comboMult();
  if (G.combo >= 2) {
    hud.combo.textContent = `COMBO ${G.combo}  ×${m * (G.fever > 0 ? 2 : 1)}`;
    hud.combo.classList.add('on');
    hud.combo.classList.remove('pop'); void hud.combo.offsetWidth; hud.combo.classList.add('pop');
  } else hud.combo.classList.remove('on');
}
const comboMult = () => Math.min(8, 1 + Math.floor(G.combo / 3));

const _v = new THREE.Vector3();
function popup(text, x, y, z, color = '#fff', size = '') {
  board.localToWorld(_v.set(x, y, z)).project(camera);
  const el = document.createElement('div');
  el.className = `pop ${size}`;
  el.textContent = text;
  el.style.color = color;
  el.style.left = `${Math.max(60, Math.min(innerWidth - 60, (_v.x + 1) / 2 * innerWidth))}px`;
  el.style.top = `${(1 - _v.y) / 2 * innerHeight}px`;
  hud.popups.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
function banner(k, n, t) {
  const b = hud.banner;
  b.innerHTML = `<div class="k">${k}</div><div class="n">${n}</div>${t ? `<div class="t">${t}</div>` : ''}`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
const hex = c => '#' + new THREE.Color(c).getHexString();

function addScore(n) {
  G.score += Math.round(n);
  hud.score.classList.remove('bump'); void hud.score.offsetWidth; hud.score.classList.add('bump');
}
function shake(a) { G.shake = Math.max(G.shake, reduced ? a * 0.3 : a); }

// ---------- rows ----------
function makeCell(row, lane, kind) {
  const mesh = new THREE.Mesh(brickGeo, materialFor(row.type, kind));
  mesh.position.set(laneX(lane), CELL_Y, 0);
  mesh.userData.tx = laneX(lane);
  row.group.add(mesh);
  const cell = { mesh, kind, pop: 0 };
  if (kind === 'bomb') {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5070, toneMapped: false }));
    core.position.y = BRICK_H / 2 + 0.06;
    mesh.add(core);
    cell.core = core;
  }
  return cell;
}

function addRowMarkers(row) {
  const color = ROW_COLORS[row.type];
  if (!color) return;
  const w = G.lanes * CELL_W;
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  for (const s of [-1, 1]) {
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, CELL_D * 0.7), m);
    tag.position.set(s * (w / 2 + 0.25), 0.32, 0);
    row.group.add(tag);
  }
}

function createRow(spec, index, linkId = 0) {
  const row = {
    type: spec.type, cells: [], hp: spec.type === 'armor' ? 2 : 1, linkId,
    group: new THREE.Group(), z: 0, glitchT: 2 + Math.random() * 1.5, glitchDir: Math.random() < 0.5 ? -1 : 1,
    spawn: 0, waiting: 0, lanes: G.lanes,
  };
  for (let i = 0; i < G.lanes; i++) {
    row.cells.push(spec.filled[i] ? makeCell(row, i, spec.bomb === i ? 'bomb' : 'base') : null);
  }
  addRowMarkers(row);
  board.add(row.group);
  G.rows.splice(index, 0, row);
  row.z = rowZ(G.rows.indexOf(row));
  row.group.position.z = row.z;
  return row;
}

function linkBar(lower) {
  const w = G.lanes * CELL_W;
  const m = new THREE.MeshBasicMaterial({ color: ROW_COLORS.linked, toneMapped: false });
  for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, CELL_D), m);
    bar.position.set(s * (w / 2 + 0.25), 0.55, -CELL_D / 2);
    lower.group.add(bar);
  }
}

function spawnBatch() {
  const specs = makeRows(G.sector, G.rng, G.prevGaps);
  const linkId = specs.length > 1 ? ++G.linkSeq : 0;
  let first = null;
  for (const spec of specs) {
    const r = createRow(spec, G.rows.length, linkId);
    if (!first) first = r;
    G.prevGaps = spec.filled.map(f => !f);
  }
  if (linkId) linkBar(first);
}

function removeRow(row) {
  board.remove(row.group);
  row.group.traverse(o => { if (o.isMesh && o.geometry !== brickGeo) { o.geometry.dispose(); } });
}

function fillRows(resetIfEmpty = true) {
  if (!G.sector || G.finalWave) return;
  if (G.rows.length === 0 && resetIfEmpty) G.frontZ = SPAWN_Z + CELL_D;
  let guard = 0;
  while (rowZ(G.rows.length - 1) > SPAWN_Z + CELL_D && guard++ < 30) spawnBatch();
}

const isFull = r => r.cells.every(Boolean);

// ---------- shooting ----------
function findTarget(lane, phase) {
  const rows = G.rows, n = rows.length;
  if (n === 0) return null;
  if (phase) {
    for (let i = 0; i < n; i++) if (!rows[i].cells[lane]) return { row: i };
    return null;
  }
  let r = 0;
  while (r < n && !rows[r].cells[lane]) r++;
  return { row: r - 1 };
}
const targetZ = t => t.row < 0 ? G.frontZ + CELL_D : rowZ(t.row);

function fire(laneOverride) {
  if (G.state !== 'play') return;
  if (laneOverride != null) G.lane = laneOverride;
  if (G.cooldown > 0) return;
  G.cooldown = 0.1;
  const phase = G.phaseShots > 0;
  const lanes = G.spreadShots > 0 ? [G.lane - 1, G.lane, G.lane + 1].filter(l => l >= 0 && l < G.lanes) : [G.lane];
  if (phase) G.phaseShots--;
  if (G.spreadShots > 0) G.spreadShots--;
  for (const l of lanes) {
    const mesh = new THREE.Mesh(brickGeo, phase ? MATS.glitch : MATS.player);
    mesh.scale.set(0.85, 0.85, 0.85);
    mesh.position.set(laneX(l), CELL_Y, SHIP_Z - 0.6);
    board.add(mesh);
    G.projectiles.push({ lane: l, mesh, z: SHIP_Z - 0.6, phase });
  }
  G.shots++;
  audio.play(lanes.length > 1 ? 'shoot2' : 'shoot', { rate: 0.95 + Math.random() * 0.12, gain: 0.7 });
  shipBody.position.z = 0.25;
  fx.burst(laneX(G.lane), 0.4, SHIP_Z - 0.7, phase ? 0x9ffcff : 0xffffff, 8, 3, 0.25);
  renderPower();
}

function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    p.z -= SHOT_SPEED * dt;
    p.mesh.position.z = p.z;
    p.mesh.scale.z = 0.85 + 0.5; // stretched in flight
    if (Math.random() < 0.8) fx.spark(p.mesh.position.x + (Math.random() - 0.5) * 0.8, CELL_Y, p.z + 0.4, 0, 0.5, 2, p.phase ? 0x9ffcff : G.fever > 0 ? 0xff3fb4 : 0xfff0ff, 0.22, 0.3, 4);
    const t = findTarget(p.lane, p.phase);
    if (!t) {
      if (p.z < SPAWN_Z - 2) { board.remove(p.mesh); G.projectiles.splice(i, 1); }
      continue;
    }
    const tz = targetZ(t);
    if (p.z <= tz) {
      board.remove(p.mesh);
      G.projectiles.splice(i, 1);
      land(p, t);
    }
  }
}

function land(p, t) {
  const x = laneX(p.lane);
  if (t.row < 0) {
    // the lane was blocked at the front: the brick sticks on as a junk row
    const filled = new Array(G.lanes).fill(false);
    filled[p.lane] = true;
    G.frontZ += CELL_D;
    const row = createRow({ type: 'junk', filled }, 0);
    row.spawn = 1;
    row.cells[p.lane].mesh.material = MATS.player;
    row.cells[p.lane].kind = 'player';
    row.cells[p.lane].pop = 1;
    G.junk++;
    breakCombo();
    if (G.finalWave) renderSector();
    audio.play('junk', { gain: 0.8 });
    fx.burst(x, 0.4, row.z, 0xff5a6a, 14, 4);
    popup('JUNK', x, 0.6, row.z, '#ff5a6a');
    shake(0.12);
    return;
  }
  const row = G.rows[t.row];
  const cell = makeCell(row, p.lane, 'player');
  cell.mesh.material = MATS.player;
  cell.pop = 1;
  row.cells[p.lane] = cell;
  audio.play('place', { rate: 0.8 + p.lane * 0.12, gain: 0.7 });
  fx.burst(x, 0.45, row.z + 0.4, 0xffffff, 10, 3.5, 0.3);
  checkRow(row);
}

// ---------- clearing ----------
function checkRow(row) {
  if (!isFull(row)) return;
  if (row.type === 'armor' && row.hp > 1) return crack(row);
  if (row.linkId) {
    const group = G.rows.filter(r => r.linkId === row.linkId);
    if (group.every(isFull)) return clearRows(group);
    row.waiting = 1;
    audio.play('tick', { rate: 1.5 });
    popup('LINKED', 0, 0.8, row.z, hex(ROW_COLORS.linked));
    return;
  }
  clearRows([row]);
}

function crack(row) {
  row.hp = 1;
  row.type = 'cracked';
  for (const c of row.cells) if (c && c.kind === 'base') c.mesh.material = MATS.cracked;
  // armor shatters and pops open new gaps
  const n = G.lanes > 4 && G.rng() < 0.5 ? 2 : 1;
  const lanes = [...Array(G.lanes).keys()].sort(() => G.rng() - 0.5).slice(0, n);
  for (const l of lanes) {
    const c = row.cells[l];
    fx.shatter(laneX(l), CELL_Y, row.z, ROW_COLORS.armor, 8, 6);
    row.group.remove(c.mesh);
    row.cells[l] = null;
  }
  addScore(50);
  audio.play('crack');
  fx.flash(0, 0.5, row.z, G.lanes * CELL_W, CELL_D, ROW_COLORS.armor, 0.3);
  popup('CRACKED', 0, 0.8, row.z, hex(ROW_COLORS.armor));
  shake(0.15);
}

function clearRows(list, { pulse = false } = {}) {
  const set = new Set(list);
  let bombs = 0, changed = true;
  while (changed) {
    changed = false;
    for (const r of [...set]) {
      const i = G.rows.indexOf(r);
      if (r.type === 'bomb' && !r.blown) {
        r.blown = true; bombs++;
        for (const nb of [G.rows[i - 1], G.rows[i + 1]]) if (nb && !set.has(nb)) { set.add(nb); changed = true; }
      }
      if (r.linkId) for (const nb of G.rows) if (nb.linkId === r.linkId && !set.has(nb)) { set.add(nb); changed = true; }
    }
  }
  const rows = [...set].sort((a, b) => G.rows.indexOf(b) - G.rows.indexOf(a));
  const count = rows.length;
  const base = Math.round(100 * (1 + G.sectorIdx * 0.25));
  let sum = 0, gold = 0, linked = false;
  for (const r of rows) {
    let s = base;
    if (r.type === 'gold') { s *= 3; gold++; }
    if (r.linkId) { s *= 2; linked = true; }
    if (r.type === 'junk') s *= 0.5;
    if (pulse && !isFull(r)) s *= 0.5;
    sum += s;
  }
  if (!pulse) {
    G.combo++;
    G.bestCombo = Math.max(G.bestCombo, G.combo);
    G.comboTimer = 3 + 1.6 / G.sector.speed;
    if (G.combo > 0 && G.combo % 10 === 0) startFever();
  }
  const total = sum * (1 + 0.5 * (count - 1)) * comboMult() * (G.fever > 0 ? 2 : 1);
  addScore(total);

  // effects, from the front row backwards
  const midZ = rows.reduce((a, r) => a + r.z, 0) / count;
  const w = G.lanes * CELL_W;
  for (const r of rows) {
    const color = ROW_COLORS[r.type] || world.palNow.brick.getHex();
    fx.flash(0, 0.5, r.z, w + 0.6, CELL_D, color, 0.25);
    r.cells.forEach((c, l) => {
      if (!c) return;
      const cc = c.kind === 'player' ? 0xffffff : c.kind === 'bomb' ? 0xff3355 : color;
      fx.shatter(laneX(l), CELL_Y, r.z, cc, reduced ? 3 : 5, 6);
      fx.burst(laneX(l), CELL_Y, r.z, cc, reduced ? 3 : 6, 7, 0.3);
    });
  }
  if (bombs) {
    for (const r of rows) if (r.type === 'bomb') fx.ring(0, 0.3, r.z, 0xff3355, 9, 0.6);
    audio.play('bomb'); shake(0.45); G.fovKick = 3;
  } else {
    shake(0.08 + count * 0.06);
    G.fovKick = Math.max(G.fovKick, 0.6 + count * 0.4);
  }
  audio.play(linked ? 'link' : 'clear', { rate: Math.min(1.6, 1 + G.combo * 0.04), gain: 0.8 });

  let label = `+${Math.round(total)}`;
  const tags = [];
  if (count === 2) tags.push('DOUBLE'); else if (count === 3) tags.push('TRIPLE'); else if (count >= 4) tags.push(`${count}× MEGA`);
  if (linked && !bombs) tags.push('LINK');
  if (bombs) tags.push('BOOM');
  if (gold) tags.push('GOLD');
  popup(label, 0, 0.9, midZ, G.fever > 0 ? '#ff3fb4' : '#ffffff', count > 1 ? 'big' : '');
  if (tags.length) setTimeout(() => popup(tags.join(' '), 0, 0.9, midZ + 0.8, gold ? '#ffc940' : hex(world.palNow.brick.getHex()), 'big'), 140);

  for (const r of rows) {
    const i = G.rows.indexOf(r);
    removeRow(r);
    G.rows.splice(i, 1);
    G.frontZ -= CELL_D;
  }
  G.sectorCleared += count;
  G.totalCleared += count;
  for (let k = 0; k < gold; k++) grantPower();
  if (G.rows.length === 0 && !pulse && !G.finalWave && G.state === 'play') {
    addScore(2000);
    setTimeout(() => popup('CLEAN SWEEP +2000', 0, 1, -6, '#9ffcff', 'huge'), 300);
  }
  if (!G.finalWave && G.sectorCleared >= G.sector.target && G.state === 'play') {
    // no new rows from here: the sector ends when the board is empty
    G.finalWave = true;
    audio.play('power');
    banner('FINAL WAVE', 'CLEAR THE BOARD', `${G.rows.length} rows left`);
  }
  renderSector();
  renderCombo();
}

function breakCombo() {
  if (G.combo >= 3) popup('COMBO LOST', laneX(G.lane), 0.8, -2, '#ff5a6a');
  G.combo = 0;
  renderCombo();
}

function startFever() {
  G.fever = 10;
  audio.fever = true;
  audio.play('fever');
  hud.fever.classList.remove('show'); void hud.fever.offsetWidth; hud.fever.classList.add('show');
  G.fovKick = 4;
}

// ---------- power-ups ----------
function grantPower() {
  const r = G.rng();
  let key = r < 0.26 ? 'phase' : r < 0.5 ? 'spread' : r < 0.7 ? 'slow' : r < 0.9 ? 'pulse' : 'shield';
  if (G.barrier <= 1 && G.rng() < 0.5) key = 'shield';
  if (G.power) { addScore(500); popup('BONUS +500', laneX(G.lane), 1, -1, '#ffc940'); return; }
  G.power = key;
  audio.play('power');
  popup(POWERS[key].name, laneX(G.lane), 1.2, -0.5, hex(POWERS[key].color), 'big');
  renderPower();
}

function usePower() {
  if (G.state !== 'play' || !G.power) return;
  if (G.phaseShots > 0 || G.spreadShots > 0 || G.slowT > 0) return;
  const key = G.power;
  G.power = null;
  audio.play('use');
  const P = POWERS[key];
  if (key === 'phase') G.phaseShots = P.shots;
  if (key === 'spread') G.spreadShots = P.shots;
  if (key === 'slow') { G.slowT = P.time; audio.slow = true; }
  if (key === 'shield') { G.barrier = Math.min(MAX_BARRIER, G.barrier + 1); renderPips(); audio.play('shield'); }
  if (key === 'pulse') {
    const rows = G.rows.slice(0, 3);
    if (rows.length) {
      fx.ring(0, 0.3, DANGER_Z - 1, 0xffc940, 14, 0.7);
      audio.play('boom');
      clearRows(rows, { pulse: true });
    }
  }
  banner('POWER-UP', P.name, P.desc);
  renderPower();
}

// ---------- barrier / game over ----------
function barrierHit() {
  if (G.barrier <= 0) return gameOver();
  G.barrier--;
  renderPips(G.barrier);
  audio.play('shield'); audio.play('boom', { gain: 0.7 });
  hud.flash.classList.remove('hit'); void hud.flash.offsetWidth; hud.flash.classList.add('hit');
  shake(0.6);
  breakCombo();
  const rows = G.rows.slice(0, 3);
  for (const r of rows) {
    r.cells.forEach((c, l) => { if (c) fx.shatter(laneX(l), CELL_Y, r.z, 0xff3355, 4, 7); });
    fx.flash(0, 0.5, r.z, G.lanes * CELL_W, CELL_D, 0xff2050, 0.5);
  }
  for (const r of [...rows].reverse()) { removeRow(r); G.rows.splice(G.rows.indexOf(r), 1); G.frontZ -= CELL_D; }
  fx.ring(0, 0.3, DANGER_Z, 0xff2050, 12, 0.7);
  if (G.finalWave) renderSector();
  popup(G.barrier === 0 ? 'LAST BARRIER!' : 'BARRIER HIT', 0, 1.2, DANGER_Z - 2, '#ff3355', 'big');
}

function gameOver() {
  G.state = 'over';
  audio.stopMusic();
  audio.play('boom');
  shake(0.9);
  G.projectiles.forEach(p => board.remove(p.mesh));
  G.projectiles = [];
  // the whole stack collapses
  const rows = [...G.rows];
  rows.forEach((r, i) => setTimeout(() => {
    r.cells.forEach((c, l) => { if (c) { fx.shatter(laneX(l), CELL_Y, r.z, 0xff3355, 3, 6); fx.burst(laneX(l), CELL_Y, r.z, 0xff3fb4, 5, 6); } });
    removeRow(r);
  }, i * 60));
  G.rows = [];
  fx.burst(ship.position.x, 0.5, SHIP_Z, 0xffffff, 60, 10, 0.5);
  fx.shatter(ship.position.x, 0.5, SHIP_Z, 0x2ef2ff, 20, 8);
  ship.visible = false; beam.visible = false; ghost.visible = false;

  const key = bestKey();
  const prev = store.get(key, 0);
  const isBest = G.score > prev;
  if (isBest) store.set(key, G.score);
  store.set('backfill-best-sector', Math.max(store.get('backfill-best-sector', 0), G.sectorIdx + 1));
  setTimeout(() => {
    $('hud').hidden = true;
    $('overScore').textContent = G.score.toLocaleString();
    $('overBest').innerHTML = isBest ? '<span class="new-best">NEW HIGH SCORE</span>' : `Best ${prev.toLocaleString()}${G.mode === 'daily' ? ' today' : ''}`;
    const acc = G.shots ? Math.round(100 * (1 - G.junk / G.shots)) : 100;
    const mins = Math.floor((performance.now() - G.startTime) / 60000), secs = Math.floor((performance.now() - G.startTime) / 1000) % 60;
    $('stats').innerHTML = [
      [`S${G.sectorIdx + 1}`, 'SECTOR'], [G.totalCleared, 'ROWS'], [G.bestCombo, 'BEST COMBO'],
      [`${acc}%`, 'CLEAN SHOTS'], [G.shots, 'SHOTS'], [`${mins}:${String(secs).padStart(2, '0')}`, 'TIME'],
    ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
    $('over').hidden = false;
  }, 1500);
}

// ---------- sectors / warp ----------
function applySector(idx, instant = false) {
  G.sectorIdx = idx;
  G.sector = sectorInfo(idx, G.rng);
  G.lanes = G.sector.lanes;
  G.lane = Math.min(G.lane, G.lanes - 1);
  G.sectorCleared = 0;
  G.finalWave = false;
  world.setPalette(G.sector.pal, instant);
  world.buildTrack(G.lanes);
  audio.tempo = Math.min(172, Math.round(92 + G.sector.speed * 70)); // music follows the board speed
  audio.intensity = Math.min(1, idx / 6);
  fitCamera();
  renderSector();
}

function startWarp() {
  G.state = 'warp';
  G.warpT = 0;
  G.warpStep = 0;
  audio.play('sector');
  const bonus = 1000 * (G.sectorIdx + 1);
  addScore(bonus);
  banner(`SECTOR ${G.sectorIdx + 1}`, 'CLEAR', `+${bonus.toLocaleString()} bonus`);
  G.projectiles.forEach(p => board.remove(p.mesh));
  G.projectiles = [];
}

function updateWarp(dt) {
  G.warpT += dt;
  // leftover rows pop one by one for bonus points
  if (G.warpT < 1.4 && G.rows.length && G.warpT > 0.25 + G.warpStep * 0.09) {
    G.warpStep++;
    const r = G.rows[0];
    r.cells.forEach((c, l) => { if (c) { fx.burst(laneX(l), CELL_Y, r.z, world.palNow.brick.getHex(), 6, 6, 0.35); fx.shatter(laneX(l), CELL_Y, r.z, world.palNow.brick.getHex(), 2, 5); } });
    removeRow(r);
    G.rows.shift();
    G.frontZ -= CELL_D;
    addScore(50 * (G.sectorIdx + 1));
    audio.play('tick', { rate: 1 + G.warpStep * 0.05, gain: 0.5 });
  }
  if (G.warpT >= 1.5 && G.warpStep >= 0) {
    G.warpStep = -1;
    G.rows.forEach(removeRow);
    G.rows = [];
    audio.play('warp');
    G.fovKick = 9;
    applySector(G.sectorIdx + 1);
    G.barrier = Math.min(MAX_BARRIER, G.barrier + 1);
    renderPips();
    G.prevGaps = null;
    banner(`SECTOR ${G.sectorIdx + 1}`, G.sector.name, G.sector.tip);
    G.frontZ = SPAWN_Z + CELL_D;
  }
  if (G.warpT >= 3.0) {
    G.state = 'play';
    G.frontZ = -10;
    fillRows(false);
  }
}

// ---------- camera fitting ----------
const PITCH = THREE.MathUtils.degToRad(17);
const camBase = new THREE.Vector3(), camLook = new THREE.Vector3();
function fitCamera() {
  const portrait = innerHeight > innerWidth;
  const aspect = innerWidth / innerHeight;
  const pitch = portrait ? THREE.MathUtils.degToRad(aspect < 0.6 ? 29 : 24) : PITCH;
  const yH = portrait ? 0.93 : 0.7; // where the horizon sits on screen
  board.updateMatrixWorld(true);
  const fov = 2 * Math.atan(Math.tan(pitch) / yH);
  camera.fov = THREE.MathUtils.radToDeg(fov);
  camera.updateProjectionMatrix();
  const w = G.lanes * CELL_W / 2 + 0.7;
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  const near = new THREE.Vector3(), corner = new THREE.Vector3(), far = new THREE.Vector3();
  let best = null;
  for (let d = 6; d < 80; d += 0.25) {
    let lo = Math.max(-30, SHIP_Z + 2.5 - d * Math.cos(pitch)), hi = SHIP_Z + 1;
    for (let k = 0; k < 30; k++) {
      const zl = (lo + hi) / 2;
      camera.position.set(0, 0, zl).addScaledVector(dir, d);
      camera.lookAt(0, 0, zl);
      camera.updateMatrixWorld();
      board.localToWorld(near.set(0, 0, SHIP_Z + 1)).project(camera);
      if (near.y < -0.9) lo = zl; else hi = zl;
    }
    board.localToWorld(corner.set(w, 0.3, SHIP_Z + 0.5)).project(camera);
    board.localToWorld(far.set(0, 0.5, SPAWN_Z - 0.5)).project(camera);
    if (Math.abs(near.y + 0.9) < 0.05 && Math.abs(corner.x) < 0.94 && far.y < (portrait ? 0.68 : 0.66)) { best = { d, zl: (lo + hi) / 2 }; break; }
  }
  if (!best) best = { d: 30, zl: -6 };
  camLook.set(0, 0, best.zl);
  camBase.set(0, 0, best.zl).addScaledVector(dir, best.d);
  camera.position.copy(camBase);
  camera.lookAt(camLook);
  camera.userData.baseFov = camera.fov;
  fx.setScale(innerHeight);
}
addEventListener('resize', () => { world.resize(); fitCamera(); });

// ---------- input ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CELL_Y), hit = new THREE.Vector3();
function laneFromPointer(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ray.ray.applyMatrix4(board.matrixWorld.clone().invert());
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  return Math.max(0, Math.min(G.lanes - 1, Math.round(hit.x / CELL_W + (G.lanes - 1) / 2)));
}
$('c').addEventListener('pointerdown', e => {
  audio.unlock();
  if (G.state !== 'play') return;
  const l = laneFromPointer(e);
  if (l != null) fire(l);
});
$('c').addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || G.state !== 'play') return;
  const l = laneFromPointer(e);
  if (l != null) G.lane = l;
});
addEventListener('keydown', e => {
  if (e.repeat && !['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) return;
  audio.unlock();
  if (G.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); start('classic'); return; }
  if (G.state === 'over' && e.code === 'Enter') { start(G.mode); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (G.state !== 'play') return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') G.lane = Math.max(0, G.lane - 1);
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') G.lane = Math.min(G.lanes - 1, G.lane + 1);
  else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); fire(); }
  else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE' || e.code === 'KeyQ') usePower();
  else if (/^Digit[1-6]$/.test(e.code)) { const l = +e.code.slice(5) - 1; if (l < G.lanes) fire(l); }
});
let padPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && [...pads].find(Boolean);
  if (!p) return;
  const b = i => p.buttons[i] && p.buttons[i].pressed;
  const now = { l: b(14) || p.axes[0] < -0.5, r: b(15) || p.axes[0] > 0.5, f: b(0) || b(7), u: b(2) || b(1), s: b(9) };
  if (G.state === 'play') {
    if (now.l && !padPrev.l) G.lane = Math.max(0, G.lane - 1);
    if (now.r && !padPrev.r) G.lane = Math.min(G.lanes - 1, G.lane + 1);
    if (now.f && !padPrev.f) fire();
    if (now.u && !padPrev.u) usePower();
  } else if (now.f && !padPrev.f && (G.state === 'title' || G.state === 'over')) start(G.mode);
  if (now.s && !padPrev.s) togglePause();
  padPrev = now;
}

$('btnPower').addEventListener('click', e => { e.stopPropagation(); usePower(); });
$('btnPause').addEventListener('click', () => togglePause());
$('btnMute').addEventListener('click', () => toggleMute());
$('btnPlay').addEventListener('click', () => start('classic'));
$('btnDaily').addEventListener('click', () => start('daily'));
$('btnAgain').addEventListener('click', () => start(G.mode));
$('btnMenu').addEventListener('click', () => toTitle());
$('btnResume').addEventListener('click', () => togglePause());
$('btnQuit').addEventListener('click', () => { G.state = 'over'; $('paused').hidden = true; clearBoard(); toTitle(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') togglePause(); });

function toggleMute() {
  audio.unlock();
  audio.setMuted(!audio.muted);
  $('btnMute').innerHTML = `<i class="ph-bold ${audio.muted ? 'ph-speaker-slash' : 'ph-speaker-high'}" aria-hidden="true"></i>`;
}
function togglePause() {
  if (G.state === 'play' || G.state === 'warp') {
    G.pausedFrom = G.state;
    G.state = 'paused';
    $('paused').hidden = false;
    if (audio.ctx) audio.ctx.suspend();
  } else if (G.state === 'paused') {
    G.state = G.pausedFrom;
    $('paused').hidden = true;
    if (audio.ctx) audio.ctx.resume();
    last = performance.now();
  }
}

function clearBoard() {
  G.rows.forEach(removeRow);
  G.rows = [];
  G.projectiles.forEach(p => board.remove(p.mesh));
  G.projectiles = [];
}

function toTitle() {
  G.state = 'title';
  $('over').hidden = true;
  $('hud').hidden = true;
  $('title').hidden = false;
  audio.stopMusic();
  updateTitleBest();
  demoBoard();
}
function updateTitleBest() {
  const best = store.get('backfill-best', 0), daily = store.get(`backfill-daily-${today()}`, 0), sec = store.get('backfill-best-sector', 0);
  $('titleBest').textContent = best ? `High score ${best.toLocaleString()} · furthest sector ${sec}${daily ? ` · today's daily ${daily.toLocaleString()}` : ''}` : '';
}
if (audio.muted) $('btnMute').innerHTML = '<i class="ph-bold ph-speaker-slash" aria-hidden="true"></i>';

function start(mode) {
  audio.unlock();
  clearBoard();
  Object.assign(G, {
    mode, rng: mode === 'daily' ? mulberry32(seedFromString('backfill-' + today())) : mulberry32((Math.random() * 2 ** 32) >>> 0),
    score: 0, combo: 0, comboTimer: 0, bestCombo: 0, fever: 0, barrier: 3, power: null, phaseShots: 0, spreadShots: 0, slowT: 0,
    totalCleared: 0, shots: 0, junk: 0, linkSeq: 0, prevGaps: null, cooldown: 0, shake: 0, startTime: performance.now(),
  });
  audio.fever = false; audio.slow = false;
  applySector(0, true);
  G.lane = Math.floor(G.lanes / 2);
  G.frontZ = -7;
  fillRows(false);
  ship.visible = true; beam.visible = true; ghost.visible = true;
  ship.position.x = laneX(G.lane);
  $('title').hidden = true; $('over').hidden = true; $('paused').hidden = true;
  $('hud').hidden = false;
  hud.best.textContent = store.get(bestKey(), 0).toLocaleString();
  hud.score.textContent = '0';
  G.shownScore = 0;
  renderPips(); renderPower(); renderCombo();
  G.state = 'play';
  audio.startMusic();
  banner(mode === 'daily' ? `DAILY ${today()}` : 'SECTOR 1', G.sector.name, G.sector.tip);
}

// a gently scrolling board behind the title screen
function demoBoard() {
  clearBoard();
  G.rng = mulberry32(7);
  applySector(Math.floor(Math.random() * 6), true);
  G.frontZ = -3;
  fillRows(false);
  ship.visible = true; beam.visible = false; ghost.visible = false;
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  pollPad();
  if (G.state !== 'paused') step(dt);
  world.render();
}

function step(dt) {
  G.t += dt;
  const playing = G.state === 'play';
  const slowF = G.slowT > 0 ? 0.35 : 1;

  if (playing) {
    G.cooldown -= dt;
    const prog = G.sectorCleared / G.sector.target;
    let speed = G.sector.speed * (1 + 0.3 * prog) * slowF;
    if (G.frontZ < -11) speed *= 2; // pull rows in when the board runs thin
    G.frontZ += speed * CELL_D * dt;
    fillRows();
    updateProjectiles(dt);
    if (G.frontZ >= DANGER_Z) barrierHit();
    if (G.finalWave && G.rows.length === 0 && G.state === 'play') startWarp();

    if (G.combo > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) { G.combo = 0; renderCombo(); } }
    if (G.fever > 0) { G.fever -= dt; if (G.fever <= 0) { audio.fever = false; renderCombo(); } }
    if (G.slowT > 0) {
      const before = Math.ceil(G.slowT);
      G.slowT -= dt;
      if (G.slowT <= 0) { audio.slow = false; renderPower(); } else if (Math.ceil(G.slowT) !== before) renderPower();
    }
    // alarm when the stack is close
    const gap = (DANGER_Z - G.frontZ) / CELL_D;
    const alarm = gap < 2.2 ? 1 - gap / 2.2 : 0;
    world.fence.material.uniforms.uAlarm.value += (alarm - world.fence.material.uniforms.uAlarm.value) * Math.min(1, dt * 6);
    if (alarm > 0) { G.alarmT -= dt; if (G.alarmT <= 0) { audio.play('tick', { rate: 0.6, gain: 0.6 }); G.alarmT = 0.55 - alarm * 0.3; } }
  } else if (G.state === 'warp') {
    updateWarp(dt);
    world.fence.material.uniforms.uAlarm.value *= 0.9;
  } else if (G.state === 'title') {
    G.frontZ += 0.25 * CELL_D * dt;
    if (G.frontZ > -2) {
      // recycle the front row on the title screen
      const r = G.rows.shift();
      if (r) { removeRow(r); G.frontZ -= CELL_D; }
    }
    fillRows();
  }

  // glitched rows slide sideways
  if (playing) for (const r of G.rows) {
    if (r.type !== 'glitch') continue;
    r.glitchT -= dt * slowF;
    if (r.glitchT < 0.45) r.group.position.x = (Math.random() - 0.5) * 0.12;
    if (r.glitchT <= 0) {
      r.group.position.x = 0;
      r.glitchT = 2.6;
      const L = r.cells.length, d = r.glitchDir;
      const next = new Array(L).fill(null);
      r.cells.forEach((c, i) => {
        if (!c) return;
        const j = (i + d + L) % L;
        next[j] = c;
        c.mesh.userData.tx = laneX(j);
        if ((d > 0 && j < i) || (d < 0 && j > i)) c.mesh.position.x = laneX(j) - d * CELL_W;
      });
      r.cells = next;
      audio.play('glitch', { gain: 0.25, rate: 1.4 });
    }
  }

  // rows ease toward their slots; bricks animate
  const k = 1 - Math.exp(-dt * 12);
  G.rows.forEach((r, i) => {
    r.z += (rowZ(i) - r.z) * (Math.abs(rowZ(i) - r.z) > 0.01 ? k : 1);
    r.group.position.z = r.z;
    r.spawn = Math.min(1, r.spawn + dt * 2.5);
    const drop = 1 - r.spawn;
    r.cells.forEach((c, l) => {
      if (!c) return;
      const m = c.mesh;
      const sd = Math.max(0, Math.min(1, drop * 1.4 - l * 0.06));
      m.position.y = CELL_Y + sd * sd * 4;
      m.position.x += (m.userData.tx - m.position.x) * k;
      if (c.pop > 0) {
        c.pop = Math.max(0, c.pop - dt * 4);
        const s = Math.sin(c.pop * Math.PI);
        m.scale.set(1 + s * 0.25, 1 - s * 0.35, 1 + s * 0.25);
      } else if (r.waiting) {
        const s = 1 + Math.sin(G.t * 10) * 0.04;
        m.scale.set(s, 1, s);
      } else m.scale.set(1, 1, 1);
      if (c.core) c.core.scale.setScalar(1 + Math.sin(G.t * 9) * 0.3);
    });
  });

  // ship follows its lane, banks into the move
  const tx = laneX(G.lane);
  const prevX = ship.position.x;
  ship.position.x += (tx - ship.position.x) * (1 - Math.exp(-dt * 18));
  ship.position.z = SHIP_Z;
  ship.position.y = 0.05 + (reduced ? 0 : Math.sin(G.t * 3) * 0.05);
  const vx = (ship.position.x - prevX) / Math.max(dt, 1e-4);
  shipBody.rotation.z = THREE.MathUtils.clamp(-vx * 0.04, -0.5, 0.5);
  shipBody.position.z += (0 - shipBody.position.z) * Math.min(1, dt * 10);
  flame.scale.set(1, 0.8 + Math.random() * 0.4, 1);
  const accent = G.fever > 0 ? new THREE.Color().setHSL((G.t * 0.6) % 1, 1, 0.6) : world.palNow.accent;
  flame.material.color.copy(world.palNow.brick);
  underGlow.material.color.copy(accent).multiplyScalar(0.6);
  shipGlow.color.copy(accent);

  // aim beam and landing ghost
  if (playing && ship.visible) {
    const t = findTarget(G.lane, G.phaseShots > 0);
    const tz = t ? targetZ(t) : SPAWN_Z;
    const len = Math.max(0.5, SHIP_Z - 0.5 - tz);
    beam.visible = true;
    beam.scale.set(CELL_W * 0.95, len, 1);
    beam.position.set(ship.position.x, 0.03, SHIP_Z - 0.5 - len / 2);
    const bad = t && t.row < 0;
    beam.material.uniforms.uColor.value.set(bad ? 0xff3355 : G.phaseShots > 0 ? 0x9ffcff : world.palNow.brick.getHex());
    ghost.visible = !!t;
    if (t) {
      ghost.position.set(tx, CELL_Y, tz);
      ghost.material.color.set(bad ? 0xff3355 : 0xffffff);
      ghost.material.opacity = 0.35 + Math.sin(G.t * 8) * 0.15;
    }
  } else if (G.state !== 'title') { beam.visible = false; ghost.visible = false; }

  // score ticker
  if (G.shownScore !== G.score) {
    G.shownScore += Math.ceil((G.score - G.shownScore) * Math.min(1, dt * 10));
    if (Math.abs(G.score - G.shownScore) < 3) G.shownScore = G.score;
    hud.score.textContent = G.shownScore.toLocaleString();
  }

  // camera: shake + fov kick
  G.shake *= Math.exp(-dt * 7);
  G.fovKick *= Math.exp(-dt * 4);
  camera.position.copy(camBase);
  camera.position.x += (ship.position.x * 0.12) + (Math.random() - 0.5) * G.shake;
  camera.position.y += (Math.random() - 0.5) * G.shake;
  camera.lookAt(camLook.x + ship.position.x * 0.08, camLook.y, camLook.z);
  camera.fov = camera.userData.baseFov + G.fovKick * (reduced ? 0.2 : 1);
  camera.updateProjectionMatrix();

  world.uniforms.uFever.value += ((G.fever > 0 ? 1 : 0) - world.uniforms.uFever.value) * Math.min(1, dt * 3);
  world.bloom.strength = 0.42 + world.uniforms.uFever.value * 0.12 + G.fovKick * 0.01;
  const scrollSpeed = G.state === 'warp' ? 60 * Math.sin(Math.min(1, G.warpT / 3) * Math.PI) + 8 : playing ? 8 * slowF : 4;
  G.scroll += (scrollSpeed - G.scroll) * Math.min(1, dt * 3);
  world.update(dt, G.t, G.scroll);
  MATS.base.emissive.copy(world.palNow.brick);
  fx.update(dt);
  audio.update();
}


demoBoard();
updateTitleBest();
requestAnimationFrame(frame);
