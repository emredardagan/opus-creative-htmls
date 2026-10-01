// Water: the sea around the island, the river ribbon, the pond, and the waterfall between them.
// One shader reads the baked heightmap, so colour, clarity and shore foam all follow real depth.
import * as THREE from 'three';
import { HALF, RIVER, FALL_INDEX, P } from './layout.js';
import { N, heightTexture } from './terrain.js';
import { lerp, smoothstep } from './util.js';

export const waterU = {
  uTime: { value: 0 }, uHeight: { value: null }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
  uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() }, uFogNear: { value: 70 }, uFogFar: { value: 430 },
  uNight: { value: 0 }, uMap: { value: new THREE.Vector2(N, HALF) },
  uShallow: { value: new THREE.Color(0x6fe0cf) }, uMid: { value: new THREE.Color(0x2ea6c2) }, uDeep: { value: new THREE.Color(0x15507f) },
};

const vert = /* glsl */`
  attribute vec2 aFlow;
  varying vec3 vW; varying vec2 vFlow; varying float vFog;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vFlow = aFlow;
    vec4 mv = viewMatrix * w; vFog = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */`
  uniform float uTime, uNight, uFogNear, uFogFar; uniform sampler2D uHeight; uniform vec2 uMap;
  uniform vec3 uSunDir, uSunCol, uZen, uHor, uFogCol, uShallow, uMid, uDeep;
  varying vec3 vW; varying vec2 vFlow; varying float vFog;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  float waves(vec2 p){ return vn(p) * 0.5 + vn(p * 2.3 + 7.0) * 0.3 + vn(p * 5.1 - 3.0) * 0.2; }
  float field(vec2 p, vec2 flow){
    // two phases of the flow so moving water never stretches
    float t = uTime * 0.35, a = fract(t), b = fract(t + 0.5), w = abs(a - 0.5) * 2.0;
    vec2 drift = vec2(uTime * 0.05, uTime * 0.03);
    float s0 = waves(p - flow * a * 3.0 + drift), s1 = waves(p - flow * b * 3.0 + drift + 0.37);
    return mix(s0, s1, w);
  }
  void main(){
    vec2 uv = (vW.xz + uMap.y + 0.5) / uMap.x;
    float ground = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? -14.0 : texture2D(uHeight, uv).r;
    float depth = max(vW.y - ground, 0.0);
    // normal from the wave field
    vec2 p = vW.xz * 0.45; float e = 0.12;
    float h0 = field(p, vFlow), hx = field(p + vec2(e, 0.0), vFlow), hz = field(p + vec2(0.0, e), vFlow);
    float amp = 0.5 + length(vFlow) * 0.6;
    vec3 n = normalize(vec3((h0 - hx) * amp, e * 1.3, (h0 - hz) * amp));
    vec3 v = normalize(cameraPosition - vW);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.85 + 0.05;
    // colour by depth: clear shallows, turquoise, deep blue
    vec3 col = mix(uShallow, uMid, smoothstep(0.2, 2.6, depth));
    col = mix(col, uDeep, smoothstep(2.5, 11.0, depth));
    float light = max(dot(n, uSunDir), 0.0) * 0.4 + 0.6;
    col *= light * mix(vec3(1.0), uSunCol * 0.6 + 0.4, 0.5) * mix(1.0, 0.25, uNight);
    // caustic shimmer in the shallows
    float ca = pow(abs(sin(vn(vW.xz * 1.3 + uTime * 0.25) * 9.0 + uTime)), 6.0);
    col += uSunCol * ca * 0.12 * smoothstep(2.5, 0.2, depth) * (1.0 - uNight);
    vec3 r = reflect(-v, n);
    vec3 skyc = mix(uHor, uZen, smoothstep(0.0, 0.5, r.y));
    col = mix(col, skyc, fres);
    // sun glitter
    float spec = pow(max(dot(r, uSunDir), 0.0), 220.0) * 6.0 + pow(max(dot(r, uSunDir), 0.0), 18.0) * 0.25;
    col += uSunCol * spec * (1.0 - uNight * 0.8) * step(0.0, uSunDir.y);
    // shore foam: bands that wash in and out with the depth
    float f = vn(vW.xz * 0.9 + uTime * 0.2) * 0.6 + vn(vW.xz * 2.7 - uTime * 0.3) * 0.4;
    float band = smoothstep(0.75, 1.0, sin(depth * 9.0 - uTime * 1.6 + f * 3.0) * 0.5 + 0.5) * smoothstep(0.9, 0.15, depth);
    float edge = smoothstep(0.22, 0.0, depth - f * 0.12);
    float rush = smoothstep(0.55, 0.9, h0) * smoothstep(0.4, 1.4, length(vFlow)) * 0.6;
    float sea = step(vW.y, 0.1);
    float foam = clamp(max(edge * mix(0.55, 1.0, sea), band * mix(0.2, 0.75, sea)) + rush, 0.0, 1.0) * smoothstep(0.35, 0.6, f + 0.25);
    col = mix(col, vec3(1.0, 0.99, 0.96) * mix(1.0, 0.35, uNight), foam * 0.9);
    float alpha = clamp(smoothstep(0.0, 1.6, depth) * 0.75 + 0.22 + fres * 0.4 + foam, 0.0, 1.0);
    alpha *= smoothstep(0.0, 0.05, depth);
    float fogK = smoothstep(uFogNear, uFogFar, vFog);
    col = mix(col, uFogCol, fogK);
    gl_FragColor = vec4(col, mix(alpha, 1.0, fogK));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function waterMaterial() {
  return new THREE.ShaderMaterial({ uniforms: waterU, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
}

// smooth a polyline with Catmull-Rom and resample it every `step` metres
function resample(pts, step) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[2], p[1])), false, 'centripetal');
  const n = Math.max(2, Math.round(curve.getLength() / step));
  return curve.getSpacedPoints(n);
}

