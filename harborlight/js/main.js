// Harborlight: boot, title screen, save/load and the main loop.
import * as THREE from 'three';
import { N, K, PP, GROW, START_MONEY } from './config.js';
import { createStage } from './stage.js';
import { loadAll } from './models.js';
import { registerProps } from './props.js';
import { createTerrain } from './terrain.js';
import { World } from './world.js';
import { Sim } from './sim.js';
import { CityRenderer, TREES } from './city.js';
import { Agents } from './agents.js';
import { Fx } from './fx.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Sfx } from './sfx.js';
import { seedVillage } from './village.js';
import { store, damp } from './util.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// every model the game can show
const MODELS = [
  ...Object.values(GROW).flat(2), ...TREES,
  ...['flower_redA', 'flower_yellowA', 'flower_purpleA', 'plant_bushSmall', 'grass_large'].map(n => K(`nature-kit/${n}`)),
  ...['road-straight', 'road-bend', 'road-intersection', 'road-crossroad', 'road-end', 'road-square', 'light-square'].map(n => K(`city-kit-roads/${n}`)),
  ...['building-g', 'building-e', 'building-n', 'building-l', 'building-j', 'building-k', 'building-m', 'building-skyscraper-e'].map(n => K(`city-kit-commercial/${n}`)),
  ...['building-m', 'building-h', 'building-s', 'chimney-large', 'chimney-small', 'detail-tank-large', 'detail-tank', 'windmill', 'water-tower', 'solar-panel-landscape-group', 'shipping-container-a', 'shipping-container-b', 'shipping-container-c'].map(n => K(`city-kit-industrial/${n}`)),
  ...['sedan', 'taxi', 'suv', 'hatchback-sports', 'van', 'delivery', 'sedan-sports', 'suv-luxury', 'truck', 'police', 'garbage-truck', 'firetruck', 'ambulance'].map(n => K(`car-kit/${n}`)),
  ...['boat-sail-a', 'boat-sail-b', 'boat-speed-a', 'boat-speed-c', 'boat-fishing-small', 'boat-row-small', 'ship-cargo-a', 'ship-cargo-b', 'ship-ocean-liner', 'ship-large', 'boat-tug-a'].map(n => K(`watercraft-kit/${n}`)),
  ...['train-electric-city-a', 'train-electric-city-b', 'train-electric-city-c', 'train-locomotive-passenger-a', 'train-carriage-box', 'train-carriage-container-red', 'train-carriage-tank', 'train-electric-bullet-a', 'train-electric-bullet-b', 'train-electric-bullet-c', 'train-diesel-a', 'train-carriage-lumber', 'train-carriage-coal', 'train-carriage-container-blue'].map(n => K(`train-kit/${n}`)),
  ...['ferris-wheel', 'lighthouse', 'helicopter', 'church', 'sail-boat', 'fountain', 'horse-statue', 'dock-long', 'bench', 'satellite-dish', 'sign-hospital', 'fire-hydrant', 'tent'].map(PP),
];

// ---------------------------------------------------------------- boot instruction (survives a reload)
let boot = null; try { boot = JSON.parse(sessionStorage.getItem('hl-boot') || 'null'); sessionStorage.removeItem('hl-boot'); } catch {}
const slots = store.get('hl-slots', []);
// drop city data that no slot points at any more (older builds made a new slot every session)
try { for (const k of Object.keys(localStorage)) if (k.startsWith('hl-city-') && !slots.some(s => 'hl-city-' + s.id === k)) localStorage.removeItem(k); } catch {}
// a plain visit reopens the city you played last
if (!boot && slots.length && store.get('hl-city-' + slots[0].id)) boot = { mode: 'load', id: slots[0].id, resume: true };
const lastSeed = boot?.seed ?? Math.floor(Math.random() * 999999);
$('newSeed').value = lastSeed;
$('shuffle').onclick = () => { $('newSeed').value = Math.floor(Math.random() * 999999); };
if (boot?.resume) {
  // your city is the backdrop: continuing is the main action, founding a new one the second
  $('continueBtn').hidden = false; $('continueBtn').textContent = `Continue ${slots[0].name}`;
  $('continueBtn').className = 'primary big'; $('startBtn').className = 'ghost wide';
  $('startBtn').before($('continueBtn'));
}

