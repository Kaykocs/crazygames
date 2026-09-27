// Garden decorations the player buys, painted in the illustrated style (ground contact at 0,0), plus the gnome.
// Animated parts (windmill sails, fountain water, lantern glow) are drawn per frame by the world.
import { rng, softEllipse, poly, roundRect, smoothClosed } from './paint.js';
import { shade, ink, rgba, mix } from './color.js';
import { SQ } from './view3q.js';
import { paintCanopy } from './nature.js';

const TAU = Math.PI * 2;
const LW = (px, k = 1.6) => Math.max(0.028, px * k);
const STONE = '#d8d1c2';

function shadow(ctx, rx, ry, dx = 0.15, a = 0.38) { softEllipse(ctx, dx, 0.02, rx, ry, '#173512', a, 0.25); }
function grad(ctx, x0, y0, x1, y1, c, k0 = 0.3, k1 = -0.35) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(c, k0)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, k1));
  return g;
}
function column(ctx, x, w, y0, y1, c, px) {
  ctx.beginPath(); ctx.rect(x - w / 2, y1, w, y0 - y1);
  ctx.fillStyle = grad(ctx, x - w / 2, 0, x + w / 2, 0, c); ctx.fill();
  ctx.strokeStyle = ink(c, 0.62); ctx.lineWidth = LW(px); ctx.stroke();
}
function bowl(ctx, cx, cy, rx, ry, depth, c, px, water = true) {
  const lw = LW(px);
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); ctx.quadraticCurveTo(cx - rx * 0.6, cy + depth, cx, cy + depth); ctx.quadraticCurveTo(cx + rx * 0.6, cy + depth, cx + rx, cy); ctx.closePath();
  ctx.beginPath(); ctx.moveTo(cx - rx, cy); ctx.quadraticCurveTo(cx - rx * 0.85, cy + depth, cx, cy + depth); ctx.quadraticCurveTo(cx + rx * 0.85, cy + depth, cx + rx, cy); ctx.closePath();
  ctx.fillStyle = grad(ctx, cx - rx, 0, cx + rx, 0, c); ctx.fill(); ctx.strokeStyle = ink(c, 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fillStyle = shade(c, 0.25); ctx.fill(); ctx.stroke();
  if (water) {
    ctx.beginPath(); ctx.ellipse(cx, cy + ry * 0.12, rx * 0.84, ry * 0.72, 0, 0, TAU);
    const g = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
    g.addColorStop(0, '#4fb6e0'); g.addColorStop(1, '#9fe6f7');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.25, cy, rx * 0.3, ry * 0.2, 0, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
  }
}

