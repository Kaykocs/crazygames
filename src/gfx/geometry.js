// Procedural geometry. Everything the game draws is built here from code (no model files).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/math.js';

const DEG = Math.PI / 180;

// Flat-top hexagon prism with rounded corners and rounded (bevelled) top + bottom rims, indexed, smooth normals.
// Base sits at y = 0, top at y = height. uv = top-down position mapped to 0..1 across the hex (used for emblems).
export function roundedHexPrism({ radius = 1, height = 0.2, corner = 0.2, bevel = 0.05, cornerSegs = 3, bevelSegs = 2 } = {}) {
  bevel = Math.min(bevel, corner * 0.95, height / 2);
  // outline at the widest ring: 6 corner arcs; each sample = { cx, cz (arc centre), nx, nz (outward normal) }
  const d = (radius - corner / Math.sin(60 * DEG));
  const outline = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 60 * DEG;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    for (let s = 0; s <= cornerSegs; s++) {
      const t = a - 30 * DEG + (60 * DEG * s) / cornerSegs;
      outline.push({ cx, cz, nx: Math.cos(t), nz: Math.sin(t) });
    }
  }
  const P = outline.length;
  // vertical profile rings: bottom bevel (φ from -90° to 0) then top bevel (0 to 90°)
  const rings = [];
  for (let k = 0; k <= bevelSegs; k++) { const phi = -90 * DEG + (90 * DEG * k) / bevelSegs; rings.push({ phi, yc: bevel }); }
  for (let k = 0; k <= bevelSegs; k++) { const phi = (90 * DEG * k) / bevelSegs; rings.push({ phi, yc: height - bevel }); }
  const pos = [], nor = [], uv = [], idx = [];
  const push = (x, y, z, nx, ny, nz) => {
    pos.push(x, y, z); nor.push(nx, ny, nz);
    uv.push(x / (radius * 2) + 0.5, z / (radius * 2) + 0.5);
  };
  for (const rg of rings) {
    const c = Math.cos(rg.phi), s = Math.sin(rg.phi);
    const rr = corner - bevel + bevel * c;  // arc radius at this ring
    for (const o of outline) push(o.cx + o.nx * rr, rg.yc + bevel * s, o.cz + o.nz * rr, o.nx * c, s, o.nz * c);
  }
  const R = rings.length;
  for (let k = 0; k < R - 1; k++) {
    if (k === bevelSegs) continue; // rings[bevelSegs] and [bevelSegs+1] are joined by the straight side below
    for (let j = 0; j < P; j++) {
      const a = k * P + j, b = k * P + ((j + 1) % P), c2 = (k + 1) * P + j, d2 = (k + 1) * P + ((j + 1) % P);
      idx.push(a, c2, b, b, c2, d2);
    }
  }
  // straight vertical side between the two bevels
  {
    const k = bevelSegs;
    for (let j = 0; j < P; j++) {
      const a = k * P + j, b = k * P + ((j + 1) % P), c2 = (k + 1) * P + j, d2 = (k + 1) * P + ((j + 1) % P);
      idx.push(a, c2, b, b, c2, d2);
    }
  }
  // caps (fan)
  const bottomC = pos.length / 3; push(0, 0, 0, 0, -1, 0);
  const topC = pos.length / 3; push(0, height, 0, 0, 1, 0);
  const topRing = (R - 1) * P;
  for (let j = 0; j < P; j++) {
    idx.push(bottomC, j, (j + 1) % P);
    idx.push(topC, topRing + ((j + 1) % P), topRing + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  g.computeBoundingSphere();
  return g;
}

// Make every triangle wind counter-clockwise as seen from the side its vertex normals point to.
function fixWinding(g) {
  const p = g.attributes.position, n = g.attributes.normal, ix = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3) {
    a.fromBufferAttribute(p, ix[t]); b.fromBufferAttribute(p, ix[t + 1]); c.fromBufferAttribute(p, ix[t + 2]);
    fn.subVectors(b, a).cross(c.sub(a));
    vn.fromBufferAttribute(n, ix[t]).add(c.fromBufferAttribute(n, ix[t + 1])).add(b.fromBufferAttribute(n, ix[t + 2]));
    if (fn.dot(vn) < 0) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
  }
}

