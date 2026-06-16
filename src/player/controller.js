// ----------------------------------------------------------------------------
// Player controller: walking on the surface of a sphere with a smooth follow
// camera. Position is a unit direction; movement rotates it along great circles,
// and a parallel-transported "heading" keeps controls camera-relative and
// pole-safe. Handles keyboard, mouse-look (pointer lock) and touch joystick.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { alignToNormal, clamp } from '../utils/math.js';

export class Controller {
  constructor(planet, character, camera, domElement, audio) {
    this.planet = planet;
    this.character = character;
    this.camera = camera;
    this.dom = domElement;
    this.audio = audio;

    // Location on the unit sphere, and a tangent heading carried with us.
    this.position = new THREE.Vector3(0, 1, 0.0001).normalize();
    this.heading = new THREE.Vector3(0, 0, 1);
    this._orthonormalize();

    this.facing = this.heading.clone();   // where the body points (slerped)
    this.camYaw = 0;                        // extra camera yaw from the mouse
    this.camPitch = 0.18;                   // camera pitch (radians)
    this.jumpVel = 0;
    this.altitude = 0;                      // height above the terrain
    this.grounded = true;
    this.speed01 = 0;                       // normalised speed for animation
    this._stepAccum = 0;

    this.input = { f: 0, s: 0, sprint: false, jumpQueued: false };
    this.touch = { active: false, x: 0, y: 0 };
    this.enabled = false;

    this._worldPos = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._targetQuat = new THREE.Quaternion();
    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._desiredCam = new THREE.Vector3();

    this._bindInput();
    this._syncTransform(0);
    this.snapCamera();
  }

  // keep heading perpendicular to position (tangent) and unit length
  _orthonormalize() {
    const up = this.position;
    this.heading.addScaledVector(up, -this.heading.dot(up)).normalize();
    if (this.heading.lengthSq() < 1e-6) {
      this.heading.set(1, 0, 0).addScaledVector(up, -up.x).normalize();
    }
  }

  _bindInput() {
    const keymap = {
      KeyW: ['f', 1], ArrowUp: ['f', 1],
      KeyS: ['f', -1], ArrowDown: ['f', -1],
      KeyA: ['s', -1], ArrowLeft: ['s', -1],
      KeyD: ['s', 1], ArrowRight: ['s', 1],
    };
    this._keysDown = new Set();

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.input.sprint = true;
      if (e.code === 'Space') { this.input.jumpQueued = true; e.preventDefault(); }
      if (keymap[e.code]) { this._keysDown.add(e.code); this._recomputeKeys(keymap); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.input.sprint = false;
      if (keymap[e.code]) { this._keysDown.delete(e.code); this._recomputeKeys(keymap); }
    });

