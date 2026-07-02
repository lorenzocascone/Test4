// ----------------------------------------------------------------------------
// Tiny World — bootstrap & game loop.
// Sets up the renderer, post-processing, builds the world, wires the UI, and
// runs everything each frame.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { CONFIG } from './config.js';
import { randSeed } from './utils/noise.js';
import { Planet } from './world/planet.js';
import { Water } from './world/water.js';
import { Props } from './world/props.js';
import { Clouds } from './world/clouds.js';
import { Sky } from './world/sky.js';
import { DayNight } from './systems/dayNight.js';
import { Particles } from './systems/particles.js';
import { Droplets } from './systems/droplets.js';
import { Collectibles } from './systems/collectibles.js';
import { Audio } from './systems/audio.js';
import { Character } from './player/character.js';
import { Controller } from './player/controller.js';
import { HUD } from './ui/hud.js';
import { Customizer } from './ui/customize.js';
import { updateSun } from './utils/shaders.js';
import { createTiltShift } from './utils/tiltshift.js';
import { clayNormalTexture, clayAlbedoTexture } from './utils/textures.js';

// Cozy storybook grade: warm tint, gentle desaturation, soft vignette, faint
// film grain — the Pokémon-Concierge warmth on top of the vibrant biomes.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uWarm: { value: new THREE.Color(1.07, 1.0, 0.9) },
    uSat: { value: 1.18 },        // >1 = punchier, sunny tropical
    uContrast: { value: 1.12 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.05 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uSat, uContrast, uVignette, uGrain;
    uniform vec3 uWarm;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // warm tint
      c.rgb *= uWarm;
      // saturation (toward/away from luminance)
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      // contrast S-curve around mid grey
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      // lifted blacks + soft highlight rolloff — the filmic stop-motion warmth
      c.rgb = c.rgb * 0.94 + 0.035;
      c.rgb = c.rgb / (1.0 + max(c.rgb - vec3(1.0), vec3(0.0)) * 0.6);
      // soft vignette
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.9, 0.22, dot(d, d) * 2.4);
      c.rgb *= mix(1.0 - uVignette, 1.0, vig);
      // faint animated grain
      float g = fract(sin(dot(vUv * vec2(uTime + 1.0, uTime + 2.0), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (g - 0.5) * uGrain;
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }
  `,
};

class Game {
  constructor() {
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.state = 'loading';      // loading -> start -> playing
    this.gems = 0;
    this._introAngle = 0;
  }

  async init() {
    // Lower-power devices (phones/tablets) get a lighter render path for a
    // stable framerate — the other half of the "jerky" fix.
    this.isMobile = ('ontouchstart' in window || navigator.maxTouchPoints > 0)
      && Math.min(window.innerWidth, window.innerHeight) < 900;
    this._setupRenderer();
    this._setupScene();
    await this._buildWorld();
    await this._setupPostFX();
    this._setupPlayer();
    this._setupUI();
    window.addEventListener('resize', () => this._onResize());
    this._onResize();
    this._revealStart();
    this.clock.start();
    this.renderer.setAnimationLoop(() => this._loop());
  }

  _setLoader(p, text) {
    const fill = document.getElementById('loader-fill');
    if (fill) fill.style.width = `${Math.round(p * 100)}%`;
    if (text) { const t = document.querySelector('.loader-text'); if (t) t.textContent = text; }
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    // VSM gives soft, blurred shadow edges (no pixel-stairs) on desktop.
    this.renderer.shadowMap.type = this.isMobile ? THREE.PCFSoftShadowMap : THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').appendChild(this.renderer.domElement);
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#e9e3d2', 0.0026); // warm, hazy distance
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.5, 1200);
    this.camera.position.set(0, 30, 60);

    // Soft image-based lighting so the clay materials read as real, hand-made
    // surfaces (gentle reflections + indirect fill). Generated once.
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
      pmrem.dispose();
    } catch (e) {
      console.warn('Environment map unavailable; continuing without IBL.', e);
    }
  }

  // Build the world in small steps so the loader can animate.
  async _buildWorld() {
    const step = (p, text) => new Promise((r) => { this._setLoader(p, text); requestAnimationFrame(() => setTimeout(r, 16)); });

    const seed = randSeed();
    // Lighter terrain mesh on mobile (same shape, fewer facets) to keep it smooth.
    if (this.isMobile) CONFIG.planet.detail = 46;
    await step(0.1, 'Sculpting continents…');
    this.planet = new Planet(seed, { triplanarClay: !this.isMobile });
    this.scene.add(this.planet.mesh);

    await step(0.35, 'Filling the seas…');
    this.water = new Water(this.planet.seaRadius);
    this.scene.add(this.water.mesh);

    await step(0.5, 'Planting forests…');
    if (this.isMobile) {
      CONFIG.props.grass = Math.round(CONFIG.props.grass * 0.4);
      CONFIG.props.flowers = Math.round(CONFIG.props.flowers * 0.5);
      CONFIG.props.trees = Math.round(CONFIG.props.trees * 0.75);
      CONFIG.props.grasslandTrees = Math.round(CONFIG.props.grasslandTrees * 0.75);
      CONFIG.props.polarTrees = Math.round(CONFIG.props.polarTrees * 0.75);
      CONFIG.props.cacti = Math.round(CONFIG.props.cacti * 0.75);
    }
    this.props = new Props(this.planet, seed ^ 0x5a5a, { mobile: this.isMobile });
    this.scene.add(this.props.group);

    await step(0.7, 'Hanging the sky…');
    this.sky = new Sky(600);
    this.scene.add(this.sky.mesh, this.sky.stars);
    this.clouds = new Clouds(CONFIG.planet.radius, seed ^ 0x1234);
    this.scene.add(this.clouds.group);

    await step(0.82, 'Lighting the sun…');
    this.dayNight = new DayNight(this.scene, this.sky, CONFIG.planet.radius, this.isMobile);

    await step(0.92, 'Scattering gems…');
    this.particles = new Particles(700);
    this.scene.add(this.particles.points);
    this.droplets = new Droplets(48);
    this.scene.add(this.droplets.mesh);

    await step(1.0, 'Ready!');
  }

  async _setupPostFX() {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (!this.isMobile) {
      // SSAO grounds objects + darkens clay-seam crevices.
      await this._addAO(w, h);
      // TRUE tilt-shift: a sharp horizontal focus band with blur ramping toward
      // the top and bottom of frame — the miniature-photography signature.
      this.tiltshift = createTiltShift();
      for (const p of this.tiltshift.passes) this.composer.addPass(p);
    }

    // Gentle bloom.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.8, 0.8);
    this.composer.addPass(this.bloom);

    // Punchy sunny-tropical grade (grain only on desktop).
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uGrain.value = this.isMobile ? 0.0 : 0.05;
    this.composer.addPass(this.grade);

    if (!this.isMobile) {
      this.composer.addPass(new SMAAPass(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio()));
    }
    this.composer.addPass(new OutputPass());
  }

  // Ambient occlusion — prefer GTAO, fall back to SSAO, else skip (dynamic import
  // so a missing CDN module degrades gracefully instead of breaking the load).
  async _addAO(w, h) {
    try {
      const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
      const ao = new GTAOPass(this.scene, this.camera, w, h);
      if (GTAOPass.OUTPUT) ao.output = GTAOPass.OUTPUT.Default; // composite AO, not debug view
      try { ao.updateGtaoMaterial?.({ radius: 2.0, scale: 1.0, samples: 16, distanceExponent: 1.0, thickness: 1.0 }); } catch (_) {}
      this.composer.addPass(ao);
      this.ao = ao;
      return;
    } catch (e) { console.warn('GTAO unavailable, trying SSAO…', e); }
    try {
      const { SSAOPass } = await import('three/addons/postprocessing/SSAOPass.js');
      const ao = new SSAOPass(this.scene, this.camera, w, h);
      ao.kernelRadius = 8; ao.minDistance = 0.002; ao.maxDistance = 0.1;
      this.composer.addPass(ao);
      this.ao = ao;
    } catch (e) { console.warn('AO unavailable; skipping.', e); }
  }

  // Pick a pleasant land spot (above sea level, not a steep peak) to start on.
  _findSpawn() {
    const dir = new THREE.Vector3();
    for (let i = 0; i < 200; i++) {
      dir.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (dir.lengthSq() < 0.01) continue;
      dir.normalize();
      const r = this.planet.radiusAt(dir);
      if (r > this.planet.seaRadius + 0.5) {
        const elev = (r - CONFIG.planet.radius) / CONFIG.planet.maxElevation;
        if (elev < 0.6) return dir.clone();
      }
    }
    return new THREE.Vector3(0, 1, 0.0001).normalize();
  }

  _setupPlayer() {
    this.character = new Character();
    this.scene.add(this.character.root);

    // Studio rim light — a cool back-light that tracks behind the goblin to pop
    // it off the globe (the third point of the 3-point rig; sun=key, IBL=fill).
    this.rimLight = new THREE.DirectionalLight('#cfe0ff', 0.0);
    this.scene.add(this.rimLight, this.rimLight.target);

    this.controller = new Controller(this.planet, this.character, this.camera, this.renderer.domElement, null);
    this.controller.position.copy(this._findSpawn());
    this.controller.heading.set(1, 0, 0);
    this.controller._orthonormalize();
    this.controller.facing.copy(this.controller.heading);
    this.controller.snapCamera();
    this.controller.onStep((pos, normal) => this.particles.dust(pos, normal));
    this.controller.onSplash((pos, up) => this.droplets.splash(pos, up));

    this.collectibles = new Collectibles(this.planet, this.particles, (gem) => this._onCollect(gem));
    this.scene.add(this.collectibles.group);
  }

  _setupUI() {
    this.audio = new Audio();
    this.controller.audio = this.audio;
    this.hud = new HUD();
    this.customizer = new Customizer(this.character, this.audio);

    // Start button
    document.getElementById('play-btn').addEventListener('click', () => this._startPlaying());

    // Mute
    const muteBtn = document.getElementById('mute-btn');
    muteBtn.addEventListener('click', () => {
      const m = !this.audio.muted;
      this.audio.setMuted(m);
      this.hud.setMuted(m);
    });

    // Customize panel open/close
    const panel = document.getElementById('customize-panel');
    document.getElementById('customize-btn').addEventListener('click', () => {
      panel.classList.remove('hidden');
      this.controller.setEnabled(false);
      if (document.pointerLockElement) document.exitPointerLock();
    });
    document.getElementById('customize-close').addEventListener('click', () => {
      panel.classList.add('hidden');
      this.controller.setEnabled(true);
      this.audio.uiClick();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      if (e.code === 'KeyM') { const m = !this.audio.muted; this.audio.setMuted(m); this.hud.setMuted(m); }
      if (e.code === 'KeyC') { document.getElementById('customize-btn').click(); }
    });
  }

  _revealStart() {
    this.state = 'start';
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('start').classList.remove('hidden');
    setTimeout(() => document.getElementById('loading').remove(), 700);
  }

  _startPlaying() {
    this.audio.start();
    this.audio.uiClick();
    document.getElementById('start').classList.add('hidden');
    setTimeout(() => { const s = document.getElementById('start'); if (s) s.remove(); }, 700);
    this.hud.show();
    this.hud.setTime(this.dayNight.label(), this.dayNight.dayCount);
    if ('ontouchstart' in window) {
      document.getElementById('joystick').classList.remove('hidden');
      document.getElementById('jump-btn').classList.remove('hidden');
    }
    this.controller.setEnabled(true);
    this.controller.snapCamera();
    this.state = 'playing';
  }

  // Keep the rim light behind the goblin (relative to the camera), lifted along
  // the local up, aimed at the character — a cool back-rim that pops it out.
  _updateRimLight() {
    if (!this.rimLight) return;
    const p = this.controller.worldPosition;
    const radial = p.clone().normalize();
    const toChar = p.clone().sub(this.camera.position).normalize();
    this.rimLight.position.copy(p).addScaledVector(toChar, 10).addScaledVector(radial, 7);
    this.rimLight.target.position.copy(p);
    this.rimLight.intensity = 0.85;
  }

  _onCollect() {
    this.gems++;
    this.hud.setGems(this.gems);
    this.audio.pickup();
    const milestones = { 5: 'Lovely!', 10: 'Sparkling!', 25: 'Gem master!', 50: 'Legendary!' };
    if (milestones[this.gems]) this.hud.showToast(milestones[this.gems]);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloom) this.bloom.setSize(w, h);
  }

  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    // Stepped clock (~12fps) for a stop-motion judder on ANIMATION only —
    // camera, movement, water and lighting keep using the smooth dt/elapsed.
    const STEP = 1 / 12;
    this._animAccum = (this._animAccum || 0) + dt;
    let animDt = 0;
    while (this._animAccum >= STEP) { this._animAccum -= STEP; this._animElapsed = (this._animElapsed || 0) + STEP; animDt += STEP; }
    const animElapsed = this._animElapsed || 0;

    // "Clay boil": on each stop-motion step, nudge the shared clay textures a
    // hair so every surface's fingerprints subtly re-form — as if hands touched
    // the clay between frames.
    if (animDt > 0) {
      const nt = clayNormalTexture(), at = clayAlbedoTexture();
      nt.center.set(0.5, 0.5);
      nt.offset.set((Math.random() - 0.5) * 0.006, (Math.random() - 0.5) * 0.006);
      nt.rotation = (Math.random() - 0.5) * 0.02;
      at.offset.set((Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.004);
    }

    // world updates — wind sway judders, water/clouds/sun stay smooth
    this.water.update(dt, this.elapsed);
    this.props.update(animDt, animElapsed);
    this.clouds.update(dt);
    this.sky.update(this.elapsed);
    this.dayNight.update(dt);
    updateSun(this.dayNight);          // feed the SSS/translucency shaders
    this.particles.update(dt);
    this.droplets.update(dt);
    if (this.grade) this.grade.uniforms.uTime.value = this.elapsed;

    if (this.state === 'playing') {
      this.controller.update(dt, this.elapsed, animDt, animElapsed);
      this.collectibles.update(animDt, animElapsed, this.controller.worldPosition);
      this._updateRimLight();
      if (this.tiltshift) {
        // keep the sharp focus band pinned to the goblin's screen position
        this._ndc = this._ndc || new THREE.Vector3();
        this._ndc.copy(this.controller.worldPosition).project(this.camera);
        this.tiltshift.setFocus(THREE.MathUtils.clamp(this._ndc.y * 0.5 + 0.5, 0.18, 0.82));
      }
      // periodic HUD time refresh
      this._todAccum = (this._todAccum || 0) + dt;
      if (this._todAccum > 0.5) {
        this._todAccum = 0;
        this.hud.setTime(this.dayNight.label(), this.dayNight.dayCount);
      }
    } else {
      // start-screen: a slow, slightly-elevated turntable of the "set"
      this._introAngle += dt * 0.06;
      const r = CONFIG.planet.radius + 95;
      this.camera.position.set(Math.cos(this._introAngle) * r, 42 + Math.sin(this._introAngle * 0.6) * 8, Math.sin(this._introAngle) * r);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, 0, 0);
      if (this.tiltshift) this.tiltshift.setFocus(0.5); // band across the planet's middle
      this.collectibles.update(animDt, animElapsed, null);
    }

    this.composer.render();
  }
}

const game = new Game();
game.init().catch((err) => {
  console.error(err);
  const t = document.querySelector('.loader-text');
  if (t) t.textContent = 'Something went wrong loading the world. Check the console.';
});
