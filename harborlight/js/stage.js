// Renderer, isometric camera, lights, day/night and the post-processing stack
// (ambient occlusion, bloom, tilt-shift miniature blur, colour grade).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { N8AOPass } from 'n8ao';
import { ASSETS } from './config.js';
import { clamp, lerp, smoothstep, damp } from './util.js';

const TiltShift = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uAmt: { value: 1 }, uFocus: { value: 0.5 }, uNight: { value: 0 }, uSat: { value: 1.08 }, uGrade: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uAmt, uFocus, uNight, uSat; uniform vec3 uGrade; varying vec2 vUv;
    void main(){
      float band = smoothstep(0.16, 0.55, abs(vUv.y - uFocus)) * uAmt;
      vec3 c = vec3(0.0); float tw = 0.0;
      // golden-angle disc; radius grows away from the focus band
      for (int i = 0; i < 20; i++) {
        float fi = float(i); float r = sqrt(fi / 20.0) * band * 7.0; float a = fi * 2.39996;
        vec2 o = vec2(cos(a), sin(a)) * r / uRes;
        float w = 1.0 - fi / 26.0; c += texture2D(tDiffuse, vUv + o).rgb * w; tw += w;
      }
      c /= tw;
      // grade: gentle saturation, warm highlights, cool shadows, soft vignette
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c *= uGrade;
      vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * mix(0.55, 0.9, uNight);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// key moments of the day: sun elevation, sun colour, sky fill, fog, exposure
const KEYS = [
  { t: 0.00, sun: 0x7a90d0, si: 0.3, sky: 0x3a4c92, gnd: 0x0c1226, hi: 0.55, fog: 0x101a3a, exp: 0.95, night: 1 },
  { t: 0.22, sun: 0x8a8fc8, si: 0.35, sky: 0x2a3566, gnd: 0x10142a, hi: 0.45, fog: 0x1d2446, exp: 0.92, night: 0.95 },
  { t: 0.27, sun: 0xff9a6a, si: 1.3, sky: 0xffc0a8, gnd: 0x5a4a60, hi: 0.8, fog: 0xf2b8a0, exp: 1.0, night: 0.25 },
  { t: 0.34, sun: 0xffe2b8, si: 2.4, sky: 0xcfe6ff, gnd: 0x8a8a6a, hi: 0.9, fog: 0xcfe3f0, exp: 1.02, night: 0 },
  { t: 0.5,  sun: 0xfff4e4, si: 2.5, sky: 0xd8ecff, gnd: 0x8a8c70, hi: 0.8, fog: 0xd6ebf5, exp: 0.98, night: 0 },
  { t: 0.66, sun: 0xffd49a, si: 2.5, sky: 0xd4e0f4, gnd: 0x8e8a6a, hi: 0.8, fog: 0xe6dcd0, exp: 1.0, night: 0 },
  { t: 0.73, sun: 0xff5a1a, si: 2.8, sky: 0xff8a68, gnd: 0x3a2040, hi: 0.32, fog: 0xf08a62, exp: 1.04, night: 0.2 },
  { t: 0.79, sun: 0x9a78c8, si: 0.55, sky: 0x4a3a78, gnd: 0x1e1a34, hi: 0.62, fog: 0x3a3060, exp: 0.97, night: 0.85 },
  { t: 1.00, sun: 0x7a90d0, si: 0.3, sky: 0x3a4c92, gnd: 0x0c1226, hi: 0.55, fog: 0x101a3a, exp: 0.95, night: 1 },
];
const cA = new THREE.Color(), cB = new THREE.Color();
function sampleKeys(t) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = smoothstep(0, 1, (t - a.t) / (b.t - a.t));
  const mix = (p) => cA.set(a[p]).lerp(cB.set(b[p]), k).clone();
  return { sun: mix('sun'), sky: mix('sky'), gnd: mix('gnd'), fog: mix('fog'), si: lerp(a.si, b.si, k), hi: lerp(a.hi, b.hi, k), exp: lerp(a.exp, b.exp, k), night: lerp(a.night, b.night, k) };
}

