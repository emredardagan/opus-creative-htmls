// Game data: map size, tools, buildings, growth models, unlocks.
export const N = 64;                 // map is N x N tiles
export const DAY_SECONDS = 0.5;      // real seconds per game day at speed 1
export const START_MONEY = 30000;
export const ASSETS = new URL('../../assets/', import.meta.url).href;
export const K = p => `${ASSETS}kenney/${p}.glb`;
export const PP = p => `${ASSETS}polypizza/${p}.glb`;

export const TERR = { WATER: 0, SAND: 1, GRASS: 2 };
export const KIND = { EMPTY: 0, ROAD: 1, RAIL: 2, BUILDING: 3, RUBBLE: 4 };
export const ZONE = { NONE: 0, R: 1, C: 2, I: 3 };
export const ZONE_KEY = ['', 'R', 'C', 'I'];
export const ZONE_COLOR = { 1: [0.2, 0.85, 0.35], 2: [0.25, 0.55, 1.0], 3: [1.0, 0.72, 0.1] };

// ---------------------------------------------------------------- growable buildings
const com = c => K(`city-kit-commercial/building-${c}`), sky = c => K(`city-kit-commercial/building-skyscraper-${c}`);
const ind = c => K(`city-kit-industrial/building-${c}`), sub = c => K(`city-kit-suburban/building-type-${c}`);
export const GROW = {
  R: [
    'abcdefghijklmnopqrstu'.split('').map(sub),
    ['a', 'b', 'd', 'f', 'g', 'h'].map(com),
    ['i', 'j', 'l', 'm', 'n'].map(com).concat([sky('a')]),
  ],
  C: [
    ['c', 'e', 'k', 'd', 'a'].map(com),
    ['f', 'g', 'l', 'm', 'n', 'j'].map(com),
    ['a', 'b', 'c', 'd', 'e'].map(sky),
  ],
  I: [
    ['h', 'i', 'j', 'k', 's', 'p'].map(ind),
    ['a', 'b', 'd', 'e', 'g', 'o', 'q', 't'].map(ind),
    ['c', 'f', 'l', 'm', 'n', 'r'].map(ind),
  ],
};
// soft facade tints so a street reads as many different buildings
export const TINTS = {
  R: [0xffffff, 0xffd9c8, 0xffe8b0, 0xd8e4ff, 0xf2d8ff, 0xdcf5d2, 0xffe0e6],
  C: [0xffffff, 0xffe6d0, 0xe0ecff, 0xfff2c8, 0xf0e2ff, 0xffdcd6, 0xdff5ea],
  I: [0xffffff, 0xf4efe6, 0xeef3f6, 0xf6f1ea],
};
export const CAP = { R: [5, 22, 70], C: [6, 22, 60], I: [8, 24, 48] };       // residents or jobs per level
export const POWER_USE = { R: [1, 3, 8], C: [2, 5, 12], I: [4, 8, 14] };

