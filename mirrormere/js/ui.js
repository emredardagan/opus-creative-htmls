// HUD, panels and the little 3D fish viewer used by the catch card and the journal.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as A from './assets.js';
import { SPECIES, RARITY, hint } from './fish.js';

const $ = id => document.getElementById(id);
export { $ };

// ---------- fish viewer ----------
export function createViewer() {
  const canvas = document.createElement('canvas');
  canvas.className = 'viewer';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  const cam = new THREE.PerspectiveCamera(30, 2, 0.05, 50);
  cam.position.set(0, 0.15, 3.4);
  const key = new THREE.DirectionalLight(0xfff2dc, 2.4); key.position.set(2, 3, 3);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 1.6); rim.position.set(-3, 1, -2);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.6));
  const holder = new THREE.Group(); scene.add(holder);
  let obj = null, spin = 0, running = false, last = 0, mixer = null;
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x2b2a3a, transparent: true, opacity: 0.22 });

  function set(species, { known = true, tint } = {}) {
    if (obj) holder.remove(obj);
    obj = A.clone(species.model, { size: species.junk ? 1.4 : 1.7, axis: 'max', ground: false });
    obj.rotation.x = species.tilt || 0;
    tint?.(obj, species);
    if (!known) obj.traverse(o => { if (o.isMesh) o.material = silhouette; });
    mixer = obj.userData.mixer;
    const acts = obj.userData.actions;
    (acts[species.anim || ''] || acts.Swimming_Normal || acts.Swim || Object.values(acts)[0])?.play();
    holder.add(obj);
    spin = 0;
  }
  function mount(el) {
    el.replaceChildren(canvas);
    resize();
  }
  function resize() {
    const p = canvas.parentElement; if (!p) return;
    const w = p.clientWidth || 300, h = p.clientHeight || 200;
    renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    spin += dt * 0.6;
    holder.rotation.y = Math.PI / 2 + Math.sin(spin) * 0.9;
    holder.position.y = Math.sin(spin * 2.3) * 0.04;
    mixer?.update(dt);
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  }
  function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
  function stop() { running = false; }
  // still images for the journal grid
  const thumbs = new Map();
  function thumb(species) {
    if (thumbs.has(species.id)) return thumbs.get(species.id);
    const keep = obj;
    const off = new THREE.WebGLRenderTarget(1, 1);
    renderer.setSize(160, 110, false); cam.aspect = 160 / 110; cam.updateProjectionMatrix();
    set(species, { known: true, tint: thumbTint });
    holder.rotation.y = Math.PI / 2 + 0.35; holder.position.y = 0;
    renderer.render(scene, cam);
    const url = canvas.toDataURL('image/png');
    thumbs.set(species.id, url);
    off.dispose();
    if (keep) { holder.remove(obj); holder.add(keep); obj = keep; }
    resize();
    return url;
  }
  let thumbTint = null;
  return { set, mount, start, stop, resize, thumb, setTint(f) { thumbTint = f; } };
}

// ---------- pop text & toast ----------
export function pop(x, y, text, cls = '') {
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  $('pops').append(el);
  const t0 = performance.now();
  const tick = () => {
    const k = (performance.now() - t0) / 1100;
    if (k >= 1) { el.remove(); return; }
    const s = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : k < 0.25 ? 1.1 - (k - 0.15) : 1;
    el.style.transform = `translate(-50%,-50%) translate(${x}px, ${y - k * 50}px) scale(${s})`;
    el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    requestAnimationFrame(tick);
  };
  tick();
}
let toastT = 0;
export function toast(html, ms = 2600) {
  const el = $('toast');
  el.innerHTML = html;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), ms);
}

export const stars = r => `<i class="ph-fill ph-star"></i>`.repeat(r) + ` ${RARITY[r]}`;

// ---------- journal ----------
export function renderJournal(save, viewer, selectId, tint) {
  const grid = $('journalGrid');
  grid.replaceChildren();
  let caught = 0;
  for (const s of SPECIES) {
    const rec = save.journal[s.id];
    if (rec) caught++;
    const b = document.createElement('button');
    b.className = `cell ${rec ? '' : 'unknown'} ${s.id === selectId ? 'sel' : ''}`;
    b.innerHTML = `<span class="st r${s.rarity}"></span><img alt="" src="${viewer.thumb(s)}"><span class="nm">${rec ? s.name : '???'}</span>`;
    b.onclick = () => renderJournal(save, viewer, s.id, tint);
    grid.append(b);
  }
  $('journalCount').textContent = `${caught} / ${SPECIES.length}`;
  const sel = SPECIES.find(s => s.id === selectId) || SPECIES[0];
  const rec = save.journal[sel.id];
  viewer.mount($('journalView'));
  viewer.set(sel, { known: !!rec, tint });
  viewer.start();
  $('jdName').textContent = rec ? sel.name : 'Not yet caught';
  $('jdRarity').className = `rarity r${sel.rarity}`;
  $('jdRarity').innerHTML = stars(sel.rarity);
  $('jdDesc').textContent = rec ? sel.desc : 'Something swims here you haven\'t met.';
  const facts = hint(sel).map(h => `<li><i class="ph-bold ph-map-pin"></i> Bites ${h}</li>`);
  if (rec) {
    facts.push(`<li><i class="ph-bold ph-ruler"></i> Best: ${rec.best} cm (up to ${sel.size[1]})</li>`);
    facts.push(`<li><i class="ph-bold ph-fish-simple"></i> Caught ${rec.n} time${rec.n > 1 ? 's' : ''}</li>`);
  }
  $('jdFacts').innerHTML = facts.join('');
}
