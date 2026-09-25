// HUD, tool dock with rendered thumbnails, inspector, budget, menu/saves, minimap, toasts.
import * as THREE from 'three';
import { N, TOOLS, CATS, KIND, TERR, MILESTONES, CAP, ZONE_KEY } from './config.js';
import { fmtMoney, fmtInt, MONTHS, clamp, store } from './util.js';
import { gltf, fitScale, placeMatrix } from './models.js';
import { specParts } from './city.js';

const $ = id => document.getElementById(id);
const ICONS = {
  road: '<path d="M8 3L5 21M16 3l3 18" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M12 5v3M12 11v3M12 17v3" stroke="#ffc86b" stroke-width="2.2" stroke-linecap="round"/>',
  zone: '<rect x="3" y="3" width="8" height="8" rx="2" fill="#4fd36a"/><rect x="13" y="3" width="8" height="8" rx="2" fill="#5a9cff"/><rect x="3" y="13" width="8" height="8" rx="2" fill="#ffc23d"/><rect x="13" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2 2"/>',
  bolt: '<path d="M13 2L5 13h6l-1 9 8-12h-6z" fill="#ffc23d" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="#5a9cff" stroke="currentColor" stroke-width="1.4"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
  tree: '<circle cx="12" cy="9" r="6" fill="#4fbf5a"/><circle cx="8" cy="12" r="4" fill="#3fae4e"/><circle cx="16" cy="12" r="4" fill="#5fcf66"/><rect x="11" y="14" width="2" height="7" rx="1" fill="#8a5a3a"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" fill="#ffc86b" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
  cursor: '<path d="M5 3l14 7-6 1.5L10 18z" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  rail: '<path d="M8 3L6 21M16 3l2 18" stroke="#8a93a6" stroke-width="2" fill="none"/><path d="M5 6h14M5 10h14M5 14h14M5 18h14" stroke="#8a5a3a" stroke-width="2"/>',
  bulldoze: '<rect x="3" y="11" width="11" height="6" rx="2" fill="#ffc23d" stroke="currentColor" stroke-width="1.3"/><rect x="6" y="7" width="5" height="4" rx="1" fill="#ffc23d" stroke="currentColor" stroke-width="1.3"/><path d="M14 13l4-4h3v9h-5" fill="#9aa3b2" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="19" r="2" fill="currentColor"/><circle cx="11" cy="19" r="2" fill="currentColor"/>',
  zoneR: '<rect x="3" y="3" width="18" height="18" rx="4" fill="#4fd36a"/><path d="M7 13l5-4 5 4v5H7z" fill="#fff"/>',
  zoneC: '<rect x="3" y="3" width="18" height="18" rx="4" fill="#5a9cff"/><rect x="8" y="7" width="8" height="11" rx="1" fill="#fff"/><path d="M10 10h4M10 13h4" stroke="#5a9cff" stroke-width="1.5"/>',
  zoneI: '<rect x="3" y="3" width="18" height="18" rx="4" fill="#ffc23d"/><path d="M6 18v-6l4 2v-2l4 2V7h3v11z" fill="#fff"/>',
  dezone: '<rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2"/><path d="M8 8l8 8M16 8l-8 8" stroke="#e8554e" stroke-width="2" stroke-linecap="round"/>',
};
const svg = k => `<svg viewBox="0 0 24 24">${ICONS[k] || ICONS.star}</svg>`;
const TIME_ICONS = {
  auto: '<circle cx="12" cy="12" r="4" fill="#ffc23d"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="#ffc23d" stroke-width="2" stroke-linecap="round"/><path d="M18 14a6 6 0 0 1-8-8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  day: '<circle cx="12" cy="12" r="5" fill="#ffc23d"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="#ffc23d" stroke-width="2" stroke-linecap="round"/>',
  dusk: '<path d="M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 17a5 5 0 0 1 10 0z" fill="#ff8a50"/><path d="M12 5v4M5 9l2 2M19 9l-2 2" stroke="#ff8a50" stroke-width="2" stroke-linecap="round"/>',
  night: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="#c8d4ff"/><circle cx="17" cy="6" r="1" fill="#fff"/><circle cx="20" cy="9" r=".7" fill="#fff"/>',
};
const TIME_MODES = [['auto', null, 'Day and night cycle'], ['day', 0.45, 'Always day'], ['dusk', 0.735, 'Golden hour'], ['night', 0.02, 'Always night']];

