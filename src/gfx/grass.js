// Instanced grass: tens of thousands of curved blades with per-blade colour, root→tip gradient, wind sway and
// soft self-shadowing near the ground. Blades are grouped by hex cell so a bed can clear its patch when bought.
import * as THREE from 'three';
import { rng } from '../core/math.js';

const BLADE_SEGS = 4;

function bladeGeometry() {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= BLADE_SEGS; i++) {
    const t = i / BLADE_SEGS;
    const w = 0.5 * Math.pow(1 - t, 0.9);
    const z = 0.18 * t * t;                 // gentle forward curve
    if (i < BLADE_SEGS) { pos.push(-w, t, z, w, t, z); uv.push(0, t, 1, t); }
    else { pos.push(0, t, z); uv.push(0.5, t); }
  }
  for (let i = 0; i < BLADE_SEGS - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (BLADE_SEGS - 1) * 2; idx.push(a, a + 1, a + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

const VERT_PARS = /* glsl */`
  attribute vec4 iBlade;   // x, z, rotation, height
  attribute vec4 iTint;    // rgb tint, width
  uniform float uTime;
  uniform float uWind;
  varying float vH;
  varying vec3 vTint;
`;
const FRAG_PARS = /* glsl */`
  varying float vH;
  varying vec3 vTint;
  uniform vec3 uBase;
  uniform vec3 uTip;
`;

export class Grass {
  // area(x, z) → density 0..1 (0 = no grass); cellOf(x, z) → hex cell key or null
  constructor(scene, { count, radius, area, cellOf, seed = 5 }) {
    this.cellBlades = new Map();
    const R = rng(seed);
    const blades = [], tints = [];
    let tries = 0;
    while (blades.length / 4 < count && tries < count * 6) {
      tries++;
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * radius;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const d = area(x, z);
      if (d <= 0 || R() > d) continue;
      // clumps: blades come in little tufts
      const n = 3 + Math.floor(R() * 3);
      for (let k = 0; k < n && blades.length / 4 < count; k++) {
        const bx = x + (R() - 0.5) * 0.18, bz = z + (R() - 0.5) * 0.18;
        if (area(bx, bz) <= 0) continue;
        // mowed lawn in the garden, meadow around it, wild and tall toward the rim
        const rr = Math.hypot(bx, bz);
        const zone = rr < 6.6 ? 0.42 : rr < 9 ? 0.72 : 1;
        const h = (0.17 + R() * 0.2) * zone * (0.8 + d * 0.3);
        const i = blades.length / 4;
        blades.push(bx, bz, R() * Math.PI * 2, h);
        // colour: coherent patches (lush / bluish / sun-dried) plus a little per-blade jitter
        const patch = Math.sin(bx * 0.42 + Math.sin(bz * 0.31) * 2.1) * Math.sin(bz * 0.37 + bx * 0.17);
        let tr = 0.9 + R() * 0.18, tg = 0.9 + R() * 0.18, tb = 0.88 + R() * 0.16;
        if (patch > 0.35) { const k = (patch - 0.35) * 1.6; tr *= 1 + 0.35 * k; tg *= 1 + 0.08 * k; tb *= 1 - 0.25 * k; }
        else if (patch < -0.45) { const k = (-patch - 0.45) * 1.6; tr *= 1 - 0.15 * k; tb *= 1 + 0.2 * k; }
        tints.push(tr, tg, tb, (0.05 + R() * 0.025) * (rr < 6.6 ? 0.8 : 1));
        const key = cellOf(bx, bz);
        if (key != null) { let l = this.cellBlades.get(key); if (!l) this.cellBlades.set(key, (l = [])); l.push(i); }
      }
    }
    const n = blades.length / 4;
    const geo = bladeGeometry();
    this.iBlade = new THREE.InstancedBufferAttribute(new Float32Array(blades), 4);
    this.iTint = new THREE.InstancedBufferAttribute(new Float32Array(tints), 4);
    geo.setAttribute('iBlade', this.iBlade);
    geo.setAttribute('iTint', this.iTint);
    geo.instanceCount = n;
    this.heights = new Float32Array(n);
    for (let i = 0; i < n; i++) this.heights[i] = blades[i * 4 + 3];
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    const U = (this.uniforms = {
      uTime: { value: 0 }, uWind: { value: 1 },
      uBase: { value: new THREE.Color('#2f6a24') }, uTip: { value: new THREE.Color('#b7e46a') },
    });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', /* glsl */`
          float h = iBlade.w;
          vec3 p = position;
          p.x *= iTint.w;
          p.y *= h; p.z *= h;
          float c = cos(iBlade.z), s = sin(iBlade.z);
          p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
          // wind: slow swell + fast flutter, stronger toward the tip
          float t = uv.y * uv.y;
          float w = sin(uTime * 1.6 + iBlade.x * 0.45 + iBlade.y * 0.3) * 0.5 + 0.5;
          w = w * 0.75 + sin(uTime * 4.3 + iBlade.x * 3.1 + iBlade.y * 2.3) * 0.12;
          p.x += w * 0.09 * uWind * t * (h * 3.5);
          p.z += w * 0.05 * uWind * t * (h * 3.5);
          vec3 transformed = p + vec3(iBlade.x, 0.0, iBlade.y);
          vH = uv.y; vTint = iTint.rgb;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <color_fragment>', /* glsl */`
          #include <color_fragment>
          vec3 gcol = mix(uBase, uTip, smoothstep(0.0, 1.0, vH)) * vTint;
          gcol *= mix(0.72, 1.0, smoothstep(0.0, 0.5, vH));      // soft occlusion near the ground
          diffuseColor.rgb = gcol;`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * (0.1 + 0.12 * vH);');
    };
    mat.customProgramCacheKey = () => 'grass-v1';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.count = n;
    scene.add(this.mesh);
  }

  // hide (0) or restore (1) the blades of one hex cell (e.g. when a bed is built there)
  setCell(key, visible) {
    const list = this.cellBlades.get(key);
    if (!list) return;
    const a = this.iBlade.array;
    for (const i of list) a[i * 4 + 3] = visible ? this.heights[i] : 0;
    this.iBlade.needsUpdate = true;
  }

  setColors(base, tip) { this.uniforms.uBase.value.set(base); this.uniforms.uTip.value.set(tip); }
  update(time, wind = 1) { this.uniforms.uTime.value = time; this.uniforms.uWind.value = wind; }
}
