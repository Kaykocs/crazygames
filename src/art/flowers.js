// Illustrated flowers: every genotype is painted procedurally in a clean cartoon style — petals with a deep
// base, luminous tips, folds, veins and an ink outline; seed-spiral centres; stamens; patterns and weather
// mutations. Heads are authored in "head units" (petal length 1) around the flower centre.
import { COLORS } from '../game/genetics.js';
import { shade, ink, mix, rgba, lum } from './color.js';
import { Sprite, rng, smoothClosed, softEllipse, makeCanvas, dpu } from './paint.js';

const TAU = Math.PI * 2;
export const HEAD_TILT = 0.8;              // vertical squash of a face that looks up toward the viewer
const RAINBOW = ['#ff5f6d', '#ff9f43', '#ffd93d', '#6bd66b', '#4fb5ff', '#8f6bff', '#e36bff'];
const GOLD = ['#fff6c4', '#ffd95a', '#f0b429', '#b8780f'];

// ------------------------------------------------------------------------------------------ petal shapes
// Unit petals: base at (0, 0), tip toward (0, -1). Commands: M/L [x, y], C [x1,y1,x2,y2,x,y], Q [x1,y1,x,y].
const P = {
  blossom: [['M', 0, 0], ['C', 0.3, -0.04, 0.66, -0.4, 0.56, -0.76], ['C', 0.48, -1.0, 0.2, -1.05, 0, -1.03],
    ['C', -0.2, -1.05, -0.48, -1.0, -0.56, -0.76], ['C', -0.66, -0.4, -0.3, -0.04, 0, 0]],
  daisy: [['M', 0, 0], ['C', 0.08, -0.08, 0.13, -0.55, 0.11, -0.84], ['Q', 0.08, -1.0, 0, -1.0], ['Q', -0.08, -1.0, -0.11, -0.84],
    ['C', -0.13, -0.55, -0.08, -0.08, 0, 0]],
  star: [['M', 0, 0], ['C', 0.24, -0.1, 0.33, -0.46, 0, -1.0], ['C', -0.33, -0.46, -0.24, -0.1, 0, 0]],
  heart: [['M', 0, 0], ['C', 0.1, -0.1, 0.66, -0.34, 0.6, -0.72], ['C', 0.55, -1.06, 0.16, -1.08, 0, -0.78],
    ['C', -0.16, -1.08, -0.55, -1.06, -0.6, -0.72], ['C', -0.66, -0.34, -0.1, -0.1, 0, 0]],
  frill: [['M', 0, 0], ['C', 0.22, -0.08, 0.44, -0.5, 0.42, -0.78], ['Q', 0.4, -0.92, 0.28, -0.88], ['Q', 0.24, -1.01, 0.11, -0.95],
    ['Q', 0, -1.05, -0.11, -0.95], ['Q', -0.24, -1.01, -0.28, -0.88], ['Q', -0.4, -0.92, -0.42, -0.78], ['C', -0.44, -0.5, -0.22, -0.08, 0, 0]],
  lotus: [['M', 0, 0], ['C', 0.26, -0.1, 0.34, -0.5, 0, -1.0], ['C', -0.34, -0.5, -0.26, -0.1, 0, 0]],
  pinwheel: [['M', 0, 0], ['C', 0.36, 0.02, 0.74, -0.3, 0.74, -0.66], ['C', 0.74, -0.98, 0.44, -1.1, 0.2, -1.02],
    ['C', 0.02, -0.96, -0.08, -0.76, -0.1, -0.52], ['C', -0.12, -0.3, -0.06, -0.1, 0, 0]],
};

// petal → head space transform: rotate by a, scale width w / length l, push out by r0
function xform(a, w, l, r0) {
  const c = Math.cos(a), s = Math.sin(a);
  // petal axis points along angle a (0 = up)
  return (x, y) => {
    const px = x * w, py = y * l - r0;
    return [px * c - py * s, px * s + py * c];
  };
}

function trace(ctx, cmds, T) {
  for (const cm of cmds) {
    const k = cm[0];
    if (k === 'M') { const p = T(cm[1], cm[2]); ctx.moveTo(p[0], p[1]); }
    else if (k === 'L') { const p = T(cm[1], cm[2]); ctx.lineTo(p[0], p[1]); }
    else if (k === 'C') { const a = T(cm[1], cm[2]), b = T(cm[3], cm[4]), p = T(cm[5], cm[6]); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], p[0], p[1]); }
    else if (k === 'Q') { const a = T(cm[1], cm[2]), p = T(cm[3], cm[4]); ctx.quadraticCurveTo(a[0], a[1], p[0], p[1]); }
  }
  ctx.closePath();
}

// ------------------------------------------------------------------------------------------ colours
export function flowerColors(g) {
  const c1 = COLORS[g.c1].hex, c2 = COLORS[g.c2 ?? g.c1].hex;
  return { c1, c2 };
}

export function centerColor(g) {
  if (g.mut === 3) return '#ffe066';
  if ([1, 4, 9, 10].includes(g.c1)) return '#7a4520';
  if (g.c1 === 15) return '#f2c94c';
  if (g.shape === 6) return '#ffd23f';
  return '#ffc233';
}

