// The lake surface: a planar mirror distorted by wind waves, rain and ripples,
// tinted by the real depth of the lake bed and lit by the sun or moon.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const MAX_RIPPLES = 14;

const vertexShader = /* glsl */`
  uniform mat4 textureMatrix;
  varying vec4 vUvR;
  varying vec3 vWorld;
  void main() {
    vUvR = textureMatrix * vec4(position, 1.0);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec4 uDepthRect;
  uniform vec3 color;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSkyTint;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uTime;
  uniform float uWind;
  uniform float uRain;
  uniform float uLight;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  varying vec4 vUvR;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  float waves(vec2 p) {
    float t = uTime;
    float h = 0.0;
    h += noise(p * 0.35 + vec2(t * 0.06, t * 0.04)) * 0.55;
    h += noise(p * 0.9 - vec2(t * 0.11, -t * 0.07)) * 0.28;
    h += noise(p * 2.3 + vec2(-t * 0.18, t * 0.16)) * 0.12;
    h += sin(p.x * 0.6 + p.y * 0.25 + t * 0.9) * 0.05;
    return h * (0.35 + uWind);
  }

  float ripples(vec2 p) {
    float h = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 r = uRipples[i];
      if (r.w <= 0.0) continue;
      float age = uTime - r.z;
      if (age < 0.0 || age > 4.0) continue;
      float d = length(p - r.xy);
      float rad = age * (1.1 + r.w * 0.5);
      float band = exp(-pow(d - rad, 2.0) * 5.0);
      h += sin((d - rad) * 9.0) * band * r.w * exp(-age * 1.1) * 0.9;
    }
    // rain: a grid of tiny rings, each cell firing at its own rhythm
    if (uRain > 0.01) {
      vec2 q = p * 1.6;
      vec2 c = floor(q);
      vec2 f = fract(q) - 0.5;
      float ph = fract(uTime * 0.9 + hash(c) * 7.0);
      vec2 o = vec2(hash(c + 3.1), hash(c + 7.7)) - 0.5;
      float d = length(f - o * 0.5);
      float rad = ph * 0.45;
      h += sin((d - rad) * 40.0) * exp(-pow(d - rad, 2.0) * 300.0) * (1.0 - ph) * 0.25 * uRain * step(hash(c + floor(uTime * 0.9 + hash(c) * 7.0)), 0.75);
    }
    return h;
  }

  float heightAt(vec2 p) { return waves(p) + ripples(p); }

  void main() {
    vec2 p = vWorld.xz;
    float e = 0.06;
    float h0 = heightAt(p);
    float hx = heightAt(p + vec2(e, 0.0));
    float hz = heightAt(p + vec2(0.0, e));
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 n = normalize(vec3(-(hx - h0) / e * 0.18, 1.0, -(hz - h0) / e * 0.18));
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(15.0, 110.0, dist) * 0.75));
    vec3 v = toCam / dist;

    // depth of the lake bed under this point
    vec2 duv = (p - uDepthRect.xy) / uDepthRect.zw;
    float depth = texture2D(tDepth, duv).r * 10.0;

    // reflection, pushed around by the surface normal
    vec4 uv = vUvR;
    uv.xy += n.xz * 0.55 * uv.w;
    vec3 refl = texture2DProj(tDiffuse, uv).rgb;

    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    fres = clamp(fres * 1.15 + 0.12, 0.0, 1.0);

    float clarity = exp(-depth * 0.55);
    vec3 body = mix(uDeep, uShallow, clarity) * uLight;
    // a little sky in the body colour keeps it from going flat
    body += uSkyTint * 0.06;

    vec3 col = mix(body, refl * color, fres);

    // sun / moon glints
    vec3 r = reflect(-v, n);
    float s = max(dot(r, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(s, 380.0) * 6.0 + pow(s, 60.0) * 0.16) * (0.6 + uWind) * smoothstep(4.0, 18.0, dist);

    // soft shoreline foam
    float foam = smoothstep(0.32, 0.0, depth) * (0.55 + 0.45 * noise(p * 3.0 + uTime * 0.4));
    col = mix(col, vec3(0.95, 0.97, 1.0) * (0.35 + uLight * 0.65), foam * 0.55);

    float fog = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createWater({ size = 240, depthTex, depthRect, pixelRatio = 1 }) {
  const uniforms = {
    color: { value: new THREE.Color(0xffffff) },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    tDepth: { value: depthTex },
    uDepthRect: { value: new THREE.Vector4(...depthRect) },
    uDeep: { value: new THREE.Color(0x0c3a4c) },
    uShallow: { value: new THREE.Color(0x3fa39a) },
    uSkyTint: { value: new THREE.Color(0x88bbee) },
    uSunColor: { value: new THREE.Color(0xfff2d0) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uFogColor: { value: new THREE.Color(0xcfe6f5) },
    uFogNear: { value: 60 },
    uFogFar: { value: 300 },
    uTime: { value: 0 },
    uWind: { value: 0.25 },
    uRain: { value: 0 },
    uLight: { value: 1 },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
  };
  const geo = new THREE.PlaneGeometry(size, size);
  const w = Math.round(innerWidth * pixelRatio * 0.5), h = Math.round(innerHeight * pixelRatio * 0.5);
  const water = new Reflector(geo, {
    textureWidth: w, textureHeight: h, clipBias: 0.003,
    shader: { name: 'MirrormereWater', uniforms, vertexShader, fragmentShader },
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  water.receiveShadow = false;
  const u = water.material.uniforms;

  let next = 0;
  water.ripple = (x, z, strength = 1) => {
    const r = u.uRipples.value[next];
    r.set(x, z, u.uTime.value, strength);
    next = (next + 1) % MAX_RIPPLES;
  };
  water.resizeTarget = (pr) => {
    const rt = water.getRenderTarget();
    rt.setSize(Math.round(innerWidth * pr * 0.5), Math.round(innerHeight * pr * 0.5));
  };
  // objects that should not show up in the mirror (fish shadows, rain, the rod)
  water.hideInMirror = [];
  const orig = water.onBeforeRender;
  water.onBeforeRender = function (...args) {
    const hidden = water.hideInMirror.filter(o => o.visible);
    for (const o of hidden) o.visible = false;
    orig.apply(this, args);
    for (const o of hidden) o.visible = true;
  };
  return water;
}
