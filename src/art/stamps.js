// Ground stamps: small painted details (grass marks, clover, daisies, pebbles, fallen leaves, moss, edge stones,
// wildflowers...) painted once per power-of-two resolution and stamped into the cached ground tiles with a
// drawImage each. The same stamp at the same world position gives identical pixels in neighbouring tiles, so
// details that straddle a tile border stay seamless. Painters work in world units with the anchor at (0, 0).
import { rng, softEllipse } from './paint.js';
import { shade, ink, rgba } from './color.js';

const TAU = Math.PI * 2;
const CACHE = new Map();

// stamps are painted at the next power of two ≥ the tile resolution (drawn ≤ 2× smaller: crisp, few variants)
export const stampRes = (res) => Math.min(256, Math.pow(2, Math.ceil(Math.log2(Math.max(8, res * 0.999)))));

// w, h, ax, ay in world units; n variants; paint(ctx, px, v, R)
const DEF = {};
const def = (kind, w, h, ax, ay, n, paint) => { DEF[kind] = { w, h, ax, ay, n, paint }; };

export function stampCount(kind) { return DEF[kind].n; }

function make(kind, v, r, base) {
  const d = DEF[kind];
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(d.w * r)); c.height = Math.max(1, Math.ceil(d.h * r));
  const g = c.getContext('2d');
  const w = c.width / r, h = c.height / r;
  if (base) {
    // mirrored copy of the painted stamp (anchor mirrored too)
    g.setTransform(-1, 0, 0, 1, c.width, 0); g.drawImage(base.c, 0, 0);
    return { c, w, h, ax: w - d.ax, ay: d.ay };
  }
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.setTransform(r, 0, 0, r, d.ax * r, d.ay * r);
  d.paint(g, 1 / r, v, rng(1 + v * 7919 + kind.length * 104729 + kind.charCodeAt(0) * 31));
  return { c, w, h, ax: d.ax, ay: d.ay };
}

// keep the stamps of at most three resolutions (the ones the camera has used most recently)
const USED = new Map();
let tick = 0, lastR = 0;
function touch(r) {
  if (!USED.has(r) && USED.size >= 3) {
    let old = -1, t = Infinity;
    for (const [k, u] of USED) if (u < t) { t = u; old = k; }
    USED.delete(old);
    for (const key of [...CACHE.keys()]) if (key.endsWith('@' + old)) CACHE.delete(key);
  }
  USED.set(r, ++tick);
}

export function stamp(kind, v, res, flip = false) {
  const r = stampRes(res), d = DEF[kind];
  v %= d.n;
  const key = kind + v + (flip ? 'f' : '') + '@' + r;
  if (r !== lastR) { touch(r); lastR = r; }
  let s = CACHE.get(key);
  if (!s) {
    s = flip ? make(kind, v, r, stamp(kind, v, r)) : make(kind, v, r);
    CACHE.set(key, s);
  }
  return s;
}

// paint missing stamps of a resolution for up to `ms` (idle frames before the camera needs them); true when done
const ALL = [];
const DONE = new Set();
export function warmStep(res, ms) {
  const r = stampRes(res);
  if (DONE.has(r) && USED.has(r)) return true;
  if (!ALL.length) for (const k of Object.keys(DEF)) for (let v = 0; v < DEF[k].n; v++) ALL.push([k, v]);
  const t0 = performance.now();
  for (const [k, v] of ALL) {
    if (!CACHE.has(k + v + '@' + r)) { stamp(k, v, r); if (performance.now() - t0 > ms) return false; }
  }
  DONE.add(r);
  return true;
}

// stamp at world (x, y) (screen-space units) into a tile whose transform maps world → pixels
export function put(ctx, kind, v, x, y, res, flip = false, k = 1) {
  const s = stamp(kind, v, res, flip);
  ctx.drawImage(s.c, x - s.ax * k, y - s.ay * k, s.w * k, s.h * k);
}


// ------------------------------------------------------------------------------------------ grass
const G_DARK = ['#3f8a33', '#4b9738', '#427f36'], G_MID = ['#6fb84c', '#7dc452'], G_LIGHT = ['#a6db70', '#b8e67f', '#99d266'];

