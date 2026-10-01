// Favours for the island's animals, the things you pick up for them, golden feathers,
// the fishing minigame, and the beacon finale.
import * as THREE from 'three';
import { P } from './layout.js';
import { heightAt, waterAt, slopeAt, pathAt } from './terrain.js';
import { groundAt, addCircle } from './collide.js';
import { clone } from './assets.js';
import { Pet } from './npc.js';
import { K } from './assets.js';
import { mulberry32, clamp, damp, lerp, smoothstep } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const gy = (x, z) => groundAt(x, z);
export const FEATHER_TOTAL = 12;
// nudge a spot until it is dry, fairly flat ground (so nothing ends up under the sea or in a cliff)
function landSpot(x, z, r) {
  for (let i = 0; i < 60; i++) {
    const a = r() * 6.28, d = i * 0.5, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (heightAt(px, pz) > 2.6 && waterAt(px, pz) < -50 && slopeAt(px, pz) < 0.3) return [px, pz];
  }
  return [x, z];
}

// ---------------------------------------------------------------- meshes for the things you find
function featherMesh() {
  const g = new THREE.Group();
  const vane = new THREE.Shape(); vane.moveTo(0, 0); vane.bezierCurveTo(0.24, 0.25, 0.26, 0.8, 0.02, 1.25); vane.bezierCurveTo(-0.2, 0.85, -0.18, 0.3, 0, 0);
  const vg = new THREE.ShapeGeometry(vane, 12); vg.translate(0, -0.6, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffc94a, emissive: 0xffa31a, emissiveIntensity: 0.7, metalness: 0.35, roughness: 0.35, side: THREE.DoubleSide });
  const v = new THREE.Mesh(vg, mat);
  const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.35, 5), new THREE.MeshStandardMaterial({ color: 0xfff1c2, emissive: 0xffd27a, emissiveIntensity: 0.5 })); quill.position.y = -0.05;
  g.add(v, quill); g.rotation.z = 0.35;
  // a soft beam so feathers can be spotted from across the island
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 7; beam.name = 'beam';
  const holder = new THREE.Group(); holder.add(g, beam);
  return holder;
}
function appleMesh() {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe03b2e, roughness: 0.35, emissive: 0x501008, emissiveIntensity: 0.4 })); a.scale.y = 0.9;
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.12, 5), new THREE.MeshStandardMaterial({ color: 0x5a3a20 })); st.position.y = 0.22;
  const lf = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 4), new THREE.MeshStandardMaterial({ color: 0x5ea03a })); lf.scale.set(1.4, 0.3, 0.7); lf.position.set(0.07, 0.24, 0);
  for (const m of [a, st, lf]) { m.castShadow = true; g.add(m); }
  return g;
}
function clothMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xf4ecdc, roughness: 0.9 });
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9 - i * 0.1, 0.12, 0.6 - i * 0.05), m); b.position.y = i * 0.12; b.rotation.y = i * 0.15; b.castShadow = true; g.add(b); }
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 16), new THREE.MeshStandardMaterial({ color: 0xa0743c })); rope.rotation.x = Math.PI / 2; rope.position.y = 0.2; g.add(rope);
  return g;
}
function kiteMesh() {
  const g = new THREE.Group();
  const s = new THREE.Shape(); s.moveTo(0, 0.75); s.lineTo(0.5, 0.1); s.lineTo(0, -0.75); s.lineTo(-0.5, 0.1); s.closePath();
  const geo = new THREE.ShapeGeometry(s); const col = []; const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const c = new THREE.Color(p.getX(i) * p.getY(i) > 0 ? 0xe8554e : 0x4fb6e0); col.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const k = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 })); k.castShadow = true;
  const tail = [];
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshStandardMaterial({ color: [0xffd84a, 0xe8554e, 0x4fb6e0][i % 3], side: THREE.DoubleSide })); b.position.y = -0.85 - i * 0.24; g.add(b); tail.push(b); }
  g.add(k); g.userData.tail = tail;
  return g;
}
function budMesh() {
  // a sleeping moonflower: closed petals that open when woken
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x4f8a34 })); stem.position.y = 0.45; g.add(stem);
  const petals = [];
  const pm = new THREE.MeshStandardMaterial({ color: 0xcfe2ff, emissive: 0x4a7cff, emissiveIntensity: 0.6, side: THREE.DoubleSide, roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const piv = new THREE.Group(); piv.position.y = 0.9; piv.rotation.y = i * Math.PI / 3;
    const pg = new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2); pg.scale(0.55, 1.4, 0.18); pg.translate(0, 0.2, 0.06);
    const pe = new THREE.Mesh(pg, pm); piv.add(pe); piv.rotation.x = -0.1; g.add(piv); petals.push(piv);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffd34a, emissiveIntensity: 1.2 })); core.position.y = 0.95; g.add(core);
  g.userData.petals = petals; g.userData.mat = pm;
  return g;
}
function woodMesh() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.9 }), e = new THREE.MeshStandardMaterial({ color: 0xd9b07a });
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 7), m); l.rotation.z = Math.PI / 2; l.position.set(0, 0.1 + (i > 1 ? 0.15 : 0), (i % 2 - 0.5) * 0.2 + (i > 1 ? 0.0 : 0)); l.castShadow = true; g.add(l); }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 5, 12), new THREE.MeshStandardMaterial({ color: 0xc23c2e })); band.rotation.y = Math.PI / 2; band.position.y = 0.16; g.add(band);
  return g;
}

