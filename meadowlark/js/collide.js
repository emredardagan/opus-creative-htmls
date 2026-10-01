// Simple, forgiving collision: vertical cylinders and oriented boxes the player slides around,
// plus walkable surfaces (bridge decks, docks, rock tops) that can be higher than the ground.
import { heightAt } from './terrain.js';

export const circles = [];   // { x, z, r, top }
export const boxes = [];     // { x, z, hw, hd, c, s, top }
export const surfaces = [];  // { test(x, z) -> height | -Infinity, x0, x1, z0, z1 }

export const addCircle = (x, z, r, top = 99) => circles.push({ x, z, r, top });
export const addBox = (x, z, hw, hd, yaw, top = 99) => boxes.push({ x, z, hw, hd, c: Math.cos(yaw), s: Math.sin(yaw), top });
export function addSurface(fn, x0, x1, z0, z1) { surfaces.push({ fn, x0, x1, z0, z1 }); }

// highest walkable height under (x, z) for feet currently at y
export function groundAt(x, z, y = 999) {
  let g = heightAt(x, z);
  for (const s of surfaces) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const h = s.fn(x, z); if (h > g && h < y + 0.6) g = h;
  }
  for (const c of circles) {
    if (c.top > 50) continue;
    const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < c.r * c.r && c.top > g && c.top < y + 0.6) g = c.top;
  }
  for (const b of boxes) {
    if (b.top > 50) continue;
    const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) < b.hw && Math.abs(lz) < b.hd && b.top > g && b.top < y + 0.6) g = b.top;
  }
  return g;
}

// push a point of radius r out of everything taller than its feet
export function pushOut(p, r, feet) {
  for (const c of circles) {
    if (feet > c.top - 0.25) continue;
    const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz, R = c.r + r;
    if (d2 < R * R && d2 > 1e-8) { const d = Math.sqrt(d2), k = (R - d) / d; p.x += dx * k; p.z += dz * k; }
  }
  for (const b of boxes) {
    if (feet > b.top - 0.25) continue;
    const dx = p.x - b.x, dz = p.z - b.z;
    let lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    const ex = b.hw + r, ez = b.hd + r;
    if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
      if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez;
      p.x = b.x + lx * b.c + lz * b.s; p.z = b.z - lx * b.s + lz * b.c;
    }
  }
}