const quality = store.get('hl-low', false) ? 'low' : 'high';
const stage = createStage($('stage'), { quality });
registerProps();
await loadAll([...new Set(MODELS)], p => { $('loadBar').style.width = `${Math.round(p * 100)}%`; });
await stage.envReady;

// ---------------------------------------------------------------- world
let world, saved = null;
if (boot?.mode === 'load' && (saved = store.get('hl-city-' + boot.id))) { world = World.load(saved); world.slotId = boot.id; }
else {
  world = new World(); world.generate(lastSeed);
  world.name = boot?.name || 'Harborlight'; world.slotId = Date.now().toString(36);
  if (boot?.village !== false) seedVillage(world);
  world.money = START_MONEY;
}
const terrain = createTerrain(stage, world); stage.terrain = terrain;
const fx = new Fx(stage.scene);
const sim = new Sim(world);
const city = new CityRenderer(stage, world, sim, fx);
const sfx = new Sfx(); sfx.on = store.get('hl-sound', true);
const ui = new UI(stage, world, sim, city, sfx);
const input = new Input(stage, world, city, ui, sfx);
ui.attach(input);
sim.rebuildNetworks(); sim.rebuildCoverage(); sim.grow(); sim.milestone = 99; sim.grow(); sim.milestone = [0, 60, 250, 1000, 3000, 8000, 20000].findLastIndex(v => world.stats.pop >= v);
city.buildAll();
const agents = new Agents(stage, world, sim, fx);
ui.init();
ui.makeThumbs();
sim.news = (t, k, b) => ui.toast(t, k, b);
world.on((type, d) => {
  if (type === 'tile' && d.neighbours) world._roadsDirty = true;
  if (type === 'building+' && d.lvl && Math.random() < 0.3) sfx.grow();
});

// frame the town, or go back to where you were looking
if (saved?.view) {
  const v = saved.view; stage.view.target.set(v.x, 0, v.z); stage.view.yaw = stage.view.yawTo = v.yaw; stage.view.zoom = stage.view.zoomTo = v.zoom;
  if (typeof v.time === 'number') stage.state.time = v.time;
} else {
  let sx = 0, sz = 0, n = 0; for (const b of world.buildings.values()) { sx += b.x; sz += b.z; n++; }
  if (n) stage.view.target.set(sx / n - N / 2, 0, sz / n - N / 2);
  stage.view.zoom = stage.view.zoomTo = 13;
}

// ---------------------------------------------------------------- title screen
let playing = false;
function begin() {
  playing = true; sfx.unlock();
  $('title').classList.add('gone'); setTimeout(() => $('title').hidden = true, 800);
  $('hud').hidden = false;
  world.name = $('newName').value.trim() || world.name;
  if (!saved?.view) stage.view.zoomTo = 11;
  ui.update(0, true);
  if (saved) setTimeout(() => ui.toast(`Welcome back to ${world.name}.`, 'info'), 900);
  else setTimeout(() => ui.toast(`Welcome to ${world.name}. Zone land next to roads and give it power, then watch it grow.`, 'tip'), 900);
  save(true);
}
$('startBtn').disabled = false; $('startBtn').textContent = saved ? 'Found a new city' : 'Found the city';
$('startBtn').onclick = () => {
  const seed = +$('newSeed').value || 1, village = $('village').checked;
  if (!saved && seed === lastSeed && village === (boot?.village !== false)) { begin(); return; }
  sessionStorage.setItem('hl-boot', JSON.stringify({ mode: 'new', seed, village, name: $('newName').value.trim(), start: true }));
  location.reload();
};
$('continueBtn').onclick = () => { if (saved && world.slotId === slots[0]?.id) { $('newName').value = world.name; begin(); return; } sessionStorage.setItem('hl-boot', JSON.stringify({ mode: 'load', id: slots[0].id, start: true })); location.reload(); };
if (boot?.start) { $('title').hidden = true; if (boot.name) $('newName').value = boot.name; else $('newName').value = world.name; begin(); }
else if (boot?.mode === 'load' && !boot.resume) begin();

