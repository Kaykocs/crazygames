// Nature props in the illustrated style: cartoon trees (leafy, blossom, apple, fir), bushes (plain, flowering,
// berry, lavender), mossy rocks, mushrooms, reeds, logs, flower clumps. Each painter draws in world units with
// the object's ground contact point at (0, 0) and y up = negative screen y.
import { rng, softEllipse, smoothClosed, shadowShape, dpu } from './paint.js';
import { shade, ink, rgba, mix } from './color.js';

const TAU = Math.PI * 2;

export const PAL = {
  leaf: '#5dae46', leafL: '#95d45e', leafD: '#3a7d34',
  blossom: '#f6a3c6', apple: '#e8493f',
  bark: '#8b5b3a',
  stone: '#c8c1b0',
  moss: '#78b848',
};

// ------------------------------------------------------------------------------------------ canopy clusters
// clumps: [{x, y, r}] (y negative = up). Paints a cartoon leafy mass: ink rim, body, sun-lit gradient, crescent
// shading under each clump, leafy scallops and sparkling highlights.
export function paintCanopy(ctx, clumps, color, px, R, opts = {}) {
  const inkC = ink(color, 0.66), light = shade(color, 0.42), dark = shade(color, -0.35);
  const lw = Math.max(0.035, px * 1.8);
  const union = (grow = 0) => { ctx.beginPath(); for (const c of clumps) { ctx.moveTo(c.x + c.r + grow, c.y); ctx.arc(c.x, c.y, c.r + grow, 0, TAU); } };
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const c of clumps) { minY = Math.min(minY, c.y - c.r); maxY = Math.max(maxY, c.y + c.r); minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r); }
  // outline = slightly larger union in ink
  union(lw); ctx.fillStyle = inkC; ctx.fill();
  union(); ctx.fillStyle = color; ctx.fill();
  ctx.save();
  union(); ctx.clip();
  // global light: upper-left bright, lower-right deep
  const g = ctx.createLinearGradient(minX, minY, maxX * 0.6, maxY);
  g.addColorStop(0, rgba(light, 0.85)); g.addColorStop(0.45, rgba(color, 0)); g.addColorStop(1, rgba(dark, 0.9));
  ctx.fillStyle = g; ctx.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
  // per-clump crescents: shadow under, light on top, drawn back (top) to front (bottom)
  const sorted = [...clumps].sort((a, b) => a.y - b.y);
  for (const c of sorted) {
    ctx.save();
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.clip();
    // body tone of this clump (slightly varied)
    ctx.fillStyle = rgba(shade(color, (R() - 0.5) * 0.12), 0.35); ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    const sg = ctx.createRadialGradient(c.x - c.r * 0.35, c.y - c.r * 0.45, c.r * 0.2, c.x, c.y, c.r * 1.05);
    sg.addColorStop(0, rgba(light, 0.55)); sg.addColorStop(0.55, rgba(color, 0)); sg.addColorStop(0.85, rgba(dark, 0.25)); sg.addColorStop(1, rgba(dark, 0.55));
    ctx.fillStyle = sg; ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    ctx.restore();
    // separating ink arc along the lower edge of clumps that sit in front of others
    ctx.strokeStyle = rgba(inkC, 0.5); ctx.lineWidth = lw * 0.55;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  // leaf clusters: a few deliberate scalloped strokes — light on the sunny upper side, dark lower down
  const n = Math.round((maxX - minX) * (maxY - minY) * 9 * (opts.leafy ?? 1));
  for (let i = 0; i < n; i++) {
    const c = clumps[Math.floor(R() * clumps.length)];
    const a = R() * TAU, rr = Math.sqrt(R()) * c.r * 0.8;
    const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr;
    const up = y < c.y;
    const s = (0.09 + R() * 0.06) * (opts.leafSize ?? 1);
    ctx.strokeStyle = rgba(up ? shade(color, 0.6) : shade(color, -0.5), up ? 0.6 : 0.4);
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    ctx.arc(x - s * 0.9, y, s * 0.5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.arc(x, y - s * 0.12, s * 0.5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.arc(x + s * 0.9, y, s * 0.5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  ctx.restore();
  // soft sparkle highlights on the sunny side
  ctx.fillStyle = 'rgba(255,255,230,0.5)';
  for (const c of sorted.slice(0, Math.ceil(sorted.length * 0.6))) {
    ctx.beginPath(); ctx.ellipse(c.x - c.r * 0.38, c.y - c.r * 0.48, c.r * 0.22, c.r * 0.11, -0.6, 0, TAU); ctx.fill();
  }
  return { minX, maxX, minY, maxY };
}

// dots of fruit / flowers scattered over a canopy
function canopyDots(ctx, clumps, R, n, draw) {
  for (let i = 0; i < n; i++) {
    const c = clumps[Math.floor(R() * clumps.length)];
    const a = R() * TAU, rr = Math.sqrt(R()) * c.r * 0.8;
    draw(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr);
  }
}

function trunk(ctx, h, w, px, R, color = PAL.bark) {
  const lw = Math.max(0.03, px * 1.6), inkC = ink(color, 0.66);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-w * 1.9, 0.02);
    ctx.quadraticCurveTo(-w * 0.9, -0.02, -w * 0.9, -h * 0.35);
    ctx.lineTo(-w * 0.7, -h);
    ctx.lineTo(w * 0.7, -h);
    ctx.lineTo(w * 0.9, -h * 0.35);
    ctx.quadraticCurveTo(w * 0.9, -0.02, w * 1.9, 0.02);
    ctx.quadraticCurveTo(0, w * 0.5, -w * 1.9, 0.02);
    ctx.closePath();
  };
  path();
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, shade(color, 0.3)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.4));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = rgba(shade(color, -0.45), 0.55); ctx.lineWidth = lw * 0.6;
  for (let i = 0; i < 5; i++) {
    const x = (R() - 0.5) * w * 1.4;
    ctx.beginPath(); ctx.moveTo(x, -h * (0.1 + R() * 0.2)); ctx.quadraticCurveTo(x + (R() - 0.5) * 0.05, -h * 0.55, x + (R() - 0.5) * 0.04, -h * (0.7 + R() * 0.3)); ctx.stroke();
  }
  ctx.restore();
  path(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
}

function groundShadow(ctx, rx, ry, dx = 0.25, a = 0.34) {
  softEllipse(ctx, dx, 0.02, rx, ry, '#173512', a, 0.25);
}

// ------------------------------------------------------------------------------------------ trees
// kind: 'leafy' | 'blossom' | 'apple' | 'autumn'
export function paintTree(ctx, px, seed = 1, kind = 'leafy', size = 1) {
  const R = rng(seed);
  const s = size;
  const h = 1.5 * s, cw = 1.6 * s;
  groundShadow(ctx, 1.9 * s, 0.75 * s, 0.4 * s, 0.4);
  trunk(ctx, h + 0.4 * s, 0.2 * s, px, R);
  const clumps = [];
  const cy = -h - 1.05 * s;
  const n = 7 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.4;
    const rr = (0.55 + R() * 0.3) * s;
    clumps.push({ x: Math.cos(a) * cw * 0.55, y: cy + Math.sin(a) * 0.62 * s, r: rr });
  }
  clumps.push({ x: 0, y: cy - 0.55 * s, r: 0.72 * s }, { x: -0.1 * s, y: cy + 0.1 * s, r: 0.8 * s });
  const col = kind === 'blossom' ? PAL.blossom : kind === 'autumn' ? '#e8913a' : kind === 'apple' ? '#63b04a' : shade(PAL.leaf, (R() - 0.5) * 0.12);
  paintCanopy(ctx, clumps, col, px, R, { leafy: kind === 'blossom' ? 0.8 : 1 });
  if (kind === 'apple') {
    canopyDots(ctx, clumps, R, 14, (x, y) => {
      ctx.fillStyle = PAL.apple; ctx.strokeStyle = ink(PAL.apple, 0.6); ctx.lineWidth = Math.max(0.015, px * 1.1);
      ctx.beginPath(); ctx.arc(x, y, 0.085 * s, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - 0.03 * s, y - 0.03 * s, 0.025 * s, 0, TAU); ctx.fill();
    });
  } else if (kind === 'blossom') {
    canopyDots(ctx, clumps, R, 40, (x, y) => {
      const c = R() < 0.5 ? '#ffffff' : '#ffd6e6';
      ctx.fillStyle = c;
      for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 0.035 * s, y + Math.sin(a) * 0.035 * s, 0.03 * s, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ff7eb0'; ctx.beginPath(); ctx.arc(x, y, 0.018 * s, 0, TAU); ctx.fill();
    });
  }
}

