// GPU flowers. Each petal shape is one InstancedMesh; petals open/close in the vertex shader (per-instance
// "open" amount), and colour patterns + weather mutations are drawn in the fragment shader. Stems and flower
// centres are two more instanced meshes. The whole garden's flowers cost ~10 draw calls.
import * as THREE from 'three';
import { COLORS, SHAPES } from '../game/genetics.js';
import { merge, tint } from './geometry.js';

// ---- petal shape definitions (petal frame: x across, y up/out of the petal, z along from the base) ----
// layers: [{ n, len, wid, r0, closed, open, rot }]; width(v) returns the half-width factor 0..1 along v.
const SHAPE_DEFS = [
  { // Blossom: five round petals
    layers: [{ n: 5, len: 0.44, wid: 0.27, r0: 0.03, closed: -1.32, open: -0.3, rot: 0 }],
    width: (v) => Math.pow(Math.sin(Math.PI * Math.pow(v, 0.82)), 0.72), cup: 0.34, bend: 0.06,
  },
  { // Daisy: many thin petals, flat
    layers: [{ n: 14, len: 0.52, wid: 0.075, r0: 0.07, closed: -1.25, open: -0.1, rot: 0 }],
    width: (v) => Math.pow(Math.sin(Math.PI * Math.pow(v, 0.55)), 0.5), cup: 0.18, bend: -0.05,
  },
  { // Tulip: cupped petals that stay upright
    layers: [
      { n: 3, len: 0.46, wid: 0.25, r0: 0.02, closed: -1.42, open: -1.0, rot: 0 },
      { n: 3, len: 0.44, wid: 0.25, r0: 0.01, closed: -1.46, open: -1.12, rot: Math.PI / 3 },
    ],
    width: (v) => Math.pow(Math.sin(Math.PI * Math.pow(v, 0.9)), 0.55) * (0.8 + 0.3 * v), cup: 0.62, bend: 0.14,
  },
  { // Star: pointed petals
    layers: [{ n: 5, len: 0.5, wid: 0.2, r0: 0.03, closed: -1.3, open: -0.22, rot: 0 }],
    width: (v) => Math.min(1, v * 3.2) * Math.pow(1 - v, 1.05), cup: 0.22, bend: 0.02,
  },
  { // Heart: round petals with a notch at the tip
    layers: [{ n: 5, len: 0.43, wid: 0.28, r0: 0.03, closed: -1.32, open: -0.28, rot: 0 }],
    width: (v) => Math.pow(Math.sin(Math.PI * Math.pow(v, 0.72)), 0.66), cup: 0.3, bend: 0.05, notch: 0.24,
  },
  { // Frill: two layers of ruffled petals
    layers: [
      { n: 8, len: 0.42, wid: 0.2, r0: 0.04, closed: -1.3, open: -0.26, rot: 0 },
      { n: 8, len: 0.3, wid: 0.18, r0: 0.02, closed: -1.4, open: -0.62, rot: Math.PI / 8 },
    ],
    width: (v) => Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.6) * (1 + 0.1 * Math.sin(v * 26)), cup: 0.28, bend: 0.08, ruffle: 0.035,
  },
  { // Lotus: long pointed outer petals, upright inner ones
    layers: [
      { n: 8, len: 0.5, wid: 0.17, r0: 0.03, closed: -1.35, open: -0.4, rot: 0 },
      { n: 6, len: 0.38, wid: 0.16, r0: 0.02, closed: -1.45, open: -0.9, rot: Math.PI / 6 },
    ],
    width: (v) => Math.pow(Math.sin(Math.PI * Math.pow(v, 0.95)), 0.8) * (1 - 0.35 * Math.pow(v, 3)), cup: 0.4, bend: 0.12, point: 1,
  },
  { // Pinwheel: skewed, twisted petals
    layers: [{ n: 6, len: 0.44, wid: 0.23, r0: 0.03, closed: -1.3, open: -0.16, rot: 0 }],
    width: (v) => Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.7), cup: 0.2, bend: 0.03, swirl: 0.16, twist: 0.5,
  },
];

