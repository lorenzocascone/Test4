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
           // soft lighter-blue "clay" streaks that drift slowly — a plasticine
           // shimmer, not a glowing sparkle.
           float streak = sin(vWorldDir.y * 26.0 + vWorldDir.x * 8.0 + uTime * 0.4);
           streak = smoothstep(0.55, 0.95, streak);
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.78, 0.96), streak * 0.55);`
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
