// ----------------------------------------------------------------------------
// A single pooled Points particle system used for pickup sparkles and footstep
// dust. Additive, bloom-friendly. Cheap: one draw call, fixed pool, recycled.
// ----------------------------------------------------------------------------

import * as THREE from 'three';

export class Particles {
  constructor(max = 600) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);     // remaining seconds
    this.maxLife = new Float32Array(max);
    this.gravity = new Float32Array(max);  // pull toward planet centre
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * (260.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'particles';
  }

  _spawn(pos, vel, color, size, life, gravity) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.positions[i * 3] = pos.x; this.positions[i * 3 + 1] = pos.y; this.positions[i * 3 + 2] = pos.z;
    this.vel[i * 3] = vel.x; this.vel[i * 3 + 1] = vel.y; this.vel[i * 3 + 2] = vel.z;
    this.colors[i * 3] = color.r; this.colors[i * 3 + 1] = color.g; this.colors[i * 3 + 2] = color.b;
    this.sizes[i] = size;
    this.life[i] = life; this.maxLife[i] = life;
    this.gravity[i] = gravity;
  }

  // Celebratory sparkle burst (used on gem pickup).
  burst(pos, color = new THREE.Color('#ffd166'), count = 26) {
    for (let k = 0; k < count; k++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
      ).normalize().multiplyScalar(3 + Math.random() * 5);
      const col = color.clone().offsetHSL((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.2);
      this._spawn(pos, dir, col, 1.5 + Math.random() * 2.5, 0.7 + Math.random() * 0.6, 4);
    }
  }

  // Watery splash thrown up at the surface (wading in / swim strokes).
  splash(pos, up) {
    const colors = ['#cfeefb', '#a9ddf2', '#ffffff'];
    for (let k = 0; k < 8; k++) {
      const dir = up.clone().multiplyScalar(2.5 + Math.random() * 2.5)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2));
      const col = new THREE.Color(colors[(Math.random() * colors.length) | 0]);
      this._spawn(pos, dir, col, 1.3 + Math.random() * 1.5, 0.4 + Math.random() * 0.35, 9);
    }
  }

  // Soft dust kicked up by footsteps.
  dust(pos, up) {
    for (let k = 0; k < 3; k++) {
      const dir = up.clone().multiplyScalar(1 + Math.random())
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5));
      this._spawn(pos, dir, new THREE.Color('#e8dcc0'), 1.2 + Math.random(), 0.4 + Math.random() * 0.3, 3);
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.sizes[i] !== 0) { this.sizes[i] = 0; }
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(this.life[i], 0) / this.maxLife[i];

      // radial gravity toward planet centre
      const px = this.positions[i * 3], py = this.positions[i * 3 + 1], pz = this.positions[i * 3 + 2];
      const len = Math.hypot(px, py, pz) || 1;
      const g = this.gravity[i] * dt;
      this.vel[i * 3] -= (px / len) * g;
      this.vel[i * 3 + 1] -= (py / len) * g;
      this.vel[i * 3 + 2] -= (pz / len) * g;

      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;

      // shrink as the particle ages
      this.sizes[i] = t * 3.0;
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}
