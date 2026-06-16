// ----------------------------------------------------------------------------
// Central tunables for Tiny World. Tweak these to reshape the planet & feel.
// ----------------------------------------------------------------------------

export const CONFIG = {
  // --- planet --------------------------------------------------------------
  planet: {
    radius: 20,           // base sea-level-ish radius
    detail: 48,           // icosphere subdivisions (higher = smoother, heavier)
    maxElevation: 3.4,    // how far land rises above the base radius
    seaLevel: 0.18,       // fraction of maxElevation that counts as water
    noiseScale: 1.5,      // frequency of continents
    octaves: 5,           // fractal detail
  },

  // --- player --------------------------------------------------------------
  player: {
    walkSpeed: 0.18,      // radians/sec across the surface (~3.8 u/s — a walk)
    sprintMultiplier: 2.0, // run ≈ 7.6 u/s
    turnSpeed: 9.0,       // body rotation stiffness (exp smoothing)
    jumpStrength: 9.0,
    gravity: 22.0,
    eyeHeight: 1.5,
  },

  // --- camera --------------------------------------------------------------
  camera: {
    distance: 11,
    height: 5.5,
    followStiffness: 9,   // higher = snappier follow (exp smoothing, fps-independent)
    fov: 55,
    lookSensitivity: 0.0042,
  },

  // --- world dressing ------------------------------------------------------
  props: {
    trees: 150,
    rocks: 90,
    flowers: 260,
    grass: 900,
  },
  clouds: 26,
  collectibles: {
    count: 14,
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
    rock:       '#9a8d7c',
    rockDark:   '#766c60',
    snow:       '#f4f6fb',
  },
};

// Curated swatch sets for the character customizer.
export const CUSTOMIZE = {
  body: ['#ff8fab', '#ffd166', '#8ecae6', '#a0e57b', '#c79bff', '#ff9b6a', '#ffffff', '#5b6b7b'],
  accent: ['#3a3a4a', '#ffffff', '#ff5d8f', '#ffd166', '#3a8fd0', '#5bbf7a'],
  hats: ['none', 'cap', 'cone', 'crown', 'leaf'],
};