// a little mark of 3-6 blades: the painterly "vvv" that textures the lawn. v < 6 dark (shade side), else light
def('grass', 0.46, 0.2, 0.23, 0.17, 12, (ctx, px, v, R) => {
  const light = v >= 6;
  const n = 3 + Math.floor(R() * 4);
  const lw = Math.max(0.011, px * 1.15);
  for (let b = 0; b < n; b++) {
    const x = (b / Math.max(1, n - 1) - 0.5) * 0.24 + (R() - 0.5) * 0.04;
    const len = 0.07 + R() * 0.07, lean = (R() - 0.5) * 0.09 + x * 0.25;
    const col = light ? G_LIGHT[Math.floor(R() * 3)] : G_DARK[Math.floor(R() * 3)];
    ctx.strokeStyle = rgba(col, light ? 0.85 : 0.75); ctx.lineWidth = lw * (0.9 + R() * 0.5);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + lean * 0.2, -len * 0.6, x + lean, -len); ctx.stroke();
  }
});
// fine grain: many hair-thin blades (texture seen up close)
def('grain', 0.7, 0.34, 0.35, 0.22, 8, (ctx, px, v, R) => {
  const lw = Math.max(0.008, px * 0.9);
  for (let i = 0; i < 26; i++) {
    const x = (R() - 0.5) * 0.62, y = (R() - 0.5) * 0.16;
    const len = 0.04 + R() * 0.06, lean = (R() - 0.5) * 0.05;
    const t = R();
    ctx.strokeStyle = t < 0.4 ? 'rgba(62,128,48,0.5)' : t < 0.75 ? 'rgba(128,196,86,0.55)' : 'rgba(180,228,130,0.6)';
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.3, y - len * 0.6, x + lean, y - len); ctx.stroke();
  }
});
// longer meadow grass
def('meadow', 0.62, 0.5, 0.31, 0.44, 8, (ctx, px, v, R) => {
  const n = 7 + Math.floor(R() * 5), lw = Math.max(0.012, px * 1.2);
  for (let b = 0; b < n; b++) {
    const x = (R() - 0.5) * 0.36, len = 0.18 + R() * 0.22, lean = (R() - 0.5) * 0.22 + x * 0.4;
    const t = R();
    ctx.strokeStyle = t < 0.35 ? '#4a8f36' : t < 0.7 ? '#86c45a' : '#b8d97a';
    ctx.lineWidth = lw * (1 + R() * 0.6);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + lean * 0.25, -len * 0.55, x + lean, -len); ctx.stroke();
  }
  // a seed head or two
  if (R() < 0.6) {
    const x = (R() - 0.5) * 0.2, len = 0.34 + R() * 0.1;
    ctx.strokeStyle = '#8fa85a'; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 0.03, -len * 0.5, x + 0.06, -len); ctx.stroke();
    ctx.fillStyle = '#c9b87a'; ctx.beginPath(); ctx.ellipse(x + 0.065, -len - 0.03, 0.018, 0.045, 0.2, 0, TAU); ctx.fill();
  }
});
// stylised tuft (edges of paths, walls, stones)
def('tuft', 0.44, 0.34, 0.22, 0.3, 8, (ctx, px, v, R) => {
  const big = v >= 4 ? 1.35 : 1;
  const n = 5 + Math.floor(R() * 4), h = (0.12 + R() * 0.08) * big;
  softEllipse(ctx, 0.02, 0.005, 0.15 * big, 0.045, '#1d4214', 0.32);
  const lw = Math.max(0.008, px * 0.8);
  for (let b = 0; b < n; b++) {
    const t = b / (n - 1) - 0.5;
    const a = t * 1.3 + (R() - 0.5) * 0.3, len = h * (1 - Math.abs(t) * 0.5) * (0.8 + R() * 0.4);
    const bx = t * 0.1 * big, tx = bx + Math.sin(a) * len, ty = -Math.cos(a) * len;
    const w = (0.02 + R() * 0.01) * big;
    ctx.beginPath();
    ctx.moveTo(bx - w, 0);
    ctx.quadraticCurveTo(bx - w * 0.5 + (tx - bx) * 0.3, -len * 0.5, tx, ty);
    ctx.quadraticCurveTo(bx + w * 0.5 + (tx - bx) * 0.3, -len * 0.5, bx + w, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, ty);
    g.addColorStop(0, '#3a8030'); g.addColorStop(1, b % 2 ? '#a6de72' : '#8fd062');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rgba('#2b6122', 0.55); ctx.lineWidth = lw; ctx.stroke();
  }
});