// paint a flat colour into a 'color' attribute (for merged multi-colour meshes using vertexColors)
export function tint(g, hex, jitter = 0, seed = 1) {
  const col = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3), R = rng(seed);
  for (let i = 0; i < n; i++) {
    const k = 1 + (R() - 0.5) * jitter;
    arr[i * 3] = col.r * k; arr[i * 3 + 1] = col.g * k; arr[i * 3 + 2] = col.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// vertical gradient colour (bottom → top) in a 'color' attribute
export function gradient(g, bottomHex, topHex) {
  g.computeBoundingBox();
  const bb = g.boundingBox, c0 = new THREE.Color(bottomHex), c1 = new THREE.Color(topHex), c = new THREE.Color();
  const p = g.attributes.position, arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - bb.min.y) / Math.max(1e-5, bb.max.y - bb.min.y);
    c.copy(c0).lerp(c1, t);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// strip to position/normal/color so different generators can be merged
function clean(g) {
  const out = new THREE.BufferGeometry();
  const ng = g.index ? g.toNonIndexed() : g;
  out.setAttribute('position', ng.attributes.position);
  if (!ng.attributes.normal) ng.computeVertexNormals();
  out.setAttribute('normal', ng.attributes.normal);
  if (ng.attributes.color) out.setAttribute('color', ng.attributes.color);
  return out;
}
export function merge(list) {
  const g = mergeGeometries(list.map(clean), false);
  return g;
}

// lumpy low-poly stone
export function rockGeometry(seed = 1, size = 0.5) {
  const R = rng(seed);
  const g = new THREE.IcosahedronGeometry(size, 1);
  const p = g.attributes.position, v = new THREE.Vector3();
  const sx = 0.9 + R() * 0.4, sy = 0.55 + R() * 0.3, sz = 0.85 + R() * 0.4;
  // deterministic displacement per unique position so the shell stays closed
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let m = cache.get(k);
    if (m === undefined) { m = 0.82 + R() * 0.3; cache.set(k, m); }
    v.multiplyScalar(m);
    v.x *= sx; v.y *= sy; v.z *= sz;
    if (v.y < -size * 0.25) v.y = -size * 0.25 + (v.y + size * 0.25) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  ng.translate(0, size * 0.22, 0);
  return ng;
}

// soft round bush from overlapping low-poly blobs (vertex-coloured, darker at the bottom)
export function bushGeometry(seed = 1, size = 0.5, dark = '#2f8f4e', light = '#58c46f') {
  const R = rng(seed), parts = [];
  const n = 4 + R.int(3);
  for (let i = 0; i < n; i++) {
    const r = size * (0.45 + R() * 0.3);
    const s = new THREE.IcosahedronGeometry(r, 1);
    const a = R() * Math.PI * 2, dd = size * 0.45 * R();
    s.translate(Math.cos(a) * dd, r * 0.75 + R() * size * 0.3, Math.sin(a) * dd);
    parts.push(s);
  }
  const g = merge(parts);
  gradient(g, dark, light);
  return g;
}

// flower: returns { head, center, stem } geometries (unit scale, head centred at y = stemHeight)
export function flowerGeometries(petals = 5) {
  const stemH = 0.55;
  const parts = [];
  for (let i = 0; i < petals; i++) {
    const p = new THREE.SphereGeometry(0.16, 8, 6);
    p.scale(1, 0.32, 0.62);
    const a = (i / petals) * Math.PI * 2;
    p.rotateX(-0.25);                 // petals tilt up a little
    p.translate(0, 0, 0.13);
    p.rotateY(a);
    parts.push(p);
  }
  const head = merge(parts);
  head.translate(0, stemH, 0);
  const center = new THREE.SphereGeometry(0.075, 10, 8);
  center.scale(1, 0.6, 1);
  center.translate(0, stemH + 0.035, 0);
  const stem = new THREE.CylinderGeometry(0.018, 0.024, stemH, 5, 1);
  stem.translate(0, stemH / 2, 0);
  const leaf = new THREE.SphereGeometry(0.1, 6, 4);
  leaf.scale(0.45, 0.12, 1);
  leaf.rotateX(-0.5);
  leaf.translate(0, stemH * 0.35, 0.09);
  const leaf2 = leaf.clone(); leaf2.rotateY(2.4);
  const stemAll = merge([stem, leaf, leaf2]);
  return { head: clean(head), center: clean(center), stem: stemAll, stemH };
}

// tulip-style closed bud on a stem (vertex coloured: green sepals, coloured tip)
export function budGeometry() {
  const stem = new THREE.CylinderGeometry(0.03, 0.04, 0.5, 6, 1); stem.translate(0, 0.25, 0);
  tint(stem, '#3f9a4a');
  const bulb = new THREE.SphereGeometry(0.2, 10, 8); bulb.scale(1, 1.45, 1); bulb.translate(0, 0.72, 0);
  tint(bulb, '#ffffff');
  const sepals = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.SphereGeometry(0.12, 6, 4); s.scale(0.7, 1.4, 0.35); s.translate(0, 0.62, 0.14); s.rotateY((i * Math.PI * 2) / 3);
    sepals.push(s);
  }
  const sep = merge(sepals); tint(sep, '#52b25b');
  const leaf = new THREE.SphereGeometry(0.16, 6, 4); leaf.scale(0.4, 0.12, 1.3); leaf.rotateX(-0.6); leaf.translate(0, 0.2, 0.18);
  tint(leaf, '#4caf50');
  const leaf2 = leaf.clone(); leaf2.rotateY(Math.PI); tint(leaf2, '#43a047');
  return merge([stem, bulb, sep, leaf, leaf2]);
}