// one petal in its own frame, as position/normal/uv arrays (appended to the given arrays)
function buildPetal(def, L, out, angle, pitchClosed, pitchOpen, r0) {
  const NU = 7, NV = 9;
  const base = out.pos.length / 3;
  const W = L.wid;
  const grid = [];
  for (let j = 0; j < NV; j++) {
    const v = j / (NV - 1);
    for (let i = 0; i < NU; i++) {
      const u = (i / (NU - 1)) * 2 - 1;                // -1..1 across
      let hw = W * def.width(v);
      if (def.point && v > 0.85) hw *= 1 - (v - 0.85) / 0.15 * 0.6;
      hw = Math.max(hw, W * 0.02);        // never fully collapse a row: zero width → zero normals → NaN lighting
      let z = r0 + v * L.len;
      // heart notch: pull the middle of the tip back
      if (def.notch) z -= L.len * def.notch * Math.exp(-(u * 2.4) * (u * 2.4)) * Math.max(0, (v - 0.55) / 0.45);
      let x = u * hw;
      if (def.swirl) x += def.swirl * Math.pow(v, 1.6) * L.len * 2.2 + (u > 0 ? 0.2 : 0) * hw * v;
      let y = def.cup * u * u * hw + def.bend * v * v * L.len * 2;
      if (def.ruffle) y += def.ruffle * Math.sin(u * 7 + v * 9) * v;
      if (def.twist) { const a = def.twist * v * u * 0.6; y += a * hw; }
      grid.push([x, y, z, u, v]);
    }
  }
  // normals from the grid (central differences)
  const P = (i, j) => grid[Math.min(NV - 1, Math.max(0, j)) * NU + Math.min(NU - 1, Math.max(0, i))];
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const g = P(i, j);
      const a = P(i + 1, j), b = P(i - 1, j), c = P(i, j + 1), d = P(i, j - 1);
      const tu = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const tv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      // n = tv × tu (points to +y for a flat petal)
      let nx = tv[1] * tu[2] - tv[2] * tu[1], ny = tv[2] * tu[0] - tv[0] * tu[2], nz = tv[0] * tu[1] - tv[1] * tu[0];
      let l = Math.hypot(nx, ny, nz);
      if (!(l > 1e-9)) { nx = 0; ny = 1; nz = 0; l = 1; }
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      out.pos.push(g[0], g[1], g[2]);
      out.nor.push(nx / l, ny / l, nz / l);
      out.puv.push(g[3], g[4]);
      out.pet.push(angle, pitchClosed, pitchOpen, r0);
    }
  }
  for (let j = 0; j < NV - 1; j++) {
    for (let i = 0; i < NU - 1; i++) {
      const a = base + j * NU + i, b = a + 1, c = a + NU, d = c + 1;
      out.idx.push(a, c, b, b, c, d);
    }
  }
}