// a fir: stacked scalloped tiers
export function paintFir(ctx, px, seed = 1, size = 1) {
  const R = rng(seed);
  const s = size, lw = Math.max(0.035, px * 1.8);
  groundShadow(ctx, 1.1 * s, 0.45 * s, 0.35 * s);
  trunk(ctx, 0.5 * s, 0.14 * s, px, R);
  const col = '#3f9a55', inkC = ink(col, 0.66);
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const k = t / tiers;
    const w = (1.15 - k * 0.72) * s, y0 = -0.35 * s - k * 2.1 * s, y1 = y0 - 1.3 * s;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.quadraticCurveTo(w * 0.35, y0 - (y0 - y1) * 0.55, w, y0);
      const n = 4;
      for (let i = n; i > 0; i--) { const x0 = w * (i / n) * 2 - w, x1 = w * ((i - 1) / n) * 2 - w; ctx.quadraticCurveTo((x0 + x1) / 2, y0 + 0.2 * s, x1, y0); }
      ctx.quadraticCurveTo(-w * 0.35, y0 - (y0 - y1) * 0.55, 0, y1);
      ctx.closePath();
    };
    path();
    const g = ctx.createLinearGradient(-w, y1, w, y0);
    g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.35));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
    ctx.strokeStyle = rgba(shade(col, 0.5), 0.5); ctx.lineWidth = lw * 0.6;
    ctx.beginPath(); ctx.moveTo(-w * 0.1, y1 + 0.2 * s); ctx.quadraticCurveTo(-w * 0.35, y0 - 0.4 * s, -w * 0.6, y0 - 0.1 * s); ctx.stroke();
  }
}

