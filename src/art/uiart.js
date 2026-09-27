// Painted UI art: HUD / menu icons, visitor portraits and decoration thumbnails, drawn with the same style as
// the garden (ink outlines, gradients, highlights) and handed to the HTML UI as cached data-URL images.
import { makeCanvas, softEllipse, roundRect, poly } from './paint.js';
import { shade, ink, rgba } from './color.js';

const TAU = Math.PI * 2;
const cache = new Map();
const DPR = () => Math.min(2, Math.max(1, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)));

// paint(ctx, lw) in a [-1, 1] box
function render(key, size, paint, pad = 1.12) {
  const px = Math.max(8, Math.round(size * DPR()));
  const k = key + '@' + px;
  let url = cache.get(k);
  if (url) return url;
  const c = makeCanvas(px, px);
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const u = px / 2 / pad;
  ctx.translate(px / 2, px / 2); ctx.scale(u, u);
  paint(ctx, Math.max(0.075, 1.5 / u));
  url = c.toDataURL('image/png');
  cache.set(k, url);
  return url;
}

const lg = (ctx, x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([t, c]) => g.addColorStop(t, c)); return g; };
const rg = (ctx, x, y, r, stops) => { const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r); stops.forEach(([t, c]) => g.addColorStop(t, c)); return g; };
function shine(ctx, x, y, rx, ry, rot = -0.5, a = 0.6) { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); }
function out(ctx, color, lw) { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); }
function star(ctx, x, y, r, n = 5, inner = 0.5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, rr = i % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}
function flower5(ctx, x, y, r, c, lw) {
  ctx.fillStyle = c;
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.48, 0, TAU); ctx.fill(); out(ctx, ink(c, 0.6), lw * 0.6); }
  ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(x, y, r * 0.36, 0, TAU); ctx.fill(); out(ctx, '#9a6a10', lw * 0.5);
}

