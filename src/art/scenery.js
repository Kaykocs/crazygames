// Garden scenery in the illustrated style: the cottage border along the fence, a mossy dry-stone wall, gate
// posts and an open gate, clipped hedges, the pond jetty, irises and cattails, a lamp post, the kitchen garden
// (raised beds with crops, a scarecrow, pumpkins, sunflowers), shed clutter (water butt, pots, log pile), a
// weeping willow, ferns, foxgloves and soft meadow tufts. Painters draw in world units with the object's
// ground contact point at (0, 0) and y up = negative screen y, like nature.js and built.js.
import { rng, softEllipse, smoothClosed, roundRect, poly } from './paint.js';
import { shade, ink, rgba } from './color.js';
import { SQ } from './view3q.js';
import { paintCanopy } from './nature.js';

const TAU = Math.PI * 2;
const LW = (px, k = 1.6) => Math.max(0.028, px * k);
function shadow(ctx, x, rx, ry, a = 0.36) { softEllipse(ctx, x, 0.02, rx, ry, '#173512', a, 0.25); }
function leaf(ctx, x, y, l, w, a, col, lw) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w, -l * 0.5, 0, -l); ctx.quadraticCurveTo(-w, -l * 0.5, 0, 0); ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = ink(col, 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = rgba(shade(col, 0.45), 0.6); ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(0, -l * 0.1); ctx.lineTo(0, -l * 0.8); ctx.stroke();
  ctx.restore();
}
function stem(ctx, x0, y0, x1, y1, bend, col, lw) {
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1); ctx.stroke();
}

