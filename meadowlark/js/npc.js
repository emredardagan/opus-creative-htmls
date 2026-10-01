// Island animals: animated Kenney cube pets that idle, wander a little, turn to face you,
// hop when they are pleased, and wear a floating marker when they need something.
import * as THREE from 'three';
import { clone, animations, K } from './assets.js';
import { groundAt, addCircle } from './collide.js';
import { clamp, damp } from './util.js';

const CP = n => K(`cube-pets/animal-${n}`);
export const PET_MODELS = ['fox', 'cow', 'bunny', 'penguin', 'bee', 'deer', 'cat', 'pig', 'chick', 'dog', 'parrot', 'beaver', 'hog'].map(CP);

const angTo = (a, b) => ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export class Pet {
  constructor(scene, kind, x, z, { yaw = 0, scale = 0.72, wander = 0, name = '', solid = true, speed = 1.2 } = {}) {
    const path = CP(kind);
    this.kind = kind; this.name = name; this.home = new THREE.Vector2(x, z); this.wander = wander; this.speedMax = speed;
    this.root = new THREE.Group(); scene.add(this.root);
    this.model = clone(path); this.model.scale.setScalar(scale); this.model.position.y = 0.3 * scale; this.root.add(this.model); this.scale = scale;
    this.model.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    this.mixer = new THREE.AnimationMixer(this.model); this.clips = {};
    for (const c of animations(path)) this.clips[c.name] = this.mixer.clipAction(c);
    this.pos = new THREE.Vector3(x, groundAt(x, z), z); this.yaw = yaw; this.goal = null; this.wait = Math.random() * 3; this.cur = null;
    this.mixer.update(Math.random() * 2);
    this.play('idle');
    this.talking = false; this.hop = 0; this.happy = 0;
    if (solid) this.col = addCircle(x, z, 0.55 * scale / 0.72, 99) - 1;
    this.root.position.copy(this.pos); this.root.rotation.y = yaw;
  }
  play(name, fade = 0.25, speed = 1) {
    const a = this.clips[name] || this.clips.idle; if (!a) return;
    a.timeScale = speed; if (this.cur === a) return;
    a.reset().fadeIn(fade).play(); this.cur?.fadeOut(fade); this.cur = a;
  }
  cheer() { this.happy = 1.6; this.play(this.clips.dance ? 'dance' : 'gesture-positive', 0.15); this.hop = 1; }
  update(dt, player, colliders) {
    const toP = new THREE.Vector2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dP = toP.length();
    let moving = false;
    if (this.happy > 0) { this.happy -= dt; if (this.happy <= 0) this.play('idle'); }
    else if (this.talking || dP < 3.2) {
      // face whoever is talking to us
      this.yaw += angTo(this.yaw, Math.atan2(toP.x, toP.y)) * (1 - Math.exp(-6 * dt));
      this.goal = null; this.play('idle');
    } else if (this.wander > 0) {
      if (!this.goal) {
        this.wait -= dt; this.play(this.clips.eat && Math.random() < 0.002 ? 'eat' : this.cur === this.clips.eat ? 'eat' : 'idle');
        if (this.wait <= 0) { const a = Math.random() * 6.28, r = Math.random() * this.wander; this.goal = new THREE.Vector2(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r); }
      } else {
        const d = new THREE.Vector2(this.goal.x - this.pos.x, this.goal.y - this.pos.z), l = d.length();
        if (l < 0.3) { this.goal = null; this.wait = 2 + Math.random() * 5; }
        else {
          this.yaw += angTo(this.yaw, Math.atan2(d.x, d.y)) * (1 - Math.exp(-5 * dt));
          const sp = Math.min(this.speedMax, l) * dt;
          this.pos.x += Math.sin(this.yaw) * sp; this.pos.z += Math.cos(this.yaw) * sp; moving = true;
          this.play('walk', 0.25, 1.1);
        }
      }
    }
    if (this.col >= 0 && colliders) { colliders[this.col].x = this.pos.x; colliders[this.col].z = this.pos.z; }
    this.pos.y = groundAt(this.pos.x, this.pos.z);
    this.hop = Math.max(0, this.hop - dt * 1.4);
    const hy = Math.sin(this.hop * Math.PI * 3) * 0.35 * this.hop;
    this.root.position.set(this.pos.x, this.pos.y + Math.abs(hy), this.pos.z); this.root.rotation.y = this.yaw;
    this.mixer.update(dt);
    return moving;
  }
}