function headGeometry(def) {
  const out = { pos: [], nor: [], puv: [], pet: [], idx: [] };
  for (const L of def.layers) {
    for (let k = 0; k < L.n; k++) {
      const angle = L.rot + (k / L.n) * Math.PI * 2;
      buildPetal(def, L, out, angle, L.closed, L.open, L.r0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute('aPUv', new THREE.Float32BufferAttribute(out.puv, 2));
  g.setAttribute('aPetal', new THREE.Float32BufferAttribute(out.pet, 4));
  g.setIndex(out.idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.1, 0), 0.8);
  return g;
}

const HEAD_VERT_PARS = /* glsl */`
attribute vec4 aPetal;
attribute vec2 aPUv;
attribute float iOpen;
attribute vec3 iCol1;
attribute vec3 iCol2;
attribute vec3 iMisc;
uniform float uTime;
varying vec2 vPUv;
varying vec3 vCol1;
varying vec3 vCol2;
varying vec3 vMisc;
varying float vAng;
mat3 fl_rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 fl_rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
`;

const HEAD_FRAG_PARS = /* glsl */`
uniform float uTime;
varying vec2 vPUv;
varying vec3 vCol1;
varying vec3 vCol2;
varying vec3 vMisc;
varying float vAng;
float fl_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 fl_hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
`;

function headMaterial() {
  const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0.0 });
  m.userData.uniforms = { uTime: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HEAD_VERT_PARS)
      .replace('#include <beginnormal_vertex>', /* glsl */`
        float fl_open = clamp(iOpen, 0.0, 1.2);
        float fl_pitch = mix(aPetal.y, aPetal.z, fl_open);
        fl_pitch += sin(uTime * 1.7 + aPetal.x * 3.0 + iMisc.z * 6.2831) * 0.025 * fl_open;
        mat3 fl_R = fl_rotY(aPetal.x) * fl_rotX(fl_pitch);
        vec3 objectNormal = fl_R * normal;
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', /* glsl */`
        vec3 fl_p = position - vec3(0.0, 0.0, aPetal.w);
        vec3 transformed = fl_R * fl_p + fl_rotY(aPetal.x) * vec3(0.0, 0.0, aPetal.w);
        vPUv = aPUv; vCol1 = iCol1; vCol2 = iCol2; vMisc = iMisc; vAng = aPetal.x;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEAD_FRAG_PARS)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        float fl_u = vPUv.x, fl_v = vPUv.y;
        float fl_pat = vMisc.x, fl_mut = vMisc.y, fl_seed = vMisc.z;
        vec3 fl_c = vCol1;
        if (fl_pat > 0.5 && fl_pat < 1.5) fl_c = mix(vCol2, vCol1, smoothstep(0.12, 0.62, fl_v));
        else if (fl_pat > 1.5 && fl_pat < 2.5) {
          float s = abs(sin(fl_u * 3.14159 * 1.5));
          fl_c = mix(fl_c, vCol2, smoothstep(0.42, 0.24, s) * smoothstep(0.06, 0.3, fl_v));
        } else if (fl_pat > 2.5 && fl_pat < 3.5) {
          vec2 sp = vec2(fl_u * 2.6, fl_v * 5.0) + fl_seed * 7.0;
          vec2 cell = floor(sp);
          vec2 f = fract(sp) - 0.5 - (vec2(fl_hash(cell), fl_hash(cell + 3.1)) - 0.5) * 0.4;
          float on = step(0.4, fl_hash(cell + 11.3));
          fl_c = mix(fl_c, vCol2, on * smoothstep(0.27, 0.19, length(f)) * smoothstep(0.08, 0.28, fl_v));
        } else if (fl_pat > 3.5) fl_c = mix(fl_c, vCol2, smoothstep(0.66, 0.88, fl_v));
        // depth toward the centre, a soft vein, lighter tips
        fl_c *= mix(0.66, 1.0, smoothstep(0.0, 0.38, fl_v));
        fl_c *= 1.0 - 0.1 * smoothstep(0.06, 0.0, abs(fl_u)) * (1.0 - fl_v);
        fl_c = mix(fl_c, fl_c * 1.12 + 0.03, smoothstep(0.6, 1.0, fl_v));
        float fl_emis = 0.07;
        float fl_rough = 0.55, fl_metal = 0.0;
        vec3 fl_glow = vec3(0.0);
        if (fl_mut > 0.5 && fl_mut < 1.5) {            // dewy: glossy with droplets
          vec2 dp = vec2(fl_u * 4.0, fl_v * 7.0) + fl_seed * 13.0;
          vec2 dc = floor(dp);
          float drop = step(0.62, fl_hash(dc)) * smoothstep(0.16, 0.05, length(fract(dp) - 0.5));
          fl_c = mix(fl_c, vec3(1.0), drop * 0.75);
          fl_rough = 0.16;
        } else if (fl_mut > 1.5 && fl_mut < 2.5) {     // moonlit: cool glow
          fl_c = mix(fl_c, vec3(0.75, 0.85, 1.0), 0.18);
          fl_glow = fl_c * (0.42 + 0.14 * sin(uTime * 2.2 + fl_seed * 6.28));
        } else if (fl_mut > 2.5 && fl_mut < 3.5) {     // golden: metallic gold
          vec3 gold = mix(vec3(0.72, 0.45, 0.08), vec3(1.0, 0.86, 0.45), smoothstep(0.1, 0.95, fl_v));
          fl_c = mix(fl_c, gold, 0.78);
          fl_metal = 0.85; fl_rough = 0.3;
          fl_glow = gold * 0.12;
        } else if (fl_mut > 3.5 && fl_mut < 4.5) {     // rainbow: flowing hues
          float h = fract(fl_v * 0.55 + vAng / 6.2831 + uTime * 0.12);
          fl_c = mix(fl_c, fl_hsv(h, 0.62, 1.0), 0.85);
          fl_glow = fl_c * 0.22;
        }
        diffuseColor.rgb = fl_c;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = fl_rough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = fl_metal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * fl_emis + fl_glow;');
  };
  m.customProgramCacheKey = () => 'flower-head-v1';
  return m;
}

// stem: unit height along +y with two leaves near the base (wind-bent via the instance matrix shear)
function stemGeometry() {
  const stem = new THREE.CylinderGeometry(0.022, 0.03, 1, 6, 4, true);
  stem.translate(0, 0.5, 0);
  tint(stem, '#3f9d44');
  const leaf = (a, h, s) => {
    const l = new THREE.SphereGeometry(0.13, 8, 5);
    l.scale(0.42 * s, 0.1, 1.15 * s);
    l.rotateX(-0.55);
    l.translate(0, h, 0.12 * s);
    l.rotateY(a);
    return tint(l, '#4db84f');
  };
  return merge([stem, leaf(0.4, 0.14, 1), leaf(0.4 + Math.PI, 0.26, 0.85)]);
}

const TMP = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), e: new THREE.Euler(), c: new THREE.Color() };

