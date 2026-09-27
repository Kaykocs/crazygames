// Terrain painters for the cached ground tiles: the zone masks and colour map of the whole garden, gravel walks
// with sunk edge stones, stepping stones, the pond (bank, shallows, reflections, rim stones, pebble beach) and
// the kitchen garden's bark mulch. All drawn in screen-space world units (X = x, Y = z·SQ); flat shapes are
// drawn in (x, z) under scale(1, SQ) so they are foreshortened like the ground.
import { rng, hash2, noise2, fbm, softEllipse, smoothClosed } from './paint.js';
import { shade, ink, rgba } from './color.js';
import { SQ } from './view3q.js';
import { stampRes } from './stamps.js';
import { PATHS, MEADOWS, FENCE_LINE, SIDE, GARDEN_FRONT, pathAt } from './plan.js';

const TAU = Math.PI * 2;
const GRAVEL = '#cfbf9c', GRAVEL_EDGE = '#8f7d5e';

// ------------------------------------------------------------------------------------------ helpers
function strokeLine(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); }
function softBlob(g, x, y, rx, ry, rgb, a) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.6, `rgba(${rgb},${a * 0.6})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
}
export function pondPoints(P, k = 1) {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    const w = 1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a + 2);
    pts.push([Math.cos(a) * P.rx * w * k, Math.sin(a) * P.rz * w * k * SQ]);
  }
  return pts;
}

// ------------------------------------------------------------------------------------------ masks
// mask 1: R hard ground (no grass), G wild (meadow), B tree shade
export function paintMask1(g, scene) {
  const P = scene.pond;
  // hard: gravel walks, water, tilled earth
  g.save(); g.scale(1, SQ);
  g.strokeStyle = 'rgb(255,0,0)';
  for (const p of PATHS) if (p.kind === 'gravel') { g.lineWidth = p.w - 0.1; strokeLine(g, p.line); g.stroke(); }
  g.restore();
  g.fillStyle = 'rgb(255,0,0)';
  g.save(); g.translate(P.x, P.z * SQ); g.beginPath(); smoothClosed(g, pondPoints(P, 1.05)); g.fill(); g.restore();
  for (const m of scene.mulch) { g.beginPath(); g.rect(m.x0 + 0.1, m.z0 * SQ + 0.05, m.x1 - m.x0 - 0.2, (m.z1 - m.z0) * SQ - 0.1); g.fill(); }
  // wild: meadows beyond the fence and in the corners, longer grass along fences and hedges
  for (const m of MEADOWS) softBlob(g, m.x, m.z * SQ, m.rx, m.rz * SQ, '0,255,0', 1);
  let gr = g.createLinearGradient(0, (FENCE_LINE - 0.35) * SQ, 0, (FENCE_LINE - 1.6) * SQ);
  gr.addColorStop(0, 'rgba(0,255,0,0)'); gr.addColorStop(1, 'rgba(0,255,0,0.85)');
  g.fillStyle = gr; g.fillRect(-60, -40, 120, (FENCE_LINE - 0.35) * SQ + 40);
  for (const sgn of [-1, 1]) {
    gr = g.createLinearGradient(sgn * (SIDE + 0.3), 0, sgn * (SIDE + 2), 0);
    gr.addColorStop(0, 'rgba(0,255,0,0)'); gr.addColorStop(1, 'rgba(0,255,0,0.8)');
    g.fillStyle = gr; if (sgn < 0) g.fillRect(-60, -40, 60 - SIDE - 0.3, 90); else g.fillRect(SIDE + 0.3, -40, 60, 90);
  }
  gr = g.createLinearGradient(0, GARDEN_FRONT * SQ, 0, (GARDEN_FRONT + 3) * SQ);
  gr.addColorStop(0, 'rgba(0,255,0,0)'); gr.addColorStop(1, 'rgba(0,255,0,0.7)');
  g.fillStyle = gr; g.fillRect(-60, GARDEN_FRONT * SQ, 120, 40);
  // a strip of longer grass at the foot of the fence and hedges
  g.fillStyle = 'rgba(0,255,0,0.35)'; g.fillRect(-SIDE, (FENCE_LINE - 0.1) * SQ, SIDE * 2, 0.5 * SQ);
  // shade: trees and big bushes (cast down-right, light from the upper left)
  for (const t of scene.trees) softBlob(g, t.x + 0.55 * t.s, (t.z + 0.35 * t.s) * SQ, 2.1 * t.s, 1.25 * t.s * SQ, '0,0,255', 0.95);
  for (const b of scene.shrubs) softBlob(g, b.x + 0.25 * b.s, (b.z + 0.2 * b.s) * SQ, 1.0 * b.s, 0.6 * b.s * SQ, '0,0,255', 0.5);
}

// mask 2: R woods floor, G damp (pond margin), B worn earth
export function paintMask2(g, scene) {
  const P = scene.pond;
  // woods: all around, beyond the meadows
  const woods = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => {
    const gr = g.createLinearGradient(gx0, gy0, gx1, gy1);
    gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, 'rgba(255,0,0,1)');
    g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  // wide gradients: the warp moves the woodland edge back and forth within them
  woods(-60, -40, 60, -14 * SQ, 0, -14 * SQ, 0, -32 * SQ);
  woods(-60, -40, -21, 60, -21, 0, -37, 0);
  woods(21, -40, 60, 60, 21, 0, 37, 0);
  woods(-60, 25 * SQ, 60, 60, 0, 25 * SQ, 0, 44 * SQ);
  for (const c of scene.groves) softBlob(g, c.x, c.z * SQ, c.r, c.r * 0.6, '255,0,0', 0.45);
  // damp margin round the pond
  softBlob(g, P.x + 0.2, (P.z + 0.3) * SQ, P.rx + 1.6, (P.rz + 1.3) * SQ, '0,255,0', 1);
  // worn earth: doorways, the hive's landing, junctions, the kitchen garden
  for (const w of scene.worn) softBlob(g, w.x, w.z * SQ, w.rx, w.rz * SQ, '0,0,255', w.a);
}

// ------------------------------------------------------------------------------------------ zone warp
// ragged, organic edges for the meadows and the woods (shared by the colour map and the scattered details)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function warpMasks(map) {
  const { w, h, m1, m2 } = map;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4;
    const wild = m1[k + 1], woods = m2[k];
    if (wild === 0 && woods === 0) continue;
    const [X, Y] = map.px2w(i, j), z = Y / SQ;
    const n = fbm(X * 0.22, z * 0.22, 2, 57) - 0.5, n2 = noise2(X * 0.7, z * 0.7, 61) - 0.5, big = fbm(X * 0.05, z * 0.05, 2, 71) - 0.5;
    if (wild) m1[k + 1] = 255 * smooth(0.12, 0.88, wild / 255 + n * 0.75 + n2 * 0.18);
    if (woods) m2[k] = 255 * smooth(0.36, 0.64, woods / 255 + big * 0.6 + n * 0.16);
  }
}

// ------------------------------------------------------------------------------------------ colour map
const lerp3 = (c, t, k) => { c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k; };
const WARM = [150, 206, 96], COOL = [92, 164, 84], SUNNY = [158, 210, 100], DEEP = [88, 158, 80];
const MEAD = [170, 200, 92], MEAD2 = [132, 188, 86], SHADE = [62, 120, 90], WOODS = [70, 112, 66], DAMP = [82, 164, 94], WORN = [178, 164, 114];

export function paintTone(g, map, scene) {
  const b = map.b;
  // 1. per-pixel base colour at 2 px/unit, upscaled: soft warm / cool fields, painterly sunny and deep patches,
  //    fine mottling, then the zones (meadow, damp, woods, shade, worn earth)
  const R = 2, w = Math.ceil((b.X1 - b.X0) * R), h = Math.ceil((b.Y1 - b.Y0) * R);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cg = c.getContext('2d'), img = cg.createImageData(w, h), d = img.data;
  const col = [0, 0, 0];
  for (let j = 0; j < h; j++) {
    const Y = b.Y0 + (j + 0.5) / R, z = Y / SQ;
    for (let i = 0; i < w; i++) {
      const X = b.X0 + (i + 0.5) / R;
      col[0] = 124; col[1] = 196; col[2] = 88;
      const n1 = fbm(X * 0.05, z * 0.05, 3, 11), n2 = fbm(X * 0.26, z * 0.26, 2, 29), n3 = noise2(X * 1.05, z * 1.05, 41);
      const t1 = Math.max(-1, Math.min(1, (n1 - 0.5) * 2));
      if (t1 > 0) lerp3(col, WARM, t1 * 0.6); else lerp3(col, COOL, -t1 * 0.55);
      const t2 = Math.max(-1, Math.min(1, (n2 - 0.5) * 2.6));
      if (t2 > 0) lerp3(col, SUNNY, t2 * 0.5); else lerp3(col, DEEP, -t2 * 0.45);
      const l = 1 + (n3 - 0.5) * 0.07;
      col[0] *= l; col[1] *= l; col[2] *= l;
      const wild = map.s(1, 1, X, Y), sh = map.s(1, 2, X, Y), wo = map.s(2, 0, X, Y), dp = map.s(2, 1, X, Y), wr = map.s(2, 2, X, Y);
      if (wild > 0.01) lerp3(col, n2 > 0.5 ? MEAD : MEAD2, wild * 0.6);
      if (dp > 0.01) lerp3(col, DAMP, dp * 0.5);
      if (wo > 0.01) lerp3(col, WOODS, wo * 0.65);
      if (sh > 0.01) lerp3(col, SHADE, Math.min(1, sh) * 0.62);
      if (wr > 0.01) lerp3(col, WORN, Math.min(1, wr) * (0.55 + n3 * 0.3));
      const k = (j * w + i) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
  }
  cg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(c, b.X0, b.Y0, w / R, h / R);

  // 2. mown stripes inside the walk around the beds
  const loop = PATHS.find((p) => p.id === 'loop');
  g.save();
  g.beginPath(); g.moveTo(loop.line[0][0], loop.line[0][1] * SQ); for (const [x, z] of loop.line) g.lineTo(x, z * SQ); g.closePath(); g.clip();
  g.scale(1, SQ); g.rotate(-0.62);
  for (let k = -16; k < 16; k++) {
    g.fillStyle = k % 2 ? 'rgba(255,255,215,0.15)' : 'rgba(20,70,30,0.09)';
    g.fillRect(k * 1.45, -30, 1.45, 60);
  }
  g.restore();

  // 3. flat versions of the walks, pond and soil (the tiles paint the detailed ones on top; the zoomed-out
  //    overview shows just these)
  g.save(); g.scale(1, SQ);
  for (const p of PATHS) {
    g.strokeStyle = 'rgba(96,92,50,0.3)'; g.lineWidth = p.w + 0.55; strokeLine(g, p.line); g.stroke();
    if (p.kind === 'gravel') { g.strokeStyle = GRAVEL; g.lineWidth = p.w; g.stroke(); }
  }
  g.restore();
  const P = scene.pond;
  g.save(); g.translate(P.x, P.z * SQ);
  g.beginPath(); smoothClosed(g, pondPoints(P, 1.1)); g.fillStyle = '#6d6446'; g.fill();
  g.beginPath(); smoothClosed(g, pondPoints(P, 0.97)); g.fillStyle = '#4aa6d4'; g.fill();
  g.restore();
  for (const m of scene.mulch) { g.fillStyle = '#8a6444'; g.beginPath(); roundRectPath(g, m.x0, m.z0 * SQ, m.x1 - m.x0, (m.z1 - m.z0) * SQ, 0.3); g.fill(); }
}

// ------------------------------------------------------------------------------------------ gravel walks
const PAT = new Map();
function gravelCanvas(res) {
  const r = Math.min(128, stampRes(res));
  let c = PAT.get(r);
  if (c) return c;
  const S = 2;                    // 2 × 2 world units (x, z), repeats seamlessly
  c = document.createElement('canvas'); c.width = c.height = S * r;
  const g = c.getContext('2d');
  g.setTransform(r, 0, 0, r, 0, 0);
  const R = rng(77);
  const cols = ['#e2d6bb', '#cbbd9c', '#b9aa88', '#d8ccb2', '#a8987a', '#efe6d0', '#c2b294'];
  const lw = 1 / r;
  for (let i = 0; i < 520; i++) {
    const x = R() * S, y = R() * S, rr = 0.018 + R() * R() * 0.05, e = 0.6 + R() * 0.4, a = R() * Math.PI;
    const cc = cols[Math.floor(R() * cols.length)];
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const X = x + ox, Y = y + oy;
      if (X < -0.1 || X > S + 0.1 || Y < -0.1 || Y > S + 0.1) continue;
      g.fillStyle = 'rgba(70,56,36,0.35)'; g.beginPath(); g.ellipse(X + rr * 0.25, Y + rr * 0.35, rr, rr * e, a, 0, TAU); g.fill();
      g.fillStyle = cc; g.beginPath(); g.ellipse(X, Y, rr, rr * e, a, 0, TAU); g.fill();
      if (rr > 0.03) { g.strokeStyle = rgba(ink(cc, 0.4), 0.45); g.lineWidth = lw; g.stroke(); }
      g.fillStyle = 'rgba(255,255,250,0.55)'; g.beginPath(); g.ellipse(X - rr * 0.3, Y - rr * 0.3, rr * 0.4, rr * 0.25 * e, a, 0, TAU); g.fill();
    }
  }
  PAT.set(r, c);
  return c;
}

// paints the walks crossing a tile; pushes edge stones / tufts / stepping stones as sortable items
export function paintPaths(ctx, X0, Y0, X1, Y1, px, map, items) {
  const res = 1 / px;
  const z0 = Y0 / SQ - 1.5, z1 = Y1 / SQ + 1.5;
  let pat = null;
  for (const p of PATHS) {
    const b = p.box;
    if (b.x1 < X0 - 1 || b.x0 > X1 + 1 || b.z1 < z0 || b.z0 > z1) continue;
    if (p.kind === 'gravel') {
      if (!pat) {
        pat = ctx.createPattern(gravelCanvas(res), 'repeat');
        const r = Math.min(128, stampRes(res));
        pat.setTransform(new DOMMatrix([1 / r, 0, 0, 1 / r, 0, 0]));
      }
      ctx.save(); ctx.scale(1, SQ);
      strokeLine(ctx, p.line);
      ctx.strokeStyle = rgba(GRAVEL_EDGE, 0.85); ctx.lineWidth = p.w + 0.1; ctx.stroke();
      ctx.strokeStyle = GRAVEL; ctx.lineWidth = p.w - 0.02; ctx.stroke();
      ctx.strokeStyle = pat; ctx.lineWidth = p.w - 0.05; ctx.stroke();
      // soft light down the middle, where feet have pressed it smooth
      ctx.strokeStyle = 'rgba(255,248,225,0.16)'; ctx.lineWidth = p.w * 0.45; ctx.stroke();
      ctx.restore();
      // a ribbon of low flowers inside the walk round the beds, and on both sides of the lane up to the front hedge
      if (p.id === 'loop' || p.id === 'front') edgingAlong(p, X0, X1, z0, z1, map, items);
      // sunk stones and grass tufts along both edges
      const step = 0.42, n = Math.floor(p.len[p.len.length - 1] / step);
      for (let k = 0; k <= n; k++) {
        const s = k * step;
        const a = pathAt(p, s);
        if (a.x < X0 - 1 || a.x > X1 + 1 || a.z < z0 || a.z > z1) continue;
        for (const side of [-1, 1]) {
          const hh = hash2(k, side, p.w * 100 | 0);
          const off = p.w / 2 + 0.03 + hash2(k, side + 5, 3) * 0.05;
          const x = a.x - a.tz * off * side, z = a.z + a.tx * off * side;
          // no edge stones where another walk joins
          if (map.s(1, 0, x - a.tz * 0.25 * side, (z + a.tx * 0.25 * side) * SQ) > 0.5) continue;
          const f = hash2(k, side + 9, 7) < 0.5;
          if (hh < 0.46) items.push({ y: z * SQ, x, k: 'estone', v: Math.floor(hash2(k, side, 11) * 12), f });
          else if (hh < 0.62) items.push({ y: z * SQ + 0.02, x: x - a.tz * 0.08 * side, k: 'tuft', v: Math.floor(hash2(k, side, 13) * 8), f });
          else if (hh < 0.7) items.push({ y: z * SQ + 0.01, x, k: 'pebble', v: Math.floor(hash2(k, side, 17) * 8), f });
        }
      }
    } else {
      // stepping stones, alternating a little from side to side
      const L = p.len[p.len.length - 1], step = p.w * 0.95;
      const n = Math.max(1, Math.round(L / step));
      for (let k = 0; k <= n; k++) {
        const a = pathAt(p, (k / n) * L);
        if (a.x < X0 - 1 || a.x > X1 + 1 || a.z < z0 || a.z > z1) continue;
        const side = (k % 2 ? 1 : -1) * 0.08 + (hash2(k, 3, p.len.length) - 0.5) * 0.08;
        const x = a.x - a.tz * side, z = a.z + a.tx * side;
        const sz = p.w * (0.95 + hash2(k, 5, 1) * 0.2);
        items.push({ y: z * SQ - 0.3, x, z, s: sz, seed: k * 13 + p.len.length, draw: stoneDraw });
      }
    }
  }
}
function stoneDraw(ctx, px) { ctx.save(); ctx.translate(this.x, this.z * SQ); paintFlagstone(ctx, px, this.seed, this.s); ctx.restore(); }

// bedding scheme: runs of alyssum and lobelia with the odd group of marigolds, pinks or violas
const SCHEME = [0, 1, 0, 1, 2, 0, 1, 3, 0, 1, 4, 5];
let loopCentre = null;
function edgingAlong(p, X0, X1, z0, z1, map, items) {
  if (!loopCentre && p.id === 'loop') { let sx = 0, sz = 0; for (const [x, z] of p.line) { sx += x; sz += z; } loopCentre = [sx / p.line.length, sz / p.line.length]; }
  const L = p.len[p.len.length - 1], step = 0.27;
  for (let k = 0, n = Math.floor(L / step); k <= n; k++) {
    const s = k * step, a = pathAt(p, s);
    if (a.x < X0 - 1 || a.x > X1 + 1 || a.z < z0 || a.z > z1) continue;
    if (p.id === 'front' && (a.z < 9.7 || a.z > 13.1)) continue;
    for (const side of [-1, 1]) {
      const off = p.w / 2 + 0.2 + hash2(k, side, 71) * 0.06;
      const x = a.x - a.tz * off * side, z = a.z + a.tx * off * side;
      if (p.id === 'loop') {
        const c = loopCentre, xo = a.x + a.tz * off * side, zo = a.z - a.tx * off * side;
        if ((x - c[0]) ** 2 + (z - c[1]) ** 2 > (xo - c[0]) ** 2 + (zo - c[1]) ** 2) continue;   // outer side
      }
      const Y = z * SQ;
      if (map.s(1, 0, x, Y) > 0.3 || map.s(2, 1, x, Y) > 0.45 || hash2(k, side, 73) < 0.08) continue;
      const g = Math.floor((s + (side > 0 ? 0 : 3.1)) / 1.9);
      const v = SCHEME[Math.floor(hash2(g, side, 77) * SCHEME.length)] + (hash2(k, side, 79) < 0.5 ? 6 : 0);
      items.push({ y: Y, x, k: 'edging', v, f: hash2(k, side, 83) < 0.5 });
    }
  }
}

// a flat stepping stone set into the lawn
export function paintFlagstone(ctx, px, seed = 1, size = 0.8) {
  const R = rng(seed + 11);
  const lw = Math.max(0.012, px * 1.2);
  const pts = [];
  const n = 10, rx = size * 0.5, rz = size * 0.42 * SQ;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const k = 0.86 + R() * 0.2; pts.push([Math.cos(a) * rx * k, Math.sin(a) * rz * k]); }
  ctx.beginPath(); smoothClosed(ctx, pts.map(([x, y]) => [x * 1.08 + 0.02, y * 1.1 + 0.035]), 0.5);
  ctx.fillStyle = 'rgba(40,52,24,0.35)'; ctx.fill();
  ctx.beginPath(); smoothClosed(ctx, pts.map(([x, y]) => [x, y + 0.035]), 0.5);
  ctx.fillStyle = '#8f8573'; ctx.fill();
  ctx.beginPath(); smoothClosed(ctx, pts, 0.5);
  const col = shade('#d9d1bf', (R() - 0.5) * 0.14);
  const g = ctx.createLinearGradient(-rx, -rz, rx, rz);
  g.addColorStop(0, shade(col, 0.32)); g.addColorStop(1, shade(col, -0.14));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 12; i++) { ctx.fillStyle = rgba(R() < 0.5 ? '#8f8573' : '#ffffff', 0.3); ctx.beginPath(); ctx.arc((R() - 0.5) * rx * 1.8, (R() - 0.5) * rz * 1.8, 0.01 + R() * 0.012, 0, TAU); ctx.fill(); }
  // a crack and moss in the low side
  ctx.strokeStyle = rgba(shade(col, -0.45), 0.5); ctx.lineWidth = lw * 0.7;
  ctx.beginPath(); ctx.moveTo(-rx * 0.2, -rz * 0.9); ctx.quadraticCurveTo(rx * 0.05, -rz * 0.1, rx * 0.35, rz * 0.4); ctx.stroke();
  if (R() < 0.7) { ctx.fillStyle = rgba('#7cbb48', 0.85); ctx.beginPath(); ctx.ellipse(rx * (R() - 0.5), rz * 0.75, rx * 0.35, rz * 0.3, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); smoothClosed(ctx, pts, 0.5);
  ctx.strokeStyle = ink(col, 0.55); ctx.lineWidth = lw; ctx.stroke();
  // a few blades peeking over the rim
  ctx.strokeStyle = '#4f9a3c'; ctx.lineWidth = lw * 0.9;
  for (let i = 0; i < 4; i++) { const a = Math.PI * (0.15 + R() * 0.7); const x = Math.cos(a) * rx, y = Math.sin(a) * rz + 0.03; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 0.01, y - 0.03, x + (R() - 0.5) * 0.04, y - 0.05 - R() * 0.03); ctx.stroke(); }
}

export function warmTerrain(res) { gravelCanvas(res); mulchCanvas(res); }

// ------------------------------------------------------------------------------------------ bark mulch
const MULCH = new Map();
function mulchCanvas(res) {
  const r = Math.min(128, stampRes(res));
  let c = MULCH.get(r);
  if (c) return c;
  const S = 2;
  c = document.createElement('canvas'); c.width = c.height = S * r;
  const g = c.getContext('2d');
  g.setTransform(r, 0, 0, r, 0, 0);
  const R = rng(91);
  const cols = ['#9a6a42', '#b07a4a', '#7a5234', '#c28c58', '#8a5e3a', '#d4a26a'];
  for (let i = 0; i < 380; i++) {
    const x = R() * S, y = R() * S, l = 0.04 + R() * 0.07, w = 0.015 + R() * 0.02, a = R() * Math.PI;
    const cc = cols[Math.floor(R() * cols.length)];
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const X = x + ox, Y = y + oy;
      if (X < -0.15 || X > S + 0.15 || Y < -0.15 || Y > S + 0.15) continue;
      g.save(); g.translate(X, Y); g.rotate(a);
      g.fillStyle = 'rgba(40,22,10,0.4)'; g.fillRect(-l / 2 + 0.008, -w / 2 + 0.01, l, w);
      g.fillStyle = cc; g.fillRect(-l / 2, -w / 2, l, w);
      g.fillStyle = 'rgba(255,230,190,0.35)'; g.fillRect(-l / 2, -w / 2, l, w * 0.35);
      g.restore();
    }
  }
  MULCH.set(r, c);
  return c;
}
// a mulched plot (x, z rect with rounded corners), drawn foreshortened
export function paintMulch(ctx, px, m) {
  const res = 1 / px;
  ctx.save(); ctx.scale(1, SQ);
  const rr = 0.45;
  const shape = (grow) => { ctx.beginPath(); roundRectPath(ctx, m.x0 - grow, m.z0 - grow, m.x1 - m.x0 + grow * 2, m.z1 - m.z0 + grow * 2, rr + grow); };
  shape(0.12); ctx.fillStyle = 'rgba(80,60,30,0.35)'; ctx.fill();
  shape(0); ctx.fillStyle = '#7a5436'; ctx.fill();
  const pat = ctx.createPattern(mulchCanvas(res), 'repeat');
  const r = Math.min(128, stampRes(res));
  pat.setTransform(new DOMMatrix([1 / r, 0, 0, 1 / r, 0, 0]));
  ctx.fillStyle = pat; ctx.fill();
  ctx.restore();
}
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ------------------------------------------------------------------------------------------ pond
export function paintPond(ctx, px, P) {
  const lw = Math.max(0.02, px * 1.3);
  ctx.save();
  ctx.translate(P.x, P.z * SQ);
  const shape = (k, dy = 0) => { ctx.beginPath(); smoothClosed(ctx, pondPoints(P, k).map(([x, y]) => [x, y + dy])); };
  // damp bank and mud
  shape(1.16, 0.06); ctx.fillStyle = 'rgba(52,72,30,0.3)'; ctx.fill();
  shape(1.07, 0.02); ctx.fillStyle = '#6a6045'; ctx.fill();
  shape(1.02); ctx.fillStyle = '#4f4a36'; ctx.fill();
  // water: deep middle, shallow sandy shelf toward the near bank
  shape(0.97);
  const w = ctx.createRadialGradient(0.15, -0.1, 0.1, 0, 0, P.rx * 1.02);
  w.addColorStop(0, '#2c86bd'); w.addColorStop(0.55, '#3f9fd0'); w.addColorStop(0.85, '#62bddf'); w.addColorStop(1, '#86d0e2');
  ctx.fillStyle = w; ctx.fill();
  ctx.save(); ctx.clip();
  // near-bank shallows: sand and pebbles seen through the water
  softEllipse(ctx, -0.25, P.rz * SQ * 0.72, P.rx * 0.9, P.rz * SQ * 0.35, '#e7d7a8', 0.45, 0.2);
  const R = rng(31);
  for (let i = 0; i < 40; i++) {
    const a = R() * TAU, r = 0.78 + R() * 0.2;
    const x = Math.cos(a) * P.rx * r, y = Math.sin(a) * P.rz * SQ * r;
    ctx.fillStyle = rgba(['#b9b6a0', '#8f9a8a', '#d0c8aa'][i % 3], 0.35 + R() * 0.2);
    ctx.beginPath(); ctx.ellipse(x, y, 0.03 + R() * 0.05, 0.02 + R() * 0.03, R(), 0, TAU); ctx.fill();
  }
  // water weed swaying under the surface
  ctx.strokeStyle = 'rgba(30,96,70,0.45)'; ctx.lineWidth = lw * 1.4;
  for (const [x0, y0] of [[-1.3, 0.25], [-1.0, 0.45], [1.3, -0.05], [1.5, 0.3], [0.3, 0.55]]) {
    for (let k = 0; k < 3; k++) { const x = x0 + k * 0.07; ctx.beginPath(); ctx.moveTo(x, y0 + 0.2); ctx.bezierCurveTo(x + 0.08, y0 + 0.05, x - 0.08, y0 - 0.05, x + 0.03, y0 - 0.2 - k * 0.03); ctx.stroke(); }
  }
  // the far bank reflected: a dark band with the reeds' vertical strokes
  const sh = ctx.createLinearGradient(0, -P.rz * SQ * 1.02, 0, -P.rz * SQ + 0.75);
  sh.addColorStop(0, 'rgba(18,60,50,0.62)'); sh.addColorStop(1, 'rgba(18,60,50,0)');
  ctx.fillStyle = sh; ctx.fillRect(-P.rx * 1.2, -P.rz, P.rx * 2.4, 1.5);
  ctx.strokeStyle = 'rgba(30,80,40,0.35)'; ctx.lineWidth = lw * 1.2;
  for (let i = 0; i < 14; i++) { const x = -1.6 + i * 0.24 + R() * 0.08, y = -P.rz * SQ * 0.82 + R() * 0.1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y + 0.18 + R() * 0.2); ctx.stroke(); }
  // sky: soft pale streaks
  softEllipse(ctx, -0.6, -0.3, 1.25, 0.2, '#ffffff', 0.34, 0.2);
  softEllipse(ctx, 0.85, 0.22, 0.85, 0.14, '#e6f8ff', 0.3, 0.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = lw;
  for (const [x, y, l] of [[-0.9, -0.42, 0.6], [0.2, -0.2, 0.35], [0.9, 0.12, 0.45], [-0.3, 0.3, 0.3]]) { ctx.beginPath(); ctx.moveTo(x - l / 2, y); ctx.lineTo(x + l / 2, y); ctx.stroke(); }
  ctx.restore();
  // wet edge highlight along the near bank
  ctx.save(); shape(0.97); ctx.clip();
  shape(0.97, -0.06); ctx.strokeStyle = 'rgba(210,245,255,0.55)'; ctx.lineWidth = lw * 1.6; ctx.stroke();
  ctx.restore();
  // rim stones: bigger on the far bank, a pebble beach on the near left
  const stones = [];
  for (let i = 0; i < 34; i++) {
    const t = i / 34, a = t * TAU + R() * 0.08;
    if (a > 1.6 && a < 2.5) continue;                       // beach (near left)
    if (a > 0.05 && a < 0.95) continue;                     // grassy gap by the jetty
    const k = 1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a + 2);
    const far = Math.sin(a) < 0;
    stones.push({ x: Math.cos(a) * P.rx * k * 1.02, y: Math.sin(a) * P.rz * k * SQ * 1.02, r: (far ? 0.2 : 0.15) + R() * 0.13, seed: i });
  }
  stones.sort((p, q) => p.y - q.y);
  for (const st of stones) {
    const pts = [];
    const Rs = rng(st.seed + 5);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const rr = st.r * (0.85 + Rs() * 0.3); pts.push([st.x + Math.cos(a) * rr * 1.2, st.y + Math.sin(a) * rr * 0.72]); }
    ctx.beginPath(); smoothClosed(ctx, pts.map(([x, y]) => [x + 0.035, y + 0.05])); ctx.fillStyle = 'rgba(20,40,20,0.35)'; ctx.fill();
    ctx.beginPath(); smoothClosed(ctx, pts);
    const col = shade(['#cfc7b5', '#c2baa6', '#d6cfbf'][st.seed % 3], (Rs() - 0.5) * 0.15);
    const g = ctx.createLinearGradient(st.x - st.r, st.y - st.r, st.x + st.r, st.y + st.r);
    g.addColorStop(0, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.3));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = ink(col, 0.55); ctx.lineWidth = lw; ctx.stroke();
    if (Rs() < 0.5) { ctx.fillStyle = rgba('#78b848', 0.9); ctx.beginPath(); ctx.ellipse(st.x - st.r * 0.2, st.y - st.r * 0.45, st.r * 0.55, st.r * 0.2, 0, 0, TAU); ctx.fill(); }
  }
  // pebble beach
  for (let i = 0; i < 26; i++) {
    const a = 1.6 + R() * 0.9, r = 0.98 + R() * 0.14;
    const x = Math.cos(a) * P.rx * r, y = Math.sin(a) * P.rz * SQ * r;
    const rr = 0.03 + R() * 0.045, col = ['#e4dccb', '#cfc6b4', '#bdb3a0', '#d9cdb5'][i % 4];
    ctx.fillStyle = 'rgba(40,40,20,0.3)'; ctx.beginPath(); ctx.ellipse(x + 0.012, y + 0.015, rr * 1.2, rr * 0.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col; ctx.strokeStyle = ink(col, 0.5); ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ctx.ellipse(x, y, rr * 1.2, rr * 0.7, R(), 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
