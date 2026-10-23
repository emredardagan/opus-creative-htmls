// Mirrormere: boot, save data, the clock and weather, progression, input and panels.
import * as THREE from 'three';
import * as A from './assets.js';
import { createWorld, MODELS, SPOTS, phaseOf, zoneAt } from './world.js';
import { createFishing, CAST_RANGE } from './fishing.js';
import { SPECIES, byId, valueOf, weightKg, RARITY, RARITY_COLOR } from './fish.js';
import { Audio } from './audio.js';
import { $, createViewer, pop, toast, stars, renderJournal } from './ui.js';

const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAY_SECONDS = 14 * 60;
const SAVE_KEY = 'mirrormere.v1';

// ---------- save ----------
const fresh = () => ({
  coins: 0, xp: 0, up: { rod: 0, reel: 0, line: 0, bait: 0 }, spots: { dock: true, cove: false, boat: false }, spot: 'dock',
  journal: {}, luck: 0, day: 1, t: 0.27, notes: [], notesDay: 0, muted: false, music: true, total: 0, seenJournal: 0,
});
let save;
try { save = { ...fresh(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') }; } catch { save = fresh(); }
save.up = { ...fresh().up, ...save.up }; save.spots = { ...fresh().spots, ...save.spots };
let saveT = 0;
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} };

// ---------- ranks ----------
const RANKS = ['Puddle Dabbler', 'Bobber Watcher', 'Reed Wader', 'Line Whisperer', 'Lake Regular', 'Deepwater Angler', 'Old Hand', 'Mirror Keeper', 'Legend of the Mere'];
const xpFor = lvl => Math.round(50 * Math.pow(lvl, 1.6));
function rankOf(xp) { let l = 0; while (l < RANKS.length - 1 && xp >= xpFor(l + 1)) l++; return l; }

// ---------- shop ----------
const SHOP = {
  rod: { icon: 'ph-arrow-up-right', title: 'Rod', names: ['Willow Twig', 'Ash Rod', 'Split Cane', 'Carbon Rod', 'Starlight Rod'], prices: [0, 60, 200, 520, 1200],
    what: l => `Casts up to ${CAST_RANGE[l]} m` },
  reel: { icon: 'ph-arrows-clockwise', title: 'Reel', names: ['Tin Spool', 'Brass Reel', 'Clicker Reel', 'Silent Reel', 'Moonwind Reel'], prices: [0, 50, 170, 450, 1000],
    what: l => l === 0 ? 'Slow and steady' : `Reels ${Math.round(l * 20)}% faster` },
  line: { icon: 'ph-wave-sine', title: 'Line', names: ['Cotton Thread', 'Braided Line', 'Silk Line', 'Spider Silk', 'Mermaid Hair'], prices: [0, 50, 180, 470, 1050],
    what: l => l === 0 ? 'Snaps if you pull too hard' : `Tension builds ${Math.round((1 - 1 / (1 + 0.22 * l)) * 100)}% slower` },
  bait: { icon: 'ph-bug', title: 'Bait', names: ['Garden Worms', 'Crickets', 'Glow Grubs', 'Moon Moths'], prices: [0, 90, 340, 950],
    what: l => l === 0 ? 'Plain and honest' : `Faster bites, rarer fish${l >= 2 ? ', legends take it' : ''}` },
};
const SPOT_PRICE = { dock: 0, cove: 60, boat: 420 };

// ---------- weather ----------
const WEATHER = {
  clear: { name: 'Clear', icon: 'ph-sun', wind: 0.18, rain: 0, fog: 0, cloud: 0.28 },
  breezy: { name: 'Breezy', icon: 'ph-wind', wind: 0.75, rain: 0, fog: 0, cloud: 0.5 },
  rain: { name: 'Rain', icon: 'ph-cloud-rain', wind: 0.5, rain: 1, fog: 0.22, cloud: 0.92 },
  fog: { name: 'Fog', icon: 'ph-cloud-fog', wind: 0.04, rain: 0, fog: 1, cloud: 0.6 },
};
let weather = save.weather && WEATHER[save.weather] ? save.weather : 'clear';
let weatherT = 50 + Math.random() * 60;
function nextWeather(t) {
  const ph = phaseOf(t);
  const w = { clear: 0.42, breezy: 0.24, rain: 0.2, fog: ph === 'dawn' || ph === 'night' ? 0.24 : 0.08 };
  delete w[weather];
  let tot = 0; for (const k in w) tot += w[k];
  let r = Math.random() * tot;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'clear';
}

// ---------- boot ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const audio = new Audio();
audio.muted = save.muted; audio.musicOn = save.music;

const fishModels = [...new Set(SPECIES.map(s => s.model))];
const all = [...new Set([...MODELS, ...fishModels])];
await A.preload(all, p => { $('loadBar').style.width = `${Math.round(p * 100)}%`; });
await A.ready(all);

const world = createWorld(renderer, { mobile });
const { scene, camera } = world;
world.state.t = save.t;
Object.assign(world.state, (({ wind, rain, fog, cloud }) => ({ wind, rain, fog, cloud }))(WEATHER[weather]));
if (save.spots[save.spot]) world.placeSpot(save.spot);

const viewer = createViewer();

// ---------- game glue for the fishing code ----------
let lastPrompt = null, lastHot = false, lastZone = null;
const game = {
  up: save.up,
  reducedMotion,
  luck: () => save.luck > 0 ? 5 : 0,
  cond: () => ({ phase: phaseOf(world.state.t), weather }),
  prompt(text, hot = false) {
    if (text === lastPrompt && hot === lastHot) return;
    lastPrompt = text; lastHot = hot;
    $('promptText').textContent = text || '';
    $('prompt').classList.toggle('hide', !text);
    $('prompt').classList.toggle('hot', !!hot);
  },
  zone(text) {
    if (text === lastZone) return;
    lastZone = text;
    if (text) $('zoneTag').textContent = text;
    $('zoneTag').classList.toggle('on', !!text);
  },
  power(p, d) {
    const el = $('power');
    if (p == null) { if (!el.hidden) el.hidden = true; return; }
    el.hidden = false;
    $('powerArc').style.strokeDashoffset = 314 * (1 - p);
    $('powerDist').textContent = `${Math.round(d)} m`;
  },
  fight({ tension, progress, run, sweet, hold }) {
    $('tensionNeedle').style.left = `${Math.min(100, tension * 100)}%`;
    $('tensionFill').style.width = `${Math.min(100, tension * 100)}%`;
    $('reelFill').style.width = `${progress * 100}%`;
    $('reelFish').style.left = `${progress * 100}%`;
    $('fight').classList.toggle('danger', tension > 0.82);
    $('fight').classList.toggle('running', run);
    $('fightHelp').textContent = run ? (hold ? 'It\'s running — let go!' : 'Hold on… let it tire') : tension < 0.2 ? 'Line\'s slack — reel in!' : sweet ? 'Sweet spot — keep reeling' : hold ? 'Reeling…' : 'Hold to reel';
  },
  toast(t) { toast(t); },
  onMode(m) {
    $('fight').hidden = m !== 'fight';
    if (m === 'fight') game.prompt('');
  },
  onBite() { navigator.vibrate?.(60); catDo('Jump', 900); },
  onHook(fish, cm) {
    save.luck = Math.max(0, save.luck - 1);
    $('fightName').textContent = fish.rarity >= 4 ? 'Something huge is on!' : fish.junk ? 'It\'s… not fighting much' : cm > fish.size[0] + (fish.size[1] - fish.size[0]) * 0.6 ? 'A big one!' : 'Fish on!';
    pop(innerWidth / 2, innerHeight * 0.42, 'Hooked!', 'big gold');
    audio.tone(880, 0.1, { type: 'triangle', vol: 0.12 });
    navigator.vibrate?.([40, 30, 40]);
  },
  onLose(reason) {
    pop(innerWidth / 2, innerHeight * 0.42, reason === 'snap' ? 'Snap!' : 'Slipped away…', 'big red');
    toast(reason === 'snap' ? 'The line snapped. Let go when it runs.' : 'It shook the hook. Keep some tension on the line.');
    catDo('No', 1600);
  },
  onCatch(fish, cm) { showCatch(fish, cm); },
};
const fishing = createFishing(world, audio, game);
viewer.setTint(fishing.tint);

// the cat beside you reacts to everything
let catTimer = 0;
function catDo(anim, ms) {
  clearTimeout(catTimer);
  A.play(world.cat, anim, { once: anim !== 'Dance' });
  catTimer = setTimeout(() => A.play(world.cat, 'Idle'), ms);
}

// ---------- catch card ----------
let pending = null;
function showCatch(fish, cm) {
  const rec = save.journal[fish.id];
  const first = !rec;
  const record = rec && cm > rec.best;
  const value = valueOf(fish, cm);
  pending = { fish, cm, value, at: performance.now() };
  save.journal[fish.id] = { n: (rec?.n || 0) + 1, best: Math.max(rec?.best || 0, cm) };
  save.total++;
  const xpGain = fish.rarity * 8 + (first ? 25 : 0) + (record ? 10 : 0);
  addXp(xpGain);
  checkNotes(fish, cm);
  persist();

  $('catchName').textContent = fish.name;
  $('catchRarity').className = `rarity r${fish.rarity}`;
  $('catchRarity').innerHTML = stars(fish.rarity);
  $('catchLen').textContent = `${cm} cm`;
  $('catchWt').textContent = `${weightKg(fish, cm)} kg`;
  $('catchVal').innerHTML = `<i class="ph-fill ph-coin-vertical"></i> ${value}`;
  $('catchDesc').textContent = fish.desc;
  const tags = [];
  if (first) tags.push('<span class="tag gold">First catch · added to journal</span>');
  if (record) tags.push('<span class="tag">Personal best!</span>');
  tags.push(`<span class="tag">+${xpGain} xp</span>`);
  $('catchTags').innerHTML = tags.join('');
  document.querySelector('#catch .card').style.setProperty('--glow', fish.rarity >= 4 ? RARITY_COLOR[fish.rarity] + '66' : '#fff3d6');
  $('catch').hidden = false;
  viewer.mount($('catchView'));
  viewer.set(fish, { tint: fishing.tint });
  viewer.start();
  audio.fanfare(fish.rarity);
  if (fish.rarity >= 3) world.burst(camera.localToWorld(new THREE.Vector3(0, 0, -2)), { n: 30, color: 0xffe29a, speed: 2, up: 2, gravity: -1, size: 0.08, additive: true, life: 1.4 });
  catDo(fish.rarity >= 4 ? 'Dance' : 'Yes', fish.rarity >= 4 ? 3600 : 1500);
  if (first) $('journalDot').hidden = false;
}
function closeCatch(released) {
  if (!pending) return;
  const { fish, value } = pending;
  if (released) {
    save.luck = Math.min(9, save.luck + 2);
    toast('<i class="ph-fill ph-clover"></i> Released. The lake feels luckier.');
    addXp(4);
  } else {
    addCoins(value);
    if (fish.rarity <= 1 && !fish.junk && Math.random() < 0.35) { catDo('Bite_Front', 1400); toast('The cat helps itself to a nibble.'); }
  }
  pending = null;
  $('catch').hidden = true;
  viewer.stop();
  fishing.finishCatch(released);
  persist();
}
$('btnKeep').onclick = () => { audio.uiTap(); closeCatch(false); };
$('btnRelease').onclick = () => { audio.uiTap(); closeCatch(true); };

// ---------- coins & xp ----------
function addCoins(n, from) {
  save.coins += n;
  $('coins').textContent = save.coins;
  const el = document.querySelector('.coins');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  const r = el.getBoundingClientRect();
  pop(r.left + r.width / 2, r.bottom + 18, `+${n}`, 'gold');
  audio.coin(Math.ceil(n / 15));
}
function addXp(n) {
  const before = rankOf(save.xp);
  save.xp += n;
  const after = rankOf(save.xp);
  if (after > before) {
    setTimeout(() => { toast(`<i class="ph-fill ph-medal"></i> New rank: <b>${RANKS[after]}</b>`, 3500); audio.fanfare(3); }, 900);
  }
  renderRank();
}
function renderRank() {
  const l = rankOf(save.xp);
  $('rankName').textContent = RANKS[l];
  const a = l === 0 ? 0 : xpFor(l), b = xpFor(l + 1);
  $('xpFill').style.width = l >= RANKS.length - 1 ? '100%' : `${Math.min(100, (save.xp - a) / (b - a) * 100)}%`;
}

// ---------- lake notes (daily requests) ----------
const PHASES = ['dawn', 'day', 'dusk', 'night'];
const ZONES = ['shallows', 'open', 'deep', 'lily'];
function makeNotes() {
  const rnd = a => a[Math.random() * a.length | 0];
  const lvl = rankOf(save.xp);
  const pool = [
    () => { const n = 3 + (Math.random() * 3 | 0) + lvl; return { kind: 'count', need: n, text: `Catch ${n} fish`, reward: 10 + n * 6 }; },
    () => { const z = rnd(ZONES.filter(z => z !== 'deep' || save.up.rod >= 2 || save.spots.boat).filter(z => z !== 'lily' || save.spots.cove)); const n = 2 + (Math.random() * 2 | 0);
      return { kind: 'zone', zone: z, need: n, text: `Catch ${n} fish in the ${z === 'lily' ? 'lily pads' : z === 'open' ? 'open water' : z === 'deep' ? 'deep water' : 'shallows'}`, reward: 30 + n * 10 }; },
    () => { const p = rnd(PHASES); return { kind: 'phase', phase: p, need: 2, text: `Catch 2 fish ${p === 'day' ? 'in the daytime' : p === 'night' ? 'at night' : 'at ' + p}`, reward: 45 }; },
    () => { const r = Math.min(4, 2 + (lvl > 3 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0)); return { kind: 'rarity', rarity: r, need: 1, text: `Catch a ${RARITY[r]} fish or rarer`, reward: [0, 0, 40, 90, 200][r] }; },
    () => { const cm = [25, 40, 60, 90][Math.min(3, lvl >> 1)]; return { kind: 'size', cm, need: 1, text: `Land a fish over ${cm} cm`, reward: 30 + cm }; },
    () => { const s = rnd(SPECIES.filter(s => s.rarity <= 2 && !s.junk && (s.zone !== 'lily' || save.spots.cove) && (s.zone !== 'deep' || save.up.rod >= 2 || save.spots.boat)));
      return { kind: 'species', id: s.id, need: 1, text: `Bring Gilbert a ${s.name}`, reward: 25 + s.rarity * 20 }; },
  ];
  const picks = [];
  const order = [...pool].sort(() => Math.random() - 0.5);
  for (let i = 0; i < 3; i++) picks.push({ ...order[i](), have: 0, done: false });
  save.notes = picks;
  save.notesDay = save.day;
  $('notesDot').hidden = false;
}
function checkNotes(fish, cm) {
  const ph = phaseOf(world.state.t);
  const zone = zoneAt(fishing.S.hookPos.x, fishing.S.hookPos.z);
  for (const n of save.notes) {
    if (n.done) continue;
    const ok = n.kind === 'count' || (n.kind === 'zone' && (zone === n.zone || (n.zone === 'shallows' && zone === 'lily')))
      || (n.kind === 'phase' && ph === n.phase) || (n.kind === 'rarity' && fish.rarity >= n.rarity && !fish.junk)
      || (n.kind === 'size' && cm >= n.cm && !fish.junk) || (n.kind === 'species' && fish.id === n.id);
    if (!ok) continue;
    n.have++;
    if (n.have >= n.need) {
      n.done = true;
      setTimeout(() => { toast(`<i class="ph-fill ph-scroll"></i> Note done: ${n.text} · +${n.reward}`, 3200); addCoins(n.reward); }, 1400);
    }
  }
}
function renderNotes() {
  $('notesDay').textContent = `Day ${save.day}`;
  $('noteList').innerHTML = save.notes.map(n => `
    <div class="item ${n.done ? 'done' : ''}">
      <div class="ic"><i class="ph-bold ${n.done ? 'ph-check-circle' : 'ph-push-pin'}"></i></div>
      <div><h4>${n.text}</h4><p>${n.done ? 'Done!' : `${n.have} / ${n.need}`}</p><div class="note-prog"><div style="width:${Math.min(100, n.have / n.need * 100)}%"></div></div></div>
      <div class="count"><i class="ph-fill ph-coin-vertical"></i> ${n.reward}</div>
    </div>`).join('');
}

// ---------- shop ----------
const SAYINGS = ['"Fine weather for it. What\'ll it be?"', '"Back again? The lake likes you."', '"Mind the Old Mirror. Or don\'t. I\'m a fish."', '"Everything\'s hand-made. By me. With fins."'];
function renderShop() {
  $('shopCoins').textContent = save.coins;
  $('shopList').innerHTML = Object.entries(SHOP).map(([k, it]) => {
    const l = save.up[k], max = it.names.length - 1;
    const nextP = it.prices[l + 1];
    const pips = it.names.map((_, i) => `<span class="${i <= l ? 'on' : ''}"></span>`).join('');
    return `<div class="item ${l >= max ? 'done' : ''}">
      <div class="ic"><i class="ph-bold ${it.icon}"></i></div>
      <div><h4>${it.names[l]}</h4><p>${it.what(l)}${l < max ? ` → <b>${it.names[l + 1]}</b>` : ''}</p><div class="pips">${pips}</div></div>
      ${l >= max ? '<button class="btn" disabled><i class="ph-bold ph-check"></i> Best</button>'
        : `<button class="btn primary" data-buy="${k}" ${save.coins < nextP ? 'disabled' : ''}><i class="ph-fill ph-coin-vertical"></i> ${nextP}</button>`}
    </div>`;
  }).join('');
  for (const b of $('shopList').querySelectorAll('[data-buy]')) b.onclick = () => {
    const k = b.dataset.buy, it = SHOP[k], p = it.prices[save.up[k] + 1];
    if (save.coins < p) return;
    save.coins -= p; save.up[k]++;
    $('coins').textContent = save.coins;
    audio.fanfare(2);
    $('shopSay').textContent = `"${it.names[save.up[k]]}. Lovely choice."`;
    persist(); renderShop();
  };
}

// ---------- spots ----------
function renderSpots() {
  $('spotList').innerHTML = Object.entries(SPOTS).map(([id, s]) => {
    const own = save.spots[id], cur = world.spot === id;
    const icon = id === 'dock' ? 'ph-anchor' : id === 'cove' ? 'ph-flower-lotus' : 'ph-boat';
    return `<div class="item ${cur ? 'cur' : ''}">
      <div class="ic"><i class="ph-bold ${icon}"></i></div>
      <div><h4>${s.name}</h4><p>${s.desc}</p></div>
      ${cur ? '<button class="btn" disabled>Here</button>' : own ? `<button class="btn ghost" data-go="${id}">Go</button>`
        : `<button class="btn primary" data-unlock="${id}" ${save.coins < SPOT_PRICE[id] ? 'disabled' : ''}><i class="ph-fill ph-coin-vertical"></i> ${SPOT_PRICE[id]}</button>`}
    </div>`;
  }).join('');
  for (const b of $('spotList').querySelectorAll('[data-go]')) b.onclick = () => goSpot(b.dataset.go);
  for (const b of $('spotList').querySelectorAll('[data-unlock]')) b.onclick = () => {
    const id = b.dataset.unlock;
    if (save.coins < SPOT_PRICE[id]) return;
    save.coins -= SPOT_PRICE[id]; save.spots[id] = true;
    $('coins').textContent = save.coins;
    audio.fanfare(3);
    goSpot(id);
  };
}
function goSpot(id) {
  fishing.cancel();
  fade(() => { world.placeSpot(id); save.spot = id; persist(); });
  closePanels();
  toast(`<i class="ph-bold ph-map-pin"></i> ${SPOTS[id].name}`);
}
function fade(mid) {
  const v = $('vignette');
  v.style.transition = 'background .35s'; v.style.background = 'rgba(10,14,30,.95)';
  setTimeout(() => { mid(); v.style.background = ''; }, 380);
}

// ---------- panels ----------
let openPanel = null;
function openP(id) {
  closePanels();
  openPanel = id;
  $(id).hidden = false;
  audio.uiTap();
  fishing.cancel();
  if (id === 'journal') { renderJournal(save, viewer, null, fishing.tint); $('journalDot').hidden = true; }
  if (id === 'shop') { renderShop(); $('shopSay').textContent = SAYINGS[Math.random() * SAYINGS.length | 0]; gilbertUp(true); }
  if (id === 'spots') renderSpots();
  if (id === 'notes') { renderNotes(); $('notesDot').hidden = true; }
}
function closePanels() {
  if (openPanel === 'journal') viewer.stop();
  if (openPanel === 'shop') gilbertUp(false);
  for (const id of ['journal', 'shop', 'spots', 'notes']) $(id).hidden = true;
  openPanel = null;
}
for (const el of document.querySelectorAll('[data-close]')) el.onclick = () => { audio.uiTap(); closePanels(); };
for (const id of ['journal', 'shop', 'spots', 'notes']) $(id).addEventListener('pointerdown', e => { if (e.target.id === id) closePanels(); });
$('btnJournal').onclick = () => openP('journal');
$('btnShop').onclick = () => openP('shop');
$('btnSpots').onclick = () => openP('spots');
$('btnNotes').onclick = () => openP('notes');
function renderMute() { $('btnMute').innerHTML = `<i class="ph-bold ${save.muted ? 'ph-speaker-slash' : save.music ? 'ph-speaker-high' : 'ph-music-note-simple'}"></i>`; }
$('btnMute').onclick = () => {
  // cycle: sound + music → sound only → muted
  if (!save.muted && save.music) save.music = false;
  else if (!save.muted) save.muted = true;
  else { save.muted = false; save.music = true; }
  audio.musicOn = save.music; audio.setMuted(save.muted);
  toast(save.muted ? 'Sound off' : save.music ? 'Sound and music on' : 'Music off');
  renderMute(); persist();
};

// Gilbert pops up beside the dock while the shop is open
let gil = { up: false, k: 0 };
function gilbertUp(on) {
  gil.up = on;
  const g = world.gilbert;
  const s = SPOTS[world.spot];
  const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
  const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
  if (on) {
    g.position.copy(s.pos).addScaledVector(fwd, 4.6).addScaledVector(right, 1.7).setY(-1.6);
    g.rotation.y = s.yaw - 0.35;
    g.visible = true;
    A.play(g, 'Wave');
    audio.splash(0.7);
    world.burst(g.position.clone().setY(0.05), { n: 14 });
    world.water.ripple(g.position.x, g.position.z, 1.2);
  }
}

// ---------- input ----------
const input = { down: false, pressed: false, released: false, aim: 0, keyAim: 0 };
let pointerId = null;
canvas.addEventListener('pointerdown', e => {
  audio.unlock();
  if (pointerId !== null || pending || openPanel || !started) return;
  pointerId = e.pointerId;
  canvas.setPointerCapture?.(e.pointerId);
  input.down = true; input.pressed = true;
  input.aim = Math.max(-1, Math.min(1, (e.clientX / innerWidth - 0.5) * 2.2));
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === pointerId || e.pointerType === 'mouse') input.aim = Math.max(-1, Math.min(1, (e.clientX / innerWidth - 0.5) * 2.2));
});
const up = e => { if (e.pointerId !== pointerId) return; pointerId = null; input.down = false; input.released = true; };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
addEventListener('keydown', e => {
  if (e.code === 'Escape') { if (pending) closeCatch(false); else closePanels(); return; }
  if (!started) { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); startGame(); } return; }
  if (e.code === 'Space') {
    e.preventDefault();
    if (pending) { if (!e.repeat && performance.now() - pending.at > 700) closeCatch(false); return; }
    if (openPanel || e.repeat) return;
    audio.unlock();
    input.down = true; input.pressed = true;
  }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.keyAim = -1;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.keyAim = 1;
  if (e.code === 'KeyJ') openPanel === 'journal' ? closePanels() : openP('journal');
});
addEventListener('keyup', e => {
  if (e.code === 'Space' && input.down && pointerId === null) { input.down = false; input.released = true; }
  if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) input.keyAim = 0;
});
addEventListener('blur', () => { if (input.down) { input.down = false; input.released = true; pointerId = null; } });

