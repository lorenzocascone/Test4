// ----------------------------------------------------------------------------
// True tilt-shift lens: a horizontal FOCUS BAND with blur ramping toward the
// top and bottom of the frame — the signature of real miniature photography
// (radial bokeh doesn't sell "tiny"; this does). Implemented as a separable
// two-pass 9-tap Gaussian whose radius grows with vertical distance from the
// focus line. Blur radius is in UV space, so no resize handling is needed.
// ----------------------------------------------------------------------------

import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const makeShader = (dirX, dirY) => ({
  uniforms: {
    tDiffuse: { value: null },
    uFocusY: { value: 0.45 },   // screen-space Y (0..1) of the focus line
    uBandHalf: { value: 0.12 }, // half-height of the fully-sharp band
    uMaxBlur: { value: 0.011 }, // max blur radius (UV units) at frame edge
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uFocusY;
    uniform float uBandHalf;
    uniform float uMaxBlur;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uFocusY);
      float amount = uMaxBlur * smoothstep(uBandHalf, uBandHalf * 3.2, d);
      vec2 stp = vec2(${dirX.toFixed(1)}, ${dirY.toFixed(1)}) * amount * 0.25;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += (texture2D(tDiffuse, vUv + stp)       + texture2D(tDiffuse, vUv - stp))       * 0.1945945946;
      c += (texture2D(tDiffuse, vUv + stp * 2.0) + texture2D(tDiffuse, vUv - stp * 2.0)) * 0.1216216216;
      c += (texture2D(tDiffuse, vUv + stp * 3.0) + texture2D(tDiffuse, vUv - stp * 3.0)) * 0.0540540541;
      c += (texture2D(tDiffuse, vUv + stp * 4.0) + texture2D(tDiffuse, vUv - stp * 4.0)) * 0.0162162162;
      gl_FragColor = c;
    }
  `,
});

export function createTiltShift() {
  const h = new ShaderPass(makeShader(1, 0));
  const v = new ShaderPass(makeShader(0, 1));
  return {
    passes: [h, v],
    // Slide the sharp band to a screen-space Y (0 bottom .. 1 top).
    setFocus(y) {
      h.uniforms.uFocusY.value = y;
      v.uniforms.uFocusY.value = y;
    },
  };
}