// base fill for one petal (radial in head space: deep heart, bright body, luminous tips)
function petalFill(ctx, g, col, L, k, idx) {
  const mut = g.mut || 0;
  if (mut === 3) {
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
    gr.addColorStop(0, GOLD[3]); gr.addColorStop(0.35, GOLD[2]); gr.addColorStop(0.72, GOLD[1]); gr.addColorStop(1, GOLD[0]);
    return gr;
  }
  let base = col.c1;
  if (mut === 4) base = RAINBOW[idx % RAINBOW.length];
  if (mut === 2) base = mix(base, '#bcd8ff', 0.28);
  const deep = shade(base, lum(base) > 0.8 ? -0.3 : -0.42), tip = shade(base, lum(base) > 0.85 ? 0.35 : 0.3);
  const gr = ctx.createRadialGradient(0, 0, L * 0.05, 0, 0, L * 1.02);
  if (g.pattern === 1 && mut !== 4) {           // two-tone: second colour flares from the heart
    gr.addColorStop(0, shade(col.c2, -0.25)); gr.addColorStop(0.3, col.c2); gr.addColorStop(0.55, mix(col.c2, base, 0.6)); gr.addColorStop(0.7, base); gr.addColorStop(1, tip);
  } else if (g.pattern === 4 && mut !== 4) {    // tipped: the edge takes the second colour
    gr.addColorStop(0, deep); gr.addColorStop(0.3, base); gr.addColorStop(0.62, base); gr.addColorStop(0.8, mix(base, col.c2, 0.7)); gr.addColorStop(1, shade(col.c2, 0.15));
  } else {
    gr.addColorStop(0, deep); gr.addColorStop(0.28 + k * 0.05, shade(base, -0.12)); gr.addColorStop(0.6, base); gr.addColorStop(1, tip);
  }
  return gr;
}

// ------------------------------------------------------------------------------------------ one petal
// Paints a petal: fill, fold shading, veins, pattern overlay, highlight and ink outline.
function paintPetal(ctx, cmds, T, fill, g, col, o) {
  const { lw, outline, fold = 0.22, veins = 1, idx = 0, sil = false, R } = o;
  ctx.beginPath(); trace(ctx, cmds, T);
  ctx.fillStyle = fill; ctx.fill();
  if (!sil) {
    ctx.save();
    ctx.clip();
    // fold: one half of the petal a touch darker, a soft light strip on the other side
    const b = T(0, 0), l = T(-0.7, -0.5), r = T(0.7, -0.5);
    const fg = ctx.createLinearGradient(l[0], l[1], r[0], r[1]);
    fg.addColorStop(0, 'rgba(255,255,255,0.14)'); fg.addColorStop(0.42, 'rgba(255,255,255,0)');
    fg.addColorStop(0.55, 'rgba(40,10,60,0)'); fg.addColorStop(1, `rgba(40,10,60,${fold})`);
    ctx.fillStyle = fg; ctx.fillRect(-3, -3, 6, 6);
    // pattern overlays
    const c2 = col.c2;
    if (g.pattern === 2 && g.mut !== 4) {                       // stripe along the middle
      ctx.strokeStyle = rgba(c2, 0.95); ctx.lineWidth = o.stripeW;
      ctx.beginPath(); const s0 = T(0, -0.08), s1 = T(0, -0.52), s2 = T(0, -0.9); ctx.moveTo(s0[0], s0[1]); ctx.quadraticCurveTo(s1[0], s1[1], s2[0], s2[1]); ctx.stroke();
      ctx.strokeStyle = rgba(shade(c2, 0.4), 0.6); ctx.lineWidth = o.stripeW * 0.35; ctx.stroke();
    } else if (g.pattern === 3 && g.mut !== 4) {                // freckles
      ctx.fillStyle = c2;
      const n = o.spots ?? 3;
      for (let i = 0; i < n; i++) {
        const t = 0.3 + 0.55 * ((i + 0.5) / n), xo = (R() - 0.5) * 0.36 * o.spotSpread;
        const p = T(xo, -t);
        ctx.beginPath(); ctx.arc(p[0], p[1], o.spotR * (0.7 + R() * 0.5), 0, TAU); ctx.fill();
      }
    }
    // veins fanning from the base
    if (veins) {
      ctx.strokeStyle = rgba(shade(g.mut === 3 ? GOLD[2] : col.c1, -0.5), 0.26);
      ctx.lineWidth = lw * 0.45;
      ctx.beginPath();
      for (const v of [-0.22, 0, 0.22]) {
        const p0 = T(v * 0.2, -0.08), p1 = T(v * 0.7, -0.45), p2 = T(v, -0.72);
        ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
      }
      ctx.stroke();
    }
    // glossy highlight near the tip
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = lw * 0.9;
    ctx.beginPath(); const h0 = T(-0.26, -0.6), h1 = T(-0.28, -0.74), h2 = T(-0.15, -0.85);
    ctx.moveTo(h0[0], h0[1]); ctx.quadraticCurveTo(h1[0], h1[1], h2[0], h2[1]); ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath(); trace(ctx, cmds, T);
  ctx.strokeStyle = outline; ctx.lineWidth = lw; ctx.stroke();
}

// ------------------------------------------------------------------------------------------ centres
function seedDisc(ctx, r, color, lw, sil, dense = 1) {
  const c = sil ? '#b9a98f' : color;
  // dome shading
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, shade(c, 0.45)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, -0.35));
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = g; ctx.fill();
  if (!sil) {
    // Fibonacci seed spiral
    const n = Math.round(60 * dense * Math.min(1.6, r / 0.2));
    const dark = shade(c, -0.45), light = shade(c, 0.4);
    for (let i = 1; i < n; i++) {
      const t = i / n, rr = r * 0.9 * Math.sqrt(t), a = i * 2.39996;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      const s = r * (0.06 + 0.035 * (1 - t));
      ctx.fillStyle = rgba(i % 2 ? dark : light, 0.55 + 0.35 * t);
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.42, r * 0.28, r * 0.16, -0.6, 0, TAU); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.strokeStyle = sil ? '#8f8068' : ink(c, 0.55); ctx.lineWidth = lw; ctx.stroke();
}

