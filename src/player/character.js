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

    this.bodyMat = new THREE.MeshStandardMaterial({ color: '#ff8fab', flatShading: true, roughness: 0.7 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: '#3a3a4a', flatShading: true, roughness: 0.6 });
    this.skinMat = new THREE.MeshStandardMaterial({ color: '#ffe0bd', flatShading: true, roughness: 0.7 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.3 });

    this._build();
    this.hatType = 'none';
  }

  _build() {
    // Body — a rounded capsule-ish torso.
    const bodyGeo = new THREE.CapsuleGeometry(0.5, 0.5, 4, 10);
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.position.y = 1.0;
    this.body.castShadow = true;
    this.rig.add(this.body);

    // Head.
    const headGeo = new THREE.SphereGeometry(0.45, 18, 16);
    this.head = new THREE.Mesh(headGeo, this.bodyMat);
    this.head.position.y = 1.85;
    this.head.castShadow = true;
    this.rig.add(this.head);

    // Eyes.
    const eyeGeo = new THREE.SphereGeometry(0.08, 10, 10);
    this.eyeL = new THREE.Mesh(eyeGeo, this.eyeMat);
    this.eyeR = new THREE.Mesh(eyeGeo, this.eyeMat);
    this.eyeL.position.set(-0.16, 1.9, 0.4);
    this.eyeR.position.set(0.16, 1.9, 0.4);
    this.rig.add(this.eyeL, this.eyeR);

    // Cheeks (accent blush).
    const cheekGeo = new THREE.SphereGeometry(0.07, 8, 8);
    const cheekMat = new THREE.MeshStandardMaterial({ color: '#ff9ec7', roughness: 0.8, transparent: true, opacity: 0.6 });
    const cheekL = new THREE.Mesh(cheekGeo, cheekMat);
    const cheekR = new THREE.Mesh(cheekGeo, cheekMat);
    cheekL.position.set(-0.3, 1.78, 0.36);
    cheekR.position.set(0.3, 1.78, 0.36);
    cheekL.scale.set(1, 0.7, 0.5); cheekR.scale.set(1, 0.7, 0.5);
    this.rig.add(cheekL, cheekR);

    // Arms — pivot at the shoulder so they can swing.
    const armGeo = new THREE.CapsuleGeometry(0.13, 0.45, 3, 8);
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    const armMeshL = new THREE.Mesh(armGeo, this.bodyMat);
    const armMeshR = new THREE.Mesh(armGeo, this.bodyMat);
    armMeshL.position.y = -0.3; armMeshR.position.y = -0.3;
    armMeshL.castShadow = true; armMeshR.castShadow = true;
    this.armL.add(armMeshL); this.armR.add(armMeshR);
    this.armL.position.set(-0.6, 1.25, 0);
    this.armR.position.set(0.6, 1.25, 0);
    this.rig.add(this.armL, this.armR);

    // Legs — pivot at the hip.
    const legGeo = new THREE.CapsuleGeometry(0.16, 0.4, 3, 8);
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    const legMeshL = new THREE.Mesh(legGeo, this.accentMat);
    const legMeshR = new THREE.Mesh(legGeo, this.accentMat);
    legMeshL.position.y = -0.3; legMeshR.position.y = -0.3;
    legMeshL.castShadow = true; legMeshR.castShadow = true;
    this.legL.add(legMeshL); this.legR.add(legMeshR);
    this.legL.position.set(-0.22, 0.55, 0);
    this.legR.position.set(0.22, 0.55, 0);
    this.rig.add(this.legL, this.legR);

    // Hat slot.
    this.hatSlot = new THREE.Group();
    this.hatSlot.position.y = 2.2;
    this.rig.add(this.hatSlot);

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
    const swing = Math.sin(this.walkPhase) * 0.85 * amp;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    // a little outward arm rest
    this.armL.rotation.z = 0.18;
    this.armR.rotation.z = -0.18;

    // body bob & lean
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.12 * amp;
    this.rig.position.y = bob;
    this.rig.rotation.x = amp * 0.06; // lean into the walk
    // gentle idle breathing
    const breathe = Math.sin(elapsed * 2) * 0.02 * (1 - amp);
    this.head.position.y = 1.85 + breathe;

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
