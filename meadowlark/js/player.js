// The player: walking, running, jumping, gliding under a parasol, wading and swimming,
// with an animated Kenney character, and the third-person camera that follows it.
import * as THREE from 'three';
import { clone, animations } from './assets.js';
import { groundAt, pushOut, boxes, circles } from './collide.js';
import { heightAt, waterAt, normalAt } from './terrain.js';
import { clamp, damp, lerp, smoothstep } from './util.js';

const G = 22, JUMP = 7.4, WALK = 4.4, RUN = 8.2, SWIM = 2.8;
const angDamp = (a, b, k, dt) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * (1 - Math.exp(-k * dt)); };

function parasol() {
  const g = new THREE.Group();
  const segs = 8, canopy = new THREE.ConeGeometry(0.85, 0.36, segs, 1, true); canopy.translate(0, 0.18, 0);
  // stripe the canopy by colouring alternate segments
  const col = [], pos = canopy.attributes.position, a = new THREE.Color(0xffc93c), b = new THREE.Color(0xfff4de);
  for (let i = 0; i < pos.count; i++) { const ang = Math.atan2(pos.getZ(i), pos.getX(i)); const k = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * segs + 0.001) % 2; const c = k ? a : b; col.push(c.r, c.g, c.b); }
  canopy.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(canopy, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, flatShading: true }));
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x7a5236 })); handle.position.y = -0.3;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe8554e })); knob.position.y = 0.4;
  for (const o of [m, handle, knob]) { o.castShadow = true; g.add(o); }
  return g;
}