// ------------------------------------------------------------------------------------------ birdbath
export function paintBirdbath(ctx, px) {
  const lw = LW(px);
  shadow(ctx, 0.75, 0.26, 0.2);
  // base
  ctx.beginPath(); ctx.ellipse(0, -0.05, 0.36, 0.36 * SQ * 0.7, 0, 0, TAU); ctx.fillStyle = shade(STONE, -0.2); ctx.fill(); ctx.strokeStyle = ink(STONE, 0.62); ctx.lineWidth = lw; ctx.stroke();
  // pedestal (waisted)
  ctx.beginPath(); ctx.moveTo(-0.22, -0.08); ctx.quadraticCurveTo(-0.08, -0.4, -0.16, -0.72); ctx.lineTo(0.16, -0.72); ctx.quadraticCurveTo(0.08, -0.4, 0.22, -0.08); ctx.closePath();
  ctx.fillStyle = grad(ctx, -0.22, 0, 0.22, 0, STONE); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = rgba(ink(STONE, 0.5), 0.4); ctx.lineWidth = lw * 0.6;
  ctx.beginPath(); ctx.moveTo(-0.1, -0.45); ctx.lineTo(0.1, -0.45); ctx.stroke();
  // moss
  ctx.fillStyle = rgba('#78b848', 0.85); ctx.beginPath(); ctx.ellipse(-0.12, -0.12, 0.12, 0.05, 0.2, 0, TAU); ctx.fill();
  bowl(ctx, 0, -0.78, 0.62, 0.62 * SQ * 0.55, 0.22, STONE, px);
  // bluebird on the rim
  const bx = 0.38, by = -0.86;
  ctx.fillStyle = '#5b9bea'; ctx.strokeStyle = '#1f3f72'; ctx.lineWidth = lw * 0.8;
  ctx.beginPath(); ctx.ellipse(bx, by - 0.1, 0.13, 0.1, -0.2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(bx + 0.1, by - 0.2, 0.075, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffb36b'; ctx.beginPath(); ctx.ellipse(bx + 0.02, by - 0.06, 0.08, 0.05, -0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f2a33a'; ctx.beginPath(); poly(ctx, [[bx + 0.17, by - 0.21], [bx + 0.25, by - 0.19], [bx + 0.17, by - 0.17]]); ctx.fill();
  ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.arc(bx + 0.12, by - 0.22, 0.02, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3f7cd0'; ctx.beginPath(); ctx.moveTo(bx - 0.1, by - 0.12); ctx.lineTo(bx - 0.26, by - 0.18); ctx.lineTo(bx - 0.12, by - 0.06); ctx.closePath(); ctx.fill(); ctx.stroke();
}

// ------------------------------------------------------------------------------------------ bench
export function paintBench(ctx, px) {
  const lw = LW(px);
  shadow(ctx, 1.1, 0.3, 0.2);
  const wood = '#c98b52', iron = '#3d3a44';
  // legs (curly iron)
  ctx.strokeStyle = iron; ctx.lineWidth = lw * 2.2;
  for (const x of [-0.72, 0.72]) {
    ctx.beginPath(); ctx.moveTo(x - 0.1, 0); ctx.quadraticCurveTo(x, -0.2, x, -0.42); ctx.moveTo(x + 0.1, 0); ctx.quadraticCurveTo(x, -0.2, x, -0.42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, -0.44); ctx.lineTo(x, -1.0); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + (x < 0 ? 0.08 : -0.08), -0.55, 0.07, 0, TAU); ctx.lineWidth = lw * 1.2; ctx.stroke(); ctx.lineWidth = lw * 2.2;
  }
  // back slats
  for (const y of [-0.98, -0.82, -0.66]) {
    ctx.beginPath(); roundRect(ctx, -0.86, y, 1.72, 0.12, 0.04);
    ctx.fillStyle = grad(ctx, 0, y, 0, y + 0.12, wood, 0.25, -0.25); ctx.fill(); ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.stroke();
  }
  // seat (seen from above: a few planks receding)
  for (const [y, k] of [[-0.5, -0.1], [-0.42, 0], [-0.34, 0.1]]) {
    ctx.beginPath(); roundRect(ctx, -0.9, y, 1.8, 0.1, 0.03);
    ctx.fillStyle = shade(wood, k + 0.12); ctx.fill(); ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.stroke();
  }
  ctx.beginPath(); roundRect(ctx, -0.9, -0.26, 1.8, 0.07, 0.03); ctx.fillStyle = shade(wood, -0.3); ctx.fill(); ctx.stroke();
  // a cushion and a book for coziness
  ctx.beginPath(); roundRect(ctx, -0.62, -0.62, 0.42, 0.24, 0.08); ctx.fillStyle = '#ff8fb1'; ctx.fill(); ctx.strokeStyle = ink('#ff8fb1', 0.6); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-0.46, -0.56, 0.1, 0.04, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); roundRect(ctx, 0.3, -0.56, 0.3, 0.1, 0.02); ctx.fillStyle = '#5b8def'; ctx.fill(); ctx.strokeStyle = ink('#5b8def', 0.6); ctx.stroke();
  ctx.fillStyle = '#fff6e0'; ctx.fillRect(0.32, -0.49, 0.26, 0.02);
}

// ------------------------------------------------------------------------------------------ rose arch
export function paintArch(ctx, px) {
  const R = rng(5);
  const lw = LW(px);
  shadow(ctx, 1.2, 0.3, 0.3);
  const white = '#f6f1e6', inkW = '#77708a';
  // posts
  for (const x of [-0.85, 0.85]) {
    ctx.beginPath(); roundRect(ctx, x - 0.08, -1.9, 0.16, 1.92, 0.03);
    ctx.fillStyle = grad(ctx, x - 0.08, 0, x + 0.08, 0, white, 0.2, -0.25); ctx.fill(); ctx.strokeStyle = inkW; ctx.lineWidth = lw; ctx.stroke();
    // lattice
    ctx.strokeStyle = rgba(inkW, 0.5); ctx.lineWidth = lw * 0.6;
    for (let y = -1.8; y < -0.1; y += 0.22) { ctx.beginPath(); ctx.moveTo(x - 0.08, y); ctx.lineTo(x + 0.08, y + 0.12); ctx.stroke(); }
  }
  // arch
  ctx.beginPath(); ctx.arc(0, -1.9, 0.93, Math.PI, 0); ctx.arc(0, -1.9, 0.77, 0, Math.PI, true); ctx.closePath();
  ctx.fillStyle = white; ctx.fill(); ctx.strokeStyle = inkW; ctx.lineWidth = lw; ctx.stroke();
  // climbing vines with roses
  const clumps = [];
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    clumps.push({ x: Math.cos(a) * 0.86 + (R() - 0.5) * 0.1, y: -1.9 + Math.sin(a) * 0.86 + (R() - 0.5) * 0.1, r: 0.17 + R() * 0.07 });
  }
  for (const x of [-0.85, 0.85]) for (let k = 0; k < 4; k++) clumps.push({ x: x + (R() - 0.5) * 0.18, y: -0.3 - k * 0.42 - R() * 0.1, r: 0.14 + R() * 0.05 });
  paintCanopy(ctx, clumps, '#4f9e48', px, R, { leafy: 0.5, leafSize: 0.6 });
  for (let i = 0; i < 16; i++) {
    const c = clumps[Math.floor(R() * clumps.length)];
    const x = c.x + (R() - 0.5) * c.r, y = c.y + (R() - 0.5) * c.r, r = 0.07 + R() * 0.03;
    const col = R() < 0.6 ? '#e8405a' : '#ff8fb1';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = ink(col, 0.6); ctx.lineWidth = lw * 0.7; ctx.stroke();
    ctx.strokeStyle = rgba(shade(col, -0.45), 0.8); ctx.lineWidth = lw * 0.6;
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0.3, 4.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + r * 0.1, y, r * 0.25, 2, 6); ctx.stroke();
  }
}

