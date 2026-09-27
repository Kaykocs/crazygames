// Built / crafted props: the straw beehive on its stump, picket fence runs, the potting shed, wheelbarrow,
// watering can, terracotta pots, a signpost and a stepping-stone. Ground contact point at (0, 0).
import { rng, softEllipse, poly, roundRect, smoothClosed } from './paint.js';
import { shade, ink, rgba, mix } from './color.js';
import { SQ } from './view3q.js';
import { paintCanopy } from './nature.js';

const TAU = Math.PI * 2;
const LW = (px, k = 1.6) => Math.max(0.028, px * k);

function shadow(ctx, rx, ry, dx = 0.15, a = 0.38) { softEllipse(ctx, dx, 0.02, rx, ry, '#173512', a, 0.25); }

// a cylinder standing on the ground (stump, pedestal...): body gradient + top ellipse
function cylinder(ctx, r, h, body, top, px, topPaint) {
  const ry = r * SQ;
  const lw = LW(px);
  ctx.beginPath();
  ctx.moveTo(-r, -h); ctx.lineTo(-r, 0); ctx.ellipse(0, 0, r, ry, 0, Math.PI, 0, true); ctx.lineTo(r, -h); ctx.closePath();
  const g = ctx.createLinearGradient(-r, 0, r, 0);
  g.addColorStop(0, shade(body, 0.3)); g.addColorStop(0.4, body); g.addColorStop(1, shade(body, -0.42));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = ink(body, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -h, r, ry, 0, 0, TAU);
  ctx.fillStyle = top; ctx.fill();
  if (topPaint) { ctx.save(); ctx.clip(); topPaint(); ctx.restore(); }
  ctx.beginPath(); ctx.ellipse(0, -h, r, ry, 0, 0, TAU);
  ctx.strokeStyle = ink(body, 0.66); ctx.lineWidth = lw; ctx.stroke();
}

