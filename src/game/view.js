// GardenView: turns the Garden simulation into the 3D scene — beds, plants, seed bubbles, bees — and owns the
// camera framing and picking. It never changes game state; it only reads it and animates.
import * as THREE from 'three';
import { roundedHexPrism } from '../gfx/geometry.js';
import { Flowers } from '../gfx/flowers.js';
import { Bees, Butterflies } from '../gfx/critters.js';
import { COLORS, M } from './genetics.js';
import { hexToWorld, key } from './hex.js';
import { HIVE_POS } from './garden.js';
import { damp, clamp, ease, rng, smoothstep, lerp } from '../core/math.js';

const FLOWER_H = 0.78;              // stem height of a grown flower
const BED_TOP = 0.2;                // soil surface height

function soilTexture() {
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#6b4a33'; g.fillRect(0, 0, S, S);
  const R = rng(5);
  for (let i = 0; i < 900; i++) {
    const v = R();
    g.fillStyle = v < 0.5 ? `rgba(60,38,24,${0.3 + R() * 0.4})` : `rgba(150,112,80,${0.15 + R() * 0.3})`;
    const r = 0.6 + R() * 1.8;
    g.beginPath(); g.arc(R() * S, R() * S, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// seed bubble: glassy orb (fresnel, additive) around a little seed in the child's colour
const orbGeo = new THREE.SphereGeometry(0.34, 20, 14);
const seedGeo = (() => { const g = new THREE.SphereGeometry(0.12, 12, 8); g.scale(0.75, 1, 0.75); return g; })();
function orbMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uA; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - max(0.0, dot(normalize(vN), normalize(vV))), 2.2);
        vec3 c = mix(uColor * 0.35, vec3(1.0), 0.25) * 0.5 + uColor * f * 1.4 + vec3(1.0) * pow(f, 6.0) * 0.8;
        gl_FragColor = vec4(c, (0.18 + f * 0.8) * uA);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export class GardenView {
  constructor(scene, camera, garden, fx, quality) {
    this.scene = scene; this.camera = camera; this.garden = garden; this.fx = fx;
    this.time = 0;
    this.N = garden.plots.length;
    this.R = rng(3);
    // --- beds
    const rimGeo = roundedHexPrism({ radius: 0.94, height: 0.14, corner: 0.22, bevel: 0.05 });
    const soilGeo = roundedHexPrism({ radius: 0.8, height: BED_TOP, corner: 0.2, bevel: 0.07, bevelSegs: 3 });
    this.rims = new THREE.InstancedMesh(rimGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), this.N);
    this.soil = new THREE.InstancedMesh(soilGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', map: soilTexture(), roughness: 1 }), this.N);
    this.rims.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 3), 3);
    this.soil.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 3), 3);
    for (const m of [this.rims, this.soil]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
    this.pv = garden.plots.map((p, i) => ({
      grow: 0, stem: 0, head: 0, open: 0, pop: 0, harvestT: 0, bedK: p.owned ? 1 : 0, hover: 0, wet: 0, bump: 0,
      seed: this.R(), face: this.R() * Math.PI * 2, tilt: 0.28 + this.R() * 0.1, g: null, shown: false,
    }));
    this.flowers = new Flowers(scene, 48);
    this.bees = new Bees(scene, fx);
    this.butterflies = new Butterflies(scene, quality.particles >= 0.8 ? 4 : 2);
    this.orbs = new Map();
    this.hoverPlot = -1;
    this.highlightEmpty = false;
    this.tmpC = new THREE.Color();
    // camera framing state
    this.cam = { x: 0, z: 0, dist: 20, tx: 0, tz: 0, tdist: 20, el: 0.95 };
    this.safe = { left: 0, right: 0, top: 0, bottom: 0 };
    this.frame(true);
  }

  // ------------------------------------------------------------------------------------------ camera
  setSafeArea(s) { this.safe = s; this.frame(); }

  // fit owned + purchasable plots (+ flower height) inside the screen minus HUD insets
  frame(snap = false) {
    const g = this.garden;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    g.plots.forEach((p, i) => {
      if (!p.owned && (!g.canBuyPlot(i) || g.s.tutorial < 99)) return;   // new players: zoom on their own beds
      const w = g.pos[i];
      x0 = Math.min(x0, w.x - 1.35); x1 = Math.max(x1, w.x + 1.35); z0 = Math.min(z0, w.z - 1.2); z1 = Math.max(z1, w.z + 1.2);
    });
    const cam = this.camera, aspect = cam.aspect;
    const el = aspect < 0.8 ? 1.02 : 0.9;           // steeper on portrait phones so more rows fit
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const pts = [];
    for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, FLOWER_H + 0.5]) pts.push(new THREE.Vector3(x, y, z));
    const W = this.viewW || 1, H = this.viewH || 1, s = this.safe;
    // NDC bounds of the safe rectangle
    const nx0 = -1 + (2 * s.left) / W, nx1 = 1 - (2 * s.right) / W, ny0 = -1 + (2 * s.bottom) / H, ny1 = 1 - (2 * s.top) / H;
    const test = (dist, ox, oz) => {
      this._place(cx + ox, cz + oz, dist, el);
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (const p of pts) { const q = p.clone().project(cam); a = Math.min(a, q.x); b = Math.max(b, q.x); c = Math.min(c, q.y); d = Math.max(d, q.y); }
      return { a, b, c, d };
    };
    let ox = 0, oz = 0, dist = 20;
    for (let it = 0; it < 3; it++) {
      let lo = 4, hi = 80;
      for (let k = 0; k < 22; k++) {
        const mid = (lo + hi) / 2, r = test(mid, ox, oz);
        const fits = r.b - r.a <= (nx1 - nx0) * 0.98 && r.d - r.c <= (ny1 - ny0) * 0.98;
        if (fits) hi = mid; else lo = mid;
      }
      dist = hi;
      // shift so the projected box is centred in the safe rect
      const r = test(dist, ox, oz);
      const dxN = (nx0 + nx1) / 2 - (r.a + r.b) / 2, dyN = (ny0 + ny1) / 2 - (r.c + r.d) / 2;
      const halfH = Math.tan((cam.fov * Math.PI) / 360) * dist, halfW = halfH * aspect;
      ox -= dxN * halfW;
      oz += dyN * halfH / Math.sin(el);
    }
    const c = this.cam;
    c.tx = cx + ox; c.tz = cz + oz; c.tdist = dist; c.el = el;
    if (snap) { c.x = c.tx; c.z = c.tz; c.dist = c.tdist; }
    this._place(c.x, c.z, c.dist, c.el);
  }

  _place(x, z, dist, el, sway = 0) {
    const cam = this.camera;
    cam.position.set(x + Math.sin(sway) * dist * Math.cos(el), Math.sin(el) * dist, z + Math.cos(sway) * dist * Math.cos(el));
    cam.lookAt(x, 0, z);
    cam.updateMatrixWorld(true);
  }

  resize(w, h) {
    this.viewW = w; this.viewH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.frame(true);
  }

  // ------------------------------------------------------------------------------------------ picking
  project(x, y, z, out = { x: 0, y: 0, vis: true }) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.viewW; out.y = (-v.y * 0.5 + 0.5) * this.viewH; out.vis = v.z < 1;
    return out;
  }
  headPos(i) { const w = this.garden.pos[i], pv = this.pv[i]; return { x: w.x, y: BED_TOP + pv.stem + 0.08, z: w.z }; }
  headY(i) { return BED_TOP + this.pv[i].stem + 0.05; }

  // plot under a screen point: flower heads first (they stand above their bed in perspective), then the ground
  pickPlot(sx, sy) {
    let best = -1, bestD = Infinity;
    const pxPerUnit = this.viewH / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.cam.dist);
    this.pv.forEach((pv, i) => {
      if (pv.head < 0.2) return;
      const h = this.headPos(i), p = this.project(h.x, h.y, h.z);
      const r = Math.max(26, 0.5 * pv.head * pxPerUnit);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < r && d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) return best;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((sx / this.viewW) * 2 - 1, -(sy / this.viewH) * 2 + 1), this.camera);
    const t = (BED_TOP - ray.ray.origin.y) / ray.ray.direction.y;
    if (!(t > 0)) return -1;
    const x = ray.ray.origin.x + ray.ray.direction.x * t, z = ray.ray.origin.z + ray.ray.direction.z * t;
    // world → axial (flat-top, size 1)
    const q = (2 / 3) * x, r = (-1 / 3) * x + (Math.sqrt(3) / 3) * z;
    const idx = this.garden.byKey.get(key(...axialRound(q, r)));
    return idx === undefined ? -1 : idx;
  }

  pickSeed(sx, sy) {
    let best = null, bestD = 46;
    for (const [id, o] of this.orbs) {
      if (o.leaving) continue;
      const p = this.project(o.g.position.x, o.g.position.y, o.g.position.z);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------ events
  onEvent(name, p) {
    const pv = p && p.i !== undefined ? this.pv[p.i] : null;
    const w = p && p.i !== undefined ? this.garden.pos[p.i] : null;
    switch (name) {
      case 'plant': pv.stem = 0; pv.head = 0; pv.open = 0; pv.bump = 1; this.fx.dust(w.x, BED_TOP, w.z, 8); break;
      case 'bloom': pv.pop = 1; { const h = this.headPos(p.i); this.fx.sparkles(h.x, h.y, h.z, p.isNew ? '#fff4a8' : '#ffffff', p.isNew ? 16 : 6, 0.5); } break;
      case 'harvest': {
        pv.harvestT = 1;
        const h = this.headPos(p.i), c1 = COLORS[p.g.c1].hex, c2 = COLORS[p.g.c2 ?? p.g.c1].hex;
        this.fx.petals(h.x, h.y, h.z, p.g.pattern ? [c1, c2, c1] : [c1], 12);
        if (p.g.mut) this.fx.sparkles(h.x, h.y, h.z, mutColor(p.g.mut), 10, 0.5);
        break;
      }
      case 'dig': pv.bump = 1; this.fx.leaves(w.x, BED_TOP + 0.2, w.z, 10); this.fx.dust(w.x, BED_TOP, w.z, 6); break;
      case 'water': pv.wet = 1; this.fx.water(w.x, BED_TOP, w.z, 18); break;
      case 'mutate': { const h = this.headPos(p.i); this.fx.sparkles(h.x, h.y, h.z, mutColor(p.g.mut), 18, 0.6, 1.3); pv.pop = 0.6; break; }
      case 'plot': pv.bump = 1; this.fx.dust(w.x, 0.1, w.z, 14); this.fx.sparkles(w.x, 0.4, w.z, '#fff1b0', 12, 0.8); this.frame(); break;
      case 'seed': this._addOrb(p); break;
      case 'seedCollected': this._removeOrb(p.id); break;
      case 'bee:pollinate': { const h = this.headPos(p.i); this.fx.pollen(h.x, h.y + 0.1, h.z, 8); break; }
      default: break;
    }
  }

  _addOrb(seed) {
    const g = new THREE.Group();
    const color = COLORS[seed.g.c1].hex;
    const orb = new THREE.Mesh(orbGeo, orbMaterial(color));
    const inner = new THREE.Mesh(seedGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.35 }));
    g.add(inner, orb);
    const from = this.headPos(seed.i);
    g.position.set(from.x, from.y, from.z);
    g.scale.setScalar(0.01);
    this.scene.add(g);
    this.orbs.set(seed.id, { g, orb, inner, i: seed.i, born: this.time, leaving: false, seed: this.R() * 10 });
    this.fx.sparkles(from.x, from.y + 0.2, from.z, color, 8, 0.4);
  }
  _removeOrb(id) {
    const o = this.orbs.get(id);
    if (!o) return;
    o.leaving = true; o.leaveT = 0;
  }
  orbScreen(id) { const o = this.orbs.get(id); return o ? this.project(o.g.position.x, o.g.position.y, o.g.position.z) : null; }

  // ------------------------------------------------------------------------------------------ frame
  update(dt, time) {
    this.time = time;
    const g = this.garden;
    // camera easing + a slow breathing sway so the diorama feels alive
    const c = this.cam;
    c.x = damp(c.x, c.tx, 3, dt); c.z = damp(c.z, c.tz, 3, dt); c.dist = damp(c.dist, c.tdist, 3, dt);
    this._place(c.x, c.z, c.dist, c.el, Math.sin(time * 0.11) * 0.035);
    this._beds(dt);
    this._plants(dt, time);
    this._orbs(dt, time);
    this.bees.update(dt, time, g.bees, g, (i) => this.headY(i), HIVE_POS);
    const spots = [];
    this.pv.forEach((pv, i) => { if (g.isBloom(i) && pv.open > 0.8) spots.push(this.headPos(i)); });
    this.butterflies.update(dt, time, spots);
  }

  _beds(dt) {
    const g = this.garden, m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = this.tmpC;
    const rimCol = new THREE.Color('#f1b85a'), rimGhost = new THREE.Color('#8fbf5e'), soilCol = new THREE.Color('#ffffff');
    for (let i = 0; i < this.N; i++) {
      const pv = this.pv[i], plot = g.plots[i], w = g.pos[i];
      const buyable = !plot.owned && g.canBuyPlot(i);
      pv.bedK = damp(pv.bedK, plot.owned ? 1 : buyable && g.s.tutorial >= 99 ? 0.35 : 0, 6, dt);
      pv.hover = damp(pv.hover, this.hoverPlot === i ? 1 : 0, 14, dt);
      pv.wet = Math.max(0, pv.wet - dt * 0.15);
      pv.bump = Math.max(0, pv.bump - dt * 3);
      const k = pv.bedK;
      const bump = 1 + Math.sin(pv.bump * Math.PI) * 0.12;
      // rim
      const rs = k < 0.02 ? 0 : (0.6 + 0.4 * k) * bump * (1 + pv.hover * 0.04);
      s.set(rs, plot.owned ? 1 : 0.5, rs); p.set(w.x, -0.02, w.z); q.identity();
      m.compose(p, q, s); this.rims.setMatrixAt(i, m);
      col.copy(plot.owned ? rimCol : rimGhost).multiplyScalar(1 + pv.hover * 0.25);
      this.rims.setColorAt(i, col);
      // soil (owned only)
      const ss = plot.owned ? k * bump : 0;
      s.set(ss, ss * (1 - pv.bump * 0.2), ss); p.set(w.x, 0, w.z);
      m.compose(p, q, s); this.soil.setMatrixAt(i, m);
      const glow = this.highlightEmpty && plot.owned && !plot.plant ? 0.18 + 0.12 * Math.sin(this.time * 5) : 0;
      col.copy(soilCol).multiplyScalar((1 - pv.wet * 0.35) * (1 + pv.hover * 0.22 + glow));
      if (glow) col.g += glow * 0.6;
      this.soil.setColorAt(i, col);
    }
    for (const mm of [this.rims, this.soil]) { mm.instanceMatrix.needsUpdate = true; mm.instanceColor.needsUpdate = true; }
  }

  _plants(dt, time) {
    const g = this.garden, F = this.flowers;
    F.begin();
    for (let i = 0; i < this.N; i++) {
      const pv = this.pv[i], plot = g.plots[i], pl = plot.plant, w = g.pos[i];
      let tStem = 0, tHead = 0, tOpen = 0;
      if (pl) {
        pv.g = pl.g;
        const giant = pl.g.mut === M.GIANT ? 1.45 : 1;
        if (pl.stage === 'bloom') { tStem = FLOWER_H * (giant > 1 ? 1.2 : 1); tHead = 1.18 * giant; tOpen = 1; }
        else {
          const k = clamp(pl.t / pl.dur, 0, 1);
          const sprout = smoothstep(0, 0.22, k), bud = smoothstep(0.18, 0.85, k), op = smoothstep(0.82, 1, k);
          tStem = FLOWER_H * (0.22 * sprout + 0.78 * bud);
          tHead = bud > 0.01 ? (0.34 + 0.74 * bud) * giant : 0;
          tOpen = 0.28 * op;
        }
      }
      // harvest: quick puff (head swells then snaps back to a bud), bloom: elastic pop open
      if (pv.harvestT > 0) {
        pv.harvestT = Math.max(0, pv.harvestT - dt * 3.2);
        const k = 1 - pv.harvestT;
        pv.head = k < 0.25 ? lerp(pv.head, tHead * 1.25 + 0.2, 0.5) : damp(pv.head, tHead, 12, dt);
        pv.open = damp(pv.open, tOpen, 10, dt);
      } else if (pv.pop > 0) {
        pv.pop = Math.max(0, pv.pop - dt * 1.4);
        const k = 1 - pv.pop;
        pv.open = lerp(0.3, tOpen, ease.outElastic(Math.min(1, k * 1.1)));
        pv.head = tHead * (1 + Math.sin(k * Math.PI) * 0.18);
      } else {
        pv.open = damp(pv.open, tOpen, 6, dt);
        pv.head = damp(pv.head, tHead, 6, dt);
      }
      pv.stem = damp(pv.stem, tStem, 5, dt);
      if (!pl && pv.head < 0.02 && pv.stem < 0.02) { pv.g = null; continue; }
      if (!pv.g) continue;
      const wind = 0.035 + (g.s.weather.kind === 'rain' ? 0.03 : 0);
      const sx = Math.sin(time * 1.3 + pv.seed * 6.2) * wind * pv.stem + Math.sin(time * 0.37 + w.x * 0.3) * 0.02 * pv.stem;
      const sz = Math.cos(time * 1.1 + pv.seed * 4.1) * wind * 0.6 * pv.stem;
      F.add({
        x: w.x, y: BED_TOP - 0.02, z: w.z, g: pv.g, stem: pv.stem, head: pv.head, open: pv.open,
        sway: { x: sx, z: sz }, tilt: pv.tilt, seed: pv.seed, face: pv.face + Math.sin(time * 0.5 + pv.seed * 9) * 0.05,
        stemScale: 0.8 + 0.4 * Math.min(1, pv.stem / 0.3),
      });
    }
    F.end(time);
  }

  _orbs(dt, time) {
    for (const [id, o] of this.orbs) {
      const age = time - o.born;
      const w = this.garden.pos[o.i];
      const base = this.headY(o.i) + 0.75;
      if (o.leaving) {
        o.leaveT += dt;
        const k = o.leaveT / 0.35;
        o.g.position.y += dt * 4;
        o.g.scale.setScalar(Math.max(0.001, 1 - k));
        if (k >= 1) { this.scene.remove(o.g); o.orb.material.dispose(); o.inner.material.dispose(); this.orbs.delete(id); }
        continue;
      }
      const grow = ease.outBack(Math.min(1, age / 0.6));
      o.g.scale.setScalar(Math.max(0.001, grow));
      const bob = Math.sin(time * 2.4 + o.seed) * 0.08;
      o.g.position.x = damp(o.g.position.x, w.x + Math.sin(o.seed) * 0.2, 4, dt);
      o.g.position.z = damp(o.g.position.z, w.z + Math.cos(o.seed) * 0.15, 4, dt);
      o.g.position.y = damp(o.g.position.y, base + bob, 4, dt);
      o.inner.rotation.y += dt * 1.5;
      o.orb.material.uniforms.uA.value = 0.85 + Math.sin(time * 3 + o.seed) * 0.15;
    }
  }
}

function axialRound(q, r) {
  let x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return [rx, rz];
}

export function mutColor(m) { return ['#ffffff', '#9fe8ff', '#c9d4ff', '#ffd54a', '#ff9ff3', '#b6ff9f'][m] || '#ffffff'; }
export { BED_TOP, FLOWER_H };
