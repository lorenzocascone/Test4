// ----------------------------------------------------------------------------
// A cute low-poly wanderer built from primitives. Named parts drive a procedural
// walk animation (limb swing + body bob) and the customizer (body/accent/hat).
// The model stands on +Y and faces +Z so it slots into alignToNormal cleanly.
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { clayNormalTexture, clayRoughnessTexture, clayAlbedoTexture } from '../utils/textures.js';
import { moldGeometry } from '../utils/geometry.js';
import { applyTranslucency } from '../utils/shaders.js';

// hand-mold a primitive into lumpy clay (one-time at build)
const mold = (g, amp) => moldGeometry(g, { amp, freq: 5, seed: Math.random() * 1000 });

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'character';

    // Rig pivot so the whole body can bob without affecting placement.
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    const ns = new THREE.Vector2(0.42, 0.42);
    // Soft felt/clay skin — physical sheen + faint clearcoat (oily handled clay),
    // a subsurface glow so light bleeds through thin ears/nose, plus the kneaded
    // albedo + roughness micro-detail.
    this.bodyMat = new THREE.MeshPhysicalMaterial({
      color: '#8ab84e', roughness: 0.8, metalness: 0, envMapIntensity: 0.4,
      sheen: 0.6, sheenRoughness: 0.85, sheenColor: new THREE.Color('#ffffff'),
      clearcoat: 0.3, clearcoatRoughness: 0.55,
      normalMap: clayNormalTexture(), normalScale: ns,
      roughnessMap: clayRoughnessTexture(), map: clayAlbedoTexture(),
    });
    applyTranslucency(this.bodyMat, { thickness: 0.6, power: 2.5 });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: '#7a4a2b', roughness: 0.85, metalness: 0, envMapIntensity: 0.35,
      normalMap: clayNormalTexture(), normalScale: ns,
      roughnessMap: clayRoughnessTexture(), map: clayAlbedoTexture(),
    });
    this.skinMat = new THREE.MeshStandardMaterial({ color: '#ffe0bd', roughness: 0.85 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.25 });

    this._build();
    this.hatType = 'none';
  }

  _build() {
    const skin = this.bodyMat;
    const cloth = this.accentMat;
    const blob = (r, amp = 0.012) => mold(new THREE.IcosahedronGeometry(r, 2), amp);

    // --- Torso: short, round, potato body (squat) --------------------------
    const torsoProfile = [
      [0.02, 0.00], [0.27, 0.03], [0.40, 0.16], [0.43, 0.34],
      [0.37, 0.52], [0.27, 0.64], [0.16, 0.72],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    this.body = new THREE.Mesh(mold(new THREE.LatheGeometry(torsoProfile, 22), 0.016), skin);
    this.body.position.y = 0.44;          // hips ~0.44 → shoulders ~1.16
    this.body.rotation.x = 0.05;          // gentle slump
    this.body.castShadow = true;
    this.rig.add(this.body);

    // Loincloth + a soft neck that joins head to body.
    const cloth1 = new THREE.Mesh(mold(new THREE.CylinderGeometry(0.3, 0.4, 0.3, 18), 0.008), cloth);
    cloth1.position.y = 0.5; cloth1.castShadow = true;
    this.rig.add(cloth1);
    const neck = new THREE.Mesh(blob(0.2), skin);
    neck.scale.set(1, 0.7, 1); neck.position.y = 1.22; neck.castShadow = true;
    this.rig.add(neck);

    // --- Head: a big goblin skull — wide crown, broad heavy jaw -------------
    this.head = new THREE.Group();
    this.head.position.y = 1.5;
    this.rig.add(this.head);
    this.headBaseY = 1.5;

    const skull = new THREE.Mesh(blob(0.52, 0.02), skin);
    skull.scale.set(1.16, 0.94, 1.0);            // wide & a touch flat (pear-ish)
    skull.castShadow = true;
    this.head.add(skull);
    // broad, heavy goblin jaw jutting forward (underbite)
    const jaw = new THREE.Mesh(blob(0.34, 0.016), skin);
    jaw.scale.set(1.25, 0.6, 1.05); jaw.position.set(0, -0.26, 0.12);
    jaw.castShadow = true;
    this.head.add(jaw);
    // round cheeks
    const cheekL = new THREE.Mesh(blob(0.2), skin); cheekL.position.set(-0.3, -0.14, 0.2);
    const cheekR = new THREE.Mesh(blob(0.2), skin); cheekR.position.set(0.3, -0.14, 0.2);
    cheekL.castShadow = cheekR.castShadow = true;
    this.head.add(cheekL, cheekR);
    // heavy, low brow ridge for a scowl
    const brow = new THREE.Mesh(blob(0.17), skin);
    brow.scale.set(2.4, 0.6, 0.85); brow.position.set(0, 0.1, 0.36);
    this.head.add(brow);

    // Big soft-pointed ears, swept out and back.
    const ear = () => { const e = new THREE.Mesh(blob(0.2, 0.014), skin); e.castShadow = true; return e; };
    const earL = ear(), earR = ear();
    earL.scale.set(0.5, 1.55, 0.42); earL.position.set(-0.55, 0.13, -0.06); earL.rotation.set(-0.25, 0, 0.7);
    earR.scale.set(0.5, 1.55, 0.42); earR.position.set(0.55, 0.13, -0.06); earR.rotation.set(-0.25, 0, -0.7);
    this.head.add(earL, earR);

    // Bulbous, slightly hooked nose (main bulb + a drooping tip).
    const nose = new THREE.Mesh(blob(0.16), skin);
    nose.scale.set(0.95, 0.9, 1.2); nose.position.set(0, -0.02, 0.48);
    nose.castShadow = true;
    const noseTip = new THREE.Mesh(blob(0.11), skin);
    noseTip.scale.set(0.9, 0.8, 1.0); noseTip.position.set(0, -0.13, 0.52); // droop → hook
    this.head.add(nose, noseTip);

    // Eyes — beady, set low under the heavy brow.
    const scleraMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.4, emissive: '#5a4000', emissiveIntensity: 0.3 });
    const makeEye = (x) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 14), scleraMat));
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), this.eyeMat);
      pupil.position.z = 0.075;
      g.add(pupil);
      g.position.set(x, 0.0, 0.41);
      return g;
    };
    this.eyeL = makeEye(-0.17);
    this.eyeR = makeEye(0.17);
    this.head.add(this.eyeL, this.eyeR);

    // Wider mouth + crooked tusks and a lower tooth.
    const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.24, 3, 6), this.eyeMat);
    mouth.rotation.z = Math.PI / 2; mouth.position.set(0, -0.3, 0.42);
    this.head.add(mouth);
    const toothMat = new THREE.MeshStandardMaterial({ color: '#fffdf0', roughness: 0.5 });
    const tooth = (r) => new THREE.Mesh(mold(new THREE.IcosahedronGeometry(r, 2), 0.004), toothMat);
    const tuskL = tooth(0.055), tuskR = tooth(0.055);
    tuskL.position.set(-0.085, -0.25, 0.46); tuskL.scale.y = 1.4;
    tuskR.position.set(0.085, -0.25, 0.46); tuskR.scale.y = 1.4;
    const lowTooth = tooth(0.035);
    lowTooth.position.set(0.02, -0.36, 0.44);
    this.head.add(tuskL, tuskR, lowTooth);

    // --- Arms: clearly-readable limbs (slim upper + forearm + small hand) ---
    const buildArm = (side) => {
      const shoulder = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.26, 4, 10), skin);
      upper.position.y = -0.19; upper.castShadow = true;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.36;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 4, 10), skin);
      fore.position.y = -0.16; fore.castShadow = true;
      const hand = new THREE.Mesh(blob(0.12), skin);
      hand.scale.set(1, 0.92, 0.85); hand.position.y = -0.34; hand.castShadow = true;
      elbow.add(fore, hand);
      shoulder.add(elbow);

      shoulder.position.set(side * 0.4, 1.05, 0);
      return { shoulder, elbow };
    };
    const aL = buildArm(-1), aR = buildArm(1);
    this.armL = aL.shoulder; this._elbowL = aL.elbow;
    this.armR = aR.shoulder; this._elbowR = aR.elbow;
    this.rig.add(this.armL, this.armR);
    // deltoid blobs (static on the torso) bridge shoulder → body so the arms
    // don't read as disconnected.
    [-1, 1].forEach((side) => {
      const d = new THREE.Mesh(blob(0.15), skin);
      d.position.set(side * 0.37, 1.05, 0); d.castShadow = true;
      this.rig.add(d);
    });

    // --- Legs: little stubby legs with rounded feet ------------------------
    const buildLeg = (side) => {
      const hip = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.1, 4, 10), skin);
      thigh.position.y = -0.13; thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.2;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.06, 4, 10), skin);
      shin.position.y = -0.1; shin.castShadow = true;
      const foot = new THREE.Mesh(mold(new THREE.CapsuleGeometry(0.12, 0.13, 4, 8), 0.01), skin);
      foot.rotation.z = Math.PI / 2; foot.scale.set(1, 1, 0.85);
      foot.position.set(0, -0.2, 0.05); foot.castShadow = true;
      knee.add(shin, foot);
      hip.add(knee);

      hip.position.set(side * 0.17, 0.48, 0);
      return { hip, knee };
    };
    const lL = buildLeg(-1), lR = buildLeg(1);
    this.legL = lL.hip; this._kneeL = lL.knee;
    this.legR = lR.hip; this._kneeR = lR.knee;
    this.rig.add(this.legL, this.legR);

    // Hat slot — seated down into the (bigger) head crown; scaled up to fit it.
    this.hatSlot = new THREE.Group();
    this.hatSlot.position.y = 0.3;
    this.hatSlot.scale.setScalar(1.2);
    this.head.add(this.hatSlot);

    this._blink = 0;
    this._blinkTimer = 2 + Math.random() * 3;
    this.walkPhase = 0;
    this.swimPhase = 0;
  }

  setBodyColor(hex) { this.bodyMat.color.set(hex); }
  setAccentColor(hex) { this.accentMat.color.set(hex); }

  setHat(type) {
    this.hatType = type;
    while (this.hatSlot.children.length) this.hatSlot.remove(this.hatSlot.children[0]);
    if (type === 'none') return;
    const accent = this.accentMat;
    let hat;
    if (type === 'cap') {
      hat = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 14, 1, false, 0, Math.PI), accent);
      brim.position.set(0, 0.0, 0.32);
      hat.add(dome, brim);
    } else if (type === 'cone') {
      hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 12), accent);
      hat.position.y = 0.4;
    } else if (type === 'crown') {
      hat = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 18), new THREE.MeshStandardMaterial({ color: '#ffd166', metalness: 0.5, roughness: 0.3, emissive: '#7a5a00', emissiveIntensity: 0.3 }));
      hat.position.y = 0.18;
    } else if (type === 'leaf') {
      hat = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), new THREE.MeshStandardMaterial({ color: '#5bbf5a' }));
        leaf.position.y = 0.2;
        leaf.rotation.z = (i - 1) * 0.5;
        leaf.rotation.x = -0.3;
        hat.add(leaf);
      }
    }
    if (hat) { hat.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.hatSlot.add(hat); }
  }

  // `speed` is the movement factor (0 idle, ≈1 walk, ≈2 run). Drives the walk
  // cycle: stride cadence is proportional to speed so footfalls match the
  // ground (no sliding), while swing amplitude is capped.
  update(dt, elapsed, speed, swimming = false) {
    const amp = Math.min(speed, 1);

    if (swimming) {
      // Swim pose: body pitched forward and bobbing, arms doing an alternating
      // crawl stroke, legs flutter-kicking. Animates even while floating still.
      this.swimPhase += dt * 6;
      const p = this.swimPhase;
      const a = Math.sin(p);
      this.rig.rotation.x = 0.4;
      this.rig.position.y = Math.sin(p) * 0.04;
      this.armL.rotation.x = -1.2 + a * 0.9;     // reach forward / pull back
      this.armR.rotation.x = -1.2 - a * 0.9;
      this.armL.rotation.z = 0.3;
      this.armR.rotation.z = -0.3;
      this._elbowL.rotation.x = -(0.6 + Math.max(0, a) * 0.5);
      this._elbowR.rotation.x = -(0.6 + Math.max(0, -a) * 0.5);
      const kick = Math.sin(p * 2);
      this.legL.rotation.x = kick * 0.3;
      this.legR.rotation.x = -kick * 0.3;
      this._kneeL.rotation.x = 0.2 + Math.max(0, kick) * 0.3;
      this._kneeR.rotation.x = 0.2 + Math.max(0, -kick) * 0.3;
    } else {
    // advance the stride phase by cadence ∝ speed (constant stride length)
    this.walkPhase += dt * 15 * speed;
    const sw = Math.sin(this.walkPhase);

    // LEGS: alternating hip swing, with the knee flexing during the forward
    // (foot-lift) half of each leg's cycle so the gait isn't stiff-legged.
    this.legL.rotation.x = sw * 0.7 * amp;
    this.legR.rotation.x = -sw * 0.7 * amp;
    this._kneeL.rotation.x = 0.05 + Math.max(0, sw) * 0.95 * amp;   // flex shin back
    this._kneeR.rotation.x = 0.05 + Math.max(0, -sw) * 0.95 * amp;

    // ARMS: opposite swing to the legs, with a relaxed, pumping elbow.
    // idle arm sway so he's not dead-still; splayed out to clear the wide belly
    const idle = Math.sin(elapsed * 1.6) * 0.06 * (1 - amp);
    this.armL.rotation.x = -sw * 0.5 * amp + idle;
    this.armR.rotation.x = sw * 0.5 * amp - idle;
    this.armL.rotation.z = 0.58;
    this.armR.rotation.z = -0.58;
    this._elbowL.rotation.x = -(0.3 + Math.max(0, -sw) * 0.55 * amp); // bend forward
    this._elbowR.rotation.x = -(0.3 + Math.max(0, sw) * 0.55 * amp);

    // body bob & lean
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.12 * amp;
    this.rig.position.y = bob;
    this.rig.rotation.x = amp * 0.06; // lean into the walk
    }
    // gentle idle breathing
    const breathe = Math.sin(elapsed * 2) * 0.02 * (1 - amp);
    this.head.position.y = this.headBaseY + breathe;

    // blinking
    this._blinkTimer -= dt;
    if (this._blinkTimer <= 0) { this._blink = 0.12; this._blinkTimer = 2 + Math.random() * 3; }
    if (this._blink > 0) {
      this._blink -= dt;
      const sy = Math.max(0.1, this._blink / 0.12);
      this.eyeL.scale.y = sy; this.eyeR.scale.y = sy;
    } else {
      this.eyeL.scale.y = 1; this.eyeR.scale.y = 1;
    }
  }
}
