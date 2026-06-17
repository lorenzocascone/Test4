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
    this.altitude = 0;                      // height above the takeoff ground (can go negative)
    this.grounded = true;
    this.swimming = false;                  // afloat over the ocean
    this.speed01 = 0;                       // normalised speed for animation
    this._stepAccum = 0;
    this._splashAccum = 0;
    this._momentumDir = new THREE.Vector3();// horizontal momentum carried into jumps
    this._momentumSpeed = 0;                // angular speed of that momentum
    this._moveVec = new THREE.Vector3();    // reused scratch for input direction

    // Verticality + smoothing state.
    this._groundRadius = this.planet.radiusAt(this.position);  // smoothed standing radius
    this._smoothNormal = this.planet.normalAt(this.position, CONFIG.player.slopeEps);
    this._jumpBaseRadius = this._groundRadius;
    this._displayRadius = this._groundRadius;
    this._candidatePos = new THREE.Vector3();
    this._cosMaxClimb = Math.cos(THREE.MathUtils.degToRad(CONFIG.player.maxClimbAngle));

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
    // small deadzone so a resting stick / tiny drift doesn't creep
    const mag = Math.hypot(f, s);
    if (mag < 0.15) return null;

    const up = this.position;
    // camera-facing tangent = heading rotated by camYaw around up
    const camFwd = this.heading.clone().applyAxisAngle(up, this.camYaw);
    // screen-right of the camera (cross(viewDir, up)); previously inverted
    const right = new THREE.Vector3().crossVectors(camFwd, up).normalize();
    out.copy(camFwd).multiplyScalar(f).addScaledVector(right, s);
    if (out.lengthSq() < 1e-6) return null;
    // analog magnitude (clamped) so a half-pushed stick walks slower
    this._inputMag = Math.min(mag, 1);
    return out.normalize();
  }

  update(dt, elapsed) {
    const moveDir = this._moveVector(this._moveVec);
    const up = this.position;
    const actualRadius = this.planet.radiusAt(this.position);
    const seaR = this.planet.seaRadius;
    const wasSwimming = this.swimming;
    // Afloat when the ground beneath us is below the sea surface (and not mid-jump).
    this.swimming = this.grounded && actualRadius < seaR - 0.05;
    const sprintMul = this.input.sprint ? CONFIG.player.sprintMultiplier : 1;
    const inputAngSpeed = moveDir ? CONFIG.player.walkSpeed * (this._inputMag || 1) * sprintMul : 0;

    // Decide the direction/speed we actually travel this frame.
    let effDir = null;
    let effAngSpeed = 0;

    if (this.grounded) {
      // Full control on the ground; remember it as momentum for any jump.
      if (moveDir) {
        effDir = moveDir;
        effAngSpeed = inputAngSpeed;
        this._momentumDir.copy(moveDir);
        this._momentumSpeed = inputAngSpeed;
      } else {
        this._momentumSpeed = 0;
      }
    } else if (this._momentumSpeed > 1e-4) {
      // Airborne: keep takeoff momentum. Input may *nudge* the heading a little
      // (limited air control) but can't fully reverse direction or change speed.
      if (moveDir) {
        const steer = Math.min(1, CONFIG.player.airControl * dt);
        this._momentumDir.lerp(moveDir, steer);
        this._momentumDir.addScaledVector(up, -this._momentumDir.dot(up)).normalize();
      }
      effDir = this._momentumDir;
      effAngSpeed = this._momentumSpeed;
    }

    if (effDir && this.enabled) {
      const moveAngSpeed = this.swimming ? effAngSpeed * CONFIG.player.swimFactor : effAngSpeed;
      const ang = moveAngSpeed * dt;
      // candidate next position along the great circle
      const axis = new THREE.Vector3().crossVectors(up, effDir).normalize();
      this._quat.setFromAxisAngle(axis, ang);
      this._candidatePos.copy(this.position).applyQuaternion(this._quat).normalize();

      // Climb limit: block a grounded step that pushes uphill into a too-steep
      // face. Skipped while swimming (the sea surface is flat).
      let blocked = false;
      if (this.grounded && !this.swimming) {
        const candRadius = this.planet.radiusAt(this._candidatePos);
        if (candRadius > actualRadius + 0.02) { // moving uphill
          const candNormal = this.planet.normalAt(this._candidatePos, CONFIG.player.slopeEps);
          if (candNormal.dot(this._candidatePos) < this._cosMaxClimb) blocked = true;
        }
      }

      if (!blocked) {
        this.position.copy(this._candidatePos);
        this.heading.applyQuaternion(this._quat);
        this._momentumDir.applyQuaternion(this._quat);
        this._orthonormalize();
        // face the travel direction (re-projected into the new tangent plane)
        this.facing.copy(effDir).addScaledVector(this.position, -effDir.dot(this.position)).normalize();
        this.speed01 = moveAngSpeed / CONFIG.player.walkSpeed;

        if (this.swimming) {
          // periodic stroke splashes at the waterline
          this._splashAccum += dt * 2.0;
          if (this._splashAccum > 1) {
            this._splashAccum = 0;
            if (this.audio) this.audio.splash();
            if (this._onSplash) this._onSplash(this.position.clone().multiplyScalar(seaR), this.position.clone());
          }
        } else if (this.grounded) {
          // footstep cadence + dust
          this._stepAccum += dt * (4.8 * this.speed01);
          if (this._stepAccum > 1) {
            this._stepAccum = 0;
            if (this.audio) this.audio.footstep();
            if (this._onStep) this._onStep(this._worldPos.clone(), this._smoothNormal.clone());
          }
        }
      } else {
        this.speed01 = 0; // stopped at the foot of the slope
      }
    } else {
      this.speed01 = 0;
    }

    // jump + radial gravity — height is measured from the takeoff ground so the
    // arc is a clean parabola, not a tracing of the terrain passing underneath.
    if (this.input.jumpQueued && this.grounded && !this.swimming) {
      this.jumpVel = CONFIG.player.jumpStrength;
      this.grounded = false;
      this._jumpBaseRadius = this._groundRadius;
      if (this.audio) this.audio.jump();
    }
    this.input.jumpQueued = false;

    const k = dt > 0 ? 1 - Math.exp(-CONFIG.player.groundStiffness * dt) : 1;
    if (this.grounded) {
      // ease standing height toward terrain; while swimming, float at the sea
      // surface but ride higher than the floor in the shallows (wading).
      let target = actualRadius;
      if (this.swimming) {
        target = Math.max(seaR - CONFIG.player.swimSink, actualRadius + CONFIG.player.wadeClear);
      }
      this._groundRadius += (target - this._groundRadius) * k;
      this.altitude = 0;
    } else {
      this.jumpVel -= CONFIG.player.gravity * dt;
      this.altitude += this.jumpVel * dt; // may go negative when falling into a dip
      const airRadius = this._jumpBaseRadius + this.altitude;
      // over water you land on the surface, not the deep sea floor
      const landRadius = actualRadius < seaR ? seaR : actualRadius;
      if (this.jumpVel <= 0 && airRadius <= landRadius) {
        // landed — snap onto whatever we actually met (ledge, valley, or sea)
        this.grounded = true;
        this.jumpVel = 0;
        this.altitude = 0;
        this._groundRadius = landRadius;
      }
    }
    this._displayRadius = this.grounded ? this._groundRadius : (this._jumpBaseRadius + this.altitude);
    if (this.swimming) this._displayRadius += Math.sin(elapsed * 2.2) * CONFIG.player.swimBob;

    // splash + sound the moment we wade in
    if (this.swimming && !wasSwimming) {
      if (this.audio) this.audio.splash();
      if (this._onSplash) this._onSplash(this.position.clone().multiplyScalar(seaR), this.position.clone());
    }

    // smooth the up-vector toward the macro surface normal (ignores facets)
    const targetNormal = this.planet.normalAt(this.position, CONFIG.player.slopeEps);
    this._smoothNormal.lerp(targetNormal, k).normalize();

    this._syncTransform(dt);
    this.character.update(dt, elapsed, this.speed01, this.swimming);
    this._updateCamera(dt);
  }

  _syncTransform(dt) {
    // Standing/airborne world position uses the smoothed display radius, so the
    // character (and the camera that follows it) glide instead of riding bumps.
    this._worldPos.copy(this.position).multiplyScalar(this._displayRadius);
    this.character.root.position.copy(this._worldPos);

    // orient body: up = radial (gravity), face = facing tangent — the character
    // stands upright relative to the globe centre, like the trees, instead of
    // tilting to the ground slope. Frame-rate-independent slerp avoids snapping.
    alignToNormal(this.position, this.facing, this._targetQuat);
    if (dt > 0) {
      const t = 1 - Math.exp(-CONFIG.player.turnSpeed * dt);
      this.character.root.quaternion.slerp(this._targetQuat, t);
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
    // exponential smoothing — independent of framerate, no stutter on mobile
    const t = dt > 0 ? 1 - Math.exp(-CONFIG.camera.followStiffness * dt) : 1;
    this.camera.position.lerp(this._desiredCam, t);
    this._camTarget.copy(this._worldPos).addScaledVector(this.position, CONFIG.player.eyeHeight);
    this.camera.up.copy(this.position);
    this.camera.lookAt(this._camTarget);
  }

  snapCamera() {
    // Re-seat the smoothing state on the current (possibly just-set) position so
    // there's no first-frame pop after a respawn.
    this.grounded = true;
    this.swimming = false;
    this.altitude = 0;
    this.jumpVel = 0;
    this._groundRadius = this.planet.radiusAt(this.position);
    this._jumpBaseRadius = this._groundRadius;
    this._displayRadius = this._groundRadius;
    this._smoothNormal.copy(this.planet.normalAt(this.position, CONFIG.player.slopeEps));
    this._syncTransform(0);
    this._computeDesiredCamera(this._desiredCam);
    this.camera.position.copy(this._desiredCam);
    this._camTarget.copy(this._worldPos).addScaledVector(this.position, CONFIG.player.eyeHeight);
    this.camera.up.copy(this.position);
    this.camera.lookAt(this._camTarget);
  }

  get worldPosition() { return this._worldPos; }
  get surfaceNormal() { return this._smoothNormal; }
  onStep(fn) { this._onStep = fn; }
  onSplash(fn) { this._onSplash = fn; }
}
