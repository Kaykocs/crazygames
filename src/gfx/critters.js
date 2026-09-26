// Bees (driven by the simulation's bee states) and ambient butterflies.
import * as THREE from 'three';
import { merge, tint, wingGeometry } from './geometry.js';
import { ease, damp, rng, clamp } from '../core/math.js';

function beeBodyGeometry() {
  const body = new THREE.SphereGeometry(0.16, 16, 12);
  body.scale(0.78, 0.72, 1);
  // stripes along z via vertex colours
  const p = body.attributes.position, col = new Float32Array(p.count * 3);
  const Y = new THREE.Color('#ffc928'), K = new THREE.Color('#2a1d12'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const band = Math.sin((z + 0.03) * 34) > 0.25 && z < 0.1 ? 1 : 0;
    c.copy(z < -0.13 ? K : band ? K : Y);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const head = new THREE.SphereGeometry(0.1, 12, 10); head.translate(0, 0.02, 0.16); tint(head, '#2a1d12');
  const eyeL = new THREE.SphereGeometry(0.045, 10, 8); eyeL.translate(0.05, 0.05, 0.225); tint(eyeL, '#ffffff');
  const eyeR = eyeL.clone(); eyeR.translate(-0.1, 0, 0); tint(eyeR, '#ffffff');
  const pupL = new THREE.SphereGeometry(0.024, 8, 6); pupL.translate(0.055, 0.055, 0.262); tint(pupL, '#111111');
  const pupR = pupL.clone(); pupR.translate(-0.11, 0, 0); tint(pupR, '#111111');
  const antL = new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4); antL.rotateX(0.6); antL.rotateZ(-0.3); antL.translate(0.03, 0.14, 0.2); tint(antL, '#2a1d12');
  const antR = antL.clone(); antR.translate(-0.06, 0, 0);
  const tipL = new THREE.SphereGeometry(0.018, 6, 5); tipL.translate(0.048, 0.19, 0.24); tint(tipL, '#2a1d12');
  const tipR = tipL.clone(); tipR.translate(-0.096, 0, 0);
  const sting = new THREE.ConeGeometry(0.02, 0.06, 6); sting.rotateX(-Math.PI / 2); sting.translate(0, 0, -0.18); tint(sting, '#2a1d12');
  const cheekL = new THREE.SphereGeometry(0.022, 6, 5); cheekL.translate(0.075, -0.005, 0.24); tint(cheekL, '#ff8fa8');
  const cheekR = cheekL.clone(); cheekR.translate(-0.15, 0, 0);
  return merge([body, head, eyeL, eyeR, pupL, pupR, antL, antR, tipL, tipR, sting, cheekL, cheekR]);
}

