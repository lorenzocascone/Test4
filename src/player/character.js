// ----------------------------------------------------------------------------
// A cute low-poly wanderer built from primitives. Named parts drive a procedural
// walk animation (limb swing + body bob) and the customizer (body/accent/hat).
// The model stands on +Y and faces +Z so it slots into alignToNormal cleanly.
// ----------------------------------------------------------------------------

import * as THREE from 'three';

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'character';

    // Rig pivot so the whole body can bob without affecting placement.
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    this.bodyMat = new THREE.MeshStandardMaterial({ color: '#8ab84e', flatShading: true, roughness: 0.7 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: '#7a4a2b', flatShading: true, roughness: 0.7 });
    this.skinMat = new THREE.MeshStandardMaterial({ color: '#ffe0bd', flatShading: true, roughness: 0.7 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.3 });

    this._build();
    this.hatType = 'none';
  }

  _build() {
    const skin = this.bodyMat;
    const cloth = this.accentMat;

    // --- Torso: a paunchy, slightly hunched goblin belly (lathe profile) ----
    const torsoProfile = [
      [0.02, 0.00], [0.30, 0.02], [0.42, 0.18], [0.40, 0.42],
      [0.31, 0.66], [0.22, 0.82], [0.12, 0.90],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const torsoGeo = new THREE.LatheGeometry(torsoProfile, 14);
    this.body = new THREE.Mesh(torsoGeo, skin);
    this.body.position.y = 0.62;
    this.body.rotation.x = 0.12;        // slight forward hunch
    this.body.castShadow = true;
    this.rig.add(this.body);

    // Loincloth around the hips (accent / clothing colour)
    const cloth1 = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.40, 0.34, 12), cloth);
    cloth1.position.y = 0.6;
    cloth1.castShadow = true;
    this.rig.add(cloth1);
    // A simple shoulder strap across the chest
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 6, 16), cloth);
    strap.position.set(0, 1.12, 0);
    strap.rotation.set(1.3, 0, 0.5);
    this.rig.add(strap);

    // --- Head group (carries face features + hat, bobs while breathing) -----
    this.head = new THREE.Group();
    this.head.position.y = 1.72;
    this.rig.add(this.head);
    this.headBaseY = 1.72;

    const skullGeo = new THREE.IcosahedronGeometry(0.42, 2);
    const skull = new THREE.Mesh(skullGeo, skin);
    skull.scale.set(1.05, 0.95, 1.0);
    skull.castShadow = true;
    this.head.add(skull);
    // Jaw — pushes the lower face forward for an underbite
    const jaw = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), skin);
    jaw.scale.set(1.0, 0.6, 1.05);
    jaw.position.set(0, -0.22, 0.08);
    this.head.add(jaw);

    // Pointy goblin ears
    const earGeo = new THREE.ConeGeometry(0.12, 0.5, 6);
    const earL = new THREE.Mesh(earGeo, skin);
    const earR = new THREE.Mesh(earGeo, skin);
    earL.position.set(-0.42, 0.06, -0.04); earL.rotation.set(-0.3, 0, 1.15);
    earR.position.set(0.42, 0.06, -0.04); earR.rotation.set(-0.3, 0, -1.15);
    earL.castShadow = true; earR.castShadow = true;
    this.head.add(earL, earR);

    // Big hooked nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 6), skin);
    nose.position.set(0, -0.04, 0.36);
    nose.rotation.x = Math.PI / 2 + 0.5;
    this.head.add(nose);

    // Heavy brow ridge for a scowl
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.12), skin);
    brow.position.set(0, 0.14, 0.3);
    brow.rotation.x = -0.2;
    this.head.add(brow);

    // Eyes — yellow sclera + dark pupil, grouped so they can blink
    const scleraMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.4, emissive: '#5a4000', emissiveIntensity: 0.3 });
    const makeEye = (x) => {
      const g = new THREE.Group();
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), scleraMat);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), this.eyeMat);
      pupil.position.z = 0.07;
      g.add(sclera, pupil);
      g.position.set(x, 0.04, 0.3);
      return g;
    };
    this.eyeL = makeEye(-0.15);
    this.eyeR = makeEye(0.15);
    this.head.add(this.eyeL, this.eyeR);

    // Mouth + two little tusks (underbite grin)
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), this.eyeMat);
    mouth.position.set(0, -0.2, 0.34);
    this.head.add(mouth);
    const toothMat = new THREE.MeshStandardMaterial({ color: '#fffdf0', roughness: 0.5 });
    const toothGeo = new THREE.ConeGeometry(0.04, 0.12, 5);
    const tuskL = new THREE.Mesh(toothGeo, toothMat);
    const tuskR = new THREE.Mesh(toothGeo, toothMat);
    tuskL.position.set(-0.07, -0.14, 0.35); tuskR.position.set(0.07, -0.14, 0.35);
    this.head.add(tuskL, tuskR);

    // --- Arms: upper arm + forearm hinged at an elbow, hand at the wrist ------
    const buildArm = (side) => {
      const shoulder = new THREE.Group();            // shoulder pivot
      const upperLen = 0.4;
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, upperLen, 3, 8), skin);
      upper.position.y = -upperLen / 2;
      upper.castShadow = true;
      shoulder.add(upper);

      const elbow = new THREE.Group();               // elbow pivot at upper-arm end
      elbow.position.y = -upperLen;
      const foreLen = 0.38;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, foreLen, 3, 8), skin);
      fore.position.y = -foreLen / 2;
      fore.castShadow = true;
      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), skin);
      hand.position.y = -foreLen - 0.05;
      hand.castShadow = true;
      elbow.add(fore, hand);
      shoulder.add(elbow);

      shoulder.position.set(side * 0.42, 1.3, 0);
      return { shoulder, elbow };
    };
    const aL = buildArm(-1), aR = buildArm(1);
    this.armL = aL.shoulder; this._elbowL = aL.elbow;
    this.armR = aR.shoulder; this._elbowR = aR.elbow;
    this.rig.add(this.armL, this.armR);

    // --- Legs: thigh + shin hinged at a knee, flat foot at the ankle ----------
    const buildLeg = (side) => {
      const hip = new THREE.Group();                 // hip pivot
      const thighLen = 0.3;
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, thighLen, 3, 8), skin);
      thigh.position.y = -thighLen / 2;
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();                // knee pivot at thigh end
      knee.position.y = -thighLen;
      const shinLen = 0.24;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, shinLen, 3, 8), skin);
      shin.position.y = -shinLen / 2;
      shin.castShadow = true;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.34), skin);
      foot.position.set(0, -shinLen - 0.04, 0.08);
      foot.castShadow = true;
      knee.add(shin, foot);
      hip.add(knee);

      hip.position.set(side * 0.2, 0.64, 0);
      return { hip, knee };
    };
    const lL = buildLeg(-1), lR = buildLeg(1);
    this.legL = lL.hip; this._kneeL = lL.knee;
    this.legR = lR.hip; this._kneeR = lR.knee;
    this.rig.add(this.legL, this.legR);

    // Hat slot — seated down into the head crown so hats look worn (they
    // intersect the head) rather than perched on the topmost point.
    this.hatSlot = new THREE.Group();
    this.hatSlot.position.y = 0.22;
    this.head.add(this.hatSlot);

    this._blink = 0;
    this._blinkTimer = 2 + Math.random() * 3;
    this.walkPhase = 0;
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
      hat = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 7), new THREE.MeshStandardMaterial({ color: '#ffd166', flatShading: true, metalness: 0.5, roughness: 0.3, emissive: '#7a5a00', emissiveIntensity: 0.3 }));
      hat.position.y = 0.18;
    } else if (type === 'leaf') {
      hat = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), new THREE.MeshStandardMaterial({ color: '#5bbf5a', flatShading: true }));
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
  update(dt, elapsed, speed) {
    const amp = Math.min(speed, 1);
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
    this.armL.rotation.x = -sw * 0.5 * amp;
    this.armR.rotation.x = sw * 0.5 * amp;
    this.armL.rotation.z = 0.16;
    this.armR.rotation.z = -0.16;
    this._elbowL.rotation.x = -(0.3 + Math.max(0, -sw) * 0.55 * amp); // bend forward
    this._elbowR.rotation.x = -(0.3 + Math.max(0, sw) * 0.55 * amp);

    // body bob & lean
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.12 * amp;
    this.rig.position.y = bob;
    this.rig.rotation.x = amp * 0.06; // lean into the walk
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
