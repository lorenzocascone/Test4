// ----------------------------------------------------------------------------
// Day / night cycle. Orbits a sun (directional light) and moon around the
// planet, and lerps sky colours, ambient light and fog through a set of keyed
// times of day: dawn -> day -> dusk -> night.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../utils/math.js';

const C = (h) => new THREE.Color(h);

// Keyframes around the clock (t = 0..1). t=0 is midnight.
const KEYS = [
  { t: 0.00, top: C('#0b1733'), bottom: C('#1c2c52'), sun: C('#3a5a8f'), sunI: 0.05, amb: C('#24304f'), ambI: 0.25, hemi: C('#1b2748'), fog: C('#13203f'), star: 1.0 },
  { t: 0.22, top: C('#274a7a'), bottom: C('#e8a070'), sun: C('#ffd9a0'), sunI: 0.5,  amb: C('#7a86a8'), ambI: 0.5,  hemi: C('#6a7aa0'), fog: C('#cfa890'), star: 0.3 },
  { t: 0.30, top: C('#5aa0e0'), bottom: C('#ffe6c0'), sun: C('#fff0d0'), sunI: 1.0,  amb: C('#bcd0e8'), ambI: 0.7,  hemi: C('#aac4e0'), fog: C('#dfeefc'), star: 0.0 },
  { t: 0.50, top: C('#4a90d9'), bottom: C('#d8f0ff'), sun: C('#fff8e8'), sunI: 1.25, amb: C('#cfe6f7'), ambI: 0.85, hemi: C('#bfe0f0'), fog: C('#e7f5ff'), star: 0.0 },
  { t: 0.70, top: C('#5aa0e0'), bottom: C('#ffe6c0'), sun: C('#fff0d0'), sunI: 1.0,  amb: C('#bcd0e8'), ambI: 0.7,  hemi: C('#aac4e0'), fog: C('#dfeefc'), star: 0.0 },
  { t: 0.80, top: C('#46407a'), bottom: C('#ff8a5c'), sun: C('#ff9e5a'), sunI: 0.55, amb: C('#8a7a9a'), ambI: 0.5,  hemi: C('#7a6a96'), fog: C('#c07a66'), star: 0.35 },
  { t: 0.92, top: C('#16204a'), bottom: C('#2a2452'), sun: C('#5a6abf'), sunI: 0.12, amb: C('#33335a'), ambI: 0.3,  hemi: C('#26305a'), fog: C('#1a2244'), star: 0.85 },
  { t: 1.00, top: C('#0b1733'), bottom: C('#1c2c52'), sun: C('#3a5a8f'), sunI: 0.05, amb: C('#24304f'), ambI: 0.25, hemi: C('#1b2748'), fog: C('#13203f'), star: 1.0 },
];

function lerpKey(a, b, f, out) {
  out.top.copy(a.top).lerp(b.top, f);
  out.bottom.copy(a.bottom).lerp(b.bottom, f);
  out.sun.copy(a.sun).lerp(b.sun, f);
  out.amb.copy(a.amb).lerp(b.amb, f);
  out.hemi.copy(a.hemi).lerp(b.hemi, f);
  out.fog.copy(a.fog).lerp(b.fog, f);
  out.sunI = a.sunI + (b.sunI - a.sunI) * f;
  out.ambI = a.ambI + (b.ambI - a.ambI) * f;
  out.star = a.star + (b.star - a.star) * f;
  return out;
}

