// Soft particles: sparkles, dust puffs, splashes, smoke, embers and fireworks.
// Two pools (glowing additive and soft normal), each one Points draw call.
import * as THREE from 'three';

const vert = /* glsl */`
  attribute float aSize; attribute vec4 aCol; varying vec4 vCol; uniform float uScale;
  void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const frag = /* glsl */`
  varying vec4 vCol; uniform float uStar;
  void main(){
    vec2 p = gl_PointCoord - 0.5; float d = length(p);
    float a = smoothstep(0.5, 0.0, d);
    // a four-point twinkle on top of the glow
    float star = (smoothstep(0.08, 0.0, abs(p.x)) + smoothstep(0.08, 0.0, abs(p.y))) * smoothstep(0.5, 0.1, d) * uStar;
    a = clamp(a * a + star * 0.6, 0.0, 1.0);
    gl_FragColor = vec4(vCol.rgb, vCol.a * a);
    #include <colorspace_fragment>
  }`;

class Pool {
  constructor(scene, max, additive, star) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.size = new Float32Array(max); this.size0 = new Float32Array(max); this.col = new Float32Array(max * 4); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.grow = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.u = { uScale: { value: 400 }, uStar: { value: star ? 1 : 0 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts);
    this.alpha0 = new Float32Array(max);
  }
  emit(x, y, z, vx, vy, vz, life, size, color, alpha = 1, grav = 0, drag = 0, grow = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.age[i] = 0; this.size0[i] = size; this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
    this.col.set([color.r, color.g, color.b, alpha], i * 4); this.alpha0[i] = alpha;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); i--; continue; }
      const k = this.age[i] / this.life[i], d = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * k);
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, k * 8) * (1 - k * k);
    }
    const g = this.pts.geometry; g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aCol.needsUpdate = true;
  }
  kill(i) {
    const j = --this.n; if (i === j) return;
    for (const [a, s] of [[this.p, 3], [this.v, 3], [this.col, 4]]) for (let q = 0; q < s; q++) a[i * s + q] = a[j * s + q];
    for (const a of [this.life, this.age, this.size, this.size0, this.grav, this.drag, this.grow, this.alpha0]) a[i] = a[j];
  }
}

const C = (h) => new THREE.Color(h);
export class Fx {
  constructor(scene) {
    this.glow = new Pool(scene, 4000, true, true);
    this.soft = new Pool(scene, 3000, false, false);
  }
  setScale(h) { this.glow.u.uScale.value = this.soft.u.uScale.value = h; }
  sparkle(p, n = 24, color = 0xffe08a, spread = 1) {
    const c = C(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, u = Math.random() * 2 - 1, s = (2 + Math.random() * 4) * spread, q = Math.sqrt(1 - u * u);
      this.glow.emit(p.x, p.y, p.z, Math.cos(a) * q * s, u * s + 2, Math.sin(a) * q * s, 0.6 + Math.random() * 0.7, 0.35 + Math.random() * 0.4, c, 1, 4, 2.5);
    }
  }
  dust(p, n = 6, color = 0xd8c4a0) {
    const c = C(color);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 0.6 + Math.random() * 1.2; this.soft.emit(p.x, p.y + 0.1, p.z, Math.cos(a) * s, 0.4 + Math.random() * 0.6, Math.sin(a) * s, 0.6 + Math.random() * 0.5, 0.35 + Math.random() * 0.3, c, 0.55, 0.4, 3, 2.2); }
  }
  splash(p, n = 30) {
    const c = C(0xf2fbff);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 3; this.soft.emit(p.x, p.y, p.z, Math.cos(a) * s, 3 + Math.random() * 4, Math.sin(a) * s, 0.5 + Math.random() * 0.5, 0.18 + Math.random() * 0.2, c, 0.9, 14, 0.5, 0.5); }
  }
  ripple(p) { this.soft.emit(p.x, p.y + 0.05, p.z, 0, 0, 0, 0.8, 0.5, C(0xffffff), 0.35, 0, 0, 4); }
  smoke(p, color = 0xe8e2dc) { this.soft.emit(p.x + (Math.random() - 0.5) * 0.3, p.y, p.z + (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, 0.8 + Math.random() * 0.4, 0.15, 4 + Math.random() * 2, 0.7, C(color), 0.35, -0.05, 0.3, 4); }
  ember(p, s = 1) {
    const c = C(Math.random() < 0.5 ? 0xffb347 : 0xff7a2a);
    this.glow.emit(p.x + (Math.random() - 0.5) * 0.8 * s, p.y, p.z + (Math.random() - 0.5) * 0.8 * s, (Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 2.5 * s, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.8, (0.5 + Math.random() * 0.6) * s, c, 1, -0.5, 0.6, -0.6);
  }
  flame(p, s = 1) {
    const c = C(Math.random() < 0.5 ? 0xffd27a : 0xff8a3a);
    this.glow.emit(p.x + (Math.random() - 0.5) * 0.6 * s, p.y, p.z + (Math.random() - 0.5) * 0.6 * s, 0, 1.4 * s + Math.random(), 0, 0.45 + Math.random() * 0.3, 1.4 * s, c, 0.7, -1, 1, -0.7);
  }
  firework(p, color) {
    const c = C(color), n = 90;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u), s = 9 + Math.random() * 2;
      this.glow.emit(p.x, p.y, p.z, Math.cos(a) * q * s, u * s, Math.sin(a) * q * s, 1.6 + Math.random() * 0.8, 1.1, c, 1, 3.5, 1.4);
    }
  }
  mist(p, r = 2.5) { this.soft.emit(p.x + (Math.random() - 0.5) * r, p.y, p.z + (Math.random() - 0.5) * r * 0.6, (Math.random() - 0.5) * 1.2, 0.6 + Math.random(), 0.5 + Math.random() * 0.8, 1.6 + Math.random(), 1.3, C(0xffffff), 0.32, -0.1, 0.8, 2.5); }
  mote(p, color = 0xfff2c0) { this.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.3) * 0.2, (Math.random() - 0.5) * 0.3, 3 + Math.random() * 3, 0.08 + Math.random() * 0.06, C(color), 0.8, 0, 0); }
  update(dt) { this.glow.update(dt); this.soft.update(dt); }
}
