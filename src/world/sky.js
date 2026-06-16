// ----------------------------------------------------------------------------
// Big inward-facing sky dome with a vertical gradient (shader), plus a starfield
// that fades in at night. Colours are driven by the day/night system.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
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

export class Sky {
  constructor(radius = 400) {
    this.uniforms = {
      uTopColor: { value: new THREE.Color('#4a90d9') },
      uBottomColor: { value: new THREE.Color('#cfeafe') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff3d0') },
      uSunIntensity: { value: 1.0 },
    };

    const geo = new THREE.SphereGeometry(radius, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uTopColor;
        uniform vec3 uBottomColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uSunIntensity;
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uBottomColor, uTopColor, pow(h, 0.8));
          // glow around the sun
          float sun = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          col += uSunColor * pow(sun, 80.0) * 1.4 * uSunIntensity;      // disc
          col += uSunColor * pow(sun, 6.0) * 0.25 * uSunIntensity;      // halo
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;

    this.stars = this._buildStars(radius * 0.95);
  }

  _buildStars(radius) {
    const rng = mulberry32(424242);
    const count = 1400;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const d = randomDirection(rng).multiplyScalar(radius);
      positions[i * 3] = d.x; positions[i * 3 + 1] = d.y; positions[i * 3 + 2] = d.z;
      sizes[i] = 0.5 + rng() * 2.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.starUniforms = { uOpacity: { value: 0 }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.starUniforms,
      vertexShader: /* glsl */`
        attribute float aSize;
        uniform float uTime;
        varying float vTw;
        void main() {
          vTw = 0.6 + 0.4 * sin(uTime * 2.0 + position.x * 0.5 + position.y);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * (300.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uOpacity;
        varying float vTw;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), a * uOpacity * vTw);
        }
      `,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.name = 'stars';
    return points;
  }

  setStarOpacity(v) { this.starUniforms.uOpacity.value = v; }
  update(elapsed) { this.starUniforms.uTime.value = elapsed; }
}
