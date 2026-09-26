// The garden world: sky, light, lawn, honeycomb terrace, props (hive, trees, hedges, pond, path, wildflowers,
// grass, clouds) and the weather looks (clear / rain / golden hour / night / rainbow) blended over a few seconds.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { damp, rng, lerp } from '../core/math.js';
import { roundedHexPrism, bushGeometry, treeGeometries, grassTuftGeometry, rockGeometry, merge, tint, gradient } from './geometry.js';
import { hexToWorld, shapeHexagon } from '../game/hex.js';
import { HIVE_POS, GARDEN_RADIUS } from '../game/garden.js';

// weather looks
const LOOKS = {
  clear: { skyTop: '#5fb4ff', skyHorizon: '#d9f1ff', ground: '#6f9c45', sun: '#fff3dc', sunI: 2.1, hemiSky: '#d8ecff', hemiGround: '#7a9a4e', hemiI: 1.05, fog: '#cfeaf7', env: 0.45, stars: 0, rainbow: 0, sunDir: [0.55, 1, 0.42] },
  rain: { skyTop: '#7d93a8', skyHorizon: '#c3d0d9', ground: '#5b7f43', sun: '#dfe9f2', sunI: 0.9, hemiSky: '#b9c8d6', hemiGround: '#5f7a48', hemiI: 1.25, fog: '#b9c7d1', env: 0.35, stars: 0, rainbow: 0, sunDir: [0.3, 1, 0.3] },
  golden: { skyTop: '#ff9f68', skyHorizon: '#ffd9a0', ground: '#7d9444', sun: '#ffc680', sunI: 2.4, hemiSky: '#ffd6a8', hemiGround: '#7a7a44', hemiI: 1.05, fog: '#f7d3a8', env: 0.5, stars: 0, rainbow: 0, sunDir: [-0.9, 0.55, 0.3] },
  night: { skyTop: '#0f1640', skyHorizon: '#2d3a78', ground: '#3b5a44', sun: '#9fb4ff', sunI: 0.75, hemiSky: '#5a6ab8', hemiGround: '#243a3a', hemiI: 0.8, fog: '#26336a', env: 0.25, stars: 1, rainbow: 0, sunDir: [0.4, 1, -0.3] },
  rainbow: { skyTop: '#58b8ff', skyHorizon: '#e6f7ff', ground: '#71a247', sun: '#fff7e6', sunI: 2.2, hemiSky: '#e2f1ff', hemiGround: '#7da150', hemiI: 1.1, fog: '#dbf1fa', env: 0.5, stars: 0, rainbow: 1, sunDir: [0.5, 1, 0.5] },
};

