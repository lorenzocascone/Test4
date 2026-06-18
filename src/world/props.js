// ----------------------------------------------------------------------------
// Scattered scenery: trees, rocks, flowers and grass tufts placed on the land
// and oriented to the surface normal. Uses InstancedMesh for performance.
// Foliage wind sway runs entirely on the GPU (a vertex-shader offset), so the
// per-frame CPU cost is just advancing one uniform — smooth even on mobile.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { fibonacciSphere, alignToNormal } from '../utils/math.js';
import { clayNormalTexture } from '../utils/textures.js';

// Soft matte clay material with the shared hand-pressed normal micro-texture.
function clayMat(opts = {}) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.35,
    normalMap: clayNormalTexture(),
    normalScale: new THREE.Vector2(0.22, 0.22),
    ...opts,
  });
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Props {
  constructor(planet, seed = 7, { mobile = false } = {}) {
    this.planet = planet;
    this.mobile = mobile;
    this.rng = mulberry32(seed);
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.windUniforms = { uTime: { value: 0 } }; // shared by all foliage materials

    this._buildTrees();
    this._buildRocks();
    this._buildFlowers();
    this._buildGrass();
  }

  // Find valid land placements: above sea level, not too steep, not too high.
  // `minDist` (radians) enforces spacing; `biomes` (Set) restricts to biomes.
  // Each placement carries its biome so callers can tint/choose by region.
  _placements(count, { maxElev = 0.78, minElev = 0.0, maxSlope = 0.45, minDist = 0, biomes = null } = {}) {
    const out = [];
    const accepted = [];
    const over = (minDist > 0 || biomes) ? 7 : 3;   // oversample more when rejecting
    const cosMin = minDist > 0 ? Math.cos(minDist) : 2;
    const dirs = fibonacciSphere(count * over, this.rng);
    const cfg = CONFIG.planet;
    for (const dir of dirs) {
      if (out.length >= count) break;
      const r = this.planet.radiusAt(dir);
      if (r <= this.planet.seaRadius + 0.12) continue; // skip water + shoreline
      const elev = (r - cfg.radius) / cfg.maxElevation;
      if (elev > maxElev || elev < minElev) continue;
      const normal = this.planet.normalAt(dir, 0.02);
      const slope = 1 - normal.dot(dir);
      if (slope > maxSlope) continue;
      const biome = this.planet.biomeAt(dir, r, normal);
      if (biomes && !biomes.has(biome)) continue;
      if (minDist > 0) {
        let tooClose = false;
        for (let a = 0; a < accepted.length; a++) {
          if (accepted[a].dot(dir) > cosMin) { tooClose = true; break; }
        }
        if (tooClose) continue;
        accepted.push(dir);
      }
      out.push({ dir, r, normal, elev, biome });
    }
    return out;
  }

  // Per-instance random wind phase, so foliage doesn't sway in lockstep.
  _phaseAttr(count) {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) arr[i] = this.rng() * Math.PI * 2;
    return new THREE.InstancedBufferAttribute(arr, 1);
  }

  // Inject a cheap GPU wind sway: top of the model (local +Y) leans on a sine
  // wave. `yBias` lifts small/centred geometry (flower heads) so they move too.
  _applyWind(material, intensity, yBias = 0) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniforms.uTime;
      shader.uniforms.uWind = { value: intensity };
      shader.uniforms.uYBias = { value: yBias };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aPhase;
           uniform float uTime;
           uniform float uWind;
           uniform float uYBias;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float _h = max(position.y, 0.0) + uYBias;
           transformed.x += sin(uTime * 1.6 + aPhase) * uWind * _h;
           transformed.z += cos(uTime * 1.3 + aPhase) * uWind * 0.5 * _h;`
        );
    };
    // Unique cache key per wind material so three compiles a distinct program
    // (running onBeforeCompile + its own uniforms) and never reuses a non-wind
    // program from an identical-looking material (rocks/trunks/stems).
    const key = `tinyworld-wind-${intensity}-${yBias}`;
    material.customProgramCacheKey = () => key;
  }

  // Build a FRESH archetype (geometry + look) by name. Fresh each call so the
  // same kind can be used in several biome passes without sharing a geometry.
  // Each foliage is a single merged geometry baked at its real height above y=0.
  _makeArchetype(name) {
    const fd = this.mobile ? 1 : 2;               // canopy icosphere detail
    const tube = (rBot, rTop, h, y, seg = 8) => {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
      g.translate(0, y, 0); return g;
    };
    const ball = (r, x, y, z) => {
      const g = new THREE.IcosahedronGeometry(r, fd);
      g.translate(x, y, z); return g;
    };
    const cone = (r, h, y, seg = 10) => {
      const g = new THREE.ConeGeometry(r, h, seg);
      g.translate(0, y, 0); return g;
    };
    const cap = (r, len, x, y, z, seg = 6) => {
      const g = new THREE.CapsuleGeometry(r, len, 3, seg);
      g.translate(x, y, z); return g;
    };

    switch (name) {
      case 'broadleaf': return {
        scale: [1.5, 1.4], trunk: tube(0.18, 0.13, 1.3, 0.65),
        foliage: mergeGeometries([ball(0.95, 0, 1.78, 0), ball(0.72, 0.5, 1.52, 0.1), ball(0.72, -0.46, 1.56, -0.12), ball(0.62, 0.08, 2.12, 0.18)]),
        greens: ['#5bbf5a', '#6cc36a', '#4fa64a', '#79c75a'],
      };
      case 'pine': return {
        scale: [1.7, 1.6], trunk: tube(0.16, 0.12, 1.1, 0.55),
        foliage: mergeGeometries([cone(0.98, 1.4, 1.2), cone(0.74, 1.2, 1.95), cone(0.5, 1.05, 2.62)]),
        greens: ['#3f8f4f', '#357a45', '#48994f'],
      };
      case 'bush': return {
        scale: [1.0, 0.9], trunk: null,
        foliage: mergeGeometries([ball(0.55, 0, 0.45, 0), ball(0.46, 0.4, 0.35, 0.08), ball(0.46, -0.36, 0.38, -0.1)]),
        greens: ['#6cc36a', '#79c75a', '#8ad06a'],
      };
      case 'birch': return {
        scale: [1.7, 1.3], trunkColor: '#d6cdb8', trunk: tube(0.12, 0.085, 2.0, 1.0),
        foliage: mergeGeometries([ball(0.74, 0, 2.2, 0), ball(0.56, 0.26, 2.55, 0.1)]),
        greens: ['#9ad06a', '#a9cf6b', '#88c25a'],
      };
      case 'snowpine': return { // conifer dusted with snow, near the poles
        scale: [1.5, 1.3], wind: 0.03, trunkColor: '#6b5640', trunk: tube(0.15, 0.11, 1.0, 0.5),
        foliage: mergeGeometries([cone(0.95, 1.3, 1.1), cone(0.72, 1.15, 1.8), cone(0.48, 1.0, 2.45)]),
        greens: ['#e8f0f4', '#d4e4ec', '#cfe0e8', '#bcd4dd'],
      };
      case 'cactus': return { // saguaro: a tall body flanked by two arm columns
        scale: [1.3, 1.1], wind: 0, trunk: null,
        foliage: mergeGeometries([
          cap(0.22, 1.4, 0, 0.9, 0),
          cap(0.11, 0.7, -0.32, 1.15, 0, 5),
          cap(0.11, 0.7, 0.32, 1.3, 0, 5),
        ]),
        greens: ['#5a9e4a', '#4f8f44', '#67a84e'],
      };
      default: return this._makeArchetype('broadleaf');
    }
  }

  _weightedPick(pairs) {
    let r = this.rng();
    for (const [name, w] of pairs) { if (r < w) return name; r -= w; }
    return pairs[pairs.length - 1][0];
  }

  // Trees, cacti and snowy pines, placed per biome.
  _buildTrees() {
    const passes = [
      { biomes: ['forest'], count: CONFIG.props.trees, minDist: 0.05,
        pick: () => this._weightedPick([['broadleaf', 0.45], ['pine', 0.33], ['birch', 0.22]]) },
      { biomes: ['grassland'], count: CONFIG.props.grasslandTrees, minDist: 0.11,
        pick: () => this._weightedPick([['broadleaf', 0.5], ['bush', 0.5]]) },
      { biomes: ['tundra', 'snow'], count: CONFIG.props.polarTrees, minDist: 0.08, pick: () => 'snowpine' },
      { biomes: ['desert'], count: CONFIG.props.cacti, minDist: 0.085, pick: () => 'cactus' },
    ];

    for (const pass of passes) {
      const places = this._placements(pass.count, {
        maxElev: 0.74, maxSlope: 0.42, minDist: pass.minDist, biomes: new Set(pass.biomes),
      });
      const byName = new Map();
      for (const p of places) {
        const name = pass.pick();
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(p);
      }
      for (const [name, group] of byName) this._buildTreeType(this._makeArchetype(name), group);
    }
  }

  _buildTreeType(arch, places) {
    const n = places.length;
    if (n === 0) return;
    const col = new THREE.Color();

    let trunk = null;
    if (arch.trunk) {
      const trunkMat = clayMat({ color: arch.trunkColor || '#8a5a3b', roughness: 1 });
      trunk = new THREE.InstancedMesh(arch.trunk, trunkMat, n);
      trunk.castShadow = true; trunk.receiveShadow = true;
    }
    const foliageMat = clayMat({ vertexColors: true, roughness: 0.9 });
    const foliage = new THREE.InstancedMesh(arch.foliage, foliageMat, n);
    foliage.castShadow = true; foliage.receiveShadow = true;
    const colors = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const p = places[i];
      this.planet.surfacePoint(p.dir, _pos);
      // Grow "up" relative to the globe centre (radial), NOT the bumpy terrain
      // normal — otherwise trees lean at every facet angle.
      const up = p.dir;
      const forward = new THREE.Vector3(up.y, -up.x, up.z).normalize();
      alignToNormal(up, forward, _quat);
      _tmpQuat.setFromAxisAngle(up, this.rng() * Math.PI * 2); // random yaw
      _quat.premultiply(_tmpQuat);
      const s = arch.scale[0] + this.rng() * arch.scale[1];
      _scale.set(s, s * (0.92 + this.rng() * 0.25), s);
      _mat4.compose(_pos, _quat, _scale);
      if (trunk) trunk.setMatrixAt(i, _mat4);
      foliage.setMatrixAt(i, _mat4);
      col.set(arch.greens[(this.rng() * arch.greens.length) | 0]);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }

    arch.foliage.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
    arch.foliage.setAttribute('aPhase', this._phaseAttr(n));
    this._applyWind(foliageMat, arch.wind ?? 0.04);

    if (trunk) { trunk.instanceMatrix.needsUpdate = true; this.group.add(trunk); }
    foliage.instanceMatrix.needsUpdate = true;
    this.group.add(foliage);
  }

  _buildRocks() {
    const places = this._placements(CONFIG.props.rocks, { maxElev: 0.95, maxSlope: 0.6 });
    const n = places.length;
    const geo = new THREE.DodecahedronGeometry(0.5, 0);
    // jitter vertices for a chunkier look
    const gp = geo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      gp.setXYZ(i,
        gp.getX(i) * (0.8 + Math.random() * 0.5),
        gp.getY(i) * (0.7 + Math.random() * 0.4),
        gp.getZ(i) * (0.8 + Math.random() * 0.5));
    }
    geo.computeVertexNormals();
    const mat = clayMat({ vertexColors: true, roughness: 1 });
    const rocks = new THREE.InstancedMesh(geo, mat, n);
    const colors = new Float32Array(n * 3);
    // rock colour set depends on the biome it sits in
    const palettes = {
      grey: ['#9a8d7c', '#857a6c', '#a8a096', '#766c60'],
      sand: ['#c9a86a', '#b89455', '#d8bd86', '#a98748'],   // desert sandstone
      ice: ['#cdd9e2', '#b9c8d4', '#dde8ef', '#a7b7c4'],    // polar / icy
    };
    const col = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const p = places[i];
      this.planet.surfacePoint(p.dir, _pos);
      _pos.addScaledVector(p.normal, 0.1);
      _quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.normal);
      _tmpQuat.setFromAxisAngle(p.normal, this.rng() * Math.PI * 2);
      _quat.multiply(_tmpQuat);
      const s = 0.7 + this.rng() * 2.0; // range from pebbles to big boulders
      _scale.set(s, s * (0.7 + this.rng() * 0.5), s);
      _mat4.compose(_pos, _quat, _scale);
      rocks.setMatrixAt(i, _mat4);
      const set = p.biome === 'desert' ? palettes.sand
        : (p.biome === 'snow' || p.biome === 'tundra') ? palettes.ice
        : palettes.grey;
      col.set(set[(this.rng() * set.length) | 0]);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
    rocks.castShadow = true; rocks.receiveShadow = true;
    rocks.instanceMatrix.needsUpdate = true;
    this.group.add(rocks);
  }

  _buildFlowers() {
    const places = this._placements(CONFIG.props.flowers, { maxElev: 0.5, maxSlope: 0.35, biomes: new Set(['grassland', 'forest']) });
    const n = places.length;
    // a flower = thin stem + a little disc head (merged via two instanced meshes)
    const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4);
    stemGeo.translate(0, 0.2, 0);
    const stemMat = clayMat({ color: '#4a9a4a' });
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, n);

    const headGeo = new THREE.IcosahedronGeometry(0.12, 0);
    const headMat = clayMat({ vertexColors: true, emissiveIntensity: 0.2 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, n);
    const colors = new Float32Array(n * 3);
    const petals = ['#ff8fab', '#ffd166', '#ff6b6b', '#c79bff', '#ffffff', '#ff9ec7'];
    const col = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const p = places[i];
      this.planet.surfacePoint(p.dir, _pos);
      _quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.dir); // grow radially up
      const s = 0.7 + this.rng() * 0.8;
      _scale.set(s, s, s);
      _mat4.compose(_pos, _quat, _scale);
      stems.setMatrixAt(i, _mat4);
      const head = _pos.clone().addScaledVector(p.dir, 0.4 * s);
      _mat4.compose(head, _quat, _scale);
      heads.setMatrixAt(i, _mat4);
      col.set(petals[(this.rng() * petals.length) | 0]);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    headGeo.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
    headGeo.setAttribute('aPhase', this._phaseAttr(n));
    this._applyWind(headMat, 0.12, 0.4); // yBias lifts the centred head so it bobs

    stems.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.group.add(stems, heads);
  }

  _buildGrass() {
    const places = this._placements(CONFIG.props.grass, { maxElev: 0.55, maxSlope: 0.4, biomes: new Set(['grassland', 'forest']) });
    const n = places.length;
    // a tuft = a tiny squished cone
    const geo = new THREE.ConeGeometry(0.08, 0.32, 4);
    geo.translate(0, 0.16, 0);
    const mat = clayMat({ vertexColors: true, roughness: 1 });
    const grass = new THREE.InstancedMesh(geo, mat, n);
    const colors = new Float32Array(n * 3);
    const greens = ['#6cc36a', '#5bbf5a', '#79c75a', '#54a64a'];
    const col = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const p = places[i];
      this.planet.surfacePoint(p.dir, _pos);
      _quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.dir); // grow radially up
      const s = 0.6 + this.rng() * 1.0;
      _scale.set(s, s * (1 + this.rng()), s);
      _mat4.compose(_pos, _quat, _scale);
      grass.setMatrixAt(i, _mat4);
      col.set(greens[(this.rng() * greens.length) | 0]);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
    geo.setAttribute('aPhase', this._phaseAttr(n));
    this._applyWind(mat, 0.16);

    grass.instanceMatrix.needsUpdate = true;
    grass.receiveShadow = true;
    this.group.add(grass);
  }

  update(dt, elapsed) {
    // All sway happens on the GPU — just advance the shared wind clock.
    this.windUniforms.uTime.value = elapsed;
  }
}
