// ----------------------------------------------------------------------------
// Puffy low-poly clouds that slowly drift around the planet on their own orbital
// planes. Each cloud is a little cluster of flattened spheres.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { randomDirection } from '../utils/math.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Clouds {
  constructor(planetRadius, seed = 99) {
    this.group = new THREE.Group();
    this.group.name = 'clouds';
    this.clouds = [];
    const rng = mulberry32(seed);
    const baseR = planetRadius + CONFIG.planet.maxElevation + 6;

    const mat = new THREE.MeshStandardMaterial({
      color: '#fdfbf5',
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.4,
      transparent: true,
      opacity: 0.95,
    });

    for (let i = 0; i < CONFIG.clouds; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + ((rng() * 4) | 0);
      for (let p = 0; p < puffs; p++) {
        const geo = new THREE.IcosahedronGeometry(0.9 + rng() * 1.4, 1);
        const puff = new THREE.Mesh(geo, mat);
        puff.position.set((rng() - 0.5) * 4, (rng() - 0.5) * 0.8, (rng() - 0.5) * 2);
        puff.scale.set(1, 0.6, 1);
        puff.castShadow = true;
        cloud.add(puff);
      }
      // Random orbital plane: pick an axis and an initial angle.
      const axis = randomDirection(rng);
      const radius = baseR + rng() * 4;
      const speed = (0.02 + rng() * 0.05) * (rng() > 0.5 ? 1 : -1);
      const angle = rng() * Math.PI * 2;
      // a reference vector perpendicular to axis
      let ref = new THREE.Vector3(0, 1, 0).cross(axis);
      if (ref.lengthSq() < 1e-4) ref = new THREE.Vector3(1, 0, 0).cross(axis);
      ref.normalize();

      cloud.scale.setScalar(0.8 + rng() * 0.9);
      this.group.add(cloud);
      this.clouds.push({ cloud, axis, ref, radius, speed, angle });
    }
  }

  update(dt) {
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    for (const c of this.clouds) {
      c.angle += c.speed * dt;
      q.setFromAxisAngle(c.axis, c.angle);
      pos.copy(c.ref).applyQuaternion(q).multiplyScalar(c.radius);
      c.cloud.position.copy(pos);
      c.cloud.lookAt(0, 0, 0);
      c.cloud.rotateX(Math.PI / 2);
    }
  }
}
