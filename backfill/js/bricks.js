// Brick looks: one rounded box, a glowing canvas texture per row type.
// The texture is white where the brick should glow; the material's emissive
// colour tints it, and bloom does the rest.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CELL_W, CELL_D } from './scene.js';

export const BRICK_H = 0.42;
export const brickGeo = new RoundedBoxGeometry(CELL_W * 0.9, BRICK_H, CELL_D * 0.8, 2, 0.07);

function canvasTex(draw) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  draw(g, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function frame(g, w, h, { body = 38, border = 255, inner = true } = {}) {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, `rgb(${body + 22},${body + 22},${body + 22})`);
  grd.addColorStop(1, `rgb(${body},${body},${body})`);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.shadowColor = '#fff'; g.shadowBlur = 16;
  g.strokeStyle = `rgb(${border},${border},${border})`; g.lineWidth = 11;
  g.strokeRect(9, 9, w - 18, h - 18);
  g.shadowBlur = 0;
  if (inner) {
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2;
    g.strokeRect(24, 24, w - 48, h - 48);
  }
}

const TEX = {
  base: canvasTex((g, w, h) => {
    frame(g, w, h);
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (const x of [36, w - 44]) g.fillRect(x, h / 2 - 3, 8, 6);
  }),
  player: canvasTex((g, w, h) => {
    frame(g, w, h, { body: 120 });
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillRect(40, h / 2 - 5, w - 80, 10);
  }),
  linked: canvasTex((g, w, h) => {
    frame(g, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.shadowColor = '#fff'; g.shadowBlur = 10;
    // two interlocking rings
    g.beginPath(); g.ellipse(w / 2 - 18, h / 2, 26, 16, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(w / 2 + 18, h / 2, 26, 16, 0, 0, Math.PI * 2); g.stroke();
  }),
  armor: canvasTex((g, w, h) => {
    frame(g, w, h, { body: 70 });
    g.save(); g.beginPath(); g.rect(24, 24, w - 48, h - 48); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 5;
    for (let x = -h; x < w; x += 22) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); }
    g.restore();
    g.fillStyle = '#fff';
    for (const [x, y] of [[30, 30], [w - 30, 30], [30, h - 30], [w - 30, h - 30]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  }),
  cracked: canvasTex((g, w, h) => {
    frame(g, w, h, { body: 50 });
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.shadowColor = '#fff'; g.shadowBlur = 14;
    const crack = pts => { g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke(); };
    crack([[60, 12], [90, 50], [80, 70], [118, 96], [112, 118]]);
    crack([[90, 50], [140, 44], [170, 70], [210, 60]]);
    crack([[170, 70], [180, 112]]);
  }),
  gold: canvasTex((g, w, h) => {
    frame(g, w, h, { body: 80 });
    g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 18;
    g.beginPath(); g.moveTo(w / 2, 26); g.lineTo(w / 2 + 34, h / 2); g.lineTo(w / 2, h - 26); g.lineTo(w / 2 - 34, h / 2); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.moveTo(w / 2, 40); g.lineTo(w / 2 + 18, h / 2); g.lineTo(w / 2, h / 2); g.closePath(); g.fill();
    g.fillStyle = '#fff';
    for (const [x, y, r] of [[50, 40, 4], [200, 86, 5], [214, 38, 3], [62, 92, 3]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  }),
  bomb: canvasTex((g, w, h) => {
    frame(g, w, h, { body: 60 });
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.shadowColor = '#fff'; g.shadowBlur = 12;
    g.beginPath(); g.arc(w / 2, h / 2, 30, 0, 7); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 38, h / 2 + Math.sin(a) * 38); g.lineTo(w / 2 + Math.cos(a) * 50, h / 2 + Math.sin(a) * 50); g.stroke();
    }
  }),
  glitch: canvasTex((g, w, h) => {
    frame(g, w, h);
    for (let y = 26; y < h - 24; y += 6) { g.fillStyle = `rgba(255,255,255,${0.12 + Math.random() * 0.25})`; g.fillRect(24, y, w - 48, 2); }
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 6; i++) g.fillRect(30 + Math.random() * (w - 90), 30 + Math.random() * (h - 66), 14 + Math.random() * 40, 5);
  }),
  junk: canvasTex((g, w, h) => {
    frame(g, w, h, { body: 30, border: 170, inner: false });
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(40, 30); g.lineTo(w - 40, h - 30); g.moveTo(w - 40, 30); g.lineTo(40, h - 30); g.stroke();
  }),
};

function mat(tex, emissive, intensity = 2.2, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: 0x0c0718, metalness: 0.3, roughness: 0.35,
    emissive, emissiveMap: tex, emissiveIntensity: intensity * 0.75, ...opts,
  });
}

export const MATS = {
  base: mat(TEX.base, 0x2ef2ff),
  player: mat(TEX.player, 0xfff0ff, 1.7),
  linked: mat(TEX.linked, 0x7dffb0),
  armor: mat(TEX.armor, 0xa8c8ff, 2.0, { metalness: 0.85, roughness: 0.2, color: 0x1a2440 }),
  cracked: mat(TEX.cracked, 0xa8c8ff, 2.2, { metalness: 0.85, roughness: 0.3, color: 0x141a30 }),
  gold: mat(TEX.gold, 0xffc940, 2.3, { metalness: 0.9, roughness: 0.2, color: 0x3a2808 }),
  bomb: mat(TEX.bomb, 0xff3355, 2.4),
  glitch: mat(TEX.glitch, 0xff4df0, 2.2),
  junk: mat(TEX.junk, 0xff5a6a, 1.4),
};

export const ROW_COLORS = {
  normal: null, linked: 0x7dffb0, armor: 0xa8c8ff, gold: 0xffc940, bomb: 0xff3355, glitch: 0xff4df0, junk: 0xff5a6a,
};

export function materialFor(rowType, kind) {
  if (kind === 'player') return MATS.player;
  if (kind === 'bomb') return MATS.bomb;
  if (rowType === 'armor') return MATS.armor;
  if (rowType === 'cracked') return MATS.cracked;
  if (rowType === 'normal' || rowType === 'bomb') return MATS.base;
  return MATS[rowType] || MATS.base;
}

// ghost brick that shows where the next shot lands
export const ghostMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.35, wireframe: true, toneMapped: false,
});