// ---------------------------------------------------------------- the favours
// Each quest: who asks, where, what they say at each stage, and what finishes it.
export const QUESTS = [
  {
    id: 'apples', who: 'Pip', kind: 'fox', at: [-7.5, 26.5], yaw: 2.6, color: '#e8803a', need: 6, unit: 'apples',
    title: "Pip's apples", goal: n => `Find Pip's apples in the orchard (${n}/6)`, done: 'Bring the apples back to Pip', target: () => P.orchard.c,
    lines: {
      new: ["Oh! A visitor! Welcome to Meadowlark Isle.", "I'm Pip. I was carrying apples home from the orchard and... well. They rolled everywhere.", "Could you find my six apples? The orchard is west of the village, along the path past the lanterns."],
      active: ["Six round, red, shiny apples. They can't have rolled far!"],
      ready: ["You found all of them! Not even bruised.", "Here, take this. It fell from a meadowlark. They say it helps you float on the wind."],
      done: ["Hold jump while you fall and your parasol opens. The more feathers you carry, the longer you float."],
    },
  },
  {
    id: 'sail', who: 'Mabel', kind: 'cow', at: [53, -1], yaw: -2.4, color: '#7a5fd1', need: 1, unit: 'sail cloth',
    title: "Mabel's windmill", goal: () => 'Fetch the sail cloth from the eastern ruins', done: 'Return the sail cloth to Mabel', target: () => P.ruins,
    lines: {
      new: ["Moo-rning. The mill's stopped turning and I can't grind a thing.", "Last night's gust tore the sail cloth clean off. I watched it flap away toward the old ruins up the path.", "Would you fetch it for me, dear?"],
      active: ["The ruins are north of here, a ring of old stone on the knoll."],
      ready: ["That's my cloth! Give me a moment...", "There! Listen to her creak. Thank you, dear. Take this, the wind brought it."],
      done: ["The flour smells like sunshine today."],
    },
  },
  {
    id: 'kite', who: 'Juniper', kind: 'bunny', at: [9.5, -19], yaw: 2.9, color: '#e36a8a', need: 1, unit: 'kite',
    title: "Juniper's kite", goal: () => 'Rescue the kite from the clifftop above the falls', done: 'Bring the kite back to Juniper', target: () => [-2, -55],
    lines: {
      new: ["My kite! The wind snatched it right up onto the cliff above the waterfall.", "I can't climb that high. The path up starts by the camp, west along the cliff.", "If you get it... you could float back down, couldn't you?"],
      active: ["It's red and blue with a ribbon tail. You can't miss it!"],
      ready: ["My kite! Oh, thank you, thank you! Watch this!", "Here, I found this in the reeds. It's yours."],
      done: ["Look how high it goes!"],
    },
  },
  {
    id: 'fish', who: 'Captain Bramble', kind: 'penguin', at: [-24.5, 87.5], yaw: 0.4, color: '#3e7fb8', need: 3, unit: 'fish',
    title: "The captain's supper", goal: n => `Catch fish from the end of the dock (${n}/3)`, done: 'Bring the fish to Captain Bramble', target: () => [P.dock.c[0], P.dock.c[1] + 11],
    lines: {
      new: ["Ahoy there. Captain Bramble, retired.", "My old flippers can't cast like they used to. Catch me three fish from the end of the dock?", "Wait for the bobber to dip, then reel in quick. Fish are clever."],
      active: ["End of the dock, line in the water, patience in your heart."],
      ready: ["Three fine fish! I'll have a feast tonight.", "Take this feather. Found it in a gull's nest on my last voyage."],
      done: ["The sea's been kind to us this year."],
    },
  },
  {
    id: 'flowers', who: 'Bea', kind: 'bee', at: [-62, -10], yaw: 0.5, color: '#e0a21c', need: 7, unit: 'moonflowers',
    title: "Bea's moonflowers", goal: n => `Wake the sleeping moonflowers in the meadow (${n}/7)`, done: 'Tell Bea the meadow is awake', target: () => P.meadow.c,
    lines: {
      new: ["Bzz... oh dear, oh dear. The moonflowers won't wake up.", "Seven of them are sleeping in the meadow. They glow a little blue.", "Give each one a gentle tap, would you? Bzz."],
      active: ["Little blue glows, here and there. Bzz."],
      ready: ["Listen! The whole meadow is humming again!", "For you. A bee's thank-you is a golden one."],
      done: ["Bzz bzz. That means 'lovely day'."],
    },
  },
  {
    id: 'kitten', who: 'Willow', kind: 'cat', at: [0.5, 29], yaw: -1.2, color: '#8a8f9c', need: 1, unit: 'kitten',
    title: 'Where is Moss?', goal: () => 'Find Moss the kitten near the lighthouse', done: 'Bring Moss home to Willow', target: () => P.lighthouse,
    lines: {
      new: ["Have you seen my kitten, Moss? He went chasing gulls toward the lighthouse.", "He's small and grey and very, very proud.", "Please bring him home before dark."],
      active: ["The lighthouse is east, across the river bridge and along the coast path."],
      ready: ["Moss! You silly thing. Where have you been?", "Thank you. He found this on the cliffs, I think he wants you to have it."],
      done: ["He's asleep in the flower box. Proud, and tired."],
    },
  },
  {
    id: 'beacon', who: 'Hazel', kind: 'deer', at: [-36.5, -37.5], yaw: 2.6, color: '#b8763a', need: 4, unit: 'firewood', gate: 4,
    title: 'The summit beacon', goal: n => n < 4 ? `Gather dry firewood in the forest (${n}/4)` : 'Light the beacon on the summit', done: 'Light the beacon on the summit', target: n => n < 4 ? P.forest.c : P.summit,
    lines: {
      locked: ["Hello, traveller. Everyone on the island seems to need a hand today.", "Help a few more of them, then come and find me. I'll have one last favour."],
      new: ["You've been busy. The whole island is talking about you.", "At sunset, someone lights the beacon on the summit so the boats can find their way home.", "This year the firewood got soaked. Gather four dry bundles in the forest, then carry them up and light it."],
      active: ["Dry bundles, tied with red string. The forest is just north-west of here."],
      ready: ["The beacon is waiting. Up the path, all the way to the top."],
      done: ["Did you see the lanterns? I've never seen so many."],
    },
  },
];