// ------------------------------------------------------------------------------------------ bushes
// kind: 'green' | 'flowers' | 'berries' | 'hydrangea'
export function paintBush(ctx, px, seed = 1, kind = 'green', size = 1, flower = '#ffffff') {
  const R = rng(seed);
  const s = size;
  groundShadow(ctx, 0.95 * s, 0.34 * s, 0.18 * s, 0.38);
  const clumps = [];
  const n = 5 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const r = (0.32 + R() * 0.16) * s * (1 - Math.abs(t) * 0.45);
    clumps.push({ x: t * 1.3 * s, y: -r * 0.85 - (0.12 + R() * 0.12) * s * (1 - Math.abs(t)), r });
  }
  clumps.push({ x: (R() - 0.5) * 0.2 * s, y: -0.62 * s, r: 0.42 * s });
  const col = kind === 'hydrangea' ? '#4f9e48' : shade(PAL.leaf, (R() - 0.5) * 0.14 - 0.03);
  paintCanopy(ctx, clumps, col, px, R, { leafSize: 0.8 });
  if (kind === 'flowers' || kind === 'hydrangea') {
    const big = kind === 'hydrangea';
    canopyDots(ctx, clumps, R, big ? 7 : 16, (x, y) => {
      if (big) {
        // hydrangea puff: a ball of tiny florets
        const r = 0.16 * s;
        softEllipse(ctx, x + 0.03, y + 0.05, r * 1.2, r * 0.8, '#1d3a12', 0.3);
        ctx.fillStyle = shade(flower, -0.2); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = ink(flower, 0.6); ctx.lineWidth = Math.max(0.015, px); ctx.stroke();
        for (let k = 0; k < 12; k++) {
          const a = R() * TAU, rr = Math.sqrt(R()) * r * 0.75;
          ctx.fillStyle = shade(flower, 0.1 + R() * 0.3);
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.28, 0, TAU); ctx.fill();
        }
      } else {
        const r = 0.05 * s;
        ctx.fillStyle = flower; ctx.strokeStyle = ink(flower, 0.55); ctx.lineWidth = Math.max(0.01, px * 0.8);
        for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.85, r * 0.8, 0, TAU); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill();
      }
    });
  } else if (kind === 'berries') {
    canopyDots(ctx, clumps, R, 18, (x, y) => {
      ctx.fillStyle = '#e0304f'; ctx.strokeStyle = '#7a1428'; ctx.lineWidth = Math.max(0.01, px * 0.8);
      ctx.beginPath(); ctx.arc(x, y, 0.045 * s, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x - 0.015 * s, y - 0.015 * s, 0.013 * s, 0, TAU); ctx.fill();
    });
  }
}

