// The garden world: sky, light, the floating island, grass, scenery, pond, hive, decorations and the weather
// looks (clear / rain / golden hour / night / rainbow) blended over a few seconds.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { rng, lerp } from '../core/math.js';
import { tint, merge } from './geometry.js';
import { hexToWorld, key } from '../game/hex.js';
import { HIVE_POS, GARDEN_RADIUS } from '../game/garden.js';
import { Decor, DECOR_SPOTS } from './decor.js';
import { Island, islandRadius, terrainHeight } from './island.js';
import { Grass } from './grass.js';
import { Nature } from './nature.js';
import { strawTexture } from './textures.js';

// weather looks
const LOOKS = {
  clear: { skyTop: '#4aa6ff', skyHorizon: '#d8f0ff', skyLow: '#9fd2f2', sun: '#fff0d4', sunI: 2.5, hemiSky: '#d6ecff', hemiGround: '#83a55a', hemiI: 1.0, fog: '#c9e6f7', env: 0.32, stars: 0, rainbow: 0, sunDir: [-0.55, 1, 0.5], grass: ['#3b7d2b', '#bfe872'], cloud: '#ffffff' },
  rain: { skyTop: '#7d93a8', skyHorizon: '#c3d0d9', skyLow: '#9fb0be', sun: '#dfe9f2', sunI: 0.95, hemiSky: '#b9c8d6', hemiGround: '#5f7a48', hemiI: 1.1, fog: '#b3c1cc', env: 0.28, stars: 0, rainbow: 0, sunDir: [-0.3, 1, 0.3], grass: ['#27602a', '#94c860'], cloud: '#c8d2dc' },
  golden: { skyTop: '#ff9a62', skyHorizon: '#ffd9a0', skyLow: '#f7c49a', sun: '#ffbf78', sunI: 2.7, hemiSky: '#ffd6a8', hemiGround: '#7a7a44', hemiI: 0.9, fog: '#f2cfa8', env: 0.36, stars: 0, rainbow: 0, sunDir: [-0.95, 0.55, 0.35], grass: ['#3a6a1e', '#e0d66a'], cloud: '#ffe0c2' },
  night: { skyTop: '#0d1440', skyHorizon: '#2a3878', skyLow: '#1c2758', sun: '#a9bcff', sunI: 0.6, hemiSky: '#4a5aa8', hemiGround: '#1c2c34', hemiI: 0.6, fog: '#1d2858', env: 0.16, stars: 1, rainbow: 0, sunDir: [0.4, 1, -0.2], grass: ['#1c4630', '#5f9a6a'], cloud: '#6c78b0' },
  rainbow: { skyTop: '#54b4ff', skyHorizon: '#e6f7ff', skyLow: '#a6dcf7', sun: '#fff6e2', sunI: 2.55, hemiSky: '#e2f1ff', hemiGround: '#86a85a', hemiI: 1.05, fog: '#d3eefa', env: 0.36, stars: 0, rainbow: 1, sunDir: [-0.5, 1, 0.5], grass: ['#2f6f24', '#c0ea72'], cloud: '#ffffff' },
};

