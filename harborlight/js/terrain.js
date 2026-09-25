// Island ground (vertex-painted grass, sand and seabed), the sea, and the ground overlay
// used for zones, the build grid and data maps (power, land value, pollution...).
import * as THREE from 'three';
import { N, TERR } from './config.js';
import { smoothstep, clamp, lerp } from './util.js';

const M = 56;               // ocean margin around the map, in tiles
const EXT = N + M * 2;      // ground mesh extent
export const WATER_Y = -0.12;

export function heightAt(world, u, v) {
  const f = world.fieldAt(u, v);
  if (f >= 0) return 0.0;
  return -Math.pow(clamp(-f * 2.6, 0, 1), 0.75) * 1.8 - 0.05;
}

export function createTerrain(stage, world) {
  const { scene } = stage;
  // ---------------------------------------------------------------- ground
  const seg = EXT * 2;
  const geo = new THREE.PlaneGeometry(EXT, EXT, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const G1 = new THREE.Color(0x7cb850), G2 = new THREE.Color(0x67a444), G3 = new THREE.Color(0x92c45a), SAND = new THREE.Color(0xf1dcaa), WET = new THREE.Color(0xd9c28e), BED = new THREE.Color(0x7fc8b8), DEEP = new THREE.Color(0x2f6f86), FOREST = new THREE.Color(0x4a8a3c);
  const HN = 256, hdata = new Float32Array(HN * HN);
  for (let i = 0; i < pos.count; i++) {
    const X = pos.getX(i), Z = pos.getZ(i), u = X + N / 2, v = Z + N / 2;
    const f = world.fieldAt(u, v), h = heightAt(world, u, v);
    pos.setY(i, h);
    const n1 = world.noise(u * 0.08 + 13, v * 0.08), n2 = world.noise(u * 0.4, v * 0.4 + 9);
    if (f >= 0.06) {
      c.copy(G1).lerp(G2, smoothstep(0.35, 0.7, n1)).lerp(G3, smoothstep(0.55, 0.9, n2) * 0.5);
      const ti = Math.floor(u), tv = Math.floor(v);
      if (ti >= 0 && tv >= 0 && ti < N && tv < N && world.tree[tv * N + ti]) c.lerp(FOREST, 0.35);
      c.lerp(SAND, smoothstep(0.12, 0.06, f) * 0.6);
    } else if (f >= 0) c.copy(SAND).lerp(WET, smoothstep(0.03, 0, f));
    else c.copy(WET).lerp(BED, smoothstep(0, 0.25, -h)).lerp(DEEP, smoothstep(0.3, 1.6, -h));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const X = (i + 0.5) / HN * EXT - EXT / 2, Z = (j + 0.5) / HN * EXT - EXT / 2;
    hdata[j * HN + i] = heightAt(world, X + N / 2, Z + N / 2);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  // overlay: one texel per tile
  const odata = new Uint8Array(N * N * 4);
  const overlay = new THREE.DataTexture(odata, N, N, THREE.RGBAFormat); overlay.magFilter = THREE.NearestFilter; overlay.needsUpdate = true;
  const U = { uOverlay: { value: overlay }, uGrid: { value: 0 }, uN: { value: N }, uTime: { value: 0 }, uNight: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform sampler2D uOverlay; uniform float uGrid, uN, uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 tc = vW.xz + uN * 0.5;
        if (tc.x > 0.0 && tc.y > 0.0 && tc.x < uN && tc.y < uN) {
          vec4 o = texture2D(uOverlay, tc / uN);
          vec2 f = abs(fract(tc) - 0.5);
          float edge = smoothstep(0.36, 0.5, max(f.x, f.y));
          // zones: soft fill with a crisp inner border
          diffuseColor.rgb = mix(diffuseColor.rgb, o.rgb, o.a * (0.75 + edge * 0.6));
          float line = smoothstep(0.46, 0.5, max(f.x, f.y));
          diffuseColor.rgb *= 1.0 - line * uGrid * 0.22;
        }`);
  };
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------------------------------------------------------------- sea
  const htex = new THREE.DataTexture(hdata, HN, HN, THREE.RedFormat, THREE.FloatType); htex.magFilter = THREE.LinearFilter; htex.minFilter = THREE.LinearFilter; htex.needsUpdate = true;
  const WU = {
    uTime: { value: 0 }, uH: { value: htex }, uExt: { value: EXT }, uNight: { value: 0 },
    uShallow: { value: new THREE.Color(0x6fe0d2) }, uMid: { value: new THREE.Color(0x27a9c8) }, uDeep: { value: new THREE.Color(0x0f4f7e) },
    uSky: { value: new THREE.Color(0xd8ecff) }, uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.2) }, uSunCol: { value: new THREE.Color(0xffffff) },
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, WU]), transparent: true, depthWrite: false, fog: true,
    vertexShader: /* glsl */`
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uExt, uNight; uniform sampler2D uH; uniform vec3 uShallow, uMid, uDeep, uSky, uSunDir, uSunCol;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
      float waves(vec2 p){ return fbm(p * 0.9 + vec2(uTime * 0.12, uTime * 0.05)) * 0.6 + fbm(p * 2.1 - vec2(uTime * 0.09, -uTime * 0.14)) * 0.4; }
      void main(){
        vec2 uv = vW.xz / uExt + 0.5;
        float h = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? -3.0 : texture2D(uH, uv).r;
        float depth = max(0.0, ${WATER_Y.toFixed(2)} - h);
        // ripple normal from the wave height field
        vec2 p = vW.xz; float e = 0.12;
        float w0 = waves(p), wx = waves(p + vec2(e, 0.0)), wz = waves(p + vec2(0.0, e));
        vec3 n = normalize(vec3((w0 - wx) * 2.2, 1.0, (w0 - wz) * 2.2));
        vec3 col = mix(uShallow, uMid, smoothstep(0.02, 0.5, depth));
        col = mix(col, uDeep, smoothstep(0.4, 1.7, depth));
        // caustic shimmer in the shallows
        float ca = pow(abs(sin(fbm(p * 1.6 + uTime * 0.25) * 9.0)), 6.0);
        col += ca * 0.12 * (1.0 - smoothstep(0.0, 0.5, depth));
        // sky reflection + sun glitter
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        col = mix(col, uSky, fres * 0.35 + 0.08);
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(n, H), 0.0), 220.0);
        col += uSunCol * spec * 1.6;
        // foam where water meets the beach
        float shore = 1.0 - smoothstep(0.0, 0.16, depth);
        float band = smoothstep(0.35, 0.8, sin((depth * 36.0) - uTime * 1.6 + fbm(p * 1.3) * 5.0) * 0.5 + 0.5) * smoothstep(0.02, 0.3, depth) * (1.0 - smoothstep(0.2, 0.4, depth));
        float foam = max(shore * 0.9, band * 0.55) * (0.6 + 0.4 * fbm(p * 4.0 + uTime * 0.3));
        col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.85);
        col *= mix(1.0, 0.45, uNight);
        float a = mix(0.62, 0.96, smoothstep(0.0, 0.6, depth));
        a = max(a, foam * 0.9);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  }));
  water.material.uniforms.uH.value = htex;
  water.position.y = WATER_Y; water.renderOrder = 2;
  scene.add(water);

  // ---------------------------------------------------------------- overlay painting
  const overlayApi = {
    set(i, r, g, b, a) { odata[i * 4] = r * 255; odata[i * 4 + 1] = g * 255; odata[i * 4 + 2] = b * 255; odata[i * 4 + 3] = a * 255; },
    commit() { overlay.needsUpdate = true; },
  };
  return {
    ground, water, overlay: overlayApi, uniforms: U, waterU: water.material.uniforms, heightAt: (u, v) => heightAt(world, u, v),
    update(t, st) {
      U.uTime.value = t;
      const wu = water.material.uniforms;
      wu.uTime.value = t; wu.uNight.value = st.night;
      if (st.sky) wu.uSky.value.copy(st.sky);
      if (st.sunDir) wu.uSunDir.value.copy(st.sunDir);
      if (st.sunColor) wu.uSunCol.value.copy(st.sunColor).multiplyScalar(lerp(1, 0.25, st.night));
    },
  };
}
