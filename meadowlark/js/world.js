// Dresses the island: the village, windmill, lighthouse, dock, bridges, ruins, camp, beacon,
// then forests, groves, bushes, rocks and flower fields, and the colliders for all of it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { P, PATHS, RIVER, FALL_INDEX, HOUSES, HALF } from './layout.js';
import { heightAt, pathAt, waterAt, slopeAt, wetAt, normalAt } from './terrain.js';
import { K, PP, place, buildBatches, size } from './assets.js';
const fitScale = (p, len) => { const b = size(p), s = b.getSize(new THREE.Vector3()); return len / Math.max(s.x, s.z, 0.001); };
import { Trees, Flowers, Rocks } from './foliage.js';
import { blockGrass, grassHeight } from './grass.js';
import { addCircle, addBox, addSurface, boxes } from './collide.js';
import { makeNoise, mulberry32, smoothstep, clamp, lerp } from './util.js';

const { fbm, noise } = makeNoise(101);
const gy = (x, z) => heightAt(x, z);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FT = n => K(`fantasy-town-kit/${n}`), SK = n => K(`survival-kit/${n}`), NK = n => K(`nature-kit/${n}`);
export const UNIT = 2.2;                       // one fantasy-town cell in metres

export const MODELS = [
  ...['wall', 'wall-door', 'wall-window-shutters', 'wall-window-round', 'wall-wood', 'wall-wood-window-shutters', 'wall-wood-door', 'wall-wood-window-round', 'chimney', 'windmill', 'lantern',
    'stall-red', 'stall-green', 'stall-bench', 'cart', 'fence', 'fence-gate', 'hedge', 'hedge-large', 'fountain-round', 'fountain-center', 'banner-red', 'banner-green', 'stairs-stone', 'pillar-stone', 'wall-broken', 'wall-arch', 'wall-half', 'overhang'].map(FT),
  ...['campfire-pit', 'tent-canvas', 'barrel', 'signpost', 'signpost-single', 'chest', 'bucket', 'box', 'box-large', 'workbench', 'resource-wood', 'tree-log', 'bedroll', 'fish', 'tool-axe', 'resource-planks'].map(SK),
  ...['mushroom_red', 'mushroom_redGroup', 'mushroom_redTall', 'mushroom_tan', 'mushroom_tanGroup', 'log', 'log_large', 'log_stack', 'stump_round', 'stump_old', 'lily_large', 'lily_small',
    'statue_column', 'statue_columnDamaged', 'statue_ring', 'statue_obelisk', 'canoe', 'crop_pumpkin', 'crops_dirtRow', 'crops_wheatStageB', 'pot_large', 'hanging_moss'].map(NK),
  ...['lighthouse', 'dock-long', 'sail-boat', 'bench'].map(PP),
];

// ---------------------------------------------------------------- procedural textures
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
const roofTex = col => canvasTex(256, 256, (g, w, h) => {
  const r = mulberry32(col === 'red' ? 3 : 4);
  const base = col === 'red' ? [196, 86, 62] : [72, 150, 132];
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
  const rows = 8, cols = 6;
  for (let y = 0; y < rows; y++) for (let x = -1; x < cols + 1; x++) {
    const ox = (y % 2) * (w / cols / 2), cx = x * w / cols + ox, cy = y * h / rows;
    const v = 0.82 + r() * 0.3;
    g.fillStyle = `rgb(${base.map(c => Math.min(255, c * v)).join(',')})`;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + w / cols, cy); g.lineTo(cx + w / cols, cy + h / rows * 0.6);
    g.quadraticCurveTo(cx + w / cols / 2, cy + h / rows * 1.15, cx, cy + h / rows * 0.6); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,20,10,0.25)'; g.lineWidth = 2; g.stroke();
  }
}, true);
const cobbleTex = () => canvasTex(512, 512, (g, w, h) => {
  const r = mulberry32(8); g.fillStyle = '#8a7b68'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const x = r() * w, y = r() * h, s = 10 + r() * 12, v = 128 + r() * 52;
    g.fillStyle = `rgb(${v * 1.02},${v * 0.93},${v * 0.8})`;
    g.beginPath(); g.ellipse(x, y, s, s * (0.7 + r() * 0.3), r() * 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 2.5; g.stroke();
  }
}, true);
const plankTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = mulberry32(12);
  for (let i = 0; i < 8; i++) {
    const v = 0.8 + r() * 0.35; g.fillStyle = `rgb(${150 * v},${104 * v},${66 * v})`; g.fillRect(0, i * h / 8, w, h / 8 - 3);
    g.fillStyle = 'rgba(60,35,20,0.6)'; g.fillRect(0, i * h / 8 + h / 8 - 3, w, 3);
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(80,50,30,0.25)'; g.fillRect(r() * w, i * h / 8 + r() * h / 8, 30 + r() * 60, 1.5); }
  }
}, true);