// ------------------------------------------------------------------------------------------ paper lanterns
export const LANTERN_SPAN = 2.4;
export const LANTERNS = [[-0.8, '#ff6b6b'], [-0.3, '#ffb347'], [0.2, '#ffe066'], [0.7, '#ff8fc8']];
export function lanternY(x) { const t = (x + LANTERN_SPAN / 2) / LANTERN_SPAN; return -1.95 + Math.sin(t * Math.PI) * 0.32; }
export function paintLanterns(ctx, px) {
  const lw = LW(px);
  shadow(ctx, 1.5, 0.28, 0.2, 0.3);
  const wood = '#a0703f';
  for (const x of [-LANTERN_SPAN / 2, LANTERN_SPAN / 2]) {
    ctx.beginPath(); roundRect(ctx, x - 0.06, -2.1, 0.12, 2.12, 0.03);
    ctx.fillStyle = grad(ctx, x - 0.06, 0, x + 0.06, 0, wood); ctx.fill(); ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.stroke();
  }
  ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = lw * 0.8;
  ctx.beginPath(); ctx.moveTo(-LANTERN_SPAN / 2, -2.02);
  for (let i = 1; i <= 20; i++) { const x = -LANTERN_SPAN / 2 + (i / 20) * LANTERN_SPAN; ctx.lineTo(x, lanternY(x)); }
  ctx.stroke();
  for (const [x, c] of LANTERNS) {
    const y = lanternY(x) + 0.2;
    ctx.strokeStyle = '#4a3a2a'; ctx.beginPath(); ctx.moveTo(x, y - 0.2); ctx.lineTo(x, y - 0.13); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, 0.15, 0.16, 0, 0, TAU);
    const g = ctx.createRadialGradient(x - 0.04, y - 0.05, 0.02, x, y, 0.17);
    g.addColorStop(0, shade(c, 0.55)); g.addColorStop(0.6, c); g.addColorStop(1, shade(c, -0.3));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw * 0.8; ctx.stroke();
    ctx.strokeStyle = rgba(ink(c, 0.5), 0.5); ctx.lineWidth = lw * 0.5;
    for (const k of [-0.07, 0, 0.07]) { ctx.beginPath(); ctx.ellipse(x + k * 0.3, y, Math.abs(k) * 1.4 + 0.01, 0.16, 0, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x - 0.07, y - 0.18, 0.14, 0.035); ctx.fillRect(x - 0.06, y + 0.15, 0.12, 0.03);
  }
}

