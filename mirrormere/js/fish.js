// Every species in Mirrormere, and the rules for which one takes the bait.
// zone: where the bobber lands (shallows, lily, open, deep, or any)
// time: dawn | day | dusk | night | any (or a list)
// weather: clear | breezy | rain | fog | any (or a list)
// rarity 1..5, size in cm, fight = how hard it pulls (0..1)

export const RARITY = ['', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
export const RARITY_COLOR = ['', '#9aa7b4', '#57b26a', '#3f8fe0', '#a463e8', '#f2a531'];
const BASE_VALUE = [0, 4, 10, 26, 70, 240];

export const SPECIES = [
  // shallows
  { id: 'goldfish', name: 'Pond Goldfish', model: 'goldfish', zone: 'shallows', time: 'any', weather: 'any', rarity: 1, size: [10, 24], fight: .15,
    desc: 'Someone let one go in 1974. There are now thousands.' },
  { id: 'bluegill', name: 'Bluegill Dart', model: 'blue-goldfish', zone: 'shallows', time: 'day', weather: 'any', rarity: 1, size: [12, 26], fight: .2,
    desc: 'Flicks about in the warm water by the stones.' },
  { id: 'tetra', name: 'Ember Tetra', model: 'tetra', zone: 'shallows', time: 'any', weather: 'any', rarity: 1, size: [6, 14], fight: .12,
    desc: 'Small, bright and very sure of itself.' },
  { id: 'sunperch', name: 'Pale Sunfish', model: 'sunfish', zone: 'shallows', time: 'day', weather: ['clear', 'breezy'], rarity: 2, size: [16, 34], fight: .3,
    desc: 'Basks just under the surface when the sun is high.' },
  { id: 'reedclown', name: 'Reed Clown', model: 'clownfish', zone: 'lily', time: 'any', weather: 'any', rarity: 2, size: [9, 18], fight: .2,
    desc: 'Hides among lily stems and pulls faces at frogs.' },
  { id: 'koi', name: 'Lily Koi', model: 'koi', zone: 'lily', time: ['dawn', 'day', 'dusk'], weather: 'any', rarity: 2, size: [30, 70], fight: .35,
    desc: 'The old monks say every koi remembers your face.' },
  { id: 'moonkoi', name: 'Moonpetal Koi', model: 'koi', tint: 0xdfe8ff, glow: 0x6a86ff, zone: 'lily', time: 'night', weather: 'any', rarity: 4, size: [40, 80], fight: .5,
    desc: 'Only rises under the moon. Its scales hold the light for an hour.' },
  { id: 'goldkoi', name: 'Golden Koi', model: 'koi', tint: 0xffd24a, glow: 0xffa000, zone: 'lily', time: 'dawn', weather: 'rain', rarity: 5, size: [60, 110], fight: .7,
    desc: 'Seen at dawn in the rain, then not again for a long time.' },
  // open water
  { id: 'minnow', name: 'Tiger Minnow', model: 'fish-a', zone: 'open', time: 'any', weather: 'any', rarity: 1, size: [8, 16], fight: .12,
    desc: 'The first fish everyone catches. Be kind to it.' },
  { id: 'shiner', name: 'Silver Shiner', model: 'fish-b', zone: 'open', time: 'any', weather: 'any', rarity: 1, size: [10, 20], fight: .18,
    desc: 'Glints like a dropped spoon.' },
  { id: 'roach', name: 'Cobalt Roach', model: 'fish-c', zone: 'open', time: ['day', 'dusk'], weather: 'any', rarity: 1, size: [14, 30], fight: .22,
    desc: 'Travels in polite little shoals.' },
  { id: 'mackerel', name: 'Lake Mackerel', model: 'mackerel', zone: 'open', time: 'any', weather: ['breezy', 'rain'], rarity: 2, size: [25, 45], fight: .4,
    desc: 'Nobody knows how it got here. It seems happy.' },
  { id: 'salmon', name: 'Blush Salmon', model: 'fish-b', tint: 0xff9d8a, scale: 1.25, zone: 'open', time: ['dawn', 'dusk'], weather: 'any', rarity: 2, size: [45, 90], fight: .55,
    desc: 'Runs hard at the edges of the day.' },
  { id: 'snapper', name: 'Ruby Snapper', model: 'red-snapper', zone: 'open', time: 'dusk', weather: 'any', rarity: 3, size: [30, 70], fight: .5,
    desc: 'Turns the colour of the sky it was caught under.' },
  { id: 'tang', name: 'Azure Tang', model: 'tang', zone: 'open', time: 'day', weather: 'clear', rarity: 3, size: [18, 38], fight: .45,
    desc: 'A little piece of a brighter sea.' },
  { id: 'veil', name: 'Veil Butterflyfish', model: 'butterfly-fish', zone: 'open', time: 'any', weather: 'rain', rarity: 3, size: [14, 28], fight: .35,
    desc: 'Comes up to watch the raindrops land.' },
  { id: 'cowfish', name: 'Horned Cowfish', model: 'cowfish', zone: 'open', time: 'day', weather: 'any', rarity: 2, size: [15, 40], fight: .3,
    desc: 'Grumpy. Square. Surprisingly fast.' },
  { id: 'puffer', name: 'Bramble Puffer', model: 'puffer', zone: 'open', time: 'night', weather: 'any', rarity: 3, size: [15, 45], fight: .4,
    desc: 'Inflates when flattered.' },
  { id: 'dancer', name: 'Dancing Gill', model: 'fish-e', zone: 'open', time: 'any', weather: 'rain', rarity: 4, size: [20, 40], fight: .55, anim: 'Dance',
    desc: 'It will not stop dancing. It has never stopped dancing.' },
  // deep water
  { id: 'catfish', name: 'Armored Catfish', model: 'armored-catfish', zone: 'deep', time: 'any', weather: 'any', rarity: 2, size: [35, 80], fight: .5,
    desc: 'Patrols the bottom like a little tank.' },
  { id: 'turbot', name: 'Mud Turbot', model: 'turbot', zone: 'deep', time: 'any', weather: 'any', rarity: 2, size: [30, 70], fight: .45,
    desc: 'Lies flat and waits. It is very good at waiting.' },
  { id: 'flatfish', name: 'Candy Flounder', model: 'flatfish', zone: 'deep', time: ['dusk', 'night'], weather: 'any', rarity: 3, size: [30, 65], fight: .5,
    desc: 'Both eyes on one side, and both of them on you.' },
  { id: 'tuna', name: 'Bluefin Tuna', model: 'tuna', zone: 'deep', time: 'day', weather: 'any', rarity: 3, size: [80, 200], fight: .8,
    desc: 'Pulls like a train. Bring a good line.' },
  { id: 'lionfish', name: 'Lionfish', model: 'lionfish', zone: 'deep', time: 'night', weather: 'any', rarity: 3, size: [20, 40], fight: .5,
    desc: 'Showy fins, sharp temper.' },
  { id: 'inklion', name: 'Ink Lionfish', model: 'black-lionfish', zone: 'deep', time: 'any', weather: 'fog', rarity: 4, size: [25, 45], fight: .6,
    desc: 'Drifts out of the fog like a smudge of ink.' },
  { id: 'swordfish', name: 'Swordfish', model: 'swordfish', zone: 'deep', time: 'day', weather: 'clear', rarity: 4, size: [120, 300], fight: .9,
    desc: 'Leaps clean out of the water on bright days.' },
  { id: 'angler', name: 'Lantern Angler', model: 'anglerfish', zone: 'deep', time: 'night', weather: 'any', rarity: 4, size: [20, 60], fight: .6, glow: 0x7af0ff,
    desc: 'Follow the little light. Do not follow the little light.' },
  { id: 'blobfish', name: 'Mournful Blob', model: 'blobfish', zone: 'deep', time: 'any', weather: 'fog', rarity: 3, size: [20, 35], fight: .25,
    desc: 'Looks sad. Is actually fine.' },
  { id: 'ray', name: 'Mirror Ray', model: 'manta-ray', tilt: 1.1, zone: 'deep', time: 'night', weather: 'clear', rarity: 4, size: [100, 260], fight: .75,
    desc: 'On still nights its back reflects the stars.' },
  { id: 'oldmirror', name: 'The Old Mirror', model: 'shark', tint: 0xc9d6e6, glow: 0x9fd8ff, zone: 'deep', time: 'night', weather: 'fog', rarity: 5, size: [300, 520], fight: 1,
    desc: 'The lake is named after it. Grandmother swore it was real.' },
  // curiosities
  { id: 'bone', name: 'Fish Bone', model: 'fish-bone', zone: 'any', time: 'any', weather: 'any', rarity: 1, size: [10, 30], fight: .05, junk: true,
    desc: 'Someone already had lunch.' },
  { id: 'lure', name: 'Lost Lure', model: 'lure', zone: 'any', time: 'any', weather: 'any', rarity: 2, size: [5, 9], fight: .05, junk: true,
    desc: 'Grandfather\'s lucky lure. So that\'s where it went.' },
];

export const byId = Object.fromEntries(SPECIES.map(s => [s.id, s]));

const has = (v, x) => v === 'any' || (Array.isArray(v) ? v.includes(x) : v === x);

export function matches(s, { zone, phase, weather }) {
  return (s.zone === 'any' || s.zone === zone || (zone === 'lily' && s.zone === 'shallows'))
    && has(s.time, phase) && has(s.weather, weather);
}

// Pick a species for a bite. Bait level raises the odds of rarer fish; luck comes from releasing fish.
export function pickSpecies(cond, baitLvl, luck = 0) {
  const pool = SPECIES.filter(s => matches(s, cond));
  const base = [0, 100, 42, 16, 5.5, 1.6];
  let total = 0;
  const w = pool.map(s => {
    let x = base[s.rarity] * Math.pow(1 + 0.35 * baitLvl + luck * 0.05, s.rarity - 1);
    if (s.junk) x *= 0.12;
    if (s.rarity === 5 && baitLvl < 2) x = 0; // legends ignore plain worms
    total += x;
    return x;
  });
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[0] || byId.minnow;
}

// Length skews small, a few lucky ones run large.
export function rollSize(s) {
  const t = Math.pow(Math.random(), 1.8);
  return Math.round(s.size[0] + (s.size[1] - s.size[0]) * t);
}
export const weightKg = (s, cm) => s.junk ? 0.05 : +(0.000013 * Math.pow(cm, 3) * (s.model === 'manta-ray' || s.model === 'flatfish' || s.model === 'turbot' ? 0.6 : 1)).toFixed(cm < 30 ? 2 : 1);
export function valueOf(s, cm) {
  const k = (cm - s.size[0]) / Math.max(1, s.size[1] - s.size[0]);
  return Math.round(BASE_VALUE[s.rarity] * (0.8 + k * 0.9) * (s.junk ? 0.6 : 1));
}

const PHASE_WORD = { dawn: 'at dawn', day: 'by day', dusk: 'at dusk', night: 'at night' };
const ZONE_WORD = { shallows: 'in the shallows', lily: 'among the lily pads', open: 'in open water', deep: 'in the deep middle', any: 'anywhere' };
const WEATHER_WORD = { clear: 'on clear days', breezy: 'when it\'s breezy', rain: 'in the rain', fog: 'in the fog' };
const list = (v, words) => (Array.isArray(v) ? v : [v]).map(x => words[x]).join(' or ');
export function hint(s) {
  const bits = [ZONE_WORD[s.zone]];
  if (s.time !== 'any') bits.push(list(s.time, PHASE_WORD));
  if (s.weather !== 'any') bits.push(list(s.weather, WEATHER_WORD));
  return bits;
}