// ---------------------------------------------------------------- pieces
function gableRoof(w, d, rise, tex) {
  // a prism with overhangs and a little thickness; the ridge runs along z
  const ow = w / 2 + 0.45, od = d / 2 + 0.45, t = 0.18;
  const shape = new THREE.Shape(); shape.moveTo(-ow, 0); shape.lineTo(0, rise); shape.lineTo(ow, 0); shape.lineTo(ow, -t); shape.lineTo(0, rise - t * 1.4); shape.lineTo(-ow, -t); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: od * 2, bevelEnabled: false }); g.translate(0, 0, -od);
  // UVs: slope length across, depth along, so tiles line up in rows
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); uv.setXY(i, z / 2.2, (Math.abs(x) * 0.9 + (rise - y)) / 2.2); }
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
const roofTexes = {};
export const interiorMat = new THREE.MeshStandardMaterial({ color: 0x4a3424, emissive: 0xffa24a, emissiveIntensity: 0, roughness: 1 });
function house(scene, h) {
  const [cx, cz] = h.c, [nw, nd] = h.s, yaw = h.yaw, U = UNIT;
  const base = Math.min(gy(cx, cz), gy(cx + 3, cz + 3), gy(cx - 3, cz - 3), gy(cx + 3, cz - 3), gy(cx - 3, cz + 3)) - 0.05;
  const rot = (lx, lz) => V(cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), 0, cz - lx * Math.sin(yaw) + lz * Math.cos(yaw));
  const W = nw * U, D = nd * U;
  // a stone plinth so the house sits into the slope
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 1.2, D + 0.3), new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.95 }));
  plinth.position.copy(rot(0, 0)).setY(base - 0.45); plinth.rotation.y = yaw; plinth.receiveShadow = plinth.castShadow = true; scene.add(plinth);
  // walls: the front (+z side, local) gets the door; windows elsewhere; timber upstairs
  const r = mulberry32(Math.round(cx * 13 + cz * 7));
  for (let s = 0; s < h.storeys; s++) {
    const y = base + 0.15 + s * U, wood = s > 0;
    const edges = [];
    for (let i = 0; i < nw; i++) { edges.push({ lx: (i + 0.5) * U - W / 2, lz: D / 2, dir: -Math.PI / 2, front: true, i }); edges.push({ lx: (i + 0.5) * U - W / 2, lz: -D / 2, dir: Math.PI / 2 }); }
    for (let i = 0; i < nd; i++) { edges.push({ lx: W / 2, lz: (i + 0.5) * U - D / 2, dir: 0 }); edges.push({ lx: -W / 2, lz: (i + 0.5) * U - D / 2, dir: Math.PI }); }
    for (const e of edges) {
      let piece = wood ? 'wall-wood' : 'wall';
      const door = s === 0 && e.front && e.i === Math.floor(nw / 2);
      if (door) piece = wood ? 'wall-wood-door' : 'wall-door';
      else if (r() < 0.55) piece = (wood ? 'wall-wood-' : 'wall-') + (r() < 0.8 ? 'window-shutters' : 'window-round');
      // the piece's panel sits on its +x edge, so step back half a cell along the facing
      const ox = Math.cos(e.dir) * U / 2, oz = -Math.sin(e.dir) * U / 2;
      place(FT(piece), rot(e.lx - ox, e.lz - oz).setY(y), yaw + e.dir, U);
    }
  }
  const top = base + 0.15 + h.storeys * U;
  // a warm room inside: seen through the window holes, it glows after dusk
  const room = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, h.storeys * U - 0.1, D - 0.5), interiorMat);
  room.position.copy(rot(0, 0)).setY(base + 0.15 + h.storeys * U / 2); room.rotation.y = yaw; scene.add(room);
  const tex = roofTexes[h.roof] || (roofTexes[h.roof] = roofTex(h.roof));
  const roof = gableRoof(W, D, W * 0.46, tex); roof.position.copy(rot(0, 0)).setY(top); roof.rotation.y = yaw; scene.add(roof);
  // gable ends: plaster triangles
  const tri = new THREE.Shape(); tri.moveTo(-W / 2, 0); tri.lineTo(0, W * 0.46 - 0.15); tri.lineTo(W / 2, 0); tri.closePath();
  const gm = new THREE.MeshStandardMaterial({ color: 0xf0e4d0, roughness: 0.9 });
  for (const sz of [-1, 1]) { const g = new THREE.Mesh(new THREE.ShapeGeometry(tri), gm); g.position.copy(rot(0, sz * (D / 2 - 0.12))).setY(top); g.rotation.y = yaw + (sz < 0 ? Math.PI : 0); g.castShadow = true; scene.add(g); }
  // timber beam along the top of the ground floor
  place(FT('chimney'), rot(W * 0.22, -D * 0.2).setY(top + W * 0.2), yaw, U * 1.1);
  addBox(cx, cz, W / 2 + 0.15, D / 2 + 0.15, yaw, 99); boxes[boxes.length - 1].ctop = top + W * 0.46;
  blockGrass(cx, cz, Math.max(W, D) * 0.62);
  // doorstep, flower boxes, a lantern by the door
  const doorP = rot(0, D / 2 + 0.9);
  place(FT('lantern'), rot(W / 2 - 0.4, D / 2 + 0.5).setY(gy(doorP.x, doorP.z)), yaw, 1.6);
  return { chimney: rot(W * 0.22 + 0.7, -D * 0.2).setY(top + W * 0.2 + U * 1.1), door: doorP.setY(gy(doorP.x, doorP.z)), top };
}

