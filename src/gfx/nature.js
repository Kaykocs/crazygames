// Scenery: fluffy stylized trees, flowering bushes, mossy rocks, reeds + lily pads, mushrooms, a mossy log,
// a picket fence, stepping stones, wildflower clusters and contact-shadow blobs. All instanced / merged.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { merge, tint } from './geometry.js';
import { barkTexture, woodTexture, stoneTexture, blobTexture } from './textures.js';
import { rng } from '../core/math.js';

// ---- a soft "fluffy foliage" material: rim light + wrap (fake subsurface) on top of standard shading ----------
export function foliageMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */`
      #include <emissivemap_fragment>
      float fl_rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.4);
      totalEmissiveRadiance += diffuseColor.rgb * (0.08 + fl_rim * 0.32);`);
  };
  m.customProgramCacheKey = () => 'foliage-v1';
  return m;
}

// smooth noise for displacing lumpy shapes (deterministic, cheap)
function lumpNoise(x, y, z, seed) {
  return Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.7) * Math.sin(z * 3.3 + seed * 0.7) * 0.5
    + Math.sin(x * 7.3 + seed * 2.3) * Math.sin(y * 6.1) * Math.sin(z * 6.7 + seed) * 0.22;
}

// a lumpy sphere blob with smooth normals
function blob(r, detail, seed, lump = 0.12) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    v.addScaledVector(n, lumpNoise(n.x, n.y, n.z, seed) * r * lump);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// vertex colours for a canopy: darker underneath and inside, lighter on top, speckled leaf clusters
function paintCanopy(g, dark, light, center, R, spots = null) {
  g.computeBoundingBox();
  const bb = g.boundingBox, p = g.attributes.position, n = g.attributes.normal;
  const cd = new THREE.Color(dark), cl = new THREE.Color(light), c = new THREE.Color(), cs = spots ? new THREE.Color(spots) : null;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
    const dx = p.getX(i) - center.x, dz = p.getZ(i) - center.z, dy = p.getY(i) - center.y;
    const outward = Math.max(0, (dx * n.getX(i) + dy * n.getY(i) + dz * n.getZ(i)) / (Math.hypot(dx, dy, dz) || 1));
    let t = 0.15 + y * 0.55 + n.getY(i) * 0.2 + outward * 0.15 + (R() - 0.5) * 0.12;
    c.copy(cd).lerp(cl, Math.max(0, Math.min(1, t)));
    if (cs && R() < 0.06 && n.getY(i) > -0.2) c.copy(cs);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function canopyGeometry(kind, seed) {
  const R = rng(seed), parts = [];
  const spec = {
    round: { n: 7, r: [0.75, 1.05], spread: 0.85, h: 2.2, sy: 0.9 },
    tall: { n: 6, r: [0.6, 0.85], spread: 0.55, h: 2.5, sy: 1.35 },
    wide: { n: 9, r: [0.7, 1.0], spread: 1.15, h: 2.0, sy: 0.75 },
  }[kind];
  for (let i = 0; i < spec.n; i++) {
    const r = spec.r[0] + R() * (spec.r[1] - spec.r[0]);
    const b = blob(r, 3, R() * 10, 0.14);
    const a = R() * Math.PI * 2, d = spec.spread * Math.sqrt(R());
    b.translate(Math.cos(a) * d, spec.h + (R() - 0.3) * spec.sy, Math.sin(a) * d);
    parts.push(b);
  }
  const top = blob(spec.r[1] * 0.95, 3, R() * 10, 0.14); top.translate(0, spec.h + spec.sy * 0.75, 0); parts.push(top);
  const g = merge(parts);
  return g;
}

function trunkGeometry(seed) {
  const R = rng(seed);
  const g = new THREE.CylinderGeometry(0.13, 0.24, 2.3, 10, 8);
  g.translate(0, 1.15, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const flare = y < 0.35 ? 1 + (0.35 - y) * 1.6 : 1;
    p.setX(i, p.getX(i) * flare + Math.sin(y * 1.3 + seed) * 0.08);
    p.setZ(i, p.getZ(i) * flare + Math.cos(y * 1.1 + seed) * 0.06);
  }
  const parts = [g];
  for (let k = 0; k < 2; k++) {
    const b = new THREE.CylinderGeometry(0.04, 0.07, 0.9, 6);
    b.translate(0, 0.45, 0);
    b.rotateZ((k ? -1 : 1) * (0.7 + R() * 0.3));
    b.rotateY(R() * 6);
    b.translate(0, 1.4 + k * 0.3, 0);
    parts.push(b);
  }
  const out = merge(parts);
  // cylindrical UVs for the bark
  const pp = out.attributes.position, uv = new Float32Array(pp.count * 2);
  for (let i = 0; i < pp.count; i++) { uv[i * 2] = (Math.atan2(pp.getZ(i), pp.getX(i)) / (Math.PI * 2) + 0.5) * 2; uv[i * 2 + 1] = pp.getY(i) * 0.9; }
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.deleteAttribute('color');
  return out;
}

function rockGeo(seed) {
  let g = new THREE.IcosahedronGeometry(1, 3);
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  const sx = 1 + (seed % 3) * 0.2, sz = 0.8 + (seed % 5) * 0.08;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    v.addScaledVector(n, lumpNoise(n.x * 0.6, n.y * 0.6, n.z * 0.6, seed) * 0.32);
    v.x *= sx; v.z *= sz; v.y *= 0.62;
    if (v.y < -0.18) v.y = -0.18 + (v.y + 0.18) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // moss on top
  const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color(), stone = new THREE.Color('#c9c2b4'), moss = new THREE.Color('#6fae47'), dark = new THREE.Color('#8f877a');
  const R = rng(seed + 9);
  for (let i = 0; i < p.count; i++) {
    const up = n.getY(i), m = Math.max(0, (up - 0.45) * 2.2 + (lumpNoise(p.getX(i) * 2, p.getY(i) * 2, p.getZ(i) * 2, seed) * 0.8));
    c.copy(stone).lerp(dark, Math.max(0, -up) * 0.6 + R() * 0.08).lerp(moss, Math.min(1, m));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, 0.12, 0);
  return g;
}

function wildflower(petalColor) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.CircleGeometry(0.045, 6);
    p.scale(0.55, 1, 1);
    p.rotateX(-Math.PI / 2 + 0.25);
    p.translate(0, 0.2, 0.045);
    p.rotateY((i / 6) * Math.PI * 2);
    parts.push(tint(p, petalColor));
  }
  const c = new THREE.SphereGeometry(0.022, 6, 4); c.translate(0, 0.205, 0); parts.push(tint(c, '#ffcf3a'));
  const st = new THREE.CylinderGeometry(0.006, 0.008, 0.2, 4); st.translate(0, 0.1, 0); parts.push(tint(st, '#4f9a3a'));
  const lf = new THREE.CircleGeometry(0.04, 5); lf.scale(0.5, 1, 1); lf.rotateX(-Math.PI / 2 + 0.6); lf.translate(0, 0.06, 0.04); parts.push(tint(lf, '#5aa845'));
  return merge(parts);
}

