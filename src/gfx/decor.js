// Purchasable garden decorations (procedural low-poly models) + the garden gnome. Each one appears at a fixed
// spot around the garden with a little build-up animation when bought.
import * as THREE from 'three';
import { merge, tint, gradient, rockGeometry } from './geometry.js';
import { ease, clamp } from '../core/math.js';

// world spots (outside the honeycomb, visible from the default camera); the world keeps bushes/trees away
export const DECOR_SPOTS = {
  birdbath: { x: -7.4, z: 1.2, r: 0.3 },
  bench: { x: 6.9, z: 1.6, r: -1.25 },
  arch: { x: -1.6, z: -8.0, r: 0 },
  lanterns: { x: 4.2, z: -7.3, r: 0.25 },
  windmill: { x: -9.6, z: -6.2, r: 0.6 },
  fountain: { x: -7.8, z: 4.6, r: 0 },
  gazebo: { x: 10.4, z: -8.4, r: -0.4 },
  greenhouse: { x: -11.8, z: -1.2, r: 0.35 },
  statue: { x: 1.8, z: -8.3, r: 0 },
  rainbow: { x: 7.6, z: -3.8, r: 0.35 },
  gnome: { x: -5.2, z: 4.4, r: 0.6 },
};

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
const V = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
const mesh = (g, m) => { const x = new THREE.Mesh(g, m); x.castShadow = true; x.receiveShadow = true; return x; };
const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

function birdbath() {
  const g = new THREE.Group();
  const stone = lathe([[0, 0], [0.42, 0], [0.42, 0.08], [0.16, 0.14], [0.13, 0.7], [0.2, 0.76], [0.62, 0.84], [0.66, 0.92], [0.56, 0.95], [0.1, 0.88], [0, 0.88]]);
  g.add(mesh(stone, M('#d9d3c7', { roughness: 0.9 })));
  const water = new THREE.CircleGeometry(0.55, 24); water.rotateX(-Math.PI / 2); water.translate(0, 0.9, 0);
  g.add(mesh(water, M('#8fd6ff', { roughness: 0.1, metalness: 0.1 })));
  // a little bird
  const body = new THREE.SphereGeometry(0.11, 10, 8); body.scale(1, 0.85, 1.25); body.translate(0.35, 1.03, 0); tint(body, '#6fb0ff');
  const head = new THREE.SphereGeometry(0.07, 8, 6); head.translate(0.35, 1.13, 0.1); tint(head, '#6fb0ff');
  const beak = new THREE.ConeGeometry(0.025, 0.07, 5); beak.rotateX(Math.PI / 2); beak.translate(0.35, 1.13, 0.19); tint(beak, '#ffb03a');
  const belly = new THREE.SphereGeometry(0.08, 8, 6); belly.translate(0.35, 1.0, 0.06); tint(belly, '#fff3d6');
  g.add(mesh(merge([body, head, beak, belly]), V()));
  return g;
}

