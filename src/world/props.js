// ----------------------------------------------------------------------------
// Scattered scenery: trees, rocks, flowers and grass tufts placed on the land
// and oriented to the surface normal. Uses InstancedMesh for performance.
// Foliage gets a gentle wind sway in the update loop.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { fibonacciSphere, alignToNormal } from '../utils/math.js';

const _pos = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _swayQuat = new THREE.Quaternion();
const _tmpQuat = new THREE.Quaternion();
const _baseQuat = new THREE.Quaternion();
const _axis = new THREE.Vector3();

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
    this.swayables = []; // { mesh, baseMatrices, axisList, phaseList }

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

  // Record each instance's base transform (decomposed) plus a local sway axis &
  // phase so update() can wobble them cheaply without per-frame allocation.
  _registerSway(mesh, placements, intensity) {
    const count = placements.length;
    const basePos = new Float32Array(count * 3);
    const baseQuat = new Float32Array(count * 4);
    const baseScale = new Float32Array(count * 3);
    const swayAxis = new Float32Array(count * 3); // local-space axis
    const phase = new Float32Array(count);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      mesh.getMatrixAt(i, m);
      m.decompose(p, q, s);
      basePos[i * 3] = p.x; basePos[i * 3 + 1] = p.y; basePos[i * 3 + 2] = p.z;
      baseQuat[i * 4] = q.x; baseQuat[i * 4 + 1] = q.y; baseQuat[i * 4 + 2] = q.z; baseQuat[i * 4 + 3] = q.w;
      baseScale[i * 3] = s.x; baseScale[i * 3 + 1] = s.y; baseScale[i * 3 + 2] = s.z;
      // sway tilts around the local X axis (instances are modelled +Y up)
      swayAxis[i * 3] = 1; swayAxis[i * 3 + 1] = 0; swayAxis[i * 3 + 2] = 0;
      phase[i] = this.rng() * Math.PI * 2;
    }
    this.swayables.push({ mesh, count, basePos, baseQuat, baseScale, swayAxis, phase, intensity });
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

    trunk.castShadow = true; leaves.castShadow = true;
    trunk.receiveShadow = true; leaves.receiveShadow = true;
    trunk.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;

    this.group.add(trunk, leaves);
    this._registerSway(leaves, places, 0.06);
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
    stems.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.group.add(stems, heads);
    this._registerSway(heads, places, 0.1);
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
    grass.instanceMatrix.needsUpdate = true;
    grass.receiveShadow = true;
    this.group.add(grass);
    this._registerSway(grass, places, 0.14);
  }

  update(dt, elapsed, windDir = 1) {
    // Gentle wind sway: tilt each foliage instance around its local axis.
    for (const sway of this.swayables) {
      const { mesh, count, basePos, baseQuat, baseScale, swayAxis, phase, intensity } = sway;
      for (let i = 0; i < count; i++) {
        const angle = Math.sin(elapsed * 1.6 + phase[i]) * intensity * windDir;
        _axis.set(swayAxis[i * 3], swayAxis[i * 3 + 1], swayAxis[i * 3 + 2]);
        _swayQuat.setFromAxisAngle(_axis, angle);
        _baseQuat.set(baseQuat[i * 4], baseQuat[i * 4 + 1], baseQuat[i * 4 + 2], baseQuat[i * 4 + 3]);
        _quat.copy(_baseQuat).multiply(_swayQuat);
        _pos.set(basePos[i * 3], basePos[i * 3 + 1], basePos[i * 3 + 2]);
        _scale.set(baseScale[i * 3], baseScale[i * 3 + 1], baseScale[i * 3 + 2]);
        _mat4.compose(_pos, _quat, _scale);
        mesh.setMatrixAt(i, _mat4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