const HIDDEN = [
  { id: 'f-islet', at: [-78, 116], up: 0.9 },
  { id: 'f-falls', at: [14, -36.5], y: 17.5 },         // in the air off the cliff: glide to it
  { id: 'f-plateau', at: [40, -62], up: 0.9 },
  { id: 'f-peak', at: [-10, -88], up: 1.4 },
  { id: 'f-hill', at: [66, 10], up: 0.9 },
];

export class Quests {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene;
    this.state = ctx.save.quests || {}; this.count = ctx.save.count || {}; this.got = new Set(ctx.save.feathers || []);
    this.items = [];      // world pickups
    this.interact = [];   // things with a prompt
    this.pets = {};
    this.r = mulberry32(42);
    // the captain waits on the sand by the first plank; the fishing goal points at the dock's end
    const ds = ctx.world.dockStart, de = ctx.world.dockEnd, fq = QUESTS.find(q => q.id === 'fish');
    fq.at = [ds.x - 3, ds.z - 1.2]; fq.target = () => [de.x, de.z];
    for (const q of QUESTS) {
      this.state[q.id] ??= 'new'; this.count[q.id] ??= 0;
      const pet = new Pet(this.scene, q.kind, q.at[0], q.at[1], { yaw: q.yaw, name: q.who, scale: q.kind === 'bee' ? 0.6 : 0.72 });
      if (q.kind === 'bee') pet.hover = true;
      this.pets[q.id] = pet; q.pet = pet;
      this.interact.push({ q, pos: () => pet.pos, r: 2.6, label: () => `Talk to ${q.who}`, use: () => this.talk(q) });
    }
    this.buildPickups();
  }
  questState(q) { return q.gate && this.doneCount() < q.gate && this.state[q.id] === 'new' ? 'locked' : this.state[q.id]; }
  doneCount() { return QUESTS.filter(q => q.id !== 'beacon' && this.state[q.id] === 'done').length; }
  get feathers() { return this.got.size; }

  // ---------------------------------------------------------------- pickups
  addItem(mesh, pos, opts) {
    mesh.position.copy(pos); this.scene.add(mesh);
    const it = { mesh, pos: pos.clone(), base: pos.y, phase: this.r() * 6, ...opts }; this.items.push(it);
    if (opts.prompt) this.interact.push({ item: it, pos: () => it.pos, r: opts.r || 2.2, label: () => opts.prompt, use: () => this.take(it), on: () => !it.gone && (opts.when ? opts.when() : true) });
    return it;
  }
  buildPickups() {
    const st = this.state, c = this.count;
    // apples under the orchard trees
    const trees = this.ctx.world.appleTrees;
    for (let i = 0; i < 6; i++) {
      const t = trees[(i * 3 + 1) % trees.length], a = this.r() * 6.28, [x, z] = landSpot(t.x + Math.cos(a) * 1.8, t.z + Math.sin(a) * 1.8, this.r);
      if (st.apples !== 'new' && i < (st.apples === 'active' ? c.apples : 6)) continue;
      this.addItem(appleMesh(), V(x, gy(x, z) + 0.22, z), { quest: 'apples', auto: 1.1, glow: 0xff7a5a, when: () => st.apples === 'active', spin: 0.6 });
    }
    // the sail cloth in the middle of the ruins
    if (st.sail !== 'done' && st.sail !== 'ready') this.addItem(clothMesh(), V(P.ruins[0], gy(P.ruins[0], P.ruins[1]) + 0.5, P.ruins[1]), { quest: 'sail', prompt: 'Pick up the sail cloth', when: () => st.sail === 'active', glow: 0xfff2d0 });
    // the kite, snagged on a bush on the clifftop
    if (st.kite !== 'done' && st.kite !== 'ready') {
      const [x, z] = [-2, -55], k = kiteMesh(); k.rotation.set(0.6, 0.4, 0.3);
      this.addItem(k, V(x, gy(x, z) + 1.3, z), { quest: 'kite', prompt: 'Free the kite', when: () => st.kite === 'active', glow: 0xff9ab0, r: 2.6, flutter: true });
    }
    // moonflowers asleep in the meadow
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + 0.4, d = 9 + (i % 3) * 4.5, [x, z] = landSpot(P.meadow.c[0] + Math.cos(a) * d, P.meadow.c[1] + Math.sin(a) * d, this.r);
      const b = budMesh(); const woke = st.flowers === 'done' || st.flowers === 'ready' || (st.flowers === 'active' && i < c.flowers);
      const it = this.addItem(b, V(x, gy(x, z) - 0.02, z), { quest: 'flowers', prompt: 'Wake the moonflower', when: () => st.flowers === 'active' && !it.woke, glow: 0x8ab4ff, still: true, keep: true });
      if (woke) { it.woke = true; this.bloom(it, true); }
    }
    // firewood bundles in the forest
    for (let i = 0; i < 4; i++) {
      if (st.beacon === 'done' || (st.beacon !== 'new' && i < c.beacon)) continue;
      const a = i * 1.7 + 0.6, d = 8 + i * 4, [x, z] = landSpot(P.forest.c[0] + Math.cos(a) * d, P.forest.c[1] + Math.sin(a) * d, this.r);
      this.addItem(woodMesh(), V(x, gy(x, z) + 0.05, z), { quest: 'beacon', prompt: 'Take the firewood', when: () => st.beacon === 'active' && c.beacon < 4, glow: 0xffb347, still: true });
    }
    // Moss the kitten, hiding among the rocks by the lighthouse
    if (st.kitten !== 'done' && st.kitten !== 'ready') {
      const [x, z] = [P.lighthouse[0] - 5, P.lighthouse[1] + 4.5];
      this.kitten = new Pet(this.scene, 'cat', x, z, { scale: 0.38, solid: false, yaw: 2 });
      this.interact.push({ pos: () => this.kitten.pos, r: 2.2, label: () => 'Pick up Moss', on: () => st.kitten === 'active' && !this.follow, use: () => { this.follow = this.kitten; this.ctx.sfx.mew(); this.ctx.ui.toast('Moss climbs onto your shoulder. Purr.', 'item'); this.setReady('kitten'); } });
    } else if (st.kitten === 'ready') { this.kitten = new Pet(this.scene, 'cat', this.ctx.player.pos.x, this.ctx.player.pos.z, { scale: 0.38, solid: false }); this.follow = this.kitten; }
    // golden feathers hidden around the island
    for (const f of HIDDEN) {
      if (this.got.has(f.id)) continue;
      const y = f.y ?? gy(f.at[0], f.at[1]) + f.up;
      this.addItem(featherMesh(), V(f.at[0], y, f.at[1]), { feather: f.id, auto: 1.5, glow: 0xffd36a, spin: 1.4 });
    }
    // fishing spot at the end of the dock
    this.interact.push({ pos: () => this.ctx.world.dockEnd, r: 2.0, label: () => this.fishing ? 'Reel in!' : 'Cast a line', on: () => st.fish === 'active' && c.fish < 3 && !this.fishing, use: () => this.startFishing() });
    // the beacon itself
    this.interact.push({ pos: () => this.ctx.world.beacon, r: 3.4, label: () => 'Light the beacon', on: () => st.beacon === 'ready', use: () => this.finale() });
    // a kite that flies above Juniper once returned
    if (st.kite === 'done') this.flyKite();
    if (st.sail === 'done') this.ctx.world.windmill.speed = 0.6; else this.ctx.world.windmill.speed = 0;
  }
  bloom(it, instant) {
    it.woke = true; it.bloomT = instant ? 1 : 0; it.mesh.userData.mat.emissive.set(0xff8ac8); it.mesh.userData.mat.color.set(0xffe4f2);
  }
  take(it) {
    const { ui, fx, sfx } = this.ctx, st = this.state, c = this.count;
    if (it.feather) {
      it.gone = true; this.got.add(it.feather); fx.sparkle(it.pos, 60, 0xffd36a, 1.4); sfx.feather();
      ui.featherGet(this.feathers); this.ctx.onFeather?.(); this.ctx.saveNow();
      return;
    }
    const q = QUESTS.find(q => q.id === it.quest);
    if (q.id === 'flowers') { this.bloom(it); fx.sparkle(it.pos.clone().add(V(0, 1, 0)), 40, 0xffa8d8); sfx.chime(c.flowers); c.flowers++; ui.toast(`Moonflower awake (${c.flowers}/7)`, 'item'); if (c.flowers >= 7) this.setReady('flowers'); this.ctx.saveNow(); return; }
    it.gone = true; fx.sparkle(it.pos, 30, it.glow ?? 0xffe08a); sfx.pickup();
    c[q.id] = (c[q.id] || 0) + 1;
    if (q.id === 'beacon') { ui.toast(`Firewood (${c.beacon}/4)`, 'item'); if (c.beacon >= 4) { this.setReady('beacon'); ui.toast('Now carry it up to the summit beacon.', 'tip'); } }
    else if (q.need > 1) { ui.toast(`${q.unit[0].toUpperCase() + q.unit.slice(1)} (${c[q.id]}/${q.need})`, 'item'); if (c[q.id] >= q.need) this.setReady(q.id); }
    else { ui.toast(`Got the ${q.unit}!`, 'item'); this.setReady(q.id); }
    this.ctx.player.once('pick-up');
    this.ctx.saveNow();
  }
  setReady(id) { this.state[id] = 'ready'; this.ctx.ui.trackQuest(); }

  // ---------------------------------------------------------------- talking
  async talk(q) {
    const { ui, sfx, player } = this.ctx, st = this.state;
    const s = this.questState(q);
    q.pet.talking = true; player.frozen = true;
    sfx.talk(q.kind);
    if (q.id === 'kitten' && s === 'active' && this.follow) this.setReady('kitten');
    const stage = this.questState(q);
    await ui.say(q.who, q.color, q.lines[stage] || q.lines.done, q.kind, this.ctx.sfx);
    if (stage === 'new') { st[q.id] = 'active'; ui.toast(`New favour: ${q.title}`, 'quest'); sfx.quest(); ui.trackQuest(q.id); }
    if (stage === 'ready' && q.id !== 'beacon') this.complete(q);
    q.pet.talking = false; player.frozen = false;
    this.ctx.saveNow();
  }
  complete(q) {
    const { ui, fx, sfx } = this.ctx;
    this.state[q.id] = 'done'; q.pet.cheer(); sfx.complete();
    this.got.add('q-' + q.id); fx.sparkle(q.pet.pos.clone().add(V(0, 1.2, 0)), 80, 0xffd36a, 1.3);
    ui.featherGet(this.feathers); ui.toast(`Favour done: ${q.title}`, 'quest');
    this.ctx.onFeather?.();
    if (q.id === 'sail') { this.ctx.world.windmill.speed = 0.6; this.ctx.fx.sparkle(this.ctx.world.windmill.hub.position, 60, 0xffffff, 1.5); }
    if (q.id === 'kite') this.flyKite();
    if (q.id === 'kitten' && this.follow) { const k = this.follow; this.follow = null; k.home.set(q.pet.pos.x + 1.2, q.pet.pos.z + 0.8); k.wander = 2.2; k.goal = null; }
    ui.trackQuest();
  }
  flyKite() {
    const k = kiteMesh(); k.scale.setScalar(0.8); this.scene.add(k); this.kite = k;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    this.scene.add(line); this.kiteLine = line;
  }

  // ---------------------------------------------------------------- fishing
  startFishing() {
    const { player, ui, sfx } = this.ctx, end = this.ctx.world.dockEnd;
    player.frozen = true; player.yaw = 0; player.once('interact-right', 'idle');
    const bob = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8554e, roughness: 0.4 }));
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    bob.add(top, bottom); this.scene.add(bob);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.scene.add(line);
    const spot = V(end.x + (this.r() - 0.5) * 3, 0, end.z + 5 + this.r() * 2);
    this.fishing = { t: 0, phase: 'cast', bob, line, spot, bite: 2 + this.r() * 3.5, window: 0 };
    sfx.cast(); ui.hint('Wait for the bobber to dip...');
  }
  updateFishing(dt, input) {
    const f = this.fishing; if (!f) return;
    const { player, fx, sfx, ui } = this.ctx;
    f.t += dt;
    const rod = player.pos.clone().add(V(Math.sin(player.yaw) * 0.8, 1.6, Math.cos(player.yaw) * 0.8));
    if (f.phase === 'cast') {
      const k = Math.min(1, f.t / 0.7); f.bob.position.lerpVectors(rod, f.spot, k); f.bob.position.y = lerp(rod.y, 0.05, k) + Math.sin(k * Math.PI) * 2;
      if (k >= 1) { f.phase = 'wait'; f.t = 0; fx.splash(f.spot, 8); sfx.plop(); }
    } else if (f.phase === 'wait') {
      f.bob.position.y = 0.05 + Math.sin(f.t * 3) * 0.03;
      if (f.t > f.bite - 0.8 && Math.random() < dt * 3) { f.bob.position.y -= 0.05; fx.ripple(f.spot); }
      if (f.t > f.bite) { f.phase = 'bite'; f.t = 0; fx.splash(f.spot, 14); sfx.bite(); ui.hint('Now! Press E (or tap the hand)'); this.ctx.rig.shake = 0.3; }
      else if (input.hit('KeyE')) { ui.hint('Too early... the fish swam off.'); this.endFishing(false); return; }
    } else if (f.phase === 'bite') {
      f.bob.position.y = -0.12 + Math.sin(f.t * 30) * 0.05;
      if (input.hit('KeyE')) {
        f.phase = 'catch'; f.t = 0; sfx.reel();
        const fish = clone(K('survival-kit/fish')); fish.scale.setScalar(3.2); this.scene.add(fish); f.fish = fish;
      } else if (f.t > 0.95) { ui.hint('It got away! Try again.'); this.endFishing(false); return; }
    } else if (f.phase === 'catch') {
      const k = Math.min(1, f.t / 0.9);
      f.fish.position.lerpVectors(f.spot, rod, k); f.fish.position.y += Math.sin(k * Math.PI) * 3; f.fish.rotation.z = f.t * 12;
      f.bob.position.copy(f.fish.position);
      if (k >= 1) {
        this.scene.remove(f.fish); fx.sparkle(rod, 30, 0x9fe0ff); sfx.pickup();
        const c = this.count; c.fish++; ui.toast(`Fish (${c.fish}/3)`, 'item');
        if (c.fish >= 3) this.setReady('fish');
        this.endFishing(true); this.ctx.saveNow(); return;
      }
    }
    f.line.geometry.setFromPoints([rod, f.bob.position]);
  }
  endFishing() {
    const f = this.fishing; if (!f) return;
    this.scene.remove(f.bob, f.line); this.fishing = null; this.ctx.player.frozen = false;
    setTimeout(() => this.ctx.ui.hint(''), 1500);
  }

  // ---------------------------------------------------------------- finale
  async finale() {
    const ctx = this.ctx, { ui, sfx, eng, rig, player, fx } = ctx;
    player.frozen = true;
    this.state.beacon = 'done'; this.got.add('q-beacon');
    const night = eng.state.time > 0.73 && eng.state.time < 0.8;
    if (!night) { await ui.fadeTo(1, 900); eng.state.time = 0.737; ctx.timeHold = true; await new Promise(r => setTimeout(r, 400)); await ui.fadeTo(0, 1200); }
    const b = ctx.world.beacon;
    this.fire = { pos: b.clone(), t: 0 };
    const light = new THREE.PointLight(0xffa04a, 0, 40, 1.6); light.position.copy(b).add(V(0, 1.6, 0)); this.scene.add(light); this.fire.light = light;
    sfx.whoosh(); rig.shake = 0.6; fx.sparkle(b.clone().add(V(0, 1, 0)), 120, 0xffb347, 2);
    // the camera pulls back over the island while lanterns rise from the village
    rig.override = { pos: b.clone().add(V(14, 9, 18)), look: b.clone().add(V(0, 2, 0)) };
    await new Promise(r => setTimeout(r, 2600));
    const v = P.village.c;
    this.lanterns = [];
    for (let i = 0; i < 46; i++) {
      const x = v[0] + (this.r() - 0.5) * 34, z = v[1] + (this.r() - 0.5) * 34;
      this.lanterns.push({ p: V(x, heightAt(x, z) + 1, z), v: 1.2 + this.r() * 1.2, delay: i * 0.12, ph: this.r() * 6 });
    }
    this.ctx.life?.releaseLanterns(this.lanterns);
    for (const q of QUESTS) q.pet.cheer();
    rig.override = { pos: V(v[0] + 30, 26, v[1] + 46), look: V(v[0], 14, v[1] - 10) };
    sfx.complete(); sfx.music?.swell?.();
    for (let i = 0; i < 9; i++) setTimeout(() => { const p = V(v[0] + (this.r() - 0.5) * 50, 34 + this.r() * 14, v[1] - 10 + (this.r() - 0.5) * 30); fx.firework(p, [0xffd36a, 0xff8ac8, 0x8ac8ff, 0xa8ff9a][i % 4]); sfx.firework(); }, 3000 + i * 900);
    await new Promise(r => setTimeout(r, 11000));
    rig.override = null; player.frozen = false; ctx.timeHold = false;
    ui.featherGet(this.feathers);
    ui.ending(this.feathers, FEATHER_TOTAL);
    ui.trackQuest(); ctx.saveNow();
  }

  // ---------------------------------------------------------------- per frame
  update(dt, t, input) {
    const { player, fx } = this.ctx;
    for (const it of this.items) {
      if (it.gone) { if (!it.removed) { it.removed = true; it.vanish = 0.35; } }
      if (it.vanish !== undefined) {
        it.vanish -= dt; const k = Math.max(0, it.vanish / 0.35); it.mesh.scale.setScalar(k * 1.3); it.mesh.position.y += dt * 3;
        if (it.vanish <= 0) { this.scene.remove(it.mesh); it.vanish = undefined; it.dead = true; }
        continue;
      }
      if (it.dead) continue;
      const active = it.feather || !it.when || it.when() || it.keep;
      it.mesh.visible = active || it.still;
      if (!it.still) {
        it.mesh.position.y = it.base + Math.sin(t * 2 + it.phase) * 0.15;
        if (it.spin) it.mesh.rotation.y += dt * it.spin * 2;
      }
      if (it.flutter) { const tail = it.mesh.userData.tail; tail.forEach((b, i) => { b.rotation.y = Math.sin(t * 6 + i) * 0.6; b.position.x = Math.sin(t * 4 + i * 0.6) * 0.05 * i; }); }
      if (it.bloomT !== undefined && it.bloomT < 1) it.bloomT = Math.min(1, it.bloomT + dt * 1.5);
      if (it.mesh.userData.petals) { const k = it.woke ? smoothstep(0, 1, it.bloomT ?? 1) : 0; it.mesh.userData.petals.forEach(p => { p.rotation.x = -0.1 - k * 1.05 + (it.woke ? 0 : Math.sin(t * 1.5 + it.phase) * 0.04); }); }
      // glints so things read from a distance
      if (active && it.glow && !it.woke && Math.random() < dt * 4) fx.mote(it.mesh.position.clone().add(V((Math.random() - 0.5) * 0.6, Math.random() * 0.8, (Math.random() - 0.5) * 0.6)), it.glow);
      if (it.feather && Math.random() < dt * 10) fx.mote(it.mesh.position.clone().add(V((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8)), 0xffd36a);
      if (active && it.auto && it.pos.distanceTo(player.pos.clone().add(V(0, 0.6, 0))) < it.auto + 0.5) this.take(it);
    }
    // the kitten follows at your heels
    if (this.kitten) {
      if (this.follow === this.kitten) {
        const k = this.kitten, back = V(player.pos.x - Math.sin(player.yaw) * 1.1, 0, player.pos.z - Math.cos(player.yaw) * 1.1);
        const d = Math.hypot(back.x - k.pos.x, back.z - k.pos.z);
        if (d > 0.3) { const sp = Math.min(d * 3, 9) * dt; k.yaw = Math.atan2(back.x - k.pos.x, back.z - k.pos.z); k.pos.x += Math.sin(k.yaw) * sp; k.pos.z += Math.cos(k.yaw) * sp; k.play(d > 1.5 ? 'run' : 'walk', 0.2); } else k.play('idle');
        if (d > 20) { k.pos.x = back.x; k.pos.z = back.z; }
        k.pos.y = groundAt(k.pos.x, k.pos.z); k.root.position.copy(k.pos); k.root.rotation.y = k.yaw; k.mixer.update(dt);
      } else this.kitten.update(dt, player);
    }
    for (const q of QUESTS) { const p = q.pet; p.update(dt, player); if (p.hover) p.root.position.y += 0.6 + Math.sin(t * 3) * 0.15; }
    if (this.kite) {
      const j = this.pets.kite.pos, kp = V(j.x + 6 + Math.sin(t * 0.4) * 2, j.y + 11 + Math.sin(t * 0.7) * 1.4, j.z - 4 + Math.cos(t * 0.5) * 2);
      this.kite.position.lerp(kp, 1 - Math.exp(-2 * dt)); this.kite.rotation.set(Math.sin(t) * 0.2, -0.6, Math.sin(t * 1.3) * 0.3);
      this.kite.userData.tail.forEach((b, i) => { b.rotation.y = Math.sin(t * 6 + i) * 0.6; b.position.x = Math.sin(t * 4 + i * 0.6) * 0.06 * i; });
      this.kiteLine.geometry.setFromPoints([j.clone().add(V(0, 0.9, 0)), this.kite.position]);
    }
    if (this.fire) {
      const f = this.fire; f.t += dt; f.light.intensity = Math.min(60, f.t * 40) * (0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 7) * 0.07);
      for (let i = 0; i < 3; i++) fx.flame(f.pos.clone().add(V(0, 0.3, 0)), 1.6);
      if (Math.random() < 0.6) fx.ember(f.pos.clone().add(V(0, 1.2, 0)), 1.5);
      if (Math.random() < 0.2) fx.smoke(f.pos.clone().add(V(0, 3, 0)), 0x5a504a);
    }
    this.updateFishing(dt, input);
  }
  nearestInteract(p) {
    let best = null, bd = 1e9;
    for (const it of this.interact) {
      if (it.on && !it.on()) continue;
      if (it.q && it.q.pet.happy > 0) continue;
      const q = it.pos(); if (!q) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z) - it.r; if (d < 0 && d < bd && Math.abs(q.y - p.y) < 3.5) { bd = d; best = it; }
    }
    return best;
  }
  objective() {
    // the favour to show in the tracker: the one picked in the journal, else any active one
    const pick = id => QUESTS.find(q => q.id === id);
    let q = this.tracked && pick(this.tracked);
    if (!q || this.state[q.id] === 'done' || this.state[q.id] === 'new') q = QUESTS.find(q => this.state[q.id] === 'ready' && q.id !== 'beacon') || QUESTS.find(q => this.state[q.id] === 'active') || QUESTS.find(q => this.state[q.id] === 'ready');
    if (!q) {
      const next = QUESTS.find(q => this.questState(q) === 'new');
      if (next) return { title: 'Meet the islanders', text: `Someone needs help. Look for a gold marker. (${this.doneCount()}/6 favours done)`, target: next.at, q: next };
      if (this.feathers < FEATHER_TOTAL) return { title: 'Golden feathers', text: `${FEATHER_TOTAL - this.feathers} feathers still hidden. Look for beams of light.`, target: null };
      return { title: 'Meadowlark Isle', text: 'Every favour done. Enjoy the island.', target: null };
    }
    const s = this.state[q.id], n = this.count[q.id] || 0;
    if (s === 'ready' && q.id !== 'beacon') return { title: q.title, text: q.done, target: [q.pet.pos.x, q.pet.pos.z], q };
    const tg = typeof q.target === 'function' ? q.target(n) : q.target;
    return { title: q.title, text: q.goal(n), target: tg, q };
  }
  serialize() { return { quests: this.state, count: this.count, feathers: [...this.got] }; }
}