// ---------------------------------------------------------------- saves
function save(silent) {
  const data = world.serialize(), v = stage.view;
  data.view = { x: v.target.x, z: v.target.z, yaw: v.yawTo, zoom: v.zoomTo, time: stage.state.time };
  const list = store.get('hl-slots', []).filter(s => s.id !== world.slotId);
  list.unshift({ id: world.slotId, name: world.name, pop: Math.round(world.stats.pop), t: Date.now() });
  for (const old of list.slice(8)) store.del('hl-city-' + old.id);
  const ok = store.set('hl-city-' + world.slotId, data) && store.set('hl-slots', list.slice(0, 8));
  if (!silent) ui.toast(ok ? `${world.name} saved.` : 'Could not save (storage full?).', ok ? 'info' : 'warn');
  return ok;
}
$('saveBtn').onclick = () => { save(); ui.renderSlots(); };
$('newBtn').onclick = () => { save(true); sessionStorage.setItem('hl-boot', JSON.stringify({ mode: 'new', seed: Math.floor(Math.random() * 999999), village: true })); location.reload(); };
ui.onLoad = id => { save(true); sessionStorage.setItem('hl-boot', JSON.stringify({ mode: 'load', id, start: true })); location.reload(); };
// autosave: a few seconds after anything is built, every 20 seconds of play, and when the tab is hidden or closed
let saveSoon = 0;
world.on(type => { if (playing && type !== 'stats') saveSoon = saveSoon || setTimeout(() => { saveSoon = 0; save(true); }, 2500); });
setInterval(() => { if (playing) save(true); }, 20000);
addEventListener('pagehide', () => { if (playing) save(true); });
document.addEventListener('visibilitychange', () => { if (playing && document.hidden) save(true); });

// graphics options
$('optTilt').checked = store.get('hl-tilt', true); stage.state.tilt = $('optTilt').checked;
$('optTilt').onchange = e => { stage.state.tilt = e.target.checked; store.set('hl-tilt', e.target.checked); };
$('optLow').checked = quality === 'low';
$('optLow').onchange = e => { store.set('hl-low', e.target.checked); ui.toast('Quality changes apply after a reload.', 'info'); };
$('optSound').checked = sfx.on;
$('optSound').onchange = e => { sfx.setOn(e.target.checked); store.set('hl-sound', e.target.checked); };
addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// ---------------------------------------------------------------- loop
const clock = new THREE.Timer();
let overlayT = 0;
function frame() {
  requestAnimationFrame(frame);
  clock.update(); const dt = Math.min(clock.getDelta(), 0.05), t = clock.getElapsed();
  if (!stage.state.auto && ui.timeTarget !== undefined) {
    let d = ui.timeTarget - stage.state.time; if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
    stage.state.time = (stage.state.time + d * Math.min(1, dt * 2) + 1) % 1;
  }
  if (!playing && !reducedMotion) stage.view.yawTo += dt * 0.04;
  stage.update(dt);
  input.update(dt);
  if (playing) sim.step(dt, ui.speed);
  const night = stage.state.night;
  city.update(dt, t, night);
  agents.update(dt * (playing && ui.speed === 0 ? 0.25 : 1), t, night);
  fx.update(dt, stage.renderer.domElement.height / (2 * stage.view.zoom), night);
  terrain.update(t, stage.state);
  sfx.update(dt, night, stage.view.zoom);
  if (playing) ui.update(dt);
  overlayT -= dt; if (city.overlayMode && overlayT <= 0) { overlayT = 1; city.paintOverlay(); }
  if (stage._overlayDirty) { terrain.overlay.commit(); stage._overlayDirty = false; }
  stage.render();
}
frame();
window.__hl = { stage, world, sim, city, agents, ui, input };
