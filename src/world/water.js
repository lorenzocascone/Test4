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
           // gentle, slow swell (was far too choppy)
           float wave = sin(d.x*9.0 + uTime*0.5)
                      + sin(d.y*7.0 - uTime*0.35)
                      + sin(d.z*11.0 + uTime*0.45);
           transformed += d * wave * 0.03;
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
          '#include <color_fragment>',
          `#include <color_fragment>
           // thin lighter-blue wobbly lines rippling across the surface — a
           // plasticine "shimmer", like ripple lines pressed into clay.
           float u = (vWorldDir.x + vWorldDir.z) * 7.0
                   + sin(vWorldDir.y * 9.0 + uTime * 0.6) * 0.8
                   + sin((vWorldDir.x - vWorldDir.z) * 6.0 - uTime * 0.45) * 0.8;
           float tri = abs(fract(u + uTime * 0.12) - 0.5) * 2.0; // 0..1
           float line = smoothstep(0.8, 0.97, tri);              // thin crests
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.85, 0.99), line * 0.6);`
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
