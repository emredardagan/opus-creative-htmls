// Game feel: additive spark particles (Kenney CC0 sprite), tumbling glass
// shards, shockwave rings and row flashes.
import * as THREE from 'three';

const MAX_P = 1800;
const MAX_S = 260;

export function createFx(scene) {
  // ---------- sparks ----------
  const pos = new Float32Array(MAX_P * 3), colr = new Float32Array(MAX_P * 3), size = new Float32Array(MAX_P), alpha = new Float32Array(MAX_P);
  const vel = new Float32Array(MAX_P * 3), life = new Float32Array(MAX_P), maxLife = new Float32Array(MAX_P), baseSize = new Float32Array(MAX_P), drag = new Float32Array(MAX_P);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const tex = new THREE.TextureLoader().load('../assets/kenney/particles/spark_05.png');
  const glowTex = new THREE.TextureLoader().load('../assets/kenney/particles/circle_05.png');
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uTex: { value: glowTex }, uScale: { value: 300 } },
    vertexShader: `
      attribute float size; attribute float alpha; attribute vec3 color;
      varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.);
        gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * t.r * vA * 1.4, t.r * vA); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let pHead = 0;

  const tmpC = new THREE.Color();
  function spark(x, y, z, vx, vy, vz, color, s = 0.4, l = 0.8, d = 2.5) {
    const i = pHead; pHead = (pHead + 1) % MAX_P;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    tmpC.set(color);
    colr[i * 3] = tmpC.r; colr[i * 3 + 1] = tmpC.g; colr[i * 3 + 2] = tmpC.b;
    life[i] = maxLife[i] = l; baseSize[i] = s; drag[i] = d;
  }

  function burst(x, y, z, color, n = 24, speed = 6, s = 0.35) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u);
      const sp = speed * (0.3 + Math.random() * 0.7);
      spark(x, y, z, Math.cos(a) * r * sp, Math.abs(u) * sp * 0.9 + 1, Math.sin(a) * r * sp, color, s * (0.6 + Math.random() * 0.8), 0.5 + Math.random() * 0.6);
    }
  }

  // ---------- shards ----------
  const shardGeo = new THREE.BoxGeometry(0.22, 0.08, 0.16);
  const shardMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, MAX_S);
  shards.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_S * 3), 3);
  shards.frustumCulled = false;
  scene.add(shards);
  const S = [];
  for (let i = 0; i < MAX_S; i++) S.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1 });
  let sHead = 0;
  const dummy = new THREE.Object3D();
  function shatter(x, y, z, color, n = 6, speed = 5) {
    for (let k = 0; k < n; k++) {
      const s = S[sHead]; const i = sHead; sHead = (sHead + 1) % MAX_S;
      s.life = 0.9 + Math.random() * 0.5;
      s.p.set(x + (Math.random() - 0.5) * 1.1, y, z + (Math.random() - 0.5) * 0.6);
      s.v.set((Math.random() - 0.5) * speed * 1.4, 2 + Math.random() * speed, (Math.random() - 0.5) * speed);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      s.s = 0.6 + Math.random() * 0.9;
      shards.setColorAt(i, tmpC.set(color));
    }
    shards.instanceColor.needsUpdate = true;
  }

  // ---------- rings and row flashes ----------
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
  ringGeo.rotateX(-Math.PI / 2);
  function ring(x, y, z, color, maxScale = 6, dur = 0.5) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.set(x, y, z);
    scene.add(m);
    rings.push({ m, t: 0, dur, maxScale });
  }
  const flashGeo = new THREE.PlaneGeometry(1, 1);
  flashGeo.rotateX(-Math.PI / 2);
  function flash(x, y, z, w, d, color, dur = 0.35) {
    const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.set(x, y, z); m.scale.set(w, 1, d);
    scene.add(m);
    rings.push({ m, t: 0, dur, flash: true, w, d });
  }

  function update(dt) {
    for (let i = 0; i < MAX_P; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
      life[i] -= dt;
      const k = Math.exp(-drag[i] * dt);
      vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - 9 * dt; vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.4; }
      const f = Math.max(0, life[i] / maxLife[i]);
      alpha[i] = f; size[i] = baseSize[i] * (0.4 + 0.6 * f);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    for (let i = 0; i < MAX_S; i++) {
      const s = S[i];
      if (s.life <= 0) { dummy.scale.setScalar(0); dummy.updateMatrix(); shards.setMatrixAt(i, dummy.matrix); continue; }
      s.life -= dt;
      s.v.y -= 16 * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.05) { s.p.y = 0.05; s.v.y *= -0.35; s.v.x *= 0.7; s.v.z *= 0.7; s.w.multiplyScalar(0.6); }
      s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
      dummy.position.copy(s.p); dummy.rotation.copy(s.r);
      dummy.scale.setScalar(s.s * Math.min(1, s.life * 2.5));
      dummy.updateMatrix(); shards.setMatrixAt(i, dummy.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      const f = r.t / r.dur;
      if (f >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
      if (r.flash) { r.m.scale.set(r.w * (1 + f * 0.15), 1, r.d * (1 + f * 1.5)); r.m.material.opacity = (1 - f) * 0.4; }
      else { r.m.scale.setScalar(0.3 + f * r.maxScale); r.m.material.opacity = (1 - f) * (1 - f); }
    }
  }

  function setScale(h) { mat.uniforms.uScale.value = h * 0.5; }

  return { spark, burst, shatter, ring, flash, update, setScale };
}