export class Player {
  constructor(scene, path) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.model = clone(path); this.model.scale.setScalar(1.45); this.root.add(this.model);
    this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {}; for (const c of animations(path)) this.clips[c.name] = this.mixer.clipAction(c);
    this.cur = null; this.play('idle');
    this.umbrella = parasol(); this.umbrella.position.set(0, 1.95, 0); this.umbrella.scale.setScalar(0.001); this.root.add(this.umbrella);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.speed = 0;
    this.ground = 0; this.onGround = true; this.mode = 'walk'; this.glide = 0; this.glideMax = 1.4; this.gliding = false;
    this.coyote = 0; this.jumpBuf = 0; this.frozen = false; this.stepT = 0; this.airT = 0; this.landed = 0; this.squash = 0;
    this.events = [];             // 'jump', 'land', 'step', 'splash', 'glide'
  }
  play(name, fade = 0.18, speed = 1) {
    const a = this.clips[name]; if (!a) return;
    a.timeScale = speed;
    if (this.cur === a) return;
    a.reset().fadeIn(fade).play(); this.cur?.fadeOut(fade); this.cur = a;
  }
  once(name, then = 'idle') {
    const a = this.clips[name]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.fadeIn(0.12).play(); this.cur?.fadeOut(0.12); this.cur = a;
    this.lock = a.getClip().duration * 0.9; this.after = then;
  }
  place(x, z, yaw = 0) { this.pos.set(x, groundAt(x, z), z); this.yaw = yaw; this.vel.set(0, 0, 0); this.root.position.copy(this.pos); }
  update(dt, input, camYaw) {
    const ev = this.events; ev.length = 0;
    const ax = this.frozen ? { x: 0, y: 0, l: 0 } : input.axis();
    // camera-relative wish direction
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    const wx = ax.x * c + ax.y * s, wz = -ax.x * s + ax.y * c;
    const wl = Math.hypot(wx, wz);
    const water = waterAt(this.pos.x, this.pos.z), floor = heightAt(this.pos.x, this.pos.z);
    const deep = water > -50 && water - floor > 0.95 && this.pos.y < water + 0.2;
    this.mode = deep ? 'swim' : this.onGround ? 'walk' : 'air';
    const run = input.running() && this.mode !== 'swim';
    const target = (this.mode === 'swim' ? SWIM : run ? RUN : WALK) * ax.l;
    // velocity on the ground plane, with quick but soft acceleration
    const k = this.onGround || this.mode === 'swim' ? 12 : 3.2;
    const tvx = wl > 0.01 ? wx / wl * target : 0, tvz = wl > 0.01 ? wz / wl * target : 0;
    this.vel.x = damp(this.vel.x, tvx, k, dt); this.vel.z = damp(this.vel.z, tvz, k, dt);
    if (wl > 0.05 && !this.frozen) this.yaw = angDamp(this.yaw, Math.atan2(wx, wz), this.onGround ? 12 : 5, dt);
    // jumping: a little coyote time and an input buffer make it forgiving
    this.coyote = this.onGround ? 0.12 : this.coyote - dt;
    if (input.hit('Space') && !this.frozen) this.jumpBuf = 0.14; else this.jumpBuf -= dt;
    if (this.jumpBuf > 0 && (this.coyote > 0 || this.mode === 'swim')) {
      this.vel.y = this.mode === 'swim' ? 5.2 : JUMP; this.onGround = false; this.coyote = 0; this.jumpBuf = 0; ev.push('jump');
      this.squash = -0.18;
    }
    // gliding: hold jump while falling and the parasol opens
    const wantGlide = !this.onGround && this.mode !== 'swim' && input.down('Space') && this.vel.y < 0.5 && this.glide > 0 && !this.frozen;
    if (wantGlide && !this.gliding) ev.push('glide');
    this.gliding = wantGlide;
    if (this.gliding) {
      this.glide -= dt;
      this.vel.y = Math.max(this.vel.y - G * 0.25 * dt, -1.7);
      const f = 7.6; const fx = Math.sin(this.yaw) * f, fz = Math.cos(this.yaw) * f;
      this.vel.x = damp(this.vel.x, fx * (0.55 + ax.l * 0.45), 2.2, dt); this.vel.z = damp(this.vel.z, fz * (0.55 + ax.l * 0.45), 2.2, dt);
    } else if (this.mode === 'swim') {
      this.vel.y = damp(this.vel.y, (water - 0.72 - this.pos.y) * 6, 6, dt);
    } else this.vel.y -= G * dt;
    // integrate, then slide around obstacles and refuse steps that are too tall
    const prev = this.pos.clone();
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const tryStep = (x, z) => { const g = groundAt(x, z, this.pos.y); return g - this.pos.y < 0.55 || !this.onGround ? g - this.pos.y < 0.85 : false; };
    if (tryStep(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else if (tryStep(nx, this.pos.z)) { this.pos.x = nx; this.vel.z *= 0.5; }
    else if (tryStep(this.pos.x, nz)) { this.pos.z = nz; this.vel.x *= 0.5; }
    else { this.vel.x *= 0.2; this.vel.z *= 0.2; }
    this.pos.y += this.vel.y * dt;
    pushOut(this.pos, 0.38, this.pos.y);
    // the sea is wide: drift back toward the island
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 128) { const kk = (r - 128) * 0.12; this.pos.x -= this.pos.x / r * kk; this.pos.z -= this.pos.z / r * kk; if (r > 129) this.tooFar = true; } else this.tooFar = false;
    // ground contact
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y);
    const wasAir = !this.onGround;
    if (this.mode !== 'swim' && this.pos.y <= g + 0.02 && this.vel.y <= 0.5) {
      if (wasAir) { ev.push('land'); this.landed = Math.min(1, -this.vel.y / 14); this.squash = 0.12 + this.landed * 0.18; }
      this.pos.y = g; this.vel.y = 0; this.onGround = true;
      this.glide = this.glideMax;
    } else if (this.onGround && this.pos.y - g < 0.35 && this.vel.y <= 0 && this.mode !== 'swim') {
      this.pos.y = g;                        // stick to downhill slopes instead of hopping
    } else if (this.mode !== 'swim') this.onGround = false;
    if (deep) { this.onGround = false; this.glide = this.glideMax; if (wasAir && this.airT > 0.15) ev.push('splash'); }
    this.airT = this.onGround ? 0 : this.airT + dt;
    this.speed = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z) / Math.max(dt, 1e-4);
    // animation
    if (this.lock > 0) { this.lock -= dt; if (this.lock <= 0) this.play(this.after); }
    else if (this.mode === 'swim') this.play('walk', 0.2, 0.7);
    else if (!this.onGround) this.play(this.vel.y > 0 && !this.gliding ? 'jump' : 'fall', 0.15);
    else if (this.speed > 5.6) this.play('sprint', 0.15, clamp(this.speed / 7.5, 0.8, 1.25));
    else if (this.speed > 0.4) this.play('walk', 0.15, clamp(this.speed / 3.6, 0.6, 1.4));
    else this.play('idle', 0.25);
    this.mixer.update(dt);
    // footsteps
    if (this.onGround && this.speed > 0.6) { this.stepT -= dt * this.speed / (this.speed > 5.6 ? 2.3 : 1.6); if (this.stepT <= 0) { this.stepT = 0.5; ev.push('step'); } }
    // squash and stretch, parasol, bob in the water
    this.squash = damp(this.squash, 0, 9, dt);
    const sq = this.squash;
    this.root.position.copy(this.pos); if (this.mode === 'swim') this.root.position.y = water - 0.78 + Math.sin(performance.now() / 400) * 0.05;
    this.root.rotation.y = this.yaw;
    this.model.scale.set(1.45 * (1 + sq * 0.6), 1.45 * (1 - sq), 1.45 * (1 + sq * 0.6));
    const us = this.umbrella.scale.x, ut = this.gliding ? 1 : 0.001;
    this.umbrella.scale.setScalar(damp(us, ut, this.gliding ? 14 : 18, dt));
    this.umbrella.rotation.z = Math.sin(performance.now() / 300) * 0.06; this.umbrella.rotation.x = -0.15 - (this.gliding ? 0.1 : 0);
    // tilt into the glide
    this.model.rotation.x = damp(this.model.rotation.x, this.gliding ? 0.18 : 0, 6, dt);
    return ev;
  }
}

