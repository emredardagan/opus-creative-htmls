// Meadowlark: boot, title screen, saving, and the main loop that ties every system together.
import * as THREE from 'three';
import { createEngine } from './engine.js';
import { bake, buildGround, heightAt, pathAt, waterAt } from './terrain.js';
import { buildWater, updateWater } from './water.js';
import { Grass, grassU } from './grass.js';
import { foliageU } from './foliage.js';
import { loadAll, K } from './assets.js';
import { buildWorld, MODELS } from './world.js';
import { P, HALF } from './layout.js';
import { Input } from './input.js';
import { Player, CameraRig } from './player.js';
import { PET_MODELS } from './npc.js';
import { Quests, FEATHER_TOTAL } from './quests.js';
import { UI } from './ui.js';
import { Fx } from './fx.js';
import { Life } from './life.js';
import { Sfx } from './sfx.js';
import { groundAt, circles } from './collide.js';
import { clamp, damp, smoothstep } from './util.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const low = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || params.has('low');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SAVE = 'meadowlark-save';
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { return null; } };
let save = load() || {};

const CHARS = ['character-female-b', 'character-male-c', 'character-female-d', 'character-male-e', 'character-female-e', 'character-male-a'].map(n => K(`mini-characters/${n}`));
let charIdx = clamp(save.char ?? 0, 0, CHARS.length - 1);

// ---------------------------------------------------------------- build the island
const eng = createEngine($('stage'), { low });
bake();
buildGround(eng.scene);
const water = buildWater(eng.scene);
await loadAll([...MODELS, ...PET_MODELS, ...CHARS, K('survival-kit/fish')], p => { $('loadBar').style.width = `${Math.round(p * 85)}%`; }, p => p.includes('fantasy-town') ? 0xffe6c8 : null);
const world = buildWorld(eng.scene);
const grass = new Grass(eng.scene, { density: low ? 8 : 19 });
if (low) grassU.uFar.value = 44;
eng.noOcc.push(grass.group, water.group);
const fx = new Fx(eng.scene); eng.noOcc.push(fx.glow.pts, fx.soft.pts);
const sfx = new Sfx(); sfx.on = save.sound ?? true;
const input = new Input($('stage'));
let player = new Player(eng.scene, CHARS[charIdx]);
const rig = new CameraRig(eng.camera);
const ctx = { scene: eng.scene, eng, world, water, fx, sfx, rig, input, save, paused: false, saveNow: () => writeSave() };
Object.defineProperty(ctx, 'player', { get: () => player });
const ui = ctx.ui = new UI(ctx);
const quests = ctx.quests = new Quests(ctx);
const life = ctx.life = new Life(ctx);
$('loadBar').style.width = '100%';

// where you start: your last spot, or the village square
if (save.pos) player.place(save.pos[0], save.pos[1], save.yaw || 0); else player.place(P.spawn[0], P.spawn[1], Math.PI * 0.9);
eng.state.time = save.time ?? 0.4;
rig.yaw = player.yaw + Math.PI; rig.target.copy(player.pos).add(new THREE.Vector3(0, 1.35, 0));
const glideFor = () => 1.0 + quests.feathers * 0.35;
player.glideMax = player.glide = glideFor();
ctx.onFeather = () => { player.glideMax = glideFor(); player.glide = player.glideMax; };
ui.setFeathers(quests.feathers);

function writeSave() {
  save = { ...quests.serialize(), pos: [player.pos.x, player.pos.z], yaw: player.yaw, time: eng.state.time, char: charIdx, sound: sfx.on };
  try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch {}
}
setInterval(() => { if (playing) writeSave(); }, 10000);
addEventListener('pagehide', () => { if (playing) writeSave(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) writeSave(); });

// prewarm grass around the start and around the title shot
grass.prewarm(player.pos);