function stamens(ctx, n, len, r0, lw, R, color = '#fff3b0', tip = '#ffb627') {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.3, l = len * (0.75 + R() * 0.35);
    const x0 = Math.cos(a) * r0, y0 = Math.sin(a) * r0, x1 = Math.cos(a) * (r0 + l), y1 = Math.sin(a) * (r0 + l);
    const bend = (R() - 0.5) * 0.15;
    ctx.strokeStyle = shade(color, -0.2); ctx.lineWidth = lw * 1.1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2 - bend, x1, y1); ctx.stroke();
    ctx.fillStyle = tip; ctx.strokeStyle = ink(tip, 0.5); ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ctx.ellipse(x1, y1, len * 0.13, len * 0.1, a, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

function sparkle(ctx, x, y, s, color = '#ffffff', a = 1) {
  ctx.fillStyle = rgba(color, a);
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

function dewDrop(ctx, x, y, r) {
  softEllipse(ctx, x + r * 0.25, y + r * 0.45, r * 1.1, r * 0.7, '#1a3550', 0.25);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(210,240,255,0.55)'); g.addColorStop(1, 'rgba(120,190,235,0.75)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(60,120,170,0.55)'; ctx.lineWidth = r * 0.14; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.38, r * 0.3, r * 0.2, -0.6, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------------------------------------ heads
// Paint a flower head centred on (0,0), petal length 1. opts: { tilt, sil (silhouette), lw (outline) }
export function paintHead(ctx, g, opts = {}) {
  const tilt = opts.tilt ?? HEAD_TILT, sil = !!opts.sil, lw = opts.lw ?? 0.045;
  const col = sil ? { c1: '#cbbfa8', c2: '#cbbfa8' } : flowerColors(g);
  const R = rng(1 + g.c1 * 131 + g.shape * 17 + (g.pattern || 0) * 7 + (g.c2 || 0) * 3);
  const mut = sil ? 0 : g.mut || 0;
  const gg = sil ? { ...g, pattern: 0, mut: 0 } : g;
  const outline = sil ? '#a3957d' : mut === 3 ? '#9a5f08' : ink(col.c1, lum(col.c1) > 0.85 ? 0.5 : 0.62);

  ctx.save();
  // back glow for magical variants
  if (mut === 2 || mut === 4 || mut === 3) {
    const glow = mut === 2 ? '#a8d4ff' : mut === 3 ? '#ffe27a' : '#ffffff';
    softEllipse(ctx, 0, 0, 1.45, 1.45 * tilt, glow, mut === 4 ? 0.45 : 0.55, 0.3);
    if (mut === 4) {
      for (let i = 0; i < RAINBOW.length; i++) {
        ctx.strokeStyle = rgba(RAINBOW[i], 0.35);
        ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.ellipse(0, 0, 1.2 + i * 0.045, (1.2 + i * 0.045) * tilt, 0, 0, TAU); ctx.stroke();
      }
    }
  }
  ctx.scale(1, tilt);
  const ow = lw;
  const common = { lw: ow, outline, sil, R, stripeW: 0.1, spotR: 0.05, spotSpread: 1 };

  // draw back → front so lower petals overlap the ones behind them (reads as a face tilted toward us)
  const ring = (n, cmds, w, l, r0, rot, opt = {}) => {
    const list = [];
    for (let i = 0; i < n; i++) list.push({ i, a: rot + (i / n) * TAU + (R() - 0.5) * (opt.jit ?? 0.06) });
    list.sort((p, q) => -Math.cos(p.a) + Math.cos(q.a));
    for (const p of list) {
      const vary = 1 + (R() - 0.5) * (opt.vary ?? 0.08);
      const T = xform(p.a, w * vary, l * vary, r0);
      ctx.save();
      if (opt.shadow !== false && !sil) { const k = dpu(ctx); ctx.shadowColor = 'rgba(50,20,40,0.3)'; ctx.shadowBlur = (opt.blur ?? 0.08) * k; ctx.shadowOffsetY = 0.035 * k; }
      const fill = opt.fill || petalFill(ctx, gg, col, l, 0, p.i + (opt.idxOff || 0));
      ctx.beginPath(); trace(ctx, cmds, T); ctx.fillStyle = fill; ctx.fill();
      ctx.restore();
      paintPetal(ctx, cmds, T, fill, gg, col, { ...common, ...opt, idx: p.i });
    }
  };

  const cc = centerColor(g);
  switch (g.shape) {
    case 0: // Blossom — five broad notched petals, stamens
      ring(5, P.blossom, 1, 1, 0.05, R() * 0.6);
      stamens(ctx, 11, 0.3, 0.1, lw * 0.6, R, sil ? '#b9a98f' : '#fff6cf', sil ? '#a3957d' : cc === '#7a4520' ? '#ffcf5a' : '#ff9f1c');
      seedDisc(ctx, 0.15, cc, lw * 0.8, sil, 0.6);
      break;
    case 1: // Daisy — two rings of slim rays around a big domed disc
      ring(15, P.daisy, 1.05, 0.96, 0.12, 0.2, { veins: 0, blur: 0.05, idxOff: 3, stripeW: 0.05, spotR: 0.035, spots: 2, spotSpread: 0.3 });
      ring(15, P.daisy, 1.05, 1.02, 0.12, 0.2 + TAU / 30, { veins: 0, blur: 0.05, stripeW: 0.05, spotR: 0.035, spots: 2, spotSpread: 0.3 });
      seedDisc(ctx, 0.3, cc, lw * 0.9, sil, 1.4);
      break;
    case 3: // Star — pointed, creased rays with shorter ones between
      ring(5, P.star, 0.85, 0.72, 0.06, TAU / 10, { veins: 0, fold: 0.3 });
      ring(5, P.star, 1, 1.04, 0.06, 0, { veins: 0, fold: 0.34, stripeW: 0.09 });
      if (!sil) {
        ctx.strokeStyle = rgba(shade(col.c1, -0.45), 0.35); ctx.lineWidth = lw * 0.6;
        for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; const T = xform(a, 1, 1.04, 0.06); const p0 = T(0, -0.1), p1 = T(0, -0.85); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
      }
      stamens(ctx, 6, 0.26, 0.08, lw * 0.6, R, sil ? '#b9a98f' : '#fff6cf', sil ? '#a3957d' : '#ff9f1c');
      seedDisc(ctx, 0.12, cc, lw * 0.8, sil, 0.5);
      break;
    case 4: // Heart — heart-shaped petals
      ring(5, P.heart, 1, 1, 0.04, R() * 0.6, { fold: 0.2 });
      stamens(ctx, 9, 0.28, 0.1, lw * 0.6, R, sil ? '#b9a98f' : '#fff6cf', sil ? '#a3957d' : '#ff7eb6');
      seedDisc(ctx, 0.14, cc, lw * 0.8, sil, 0.6);
      break;
    case 5: { // Frill — layered ruffled carnation
      ring(10, P.frill, 1, 1, 0.02, 0, { fold: 0.2, veins: 1, blur: 0.06 });
      ring(8, P.frill, 0.85, 0.74, 0.02, 0.3, { fold: 0.24, veins: 1, blur: 0.06, idxOff: 2 });
      ring(6, P.frill, 0.7, 0.46, 0.02, 0.9, { fold: 0.3, veins: 0, blur: 0.05, idxOff: 4 });
      if (!sil) softEllipse(ctx, 0, 0, 0.16, 0.16, shade(col.c1, -0.7), 0.6, 0.1);
      break;
    }
    case 6: break; // Lotus is painted as a side-view fan (paintLotus)
    case 7: // Pinwheel — twisted comma petals spinning around a bright star throat
      ring(5, P.pinwheel, 0.95, 1, 0.03, R(), { fold: 0.38, jit: 0.02, vary: 0.04 });
      if (!sil) {
        ctx.fillStyle = rgba('#fffbe6', 0.9);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, r = i % 2 ? 0.12 : 0.3; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
        softEllipse(ctx, 0, 0, 0.3, 0.3, '#fff8d8', 0.6, 0.2);
      }
      seedDisc(ctx, 0.09, cc, lw * 0.8, sil, 0.3);
      break;
    default: break;
  }
  ctx.restore();

  // mutation sparkle / dew on top (in unsquashed space)
  if (mut === 1) {
    for (let i = 0; i < 6; i++) { const a = R() * TAU, r = 0.35 + R() * 0.5; dewDrop(ctx, Math.cos(a) * r, Math.sin(a) * r * tilt, 0.06 + R() * 0.04); }
  } else if (mut === 3) {
    sparkle(ctx, -0.62, -0.5, 0.2); sparkle(ctx, 0.66, 0.1, 0.14); sparkle(ctx, 0.1, 0.55 * tilt, 0.1);
  } else if (mut === 2) {
    sparkle(ctx, -0.75, -0.45, 0.13, '#eaf4ff'); sparkle(ctx, 0.7, -0.3, 0.1, '#eaf4ff'); sparkle(ctx, 0.35, 0.62 * tilt, 0.08, '#eaf4ff');
  } else if (mut === 4) {
    sparkle(ctx, -0.7, -0.5, 0.16); sparkle(ctx, 0.72, 0.2, 0.12);
  }
}

// Tulip: a cup seen from the side. Painted in head units, base of the cup at y = 0.45.
export function paintTulip(ctx, g, opts = {}) {
  const sil = !!opts.sil, lw = opts.lw ?? 0.045;
  const col = sil ? { c1: '#cbbfa8', c2: '#cbbfa8' } : flowerColors(g);
  const mut = sil ? 0 : g.mut || 0;
  const pal = (i) => (mut === 4 ? RAINBOW[(i * 2) % RAINBOW.length] : mut === 3 ? GOLD[1] : mut === 2 ? mix(col.c1, '#bcd8ff', 0.28) : col.c1);
  const outline = sil ? '#a3957d' : mut === 3 ? '#9a5f08' : ink(col.c1, lum(col.c1) > 0.85 ? 0.5 : 0.62);
  const R = rng(7 + g.c1 * 13);
  if (mut === 2 || mut === 3 || mut === 4) softEllipse(ctx, 0, -0.1, 1.3, 1.3, mut === 2 ? '#a8d4ff' : mut === 3 ? '#ffe27a' : '#ffffff', 0.5, 0.3);
  const petal = (pts, i, dark) => {
    const base = pal(i);
    const gr = ctx.createLinearGradient(0, 0.5, 0, -0.95);
    if (g.pattern === 1 && !sil && mut < 3) { gr.addColorStop(0, shade(col.c2, -0.3)); gr.addColorStop(0.45, col.c2); gr.addColorStop(0.7, base); gr.addColorStop(1, shade(base, 0.3)); }
    else if (g.pattern === 4 && !sil && mut < 3) { gr.addColorStop(0, shade(base, -0.4)); gr.addColorStop(0.55, base); gr.addColorStop(0.78, mix(base, col.c2, 0.6)); gr.addColorStop(1, shade(col.c2, 0.2)); }
    else { gr.addColorStop(0, shade(base, -0.45)); gr.addColorStop(0.45, shade(base, -0.05)); gr.addColorStop(1, shade(base, 0.32)); }
    ctx.beginPath(); smoothClosed(ctx, pts, 0.5);
    ctx.save();
    if (!sil) { const k = dpu(ctx); ctx.shadowColor = 'rgba(50,20,40,0.3)'; ctx.shadowBlur = 0.08 * k; ctx.shadowOffsetY = 0.03 * k; }
    ctx.fillStyle = gr; ctx.fill();
    ctx.restore();
    if (!sil) {
      ctx.save(); ctx.clip();
      if (dark) { ctx.fillStyle = 'rgba(40,10,60,0.22)'; ctx.fillRect(-2, -2, 4, 4); }
      if (g.pattern === 2) { ctx.strokeStyle = rgba(col.c2, 0.9); ctx.lineWidth = 0.09; ctx.beginPath(); const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length; ctx.moveTo(cx * 0.8, 0.4); ctx.quadraticCurveTo(cx * 1.1, -0.2, cx * 0.9, -0.8); ctx.stroke(); }
      if (g.pattern === 3) { ctx.fillStyle = col.c2; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(pts[1][0] * 0.6 + (R() - 0.5) * 0.3, -0.5 + R() * 0.7, 0.045 + R() * 0.03, 0, TAU); ctx.fill(); } }
      // side sheen
      const sh = ctx.createLinearGradient(-0.7, 0, 0.7, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(0.7, 'rgba(40,10,60,0)'); sh.addColorStop(1, 'rgba(40,10,60,0.25)');
      ctx.fillStyle = sh; ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
    ctx.beginPath(); smoothClosed(ctx, pts, 0.5);
    ctx.strokeStyle = outline; ctx.lineWidth = lw; ctx.stroke();
  };
  // back petals (tips peeking out between the front ones)
  petal([[-0.5, 0.35], [-0.66, -0.2], [-0.46, -0.78], [-0.12, -0.5], [0.02, 0.3]], 1, true);
  petal([[0.5, 0.35], [0.66, -0.2], [0.46, -0.78], [0.12, -0.5], [-0.02, 0.3]], 2, true);
  // dark inside of the cup
  if (!sil) { ctx.fillStyle = shade(pal(0), -0.7); ctx.beginPath(); ctx.ellipse(0, -0.5, 0.3, 0.1, 0, 0, TAU); ctx.fill(); }
  // side front petals then the centre front petal
  petal([[-0.08, 0.46], [-0.62, 0.22], [-0.64, -0.36], [-0.34, -0.72], [-0.02, -0.28]], 3);
  petal([[0.08, 0.46], [0.62, 0.22], [0.64, -0.36], [0.34, -0.72], [0.02, -0.28]], 4);
  petal([[0, 0.5], [-0.44, 0.24], [-0.4, -0.42], [0, -0.92], [0.4, -0.42], [0.44, 0.24]], 0);
  if (!sil) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(-0.22, 0.1); ctx.quadraticCurveTo(-0.28, -0.3, -0.12, -0.62); ctx.stroke();
    if (mut === 1) { dewDrop(ctx, -0.18, -0.1, 0.07); dewDrop(ctx, 0.3, 0.18, 0.06); dewDrop(ctx, 0.1, -0.5, 0.05); }
    if (mut === 3 || mut === 4) { sparkle(ctx, -0.55, -0.6, 0.16); sparkle(ctx, 0.5, 0.1, 0.1); }
    if (mut === 2) { sparkle(ctx, -0.6, -0.5, 0.12, '#eaf4ff'); sparkle(ctx, 0.55, -0.2, 0.09, '#eaf4ff'); }
  }
}

// Lotus: the classic fan of pointed petals opening upward from a cup, two layers, golden crown inside.
export function paintLotus(ctx, g, opts = {}) {
  const sil = !!opts.sil, lw = opts.lw ?? 0.045;
  const col = sil ? { c1: '#cbbfa8', c2: '#cbbfa8' } : flowerColors(g);
  const mut = sil ? 0 : g.mut || 0;
  const gg = sil ? { ...g, pattern: 0, mut: 0 } : g;
  const outline = sil ? '#a3957d' : mut === 3 ? '#9a5f08' : ink(col.c1, lum(col.c1) > 0.85 ? 0.5 : 0.62);
  const R = rng(11 + g.c1 * 7 + (g.pattern || 0));
  if (mut === 2 || mut === 3 || mut === 4) softEllipse(ctx, 0, -0.15, 1.45, 1.25, mut === 2 ? '#a8d4ff' : mut === 3 ? '#ffe27a' : '#ffffff', 0.5, 0.3);
  const common = { lw, outline, sil, R, stripeW: 0.1, spotR: 0.05, spotSpread: 1, veins: 1 };
  const base = [0, 0.42];
  const petal = (a, len, wid, i, fold, lift = 0) => {
    // petal axis from the cup base, angle a from vertical; lift raises the base for inner rows
    const c = Math.cos(a), s = Math.sin(a);
    const T = (x, y) => { const px = x * wid, py = y * len; return [base[0] + px * c - py * s, base[1] - lift + px * s + py * c]; };
    const fill = mut === 3 ? (() => { const gr = ctx.createLinearGradient(0, 0.4, 0, -1); gr.addColorStop(0, GOLD[3]); gr.addColorStop(0.4, GOLD[2]); gr.addColorStop(0.8, GOLD[1]); gr.addColorStop(1, GOLD[0]); return gr; })()
      : (() => {
        const b = mut === 4 ? RAINBOW[i % RAINBOW.length] : mut === 2 ? mix(col.c1, '#bcd8ff', 0.28) : col.c1;
        const p0 = T(0, 0), p1 = T(0, -1);
        const gr = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
        if (gg.pattern === 1 && mut !== 4) { gr.addColorStop(0, shade(col.c2, -0.3)); gr.addColorStop(0.4, col.c2); gr.addColorStop(0.75, b); gr.addColorStop(1, shade(b, 0.3)); }
        else if (gg.pattern === 4 && mut !== 4) { gr.addColorStop(0, shade(b, -0.4)); gr.addColorStop(0.55, b); gr.addColorStop(0.8, mix(b, col.c2, 0.7)); gr.addColorStop(1, shade(col.c2, 0.2)); }
        else { gr.addColorStop(0, shade(b, -0.42)); gr.addColorStop(0.45, shade(b, -0.05)); gr.addColorStop(1, shade(b, 0.36)); }
        return gr;
      })();
    ctx.save();
    if (!sil) { const k = dpu(ctx); ctx.shadowColor = 'rgba(50,20,40,0.3)'; ctx.shadowBlur = 0.08 * k; ctx.shadowOffsetY = 0.03 * k; }
    ctx.beginPath(); trace(ctx, P.lotus, T); ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
    paintPetal(ctx, P.lotus, T, fill, gg, col, { ...common, fold, idx: i });
  };
  // back row (between the front petals), crown, then the front fan from the outside in
  const back = [-1.05, -0.62, -0.2, 0.2, 0.62, 1.05];
  back.forEach((a, k) => petal(a, 1.08, 0.72, k + 3, 0.34, 0.06));
  if (!sil) {
    stamens(ctx, 12, 0.22, 0.05, lw * 0.55, R, '#fff0a0', '#ffb000');
    ctx.save(); ctx.translate(0, -0.18); ctx.scale(1, 0.55); seedDisc(ctx, 0.2, '#d6e86a', lw * 0.9, false, 0.4); ctx.restore();
  }
  const front = [[-1.45, 0.95, 0.9], [1.45, 0.95, 0.9], [-0.95, 1.02, 0.84], [0.95, 1.02, 0.84], [-0.45, 1.06, 0.8], [0.45, 1.06, 0.8], [0, 1.02, 0.78]];
  front.forEach(([a, l, w], k) => petal(a, l, w, k, a < 0 ? 0.16 : 0.34));
  if (!sil) {
    if (mut === 1) { dewDrop(ctx, -0.3, -0.2, 0.07); dewDrop(ctx, 0.42, 0.05, 0.06); dewDrop(ctx, 0.05, -0.55, 0.05); }
    if (mut === 3 || mut === 4) { sparkle(ctx, -0.7, -0.55, 0.16); sparkle(ctx, 0.62, -0.1, 0.1); }
    if (mut === 2) { sparkle(ctx, -0.7, -0.5, 0.12, '#eaf4ff'); sparkle(ctx, 0.6, -0.25, 0.09, '#eaf4ff'); }
  }
}

// ------------------------------------------------------------------------------------------ bud & leaves
// Closed bud in head units: sepals hug a teardrop of colour; k (0..1) swells it and shows more colour.
export function paintBud(ctx, g, k = 1, lw = 0.05) {
  const col = flowerColors(g);
  const c = g.mut === 3 ? GOLD[1] : g.mut === 4 ? RAINBOW[2] : col.c1;
  const w = 0.2 + 0.2 * k, h = 0.55 + 0.35 * k;
  // bud body
  ctx.beginPath();
  ctx.moveTo(0, 0.3);
  ctx.bezierCurveTo(w * 1.5, 0.2, w * 1.2, -h * 0.6, 0, -h);
  ctx.bezierCurveTo(-w * 1.2, -h * 0.6, -w * 1.5, 0.2, 0, 0.3);
  const gr = ctx.createLinearGradient(-w, 0, w, -h);
  gr.addColorStop(0, shade(c, -0.35)); gr.addColorStop(0.5, c); gr.addColorStop(1, shade(c, 0.35));
  ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw; ctx.stroke();
  // petal seams
  ctx.strokeStyle = rgba(ink(c, 0.5), 0.5); ctx.lineWidth = lw * 0.6;
  ctx.beginPath(); ctx.moveTo(0, 0.15); ctx.quadraticCurveTo(w * 0.5, -h * 0.4, 0, -h * 0.98); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(-w * 0.45, -h * 0.45, w * 0.18, h * 0.22, 0.15, 0, TAU); ctx.fill();
  // sepals
  const green = '#4caf50', gi = ink(green, 0.6);
  const sep = (dir, len, wid) => {
    ctx.beginPath();
    ctx.moveTo(0, 0.32);
    ctx.bezierCurveTo(dir * wid * 1.6, 0.25, dir * wid * 1.4, -len * 0.4, dir * wid * 0.5, -len);
    ctx.bezierCurveTo(dir * wid * 0.2, -len * 0.5, 0, -len * 0.2, 0, 0.32);
    const sg = ctx.createLinearGradient(0, 0.3, 0, -len);
    sg.addColorStop(0, '#2f8a3a'); sg.addColorStop(1, '#7fd26a');
    ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = gi; ctx.lineWidth = lw; ctx.stroke();
  };
  const sl = h * (0.95 - 0.45 * k);
  sep(-1, sl, w * 1.05); sep(1, sl, w * 1.05);
  sep(-0.25, sl * 0.8, w * 0.7);
}

// Leaf: base at (0,0), tip toward (0,-1), folded along the midrib (one half darker)
export function paintLeaf(ctx, color = '#57b947', lw = 0.05, curl = 0.12) {
  const d = shade(color, -0.3), l = shade(color, 0.25), o = ink(color, 0.62);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0.34, -0.1, 0.4 + curl, -0.62, curl, -1);
    ctx.bezierCurveTo(-0.38 + curl, -0.6, -0.34, -0.12, 0, 0);
    ctx.closePath();
  };
  path();
  const gr = ctx.createLinearGradient(0, 0, curl, -1);
  gr.addColorStop(0, shade(color, -0.15)); gr.addColorStop(1, l);
  ctx.fillStyle = gr; ctx.fill();
  ctx.save(); ctx.clip();
  // darker far half
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0.06 + curl * 0.6, -0.5, curl, -1); ctx.lineTo(1, -1); ctx.lineTo(1, 0.2); ctx.closePath();
  ctx.fillStyle = rgba(d, 0.55); ctx.fill();
  // veins
  ctx.strokeStyle = rgba(shade(color, 0.45), 0.8); ctx.lineWidth = lw * 0.7;
  ctx.beginPath(); ctx.moveTo(0, -0.02); ctx.quadraticCurveTo(0.06 + curl * 0.6, -0.5, curl, -0.98); ctx.stroke();
  ctx.strokeStyle = rgba(shade(color, -0.4), 0.35); ctx.lineWidth = lw * 0.45;
  ctx.beginPath();
  for (let i = 1; i < 5; i++) {
    const t = i / 5.2, mx = 0.06 * t + curl * t * t, my = -t;
    ctx.moveTo(mx, my); ctx.quadraticCurveTo(mx - 0.12, my - 0.02, mx - 0.24 * (1 - t * 0.6), my - 0.1);
    ctx.moveTo(mx, my); ctx.quadraticCurveTo(mx + 0.12, my - 0.02, mx + 0.24 * (1 - t * 0.6), my - 0.1);
  }
  ctx.stroke();
  ctx.restore();
  path();
  ctx.strokeStyle = o; ctx.lineWidth = lw; ctx.stroke();
}