// ---------------------------------------------------------------- tools
// cat: category · size: footprint · cost · upkeep per month · unlock: population needed
// fx: what the building does (radius in tiles)
export const CATS = [
  { id: 'build', name: 'Build', icon: 'road' },
  { id: 'zones', name: 'Zones', icon: 'zone' },
  { id: 'power', name: 'Utilities', icon: 'bolt' },
  { id: 'service', name: 'Services', icon: 'shield' },
  { id: 'parks', name: 'Parks', icon: 'tree' },
  { id: 'landmark', name: 'Landmarks', icon: 'star' },
];
export const TOOLS = {
  select:     { cat: 'build', name: 'Inspect', cost: 0, icon: 'cursor', desc: 'Look at a building or tile.' },
  road:       { cat: 'build', name: 'Road', cost: 20, drag: 'line', icon: 'road', desc: 'Connects everything. Zones grow next to roads. Can cross water as a bridge.' },
  rail:       { cat: 'build', name: 'Railway', cost: 40, drag: 'line', icon: 'rail', unlock: 250, desc: 'Tracks for trains. Put a station on the line.' },
  bulldoze:   { cat: 'build', name: 'Bulldoze', cost: 5, drag: 'rect', icon: 'bulldoze', desc: 'Clear buildings, roads, zones and trees.' },
  tree:       { cat: 'build', name: 'Plant trees', cost: 8, drag: 'rect', icon: 'tree', desc: 'Trees clean the air and lift land value.' },
  zoneR:      { cat: 'zones', name: 'Residential', cost: 10, drag: 'rect', zone: 1, icon: 'zoneR', desc: 'Homes. Grow into apartments with parks, schools and water.' },
  zoneC:      { cat: 'zones', name: 'Commercial', cost: 10, drag: 'rect', zone: 2, icon: 'zoneC', desc: 'Shops and offices. Grow into towers in busy, valuable areas.' },
  zoneI:      { cat: 'zones', name: 'Industrial', cost: 10, drag: 'rect', zone: 3, icon: 'zoneI', desc: 'Factories and jobs. Noisy and polluting, keep them apart from homes.' },
  dezone:     { cat: 'zones', name: 'De-zone', cost: 0, drag: 'rect', zone: 0, icon: 'dezone', desc: 'Remove zoning from empty tiles.' },
  coal:       { cat: 'power', name: 'Coal Plant', cost: 3500, upkeep: 90, size: [2, 2], model: 'coal', icon: 'coal', fx: { power: 900, pollution: 1, polR: 9 }, desc: 'Lots of cheap power. Lots of smoke.' },
  wind:       { cat: 'power', name: 'Wind Turbine', cost: 450, upkeep: 8, size: [1, 1], model: 'wind', icon: 'wind', fx: { power: 60 }, desc: 'Clean power, a little at a time.' },
  solar:      { cat: 'power', name: 'Solar Farm', cost: 1800, upkeep: 20, size: [2, 2], model: 'solar', icon: 'solar', unlock: 400, fx: { power: 260 }, desc: 'Clean power from the sun.' },
  watertower: { cat: 'power', name: 'Water Tower', cost: 600, upkeep: 12, size: [1, 1], model: 'watertower', icon: 'watertower', fx: { water: 9 }, desc: 'Running water nearby. Needed for apartments and offices.' },
  pump:       { cat: 'power', name: 'Water Pump', cost: 1100, upkeep: 18, size: [1, 1], model: 'pump', icon: 'pump', place: 'coast', fx: { water: 15 }, desc: 'Pumps sea water over a wide area. Must touch the water.' },
  police:     { cat: 'service', name: 'Police', cost: 700, upkeep: 30, size: [1, 1], model: 'police', icon: 'police', fx: { police: 11 }, desc: 'Keeps crime down nearby.' },
  fire:       { cat: 'service', name: 'Fire Station', cost: 700, upkeep: 30, size: [1, 1], model: 'fire', icon: 'fire', fx: { fire: 11 }, desc: 'Puts out fires quickly nearby.' },
  hospital:   { cat: 'service', name: 'Hospital', cost: 1600, upkeep: 60, size: [2, 2], model: 'hospital', icon: 'hospital', unlock: 150, fx: { health: 14 }, desc: 'Healthy residents are happy residents.' },
  school:     { cat: 'service', name: 'School', cost: 900, upkeep: 40, size: [2, 2], model: 'school', icon: 'school', fx: { edu: 11 }, desc: 'Education lets neighbourhoods grow taller.' },
  university: { cat: 'service', name: 'University', cost: 4000, upkeep: 120, size: [3, 3], model: 'university', icon: 'university', unlock: 1500, fx: { edu: 20, land: .15, landR: 7 }, desc: 'Big boost to education and land value.' },
  station:    { cat: 'service', name: 'Rail Station', cost: 1400, upkeep: 30, size: [2, 1], model: 'station', icon: 'station', unlock: 250, place: 'rail', fx: { land: .1, landR: 5 }, desc: 'Place next to a railway. Trains stop here.' },
  park:       { cat: 'parks', name: 'Pocket Park', cost: 150, upkeep: 2, size: [1, 1], model: 'park', icon: 'park', fx: { land: .12, landR: 4, happy: 1 }, desc: 'Trees, a bench and flowers.' },
  plaza:      { cat: 'parks', name: 'Fountain Plaza', cost: 600, upkeep: 6, size: [2, 2], model: 'plaza', icon: 'plaza', fx: { land: .2, landR: 6, happy: 2 }, desc: 'A paved square with a fountain.' },
  bigpark:    { cat: 'parks', name: 'Central Park', cost: 1400, upkeep: 12, size: [3, 3], model: 'bigpark', icon: 'bigpark', unlock: 300, fx: { land: .3, landR: 9, happy: 4 }, desc: 'A pond, lawns and big old trees.' },
  playground: { cat: 'parks', name: 'Playground', cost: 300, upkeep: 3, size: [1, 1], model: 'playground', icon: 'playground', fx: { land: .1, landR: 4, happy: 1 }, desc: 'Swings and a slide.' },
  campsite:   { cat: 'parks', name: 'Beach Camp', cost: 350, upkeep: 3, size: [2, 2], model: 'campsite', icon: 'campsite', place: 'coast', fx: { land: .1, landR: 5, happy: 2 }, desc: 'Tents by the sea.' },
  cityhall:   { cat: 'landmark', name: 'City Hall', cost: 6000, upkeep: 50, size: [2, 2], model: 'cityhall', icon: 'cityhall', unlock: 600, max: 1, fx: { land: .2, landR: 8, happy: 3, demand: .1 }, desc: 'The mayor finally has an office. Boosts all demand.' },
  church:     { cat: 'landmark', name: 'Chapel', cost: 1200, upkeep: 10, size: [1, 1], model: 'church', icon: 'church', unlock: 200, fx: { land: .12, landR: 5, happy: 2 }, desc: 'Bells on Sunday.' },
  lighthouse: { cat: 'landmark', name: 'Lighthouse', cost: 1500, upkeep: 8, size: [1, 1], model: 'lighthouse', icon: 'lighthouse', place: 'coast', max: 2, fx: { land: .15, landR: 6, happy: 2 }, desc: 'Sweeps the bay with light at night.' },
  marina:     { cat: 'landmark', name: 'Marina', cost: 2400, upkeep: 20, size: [2, 2], model: 'marina', icon: 'marina', place: 'coast', unlock: 350, fx: { land: .2, landR: 7, happy: 3 }, desc: 'Boats come and go all day.' },
  stadium:    { cat: 'landmark', name: 'Stadium', cost: 9000, upkeep: 80, size: [3, 3], model: 'stadium', icon: 'stadium', unlock: 2500, max: 1, fx: { land: .1, landR: 8, happy: 5, demand: .15 }, desc: 'Floodlights and a roaring crowd.' },
  funfair:    { cat: 'landmark', name: 'Funfair', cost: 7000, upkeep: 60, size: [3, 3], model: 'funfair', icon: 'funfair', unlock: 2000, max: 1, fx: { land: .2, landR: 9, happy: 6 }, desc: 'A Ferris wheel and striped tents.' },
  observatory:{ cat: 'landmark', name: 'Observatory', cost: 3000, upkeep: 25, size: [1, 1], model: 'observatory', icon: 'observatory', unlock: 1000, max: 1, fx: { edu: 8, land: .1, landR: 5 }, desc: 'Watching the stars over the bay.' },
  statue:     { cat: 'landmark', name: 'Statue', cost: 500, upkeep: 2, size: [1, 1], model: 'statue', icon: 'statue', fx: { land: .1, landR: 4, happy: 1 }, desc: 'A bronze horse. Nobody remembers why.' },
  airport:    { cat: 'landmark', name: 'Airport', cost: 18000, upkeep: 150, size: [7, 3], model: 'airport', icon: 'airport', unlock: 4000, max: 1, fx: { demand: .2 }, desc: 'Planes to everywhere. Big boost to business.' },
};
export const TOOL_ORDER = Object.keys(TOOLS);

export const MILESTONES = [
  [0, 'Empty Shore'], [60, 'Hamlet'], [250, 'Village'], [1000, 'Town'], [3000, 'City'], [8000, 'Big City'], [20000, 'Metropolis'],
];

export const NAMES = {
  R: ['The Willows', 'Maple Court', 'Seaview Row', 'Gull Cottage', 'Harbour Flats', 'Juniper House', 'Driftwood Villas', 'Lantern Lofts', 'Saltmarsh Terrace', 'Cobble Yard', 'Anchor Heights', 'Sunset Mews'],
  C: ['Pier 9 Coffee', 'Tidal Books', 'Marlow & Daughters', 'The Brass Kettle', 'Seaglass Studio', 'Buoy Bakery', 'Northlight Offices', 'Harbour Exchange', 'Kelp & Co.', 'Starboard Tower', 'Fogline Media', 'Beacon Plaza'],
  I: ['Gull & Sons Canning', 'Saltworks No. 3', 'Ironwharf Forge', 'Tidewater Textiles', 'Bayside Bottling', 'Crane Street Mill', 'Foghorn Freight', 'Rope & Rigging Ltd.', 'Barnacle Metals', 'Harbour Glassworks'],
};