// ------------------------------------------------------------------------------------------ beehive
// Straw skep on a tree stump — the bees' home. Entrance at (0, -ENTRANCE) above the ground.
export const HIVE_ENTRANCE = 0.72;
export function paintHive(ctx, px) {
  const R = rng(42);
  const lw = LW(px, 1.8);
  shadow(ctx, 1.1, 0.42, 0.25, 0.42);
  // stump
  const bark = '#8b5b3a';
  cylinder(ctx, 0.62, 0.42, bark, '#e2b884', px, () => {
    ctx.strokeStyle = rgba('#b0804e', 0.8); ctx.lineWidth = lw * 0.5;
    for (const k of [0.3, 0.55, 0.8]) { ctx.beginPath(); ctx.ellipse(0.03, -0.42, 0.62 * k, 0.62 * SQ * k, 0, 0, TAU); ctx.stroke(); }
  });
  ctx.save();
  ctx.beginPath(); ctx.rect(-0.7, -0.42, 1.4, 0.5); ctx.clip();
  ctx.strokeStyle = rgba(shade(bark, -0.45), 0.6); ctx.lineWidth = lw * 0.6;
  for (let i = 0; i < 7; i++) { const x = -0.55 + i * 0.18 + R() * 0.05; ctx.beginPath(); ctx.moveTo(x, -0.36); ctx.lineTo(x + (R() - 0.5) * 0.04, 0.2); ctx.stroke(); }
  ctx.restore();
  // roots
  ctx.fillStyle = bark; ctx.strokeStyle = ink(bark, 0.66); ctx.lineWidth = lw;
  for (const [x, d] of [[-0.62, -1], [0.62, 1], [0.25, 1]]) {
    ctx.beginPath(); ctx.moveTo(x - d * 0.05, -0.2); ctx.quadraticCurveTo(x + d * 0.12, 0, x + d * 0.3, 0.06); ctx.quadraticCurveTo(x + d * 0.05, 0.08, x - d * 0.05, 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // skep: stacked straw coils, widest at the bottom
  const straw = '#e7b04e', inkS = ink(straw, 0.66);
  const coils = 6, base = -0.42, H = 1.25, W = 0.62;
  for (let k = 0; k < coils; k++) {
    const t0 = k / coils, t1 = (k + 1) / coils;
    const w0 = W * Math.sqrt(1 - Math.pow(t0 * 0.92, 2)), w1 = W * Math.sqrt(1 - Math.pow(t1 * 0.92, 2));
    const y0 = base - t0 * H, y1 = base - t1 * H;
    const w = (w0 + w1) / 2 + 0.03, h = (y0 - y1) * 0.62;
    const cy = (y0 + y1) / 2;
    ctx.beginPath(); roundRect(ctx, -w, cy - h, w * 2, h * 2, h);
    const g = ctx.createLinearGradient(0, cy - h, 0, cy + h);
    g.addColorStop(0, shade(straw, 0.4)); g.addColorStop(0.45, straw); g.addColorStop(1, shade(straw, -0.38));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    // straw binding: diagonal hatches
    ctx.strokeStyle = rgba(shade(straw, -0.45), 0.45); ctx.lineWidth = lw * 0.45;
    for (let x = -w; x < w; x += 0.075) { ctx.beginPath(); ctx.moveTo(x, cy + h); ctx.lineTo(x + h * 0.9, cy - h); ctx.stroke(); }
    // side shading
    const sg = ctx.createLinearGradient(-w, 0, w, 0);
    sg.addColorStop(0, 'rgba(255,240,200,0.3)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(80,40,0,0.35)');
    ctx.fillStyle = sg; ctx.fillRect(-w, cy - h, w * 2, h * 2);
    ctx.restore();
    ctx.beginPath(); roundRect(ctx, -w, cy - h, w * 2, h * 2, h);
    ctx.strokeStyle = inkS; ctx.lineWidth = lw * 0.9; ctx.stroke();
  }
  // top knob
  ctx.beginPath(); ctx.ellipse(0, base - H - 0.02, 0.1, 0.07, 0, 0, TAU);
  ctx.fillStyle = shade(straw, 0.2); ctx.fill(); ctx.strokeStyle = inkS; ctx.lineWidth = lw; ctx.stroke();
  // entrance
  const ey = -HIVE_ENTRANCE + 0.1;
  ctx.beginPath(); ctx.moveTo(-0.16, ey + 0.07); ctx.quadraticCurveTo(-0.16, ey - 0.16, 0, ey - 0.16); ctx.quadraticCurveTo(0.16, ey - 0.16, 0.16, ey + 0.07); ctx.closePath();
  ctx.fillStyle = '#3a1f0c'; ctx.fill(); ctx.strokeStyle = inkS; ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = 'rgba(255,190,60,0.35)'; ctx.beginPath(); ctx.ellipse(0, ey - 0.02, 0.08, 0.05, 0, 0, TAU); ctx.fill();
  // landing board
  ctx.beginPath(); roundRect(ctx, -0.26, ey + 0.05, 0.52, 0.07, 0.03);
  ctx.fillStyle = '#c98b52'; ctx.fill(); ctx.strokeStyle = ink('#c98b52', 0.66); ctx.lineWidth = lw * 0.8; ctx.stroke();
  // honey drip
  ctx.beginPath(); ctx.moveTo(0.08, ey + 0.12); ctx.quadraticCurveTo(0.12, ey + 0.2, 0.1, ey + 0.26); ctx.arc(0.1, ey + 0.27, 0.035, -Math.PI / 2, Math.PI * 1.5); ctx.quadraticCurveTo(0.08, ey + 0.2, 0.05, ey + 0.12); ctx.closePath();
  ctx.fillStyle = '#ffb627'; ctx.fill(); ctx.strokeStyle = '#a0580a'; ctx.lineWidth = lw * 0.6; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(0.09, ey + 0.26, 0.012, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------------------------------------ fence
// White picket fence run of `len` units along x, starting at x = 0. Posts at both ends.
export function paintFence(ctx, px, len = 2, seed = 1) {
  const R = rng(seed);
  const lw = LW(px, 1.5);
  const white = '#f6f1e6', inkW = '#77708a';
  softEllipse(ctx, len / 2 + 0.1, 0.06, len * 0.55, 0.16, '#173512', 0.35, 0.3);
  // rails
  for (const y of [-0.32, -0.62]) {
    ctx.beginPath(); roundRect(ctx, 0, y - 0.045, len, 0.09, 0.03);
    ctx.fillStyle = shade(white, -0.18); ctx.fill(); ctx.strokeStyle = inkW; ctx.lineWidth = lw * 0.8; ctx.stroke();
  }
  // pickets
  const step = 0.2, n = Math.floor(len / step);
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * step + (len - n * step) / 2, h = 0.86 + (R() - 0.5) * 0.04, w = 0.12;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 0.02); ctx.lineTo(x - w / 2, -h + 0.07); ctx.lineTo(x, -h); ctx.lineTo(x + w / 2, -h + 0.07); ctx.lineTo(x + w / 2, 0.02); ctx.closePath();
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, white); g.addColorStop(1, shade(white, -0.22));
    ctx.fillStyle = g; ctx.fill();
    // weathered base
    ctx.save(); ctx.clip();
    const bg = ctx.createLinearGradient(0, -0.2, 0, 0.02);
    bg.addColorStop(0, 'rgba(90,120,60,0)'); bg.addColorStop(1, 'rgba(90,120,60,0.35)');
    ctx.fillStyle = bg; ctx.fillRect(x - w, -0.25, w * 2, 0.3);
    ctx.restore();
    ctx.strokeStyle = inkW; ctx.lineWidth = lw; ctx.stroke();
  }
  // posts
  for (const x of [0, len]) {
    ctx.beginPath(); roundRect(ctx, x - 0.07, -1.02, 0.14, 1.05, 0.03);
    const g = ctx.createLinearGradient(x - 0.07, 0, x + 0.07, 0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, shade(white, -0.25));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = inkW; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, -1.04, 0.09, 0.05, 0, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
  }
  // grass at the foot
  for (let i = 0; i < len * 6; i++) {
    const x = R() * len, hgt = 0.08 + R() * 0.1;
    ctx.strokeStyle = R() < 0.5 ? '#4f9a3c' : '#86c95c'; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.moveTo(x, 0.03); ctx.quadraticCurveTo(x + 0.02, -hgt * 0.5, x + (R() - 0.5) * 0.06, -hgt); ctx.stroke();
  }
}

// ------------------------------------------------------------------------------------------ shed
export function paintShed(ctx, px) {
  const R = rng(3);
  const lw = LW(px, 1.8);
  shadow(ctx, 1.9, 0.55, 0.45, 0.4);
  const wood = '#7fb6c9', trim = '#fff6ea', roof = '#d0624a';
  const W = 1.5, H = 1.4, D = 0.9 * SQ;          // front face width/height, side depth (screen)
  // side wall (right)
  ctx.beginPath(); poly(ctx, [[W / 2, 0], [W / 2 + 0.55, -D], [W / 2 + 0.55, -D - H], [W / 2, -H]]);
  ctx.fillStyle = shade(wood, -0.3); ctx.fill(); ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.stroke();
  // front wall with planks
  ctx.beginPath(); ctx.rect(-W / 2, -H, W, H);
  const g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
  g.addColorStop(0, shade(wood, 0.2)); g.addColorStop(1, shade(wood, -0.1));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = rgba(ink(wood, 0.5), 0.45); ctx.lineWidth = lw * 0.6;
  for (let x = -W / 2 + 0.16; x < W / 2; x += 0.16) { ctx.beginPath(); ctx.moveTo(x, -H); ctx.lineTo(x, 0); ctx.stroke(); }
  const ag = ctx.createLinearGradient(0, -0.3, 0, 0);
  ag.addColorStop(0, 'rgba(30,50,20,0)'); ag.addColorStop(1, 'rgba(30,50,20,0.3)');
  ctx.fillStyle = ag; ctx.fillRect(-W / 2, -0.3, W, 0.3);
  ctx.restore();
  ctx.beginPath(); ctx.rect(-W / 2, -H, W, H); ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.stroke();
  // door
  ctx.beginPath(); roundRect(ctx, -0.55, -1.02, 0.5, 1.02, 0.06);
  ctx.fillStyle = shade(wood, -0.15); ctx.fill(); ctx.strokeStyle = trim; ctx.lineWidth = lw * 2.2; ctx.stroke();
  ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw * 0.8; ctx.stroke();
  ctx.strokeStyle = trim; ctx.lineWidth = lw * 1.6;
  ctx.beginPath(); ctx.moveTo(-0.52, -0.95); ctx.lineTo(-0.08, -0.08); ctx.stroke();
  ctx.fillStyle = '#e8c04a'; ctx.beginPath(); ctx.arc(-0.13, -0.5, 0.035, 0, TAU); ctx.fill();
  // window with flower box
  ctx.beginPath(); roundRect(ctx, 0.12, -1.05, 0.46, 0.4, 0.04);
  const wg = ctx.createLinearGradient(0.12, -1.05, 0.58, -0.65);
  wg.addColorStop(0, '#d8f4ff'); wg.addColorStop(1, '#7fb9d6');
  ctx.fillStyle = wg; ctx.fill(); ctx.strokeStyle = trim; ctx.lineWidth = lw * 2; ctx.stroke();
  ctx.strokeStyle = trim; ctx.lineWidth = lw * 1.2; ctx.beginPath(); ctx.moveTo(0.35, -1.05); ctx.lineTo(0.35, -0.65); ctx.moveTo(0.12, -0.85); ctx.lineTo(0.58, -0.85); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); poly(ctx, [[0.16, -1.0], [0.26, -1.0], [0.18, -0.9]]); ctx.fill();
  ctx.beginPath(); roundRect(ctx, 0.08, -0.66, 0.54, 0.1, 0.02); ctx.fillStyle = '#b36a3c'; ctx.fill(); ctx.strokeStyle = ink('#b36a3c', 0.66); ctx.lineWidth = lw * 0.8; ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const x = 0.13 + i * 0.11, c = ['#ff6f9c', '#ffd23f', '#ffffff', '#ff6f9c', '#9f7bff'][i];
    ctx.fillStyle = '#4f9a3c'; ctx.beginPath(); ctx.arc(x, -0.68, 0.05, 0, TAU); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, -0.72, 0.035, 0, TAU); ctx.fill();
  }
  // roof: front gable edge + side slope
  ctx.beginPath(); poly(ctx, [[-W / 2 - 0.12, -H + 0.02], [0, -H - 0.62], [W / 2 + 0.12, -H + 0.02]]);
  ctx.fillStyle = shade(roof, -0.3); ctx.fill();
  ctx.beginPath(); poly(ctx, [[0, -H - 0.62], [0.55, -H - 0.62 - D], [W / 2 + 0.67, -H + 0.02 - D], [W / 2 + 0.12, -H + 0.02]]);
  const rg = ctx.createLinearGradient(0, -H - 0.62, W / 2, -H);
  rg.addColorStop(0, shade(roof, 0.25)); rg.addColorStop(1, shade(roof, -0.15));
  ctx.fillStyle = rg; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = rgba(ink(roof, 0.5), 0.5); ctx.lineWidth = lw * 0.6;
  for (let k = 1; k < 6; k++) { const t = k / 6; ctx.beginPath(); ctx.moveTo(t * (W / 2 + 0.12), -H - 0.62 + t * 0.64); ctx.lineTo(0.55 + t * (W / 2 + 0.12), -H - 0.62 - D + t * 0.64); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = ink(roof, 0.66); ctx.lineWidth = lw;
  ctx.beginPath(); poly(ctx, [[0, -H - 0.62], [0.55, -H - 0.62 - D], [W / 2 + 0.67, -H + 0.02 - D], [W / 2 + 0.12, -H + 0.02]]); ctx.stroke();
  ctx.beginPath(); poly(ctx, [[-W / 2 - 0.12, -H + 0.02], [0, -H - 0.62], [W / 2 + 0.12, -H + 0.02]]); ctx.stroke();
  // gable trim
  ctx.strokeStyle = trim; ctx.lineWidth = lw * 2;
  ctx.beginPath(); ctx.moveTo(-W / 2 - 0.1, -H + 0.02); ctx.lineTo(0, -H - 0.6); ctx.lineTo(W / 2 + 0.1, -H + 0.02); ctx.stroke();
  // a round attic vent
  ctx.beginPath(); ctx.arc(0, -H - 0.22, 0.1, 0, TAU); ctx.fillStyle = '#3d4a55'; ctx.fill(); ctx.strokeStyle = trim; ctx.lineWidth = lw * 1.4; ctx.stroke();
  // climbing ivy on the corner
  const ivy = [{ x: -W / 2 + 0.05, y: -0.3, r: 0.16 }, { x: -W / 2 + 0.02, y: -0.55, r: 0.14 }, { x: -W / 2 + 0.1, y: -0.12, r: 0.18 }];
  paintCanopy(ctx, ivy, '#4f9e48', px, R, { leafy: 0.5, leafSize: 0.5 });
}