// lavender: a green mound with purple flower spikes (bees love it)
export function paintLavender(ctx, px, seed = 1, size = 1) {
  const R = rng(seed);
  const s = size, lw = Math.max(0.012, px);
  groundShadow(ctx, 0.62 * s, 0.22 * s, 0.1 * s, 0.35);
  const n = 22;
  const stems = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) - 0.5 + (R() - 0.5) * 0.04;
    const a = t * 1.1 + (R() - 0.5) * 0.15, len = (0.55 + R() * 0.35) * s * (1 - Math.abs(t) * 0.5);
    stems.push({ x: t * 0.5 * s, a, len, d: R() });
  }
  stems.sort((a, b) => a.d - b.d);
  // leafy base
  const base = [{ x: -0.22 * s, y: -0.12 * s, r: 0.16 * s }, { x: 0.2 * s, y: -0.11 * s, r: 0.16 * s }, { x: 0, y: -0.17 * s, r: 0.2 * s }];
  paintCanopy(ctx, base, '#5f9e4c', px, R, { leafy: 0.4, leafSize: 0.5 });
  for (const st of stems) {
    const tx = st.x + Math.sin(st.a) * st.len, ty = -0.15 * s - Math.cos(st.a) * st.len;
    ctx.strokeStyle = '#5f8f4c'; ctx.lineWidth = lw * 1.2;
    ctx.beginPath(); ctx.moveTo(st.x, -0.15 * s); ctx.quadraticCurveTo(st.x + Math.sin(st.a) * st.len * 0.3, -0.15 * s - st.len * 0.5, tx, ty); ctx.stroke();
    // flower spike
    for (let k = 0; k < 6; k++) {
      const f = 0.55 + k * 0.08;
      const x = st.x + Math.sin(st.a) * st.len * f, y = -0.15 * s - Math.cos(st.a) * st.len * f;
      const r = 0.035 * s * (1 - k * 0.08);
      ctx.fillStyle = k % 2 ? '#9a74d8' : '#b692ea'; ctx.strokeStyle = '#5a3d8e'; ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 0.8, st.a, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------------------------------ rocks, mushrooms, logs
export function paintRock(ctx, px, seed = 1, size = 1, moss = true) {
  const R = rng(seed);
  const s = size, lw = Math.max(0.03, px * 1.6);
  groundShadow(ctx, 0.6 * s, 0.2 * s, 0.14 * s, 0.4);
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    const r = (0.45 + R() * 0.12) * s;
    pts.push([Math.cos(a) * r * 1.15, Math.sin(a) * r * (0.8 + R() * 0.2)]);
  }
  pts.push([0.5 * s, 0.03 * s], [-0.5 * s, 0.03 * s]);
  const col = shade(PAL.stone, (R() - 0.5) * 0.12);
  ctx.beginPath(); smoothClosed(ctx, pts, 0.42);
  const g = ctx.createLinearGradient(-0.5 * s, -0.5 * s, 0.4 * s, 0.1 * s);
  g.addColorStop(0, shade(col, 0.4)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.35));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // facets
  ctx.strokeStyle = rgba(shade(col, -0.4), 0.4); ctx.lineWidth = lw * 0.6;
  ctx.beginPath(); ctx.moveTo(-0.1 * s, -0.45 * s); ctx.quadraticCurveTo(0.05 * s, -0.2 * s, 0.3 * s, -0.05 * s); ctx.stroke();
  // speckles
  for (let i = 0; i < 12; i++) { ctx.fillStyle = rgba(R() < 0.5 ? shade(col, -0.3) : shade(col, 0.4), 0.5); ctx.beginPath(); ctx.arc((R() - 0.5) * s, -R() * 0.45 * s, 0.012 * s + R() * 0.01, 0, TAU); ctx.fill(); }
  if (moss) {
    ctx.fillStyle = PAL.moss;
    ctx.beginPath(); ctx.ellipse(-0.12 * s, -0.5 * s, 0.35 * s, 0.16 * s, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(PAL.moss, 0.3);
    ctx.beginPath(); ctx.ellipse(-0.2 * s, -0.54 * s, 0.18 * s, 0.07 * s, -0.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); smoothClosed(ctx, pts, 0.42);
  ctx.strokeStyle = ink(col, 0.62); ctx.lineWidth = lw; ctx.stroke();
}

export function paintMushrooms(ctx, px, seed = 1, size = 1) {
  const R = rng(seed);
  const lw = Math.max(0.02, px * 1.4);
  const list = [];
  const n = 2 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) list.push({ x: (i - (n - 1) / 2) * 0.2 * size + (R() - 0.5) * 0.06, h: (0.16 + R() * 0.14) * size, r: (0.1 + R() * 0.07) * size, z: R() });
  list.sort((a, b) => a.z - b.z);
  for (const m of list) softEllipse(ctx, m.x + 0.03, 0.01, m.r * 1.3, m.r * 0.45, '#173512', 0.35);
  for (const m of list) {
    // stem
    ctx.beginPath(); ctx.moveTo(m.x - m.r * 0.35, 0); ctx.quadraticCurveTo(m.x - m.r * 0.45, -m.h * 0.6, m.x - m.r * 0.25, -m.h);
    ctx.lineTo(m.x + m.r * 0.25, -m.h); ctx.quadraticCurveTo(m.x + m.r * 0.45, -m.h * 0.6, m.x + m.r * 0.35, 0); ctx.closePath();
    const sg = ctx.createLinearGradient(m.x - m.r * 0.4, 0, m.x + m.r * 0.4, 0);
    sg.addColorStop(0, '#fffaf0'); sg.addColorStop(1, '#d9ccb4');
    ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = '#7d6a55'; ctx.lineWidth = lw; ctx.stroke();
    // cap
    ctx.beginPath(); ctx.moveTo(m.x - m.r, -m.h + m.r * 0.15);
    ctx.bezierCurveTo(m.x - m.r * 1.05, -m.h - m.r * 1.1, m.x + m.r * 1.05, -m.h - m.r * 1.1, m.x + m.r, -m.h + m.r * 0.15);
    ctx.quadraticCurveTo(m.x, -m.h + m.r * 0.35, m.x - m.r, -m.h + m.r * 0.15); ctx.closePath();
    const cg = ctx.createRadialGradient(m.x - m.r * 0.4, -m.h - m.r * 0.6, m.r * 0.1, m.x, -m.h, m.r * 1.2);
    cg.addColorStop(0, '#ff8a7a'); cg.addColorStop(0.5, '#e8403c'); cg.addColorStop(1, '#a8202a');
    ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = '#6a1418'; ctx.lineWidth = lw; ctx.stroke();
    ctx.fillStyle = '#fff6ea';
    for (let d = 0; d < 4; d++) { ctx.beginPath(); ctx.ellipse(m.x + (R() - 0.5) * m.r * 1.2, -m.h - m.r * (0.2 + R() * 0.45), m.r * 0.16, m.r * 0.11, 0, 0, TAU); ctx.fill(); }
  }
}

export function paintLog(ctx, px, seed = 1, size = 1) {
  const R = rng(seed);
  const s = size, lw = Math.max(0.03, px * 1.6);
  groundShadow(ctx, 1.1 * s, 0.25 * s, 0.1 * s, 0.4);
  const len = 1.6 * s, r = 0.26 * s;
  // body
  ctx.beginPath(); ctx.moveTo(-len / 2, -r * 2); ctx.lineTo(len / 2, -r * 2); ctx.ellipse(len / 2, -r, r * 0.55, r, 0, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-len / 2, 0); ctx.closePath();
  const g = ctx.createLinearGradient(0, -r * 2, 0, 0);
  g.addColorStop(0, shade(PAL.bark, 0.3)); g.addColorStop(0.5, PAL.bark); g.addColorStop(1, shade(PAL.bark, -0.4));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(PAL.bark, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = rgba(shade(PAL.bark, -0.45), 0.5); ctx.lineWidth = lw * 0.6;
  for (let i = 0; i < 6; i++) { const y = -r * (0.3 + R() * 1.4); ctx.beginPath(); ctx.moveTo(-len / 2 + R() * 0.3, y); ctx.lineTo(-len / 2 + 0.4 + R() * len * 0.6, y + (R() - 0.5) * 0.04); ctx.stroke(); }
  ctx.fillStyle = PAL.moss; ctx.beginPath(); ctx.ellipse(-0.2 * s, -r * 2, 0.4 * s, 0.09 * s, 0, 0, TAU); ctx.fill();
  ctx.restore();
  // cut end with rings
  ctx.beginPath(); ctx.ellipse(-len / 2, -r, r * 0.55, r, 0, 0, TAU);
  ctx.fillStyle = '#e9c38e'; ctx.fill(); ctx.strokeStyle = ink(PAL.bark, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = rgba('#b0804e', 0.8); ctx.lineWidth = lw * 0.5;
  for (const k of [0.35, 0.65]) { ctx.beginPath(); ctx.ellipse(-len / 2, -r, r * 0.55 * k, r * k, 0, 0, TAU); ctx.stroke(); }
}

// reeds / cattails for the pond edge
export function paintReeds(ctx, px, seed = 1, size = 1) {
  const R = rng(seed);
  const lw = Math.max(0.015, px * 1.1);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * 0.5 * size, a = (R() - 0.5) * 0.4, len = (0.7 + R() * 0.6) * size;
    const tx = x + Math.sin(a) * len, ty = -Math.cos(a) * len;
    // blade leaves
    ctx.fillStyle = i % 2 ? '#5aa845' : '#4a9a3e'; ctx.strokeStyle = '#2c6325'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x - 0.03, 0); ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.4 - 0.04, -len * 0.5, tx + (R() - 0.5) * 0.2, ty * 0.85); ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.4 + 0.02, -len * 0.5, x + 0.03, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (i % 2 === 0) {
      ctx.strokeStyle = '#6b8f3a'; ctx.lineWidth = lw * 1.4;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.5, -len * 0.5, tx, ty); ctx.stroke();
      ctx.fillStyle = '#7a4a2a'; ctx.strokeStyle = '#3e2414'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.ellipse(tx - Math.sin(a) * 0.12 * size, ty + Math.cos(a) * 0.12 * size, 0.045 * size, 0.13 * size, a, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
}

// a clump of wild garden flowers on stems (for borders)
export function paintFlowerClump(ctx, px, seed = 1, size = 1, colors = ['#ff7eb6', '#ffffff', '#ffd23f']) {
  const R = rng(seed);
  const lw = Math.max(0.012, px);
  groundShadow(ctx, 0.5 * size, 0.16 * size, 0.08, 0.3);
  const n = 9;
  const list = [];
  for (let i = 0; i < n; i++) list.push({ x: (R() - 0.5) * 0.7 * size, h: (0.25 + R() * 0.35) * size, c: colors[Math.floor(R() * colors.length)], z: R() });
  list.sort((a, b) => a.h - b.h);
  // leaves
  for (let i = 0; i < 10; i++) {
    const x = (R() - 0.5) * 0.7 * size, a = (R() - 0.5) * 1.6, l = (0.12 + R() * 0.12) * size;
    ctx.fillStyle = R() < 0.5 ? '#5aaa45' : '#4a9a3e'; ctx.strokeStyle = '#2c6325'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(x + Math.sin(a) * l * 0.5, -Math.cos(a) * l * 0.5, l * 0.25, l * 0.6, a, 0, TAU); ctx.fill(); ctx.stroke();
  }
  for (const f of list) {
    ctx.strokeStyle = '#3f8a34'; ctx.lineWidth = lw * 1.3;
    ctx.beginPath(); ctx.moveTo(f.x, 0); ctx.quadraticCurveTo(f.x + 0.03, -f.h * 0.5, f.x, -f.h); ctx.stroke();
    const r = 0.06 * size;
    ctx.fillStyle = f.c; ctx.strokeStyle = ink(f.c, 0.55); ctx.lineWidth = lw * 0.8;
    for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * r * 0.8, -f.h + Math.sin(a) * r * 0.65, r * 0.62, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = f.c === '#ffd23f' ? '#b8601a' : '#ffcf3a'; ctx.beginPath(); ctx.arc(f.x, -f.h, r * 0.4, 0, TAU); ctx.fill();
  }
}

// tall grass tuft (for wild areas and edges)
export function paintTallGrass(ctx, px, seed = 1, size = 1) {
  const R = rng(seed);
  const lw = Math.max(0.01, px * 0.9);
  const n = 11;
  softEllipse(ctx, 0.05, 0.01, 0.4 * size, 0.1 * size, '#173512', 0.3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const a = t * 1.2 + (R() - 0.5) * 0.3, len = (0.35 + R() * 0.35) * size * (1 - Math.abs(t) * 0.4);
    const x = t * 0.25 * size, tx = x + Math.sin(a) * len, ty = -Math.cos(a) * len, w = 0.035 * size;
    ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.quadraticCurveTo(x + (tx - x) * 0.2 - w * 0.4, -len * 0.55, tx, ty); ctx.quadraticCurveTo(x + (tx - x) * 0.2 + w * 0.4, -len * 0.55, x + w, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, ty);
    g.addColorStop(0, '#3c8431'); g.addColorStop(1, i % 2 ? '#a9df74' : '#8bcc5d');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rgba('#285d22', 0.7); ctx.lineWidth = lw; ctx.stroke();
  }
}
