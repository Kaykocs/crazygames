// Wooden hexagonal planter beds in the 3/4 view: plank walls with grain, nails and knots, a mitred rim,
// the shaded inner back wall and rich crumbly soil. Plus overlays: wet soil, hover rim, empty-bed glow and the
// chalk outline of a plot that can be bought. All sprites are anchored on the hex centre at ground level.
import { Sprite, rng, poly, shadowShape, softEllipse } from './paint.js';
import { shade, ink, rgba, mix } from './color.js';
import { hexCorners, HY, SQ } from './view3q.js';

export const PLANTER = { r: 0.95, h: 0.3, rim: 0.13, drop: 0.09 };
const INSET = PLANTER.r - PLANTER.rim / Math.cos(Math.PI / 6);
export const SOIL_Y = PLANTER.h - PLANTER.drop;          // world height of the soil surface

const WOODS = ['#c98b52', '#c4824a', '#d09459'];
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function inHex(x, y, r) {
  // point inside a squashed flat-top hex of circumradius r?
  const qx = Math.abs(x), qy = Math.abs(y / SQ);
  return qy <= r * 0.866 && qx * 0.866 + qy * 0.5 <= r * 0.866;
}

export function paintPlanter(ctx, px, variant = 0) {
  const { r, h } = PLANTER;
  const R = rng(17 + variant * 101);
  const wood = WOODS[variant % WOODS.length];
  const lw = Math.max(0.028, px * 1.6), thin = Math.max(0.014, px * 0.9);
  const inkC = ink(wood, 0.66);
  const top = hexCorners(r, h), ground = hexCorners(r, 0), inner = hexCorners(INSET, h), soil = hexCorners(INSET, h - PLANTER.drop);

  // contact shadow, cast down-right
  shadowShape(ctx, (c) => poly(c, ground.map(([x, y]) => [x * 1.02 + 0.06, y + 0.05])), 'rgba(24,52,16,0.5)', 0.16, 0.06, 0.05);
  softEllipse(ctx, 0.05, 0.08, r * 1.15, r * 0.95 * SQ, '#1d3a12', 0.18, 0.5);

  // --- front walls (right → left): shade by the direction they face (light from the upper left)
  const walls = [[0, 1, -0.28], [1, 2, -0.12], [2, 3, 0.04]];
  for (const [a, b, k] of walls) {
    const q = [top[a], top[b], ground[b], ground[a]];
    const base = shade(wood, k);
    ctx.beginPath(); poly(ctx, q);
    const gr = ctx.createLinearGradient(0, top[a][1], 0, ground[a][1]);
    gr.addColorStop(0, shade(base, 0.12)); gr.addColorStop(0.55, base); gr.addColorStop(1, shade(base, -0.28));
    ctx.fillStyle = gr; ctx.fill();
    ctx.save(); ctx.clip();
    // two planks: seam with a bevel highlight
    const mA = lerp2(top[a], ground[a], 0.5), mB = lerp2(top[b], ground[b], 0.5);
    ctx.strokeStyle = rgba(ink(wood, 0.5), 0.75); ctx.lineWidth = thin * 1.3;
    ctx.beginPath(); ctx.moveTo(mA[0], mA[1]); ctx.lineTo(mB[0], mB[1]); ctx.stroke();
    ctx.strokeStyle = rgba(shade(base, 0.35), 0.5); ctx.lineWidth = thin;
    ctx.beginPath(); ctx.moveTo(mA[0], mA[1] + thin * 1.4); ctx.lineTo(mB[0], mB[1] + thin * 1.4); ctx.stroke();
    // grain
    ctx.strokeStyle = rgba(shade(base, -0.35), 0.28); ctx.lineWidth = thin * 0.8;
    for (let p = 0; p < 2; p++) for (let i = 0; i < 3; i++) {
      const t = p * 0.5 + 0.1 + i * 0.13 + R() * 0.04;
      const A = lerp2(top[a], ground[a], t), B = lerp2(top[b], ground[b], t);
      const s0 = 0.05 + R() * 0.25, s1 = 0.55 + R() * 0.4;
      const P0 = lerp2(A, B, s0), P1 = lerp2(A, B, s1);
      ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.quadraticCurveTo((P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2 + (R() - 0.5) * 0.02, P1[0], P1[1]); ctx.stroke();
    }
    // a knot now and then
    if (R() < 0.45) {
      const t = 0.2 + R() * 0.6, v = R() < 0.5 ? 0.27 : 0.75;
      const P0 = lerp2(lerp2(top[a], ground[a], v), lerp2(top[b], ground[b], v), t);
      ctx.fillStyle = rgba(shade(base, -0.4), 0.7); ctx.beginPath(); ctx.ellipse(P0[0], P0[1], 0.035, 0.018, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(shade(base, -0.3), 0.35); ctx.beginPath(); ctx.ellipse(P0[0], P0[1], 0.06, 0.03, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // nails near both ends of each plank
    ctx.fillStyle = rgba('#3b2a22', 0.7);
    for (const v of [0.25, 0.75]) for (const t of [0.07, 0.93]) {
      const P0 = lerp2(lerp2(top[a], ground[a], v), lerp2(top[b], ground[b], v), t);
      ctx.beginPath(); ctx.arc(P0[0], P0[1], thin * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // corner edges: a light line where two walls meet
  ctx.strokeStyle = rgba(shade(wood, 0.35), 0.8); ctx.lineWidth = thin;
  for (const k of [1, 2]) { ctx.beginPath(); ctx.moveTo(top[k][0], top[k][1] + thin); ctx.lineTo(ground[k][0], ground[k][1] - thin); ctx.stroke(); }

  // --- inner back walls, visible above the soil
  const back = [[3, 4, -0.34], [4, 5, -0.46], [5, 0, -0.56]];
  for (const [a, b, k] of back) {
    ctx.beginPath(); poly(ctx, [inner[a], inner[b], soil[b], soil[a]]);
    ctx.fillStyle = shade(wood, k); ctx.fill();
  }
  // --- soil
  ctx.beginPath(); poly(ctx, soil);
  const sg = ctx.createLinearGradient(0, soil[4][1], 0, soil[1][1]);
  sg.addColorStop(0, '#3e2616'); sg.addColorStop(0.35, '#5a3a24'); sg.addColorStop(1, '#6e4a2e');
  ctx.fillStyle = sg; ctx.fill();
  ctx.save(); ctx.clip();
  // crumbly clumps
  for (let i = 0; i < 70; i++) {
    const x = (R() - 0.5) * 2 * INSET, y = (R() - 0.5) * 2 * INSET * SQ;
    if (!inHex(x, y, INSET * 0.98)) continue;
    const s = 0.018 + R() * 0.035, yy = y - (h - PLANTER.drop) * HY;
    const light = R() < 0.55;
    ctx.fillStyle = light ? rgba('#8a6242', 0.75) : rgba('#2f1c10', 0.6);
    ctx.beginPath(); ctx.ellipse(x, yy, s, s * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    if (light) { ctx.fillStyle = rgba('#a57a55', 0.6); ctx.beginPath(); ctx.ellipse(x - s * 0.25, yy - s * 0.25, s * 0.45, s * 0.28, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  // a couple of small stones and a curl of straw mulch
  for (let i = 0; i < 3; i++) {
    const x = (R() - 0.5) * 1.5 * INSET, y = (R() - 0.5) * 1.5 * INSET * SQ;
    if (!inHex(x, y, INSET * 0.85)) continue;
    const yy = y - (h - PLANTER.drop) * HY, s = 0.022 + R() * 0.016;
    ctx.fillStyle = '#9a8c78'; ctx.strokeStyle = '#4e4034'; ctx.lineWidth = thin * 0.8;
    ctx.beginPath(); ctx.ellipse(x, yy, s * 1.3, s * 0.8, R(), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(x - s * 0.4, yy - s * 0.3, s * 0.4, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = rgba('#d8b060', 0.55); ctx.lineWidth = thin * 1.1;
  for (let i = 0; i < 4; i++) {
    const x = (R() - 0.5) * 1.3 * INSET, y = (R() - 0.5) * 1.2 * INSET * SQ - (h - PLANTER.drop) * HY;
    const a = R() * Math.PI, l = 0.06 + R() * 0.05;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4 - 0.02, x + Math.cos(a) * l * 1.8, y + Math.sin(a) * l * 0.5); ctx.stroke();
  }
  // shadow cast by the back rim onto the soil
  const shg = ctx.createLinearGradient(0, soil[4][1], 0, soil[4][1] + 0.3);
  shg.addColorStop(0, 'rgba(20,8,0,0.55)'); shg.addColorStop(1, 'rgba(20,8,0,0)');
  ctx.fillStyle = shg; ctx.fillRect(-2, soil[4][1] - 0.1, 4, 0.5);
  ctx.restore();

  // --- rim (top face of the frame), mitred at the corners
  ctx.beginPath(); poly(ctx, top); poly(ctx, [...inner].reverse());
  const rg = ctx.createLinearGradient(-r, top[4][1], r, top[1][1]);
  rg.addColorStop(0, shade(wood, 0.34)); rg.addColorStop(0.6, shade(wood, 0.16)); rg.addColorStop(1, shade(wood, -0.04));
  ctx.fillStyle = rg; ctx.fill('evenodd');
  ctx.save(); ctx.clip('evenodd');
  ctx.strokeStyle = rgba(shade(wood, -0.3), 0.3); ctx.lineWidth = thin * 0.8;
  for (let k = 0; k < 6; k++) {
    const a = top[k], b = top[(k + 1) % 6], c = inner[(k + 1) % 6], d = inner[k];
    for (let i = 1; i < 3; i++) {
      const t = i / 3 + (R() - 0.5) * 0.08;
      const A = lerp2(a, d, t), B = lerp2(b, c, t);
      const s0 = 0.08 + R() * 0.2, s1 = 0.6 + R() * 0.32;
      const P0 = lerp2(A, B, s0), P1 = lerp2(A, B, s1);
      ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.stroke();
    }
  }
  // mitre seams
  ctx.strokeStyle = rgba(ink(wood, 0.5), 0.8); ctx.lineWidth = thin;
  for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(top[k][0], top[k][1]); ctx.lineTo(inner[k][0], inner[k][1]); ctx.stroke(); }
  ctx.restore();
  // rim front-edge highlight
  ctx.strokeStyle = rgba(shade(wood, 0.55), 0.9); ctx.lineWidth = thin * 1.1;
  ctx.beginPath(); ctx.moveTo(top[3][0] + 0.02, top[3][1] + thin); ctx.lineTo(top[2][0], top[2][1] + thin); ctx.lineTo(top[1][0], top[1][1] + thin); ctx.stroke();

  // --- ink outlines
  ctx.strokeStyle = rgba(inkC, 0.85); ctx.lineWidth = thin * 1.1;
  ctx.beginPath(); poly(ctx, inner); ctx.stroke();
  for (const k of [1, 2]) { ctx.beginPath(); ctx.moveTo(top[k][0], top[k][1]); ctx.lineTo(ground[k][0], ground[k][1]); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]); ctx.lineTo(top[1][0], top[1][1]); ctx.lineTo(top[2][0], top[2][1]); ctx.lineTo(top[3][0], top[3][1]); ctx.stroke();
  ctx.strokeStyle = inkC; ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(ground[0][0], ground[0][1]); ctx.lineTo(top[0][0], top[0][1]);
  ctx.lineTo(top[5][0], top[5][1]); ctx.lineTo(top[4][0], top[4][1]); ctx.lineTo(top[3][0], top[3][1]);
  ctx.lineTo(ground[3][0], ground[3][1]); ctx.lineTo(ground[2][0], ground[2][1]); ctx.lineTo(ground[1][0], ground[1][1]); ctx.closePath();
  ctx.stroke();
}

// wet soil: darker with glossy glints
export function paintWet(ctx, px) {
  const soil = hexCorners(INSET, SOIL_Y);
  ctx.beginPath(); poly(ctx, soil);
  ctx.fillStyle = 'rgba(24,10,2,0.42)'; ctx.fill();
  ctx.save(); ctx.clip();
  const R = rng(5);
  for (let i = 0; i < 14; i++) {
    const x = (R() - 0.5) * 1.5 * INSET, y = (R() - 0.5) * 1.4 * INSET * SQ - SOIL_Y * HY;
    ctx.fillStyle = `rgba(200,230,255,${0.25 + R() * 0.3})`;
    ctx.beginPath(); ctx.ellipse(x, y, 0.03 + R() * 0.05, 0.01 + R() * 0.012, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// soft golden glow over the soil of an empty bed (drawn additively, pulsing)
export function paintGlow(ctx) {
  const soil = hexCorners(INSET * 1.04, SOIL_Y);
  ctx.beginPath(); poly(ctx, soil);
  const g = ctx.createRadialGradient(0, -SOIL_Y * HY, 0, 0, -SOIL_Y * HY, INSET);
  g.addColorStop(0, 'rgba(255,230,140,0.75)'); g.addColorStop(0.7, 'rgba(255,210,90,0.35)'); g.addColorStop(1, 'rgba(255,200,80,0.12)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,245,200,0.9)'; ctx.lineWidth = 0.035; ctx.stroke();
}

// rim highlight for hover
export function paintRimLight(ctx) {
  const { r, h } = PLANTER;
  const top = hexCorners(r, h), inner = hexCorners(INSET, h);
  ctx.beginPath(); poly(ctx, top); poly(ctx, [...inner].reverse());
  ctx.fillStyle = 'rgba(255,248,220,0.55)'; ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.03;
  ctx.beginPath(); poly(ctx, top); ctx.stroke();
}

// a plot for sale: trodden lighter grass, chalk-dashed outline and four little pegs with twine
export function paintForSale(ctx, px) {
  const r = PLANTER.r * 0.96;
  const c = hexCorners(r, 0);
  ctx.beginPath(); poly(ctx, c);
  ctx.fillStyle = 'rgba(255,255,230,0.16)'; ctx.fill();
  ctx.setLineDash([0.09, 0.07]);
  ctx.strokeStyle = 'rgba(255,255,245,0.85)'; ctx.lineWidth = Math.max(0.03, px * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const k of [0, 1, 2, 3, 4, 5]) {
    const [x, y] = c[k];
    softEllipse(ctx, x + 0.02, y + 0.01, 0.05, 0.03, '#1d3a12', 0.35);
    ctx.fillStyle = '#d9a86a'; ctx.strokeStyle = '#6b4526'; ctx.lineWidth = Math.max(0.012, px);
    ctx.beginPath(); ctx.rect(x - 0.022, y - 0.12, 0.044, 0.12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0c890'; ctx.beginPath(); ctx.rect(x - 0.022, y - 0.12, 0.044, 0.025); ctx.fill();
  }
}

const cache = new Map();
function cached(key, res, make) {
  const k = key + '@' + res;
  let s = cache.get(k);
  if (!s) { s = make(); cache.set(k, s); if (cache.size > 64) cache.delete(cache.keys().next().value); }
  return s;
}
const W = 2.3, Hh = 2.0, AX = 1.15, AY = 1.25;
export const planterSprite = (v, res) => cached('p' + v, res, () => new Sprite(W, Hh, AX, AY, res, (ctx, px) => paintPlanter(ctx, px, v)));
export const wetSprite = (res) => cached('wet', res, () => new Sprite(W, Hh, AX, AY, res, (ctx, px) => paintWet(ctx, px)));
export const glowSprite = (res) => cached('glow', res, () => new Sprite(W, Hh, AX, AY, res, (ctx) => paintGlow(ctx)));
export const rimSprite = (res) => cached('rim', res, () => new Sprite(W, Hh, AX, AY, res, (ctx) => paintRimLight(ctx)));
export const saleSprite = (res) => cached('sale', res, () => new Sprite(W, Hh, AX, AY, res, (ctx, px) => paintForSale(ctx, px)));