// ------------------------------------------------------------------------------------------ sprite caches
const heads = new Map(), buds = new Map(), leaves = new Map();
export const geneKey = (g) => `${g.c1}.${g.c2 ?? g.c1}.${g.shape}.${g.pattern || 0}.${g.mut || 0}`;

// res = device pixels per head unit
export function headSprite(g, res) {
  const key = geneKey(g) + '@' + res;
  let s = heads.get(key);
  if (!s) {
    s = g.shape === 2
      ? new Sprite(3, 3, 1.5, 1.6, res, (ctx, px) => paintTulip(ctx, g, { lw: Math.max(0.045, px * 1.6) }))
      : g.shape === 6
        ? new Sprite(3.2, 3.1, 1.6, 1.7, res, (ctx, px) => paintLotus(ctx, g, { lw: Math.max(0.045, px * 1.6) }))
        : new Sprite(3.1, 3.1, 1.55, 1.55, res, (ctx, px) => paintHead(ctx, g, { lw: Math.max(0.042, px * 1.5) }));
    heads.set(key, s);
    if (heads.size > 400) heads.delete(heads.keys().next().value);
  }
  return s;
}

export function budSprite(g, stage, res) {
  const key = `${g.c1}.${g.mut === 3 || g.mut === 4 ? g.mut : 0}.${stage}@${res}`;
  let s = buds.get(key);
  if (!s) {
    s = new Sprite(1.6, 2.1, 0.8, 1.25, res, (ctx, px) => paintBud(ctx, g, [0.25, 0.6, 1][stage], Math.max(0.05, px * 1.6)));
    buds.set(key, s);
    if (buds.size > 200) buds.delete(buds.keys().next().value);
  }
  return s;
}