// ------------------------------------------------------------------------------------------ icons
const ICONS = {
  coin(ctx, lw) {
    softEllipse(ctx, 0.05, 0.9, 0.8, 0.14, '#3a2a10', 0.35);
    ctx.beginPath(); ctx.ellipse(0, 0.08, 0.86, 0.86, 0, 0, TAU); ctx.fillStyle = '#c47d10'; ctx.fill(); out(ctx, '#6e3f06', lw);
    ctx.beginPath(); ctx.arc(0, -0.02, 0.86, 0, TAU);
    ctx.fillStyle = rg(ctx, 0, -0.02, 0.9, [[0, '#fff3a8'], [0.45, '#ffd23f'], [1, '#e09a14']]); ctx.fill(); out(ctx, '#6e3f06', lw);
    ctx.beginPath(); ctx.arc(0, -0.02, 0.62, 0, TAU); out(ctx, 'rgba(160,90,10,0.55)', lw * 0.8);
    // embossed flower
    ctx.fillStyle = '#f0b02a';
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; ctx.beginPath(); ctx.arc(Math.cos(a) * 0.24, -0.02 + Math.sin(a) * 0.24, 0.17, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(140,80,5,0.6)'; ctx.lineWidth = lw * 0.6;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; ctx.beginPath(); ctx.arc(Math.cos(a) * 0.24, -0.02 + Math.sin(a) * 0.24, 0.17, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = '#fff1a0'; ctx.beginPath(); ctx.arc(0, -0.02, 0.12, 0, TAU); ctx.fill();
    shine(ctx, -0.36, -0.45, 0.2, 0.1, -0.7, 0.8);
  },
  basket(ctx, lw) {
    softEllipse(ctx, 0.05, 0.86, 0.85, 0.14, '#3a2a10', 0.35);
    // handle
    ctx.beginPath(); ctx.arc(0, -0.05, 0.62, Math.PI * 1.05, Math.PI * 1.95); ctx.strokeStyle = '#6b3f1f'; ctx.lineWidth = lw * 4; ctx.stroke(); ctx.strokeStyle = '#c98a4a'; ctx.lineWidth = lw * 2.2; ctx.stroke();
    // flowers peeking out
    flower5(ctx, -0.36, -0.22, 0.26, '#ff6f9c', lw); flower5(ctx, 0.3, -0.28, 0.28, '#ffd23f', lw); flower5(ctx, -0.02, -0.4, 0.24, '#8f6bff', lw);
    ctx.fillStyle = '#5aaa45'; ctx.beginPath(); ctx.ellipse(0.55, -0.12, 0.18, 0.08, -0.5, 0, TAU); ctx.fill(); out(ctx, '#2c6325', lw * 0.6);
    // body
    ctx.beginPath(); ctx.moveTo(-0.86, -0.08); ctx.lineTo(0.86, -0.08); ctx.lineTo(0.64, 0.78); ctx.quadraticCurveTo(0, 0.9, -0.64, 0.78); ctx.closePath();
    ctx.fillStyle = lg(ctx, 0, -0.1, 0, 0.85, [[0, '#f0b566'], [1, '#b8743a']]); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(110,60,20,0.55)'; ctx.lineWidth = lw * 0.8;
    for (let y = 0.1; y < 0.85; y += 0.2) { ctx.beginPath(); ctx.moveTo(-0.9, y); ctx.quadraticCurveTo(0, y + 0.06, 0.9, y); ctx.stroke(); }
    for (let x = -0.7; x < 0.8; x += 0.23) { ctx.beginPath(); ctx.moveTo(x, -0.1); ctx.lineTo(x * 0.8, 0.85); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-0.86, -0.08); ctx.lineTo(0.86, -0.08); ctx.lineTo(0.64, 0.78); ctx.quadraticCurveTo(0, 0.9, -0.64, 0.78); ctx.closePath(); out(ctx, '#6b3f1f', lw);
    ctx.beginPath(); roundRect(ctx, -0.92, -0.18, 1.84, 0.2, 0.08); ctx.fillStyle = '#d99a55'; ctx.fill(); out(ctx, '#6b3f1f', lw);
    shine(ctx, -0.5, -0.1, 0.25, 0.04, 0, 0.5);
  },
  book(ctx, lw) {
    softEllipse(ctx, 0.05, 0.88, 0.8, 0.12, '#3a2a10', 0.35);
    ctx.beginPath(); roundRect(ctx, -0.72, -0.8, 1.5, 1.6, 0.12); ctx.fillStyle = '#fff4dc'; ctx.fill(); out(ctx, '#6b3f1f', lw);
    ctx.beginPath(); roundRect(ctx, -0.8, -0.86, 1.46, 1.6, 0.14);
    ctx.fillStyle = lg(ctx, -0.8, -0.8, 0.7, 0.8, [[0, '#7fd06a'], [1, '#3f9a3e']]); ctx.fill(); out(ctx, '#23562a', lw);
    ctx.beginPath(); roundRect(ctx, -0.8, -0.86, 0.26, 1.6, 0.1); ctx.fillStyle = '#2f7a34'; ctx.fill(); out(ctx, '#23562a', lw);
    // label with a flower
    ctx.beginPath(); roundRect(ctx, -0.36, -0.5, 0.86, 0.86, 0.16); ctx.fillStyle = '#fff8e8'; ctx.fill(); out(ctx, '#23562a', lw * 0.8);
    flower5(ctx, 0.07, -0.07, 0.3, '#ff6f9c', lw);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(0.4, -0.86); ctx.lineTo(0.56, -0.86); ctx.lineTo(0.56, -0.5); ctx.lineTo(0.48, -0.58); ctx.lineTo(0.4, -0.5); ctx.closePath(); ctx.fill(); out(ctx, '#8a5a10', lw * 0.7);
    shine(ctx, -0.2, -0.72, 0.28, 0.05, 0, 0.45);
  },
  gear(ctx, lw) {
    const teeth = 8;
    ctx.beginPath();
    for (let i = 0; i < teeth * 4; i++) {
      const a = (i / (teeth * 4)) * TAU, r = i % 4 < 2 ? 0.9 : 0.68;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = rg(ctx, 0, 0, 0.95, [[0, '#f4f7ff'], [0.6, '#b9c3d6'], [1, '#8a96ad']]); ctx.fill(); out(ctx, '#3b4560', lw);
    ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, TAU); ctx.fillStyle = '#5a6682'; ctx.fill(); out(ctx, '#3b4560', lw);
    shine(ctx, -0.35, -0.42, 0.2, 0.08, -0.7, 0.7);
  },
  can(ctx, lw) {
    softEllipse(ctx, 0.05, 0.88, 0.8, 0.13, '#10304a', 0.35);
    // spout
    ctx.beginPath(); ctx.moveTo(0.35, 0.05); ctx.lineTo(0.88, -0.5); ctx.lineTo(0.96, -0.42); ctx.lineTo(0.45, 0.25); ctx.closePath();
    ctx.fillStyle = '#4aa0d0'; ctx.fill(); out(ctx, '#1b4f74', lw);
    ctx.beginPath(); ctx.ellipse(0.94, -0.49, 0.13, 0.08, -0.8, 0, TAU); ctx.fillStyle = '#8fd0f0'; ctx.fill(); out(ctx, '#1b4f74', lw);
    // handle
    ctx.beginPath(); ctx.arc(-0.12, -0.35, 0.44, Math.PI * 1.1, Math.PI * 1.95); ctx.strokeStyle = '#1b4f74'; ctx.lineWidth = lw * 3.4; ctx.stroke(); ctx.strokeStyle = '#5ab0d8'; ctx.lineWidth = lw * 1.8; ctx.stroke();
    // body
    ctx.beginPath(); roundRect(ctx, -0.66, -0.3, 1.06, 1.1, 0.16);
    ctx.fillStyle = lg(ctx, -0.66, 0, 0.4, 0, [[0, '#9fdcf8'], [0.45, '#5ab0d8'], [1, '#2f7fb0']]); ctx.fill(); out(ctx, '#1b4f74', lw);
    ctx.beginPath(); ctx.ellipse(-0.13, -0.3, 0.53, 0.14, 0, 0, TAU); ctx.fillStyle = '#7cc6ea'; ctx.fill(); out(ctx, '#1b4f74', lw);
    // water drops
    ctx.fillStyle = '#bff0ff';
    for (const [x, y] of [[0.98, -0.25], [0.86, -0.08]]) { ctx.beginPath(); ctx.arc(x, y, 0.06, 0, TAU); ctx.fill(); out(ctx, '#2f7fb0', lw * 0.5); }
    shine(ctx, -0.45, 0.15, 0.07, 0.3, 0, 0.6);
    flower5(ctx, -0.13, 0.28, 0.2, '#ff8fb8', lw);
  },
  shovel(ctx, lw) {
    softEllipse(ctx, 0.05, 0.9, 0.7, 0.12, '#3a2a10', 0.3);
    ctx.save(); ctx.rotate(0.6);
    // handle
    ctx.beginPath(); roundRect(ctx, -0.1, -1.0, 0.2, 0.9, 0.08); ctx.fillStyle = lg(ctx, -0.1, 0, 0.1, 0, [[0, '#e0a868'], [1, '#9a6035']]); ctx.fill(); out(ctx, '#5a3318', lw);
    ctx.beginPath(); roundRect(ctx, -0.2, -1.08, 0.4, 0.2, 0.08); ctx.fillStyle = '#ff6f7a'; ctx.fill(); out(ctx, '#8a2a3a', lw);
    // blade
    ctx.beginPath(); ctx.moveTo(-0.28, -0.12); ctx.lineTo(0.28, -0.12); ctx.quadraticCurveTo(0.34, 0.5, 0, 0.95); ctx.quadraticCurveTo(-0.34, 0.5, -0.28, -0.12); ctx.closePath();
    ctx.fillStyle = lg(ctx, -0.3, 0, 0.3, 0, [[0, '#eef3f8'], [0.5, '#c2ccd6'], [1, '#8a96a4']]); ctx.fill(); out(ctx, '#4a5360', lw);
    ctx.fillStyle = '#6b4a30'; ctx.beginPath(); ctx.moveTo(-0.18, 0.5); ctx.quadraticCurveTo(0, 0.62, 0.18, 0.5); ctx.quadraticCurveTo(0.12, 0.8, 0, 0.9); ctx.quadraticCurveTo(-0.12, 0.8, -0.18, 0.5); ctx.fill();
    shine(ctx, -0.12, 0.1, 0.05, 0.22, 0, 0.7);
    ctx.restore();
  },
  gift(ctx, lw) {
    softEllipse(ctx, 0.05, 0.9, 0.8, 0.12, '#3a2a10', 0.35);
    ctx.beginPath(); roundRect(ctx, -0.72, -0.2, 1.44, 1.0, 0.1); ctx.fillStyle = lg(ctx, 0, -0.2, 0, 0.8, [[0, '#ff9ec0'], [1, '#e0507e']]); ctx.fill(); out(ctx, '#7a1f44', lw);
    ctx.beginPath(); roundRect(ctx, -0.82, -0.42, 1.64, 0.3, 0.08); ctx.fillStyle = '#ffb3cf'; ctx.fill(); out(ctx, '#7a1f44', lw);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-0.12, -0.42, 0.24, 1.22); ctx.strokeStyle = '#9a6a10'; ctx.lineWidth = lw * 0.7; ctx.strokeRect(-0.12, -0.42, 0.24, 1.22);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -0.44); ctx.bezierCurveTo(d * 0.2, -0.95, d * 0.72, -0.9, d * 0.5, -0.52); ctx.quadraticCurveTo(d * 0.3, -0.42, 0, -0.44); ctx.fillStyle = '#ffd23f'; ctx.fill(); out(ctx, '#9a6a10', lw * 0.8); }
    shine(ctx, -0.45, -0.05, 0.12, 0.2, 0, 0.45);
  },
  trophy(ctx, lw) {
    softEllipse(ctx, 0.05, 0.92, 0.7, 0.12, '#3a2a10', 0.35);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * 0.52, -0.38, 0.26, d < 0 ? Math.PI * 0.5 : Math.PI * 1.5, d < 0 ? Math.PI * 1.5 : Math.PI * 0.5, false); ctx.strokeStyle = '#8a5a08'; ctx.lineWidth = lw * 3; ctx.stroke(); ctx.strokeStyle = '#ffc93a'; ctx.lineWidth = lw * 1.5; ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-0.6, -0.8); ctx.lineTo(0.6, -0.8); ctx.quadraticCurveTo(0.62, 0.05, 0, 0.22); ctx.quadraticCurveTo(-0.62, 0.05, -0.6, -0.8); ctx.closePath();
    ctx.fillStyle = lg(ctx, -0.6, 0, 0.6, 0, [[0, '#fff3a8'], [0.4, '#ffd23f'], [1, '#d08a10']]); ctx.fill(); out(ctx, '#7a4a05', lw);
    ctx.beginPath(); roundRect(ctx, -0.12, 0.2, 0.24, 0.35, 0.04); ctx.fillStyle = '#e0a020'; ctx.fill(); out(ctx, '#7a4a05', lw);
    ctx.beginPath(); roundRect(ctx, -0.45, 0.52, 0.9, 0.32, 0.08); ctx.fillStyle = '#8a5a3a'; ctx.fill(); out(ctx, '#4a2a14', lw);
    star(ctx, 0, -0.38, 0.22); ctx.fillStyle = '#fff6c4'; ctx.fill();
    shine(ctx, -0.32, -0.55, 0.08, 0.18, 0, 0.7);
  },
  star(ctx, lw) {
    star(ctx, 0, 0.05, 0.95, 5, 0.5);
    ctx.fillStyle = rg(ctx, 0, 0.05, 1, [[0, '#fff6b0'], [0.5, '#ffd23f'], [1, '#f0a818']]); ctx.fill(); out(ctx, '#8a5a08', lw * 1.1);
    shine(ctx, -0.22, -0.22, 0.14, 0.08, -0.6, 0.8);
  },
  bee(ctx, lw) {
    for (const [x, r] of [[-0.2, -0.5], [0.22, 0.4]]) { ctx.beginPath(); ctx.ellipse(x, -0.55, 0.28, 0.4, r, 0, TAU); ctx.fillStyle = 'rgba(235,248,255,0.95)'; ctx.fill(); out(ctx, '#4a7da0', lw * 0.8); }
    ctx.beginPath(); ctx.ellipse(0, 0.12, 0.8, 0.62, 0, 0, TAU);
    ctx.fillStyle = rg(ctx, 0, 0.12, 0.85, [[0, '#fff09a'], [0.5, '#ffcd2a'], [1, '#e08a0a']]); ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#3a2412';
    for (const x of [-0.22, -0.62]) { ctx.beginPath(); ctx.ellipse(x, 0.12, 0.13, 0.8, 0.1, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0.12, 0.8, 0.62, 0, 0, TAU); out(ctx, '#4a2a10', lw);
    ctx.fillStyle = '#1e140c'; ctx.beginPath(); ctx.ellipse(0.42, 0.02, 0.12, 0.16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0.45, -0.04, 0.05, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,110,140,0.6)'; ctx.beginPath(); ctx.ellipse(0.55, 0.26, 0.1, 0.06, 0, 0, TAU); ctx.fill();
  },
  seed(ctx, lw) {
    softEllipse(ctx, 0.05, 0.88, 0.5, 0.12, '#3a2a10', 0.35);
    ctx.beginPath(); ctx.moveTo(0, -0.62); ctx.bezierCurveTo(0.6, -0.4, 0.58, 0.72, 0, 0.84); ctx.bezierCurveTo(-0.58, 0.72, -0.6, -0.4, 0, -0.62); ctx.closePath();
    ctx.fillStyle = lg(ctx, -0.5, -0.5, 0.5, 0.8, [[0, '#f0bf7a'], [1, '#9a5f2a']]); ctx.fill(); out(ctx, '#5a3318', lw);
    ctx.strokeStyle = 'rgba(90,50,20,0.5)'; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(0, -0.5); ctx.quadraticCurveTo(0.15, 0.1, 0, 0.75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -0.6); ctx.quadraticCurveTo(0.3, -1.0, 0.7, -0.95); ctx.quadraticCurveTo(0.5, -0.6, 0, -0.6); ctx.fillStyle = '#6cc458'; ctx.fill(); out(ctx, '#2c6325', lw * 0.8);
    shine(ctx, -0.22, -0.1, 0.08, 0.2, 0, 0.6);
  },
  sun(ctx, lw) {
    ctx.fillStyle = '#ffb62e';
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-0.14, -0.62); ctx.lineTo(0, -0.95); ctx.lineTo(0.14, -0.62); ctx.closePath(); ctx.fill(); out(ctx, '#a0580a', lw * 0.7); ctx.restore(); }
    ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, TAU); ctx.fillStyle = rg(ctx, 0, 0, 0.65, [[0, '#fff6b0'], [0.6, '#ffd23f'], [1, '#f5a51a']]); ctx.fill(); out(ctx, '#a0580a', lw);
    shine(ctx, -0.2, -0.22, 0.15, 0.09, -0.6, 0.7);
  },
  rain(ctx, lw) {
    ctx.fillStyle = '#5ab4f0';
    for (const [x, y] of [[-0.4, 0.62], [0.05, 0.75], [0.48, 0.6]]) { ctx.beginPath(); ctx.moveTo(x, y - 0.26); ctx.quadraticCurveTo(x + 0.14, y, x, y + 0.1); ctx.quadraticCurveTo(x - 0.14, y, x, y - 0.26); ctx.fill(); out(ctx, '#1b5f90', lw * 0.7); }
    ctx.beginPath(); ctx.arc(-0.35, -0.05, 0.38, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(0.05, -0.32, 0.46, Math.PI, Math.PI * 1.95); ctx.arc(0.5, 0.0, 0.33, Math.PI * 1.5, Math.PI * 0.5); ctx.closePath();
    ctx.fillStyle = lg(ctx, 0, -0.8, 0, 0.35, [[0, '#ffffff'], [1, '#c6d8e8']]); ctx.fill(); out(ctx, '#4a6680', lw);
  },
  golden(ctx, lw) {
    ctx.beginPath(); ctx.rect(-1, -1, 2, 1.25); ctx.save(); ctx.clip();
    ctx.fillStyle = '#ff9f2a';
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; ctx.save(); ctx.translate(0, 0.25); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.moveTo(-0.1, -0.62); ctx.lineTo(0, -0.92); ctx.lineTo(0.1, -0.62); ctx.closePath(); ctx.fill(); out(ctx, '#9a4a0a', lw * 0.6); ctx.restore(); }
    ctx.beginPath(); ctx.arc(0, 0.25, 0.55, 0, TAU); ctx.fillStyle = rg(ctx, 0, 0.25, 0.6, [[0, '#fff0a0'], [0.6, '#ffb63a'], [1, '#f07a1a']]); ctx.fill(); out(ctx, '#9a4a0a', lw);
    ctx.restore();
    ctx.beginPath(); roundRect(ctx, -0.95, 0.25, 1.9, 0.18, 0.08); ctx.fillStyle = '#e07a2a'; ctx.fill(); out(ctx, '#7a3a0a', lw);
    ctx.beginPath(); roundRect(ctx, -0.6, 0.55, 1.2, 0.14, 0.07); ctx.fillStyle = '#f0a050'; ctx.fill(); out(ctx, '#7a3a0a', lw * 0.8);
  },
  night(ctx, lw) {
    ctx.beginPath(); ctx.arc(-0.05, 0.05, 0.78, 0, TAU);
    ctx.fillStyle = rg(ctx, -0.2, 0.1, 0.8, [[0, '#fffbd0'], [1, '#f2d060']]); ctx.fill(); out(ctx, '#8a6a1a', lw);
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(0.34, -0.28, 0.62 + lw / 2, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(-0.05, 0.05, 0.78, 0, TAU); ctx.clip();
    ctx.beginPath(); ctx.arc(0.34, -0.28, 0.62, 0, TAU); out(ctx, '#8a6a1a', lw * 2); ctx.restore();
    star(ctx, 0.62, 0.45, 0.2, 4, 0.35); ctx.fillStyle = '#fff6c4'; ctx.fill(); out(ctx, '#8a6a1a', lw * 0.6);
    star(ctx, 0.75, -0.75, 0.13, 4, 0.35); ctx.fillStyle = '#fff6c4'; ctx.fill();
  },
  rainbow(ctx, lw) {
    const cols = ['#ff5f6d', '#ff9f43', '#ffd93d', '#6bd66b', '#4fb5ff', '#8f6bff'];
    for (let i = 0; i < cols.length; i++) { ctx.beginPath(); ctx.arc(0, 0.45, 0.92 - i * 0.12, Math.PI, 0); ctx.strokeStyle = cols[i]; ctx.lineWidth = 0.13; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0.45, 0.99, Math.PI, 0); ctx.arc(0, 0.45, 0.25, 0, Math.PI, true); ctx.closePath(); ctx.strokeStyle = 'rgba(80,60,90,0.8)'; ctx.lineWidth = lw * 0.8; ctx.stroke();
    for (const x of [-0.72, 0.72]) { ctx.beginPath(); ctx.arc(x, 0.5, 0.26, 0, TAU); ctx.arc(x + (x < 0 ? 0.22 : -0.22), 0.55, 0.2, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); out(ctx, '#7a8aa0', lw * 0.7); }
  },
  target(ctx, lw) {
    ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); out(ctx, '#a02a4a', lw);
    ctx.beginPath(); ctx.arc(0, 0, 0.62, 0, TAU); ctx.fillStyle = '#ff6f8f'; ctx.fill(); out(ctx, '#a02a4a', lw * 0.8);
    ctx.beginPath(); ctx.arc(0, 0, 0.34, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); out(ctx, '#a02a4a', lw * 0.8);
    ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, TAU); ctx.fillStyle = '#e0406a'; ctx.fill();
    shine(ctx, -0.35, -0.45, 0.18, 0.08, -0.6, 0.6);
  },
  lock(ctx, lw) {
    ctx.beginPath(); ctx.arc(0, -0.2, 0.42, Math.PI, 0); ctx.strokeStyle = '#6a4a14'; ctx.lineWidth = lw * 3.5; ctx.stroke(); ctx.strokeStyle = '#c0c8d2'; ctx.lineWidth = lw * 1.8; ctx.stroke();
    ctx.beginPath(); roundRect(ctx, -0.66, -0.2, 1.32, 1.0, 0.16); ctx.fillStyle = lg(ctx, 0, -0.2, 0, 0.8, [[0, '#ffe07a'], [1, '#e0a020']]); ctx.fill(); out(ctx, '#6a4a14', lw);
    ctx.beginPath(); ctx.arc(0, 0.2, 0.12, 0, TAU); ctx.moveTo(-0.06, 0.25); ctx.lineTo(-0.08, 0.5); ctx.lineTo(0.08, 0.5); ctx.lineTo(0.06, 0.25); ctx.fillStyle = '#6a4a14'; ctx.fill();
  },
  clock(ctx, lw) {
    ctx.beginPath(); ctx.arc(0, 0, 0.88, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); out(ctx, '#4a5570', lw * 1.2);
    ctx.strokeStyle = '#4a5570'; ctx.lineWidth = lw * 1.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -0.55); ctx.moveTo(0, 0); ctx.lineTo(0.38, 0.2); ctx.stroke();
  },
  sound(ctx, lw) {
    ctx.beginPath(); ctx.moveTo(-0.85, -0.3); ctx.lineTo(-0.45, -0.3); ctx.lineTo(0.1, -0.78); ctx.lineTo(0.1, 0.78); ctx.lineTo(-0.45, 0.3); ctx.lineTo(-0.85, 0.3); ctx.closePath();
    ctx.fillStyle = lg(ctx, -0.8, -0.8, 0.2, 0.8, [[0, '#8fd0ff'], [1, '#3a86d0']]); ctx.fill(); out(ctx, '#1f4a7a', lw);
    ctx.strokeStyle = '#1f4a7a'; ctx.lineWidth = lw * 1.6;
    for (const r of [0.38, 0.7]) { ctx.beginPath(); ctx.arc(0.1, 0, r, -0.9, 0.9); ctx.stroke(); }
    shine(ctx, -0.55, -0.12, 0.12, 0.06, 0, 0.6);
  },
  music(ctx, lw) {
    ctx.strokeStyle = '#3a2a5a'; ctx.lineWidth = lw * 1.8;
    ctx.beginPath(); ctx.moveTo(-0.3, 0.55); ctx.lineTo(-0.3, -0.6); ctx.lineTo(0.62, -0.82); ctx.lineTo(0.62, 0.35); ctx.stroke();
    ctx.lineWidth = lw * 3.2; ctx.beginPath(); ctx.moveTo(-0.3, -0.58); ctx.lineTo(0.62, -0.8); ctx.stroke();
    for (const [x, y, c] of [[-0.52, 0.6, '#ff6f9c'], [0.4, 0.4, '#8f6bff']]) { ctx.beginPath(); ctx.ellipse(x, y, 0.26, 0.2, -0.4, 0, TAU); ctx.fillStyle = c; ctx.fill(); out(ctx, '#3a2a5a', lw); shine(ctx, x - 0.08, y - 0.07, 0.07, 0.04, -0.4, 0.7); }
  },
  info(ctx, lw) {
    ctx.beginPath(); ctx.arc(0, 0, 0.88, 0, TAU); ctx.fillStyle = rg(ctx, 0, 0, 0.9, [[0, '#a8e0ff'], [1, '#3a9be0']]); ctx.fill(); out(ctx, '#1f4a7a', lw);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -0.42, 0.13, 0, TAU); ctx.fill();
    ctx.beginPath(); roundRect(ctx, -0.12, -0.18, 0.24, 0.72, 0.1); ctx.fill();
    shine(ctx, -0.4, -0.45, 0.16, 0.08, -0.6, 0.5);
  },
  // upgrades
  up_bees(ctx, lw) {
    ctx.save(); ctx.translate(-0.1, 0.15); ctx.scale(0.72, 0.72);
    for (let k = 0; k < 4; k++) { const w = 0.95 - k * 0.18, y = 0.7 - k * 0.38; ctx.beginPath(); roundRect(ctx, -w, y - 0.2, w * 2, 0.4, 0.2); ctx.fillStyle = lg(ctx, 0, y - 0.2, 0, y + 0.2, [[0, '#ffd67a'], [1, '#c98a2a']]); ctx.fill(); out(ctx, '#6e4514', lw * 1.3); }
    ctx.beginPath(); ctx.arc(0, 0.62, 0.16, Math.PI, 0); ctx.fillStyle = '#3a1f0c'; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(0.55, -0.55); ctx.scale(0.42, 0.42); ICONS.bee(ctx, lw * 2.2); ctx.restore();
  },
  up_fert(ctx, lw) {
    ctx.beginPath(); ctx.moveTo(-0.6, -0.55); ctx.lineTo(0.6, -0.55); ctx.lineTo(0.72, 0.85); ctx.lineTo(-0.72, 0.85); ctx.closePath();
    ctx.fillStyle = lg(ctx, 0, -0.5, 0, 0.85, [[0, '#e8c48a'], [1, '#b8864a']]); ctx.fill(); out(ctx, '#5a3a18', lw);
    ctx.beginPath(); ctx.moveTo(-0.6, -0.55); ctx.lineTo(-0.45, -0.85); ctx.lineTo(0.45, -0.85); ctx.lineTo(0.6, -0.55); ctx.closePath(); ctx.fillStyle = '#c99a5a'; ctx.fill(); out(ctx, '#5a3a18', lw);
    ctx.beginPath(); ctx.moveTo(0, 0.55); ctx.bezierCurveTo(-0.5, 0.3, -0.35, -0.2, 0, -0.25); ctx.bezierCurveTo(0.35, -0.2, 0.5, 0.3, 0, 0.55); ctx.fillStyle = '#6cc458'; ctx.fill(); out(ctx, '#2c6325', lw * 0.8);
    ctx.strokeStyle = '#2c6325'; ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(0, -0.15); ctx.stroke();
  },
  up_market(ctx, lw) {
    ctx.beginPath(); roundRect(ctx, -0.8, 0.0, 1.6, 0.85, 0.08); ctx.fillStyle = '#e7c08a'; ctx.fill(); out(ctx, '#6a4a24', lw);
    ctx.beginPath(); ctx.moveTo(-0.95, -0.1); ctx.lineTo(-0.7, -0.75); ctx.lineTo(0.7, -0.75); ctx.lineTo(0.95, -0.1); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#ff6f8f'; for (let i = -3; i < 4; i += 2) { ctx.beginPath(); ctx.moveTo(i * 0.2 - 0.1, -0.8); ctx.lineTo(i * 0.25 - 0.12, 0); ctx.lineTo(i * 0.25 + 0.12, 0); ctx.lineTo(i * 0.2 + 0.1, -0.8); ctx.fill(); } ctx.restore();
    ctx.beginPath(); ctx.moveTo(-0.95, -0.1); ctx.lineTo(-0.7, -0.75); ctx.lineTo(0.7, -0.75); ctx.lineTo(0.95, -0.1); ctx.closePath(); out(ctx, '#8a2a4a', lw);
    flower5(ctx, -0.35, 0.35, 0.22, '#8f6bff', lw); flower5(ctx, 0.3, 0.38, 0.22, '#ffd23f', lw);
  },
  up_wings(ctx, lw) {
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(d * 0.42, -0.25, 0.45, 0.62, d * 0.55, 0, TAU); ctx.fillStyle = 'rgba(225,245,255,0.95)'; ctx.fill(); out(ctx, '#3f7aa0', lw);
      ctx.beginPath(); ctx.ellipse(d * 0.35, 0.42, 0.3, 0.38, -d * 0.6, 0, TAU); ctx.fillStyle = 'rgba(200,232,255,0.95)'; ctx.fill(); out(ctx, '#3f7aa0', lw * 0.9);
    }
    ctx.beginPath(); ctx.ellipse(0, 0.05, 0.14, 0.5, 0, 0, TAU); ctx.fillStyle = '#ffcd2a'; ctx.fill(); out(ctx, '#4a2a10', lw);
    shine(ctx, -0.55, -0.45, 0.12, 0.2, 0.5, 0.8);
  },
  up_pouch(ctx, lw) {
    ctx.beginPath(); ctx.moveTo(-0.5, -0.35); ctx.bezierCurveTo(-1.0, 0.2, -0.9, 0.9, 0, 0.9); ctx.bezierCurveTo(0.9, 0.9, 1.0, 0.2, 0.5, -0.35); ctx.closePath();
    ctx.fillStyle = lg(ctx, -0.8, -0.3, 0.8, 0.9, [[0, '#e0a86a'], [1, '#9a6035']]); ctx.fill(); out(ctx, '#5a3318', lw);
    ctx.beginPath(); ctx.moveTo(-0.5, -0.35); ctx.quadraticCurveTo(0, -0.95, 0.5, -0.35); ctx.fillStyle = '#c98a5a'; ctx.fill(); out(ctx, '#5a3318', lw);
    ctx.strokeStyle = '#e0406a'; ctx.lineWidth = lw * 2.2; ctx.beginPath(); ctx.moveTo(-0.5, -0.32); ctx.quadraticCurveTo(0, -0.2, 0.5, -0.32); ctx.stroke();
    ctx.save(); ctx.translate(0, 0.35); ctx.scale(0.35, 0.35); ICONS.seed(ctx, lw * 2.6); ctx.restore();
  },
  up_can(ctx, lw) { ICONS.can(ctx, lw); },
  up_gnome(ctx, lw) {
    ctx.beginPath(); ctx.moveTo(-0.45, -0.1); ctx.quadraticCurveTo(-0.2, -0.8, 0.15, -1.0); ctx.quadraticCurveTo(0.3, -0.5, 0.45, -0.1); ctx.closePath(); ctx.fillStyle = '#e8403c'; ctx.fill(); out(ctx, '#6a1418', lw);
    ctx.beginPath(); ctx.arc(0, 0.05, 0.36, 0, TAU); ctx.fillStyle = '#ffd7bd'; ctx.fill(); out(ctx, '#8a5a3a', lw);
    ctx.beginPath(); ctx.moveTo(-0.38, 0.05); ctx.quadraticCurveTo(-0.45, 0.75, 0, 0.85); ctx.quadraticCurveTo(0.45, 0.75, 0.38, 0.05); ctx.quadraticCurveTo(0, 0.3, -0.38, 0.05); ctx.fillStyle = '#ffffff'; ctx.fill(); out(ctx, '#9a9aaa', lw);
    ctx.beginPath(); ctx.arc(0, 0.12, 0.1, 0, TAU); ctx.fillStyle = '#ff9a8a'; ctx.fill();
    ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(-0.14, -0.02, 0.045, 0, TAU); ctx.arc(0.14, -0.02, 0.045, 0, TAU); ctx.fill();
  },
};