const beeGeo = beeBodyGeometry();
const beeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
const wingMat = new THREE.MeshStandardMaterial({ color: '#eaf6ff', transparent: true, opacity: 0.72, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
const wingGeo = (() => { const g = new THREE.CircleGeometry(0.13, 12); g.scale(0.62, 1, 1); g.rotateX(-Math.PI / 2); g.translate(0.075, 0, -0.02); return g; })();

export class Bees {
  constructor(scene, fx, audio) {
    this.scene = scene; this.fx = fx; this.audio = audio;
    this.views = [];
    this.R = rng(42);
  }

  _make() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(beeGeo, beeMat);
    body.castShadow = true;
    g.add(body);
    const wl = new THREE.Mesh(wingGeo, wingMat), wr = new THREE.Mesh(wingGeo, wingMat);
    wl.position.set(0.05, 0.1, 0.02); wr.position.set(-0.05, 0.1, 0.02); wr.scale.x = -1;
    g.add(wl, wr);
    g.scale.setScalar(1.1);
    this.scene.add(g);
    return { g, wl, wr, pos: new THREE.Vector3(-5, 1, -4), vel: new THREE.Vector3(), yaw: 0, bank: 0, seed: this.R() * 10 };
  }

  // headY(i) → world y of the flower head on plot i; hive = {x, z}
  update(dt, time, bees, garden, headY, hive) {
    while (this.views.length < bees.length) this.views.push(this._make());
    const target = new THREE.Vector3();
    for (let i = 0; i < bees.length; i++) {
      const b = bees[i], v = this.views[i];
      const sd = v.seed;
      const hy = (k) => (k >= 0 ? headY(k) : 0.9);
      const hover = (x, y, z, r) => target.set(x + Math.cos(time * 3 + sd) * r, y + Math.sin(time * 5 + sd) * 0.05, z + Math.sin(time * 3 + sd) * r);
      switch (b.state) {
        case 'home': {
          // hang around the hive entrance
          const a = time * 1.3 + sd * 2;
          target.set(hive.x + Math.cos(a) * 0.9 + 0.3, 1.3 + Math.sin(time * 2.1 + sd) * 0.25, hive.z + Math.sin(a) * 0.7 + 0.9);
          break;
        }
        case 'atA': case 'atB': {
          const k = b.state === 'atA' ? b.a : b.b;
          const p = garden.pos[k];
          hover(p.x, hy(k) + 0.32, p.z, 0.12);
          if (this.R() < dt * 6) this.fx.pollen(p.x, hy(k) + 0.1, p.z, 2);
          break;
        }
        default: {
          const k = Math.min(1, b.t / Math.max(0.01, b.dur));
          const e = ease.inOutQuad(k);
          const y0 = b.state === 'toA' && b.from.x === hive.x ? 1.3 : b.state === 'back' ? hy(-1) + 0.6 : 1.1;
          const y1 = b.state === 'back' ? 1.2 : hy(b.state === 'toA' ? b.a : b.b) + 0.32;
          const arc = Math.sin(Math.PI * k) * 0.7;
          const wob = Math.sin(time * 7 + sd) * 0.06;
          target.set(b.from.x + (b.to.x - b.from.x) * e + wob, y0 + (y1 - y0) * e + arc, b.from.z + (b.to.z - b.from.z) * e);
        }
      }
      // follow the target smoothly (never teleports), face the direction of travel
      const prev = v.pos.clone();
      v.pos.x = damp(v.pos.x, target.x, 9, dt); v.pos.y = damp(v.pos.y, target.y, 9, dt); v.pos.z = damp(v.pos.z, target.z, 9, dt);
      v.vel.subVectors(v.pos, prev).divideScalar(Math.max(dt, 1e-4));
      const sp = Math.hypot(v.vel.x, v.vel.z);
      if (sp > 0.25) {
        const yaw = Math.atan2(v.vel.x, v.vel.z);
        let d = yaw - v.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        v.yaw += d * Math.min(1, dt * 8);
        v.bank = damp(v.bank, clamp(-d * 1.5, -0.6, 0.6), 6, dt);
      } else {
        // hovering: face the camera-ish so the face reads
        let d = 0.3 * Math.sin(time * 0.7 + sd) - v.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        v.yaw += d * Math.min(1, dt * 3);
        v.bank = damp(v.bank, 0, 4, dt);
      }
      v.g.position.copy(v.pos);
      v.g.rotation.set(Math.min(0.35, sp * 0.06), v.yaw, v.bank, 'YXZ');
      const flap = Math.sin(time * 55 + sd) * 0.9;
      v.wl.rotation.z = 0.25 + flap; v.wr.rotation.z = -0.25 - flap;
    }
  }
}

// ambient butterflies: wander, sometimes settle on an open bloom
const bflyWing = wingGeometry();
export class Butterflies {
  constructor(scene, count = 4) {
    this.list = [];
    const R = rng(8);
    const cols = ['#ff9ed1', '#8fd8ff', '#ffd966', '#c9a4ff', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.6, emissive: cols[i % cols.length], emissiveIntensity: 0.12 });
      const l = new THREE.Mesh(bflyWing, mat), r = new THREE.Mesh(bflyWing, mat);
      r.scale.x = -1;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.12, 3, 6), new THREE.MeshStandardMaterial({ color: '#2b2130' }));
      body.rotation.x = Math.PI / 2;
      g.add(l, r, body);
      g.scale.setScalar(0.9);
      scene.add(g);
      this.list.push({ g, l, r, seed: R() * 100, pos: new THREE.Vector3((R() - 0.5) * 12, 1.5, (R() - 0.5) * 10), goal: new THREE.Vector3(), t: 0, land: null, landT: 0 });
    }
  }
  update(dt, time, spots) {
    for (const b of this.list) {
      b.t -= dt;
      if (b.land) {
        b.landT -= dt;
        b.pos.x = damp(b.pos.x, b.land.x, 5, dt); b.pos.y = damp(b.pos.y, b.land.y + 0.06, 5, dt); b.pos.z = damp(b.pos.z, b.land.z, 5, dt);
        const f = Math.sin(time * 2.5 + b.seed) * 0.5 + 0.55;
        b.l.rotation.z = f; b.r.rotation.z = -f;
        if (b.landT <= 0) { b.land = null; b.t = 0; }
      } else {
        if (b.t <= 0) {
          b.t = 3 + Math.random() * 4;
          if (spots.length && Math.random() < 0.35) { b.land = spots[(Math.random() * spots.length) | 0]; b.landT = 3 + Math.random() * 4; }
          else b.goal.set((Math.random() - 0.5) * 14, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 12 - 1);
        }
        const wx = Math.sin(time * 1.3 + b.seed) * 0.6, wz = Math.cos(time * 1.1 + b.seed) * 0.6;
        b.pos.x = damp(b.pos.x, b.goal.x + wx, 0.6, dt); b.pos.y = damp(b.pos.y, b.goal.y + Math.sin(time * 3 + b.seed) * 0.3, 1.2, dt); b.pos.z = damp(b.pos.z, b.goal.z + wz, 0.6, dt);
        const f = Math.sin(time * 16 + b.seed) * 1.0;
        b.l.rotation.z = 0.2 + f; b.r.rotation.z = -0.2 - f;
      }
      const dx = b.goal.x - b.pos.x, dz = b.goal.z - b.pos.z;
      if (!b.land) b.g.rotation.y = Math.atan2(dx, dz) + Math.PI;   // wing shapes point their leading edge to -z
      b.g.position.copy(b.pos);
    }
  }
}
