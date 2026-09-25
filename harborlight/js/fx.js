// GPU particles for smoke, flames, dust and spray. Two pools: soft (normal blend) and glow (additive).
import * as THREE from 'three';
import { puffTex } from './props.js';

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.age = new Float32Array(max).fill(1); this.life = new Float32Array(max).fill(1); this.s0 = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max); this.rise = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.u = { uTex: { value: puffTex }, uScale: { value: 30 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute float size; attribute vec4 pcol; varying vec4 vC; uniform float uScale; void main(){ vC = pcol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uScale; }',
      fragmentShader: 'uniform sampler2D uTex; varying vec4 vC; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.01) discard; }',
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(p, v, { life = 2, size = 0.4, grow = 2, color = 0xffffff, alpha = 0.7, rise = 0 } = {}) {
    const i = this.i = (this.i + 1) % this.max, c = new THREE.Color(color);
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([c.r, c.g, c.b, alpha], i * 4);
    this.age[i] = 0; this.life[i] = life; this.s0[i] = size; this.grow[i] = grow; this.a0[i] = alpha; this.rise[i] = rise;
  }
  update(dt, wind) {
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      this.age[i] += dt; const k = Math.min(1, this.age[i] / this.life[i]);
      this.vel[i * 3 + 1] += this.rise[i] * dt;
      this.pos[i * 3] += (this.vel[i * 3] + wind.x * k) * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + wind.z * k) * dt;
      this.size[i] = this.s0[i] * (1 + (this.grow[i] - 1) * k);
      this.col[i * 4 + 3] = this.a0[i] * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = a.pcol.needsUpdate = a.size.needsUpdate = true;
  }
}

export class Fx {
  constructor(scene) {
    this.soft = new Particles(scene, 1400, false);
    this.glow = new Particles(scene, 500, true);
    this.wind = new THREE.Vector3(0.35, 0, -0.15);
    this.night = 0;
  }
  smoke(p, s = 1, color) {
    const c = color ?? (this.night > 0.5 ? 0x6a6e80 : 0xe9e6e2);
    this.soft.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.35 + Math.random() * 0.2, (Math.random() - 0.5) * 0.1), { life: 3 + Math.random() * 1.5, size: 0.24 * s, grow: 3.2, color: c, alpha: 0.38 });
  }
  flame(p, s = 1) {
    this.glow.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.15), { life: 0.5 + Math.random() * 0.4, size: 0.4 * s, grow: 0.3, color: Math.random() < 0.5 ? 0xff7a2a : 0xffc24a, alpha: 0.95 });
  }
  dust(c, r = 1) {
    for (let k = 0; k < 14 * r; k++) { const a = Math.random() * 6.28, d = Math.random() * 0.5 * r; this.soft.emit(new THREE.Vector3(c.x + Math.cos(a) * d, 0.1, c.z + Math.sin(a) * d), new THREE.Vector3(Math.cos(a) * 0.8, 0.3 + Math.random() * 0.3, Math.sin(a) * 0.8), { life: 1.1 + Math.random() * 0.6, size: 0.35 * r, grow: 2.6, color: 0xefe2c8, alpha: 0.7 }); }
  }
  spray(p) {
    const a = Math.random() * 6.28;
    this.soft.emit(p, new THREE.Vector3(Math.cos(a) * 0.25, 0.9 + Math.random() * 0.3, Math.sin(a) * 0.25), { life: 0.7, size: 0.07, grow: 1, color: 0xd8f4ff, alpha: 0.9, rise: -2.6 });
  }
  wake(p, dir) {
    this.soft.emit(p, new THREE.Vector3(-dir.x * 0.2 + (Math.random() - 0.5) * 0.1, 0.02, -dir.z * 0.2 + (Math.random() - 0.5) * 0.1), { life: 2.2, size: 0.18, grow: 3, color: 0xffffff, alpha: 0.55 });
  }
  contrail(p) { this.soft.emit(p, new THREE.Vector3(0, 0, 0), { life: 4, size: 0.18, grow: 3.5, color: 0xffffff, alpha: 0.5 }); }
  update(dt, pxPerUnit, night) {
    this.night = night;
    this.soft.u.uScale.value = this.glow.u.uScale.value = pxPerUnit;
    this.soft.update(dt, this.wind); this.glow.update(dt, this.wind);
  }
}
