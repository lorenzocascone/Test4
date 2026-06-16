// ----------------------------------------------------------------------------
// Central tunables for Tiny World. Tweak these to reshape the planet & feel.
// ----------------------------------------------------------------------------

export const CONFIG = {
  // --- planet --------------------------------------------------------------
  planet: {
    radius: 32,           // base sea-level-ish radius (bigger world, smaller-feeling player)
    detail: 60,           // icosphere subdivisions (higher = smoother, heavier)
    maxElevation: 9.0,    // how far land rises above the base radius (dramatic relief)
    seaLevel: 0.16,       // fraction of maxElevation that counts as water
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
    trees: 300,
    rocks: 170,
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
