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
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CONFIG } from './config.js';
import { randSeed } from './utils/noise.js';
import { Planet } from './world/planet.js';
import { Water } from './world/water.js';
import { Props } from './world/props.js';
import { Clouds } from './world/clouds.js';
import { Sky } from './world/sky.js';
import { DayNight } from './systems/dayNight.js';
import { Particles } from './systems/particles.js';
import { Collectibles } from './systems/collectibles.js';
import { Audio } from './systems/audio.js';
import { Character } from './player/character.js';
import { Controller } from './player/controller.js';
import { HUD } from './ui/hud.js';
import { Customizer } from './ui/customize.js';

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
    this._setupPostFX();
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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').appendChild(this.renderer.domElement);
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#cfeafe', 0.0028);
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.5, 1200);
    this.camera.position.set(0, 30, 60);
  }

  // Build the world in small steps so the loader can animate.
  async _buildWorld() {
    const step = (p, text) => new Promise((r) => { this._setLoader(p, text); requestAnimationFrame(() => setTimeout(r, 16)); });

    const seed = randSeed();
    // Lighter terrain mesh on mobile (same shape, fewer facets) to keep it smooth.
    if (this.isMobile) CONFIG.planet.detail = 46;
    await step(0.1, 'Sculpting continents…');
    this.planet = new Planet(seed);
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

    await step(1.0, 'Ready!');
  }

  _setupPostFX() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55,   // strength
      0.7,    // radius
      0.72    // threshold — only bright things (gems, sun, water highlights) glow
    );
    this.composer.addPass(this.bloom);

    // SMAA is the priciest pass — skip it on mobile for a stable framerate.
    if (!this.isMobile) {
      this.composer.addPass(new SMAAPass(window.innerWidth * this.renderer.getPixelRatio(), window.innerHeight * this.renderer.getPixelRatio()));
    }
    this.composer.addPass(new OutputPass());
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

    this.controller = new Controller(this.planet, this.character, this.camera, this.renderer.domElement, null);
    this.controller.position.copy(this._findSpawn());
    this.controller.heading.set(1, 0, 0);
    this.controller._orthonormalize();
    this.controller.facing.copy(this.controller.heading);
    this.controller.snapCamera();
    this.controller.onStep((pos, normal) => this.particles.dust(pos, normal));
    this.controller.onSplash((pos, up) => this.particles.splash(pos, up));

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

    // world updates
    this.water.update(dt, this.elapsed);
    this.props.update(dt, this.elapsed);
    this.clouds.update(dt);
    this.sky.update(this.elapsed);
    this.dayNight.update(dt);
    this.particles.update(dt);

    if (this.state === 'playing') {
      this.controller.update(dt, this.elapsed);
      this.collectibles.update(dt, this.elapsed, this.controller.worldPosition);
      // periodic HUD time refresh
      this._todAccum = (this._todAccum || 0) + dt;
      if (this._todAccum > 0.5) {
        this._todAccum = 0;
        this.hud.setTime(this.dayNight.label(), this.dayNight.dayCount);
      }
    } else {
      // start-screen slow orbit of the planet
      this._introAngle += dt * 0.12;
      const r = CONFIG.planet.radius + 34;
      this.camera.position.set(Math.cos(this._introAngle) * r, 14 + Math.sin(this._introAngle * 0.6) * 6, Math.sin(this._introAngle) * r);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, 0, 0);
      this.collectibles.update(dt, this.elapsed, null);
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