function bench() {
  const g = new THREE.Group();
  const wood = M('#c98a55'), iron = M('#3d3b40', { roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < 3; i++) { const s = new THREE.BoxGeometry(1.6, 0.06, 0.16); s.translate(0, 0.45, -0.18 + i * 0.18); g.add(mesh(s, wood)); }
  for (let i = 0; i < 2; i++) { const s = new THREE.BoxGeometry(1.6, 0.14, 0.05); s.translate(0, 0.72 + i * 0.18, -0.34); s.rotateX(0.12); g.add(mesh(s, wood)); }
  for (const x of [-0.7, 0.7]) {
    const leg = new THREE.BoxGeometry(0.06, 0.45, 0.5); leg.translate(x, 0.22, -0.08); g.add(mesh(leg, iron));
    const back = new THREE.BoxGeometry(0.06, 0.55, 0.06); back.translate(x, 0.72, -0.36); g.add(mesh(back, iron));
  }
  return g;
}

function arch() {
  const g = new THREE.Group();
  const frame = new THREE.TorusGeometry(1.05, 0.06, 6, 24, Math.PI); frame.translate(0, 1.2, 0);
  const posts = [-1.05, 1.05].map((x) => { const p = new THREE.CylinderGeometry(0.06, 0.07, 1.2, 6); p.translate(x, 0.6, 0); return p; });
  g.add(mesh(merge([frame, ...posts]), M('#fff4e6')));
  const leaves = [], blooms = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 25) * Math.PI;
    const r = 1.05, x = Math.cos(a) * r, y = 1.2 + Math.sin(a) * r;
    const l = new THREE.IcosahedronGeometry(0.12 + Math.random() * 0.05, 0); l.translate(x, y, (Math.random() - 0.5) * 0.15); leaves.push(l);
    if (i % 2 === 0) { const b = new THREE.IcosahedronGeometry(0.08, 1); b.translate(x + (Math.random() - 0.5) * 0.1, y + 0.05, 0.12); tint(b, i % 4 ? '#ff6f9c' : '#ff3d6e'); blooms.push(b); }
  }
  for (const x of [-1.05, 1.05]) for (let k = 0; k < 5; k++) { const l = new THREE.IcosahedronGeometry(0.1, 0); l.translate(x + (Math.random() - 0.5) * 0.12, 0.2 + k * 0.22, 0.05); leaves.push(l); }
  const lm = merge(leaves); tint(lm, '#4caf50', 0.25);
  g.add(mesh(lm, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true })));
  g.add(mesh(merge(blooms), V()));
  return g;
}

function lanterns() {
  const g = new THREE.Group();
  const wood = M('#8a5a3b');
  const posts = [-1.3, 1.3].map((x) => { const p = new THREE.CylinderGeometry(0.05, 0.06, 1.9, 6); p.translate(x, 0.95, 0); return p; });
  g.add(mesh(merge(posts), wood));
  const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-1.3, 1.85, 0), new THREE.Vector3(0, 1.55, 0), new THREE.Vector3(1.3, 1.85, 0)]), 16, 0.012, 4);
  g.add(mesh(rope, M('#5a4030')));
  const cols = ['#ff8f5a', '#ffd23f', '#ff6f9c', '#8fd3ff'];
  g.userData.lamps = [];
  cols.forEach((c, i) => {
    const x = -0.9 + i * 0.6, y = 1.55 + Math.pow(x / 1.3, 2) * 0.3 - 0.16;
    const l = new THREE.SphereGeometry(0.13, 12, 8); l.scale(1, 1.25, 1);
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4, roughness: 0.5 });
    const lamp = mesh(l, m); lamp.position.set(x, y, 0);
    g.add(lamp);
    g.userData.lamps.push(m);
  });
  return g;
}

function windmill() {
  const g = new THREE.Group();
  const tower = new THREE.CylinderGeometry(0.42, 0.75, 2.6, 8); tower.translate(0, 1.3, 0); gradient(tower, '#e8d6b8', '#fff6e6');
  const roof = new THREE.ConeGeometry(0.62, 0.8, 8); roof.translate(0, 2.98, 0); tint(roof, '#c9573a');
  const door = new THREE.BoxGeometry(0.32, 0.5, 0.05); door.translate(0, 0.25, 0.72); tint(door, '#7a4a2a');
  g.add(mesh(merge([tower, roof, door]), V()));
  const hub = new THREE.Group(); hub.position.set(0, 2.45, 0.5);
  const blade = new THREE.BoxGeometry(0.22, 1.35, 0.03); blade.translate(0, 0.75, 0);
  for (let i = 0; i < 4; i++) { const b = mesh(blade, M('#fffaf0')); b.rotation.z = (i * Math.PI) / 2; hub.add(b); }
  hub.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), M('#7a4a2a')));
  g.add(hub);
  g.userData.spin = hub;
  return g;
}