const up = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const place = (mesh, i, x, y, z, rot, sx, sy = sx, sz = sx) => { tmpQ.setFromAxisAngle(up, rot); tmpS.set(sx, sy, sz); tmpP.set(x, y, z); tmpM.compose(tmpP, tmpQ, tmpS); mesh.setMatrixAt(i, tmpM); };

export class Nature {
  // spots: { trees: [{x,z,s,kind,color}], bushes: [...], rocks: [...], flowers: [...], stones: [...], fence: [...], ... }
  constructor(scene, heightAt, layout, quality) {
    this.scene = scene;
    this.heightAt = heightAt;
    const s = scene;
    // --- trees
    const barkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95, color: '#c9a585' });
    const kinds = ['round', 'tall', 'wide'];
    const canopies = kinds.map((k, i) => canopyGeometry(k, 11 + i * 7));
    const trunk = trunkGeometry(3);
    const palettes = {
      green: ['#2f6f2c', '#8fd05a'], deep: ['#255c2a', '#6fbf4a'], lime: ['#3f8a2a', '#b6e06a'],
      blossom: ['#d97aa0', '#ffe1ee'], autumn: ['#b8541f', '#ffc24a'],
    };
    const byKind = kinds.map(() => []);
    for (const t of layout.trees) byKind[kinds.indexOf(t.kind)].push(t);
    const trunks = new THREE.InstancedMesh(trunk, barkMat, layout.trees.length);
    trunks.castShadow = true; trunks.receiveShadow = true;
    let ti = 0;
    kinds.forEach((k, ki) => {
      const list = byKind[ki];
      if (!list.length) return;
      // one canopy mesh per palette used by this kind
      const byPal = {};
      for (const t of list) (byPal[t.palette] = byPal[t.palette] || []).push(t);
      for (const pal in byPal) {
        const geo = paintCanopy(canopies[ki].clone(), palettes[pal][0], palettes[pal][1], new THREE.Vector3(0, 2.3, 0), rng(ki * 13 + pal.length), pal === 'blossom' ? '#ffffff' : pal === 'green' ? '#ffe9f2' : null);
        const m = new THREE.InstancedMesh(geo, foliageMaterial(), byPal[pal].length);
        byPal[pal].forEach((t, i) => { const y = heightAt(t.x, t.z); place(m, i, t.x, y, t.z, t.r, t.s); place(trunks, ti++, t.x, y, t.z, t.r, t.s); });
        m.castShadow = true; m.receiveShadow = true;
        s.add(m);
      }
    });
    s.add(trunks);
    // --- bushes (some flowering)
    const bushGeos = [0, 1, 2].map((k) => {
      const R = rng(40 + k), parts = [];
      const n = 3 + k;
      for (let i = 0; i < n; i++) { const r = 0.42 + R() * 0.25; const b = blob(r, 3, R() * 10, 0.16); const a = R() * 6.28, d = 0.35 * R(); b.translate(Math.cos(a) * d, r * 0.75 + R() * 0.15, Math.sin(a) * d); parts.push(b); }
      return merge(parts);
    });
    const bushPal = [['#2f7a33', '#7cc95a', null], ['#2a6e3a', '#6cc06a', '#ff8fbd'], ['#2f7a33', '#8fd05a', '#ffffff'], ['#356e2c', '#9ad060', '#b99bff'], ['#2a6a30', '#7cc95a', '#ffd23f']];
    const bushGroups = {};
    for (const b of layout.bushes) { const k = `${b.geo}:${b.pal}`; (bushGroups[k] = bushGroups[k] || []).push(b); }
    for (const k in bushGroups) {
      const [gi, pi] = k.split(':').map(Number);
      const pal = bushPal[pi];
      const geo = paintCanopy(bushGeos[gi].clone(), pal[0], pal[1], new THREE.Vector3(0, 0.45, 0), rng(pi * 7 + gi), null);
      const parts = [geo];
      if (pal[2]) {
        // little blossoms dotted over the bush
        const R = rng(gi * 31 + pi), p = geo.attributes.position, n = geo.attributes.normal;
        for (let i = 0; i < 70; i++) {
          const j = Math.floor(R() * p.count);
          if (n.getY(j) < -0.1) continue;
          const fl = new THREE.IcosahedronGeometry(0.06 + R() * 0.03, 1);
          fl.translate(p.getX(j) + n.getX(j) * 0.03, p.getY(j) + n.getY(j) * 0.03, p.getZ(j) + n.getZ(j) * 0.03);
          parts.push(tint(fl, pal[2], 0.15, i));
        }
      }
      const m = new THREE.InstancedMesh(merge(parts), foliageMaterial(), bushGroups[k].length);
      bushGroups[k].forEach((b, i) => place(m, i, b.x, heightAt(b.x, b.z), b.z, b.r, b.s, b.s * 0.9, b.s));
      m.castShadow = true; m.receiveShadow = true;
      s.add(m);
    }
    // --- rocks
    const rockGeos = [2, 5, 8].map(rockGeo);
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stoneTexture(), roughness: 0.9 });
    [0, 1, 2].forEach((k) => {
      const list = layout.rocks.filter((r, i) => i % 3 === k);
      if (!list.length) return;
      const m = new THREE.InstancedMesh(rockGeos[k], rockMat, list.length);
      list.forEach((r, i) => place(m, i, r.x, heightAt(r.x, r.z) - 0.05, r.z, r.r, r.s, r.s, r.s));
      m.castShadow = true; m.receiveShadow = true;
      s.add(m);
    });
    // --- wildflower clusters
    const wfCols = ['#ffffff', '#ffe066', '#ff9fc8', '#a9c8ff', '#d3a8ff', '#ffb27a'];
    wfCols.forEach((c, ci) => {
      const list = layout.flowers.filter((f) => f.c === ci);
      if (!list.length) return;
      const m = new THREE.InstancedMesh(wildflower(c), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), list.length);
      list.forEach((f, i) => place(m, i, f.x, heightAt(f.x, f.z), f.z, f.r, f.s));
      s.add(m);
    });
    // --- stepping stones
    if (layout.stones.length) {
      let sg = new THREE.CylinderGeometry(1, 1.04, 0.12, 14, 1);
      sg = mergeVertices(sg.toNonIndexed ? sg : sg);
      const p = sg.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); if (p.getY(i) > 0) p.setY(i, 0.06 + (1 - (x * x + z * z)) * 0.04); }
      sg.computeVertexNormals();
      const m = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ map: stoneTexture(), color: '#e8e2d6', roughness: 0.9 }), layout.stones.length);
      layout.stones.forEach((st, i) => place(m, i, st.x, heightAt(st.x, st.z) + 0.01, st.z, st.r, st.s, 1, st.s * 0.82));
      m.receiveShadow = true;
      s.add(m);
    }
    // --- picket fence
    if (layout.fence.length) {
      const wood = woodTexture();
      const pk = new THREE.BoxGeometry(0.12, 0.8, 0.05, 1, 1, 1);
      pk.translate(0, 0.4, 0);
      const tipG = new THREE.ConeGeometry(0.085, 0.12, 4); tipG.rotateY(Math.PI / 4); tipG.translate(0, 0.86, 0);
      const picket = merge([pk, tipG]);
      const mat = new THREE.MeshStandardMaterial({ color: '#fff6e8', roughness: 0.8, map: wood });
      const m = new THREE.InstancedMesh(picket, mat, layout.fence.length);
      layout.fence.forEach((f, i) => place(m, i, f.x, heightAt(f.x, f.z), f.z, f.r, 1, f.h, 1));
      m.castShadow = true; m.receiveShadow = true;
      s.add(m);
      // rails
      const rails = [];
      for (let i = 0; i < layout.fence.length - 1; i++) {
        const a = layout.fence[i], b = layout.fence[i + 1];
        if (b.gap) continue;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        for (const yy of [0.3, 0.62]) {
          const r = new THREE.BoxGeometry(len, 0.07, 0.04);
          r.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
          r.translate((a.x + b.x) / 2, heightAt((a.x + b.x) / 2, (a.z + b.z) / 2) + yy, (a.z + b.z) / 2 - 0.04);
          rails.push(r);
        }
      }
      if (rails.length) { const rm = new THREE.Mesh(merge(rails), mat); rm.castShadow = true; s.add(rm); }
    }
    // --- mushrooms
    if (layout.mushrooms.length) {
      const stem = new THREE.CylinderGeometry(0.05, 0.07, 0.22, 8); stem.translate(0, 0.11, 0); tint(stem, '#f7f0e2');
      const cap = new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.7, 1); cap.translate(0, 0.2, 0);
      const cp = cap.attributes.position, cc = new Float32Array(cp.count * 3);
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i), z = cp.getZ(i), y = cp.getY(i);
        const dot = Math.sin(x * 60) * Math.sin(z * 60) > 0.55 && y > 0.23;
        cc.set(dot ? [1, 0.97, 0.92] : [0.86, 0.2, 0.18], i * 3);
      }
      cap.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      const m = new THREE.InstancedMesh(merge([stem, cap]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), layout.mushrooms.length);
      layout.mushrooms.forEach((f, i) => place(m, i, f.x, heightAt(f.x, f.z), f.z, f.r, f.s));
      m.castShadow = true;
      s.add(m);
    }
    // --- reeds, cattails and lily pads (pond decoration)
    if (layout.reeds.length) {
      const R = rng(71), parts = [];
      for (const rd of layout.reeds) {
        const y0 = heightAt(rd.x, rd.z);
        for (let k = 0; k < 4; k++) {
          const h = 0.6 + R() * 0.7, bl = new THREE.ConeGeometry(0.025, h, 4); bl.translate(0, h / 2, 0);
          bl.rotateZ((R() - 0.5) * 0.35); bl.rotateY(R() * 6);
          bl.translate(rd.x + (R() - 0.5) * 0.3, y0, rd.z + (R() - 0.5) * 0.3);
          parts.push(tint(bl, R() < 0.5 ? '#4f8f3a' : '#6aa845', 0.1, k));
          if (k === 0) { const ct = new THREE.CapsuleGeometry(0.045, 0.16, 3, 6); ct.translate(rd.x, y0 + h + 0.05, rd.z); parts.push(tint(ct, '#6b4326')); }
        }
      }
      const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
      m.castShadow = true;
      s.add(m);
    }
    if (layout.pads.length) {
      const parts = [];
      const R = rng(72);
      for (const pd of layout.pads) {
        const g = new THREE.CircleGeometry(pd.s, 18, 0.35, Math.PI * 2 - 0.5); g.rotateX(-Math.PI / 2); g.rotateY(R() * 6); g.translate(pd.x, pd.y, pd.z);
        parts.push(tint(g, R() < 0.5 ? '#4caa4a' : '#5cba52', 0.12, 1));
        if (pd.flower) {
          for (let k = 0; k < 7; k++) {
            const pet = new THREE.SphereGeometry(0.07, 8, 5); pet.scale(0.5, 0.35, 1.2); pet.rotateX(-0.6); pet.translate(0, 0.05, 0.07); pet.rotateY((k / 7) * Math.PI * 2);
            pet.translate(pd.x, pd.y, pd.z);
            parts.push(tint(pet, k % 2 ? '#ff9fc4' : '#ffc4dc'));
          }
          const c = new THREE.SphereGeometry(0.035, 6, 5); c.translate(pd.x, pd.y + 0.06, pd.z); parts.push(tint(c, '#ffd23f'));
        }
      }
      const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
      m.receiveShadow = true;
      s.add(m);
    }
    // --- mossy log
    if (layout.logs.length) {
      const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), color: '#b89272', roughness: 0.95 });
      for (const lg of layout.logs) {
        const g = new THREE.CylinderGeometry(0.28, 0.32, 2.2, 12, 1);
        g.rotateZ(Math.PI / 2);
        const m = new THREE.Mesh(g, bark);
        m.position.set(lg.x, heightAt(lg.x, lg.z) + 0.26, lg.z);
        m.rotation.y = lg.r;
        m.castShadow = true; m.receiveShadow = true;
        s.add(m);
        const moss = blob(0.3, 2, 3, 0.2); moss.scale(2.6, 0.45, 0.9); tint(moss, '#6fae47', 0.2, 2);
        const mm = new THREE.Mesh(moss, foliageMaterial());
        mm.position.set(lg.x, heightAt(lg.x, lg.z) + 0.52, lg.z); mm.rotation.y = lg.r;
        s.add(mm);
      }
    }
    // --- contact shadows: soft dark blobs under things that stand on the grass
    if (layout.shadows.length) {
      const q = new THREE.PlaneGeometry(1, 1); q.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: '#10200c', opacity: 0.55 });
      const m = new THREE.InstancedMesh(q, mat, layout.shadows.length);
      layout.shadows.forEach((sh, i) => place(m, i, sh.x, heightAt(sh.x, sh.z) + 0.015, sh.z, 0, sh.s, 1, sh.s * (sh.sz || 1)));
      m.renderOrder = 1;
      s.add(m);
    }
  }
}