// ------------------------------------------------------------------------------------------ low flowers & clover
function cloverLeaf(ctx, x, y, r, col, lw) {
  ctx.fillStyle = col; ctx.strokeStyle = rgba('#2a5f22', 0.55); ctx.lineWidth = lw;
  for (let l = 0; l < 3; l++) {
    const a = (l / 3) * TAU - Math.PI / 2;
    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.6, r, r * 0.72, a, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.strokeStyle = rgba('#e8ffd0', 0.45); ctx.lineWidth = lw * 0.8;
  for (let l = 0; l < 3; l++) { const a = (l / 3) * TAU - Math.PI / 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.3); ctx.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 0.8); ctx.stroke(); }
}
// clover patch; v ≥ 4 with white / pink clover heads
def('clover', 0.62, 0.34, 0.31, 0.2, 8, (ctx, px, v, R) => {
  const lw = Math.max(0.006, px * 0.7);
  const n = 5 + Math.floor(R() * 4);
  const L = [];
  for (let k = 0; k < n; k++) L.push([(R() - 0.5) * 0.46, (R() - 0.5) * 0.16, 0.026 + R() * 0.014]);
  L.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of L) { softEllipse(ctx, x + 0.01, y + 0.02, r * 2.2, r * 0.8, '#1d4214', 0.22); cloverLeaf(ctx, x, y, r, R() < 0.5 ? '#5aa843' : '#4b9a3c', lw); }
  if (v >= 4) {
    const m = 1 + Math.floor(R() * 2);
    for (let k = 0; k < m; k++) {
      const x = (R() - 0.5) * 0.36, y = -0.05 - R() * 0.04, pink = v >= 6;
      ctx.strokeStyle = '#4c8a38'; ctx.lineWidth = lw * 1.4; ctx.beginPath(); ctx.moveTo(x, y + 0.08); ctx.lineTo(x, y); ctx.stroke();
      for (let i = 0; i < 9; i++) {
        const a = R() * TAU, rr = R() * 0.028;
        ctx.fillStyle = pink ? (i % 2 ? '#f2a6c8' : '#e27fae') : (i % 2 ? '#ffffff' : '#ede6f5');
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * rr, y - 0.02 + Math.sin(a) * rr * 0.9, 0.014, 0.02, a, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = rgba(pink ? '#8a3a60' : '#8a7fa0', 0.5); ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y - 0.02, 0.038, 0, TAU); ctx.stroke();
    }
  }
});
function daisyHead(ctx, x, y, r, lw, petal = '#ffffff', eye = '#ffc93a') {
  ctx.fillStyle = petal; ctx.strokeStyle = rgba(ink(petal === '#ffffff' ? '#b9b0d0' : petal, 0.3), 0.75); ctx.lineWidth = lw;
  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * TAU;
    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.5, r * 0.5, r * 0.22, a, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = eye; ctx.beginPath(); ctx.ellipse(x, y, r * 0.36, r * 0.28, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(x - r * 0.1, y - r * 0.1, r * 0.1, 0, TAU); ctx.fill();
}
def('daisy', 0.56, 0.3, 0.28, 0.2, 8, (ctx, px, v, R) => {
  const lw = Math.max(0.006, px * 0.6);
  const n = 1 + Math.floor(R() * 4);
  const L = [];
  for (let k = 0; k < n; k++) L.push([(R() - 0.5) * 0.4, (R() - 0.5) * 0.12, 0.034 + R() * 0.016]);
  L.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of L) {
    ctx.fillStyle = '#4f9a3c';
    ctx.beginPath(); ctx.ellipse(x - 0.03, y + 0.05, 0.035, 0.012, -0.4, 0, TAU); ctx.ellipse(x + 0.035, y + 0.055, 0.03, 0.011, 0.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#4c9a3a'; ctx.lineWidth = lw * 1.5; ctx.beginPath(); ctx.moveTo(x, y + 0.06); ctx.lineTo(x, y); ctx.stroke();
    softEllipse(ctx, x + 0.012, y + 0.06, 0.05, 0.015, '#1d4214', 0.25);
    daisyHead(ctx, x, y, r, lw, v >= 6 ? '#ffe3ef' : '#ffffff');
  }
});
function cup(ctx, x, y, r, lw, col, inkC) {
  ctx.fillStyle = col; ctx.strokeStyle = inkC; ctx.lineWidth = lw;
  for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU - Math.PI / 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.42, r * 0.5, r * 0.4, a, 0, TAU); ctx.fill(); ctx.stroke(); }
}
// buttercups / dandelions / speedwell / violets
def('flowers', 0.5, 0.36, 0.25, 0.26, 16, (ctx, px, v, R) => {
  const lw = Math.max(0.006, px * 0.7);
  const kind = v % 4;
  const n = kind === 2 ? 4 + Math.floor(R() * 4) : 2 + Math.floor(R() * 3);
  const L = [];
  for (let k = 0; k < n; k++) L.push([(R() - 0.5) * 0.36, (R() - 0.5) * 0.12, R()]);
  L.sort((a, b) => a[1] - b[1]);
  for (const [x, y, t] of L) {
    const h = kind === 1 ? 0.1 + t * 0.06 : 0.06 + t * 0.06;
    ctx.strokeStyle = '#4c9a3a'; ctx.lineWidth = lw * 1.4;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.quadraticCurveTo(x + 0.01, y + h * 0.5, x, y); ctx.stroke();
    if (kind === 0) { // buttercup
      cup(ctx, x, y, 0.036, lw, '#ffd53d', '#b8760e');
      ctx.fillStyle = '#ffeb8a'; ctx.beginPath(); ctx.arc(x - 0.006, y - 0.006, 0.012, 0, TAU); ctx.fill();
    } else if (kind === 1) { // dandelion: yellow or a seed clock
      if (t < 0.55) {
        ctx.fillStyle = '#ffc928'; ctx.strokeStyle = '#b07808'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.arc(x, y, 0.04, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#ffe680'; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 0.012, y + Math.sin(a) * 0.012); ctx.lineTo(x + Math.cos(a) * 0.036, y + Math.sin(a) * 0.036); ctx.stroke(); }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(x, y - 0.01, 0.05, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = lw * 0.7;
        for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; ctx.beginPath(); ctx.moveTo(x, y - 0.01); ctx.lineTo(x + Math.cos(a) * 0.05, y - 0.01 + Math.sin(a) * 0.05); ctx.stroke(); }
        ctx.strokeStyle = rgba('#a09ab0', 0.5); ctx.beginPath(); ctx.arc(x, y - 0.01, 0.052, 0, TAU); ctx.stroke();
      }
    } else if (kind === 2) { // speedwell: tiny sky-blue
      ctx.fillStyle = '#6fa8ff'; ctx.strokeStyle = '#2f4f9a'; ctx.lineWidth = lw * 0.8;
      for (let p = 0; p < 4; p++) { const a = (p / 4) * TAU + 0.4; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 0.012, y + Math.sin(a) * 0.01, 0.012, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 0.006, 0, TAU); ctx.fill();
    } else { // violets
      cup(ctx, x, y, 0.034, lw, '#9a74e0', '#46307a');
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(x, y + 0.004, 0.008, 0, TAU); ctx.fill();
    }
  }
});

