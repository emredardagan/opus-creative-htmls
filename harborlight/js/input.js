// Camera controls and tool interaction: drag-to-build roads/rails/zones, building ghosts, inspection.
import * as THREE from 'three';
import { N, TOOLS, KIND, TERR } from './config.js';
import { clamp } from './util.js';
import { gltf } from './models.js';
import { specParts } from './city.js';
import { fitScale, placeMatrix } from './models.js';
import { fmtMoney } from './util.js';

export class Input {
  constructor(stage, world, city, ui, sfx) {
    this.stage = stage; this.w = world; this.city = city; this.ui = ui; this.sfx = sfx;
    this.tool = 'select'; this.rot = 0;
    this.canvas = stage.renderer.domElement;
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ptrs = new Map(); this.drag = null; this.hover = null; this.keys = new Set();
    // tile highlight quads
    const g = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
    this.hl = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }), N * N);
    this.hl.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * N * 3), 3);
    this.hl.count = 0; this.hl.renderOrder = 3; this.hl.frustumCulled = false;
    stage.scene.add(this.hl);
    this.ghost = null; this.ghostType = null;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x16a3b5, transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.visible = false; this.ring.position.y = 0.05; stage.scene.add(this.ring);
    this.bind();
  }
  setTool(t) {
    this.tool = t; this.drag = null;
    this.stage.terrain.uniforms.uGrid.value = t === 'select' ? 0 : 1;
    if (this.ghost) { this.stage.scene.remove(this.ghost); this.ghost = null; this.ghostType = null; }
    this.hl.count = 0; this.ring.visible = false;
    this.canvas.style.cursor = t === 'select' ? 'grab' : 'crosshair';
  }
  // ---------------------------------------------------------------- picking
  tileAt(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.stage.camera);
    const p = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    return { x: Math.floor(p.x + N / 2), z: Math.floor(p.z + N / 2), p };
  }
  // ---------------------------------------------------------------- previews
  linePath(a, b) {
    const out = [];
    const dx = b.x - a.x, dz = b.z - a.z, sx = Math.sign(dx), sz = Math.sign(dz);
    const xFirst = Math.abs(dx) >= Math.abs(dz);
    let x = a.x, z = a.z; out.push([x, z]);
    if (xFirst) { while (x !== b.x) { x += sx; out.push([x, z]); } while (z !== b.z) { z += sz; out.push([x, z]); } }
    else { while (z !== b.z) { z += sz; out.push([x, z]); } while (x !== b.x) { x += sx; out.push([x, z]); } }
    return out.filter(([x, z]) => this.w.in(x, z));
  }
  rectPath(a, b) {
    const out = [];
    for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) if (this.w.in(x, z)) out.push([x, z]);
    return out;
  }
  paintHL(tiles, okFn) {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    let n = 0;
    for (const [x, z] of tiles) {
      const ok = okFn(x, z);
      m.makeTranslation(x - N / 2 + 0.5, this.w.terr[this.w.idx(x, z)] === TERR.WATER ? 0.02 : 0.04, z - N / 2 + 0.5);
      this.hl.setMatrixAt(n, m); this.hl.setColorAt(n, c.set(ok === 2 ? 0xffc86b : ok ? 0x5fe0a0 : 0xff6a5a)); n++;
    }
    this.hl.count = n; this.hl.instanceMatrix.needsUpdate = true; this.hl.instanceColor.needsUpdate = true;
  }
  tileOk(tool, x, z) {
    const w = this.w, i = w.idx(x, z), k = w.kind[i], water = w.terr[i] === TERR.WATER;
    if (tool === 'road') return k === KIND.ROAD ? 2 : (k === KIND.EMPTY || k === KIND.RUBBLE) ? 1 : 0;
    if (tool === 'rail') return k === KIND.RAIL ? 2 : (k === KIND.EMPTY || k === KIND.RUBBLE) && !water ? 1 : 0;
    if (tool === 'bulldoze') return k !== KIND.EMPTY || w.tree[i] || w.zone[i] ? 1 : 2;
    if (tool === 'tree') return !water && k === KIND.EMPTY && !w.tree[i] ? 1 : 0;
    const zone = TOOLS[tool].zone;
    if (zone !== undefined) return !water && k !== KIND.ROAD && k !== KIND.RAIL && (k !== KIND.BUILDING || (zone && w.building(x, z)?.lvl)) ? 1 : 0;
    return 1;
  }
  costOf(tool, tiles) {
    let c = 0;
    for (const [x, z] of tiles) {
      const ok = this.tileOk(tool, x, z); if (ok !== 1) continue;
      const water = this.w.terr[this.w.idx(x, z)] === TERR.WATER;
      c += TOOLS[tool].cost * (water && tool === 'road' ? 4 : 1);
    }
    return c;
  }
  makeGhost(type) {
    if (this.ghost) this.stage.scene.remove(this.ghost);
    const g = new THREE.Group();
    const [W, H] = TOOLS[type].size;
    for (const p of specParts(type)) {
      const path = p.p || p.m, src = gltf(path); if (!src) continue;
      const o = src.scene.clone(true);
      if (p.only || p.skip) o.traverse(m => { if (m.isMesh && ((p.only && !p.only.includes(m.name)) || (p.skip && p.skip.includes(m.name)))) m.visible = false; });
      const mtx = p.p ? new THREE.Matrix4().compose(new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw || 0, 0)), new THREE.Vector3(p.sx, p.sy, p.sz))
        : placeMatrix(path, p.x || 0, p.y || 0, p.z || 0, p.yaw || 0, p.s || fitScale(path, p.fit || 0.9), p.sy || 1);
      o.matrixAutoUpdate = false; o.matrix.copy(mtx);
      o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.72; m.material.depthWrite = true; if (p.tint) m.material.color?.multiply(new THREE.Color(p.tint)); m.castShadow = false; } });
      g.add(o);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, H), new THREE.MeshBasicMaterial({ color: 0x5fe0a0, transparent: true, opacity: 0.4, depthWrite: false }));
    base.position.y = 0.02; g.add(base); g.userData.base = base;
    this.stage.scene.add(g); this.ghost = g; this.ghostType = type;
  }
  updateHover(t) {
    const tool = this.tool, T = TOOLS[tool];
    if (!t || tool === 'select') { this.hl.count = 0; if (this.ghost) this.ghost.visible = false; this.ring.visible = false; return; }
    if (T.size) {
      if (this.ghostType !== tool) this.makeGhost(tool);
      const [w, h] = this.w.footprint(tool, this.rot);
      const x0 = t.x - Math.floor((w - 1) / 2), z0 = t.z - Math.floor((h - 1) / 2);
      const res = this.w.canPlace(tool, x0, z0, this.rot);
      this.ghost.visible = true;
      this.ghost.position.set(x0 + w / 2 - N / 2, 0, z0 + h / 2 - N / 2);
      this.ghost.rotation.y = this.rot * Math.PI / 2;
      this.ghost.userData.base.material.color.set(res.ok ? 0x5fe0a0 : 0xff6a5a);
      this.ghost.traverse(m => { if (m.isMesh && m !== this.ghost.userData.base) m.material.opacity = res.ok ? 0.8 : 0.35; });
      this.place = { x0, z0, ok: res.ok, why: res.why };
      // coverage ring for services
      const f = T.fx || {}, r = f.police || f.fire || f.health || f.edu || f.water || f.landR || 0;
      this.ring.visible = r > 0; if (r) { this.ring.scale.setScalar(r); this.ring.position.set(x0 + w / 2 - N / 2, 0.05, z0 + h / 2 - N / 2); }
      this.ui.hint(res.ok ? `${T.name} · ${fmtMoney(T.cost)}${T.size[0] !== T.size[1] ? ' · R to turn' : ''}` : res.why, !res.ok);
      return;
    }
    if (this.drag) {
      const tiles = T.drag === 'line' ? this.linePath(this.drag.a, t) : this.rectPath(this.drag.a, t);
      this.paintHL(tiles, (x, z) => this.tileOk(tool, x, z));
      const c = this.costOf(tool, tiles);
      this.ui.hint(`${T.name} · ${tiles.length} tile${tiles.length > 1 ? 's' : ''}${c ? ' · ' + fmtMoney(c) : ''}`, c > this.w.money);
    } else {
      this.paintHL([[t.x, t.z]], (x, z) => this.tileOk(tool, x, z));
      this.ui.hint(`${T.name} · drag to paint`);
    }
  }
  apply(tiles) {
    const w = this.w, tool = this.tool, T = TOOLS[tool];
    let n = 0;
    for (const [x, z] of tiles) {
      if (tool === 'road') n += w.setRoad(x, z) ? 1 : 0;
      else if (tool === 'rail') n += w.setRoad(x, z, KIND.RAIL) ? 1 : 0;
      else if (tool === 'bulldoze') n += w.bulldoze(x, z) ? 1 : 0;
      else if (tool === 'tree') n += w.plantTree(x, z) ? 1 : 0;
      else if (T.zone !== undefined) n += w.setZone(x, z, T.zone) ? 1 : 0;
    }
    if (n) { this.sfx.build(tool); if (tool === 'road' || tool === 'rail' || tool === 'bulldoze') w._roadsDirty = true; }
    else if (tiles.length && w.money < T.cost) this.ui.toast('Not enough money.', 'warn');
  }
  // ---------------------------------------------------------------- events
  bind() {
    const c = this.canvas, v = this.stage.view;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.ui.closeFloating();
      if (this.ptrs.size === 2) { this.drag = null; this.hl.count = 0; this.pinch = this.pinchState(); return; }
      const pan = e.button === 1 || e.button === 2 || (this.tool === 'select' && e.button === 0);
      if (pan) { this.pan = { x: e.clientX, y: e.clientY, moved: 0, button: e.button }; c.style.cursor = 'grabbing'; return; }
      const t = this.tileAt(e.clientX, e.clientY); if (!t || !this.w.in(t.x, t.z)) return;
      if (TOOLS[this.tool].size) {
        if (this.place?.ok) { const r = this.w.placeBuilding(this.tool, this.place.x0, this.place.z0, this.rot); if (r.ok) { this.sfx.place(); this.ui.onPlaced(r.b); } }
        else if (this.place) { this.sfx.err(); this.ui.hint(this.place.why, true); }
        return;
      }
      this.drag = { a: { x: t.x, z: t.z } };
      this.updateHover(t);
    });
    c.addEventListener('pointermove', e => {
      const p = this.ptrs.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (this.ptrs.size === 2 && this.pinch) { this.doPinch(); return; }
      if (this.pan) {
        const dx = e.clientX - this.pan.x, dy = e.clientY - this.pan.y; this.pan.x = e.clientX; this.pan.y = e.clientY; this.pan.moved += Math.abs(dx) + Math.abs(dy);
        this.panBy(dx, dy); return;
      }
      const t = this.tileAt(e.clientX, e.clientY);
      this.hover = t && this.w.in(t.x, t.z) ? t : null;
      this.updateHover(this.hover);
    });
    const up = e => {
      c.releasePointerCapture?.(e.pointerId);
      this.ptrs.delete(e.pointerId);
      if (this.ptrs.size < 2) this.pinch = null;
      if (this.pan) {
        if (this.pan.moved < 6 && this.pan.button === 0 && this.tool === 'select') { const t = this.tileAt(e.clientX, e.clientY); if (t && this.w.in(t.x, t.z)) this.ui.inspect(t.x, t.z); }
        this.pan = null; c.style.cursor = this.tool === 'select' ? 'grab' : 'crosshair'; return;
      }
      if (this.drag) {
        const t = this.tileAt(e.clientX, e.clientY) || this.drag.a;
        const b = { x: clamp(t.x, 0, N - 1), z: clamp(t.z, 0, N - 1) };
        const tiles = TOOLS[this.tool].drag === 'line' ? this.linePath(this.drag.a, b) : this.rectPath(this.drag.a, b);
        this.apply(tiles);
        this.drag = null; this.updateHover(this.hover);
      }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { if (!this.drag && !this.pan) { this.hl.count = 0; if (this.ghost) this.ghost.visible = false; this.ui.hint(''); } });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const before = this.tileAt(e.clientX, e.clientY);
      v.zoomTo = clamp(v.zoomTo * Math.pow(1.0015, e.deltaY), 3.2, 44);
      // zoom towards the cursor
      if (before) { const k = 1 - v.zoomTo / v.zoom; v.target.x += (before.p.x - v.target.x) * k * 0.9; v.target.z += (before.p.z - v.target.z) * k * 0.9; this.clampTarget(); }
    }, { passive: false });
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'KeyQ') v.yawTo += Math.PI / 2;
      if (e.code === 'KeyE') v.yawTo -= Math.PI / 2;
      if (e.code === 'KeyR') { this.rot = (this.rot + 1) % 4; this.updateHover(this.hover); }
      if (e.code === 'Escape') { this.setTool('select'); this.ui.toolChanged('select'); this.ui.closeFloating(true); }
      if (e.code === 'Space') { e.preventDefault(); this.ui.togglePause(); }
      if (e.code === 'KeyB') { this.setTool('bulldoze'); this.ui.toolChanged('bulldoze'); }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') v.zoomTo = clamp(v.zoomTo / 1.25, 3.2, 44);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') v.zoomTo = clamp(v.zoomTo * 1.25, 3.2, 44);
      const d = +e.key; if (d >= 1 && d <= 6) this.ui.openCat(d - 1);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
  }
  pinchState() { const [a, b] = [...this.ptrs.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, zoom: this.stage.view.zoomTo }; }
  doPinch() {
    const s = this.pinchState(), p = this.pinch;
    this.stage.view.zoomTo = clamp(p.zoom * p.d / Math.max(20, s.d), 3.2, 44);
    this.panBy(s.mx - p.mx, s.my - p.my); p.mx = s.mx; p.my = s.my;
  }
  panBy(dx, dy) {
    const v = this.stage.view, k = (v.zoom * 2) / innerHeight;
    const fwd = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)), rt = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    v.target.addScaledVector(rt, -dx * k).addScaledVector(fwd, dy * k / Math.sin(v.pitch));
    this.clampTarget();
  }
  clampTarget() { const v = this.stage.view, L = N / 2 + 6; v.target.x = clamp(v.target.x, -L, L); v.target.z = clamp(v.target.z, -L, L); }
  update(dt) {
    const v = this.stage.view; let dx = 0, dy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy += 1; if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx += 1; if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx -= 1;
    if (dx || dy) this.panBy(dx * dt * 900 * (v.zoom / 20), dy * dt * 900 * (v.zoom / 20));
  }
}