const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }';
const SKY_FRAG = /* glsl */`
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform float uStars; uniform float uTime; uniform vec3 uSunDir;
  varying vec3 vDir;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(41.7, 289.3))) * 43758.5453); }
  void main(){
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 c = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.75, y), 0.8));
    c = mix(c, uGround, smoothstep(0.0, -0.12, y));
    // sun glow
    float sd = max(0.0, dot(d, normalize(uSunDir)));
    c += vec3(1.0, 0.9, 0.7) * pow(sd, 48.0) * 0.6 * (1.0 - uStars);
    // stars
    if (uStars > 0.01 && y > 0.05) {
      vec2 g = vec2(atan(d.z, d.x) * 60.0, y * 120.0);
      vec2 cell = floor(g);
      float s = step(0.965, h21(cell));
      vec2 f = fract(g) - 0.5;
      float tw = 0.6 + 0.4 * sin(uTime * 2.0 + h21(cell + 7.0) * 40.0);
      c += vec3(1.0, 0.97, 0.9) * s * smoothstep(0.18, 0.0, length(f)) * uStars * tw * smoothstep(0.05, 0.3, y);
    }
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

export class World {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.q = quality;
    this.look = { ...LOOKS.clear };
    this.target = LOOKS.clear;
    this.time = 0;
    this.decorObjects = {};
    this.R = rng(7);
    this._lights();
    this._env();
    this._sky();
    this._ground();
    this._terrace();
    this._props();
    this._clouds();
    this._rainbow();
    this.applyLook(true);
  }

  _lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#d8ecff', '#7a9a4e', 1.05);
    s.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff3dc', 2.1));
    sun.castShadow = !!this.q.shadows;
    const size = this.q.shadowSize || 1024;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -9.5; cam.right = 9.5; cam.top = 9.5; cam.bottom = -9.5; cam.near = 1; cam.far = 40;
    sun.shadow.radius = 2.5;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.025;
    s.add(sun); s.add(sun.target);
    this.fog = s.fog = new THREE.Fog('#cfeaf7', 26, 70);
  }

  _env() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = new RoomEnvironment();
    this.envTex = pm.fromScene(env, 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.45;
    env.dispose?.();
    pm.dispose();
  }

  _sky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
        uStars: { value: 0 }, uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.5, 1, 0.4) },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // big lawn: vertex-coloured patches + a procedural blade texture, rolling gently into hills far away
  _ground() {
    const g = new THREE.CircleGeometry(90, 96, 0, Math.PI * 2);
    g.rotateX(-Math.PI / 2);
    // add rings for smooth hills: CircleGeometry only has a fan, so rebuild as a polar grid
    const polar = new THREE.BufferGeometry();
    const pos = [], col = [], uv = [], idx = [];
    const RINGS = 36, SEG = 72, R = rng(3);
    const c0 = new THREE.Color('#79a94a'), c1 = new THREE.Color('#5d9440'), c2 = new THREE.Color('#9ac25a'), c = new THREE.Color();
    const noise = (x, z) => Math.sin(x * 0.35 + Math.sin(z * 0.21) * 2) * 0.5 + Math.sin(z * 0.31 + x * 0.12) * 0.5;
    for (let r = 0; r <= RINGS; r++) {
      const rad = Math.pow(r / RINGS, 1.6) * 90;
      for (let sgm = 0; sgm <= SEG; sgm++) {
        const a = (sgm / SEG) * Math.PI * 2;
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        const hill = rad > 16 ? Math.pow((rad - 16) / 40, 1.5) * (2.4 + 2.2 * noise(x * 0.4, z * 0.4)) : 0;
        pos.push(x, -0.02 + hill, z);
        const n = noise(x, z) * 0.5 + 0.5, n2 = R();
        c.copy(c0).lerp(c1, n * 0.7).lerp(c2, Math.max(0, n2 - 0.7) * 1.2);
        col.push(c.r, c.g, c.b);
        uv.push(x / 3, z / 3);
      }
    }
    for (let r = 0; r < RINGS; r++) {
      for (let sgm = 0; sgm < SEG; sgm++) {
        const a = r * (SEG + 1) + sgm, b = a + 1, d = a + SEG + 1, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    polar.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    polar.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    polar.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    polar.setIndex(idx);
    polar.computeVertexNormals();
    g.dispose();
    const tex = grassTexture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95 });
    this.ground = new THREE.Mesh(polar, mat);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  // honeycomb terrace: a slightly raised grassy platform with a stone rim under the whole garden
  _terrace() {
    const cells = shapeHexagon(GARDEN_RADIUS);
    const slab = roundedHexPrism({ radius: 1.08, height: 0.12, corner: 0.2, bevel: 0.05 });
    slab.translate(0, -0.1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#6f9e45', roughness: 1 });
    const inst = new THREE.InstancedMesh(slab, mat, cells.length);
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => { const p = hexToWorld(c.q, c.r, 1); m.makeTranslation(p.x, 0, p.z); inst.setMatrixAt(i, m); });
    inst.receiveShadow = true;
    this.scene.add(inst);
    // rim stones around the terrace outline
    const R = rng(11), stones = [];
    const outer = cells.filter((c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(-c.q - c.r)) === GARDEN_RADIUS);
    for (const c of outer) {
      const p = hexToWorld(c.q, c.r, 1), len = Math.hypot(p.x, p.z);
      for (let k = 0; k < 3; k++) {
        const a = Math.atan2(p.z, p.x) + (k - 1) * 0.16;
        const rr = len + 1.05 + R() * 0.08;
        stones.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, s: 0.22 + R() * 0.1, r: R() * 6 });
      }
    }
    const sg = rockGeometry(5, 0.5);
    const sm = new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.9, flatShading: true });
    const si = new THREE.InstancedMesh(sg, sm, stones.length);
    const q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    stones.forEach((s, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.r); sv.set(s.s * 1.2, s.s, s.s); pv.set(s.x, -0.04, s.z); m.compose(pv, q, sv); si.setMatrixAt(i, m); });
    si.castShadow = true; si.receiveShadow = true;
    this.scene.add(si);
  }

  _props() {
    const s = this.scene, R = rng(21), q = this.q;
    const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const avoid = (x, z) => {
      // keep the camera-side (front, +z) and the garden itself clear
      const r = Math.hypot(x, z);
      if (r < 7.2) return true;
      if (z > 3 && Math.abs(x) < 9) return true;
      if (Math.hypot(x - HIVE_POS.x, z - HIVE_POS.z) < 1.6) return true;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.8) return true;
      return false;
    };
    // --- hive
    this.hive = makeHive();
    this.hive.position.set(HIVE_POS.x, 0, HIVE_POS.z);
    this.hive.rotation.y = 0.75;
    s.add(this.hive);
    // --- trees
    const { trunk, canopy } = treeGeometries(4);
    const trees = [];
    for (let i = 0; i < 60 && trees.length < 16; i++) {
      const a = -Math.PI * 0.95 + R() * Math.PI * 1.3 - Math.PI * 0.05;
      const r = 10 + R() * 9;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9 - 1;
      if (avoid(x, z) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) continue;
      trees.push({ x, z, s: 1.1 + R() * 0.8, r: R() * 6 });
    }
    const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), trees.length);
    const cm = new THREE.InstancedMesh(canopy, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), trees.length);
    const leaf = ['#4fa84a', '#3f9a47', '#62b651', '#56a24c', '#7cc05a'];
    trees.forEach((t, i) => {
      qq.setFromAxisAngle(up, t.r); sv.set(t.s, t.s, t.s); pv.set(t.x, 0, t.z);
      m.compose(pv, qq, sv);
      tm.setMatrixAt(i, m); cm.setMatrixAt(i, m);
      cm.setColorAt(i, new THREE.Color(leaf[i % leaf.length]));
    });
    for (const o of [tm, cm]) { o.castShadow = true; o.receiveShadow = true; s.add(o); }
    this.treeCanopy = cm;
    // --- hedges / bushes ring
    const bushGeo = bushGeometry(9, 0.6, '#2f7d3c', '#5fbf5a');
    const bushes = [];
    for (let i = 0; i < 90 && bushes.length < 30; i++) {
      const a = R() * Math.PI * 2, r = 7.4 + R() * 3.5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (avoid(x, z) && r < 7.4) continue;
      if (z > 2.5 && Math.abs(x) < 8.5) continue;
      if (Math.hypot(x - HIVE_POS.x, z - HIVE_POS.z) < 1.4) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.6) continue;
      bushes.push({ x, z, s: 0.8 + R() * 0.9, r: R() * 6 });
    }
    const bm = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), bushes.length);
    bushes.forEach((b, i) => { qq.setFromAxisAngle(up, b.r); sv.set(b.s, b.s * 0.85, b.s); pv.set(b.x, 0, b.z); m.compose(pv, qq, sv); bm.setMatrixAt(i, m); });
    bm.castShadow = true; bm.receiveShadow = true;
    s.add(bm);
    // --- rocks
    const rocks = [];
    for (let i = 0; i < 40 && rocks.length < 10; i++) {
      const a = R() * Math.PI * 2, r = 7.5 + R() * 8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (avoid(x, z)) continue;
      rocks.push({ x, z, s: 0.35 + R() * 0.5, r: R() * 6 });
    }
    const rm = new THREE.InstancedMesh(rockGeometry(8, 0.6), new THREE.MeshStandardMaterial({ color: '#a9a397', roughness: 0.92, flatShading: true }), rocks.length);
    rocks.forEach((b, i) => { qq.setFromAxisAngle(up, b.r); sv.set(b.s, b.s, b.s); pv.set(b.x, -0.05, b.z); m.compose(pv, qq, sv); rm.setMatrixAt(i, m); });
    rm.castShadow = true; rm.receiveShadow = true;
    s.add(rm);
    // --- pond with lily pads
    this.pond = makePond();
    this.pond.position.set(POND.x, 0, POND.z);
    s.add(this.pond);
    // --- stepping-stone path toward the camera
    const path = [];
    for (let k = 0; k < 7; k++) path.push({ x: Math.sin(k * 0.7) * 0.5, z: 6.2 + k * 1.05, s: 0.42 + R() * 0.08, r: R() * 6 });
    const pg = new THREE.CylinderGeometry(1, 1.04, 0.1, 9, 1);
    pg.translate(0, 0.02, 0);
    const pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: '#d7cfbf', roughness: 0.95 }), path.length);
    path.forEach((b, i) => { qq.setFromAxisAngle(up, b.r); sv.set(b.s * 1.1, 1, b.s * 0.85); pv.set(b.x, 0, b.z); m.compose(pv, qq, sv); pm.setMatrixAt(i, m); });
    pm.receiveShadow = true;
    s.add(pm);
    // --- grass tufts
    const tuft = grassTuftGeometry();
    const n = Math.round(420 * (q.grass ?? 1));
    const gm = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), n);
    let placed = 0;
    for (let i = 0; i < n * 4 && placed < n; i++) {
      const a = R() * Math.PI * 2, r = 5.2 + Math.pow(R(), 0.8) * 16;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r < 6.9 && Math.abs(Math.atan2(z, x)) < 10) { /* inside terrace ring: skip most */ if (R() < 0.85) continue; }
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r) continue;
      const sc = 0.7 + R() * 0.9;
      qq.setFromAxisAngle(up, R() * 6); sv.set(sc, sc * (0.8 + R() * 0.6), sc); pv.set(x, 0, z);
      m.compose(pv, qq, sv); gm.setMatrixAt(placed++, m);
    }
    gm.count = placed;
    gm.receiveShadow = true;
    s.add(gm);
    // --- wildflowers dotted in the lawn
    const wf = wildflowerGeometry();
    const wn = Math.round(120 * (q.grass ?? 1));
    const wm = new THREE.InstancedMesh(wf, new THREE.MeshStandardMaterial({ roughness: 0.6 }), wn);
    const wcols = ['#ffffff', '#ffd84d', '#ff8fc4', '#b99bff', '#8fd3ff', '#ff9f5a'];
    let wp = 0;
    for (let i = 0; i < wn * 5 && wp < wn; i++) {
      const a = R() * Math.PI * 2, r = 7 + Math.pow(R(), 0.7) * 14;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.3) continue;
      const sc = 0.6 + R() * 0.6;
      qq.setFromAxisAngle(up, R() * 6); sv.set(sc, sc, sc); pv.set(x, 0, z);
      m.compose(pv, qq, sv); wm.setMatrixAt(wp, m);
      wm.setColorAt(wp, new THREE.Color(wcols[wp % wcols.length]));
      wp++;
    }
    wm.count = wp;
    s.add(wm);
  }

  _clouds() {
    this.clouds = new THREE.Group();
    const R = rng(33);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.35, flatShading: true, fog: false });
    for (let i = 0; i < 9; i++) {
      const parts = [];
      const n = 4 + R.int(4);
      for (let k = 0; k < n; k++) {
        const r = 1.6 + R() * 1.8;
        const sgeo = new THREE.IcosahedronGeometry(r, 1);
        sgeo.translate((k - n / 2) * 2.1 + R(), R() * 1.2, R() * 1.5);
        parts.push(sgeo);
      }
      const cl = new THREE.Mesh(merge(parts), mat);
      cl.scale.set(1, 0.55, 0.8);
      const a = -Math.PI * 0.5 + (i / 9 - 0.5) * Math.PI * 1.3;
      const r = 55 + R() * 20;
      cl.position.set(Math.cos(a) * r, 14 + R() * 12, Math.sin(a) * r * 0.8 - 20);
      cl.userData.speed = 0.3 + R() * 0.4;
      this.clouds.add(cl);
    }
    this.cloudMat = mat;
    this.scene.add(this.clouds);
  }

  _rainbow() {
    const g = new THREE.TorusGeometry(46, 3.2, 8, 80, Math.PI);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uA; varying vec3 vP;
        vec3 hsv(float h){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return k; }
        void main(){
          float r = length(vP.xy);
          float t = clamp((r - 42.8) / 6.4, 0.0, 1.0);
          vec3 c = hsv(0.83 * (1.0 - t));
          float edge = smoothstep(0.0, 0.2, t) * smoothstep(1.0, 0.8, t);
          gl_FragColor = vec4(c, uA * 0.55 * edge);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    });
    this.rainbowMesh = new THREE.Mesh(g, mat);
    this.rainbowMesh.position.set(-4, -6, -62);
    this.rainbowMesh.visible = false;
    this.scene.add(this.rainbowMesh);
  }

  setWeather(kind) { this.target = LOOKS[kind] || LOOKS.clear; this.weather = kind; }

  applyLook(snap = false, dt = 0) {
    const L = this.look, T = this.target;
    const k = snap ? 1 : 1 - Math.exp(-1.3 * dt);
    const mixC = (a, b) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
    for (const key of ['skyTop', 'skyHorizon', 'ground', 'sun', 'hemiSky', 'hemiGround', 'fog']) L[key] = mixC(L[key], T[key]);
    for (const key of ['sunI', 'hemiI', 'env', 'stars', 'rainbow']) L[key] = lerp(L[key], T[key], k);
    L.sunDir = L.sunDir.map((v, i) => lerp(v, T.sunDir[i], k));
    const u = this.sky.material.uniforms;
    u.uTop.value.set(L.skyTop); u.uHorizon.value.set(L.skyHorizon); u.uGround.value.set(L.fog);
    u.uStars.value = L.stars;
    this.sun.color.set(L.sun); this.sun.intensity = L.sunI;
    this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.hemiGround); this.hemi.intensity = L.hemiI;
    this.fog.color.set(L.fog);
    this.scene.environmentIntensity = L.env;
    const d = new THREE.Vector3(...L.sunDir).normalize();
    u.uSunDir.value.copy(d);
    this.sun.position.copy(d).multiplyScalar(18);
    this.sun.target.position.set(0, 0, 0);
    this.rainbowMesh.material.uniforms.uA.value = L.rainbow;
    this.rainbowMesh.visible = L.rainbow > 0.01;
    this.cloudMat.emissiveIntensity = 0.35 * (1 - L.stars) + 0.05;
    this.cloudMat.color.set(L.stars > 0.5 ? '#8c95c8' : '#ffffff');
  }

  update(dt, time) {
    this.time = time;
    this.applyLook(false, dt);
    this.sky.material.uniforms.uTime.value = time;
    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 80) c.position.x = -80;
    }
    // pond shimmer
    if (this.pond.userData.water) this.pond.userData.water.material.uniforms.uTime.value = time;
    // hive bob
    this.hive.children[0].rotation.z = Math.sin(time * 0.8) * 0.01;
  }

  setShadows(on) {
    this.sun.castShadow = !!on;
  }
}

const POND = { x: 7.6, z: -3.8, r: 2.2 };

function grassTexture() {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#d9ecc5';
  g.fillRect(0, 0, S, S);
  const R = rng(99);
  for (let i = 0; i < 1800; i++) {
    const x = R() * S, y = R() * S, l = 3 + R() * 7, a = -Math.PI / 2 + (R() - 0.5) * 0.9;
    const v = 170 + R() * 85;
    g.strokeStyle = `rgba(${v * 0.82 | 0},${v | 0},${v * 0.7 | 0},${0.35 + R() * 0.4})`;
    g.lineWidth = 1 + R() * 1.2;
    g.beginPath();
    for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
      g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
    }
    g.stroke();
  }
  // soft light patches
  for (let i = 0; i < 18; i++) {
    const x = R() * S, y = R() * S, r = 20 + R() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,230,0.18)'); grd.addColorStop(1, 'rgba(255,255,230,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return new THREE.CanvasTexture(cv);
}

function wildflowerGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.SphereGeometry(0.05, 6, 4);
    p.scale(1, 0.3, 1.6);
    p.translate(0, 0.16, 0.06);
    p.rotateY((i / 5) * Math.PI * 2);
    parts.push(p);
  }
  const c = new THREE.SphereGeometry(0.03, 6, 4); c.translate(0, 0.17, 0);
  const st = new THREE.CylinderGeometry(0.008, 0.01, 0.16, 4); st.translate(0, 0.08, 0);
  return merge([...parts, c, st]);
}

// cute straw skep hive on a stump, with an entrance hole facing the garden
function makeHive() {
  const grp = new THREE.Group();
  const body = new THREE.Group();
  grp.add(body);
  const ridges = 6;
  for (let i = 0; i < ridges; i++) {
    const t = i / ridges;
    const r = 0.78 * Math.cos(t * Math.PI * 0.46) + 0.06;
    const tor = new THREE.TorusGeometry(r, 0.13 - t * 0.03, 8, 24);
    tor.rotateX(Math.PI / 2);
    tor.translate(0, 0.62 + i * 0.22, 0);
    tint(tor, i % 2 ? '#e7b04d' : '#f0c160', 0.06, i);
    body.add(new THREE.Mesh(tor, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
  }
  const cap = new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(0, 0.62 + ridges * 0.22 - 0.1, 0);
  tint(cap, '#edb752');
  const core = new THREE.CylinderGeometry(0.62, 0.8, 1.3, 20);
  core.translate(0, 1.1, 0);
  tint(core, '#dca345');
  body.add(new THREE.Mesh(merge([cap, core]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  const hole = new THREE.CircleGeometry(0.16, 16);
  const holeM = new THREE.Mesh(hole, new THREE.MeshBasicMaterial({ color: '#3a2412' }));
  holeM.position.set(0, 0.78, 0.83);
  holeM.rotation.x = -0.12;
  body.add(holeM);
  const stump = new THREE.CylinderGeometry(0.72, 0.85, 0.5, 16);
  stump.translate(0, 0.25, 0);
  tint(stump, '#8a5a3b');
  const top = new THREE.CylinderGeometry(0.73, 0.73, 0.04, 16);
  top.translate(0, 0.51, 0);
  tint(top, '#e3c08e');
  grp.add(new THREE.Mesh(merge([stump, top]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  grp.scale.setScalar(0.95);
  return grp;
}

function makePond() {
  const grp = new THREE.Group();
  const rim = [];
  const R = rng(55);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, rr = POND.r + 0.15 + R() * 0.1;
    const st = rockGeometry(40 + i, 0.3 + R() * 0.12);
    st.translate(Math.cos(a) * rr, -0.06, Math.sin(a) * rr * 0.8);
    rim.push(st);
  }
  const rimMesh = new THREE.Mesh(merge(rim), new THREE.MeshStandardMaterial({ color: '#b8b0a2', roughness: 0.9, flatShading: true }));
  rimMesh.castShadow = true; rimMesh.receiveShadow = true;
  grp.add(rimMesh);
  const wg = new THREE.CircleGeometry(POND.r + 0.1, 40);
  wg.rotateX(-Math.PI / 2);
  wg.scale(1, 1, 0.8);
  const water = new THREE.Mesh(wg, new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vW;
      void main(){
        float r = sin(vW.x * 3.0 + uTime * 1.3) * sin(vW.z * 3.4 - uTime * 1.1);
        float r2 = sin((vW.x + vW.z) * 5.0 + uTime * 2.0);
        vec3 deep = vec3(0.16, 0.5, 0.62), shallow = vec3(0.45, 0.8, 0.85);
        vec3 c = mix(deep, shallow, 0.5 + 0.25 * r + 0.1 * r2);
        c += vec3(1.0) * smoothstep(0.82, 0.98, 0.5 + 0.5 * r * r2) * 0.35;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  water.position.y = 0.02;
  grp.add(water);
  grp.userData.water = water;
  // lily pads
  const pads = [];
  for (let i = 0; i < 5; i++) {
    const pg = new THREE.CircleGeometry(0.28 + R() * 0.12, 14, 0.4, Math.PI * 2 - 0.5);
    pg.rotateX(-Math.PI / 2);
    pg.rotateY(R() * 6);
    const a = R() * Math.PI * 2, rr = R() * POND.r * 0.7;
    pg.translate(Math.cos(a) * rr, 0.04, Math.sin(a) * rr * 0.8);
    tint(pg, '#4caa4a');
    pads.push(pg);
  }
  const padMesh = new THREE.Mesh(merge(pads), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
  padMesh.receiveShadow = true;
  grp.add(padMesh);
  return grp;
}

export { LOOKS, POND };