export class UI {
  constructor(stage, world, sim, city, sfx) {
    this.stage = stage; this.w = world; this.sim = sim; this.city = city; this.sfx = sfx;
    this.speed = 1; this.prevSpeed = 1; this.cat = 0; this.timeMode = 0; this.inspected = null; this.thumbs = {};
    this.lastMoney = world.money;
  }
  attach(input) { this.input = input; }
  init() {
    this.buildDock();
    // speed
    for (const b of $('speed').children) b.onclick = () => { this.setSpeed(+b.dataset.s); this.sfx.click(); };
    // time of day
    const setTime = () => { const [k, t, label] = TIME_MODES[this.timeMode]; $('timeIcon').innerHTML = TIME_ICONS[k]; $('timeBtn').dataset.tip = label; this.stage.state.auto = t === null; if (t !== null) this.timeTarget = t; };
    $('timeBtn').onclick = () => { this.timeMode = (this.timeMode + 1) % TIME_MODES.length; setTime(); this.sfx.click(); };
    setTime();
    // layers
    $('layersBtn').onclick = () => { $('layers').hidden = !$('layers').hidden; $('layersBtn').classList.toggle('on', !$('layers').hidden); };
    for (const b of $('layers').children) b.onclick = () => {
      for (const o of $('layers').children) o.classList.toggle('on', o === b);
      this.city.paintOverlay(b.dataset.l || null); $('layers').hidden = true; $('layersBtn').classList.toggle('on', !!b.dataset.l);
    };
    // budget + menu
    $('budgetBtn').onclick = () => this.openBudget();
    $('menuBtn').onclick = () => this.openMenu();
    for (const m of document.querySelectorAll('.modal')) { m.addEventListener('click', e => { if (e.target === m || e.target.dataset.close !== undefined) this.closeModal(m); }); }
    for (const k of ['R', 'C', 'I']) { const el = $('tax' + k); el.oninput = () => { this.w.tax[k] = el.value / 100; $('tax' + k + 'v').textContent = el.value + '%'; }; }
    $('cityName').onchange = () => { this.w.name = $('cityName').value.trim() || 'Harborlight'; };
    $('inspectClose').onclick = () => this.closeInspect();
    $('insDemolish').onclick = () => { const b = this.inspected; if (b && this.w.buildings.has(b.id)) { this.w.bulldoze(b.x, b.z); this.sfx.build('bulldoze'); } this.closeInspect(); };
    $('rotL').onclick = () => this.stage.view.yawTo += Math.PI / 2;
    $('rotR').onclick = () => this.stage.view.yawTo -= Math.PI / 2;
    $('minimap').addEventListener('pointerdown', e => {
      const r = e.target.getBoundingClientRect(); const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
      this.stage.view.target.set(u * N - N / 2, 0, v * N - N / 2);
    });
    // tooltips
    const tip = $('tip');
    document.addEventListener('pointerover', e => {
      const el = e.target.closest('[data-tip]'); if (!el || e.pointerType === 'touch') { tip.hidden = true; return; }
      tip.innerHTML = el.dataset.tip; tip.hidden = false;
      const r = el.getBoundingClientRect(); tip.style.left = clamp(r.left + r.width / 2 - 120, 8, innerWidth - 250) + 'px';
      tip.style.top = (r.bottom + 8 + 60 > innerHeight ? r.top - tip.offsetHeight - 10 : r.bottom + 8) + 'px';
    });
    document.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]')) tip.hidden = true; });
    this.update(0, true);
  }
  // ---------------------------------------------------------------- dock
  buildDock() {
    const cats = $('cats'); cats.innerHTML = '';
    CATS.forEach((c, i) => {
      const b = document.createElement('button'); b.innerHTML = `${svg(c.icon)}<span>${c.name}</span>`;
      b.onclick = () => { this.openCat(i, true); this.sfx.click(); };
      cats.appendChild(b);
    });
    this.openCat(0);
  }
  openCat(i, toggle) {
    const cats = $('cats').children;
    if (toggle && this.cat === i && !$('tray').hidden) { $('tray').hidden = true; cats[i].classList.remove('on'); return; }
    this.cat = i;
    for (let k = 0; k < cats.length; k++) cats[k].classList.toggle('on', k === i);
    const tray = $('tray'); tray.hidden = false; tray.innerHTML = '';
    tray.style.animation = 'none'; void tray.offsetWidth; tray.style.animation = '';
    for (const [key, T] of Object.entries(TOOLS)) {
      if (T.cat !== CATS[i].id) continue;
      const b = document.createElement('button'); b.className = 'tool'; b.dataset.tool = key;
      const locked = T.unlock && this.w.stats.pop < T.unlock;
      if (locked) { b.classList.add('locked'); b.dataset.lock = `${fmtInt(T.unlock)} pop`; }
      const art = this.thumbs[key] ? `<img src="${this.thumbs[key]}" alt="">` : svg(T.icon);
      b.innerHTML = `<div class="thumb">${art}</div><div class="nm">${T.name}</div><div class="cost">${T.cost ? fmtMoney(T.cost) + (T.drag ? '/tile' : '') : 'free'}</div>`;
      b.dataset.tip = `<b>${T.name}</b>${T.desc}${T.upkeep ? `<br><span class="c">Upkeep ${fmtMoney(T.upkeep)}/month</span>` : ''}${locked ? `<br><span class="c">Unlocks at ${fmtInt(T.unlock)} residents</span>` : ''}`;
      b.onclick = () => { if (b.classList.contains('locked')) { this.sfx.err(); this.toast(`${T.name} unlocks when ${this.w.name} reaches ${fmtInt(T.unlock)} residents.`, 'info'); return; } this.selectTool(key); this.sfx.click(); };
      b.classList.toggle('on', this.input?.tool === key);
      tray.appendChild(b);
    }
  }
  selectTool(key) { const same = this.input.tool === key; this.input.setTool(same ? 'select' : key); this.toolChanged(this.input.tool); if (key !== 'select') this.closeInspect(); }
  toolChanged(key) { for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === key); if (key === 'select') this.hint(''); }
  refreshLocks() { const s = this.w.stats.pop; if (this._lockPop !== undefined && MILESTONES.findLastIndex(m => s >= m[0]) === MILESTONES.findLastIndex(m => this._lockPop >= m[0]) && Math.abs(s - this._lockPop) < 60) return; this._lockPop = s; if (!$('tray').hidden) this.openCat(this.cat); }

  // rendered thumbnails for every building tool
  makeThumbs() {
    const W = 176, H = 128;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(W, H); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x9a9a7a, 1.6));
    const d = new THREE.DirectionalLight(0xfff2de, 2.6); d.position.set(4, 8, 5); scene.add(d);
    if (this.stage.scene.environment) { scene.environment = this.stage.scene.environment; scene.environmentIntensity = 0.5; }
    for (const [key, T] of Object.entries(TOOLS)) {
      if (!T.size) continue;
      const g = new THREE.Group();
      for (const p of specParts(key)) {
        const path = p.p || p.m, src = gltf(path); if (!src) continue;
        const o = src.scene.clone(true);
        if (p.only || p.skip) o.traverse(m => { if (m.isMesh && ((p.only && !p.only.includes(m.name)) || (p.skip && p.skip.includes(m.name)))) m.visible = false; });
        o.matrixAutoUpdate = false;
        o.matrix.copy(p.p ? new THREE.Matrix4().compose(new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw || 0, 0)), new THREE.Vector3(p.sx, p.sy, p.sz)) : placeMatrix(path, p.x || 0, p.y || 0, p.z || 0, p.yaw || 0, p.s || fitScale(path, p.fit || 0.9), p.sy || 1));
        if (p.tint) o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color?.multiply(new THREE.Color(p.tint)); } });
        g.add(o);
      }
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const R = Math.max(size.x, size.z, size.y * 1.1) * 0.62 + 0.05;
      const cam = new THREE.OrthographicCamera(-R * W / H, R * W / H, R, -R, -50, 50);
      cam.position.copy(c).add(new THREE.Vector3(1, 0.82, 1)); cam.lookAt(c);
      scene.add(g); r.render(scene, cam); scene.remove(g);
      this.thumbs[key] = r.domElement.toDataURL('image/png');
    }
    r.dispose(); r.forceContextLoss?.();
    this.openCat(this.cat);
  }
  // ---------------------------------------------------------------- HUD
  setSpeed(s) { this.speed = s; if (s) this.prevSpeed = s; for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.s === s); }
  togglePause() { this.setSpeed(this.speed ? 0 : this.prevSpeed || 1); }
  hint(text, bad) { const h = $('hint'); h.textContent = text; h.classList.toggle('show', !!text); h.classList.toggle('bad', !!bad); }
  toast(text, kind = 'info', b) {
    const box = $('toasts'); const el = document.createElement('div'); el.className = `toast ${kind}`;
    const icon = { info: 'i', tip: '?', warn: '!', fire: '🔥', milestone: '★' }[kind] || 'i';
    el.innerHTML = `<span class="ti">${icon}</span><span>${text}</span>`;
    if (b) { el.style.cursor = 'pointer'; el.onclick = () => this.stage.view.target.set(b.x - N / 2 + 0.5, 0, b.z - N / 2 + 0.5); }
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'milestone' ? 7000 : 5200);
    if (kind === 'milestone') { this.sfx.chime(); this.refreshLocks(); }
  }
  update(dt, force) {
    this.hudT = (this.hudT || 0) - dt; if (this.hudT > 0 && !force) return; this.hudT = 0.25;
    const w = this.w, s = w.stats;
    $('money').textContent = fmtMoney(w.money);
    const net = s.income - s.expense, ne = $('net'); ne.textContent = s.income || s.expense ? (net >= 0 ? '+' : '') + fmtMoney(net).replace('$', '$') : ''; ne.className = net >= 0 ? 'up' : 'down';
    $('money').style.color = w.money < 0 ? 'var(--bad)' : '';
    $('pop').textContent = fmtInt(s.pop);
    $('happy').textContent = Math.round(s.happy * 100) + '%';
    $('power').textContent = `${fmtInt(s.powerUse)} / ${fmtInt(s.powerCap)}`;
    const pb = $('powerBar'); pb.style.width = (s.powerCap ? clamp(s.powerUse / s.powerCap, 0, 1) * 100 : s.powerUse ? 100 : 0) + '%'; pb.classList.toggle('over', s.powerUse > s.powerCap);
    for (const k of ['R', 'C', 'I']) { const v = s.demand[k], el = $('d' + k); el.style.height = Math.abs(v) * 50 + '%'; el.style.bottom = v >= 0 ? '50%' : (50 - Math.abs(v) * 50) + '%'; el.style.opacity = v >= 0 ? 1 : 0.45; }
    const y = 2026 + Math.floor(w.day / 360), mo = Math.floor(w.day / 30) % 12, dd = w.day % 30 + 1;
    $('date').textContent = `${MONTHS[mo]} ${dd}, ${y}`; $('mDate').textContent = `${MONTHS[mo]} ${y}`;
    $('rank').textContent = $('mRank').textContent = MILESTONES[Math.max(0, MILESTONES.findLastIndex(m => s.pop >= m[0]))][1];
    document.body.classList.toggle('night', this.stage.state.night > 0.6);
    if (document.activeElement !== $('cityName')) $('cityName').value = w.name;
    if (this.inspected) this.fillInspect();
    this.refreshLocks();
    this.miniT = (this.miniT || 0) - 0.25; if (this.miniT <= 0 || force) { this.miniT = 1.5; this.drawMinimap(); }
  }
  // ---------------------------------------------------------------- inspector
  inspect(x, z) {
    const w = this.w, b = w.building(x, z);
    this.inspectTile = { x, z }; this.inspected = b;
    if (!b) {
      const i = w.idx(x, z), k = w.kind[i];
      if (k === KIND.EMPTY && !w.zone[i]) { this.closeInspect(); return; }
    }
    $('inspect').hidden = false; this.fillInspect(); this.sfx.click();
  }
  fillInspect() {
    const w = this.w, s = this.sim, b = this.inspected && w.buildings.has(this.inspected.id) ? this.inspected : null;
    const { x, z } = b ? b : this.inspectTile, i = w.idx(x, z);
    const cell = (k, v, cls = '') => `<div><small>${k}</small><b class="${cls}">${v}</b></div>`;
    const yes = (v, a = 'Yes', n = 'No') => v ? [a, 'ok'] : [n, 'no'];
    let html = '';
    if (b && b.lvl) {
      const key = b.type, cap = CAP[key][b.lvl - 1];
      $('insKind').textContent = { R: 'Residential', C: 'Commercial', I: 'Industrial' }[key] + ` · level ${b.lvl}`;
      $('insName').textContent = b.name;
      html += cell(key === 'R' ? 'Residents' : 'Jobs', `${Math.round(cap * b.occ)} / ${cap}`);
      html += cell('Power', ...yes(b.powered)); html += cell('Water', ...yes(s.water[i]));
      html += cell('Land value', Math.round(s.land[i] * 100) + '%');
      html += cell('Pollution', Math.round(s.pollution[i] * 100) + '%', s.pollution[i] > 0.4 ? 'no' : '');
      html += cell('Status', b.fire ? 'On fire!' : b.abandoned ? 'Abandoned' : b.lvl < 3 ? (b.occ > 0.85 ? 'Ready to grow' : 'Filling up') : 'Thriving', b.fire || b.abandoned ? 'no' : 'ok');
    } else if (b) {
      const T = TOOLS[b.type];
      $('insKind').textContent = CATS.find(c => c.id === T.cat)?.name || 'Building';
      $('insName').textContent = T.name;
      const f = T.fx || {};
      if (f.power) html += cell('Output', `${f.power} MW`);
      const r = f.police || f.fire || f.health || f.edu || f.water; if (r) html += cell('Reach', `${r} tiles`);
      if (T.upkeep) html += cell('Upkeep', fmtMoney(T.upkeep) + '/mo');
      html += cell('Power', ...yes(b.powered || f.power, f.power ? 'Producing' : 'Yes'));
      if (f.land) html += cell('Land value', '+' + Math.round(f.land * 100) + '%');
      if (f.happy) html += cell('Happiness', '+' + f.happy);
    } else {
      const k = w.kind[i];
      $('insKind').textContent = k === KIND.ROAD ? 'Road' : k === KIND.RAIL ? 'Railway' : k === KIND.RUBBLE ? 'Rubble' : w.zone[i] ? 'Zoned land' : 'Land';
      $('insName').textContent = k === KIND.ROAD ? (w.terr[i] === TERR.WATER ? 'Bridge' : 'Street') : k === KIND.RAIL ? 'Tracks' : k === KIND.RUBBLE ? 'Burned-out lot' : ['', 'Residential', 'Commercial', 'Industrial'][w.zone[i]] + ' zone';
      if (w.zone[i]) { html += cell('Road nearby', ...yes(s.roadDist[i] <= 2)); html += cell('Power', ...yes(s.power[i])); html += cell('Land value', Math.round(s.land[i] * 100) + '%'); html += cell('Demand', Math.round(w.stats.demand[ZONE_KEY[w.zone[i]]] * 100) + '%'); }
    }
    $('insGrid').innerHTML = html;
    $('insDemolish').hidden = !b && w.kind[i] === KIND.EMPTY;
  }
  closeInspect() { this.inspected = null; this.inspectTile = null; $('inspect').hidden = true; }
  closeFloating(all) { if (!$('layers').hidden) { $('layers').hidden = true; } if (all) this.closeInspect(); }
  onPlaced(b) { this.toast(`${TOOLS[b.type].name} built.`, 'info'); }

  // ---------------------------------------------------------------- budget
  openBudget() {
    const w = this.w, s = w.stats;
    for (const k of ['R', 'C', 'I']) { $('tax' + k).value = Math.round(w.tax[k] * 100); $('tax' + k + 'v').textContent = Math.round(w.tax[k] * 100) + '%'; }
    let up = 0; const byCat = {};
    for (const b of w.buildings.values()) { const T = TOOLS[b.type]; if (T?.upkeep) { byCat[T.cat] = (byCat[T.cat] || 0) + T.upkeep; up += T.upkeep; } }
    const row = (k, v, cls) => `<span>${k}</span><b class="${cls || (v >= 0 ? 'pos' : 'neg')}">${v >= 0 ? '+' : ''}${fmtMoney(v)}</b>`;
    const inc = { R: s.pop * w.tax.R * 1.25, C: s.jobsC * w.tax.C * 1.4, I: s.jobsI * w.tax.I * 1.3 };
    $('ledger').innerHTML = row('Residential taxes', inc.R) + row('Commercial taxes', inc.C) + row('Industrial taxes', inc.I)
      + Object.entries(byCat).map(([c, v]) => row(CATS.find(x => x.id === c).name, -v)).join('') + row('Roads & rails', -(s.expense - up))
      + `<span class="tot">Monthly balance</span><b class="tot ${s.income - s.expense >= 0 ? 'pos' : 'neg'}">${fmtMoney(s.income - s.expense)}</b>`;
    this.drawChart();
    $('budget').hidden = false; this.sfx.click();
  }
  drawChart() {
    const c = $('chart'), g = c.getContext('2d'), h = this.w.history, W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (h.length < 2) { g.fillStyle = '#6a7590'; g.font = '14px Outfit'; g.fillText('History appears after a couple of months.', 16, H / 2); return; }
    const line = (key, col) => {
      const vals = h.map(e => e[key]), mn = Math.min(...vals, 0), mx = Math.max(...vals, 1);
      g.beginPath(); vals.forEach((v, i) => { const x = 10 + i / (vals.length - 1) * (W - 20), y = H - 12 - (v - mn) / (mx - mn || 1) * (H - 24); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.strokeStyle = col; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke();
    };
    line('pop', '#16a3b5'); line('money', '#ff7a59');
  }
  closeModal(m) { m.hidden = true; }

  // ---------------------------------------------------------------- menu & saves
  openMenu() { this.renderSlots(); $('menu').hidden = false; this.sfx.click(); }
  renderSlots() {
    const slots = store.get('hl-slots', []), box = $('slots'); box.innerHTML = '';
    if (!slots.length) box.innerHTML = '<p class="note">No saved cities yet.</p>';
    for (const sl of slots) {
      const d = document.createElement('div'); d.className = 'slot';
      d.innerHTML = `<div class="meta"><b>${sl.name}</b>${fmtInt(sl.pop)} residents · ${new Date(sl.t).toLocaleDateString()}</div><button data-a="load">Load</button><button data-a="del" aria-label="Delete">✕</button>`;
      d.querySelector('[data-a=load]').onclick = () => this.onLoad?.(sl.id);
      d.querySelector('[data-a=del]').onclick = () => { store.del('hl-city-' + sl.id); store.set('hl-slots', store.get('hl-slots', []).filter(x => x.id !== sl.id)); this.renderSlots(); };
      box.appendChild(d);
    }
  }
  // ---------------------------------------------------------------- minimap
  drawMinimap() {
    const c = $('minimap'), g = c.getContext('2d'), w = this.w, img = g.createImageData(N, N), d = img.data;
    for (let i = 0; i < N * N; i++) {
      const k = w.kind[i]; let col;
      if (w.terr[i] === TERR.WATER) col = k === KIND.ROAD ? [230, 230, 230] : [74, 170, 205];
      else if (k === KIND.ROAD) col = [120, 126, 140];
      else if (k === KIND.RAIL) col = [150, 110, 90];
      else if (k === KIND.BUILDING) { const b = w.buildings.get(w.bid[i]); col = b?.type === 'R' ? [80, 200, 110] : b?.type === 'C' ? [90, 150, 255] : b?.type === 'I' ? [255, 190, 60] : [240, 240, 250]; }
      else if (w.zone[i]) col = [[0], [160, 225, 170], [170, 200, 255], [255, 225, 160]][w.zone[i]];
      else if (w.tree[i]) col = [70, 150, 80];
      else col = w.terr[i] === TERR.SAND ? [240, 222, 170] : [140, 205, 110];
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
    }
    const tmp = this._mini || (this._mini = Object.assign(document.createElement('canvas'), { width: N, height: N }));
    tmp.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height); g.drawImage(tmp, 0, 0, c.width, c.height);
    // view marker
    const v = this.stage.view, k = c.width / N;
    g.strokeStyle = '#fff'; g.lineWidth = 2; const zx = v.zoom * (innerWidth / innerHeight) * 0.7 * k, zy = v.zoom * 0.9 * k;
    g.save(); g.translate((v.target.x + N / 2) * k, (v.target.z + N / 2) * k); g.rotate(-v.yaw + Math.PI / 4); g.strokeRect(-zx, -zy, zx * 2, zy * 2); g.restore();
  }
}