export function createStage(canvas, { quality = 'high' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'low' ? 1 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd6ebf5);
  scene.fog = new THREE.Fog(0xd6ebf5, 160, 330);

  // isometric-ish orthographic camera orbiting a target
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 800);
  const view = { target: new THREE.Vector3(6, 0, 2), yaw: Math.PI / 4, yawTo: Math.PI / 4, pitch: 0.62, zoom: 17, zoomTo: 17, dist: 120 };

  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x94967a, 0.9);
  const sun = new THREE.DirectionalLight(0xfff4e4, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  const moon = new THREE.DirectionalLight(0x8aa4ff, 0);
  scene.add(hemi, sun, sun.target, moon, moon.target);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envReady = new HDRLoader().loadAsync(`${ASSETS}hdri/kloofendal_puresky_1k.hdr`).then(t => { scene.environment = pmrem.fromEquirectangular(t).texture; scene.environmentIntensity = 0.45; t.dispose(); }).catch(() => {});

  // post stack
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality === 'low' ? 0 : 4 }));
  let ao = null;
  if (quality !== 'low') {
    ao = new N8AOPass(scene, camera, 1, 1);
    Object.assign(ao.configuration, { aoRadius: 0.9, distanceFalloff: 0.8, intensity: 2.4, color: new THREE.Color(0x283048), gammaCorrection: false, screenSpaceRadius: false });
    ao.setQualityMode('Medium');
    composer.addPass(ao);
  } else composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 0.92);
  composer.addPass(bloom);
  const tilt = new ShaderPass(TiltShift);
  composer.addPass(tilt);
  composer.addPass(new OutputPass());

  const state = { time: 0.69, auto: true, cycle: 480, night: 0, tilt: true };

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w / 2, h / 2);
    tilt.uniforms.uRes.value.set(w, h);
  }
  addEventListener('resize', resize); resize();

  const dir = new THREE.Vector3();
  function updateCamera(dt) {
    view.zoom = damp(view.zoom, view.zoomTo, 10, dt);
    let dy = view.yawTo - view.yaw; view.yaw += dy * (1 - Math.exp(-9 * dt));
    const aspect = innerWidth / innerHeight, h = view.zoom;
    camera.left = -h * aspect; camera.right = h * aspect; camera.top = h; camera.bottom = -h;
    camera.updateProjectionMatrix();
    dir.set(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch));
    camera.position.copy(view.target).addScaledVector(dir, view.dist);
    camera.lookAt(view.target);
    scene.fog.near = view.dist + h * 1.1; scene.fog.far = view.dist + h * 4.5 + 60;
    // keep the shadow map tight around what is on screen
    const s = h * Math.max(1, aspect) * 1.45 + 4;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 420 });
    sun.shadow.camera.updateProjectionMatrix();
  }

  function updateSky(dt) {
    if (state.auto) state.time = (state.time + dt / state.cycle) % 1;
    const t = state.time, K = sampleKeys(t);
    const a = (t - 0.25) * Math.PI * 2;  // sunrise at 0.25, sunset at 0.75
    const el = Math.max(0.12, Math.sin(a)) * 1.05, az = Math.cos(a);
    const off = new THREE.Vector3(az * 110, 40 + el * 150, -60 + az * 30);
    sun.position.copy(view.target).add(off); sun.target.position.copy(view.target);
    sun.color.copy(K.sun); sun.intensity = K.si;
    moon.position.copy(view.target).add(new THREE.Vector3(-60, 140, 80)); moon.target.position.copy(view.target);
    moon.intensity = K.night * 0.5;
    hemi.color.copy(K.sky); hemi.groundColor.copy(K.gnd); hemi.intensity = K.hi;
    scene.fog.color.copy(K.fog); scene.background.copy(K.fog);
    renderer.toneMappingExposure = K.exp;
    scene.environmentIntensity = lerp(0.45, 0.05, K.night);
    state.night = K.night; state.sky = K.sky; state.sunDir = off.clone().normalize(); state.sunColor = K.sun; state.fog = K.fog;
    bloom.strength = lerp(0.22, 0.95, K.night); bloom.threshold = lerp(0.95, 0.55, K.night); bloom.radius = lerp(0.4, 0.75, K.night);
    tilt.uniforms.uNight.value = K.night;
    // colour grade: neutral by day, amber at golden hour, blue at night
    const gold = Math.max(0, 1 - Math.abs(t - 0.725) / 0.06) + Math.max(0, 1 - Math.abs(t - 0.27) / 0.05) * 0.7;
    tilt.uniforms.uGrade.value.set(1.02, 1.0, 0.97).lerp(new THREE.Vector3(1.14, 0.96, 0.8), Math.min(1, gold)).lerp(new THREE.Vector3(0.88, 0.95, 1.12), K.night);
    tilt.uniforms.uAmt.value = state.tilt ? clamp(1.25 - view.zoom / 40, 0.3, 1) : 0;
  }

  return {
    renderer, scene, camera, view, sun, hemi, composer, bloom, tilt, ao, state, envReady, resize,
    update(dt) { updateCamera(dt); updateSky(dt); },
    render() { composer.render(); },
  };
}