const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }';
const SKY_FRAG = /* glsl */`
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uLow; uniform float uStars; uniform float uTime; uniform vec3 uSunDir;
  varying vec3 vDir;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(41.7, 289.3))) * 43758.5453); }
  void main(){
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 c = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.8, y), 0.7));
    c = mix(c, uLow, smoothstep(0.0, -0.5, y));
    float sd = max(0.0, dot(d, normalize(uSunDir)));
    c += vec3(1.0, 0.92, 0.75) * (pow(sd, 32.0) * 0.5 + pow(sd, 4.0) * 0.08) * (1.0 - uStars);
    if (uStars > 0.01) {
      vec2 g = vec2(atan(d.z, d.x) * 60.0, asin(clamp(y, -1.0, 1.0)) * 120.0);
      vec2 cell = floor(g);
      float s = step(0.965, h21(cell));
      vec2 f = fract(g) - 0.5;
      float tw = 0.6 + 0.4 * sin(uTime * 2.0 + h21(cell + 7.0) * 40.0);
      c += vec3(1.0, 0.97, 0.9) * s * smoothstep(0.18, 0.0, length(f)) * uStars * tw;
    }
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

export const POND = { x: 7.8, z: -3.9, rx: 2.5, rz: 1.9 };

export class World {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.q = quality;
    this.look = { ...LOOKS.clear, sunDir: [...LOOKS.clear.sunDir], grass: [...LOOKS.clear.grass] };
    this.target = LOOKS.clear;
    this.time = 0;
    this.R = rng(7);
    this._lights();
    this._env();
    this._sky();
    this.island = new Island(scene, quality);
    this.layout = this._layout();
    this.nature = new Nature(scene, terrainHeight, this.layout, quality);
    this._pond();
    this.hive = makeHive();
    this.hive.position.set(HIVE_POS.x, terrainHeight(HIVE_POS.x, HIVE_POS.z), HIVE_POS.z);
    this.hive.rotation.y = 0.75;
    scene.add(this.hive);
    this.grass = new Grass(scene, {
      count: Math.round(95000 * (quality.grass ?? 1)),
      radius: 21,
      area: (x, z) => this._grassDensity(x, z),
      cellOf: (x, z) => cellOf(x, z),
    });
    this._rainbow();
    this.decor = new Decor(scene);
    this.applyLook(true);
  }

  _lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#d6ecff', '#83a55a', 1.0);
    s.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff0d4', 2.5));
    sun.castShadow = !!this.q.shadows;
    const size = this.q.shadowSize || 1024;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -15; cam.right = 15; cam.top = 15; cam.bottom = -15; cam.near = 1; cam.far = 60;
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    s.add(sun); s.add(sun.target);
    this.fog = s.fog = new THREE.Fog('#c9e6f7', 48, 120);
  }

  _env() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = new RoomEnvironment();
    this.envTex = pm.fromScene(env, 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.32;
    pm.dispose();
  }

  _sky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uLow: { value: new THREE.Color() },
        uStars: { value: 0 }, uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(-0.5, 1, 0.5) },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // where things go: trees frame the back and sides, bushes ring the garden, a fence arc behind it, a path in
  // front, flowers in clusters. Nothing is placed where the camera needs to see the beds.
  _layout() {
    const R = rng(2024);
    const reserved = [
      { x: HIVE_POS.x, z: HIVE_POS.z, r: 1.6 },
      { x: POND.x, z: POND.z, r: 3.1 },
      ...Object.values(DECOR_SPOTS).map((d) => ({ x: d.x, z: d.z, r: 1.9 })),
    ];
    const inIsland = (x, z, m = 0.9) => Math.hypot(x / 1.12, z) < islandRadius(Math.atan2(z, x / 1.12)) * m;
    const free = (x, z, r, list) => !reserved.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + r) && !list.some((q) => Math.hypot(x - q.x, z - q.z) < (q.rad || 0.8) + r);
    const L = { trees: [], bushes: [], rocks: [], flowers: [], stones: [], fence: [], mushrooms: [], reeds: [], pads: [], logs: [], shadows: [] };
    const taken = [];
    // path: stepping stones from the front rim up to the garden
    for (let k = 0; k < 10; k++) {
      const z = 6.6 + k * 1.05, x = Math.sin(k * 0.55) * 0.8;
      if (!inIsland(x, z, 0.95)) break;
      L.stones.push({ x, z, s: 0.36 + R() * 0.08, r: R() * 6 });
      taken.push({ x, z, rad: 0.55 });
    }
    // trees: back arc + sides
    const pals = ['green', 'green', 'deep', 'lime', 'blossom', 'green', 'blossom', 'deep'];
    for (let i = 0; i < 400 && L.trees.length < 18; i++) {
      const a = -Math.PI + R() * Math.PI * 1.35 - 0.2;
      const r = 10.5 + R() * 6.5;
      const x = Math.cos(a) * r * 1.12, z = Math.sin(a) * r;
      if (!inIsland(x, z, 0.92) || (z > 2 && Math.abs(x) < 10)) continue;
      if (!free(x, z, 1.6, taken)) continue;
      const t = { x, z, s: 0.95 + R() * 0.55, r: R() * 6, kind: ['round', 'tall', 'wide'][Math.floor(R() * 3)], palette: pals[L.trees.length % pals.length], rad: 1.8 };
      L.trees.push(t); taken.push(t);
      L.shadows.push({ x: x + 0.5, z: z - 0.3, s: 3.6 * t.s });
    }
    // bushes: around the garden ring
    for (let i = 0; i < 500 && L.bushes.length < 34; i++) {
      const a = R() * Math.PI * 2, r = 7.3 + R() * 4.2;
      const x = Math.cos(a) * r * 1.08, z = Math.sin(a) * r;
      if (!inIsland(x, z, 0.93) || (z > 3.5 && Math.abs(x) < 7.5)) continue;
      if (!free(x, z, 0.8, taken)) continue;
      const b = { x, z, s: 0.75 + R() * 0.7, r: R() * 6, geo: Math.floor(R() * 3), pal: Math.floor(R() * 5), rad: 0.9 };
      L.bushes.push(b); taken.push(b);
      L.shadows.push({ x: x + 0.15, z: z - 0.1, s: 2.1 * b.s });
    }
    // rocks
    for (let i = 0; i < 300 && L.rocks.length < 16; i++) {
      const a = R() * Math.PI * 2, r = 6.9 + R() * 10;
      const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r;
      if (!inIsland(x, z, 0.94) || (z > 4 && Math.abs(x) < 5)) continue;
      if (!free(x, z, 0.5, taken)) continue;
      const rk = { x, z, s: 0.25 + R() * 0.45, r: R() * 6, rad: 0.6 };
      L.rocks.push(rk); taken.push(rk);
      L.shadows.push({ x, z, s: 3.2 * rk.s });
    }
    // pond rim stones + reeds + lily pads
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + R() * 0.2;
      L.rocks.push({ x: POND.x + Math.cos(a) * (POND.rx + 0.25), z: POND.z + Math.sin(a) * (POND.rz + 0.25), s: 0.18 + R() * 0.16, r: R() * 6 });
    }
    for (let i = 0; i < 7; i++) {
      const a = -0.3 + i * 0.55 + R() * 0.2;
      L.reeds.push({ x: POND.x + Math.cos(a) * (POND.rx + 0.1), z: POND.z + Math.sin(a) * (POND.rz + 0.05) });
    }
    for (let i = 0; i < 6; i++) {
      const a = R() * Math.PI * 2, r = R() * 0.7;
      L.pads.push({ x: POND.x + Math.cos(a) * POND.rx * r, z: POND.z + Math.sin(a) * POND.rz * r, y: 0.05, s: 0.26 + R() * 0.14, flower: i < 2 });
    }
    // wildflower clusters
    for (let c = 0; c < 26; c++) {
      let cx = 0, cz = 0, ok = false;
      for (let t = 0; t < 30 && !ok; t++) {
        const a = R() * Math.PI * 2, r = 6.8 + R() * 11;
        cx = Math.cos(a) * r * 1.1; cz = Math.sin(a) * r;
        ok = inIsland(cx, cz, 0.93) && free(cx, cz, 0.6, L.stones.map((st) => ({ ...st, rad: 0.5 })));
      }
      if (!ok) continue;
      const col = Math.floor(R() * 6), n = 6 + Math.floor(R() * 10);
      for (let k = 0; k < n; k++) L.flowers.push({ x: cx + (R() - 0.5) * 1.6, z: cz + (R() - 0.5) * 1.6, r: R() * 6, s: 0.8 + R() * 0.6, c: R() < 0.8 ? col : Math.floor(R() * 6) });
    }
    // fence arc behind the garden (gaps where something stands in the way)
    for (let a = -2.75; a <= -0.4; a += 0.036) {
      const r = 8.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (reserved.some((q) => Math.hypot(x - q.x, z - q.z) < q.r * 0.8)) { if (L.fence.length) L.fence[L.fence.length - 1].gapAfter = true; continue; }
      const prev = L.fence[L.fence.length - 1];
      L.fence.push({ x, z, r: -(a + Math.PI / 2), h: 0.9 + ((L.fence.length % 2) ? 0.08 : 0), gap: !!(prev && prev.gapAfter) });
    }
    // mushrooms near a few trees, a mossy log
    for (const t of L.trees.slice(0, 4)) for (let k = 0; k < 3; k++) {
      const a = R() * Math.PI * 2;
      L.mushrooms.push({ x: t.x + Math.cos(a) * (1.2 + R() * 0.6), z: t.z + Math.sin(a) * (1.2 + R() * 0.6), r: R() * 6, s: 0.8 + R() * 0.8 });
    }
    L.logs.push({ x: -10.2, z: 3.2, r: 0.4 });
    L.shadows.push({ x: HIVE_POS.x + 0.2, z: HIVE_POS.z - 0.1, s: 2.6 });
    this.reserved = reserved;
    return L;
  }

  _grassDensity(x, z) {
    const a = Math.atan2(z, x / 1.12), r = Math.hypot(x / 1.12, z), Rr = islandRadius(a);
    if (r > Rr * 0.97) return 0;
    if ((x - POND.x) ** 2 / (POND.rx + 0.15) ** 2 + (z - POND.z) ** 2 / (POND.rz + 0.15) ** 2 < 1) return 0;
    if (Math.hypot(x - HIVE_POS.x, z - HIVE_POS.z) < 0.9) return 0;
    for (const st of this.layout.stones) if (Math.hypot(x - st.x, z - st.z) < st.s * 0.95) return 0;
    for (const t of this.layout.trees) if (Math.hypot(x - t.x, z - t.z) < 0.35 * t.s) return 0;
    // denser near the garden, a little sparser toward the rim
    return r < 13 ? 1 : 1 - ((r - 13) / (Rr - 13)) * 0.45;
  }

  _pond() {
    const g = new THREE.CircleGeometry(1, 48);
    g.rotateX(-Math.PI / 2);
    g.scale(POND.rx + 0.15, 1, POND.rz + 0.15);
    this.water = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSky: { value: new THREE.Color('#bfe6ff') }, uDeep: { value: new THREE.Color('#1f6f88') }, uShallow: { value: new THREE.Color('#5ec2c9') } },
      vertexShader: 'varying vec3 vW; varying vec2 vL; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vL = position.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uSky; uniform vec3 uDeep; uniform vec3 uShallow;
        varying vec3 vW; varying vec2 vL;
        void main(){
          vec2 e = vL / vec2(${(POND.rx + 0.15).toFixed(2)}, ${(POND.rz + 0.15).toFixed(2)});
          float edge = length(e);
          float r1 = sin(vW.x * 3.1 + uTime * 1.2) * sin(vW.z * 3.7 - uTime * 0.9);
          float r2 = sin((vW.x - vW.z) * 6.0 + uTime * 2.1) * 0.5;
          float ripple = r1 * 0.6 + r2 * 0.4;
          vec3 c = mix(uDeep, uShallow, smoothstep(0.2, 1.0, edge) * 0.8 + ripple * 0.06);
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(0.0, V.y), 3.0);
          c = mix(c, uSky, 0.25 + fres * 0.45);
          c += vec3(1.0) * smoothstep(0.86, 0.98, 0.5 + 0.5 * ripple) * 0.25;
          float foam = smoothstep(0.86, 0.97, edge) * (0.6 + 0.4 * sin(atan(e.y, e.x) * 12.0 + uTime * 1.5));
          c = mix(c, vec3(0.95, 1.0, 1.0), foam * 0.55);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.water.position.set(POND.x, 0.035, POND.z);
    this.scene.add(this.water);
    const basin = new THREE.RingGeometry(0.95, 1.12, 48); basin.rotateX(-Math.PI / 2); basin.scale(POND.rx + 0.15, 1, POND.rz + 0.15);
    const bm = new THREE.Mesh(basin, new THREE.MeshStandardMaterial({ color: '#6b5a3e', roughness: 1 }));
    bm.position.set(POND.x, 0.03, POND.z);
    this.scene.add(bm);
  }

  _rainbow() {
    const g = new THREE.TorusGeometry(60, 4.2, 8, 80, Math.PI);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uA; varying vec3 vP;
        vec3 hsv(float h){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return k; }
        void main(){
          float r = length(vP.xy);
          float t = clamp((r - 55.8) / 8.4, 0.0, 1.0);
          vec3 c = hsv(0.83 * (1.0 - t));
          float edge = smoothstep(0.0, 0.2, t) * smoothstep(1.0, 0.8, t);
          gl_FragColor = vec4(c, uA * 0.5 * edge);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    });
    this.rainbowMesh = new THREE.Mesh(g, mat);
    this.rainbowMesh.position.set(-6, -20, -70);
    this.rainbowMesh.visible = false;
    this.scene.add(this.rainbowMesh);
  }

  // a bed was built on this hex cell: clear its grass patch
  setPlotGrass(q, r, visible) { this.grass.setCell(key(q, r), visible); }

  setWeather(kind) { this.target = LOOKS[kind] || LOOKS.clear; this.weather = kind; }

  applyLook(snap = false, dt = 0) {
    const L = this.look, T = this.target;
    const k = snap ? 1 : 1 - Math.exp(-1.3 * dt);
    const mixC = (a, b) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
    for (const k2 of ['skyTop', 'skyHorizon', 'skyLow', 'sun', 'hemiSky', 'hemiGround', 'fog', 'cloud']) L[k2] = mixC(L[k2], T[k2]);
    for (const k2 of ['sunI', 'hemiI', 'env', 'stars', 'rainbow']) L[k2] = lerp(L[k2], T[k2], k);
    L.sunDir = L.sunDir.map((v, i) => lerp(v, T.sunDir[i], k));
    L.grass = [mixC(L.grass[0], T.grass[0]), mixC(L.grass[1], T.grass[1])];
    const u = this.sky.material.uniforms;
    u.uTop.value.set(L.skyTop); u.uHorizon.value.set(L.skyHorizon); u.uLow.value.set(L.skyLow);
    u.uStars.value = L.stars;
    this.sun.color.set(L.sun); this.sun.intensity = L.sunI;
    this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.hemiGround); this.hemi.intensity = L.hemiI;
    this.fog.color.set(L.fog);
    this.scene.environmentIntensity = L.env;
    const d = new THREE.Vector3(...L.sunDir).normalize();
    u.uSunDir.value.copy(d);
    this.sun.position.copy(d).multiplyScalar(30);
    this.sun.target.position.set(0, 0, 0);
    this.rainbowMesh.material.uniforms.uA.value = L.rainbow;
    this.rainbowMesh.visible = L.rainbow > 0.01;
    this.grass?.setColors(L.grass[0], L.grass[1]);
    this.island?.setCloudTint(L.cloud);
    if (this.water) this.water.material.uniforms.uSky.value.set(L.skyHorizon);
  }

  update(dt, time) {
    this.time = time;
    this.applyLook(false, dt);
    this.sky.material.uniforms.uTime.value = time;
    this.island.update(dt, time);
    this.grass.update(time, this.weather === 'rain' ? 1.8 : 1);
    this.water.material.uniforms.uTime.value = time;
    this.hive.children[0].rotation.z = Math.sin(time * 0.8) * 0.01;
    this.decor.update(dt, time, this.look.stars);
  }

  setShadows(on) { this.sun.castShadow = !!on; }
}

// world → hex cell key (only well inside a cell, so the grass gaps between beds stay green)
function cellOf(x, z) {
  const q = (2 / 3) * x, r = (-1 / 3) * x + (Math.sqrt(3) / 3) * z;
  let rx = Math.round(q), rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dy = Math.abs(ry - (-q - r)), dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (!(dy > dz)) rz = -rx - ry;
  if (Math.max(Math.abs(rx), Math.abs(rz), Math.abs(rx + rz)) > GARDEN_RADIUS) return null;
  const c = hexToWorld(rx, rz, 1);
  if (Math.hypot(x - c.x, z - c.z) > 0.93) return null;
  return key(rx, rz);
}

// straw skep hive on a stump, with an entrance facing the garden
function makeHive() {
  const grp = new THREE.Group();
  const body = new THREE.Group();
  grp.add(body);
  const strawMat = new THREE.MeshStandardMaterial({ map: strawTexture(), roughness: 0.85, color: '#ffffff' });
  const ridges = 6;
  for (let i = 0; i < ridges; i++) {
    const t = i / ridges;
    const r = 0.78 * Math.cos(t * Math.PI * 0.46) + 0.06;
    const tor = new THREE.TorusGeometry(r, 0.14 - t * 0.03, 10, 28);
    tor.rotateX(Math.PI / 2);
    tor.translate(0, 0.62 + i * 0.22, 0);
    body.add(new THREE.Mesh(tor, strawMat));
  }
  const cap = new THREE.SphereGeometry(0.34, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(0, 0.62 + ridges * 0.22 - 0.1, 0);
  const core = new THREE.CylinderGeometry(0.62, 0.8, 1.3, 24);
  core.translate(0, 1.1, 0);
  body.add(new THREE.Mesh(merge([cap, core]), new THREE.MeshStandardMaterial({ color: '#d69b3e', roughness: 0.9 })));
  const holeM = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: '#2a170a' }));
  holeM.position.set(0, 0.78, 0.86);
  holeM.rotation.x = -0.12;
  body.add(holeM);
  const board = new THREE.BoxGeometry(0.42, 0.04, 0.2); board.translate(0, 0.66, 0.9);
  body.add(new THREE.Mesh(board, new THREE.MeshStandardMaterial({ color: '#b07a4a', roughness: 0.8 })));
  const stump = new THREE.CylinderGeometry(0.72, 0.9, 0.5, 18);
  stump.translate(0, 0.25, 0);
  tint(stump, '#8a5a3b');
  const top = new THREE.CylinderGeometry(0.73, 0.73, 0.04, 18);
  top.translate(0, 0.51, 0);
  tint(top, '#e3c08e');
  grp.add(new THREE.Mesh(merge([stump, top]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  grp.scale.setScalar(0.95);
  return grp;
}

export { LOOKS, terrainHeight };