function fountain() {
  const g = new THREE.Group();
  const base = lathe([[0, 0], [1.0, 0], [1.05, 0.3], [0.95, 0.32], [0.9, 0.12], [0.2, 0.12], [0.18, 0.9], [0.5, 0.95], [0.52, 1.08], [0.44, 1.1], [0.12, 1.02], [0.1, 1.5], [0.16, 1.55], [0, 1.6]], 24);
  g.add(mesh(base, M('#dcd6ca', { roughness: 0.85 })));
  const w1 = new THREE.CircleGeometry(0.9, 28); w1.rotateX(-Math.PI / 2); w1.translate(0, 0.26, 0);
  const w2 = new THREE.CircleGeometry(0.42, 20); w2.rotateX(-Math.PI / 2); w2.translate(0, 1.06, 0);
  const wm = M('#7fd0ff', { roughness: 0.08, metalness: 0.1, emissive: '#1a5a7a', emissiveIntensity: 0.2 });
  g.add(mesh(merge([w1, w2]), wm));
  const jet = new THREE.CylinderGeometry(0.03, 0.06, 0.5, 8, 1, true); jet.translate(0, 1.85, 0);
  const jm = new THREE.MeshStandardMaterial({ color: '#dff4ff', transparent: true, opacity: 0.7, roughness: 0.1 });
  const j = mesh(jet, jm); j.castShadow = false;
  g.add(j);
  g.userData.jet = j;
  return g;
}

function gazebo() {
  const g = new THREE.Group();
  const floor = new THREE.CylinderGeometry(1.35, 1.4, 0.18, 6); floor.translate(0, 0.09, 0); tint(floor, '#e0c9a6');
  const posts = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; const p = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6); p.translate(Math.cos(a) * 1.15, 0.98, Math.sin(a) * 1.15); tint(p, '#fffaf2'); posts.push(p); }
  const roof = new THREE.ConeGeometry(1.65, 0.95, 6); roof.rotateY(Math.PI / 6); roof.translate(0, 2.2, 0); tint(roof, '#ff8fb8');
  const trim = new THREE.CylinderGeometry(1.62, 1.62, 0.1, 6); trim.rotateY(Math.PI / 6); trim.translate(0, 1.76, 0); tint(trim, '#fffaf2');
  const top = new THREE.SphereGeometry(0.12, 8, 6); top.translate(0, 2.72, 0); tint(top, '#ffd23f');
  g.add(mesh(merge([floor, ...posts, roof, trim, top]), V()));
  return g;
}

function greenhouse() {
  const g = new THREE.Group();
  const frame = [];
  const W = 1.6, D = 1.1, H = 1.0;
  for (const x of [-W, 0, W]) for (const z of [-D, D]) { const p = new THREE.BoxGeometry(0.06, H, 0.06); p.translate(x, H / 2, z); frame.push(p); }
  for (const z of [-D, D]) { const b = new THREE.BoxGeometry(W * 2, 0.06, 0.06); b.translate(0, H, z); frame.push(b); }
  const ridge = new THREE.BoxGeometry(W * 2, 0.06, 0.06); ridge.translate(0, H + 0.7, 0); frame.push(ridge);
  for (const x of [-W, 0, W]) for (const s of [-1, 1]) { const r = new THREE.BoxGeometry(0.06, 0.06, 1.35); r.rotateX(s * 0.55); r.translate(x, H + 0.35, s * D * 0.5); frame.push(r); }
  g.add(mesh(merge(frame), M('#ffffff', { roughness: 0.4 })));
  const glassM = new THREE.MeshStandardMaterial({ color: '#cff5ff', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const box = new THREE.BoxGeometry(W * 2, H, D * 2); box.translate(0, H / 2, 0);
  const roofL = new THREE.PlaneGeometry(W * 2, 1.35); roofL.rotateX(-Math.PI / 2 + 0.55); roofL.translate(0, H + 0.35, -D * 0.5);
  const roofR = new THREE.PlaneGeometry(W * 2, 1.35); roofR.rotateX(-Math.PI / 2 - 0.55); roofR.translate(0, H + 0.35, D * 0.5);
  const glass = new THREE.Mesh(merge([box, roofL, roofR]), glassM); glass.renderOrder = 5;
  g.add(glass);
  const plants = [];
  for (let i = 0; i < 7; i++) { const b = new THREE.IcosahedronGeometry(0.22 + Math.random() * 0.12, 0); b.translate(-1.2 + i * 0.4, 0.3, (Math.random() - 0.5) * 1.2); tint(b, i % 3 ? '#4caf50' : '#ff85bd'); plants.push(b); }
  g.add(mesh(merge(plants), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 })));
  return g;
}

