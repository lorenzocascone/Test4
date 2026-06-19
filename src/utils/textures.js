// ----------------------------------------------------------------------------
// Procedural "clay" surface textures — a tiling value-noise turned into a normal
// map (+ a subtle roughness map) so smooth materials get a soft, hand-pressed,
// fingerprinted micro-surface. Generated once on a canvas, shared by materials.
// ----------------------------------------------------------------------------

import * as THREE from 'three';

// Perfectly tiling value noise: a GxG grid of random values sampled with wrap +
// bilinear interpolation, summed over a couple of octaves.
function tilingNoise(size, seed) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const grid = (G) => {
    const g = new Float32Array(G * G);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return g;
  };
  const sample = (g, G, x, y) => {
    const fx = x * G, fy = y * G;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const i = (xx, yy) => g[((yy % G) + G) % G * G + (((xx % G) + G) % G)];
    const a = i(x0, y0), b = i(x0 + 1, y0), c = i(x0, y0 + 1), d = i(x0 + 1, y0 + 1);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };

  const octaves = [
    { g: grid(8), G: 8, amp: 0.6 },
    { g: grid(16), G: 16, amp: 0.3 },
    { g: grid(32), G: 32, amp: 0.15 },
  ];
  const out = new Float32Array(size * size);
  let max = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      const u = x / size, w = y / size;
      for (const o of octaves) v += sample(o.g, o.G, u, w) * o.amp;
      out[y * size + x] = v;
      if (v > max) max = v;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= max || 1;
  return out;
}

let _clayNormal = null;
let _clayRough = null;

export function clayNormalTexture() {
  if (_clayNormal) return _clayNormal;
  const size = 256;
  const base = tilingNoise(size, 0x9e37);

  // Overlay faint fingerprint whorls + sculpting-tool streaks onto the height
  // field before turning it into a normal map.
  const hh = Float32Array.from(base);
  let rs = 0x1357;
  const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
  // a handful of concentric whorls (fingerprints)
  for (let w = 0; w < 5; w++) {
    const cx = rnd() * size, cy = rnd() * size, ringFreq = 0.5 + rnd() * 0.7, amp = 0.085 + rnd() * 0.07;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      hh[y * size + x] += Math.sin(d * ringFreq) * amp * Math.exp(-d / 90);
    }
  }
  // a few long tool streaks
  for (let s = 0; s < 6; s++) {
    const ang = rnd() * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang), ph = rnd() * 6.28, amp = 0.07 + rnd() * 0.06;
    const sf = 0.05 + rnd() * 0.05;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      hh[y * size + x] += Math.sin((x * ca + y * sa) * sf + ph) * amp * 0.4;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => hh[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const strength = 3.3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sobel-ish gradient → tangent-space normal
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      img.data[idx] = (nx / len * 0.5 + 0.5) * 255;
      img.data[idx + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[idx + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  _clayNormal = tex;
  return tex;
}

export function clayRoughnessTexture() {
  if (_clayRough) return _clayRough;
  const size = 256;
  const h = tilingNoise(size, 0x1234abcd);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // mostly rough with gentle variation, so clay isn't uniformly flat
    const v = 200 + h[i] * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  _clayRough = tex;
  return tex;
}

let _clayAlbedo = null;

// Near-white, low-contrast cloud grayscale used as `map`: it MULTIPLIES the base
// / vertex colour, so it adds soft hand-kneaded lighter/darker plasticine patches
// without shifting hue. sRGB so the multiply reads correctly.
export function clayAlbedoTexture() {
  if (_clayAlbedo) return _clayAlbedo;
  const size = 256;
  const h = tilingNoise(size, 0x0ddba11);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // near-white centre (a multiplicative map can only darken), kneaded patches
    const v = Math.round(240 + (h[i] - 0.5) * 48);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _clayAlbedo = tex;
  return tex;
}
