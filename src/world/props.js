// ----------------------------------------------------------------------------
// Scattered scenery: trees, rocks, flowers and grass tufts placed on the land
// and oriented to the surface normal. Uses InstancedMesh for performance.
// Foliage wind sway runs entirely on the GPU (a vertex-shader offset), so the
// per-frame CPU cost is just advancing one uniform — smooth even on mobile.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
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
  constructor(planet, seed = 7) {
    this.planet = planet;
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
  _placements(count, { maxElev = 0.78, minElev = 0.0, maxSlope = 0.45 } = {}) {
    const out = [];
    const dirs = fibonacciSphere(count * 3, this.rng); // oversample then filter
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

  _buildTrees() {
    const places = this._placements(CONFIG.props.trees, { maxElev: 0.7, maxSlope: 0.4 });
    const n = places.length;

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#8a5a3b', flatShading: true, roughness: 1 });
    const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, n);

    // Foliage — stacked cones
    const leafGeo = new THREE.ConeGeometry(0.9, 1.6, 7);
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, n);
    const leafColors = new Float32Array(n * 3);

    const greens = ['#4fa64a', '#3f8f4f', '#5bbf5a', '#6cc36a', '#48994f'];
    const col = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const p = places[i];
      this.planet.surfacePoint(p.dir, _pos);
      const forward = new THREE.Vector3(p.dir.y, -p.dir.x, p.dir.z).normalize();
      alignToNormal(p.normal, forward, _quat);
      const s = 0.8 + this.rng() * 0.9;

      _scale.set(s, s * (0.9 + this.rng() * 0.4), s);
      _mat4.compose(_pos, _quat, _scale);
      trunk.setMatrixAt(i, _mat4);

      // foliage sits atop the trunk
      const top = _pos.clone().addScaledVector(p.normal, s * 1.0);
      _scale.set(s, s, s);
      _mat4.compose(top, _quat, _scale);
      leaves.setMatrixAt(i, _mat4);

      col.set(greens[(this.rng() * greens.length) | 0]);
      leafColors[i * 3] = col.r; leafColors[i * 3 + 1] = col.g; leafColors[i * 3 + 2] = col.b;
    }
    leafGeo.setAttribute('color', new THREE.InstancedBufferAttribute(leafColors, 3));
    leafGeo.setAttribute('aPhase', this._phaseAttr(n));
    this._applyWind(leafMat, 0.05);

    trunk.castShadow = true; leaves.castShadow = true;
    trunk.receiveShadow = true; leaves.receiveShadow = true;
    trunk.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;

    this.group.add(trunk, leaves);
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
      const s = 0.5 + this.rng() * 1.2;
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