// ------------------------------------------------------------------------------------------ windmill (tower; sails drawn separately)
export const WINDMILL_HUB = [0.02, -2.55];
export function paintWindmill(ctx, px) {
  const lw = LW(px);
  shadow(ctx, 1.1, 0.32, 0.35);
  const wood = '#e9d8b8', roof = '#b8583e';
  // tapered tower
  ctx.beginPath(); poly(ctx, [[-0.62, 0], [0.62, 0], [0.42, -2.2], [-0.42, -2.2]]);
  ctx.fillStyle = grad(ctx, -0.62, 0, 0.62, 0, wood, 0.2, -0.3); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = rgba(ink(wood, 0.5), 0.35); ctx.lineWidth = lw * 0.6;
  for (let y = -0.2; y > -2.2; y -= 0.18) { ctx.beginPath(); ctx.moveTo(-0.7, y); ctx.lineTo(0.7, y); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = ink(wood, 0.62); ctx.lineWidth = lw; ctx.beginPath(); poly(ctx, [[-0.62, 0], [0.62, 0], [0.42, -2.2], [-0.42, -2.2]]); ctx.stroke();
  // door & window
  ctx.beginPath(); ctx.moveTo(-0.16, 0); ctx.lineTo(-0.16, -0.36); ctx.arc(0, -0.36, 0.16, Math.PI, 0); ctx.lineTo(0.16, 0); ctx.closePath();
  ctx.fillStyle = '#8a5a3a'; ctx.fill(); ctx.strokeStyle = ink('#8a5a3a', 0.6); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -1.35, 0.13, 0, TAU); ctx.fillStyle = '#9fd8f0'; ctx.fill(); ctx.strokeStyle = ink(wood, 0.62); ctx.stroke();
  // cap roof
  ctx.beginPath(); ctx.moveTo(-0.55, -2.15); ctx.quadraticCurveTo(-0.5, -2.9, 0, -3.0); ctx.quadraticCurveTo(0.5, -2.9, 0.55, -2.15); ctx.closePath();
  ctx.fillStyle = grad(ctx, -0.55, 0, 0.55, 0, roof); ctx.fill(); ctx.strokeStyle = ink(roof, 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-0.22, -2.6, 0.08, 0.2, 0.3, 0, TAU); ctx.fill();
  // flower boxes at the base
  for (const x of [-0.45, 0.45]) {
    ctx.beginPath(); roundRect(ctx, x - 0.16, -0.12, 0.32, 0.12, 0.02); ctx.fillStyle = '#b36a3c'; ctx.fill(); ctx.strokeStyle = ink('#b36a3c', 0.6); ctx.lineWidth = lw * 0.8; ctx.stroke();
    for (let k = 0; k < 3; k++) { ctx.fillStyle = ['#ff6f9c', '#ffd23f', '#ffffff'][k]; ctx.beginPath(); ctx.arc(x - 0.09 + k * 0.09, -0.15, 0.045, 0, TAU); ctx.fill(); }
  }
}
export function paintSails(ctx, px) {
  const lw = LW(px);
  const cloth = '#fff8ea', wood = '#8a5a3a';
  for (let k = 0; k < 4; k++) {
    ctx.save(); ctx.rotate((k * Math.PI) / 2);
    ctx.fillStyle = wood; ctx.fillRect(-0.035, -1.35, 0.07, 1.35);
    ctx.beginPath(); roundRect(ctx, 0.04, -1.3, 0.34, 1.02, 0.03);
    ctx.fillStyle = rgba(cloth, 0.95); ctx.fill(); ctx.strokeStyle = ink(wood, 0.6); ctx.lineWidth = lw; ctx.stroke();
    ctx.strokeStyle = rgba(ink(wood, 0.5), 0.5); ctx.lineWidth = lw * 0.6;
    for (let y = -1.2; y < -0.3; y += 0.2) { ctx.beginPath(); ctx.moveTo(0.04, y); ctx.lineTo(0.38, y); ctx.stroke(); }
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, 0.12, 0, TAU); ctx.fillStyle = '#6b4526'; ctx.fill(); ctx.strokeStyle = '#3b2412'; ctx.lineWidth = lw; ctx.stroke();
}

// ------------------------------------------------------------------------------------------ fountain (static stone; water animated)
export const FOUNTAIN_TOP = -1.62;
export function paintFountain(ctx, px) {
  const lw = LW(px);
  shadow(ctx, 1.25, 0.4, 0.2);
  // basin
  const rx = 1.05, ry = 1.05 * SQ * 0.62;
  ctx.beginPath(); ctx.ellipse(0, -0.28, rx, ry, 0, 0, Math.PI); ctx.lineTo(rx, -0.28); ctx.lineTo(rx, -0.06); ctx.ellipse(0, -0.06, rx, ry, 0, 0, Math.PI); ctx.lineTo(-rx, -0.28); ctx.closePath();
  ctx.beginPath(); ctx.moveTo(-rx, -0.3); ctx.lineTo(-rx, -0.04); ctx.ellipse(0, -0.04, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(rx, -0.3); ctx.closePath();
  ctx.fillStyle = grad(ctx, -rx, 0, rx, 0, STONE); ctx.fill(); ctx.strokeStyle = ink(STONE, 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -0.3, rx, ry, 0, 0, TAU); ctx.fillStyle = shade(STONE, 0.25); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -0.28, rx * 0.86, ry * 0.76, 0, 0, TAU);
  const w = ctx.createLinearGradient(0, -0.28 - ry, 0, -0.28 + ry); w.addColorStop(0, '#3fa6d6'); w.addColorStop(1, '#a4e8f8');
  ctx.fillStyle = w; ctx.fill();
  // column + upper bowl
  column(ctx, 0, 0.2, -0.3, -1.25, STONE, px);
  bowl(ctx, 0, -1.25, 0.5, 0.5 * SQ * 0.55, 0.18, STONE, px);
  column(ctx, 0, 0.1, -1.3, FOUNTAIN_TOP + 0.05, STONE, px);
  ctx.beginPath(); ctx.arc(0, FOUNTAIN_TOP, 0.08, 0, TAU); ctx.fillStyle = shade(STONE, 0.2); ctx.fill(); ctx.strokeStyle = ink(STONE, 0.62); ctx.stroke();
}

