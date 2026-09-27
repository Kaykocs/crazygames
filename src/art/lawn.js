// The lawn: painterly colour patches, thousands of fine grass strokes, stylised tufts, clover, tiny daisies and
// buttercups, pebbles and fallen petals. Painted in screen-space world units (X = x, Y = z·SQ) over any rectangle;
// every detail is seeded by its world cell so repainting at another zoom gives the same lawn.
import { hash2, rng, softEllipse } from './paint.js';
import { rgba, shade } from './color.js';

export const LAWN = {
  base: '#7cc458',
  patches: ['#96d36a', '#69b04b', '#a8cf62', '#6fbd63', '#8acb5f'],
  blades: ['#5a9f41', '#8ccf5e', '#b2e584'],
};

function cells(X0, Y0, X1, Y1, cw, ch, pad, fn) {
  const i0 = Math.floor((X0 - pad) / cw), i1 = Math.ceil((X1 + pad) / cw);
  const j0 = Math.floor((Y0 - pad) / ch), j1 = Math.ceil((Y1 + pad) / ch);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j);
}

// opts.density(X, Y) → 0..1 detail density (0 = keep clear, e.g. paths, pond); opts.wild(X, Y) → 0..1 (taller)
export function paintLawn(ctx, X0, Y0, X1, Y1, px, opts = {}) {
  const density = opts.density || (() => 1);
  const wild = opts.wild || (() => 0);
  ctx.fillStyle = opts.base || LAWN.base;
  ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);

  // 1. soft colour patches
  cells(X0, Y0, X1, Y1, 2.4, 1.8, 3.6, (i, j) => {
    for (let k = 0; k < 2; k++) {
      const h = hash2(i, j, 11 + k);
      const x = (i + hash2(i, j, 21 + k)) * 2.4, y = (j + hash2(i, j, 31 + k)) * 1.8;
      const r = 1.3 + h * 2.3;
      const c = LAWN.patches[Math.floor(hash2(i, j, 41 + k) * LAWN.patches.length)];
      softEllipse(ctx, x, y, r, r * 0.75, c, 0.32 + hash2(i, j, 51 + k) * 0.2, 0.1);
    }
  });

  if (opts.coarse) return;          // low-res overview: colour only

  // 2. fine grass strokes (batched per tone)
  const paths = LAWN.blades.map(() => new Path2D());
  cells(X0, Y0, X1, Y1, 0.17, 0.13, 0.2, (i, j) => {
    const d = density(i * 0.17, j * 0.13);
    if (hash2(i, j, 3) > 0.35 + 0.6 * d) return;
    const x = (i + hash2(i, j, 4)) * 0.17, y = (j + hash2(i, j, 5)) * 0.13;
    const n = 2 + Math.floor(hash2(i, j, 6) * 2);
    const tall = 1 + wild(x, y) * 1.6;
    for (let b = 0; b < n; b++) {
      const t = Math.floor(hash2(i, j, 7 + b) * 3);
      const len = (0.05 + hash2(i, j, 9 + b) * 0.06) * tall, lean = (hash2(i, j, 12 + b) - 0.5) * 0.06 * tall;
      const bx = x + (b - n / 2) * 0.018;
      const p = paths[t];
      p.moveTo(bx, y); p.quadraticCurveTo(bx + lean * 0.2, y - len * 0.6, bx + lean, y - len);
    }
  });
  ctx.lineCap = 'round';
  LAWN.blades.forEach((c, t) => { ctx.strokeStyle = rgba(c, t === 0 ? 0.55 : 0.6); ctx.lineWidth = Math.max(0.012, px * 1.25); ctx.stroke(paths[t]); });

  // 3. details, painted in y order per band so nearer things overlap farther ones
  const items = [];
  cells(X0, Y0, X1, Y1, 0.8, 0.62, 0.6, (i, j) => {
    const x = (i + hash2(i, j, 61)) * 0.8, y = (j + hash2(i, j, 62)) * 0.62;
    const d = density(x, y);
    if (d <= 0.02) return;
    const r = hash2(i, j, 63);
    const w = wild(x, y);
    if (r < 0.2 * d + w * 0.2) items.push({ y, f: 'tuft', x, s: hash2(i, j, 64), big: w });
    else if (r < 0.27 * d + w * 0.1) items.push({ y, f: 'daisies', x, s: hash2(i, j, 65) });
    else if (r < 0.31 * d) items.push({ y, f: 'clover', x, s: hash2(i, j, 66) });
    else if (r < 0.335 * d) items.push({ y, f: 'buttercup', x, s: hash2(i, j, 67) });
    else if (r < 0.35 * d) items.push({ y, f: 'pebble', x, s: hash2(i, j, 68) });
  });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) DETAIL[it.f](ctx, it.x, it.y, it.s, px, it.big);
}

