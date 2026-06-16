// ----------------------------------------------------------------------------
// The planet: a noise-displaced icosphere with flat-shaded low-poly facets and
// per-vertex biome colours. Exposes a height sampler so everything else (props,
// player, gems) can sit neatly on the ground.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Noise } from '../utils/noise.js';
import { clamp, smoothstep } from '../utils/math.js';

const c = (hex) => new THREE.Color(hex);

export class Planet {
  constructor(seed = 1337) {
    this.cfg = CONFIG.planet;
    this.noise = new Noise(seed);
    this.warpNoise = new Noise(seed ^ 0x9e3779b9);
    this.seaRadius = this.cfg.radius + this.cfg.maxElevation * this.cfg.seaLevel;

    this.palette = {
      deepWater: c(CONFIG.palette.deepWater),
      water: c(CONFIG.palette.water),
      sand: c(CONFIG.palette.sand),
      grass: c(CONFIG.palette.grass),
      grassDark: c(CONFIG.palette.grassDark),
      forest: c(CONFIG.palette.forest),
      rock: c(CONFIG.palette.rock),
      rockDark: c(CONFIG.palette.rockDark),
      snow: c(CONFIG.palette.snow),
    };

    this.mesh = this._build();
  }

  // Raw fractal field in -1..1 for a unit direction. Domain-warped a touch so
  // continents aren't obviously noise-shaped.
  _field(dir) {
    const s = this.cfg.noiseScale;
    const w = 0.35;
    const wx = this.warpNoise.fbm(dir.x * 2, dir.y * 2, dir.z * 2, { octaves: 2 });
    const wy = this.warpNoise.fbm(dir.x * 2 + 5.2, dir.y * 2 + 1.3, dir.z * 2 + 9.1, { octaves: 2 });
    return this.noise.fbm(
      dir.x * s + wx * w,
      dir.y * s + wy * w,
      dir.z * s,
      { octaves: this.cfg.octaves, persistence: 0.5, lacunarity: 2.1 }
    );
  }

  // Elevation as a 0..1 land height (already clamped at sea level for water).
  // Returns the final radius for a given unit direction.
  radiusAt(dir) {
    let h = this._field(dir);              // -1..1
    h = (h + 1) * 0.5;                     // 0..1
    // Push lowlands down and raise peaks for nicer continents.
    h = Math.pow(h, 1.25);
    const land = Math.max(h, this.cfg.seaLevel); // water flattens to sea level
    return this.cfg.radius + land * this.cfg.maxElevation;
  }

  // Convenience: world-space surface point for a unit direction.
  surfacePoint(dir, target = new THREE.Vector3()) {
    return target.copy(dir).multiplyScalar(this.radiusAt(dir));
  }

  // Is this direction underwater?
  isWater(dir) {
    return this.radiusAt(dir) <= this.seaRadius + 0.001;
  }

  // Approximate surface normal via finite differences (for placing props upright).
  normalAt(dir, eps = 0.01) {
    const n = dir.clone();
    const tangent = new THREE.Vector3(-dir.y, dir.x, 0);
    if (tangent.lengthSq() < 1e-5) tangent.set(0, dir.z, -dir.y);
    tangent.normalize();
    const bitangent = new THREE.Vector3().crossVectors(dir, tangent).normalize();

    const sample = (d) => this.surfacePoint(d.clone().normalize());
    const center = sample(dir);
    const a = sample(dir.clone().addScaledVector(tangent, eps));
    const b = sample(dir.clone().addScaledVector(bitangent, eps));
    const e1 = a.sub(center);
    const e2 = b.sub(center);
    const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();
    if (normal.dot(dir) < 0) normal.negate();
    return normal.length() < 0.5 ? dir.clone().normalize() : normal;
  }

  _colorFor(dir, radius, color) {
    const cfg = this.cfg;
    const elev = (radius - cfg.radius) / cfg.maxElevation; // 0..1
    const seaT = cfg.seaLevel;

    if (radius <= this.seaRadius + 0.001) {
      // Underwater shelf colour (sits beneath translucent water mesh).
      const depth = smoothstep(seaT, 0, elev);
      color.copy(this.palette.water).lerp(this.palette.deepWater, depth);
      return;
    }

    // Slope from the radius gradient — steeper places get rockier.
    const normal = this.normalAt(dir, 0.02);
    const slope = 1 - clamp(normal.dot(dir), 0, 1); // 0 flat .. ~1 steep

    const a = elev;
    if (a < seaT + 0.03) {
      color.copy(this.palette.sand);
    } else if (a < 0.42) {
      color.copy(this.palette.grass).lerp(this.palette.grassDark, smoothstep(seaT, 0.42, a) * 0.6);
    } else if (a < 0.66) {
      color.copy(this.palette.grassDark).lerp(this.palette.forest, smoothstep(0.42, 0.66, a));
    } else if (a < 0.85) {
      color.copy(this.palette.forest).lerp(this.palette.rock, smoothstep(0.66, 0.85, a));
    } else {
      color.copy(this.palette.rock).lerp(this.palette.snow, smoothstep(0.85, 1.0, a));
    }

    // Rock breaks through on steep slopes.
    if (slope > 0.35 && a > seaT + 0.05) {
      const rockMix = smoothstep(0.35, 0.7, slope);
      color.lerp(this.palette.rockDark, rockMix * 0.7);
    }

    // Subtle per-facet tint variation for hand-painted feel.
    const tint = this.warpNoise.fbm(dir.x * 8, dir.y * 8, dir.z * 8, { octaves: 2 }) * 0.05;
    color.offsetHSL(0, 0, tint);
  }

  _build() {
    const geo = new THREE.IcosahedronGeometry(this.cfg.radius, this.cfg.detail);
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');

    const pos = geo.attributes.position;
    const dir = new THREE.Vector3();
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const r = this.radiusAt(dir);
      pos.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);
    }

    // Flat shading needs non-indexed geometry so each face gets a face normal.
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();

    const fpos = flat.attributes.position;
    const fcolors = new Float32Array(fpos.count * 3);
    for (let i = 0; i < fpos.count; i++) {
      dir.set(fpos.getX(i), fpos.getY(i), fpos.getZ(i));
      const r = dir.length();
      dir.normalize();
      this._colorFor(dir, r, tmp);
      fcolors[i * 3] = tmp.r;
      fcolors[i * 3 + 1] = tmp.g;
      fcolors[i * 3 + 2] = tmp.b;
    }
    flat.setAttribute('color', new THREE.BufferAttribute(fcolors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
      metalness: 0.0,
      envMapIntensity: 0.4,
    });

    const mesh = new THREE.Mesh(flat, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'planet';
    return mesh;
  }
}