// ------------------------------------------------------------------------------------------ gazebo
export function paintGazebo(ctx, px) {
  const lw = LW(px);
  shadow(ctx, 1.7, 0.55, 0.4);
  const white = '#f7f2e8', inkW = '#77708a', roof = '#58b6a8';
  // floor
  const fr = 1.35, fry = fr * SQ * 0.75;
  ctx.beginPath(); ctx.ellipse(0, -0.1, fr, fry, 0, 0, TAU); ctx.fillStyle = '#c98b52'; ctx.fill(); ctx.strokeStyle = ink('#c98b52', 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -0.2, fr, fry, 0, 0, TAU); ctx.fillStyle = '#e0a868'; ctx.fill(); ctx.stroke();
  // back pillars
  for (const x of [-0.7, 0.7]) column(ctx, x, 0.14, -0.2 - fry * 0.7, -2.1, white, px);
  // railing
  ctx.strokeStyle = inkW; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.ellipse(0, -0.75, fr * 0.96, fry * 0.96, 0, 0.1, Math.PI - 0.1); ctx.stroke();
  for (let i = 0; i < 9; i++) { const a = 0.15 + (i / 8) * (Math.PI - 0.3); const x = Math.cos(a) * fr * 0.96, y = Math.sin(a) * fry * 0.96; ctx.beginPath(); ctx.moveTo(x, y - 0.2); ctx.lineTo(x, y - 0.75); ctx.stroke(); }
  // front pillars
  for (const x of [-1.2, 1.2, -0.45, 0.45]) column(ctx, x, 0.16, x * x > 1 ? -0.2 : -0.2 + fry * 0.8, -2.05, white, px);
  // roof
  ctx.beginPath(); ctx.moveTo(-1.6, -2.0); ctx.quadraticCurveTo(-1.2, -2.3, -0.9, -2.75); ctx.quadraticCurveTo(-0.3, -3.25, 0, -3.5); ctx.quadraticCurveTo(0.3, -3.25, 0.9, -2.75); ctx.quadraticCurveTo(1.2, -2.3, 1.6, -2.0);
  ctx.quadraticCurveTo(0, -1.72, -1.6, -2.0); ctx.closePath();
  ctx.fillStyle = grad(ctx, -1.6, -3.4, 1.6, -2, roof, 0.3, -0.35); ctx.fill(); ctx.strokeStyle = ink(roof, 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = rgba(ink(roof, 0.5), 0.5); ctx.lineWidth = lw * 0.7;
  for (const x of [-0.9, -0.35, 0.35, 0.9]) { ctx.beginPath(); ctx.moveTo(0, -3.45); ctx.quadraticCurveTo(x * 0.6, -2.8, x * 1.6, -1.95); ctx.stroke(); }
  // scalloped trim
  ctx.fillStyle = white; ctx.strokeStyle = inkW; ctx.lineWidth = lw * 0.8;
  for (let i = 0; i < 9; i++) { const x = -1.45 + i * 0.36; ctx.beginPath(); ctx.arc(x, -1.93 + Math.abs(x) * 0.04, 0.1, 0, Math.PI); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, -3.55, 0.09, 0, TAU); ctx.fillStyle = '#ffd24a'; ctx.fill(); ctx.strokeStyle = '#8a5a08'; ctx.stroke();
  // hanging flower basket
  ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(0, -1.95); ctx.lineTo(0, -1.55); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -1.45, 0.16, 0, Math.PI); ctx.fillStyle = '#b36a3c'; ctx.fill(); ctx.stroke();
  for (let k = 0; k < 5; k++) { ctx.fillStyle = ['#ff6f9c', '#ffffff', '#ffd23f', '#9f7bff', '#ff6f9c'][k]; ctx.beginPath(); ctx.arc(-0.14 + k * 0.07, -1.5 - (k % 2) * 0.05, 0.05, 0, TAU); ctx.fill(); }
}

