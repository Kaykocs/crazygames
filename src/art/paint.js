// Painting primitives shared by every illustrated object: offscreen sprites authored in world units, smooth
// closed curves through points, soft shadows, glows and deterministic randomness.
import { rgba } from './color.js';

// device pixels per current-transform unit (canvas shadows are specified in device pixels)
export function dpu(ctx) { const t = ctx.getTransform(); return Math.hypot(t.a, t.b); }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// A sprite is a canvas painted in world units at `res` device pixels per unit, with an anchor point
// (ax, ay in units from the top-left) that sits on the object's ground / attachment point.
export class Sprite {
  constructor(w, h, ax, ay, res, paint) {
    this.res = res;
    this.w = w; this.h = h; this.ax = ax; this.ay = ay;
    this.c = makeCanvas(w * res, h * res);
    const ctx = this.c.getContext('2d');
    ctx.setTransform(res, 0, 0, res, ax * res, ay * res);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    paint(ctx, 1 / res);
  }
}

export const sprite = (w, h, ax, ay, res, paint) => new Sprite(w, h, ax, ay, res, paint);

// Draw a sprite with its anchor at screen (x, y). `ppu` = CSS pixels per world unit on screen.
// `skew` leans the sprite about its anchor (wind): points above the anchor shift sideways, the base stays put.
export function drawSprite(ctx, s, x, y, ppu, sx = 1, sy = 1, rot = 0, alpha = 1, skew = 0) {
  if (!s) return;
  const k = ppu / s.res;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (rot === 0 && sx === sy && sx === 1 && skew === 0) {
    ctx.drawImage(s.c, x - s.ax * ppu, y - s.ay * ppu, s.c.width * k, s.c.height * k);
  } else {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(sx, sy);
    if (skew) ctx.transform(1, 0, skew, 1, 0, 0);
    ctx.drawImage(s.c, -s.ax * ppu, -s.ay * ppu, s.c.width * k, s.c.height * k);
    ctx.restore();
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------ paths
// Smooth closed curve through points (Catmull-Rom → Bézier). tension 0.5 is a natural blob.
export function smoothClosed(ctx, pts, tension = 0.5) {
  const n = pts.length;
  ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const m1 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], m2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    ctx.bezierCurveTo(m1[0] + (p1[0] - m1[0]) * tension * 2, m1[1] + (p1[1] - m1[1]) * tension * 2,
      m2[0] + (p1[0] - m2[0]) * tension * 2, m2[1] + (p1[1] - m2[1]) * tension * 2, m2[0], m2[1]);
  }
  ctx.closePath();
}

// Smooth open curve through points
export function smoothOpen(ctx, pts, move = true) {
  const n = pts.length;
  if (move) ctx.moveTo(pts[0][0], pts[0][1]);
  if (n === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
  for (let i = 1; i < n - 1; i++) {
    const xc = (pts[i][0] + pts[i + 1][0]) / 2, yc = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], i === n - 2 ? pts[n - 1][0] : xc, i === n - 2 ? pts[n - 1][1] : yc);
  }
}

// lumpy blob outline around (cx, cy)
export function blobPoints(cx, cy, rx, ry, n, lump, R) {
  const pts = [];
  const ph = R() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (R() - 0.5) * lump + Math.sin(a * 3 + ph) * lump * 0.3;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); }

// ------------------------------------------------------------------------------------------ fills
// soft elliptical shadow / glow (radial gradient, no blur filter needed)
export function softEllipse(ctx, x, y, rx, ry, color, a0 = 0.35, inner = 0.2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * inner, 0, 0, rx);
  g.addColorStop(0, rgba(color, a0));
  g.addColorStop(0.55, rgba(color, a0 * 0.55));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// linear gradient helper: stops = [[t, color, alpha?], ...]
export function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c, a] of stops) g.addColorStop(t, a === undefined ? c : rgba(c, a));
  return g;
}
export function rad(ctx, x, y, r0, r1, stops, fx = x, fy = y) {
  const g = ctx.createRadialGradient(fx, fy, r0, x, y, r1);
  for (const [t, c, a] of stops) g.addColorStop(t, a === undefined ? c : rgba(c, a));
  return g;
}

// fill the current path, then stroke it as an ink outline
export function fillInk(ctx, fill, stroke, lw) {
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// ------------------------------------------------------------------------------------------ random
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// smooth value noise in [0, 1]
export function noise2(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4, s = 0) {
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) { v += noise2(x * f, y * f, s + i * 17) * amp; sum += amp; amp *= 0.5; f *= 2.03; }
  return v / sum;
}

// Blurred silhouette of a path (soft shadows / glows) using the canvas shadow of an off-canvas copy.
// blur, dx, dy in current-transform units. Assumes an axis-aligned transform.
export function shadowShape(ctx, path, color, blur, dx = 0, dy = 0) {
  const k = dpu(ctx);
  const off = 4000;
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = blur * k;
  ctx.shadowOffsetX = off + dx * k; ctx.shadowOffsetY = dy * k;
  ctx.translate(-off / k, 0);
  ctx.beginPath(); path(ctx);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.restore();
}

export function poly(ctx, pts, close = true) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

// Sprite cache with a repaint budget: when the zoom changes, sprites at the new resolution are painted a few
// per frame while the nearest existing one stands in (scaled), so camera moves never hitch.
const BANKS = [];
export function tickBanks(ms = 5) {
  const t0 = performance.now();
  for (const b of BANKS) b.tick(Math.max(0.5, ms - (performance.now() - t0)));
}
export class SpriteBank {
  constructor() { this.map = new Map(); this.latest = new Map(); this.queue = []; this.queued = new Set(); this.frame = 0; BANKS.push(this); }
  get(key, res, make) {
    const full = key + '@' + res;
    let e = this.map.get(full);
    if (e) { e.used = this.frame; return e.s; }
    const alt = this.latest.get(key);
    if (alt) {
      if (!this.queued.has(full)) { this.queued.add(full); this.queue.push({ key, res, make, full }); }
      alt.used = this.frame;
      return alt.s;
    }
    const s = make(res);
    e = { s, used: this.frame, res };
    this.map.set(full, e); this.latest.set(key, e);
    return s;
  }
  // paint queued sprites for up to `ms` milliseconds; drop sprites unused for a while
  tick(ms = 4) {
    this.frame++;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < ms) {
      const q = this.queue.shift();
      this.queued.delete(q.full);
      if (this.map.has(q.full)) continue;
      const e = { s: q.make(q.res), used: this.frame, res: q.res };
      this.map.set(q.full, e); this.latest.set(q.key, e);
    }
    if (this.frame % 240 === 0) {
      for (const [k, e] of this.map) if (this.frame - e.used > 600) { this.map.delete(k); const key = k.slice(0, k.lastIndexOf('@')); if (this.latest.get(key) === e) this.latest.delete(key); }
    }
  }
  pending() { return this.queue.length; }
}
