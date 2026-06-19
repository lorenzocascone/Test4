// ----------------------------------------------------------------------------
// Splash droplets — a pool of big, individual, opaque "plasticine" blobs that
// arc up and fall under radial gravity (used for wading/swim splashes). Unlike
// the additive Points particles, these are chunky 3D clay drops.
// ----------------------------------------------------------------------------

import * as THREE from 'three';

export class Droplets {
  constructor(max = 48) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(0.16, 1); // chunky round drop
    const mat = new THREE.MeshStandardMaterial({
      color: '#2aa7e0', roughness: 0.45, metalness: 0.0, envMapIntensity: 0.6,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'droplets';
    this.mesh.castShadow = true;

    this.drops = [];
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, hidden);
      this.drops.push({ life: 0, maxLife: 1, size: 1, rot: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.cursor = 0;
    this._q = new THREE.Quaternion();
    this._axis = new THREE.Vector3(0.3, 1, 0.2).normalize();
    this._s = new THREE.Vector3();
    this._m = new THREE.Matrix4();
  }

  // Fling a few big drops up + outward from `pos` (up = radial up).
  splash(pos, up, count = 6) {
    for (let k = 0; k < count; k++) {
      const d = this.drops[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      d.pos.copy(pos);
      d.vel.copy(up).multiplyScalar(3 + Math.random() * 3.5)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3));
      d.life = d.maxLife = 0.6 + Math.random() * 0.5;
      d.size = 0.7 + Math.random() * 0.9;
      d.rot = Math.random() * 6.28;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const d = this.drops[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      const len = d.pos.length() || 1;
      d.vel.addScaledVector(d.pos, -(18 * dt) / len); // radial gravity
      d.pos.addScaledVector(d.vel, dt);
      d.rot += dt * 4;
      const t = Math.max(d.life, 0) / d.maxLife;
      const sc = d.life <= 0 ? 0 : d.size * (0.45 + t * 0.55); // shrink as it falls
      this._q.setFromAxisAngle(this._axis, d.rot);
      this._s.setScalar(sc);
      this._m.compose(d.pos, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
