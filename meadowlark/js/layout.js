// Where everything on Meadowlark Isle sits. Metres; x runs east, z runs south, y is up.
export const HALF = 150;              // the world square is [-HALF, HALF] on x and z
export const RES = 1;                 // heightmap cell size
export const SEA = 0;                 // sea level
export const ISLAND_R = 112;

export const P = {
  spawn: [-6, 34],
  village: { c: [-12, 30], r: 21, h: 4.2 },
  orchard: { c: [-60, 46], r: 18, h: 5.2 },
  meadow: { c: [-64, -14], r: 24 },
  forest: { c: [-58, -58], r: 30 },
  windmill: { c: [58, -6], h: 15 },
  beach: { c: [-8, 92] },
  dock: { c: [-22, 90], yaw: 0 },
  lighthouse: [86, 58],
  ruins: [66, -54],
  summit: [-14, -84],
  plateau: { z: -44, h: 20 },        // cliff line: north of it the land rises onto a plateau
  pond: { c: [16, -30], r: 9.5, level: 6.2 },
  waterfall: [14, -44],
  islet: [-78, 116],
  camp: [-40, -40],
};

// the river, from its spring under the summit to the sea; [x, z, water level]
export const RIVER = [
  [4, -86, 31], [8, -74, 27.5], [10, -62, 24], [12, -52, 21.6], [14, -45.2, 21.2],
  // the waterfall drops here, into the pond
  [15, -40.6, 6.2], [16, -30, 6.2], [22, -18, 6.2], [26, -6, 5.6], [22, 6, 4.8], [16, 18, 3.8],
  [16, 30, 3.0], [22, 44, 2.2], [34, 58, 1.2], [44, 74, 0.5], [52, 92, 0.0], [56, 112, 0.0],
];
export const FALL_INDEX = 4;          // RIVER[4] -> RIVER[5] is the waterfall

// dirt paths that wind between places; widths in metres
export const PATHS = [
  { w: 2.2, pts: [[-12, 30], [-2, 22], [8, 12], [18, 6]] },                                  // village -> bridge east
  { w: 2.0, pts: [[18, 6], [32, 2], [44, -2], [56, -4]] },                                    // -> windmill
  { w: 2.0, pts: [[16, 4], [10, -10], [6, -22], [4, -34]] },                                  // -> pond and the foot of the falls
  { w: 1.8, pts: [[4, -34], [-8, -36], [-24, -38], [-36, -40]] },                             // along the cliff to the ramp
  { w: 1.8, pts: [[-36, -40], [-42, -48], [-40, -58], [-32, -66], [-24, -74], [-16, -82]] }, // up the ramp to the summit
  { w: 2.0, pts: [[-12, 30], [-24, 36], [-40, 42], [-56, 46]] },                              // -> orchard
  { w: 2.0, pts: [[-12, 30], [-14, 46], [-14, 62], [-16, 78], [-20, 86]] },                   // -> beach and dock
  { w: 1.8, pts: [[-24, 24], [-38, 12], [-52, -2], [-62, -12]] },                             // -> flower meadow
  { w: 1.6, pts: [[-52, -2], [-50, -22], [-44, -34], [-40, -40]] },                           // meadow -> camp
  { w: 1.6, pts: [[56, -4], [64, -24], [66, -44]] },                                          // windmill -> ruins
  { w: 1.6, pts: [[-6, 48], [12, 50], [30, 54], [50, 56], [68, 57], [82, 58]] },                                  // -> lighthouse
];

// cottages in the village: centre, footprint (w x d), yaw, roof colour
export const HOUSES = [
  { c: [-26, 22], s: [5, 4], yaw: 0.35, roof: 'red', storeys: 2 },
  { c: [-22, 40], s: [4, 4], yaw: -0.4, roof: 'green', storeys: 1 },
  { c: [-4, 42], s: [5, 4], yaw: 0.15, roof: 'red', storeys: 1 },
  { c: [2, 24], s: [4, 5], yaw: -0.25, roof: 'green', storeys: 2 },
  { c: [-14, 14], s: [4, 4], yaw: 0.1, roof: 'red', storeys: 1 },
];