function statue() {
  const g = new THREE.Group();
  const ped = lathe([[0, 0], [0.62, 0], [0.62, 0.15], [0.48, 0.2], [0.44, 0.85], [0.58, 0.9], [0.58, 1.0], [0, 1.0]], 8);
  g.add(mesh(ped, M('#e3ddd2', { roughness: 0.85 })));
  const gold = M('#ffcc40', { metalness: 0.9, roughness: 0.28 });
  const body = new THREE.SphereGeometry(0.45, 18, 14); body.scale(0.8, 0.75, 1.05); body.translate(0, 1.5, 0);
  const head = new THREE.SphereGeometry(0.28, 14, 10); head.translate(0, 1.62, 0.45);
  const wings = [-1, 1].map((s) => { const w = new THREE.SphereGeometry(0.34, 12, 8); w.scale(0.22, 1, 0.62); w.rotateZ(s * 0.5); w.translate(s * 0.34, 1.98, -0.05); return w; });
  g.add(mesh(merge([body, head, ...wings]), gold));
  const stripes = [0, 1, 2].map((i) => { const t = new THREE.TorusGeometry(0.33 - i * 0.02, 0.05, 6, 20); t.scale(1.1, 1, 1); t.translate(0, 1.5, 0); t.rotateX(Math.PI / 2); t.translate(0, 0, -0.1 + i * 0.22 - 0.15); return t; });
  g.add(mesh(merge(stripes), M('#b8860b', { metalness: 0.8, roughness: 0.35 })));
  return g;
}

function rainbowBridge() {
  const g = new THREE.Group();
  const cols = ['#ff5a5a', '#ff9f3d', '#ffd83d', '#6fd36a', '#4fb3ff', '#9b6bff'];
  cols.forEach((c, i) => {
    const t = new THREE.TorusGeometry(2.5, 0.07, 6, 30, Math.PI);
    t.scale(1, 0.42, 1);
    t.translate(0, -0.2, -0.36 + i * 0.145);
    g.add(mesh(t, M(c, { emissive: c, emissiveIntensity: 0.25, roughness: 0.5 })));
  });
  const deck = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    const p = new THREE.BoxGeometry(0.3, 0.06, 0.9);
    p.rotateZ(Math.cos(a) * 0.62 * -1);
    p.translate(-Math.cos(a) * 2.5, Math.sin(a) * 1.05 - 0.2, 0);
    deck.push(p);
  }
  g.add(mesh(merge(deck), M('#fff2dc', { roughness: 0.7 })));
  return g;
}

