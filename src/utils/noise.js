// ----------------------------------------------------------------------------
// Fractal noise helpers wrapping simplex-noise (CDN).
// fbm = fractal Brownian motion: sum of octaves for natural-looking terrain.
// ----------------------------------------------------------------------------

import { createNoise3D } from 'simplex-noise';

// A tiny seeded PRNG (mulberry32) so a given seed reproduces the same planet.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Noise {
  constructor(seed = 1337) {
    const rng = mulberry32(seed);
    this.noise3D = createNoise3D(rng);
  }

  // 3D fractal Brownian motion sampled on a direction vector (x,y,z).
  fbm(x, y, z, { octaves = 5, frequency = 1, persistence = 0.5, lacunarity = 2 } = {}) {
    let amp = 1;
    let freq = frequency;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise3D(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm; // roughly -1..1
  }

  // Ridged variant — gives sharper mountain ridges. Returns ~0..1.
  ridged(x, y, z, opts = {}) {
    const v = this.fbm(x, y, z, opts);
    return 1 - Math.abs(v);
  }
}

export const randSeed = () => Math.floor(Math.random() * 2 ** 31);