// ------------------------------------------------------------------------------------------ small garden props
export function paintWheelbarrow(ctx, px) {
  const lw = LW(px, 1.5);
  shadow(ctx, 0.8, 0.22, 0.1, 0.4);
  const red = '#d9534f';
  // handles & legs
  ctx.strokeStyle = '#6b4526'; ctx.lineWidth = lw * 3;
  ctx.beginPath(); ctx.moveTo(-0.35, -0.3); ctx.lineTo(-0.85, -0.42); ctx.moveTo(-0.3, -0.28); ctx.lineTo(-0.4, 0); ctx.stroke();
  ctx.strokeStyle = '#a0703f'; ctx.lineWidth = lw * 1.8; ctx.stroke();
  // wheel
  ctx.beginPath(); ctx.ellipse(0.42, -0.17, 0.12, 0.17, 0, 0, TAU); ctx.fillStyle = '#4a4a55'; ctx.fill(); ctx.strokeStyle = '#1f1f28'; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0.42, -0.17, 0.05, 0.07, 0, 0, TAU); ctx.fillStyle = '#c0c0c8'; ctx.fill();
  // tray
  ctx.beginPath(); poly(ctx, [[-0.5, -0.62], [0.5, -0.62], [0.36, -0.28], [-0.32, -0.28]]);
  const g = ctx.createLinearGradient(0, -0.62, 0, -0.28);
  g.addColorStop(0, shade(red, 0.2)); g.addColorStop(1, shade(red, -0.3));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(red, 0.66); ctx.lineWidth = lw; ctx.stroke();
  // soil + seedlings
  ctx.beginPath(); ctx.ellipse(0, -0.63, 0.49, 0.1, 0, 0, TAU); ctx.fillStyle = '#5a3a24'; ctx.fill(); ctx.strokeStyle = ink(red, 0.66); ctx.stroke();
  for (const [x, c] of [[-0.25, '#ff6f9c'], [0, '#ffd23f'], [0.24, '#8f6bff']]) {
    ctx.strokeStyle = '#3f8a34'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, -0.64); ctx.lineTo(x, -0.86); ctx.stroke();
    ctx.fillStyle = '#5aaa45'; ctx.beginPath(); ctx.ellipse(x - 0.05, -0.72, 0.05, 0.025, -0.6, 0, TAU); ctx.ellipse(x + 0.05, -0.74, 0.05, 0.025, 0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = c; ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw * 0.7;
    for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 0.045, -0.9 + Math.sin(a) * 0.04, 0.035, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(x, -0.9, 0.025, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); poly(ctx, [[-0.44, -0.58], [-0.3, -0.58], [-0.24, -0.34], [-0.3, -0.33]]); ctx.fill();
}