// is a camera point inside a wall or a big trunk?
function blocked(p) {
  for (const b of boxes) {
    const top = b.ctop ?? b.top; if (top < p.y) continue;
    const dx = p.x - b.x, dz = p.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) < b.hw + 0.3 && Math.abs(lz) < b.hd + 0.3) return true;
  }
  for (const c of circles) { if (c.r < 0.3 || c.top < p.y) continue; const dx = p.x - c.x, dz = p.z - c.z; if (dx * dx + dz * dz < (c.r + 0.3) ** 2) return true; }
  return false;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera; this.yaw = Math.PI; this.pitch = 0.3; this.dist = 6.6; this.distTo = 6.6;
    this.target = new THREE.Vector3(); this.look = new THREE.Vector3(); this.shake = 0; this.override = null;
  }
  update(dt, player, input, reduced) {
    this.yaw -= input.look.x * 0.0055; this.pitch = clamp(this.pitch + input.look.y * 0.004, -0.15, 1.2);
    this.distTo = clamp(this.distTo * (1 + input.zoom * 0.0012), 3.5, 16);
    this.dist = damp(this.dist, this.distTo, 8, dt);
    // drift behind the player when walking and not steering the camera
    const idle = performance.now() / 1000 - input.lastLook > 1.8;
    if (idle && player.speed > 1.5 && !reduced) {
      const behind = player.yaw + Math.PI; let d = ((behind - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(d) < 2.4) this.yaw += d * (1 - Math.exp(-0.9 * dt));
    }
    const want = player.root.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    this.target.x = damp(this.target.x, want.x, 12, dt); this.target.z = damp(this.target.z, want.z, 12, dt);
    this.target.y = damp(this.target.y, want.y, player.onGround ? 8 : 4, dt);
    if (this.override) {
      const o = this.override; this.camera.position.lerp(o.pos, 1 - Math.exp(-2.5 * dt)); this.look.lerp(o.look, 1 - Math.exp(-3 * dt)); this.camera.lookAt(this.look); return;
    }
    // pull in when the ground is in the way
    let d = this.dist;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10, cp = this.offset(d * t);
      if (heightAt(cp.x, cp.z) + 0.4 > cp.y || blocked(cp)) { d = Math.max(1.6, d * (t - 0.14)); break; }
    }
    this.curDist = damp(this.curDist ?? d, d, d < (this.curDist ?? d) ? 14 : 3, dt);
    const p = this.offset(this.curDist);
    p.y = Math.max(p.y, heightAt(p.x, p.z) + 0.5, (waterAt(p.x, p.z) > -50 ? waterAt(p.x, p.z) : -99) + 0.4);
    this.camera.position.copy(p);
    this.look.copy(this.target);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2); this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake * 0.3, (Math.random() - 0.5) * this.shake * 0.3, 0)); }
    this.camera.lookAt(this.look);
  }
  offset(d) {
    return new THREE.Vector3(this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d, this.target.y + Math.sin(this.pitch) * d, this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d);
  }
  get forwardYaw() { return this.yaw + Math.PI; }
}