// ---------------------------------------------------------------- title screen
let playing = false;
const titleCam = { a: 0 };
// the title shot stands the traveller on the open lawn south of the square
const titleSpot = save.pos ? null : [-13, 53];
if (titleSpot) player.place(titleSpot[0], titleSpot[1], 0);
function setChar(i) {
  charIdx = (i + CHARS.length) % CHARS.length;
  const old = player, np = new Player(eng.scene, CHARS[charIdx]);
  np.place(old.pos.x, old.pos.z, old.yaw); np.glideMax = old.glideMax; np.glide = old.glide;
  eng.scene.remove(old.root); player = np;
  player.once('emote-yes');
}
{
  const t = $('title').querySelector('.title-inner');
  const pick = document.createElement('div'); pick.className = 'pick';
  pick.innerHTML = `<button class="ghost round" id="charPrev" aria-label="Previous traveller"><i class="ph-bold ph-caret-left"></i></button><span>Traveller</span><button class="ghost round" id="charNext" aria-label="Next traveller"><i class="ph-bold ph-caret-right"></i></button>`;
  t.insertBefore(pick, $('startBtn'));
  $('charPrev').onclick = () => { setChar(charIdx - 1); sfx.unlock(); sfx.ui(); };
  $('charNext').onclick = () => { setChar(charIdx + 1); sfx.unlock(); sfx.ui(); };
}
const fresh = !save.quests;
$('startLabel').textContent = fresh ? 'Begin' : 'Continue';
if (input.touch) document.querySelector('.hint-keys').textContent = 'Left stick to walk · drag to look · tap the arrow to jump, hold it to glide';
$('startBtn').disabled = false;
$('startBtn').onclick = begin;
addEventListener('keydown', e => { if (!playing && (e.code === 'Enter') && !$('startBtn').disabled) begin(); });
function begin() {
  if (playing) return; playing = true; sfx.unlock(); sfx.ui();
  $('title').classList.add('gone'); setTimeout(() => $('title').hidden = true, 900);
  $('hud').hidden = false;
  rig.yaw = player.yaw + Math.PI; rig.pitch = 0.3; rig.dist = rig.distTo = 6.6;
  ui.trackQuest();
  if (fresh) setTimeout(() => ui.toast('Pip the fox looks like they need a hand. Walk over and press E.', 'tip'), 1800);
  else setTimeout(() => ui.toast(`Welcome back. ${quests.feathers} of ${FEATHER_TOTAL} feathers found.`, 'info'), 1200);
  writeSave();
}
$('soundBtn').onclick = () => { sfx.unlock(); sfx.setOn(!sfx.on); $('soundIcon').className = `ph-bold ${sfx.on ? 'ph-speaker-high' : 'ph-speaker-slash'}`; writeSave(); };
$('soundIcon').className = `ph-bold ${sfx.on ? 'ph-speaker-high' : 'ph-speaker-slash'}`;
$('resetBtn').onclick = () => { if (confirm('Start over? Your favours and feathers will be forgotten.')) { playing = false; localStorage.removeItem(SAVE); location.reload(); } };