const DETAIL = {
  tuft(ctx, x, y, s, px, big = 0) {
    const R = rng(Math.floor(s * 1e6) + 1);
    const n = 5 + Math.floor(R() * 4), h = (0.14 + R() * 0.1) * (1 + big * 0.8);
    softEllipse(ctx, x + 0.02, y + 0.01, 0.16, 0.05, '#2d5a1c', 0.3);
    for (let b = 0; b < n; b++) {
      const t = (b / (n - 1)) - 0.5;
      const a = t * 1.3 + (R() - 0.5) * 0.3, len = h * (1 - Math.abs(t) * 0.5) * (0.8 + R() * 0.4);
      const bx = x + t * 0.1, tx = bx + Math.sin(a) * len, ty = y - Math.cos(a) * len;
      const w = 0.022 + R() * 0.01;
      ctx.beginPath();
      ctx.moveTo(bx - w, y);
      ctx.quadraticCurveTo(bx - w * 0.5 + (tx - bx) * 0.3, y - len * 0.5, tx, ty);
      ctx.quadraticCurveTo(bx + w * 0.5 + (tx - bx) * 0.3, y - len * 0.5, bx + w, y);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, y, 0, ty);
      g.addColorStop(0, '#3f8a31'); g.addColorStop(1, b % 2 ? '#a6de72' : '#8fd062');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = rgba('#2f6b25', 0.55); ctx.lineWidth = Math.max(0.008, px * 0.8); ctx.stroke();
    }
  },
  daisies(ctx, x, y, s, px) {
    const R = rng(Math.floor(s * 1e6) + 7);
    const n = 2 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const dx = x + (R() - 0.5) * 0.4, dy = y + (R() - 0.5) * 0.18, r = 0.035 + R() * 0.015;
      ctx.strokeStyle = '#4c9a3a'; ctx.lineWidth = Math.max(0.01, px);
      ctx.beginPath(); ctx.moveTo(dx, dy + 0.06); ctx.lineTo(dx, dy); ctx.stroke();
      softEllipse(ctx, dx + 0.01, dy + 0.06, 0.05, 0.015, '#2d5a1c', 0.25);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = rgba('#9a8fb0', 0.7); ctx.lineWidth = Math.max(0.006, px * 0.6);
      for (let p = 0; p < 7; p++) {
        const a = (p / 7) * Math.PI * 2;
        ctx.beginPath(); ctx.ellipse(dx + Math.cos(a) * r * 0.75, dy + Math.sin(a) * r * 0.5, r * 0.5, r * 0.26, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#ffc93a'; ctx.beginPath(); ctx.ellipse(dx, dy, r * 0.38, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    }
  },
  buttercup(ctx, x, y, s, px) {
    const R = rng(Math.floor(s * 1e6) + 9);
    for (let k = 0; k < 3; k++) {
      const dx = x + (R() - 0.5) * 0.3, dy = y + (R() - 0.5) * 0.12, r = 0.03;
      ctx.strokeStyle = '#4c9a3a'; ctx.lineWidth = Math.max(0.01, px);
      ctx.beginPath(); ctx.moveTo(dx, dy + 0.08); ctx.quadraticCurveTo(dx + 0.01, dy + 0.04, dx, dy); ctx.stroke();
      ctx.fillStyle = '#ffd53d'; ctx.strokeStyle = '#c98a10'; ctx.lineWidth = Math.max(0.006, px * 0.7);
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(dx - r * 0.3, dy - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  },
  clover(ctx, x, y, s, px) {
    const R = rng(Math.floor(s * 1e6) + 3);
    for (let k = 0; k < 4; k++) {
      const cx = x + (R() - 0.5) * 0.35, cy = y + (R() - 0.5) * 0.14, r = 0.03 + R() * 0.012;
      ctx.fillStyle = k % 2 ? '#5aa843' : '#4f9c3c'; ctx.strokeStyle = rgba('#2f6b25', 0.6); ctx.lineWidth = Math.max(0.006, px * 0.7);
      for (let l = 0; l < 3; l++) {
        const a = (l / 3) * Math.PI * 2 - Math.PI / 2 + R() * 0.3;
        ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, r, r * 0.7, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
  },
  pebble(ctx, x, y, s, px) {
    const R = rng(Math.floor(s * 1e6) + 5);
    for (let k = 0; k < 2; k++) {
      const cx = x + (R() - 0.5) * 0.2, cy = y + (R() - 0.5) * 0.08, r = 0.03 + R() * 0.03;
      softEllipse(ctx, cx + r * 0.3, cy + r * 0.4, r * 1.5, r * 0.6, '#1d3a12', 0.3);
      ctx.fillStyle = shade('#cfc6b4', (R() - 0.5) * 0.2); ctx.strokeStyle = '#7d7262'; ctx.lineWidth = Math.max(0.007, px * 0.8);
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.3, r * 0.8, (R() - 0.5) * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(cx - r * 0.4, cy - r * 0.3, r * 0.45, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    }
  },
};
