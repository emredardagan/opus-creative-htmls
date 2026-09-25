// Procedural pieces the kits don't have: primitives for composed buildings, a jet, a carousel,
// stadium stands, runway and pitch textures, helipad, clouds, gulls and tiny pedestrians.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { registerMesh } from './models.js';

const std = (o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 0.85 }, o));
function painted(geo, color, m) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const vc = (o = {}) => std(Object.assign({ vertexColors: true }, o));

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
export const glowTex = canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,220,160,1)'); r.addColorStop(0.35, 'rgba(255,190,120,.45)'); r.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
export const puffTex = canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });

export function registerProps() {
  // floating status icon: no power
  const bolt = canvasTex(128, 128, (g) => {
    g.fillStyle = '#e8554e'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill(); g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#ffd23d'; g.beginPath(); g.moveTo(72, 18); g.lineTo(36, 72); g.lineTo(60, 72); g.lineTo(52, 110); g.lineTo(92, 52); g.lineTo(66, 52); g.closePath(); g.fill(); g.lineWidth = 4; g.strokeStyle = '#7a2a1a'; g.stroke();
  });
  registerMesh('icon-bolt', new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bolt, transparent: true, depthWrite: false, depthTest: false })));
  // unit primitives, tinted per instance
  registerMesh('box', new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), std()));
  registerMesh('cyl', new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0), std()));
  registerMesh('cone', new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 16).translate(0, 0.5, 0), std()));
  registerMesh('ball', new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12).translate(0, 0.5, 0), std()));
  registerMesh('bulb', new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })));
  registerMesh('pond', new THREE.Mesh(new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2), std({ color: 0x57c3d8, roughness: 0.08, metalness: 0.1 })));
  registerMesh('pool', new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x000000 })));

  // helipad: dark disc with a white H
  const pad = canvasTex(128, 128, (g, w) => { g.fillStyle = '#3a4150'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#f4f4f4'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.fillRect(40, 34, 12, 60); g.fillRect(76, 34, 12, 60); g.fillRect(40, 58, 48, 12); });
  registerMesh('helipad', new THREE.Mesh(new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2), std({ map: pad, roughness: 0.7 })));

  // runway: asphalt with edge lines, threshold stripes and a dashed centre line
  const rw = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#4b5261'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f3f3ee'; g.fillRect(0, 8, w, 4); g.fillRect(0, h - 12, w, 4);
    for (let x = 90; x < w - 90; x += 56) g.fillRect(x, h / 2 - 2, 30, 4);
    for (const x0 of [16, w - 56]) for (let y = 22; y < h - 22; y += 12) g.fillRect(x0, y, 40, 6);
    g.font = 'bold 34px sans-serif'; g.save(); g.translate(78, h / 2); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.fillText('09', 0, 12); g.restore();
    g.save(); g.translate(w - 78, h / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('27', 0, 12); g.restore();
  });
  registerMesh('runway', new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0.012, 0), std({ map: rw, roughness: 0.9 })));

  // football pitch with mown stripes
  const pitch = canvasTex(512, 320, (g, w, h) => {
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#4fae4a' : '#5cbd55'; g.fillRect(i * w / 12, 0, w / 12 + 1, h); }
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.strokeRect(16, 16, w - 32, h - 32);
    g.beginPath(); g.moveTo(w / 2, 16); g.lineTo(w / 2, h - 16); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 40, 0, 7); g.stroke();
    g.strokeRect(16, h / 2 - 70, 70, 140); g.strokeRect(w - 86, h / 2 - 70, 70, 140);
  });
  registerMesh('pitch', new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0.015, 0), std({ map: pitch, roughness: 0.95 })));

  // stadium bowl: stepped oval stands with colourful seats and a roof ring
  {
    const parts = [], seats = [0xe8554e, 0xf3f1ea, 0x3d7fd8];
    for (let row = 0; row < 5; row++) {
      const rx = 1.05 + row * 0.1, rz = 0.72 + row * 0.1, y = row * 0.09;
      const shape = new THREE.Shape(); shape.absellipse(0, 0, rx + 0.1, rz + 0.1, 0, Math.PI * 2);
      const hole = new THREE.Path(); hole.absellipse(0, 0, rx, rz, 0, Math.PI * 2, true); shape.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.09 + y, bevelEnabled: false, curveSegments: 48 }).rotateX(-Math.PI / 2);
      parts.push(painted(g, row === 4 ? 0xd9dde6 : seats[row % 3]));
    }
    const roof = new THREE.Shape(); roof.absellipse(0, 0, 1.62, 1.28, 0, Math.PI * 2); const rh = new THREE.Path(); rh.absellipse(0, 0, 1.38, 1.04, 0, Math.PI * 2, true); roof.holes.push(rh);
    parts.push(painted(new THREE.ExtrudeGeometry(roof, { depth: 0.05, bevelEnabled: false, curveSegments: 48 }).rotateX(-Math.PI / 2), 0xf4f6fa, M4(0, 0.62, 0)));
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; parts.push(painted(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6).translate(0, 0.31, 0), 0xc9ced8, M4(Math.cos(a) * 1.55, 0, Math.sin(a) * 1.21))); }
    registerMesh('stands', new THREE.Mesh(mergeGeometries(parts), vc()));
  }

  // carousel: striped canopy on a turning platform
  {
    const parts = [painted(new THREE.CylinderGeometry(0.42, 0.44, 0.06, 24), 0xf2e4c8, M4(0, 0.03, 0)), painted(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), 0xffd35a, M4(0, 0.3, 0))];
    for (let i = 0; i < 12; i++) {
      const a0 = i / 12 * Math.PI * 2;
      const g = new THREE.ConeGeometry(0.48, 0.28, 12, 1, true, a0, Math.PI * 2 / 12);
      parts.push(painted(g, i % 2 ? 0xffffff : 0xe8554e, M4(0, 0.66, 0)));
      parts.push(painted(new THREE.BoxGeometry(0.08, 0.1, 0.14), [0xffd35a, 0x7fd0f0, 0xf29ac0][i % 3], M4(Math.cos(a0) * 0.32, 0.2 + (i % 2) * 0.06, Math.sin(a0) * 0.32, 0, -a0)));
    }
    parts.push(painted(new THREE.SphereGeometry(0.05, 8, 6), 0xffd35a, M4(0, 0.82, 0)));
    registerMesh('carousel', new THREE.Mesh(mergeGeometries(parts), vc()));
  }

  // jet airliner, nose along +z
  {
    const W = 0xf6f7fb, B = 0x2f6fd1, G = 0x9aa3b2;
    const parts = [
      painted(new THREE.CapsuleGeometry(0.12, 1.3, 4, 12), W, M4(0, 0, 0, Math.PI / 2)),
      painted(new THREE.BoxGeometry(1.5, 0.03, 0.34), W, M4(0, -0.03, 0.05)),
      painted(new THREE.BoxGeometry(0.56, 0.02, 0.18), W, M4(0, 0.02, -0.68)),
      painted(new THREE.BoxGeometry(0.03, 0.34, 0.26), B, M4(0, 0.2, -0.72, -0.35)),
      painted(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 10), G, M4(0.38, -0.1, 0.12, Math.PI / 2)),
      painted(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 10), G, M4(-0.38, -0.1, 0.12, Math.PI / 2)),
      painted(new THREE.BoxGeometry(0.245, 0.03, 1.2), B, M4(0, -0.02, 0.02)),
      painted(new THREE.BoxGeometry(0.2, 0.05, 0.12), 0x1d2530, M4(0, 0.07, 0.72)),
    ];
    const g = mergeGeometries(parts); g.translate(0, 0.13, 0);
    registerMesh('jet', new THREE.Mesh(g, vc({ roughness: 0.4, metalness: 0.2 })));
  }

  // puffy cloud cluster (casts moving shadows over the city)
  {
    const parts = [];
    const blobs = [[0, 0, 0, 1], [0.9, -0.1, 0.2, 0.8], [-0.9, -0.15, -0.1, 0.75], [0.3, 0.3, -0.4, 0.7], [-0.4, 0.25, 0.45, 0.65], [1.6, -0.3, -0.2, 0.55], [-1.5, -0.3, 0.3, 0.5]];
    for (const [x, y, z, s] of blobs) parts.push(painted(new THREE.IcosahedronGeometry(s, 2), 0xffffff, M4(x, y, z, 0, 0, 0, 1, 0.7, 1)));
    // clouds are shadow-only: they drift their shadows over the town without hiding it
    registerMesh('cloud', new THREE.Mesh(mergeGeometries(parts), vc({ colorWrite: false, depthWrite: false })));
  }

  // gull: two swept wings
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.08, -0.36, 0.05, -0.02, 0, 0, 0.12, 0.36, 0.05, -0.02, 0, 0, -0.08], 3));
    g.computeVertexNormals();
    registerMesh('gull', new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 })));
  }

  // pedestrian: body + head, tinted per instance
  {
    const g = mergeGeometries([painted(new THREE.CapsuleGeometry(0.035, 0.07, 3, 8), 0xffffff, M4(0, 0.07, 0)), painted(new THREE.SphereGeometry(0.03, 8, 6), 0xffd9b8, M4(0, 0.16, 0))]);
    registerMesh('peep', new THREE.Mesh(g, vc({ roughness: 0.7 })));
  }

  // flag on a pole
  {
    const g = mergeGeometries([painted(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), 0xdadde5, M4(0, 0.3, 0)), painted(new THREE.BoxGeometry(0.004, 0.13, 0.2), 0xffffff, M4(0, 0.52, 0.1))]);
    registerMesh('flag', new THREE.Mesh(g, vc()));
  }

  // floodlight mast for the stadium
  {
    const g = mergeGeometries([painted(new THREE.CylinderGeometry(0.02, 0.03, 1.1, 6), 0xb9bfcc, M4(0, 0.55, 0)), painted(new THREE.BoxGeometry(0.2, 0.12, 0.04), 0x5a6070, M4(0, 1.12, 0))]);
    registerMesh('mast', new THREE.Mesh(g, vc()));
  }
}
