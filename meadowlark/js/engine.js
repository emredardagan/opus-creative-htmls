// Renderer, camera, painted sky, sun and the post stack (AO, bloom, light shafts, grade).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';
import { smoothstep, lerp, clamp } from './util.js';

// ---------------------------------------------------------------- time of day
// t: 0 midnight, .25 sunrise, .5 noon, .75 sunset
const KEYS = [
  { t: 0.00, zen: 0x0b1430, hor: 0x1d2c5a, sun: 0x8fa4e0, si: 0.25, sky: 0x2b3b78, gnd: 0x0e1424, exp: 0.9, night: 1 },
  { t: 0.20, zen: 0x101a3e, hor: 0x2c3566, sun: 0x8fa4e0, si: 0.25, sky: 0x2b3566, gnd: 0x10142a, exp: 0.9, night: 0.95 },
  { t: 0.255, zen: 0x3e5a9a, hor: 0xffa985, sun: 0xff9a62, si: 1.2, sky: 0x9fb2dc, gnd: 0x5a4a50, exp: 1.0, night: 0.25 },
  { t: 0.31, zen: 0x5d93d6, hor: 0xffd9b0, sun: 0xffd29a, si: 2.6, sky: 0xbcd6f0, gnd: 0x7a7050, exp: 1.0, night: 0 },
  { t: 0.42, zen: 0x4f8fdc, hor: 0xcfe6f5, sun: 0xfff0d8, si: 3.0, sky: 0xc4dcf4, gnd: 0x7f7a58, exp: 0.95, night: 0 },
  { t: 0.58, zen: 0x4f8fdc, hor: 0xd4e6f2, sun: 0xfff0d8, si: 3.0, sky: 0xc4dcf4, gnd: 0x7f7a58, exp: 0.95, night: 0 },
  { t: 0.69, zen: 0x5b84c8, hor: 0xffd2a0, sun: 0xffc27a, si: 2.8, sky: 0xc6c8d8, gnd: 0x80684a, exp: 1.0, night: 0 },
  { t: 0.745, zen: 0x4a4f94, hor: 0xff8a5c, sun: 0xff6a32, si: 1.8, sky: 0xb08aa8, gnd: 0x4a3038, exp: 1.05, night: 0.15 },
  { t: 0.80, zen: 0x1a2050, hor: 0x6a4a80, sun: 0x9a88d0, si: 0.4, sky: 0x4a4a88, gnd: 0x1a1830, exp: 0.95, night: 0.8 },
  { t: 1.00, zen: 0x0b1430, hor: 0x1d2c5a, sun: 0x8fa4e0, si: 0.25, sky: 0x2b3b78, gnd: 0x0e1424, exp: 0.9, night: 1 },
];
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function sampleDay(t) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = smoothstep(0, 1, (t - a.t) / (b.t - a.t));
  const c = p => tmpA.set(a[p]).lerp(tmpB.set(b[p]), k).clone();
  return { zen: c('zen'), hor: c('hor'), sun: c('sun'), sky: c('sky'), gnd: c('gnd'), si: lerp(a.si, b.si, k), exp: lerp(a.exp, b.exp, k), night: lerp(a.night, b.night, k) };
}