// low edging cushions along the walks: 0 alyssum, 1 lobelia, 2 marigold, 3 pinks, 4 violas, 5 lady's mantle
const EDGE_C = [['#ffffff', '#f2eefa'], ['#4f7fe8', '#6f9cff'], ['#ff9a2e', '#ffc23a'], ['#ff8fb8', '#ffb8d4'], ['#9a6be0', '#ffe066'], ['#d8e86a', '#c4d84a']];
def('edging', 0.42, 0.26, 0.21, 0.18, 12, (ctx, px, v, R) => {
  const lw = Math.max(0.006, px * 0.7), [c1, c2] = EDGE_C[v % 6];
  softEllipse(ctx, 0.02, 0.02, 0.2, 0.06, '#1d3a12', 0.3);
  // leafy cushion
  const blobs = [];
  for (let i = 0; i < 5; i++) blobs.push([(i / 4 - 0.5) * 0.26 + (R() - 0.5) * 0.04, -0.04 - R() * 0.05, 0.06 + R() * 0.03]);
  for (const [x, y, r] of blobs) {
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r * 0.8, 0, 0, TAU);
    ctx.fillStyle = R() < 0.5 ? '#5aa843' : '#4b9a3c'; ctx.fill(); ctx.strokeStyle = rgba('#2a5f22', 0.5); ctx.lineWidth = lw; ctx.stroke();
  }
  const big = v % 6 === 2, n = big ? 5 : 16;
  for (let i = 0; i < n; i++) {
    const [bx, by, br] = blobs[Math.floor(R() * blobs.length)];
    const x = bx + (R() - 0.5) * br * 1.8, y = by - br * 0.3 + (R() - 0.5) * br;
    const c = R() < 0.6 ? c1 : c2;
    if (big) {
      ctx.fillStyle = c; ctx.strokeStyle = ink(c, 0.55); ctx.lineWidth = lw;
      ctx.beginPath(); for (let p = 0; p < 8; p++) { const a = (p / 8) * TAU; ctx.lineTo(x + Math.cos(a) * 0.034, y + Math.sin(a) * 0.026); } ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = shade(c, -0.35); ctx.beginPath(); ctx.arc(x, y, 0.012, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 0.014 + R() * 0.008, 0, TAU); ctx.fill();
      if (R() < 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - 0.004, y - 0.004, 0.005, 0, TAU); ctx.fill(); }
    }
  }
});