// ------------------------------------------------------------------------------------------ greenhouse
export function paintGreenhouse(ctx, px) {
  const R = rng(12);
  const lw = LW(px);
  shadow(ctx, 1.8, 0.5, 0.35);
  const frame = '#f4f1ea', inkF = '#6f7a86';
  const W = 2.2, H = 1.3, D = 0.6;
  // plants inside (painted first, seen through glass)
  const clumps = [];
  for (let i = 0; i < 8; i++) clumps.push({ x: -W / 2 + 0.25 + i * 0.26, y: -0.35 - R() * 0.35, r: 0.2 + R() * 0.1 });
  paintCanopy(ctx, clumps, '#4f9e48', px, R, { leafy: 0.4, leafSize: 0.5 });
  for (let i = 0; i < 9; i++) { const c = ['#ff6f9c', '#ffd23f', '#ff6b6b', '#9f7bff'][i % 4]; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(-W / 2 + 0.2 + R() * (W - 0.4), -0.4 - R() * 0.5, 0.05, 0, TAU); ctx.fill(); }
  // glass: front wall, side wall, roof
  const glass = (pts, a) => {
    ctx.beginPath(); poly(ctx, pts);
    const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
    g.addColorStop(0, `rgba(210,240,255,${a})`); g.addColorStop(1, `rgba(150,210,235,${a * 0.6})`);
    ctx.fillStyle = g; ctx.fill();
  };
  glass([[-W / 2, 0], [W / 2, 0], [W / 2, -H], [-W / 2, -H]], 0.45);
  glass([[W / 2, 0], [W / 2 + D, -D * SQ], [W / 2 + D, -D * SQ - H], [W / 2, -H]], 0.55);
  glass([[-W / 2, -H], [0, -H - 0.75], [D, -H - 0.75 - D * SQ], [W / 2 + D, -H - D * SQ], [W / 2, -H]], 0.6);
  // reflections
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = lw * 2;
  for (const x of [-0.8, -0.1, 0.6]) { ctx.beginPath(); ctx.moveTo(x, -0.2); ctx.lineTo(x + 0.3, -H + 0.2); ctx.stroke(); }
  // frame
  ctx.strokeStyle = frame; ctx.lineWidth = lw * 2.4;
  const bars = () => {
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) { const x = -W / 2 + (i / 4) * W; ctx.moveTo(x, 0); ctx.lineTo(x, -H); }
    ctx.moveTo(-W / 2, -H * 0.5); ctx.lineTo(W / 2, -H * 0.5);
    ctx.moveTo(-W / 2, -H); ctx.lineTo(0, -H - 0.75); ctx.lineTo(W / 2, -H);
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2 + D, -D * SQ); ctx.lineTo(W / 2 + D, -D * SQ - H); ctx.lineTo(W / 2, -H);
    ctx.moveTo(0, -H - 0.75); ctx.lineTo(D, -H - 0.75 - D * SQ); ctx.lineTo(W / 2 + D, -H - D * SQ);
    ctx.moveTo(-W / 2, 0); ctx.lineTo(W / 2, 0);
  };
  bars(); ctx.stroke();
  ctx.strokeStyle = inkF; ctx.lineWidth = lw * 0.7; bars(); ctx.stroke();
  // door
  ctx.strokeStyle = frame; ctx.lineWidth = lw * 2; ctx.strokeRect(-0.2, -0.9, 0.4, 0.9);
  ctx.fillStyle = '#e8c04a'; ctx.beginPath(); ctx.arc(0.12, -0.45, 0.03, 0, TAU); ctx.fill();
  // pots by the door
  for (const [x, c] of [[-0.5, '#ff6f9c'], [0.5, '#ffd23f']]) {
    ctx.beginPath(); poly(ctx, [[x - 0.12, -0.2], [x + 0.12, -0.2], [x + 0.09, 0.02], [x - 0.09, 0.02]]); ctx.fillStyle = '#d9774a'; ctx.fill(); ctx.strokeStyle = ink('#d9774a', 0.6); ctx.lineWidth = lw * 0.8; ctx.stroke();
    ctx.fillStyle = '#4f9e48'; ctx.beginPath(); ctx.arc(x, -0.28, 0.12, 0, TAU); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x - 0.04, -0.32, 0.045, 0, TAU); ctx.arc(x + 0.05, -0.28, 0.04, 0, TAU); ctx.fill();
  }
}

// ------------------------------------------------------------------------------------------ golden bee statue
export function paintStatue(ctx, px) {
  const lw = LW(px);
  shadow(ctx, 0.8, 0.28, 0.25);
  // pedestal
  ctx.beginPath(); roundRect(ctx, -0.45, -0.75, 0.9, 0.75, 0.05);
  ctx.fillStyle = grad(ctx, -0.45, 0, 0.45, 0, STONE); ctx.fill(); ctx.strokeStyle = ink(STONE, 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); roundRect(ctx, -0.55, -0.88, 1.1, 0.16, 0.04); ctx.fillStyle = shade(STONE, 0.2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); roundRect(ctx, -0.52, -0.1, 1.04, 0.12, 0.04); ctx.fillStyle = shade(STONE, -0.1); ctx.fill(); ctx.stroke();
  // honeycomb emblem
  ctx.strokeStyle = '#c9a23a'; ctx.lineWidth = lw * 0.9;
  for (const [x, y] of [[-0.1, -0.45], [0.1, -0.45], [0, -0.3]]) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; ctx.lineTo(x + Math.cos(a) * 0.09, y + Math.sin(a) * 0.08); } ctx.closePath(); ctx.stroke(); }
  // golden bee
  const gold = (x0, y0, x1, y1) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.3, '#ffd54a'); g.addColorStop(0.7, '#e0a020'); g.addColorStop(1, '#9a6508'); return g; };
  const by = -1.35;
  ctx.beginPath(); ctx.ellipse(-0.14, by - 0.32, 0.22, 0.34, -0.5, 0, TAU); ctx.fillStyle = gold(-0.3, -1.9, 0, -1.4); ctx.fill(); ctx.strokeStyle = '#7a4a05'; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0.2, by - 0.34, 0.2, 0.32, 0.5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, by, 0.42, 0.34, 0, 0, TAU); ctx.fillStyle = gold(-0.4, by - 0.3, 0.4, by + 0.3); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(122,74,5,0.55)'; for (const x of [-0.14, 0.1]) { ctx.beginPath(); ctx.ellipse(x, by, 0.07, 0.4, 0.1, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, by, 0.42, 0.34, 0, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(0.42, by - 0.08, 0.2, 0, TAU); ctx.fillStyle = gold(0.3, by - 0.3, 0.6, by + 0.1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7a4a05'; ctx.beginPath(); ctx.arc(0.5, by - 0.12, 0.04, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#7a4a05'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(0.4, by - 0.25); ctx.quadraticCurveTo(0.42, by - 0.45, 0.55, by - 0.5); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-0.12, by - 0.14, 0.12, 0.05, -0.3, 0, TAU); ctx.fill();
  const spark = (x, y, s) => { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill(); };
  spark(-0.45, by - 0.55, 0.12); spark(0.62, by + 0.15, 0.08);
}

