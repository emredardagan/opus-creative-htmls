// The synthwave world around the board: sky, striped sun, mountains, a
// scrolling neon grid, pylons and gates rushing past, ships in the sky.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const CELL_W = 1.5;   // lane width
export const CELL_D = 1.0;   // row depth
export const DANGER_Z = -1.2;
export const SPAWN_Z = -14.5;
export const TILT = THREE.MathUtils.degToRad(27); // the board is a ramp rising toward the sun

const col = c => new THREE.Color(c);

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const mobile = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  scene.fog = new THREE.Fog(0x6a1a6e, 60, 190);

  const hemi = new THREE.HemisphereLight(0xb08cff, 0x200a30, 0.8);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 10, 6);
  scene.add(hemi, key);

  const uniforms = {
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uSkyTop: { value: col(0x12052e) },
    uSkyHor: { value: col(0x6a1a6e) },
    uSunTop: { value: col(0xffe14d) },
    uSunBot: { value: col(0xff2a8a) },
    uAccent: { value: col(0xff3fb4) },
    uBrick: { value: col(0x2ef2ff) },
    uFever: { value: 0 },
  };

  // ---------- sky dome ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        uniform vec3 uSkyTop, uSkyHor, uAccent; uniform float uFever, uTime; varying vec3 vP;
        void main(){
          float h = clamp(vP.y, -0.2, 1.0);
          vec3 c = mix(uSkyHor, uSkyTop, pow(smoothstep(-0.02, 0.55, h), 0.7));
          c += uAccent * 0.18 * exp(-abs(h - 0.02) * 30.0);
          c = mix(c, c + uAccent * 0.25 * (0.5 + 0.5*sin(uTime*6.0)), uFever);
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  // ---------- stars ----------
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 700; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - Math.random() * 0.9);
    sp.push(Math.sin(ph) * Math.cos(th) * 250, Math.cos(ph) * 250 + 10, Math.sin(ph) * Math.sin(th) * 250);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
  scene.add(stars);

  // ---------- striped sun ----------
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, toneMapped: false,
      uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        uniform vec3 uSunTop, uSunBot; uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p);
          float disc = smoothstep(0.36, 0.35, r);
          float glow = exp(-max(r - 0.33, 0.0) * 9.0) * 0.6;
          vec3 c = mix(uSunBot, uSunTop, smoothstep(-0.3, 0.35, p.y));
          float a = disc;
          if (p.y < 0.08) {
            float band = fract(p.y * 14.0 + uTime * 0.25);
            float cut = smoothstep(0.08, -0.36, p.y) * 0.75;
            a *= step(cut, band);
          }
          gl_FragColor = vec4(c * (0.95 * a + glow * 0.5), max(a, glow * 0.6));
        }`,
    })
  );
  sun.position.set(0, 30, -230);
  scene.add(sun);

  // ---------- mountains: dark fill + neon wireframe ----------
  const mountains = new THREE.Group();
  const mFill = new THREE.MeshBasicMaterial({ color: 0x0a0418 });
  const mWire = new THREE.MeshBasicMaterial({ color: 0xff3fb4, wireframe: true, transparent: true, opacity: 0.28 });
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  function ridge(w, d, segX, segZ, heightFn) {
    const g = new THREE.PlaneGeometry(w, d, segX, segZ);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightFn(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    return g;
  }
  for (const side of [-1, 1]) {
    const g = ridge(110, 280, 22, 56, (x, z) => {
      const lx = x + 55; // 0 at inner edge
      const rise = Math.min(1, lx / 30);
      return rise * rise * (6 + noise(lx * 0.08, z * 0.06) * 26 + noise(lx * 0.25, z * 0.2) * 5) - 0.5;
    });
    if (side < 0) g.scale(-1, 1, 1);
    const m = new THREE.Mesh(g, mFill), w = new THREE.Mesh(g, mWire);
    m.position.set(side * 70, -0.7, -100); w.position.copy(m.position);
    w.position.y += 0.03;
    mountains.add(m, w);
  }
  {
    const g = ridge(420, 40, 84, 8, (x, z) => {
      const back = (z + 20) / 40; // 0 front .. 1 back
      return back * (8 + noise(x * 0.04, 3) * 34) * (0.55 + 0.45 * Math.min(1, Math.abs(x) / 60));
    });
    const m = new THREE.Mesh(g, mFill), w = new THREE.Mesh(g, mWire);
    m.position.set(0, -0.7, -200); w.position.set(0, -0.68, -200);
    mountains.add(m, w);
  }
  scene.add(mountains);

  // ---------- scrolling grid floor ----------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.ShaderMaterial({
      uniforms, fog: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `
        uniform vec3 uAccent, uSkyHor, uSkyTop; uniform float uScroll, uFever, uTime; varying vec3 vW;
        void main(){
          vec2 g = vec2(vW.x / 3.0, (vW.z + uScroll) / 3.0);
          vec2 d = abs(fract(g) - 0.5);
          vec2 fw = fwidth(g);
          float lx = 1.0 - smoothstep(0.0, fw.x * 1.6, 0.5 - d.x);
          float lz = 1.0 - smoothstep(0.0, fw.y * 1.6, 0.5 - d.y);
          float l = max(lx, lz);
          float dist = length(vW.xz - vec2(0.0, -10.0));
          float fade = exp(-dist * 0.016) * 0.8;
          vec3 base = mix(uSkyTop * 0.35, uSkyHor * 0.6, smoothstep(30.0, 220.0, dist));
          vec3 lc = uAccent * (1.0 + uFever * (0.8 + 0.8*sin(uTime*8.0)));
          vec3 c = mix(base, lc, l * fade);
          c = mix(c, uSkyHor, smoothstep(120.0, 290.0, dist));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.7;
  scene.add(floor);

  // ---------- pylons along the road ----------
  const PYLONS = 26, PSPACE = 9;
  const pylonGeo = new THREE.BoxGeometry(0.35, 1, 0.35);
  pylonGeo.translate(0, 0.5, 0);
  const pylons = new THREE.InstancedMesh(pylonGeo, new THREE.MeshStandardMaterial({ color: 0x140a2a, metalness: 0.6, roughness: 0.4 }), PYLONS * 2);
  const capGeo = new THREE.BoxGeometry(0.5, 0.18, 0.5);
  const capMat = new THREE.MeshBasicMaterial({ color: 0xff3fb4, toneMapped: false });
  const caps = new THREE.InstancedMesh(capGeo, capMat, PYLONS * 2);
  const pylonH = [];
  for (let i = 0; i < PYLONS * 2; i++) pylonH.push(1.5 + Math.random() * 4.5);
  scene.add(pylons, caps);

  // ---------- gates over the road far ahead ----------
  const gates = [];
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x2ef2ff, toneMapped: false, transparent: true });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Mesh(new THREE.TorusGeometry(9, 0.09, 6, 48, Math.PI), gateMat.clone());
    g.position.set(0, -0.7, -40 - i * 40);
    scene.add(g);
    gates.push(g);
  }

  // ---------- ships cruising across the sky ----------
  const ships = [];
  const loader = new GLTFLoader();
  const shipMat = new THREE.MeshStandardMaterial({ color: 0x281848, metalness: 0.8, roughness: 0.3, emissive: 0x2ef2ff, emissiveIntensity: 0.15 });
  ['craft_speederB', 'craft_speederC', 'craft_speederD'].forEach((name, i) => {
    loader.loadAsync(`../assets/kenney/space-kit/${name}.glb`).then(gltf => {
      const ship = gltf.scene;
      ship.traverse(o => { if (o.isMesh) o.material = shipMat; });
      ship.scale.setScalar(3);
      const trail = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 14),
        new THREE.MeshBasicMaterial({ color: 0xff3fb4, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
      );
      trail.rotation.x = -Math.PI / 2;
      trail.position.z = 2.6;
      ship.add(trail);
      const holder = new THREE.Group();
      holder.add(ship);
      scene.add(holder);
      ships.push({ holder, ship, trail, t: -i * 7, dir: i % 2 ? -1 : 1, y: 18 + i * 9, z: -90 - i * 30 });
    }).catch(() => {});
  });

  // ---------- track (on a tilted board) ----------
  const board = new THREE.Group();
  board.rotation.x = TILT;
  board.position.y = 0.2;
  scene.add(board);
  const track = new THREE.Group();
  board.add(track);
  const struts = new THREE.Group();
  scene.add(struts);
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x140a2a, metalness: 0.7, roughness: 0.35 });
  const trackMats = {
    slab: new THREE.MeshStandardMaterial({ color: 0x0a0618, metalness: 0.75, roughness: 0.28 }),
    lane: new THREE.MeshBasicMaterial({ color: 0xff3fb4, transparent: true, opacity: 0.35, toneMapped: false }),
    rail: new THREE.MeshBasicMaterial({ color: 0xff3fb4, toneMapped: false }),
    danger: new THREE.MeshBasicMaterial({ color: 0xff2050, toneMapped: false }),
  };
  const fence = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1.6),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: uniforms.uTime, uAlarm: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uTime, uAlarm; varying vec2 vUv;
        void main(){
          float a = pow(1.0 - vUv.y, 2.2) * (0.25 + uAlarm * 0.6);
          a *= 0.75 + 0.25 * sin(vUv.x * 80.0 - uTime * 6.0);
          gl_FragColor = vec4(vec3(1.0, 0.15, 0.3) * a * 1.6, a);
        }`,
    })
  );

  let trackWidth = 0;
  function buildTrack(lanes) {
    for (const c of [...track.children]) { track.remove(c); if (c.geometry && c !== fence) c.geometry.dispose(); }
    const w = lanes * CELL_W;
    trackWidth = w;
    const len = -SPAWN_Z + 6;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.4, len), trackMats.slab);
    slab.position.set(0, -0.2, -len / 2 + 3);
    track.add(slab);
    for (let i = 1; i < lanes; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, len - 1), trackMats.lane);
      l.position.set(-w / 2 + i * CELL_W, 0.01, -len / 2 + 3);
      track.add(l);
    }
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, len), trackMats.rail);
      r.position.set(s * (w / 2 + 0.25), 0.1, -len / 2 + 3);
      track.add(r);
    }
    const d = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.06, 0.08), trackMats.danger);
    d.position.set(0, 0.03, DANGER_Z + CELL_D / 2);
    track.add(d);
    fence.scale.x = w + 0.5;
    fence.position.set(0, 0.8, DANGER_Z + CELL_D / 2);
    track.add(fence);
    // struts holding the ramp up
    for (const c of [...struts.children]) { struts.remove(c); c.geometry.dispose(); }
    for (const lz of [-5, -9.5, -14]) {
      const p = new THREE.Vector3(0, -0.4, lz).applyMatrix4(board.matrix.compose(board.position, board.quaternion, board.scale));
      const h = p.y + 0.7;
      for (const sx of [-1, 1]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, 0.4), strutMat);
        st.position.set(sx * (w / 2 - 0.3), -0.7 + h / 2, p.z);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), trackMats.rail);
        cap.position.y = -h / 2 + 0.04;
        st.add(cap);
        struts.add(st);
      }
    }
  }

  // ---------- post ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.78);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- palette ----------
  const palNow = { brick: col(0x2ef2ff), accent: col(0xff3fb4), skyTop: col(0x12052e), skyHor: col(0x6a1a6e), sunTop: col(0xffe14d), sunBot: col(0xff2a8a) };
  const palTarget = { brick: col(0x2ef2ff), accent: col(0xff3fb4), skyTop: col(0x12052e), skyHor: col(0x6a1a6e), sunTop: col(0xffe14d), sunBot: col(0xff2a8a) };
  function setPalette(p, instant = false) {
    const keys = ['brick', 'accent', 'skyTop', 'skyHor', 'sunTop', 'sunBot'];
    keys.forEach((k, i) => { palTarget[k].set(p[i]); if (instant) palNow[k].set(p[i]); });
  }

  const dummy = new THREE.Object3D();
  function update(dt, t, speed) {
    uniforms.uTime.value = t;
    uniforms.uScroll.value += speed * dt;
    const k = 1 - Math.exp(-dt * 2.2);
    for (const key in palNow) palNow[key].lerp(palTarget[key], k);
    uniforms.uSkyTop.value.copy(palNow.skyTop);
    uniforms.uSkyHor.value.copy(palNow.skyHor);
    uniforms.uSunTop.value.copy(palNow.sunTop);
    uniforms.uSunBot.value.copy(palNow.sunBot);
    uniforms.uAccent.value.copy(palNow.accent);
    uniforms.uBrick.value.copy(palNow.brick);
    scene.fog.color.copy(palNow.skyHor);
    mWire.color.copy(palNow.accent);
    capMat.color.copy(palNow.accent);
    trackMats.lane.color.copy(palNow.accent);
    trackMats.rail.color.copy(palNow.accent);
    hemi.color.copy(palNow.brick).lerp(new THREE.Color(0xffffff), 0.5);

    // pylons scroll with the road
    const span = PYLONS * PSPACE;
    const off = uniforms.uScroll.value % PSPACE;
    for (let i = 0; i < PYLONS * 2; i++) {
      const side = i % 2 ? 1 : -1;
      const row = Math.floor(i / 2);
      let z = 14 - row * PSPACE + off;
      const x = side * (trackWidth / 2 + 3.2 + (row % 3) * 1.6);
      const h = pylonH[i];
      dummy.position.set(x, -0.7, z); dummy.scale.set(1, h, 1); dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix(); pylons.setMatrixAt(i, dummy.matrix);
      dummy.position.y = -0.7 + h + 0.09; dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
    }
    pylons.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;

    for (const g of gates) {
      g.position.z += speed * dt;
      if (g.position.z > -20) g.position.z -= 200;
      g.scale.setScalar(Math.max(1, (trackWidth / 2 + 4) / 9));
      g.material.color.copy(palNow.brick);
      g.material.opacity = Math.min(1, (-20 - g.position.z) / 20) * Math.min(1, (g.position.z + 220) / 40);
    }

    for (const s of ships) {
      s.t += dt;
      const p = ((s.t * 9) % 260) - 130;
      s.holder.position.set(p * s.dir, s.y + Math.sin(s.t * 0.7) * 1.5, s.z);
      s.holder.rotation.y = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      s.ship.rotation.z = Math.sin(s.t * 0.9) * 0.15;
      s.trail.material.color.copy(palNow.accent);
    }
  }

  return {
    renderer, scene, camera, composer, bloom, uniforms, fence, palNow, board,
    buildTrack, setPalette, update, resize,
    get trackWidth() { return trackWidth; },
    render() { composer.render(); },
  };
}