export function paintWateringCan(ctx, px) {
  const lw = LW(px, 1.5);
  shadow(ctx, 0.4, 0.12, 0.06, 0.4);
  const c = '#5ab0d8';
  // spout
  ctx.beginPath(); ctx.moveTo(0.18, -0.2); ctx.lineTo(0.5, -0.46); ctx.lineTo(0.54, -0.42); ctx.lineTo(0.22, -0.12); ctx.closePath();
  ctx.fillStyle = shade(c, -0.1); ctx.fill(); ctx.strokeStyle = ink(c, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0.53, -0.46, 0.06, 0.04, -0.7, 0, TAU); ctx.fillStyle = shade(c, 0.2); ctx.fill(); ctx.stroke();
  // body
  ctx.beginPath(); roundRect(ctx, -0.22, -0.42, 0.44, 0.42, 0.08);
  const g = ctx.createLinearGradient(-0.22, 0, 0.22, 0);
  g.addColorStop(0, shade(c, 0.35)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, -0.35));
  ctx.fillStyle = g; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -0.42, 0.22, 0.07, 0, 0, TAU); ctx.fillStyle = shade(c, 0.1); ctx.fill(); ctx.stroke();
  // handle
  ctx.strokeStyle = ink(c, 0.66); ctx.lineWidth = lw * 3.2;
  ctx.beginPath(); ctx.moveTo(-0.16, -0.44); ctx.quadraticCurveTo(0, -0.72, 0.16, -0.44); ctx.stroke();
  ctx.strokeStyle = c; ctx.lineWidth = lw * 1.8; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-0.12, -0.24, 0.04, 0.12, 0, 0, TAU); ctx.fill();
}