export function gnomeModel() {
  const g = new THREE.Group();
  const coat = new THREE.ConeGeometry(0.34, 0.62, 12); coat.translate(0, 0.31, 0); tint(coat, '#3f7fd6');
  const belt = new THREE.CylinderGeometry(0.24, 0.25, 0.06, 12); belt.translate(0, 0.36, 0); tint(belt, '#3a2412');
  const head = new THREE.SphereGeometry(0.17, 12, 10); head.translate(0, 0.72, 0.02); tint(head, '#ffd2b3');
  const nose = new THREE.SphereGeometry(0.06, 8, 6); nose.translate(0, 0.72, 0.18); tint(nose, '#ff9d8a');
  const beard = new THREE.ConeGeometry(0.18, 0.34, 10); beard.rotateX(Math.PI); beard.translate(0, 0.56, 0.1); tint(beard, '#ffffff');
  const hat = new THREE.ConeGeometry(0.2, 0.52, 12); hat.translate(0, 1.02, -0.02); hat.rotateX(-0.08); tint(hat, '#e0445a');
  const eyes = [-1, 1].map((s) => { const e = new THREE.SphereGeometry(0.025, 6, 5); e.translate(s * 0.06, 0.78, 0.16); return tint(e, '#1a1a1a'); });
  const boots = [-1, 1].map((s) => { const b = new THREE.SphereGeometry(0.09, 8, 6); b.scale(1, 0.6, 1.4); b.translate(s * 0.12, 0.04, 0.06); return tint(b, '#5a3a22'); });
  g.add(mesh(merge([coat, belt, head, nose, beard, hat, ...eyes, ...boots]), V()));
  // tiny shovel
  const handle = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5); handle.translate(0.3, 0.45, 0.05); tint(handle, '#b87a4a');
  const blade = new THREE.BoxGeometry(0.14, 0.18, 0.02); blade.translate(0.3, 0.1, 0.05); tint(blade, '#c9d3dc');
  g.add(mesh(merge([handle, blade]), V()));
  g.scale.setScalar(1.25);
  return g;
}

const BUILDERS = { birdbath, bench, arch, lanterns, windmill, fountain, gazebo, greenhouse, statue, rainbow: rainbowBridge };

export class Decor {
  constructor(scene) {
    this.scene = scene;
    this.items = {};
    this.gnome = null;
    this.time = 0;
  }
  place(id, animate = false) {
    if (this.items[id] || !BUILDERS[id]) return;
    const s = DECOR_SPOTS[id];
    const obj = BUILDERS[id]();
    obj.position.set(s.x, 0, s.z);
    obj.rotation.y = s.r;
    obj.userData.born = animate ? this.time : -10;
    obj.scale.setScalar(animate ? 0.01 : 1);
    this.scene.add(obj);
    this.items[id] = obj;
  }
  setGnome(on) {
    if (on && !this.gnome) {
      this.gnome = gnomeModel();
      const s = DECOR_SPOTS.gnome;
      this.gnome.position.set(s.x, 0, s.z);
      this.gnome.rotation.y = s.r;
      this.gnome.userData.hop = 0;
      this.scene.add(this.gnome);
    }
  }
  hop() { if (this.gnome) this.gnome.userData.hop = 1; }
  update(dt, time, night) {
    this.time = time;
    for (const id in this.items) {
      const o = this.items[id];
      const k = clamp((time - o.userData.born) / 0.9, 0, 1);
      if (k < 1) o.scale.setScalar(Math.max(0.01, ease.outElastic(k)));
      else if (o.scale.x !== 1) o.scale.setScalar(1);
      if (o.userData.spin) o.userData.spin.rotation.z += dt * 0.8;
      if (o.userData.jet) { o.userData.jet.scale.y = 1 + Math.sin(time * 6) * 0.08; }
      if (o.userData.lamps) for (const m of o.userData.lamps) m.emissiveIntensity = 0.35 + night * 1.6 + Math.sin(time * 2 + m.id) * 0.05;
    }
    if (this.gnome) {
      const g = this.gnome, h = g.userData.hop;
      if (h > 0) { g.userData.hop = Math.max(0, h - dt * 2.2); g.position.y = Math.sin((1 - g.userData.hop) * Math.PI) * 0.35; }
      g.rotation.z = Math.sin(time * 1.5) * 0.03;
    }
  }
}