// ------------------------------------------------------------------------------------------ rainbow bridge
const RAINBOW = ['#ff5f6d', '#ff9f43', '#ffd93d', '#6bd66b', '#4fb5ff', '#8f6bff'];
export function paintRainbowBridge(ctx, px) {
  const lw = LW(px);
  const L = 3.2, H = 0.75;
  const arcY = (x) => -Math.sin(((x + L / 2) / L) * Math.PI) * H;
  softEllipse(ctx, 0.2, 0.1, L * 0.55, 0.3, '#10304a', 0.3, 0.3);
  // deck planks, back rail
  const n = 14;
  ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = lw * 1.6;
  ctx.beginPath(); for (let i = 0; i <= 20; i++) { const x = -L / 2 + (i / 20) * L; ctx.lineTo(x, arcY(x) - 0.65 - 0.28); } ctx.stroke();
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + (i / n) * L, x1 = -L / 2 + ((i + 1) / n) * L;
    const c = RAINBOW[Math.floor((i / n) * RAINBOW.length)];
    ctx.beginPath(); poly(ctx, [[x0, arcY(x0) - 0.28], [x1, arcY(x1) - 0.28], [x1, arcY(x1)], [x0, arcY(x0)]]);
    ctx.fillStyle = shade(c, 0.12); ctx.fill(); ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw * 0.8; ctx.stroke();
    ctx.beginPath(); poly(ctx, [[x0, arcY(x0)], [x1, arcY(x1)], [x1, arcY(x1) + 0.12], [x0, arcY(x0) + 0.12]]);
    ctx.fillStyle = shade(c, -0.3); ctx.fill(); ctx.stroke();
  }
  // front rail with posts
  ctx.strokeStyle = '#fff6e6'; ctx.lineWidth = lw * 3;
  ctx.beginPath(); for (let i = 0; i <= 20; i++) { const x = -L / 2 + (i / 20) * L; ctx.lineTo(x, arcY(x) - 0.62); } ctx.stroke();
  ctx.strokeStyle = '#77708a'; ctx.lineWidth = lw * 0.8; ctx.stroke();
  for (let i = 0; i <= 6; i++) {
    const x = -L / 2 + (i / 6) * L;
    ctx.beginPath(); roundRect(ctx, x - 0.05, arcY(x) - 0.66, 0.1, 0.66, 0.03); ctx.fillStyle = RAINBOW[i % RAINBOW.length]; ctx.fill(); ctx.strokeStyle = ink(RAINBOW[i % RAINBOW.length], 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, arcY(x) - 0.7, 0.07, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
  }
}