// ---------- resize ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 68 : w / h < 1.2 ? 60 : 52;
  camera.updateProjectionMatrix();
  world.water.resizeTarget(renderer.getPixelRatio());
  viewer.resize();
}
addEventListener('resize', resize);
resize();

// ---------- title ----------
let started = false;
$('loadWrap').hidden = true;
$('btnStart').hidden = false;
if (save.total > 0) $('startLabel').textContent = 'Back to the lake';
$('btnStart').onclick = startGame;
function startGame() {
  if (started) return;
  started = true;
  audio.unlock().then(() => audio.setMood(world.state.night, world.state.rain));
  audio.setMuted(save.muted);
  $('title').classList.add('out');
  setTimeout(() => $('title').hidden = true, 900);
  $('hud').hidden = false;
  $('coins').textContent = save.coins;
  renderRank(); renderMute(); renderClock(true);
  if (save.notesDay !== save.day || !save.notes.length) makeNotes();
  if (save.total === 0) setTimeout(() => toast('Hold to cast. Let go to throw. Tap when the bobber dips!', 5200), 900);
}

// ---------- clock ----------
let lastClockMin = -1, lastPhase = null;
function renderClock(force) {
  const t = world.state.t;
  const mins = Math.floor(t * 24 * 60);
  const shown = Math.floor(mins / 10) * 10;
  if (!force && shown === lastClockMin) return;
  lastClockMin = shown;
  const hh = String(Math.floor(shown / 60) % 24).padStart(2, '0'), mm = String(shown % 60).padStart(2, '0');
  $('clockTime').textContent = `${hh}:${mm}`;
  const ph = phaseOf(t);
  const icon = { dawn: 'ph-sun-horizon', day: 'ph-sun', dusk: 'ph-sun-horizon', night: 'ph-moon-stars' }[ph];
  $('phaseIcon').className = `ph-fill ${icon}`;
  const W = WEATHER[weather];
  $('weatherIcon').className = `ph-bold ${W.icon}`;
  $('weatherName').textContent = W.name;
  if (lastPhase && ph !== lastPhase && started) {
    const msg = { dawn: 'Dawn breaks over the mere.', day: 'Full daylight.', dusk: 'Dusk. The water turns gold.', night: 'Night falls. Different fish wake up.' }[ph];
    toast(`<i class="ph-fill ${icon}"></i> ${msg}`);
  }
  lastPhase = ph;
}