export const hasPainted = (name) => !!ICONS[name];
export function iconURL(name, size = 22) {
  const p = ICONS[name];
  return p ? render('i.' + name, size, p) : null;
}

// ------------------------------------------------------------------------------------------ visitors
function face(ctx, lw, o) {
  // shared cute face: eyes with highlights, blush, little smile
  const { ex = 0.3, ey = -0.05, er = 0.1, mouth = 0.28, nose = null, blush = 'rgba(255,120,150,0.55)' } = o;
  ctx.fillStyle = '#231510';
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * ex, ey, er, er * 1.25, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#fff';
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * ex + er * 0.3, ey - er * 0.45, er * 0.38, 0, TAU); ctx.fill(); }
  ctx.fillStyle = blush;
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * (ex + 0.16), ey + 0.22, 0.12, 0.07, 0, 0, TAU); ctx.fill(); }
  if (nose) { ctx.fillStyle = nose; ctx.beginPath(); ctx.ellipse(0, ey + 0.15, 0.08, 0.06, 0, 0, TAU); ctx.fill(); }
  if (mouth > 50) return;
  ctx.strokeStyle = '#231510'; ctx.lineWidth = lw * 0.9;
  ctx.beginPath(); ctx.moveTo(-0.08, ey + mouth - 0.02); ctx.quadraticCurveTo(-0.04, ey + mouth + 0.06, 0, ey + mouth); ctx.quadraticCurveTo(0.04, ey + mouth + 0.06, 0.08, ey + mouth - 0.02); ctx.stroke();
}
function head(ctx, lw, c, inkC, r = 0.72, cx = 0, cy = 0.1, ry = r) {
  ctx.beginPath(); ctx.ellipse(cx, cy, r, ry, 0, 0, TAU);
  ctx.fillStyle = rg(ctx, cx, cy, r * 1.05, [[0, shade(c, 0.35)], [0.6, c], [1, shade(c, -0.25)]]); ctx.fill(); out(ctx, inkC, lw);
}
const VISITORS = {
  bunny(ctx, lw, c) {
    const k = ink(c, 0.62);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * 0.3, -0.68, 0.18, 0.45, d * 0.15, 0, TAU); ctx.fillStyle = c; ctx.fill(); out(ctx, k, lw); ctx.beginPath(); ctx.ellipse(d * 0.3, -0.64, 0.08, 0.32, d * 0.15, 0, TAU); ctx.fillStyle = '#ffb3c7'; ctx.fill(); }
    head(ctx, lw, c, k, 0.66, 0, 0.2);
    face(ctx, lw, { ex: 0.24, ey: 0.12, er: 0.09, mouth: 0.26, nose: '#ff8fb1' });
  },
  fox(ctx, lw, c) {
    const k = ink(c, 0.62);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 0.6, -0.05); ctx.lineTo(d * 0.55, -0.85); ctx.lineTo(d * 0.12, -0.45); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); out(ctx, k, lw); ctx.beginPath(); ctx.moveTo(d * 0.48, -0.25); ctx.lineTo(d * 0.5, -0.65); ctx.lineTo(d * 0.25, -0.42); ctx.closePath(); ctx.fillStyle = '#3a2418'; ctx.fill(); }
    head(ctx, lw, c, k, 0.72, 0, 0.12, 0.64);
    ctx.beginPath(); ctx.moveTo(-0.66, 0.2); ctx.quadraticCurveTo(-0.3, 0.8, 0, 0.74); ctx.quadraticCurveTo(0.3, 0.8, 0.66, 0.2); ctx.quadraticCurveTo(0.3, 0.45, 0, 0.35); ctx.quadraticCurveTo(-0.3, 0.45, -0.66, 0.2); ctx.fillStyle = '#fff5ea'; ctx.fill();
    face(ctx, lw, { ex: 0.28, ey: 0.02, er: 0.09, mouth: 0.33, nose: '#2a1810' });
  },
  hedgehog(ctx, lw, c) {
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) { const a = Math.PI * 0.95 + (i / 14) * Math.PI * 1.1, r = i % 2 ? 0.72 : 0.98; ctx.lineTo(Math.cos(a) * r, 0.15 + Math.sin(a) * r * 0.95); }
    ctx.closePath(); ctx.fillStyle = '#7a5638'; ctx.fill(); out(ctx, '#3e2a1a', lw);
    head(ctx, lw, c, ink(c, 0.62), 0.6, 0, 0.25, 0.55);
    face(ctx, lw, { ex: 0.22, ey: 0.18, er: 0.08, mouth: 0.24, nose: '#2a1810' });
  },
  frog(ctx, lw, c) {
    const k = ink(c, 0.62);
    head(ctx, lw, c, k, 0.82, 0, 0.22, 0.6);
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.arc(d * 0.38, -0.38, 0.3, 0, TAU); ctx.fillStyle = c; ctx.fill(); out(ctx, k, lw);
      ctx.beginPath(); ctx.arc(d * 0.38, -0.38, 0.2, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(d * 0.38, -0.36, 0.11, 0, TAU); ctx.fillStyle = '#231510'; ctx.fill();
      ctx.beginPath(); ctx.arc(d * 0.38 + 0.04, -0.41, 0.04, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,120,150,0.5)'; for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * 0.52, 0.28, 0.13, 0.07, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#231510'; ctx.lineWidth = lw * 0.9; ctx.beginPath(); ctx.moveTo(-0.32, 0.3); ctx.quadraticCurveTo(0, 0.5, 0.32, 0.3); ctx.stroke();
  },
  duck(ctx, lw, c) {
    const k = ink(c, 0.62);
    ctx.beginPath(); ctx.moveTo(-0.05, -0.62); ctx.quadraticCurveTo(-0.02, -0.95, 0.15, -0.9); ctx.quadraticCurveTo(0.05, -0.8, 0.08, -0.62); ctx.fillStyle = c; ctx.fill(); out(ctx, k, lw);
    head(ctx, lw, c, k, 0.7, 0, 0.12);
    face(ctx, lw, { ex: 0.28, ey: -0.02, er: 0.09, mouth: 99 });
    ctx.beginPath(); ctx.ellipse(0, 0.32, 0.3, 0.15, 0, 0, TAU); ctx.fillStyle = '#ff9f3d'; ctx.fill(); out(ctx, '#a85c14', lw);
    ctx.strokeStyle = '#a85c14'; ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(-0.26, 0.33); ctx.lineTo(0.26, 0.33); ctx.stroke();
  },
  cat(ctx, lw, c) {
    const k = ink(c, 0.62);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 0.62, -0.05); ctx.lineTo(d * 0.52, -0.82); ctx.lineTo(d * 0.1, -0.5); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); out(ctx, k, lw); ctx.beginPath(); ctx.moveTo(d * 0.46, -0.25); ctx.lineTo(d * 0.45, -0.62); ctx.lineTo(d * 0.24, -0.45); ctx.closePath(); ctx.fillStyle = '#ffb3c7'; ctx.fill(); }
    head(ctx, lw, c, k, 0.72, 0, 0.12, 0.64);
    face(ctx, lw, { ex: 0.27, ey: 0.05, er: 0.1, mouth: 0.28, nose: '#ff8fb1' });
    ctx.strokeStyle = rgba(k, 0.7); ctx.lineWidth = lw * 0.6;
    for (const d of [-1, 1]) for (const dy of [-0.04, 0.06]) { ctx.beginPath(); ctx.moveTo(d * 0.42, 0.28 + dy); ctx.lineTo(d * 0.78, 0.22 + dy * 1.8); ctx.stroke(); }
  },
  bear(ctx, lw, c) {
    const k = ink(c, 0.62);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * 0.5, -0.45, 0.24, 0, TAU); ctx.fillStyle = c; ctx.fill(); out(ctx, k, lw); ctx.beginPath(); ctx.arc(d * 0.5, -0.45, 0.12, 0, TAU); ctx.fillStyle = shade(c, -0.25); ctx.fill(); }
    head(ctx, lw, c, k, 0.72, 0, 0.12);
    ctx.beginPath(); ctx.ellipse(0, 0.36, 0.28, 0.2, 0, 0, TAU); ctx.fillStyle = '#ecd2b0'; ctx.fill();
    face(ctx, lw, { ex: 0.27, ey: 0.0, er: 0.09, mouth: 0.42, nose: '#3a2418' });
  },
  owl(ctx, lw, c) {
    const k = ink(c, 0.62);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 0.62, -0.3); ctx.lineTo(d * 0.5, -0.85); ctx.lineTo(d * 0.18, -0.55); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); out(ctx, k, lw); }
    head(ctx, lw, c, k, 0.74, 0, 0.1, 0.78);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * 0.3, -0.05, 0.26, 0, TAU); ctx.fillStyle = '#fff8e6'; ctx.fill(); out(ctx, k, lw * 0.7); }
    face(ctx, lw, { ex: 0.3, ey: -0.05, er: 0.11, mouth: 99 });
    ctx.beginPath(); ctx.moveTo(-0.1, 0.18); ctx.lineTo(0.1, 0.18); ctx.lineTo(0, 0.36); ctx.closePath(); ctx.fillStyle = '#ffb33a'; ctx.fill(); out(ctx, '#8a5a08', lw * 0.7);
  },
  queen(ctx, lw) {
    for (const [x, r] of [[-0.5, -0.5], [0.5, 0.5]]) { ctx.beginPath(); ctx.ellipse(x, -0.35, 0.32, 0.2, r, 0, TAU); ctx.fillStyle = 'rgba(232,246,255,0.95)'; ctx.fill(); out(ctx, '#6a8aa0', lw * 0.8); }
    head(ctx, lw, '#ffc928', '#5a3a10', 0.66, 0, 0.18);
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0.18, 0.66, 0, TAU); ctx.clip(); ctx.fillStyle = '#3a2412'; ctx.fillRect(-1, 0.52, 2, 0.14); ctx.restore();
    face(ctx, lw, { ex: 0.24, ey: 0.14, er: 0.09, mouth: 0.22 });
    ctx.beginPath(); ctx.moveTo(-0.34, -0.38); ctx.lineTo(-0.24, -0.72); ctx.lineTo(-0.1, -0.5); ctx.lineTo(0, -0.82); ctx.lineTo(0.1, -0.5); ctx.lineTo(0.24, -0.72); ctx.lineTo(0.34, -0.38); ctx.closePath();
    ctx.fillStyle = lg(ctx, 0, -0.8, 0, -0.38, [[0, '#fff3a0'], [1, '#e0a020']]); ctx.fill(); out(ctx, '#8a5a08', lw);
    ctx.fillStyle = '#ff6f9c'; ctx.beginPath(); ctx.arc(0, -0.5, 0.06, 0, TAU); ctx.fill();
  },
};
export function visitorURL(kind, color, size = 44) {
  const p = VISITORS[kind];
  if (!p) return null;
  return render(`v.${kind}.${color}`, size, (ctx, lw) => p(ctx, lw, color), 1.05);
}

// ------------------------------------------------------------------------------------------ decor thumbnails
// painter(ctx, px) draws a decoration with ground contact at (0,0); box = [w, h, ax, ay] in world units
export function decorURL(id, size, painter, box) {
  const [w, h, ax, ay] = box;
  const px = Math.max(8, Math.round(size * DPR()));
  const k = 'd.' + id + '@' + px;
  let url = cache.get(k);
  if (url) return url;
  const c = makeCanvas(px, px);
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const s = (px * 0.92) / Math.max(w, h);
  ctx.translate(px / 2 + (ax - w / 2) * s, px / 2 + (ay - h / 2) * s);
  ctx.scale(s, s);
  painter(ctx, 1 / s);
  url = c.toDataURL('image/png');
  cache.set(k, url);
  return url;
}