    // Mouse look via pointer lock.
    this.dom.addEventListener('click', () => {
      if (this.enabled && document.pointerLockElement !== this.dom) this.dom.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.dom) {
        this.camYaw -= e.movementX * CONFIG.camera.lookSensitivity;
        this.camPitch = clamp(this.camPitch - e.movementY * CONFIG.camera.lookSensitivity, -0.5, 0.9);
      }
    });

    // Touch joystick (mobile).
    const joy = document.getElementById('joystick');
    const thumb = document.getElementById('joystick-thumb');
    if (joy) {
      const radius = 50;
      const onMove = (cx, cy, rect) => {
        let dx = cx - (rect.left + rect.width / 2);
        let dy = cy - (rect.top + rect.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        const cl = Math.min(len, radius);
        dx = (dx / len) * cl; dy = (dy / len) * cl;
        thumb.style.transform = `translate(${dx}px, ${dy}px)`;
        this.touch.active = true;
        this.touch.x = dx / radius;
        this.touch.y = -dy / radius;
      };
      joy.addEventListener('touchstart', (e) => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY, joy.getBoundingClientRect()); }, { passive: false });
      joy.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY, joy.getBoundingClientRect()); }, { passive: false });
      joy.addEventListener('touchend', (e) => { e.preventDefault(); this.touch.active = false; this.touch.x = 0; this.touch.y = 0; thumb.style.transform = 'translate(0,0)'; }, { passive: false });
    }
    const jumpBtn = document.getElementById('jump-btn');
    if (jumpBtn) jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.input.jumpQueued = true; }, { passive: false });

    // Drag-to-look on touch (right half of screen).
    let lastTouch = null;
    window.addEventListener('touchstart', (e) => {
      const t = e.touches[e.touches.length - 1];
      if (t && t.clientX > window.innerWidth / 2) lastTouch = { x: t.clientX, y: t.clientY };
    });
    window.addEventListener('touchmove', (e) => {
      if (!lastTouch) return;
      const t = [...e.touches].find(tt => tt.clientX > window.innerWidth / 2);
      if (!t) return;
      this.camYaw -= (t.clientX - lastTouch.x) * 0.006;
      this.camPitch = clamp(this.camPitch - (t.clientY - lastTouch.y) * 0.006, -0.5, 0.9);
      lastTouch = { x: t.clientX, y: t.clientY };
    });
    window.addEventListener('touchend', () => { lastTouch = null; });
  }

  _recomputeKeys(keymap) {
    let f = 0, s = 0;
    for (const code of this._keysDown) {
      const [axis, val] = keymap[code];
      if (axis === 'f') f += val; else s += val;
    }
    this.input.f = clamp(f, -1, 1);
    this.input.s = clamp(s, -1, 1);
  }

  setEnabled(v) { this.enabled = v; }

  // Build a camera-relative tangent move direction from current input.
  _moveVector(out) {
    let f = this.input.f, s = this.input.s;
    if (this.touch.active) { f = this.touch.y; s = this.touch.x; }
    if (Math.abs(f) < 0.01 && Math.abs(s) < 0.01) return null;

    const up = this.position;
    // camera-facing tangent = heading rotated by camYaw around up
    const camFwd = this.heading.clone().applyAxisAngle(up, this.camYaw);
    const right = new THREE.Vector3().crossVectors(up, camFwd).normalize();
    out.copy(camFwd).multiplyScalar(f).addScaledVector(right, s);
    if (out.lengthSq() < 1e-6) return null;
    return out.normalize();
  }

  update(dt, elapsed) {
    const moveDir = this._moveVector(new THREE.Vector3());
    const up = this.position;

    if (moveDir && this.enabled) {
      const sprint = this.input.sprint ? CONFIG.player.sprintMultiplier : 1;
      const ang = CONFIG.player.walkSpeed * sprint * dt;
      // rotate position & heading forward along the great circle toward moveDir
      const axis = new THREE.Vector3().crossVectors(up, moveDir).normalize();
      this._quat.setFromAxisAngle(axis, ang);
      this.position.applyQuaternion(this._quat).normalize();
      this.heading.applyQuaternion(this._quat);
      this._orthonormalize();

      // face the travel direction (re-evaluate moveDir in the new frame)
      this.facing.copy(moveDir).addScaledVector(this.position, -moveDir.dot(this.position)).normalize();
      this.speed01 = sprint;

      // footstep cadence + dust
      this._stepAccum += dt * (this.input.sprint ? 11 : 8);
      if (this._stepAccum > 1 && this.grounded) {
        this._stepAccum = 0;
        if (this.audio) this.audio.footstep();
        if (this._onStep) this._onStep(this._worldPos.clone(), this._normal.clone());
      }
    } else {
      this.speed01 = 0;
    }

    // jump + radial gravity
    if (this.input.jumpQueued && this.grounded) {
      this.jumpVel = CONFIG.player.jumpStrength;
      this.grounded = false;
      if (this.audio) this.audio.jump();
    }
    this.input.jumpQueued = false;
    if (!this.grounded) {
      this.jumpVel -= CONFIG.player.gravity * dt;
      this.altitude += this.jumpVel * dt;
      if (this.altitude <= 0) { this.altitude = 0; this.jumpVel = 0; this.grounded = true; }
    }

    this._syncTransform(dt);
    this.character.update(dt, elapsed, this.speed01);
    this._updateCamera(dt);
  }

  _syncTransform(dt) {
    // world position on (or above) the terrain
    this.planet.surfacePoint(this.position, this._worldPos);
    this._normal.copy(this.planet.normalAt(this.position, 0.02));
    const standPos = this._worldPos.clone().addScaledVector(this._normal, this.altitude);
    this.character.root.position.copy(standPos);

    // orient body: up = terrain normal, face = facing tangent
    alignToNormal(this._normal, this.facing, this._targetQuat);
    if (dt > 0) {
      this.character.root.quaternion.slerp(this._targetQuat, Math.min(1, CONFIG.player.turnSpeed * dt));
    } else {
      this.character.root.quaternion.copy(this._targetQuat);
    }
  }

  _computeDesiredCamera(out) {
    const up = this.position;
    const camFwd = this.heading.clone().applyAxisAngle(up, this.camYaw);
    // behind the player along camFwd, lifted by pitch
    const back = camFwd.clone().multiplyScalar(-CONFIG.camera.distance);
    const lift = up.clone().multiplyScalar(CONFIG.camera.height + this.camPitch * 6);
    out.copy(this._worldPos).add(back).add(lift);
    return out;
  }

  _updateCamera(dt) {
    this._computeDesiredCamera(this._desiredCam);
    this.camera.position.lerp(this._desiredCam, dt > 0 ? CONFIG.camera.damping * 12 * Math.min(dt, 0.05) / 0.05 : 1);
    this._camTarget.copy(this._worldPos).addScaledVector(this.position, CONFIG.player.eyeHeight);
    this.camera.up.copy(this.position);
    this.camera.lookAt(this._camTarget);
  }

  snapCamera() {
    this._syncTransform(0);
    this._computeDesiredCamera(this._desiredCam);
    this.camera.position.copy(this._desiredCam);
    this._camTarget.copy(this._worldPos).addScaledVector(this.position, CONFIG.player.eyeHeight);
    this.camera.up.copy(this.position);
    this.camera.lookAt(this._camTarget);
  }

  get worldPosition() { return this._worldPos; }
  get surfaceNormal() { return this._normal; }
  onStep(fn) { this._onStep = fn; }
}
