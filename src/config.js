// ----------------------------------------------------------------------------
// Central tunables for Tiny World. Tweak these to reshape the planet & feel.
// ----------------------------------------------------------------------------

export const CONFIG = {
  // --- planet --------------------------------------------------------------
  planet: {
    radius: 32,           // base sea-level-ish radius (bigger world, smaller-feeling player)
    detail: 60,           // icosphere subdivisions (higher = smoother, heavier)
    maxElevation: 9.0,    // how far land rises above the base radius (dramatic relief)
    seaLevel: 0.2,        // fraction of maxElevation that counts as water (a clear ocean)
    elevationPower: 1.5,  // >1 carves valleys & sharpens peaks (less "flat")
    noiseScale: 1.9,      // frequency of continents
    octaves: 5,           // fractal detail
  },

  // --- player --------------------------------------------------------------
  player: {
    walkSpeed: 0.27,      // radians/sec (≈8.6 u/s on the bigger globe — a brisk walk)
    sprintMultiplier: 1.8, // run ≈ 15.5 u/s
    turnSpeed: 9.0,       // body rotation stiffness (exp smoothing)
    airControl: 0.7,      // how much input can steer momentum mid-air (low = momentum-led)
    maxClimbAngle: 50,    // degrees — slopes steeper than this can't be walked up
    groundStiffness: 12,  // exp-smoothing rate for standing height & up-vector
    slopeEps: 0.05,       // macro normal/slope sampling offset (ignores single facets)
    swimFactor: 0.55,     // movement speed multiplier while swimming
    swimDepth: 0.7,       // water must be deeper than this (≈ hip height) to swim
    swimSink: 0.95,       // how deep the body floats below the water surface
    swimBob: 0.06,        // gentle vertical bob while afloat
    wadeClear: 0.25,      // keep this far above the sea floor in the shallows
    jumpStrength: 9.0,
    gravity: 22.0,
    eyeHeight: 1.5,
  },

  // --- camera --------------------------------------------------------------
  camera: {
    distance: 13,
    height: 6.5,
    followStiffness: 9,   // higher = snappier follow (exp smoothing, fps-independent)
    fov: 55,
    lookSensitivity: 0.0042,
  },

  // --- world dressing ------------------------------------------------------
  props: {
    trees: 300,          // forest density
    grasslandTrees: 60,  // sparse lone trees on the plains
    polarTrees: 90,      // snowy pines in tundra/snow
    cacti: 80,           // desert
    rocks: 180,
    flowers: 440,
    grass: 1700,
  },
  clouds: 34,
  collectibles: {
    count: 20,
    pickupRadius: 2.2,
    respawnDelay: 2.5,    // seconds
  },

  // --- day / night ---------------------------------------------------------
  dayLength: 140,         // seconds for a full day-night cycle
  startTime: 0.28,        // 0..1, morning-ish

  // --- soft low-poly palette ----------------------------------------------
  palette: {
    deepWater:  '#2f6fb0',
    water:      '#3f93cf',
    sand:       '#efdcae',
    grass:      '#79c75a',
    grassDark:  '#54a64a',
    forest:     '#3f8f4f',
    grassland:  '#bcc856',
    desertSand: '#e3c88a',
    desertDark: '#cda85f',
    tundra:     '#9fa884',
    ice:        '#dbeaf2',
    rock:       '#9a8d7c',
    rockDark:   '#766c60',
    snow:       '#f4f6fb',
  },
};

// Curated swatch sets for the character customizer.
export const CUSTOMIZE = {
  // skin tones first (goblin greens), then fun colours
  body: ['#8ab84e', '#5f9a3e', '#a9cf6b', '#7bbf9a', '#c7b27a', '#ff8fab', '#8ecae6', '#c79bff'],
  accent: ['#7a4a2b', '#3a3a4a', '#9a2f2f', '#3a8fd0', '#5bbf5a', '#ffd166'],
  hats: ['none', 'cap', 'cone', 'crown', 'leaf'],
};