// ------------------------------------------------------------------------------------------ gnome
export function paintGnome(ctx, px) {
  const lw = LW(px, 1.5);
  shadow(ctx, 0.36, 0.12, 0.08, 0.4);
  // boots
  for (const x of [-0.1, 0.1]) { ctx.beginPath(); ctx.ellipse(x, -0.03, 0.09, 0.05, 0, 0, TAU); ctx.fillStyle = '#6b4526'; ctx.fill(); ctx.strokeStyle = '#3b2412'; ctx.lineWidth = lw; ctx.stroke(); }
  // coat
  ctx.beginPath(); ctx.moveTo(-0.2, -0.05); ctx.quadraticCurveTo(-0.24, -0.35, -0.12, -0.46); ctx.lineTo(0.12, -0.46); ctx.quadraticCurveTo(0.24, -0.35, 0.2, -0.05); ctx.closePath();
  ctx.fillStyle = grad(ctx, -0.2, 0, 0.2, 0, '#3f7fd6'); ctx.fill(); ctx.strokeStyle = '#1c3a70'; ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = '#6b4526'; ctx.fillRect(-0.2, -0.2, 0.4, 0.05);
  ctx.fillStyle = '#ffd24a'; ctx.fillRect(-0.03, -0.21, 0.06, 0.07);
  // beard + face
  ctx.beginPath(); ctx.arc(0, -0.5, 0.12, 0, TAU); ctx.fillStyle = '#ffd7bd'; ctx.fill(); ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = lw * 0.8; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.13, -0.5); ctx.quadraticCurveTo(-0.16, -0.26, 0, -0.2); ctx.quadraticCurveTo(0.16, -0.26, 0.13, -0.5); ctx.quadraticCurveTo(0, -0.42, -0.13, -0.5); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#9a9aaa'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -0.49, 0.045, 0, TAU); ctx.fillStyle = '#ff9a8a'; ctx.fill();
  ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(-0.05, -0.55, 0.018, 0, TAU); ctx.arc(0.05, -0.55, 0.018, 0, TAU); ctx.fill();
  // hat
  ctx.beginPath(); ctx.moveTo(-0.15, -0.56); ctx.quadraticCurveTo(-0.08, -0.85, 0.05, -1.02); ctx.quadraticCurveTo(0.1, -0.8, 0.15, -0.56); ctx.quadraticCurveTo(0, -0.62, -0.15, -0.56); ctx.closePath();
  ctx.fillStyle = grad(ctx, -0.15, 0, 0.15, 0, '#e8403c'); ctx.fill(); ctx.strokeStyle = '#6a1418'; ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-0.06, -0.72, 0.025, 0.08, 0.3, 0, TAU); ctx.fill();
  // little shovel
  ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = lw * 1.4; ctx.beginPath(); ctx.moveTo(0.2, -0.35); ctx.lineTo(0.32, -0.05); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0.33, -0.02, 0.05, 0.07, -0.3, 0, TAU); ctx.fillStyle = '#b8c0c8'; ctx.fill(); ctx.strokeStyle = '#4a5058'; ctx.lineWidth = lw * 0.7; ctx.stroke();
}

// ------------------------------------------------------------------------------------------ pond life
export function paintLilyPad(ctx, px, seed = 1, flower = null) {
  const R = rng(seed);
  const lw = LW(px, 1.2);
  const r = 0.3 + R() * 0.12, a0 = R() * TAU;
  ctx.beginPath(); ctx.ellipse(0.03, 0.03, r, r * SQ, 0, 0, TAU); ctx.fillStyle = 'rgba(10,50,70,0.25)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.ellipse(0, 0, r, r * SQ, 0, a0 + 0.25, a0 + TAU - 0.25); ctx.closePath();
  const g = ctx.createLinearGradient(-r, -r * SQ, r, r * SQ); g.addColorStop(0, '#8fd46a'); g.addColorStop(1, '#3f9a3e');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#27632a'; ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = 'rgba(200,250,170,0.6)'; ctx.lineWidth = lw * 0.6;
  for (let k = 1; k < 6; k++) { const a = a0 + 0.25 + (k / 6) * (TAU - 0.5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * SQ * 0.85); ctx.stroke(); }
  if (flower) {
    for (let layer = 0; layer < 2; layer++) {
      const n = 7, L = layer ? 0.12 : 0.18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + layer * 0.4;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * L * 0.6, -0.06 + Math.sin(a) * L * 0.35, L * 0.55, L * 0.22, a, 0, TAU);
        ctx.fillStyle = layer ? shade(flower, 0.3) : flower; ctx.fill(); ctx.strokeStyle = ink(flower, 0.55); ctx.lineWidth = lw * 0.6; ctx.stroke();
      }
    }
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, -0.07, 0.045, 0, TAU); ctx.fill();
  }
}

export function paintKoi(ctx, px, v = 0) {
  const lw = LW(px, 1.2);
  const base = v % 2 ? '#ffffff' : '#ff7a2a', spot = v % 2 ? '#ff5a1a' : '#ffffff';
  ctx.beginPath(); ctx.moveTo(0.45, 0); ctx.bezierCurveTo(0.35, -0.16, -0.15, -0.16, -0.32, 0); ctx.bezierCurveTo(-0.15, 0.16, 0.35, 0.16, 0.45, 0); ctx.closePath();
  ctx.fillStyle = base; ctx.fill(); ctx.strokeStyle = 'rgba(120,40,0,0.5)'; ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = spot; ctx.beginPath(); ctx.ellipse(0.1, -0.02, 0.1, 0.06, 0.3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-0.14, 0.02, 0.06, 0.04, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-0.3, 0); ctx.lineTo(-0.5, -0.14); ctx.quadraticCurveTo(-0.44, 0, -0.5, 0.14); ctx.closePath();
  ctx.fillStyle = rgba(base, 0.85); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(0.36, -0.04, 0.02, 0, TAU); ctx.fill();
}