// low-poly tree: { trunk, canopy } (canopy vertex-coloured light→dark via gradient; tinted per instance)
export function treeGeometries(seed = 3) {
  const R = rng(seed);
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.1, 6, 1); trunk.translate(0, 0.55, 0);
  tint(trunk, '#8a5a3b', 0.1, seed);
  const blobs = [];
  for (let i = 0; i < 4; i++) {
    const r = 0.5 + R() * 0.25;
    const s = new THREE.IcosahedronGeometry(r, 1);
    const a = R() * Math.PI * 2, dd = 0.35 * R();
    s.translate(Math.cos(a) * dd, 1.35 + R() * 0.5, Math.sin(a) * dd);
    blobs.push(s);
  }
  const canopy = merge(blobs);
  gradient(canopy, '#bbbbbb', '#ffffff');   // brightness ramp; hue comes from the instance colour
  return { trunk: clean(trunk), canopy };
}

// three-blade grass tuft (vertex gradient)
export function grassTuftGeometry() {
  const blades = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.ConeGeometry(0.035, 0.28 + i * 0.05, 3, 1);
    b.translate(0, 0.14 + i * 0.025, 0);
    b.rotateZ((i - 1) * 0.35);
    b.rotateY(i * 2.1);
    blades.push(b);
  }
  const g = merge(blades);
  gradient(g, '#6d9a3a', '#c8f07a');
  return g;
}

// wooden round pad for the tray slots (rings on top via vertex colours)
export function padGeometry(radius = 1.02, h = 0.16) {
  const profile = [];
  const b = 0.05;
  profile.push(new THREE.Vector2(0, 0));
  profile.push(new THREE.Vector2(radius - b, 0));
  for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + (i / 3) * Math.PI / 2; profile.push(new THREE.Vector2(radius - b + Math.cos(a) * b, b + Math.sin(a) * b)); }
  for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI / 2; profile.push(new THREE.Vector2(radius - b + Math.cos(a) * b, h - b + Math.sin(a) * b)); }
  profile.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(profile, 32);
  // colour: bark on the rim, rings on the top
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const bark = new THREE.Color('#7a4f35'), wood = new THREE.Color('#e9c79a'), ring = new THREE.Color('#d2a877'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (y > h - 0.01 && r < radius - 0.1) {
      const k = 0.5 + 0.5 * Math.sin(r * 26);
      c.copy(wood).lerp(ring, k * 0.8);
    } else c.copy(bark);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// butterfly wing (flat triangle-ish shape), hinge on the x = 0 axis, wing extends toward +x
export function wingGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.02);
  s.bezierCurveTo(0.12, 0.2, 0.3, 0.2, 0.26, 0.05);
  s.bezierCurveTo(0.24, -0.02, 0.2, -0.04, 0.16, -0.05);
  s.bezierCurveTo(0.22, -0.12, 0.14, -0.2, 0.06, -0.14);
  s.lineTo(0, -0.04);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

export { mergeVertices };