// ---------- loop ----------
let time = 0, audioT = 0, lastNow = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  tick(Math.min(0.05, (now - lastNow) / 1000));
  lastNow = now;
  renderer.render(scene, camera);
}
function tick(dt) {
  time += dt;
  const st = world.state;

  if (started) {
    const before = st.t;
    st.t = (st.t + dt / DAY_SECONDS) % 1;
    if (before < 0.25 && st.t >= 0.25) { save.day++; makeNotes(); toast('<i class="ph-fill ph-scroll"></i> A new day. Fresh notes on the dock post.'); }
    save.t = st.t;
    weatherT -= dt;
    if (weatherT <= 0) {
      weather = nextWeather(st.t); save.weather = weather;
      weatherT = 70 + Math.random() * 100;
      toast(`<i class="ph-bold ${WEATHER[weather].icon}"></i> ${{ clear: 'The sky clears.', breezy: 'A breeze picks up.', rain: 'Rain starts to fall.', fog: 'Fog rolls in off the hills.' }[weather]}`);
      renderClock(true);
    }
  }
  const W = WEATHER[weather];
  for (const k of ['wind', 'rain', 'fog', 'cloud']) st[k] += (W[k] - st[k]) * Math.min(1, dt * 0.12);

  if (input.keyAim) input.aim = Math.max(-1, Math.min(1, input.aim + input.keyAim * dt * 1.5));
  world.update(dt, time);
  if (dbg.freeze) { /* debug camera */ }
  else if (started) fishing.update(dt, time, input);
  else {
    // a slow drift on the title screen
    camera.rotation.set(-0.06, SPOTS[world.spot].yaw + Math.sin(time * 0.1) * 0.08, 0, 'YXZ');
  }
  input.pressed = false; input.released = false;

  // Gilbert bobbing up and down
  const g = world.gilbert;
  if (g.visible) {
    gil.k = Math.max(0, Math.min(1, gil.k + (gil.up ? dt * 2.5 : -dt * 2.5)));
    g.position.y = -1.6 + gil.k * 1.55 + Math.sin(time * 2) * 0.05;
    if (!gil.up && gil.k <= 0) g.visible = false;
  }

  audioT -= dt;
  if (audioT <= 0) { audioT = 0.5; audio.setMood(st.night, st.rain); }
  if (started) renderClock();
  saveT -= dt;
  if (saveT <= 0) { saveT = 10; if (started) persist(); }
}
world.hooks.onFrog = p => { if (p.distanceTo(camera.position) < 30 && Math.random() < 0.6) audio.croak(); };
requestAnimationFrame(frame);
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// debugging hooks
const dbg = { freeze: false };
window.__mm = { dbg, renderer, world, input, tick, step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt); renderer.render(scene, camera); }, get pending() { return pending; }, closeCatch, fishing, save, setTime: t => { world.state.t = t; }, setWeather: w => { weather = w; Object.assign(world.state, (({ wind, rain, fog, cloud }) => ({ wind, rain, fog, cloud }))(WEATHER[w])); renderClock(true); }, byId };
