// Post stack (medium / high quality): HDR render → bloom (only real glows: golden, moonlit, rainbow, fireflies)
// → tilt-shift (miniature-diorama focus band) → colour grade (weather-driven) → output (tone map + sRGB).
// Low quality renders straight to the canvas instead.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { damp } from '../core/math.js';

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFocus: { value: 0.52 },     // screen-space y of the sharp band (0 bottom … 1 top)
    uBand: { value: 0.3 },       // half-height of the sharp band
    uMax: { value: 3.2 },        // blur radius in pixels at the edges (scaled by resolution)
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uMax;
    varying vec2 vUv;
    void main() {
      float d = max(0.0, abs(vUv.y - uFocus) - uBand);
      float r = uMax * smoothstep(0.0, 0.35, d) * (uRes.y / 900.0);
      vec4 c = texture2D(tDiffuse, vUv);
      if (r < 0.35) { gl_FragColor = c; return; }
      vec2 px = r / uRes;
      vec4 acc = c * 2.0; float w = 2.0;
      const int N = 10;
      for (int i = 0; i < N; i++) {
        float a = float(i) * 2.39996;
        float rr = sqrt((float(i) + 0.5) / float(N));
        vec2 o = vec2(cos(a), sin(a)) * rr * px;
        acc += texture2D(tDiffuse, vUv + o); w += 1.0;
      }
      gl_FragColor = acc / w;
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.06 },
    uVib: { value: 0.18 },
    uContrast: { value: 1.06 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uShadow: { value: new THREE.Vector3(0.97, 0.99, 1.04) },
    uLift: { value: 0 },
    uExposure: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat; uniform float uVib; uniform float uContrast; uniform vec3 uTint;
    uniform vec3 uShadow; uniform float uLift; uniform float uExposure;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= uExposure;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      float chroma = (mx - mn) / max(mx, 1e-4);
      c.rgb = max(mix(vec3(l), c.rgb, uSat + uVib * (1.0 - smoothstep(0.1, 0.7, chroma))), 0.0);
      c.rgb = 0.18 * pow(max(c.rgb, vec3(1e-6)) / 0.18, vec3(uContrast));
      c.rgb *= mix(uShadow, vec3(1.0), smoothstep(0.02, 0.5, l));
      c.rgb = c.rgb * uTint + uLift;
      gl_FragColor = c;
    }`,
};

// per-weather grade targets
export const GRADES = {
  clear: { sat: 1.06, vib: 0.18, contrast: 1.06, tint: [1, 1, 1], lift: 0, exposure: 1 },
  rain: { sat: 0.9, vib: 0.1, contrast: 1.02, tint: [0.93, 0.97, 1.04], lift: 0.004, exposure: 0.92 },
  golden: { sat: 1.12, vib: 0.2, contrast: 1.07, tint: [1.07, 1.0, 0.88], lift: 0.002, exposure: 1.02 },
  night: { sat: 0.92, vib: 0.15, contrast: 1.08, tint: [0.82, 0.9, 1.12], lift: 0.006, exposure: 1.0 },
  rainbow: { sat: 1.14, vib: 0.24, contrast: 1.05, tint: [1.0, 1.0, 1.02], lift: 0, exposure: 1.04 },
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.composer = null;
    this.target = { ...GRADES.clear };
  }

  // (re)build for a quality tier; q.post = false → direct rendering
  setup(q, w, h) {
    this.dispose();
    this.q = q;
    if (!q.post) return;
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q.msaa || 0 });
    const comp = (this.composer = new EffectComposer(this.renderer, rt));
    comp.setPixelRatio(pr);
    comp.setSize(w, h);
    comp.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.5, 1.6);
    comp.addPass(this.bloom);
    if (q.tiltShift) {
      this.tilt = new ShaderPass(TiltShiftShader);
      comp.addPass(this.tilt);
    } else this.tilt = null;
    this.grade = new ShaderPass(GradeShader);
    comp.addPass(this.grade);
    comp.addPass(new OutputPass());
    this.resize(w, h);
  }

  resize(w, h) {
    if (!this.composer) return;
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    if (this.tilt) this.tilt.uniforms.uRes.value.set(w * pr, h * pr);
  }

  setFocus(y, band) { if (this.tilt) { this.tilt.uniforms.uFocus.value = y; this.tilt.uniforms.uBand.value = band; } }
  setWeather(kind) { this.target = GRADES[kind] || GRADES.clear; }

  update(dt) {
    if (!this.grade) return;
    const u = this.grade.uniforms, t = this.target, k = 1.2;
    u.uSat.value = damp(u.uSat.value, t.sat, k, dt);
    u.uVib.value = damp(u.uVib.value, t.vib, k, dt);
    u.uContrast.value = damp(u.uContrast.value, t.contrast, k, dt);
    u.uLift.value = damp(u.uLift.value, t.lift, k, dt);
    u.uExposure.value = damp(u.uExposure.value, t.exposure, k, dt);
    const v = u.uTint.value;
    v.set(damp(v.x, t.tint[0], k, dt), damp(v.y, t.tint[1], k, dt), damp(v.z, t.tint[2], k, dt));
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (!this.composer) return;
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    for (const p of this.composer.passes) p.dispose?.();
    this.composer = null; this.bloom = null; this.tilt = null; this.grade = null;
  }
}