export function paintPot(ctx, px, seed = 1, flower = '#ff6f9c') {
  const R = rng(seed);
  const lw = LW(px, 1.5);
  shadow(ctx, 0.3, 0.1, 0.06, 0.4);
  const terra = '#d9774a';
  ctx.beginPath(); poly(ctx, [[-0.2, -0.36], [0.2, -0.36], [0.15, 0], [-0.15, 0]]);
  const g = ctx.createLinearGradient(-0.2, 0, 0.2, 0);
  g.addColorStop(0, shade(terra, 0.3)); g.addColorStop(1, shade(terra, -0.35));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(terra, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); roundRect(ctx, -0.24, -0.44, 0.48, 0.1, 0.03); ctx.fillStyle = shade(terra, 0.1); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -0.44, 0.2, 0.05, 0, 0, TAU); ctx.fillStyle = '#4e321f'; ctx.fill();
  // bushy plant with flowers
  const clumps = [{ x: -0.12, y: -0.55, r: 0.14 }, { x: 0.12, y: -0.56, r: 0.14 }, { x: 0, y: -0.68, r: 0.16 }];
  paintCanopy(ctx, clumps, '#5aaa45', px, R, { leafy: 0.4, leafSize: 0.5 });
  for (let i = 0; i < 5; i++) {
    const x = (R() - 0.5) * 0.3, y = -0.58 - R() * 0.2;
    ctx.fillStyle = flower; ctx.strokeStyle = ink(flower, 0.6); ctx.lineWidth = lw * 0.6;
    for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 0.03, y + Math.sin(a) * 0.028, 0.025, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(x, y, 0.018, 0, TAU); ctx.fill();
  }
}

