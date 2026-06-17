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
    this.moistNoise = new Noise(seed ^ 0x1b56c4f3);   // independent moisture field
    this.seaRadius = this.cfg.radius + this.cfg.maxElevation * this.cfg.seaLevel;

    this.palette = {};
    for (const k in CONFIG.palette) this.palette[k] = c(CONFIG.palette[k]);

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

  // Elevation as a 0..1 land height. Land rises above sea level; the ocean
  // floor dips BELOW it (down toward the base radius) so there's real water depth
  // to wade and swim in.
  radiusAt(dir) {
    let h = this._field(dir);              // -1..1
    h = (h + 1) * 0.5;                     // 0..1
    // Push lowlands down and raise peaks for nicer continents.
    h = Math.pow(h, this.cfg.elevationPower ?? 1.25);
    return this.cfg.radius + h * this.cfg.maxElevation;
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

  // Moisture field 0..1 (low frequency) — drives forest vs desert vs grassland.
  moistureAt(dir) {
    return (this.moistNoise.fbm(dir.x * 2.2, dir.y * 2.2 + 4, dir.z * 2.2, { octaves: 3 }) + 1) * 0.5;
  }

  // Classify the biome at a direction. `radius`/`normal` may be passed in to
  // avoid recomputing them (props already have them). Returns a biome key.
  _classify(dir, radius, normal) {
    const cfg = this.cfg;
    if (radius <= this.seaRadius + 0.001) return 'ocean';
    const elev = (radius - cfg.radius) / cfg.maxElevation;   // 0..1
    if (elev < cfg.seaLevel + 0.025) return 'beach';

    // high ground: rock, snow-capped if cold
    const lat = Math.abs(dir.y);                              // 0 equator .. 1 pole
    let temp = 1 - Math.pow(lat, 1.4);                        // warm equator
    temp -= elev * 0.45;                                      // cooler up high
    temp += this.moistNoise.fbm(dir.x * 1.2 + 10, dir.y * 1.2, dir.z * 1.2, { octaves: 2 }) * 0.08;

    if (elev > 0.82) return temp < 0.5 ? 'snow' : 'rock';
    if (elev > 0.64) return 'rock';

    // climate bands
    if (temp < 0.16) return 'snow';                           // polar caps
    if (temp < 0.34) return 'tundra';
    const moist = this.moistureAt(dir);
    if (temp > 0.7 && moist < 0.4) return 'desert';           // hot & dry
    if (moist > 0.55) return 'forest';                        // wet
    return 'grassland';
  }

  biomeAt(dir, radius = null, normal = null) {
    const r = radius == null ? this.radiusAt(dir) : radius;
    return this._classify(dir, r, normal);
  }

  _biomeColor(biome, color) {
    const p = this.palette;
    switch (biome) {
      case 'beach': color.copy(p.sand); break;
      case 'desert': color.copy(p.desertSand); break;
      case 'grassland': color.copy(p.grassland); break;
      case 'forest': color.copy(p.forest); break;
      case 'tundra': color.copy(p.tundra); break;
      case 'snow': color.copy(p.snow); break;
      case 'rock': color.copy(p.rock); break;
      default: color.copy(p.grass); break;
    }
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

    const biome = this._classify(dir, radius, normal);
    this._biomeColor(biome, color);

    // Snow caps fade in toward the highest ground regardless of biome.
    if (elev > 0.78 && biome !== 'snow') {
      color.lerp(this.palette.snow, smoothstep(0.78, 0.96, elev) * 0.7);
    }
    // Desert dunes get a touch of darker sand banding.
    if (biome === 'desert') {
      const band = this.warpNoise.fbm(dir.x * 12, dir.y * 12, dir.z * 12, { octaves: 2 });
      color.lerp(this.palette.desertDark, Math.max(0, band) * 0.3);
    }

    // Rock breaks through on steep slopes (not in water/beach).
    if (slope > 0.35 && elev > seaT + 0.05) {
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
