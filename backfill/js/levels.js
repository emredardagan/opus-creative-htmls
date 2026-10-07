// Sector design. Each sector teaches one new row type, then the last one mixes
// everything. After sector 8 the game keeps looping through remixed sectors,
// faster each lap, so a run never ends on its own.

// palette: brick neon, accent (grid, rails), sky top, sky horizon, sun top, sun bottom
export const SECTORS = [
  { name: 'BOOT SEQUENCE', lanes: 4, speed: 0.26, target: 8, gaps: [1, 1], mix: {},
    tip: 'Fill the gaps. Clear the rows.',
    pal: [0x2ef2ff, 0xff3fb4, 0x12052e, 0x6a1a6e, 0xffe14d, 0xff2a8a] },
  { name: 'CHAIN LINK', lanes: 4, speed: 0.29, target: 10, gaps: [1, 2], mix: { linked: 0.4 },
    tip: 'Linked rows only clear together.',
    pal: [0x3d9bff, 0x2ef2ff, 0x03152b, 0x0d5a6e, 0xc8ff5a, 0x1ad1ff] },
  { name: 'WIDE OPEN', lanes: 5, speed: 0.31, target: 12, gaps: [1, 2], mix: { linked: 0.2, gold: 0.12 },
    tip: 'Five lanes. Gold rows drop power-ups.',
    pal: [0xff6a3d, 0xffc940, 0x1a0726, 0x7a2440, 0xfff07a, 0xff4d2e] },
  { name: 'HEAVY METAL', lanes: 5, speed: 0.33, target: 12, gaps: [1, 2], mix: { armor: 0.32, linked: 0.12 },
    tip: 'Armored rows have to break twice.',
    pal: [0xb46bff, 0x8fb8ff, 0x0a0a2a, 0x353a8a, 0xe0e8ff, 0x7b5cff] },
  { name: 'GOLD RUSH', lanes: 5, speed: 0.37, target: 14, gaps: [1, 2], mix: { gold: 0.3, linked: 0.15, armor: 0.1 },
    tip: 'Gold everywhere. Spend your power-ups.',
    pal: [0xff4fd8, 0xffc940, 0x1c0718, 0x8a2a3a, 0xfff3a8, 0xff8a1a] },
  { name: 'DEMOLITION', lanes: 6, speed: 0.36, target: 14, gaps: [1, 3], mix: { bomb: 0.22, gold: 0.1, linked: 0.1 },
    tip: 'Bomb rows take their neighbours with them.',
    pal: [0xffa13d, 0xff3355, 0x1a0410, 0x6e1022, 0xffd34d, 0xff1a4a] },
  { name: 'GLITCH CITY', lanes: 6, speed: 0.39, target: 16, gaps: [1, 3], mix: { glitch: 0.26, bomb: 0.1, armor: 0.1 },
    tip: 'Glitched rows slide sideways. Time your shots.',
    pal: [0x6b7bff, 0x2ef2ff, 0x080320, 0x3a1a7a, 0x9ffcff, 0xd14dff] },
  { name: 'OVERDRIVE', lanes: 6, speed: 0.44, target: 18, gaps: [1, 3],
    mix: { linked: 0.14, armor: 0.12, gold: 0.1, bomb: 0.1, glitch: 0.12 },
    tip: 'Everything at once. Hold the line.',
    pal: [0xff3fb4, 0x2ef2ff, 0x12052e, 0x6a1a6e, 0xffe14d, 0xff2a8a] },
];

export function sectorInfo(index, rng) {
  if (index < SECTORS.length) return { ...SECTORS[index], index };
  // endless: remix sectors 3..8 with rising speed
  const lap = Math.floor((index - SECTORS.length) / 6) + 1;
  const base = SECTORS[2 + ((index - SECTORS.length) % 6)];
  const lanes = [4, 5, 6, 6][Math.floor(rng() * 4)];
  return {
    ...base, index, lanes,
    name: `${base.name} ×${lap + 1}`,
    speed: SECTORS[7].speed * (1 + 0.1 * lap) + 0.01 * (index % 6),
    target: 18 + lap * 2,
    gaps: [1, Math.min(lanes - 1, 3)],
    mix: { linked: 0.14, armor: 0.13, gold: 0.1, bomb: 0.11, glitch: 0.13 },
    tip: 'Endless overdrive. How far can you go?',
  };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Returns an array of row specs (normally 1, 2 for a linked pair), ordered
// bottom first. A spec is { type, filled: bool[], bomb?: lane, linked?: true }.
export function makeRows(sector, rng, prevGaps) {
  const L = sector.lanes;
  const pick = () => {
    let r = rng(), acc = 0;
    for (const [k, p] of Object.entries(sector.mix)) { acc += p; if (r < acc) return k; }
    return 'normal';
  };
  const gapsRow = (min, max, avoid) => {
    const filled = new Array(L).fill(true);
    const count = Math.min(L - 1, min + Math.floor(rng() * (max - min + 1)));
    const lanes = [...Array(L).keys()];
    // early sectors avoid stacking a gap right above the previous one
    if (avoid && sector.index < 2) lanes.sort((a, b) => (avoid[a] ? 1 : 0) - (avoid[b] ? 1 : 0) || rng() - 0.5);
    else lanes.sort(() => rng() - 0.5);
    for (let i = 0; i < count; i++) filled[lanes[i]] = false;
    return filled;
  };
  const [gmin, gmax] = sector.gaps;
  const type = pick();
  if (type === 'linked') {
    const lower = { type: 'linked', filled: gapsRow(1, Math.min(2, gmax), prevGaps) };
    // classic: a solid row waiting on its partner, or two gapped rows
    const upper = { type: 'linked', filled: rng() < 0.55 ? new Array(L).fill(true) : gapsRow(1, 1) };
    return [lower, upper];
  }
  const spec = { type, filled: gapsRow(gmin, gmax, prevGaps) };
  if (type === 'bomb') {
    const solid = spec.filled.map((f, i) => f ? i : -1).filter(i => i >= 0);
    spec.bomb = solid[Math.floor(rng() * solid.length)];
  }
  if (type === 'armor') spec.filled = gapsRow(1, Math.min(2, gmax), prevGaps);
  return [spec];
}

export const POWERS = {
  phase: { name: 'PHASE', icon: 'ph-ghost', color: 0x9ffcff, desc: 'Shots pass through bricks to the lowest gap', shots: 6 },
  spread: { name: 'SPREAD', icon: 'ph-arrows-split', color: 0xff3fb4, desc: 'Every shot splits into three lanes', shots: 5 },
  slow: { name: 'SLOW-MO', icon: 'ph-hourglass-medium', color: 0x8fb8ff, desc: 'Time crawls for 8 seconds', time: 8 },
  pulse: { name: 'PULSE', icon: 'ph-lightning', color: 0xffc940, desc: 'Blasts the three nearest rows' },
  shield: { name: 'SHIELD', icon: 'ph-shield-plus', color: 0x5dff9e, desc: 'Adds a barrier charge' },
};