function bridge(scene, x, z, yaw, len, width = 2.6) {
  const rise = 0.9, tex = plankTex(), segs = 16;
  const deckPts = []; for (let i = 0; i <= segs; i++) { const t = i / segs; deckPts.push([(t - 0.5) * len, Math.sin(t * Math.PI) * rise]); }
  const ends = [gy(x + Math.sin(yaw) * len / 2, z + Math.cos(yaw) * len / 2), gy(x - Math.sin(yaw) * len / 2, z - Math.cos(yaw) * len / 2)];
  const baseY = Math.max(ends[0], ends[1], waterAt(x, z) + 0.6);
  const geo = []; const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  for (let i = 0; i < segs; i++) {
    const [a, ya] = deckPts[i], [b, yb] = deckPts[i + 1], l = Math.hypot(b - a, yb - ya);
    const g = new THREE.BoxGeometry(width, 0.16, l + 0.02); g.rotateX(-Math.atan2(yb - ya, b - a)); g.translate(0, (ya + yb) / 2, (a + b) / 2); geo.push(g);
  }
  // railings and posts
  const railM = new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.9 });
  const rails = [];
  for (const s of [-1, 1]) for (let i = 0; i <= segs; i += 2) {
    const [a, ya] = deckPts[i]; const p = new THREE.BoxGeometry(0.12, 0.85, 0.12); p.translate(s * (width / 2 - 0.08), ya + 0.45, a); rails.push(p);
    if (i < segs) { const [b, yb] = deckPts[i + 2]; const l = Math.hypot(b - a, yb - ya); const rr = new THREE.BoxGeometry(0.08, 0.08, l); rr.rotateX(-Math.atan2(yb - ya, b - a)); rr.translate(s * (width / 2 - 0.08), (ya + yb) / 2 + 0.85, (a + b) / 2); rails.push(rr); }
  }
  const deck = new THREE.Mesh(mergeGeometries(geo), mat), rail = new THREE.Mesh(mergeGeometries(rails), railM);
  for (const m of [deck, rail]) { m.position.set(x, baseY, z); m.rotation.y = yaw; m.castShadow = m.receiveShadow = true; scene.add(m); }
  // walkable deck
  const c = Math.cos(yaw), s = Math.sin(yaw), R = len / 2 + 1;
  addSurface((px, pz) => {
    const dx = px - x, dz = pz - z, lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) > width / 2 || Math.abs(lz) > len / 2) return -Infinity;
    return baseY + Math.sin((lz / len + 0.5) * Math.PI) * rise + 0.08;
  }, x - R, x + R, z - R, z + R);
  // rails stop you walking off the sides
  for (const sd of [-1, 1]) addBox(x + c * sd * (width / 2 + 0.05), z - s * sd * (width / 2 + 0.05), 0.08, len / 2, yaw, 99);
  blockGrass(x, z, len / 2);
}

function windmill(scene) {
  const [x, z] = P.windmill.c, y = gy(x, z) - 0.3;
  const stone = new THREE.MeshStandardMaterial({ color: 0xe9dfcc, roughness: 0.9 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.0, 9, 14), stone); tower.position.set(x, y + 4.5, z);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.7, 2.8, 14), new THREE.MeshStandardMaterial({ map: roofTex('red'), roughness: 0.85 })); cap.position.set(x, y + 10.3, z);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.35, 14), new THREE.MeshStandardMaterial({ color: 0x7a5236 })); band.position.set(x, y + 8.9, z);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.3), new THREE.MeshStandardMaterial({ color: 0x6a4630 })); door.position.set(x, y + 1.0, z + 2.85); door.rotation.x = -0.1;
  for (const m of [tower, cap, band, door]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
  // the sails turn; quests can stop and restart them
  const hub = new THREE.Group(); hub.position.set(x, y + 8.6, z + 2.4); scene.add(hub);
  const sailM = new THREE.MeshStandardMaterial({ color: 0xf4ecdc, roughness: 0.85, side: THREE.DoubleSide }), frameM = new THREE.MeshStandardMaterial({ color: 0x7a5236 });
  const sails = [];
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7.2, 0.18), frameM); beam.position.y = 3.6;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 5.6), sailM); sail.position.set(0.85, 4.1, 0.05);
    const lattice = new THREE.Mesh(new THREE.BoxGeometry(0.06, 5.6, 0.06), frameM); lattice.position.set(1.6, 4.1, 0.08);
    arm.add(beam, sail, lattice); for (const m of [beam, sail, lattice]) m.castShadow = true; hub.add(arm); sails.push(arm);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 10), frameM); axle.rotation.x = Math.PI / 2; hub.add(axle);
  addCircle(x, z, 3.0, 99); blockGrass(x, z, 3.6);
  return { hub, sails, speed: 0.6 };
}