export class DayNight {
  constructor(scene, sky, planetRadius, mobile = false) {
    this.scene = scene;
    this.sky = sky;
    this.time = CONFIG.startTime;
    this.dayLength = CONFIG.dayLength;
    this.dayCount = 1;
    this._prevTime = this.time;
    this.orbitRadius = planetRadius + 200;

    this.state = {
      top: new THREE.Color(), bottom: new THREE.Color(), sun: new THREE.Color(),
      amb: new THREE.Color(), hemi: new THREE.Color(), fog: new THREE.Color(),
      sunI: 1, ambI: 1, star: 0,
    };

    // Sun — the key light, casts shadows.
    this.sun = new THREE.DirectionalLight('#fff0d0', 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    this.sun.shadow.camera.near = 150;
    this.sun.shadow.camera.far = 320;
    const s = planetRadius * 1.4;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Visible sun disc (a glowing billboard sphere) for bloom to catch.
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(10, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#fff6da', fog: false, toneMapped: false })
    );
    this.sunDisc.name = 'sunDisc';
    scene.add(this.sunDisc);

    // Moon — soft fill at night.
    this.moon = new THREE.DirectionalLight('#9fb6ff', 0.0);
    scene.add(this.moon);
    scene.add(this.moon.target);
    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(6, 20, 20),
      new THREE.MeshBasicMaterial({ color: '#eef0ff', fog: false, toneMapped: false })
    );
    scene.add(this.moonDisc);

    // Ambient + hemisphere for soft global fill.
    this.ambient = new THREE.AmbientLight('#ffffff', 0.6);
    this.hemi = new THREE.HemisphereLight('#bfe0f0', '#3a5a3a', 0.6);
    scene.add(this.ambient, this.hemi);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this._apply();
  }

  _sample(t) {
    let i = 0;
    while (i < KEYS.length - 1 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
    const span = (b.t - a.t) || 1;
    const f = clamp((t - a.t) / span, 0, 1);
    return lerpKey(a, b, f, this.state);
  }

  _apply() {
    const st = this._sample(this.time);

    // Sun travels across the sky; angle 0 at midnight (below), noon at top.
    const ang = (this.time - 0.25) * Math.PI * 2; // sunrise ~0.25
    this.sunDir.set(Math.cos(ang), Math.sin(ang), Math.sin(ang) * 0.3).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(this.orbitRadius);
    this.sun.target.position.set(0, 0, 0);
    this.sun.color.copy(st.sun);
    this.sun.intensity = st.sunI * 1.4;
    this.sunDisc.position.copy(this.sunDir).multiplyScalar(this.orbitRadius * 0.92);
    this.sunDisc.material.color.copy(st.sun);
    this.sunDisc.visible = this.sunDir.y > -0.15;

    // Moon opposite the sun.
    const moonDir = this.sunDir.clone().negate();
    this.moon.position.copy(moonDir).multiplyScalar(this.orbitRadius);
    this.moon.target.position.set(0, 0, 0);
    this.moon.intensity = st.star * 0.35;
    this.moonDisc.position.copy(moonDir).multiplyScalar(this.orbitRadius * 0.9);
    this.moonDisc.visible = moonDir.y > -0.15;

    this.ambient.color.copy(st.amb);
    this.ambient.intensity = st.ambI;
    this.hemi.color.copy(st.hemi);
    this.hemi.intensity = st.ambI * 0.7;

    // Sky + fog
    this.sky.uniforms.uTopColor.value.copy(st.top);
    this.sky.uniforms.uBottomColor.value.copy(st.bottom);
    this.sky.uniforms.uSunDir.value.copy(this.sunDir);
    this.sky.uniforms.uSunColor.value.copy(st.sun);
    this.sky.uniforms.uSunIntensity.value = clamp(st.sunI, 0.0, 1.5);
    this.sky.setStarOpacity(st.star);

    if (this.scene.fog) {
      this.scene.fog.color.copy(st.fog);
    }
  }

  // Returns a short label like "Morning", "Noon"…
  label() {
    const t = this.time;
    if (t < 0.23) return 'Night';
    if (t < 0.32) return 'Dawn';
    if (t < 0.45) return 'Morning';
    if (t < 0.56) return 'Noon';
    if (t < 0.70) return 'Afternoon';
    if (t < 0.82) return 'Dusk';
    if (t < 0.92) return 'Evening';
    return 'Night';
  }

  update(dt) {
    this.time += dt / this.dayLength;
    if (this.time >= 1) { this.time -= 1; this.dayCount++; }
    this._apply();
  }
}