function ribbon(points, widthAt) {
  const pos = [], flow = [], idx = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
    const w = widthAt(i / (points.length - 1)), drop = Math.max(0, a.y - b.y) / (Math.hypot(b.x - a.x, b.z - a.z) || 1);
    const sp = 0.35 + Math.min(drop * 6, 1.3);
    for (const s of [-1, 1]) { pos.push(p.x + nx * w * s, p.y, p.z + nz * w * s); flow.push(tx / l * sp, tz / l * sp); }
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  return g;
}

const fallVert = /* glsl */`
  varying vec2 vUv; varying float vFog;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFog = -mv.z; gl_Position = projectionMatrix * mv; }`;
const fallFrag = /* glsl */`
  uniform float uTime, uNight, uFogNear, uFogFar; uniform vec3 uSunCol, uFogCol, uMid;
  varying vec2 vUv; varying float vFog;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  void main(){
    vec2 p = vec2(vUv.x * 9.0, vUv.y * 3.0 + uTime * 2.6);
    float s = vn(p) * 0.55 + vn(p * vec2(2.3, 1.7) + 3.1) * 0.3 + vn(p * 5.0) * 0.15;
    float streak = smoothstep(0.35, 0.75, s);
    vec3 col = mix(uMid * 1.1 + 0.1, vec3(1.0), 0.45 + streak * 0.55);
    col *= mix(uSunCol * 0.45 + 0.65, vec3(0.32, 0.38, 0.5), uNight);
    float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    float a = edge * (0.62 + streak * 0.38) * smoothstep(0.0, 0.04, vUv.y);
    col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, vFog));
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function buildWater(scene) {
  waterU.uHeight.value = heightTexture();
  const mat = waterMaterial();
  const group = new THREE.Group(); group.name = 'water';
  // sea
  const seaG = new THREE.PlaneGeometry(2600, 2600, 1, 1); seaG.rotateX(-Math.PI / 2);
  seaG.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(8), 2));
  const sea = new THREE.Mesh(seaG, mat); sea.renderOrder = 1; group.add(sea);
  // river above the falls, and below it all the way to the sea
  const width = t => lerp(1.6, 4.4, t) * 1.35;
  const up = RIVER.slice(0, FALL_INDEX + 1), down = RIVER.slice(FALL_INDEX + 1);
  const upPts = resample(up, 1.2), downPts = resample(down, 1.2);
  const nUp = FALL_INDEX / (RIVER.length - 1);
  const r1 = new THREE.Mesh(ribbon(upPts, t => width(t * nUp)), mat), r2 = new THREE.Mesh(ribbon(downPts, t => width(nUp + t * (1 - nUp))), mat);
  r1.position.y = r2.position.y = 0.02; r1.renderOrder = r2.renderOrder = 2;
  group.add(r1, r2);
  // pond
  const pondG = new THREE.CircleGeometry(P.pond.r * 1.6, 48); pondG.rotateX(-Math.PI / 2);
  pondG.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(pondG.attributes.position.count * 2), 2));
  const pond = new THREE.Mesh(pondG, mat); pond.position.set(P.pond.c[0], P.pond.level + 0.01, P.pond.c[1]); pond.renderOrder = 2; group.add(pond);
  // waterfall sheet: a bezier that lips over the edge and drops into the pond
  const top = RIVER[FALL_INDEX], bot = RIVER[FALL_INDEX + 1];
  const a = new THREE.Vector3(top[0], top[2] + 0.05, top[1]), d = new THREE.Vector3(bot[0], bot[2] - 0.2, bot[1] - 0.6);
  const curve = new THREE.QuadraticBezierCurve3(a, new THREE.Vector3(lerp(a.x, d.x, 0.35), a.y + 0.3, lerp(a.z, d.z, 0.62)), d);
  const fallW = 3.4, segs = 28, fpos = [], fuv = [], fidx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPoint(t), w = fallW * (1 + t * 0.35);
    for (let j = 0; j <= 4; j++) { const s = j / 4; fpos.push(p.x + (s - 0.5) * 2 * w, p.y, p.z); fuv.push(s, 1 - t); }
    if (i) for (let j = 0; j < 4; j++) { const k = i * 5 + j, q = k - 5; fidx.push(q, q + 1, k, q + 1, k + 1, k); }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2)); fg.setIndex(fidx);
  const fall = new THREE.Mesh(fg, new THREE.ShaderMaterial({ uniforms: waterU, vertexShader: fallVert, fragmentShader: fallFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  fall.renderOrder = 3; group.add(fall);
  scene.add(group);
  return { group, sea, fall, fallBase: d.clone(), fallTop: a.clone() };
}

export function updateWater(eng, t) {
  const d = eng.state.day, f = eng.scene.fog;
  waterU.uTime.value = t; waterU.uSunDir.value.copy(eng.state.sunDir); waterU.uSunCol.value.copy(d.sun);
  waterU.uZen.value.copy(d.zen); waterU.uHor.value.copy(d.hor); waterU.uFogCol.value.copy(f.color);
  waterU.uFogNear.value = f.near; waterU.uFogFar.value = f.far; waterU.uNight.value = d.night;
}