// ---------------------------------------------------------------- the whole island
export function buildWorld(scene) {
  const out = { lanterns: [], chimneys: [], doors: [], bridges: [] };
  const trees = new Trees(scene), flowers = new Flowers(scene), rocks = new Rocks(scene);
  const r = mulberry32(2024);

  // ---- village plaza
  const [vx, vz] = P.village.c;
  {
    const g = new THREE.RingGeometry(0.01, 8, 64, 16); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, gy(vx + p.getX(i), vz + p.getZ(i)) + 0.06);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 2.4, p.getZ(i) / 2.4);
    g.computeVertexNormals();
    const plaza = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: cobbleTex(), roughness: 0.95 })); plaza.position.set(vx, 0, vz); plaza.receiveShadow = true; scene.add(plaza);
    blockGrass(vx, vz, 8.3);
    const fy = gy(vx, vz);
    place(FT('fountain-round'), V(vx, fy, vz), 0, 2.6);
    place(FT('fountain-center'), V(vx, fy, vz), 0, 2.6);
    addCircle(vx, vz, 2.7, 99);
    out.fountain = V(vx, fy + 0.5, vz);
    // market stalls and clutter around the square
    place(FT('stall-red'), V(vx + 6, gy(vx + 6, vz - 4), vz - 4), -0.6, 2.2); addBox(vx + 6, vz - 4, 1.2, 1.2, -0.6, 99);
    place(FT('stall-green'), V(vx - 6.5, gy(vx - 6.5, vz - 3), vz - 3), 0.7, 2.2); addBox(vx - 6.5, vz - 3, 1.2, 1.2, 0.7, 99);
    place(FT('cart'), V(vx + 7.5, gy(vx + 7.5, vz + 4), vz + 4), 2.2, 2.2); addBox(vx + 7.5, vz + 4, 0.8, 1.5, 2.2, 99);
    for (const [ox, oz] of [[5.5, -6.5], [6.4, -6.0], [-7.6, -1.2], [8.5, 1.5]]) { place(SK('barrel'), V(vx + ox, gy(vx + ox, vz + oz), vz + oz), r() * 6, 2.6); addCircle(vx + ox, vz + oz, 0.35, gy(vx + ox, vz + oz) + 0.85); }
    for (const [ox, oz] of [[-5.8, -5.6], [7.2, -2.6]]) { place(SK('box-large'), V(vx + ox, gy(vx + ox, vz + oz), vz + oz), r() * 6, 2.4); addBox(vx + ox, vz + oz, 0.4, 0.4, 0, gy(vx + ox, vz + oz) + 0.7); }
    for (const [ox, oz, yy] of [[-3.5, 6.5, 0.2], [3.8, 6.4, -0.3], [-7.2, 3.6, 1.4]]) { place(PP('bench'), V(vx + ox, gy(vx + ox, vz + oz), vz + oz), yy, fitScale(PP('bench'), 1.9)); addBox(vx + ox, vz + oz, 0.95, 0.4, yy, 99); }
    for (const a of [0.5, 2.1, 3.7, 5.3]) {
      const lx = vx + Math.cos(a) * 8.6, lz = vz + Math.sin(a) * 8.6;
      place(FT('lantern'), V(lx, gy(lx, lz), lz), a, 2.2); addCircle(lx, lz, 0.25, 99);
      out.lanterns.push(V(lx, gy(lx, lz) + 3.15, lz));
    }
    place(SK('signpost'), V(vx - 2, gy(vx - 2, vz - 8.6), vz - 8.6), 0.4, 3); addCircle(vx - 2, vz - 8.6, 0.2, 99);
  }
  // ---- cottages
  for (const h of HOUSES) { const hh = house(scene, h); out.chimneys.push(hh.chimney); out.doors.push(hh.door); }
  // gardens: pumpkin and wheat patches, flower beds, hedges
  for (const [x, z] of [[-30, 32], [6, 34]]) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const px = x + i * 1.4, pz = z + j * 1.5; place(NK('crops_dirtRow'), V(px, gy(px, pz) + 0.02, pz), 0, 1.4);
      place(NK(j === 1 ? 'crops_wheatStageB' : 'crop_pumpkin'), V(px, gy(px, pz) + 0.05, pz), r() * 6, j === 1 ? 1.4 : 1.3);
    }
    blockGrass(x + 2.1, z + 1.5, 3.4);
  }
  // laundry line between two cottages
  out.laundry = [V(-24, gy(-24, 28) + 2.2, 28), V(-17, gy(-17, 34) + 2.2, 34)];

  // ---- bridges where paths cross the river
  for (const p of PATHS) for (let s = 0; s < p.pts.length - 1; s++) {
    const [ax, az] = p.pts[s], [bx, bz] = p.pts[s + 1];
    for (let t = 0; t <= 1; t += 0.02) {
      const x = lerp(ax, bx, t), z = lerp(az, bz, t);
      if (waterAt(x, z) > 0.5 && heightAt(x, z) < waterAt(x, z) - 0.3 && !out.bridges.some(b => Math.hypot(b.x - x, b.z - z) < 14)) {
        const yaw = Math.atan2(bx - ax, bz - az);
        // span: walk both ways until dry ground
        let a = 0, b = 0; while (a < 14 && waterAt(x - Math.sin(yaw) * a, z - Math.cos(yaw) * a) > -50) a += 0.5; while (b < 14 && waterAt(x + Math.sin(yaw) * b, z + Math.cos(yaw) * b) > -50) b += 0.5;
        const mid = (b - a) / 2, cx = x + Math.sin(yaw) * mid, cz = z + Math.cos(yaw) * mid;
        bridge(scene, cx, cz, yaw, a + b + 3.4);
        out.bridges.push({ x: cx, z: cz, yaw });
      }
    }
  }

  // ---- windmill on its hill
  out.windmill = windmill(scene);
  for (let i = 0; i < 5; i++) { const a = 2.6 + i * 0.32, x = P.windmill.c[0] + Math.cos(a) * 6, z = P.windmill.c[1] + Math.sin(a) * 6; place(FT('fence'), V(x, gy(x, z), z), -a, 2.2); }
  for (const [ox, oz] of [[3.6, 3.2], [4.4, 2.6]]) { const x = P.windmill.c[0] + ox, z = P.windmill.c[1] + oz; place(SK('box-large'), V(x, gy(x, z), z), r() * 6, 2.6); addCircle(x, z, 0.45, gy(x, z) + 0.75); }

  // ---- lighthouse on the cape
  {
    const [x, z] = P.lighthouse; const y = gy(x, z);
    place(PP('lighthouse'), V(x, y - 0.2, z), -2.2, 1); addCircle(x, z, 2.4, 99); blockGrass(x, z, 3.2);
    out.lighthouse = V(x, y, z);
  }
  // ---- dock and boats at the beach
  {
    // the Poly Pizza dock is 9 m wide with its deck 3.8 m up; at half size it suits the little islanders.
    // Find where the beach meets the water and start the deck there, level with the sand.
    const x = P.dock.c[0], S = 0.5, HW = 3.7 * S, HL = 10 * S, DECK = 3.8 * S;
    let shore = P.dock.c[1] - 10; while (shore < P.dock.c[1] + 20 && gy(x, shore) > 0.9) shore += 0.25;
    const z0 = shore - 2.5, cz = z0 + HL, deck = Math.max(gy(x, z0 + 0.4) + 0.12, 1.1);
    place(PP('dock-long'), V(x, deck - DECK, cz), 0, S);
    addSurface((px, pz) => (Math.abs(px - x) < HW && pz > z0 - 0.2 && pz < z0 + HL * 2) ? deck : -Infinity, x - HW, x + HW, z0 - 0.2, z0 + HL * 2);
    // a short ramp of sand up to the first plank, so you never have to hop onto it
    addSurface((px, pz) => (Math.abs(px - x) < HW && pz > z0 - 2.4 && pz <= z0 - 0.2) ? lerp(gy(px, z0 - 2.4), deck, (pz - (z0 - 2.4)) / 2.2) : -Infinity, x - HW, x + HW, z0 - 2.4, z0);
    out.dockEnd = V(x, deck, z0 + HL * 2 - 1);
    out.dockStart = V(x, deck, z0);
    // clutter sits on the planks along the edges, leaving the middle clear to walk
    for (const [ox, oz] of [[1.25, 1.6], [1.3, 2.4], [-1.3, 5.5]]) { place(SK('barrel'), V(x + ox, deck, z0 + oz), r() * 6, 2.4); addCircle(x + ox, z0 + oz, 0.32, deck + 0.8); }
    place(SK('bucket'), V(x - 1.2, deck, z0 + 7.6), 0, 2.4);
    place(SK('box'), V(x + 1.2, deck, z0 + 6.4), 0.3, 2.6); addCircle(x + 1.2, z0 + 6.4, 0.32, deck + 0.65);
    // boats tied up alongside
    place(NK('canoe'), V(x - HW - 1.1, 0.02, z0 + 4.5), 0.08, 2.2);
    const boat = PP('sail-boat'); place(boat, V(x + HW + 2.6, 0, z0 + 7), Math.PI * 0.5, fitScale(boat, 5.5));
    out.boat = V(x + HW + 2.6, 0, z0 + 7);
  }
  // ---- ruins on the eastern knoll
  {
    const [x, z] = P.ruins;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, px = x + Math.cos(a) * 5.5, pz = z + Math.sin(a) * 5.5;
      place(NK(i % 3 === 1 ? 'statue_columnDamaged' : 'statue_column'), V(px, gy(px, pz) - 0.1, pz), r() * 6, 3.2); addCircle(px, pz, 0.55, 99);
    }
    place(NK('statue_ring'), V(x, gy(x, z) - 0.2, z), 0.4, 3.2);
    out.ruins = V(x, gy(x, z), z);
    blockGrass(x, z, 2.5);
  }
  // ---- camp at the foot of the ramp
  {
    const [x, z] = P.camp;
    place(SK('tent-canvas'), V(x - 3, gy(x - 3, z - 2), z - 2), 0.6, 4.5); addBox(x - 3, z - 2, 1.3, 1.3, 0.6, 99);
    place(SK('campfire-pit'), V(x, gy(x, z), z), 0, 4.5);
    out.campfire = V(x, gy(x, z) + 0.25, z);
    for (const a of [0.4, 2.2, 4.0]) { const px = x + Math.cos(a) * 1.9, pz = z + Math.sin(a) * 1.9; place(SK('tree-log'), V(px, gy(px, pz) - 0.1, pz), -a, 3); addCircle(px, pz, 0.4, gy(px, pz) + 0.45); }
    place(SK('workbench'), V(x + 3, gy(x + 3, z + 1), z + 1), 1.2, 4.4); addCircle(x + 3, z + 1, 0.8, 99);
    place(SK('bedroll'), V(x - 1.2, gy(x - 1.2, z + 2.6), z + 2.6), 0.3, 4.4);
    blockGrass(x, z, 3.2);
  }
  // ---- beacon on the summit
  {
    const [x, z] = P.summit, y = gy(x, z);
    const stone = new THREE.MeshStandardMaterial({ color: 0xa9a197, roughness: 0.95, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 1.3, 9), stone); base.position.set(x, y + 0.4, z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.0, 0.7, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a4440, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide })); bowl.position.set(x, y + 1.4, z);
    for (const m of [base, bowl]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
    addCircle(x, z, 2.0, y + 1.0);
    out.beacon = V(x, y + 1.5, z);
    for (let i = 0; i < 6; i++) { const a = i * 1.05, px = x + Math.cos(a) * 4.5, pz = z + Math.sin(a) * 4.5; rocks.add(px, gy(px, pz), pz, 0.7 + r() * 0.5, 0.6 + r() * 0.5, 0.7 + r() * 0.5, r() * 6); }
  }

  // ---- orchard rows
  out.appleTrees = [];
  {
    const [ox, oz] = P.orchard.c;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 1; j++) {
      const x = ox + i * 6.5 + (j % 2) * 3, z = oz + j * 6.5 + 2; if (Math.hypot(x - ox, z - oz) > 18) continue;
      const y = gy(x, z); trees.add('apple', x, y, z, 1 + r() * 0.2, r() * 6); addCircle(x, z, 0.35, 99); out.appleTrees.push(V(x, y, z));
    }
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 1.2 + 2.4, x = ox + Math.cos(a) * 19, z = oz + Math.sin(a) * 19; place(FT('fence'), V(x, gy(x, z), z), -a, 2.2); }
    for (const [px, pz] of [[ox + 9, oz - 9], [ox + 10, oz - 8]]) { place(SK('box'), V(px, gy(px, pz), pz), r() * 3, 3.4); addCircle(px, pz, 0.45, gy(px, pz) + 0.8); }
  }

  // ---- trees, bushes and rocks across the island
  const near = (x, z, pts, d) => pts.some(p => Math.hypot(p[0] - x, p[1] - z) < d);
  const avoid = [P.village.c, P.orchard.c, P.windmill.c, P.lighthouse, P.ruins, P.camp, P.summit, P.pond.c, P.dock.c, P.spawn];
  for (let z = -HALF; z < HALF; z += 4.2) for (let x = -HALF; x < HALF; x += 4.2) {
    const px = x + (r() - 0.5) * 3.6, pz = z + (r() - 0.5) * 3.6, h = gy(px, pz);
    if (h < 1.8 || waterAt(px, pz) > -50 || pathAt(px, pz) > 0.08 || slopeAt(px, pz) > 0.42 || wetAt(px, pz) > 0.7) continue;
    if (near(px, pz, avoid, 13) || Math.hypot(px - P.village.c[0], pz - P.village.c[1]) < 27) continue;
    const forest = smoothstep(P.forest.r + 14, P.forest.r - 6, Math.hypot(px - P.forest.c[0], pz - P.forest.c[1]) + (fbm(px * 0.05, pz * 0.05) - 0.5) * 20);
    const meadow = smoothstep(P.meadow.r + 6, P.meadow.r - 6, Math.hypot(px - P.meadow.c[0], pz - P.meadow.c[1]));
    const grove = smoothstep(0.56, 0.68, fbm(px * 0.035 + 3, pz * 0.035 - 8));
    const plateau = h > 15 ? 0.32 : 0;
    let p = Math.max(forest * 0.85, grove * 0.6, plateau) * (1 - meadow * 0.92);
    if (h > 30) p = Math.max(p, 0.22) * (h > 44 ? 0.4 : 1);
    if (r() > p) {
      if (r() < 0.07 && meadow < 0.5) { trees.add('bush', px, h - 0.1, pz, 0.8 + r() * 0.7, r() * 6); }
      continue;
    }
    let kind;
    if (forest > 0.5) kind = r() < 0.55 ? 'pine' : r() < 0.6 ? 'oak' : 'birch';
    else if (h > 15) kind = r() < 0.45 ? 'pine' : r() < 0.55 ? 'autumn' : 'oak';
    else kind = r() < 0.4 ? 'oak' : r() < 0.55 ? 'round' : r() < 0.5 ? 'birch' : 'autumn';
    const s = 0.85 + r() * 0.45;
    trees.add(kind, px, h - 0.15, pz, s, r() * 6);
    addCircle(px, pz, 0.45 * s, 99);
    // a bush or two at the foot of most trees
    if (r() < 0.45) { const a = r() * 6.28, d = 1.6 + r() * 1.5; const bx = px + Math.cos(a) * d, bz = pz + Math.sin(a) * d; if (pathAt(bx, bz) < 0.1 && waterAt(bx, bz) < -50) trees.add('bush', bx, gy(bx, bz) - 0.1, bz, 0.7 + r() * 0.6, r() * 6); }
  }
  // designed trees: blossoms in the village and on the way up, birches by the pond
  for (const [x, z, k, s] of [[-2, 14, 'blossom', 1.1], [-30, 40, 'blossom', 1.0], [8, 38, 'round', 1.1], [-26, 12, 'oak', 1.2], [-36, -46, 'blossom', 1.2], [-30, -70, 'blossom', 1.0], [6, -38, 'birch', 1.1], [26, -34, 'birch', 1.0], [24, -24, 'blossom', 1.1], [-16, 4, 'autumn', 1.1], [20, 30, 'oak', 1.2], [-44, 30, 'round', 1.0]]) {
    const y = gy(x, z); trees.add(k, x, y - 0.15, z, s, r() * 6); addCircle(x, z, 0.4 * s, 99);
  }
  // rocks: along the cliff, the riverbanks, the beaches and the mountain
  for (let i = 0; i < 2600; i++) {
    const x = (r() - 0.5) * 2 * (HALF - 10), z = (r() - 0.5) * 2 * (HALF - 10), h = gy(x, z), sl = slopeAt(x, z);
    if (waterAt(x, z) > -50 && h > waterAt(x, z) - 0.4) continue;
    if (pathAt(x, z) > 0.1 || Math.hypot(x - P.village.c[0], z - P.village.c[1]) < 24) continue;
    let p = 0.002;
    if (sl > 0.35) p = 0.08;                     // cliffs and steep slopes
    if (wetAt(x, z) > 0.5) p = 0.03;             // riverbanks
    if (h > -1 && h < 1.6) p = 0.02;             // beaches
    if (h > 30) p = 0.03;
    if (r() > p) continue;
    const s = 0.45 + r() * (sl > 0.35 ? 2.2 : 1.1);
    rocks.add(x, h - s * 0.25, z, s * (0.8 + r() * 0.5), s * (0.6 + r() * 0.6), s * (0.8 + r() * 0.5), r() * 6);
    if (s > 0.9) { addCircle(x, z, s * 0.85, h + s * 0.45); blockGrass(x, z, s * 0.9); }
  }
  // stepping stones across the stream above the pond, and boulders around the falls
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, x = P.pond.c[0] + Math.cos(a) * 10.5, z = P.pond.c[1] + Math.sin(a) * 10; if (z < P.pond.c[1] - 6) continue; rocks.add(x, gy(x, z) - 0.3, z, 0.9 + r() * 0.8, 0.7 + r() * 0.5, 0.9 + r() * 0.8, r() * 6); }
  for (const [x, z, s] of [[10.5, -42.5, 2.4], [18.6, -42, 2.6], [11, -38, 1.6], [19.5, -37.5, 1.4], [13, -48, 1.8], [17.4, -47, 1.6]]) { const h = gy(x, z); rocks.add(x, h - s * 0.3, z, s, s * 1.1, s, r() * 6); addCircle(x, z, s * 0.8, h + s * 0.6); }

  // ---- forest floor: mushrooms, logs and stumps
  for (let i = 0; i < 160; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * P.forest.r, x = P.forest.c[0] + Math.cos(a) * d, z = P.forest.c[1] + Math.sin(a) * d;
    if (pathAt(x, z) > 0.2 || waterAt(x, z) > -50 || slopeAt(x, z) > 0.4) continue;
    const pick = r(), y = gy(x, z);
    if (pick < 0.45) place(NK(['mushroom_red', 'mushroom_redGroup', 'mushroom_tan', 'mushroom_tanGroup'][Math.floor(r() * 4)]), V(x, y - 0.02, z), r() * 6, 2.2 + r() * 1.2);
    else if (pick < 0.6) { place(NK(r() < 0.5 ? 'log' : 'log_large'), V(x, y - 0.05, z), r() * 6, 2.4); addCircle(x, z, 0.6, y + 0.5); }
    else if (pick < 0.7) { place(NK(r() < 0.5 ? 'stump_round' : 'stump_old'), V(x, y - 0.05, z), r() * 6, 2.4); addCircle(x, z, 0.5, y + 0.5); }
  }
  // lily pads on the pond
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.28, d = 3 + r() * 5.5, x = P.pond.c[0] + Math.cos(a) * d, z = P.pond.c[1] + Math.sin(a) * d;
    if (z < P.pond.c[1] - 5) continue;
    place(NK(r() < 0.5 ? 'lily_large' : 'lily_small'), V(x, P.pond.level + 0.03, z), r() * 6, 2.2);
  }

  // ---- flowers: a dense field in the meadow, drifts elsewhere, beds in the village
  const palettes = [[0xfff6e8, 0xffd84a], [0xb59cff, 0x8cc8ff, 0xfff6e8], [0xff8fb0, 0xffffff], [0xffd84a, 0xff7a5a]];
  for (let i = 0; i < 9000; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * (P.meadow.r + 6), x = P.meadow.c[0] + Math.cos(a) * d, z = P.meadow.c[1] + Math.sin(a) * d;
    if (grassHeight(x, z) <= 0) continue;
    if (fbm(x * 0.08, z * 0.08) < 0.4 + d / (P.meadow.r + 6) * 0.15) continue;
    const pal = palettes[Math.floor(fbm(x * 0.03 + 9, z * 0.03) * 4.99) % 4];
    flowers.add(x, gy(x, z), z, 0.6 + r() * 0.5, pal[Math.floor(r() * pal.length)]);
  }
  for (let i = 0; i < 9000; i++) {
    const x = (r() - 0.5) * 2 * HALF, z = (r() - 0.5) * 2 * HALF;
    if (fbm(x * 0.05 + 30, z * 0.05) < 0.6 || grassHeight(x, z) <= 0) continue;
    flowers.add(x, gy(x, z), z, 0.45 + r() * 0.4);
  }
  // alpine flowers on the mountain: little white and violet stars
  for (let i = 0; i < 4000; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * 34, x = P.summit[0] + Math.cos(a) * d, z = P.summit[1] + Math.sin(a) * d;
    if (gy(x, z) < 28 || grassHeight(x, z) <= 0 || fbm(x * 0.09, z * 0.09) < 0.45) continue;
    flowers.add(x, gy(x, z), z, 0.4 + r() * 0.3, r() < 0.6 ? 0xffffff : 0xb59cff);
  }
  for (const h of HOUSES) for (let i = 0; i < 40; i++) {
    const a = r() * 6.28, d = 4.5 + r() * 2.2, x = h.c[0] + Math.cos(a) * d, z = h.c[1] + Math.sin(a) * d;
    if (pathAt(x, z) > 0.3) continue; flowers.add(x, gy(x, z), z, 0.5 + r() * 0.3);
  }

  trees.build(); flowers.build(); rocks.build();
  out.batches = buildBatches(scene);
  out.trees = trees; out.flowers = flowers;
  return out;
}