// ---------------------------------------------------------------- sky dome
const skyVert = /* glsl */`
  varying vec3 vDir;
  void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const skyFrag = /* glsl */`
  uniform vec3 uZen, uHor, uSunCol, uSunDir, uMoonDir; uniform float uNight, uTime;
  varying vec3 vDir;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    // gradient: warm horizon band, deep zenith, a soft glow that hugs the sun
    vec3 col = mix(uHor, uZen, pow(smoothstep(-0.02, 0.6, h), 0.65));
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 64.0) * 0.6) * (1.0 - uNight * 0.8);
    col = mix(col, uHor * 0.9, smoothstep(0.02, -0.25, h));
    // sun disc
    col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 6.0 * (1.0 - uNight);
    // painted clouds on a plane high above
    if (h > 0.01) {
      vec2 uv = d.xz / (h + 0.12) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
      float n = fbm(uv * 1.3);
      float cov = smoothstep(0.5, 0.78, n) * smoothstep(0.02, 0.22, h);
      float lit = fbm(uv * 1.3 + uSunDir.xz * 0.12);
      vec3 cloudCol = mix(uSunCol * 1.15 + 0.1, uHor * 0.75 + uZen * 0.2, smoothstep(0.45, 0.85, lit) * 0.7);
      cloudCol = mix(cloudCol, uZen * 0.6 + vec3(0.06, 0.06, 0.1), uNight * 0.85);
      cloudCol += uSunCol * pow(sd, 10.0) * 0.8 * (1.0 - uNight);
      col = mix(col, cloudCol, cov * 0.92);
    }
    // stars and a moon at night
    if (uNight > 0.01) {
      vec3 sp = d * 220.0; vec3 ci = floor(sp);
      float s = h21(ci.xy + ci.z * 7.13);
      float star = step(0.9965, s) * smoothstep(0.7, 0.0, length(fract(sp) - 0.5)) * smoothstep(0.0, 0.3, h);
      star *= 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
      col += vec3(star) * uNight * 1.6;
      float md = max(dot(d, uMoonDir), 0.0);
      col += vec3(0.9, 0.95, 1.0) * (smoothstep(0.9990, 0.9994, md) * 2.4 + pow(md, 80.0) * 0.25) * uNight;
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

// ---------------------------------------------------------------- final grade + light shafts
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, tOcc: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uSunCol: { value: new THREE.Color() },
    uRays: { value: 0 }, uNight: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uFade: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tOcc; uniform vec2 uSun; uniform vec3 uSunCol; uniform float uRays, uNight, uTime, uAspect, uFade;
    varying vec2 vUv;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // crepuscular rays: march from the pixel toward the sun through the sky mask
      if (uRays > 0.001) {
        vec2 dt = (uSun - vUv) / 40.0; vec2 p = vUv; float acc = 0.0, w = 1.0;
        float j = h21(vUv * 731.0 + uTime) ;
        p += dt * j;
        for (int i = 0; i < 40; i++) { acc += texture2D(tOcc, p).r * w; w *= 0.965; p += dt; }
        vec2 q = (vUv - uSun) * vec2(uAspect, 1.0);
        float glow = exp(-length(q) * 2.2);
        c += uSunCol * acc / 40.0 * glow * uRays;
      }
      // grade: cool shadows, warm highlights, a touch more saturation
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.12);
      c += vec3(-0.004, 0.0, 0.012) * (1.0 - smoothstep(0.0, 0.25, l));
      c *= mix(vec3(1.0), vec3(1.04, 1.0, 0.95), smoothstep(0.3, 1.2, l));
      vec2 v = vUv - 0.5; c *= 1.0 - dot(v, v) * mix(0.5, 0.85, uNight);
      c += (h21(vUv * 1000.0 + fract(uTime)) - 0.5) * 0.006;
      c = mix(c, vec3(0.0), uFade);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createEngine(canvas, { low = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe6f5, 70, 430);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.2, 1400);

  // sky
  const skyU = {
    uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uTime: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // light
  const hemi = new THREE.HemisphereLight(0xc4dcf4, 0x7f7a58, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  const sm = low ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 320 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // environment light from the sky itself, refreshed as the day turns
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(sky.geometry, sky.material); envScene.add(envSky);
  let envRT = null, envT = -1;
  function refreshEnv() {
    const old = envRT; envRT = pmrem.fromScene(envScene, 0, 1, 1200);
    scene.environment = envRT.texture; old?.dispose();
  }

  // post
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: low ? 0 : 4 }));
  let ao = null;
  if (!low) {
    ao = new N8AOPass(scene, camera, 1, 1);
    Object.assign(ao.configuration, { aoRadius: 1.6, distanceFalloff: 1.0, intensity: 2.2, color: new THREE.Color(0x1c2a20), gammaCorrection: false, halfRes: true });
    composer.addPass(ao);
  } else composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.7, 0.88);
  composer.addPass(bloom);
  const final = new ShaderPass(FinalShader); composer.addPass(final);
  composer.addPass(new OutputPass());

  // occlusion mask for the light shafts: everything solid in black on a white sky, at low res
  const occRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType });
  const occMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  final.uniforms.tOcc.value = occRT.texture;
  const noOcc = [];          // objects hidden from the mask (sky, grass, particles)

  const state = { time: 0.3, day: null, sunDir: new THREE.Vector3(), night: 0, focus: new THREE.Vector3(), fade: 0 };

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.setSize(w, h); ao?.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    const pr = renderer.getPixelRatio(); occRT.setSize(Math.round(w * pr / 4), Math.round(h * pr / 4));
    final.uniforms.uAspect.value = w / h;
  }
  addEventListener('resize', resize); resize();

  const _v = new THREE.Vector3();
  function update(dt, t) {
    const d = state.day = sampleDay(state.time);
    // the sun swings across the southern sky; at night the moon takes over
    const a = (state.time - 0.25) * Math.PI * 2;
    state.sunDir.set(Math.cos(a) * 0.82, Math.sin(a), 0.42 + Math.cos(a) * 0.1).normalize();
    const lightDir = state.sunDir.y > 0.02 ? state.sunDir : _v.set(-state.sunDir.x, -state.sunDir.y, state.sunDir.z * 0.6).normalize();
    state.night = d.night;
    skyU.uZen.value.copy(d.zen); skyU.uHor.value.copy(d.hor); skyU.uSunCol.value.copy(d.sun);
    skyU.uSunDir.value.copy(state.sunDir); skyU.uMoonDir.value.set(-state.sunDir.x, -state.sunDir.y, state.sunDir.z).normalize();
    skyU.uNight.value = d.night; skyU.uTime.value = t;
    sky.position.copy(camera.position);
    scene.fog.color.copy(d.hor).lerp(d.zen, 0.25);
    hemi.color.copy(d.sky); hemi.groundColor.copy(d.gnd); hemi.intensity = lerp(0.9, 0.55, d.night);
    sun.color.copy(state.sunDir.y > 0.02 ? d.sun : tmpA.set(0x8fa4e0)); sun.intensity = state.sunDir.y > 0.02 ? d.si * smoothstep(0.0, 0.08, state.sunDir.y) : 0.35 * d.night;
    renderer.toneMappingExposure = d.exp;
    scene.environmentIntensity = lerp(0.85, 0.3, d.night);
    // shadow box follows the focus, snapped to texels so edges do not crawl
    const f = state.focus, snap = 96 / sm;
    const fx = Math.round(f.x / snap) * snap, fz = Math.round(f.z / snap) * snap;
    sun.target.position.set(fx, f.y, fz);
    sun.position.set(fx + lightDir.x * 150, f.y + lightDir.y * 150, fz + lightDir.z * 150);
    if (Math.abs(state.time - envT) > 0.004 || envT < 0) { envT = state.time; refreshEnv(); }
    // light shafts are strongest when the low sun is in view
    _v.copy(camera.position).addScaledVector(state.sunDir, 500).project(camera);
    const inView = _v.z < 1 && Math.abs(_v.x) < 1.6 && Math.abs(_v.y) < 1.6;
    final.uniforms.uSun.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
    final.uniforms.uSunCol.value.copy(d.sun);
    const low = 1 - smoothstep(0.15, 0.6, state.sunDir.y);
    const facing = Math.max(0, camera.getWorldDirection(new THREE.Vector3()).dot(state.sunDir));
    final.uniforms.uRays.value = inView && state.sunDir.y > -0.02 ? (0.35 + low * 0.9) * smoothstep(0.2, 0.8, facing) * (1 - d.night) : 0;
    final.uniforms.uNight.value = d.night; final.uniforms.uTime.value = t; final.uniforms.uFade.value = state.fade;
    bloom.strength = lerp(0.3, 0.75, d.night);
  }

  function render() {
    if (final.uniforms.uRays.value > 0) {
      const hidden = noOcc.filter(o => o.visible); for (const o of hidden) o.visible = false;
      const bg = scene.background, fog = scene.fog; scene.overrideMaterial = occMat; scene.background = null; scene.fog = null;
      renderer.setRenderTarget(occRT); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1);
      scene.overrideMaterial = null; scene.background = bg; scene.fog = fog;
      for (const o of hidden) o.visible = true;
    }
    composer.render();
  }

  noOcc.push(sky);
  return { renderer, scene, camera, sky, sun, hemi, composer, bloom, ao, final, state, noOcc, update, render, resize };
}