// stepping stone (flat on the ground)
export function paintStone(ctx, px, seed = 1, size = 1) {
  const R = rng(seed);
  const lw = LW(px, 1.3);
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const r = (0.28 + R() * 0.07) * size; pts.push([Math.cos(a) * r * 1.2, Math.sin(a) * r * SQ]); }
  ctx.beginPath(); smoothClosed(ctx, pts.map(([x, y]) => [x + 0.03, y + 0.04]), 0.5);
  ctx.fillStyle = 'rgba(30,50,20,0.3)'; ctx.fill();
  ctx.beginPath(); smoothClosed(ctx, pts.map(([x, y]) => [x, y + 0.03]), 0.5);
  ctx.fillStyle = '#9d937f'; ctx.fill();
  ctx.beginPath(); smoothClosed(ctx, pts, 0.5);
  const col = shade('#d8d0bf', (R() - 0.5) * 0.12);
  const g = ctx.createLinearGradient(-0.3, -0.2, 0.3, 0.2);
  g.addColorStop(0, shade(col, 0.3)); g.addColorStop(1, shade(col, -0.15));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 10; i++) { ctx.fillStyle = rgba(R() < 0.5 ? '#8f8573' : '#ffffff', 0.35); ctx.beginPath(); ctx.arc((R() - 0.5) * 0.6 * size, (R() - 0.5) * 0.3 * size, 0.012 + R() * 0.012, 0, TAU); ctx.fill(); }
  if (R() < 0.6) { ctx.fillStyle = rgba('#78b848', 0.8); ctx.beginPath(); ctx.ellipse((R() - 0.5) * 0.3, 0.1 * size, 0.14 * size, 0.05 * size, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); smoothClosed(ctx, pts, 0.5);
  ctx.strokeStyle = '#6f6655'; ctx.lineWidth = lw; ctx.stroke();
}

// wooden signpost with a little flower-shaped board (no text)
export function paintSign(ctx, px) {
  const lw = LW(px, 1.5);
  shadow(ctx, 0.3, 0.1, 0.08, 0.4);
  const wood = '#c98b52';
  ctx.beginPath(); roundRect(ctx, -0.045, -0.8, 0.09, 0.82, 0.02); ctx.fillStyle = shade(wood, -0.1); ctx.fill(); ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); roundRect(ctx, -0.34, -0.86, 0.68, 0.34, 0.06);
  const g = ctx.createLinearGradient(0, -0.86, 0, -0.52);
  g.addColorStop(0, shade(wood, 0.25)); g.addColorStop(1, shade(wood, -0.1));
  ctx.fillStyle = g; ctx.fill(); ctx.stroke();
  // painted bee + flower symbol
  ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#5a3a14'; ctx.lineWidth = lw * 0.7;
  ctx.beginPath(); ctx.ellipse(-0.12, -0.69, 0.08, 0.06, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.14, -0.74); ctx.lineTo(-0.14, -0.64); ctx.moveTo(-0.09, -0.74); ctx.lineTo(-0.09, -0.64); ctx.stroke();
  ctx.fillStyle = 'rgba(230,245,255,0.9)'; ctx.beginPath(); ctx.ellipse(-0.13, -0.77, 0.035, 0.025, -0.5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff6f9c';
  for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.beginPath(); ctx.arc(0.14 + Math.cos(a) * 0.05, -0.69 + Math.sin(a) * 0.045, 0.035, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(0.14, -0.69, 0.028, 0, TAU); ctx.fill();
}
