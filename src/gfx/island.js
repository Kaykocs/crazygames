// The floating island the garden sits on: rolling lawn top with a rounded grassy lip, earthen strata sides that
// taper to a rocky point, dangling roots, and soft clouds drifting below and around it.
import * as THREE from 'three';
import { lawnTexture, strataTexture, cloudTexture } from './textures.js';
import { merge, tint } from './geometry.js';
import { rng, smoothstep } from '../core/math.js';

export const ISLAND = { base: 17.5, flat: 11.5 };

// island outline radius at angle a (lumpy, slightly wider left-right for landscape screens)
export function islandRadius(a) {
  return ISLAND.base + 1.7 * Math.sin(3 * a + 0.5) + 1.1 * Math.sin(5 * a + 1.3) + 0.55 * Math.sin(9 * a + 2.1);
}
const stretchX = 1.12;

// terrain height at (x, z): flat where the garden is, gentle hills toward the rim, rounded lip at the edge
export function terrainHeight(x, z) {
  const a = Math.atan2(z, x / stretchX), r = Math.hypot(x / stretchX, z);
  const R = islandRadius(a), f = r / R;
  const hills = (Math.sin(x * 0.23 + 1.2) * Math.cos(z * 0.19 - 0.4) * 0.6 + Math.sin(x * 0.11 - z * 0.13) * 0.5 + 0.35) * 1.1;
  let y = Math.max(0, hills) * smoothstep(ISLAND.flat, ISLAND.flat + 4, r) * smoothstep(1.02, 0.86, f);
  if (f > 0.9) y -= Math.pow((f - 0.9) / 0.1, 2) * 0.55;
  return y - 0.02;
}

export class Island {
  constructor(scene, quality) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._top();
    this._sides();
    this._clouds(quality);
  }

  _top() {
    const RINGS = 44, SEG = 128, pos = [], uv = [], idx = [];
    for (let k = 0; k <= RINGS; k++) {
      // denser rings near the rim for a smooth lip
      const f = k === 0 ? 0 : Math.pow(k / RINGS, 0.75);
      for (let s = 0; s <= SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        const R = islandRadius(a) * f;
        const x = Math.cos(a) * R * stretchX, z = Math.sin(a) * R;
        pos.push(x, terrainHeight(x, z), z);
        uv.push(x * 0.055, z * 0.055);
      }
    }
    for (let k = 0; k < RINGS; k++) for (let s = 0; s < SEG; s++) {
      const a = k * (SEG + 1) + s, b = a + 1, c = a + SEG + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);          // counter-clockwise seen from above
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: lawnTexture(), roughness: 1, color: '#f2ffe8' });
    this.top = new THREE.Mesh(g, mat);
    this.top.receiveShadow = true;
    this.group.add(this.top);
  }

  _sides() {
    const SEG = 128, depths = [0, 0.18, 0.7, 1.7, 3.1, 4.8, 6.6, 8.3], rf = [1.0, 0.995, 0.965, 0.9, 0.76, 0.56, 0.3, 0.04];
    const R = rng(77), pos = [], uv = [], idx = [];
    const jit = [];
    for (let s = 0; s <= SEG; s++) { const row = []; for (let k = 0; k < depths.length; k++) row.push(k < 2 ? 0 : (R() - 0.5) * 0.9); jit.push(row); }
    for (let s = 0; s <= SEG; s++) jit[s] = jit[s % SEG];
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2, Ra = islandRadius(a);
      for (let k = 0; k < depths.length; k++) {
        const r = Ra * rf[k] + jit[s][k];
        const x = Math.cos(a) * r * stretchX, z = Math.sin(a) * r;
        const top = terrainHeight(Math.cos(a) * Ra * stretchX, Math.sin(a) * Ra);
        pos.push(x, top - depths[k] - (k > 1 ? Math.abs(jit[s][k]) * 0.6 : 0), z);
        uv.push((s / SEG) * 7, depths[k] / 8.3);
      }
    }
    const K = depths.length;
    for (let s = 0; s < SEG; s++) for (let k = 0; k < K - 1; k++) {
      const a = s * K + k, b = a + 1, c = a + K, d = c + 1;
      idx.push(a, c, b, b, c, d);          // faces outward
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: strataTexture(), roughness: 0.95, color: '#ffffff' });
    const side = new THREE.Mesh(g, mat);
    side.receiveShadow = true;
    this.group.add(side);
    // dangling roots
    const roots = [];
    for (let i = 0; i < 22; i++) {
      const a = R() * Math.PI * 2, Ra = islandRadius(a) * (0.9 + R() * 0.08);
      const x = Math.cos(a) * Ra * stretchX, z = Math.sin(a) * Ra, y = -0.8 - R() * 2.2;
      const len = 1.2 + R() * 2.6, out = 0.3 + R() * 0.5;
      const pts = [];
      for (let t = 0; t <= 5; t++) {
        const k = t / 5;
        pts.push(new THREE.Vector3(x + Math.cos(a) * out * k + Math.sin(k * 5 + i) * 0.15, y - len * k, z + Math.sin(a) * out * k + Math.cos(k * 4 + i) * 0.15));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035 + R() * 0.03, 5);
      roots.push(tint(tube, '#6d4a2e', 0.2, i));
    }
    const rootMesh = new THREE.Mesh(merge(roots), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    this.group.add(rootMesh);
    // rocks poking out of the cliff
    const rocks = [];
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, d = 1.2 + R() * 4.5, k = d / 8.3;
      const Ra = islandRadius(a) * (1 - k * 0.85) + 0.2;
      const rg = new THREE.IcosahedronGeometry(0.5 + R() * 0.9, 1);
      rg.scale(1.3, 0.8, 1);
      rg.translate(Math.cos(a) * Ra * stretchX, -d, Math.sin(a) * Ra);
      rocks.push(tint(rg, R() < 0.5 ? '#b9ae9c' : '#a39784', 0.12, i));
    }
    const rockMesh = new THREE.Mesh(merge(rocks), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    rockMesh.castShadow = true;
    this.group.add(rockMesh);
  }

  _clouds(quality) {
    const tex = cloudTexture();
    const R = rng(91);
    this.clouds = [];
    const n = quality.particles >= 0.8 ? 26 : 16;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 + R() * 0.15, color: '#ffffff' });
      const s = new THREE.Sprite(mat);
      const below = i < n * 0.65;
      const a = R() * Math.PI * 2, r = below ? 12 + R() * 30 : 38 + R() * 30;
      const w = below ? 12 + R() * 14 : 18 + R() * 20;
      s.scale.set(w, w * 0.5, 1);
      s.position.set(Math.cos(a) * r, below ? -5 - R() * 9 : -2 + R() * 8, Math.sin(a) * r);
      s.userData = { a, r, speed: (0.004 + R() * 0.01) * (R() < 0.5 ? 1 : -1), y: s.position.y };
      s.renderOrder = -5;
      this.group.add(s);
      this.clouds.push(s);
    }
  }

  update(dt, time) {
    for (const c of this.clouds) {
      const u = c.userData;
      u.a += u.speed * dt;
      c.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(time * 0.2 + u.r) * 0.3, Math.sin(u.a) * u.r);
    }
  }

  setCloudTint(color) { for (const c of this.clouds) c.material.color.set(color); }
}
