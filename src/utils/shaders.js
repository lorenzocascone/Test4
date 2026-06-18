// ----------------------------------------------------------------------------
// Shared shader helpers for the "clay" look.
//
// Cheap subsurface-scattering approximation: an additive forward-scatter term so
// light bleeds through thin parts (goblin ears, backlit leaves). It's injected at
// the very end of the fragment shader (`opaque_fragment`) using only existing
// built-ins (`vViewPosition`, `viewMatrix`) — it never touches the core BRDF, so
// it can't blacken a mesh if an internal chunk shifts between three versions.
//
// All injected materials share one sun uniform set, updated each frame from
// DayNight, so the scatter follows the real light and fades at night.
// ----------------------------------------------------------------------------

import * as THREE from 'three';

export const sunUniforms = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(0, 0, 0) }, // premultiplied by intensity
};

// Mutate a shader (inside onBeforeCompile) to add the translucency term.
export function injectTranslucency(shader, { thickness = 0.5, power = 3.0 } = {}) {
  shader.uniforms.uSunDir = sunUniforms.uSunDir;
  shader.uniforms.uSunColor = sunUniforms.uSunColor;
  shader.uniforms.uThickness = { value: thickness };
  shader.uniforms.uTransPow = { value: power };

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
       uniform vec3 uSunDir;
       uniform vec3 uSunColor;
       uniform float uThickness;
       uniform float uTransPow;`
    )
    .replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
       {
         vec3 _V = normalize(vViewPosition);
         vec3 _L = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
         float _back = pow(clamp(dot(_V, -_L), 0.0, 1.0), uTransPow);
         gl_FragColor.rgb += uSunColor * _back * uThickness * diffuseColor.rgb;
       }`
    );
}

// Standalone: give a material the translucency term (for materials with no other
// onBeforeCompile of their own). `key` keeps three's program cache from colliding.
export function applyTranslucency(material, opts = {}) {
  material.onBeforeCompile = (shader) => injectTranslucency(shader, opts);
  const k = `clay-sss-${opts.thickness ?? 0.5}-${opts.power ?? 3}`;
  material.customProgramCacheKey = () => k;
}

// Keep the shared sun uniforms in step with DayNight (call once per frame).
export function updateSun(dayNight) {
  sunUniforms.uSunDir.value.copy(dayNight.sunDir);
  const i = THREE.MathUtils.clamp(dayNight.sun.intensity, 0, 1.6);
  sunUniforms.uSunColor.value.copy(dayNight.sun.color).multiplyScalar(i * 0.18);
}