export class Flowers {
  constructor(scene, capacity = 64) {
    this.scene = scene;
    this.cap = capacity;
    this.mat = headMaterial();
    this.heads = SHAPE_DEFS.map((def) => {
      const geo = headGeometry(def);
      const attrs = {
        iOpen: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
        iCol1: new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
        iCol2: new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
        iMisc: new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
      };
      for (const k in attrs) { attrs[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, attrs[k]); }
      const mesh = new THREE.InstancedMesh(geo, this.mat, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return { mesh, attrs, n: 0 };
    });
    const centerGeo = new THREE.SphereGeometry(0.085, 12, 8);
    centerGeo.scale(1, 0.62, 1);
    this.centers = new THREE.InstancedMesh(centerGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), capacity);
    this.centers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.centers.castShadow = true; this.centers.frustumCulled = false; this.centers.count = 0;
    scene.add(this.centers);
    this.stems = new THREE.InstancedMesh(stemGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), capacity);
    this.stems.castShadow = true; this.stems.frustumCulled = false; this.stems.count = 0;
    scene.add(this.stems);
    this.colors = COLORS.map((c) => new THREE.Color(c.hex));
    this.nStem = 0; this.nCenter = 0;
  }

  begin() {
    for (const h of this.heads) h.n = 0;
    this.nStem = 0; this.nCenter = 0;
  }

  // f = { x, y, z, g (genes), stem (height), head (scale 0..), open (0..1+), sway: {x, z}, tilt, seed, face }
  add(f) {
    const { m, q, s, p, e, c } = TMP;
    const stemH = f.stem;
    const sx = f.sway?.x || 0, sz = f.sway?.z || 0;
    if (stemH > 0.001 && this.nStem < this.cap) {
      // shear so the stem's top lands where the head sways to
      const k = f.stemScale || 1;
      m.set(
        k, sx, 0, f.x,
        0, stemH, 0, f.y,
        0, sz, k, f.z,
        0, 0, 0, 1,
      );
      this.stems.setMatrixAt(this.nStem++, m);
    }
    if (f.head > 0.001) {
      const h = this.heads[f.g.shape];
      if (h.n >= this.cap) return;
      const i = h.n++;
      const scale = f.head;
      p.set(f.x + sx, f.y + stemH, f.z + sz);
      e.set((f.tilt ?? 0.32) + sz * 0.8, f.face || 0, -sx * 0.8);
      q.setFromEuler(e);
      s.set(scale, scale, scale);
      m.compose(p, q, s);
      h.mesh.setMatrixAt(i, m);
      h.attrs.iOpen.array[i] = f.open;
      const c1 = this.colors[f.g.c1], c2 = this.colors[f.g.c2 ?? f.g.c1];
      h.attrs.iCol1.array.set([c1.r, c1.g, c1.b], i * 3);
      h.attrs.iCol2.array.set([c2.r, c2.g, c2.b], i * 3);
      h.attrs.iMisc.array.set([f.g.pattern || 0, f.g.mut || 0, f.seed || 0], i * 3);
      // centre
      if (this.nCenter < this.cap && f.open > 0.15) {
        const j = this.nCenter++;
        const cs = scale * Math.min(1, f.open) * (f.g.shape === 1 ? 1.35 : f.g.shape === 2 ? 0.7 : 1);
        s.set(cs, cs, cs);
        m.compose(p, q, s);
        this.centers.setMatrixAt(j, m);
        c.set(centerColor(f.g));
        if (f.g.mut === 3) c.set('#ffcf4a');
        this.centers.setColorAt(j, c);
      }
    }
  }

  end(time) {
    this.mat.userData.uniforms.uTime.value = time;
    for (const h of this.heads) {
      h.mesh.count = h.n;
      if (h.n) {
        h.mesh.instanceMatrix.needsUpdate = true;
        for (const k in h.attrs) { h.attrs[k].needsUpdate = true; h.attrs[k].addUpdateRange(0, h.n * h.attrs[k].itemSize); }
      }
    }
    this.stems.count = this.nStem;
    this.stems.instanceMatrix.needsUpdate = true;
    this.centers.count = this.nCenter;
    this.centers.instanceMatrix.needsUpdate = true;
    if (this.centers.instanceColor) this.centers.instanceColor.needsUpdate = true;
  }

  // every instanced attribute range was set by addUpdateRange: clear them after the renderer consumed them
  afterRender() {
    for (const h of this.heads) for (const k in h.attrs) h.attrs[k].clearUpdateRanges();
  }
}

function centerColor(g) {
  const c = g.c1;
  // warm flowers get a dark heart, cool / white ones a golden one
  if (c === 1 || c === 4 || c === 9 || c === 10) return '#6b3d1c';
  if (c === 15) return '#e8c24a';
  if (g.shape === 6) return '#cfe38a';
  return '#f2b632';
}

export { SHAPE_DEFS };
