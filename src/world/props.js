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
  // `minDist` (radians) enforces a minimum spacing so things don't pile up.
  _placements(count, { maxElev = 0.78, minElev = 0.0, maxSlope = 0.45, minDist = 0 } = {}) {
    const out = [];
    const accepted = [];
    const over = minDist > 0 ? 6 : 3;            // oversample more when rejecting
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
      if (minDist > 0) {
        let tooClose = false;
        for (let a = 0; a < accepted.length; a++) {
          if (accepted[a].dot(dir) > cosMin) { tooClose = true; break; }
        }
        if (tooClose) continue;
        accepted.push(dir);
      }
      out.push({ dir, r, normal, elev });
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

  // A few tree archetypes so the forest reads as varied, not one pointy mass.
  // Each foliage is a single merged geometry (higher poly, rounded) baked at its
  // real height above y=0 so it drops straight onto the trunk's transform.
  _treeArchetypes() {
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

    return [
      { // broadleaf — bushy rounded canopy
        weight: 0.40, scale: [1.5, 1.4],
        trunk: tube(0.18, 0.13, 1.3, 0.65),
        foliage: mergeGeometries([ball(0.95, 0, 1.78, 0), ball(0.72, 0.5, 1.52, 0.1), ball(0.72, -0.46, 1.56, -0.12), ball(0.62, 0.08, 2.12, 0.18)]),
        greens: ['#5bbf5a', '#6cc36a', '#4fa64a', '#79c75a'],
      },
      { // pine — stacked conifer tiers
        weight: 0.26, scale: [1.7, 1.6],
        trunk: tube(0.16, 0.12, 1.1, 0.55),
        foliage: mergeGeometries([cone(0.98, 1.4, 1.2), cone(0.74, 1.2, 1.95), cone(0.5, 1.05, 2.62)]),
        greens: ['#3f8f4f', '#357a45', '#48994f'],
      },
      { // bush — squat, trunkless
        weight: 0.20, scale: [1.0, 0.9],
        trunk: null,
        foliage: mergeGeometries([ball(0.55, 0, 0.45, 0), ball(0.46, 0.4, 0.35, 0.08), ball(0.46, -0.36, 0.38, -0.1)]),
        greens: ['#6cc36a', '#79c75a', '#8ad06a'],
      },
      { // birch — tall, slim, pale trunk, small crown
        weight: 0.14, scale: [1.7, 1.3], trunkColor: '#d6cdb8',
        trunk: tube(0.12, 0.085, 2.0, 1.0),
        foliage: mergeGeometries([ball(0.74, 0, 2.2, 0), ball(0.56, 0.26, 2.55, 0.1)]),
        greens: ['#9ad06a', '#a9cf6b', '#88c25a'],
      },
    ];
  }

  _buildTrees() {
    const archetypes = this._treeArchetypes();
    const places = this._placements(CONFIG.props.trees, { maxElev: 0.72, maxSlope: 0.4, minDist: 0.055 });

    // distribute placements across archetypes by weight
    const buckets = archetypes.map(() => []);
    for (const p of places) {
      let r = this.rng(), idx = archetypes.length - 1;
      for (let w = 0; w < archetypes.length; w++) { if (r < archetypes[w].weight) { idx = w; break; } r -= archetypes[w].weight; }
      buckets[idx].push(p);
    }
    archetypes.forEach((arch, ai) => this._buildTreeType(arch, buckets[ai]));
  }

  _buildTreeType(arch, places) {
    const n = places.length;
    if (n === 0) return;
    const col = new THREE.Color();

    let trunk = null;
    if (arch.trunk) {
      const trunkMat = new THREE.MeshStandardMaterial({ color: arch.trunkColor || '#8a5a3b', flatShading: true, roughness: 1 });
      trunk = new THREE.InstancedMesh(arch.trunk, trunkMat, n);
      trunk.castShadow = true; trunk.receiveShadow = true;
    }
    const foliageMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const foliage = new THREE.InstancedMesh(arch.foliage, foliageMat, n);
    foliage.castShadow = true; foliage.receiveShadow = true;
    const colors = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const p = places[i];
      this.planet.surfacePoint(p.dir, _pos);
      const forward = new THREE.Vector3(p.dir.y, -p.dir.x, p.dir.z).normalize();
      alignToNormal(p.normal, forward, _quat);
      _tmpQuat.setFromAxisAngle(p.normal, this.rng() * Math.PI * 2); // random yaw
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
    this._applyWind(foliageMat, 0.04);

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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const rocks = new THREE.InstancedMesh(geo, mat, n);
    const colors = new Float32Array(n * 3);
    const greys = ['#9a8d7c', '#857a6c', '#a8a096', '#766c60'];
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
      col.set(greys[(this.rng() * greys.length) | 0]);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
    rocks.castShadow = true; rocks.receiveShadow = true;
    rocks.instanceMatrix.needsUpdate = true;
    this.group.add(rocks);
  }

  _buildFlowers() {
    const places = this._placements(CONFIG.props.flowers, { maxElev: 0.5, maxSlope: 0.35 });
    const n = places.length;
    // a flower = thin stem + a little disc head (merged via two instanced meshes)
    const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4);
    stemGeo.translate(0, 0.2, 0);
    const stemMat = new THREE.MeshStandardMaterial({ color: '#4a9a4a', flatShading: true });
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, n);

    const headGeo = new THREE.IcosahedronGeometry(0.12, 0);
    const headMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissiveIntensity: 0.2 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, n);
    const colors = new Float32Array(n * 3);
    const petals = ['#ff8fab', '#ffd166', '#ff6b6b', '#c79bff', '#ffffff', '#ff9ec7'];
    const col = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const p = places[i];
      this.planet.surfacePoint(p.dir, _pos);
      _quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.normal);
      const s = 0.7 + this.rng() * 0.8;
      _scale.set(s, s, s);
      _mat4.compose(_pos, _quat, _scale);
      stems.setMatrixAt(i, _mat4);
      const head = _pos.clone().addScaledVector(p.normal, 0.4 * s);
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
    const places = this._placements(CONFIG.props.grass, { maxElev: 0.55, maxSlope: 0.4 });
    const n = places.length;
    // a tuft = a tiny squished cone
    const geo = new THREE.ConeGeometry(0.08, 0.32, 4);
    geo.translate(0, 0.16, 0);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const grass = new THREE.InstancedMesh(geo, mat, n);
    const colors = new Float32Array(n * 3);
    const greens = ['#6cc36a', '#5bbf5a', '#79c75a', '#54a64a'];
    const col = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const p = places[i];
      this.planet.surfacePoint(p.dir, _pos);
      _quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.normal);
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
