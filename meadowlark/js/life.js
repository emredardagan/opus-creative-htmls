// Everything that makes the island feel alive: butterflies, flocks of birds, fireflies, chimney
// smoke, waterfall mist, jumping fish, farm animals, glowing lanterns, the lighthouse beam,
// a washing line in the breeze and, at the end, a sky full of lanterns.
import * as THREE from 'three';
import { P, HALF } from './layout.js';
import { heightAt, waterAt } from './terrain.js';
import { grassHeight } from './grass.js';
import { Pet } from './npc.js';
import { interiorMat } from './world.js';
import { mulberry32, smoothstep, lerp, damp } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const r = mulberry32(77);

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,230,180,0.55)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Life {
  constructor(ctx) {
    this.ctx = ctx; const scene = this.scene = ctx.scene;
    this.glowTex = glowTexture();
    this.butterflies(); this.birds(); this.lanternGlow(); this.lighthouseBeam(); this.laundry(); this.animals();
    this.fish = { t: 3 };
    this.sky = [];
  }
  // ---------------------------------------------------------------- butterflies
  butterflies() {
    const n = 70, wing = new THREE.PlaneGeometry(0.22, 0.16); wing.translate(0.11, 0, 0);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, emissive: 0x111111 });
    this.bfL = new THREE.InstancedMesh(wing, mat, n); this.bfR = new THREE.InstancedMesh(wing, mat, n);
    const cols = [0xffb43a, 0xffffff, 0x8ac8ff, 0xff8ac0, 0xfff06a];
    this.bf = [];
    for (let i = 0; i < n; i++) {
      // most live in the meadow and the village gardens
      const home = i < 40 ? [P.meadow.c[0] + (r() - 0.5) * 40, P.meadow.c[1] + (r() - 0.5) * 40] : i < 55 ? [P.village.c[0] + (r() - 0.5) * 40, P.village.c[1] + (r() - 0.5) * 40] : [(r() - 0.5) * 160, (r() - 0.5) * 160];
      this.bf.push({ home, p: V(home[0], 0, home[1]), ph: r() * 6, sp: 0.6 + r() * 0.8, a: r() * 6, h: 0.6 + r() * 1.2 });
      const c = new THREE.Color(cols[i % cols.length]); this.bfL.setColorAt(i, c); this.bfR.setColorAt(i, c);
    }
    for (const m of [this.bfL, this.bfR]) { m.frustumCulled = false; this.scene.add(m); }
  }
  // ---------------------------------------------------------------- birds
  birds() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.6, 0.05, -0.05, 0, 0, -0.15, 0, 0, 0.25, 0.6, 0.05, -0.05, 0, 0, -0.15], 3)); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x40382f, side: THREE.DoubleSide, roughness: 0.8 });
    this.flocks = [];
    for (let f = 0; f < 4; f++) {
      const n = 5 + Math.floor(r() * 5), mesh = new THREE.InstancedMesh(g, mat, n); mesh.frustumCulled = false; this.scene.add(mesh);
      this.flocks.push({ mesh, n, c: V((r() - 0.5) * 140, 30 + r() * 20, (r() - 0.5) * 140), rad: 30 + r() * 40, sp: 0.08 + r() * 0.06, ph: r() * 6, offs: Array.from({ length: n }, (_, i) => V((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.6, (r() - 0.5) * 0.6, -Math.ceil(i / 2) * 1.4)) });
    }
  }
  // ---------------------------------------------------------------- lanterns, lighthouse
  lanternGlow() {
    const w = this.ctx.world, mat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.glowMat = mat; this.glows = [];
    for (const p of [...w.lanterns, ...w.doors.map(d => d.clone().add(V(0, 2.1, 0)))]) { const s = new THREE.Sprite(mat); s.position.copy(p); s.scale.setScalar(2.4); this.scene.add(s); this.glows.push(s); }
    // two real lights over the square at night
    this.plazaLights = [0, 1].map(i => { const l = new THREE.PointLight(0xffb060, 0, 22, 1.5); l.position.set(P.village.c[0] + (i ? 5 : -5), heightAt(...P.village.c) + 3.5, P.village.c[1] + (i ? -2 : 3)); this.scene.add(l); return l; });
    this.ctx.eng.noOcc.push(...this.glows);
  }
  lighthouseBeam() {
    const lh = this.ctx.world.lighthouse; if (!lh) return;
    const g = new THREE.ConeGeometry(3.2, 60, 24, 1, true); g.translate(0, -30, 0); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.beam = new THREE.Mesh(g, m); this.beam.position.copy(lh).add(V(0, 14.5, 0)); this.scene.add(this.beam);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xfff0c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); lamp.position.copy(this.beam.position); lamp.scale.setScalar(7); this.scene.add(lamp); this.lamp = lamp;
    this.ctx.eng.noOcc.push(this.beam, lamp);
  }
  laundry() {
    const [a, b] = this.ctx.world.laundry; if (!a) return;
    const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 13 }, (_, i) => { const t = i / 12; return a.clone().lerp(b, t).add(V(0, -Math.sin(t * Math.PI) * 0.35, 0)); })), new THREE.LineBasicMaterial({ color: 0xf2e8d8 }));
    this.scene.add(rope);
    // poles at both ends
    for (const p of [a, b]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, p.y - heightAt(p.x, p.z) + 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x7a5236 })); pole.position.set(p.x, (p.y + heightAt(p.x, p.z)) / 2, p.z); pole.castShadow = true; this.scene.add(pole); }
    this.cloths = [];
    const cols = [0xe8554e, 0xfff4de, 0x4fb6e0, 0xffd84a, 0x8fd18a, 0xfff4de];
    for (let i = 0; i < 6; i++) {
      const t = 0.15 + i * 0.14, p = a.clone().lerp(b, t).add(V(0, -Math.sin(t * Math.PI) * 0.35, 0));
      const geo = new THREE.PlaneGeometry(0.7, 0.9, 4, 4); geo.translate(0, -0.45, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cols[i], side: THREE.DoubleSide, roughness: 0.9 }));
      m.position.copy(p); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2; m.castShadow = true; this.scene.add(m);
      this.cloths.push({ m, base: geo.attributes.position.array.slice(), ph: i * 0.7 });
    }
  }
  animals() {
    this.herd = [];
    const spots = [['cow', P.windmill.c[0] - 12, P.windmill.c[1] + 12, 7], ['cow', P.windmill.c[0] - 6, P.windmill.c[1] + 18, 6], ['pig', P.orchard.c[0] + 12, P.orchard.c[1] + 10, 5], ['chick', P.village.c[0] - 9, P.village.c[1] + 10, 3], ['chick', P.village.c[0] - 8, P.village.c[1] + 11, 3],
      ['chick', P.village.c[0] - 10, P.village.c[1] + 9, 3], ['dog', P.village.c[0] + 4, P.village.c[1] + 6, 9], ['parrot', P.dock.c[0] + 3, P.dock.c[1] - 4, 2], ['beaver', P.pond.c[0] + 9, P.pond.c[1] + 6, 4], ['hog', P.forest.c[0] + 10, P.forest.c[1] + 12, 8], ['deer', P.forest.c[0] - 6, P.forest.c[1] + 18, 9]];
    for (const [k, x, z, w] of spots) this.herd.push(new Pet(this.scene, k, x, z, { wander: w, scale: k === 'chick' ? 0.42 : k === 'parrot' ? 0.5 : 0.62, solid: false, yaw: r() * 6, speed: k === 'chick' ? 0.9 : 1.1 }));
  }
  releaseLanterns(list) {
    const geo = new THREE.CylinderGeometry(0.28, 0.2, 0.55, 8, 1, true); const mat = new THREE.MeshBasicMaterial({ color: 0xffb35a, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    for (const l of list) {
      const m = new THREE.Mesh(geo, mat); m.position.copy(l.p); this.scene.add(m);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(2.4); m.add(s);
      this.sky.push({ m, ...l, age: -l.delay }); this.ctx.eng.noOcc.push(s);
    }
  }
  // ---------------------------------------------------------------- per frame
  update(dt, t) {
    const { fx, eng, player } = this.ctx, night = eng.state.night, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
    // butterflies flutter in loose loops; they rest at night
    const day = 1 - smoothstep(0.4, 0.8, night);
    this.bf.forEach((b, i) => {
      b.a += dt * b.sp * (0.6 + Math.sin(t * 0.7 + b.ph) * 0.4);
      const x = b.home[0] + Math.cos(b.a) * 4 + Math.sin(b.a * 2.3) * 2, z = b.home[1] + Math.sin(b.a * 1.3) * 4;
      const near = Math.hypot(x - player.pos.x, z - player.pos.z) < 3 ? 1.2 : 0;
      b.p.set(x, heightAt(x, z) + (b.h + Math.sin(t * 2 + b.ph) * 0.3 + near) * day - (1 - day) * 2, z);
      const flap = Math.sin(t * 18 + b.ph * 5) * 1.1, yaw = b.a * 1.3 + Math.PI / 2;
      for (const [m, s] of [[this.bfL, 1], [this.bfR, -1]]) { E.set(0, yaw + (s < 0 ? Math.PI : 0), flap * s * (s < 0 ? -1 : 1), 'YXZ'); Q.setFromEuler(E); M.compose(b.p, Q, V(1, 1, 1)); m.setMatrixAt(i, M); }
    });
    this.bfL.instanceMatrix.needsUpdate = this.bfR.instanceMatrix.needsUpdate = true;
    // flocks wheel around wide circles
    for (const f of this.flocks) {
      const a = t * f.sp + f.ph, c = V(f.c.x + Math.cos(a) * f.rad, f.c.y + Math.sin(a * 2) * 3, f.c.z + Math.sin(a) * f.rad);
      const yaw = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI;
      for (let i = 0; i < f.n; i++) {
        const o = f.offs[i].clone().applyAxisAngle(V(0, 1, 0), yaw), flap = Math.sin(t * 9 + i) * 0.5;
        E.set(0, yaw, 0); Q.setFromEuler(E); M.compose(c.clone().add(o), Q, V(1.4, 1 + flap * 0.6, 1.4)); f.mesh.setMatrixAt(i, M);
      }
      f.mesh.instanceMatrix.needsUpdate = true; f.mesh.visible = night < 0.7;
    }
    // smoke from every chimney, mist at the falls
    for (const c of this.ctx.world.chimneys) if (Math.random() < dt * 2.5) fx.smoke(c);
    const fb = this.ctx.water.fallBase;
    if (Math.random() < dt * 14) fx.mist(fb.clone().add(V(0, 0.2, 0.8)), 3.4);
    if (Math.random() < dt * 6) fx.ripple(fb.clone().add(V((Math.random() - 0.5) * 4, 0.05, 0.5 + Math.random() * 2)));
    // fireflies near the meadow, pond and forest at dusk
    if (night > 0.3) for (let i = 0; i < 3; i++) if (Math.random() < dt * 12 * night) {
      const a = Math.random() * 6.28, d = 4 + Math.random() * 18, x = player.pos.x + Math.cos(a) * d, z = player.pos.z + Math.sin(a) * d;
      if (grassHeight(x, z) > 0) fx.glow.emit(x, heightAt(x, z) + 0.4 + Math.random() * 1.6, z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.3) * 0.2, (Math.random() - 0.5) * 0.4, 3 + Math.random() * 3, 0.16, new THREE.Color(0xd8ff7a), 1, 0, 0.2);
    }
    // sunbeam dust around the player by day
    if (night < 0.3 && Math.random() < dt * 6) { const a = Math.random() * 6.28, d = 2 + Math.random() * 8; fx.mote(V(player.pos.x + Math.cos(a) * d, player.pos.y + 0.5 + Math.random() * 3, player.pos.z + Math.sin(a) * d)); }
    // a fish jumps now and then in the pond or off the dock
    this.fish.t -= dt;
    if (this.fish.t <= 0) {
      this.fish.t = 3 + Math.random() * 6;
      const spots = [[P.pond.c[0], P.pond.c[1], P.pond.level, 5], [P.dock.c[0], P.dock.c[1] + 18, 0, 8]];
      const s = spots[Math.floor(Math.random() * 2)], x = s[0] + (Math.random() - 0.5) * s[3], z = s[1] + (Math.random() - 0.5) * s[3];
      if (Math.hypot(x - player.pos.x, z - player.pos.z) < 60) { fx.splash(V(x, s[2] + 0.05, z), 12); fx.ripple(V(x, s[2], z)); }
    }
    // lanterns and the lighthouse come on at dusk
    const glow = smoothstep(0.25, 0.7, night);
    this.glowMat.opacity = glow * 0.9;
    interiorMat.emissiveIntensity = glow * 2.2;
    const ft = this.ctx.world.fountain; if (ft && Math.random() < dt * 10) fx.soft.emit(ft.x + (Math.random() - 0.5) * 0.3, ft.y + 1.2, ft.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 1.2, 2.5 + Math.random(), (Math.random() - 0.5) * 1.2, 0.8, 0.14, new THREE.Color(0xeaf8ff), 0.8, 9, 0.2);
    for (const l of this.plazaLights) l.intensity = glow * 26 * (0.95 + Math.sin(t * 7 + l.position.x) * 0.05);
    if (this.beam) { this.beam.material.opacity = glow * 0.16; this.beam.rotation.y = t * 0.6; this.lamp.material.opacity = glow; }
    // washing flaps in the breeze
    for (const c of this.cloths || []) {
      const p = c.m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = c.base[i * 3 + 1], x = c.base[i * 3], k = -y; p.setZ(i, Math.sin(t * 3 + x * 3 + c.ph + y * 2) * 0.12 * k + k * 0.15); }
      p.needsUpdate = true; c.m.geometry.computeVertexNormals();
    }
    for (const a of this.herd) a.update(dt, player);
    // sky lanterns drift up and away
    for (const s of this.sky) {
      s.age += dt; if (s.age < 0) { s.m.visible = false; continue; } s.m.visible = true;
      s.m.position.y += s.v * dt; s.m.position.x += Math.sin(t * 0.5 + s.ph) * 0.4 * dt + 0.3 * dt; s.m.position.z -= 0.25 * dt;
      s.m.material.opacity = 0.95;
      if (s.age > 70) { this.scene.remove(s.m); s.dead = true; }
    }
    this.sky = this.sky.filter(s => !s.dead);
  }
}
