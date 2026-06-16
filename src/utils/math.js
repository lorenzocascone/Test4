// ----------------------------------------------------------------------------
// Geometry helpers for living on the surface of a sphere.
// ----------------------------------------------------------------------------

import * as THREE from 'three';

const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

// Build a quaternion that rotates the model's +Y axis to point along `normal`.
// Optionally orient its facing (+Z) toward `forward` (projected onto the plane).
export function alignToNormal(normal, forward = null, target = new THREE.Quaternion()) {
  if (!forward) {
    return target.setFromUnitVectors(_up, normal);
  }
  // Build an orthonormal basis: up = normal, forward tangent to surface.
  const up = normal.clone().normalize();
  let fwd = forward.clone();
  fwd.sub(up.clone().multiplyScalar(fwd.dot(up))).normalize();
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1).sub(up.clone().multiplyScalar(up.z)).normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  // Recompute forward for orthogonality.
  fwd.crossVectors(right, up).normalize();
  _m.makeBasis(right, up, fwd);
  return target.setFromRotationMatrix(_m);
}

// Even point distribution on a sphere (Fibonacci sphere). Returns unit vectors.
export function fibonacciSphere(count, jitterRng = null) {
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    let t = i + 0.5;
    if (jitterRng) t += (jitterRng() - 0.5) * 0.8;
    const y = 1 - (t / count) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i + (jitterRng ? jitterRng() * 0.6 : 0);
    points.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
  }
  return points;
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Random unit vector on a sphere using a provided rng (0..1).
export function randomDirection(rng) {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z);
}