// ------------------------------------------------------------------------------------------ cottage border plants
const HOLLY = ['#ff9cc2', '#e8506e', '#fff0f4', '#ffb38a', '#c23a5e', '#f7c6e0'], FOX = ['#c77ad9', '#f29ac4', '#fff0f8'], DELPH = ['#5b7fe8', '#8a6be0', '#77b3ff'];
const LUPIN = ['#9a6bd8', '#ff8fb8', '#ffd23f'];
function hollyhock(ctx, x, h, R, px) {
  const lw = LW(px, 1.3), c = HOLLY[Math.floor(R() * HOLLY.length)];
  const bend = (R() - 0.5) * 0.12;
  stem(ctx, x, 0, x + bend, -h, bend * 0.5, '#3f7f35', lw * 1.3);
  // leaves up the lower stem
  for (let k = 0; k < 4; k++) { const t = 0.08 + k * 0.1; leaf(ctx, x + bend * t, -h * t, 0.2 - k * 0.025, 0.11, (k % 2 ? 1 : -1) * (0.9 + R() * 0.3), k % 2 ? '#4f9e48' : '#5aab4c', lw * 0.7); }
  // cup flowers climbing the stem, buds at the tip
  const n = 7;
  for (let k = n; k >= 0; k--) {
    const t = 0.4 + (k / n) * 0.56, y = -h * t, xx = x + bend * t + (k % 2 ? 0.05 : -0.05);
    if (k > n - 2) { const r = 0.032; ctx.fillStyle = shade(c, -0.1); ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.ellipse(xx, y, r, r * 1.25, 0, 0, TAU); ctx.fill(); ctx.stroke(); continue; }
    const r = 0.072 - t * 0.02;
    ctx.fillStyle = k % 2 ? '#4f9e48' : '#5aab4c'; ctx.beginPath(); ctx.ellipse(xx - (k % 2 ? 0.07 : -0.07), y + 0.035, 0.05, 0.022, k % 2 ? 0.5 : -0.5, 0, TAU); ctx.fill();
    ctx.beginPath();
    for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU - Math.PI / 2; ctx.arc(xx + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.58, a - 1.2, a + 1.2); }
    ctx.closePath();
    const g = ctx.createRadialGradient(xx - r * 0.3, y - r * 0.3, r * 0.1, xx, y, r * 1.05);
    g.addColorStop(0, shade(c, 0.35)); g.addColorStop(1, shade(c, -0.15));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw * 0.7; ctx.stroke();
    ctx.fillStyle = rgba(shade(c, -0.45), 0.55); ctx.beginPath(); ctx.arc(xx, y, r * 0.35, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff1a0'; ctx.beginPath(); ctx.arc(xx, y, r * 0.16, 0, TAU); ctx.fill();
  }
}
function rose(ctx, x, y, r, c, lw) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw * 0.7; ctx.stroke();
  ctx.strokeStyle = rgba(shade(c, -0.45), 0.8); ctx.lineWidth = lw * 0.55;
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0.3, 4.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + r * 0.1, y, r * 0.25, 2, 6); ctx.stroke();
}
function spike(ctx, x, h, R, px, cols, kind) {
  const lw = LW(px, 1.2), c = cols[Math.floor(R() * cols.length)];
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.55 + (R() - 0.5) * 0.3; leaf(ctx, x + (i - 2) * 0.04, 0, 0.18 + R() * 0.07, 0.06, a, i % 2 ? '#4a9a42' : '#58a84a', lw * 0.8); }
  const bend = (R() - 0.5) * 0.08;
  stem(ctx, x, 0, x + bend, -h, bend * 0.4, '#437f38', lw * 1.1);
  const n = kind === 'fox' ? 9 : 12;
  for (let k = 0; k < n; k++) {
    const t = 0.42 + (k / n) * 0.56, y = -h * t, xx = x + bend * t;
    const s = (1 - (k / n) * 0.65);
    if (kind === 'fox') {
      // drooping bells on one side
      const bx = xx + 0.035 * s, r = 0.045 * s;
      ctx.beginPath(); ctx.moveTo(bx - r * 0.6, y - r); ctx.quadraticCurveTo(bx + r * 1.6, y - r * 0.4, bx + r * 1.2, y + r * 0.9); ctx.quadraticCurveTo(bx + r * 0.2, y + r * 1.2, bx - r * 0.6, y - r); ctx.closePath();
      ctx.fillStyle = k > n - 3 ? shade(c, -0.2) : c; ctx.fill(); ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw * 0.7; ctx.stroke();
      if (k < n - 3) { ctx.fillStyle = rgba(shade(c, -0.5), 0.8); ctx.beginPath(); ctx.arc(bx + r * 0.9, y + r * 0.5, r * 0.18, 0, TAU); ctx.fill(); }
    } else {
      // dense florets all round the spike
      for (const side of [-1, 1]) {
        const r = 0.04 * s, fx = xx + side * r * 0.9;
        ctx.fillStyle = k > n - 3 ? shade(c, -0.25) : (side < 0 ? shade(c, 0.2) : c);
        ctx.beginPath(); ctx.arc(fx, y, r, 0, TAU); ctx.fill(); ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw * 0.6; ctx.stroke();
        if (kind === 'lupin') { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(fx - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); ctx.fill(); }
      }
    }
  }
}
function mound(ctx, x, r, R, px, col, flower) {
  const lw = LW(px, 1.1);
  const clumps = [{ x: x - r * 0.5, y: -r * 0.55, r: r * 0.6 }, { x: x + r * 0.5, y: -r * 0.5, r: r * 0.58 }, { x, y: -r * 0.85, r: r * 0.7 }];
  paintCanopy(ctx, clumps, col, px, R, { leafy: 0.5, leafSize: 0.45 });
  if (!flower) return;
  for (let i = 0; i < Math.round(r * 40); i++) {
    const c = clumps[Math.floor(R() * clumps.length)], a = R() * TAU, rr = Math.sqrt(R()) * c.r * 0.85;
    const fx = c.x + Math.cos(a) * rr, fy = c.y + Math.sin(a) * rr - 0.02;
    ctx.fillStyle = R() < 0.3 ? shade(flower, 0.3) : flower; ctx.strokeStyle = rgba(ink(flower, 0.55), 0.8); ctx.lineWidth = lw * 0.5;
    ctx.beginPath(); ctx.arc(fx, fy, 0.022 + R() * 0.012, 0, TAU); ctx.fill(); ctx.stroke();
  }
}
// a border segment of length len (x from 0 to len), plants in two rows; anchor at the front of the border
export function paintBorder(ctx, px, seed = 1, len = 2) {
  const R = rng(seed);
  shadow(ctx, len / 2 + 0.15, len * 0.55, 0.22, 0.34);
  // back row: tall spires against the fence, rising out of a leafy mass
  const back = [];
  for (let x = 0.15 + R() * 0.2; x < len - 0.1; x += 0.28 + R() * 0.22) back.push(x);
  ctx.save(); ctx.translate(0, -0.22);
  const mass = [];
  for (let x = 0.1; x < len; x += 0.26) mass.push({ x: x + (R() - 0.5) * 0.08, y: -0.2 - R() * 0.12, r: 0.2 + R() * 0.08 });
  paintCanopy(ctx, mass, '#4c9844', px, R, { leafy: 0.8, leafSize: 0.55 });
  for (const x of back) {
    const t = R();
    if (t < 0.3) hollyhock(ctx, x, 1.3 + R() * 0.45, R, px);
    else if (t < 0.52) spike(ctx, x, 0.95 + R() * 0.35, R, px, FOX, 'fox');
    else if (t < 0.74) spike(ctx, x, 1.05 + R() * 0.35, R, px, DELPH, 'delph');
    else if (t < 0.86) spike(ctx, x, 0.75 + R() * 0.2, R, px, LUPIN, 'lupin');
    else {
      // an old rose bush
      const cl = [{ x: x - 0.12, y: -0.45, r: 0.2 }, { x: x + 0.12, y: -0.5, r: 0.2 }, { x, y: -0.72, r: 0.22 }];
      paintCanopy(ctx, cl, '#3f8a3e', px, R, { leafy: 0.9, leafSize: 0.5 });
      const rc = R() < 0.5 ? '#e8405a' : '#ff9cc2';
      for (let k = 0; k < 7; k++) { const c = cl[k % 3], a = R() * TAU, rr = R() * c.r * 0.7; rose(ctx, c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, 0.05 + R() * 0.02, rc, LW(px, 1.2)); }
    }
  }
  ctx.restore();
  // front row: soft drifts of catmint, lady's mantle and daisies, irregular in size and spacing
  for (let x = 0.12 + R() * 0.3; x < len - 0.05; x += 0.3 + R() * 0.45) {
    const t = R(), dy = (R() - 0.5) * 0.12;
    if (R() < 0.18) continue;
    ctx.save(); ctx.translate(0, dy);
    if (t < 0.35) mound(ctx, x, 0.15 + R() * 0.12, R, px, '#7a9e7a', '#a592ea');
    else if (t < 0.55) mound(ctx, x, 0.13 + R() * 0.1, R, px, '#8fbf5a', '#e8e27a');
    else if (t < 0.75) mound(ctx, x, 0.12 + R() * 0.1, R, px, '#5aab4c', '#ffffff');
    else if (t < 0.88) mound(ctx, x, 0.14 + R() * 0.1, R, px, '#5aab4c', '#ff8fb8');
    else mound(ctx, x, 0.1 + R() * 0.06, R, px, '#4f9e48', null);
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------ dry-stone wall
const WALL = ['#c9bfaa', '#b8ad96', '#d4cab6', '#a99e88', '#beb39c'];
// wall along x from 0 to len; height h; front face at z = 0 (anchor), top strip behind it
export function paintWall(ctx, px, seed = 1, len = 3, h = 0.85) {
  const R = rng(seed);
  const lw = LW(px, 1.4), T = 0.5 * SQ;
  shadow(ctx, len / 2 + 0.2, len * 0.55, 0.22, 0.4);
  // front face: courses of rounded stones
  ctx.fillStyle = '#5d5448'; ctx.fillRect(0, -h, len, h);
  const rows = 4, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const y1 = -r * rh, y0 = y1 - rh;
    let x = r % 2 ? -0.18 : 0;
    while (x < len) {
      const w = 0.28 + R() * 0.3, x0 = Math.max(0, x + 0.015), x1 = Math.min(len, x + w - 0.015);
      if (x1 - x0 > 0.06) {
        const col = shade(WALL[Math.floor(R() * WALL.length)], (R() - 0.5) * 0.1 - r * 0.04);
        ctx.beginPath(); roundRect(ctx, x0, y0 + 0.018, x1 - x0, rh - 0.036, 0.06);
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, shade(col, 0.28)); g.addColorStop(1, shade(col, -0.25));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = ink(col, 0.6); ctx.lineWidth = lw * 0.8; ctx.stroke();
        if (R() < 0.3) { ctx.fillStyle = rgba('#8cc152', 0.85); ctx.beginPath(); ctx.ellipse(x0 + (x1 - x0) * R(), y0 + 0.03, 0.08, 0.025, 0, 0, TAU); ctx.fill(); }
        if (R() < 0.25) { ctx.fillStyle = rgba('#e8e4c8', 0.6); ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * R(), y0 + rh * R(), 0.02, 0, TAU); ctx.fill(); }
      }
      x += w;
    }
  }
  // damp dark foot
  const fg = ctx.createLinearGradient(0, -0.2, 0, 0);
  fg.addColorStop(0, 'rgba(30,40,20,0)'); fg.addColorStop(1, 'rgba(30,40,20,0.35)');
  ctx.fillStyle = fg; ctx.fillRect(0, -0.2, len, 0.2);
  // top: flat coping stones seen from above, moss creeping over them
  ctx.fillStyle = '#6f6556'; ctx.fillRect(0, -h - T, len, T);
  for (let x = 0; x < len - 0.05; ) {
    const w = Math.min(len - x, 0.22 + R() * 0.2), col = shade(WALL[Math.floor(R() * WALL.length)], 0.12);
    ctx.beginPath(); roundRect(ctx, x + 0.012, -h - T + 0.02, w - 0.024, T - 0.03, 0.05);
    const g = ctx.createLinearGradient(0, -h - T, 0, -h); g.addColorStop(0, shade(col, 0.2)); g.addColorStop(1, shade(col, -0.08));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(col, 0.6); ctx.lineWidth = lw * 0.7; ctx.stroke();
    x += w;
  }
  for (let i = 0; i < len * 1.6; i++) {
    const x = R() * len, w = 0.08 + R() * 0.16, y = -h - T * (0.25 + R() * 0.5);
    const blob = [];
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; blob.push([x + Math.cos(a) * w * (0.75 + R() * 0.4), y + Math.sin(a) * 0.06 * (0.75 + R() * 0.4)]); }
    ctx.beginPath(); smoothClosed(ctx, blob);
    const g = ctx.createLinearGradient(x, y - 0.07, x, y + 0.07); g.addColorStop(0, '#b5dc62'); g.addColorStop(1, '#5f9a33');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rgba('#3b6a22', 0.5); ctx.lineWidth = lw * 0.55; ctx.stroke();
  }
  // moss spilling over the front edge
  for (let i = 0; i < len * 1.2; i++) { const x = R() * len; ctx.fillStyle = rgba('#8cc152', 0.9); ctx.beginPath(); ctx.ellipse(x, -h + 0.01, 0.08 + R() * 0.1, 0.035, 0, 0, Math.PI); ctx.fill(); }
  ctx.strokeStyle = ink('#b8ad96', 0.6); ctx.lineWidth = lw; ctx.strokeRect(0, -h, len, h);
  // aubretia cascading from cracks, ivy trails, ferns at the foot
  for (let i = 0; i < 2; i++) {
    const x = 0.3 + R() * (len - 0.6), purple = R() < 0.6;
    const col = purple ? '#a36be0' : '#ff7a9a';
    for (let k = 0; k < 16; k++) { ctx.fillStyle = k % 3 ? col : shade(col, 0.3); ctx.beginPath(); ctx.arc(x + (R() - 0.5) * 0.35, -h + R() * 0.3, 0.03, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#5a9a3c'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(x + (R() - 0.5) * 0.35, -h + R() * 0.25, 0.035, 0.018, R(), 0, TAU); ctx.fill(); }
  }
  const ivyX = R() * len * 0.6 + 0.2;
  ctx.strokeStyle = '#3f6a2a'; ctx.lineWidth = lw * 0.8;
  ctx.beginPath(); ctx.moveTo(ivyX, -h - 0.05); ctx.bezierCurveTo(ivyX + 0.2, -h * 0.6, ivyX - 0.15, -h * 0.35, ivyX + 0.1, -0.05); ctx.stroke();
  for (let k = 0; k < 9; k++) {
    const t = k / 8, x = ivyX + Math.sin(t * 5) * 0.12 + (R() - 0.5) * 0.08, y = -h + t * (h - 0.05);
    ctx.fillStyle = k % 2 ? '#4f8f3a' : '#63a846'; ctx.strokeStyle = '#2b5520'; ctx.lineWidth = lw * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y - 0.05); ctx.lineTo(x + 0.05, y); ctx.lineTo(x, y + 0.04); ctx.lineTo(x - 0.05, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  for (let x = 0.2 + R() * 0.3; x < len; x += 0.6 + R() * 0.7) fern(ctx, x, 0.3 + R() * 0.1, R, px);
}
// square stone pillar with a cap (wall ends, gateway)
export function paintPillar(ctx, px, h = 1.25) {
  const lw = LW(px, 1.5), w = 0.52, T = 0.52 * SQ;
  shadow(ctx, 0.15, 0.5, 0.18, 0.4);
  const col = '#c4b9a3';
  ctx.beginPath(); ctx.rect(-w / 2, -h, w, h);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, shade(col, 0.2)); g.addColorStop(1, shade(col, -0.25));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(col, 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = rgba(ink(col, 0.5), 0.6); ctx.lineWidth = lw * 0.6;
  for (let y = -0.26; y > -h; y -= 0.26) { ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke(); const x = ((y * 7) % 0.3) - 0.05; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 0.26); ctx.stroke(); }
  // cap slab: front edge, then its top face
  ctx.beginPath(); ctx.rect(-w / 2 - 0.06, -h - 0.1, w + 0.12, 0.1);
  ctx.fillStyle = shade(col, -0.1); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.rect(-w / 2 - 0.06, -h - 0.1 - T, w + 0.12, T);
  ctx.fillStyle = shade(col, 0.25); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba('#8cc152', 0.9); ctx.beginPath(); ctx.ellipse(-0.1, -h - 0.1 - T * 0.3, 0.14, 0.05, 0, 0, TAU); ctx.fill();
  // a stone ball finial resting on the cap
  const by = -h - 0.1 - T * 0.5 - 0.12;
  softEllipse(ctx, 0.03, -h - 0.1 - T * 0.45, 0.16, 0.05, '#3a3020', 0.35);
  ctx.beginPath(); ctx.arc(0, by, 0.15, 0, TAU);
  const bg = ctx.createRadialGradient(-0.05, by - 0.06, 0.02, 0, by, 0.16); bg.addColorStop(0, shade(col, 0.4)); bg.addColorStop(1, shade(col, -0.3));
  ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = ink(col, 0.62); ctx.lineWidth = lw; ctx.stroke();
}

// ------------------------------------------------------------------------------------------ gate
const WHITE = '#f6f1e6', INK_W = '#77708a';
export function paintGatePost(ctx, px) {
  const lw = LW(px, 1.5);
  shadow(ctx, 0.08, 0.22, 0.08, 0.4);
  ctx.beginPath(); roundRect(ctx, -0.09, -1.28, 0.18, 1.3, 0.03);
  const g = ctx.createLinearGradient(-0.09, 0, 0.09, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, shade(WHITE, -0.25));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = INK_W; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); roundRect(ctx, -0.12, -1.34, 0.24, 0.08, 0.02); ctx.fillStyle = WHITE; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -1.44, 0.1, 0, TAU);
  const b = ctx.createRadialGradient(-0.03, -1.48, 0.01, 0, -1.44, 0.11); b.addColorStop(0, '#ffffff'); b.addColorStop(1, shade(WHITE, -0.25));
  ctx.fillStyle = b; ctx.fill(); ctx.stroke();
}
// picket gate leaf hinged at (0, 0), swung open into the garden: drawn sheared (x along the leaf)
export function paintGateLeaf(ctx, px, open = 0.72) {
  const lw = LW(px, 1.4), L = 0.82;
  const c = Math.cos(open), s = Math.sin(open);
  softEllipse(ctx, -c * L * 0.5 + 0.1, s * L * SQ * 0.5 + 0.04, L * 0.45, 0.12, '#173512', 0.3, 0.3);
  ctx.save();
  ctx.transform(-c, s * SQ, 0, 1, 0, 0);
  for (const y of [-0.3, -0.72]) { ctx.beginPath(); roundRect(ctx, 0.04, y - 0.045, L - 0.06, 0.09, 0.03); ctx.fillStyle = shade(WHITE, -0.2); ctx.fill(); ctx.strokeStyle = INK_W; ctx.lineWidth = lw * 0.8; ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0.1, -0.3); ctx.lineTo(L - 0.1, -0.72); ctx.lineWidth = lw * 3; ctx.strokeStyle = INK_W; ctx.stroke(); ctx.lineWidth = lw * 1.6; ctx.strokeStyle = shade(WHITE, -0.12); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const x = 0.12 + i * 0.2, h = 0.9 + Math.sin((i / 3) * Math.PI) * 0.08, w = 0.12;
    ctx.beginPath(); ctx.moveTo(x - w / 2, 0.02); ctx.lineTo(x - w / 2, -h + 0.07); ctx.lineTo(x, -h); ctx.lineTo(x + w / 2, -h + 0.07); ctx.lineTo(x + w / 2, 0.02); ctx.closePath();
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, shade(WHITE, -0.22));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = INK_W; ctx.lineWidth = lw; ctx.stroke();
  }
  ctx.restore();
  // latch
  ctx.fillStyle = '#4a4a55'; ctx.beginPath(); ctx.arc(-c * (L - 0.08), s * (L - 0.08) * SQ - 0.5, 0.03, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------------------------------------ hedges
const HEDGE = '#4f9a44';
function hedgeTexture(ctx, x0, y0, x1, y1, R, lw, dens = 60) {
  const n = Math.round((x1 - x0) * (y1 - y0) * dens);
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0), s = 0.05 + R() * 0.04, t = (y - y0) / (y1 - y0);
    ctx.strokeStyle = t < 0.4 ? rgba('#b6e07a', 0.55) : rgba('#2f6a2e', 0.35 + t * 0.2); ctx.lineWidth = lw * 0.6;
    ctx.beginPath(); ctx.arc(x, y, s, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  }
}
// clipped hedge along x (len), height h, depth d: front face + rounded top
export function paintHedge(ctx, px, seed = 1, len = 2, h = 0.75, d = 0.7) {
  const R = rng(seed);
  const lw = LW(px, 1.6), D = d * SQ, inkC = ink(HEDGE, 0.66);
  shadow(ctx, len / 2 + 0.25, len * 0.56, 0.25, 0.42);
  const bump = (x0, x1, y, amp) => { for (let x = x0; x <= x1 + 1e-6; x += 0.12) ctx.lineTo(x, y - Math.abs(Math.sin(x * 9.1 + seed)) * amp); };
  // body silhouette (top + face) with a softly bumpy crown
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h - D * 0.5); ctx.quadraticCurveTo(0, -h - D, 0.2, -h - D);
  bump(0.2, len - 0.2, -h - D, 0.03); ctx.quadraticCurveTo(len, -h - D, len, -h - D * 0.5); ctx.lineTo(len, 0); ctx.closePath();
  ctx.fillStyle = HEDGE; ctx.fill();
  ctx.save(); ctx.clip();
  // top face lit, front face shading down
  const g = ctx.createLinearGradient(0, -h - D, 0, 0);
  g.addColorStop(0, shade(HEDGE, 0.4)); g.addColorStop(0.28, shade(HEDGE, 0.15)); g.addColorStop(0.36, shade(HEDGE, -0.05)); g.addColorStop(1, shade(HEDGE, -0.42));
  ctx.fillStyle = g; ctx.fillRect(-0.1, -h - D - 0.1, len + 0.2, h + D + 0.2);
  hedgeTexture(ctx, 0, -h - D, len, 0, R, lw, 70);
  ctx.strokeStyle = rgba(inkC, 0.35); ctx.lineWidth = lw * 0.6;
  ctx.beginPath(); ctx.moveTo(0.05, -h + 0.02); bump(0.05, len - 0.05, -h + 0.02, 0.02); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = inkC; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h - D * 0.5); ctx.quadraticCurveTo(0, -h - D, 0.2, -h - D);
  bump(0.2, len - 0.2, -h - D, 0.03); ctx.quadraticCurveTo(len, -h - D, len, -h - D * 0.5); ctx.lineTo(len, 0); ctx.stroke();
}
// hedge running along z: a column of clipped masses seen from above (len along z, anchor at the front end)
export function paintHedgeZ(ctx, px, seed = 1, len = 2, h = 1.1, t = 0.9) {
  const R = rng(seed);
  const lw = LW(px, 1.6), inkC = ink(HEDGE, 0.66);
  const Lz = len * SQ;
  // cast shadow to the right on the lawn
  const sg = ctx.createLinearGradient(t / 2, 0, t / 2 + 0.9, 0); sg.addColorStop(0, 'rgba(23,53,18,0.35)'); sg.addColorStop(1, 'rgba(23,53,18,0)');
  ctx.fillStyle = sg; ctx.fillRect(t / 2, -Lz, 0.9, Lz);
  // the edges wobble by world position so neighbouring segments join seamlessly
  const edge = (side) => { const pts = []; for (let y = 0; y >= -Lz - 0.2; y -= 0.12) pts.push([side * (t / 2 + Math.sin(y * (TAU * 3 / Lz) + side) * 0.035), y - h]); return pts; };
  const L = edge(-1), Rr = edge(1).reverse();
  ctx.beginPath(); ctx.moveTo(-t / 2, 0); for (const [x, y] of L) ctx.lineTo(x, y); for (const [x, y] of Rr) ctx.lineTo(x, y); ctx.lineTo(t / 2, 0); ctx.closePath();
  ctx.fillStyle = HEDGE; ctx.fill();
  ctx.save(); ctx.clip();
  const g = ctx.createLinearGradient(-t / 2, 0, t / 2, 0);
  g.addColorStop(0, shade(HEDGE, 0.38)); g.addColorStop(0.5, shade(HEDGE, 0.08)); g.addColorStop(1, shade(HEDGE, -0.3));
  ctx.fillStyle = g; ctx.fillRect(-t, -Lz - h - 0.5, t * 2, Lz + h + 1);
  // the front end face (only the front-most segment's shows; the others are covered by the next one)
  const fg = ctx.createLinearGradient(0, -h, 0, 0); fg.addColorStop(0, shade(HEDGE, -0.1)); fg.addColorStop(1, shade(HEDGE, -0.45));
  ctx.fillStyle = fg; ctx.fillRect(-t, -h + 0.02, t * 2, h);
  hedgeTexture(ctx, -t / 2, -Lz - h - 0.2, t / 2, 0, R, lw, 60);
  // a dog-rose or honeysuckle scrambling through some stretches
  if (R() < 0.45) {
    const col = R() < 0.6 ? '#ffb3cc' : '#fff0b8', y0 = -h - Lz * (0.15 + R() * 0.5);
    for (let i = 0; i < 9; i++) {
      const x = (R() - 0.5) * t * 0.85, y = y0 - R() * Lz * 0.35, r = 0.035 + R() * 0.015;
      ctx.fillStyle = '#3f7f36'; ctx.beginPath(); ctx.ellipse(x + 0.04, y + 0.03, 0.04, 0.02, 0.6, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.strokeStyle = ink(col, 0.5); ctx.lineWidth = lw * 0.5;
      for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.6, r * 0.55, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  ctx.strokeStyle = inkC; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(-t / 2, 0); for (const [x, y] of L) ctx.lineTo(x, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(t / 2, 0); for (const [x, y] of Rr.slice().reverse()) ctx.lineTo(x, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-t / 2, 0); ctx.lineTo(t / 2, 0); ctx.stroke();
  ctx.strokeStyle = rgba(inkC, 0.4); ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(-t / 2, -h + 0.02); ctx.lineTo(t / 2, -h + 0.02); ctx.stroke();
}
// potted topiary ball (gateways)
export function paintTopiary(ctx, px, seed = 1) {
  const R = rng(seed), lw = LW(px, 1.5);
  shadow(ctx, 0.12, 0.42, 0.14, 0.4);
  const terra = '#d9774a';
  ctx.beginPath(); poly(ctx, [[-0.26, -0.4], [0.26, -0.4], [0.2, 0], [-0.2, 0]]);
  const g = ctx.createLinearGradient(-0.26, 0, 0.26, 0); g.addColorStop(0, shade(terra, 0.3)); g.addColorStop(1, shade(terra, -0.35));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(terra, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); roundRect(ctx, -0.3, -0.5, 0.6, 0.12, 0.03); ctx.fillStyle = shade(terra, 0.12); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#6b4526'; ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.moveTo(0, -0.5); ctx.lineTo(0, -0.62); ctx.stroke();
  paintCanopy(ctx, [{ x: 0, y: -0.92, r: 0.36 }], '#3f8f3e', px, R, { leafy: 1.2, leafSize: 0.5 });
}

// ------------------------------------------------------------------------------------------ pond jetty
const WOOD = '#b98a5a';
// jetty along x: land end at x = 0, reaching left to -len over the water; anchor on its front edge at the land end
export function paintJetty(ctx, px, len = 1.9) {
  const lw = LW(px, 1.5), D = 0.62 * SQ, h = 0.2, th = 0.07;
  // posts into the water (front) with little ripples, reflections
  for (const x of [-len + 0.1, -len * 0.5, -0.12]) {
    softEllipse(ctx, x, 0.06, 0.16, 0.05, '#0d3a52', 0.3, 0.3);
    ctx.fillStyle = 'rgba(40,70,90,0.35)'; ctx.fillRect(x - 0.05, -h + th, 0.1, h + 0.12);
    ctx.beginPath(); ctx.rect(x - 0.055, -h + th, 0.11, h - th + 0.04);
    ctx.fillStyle = shade(WOOD, -0.35); ctx.fill(); ctx.strokeStyle = ink(WOOD, 0.66); ctx.lineWidth = lw * 0.8; ctx.stroke();
    ctx.strokeStyle = 'rgba(220,245,255,0.7)'; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.ellipse(x, 0.045, 0.1, 0.03, 0, 0.2, Math.PI - 0.2); ctx.stroke();
  }
  // deck
  ctx.beginPath(); ctx.rect(-len, -h - D, len, D);
  const g = ctx.createLinearGradient(0, -h - D, 0, -h); g.addColorStop(0, shade(WOOD, 0.25)); g.addColorStop(1, shade(WOOD, -0.05));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  for (let x = -len + 0.17; x < 0; x += 0.17) {
    ctx.strokeStyle = rgba(ink(WOOD, 0.5), 0.75); ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(x, -h - D); ctx.lineTo(x, -h); ctx.stroke();
    ctx.strokeStyle = rgba(shade(WOOD, 0.4), 0.6); ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.moveTo(x + 0.015, -h - D); ctx.lineTo(x + 0.015, -h); ctx.stroke();
    ctx.fillStyle = rgba('#3a2a1a', 0.6); ctx.beginPath(); ctx.arc(x - 0.08, -h - D * 0.2, 0.012, 0, TAU); ctx.arc(x - 0.08, -h - D * 0.8, 0.012, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = ink(WOOD, 0.66); ctx.lineWidth = lw; ctx.strokeRect(-len, -h - D, len, D);
  // front edge board
  ctx.beginPath(); ctx.rect(-len, -h, len, th); ctx.fillStyle = shade(WOOD, -0.25); ctx.fill(); ctx.stroke();
  // mooring post with rope at the far end, a lantern post at the land end
  const mx = -len + 0.08;
  ctx.beginPath(); roundRect(ctx, mx - 0.06, -h - D - 0.42, 0.12, 0.5, 0.03); ctx.fillStyle = shade(WOOD, -0.15); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#e0cfa0'; ctx.lineWidth = lw * 1.4; ctx.beginPath(); ctx.ellipse(mx, -h - D - 0.2, 0.08, 0.035, 0, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx + 0.06, -h - D - 0.18); ctx.quadraticCurveTo(mx + 0.25, -h - D + 0.2, mx + 0.1, -h + 0.05); ctx.stroke();
  const lx = -0.12;
  ctx.beginPath(); roundRect(ctx, lx - 0.045, -h - D - 1.05, 0.09, 1.1, 0.02); ctx.fillStyle = shade(WOOD, -0.2); ctx.fill(); ctx.strokeStyle = ink(WOOD, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx, -h - D - 1.0); ctx.lineTo(lx - 0.2, -h - D - 1.0); ctx.stroke();
  const ly = -h - D - 0.82;
  ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(lx - 0.2, -h - D - 1.0); ctx.lineTo(lx - 0.2, ly - 0.1); ctx.stroke();
  ctx.beginPath(); roundRect(ctx, lx - 0.28, ly - 0.1, 0.16, 0.2, 0.03); ctx.fillStyle = '#ffe7a3'; ctx.fill(); ctx.strokeStyle = '#3a3a44'; ctx.stroke();
  ctx.fillStyle = '#3a3a44'; ctx.beginPath(); poly(ctx, [[lx - 0.3, ly - 0.1], [lx - 0.1, ly - 0.1], [lx - 0.2, ly - 0.18]]); ctx.fill();
  // a bucket
  ctx.beginPath(); poly(ctx, [[-len * 0.62 - 0.1, -h - D * 0.4 - 0.18], [-len * 0.62 + 0.1, -h - D * 0.4 - 0.18], [-len * 0.62 + 0.08, -h - D * 0.4], [-len * 0.62 - 0.08, -h - D * 0.4]]);
  ctx.fillStyle = '#7fa6c9'; ctx.fill(); ctx.strokeStyle = ink('#7fa6c9', 0.62); ctx.lineWidth = lw * 0.8; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-len * 0.62, -h - D * 0.4 - 0.18, 0.1, 0.03, 0, 0, TAU); ctx.fillStyle = '#4a6a88'; ctx.fill(); ctx.stroke();
}
export const JETTY_LAMP = [-0.32, -0.2 - 0.62 * SQ - 0.82];

// ------------------------------------------------------------------------------------------ pond plants
export function paintIris(ctx, px, seed = 1, size = 1) {
  const R = rng(seed), lw = LW(px, 1.1), s = size;
  softEllipse(ctx, 0.05, 0.01, 0.4 * s, 0.1 * s, '#173512', 0.3);
  const col = R() < 0.5 ? '#7a6ff0' : '#ffd23f';
  for (let i = 0; i < 9; i++) {
    const t = i / 8 - 0.5, a = t * 0.9 + (R() - 0.5) * 0.2, len = (0.55 + R() * 0.35) * s;
    const x = t * 0.28 * s, tx = x + Math.sin(a) * len, ty = -Math.cos(a) * len;
    ctx.beginPath(); ctx.moveTo(x - 0.025, 0); ctx.quadraticCurveTo(x + (tx - x) * 0.3 - 0.03, -len * 0.5, tx, ty); ctx.quadraticCurveTo(x + (tx - x) * 0.3 + 0.03, -len * 0.5, x + 0.025, 0); ctx.closePath();
    ctx.fillStyle = i % 2 ? '#5aa845' : '#4a983e'; ctx.fill(); ctx.strokeStyle = '#2c6325'; ctx.lineWidth = lw; ctx.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const x = (R() - 0.5) * 0.3 * s, h = (0.6 + R() * 0.25) * s;
    stem(ctx, x, 0, x + 0.02, -h, 0.02, '#4a8f36', lw * 1.2);
    const y = -h;
    ctx.fillStyle = col; ctx.strokeStyle = ink(col, 0.6); ctx.lineWidth = lw * 0.8;
    for (const a of [-0.9, 0.9]) { ctx.beginPath(); ctx.ellipse(x + Math.sin(a) * 0.06, y + 0.05, 0.035, 0.08, a, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(x, y - 0.05, 0.03, 0.08, 0, 0, TAU); ctx.fillStyle = shade(col, 0.25); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.ellipse(x, y + 0.02, 0.012, 0.03, 0, 0, TAU); ctx.fill();
  }
}

// ------------------------------------------------------------------------------------------ lamp post
export function paintLamp(ctx, px) {
  const lw = LW(px, 1.5), iron = '#3b3a46';
  shadow(ctx, 0.12, 0.28, 0.09, 0.42);
  ctx.beginPath(); roundRect(ctx, -0.13, -0.16, 0.26, 0.16, 0.03); ctx.fillStyle = iron; ctx.fill();
  ctx.beginPath(); roundRect(ctx, -0.045, -1.72, 0.09, 1.58, 0.02);
  const g = ctx.createLinearGradient(-0.045, 0, 0.045, 0); g.addColorStop(0, '#6a6878'); g.addColorStop(1, '#25242c');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#6a6878'; ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.arc(0.1, -1.6, 0.08, Math.PI * 0.5, Math.PI * 1.6); ctx.stroke();
  // lantern
  const y = -1.9;
  ctx.fillStyle = iron; ctx.beginPath(); poly(ctx, [[-0.16, y - 0.16], [0.16, y - 0.16], [0, y - 0.32]]); ctx.fill();
  ctx.beginPath(); poly(ctx, [[-0.13, y - 0.14], [0.13, y - 0.14], [0.1, y + 0.14], [-0.1, y + 0.14]]);
  const lg = ctx.createLinearGradient(0, y - 0.14, 0, y + 0.14); lg.addColorStop(0, '#fff6cf'); lg.addColorStop(1, '#ffd98a');
  ctx.fillStyle = lg; ctx.fill(); ctx.strokeStyle = iron; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, y - 0.14); ctx.lineTo(0, y + 0.14); ctx.stroke();
  ctx.fillStyle = iron; ctx.fillRect(-0.12, y + 0.14, 0.24, 0.05);
  ctx.beginPath(); ctx.arc(0, y - 0.35, 0.04, 0, TAU); ctx.fill();
  // a climbing sweet pea
  ctx.strokeStyle = '#4f8f3a'; ctx.lineWidth = lw * 0.7;
  ctx.beginPath(); ctx.moveTo(-0.05, -0.1); ctx.bezierCurveTo(0.12, -0.4, -0.12, -0.7, 0.06, -1.0); ctx.stroke();
  for (const [x, yy, c] of [[0.07, -0.35, '#ff8fb8'], [-0.08, -0.6, '#c78bff'], [0.05, -0.88, '#ff8fb8'], [-0.05, -0.2, '#5aa843']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, yy, 0.04, 0, TAU); ctx.fill(); }
}
export const LAMP_Y = -1.9;

// ------------------------------------------------------------------------------------------ kitchen garden
function raisedBed(ctx, px, w, d, h, R) {
  const lw = LW(px, 1.5), wood = '#b07a4a', D = d * SQ;
  shadow(ctx, w / 2 + 0.12, w * 0.58, 0.22, 0.42);
  // front planks
  ctx.beginPath(); ctx.rect(0, -h, w, h);
  const g = ctx.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, shade(wood, 0.15)); g.addColorStop(1, shade(wood, -0.3));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = rgba(ink(wood, 0.5), 0.7); ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w, -h / 2); ctx.stroke();
  ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.strokeRect(0, -h, w, h);
  // soil top + back rim
  ctx.beginPath(); ctx.rect(0.06, -h - D + 0.06, w - 0.12, D - 0.06); ctx.fillStyle = '#4e321f'; ctx.fill();
  for (let i = 0; i < w * 40; i++) { ctx.fillStyle = R() < 0.5 ? 'rgba(130,90,58,0.8)' : 'rgba(30,16,8,0.5)'; ctx.beginPath(); ctx.arc(0.08 + R() * (w - 0.16), -h - D + 0.08 + R() * (D - 0.1), 0.012 + R() * 0.012, 0, TAU); ctx.fill(); }
  ctx.fillStyle = shade(wood, 0.3); ctx.fillRect(0, -h - D, w, 0.07); ctx.fillRect(0, -h - D, 0.07, D); ctx.fillRect(w - 0.07, -h - D, 0.07, D);
  ctx.fillStyle = shade(wood, 0.35); ctx.fillRect(0, -h - 0.05, w, 0.06);
  ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.strokeRect(0, -h - D, w, D);
  // corner posts
  for (const x of [0.03, w - 0.03]) { ctx.beginPath(); roundRect(ctx, x - 0.05, -h - 0.12, 0.1, h + 0.12, 0.02); ctx.fillStyle = shade(wood, -0.1); ctx.fill(); ctx.stroke(); }
  return { top: -h - D, bottom: -h, D };
}
function lettuce(ctx, x, y, r, px, col = '#8fd45e') {
  const lw = LW(px, 1);
  softEllipse(ctx, x + 0.02, y + 0.02, r * 1.2, r * 0.45, '#1d140a', 0.35);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.45, y - r * 0.3 + Math.sin(a) * r * 0.25, r * 0.55, r * 0.4, a, 0, TAU);
    ctx.fillStyle = i % 2 ? col : shade(col, -0.12); ctx.fill(); ctx.strokeStyle = ink(col, 0.62); ctx.lineWidth = lw * 0.7; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(x, y - r * 0.4, r * 0.35, 0, TAU); ctx.fillStyle = shade(col, 0.3); ctx.fill(); ctx.stroke();
}
function cabbage(ctx, x, y, r, px) {
  const lw = LW(px, 1), col = '#7fb59a';
  softEllipse(ctx, x + 0.02, y + 0.02, r * 1.3, r * 0.45, '#1d140a', 0.35);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; leaf(ctx, x, y, r * 1.2, r * 0.6, a * 0.5 - 1.3 + i * 0.1, i % 2 ? '#6aa88a' : '#5e9a7e', lw * 0.7); }
  ctx.beginPath(); ctx.arc(x, y - r * 0.55, r * 0.55, 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.75, r * 0.05, x, y - r * 0.55, r * 0.6); g.addColorStop(0, '#d4f0c0'); g.addColorStop(1, col);
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(col, 0.62); ctx.lineWidth = lw * 0.8; ctx.stroke();
  ctx.strokeStyle = rgba(ink(col, 0.5), 0.5); ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.arc(x + r * 0.1, y - r * 0.55, r * 0.35, 2.2, 4.6); ctx.stroke();
}
function carrots(ctx, x, y, px, R) {
  const lw = LW(px, 0.9);
  ctx.fillStyle = '#ff8c2e'; ctx.strokeStyle = '#a04a10'; ctx.lineWidth = lw * 0.7;
  ctx.beginPath(); ctx.ellipse(x, y - 0.01, 0.035, 0.022, 0, 0, TAU); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.35 + (R() - 0.5) * 0.2, l = 0.14 + R() * 0.05;
    ctx.strokeStyle = '#4f9a3c'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y - 0.02); ctx.lineTo(x + Math.sin(a) * l, y - 0.02 - Math.cos(a) * l); ctx.stroke();
    ctx.fillStyle = '#6cbc4a'; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.arc(x + Math.sin(a) * l * k / 3.5, y - 0.02 - Math.cos(a) * l * k / 3.5, 0.018, 0, TAU); ctx.fill(); }
  }
}
function beanPoles(ctx, x0, x1, top, bottom, px, R, fruit = '#e8403c') {
  const lw = LW(px, 1.2);
  const poles = [];
  for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 3) poles.push(x);
  for (const x of poles) { ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = lw * 1.4; ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x + (x < (x0 + x1) / 2 ? 0.08 : -0.08), top); ctx.stroke(); }
  for (const x of poles) {
    const tx = x + (x < (x0 + x1) / 2 ? 0.08 : -0.08);
    for (let k = 0; k < 9; k++) {
      const t = k / 8, px0 = x + (tx - x) * t + Math.sin(t * 12 + x * 5) * 0.05, py = bottom + (top - bottom) * t;
      leaf(ctx, px0, py, 0.12, 0.06, (k % 2 ? 1 : -1) * (0.8 + R() * 0.4), k % 2 ? '#5aab4c' : '#4a9a3e', lw * 0.6);
      if (R() < 0.35) { ctx.fillStyle = fruit; ctx.strokeStyle = ink(fruit, 0.6); ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.arc(px0 + 0.04, py + 0.03, 0.035, 0, TAU); ctx.fill(); ctx.stroke(); }
    }
  }
}
// raised vegetable bed (2.2 × 0.9) with crops: 0 lettuces & carrots, 1 cabbages, 2 beans / tomatoes on canes, 3 strawberries & onions
export function paintVegBed(ctx, px, seed = 1, crop = 0) {
  const R = rng(seed), w = 2.2;
  const bed = raisedBed(ctx, px, w, 0.9, 0.3, R);
  const rows = [bed.top + 0.12, bed.top + bed.D * 0.5, bed.bottom - 0.08];
  if (crop === 0) {
    for (let x = 0.3; x < w - 0.1; x += 0.36) carrots(ctx, x + (R() - 0.5) * 0.04, rows[0] + 0.05, px, R);
    for (let x = 0.28; x < w - 0.1; x += 0.42) lettuce(ctx, x + (R() - 0.5) * 0.05, rows[1] + 0.08, 0.13 + R() * 0.03, px, R() < 0.3 ? '#c96a8a' : '#8fd45e');
    for (let x = 0.2; x < w - 0.1; x += 0.3) carrots(ctx, x + (R() - 0.5) * 0.04, rows[2], px, R);
  } else if (crop === 1) {
    for (let x = 0.35; x < w - 0.1; x += 0.5) cabbage(ctx, x + (R() - 0.5) * 0.05, rows[1] - 0.02, 0.17, px);
    for (let x = 0.25; x < w - 0.1; x += 0.5) cabbage(ctx, x + 0.2 + (R() - 0.5) * 0.05, rows[2] + 0.02, 0.16, px);
  } else if (crop === 2) {
    beanPoles(ctx, 0.25, 0.95, bed.top - 1.15, rows[1] + 0.05, px, R, '#ff5a3c');
    beanPoles(ctx, 1.25, 1.95, bed.top - 1.05, rows[1] + 0.05, px, R, '#e8403c');
    for (let x = 0.3; x < w - 0.1; x += 0.45) lettuce(ctx, x, rows[2] + 0.02, 0.12, px);
  } else {
    // strawberries under straw + onions
    for (let x = 0.2; x < w - 0.1; x += 0.22) {
      ctx.strokeStyle = '#4f9a3c'; ctx.lineWidth = LW(px, 1.2);
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x, rows[0] + 0.06); ctx.lineTo(x + (k - 1) * 0.03, rows[0] - 0.14); ctx.stroke(); }
    }
    for (let x = 0.25; x < w - 0.1; x += 0.3) {
      ctx.fillStyle = 'rgba(230,200,120,0.8)'; ctx.fillRect(x - 0.12, rows[2] - 0.02, 0.24, 0.05);
      for (let k = 0; k < 4; k++) leaf(ctx, x + (k - 1.5) * 0.05, rows[2], 0.11, 0.06, (k - 1.5) * 0.6, '#4f9e48', LW(px, 0.8));
      for (let k = 0; k < 2; k++) { ctx.fillStyle = '#e8303c'; ctx.strokeStyle = '#7a1420'; ctx.lineWidth = LW(px, 0.6); ctx.beginPath(); ctx.ellipse(x - 0.05 + k * 0.11, rows[2] + 0.01, 0.028, 0.035, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
    }
    for (let x = 0.3; x < w - 0.1; x += 0.4) lettuce(ctx, x, rows[1] + 0.06, 0.12, px, '#a8d86a');
  }
}
export function paintScarecrow(ctx, px) {
  const lw = LW(px, 1.5), wood = '#8a6340';
  shadow(ctx, 0.2, 0.45, 0.12, 0.38);
  ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw * 3.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -1.9); ctx.moveTo(-0.62, -1.35); ctx.lineTo(0.62, -1.35); ctx.stroke();
  ctx.strokeStyle = wood; ctx.lineWidth = lw * 1.8; ctx.stroke();
  // shirt
  const shirt = '#5b8def';
  ctx.beginPath(); ctx.moveTo(-0.6, -1.42); ctx.lineTo(-0.18, -1.48); ctx.lineTo(0.18, -1.48); ctx.lineTo(0.6, -1.42); ctx.lineTo(0.56, -1.22); ctx.lineTo(0.22, -1.26); ctx.lineTo(0.26, -0.72); ctx.lineTo(-0.26, -0.72); ctx.lineTo(-0.22, -1.26); ctx.lineTo(-0.56, -1.22); ctx.closePath();
  const g = ctx.createLinearGradient(-0.3, 0, 0.3, 0); g.addColorStop(0, shade(shirt, 0.2)); g.addColorStop(1, shade(shirt, -0.25));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(shirt, 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-0.12, -1.12, 0.14, 0.14); ctx.strokeRect(-0.12, -1.12, 0.14, 0.14);
  ctx.fillStyle = '#e8403c'; ctx.fillRect(0.3, -1.4, 0.12, 0.1);
  // straw tufts at cuffs and hem
  ctx.strokeStyle = '#e6c15a'; ctx.lineWidth = lw * 0.8;
  for (const [x, y, d] of [[-0.6, -1.32, -1], [0.6, -1.32, 1]]) for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d * (0.08 + k * 0.02), y - 0.04 + k * 0.035); ctx.stroke(); }
  for (let k = 0; k < 6; k++) { const x = -0.22 + k * 0.09; ctx.beginPath(); ctx.moveTo(x, -0.72); ctx.lineTo(x + (k % 2 ? 0.03 : -0.03), -0.6); ctx.stroke(); }
  // head: a sack with a button face
  ctx.beginPath(); ctx.arc(0, -1.66, 0.19, 0, TAU); ctx.fillStyle = '#e9d6a8'; ctx.fill(); ctx.strokeStyle = ink('#e9d6a8', 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(-0.06, -1.69, 0.025, 0, TAU); ctx.arc(0.06, -1.69, 0.025, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.arc(0, -1.62, 0.07, 0.3, Math.PI - 0.3); ctx.stroke();
  ctx.fillStyle = '#ff9a8a'; ctx.beginPath(); ctx.arc(-0.11, -1.61, 0.03, 0, TAU); ctx.arc(0.11, -1.61, 0.03, 0, TAU); ctx.fill();
  // straw hat
  ctx.beginPath(); ctx.ellipse(0, -1.8, 0.34, 0.08, -0.08, 0, TAU); ctx.fillStyle = '#e6c15a'; ctx.fill(); ctx.strokeStyle = ink('#e6c15a', 0.62); ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.17, -1.81); ctx.quadraticCurveTo(-0.15, -2.04, 0, -2.04); ctx.quadraticCurveTo(0.15, -2.04, 0.17, -1.83); ctx.closePath(); ctx.fillStyle = '#f0d272'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8403c'; ctx.fillRect(-0.16, -1.88, 0.32, 0.05);
  // a crow keeping it company
  const bx = 0.5, by = -1.4;
  ctx.fillStyle = '#2b2a38'; ctx.beginPath(); ctx.ellipse(bx, by - 0.1, 0.1, 0.08, -0.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(bx + 0.08, by - 0.2, 0.055, 0, TAU); ctx.fill();
  ctx.beginPath(); poly(ctx, [[bx - 0.06, by - 0.08], [bx - 0.22, by - 0.02], [bx - 0.08, by - 0.14]]); ctx.fill();
  ctx.fillStyle = '#f2a33a'; ctx.beginPath(); poly(ctx, [[bx + 0.12, by - 0.21], [bx + 0.2, by - 0.19], [bx + 0.12, by - 0.18]]); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx + 0.09, by - 0.22, 0.012, 0, TAU); ctx.fill();
}
export function paintPumpkins(ctx, px, seed = 1) {
  const R = rng(seed), lw = LW(px, 1.3);
  shadow(ctx, 0.1, 0.7, 0.18, 0.35);
  // vines and big leaves
  ctx.strokeStyle = '#4f8f3a'; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(-0.6, -0.05); ctx.bezierCurveTo(-0.3, -0.25, 0.1, 0.05, 0.6, -0.12); ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const x = -0.55 + i * 0.28, y = -0.08 - R() * 0.1;
    ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = Math.PI + (k / 4) * Math.PI; ctx.lineTo(x + Math.cos(a) * 0.18, y + Math.sin(a) * 0.12); } ctx.closePath();
    ctx.fillStyle = i % 2 ? '#5aa843' : '#4a9a3c'; ctx.fill(); ctx.strokeStyle = '#2c6325'; ctx.stroke();
  }
  const n = 1 + Math.floor(R() * 2.5);
  for (let i = 0; i < n; i++) {
    const x = -0.25 + i * 0.42 + (R() - 0.5) * 0.1, r = 0.2 + R() * 0.08, col = R() < 0.8 ? '#ff8c2e' : '#ffd23f';
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath(); ctx.ellipse(x + k * r * 0.32, -r * 0.8, r * (0.42 - Math.abs(k) * 0.05), r * 0.8, 0, 0, TAU);
      const g = ctx.createLinearGradient(x - r, -r * 1.5, x + r, 0); g.addColorStop(0, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.3));
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(col, 0.62); ctx.lineWidth = lw * 0.8; ctx.stroke();
    }
    ctx.strokeStyle = '#5a4a2a'; ctx.lineWidth = lw * 2; ctx.beginPath(); ctx.moveTo(x, -r * 1.55); ctx.quadraticCurveTo(x + 0.03, -r * 1.75, x + 0.08, -r * 1.8); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, -r * 1.1, r * 0.12, r * 0.25, 0.3, 0, TAU); ctx.fill();
  }
}
export function paintSunflowers(ctx, px, seed = 1, size = 1) {
  const R = rng(seed), lw = LW(px, 1.3), s = size;
  shadow(ctx, 0.12, 0.45 * s, 0.12, 0.35);
  const n = 2 + Math.floor(R() * 2);
  const L = [];
  for (let i = 0; i < n; i++) L.push({ x: (i - (n - 1) / 2) * 0.3 * s + (R() - 0.5) * 0.08, h: (1.7 + R() * 0.6) * s, tilt: (R() - 0.5) * 0.5 });
  L.sort((a, b) => b.h - a.h);
  for (const f of L) {
    stem(ctx, f.x, 0, f.x + f.tilt * 0.2, -f.h, f.tilt * 0.1, '#4a8a36', lw * 2.2);
    for (let k = 0; k < 4; k++) { const y = -f.h * (0.25 + k * 0.17); leaf(ctx, f.x + f.tilt * 0.2 * (y / -f.h), y, 0.26, 0.14, (k % 2 ? 1 : -1) * 1.1, k % 2 ? '#5aab4c' : '#4a9a3e', lw * 0.8); }
    const hx = f.x + f.tilt * 0.2, hy = -f.h, r = 0.27 * s;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(f.tilt * 0.6); ctx.scale(1, 0.92);
    for (let p = 0; p < 16; p++) {
      const a = (p / 16) * TAU;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75, r * 0.38, r * 0.13, a, 0, TAU);
      ctx.fillStyle = p % 2 ? '#ffd23f' : '#ffc21a'; ctx.fill(); ctx.strokeStyle = '#b8760e'; ctx.lineWidth = lw * 0.6; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, TAU);
    const g = ctx.createRadialGradient(-r * 0.12, -r * 0.12, r * 0.05, 0, 0, r * 0.5); g.addColorStop(0, '#8a5a24'); g.addColorStop(1, '#4a2a10');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#2a1608'; ctx.lineWidth = lw * 0.8; ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,140,0.45)'; for (let k = 0; k < 14; k++) { const a = k * 2.4, rr = Math.sqrt(k / 14) * r * 0.4; ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, r * 0.035, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------ shed clutter
export function paintWaterButt(ctx, px) {
  const lw = LW(px, 1.5), wood = '#9a6a42', r = 0.34, h = 0.78, ry = r * SQ * 0.7;
  softEllipse(ctx, 0.1, 0.03, 0.5, 0.16, '#173512', 0.4, 0.25);
  softEllipse(ctx, 0.35, 0.08, 0.3, 0.07, '#5a8aa8', 0.35, 0.3);
  ctx.beginPath(); ctx.moveTo(-r, -h); ctx.quadraticCurveTo(-r * 1.12, -h / 2, -r, 0); ctx.ellipse(0, 0, r, ry, 0, Math.PI, 0, true); ctx.quadraticCurveTo(r * 1.12, -h / 2, r, -h); ctx.closePath();
  const g = ctx.createLinearGradient(-r, 0, r, 0); g.addColorStop(0, shade(wood, 0.3)); g.addColorStop(0.4, wood); g.addColorStop(1, shade(wood, -0.4));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = rgba(ink(wood, 0.5), 0.5); ctx.lineWidth = lw * 0.6;
  for (let x = -r + 0.11; x < r; x += 0.11) { ctx.beginPath(); ctx.moveTo(x, -h); ctx.quadraticCurveTo(x * 1.1, -h / 2, x, 0.1); ctx.stroke(); }
  ctx.restore();
  for (const y of [-h * 0.2, -h * 0.78]) { ctx.strokeStyle = '#4a4a55'; ctx.lineWidth = lw * 1.8; ctx.beginPath(); ctx.ellipse(0, y, r * 1.08, ry, 0, 0, Math.PI); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(0, -h, r, ry, 0, 0, TAU); ctx.fillStyle = '#6b8fa8'; ctx.fill(); ctx.strokeStyle = ink(wood, 0.66); ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-0.08, -h - 0.02, 0.12, 0.03, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c9a23a'; ctx.fillRect(0.2, -0.25, 0.12, 0.05); ctx.fillRect(0.28, -0.25, 0.04, 0.1);
}
export function paintPotStack(ctx, px) {
  const lw = LW(px, 1.4), terra = '#d9774a';
  shadow(ctx, 0.1, 0.55, 0.14, 0.38);
  const pot = (x, y, s, tilt = 0) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(s, s);
    ctx.beginPath(); poly(ctx, [[-0.2, -0.36], [0.2, -0.36], [0.15, 0], [-0.15, 0]]);
    const g = ctx.createLinearGradient(-0.2, 0, 0.2, 0); g.addColorStop(0, shade(terra, 0.3)); g.addColorStop(1, shade(terra, -0.35));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(terra, 0.66); ctx.lineWidth = lw / s; ctx.stroke();
    ctx.beginPath(); roundRect(ctx, -0.24, -0.44, 0.48, 0.1, 0.03); ctx.fillStyle = shade(terra, 0.12); ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  pot(-0.2, 0, 1); pot(-0.2, -0.3, 0.95); pot(-0.2, -0.58, 0.9);
  pot(0.32, -0.02, 0.9, 1.35);
  // a trowel
  ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.moveTo(0.1, 0.02); ctx.lineTo(0.3, -0.08); ctx.stroke();
  ctx.fillStyle = '#b8c0c8'; ctx.strokeStyle = '#4a5058'; ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.ellipse(0.02, 0.05, 0.1, 0.04, -0.4, 0, TAU); ctx.fill(); ctx.stroke();
}
export function paintLogPile(ctx, px, seed = 1) {
  const R = rng(seed), lw = LW(px, 1.4), bark = '#8b5b3a';
  shadow(ctx, 0.15, 0.75, 0.18, 0.4);
  const logs = [[-0.42, -0.14], [-0.14, -0.14], [0.14, -0.14], [0.42, -0.14], [-0.28, -0.4], [0, -0.4], [0.28, -0.4], [-0.14, -0.65], [0.14, -0.65]];
  for (const [x, y] of logs) {
    const r = 0.14 + R() * 0.02;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = bark; ctx.fill(); ctx.strokeStyle = ink(bark, 0.66); ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.fillStyle = '#e8c08a'; ctx.fill();
    ctx.strokeStyle = rgba('#b0804e', 0.8); ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = rgba('#8cc152', 0.9); ctx.beginPath(); ctx.ellipse(-0.1, -0.8, 0.14, 0.05, 0, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------------------------------------ willow
export function paintWillow(ctx, px, seed = 1, size = 1) {
  const R = rng(seed), s = size, lw = Math.max(0.03, px * 1.6);
  softEllipse(ctx, 0.5 * s, 0.05, 2.2 * s, 0.85 * s, '#173512', 0.4, 0.25);
  // gnarly trunk
  const bark = '#7d5a3e';
  ctx.beginPath();
  ctx.moveTo(-0.45 * s, 0.03); ctx.quadraticCurveTo(-0.2 * s, -0.1, -0.2 * s, -0.8 * s); ctx.quadraticCurveTo(-0.28 * s, -1.4 * s, -0.5 * s, -2.1 * s);
  ctx.lineTo(-0.2 * s, -2.2 * s); ctx.quadraticCurveTo(0, -1.6 * s, 0.12 * s, -2.3 * s); ctx.lineTo(0.35 * s, -2.2 * s);
  ctx.quadraticCurveTo(0.2 * s, -1.2 * s, 0.24 * s, -0.7 * s); ctx.quadraticCurveTo(0.26 * s, -0.1, 0.5 * s, 0.03); ctx.quadraticCurveTo(0, 0.12, -0.45 * s, 0.03); ctx.closePath();
  const g = ctx.createLinearGradient(-0.3 * s, 0, 0.3 * s, 0); g.addColorStop(0, shade(bark, 0.3)); g.addColorStop(1, shade(bark, -0.4));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(bark, 0.66); ctx.lineWidth = lw; ctx.stroke();
  // the curtain: tapered drapes of leaves hanging from the crown, dark ones behind, sunlit ones in front
  const col = '#86c05a', inkC = ink(col, 0.66);
  const drape = (x0, y0, len, w, sway, c, light) => {
    const x1 = x0 + sway, y1 = y0 + len;
    ctx.beginPath();
    ctx.moveTo(x0 - w, y0);
    ctx.bezierCurveTo(x0 - w * 1.1, y0 + len * 0.35, x1 - w * 0.6, y0 + len * 0.7, x1 - w * 0.15, y1);
    ctx.quadraticCurveTo(x1, y1 + w * 0.5, x1 + w * 0.15, y1);
    ctx.bezierCurveTo(x1 + w * 0.6, y0 + len * 0.7, x0 + w * 1.1, y0 + len * 0.35, x0 + w, y0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, shade(c, -0.25)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, light ? 0.3 : 0.1));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw * 0.9; ctx.stroke();
    // leaf dashes down the drape
    ctx.strokeStyle = rgba(light ? shade(c, 0.55) : shade(c, -0.4), 0.7); ctx.lineWidth = lw * 0.7;
    for (let k = 1; k < 7; k++) {
      const u = k / 7, fx = x0 + sway * u * u, fy = y0 + len * u, ww = w * (1 - u * 0.7);
      ctx.beginPath(); ctx.moveTo(fx - ww * 0.6, fy - 0.05 * s); ctx.lineTo(fx, fy + 0.03 * s); ctx.lineTo(fx + ww * 0.6, fy - 0.05 * s); ctx.stroke();
    }
  };
  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 16, x0 = (t - 0.5) * 3.0 * s + (R() - 0.5) * 0.1, y0 = -2.35 * s - Math.sin(t * Math.PI) * 0.35 * s;
    drape(x0, y0, (1.3 + R() * 0.9) * s, (0.1 + R() * 0.05) * s, (x0 * 0.12 + (R() - 0.5) * 0.15) * s, i % 2 ? '#5a9842' : '#67a548', false);
  }
  // crown
  const clumps = [];
  for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; clumps.push({ x: Math.cos(a) * 1.35 * s, y: -2.5 * s + Math.sin(a) * 0.62 * s, r: (0.5 + R() * 0.22) * s }); }
  clumps.push({ x: 0, y: -2.7 * s, r: 0.85 * s });
  paintCanopy(ctx, clumps, col, px, R, { leafy: 0.7, leafSize: 0.7 });
  // front curtain: narrow drapes of uneven length, gaps showing the trunk in the middle
  const front = [];
  for (let i = 0; i < 22; i++) {
    const t = (i + R() * 0.7) / 22;
    if (t > 0.42 && t < 0.58 && R() < 0.7) continue;
    front.push(t);
  }
  front.sort(() => R() - 0.5);
  for (const t of front) {
    const x0 = (t - 0.5) * 3.3 * s, y0 = -2.25 * s - Math.sin(t * Math.PI) * 0.5 * s;
    const long = Math.sin(t * Math.PI);
    drape(x0, y0, (0.8 + R() * 1.1 + long * 0.5) * s, (0.07 + R() * 0.05) * s, (x0 * 0.1 + (R() - 0.5) * 0.14) * s, R() < 0.5 ? '#9fd166' : R() < 0.5 ? '#b3dd78' : '#86c05a', true);
  }
}

// ------------------------------------------------------------------------------------------ ferns, foxgloves, meadow tufts
function fern(ctx, x, size, R, px) {
  const lw = LW(px, 0.9);
  softEllipse(ctx, x + 0.03, 0.01, size * 0.8, size * 0.2, '#173512', 0.3);
  const n = 6;
  for (let f = 0; f < n; f++) {
    const a = -Math.PI / 2 + (f / (n - 1) - 0.5) * 2.6 + (R() - 0.5) * 0.2, len = size * (0.85 + R() * 0.4);
    const tx = x + Math.cos(a) * len, ty = Math.sin(a) * len * 0.95;
    const col = f % 2 ? '#4f9a3c' : '#62ae47';
    ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + (tx - x) * 0.4, ty * 0.7 - 0.06 * size, tx, ty); ctx.stroke();
    ctx.fillStyle = col;
    for (let k = 1; k < 9; k++) {
      const t = k / 9, fx = x + (tx - x) * t, fy = ty * t - Math.sin(t * Math.PI) * 0.06 * size, s = 0.1 * size * (1 - t * 0.7);
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(fx - side * Math.sin(a) * s * 0.7, fy + side * Math.cos(a) * s * 0.35, s, s * 0.36, a + side * 0.9, 0, TAU); ctx.fill(); }
    }
  }
}
export function paintFern(ctx, px, seed = 1, size = 1) { fern(ctx, 0, 0.5 * size, rng(seed), px); }
export function paintFoxgloves(ctx, px, seed = 1, size = 1) {
  const R = rng(seed);
  shadow(ctx, 0.05, 0.35 * size, 0.1, 0.3);
  const n = 2 + Math.floor(R() * 2);
  ctx.save(); ctx.scale(size, size);
  for (let i = 0; i < n; i++) spike(ctx, (i - (n - 1) / 2) * 0.2, 0.8 + R() * 0.35, R, px / size, FOX, 'fox');
  ctx.restore();
}
// soft clump of long meadow grass with seed heads and a few wildflowers
const MT = [['#ff4f45', '#ffffff'], ['#5d8dff', '#ffffff'], ['#ffd23f', '#ffffff'], ['#ffffff', '#b27ae8'], ['#ff8fb8', '#ffd23f']];
export function paintMeadowTuft(ctx, px, seed = 1, size = 1, cols = null) {
  const R = rng(seed), s = size, lw = Math.max(0.01, px * 1.0);
  softEllipse(ctx, 0.05 * s, 0.01, 0.42 * s, 0.11 * s, '#173512', 0.3);
  const n = 16;
  const blades = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1) - 0.5; blades.push({ t, a: t * 1.3 + (R() - 0.5) * 0.35, len: (0.38 + R() * 0.32) * s * (1 - Math.abs(t) * 0.35), d: R() }); }
  blades.sort((a, b) => a.d - b.d);
  for (const b of blades) {
    const x = b.t * 0.3 * s, tx = x + Math.sin(b.a) * b.len, ty = -Math.cos(b.a) * b.len, w = 0.022 * s;
    ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.quadraticCurveTo(x + (tx - x) * 0.25 - w * 0.4, -b.len * 0.55, tx, ty); ctx.quadraticCurveTo(x + (tx - x) * 0.25 + w * 0.4, -b.len * 0.55, x + w, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, ty); g.addColorStop(0, '#3f8430'); g.addColorStop(1, b.d > 0.5 ? '#b5df7c' : '#93cc62');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rgba('#285d22', 0.55); ctx.lineWidth = lw * 0.8; ctx.stroke();
  }
  // seed heads
  for (let i = 0; i < 3; i++) {
    const x = (R() - 0.5) * 0.3 * s, h = (0.62 + R() * 0.25) * s, lean = (R() - 0.5) * 0.25 * s;
    ctx.strokeStyle = '#8fa85a'; ctx.lineWidth = lw * 0.9; ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + lean * 0.3, -h * 0.5, x + lean, -h); ctx.stroke();
    ctx.fillStyle = '#d9c98a'; ctx.strokeStyle = rgba('#7a6a3a', 0.6); ctx.lineWidth = lw * 0.6;
    ctx.beginPath(); ctx.ellipse(x + lean, -h - 0.05 * s, 0.022 * s, 0.07 * s, lean, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // flowers
  const pal = cols || MT[Math.floor(R() * MT.length)];
  const m = 2 + Math.floor(R() * 3);
  for (let i = 0; i < m; i++) {
    const x = (R() - 0.5) * 0.4 * s, h = (0.3 + R() * 0.35) * s, c = pal[i % pal.length];
    ctx.strokeStyle = '#3f8a34'; ctx.lineWidth = lw * 1.1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 0.02, -h * 0.5, x, -h); ctx.stroke();
    const r = 0.055 * s;
    ctx.fillStyle = c; ctx.strokeStyle = ink(c, 0.55); ctx.lineWidth = lw * 0.7;
    for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.8, -h + Math.sin(a) * r * 0.65, r * 0.6, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = c === '#ffd23f' ? '#b8601a' : c === '#ff4f45' ? '#2a1414' : '#ffcf3a'; ctx.beginPath(); ctx.arc(x, -h, r * 0.4, 0, TAU); ctx.fill();
  }
}
