// ----------------------------------------------------------------------------
// "Hand-molded" geometry distortion. Nudges the vertices of perfect primitives
// (cylinders, spheres, cones, capsules) with low-frequency noise so they read as
// pressed-by-hand clay instead of crisp digital shapes. Welds + recomputes smooth
// normals for soft lumps, and preserves UVs (the clay maps need them).
// ----------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noise } from './noise.js';

const _moldNoise = new Noise(0x5eed);

// Displace each vertex by smooth fbm noise sampled on its position. `amp` is in
// the geometry's own units (keep it small relative to the part size). Returns a
// fresh welded, smooth-normalled geometry.
export function moldGeometry(geo, { amp = 0.04, freq = 2.2, seed = 0 } = {}) {
  let g = geo.index ? geo : mergeVertices(geo); // weld first so shared verts move together
  const pos = g.attributes.position;
  const s = seed * 13.37;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    // three decorrelated noise channels → an organic per-vertex offset
    const nx = _moldNoise.fbm(v.x * freq + s, v.y * freq, v.z * freq, { octaves: 2 });
    const ny = _moldNoise.fbm(v.x * freq, v.y * freq + 5.1 + s, v.z * freq, { octaves: 2 });
    const nz = _moldNoise.fbm(v.x * freq, v.y * freq, v.z * freq + 9.2 + s, { octaves: 2 });
    pos.setXYZ(i, v.x + nx * amp, v.y + ny * amp, v.z + nz * amp);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals(); // smooth lumps, not facets
  return g;
}