// ------------------------------------------------------------------------------------------ meadow wildflowers
const WF = [
  { c: '#ff4f45', i: '#7a1418', kind: 'poppy' }, { c: '#5d8dff', i: '#233f8a', kind: 'corn' }, { c: '#ffffff', i: '#8a7fa0', kind: 'oxeye' },
  { c: '#fff6e6', i: '#8a7f70', kind: 'umbel' }, { c: '#b27ae8', i: '#4b2a7a', kind: 'knap' }, { c: '#ffd23f', i: '#9a6a08', kind: 'tansy' },
];
def('wild', 0.5, 0.62, 0.25, 0.56, 18, (ctx, px, v, R) => {
  const lw = Math.max(0.008, px * 0.8);
  const f = WF[v % WF.length];
  const n = 2 + Math.floor(R() * 3);
  const L = [];
  for (let k = 0; k < n; k++) L.push([(R() - 0.5) * 0.34, 0.22 + R() * 0.26, R()]);
  L.sort((a, b) => b[1] - a[1]);
  // a few leaves at the foot
  for (let i = 0; i < 4; i++) {
    const x = (R() - 0.5) * 0.3, a = (R() - 0.5) * 1.8, l = 0.06 + R() * 0.05;
    ctx.fillStyle = R() < 0.5 ? '#5aa843' : '#4b9a3c';
    ctx.beginPath(); ctx.ellipse(x + Math.sin(a) * l * 0.5, -Math.cos(a) * l * 0.5, l * 0.22, l * 0.55, a, 0, TAU); ctx.fill();
  }
  for (const [x, h, t] of L) {
    const tx = x + (t - 0.5) * 0.08, ty = -h;
    ctx.strokeStyle = '#4a8f36'; ctx.lineWidth = lw * 1.3;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + (tx - x) * 0.3, -h * 0.5, tx, ty); ctx.stroke();
    if (f.kind === 'umbel') {
      for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI + Math.PI; ctx.strokeStyle = '#6a9a4a'; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(tx, ty + 0.03); ctx.lineTo(tx + Math.cos(a) * 0.07, ty + Math.sin(a) * 0.035); ctx.stroke(); }
      for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI + Math.PI; ctx.fillStyle = i % 2 ? '#ffffff' : '#f6efe0'; ctx.beginPath(); ctx.arc(tx + Math.cos(a) * 0.07, ty + Math.sin(a) * 0.035, 0.022, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = rgba(f.i, 0.45); ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.ellipse(tx, ty - 0.005, 0.09, 0.05, 0, Math.PI, TAU); ctx.stroke();
    } else if (f.kind === 'oxeye') {
      daisyHead(ctx, tx, ty, 0.055, lw * 0.8);
    } else if (f.kind === 'poppy') {
      ctx.fillStyle = f.c; ctx.strokeStyle = f.i; ctx.lineWidth = lw;
      for (let p = 0; p < 4; p++) { const a = (p / 4) * TAU + 0.5; ctx.beginPath(); ctx.ellipse(tx + Math.cos(a) * 0.028, ty + Math.sin(a) * 0.022, 0.04, 0.032, a, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = shade(f.c, 0.3); ctx.beginPath(); ctx.ellipse(tx - 0.015, ty - 0.02, 0.022, 0.012, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a1414'; ctx.beginPath(); ctx.arc(tx, ty, 0.014, 0, TAU); ctx.fill();
    } else if (f.kind === 'corn') {
      ctx.fillStyle = f.c; ctx.strokeStyle = f.i; ctx.lineWidth = lw * 0.8;
      for (let p = 0; p < 7; p++) { const a = (p / 7) * TAU; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a - 0.25) * 0.05, ty + Math.sin(a - 0.25) * 0.04); ctx.lineTo(tx + Math.cos(a + 0.25) * 0.05, ty + Math.sin(a + 0.25) * 0.04); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = '#3a4fa0'; ctx.beginPath(); ctx.arc(tx, ty, 0.012, 0, TAU); ctx.fill();
    } else if (f.kind === 'knap') {
      ctx.fillStyle = '#5a7a3a'; ctx.beginPath(); ctx.ellipse(tx, ty + 0.012, 0.022, 0.018, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = f.c; ctx.lineWidth = lw * 1.3;
      for (let p = 0; p < 9; p++) { const a = Math.PI + (p / 8) * Math.PI; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * 0.045, ty + Math.sin(a) * 0.04); ctx.stroke(); }
    } else {
      for (let i = 0; i < 5; i++) { const a = R() * TAU, rr = R() * 0.035; ctx.fillStyle = i % 2 ? f.c : shade(f.c, -0.12); ctx.strokeStyle = f.i; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.arc(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr * 0.7, 0.02, 0, TAU); ctx.fill(); ctx.stroke(); }
    }
  }
});

// ------------------------------------------------------------------------------------------ stones, litter
def('pebble', 0.3, 0.16, 0.15, 0.1, 8, (ctx, px, v, R) => {
  const lw = Math.max(0.007, px * 0.8);
  const n = 1 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const cx = (R() - 0.5) * 0.16, cy = (R() - 0.5) * 0.05, r = 0.022 + R() * 0.03;
    softEllipse(ctx, cx + r * 0.3, cy + r * 0.4, r * 1.6, r * 0.6, '#1d3a12', 0.32);
    const col = shade(['#cfc6b4', '#bfb6a6', '#d8cfbd', '#b7ab98'][Math.floor(R() * 4)], (R() - 0.5) * 0.15);
    ctx.fillStyle = col; ctx.strokeStyle = ink(col, 0.5); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.3, r * 0.8, (R() - 0.5) * 0.5, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(cx - r * 0.4, cy - r * 0.3, r * 0.45, r * 0.25, 0, 0, TAU); ctx.fill();
  }
});
// stones along a path edge, half sunk in the grass
def('estone', 0.36, 0.22, 0.18, 0.12, 12, (ctx, px, v, R) => {
  const lw = Math.max(0.009, px * 1.0);
  const r = 0.07 + R() * 0.05, e = 0.55 + R() * 0.25;
  softEllipse(ctx, 0.02, 0.03, r * 1.5, r * 0.55, '#1d3a12', 0.35);
  const pts = [];
  for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; const rr = r * (0.85 + R() * 0.3); pts.push([Math.cos(a) * rr * 1.25, Math.sin(a) * rr * e]); }
  const col = shade(['#d6cdb9', '#c9bfa9', '#ddd5c3', '#bdb3a0'][v % 4], (R() - 0.5) * 0.1);
  ctx.beginPath(); ctx.moveTo(pts[0][0], 0.015);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[8][0], 0.015); ctx.quadraticCurveTo(0, r * 0.25, pts[0][0], 0.015); ctx.closePath();
  const g = ctx.createLinearGradient(-r, -r * e, r * 0.6, 0.02);
  g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.3));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = ink(col, 0.55); ctx.lineWidth = lw; ctx.stroke();
  if (R() < 0.45) { ctx.fillStyle = rgba('#7cbb48', 0.9); ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * e * 0.75, r * 0.5, r * 0.16, -0.2, 0, TAU); ctx.fill(); }
  // grass blades in front of the stone's foot
  ctx.strokeStyle = '#4f9a3c'; ctx.lineWidth = lw * 0.9;
  for (let i = 0; i < 3; i++) { const x = (R() - 0.5) * r * 2.2; ctx.beginPath(); ctx.moveTo(x, 0.03); ctx.quadraticCurveTo(x + 0.01, -0.01, x + (R() - 0.5) * 0.04, -0.04 - R() * 0.04); ctx.stroke(); }
});
const LEAF_C = ['#e8a33a', '#d9722e', '#c9a13a', '#8fb84a', '#b8542e', '#e6c14a', '#9a6a3e', '#78a843'];
def('leaf', 0.2, 0.14, 0.1, 0.07, 16, (ctx, px, v, R) => {
  const lw = Math.max(0.006, px * 0.7);
  const c = LEAF_C[v % LEAF_C.length], a = R() * TAU, l = 0.05 + R() * 0.025;
  ctx.save(); ctx.scale(1, 0.62); ctx.rotate(a);
  softEllipse(ctx, 0.01, 0.02, l * 1.1, l * 0.6, '#1d3a12', 0.2);
  ctx.beginPath(); ctx.moveTo(-l, 0); ctx.quadraticCurveTo(-l * 0.2, -l * 0.62, l, 0); ctx.quadraticCurveTo(-l * 0.2, l * 0.62, -l, 0); ctx.closePath();
  ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = ink(c, 0.55); ctx.lineWidth = lw / 0.62; ctx.stroke();
  ctx.strokeStyle = rgba(shade(c, 0.4), 0.8); ctx.lineWidth = lw * 0.8 / 0.62; ctx.beginPath(); ctx.moveTo(-l * 1.25, 0); ctx.lineTo(l * 0.8, 0); ctx.stroke();
  ctx.restore();
});
def('petal', 0.22, 0.12, 0.11, 0.06, 8, (ctx, px, v, R) => {
  const c = v < 5 ? (v % 2 ? '#ffc4dc' : '#ffd9e8') : '#ffffff';
  const n = 2 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const x = (R() - 0.5) * 0.16, y = (R() - 0.5) * 0.06, a = R() * TAU;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.6); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.022, 0.014, 0, 0, TAU);
    ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = rgba(ink(c, 0.4), 0.6); ctx.lineWidth = Math.max(0.005, px * 0.6) / 0.6; ctx.stroke();
    ctx.restore();
  }
});
def('twig', 0.36, 0.14, 0.18, 0.07, 4, (ctx, px, v, R) => {
  const lw = Math.max(0.012, px * 1.2), a = (R() - 0.5) * 0.6, l = 0.13 + R() * 0.03;
  const x0 = -Math.cos(a) * l, y0 = -Math.sin(a) * l * 0.5, x1 = Math.cos(a) * l, y1 = Math.sin(a) * l * 0.5;
  softEllipse(ctx, 0.01, 0.015, l, 0.02, '#1d3a12', 0.25);
  ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = lw * 2.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(0, -0.01, x1, y1); ctx.stroke();
  ctx.strokeStyle = '#9a6e48'; ctx.lineWidth = lw * 1.1; ctx.stroke();
  ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = lw * 1.2; ctx.beginPath(); ctx.moveTo(x0 * 0.2, y0 * 0.2 - 0.005); ctx.lineTo(x0 * 0.2 + 0.05, -0.05); ctx.stroke();
});
// soft moss cushion
def('moss', 0.5, 0.26, 0.25, 0.14, 6, (ctx, px, v, R) => {
  const lw = Math.max(0.006, px * 0.7);
  const n = 4 + Math.floor(R() * 3);
  const L = [];
  for (let i = 0; i < n; i++) L.push([(R() - 0.5) * 0.32, (R() - 0.5) * 0.08, 0.045 + R() * 0.04]);
  L.sort((a, b) => a[1] - b[1]);
  softEllipse(ctx, 0, 0.03, 0.24, 0.07, '#1d3a12', 0.25);
  for (const [x, y, r] of L) {
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, TAU);
    const g = ctx.createLinearGradient(x - r, y - r * 0.5, x + r * 0.5, y + r * 0.5);
    g.addColorStop(0, '#a9d65a'); g.addColorStop(1, '#5f9a33');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rgba('#3b6a22', 0.5); ctx.lineWidth = lw; ctx.stroke();
  }
  ctx.fillStyle = 'rgba(230,255,170,0.7)';
  for (let i = 0; i < 8; i++) { const [x, y, r] = L[Math.floor(R() * L.length)]; ctx.beginPath(); ctx.arc(x + (R() - 0.5) * r, y - r * 0.2 + (R() - 0.5) * r * 0.3, 0.006, 0, TAU); ctx.fill(); }
});
// tiny toadstools / brown mushrooms in the shade
def('shroom', 0.3, 0.26, 0.15, 0.2, 6, (ctx, px, v, R) => {
  const lw = Math.max(0.007, px * 0.8);
  const red = v === 0, n = 1 + Math.floor(R() * 3);
  const L = [];
  for (let k = 0; k < n; k++) L.push([(R() - 0.5) * 0.16, (R() - 0.5) * 0.04, 0.035 + R() * 0.025, 0.05 + R() * 0.05]);
  L.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r, h] of L) {
    softEllipse(ctx, x + 0.012, y + 0.008, r * 1.4, r * 0.45, '#1d3a12', 0.35);
    ctx.fillStyle = '#f6efe0'; ctx.strokeStyle = '#7d6a55'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x - r * 0.3, y); ctx.lineTo(x - r * 0.22, y - h); ctx.lineTo(x + r * 0.22, y - h); ctx.lineTo(x + r * 0.3, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    const cap = red ? '#e8403c' : ['#b8845a', '#c99a62', '#a8744a'][v % 3];
    ctx.beginPath(); ctx.moveTo(x - r, y - h + r * 0.1); ctx.bezierCurveTo(x - r, y - h - r * 1.1, x + r, y - h - r * 1.1, x + r, y - h + r * 0.1); ctx.quadraticCurveTo(x, y - h + r * 0.35, x - r, y - h + r * 0.1); ctx.closePath();
    ctx.fillStyle = cap; ctx.fill(); ctx.strokeStyle = ink(cap, 0.6); ctx.stroke();
    ctx.fillStyle = red ? '#fff6ea' : rgba(shade(cap, 0.45), 0.9);
    if (red) for (let d = 0; d < 3; d++) { ctx.beginPath(); ctx.arc(x + (R() - 0.5) * r * 1.1, y - h - r * (0.2 + R() * 0.4), r * 0.14, 0, TAU); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - h - r * 0.45, r * 0.3, r * 0.14, -0.4, 0, TAU); ctx.fill(); }
  }
});
// woods floor: fern fronds
def('fern', 0.7, 0.5, 0.35, 0.42, 4, (ctx, px, v, R) => {
  const lw = Math.max(0.008, px * 0.9);
  softEllipse(ctx, 0.03, 0.01, 0.28, 0.07, '#1d3a12', 0.3);
  const n = 5 + Math.floor(R() * 2);
  for (let f = 0; f < n; f++) {
    const a = -Math.PI / 2 + (f / (n - 1) - 0.5) * 2.4 + (R() - 0.5) * 0.2, len = 0.26 + R() * 0.12;
    const tx = Math.cos(a) * len, ty = Math.sin(a) * len * 0.9;
    const col = f % 2 ? '#4f9a3c' : '#5dab45';
    ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(tx * 0.4, ty * 0.7 - 0.04, tx, ty); ctx.stroke();
    ctx.fillStyle = col;
    for (let k = 1; k < 8; k++) {
      const t = k / 8, px0 = tx * t, py0 = ty * t - Math.sin(t * Math.PI) * 0.04, s = 0.035 * (1 - t * 0.7);
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(px0 + side * Math.sin(a) * s * 0.8, py0 - side * Math.cos(a) * s * 0.4 * 0.9, s, s * 0.4, a + side * 0.9, 0, TAU); ctx.fill(); }
    }
  }
});
// sun flecks in tree shade (drawn with 'soft-light'-ish low alpha)
def('dapple', 0.9, 0.5, 0.45, 0.25, 4, (ctx, px, v, R) => {
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) softEllipse(ctx, (R() - 0.5) * 0.5, (R() - 0.5) * 0.2, 0.08 + R() * 0.12, 0.04 + R() * 0.05, '#fff6b0', 0.55, 0.3);
});
// a clump of dark tall grass for edges (walls, fence foot, pond margin)
def('edge', 0.6, 0.44, 0.3, 0.38, 6, (ctx, px, v, R) => {
  const n = 9 + Math.floor(R() * 5), lw = Math.max(0.01, px * 1.1);
  softEllipse(ctx, 0.03, 0.01, 0.25, 0.06, '#1d3a12', 0.3);
  for (let b = 0; b < n; b++) {
    const t = b / (n - 1) - 0.5, x = t * 0.34 + (R() - 0.5) * 0.04;
    const len = (0.16 + R() * 0.2) * (1 - Math.abs(t) * 0.5), lean = t * 0.3 + (R() - 0.5) * 0.08;
    const w = 0.018 + R() * 0.008;
    ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.quadraticCurveTo(x + lean * 0.3 - w * 0.3, -len * 0.55, x + lean, -len); ctx.quadraticCurveTo(x + lean * 0.3 + w * 0.3, -len * 0.55, x + w, 0); ctx.closePath();
    ctx.fillStyle = b % 3 === 0 ? '#7cc052' : b % 3 === 1 ? '#5aa640' : '#95d062'; ctx.fill();
    ctx.strokeStyle = rgba('#2b6122', 0.5); ctx.lineWidth = lw * 0.7; ctx.stroke();
  }
});