export function leafSprite(v, res) {
  const key = `${v}@${res}`;
  let s = leaves.get(key);
  if (!s) {
    const color = ['#5dbb4c', '#4aa843', '#6cc458'][v % 3];
    s = new Sprite(1.1, 1.15, 0.45, 1.05, res, (ctx, px) => paintLeaf(ctx, color, Math.max(0.05, px * 1.5), v % 2 ? 0.14 : -0.1));
    leaves.set(key, s);
  }
  return s;
}

// ------------------------------------------------------------------------------------------ UI icons
// A flower head as an <img> for the HTML UI, painted by the same code as the garden.
const icons = new Map();
const DPR = () => Math.min(2, Math.max(1, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)));
export function flowerIconURL(g, size = 48, { sil = false } = {}) {
  const px = Math.round(size * DPR());
  const key = `${sil ? 's' : geneKey(g)}.${sil ? g.shape : ''}.${px}`;
  let url = icons.get(key);
  if (url) return url;
  const c = makeCanvas(px, px);
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const giant = g.mut === 5 ? 1.08 : 1;
  const unit = (px / 2.5) * giant;              // head units → px
  ctx.translate(px / 2, px / 2 + (g.shape === 2 ? px * 0.04 : 0));
  ctx.scale(unit, unit);
  const lw = Math.max(0.05, 1.3 / unit);
  if (g.shape === 2) paintTulip(ctx, g, { sil, lw });
  else if (g.shape === 6) { ctx.translate(0, 0.1); paintLotus(ctx, g, { sil, lw }); }
  else paintHead(ctx, g, { sil, lw, tilt: 1 });
  url = c.toDataURL('image/png');
  icons.set(key, url);
  return url;
}

