// ----------------------------------------------------------------------------
// Translucent ocean shell sitting at sea level, with a gentle animated shimmer
// and a soft Fresnel rim added via onBeforeCompile (no full custom shader).
// ----------------------------------------------------------------------------

import * as THREE from 'three';

export class Water {
  constructor(seaRadius) {
    const geo = new THREE.IcosahedronGeometry(seaRadius, 32);

    // Opaque vibrant blue "plasticine" sea — a hard waterline against the land,
    // like a different colour of clay rather than a translucent fade.
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1496d6'),
      transparent: false,
      roughness: 0.55,
      metalness: 0.0,
      envMapIntensity: 0.4,
    });

    this.uniforms = { uTime: { value: 0 } };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           varying vec3 vWorldDir;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec3 d = normalize(position);
           float wave = sin(d.x*22.0 + uTime*1.6) * 0.5
                      + sin(d.y*18.0 - uTime*1.2) * 0.5
                      + sin(d.z*26.0 + uTime*1.9) * 0.5;
           transformed += d * wave * 0.12;
           vWorldDir = d;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           varying vec3 vWorldDir;`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           // animated sparkle/foam shimmer driven by the surface direction
           float shimmer = sin(vWorldDir.x*40.0 + uTime*2.0)
                         * sin(vWorldDir.y*36.0 - uTime*1.5)
                         * sin(vWorldDir.z*44.0 + uTime*1.7);
           shimmer = max(shimmer, 0.0);
           totalEmissiveRadiance += vec3(0.30, 0.55, 0.75) * (0.12 + shimmer * 0.4);`
        );
    };

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'water';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  update(dt, elapsed) {
    this.uniforms.uTime.value = elapsed;
  }
}
