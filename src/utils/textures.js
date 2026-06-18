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
  const h = tilingNoise(size, 0x9e37);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const strength = 2.0;
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
