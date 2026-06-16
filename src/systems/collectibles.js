// ----------------------------------------------------------------------------
// Floating gems scattered over the land. They spin and bob, glow for the bloom
// pass, and are collected when the player wanders close. Collected gems respawn
// elsewhere after a short delay for an endless, chill loop.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { randomDirection } from '../utils/math.js';

const GEM_COLORS = ['#ff7eb6', '#7ee8fa', '#ffd166', '#a0e57b', '#c79bff', '#ff9b6a'];

export class Collectibles {
  constructor(planet, particles, onCollect) {
    this.planet = planet;
    this.particles = particles;
    this.onCollect = onCollect;
    this.group = new THREE.Group();
    this.group.name = 'collectibles';
    this.gems = [];
    this._rng = Math.random;

    const geo = new THREE.OctahedronGeometry(0.5, 0);
    geo.scale(1, 1.4, 1);

    for (let i = 0; i < CONFIG.collectibles.count; i++) {
      const color = new THREE.Color(GEM_COLORS[i % GEM_COLORS.length]);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.6,
        roughness: 0.1,
        metalness: 0.3,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;

      // A soft glow halo sprite behind the gem.
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 16, 16),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      mesh.add(halo);

      const pivot = new THREE.Group();
      pivot.add(mesh);
      this.group.add(pivot);

      const gem = { pivot, mesh, color, phase: Math.random() * Math.PI * 2, active: true, respawnIn: 0, dir: new THREE.Vector3() };
      this._place(gem);
      this.gems.push(gem);
    }
  }

  _place(gem) {
    // find a land spot above sea level, not too high
    let dir;
    for (let tries = 0; tries < 40; tries++) {
      dir = randomDirection(this._rng);
      const r = this.planet.radiusAt(dir);
      if (r > this.planet.seaRadius + 0.4) {
        const elev = (r - CONFIG.planet.radius) / CONFIG.planet.maxElevation;
        if (elev < 0.82) break;
      }
    }
    gem.dir.copy(dir);
    const base = this.planet.surfacePoint(dir).clone();
    gem.basePos = base;
    gem.normal = this.planet.normalAt(dir, 0.02);
    gem.pivot.position.copy(base);
    gem.active = true;
    gem.mesh.visible = true;
    gem.pivot.visible = true;
  }

  update(dt, elapsed, playerPos) {
    const pickR2 = CONFIG.collectibles.pickupRadius * CONFIG.collectibles.pickupRadius;
    for (const gem of this.gems) {
      if (!gem.active) {
        gem.respawnIn -= dt;
        if (gem.respawnIn <= 0) this._place(gem);
        continue;
      }
      // bob along the surface normal + spin
      const bob = Math.sin(elapsed * 2 + gem.phase) * 0.35 + 1.1;
      gem.pivot.position.copy(gem.basePos).addScaledVector(gem.normal, bob);
      gem.mesh.rotation.y += dt * 1.6;
      gem.mesh.rotation.x = Math.sin(elapsed + gem.phase) * 0.2;

      if (playerPos) {
        const d2 = gem.pivot.position.distanceToSquared(playerPos);
        if (d2 < pickR2) this._collect(gem);
      }
    }
  }

  _collect(gem) {
    gem.active = false;
    gem.mesh.visible = false;
    gem.pivot.visible = false;
    gem.respawnIn = CONFIG.collectibles.respawnDelay;
    this.particles.burst(gem.pivot.position.clone(), gem.color, 30);
    if (this.onCollect) this.onCollect(gem);
  }
}