// Seed icon for species not yet in the Flower Book: a glossy seed in the flower's colours with a sparkle.
export function seedIconURL(g, size = 40) {
  const px = Math.round(size * DPR());
  const key = `seed.${g.c1}.${g.c2 ?? g.c1}.${g.pattern || 0}.${px}`;
  let url = icons.get(key);
  if (url) return url;
  const c = makeCanvas(px, px);
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const u = px / 2.4;
  ctx.translate(px / 2, px / 2); ctx.scale(u, u);
  const lw = Math.max(0.07, 1.4 / u);
  const c1 = COLORS[g.c1].hex, c2 = COLORS[g.c2 ?? g.c1].hex;
  softEllipse(ctx, 0.08, 0.86, 0.62, 0.16, '#3a2a10', 0.35);
  ctx.save(); ctx.rotate(0.3);
  ctx.beginPath(); ctx.moveTo(0, -0.95); ctx.bezierCurveTo(0.72, -0.62, 0.7, 0.72, 0, 0.9); ctx.bezierCurveTo(-0.7, 0.72, -0.72, -0.62, 0, -0.95); ctx.closePath();
  const gr = ctx.createLinearGradient(-0.6, -0.9, 0.6, 0.9);
  gr.addColorStop(0, shade(c1, 0.35)); gr.addColorStop(0.55, c1); gr.addColorStop(1, g.pattern ? c2 : shade(c1, -0.35));
  ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = ink(c1, 0.62); ctx.lineWidth = lw * 1.3; ctx.stroke();
  ctx.strokeStyle = rgba(ink(c1, 0.5), 0.55); ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(0, -0.78); ctx.quadraticCurveTo(0.2, 0, 0, 0.75); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(-0.26, -0.3, 0.12, 0.3, 0, 0, TAU); ctx.fill();
  ctx.restore();
  sparkle(ctx, 0.72, -0.72, 0.28, '#fff6c4');
  sparkle(ctx, -0.8, 0.35, 0.14, '#ffffff');
  url = c.toDataURL('image/png');
  icons.set(key, url);
  return url;
}