// ---------------------------------------------------------------- loop
const clock = new THREE.Timer();
let interactTarget = null, stepSurface = 'grass';
function surfaceAt(p) {
  const w = waterAt(p.x, p.z), h = heightAt(p.x, p.z);
  if (w > -50 && w > h + 0.05 && p.y < w + 0.3) return 'water';
  if (p.y > h + 0.3) return 'wood';
  if (Math.hypot(p.x - P.village.c[0], p.z - P.village.c[1]) < 8) return 'stone';
  if (pathAt(p.x, p.z) > 0.5) return 'dirt';
  return 'grass';
}
function frame() {
  requestAnimationFrame(frame);
  clock.update(); const dt = Math.min(clock.getDelta(), 0.05), t = clock.getElapsed();
  const paused = ctx.paused || document.hidden;
  // time of day: slow by day, quicker through the night
  if (!ctx.timeHold && !paused) { const n = eng.state.night; eng.state.time = (eng.state.time + dt / (n > 0.5 ? 360 : 1500)) % 1; }
  if (playing && !paused) {
    if (input.hit('KeyJ', 'Tab')) ui.openJournal();
    const ev = player.update(dt, ui.talking ? { axis: () => ({ x: 0, y: 0, l: 0 }), hit: () => false, down: () => false, running: () => false } : input, rig.yaw);
    for (const e of ev) {
      if (e === 'step') { stepSurface = surfaceAt(player.pos); sfx.step(stepSurface); if (stepSurface !== 'water' && stepSurface !== 'stone' && player.speed > 6) fx.dust(player.pos, 2); if (stepSurface === 'water') fx.ripple(player.pos.clone().setY(waterAt(player.pos.x, player.pos.z))); }
      if (e === 'jump') { sfx.jump(); fx.dust(player.pos, 6); }
      if (e === 'land') { sfx.land(player.landed); if (player.landed > 0.3) { fx.dust(player.pos, 10 + Math.round(player.landed * 12)); if (!reduced) rig.shake = player.landed * 0.5; } }
      if (e === 'glide') sfx.glide();
      if (e === 'splash') { sfx.splash(); fx.splash(player.pos.clone().setY(waterAt(player.pos.x, player.pos.z)), 30); }
    }
    if (player.mode === 'swim' && Math.random() < dt * (player.speed > 0.5 ? 8 : 1.5)) fx.ripple(player.pos.clone().setY(waterAt(player.pos.x, player.pos.z)));
    if (player.gliding && Math.random() < dt * 20) fx.mote(player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5), 1.8 + Math.random() * 0.5, (Math.random() - 0.5))), 0xfff2c0);
    if (player.tooFar && !ctx.warned) { ctx.warned = true; ui.toast('The sea is wide and the current pulls you back to the island.', 'info'); setTimeout(() => ctx.warned = false, 8000); }
    // interact
    interactTarget = ui.talking || quests.fishing && quests.fishing.phase !== 'cast' ? null : quests.nearestInteract(player.pos);
    if (quests.fishing) interactTarget = null;
    ui.prompt(interactTarget, input.touch);
    if (interactTarget && input.hit('KeyE') && !ui.talking && !player.frozen) interactTarget.use();
    quests.update(dt, t, input);
    rig.update(dt, player, input, reduced);
    ui.glide(player.glide / player.glideMax, !player.onGround && player.mode !== 'swim' && (player.gliding || player.glide < player.glideMax - 0.01));
    if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) ui.trackQuest();
    ui.compass(rig.yaw, player.pos);
    ui.markersUpdate(eng.camera);
  } else if (!playing) {
    // title: a slow orbit around the traveller in the village light
    // title: the traveller on the right, the village and the falls behind, a slow drift
    titleCam.a += dt * (reduced ? 0 : 1);
    const p = player.pos, fb = water.fallBase, d = new THREE.Vector3(fb.x - p.x, 0, fb.z - p.z).normalize(), side = new THREE.Vector3(-d.z, 0, d.x);
    const sway = Math.sin(titleCam.a * 0.12) * 0.6;
    player.yaw = Math.atan2(-d.x, -d.z) + 0.75; player.root.rotation.y = player.yaw;
    player.update(dt, { axis: () => ({ x: 0, y: 0, l: 0 }), hit: () => false, down: () => false, running: () => false }, 0);
    const wide = innerWidth > innerHeight ? 1 : 0;
    eng.camera.position.copy(p).addScaledVector(d, wide ? -5.6 : -6.4).addScaledVector(side, (wide ? -1.5 : -0.4) + sway);
    eng.camera.position.y = Math.max(p.y, heightAt(eng.camera.position.x, eng.camera.position.z)) + 2.0;
    eng.camera.lookAt(new THREE.Vector3().copy(p).addScaledVector(d, 7).addScaledVector(side, (wide ? -2.3 : -0.5) + sway * 0.5).add(new THREE.Vector3(0, wide ? 1.7 : 0.6, 0)));
    quests.update(dt, t, input);
  }
  eng.state.focus.copy(player.pos);
  eng.update(dt, t);
  grass.update(eng.camera.position.distanceTo(player.pos) < 30 ? player.pos : eng.camera.position);
  grassU.uTime.value = t; grassU.uSunDir.value.copy(eng.state.sunDir); grassU.uSunCol.value.copy(eng.state.day.sun); grassU.uPlayer.value.copy(player.pos);
  grassU.uSSS.value = 1 - eng.state.night;
  foliageU.uTime.value = t; foliageU.uSunDir.value.copy(eng.state.sunDir); foliageU.uSunCol.value.copy(eng.state.day.sun);
  updateWater(eng, t);
  life.update(dt, t);
  // windmill sails
  const wm = world.windmill; wm.cur = damp(wm.cur ?? wm.speed, wm.speed, 0.6, dt); wm.hub.rotation.z += wm.cur * dt;
  fx.setScale(eng.renderer.domElement.height / (2 * Math.tan(eng.camera.fov * Math.PI / 360)));
  fx.update(dt);
  const near = { night: eng.state.night, nearWater: nearWater(), nearSea: smoothstep(14, 2, heightAt(player.pos.x, player.pos.z) * 3), height: player.pos.y, speed: player.speed };
  sfx.update(dt, near);
  input.endFrame();
  eng.render();
}
let nwT = 0, nwV = 0;
function nearWater() {
  nwT -= 1; if (nwT > 0) return nwV; nwT = 15;
  let best = 0; const p = player.pos;
  for (let a = 0; a < 6.28; a += 0.8) for (const d of [2, 6, 12]) { const w = waterAt(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d); if (w > 0.5) best = Math.max(best, 1 - d / 14); }
  const fb = water.fallBase; best = Math.max(best, smoothstep(40, 6, Math.hypot(p.x - fb.x, p.z - fb.z)) * 1.6);
  return nwV = best;
}
addEventListener('keydown', e => { if (e.code === 'Escape' && !$('journal').hidden) ui.closeJournal(); });
frame();
window.__ml = { eng, world, grass, quests, ui, rig, get player() { return player; }, life, fx, sfx, writeSave, reset() { playing = false; localStorage.removeItem(SAVE); } };
