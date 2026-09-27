// Ambient life around the garden, all small cached sprites moved each frame (no per-frame painting):
// birds that land on the lawn, hop and peck, frogs on the lily pads, fish leaping from the pond, a rabbit that
// pops out of a hedge to nibble, a squirrel scampering along the fence, snails and ladybugs, dandelion fluff and
// falling leaves on the breeze, sun sparkles on the water; after dark a hedgehog snuffles along and moths circle
// the lamps. The dragonfly and the shadows of passing birds live here too.
import { Sprite, SpriteBank, drawSprite, softEllipse } from './paint.js';
import { shade, ink, rgba } from './color.js';
import { SQ, HY } from './view3q.js';
import { inBeds, SIDE, FENCE_LINE } from './plan.js';

const TAU = Math.PI * 2;
const bank = new SpriteBank();
const rnd = Math.random;
const LW = (px, k = 1.4) => Math.max(0.012, px * k);

// ------------------------------------------------------------------------------------------ critter art
// sizes are in units of the sprite (drawn scaled): anchor on the ground under the feet
const BIRDS = [
  { back: '#8a5a3a', breast: '#ff7a3a', belly: '#fff0dc', head: '#8a5a3a', wing: '#6f4a30' },          // robin
  { back: '#9a6a44', breast: '#e9d6b8', belly: '#f6ecdc', head: '#8c8a92', wing: '#7a4e2e', streak: 1 }, // sparrow
  { back: '#8ab04a', breast: '#ffd23f', belly: '#ffe680', head: '#3f7fe0', wing: '#4f8fe0', cheek: 1 },  // blue tit
];
function paintBird(ctx, px, k, pose) {
  const c = BIRDS[k], lw = LW(px, 1.3), inkC = ink(c.back, 0.7);
  ctx.save();
  if (pose === 'peck') { ctx.translate(0.02, -0.02); ctx.rotate(0.55); }
  // legs
  if (pose !== 'fly' && pose !== 'fly2') {
    ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(-0.02, -0.08); ctx.lineTo(-0.03, 0); ctx.moveTo(0.03, -0.08); ctx.lineTo(0.035, 0); ctx.stroke();
  }
  // tail
  ctx.beginPath(); ctx.moveTo(-0.1, -0.15); ctx.lineTo(-0.27, -0.2); ctx.lineTo(-0.25, -0.13); ctx.closePath();
  ctx.fillStyle = shade(c.back, -0.2); ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
  // body
  ctx.beginPath(); ctx.ellipse(0, -0.16, 0.14, 0.1, -0.15, 0, TAU);
  const g = ctx.createLinearGradient(0, -0.26, 0, -0.06); g.addColorStop(0, shade(c.back, 0.15)); g.addColorStop(1, shade(c.back, -0.15));
  ctx.fillStyle = g; ctx.fill(); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.ellipse(0, -0.16, 0.14, 0.1, -0.15, 0, TAU); ctx.clip();
  ctx.fillStyle = c.belly; ctx.beginPath(); ctx.ellipse(0.05, -0.08, 0.12, 0.06, -0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = c.breast; ctx.beginPath(); ctx.ellipse(0.1, -0.14, 0.07, 0.07, 0, 0, TAU); ctx.fill();
  if (c.streak) { ctx.strokeStyle = rgba('#5a3a22', 0.6); ctx.lineWidth = lw * 0.8; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-0.08 + i * 0.04, -0.24); ctx.lineTo(-0.06 + i * 0.04, -0.19); ctx.stroke(); } }
  ctx.restore();
  // wing
  if (pose === 'fly' || pose === 'fly2') {
    const up = pose === 'fly';
    ctx.beginPath(); ctx.moveTo(-0.04, -0.2); ctx.quadraticCurveTo(-0.02, up ? -0.46 : -0.02, 0.1, up ? -0.42 : 0.02); ctx.quadraticCurveTo(0.06, -0.24, 0.04, -0.18); ctx.closePath();
  } else { ctx.beginPath(); ctx.ellipse(-0.03, -0.17, 0.08, 0.05, -0.25, 0, TAU); }
  ctx.fillStyle = c.wing; ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw * 0.8; ctx.stroke();
  // head
  const hx = 0.12, hy = -0.26;
  ctx.beginPath(); ctx.arc(hx, hy, 0.07, 0, TAU); ctx.fillStyle = c.head; ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
  if (c.cheek) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(hx + 0.01, hy + 0.02, 0.045, 0.03, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#1e2a4a'; ctx.fillRect(hx - 0.06, hy + 0.005, 0.12, 0.012); }
  if (k === 0) { ctx.fillStyle = c.breast; ctx.beginPath(); ctx.ellipse(hx + 0.03, hy + 0.035, 0.035, 0.03, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.arc(hx + 0.03, hy - 0.012, 0.014, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx + 0.034, hy - 0.017, 0.005, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f2a33a'; ctx.beginPath(); ctx.moveTo(hx + 0.065, hy - 0.01); ctx.lineTo(hx + 0.11, hy + 0.005); ctx.lineTo(hx + 0.065, hy + 0.015); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function paintFrog(ctx, px, pose) {
  const lw = LW(px, 1.3), c = '#6cbf4a', inkC = ink(c, 0.66);
  if (pose === 'jump') {
    ctx.strokeStyle = inkC; ctx.lineWidth = lw * 2.4;
    ctx.beginPath(); ctx.moveTo(-0.08, -0.08); ctx.lineTo(-0.24, 0.02); ctx.moveTo(0.08, -0.08); ctx.lineTo(0.24, 0.02); ctx.stroke();
    ctx.strokeStyle = shade(c, -0.1); ctx.lineWidth = lw * 1.3; ctx.stroke();
  } else {
    // folded back legs
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.1, -0.05, 0.08, 0.05, s * 0.4, 0, TAU); ctx.fillStyle = shade(c, -0.12); ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke(); }
  }
  ctx.beginPath(); ctx.ellipse(0, -0.1, 0.12, 0.09, 0, 0, TAU);
  const g = ctx.createLinearGradient(0, -0.2, 0, 0); g.addColorStop(0, shade(c, 0.25)); g.addColorStop(1, shade(c, -0.2));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
  if (pose === 'croak') { ctx.beginPath(); ctx.ellipse(0, -0.045, 0.07, 0.05, 0, 0, TAU); ctx.fillStyle = '#f2f0c0'; ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw * 0.8; ctx.stroke(); }
  else { ctx.fillStyle = '#e6f0b0'; ctx.beginPath(); ctx.ellipse(0, -0.05, 0.06, 0.025, 0, 0, TAU); ctx.fill(); }
  // spots and eyes
  ctx.fillStyle = rgba(shade(c, -0.4), 0.6); ctx.beginPath(); ctx.arc(-0.04, -0.14, 0.015, 0, TAU); ctx.arc(0.05, -0.13, 0.012, 0, TAU); ctx.fill();
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(s * 0.06, -0.19, 0.04, 0, TAU); ctx.fillStyle = shade(c, 0.1); ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.062, -0.195, 0.022, 0, TAU); ctx.fillStyle = '#1b1b2a'; ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(s * 0.062 + 0.008, -0.203, 0.007, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = inkC; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.arc(0, -0.12, 0.04, 0.4, Math.PI - 0.4); ctx.stroke();
}
function paintRabbit(ctx, px, pose) {
  const lw = LW(px, 1.4), c = '#b89a82', inkC = ink(c, 0.66);
  const hop = pose === 'hop', nib = pose === 'nibble';
  ctx.save();
  if (hop) { ctx.translate(0, -0.03); ctx.rotate(-0.2); }
  // body
  ctx.beginPath(); hop ? ctx.ellipse(-0.02, -0.14, 0.2, 0.1, -0.1, 0, TAU) : ctx.ellipse(-0.04, -0.13, 0.15, 0.13, 0, 0, TAU);
  const g = ctx.createLinearGradient(0, -0.26, 0, 0); g.addColorStop(0, shade(c, 0.2)); g.addColorStop(1, shade(c, -0.2));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
  // cotton tail
  ctx.beginPath(); ctx.arc(-0.19, -0.15, 0.05, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = rgba(inkC, 0.6); ctx.stroke();
  // hind foot
  ctx.beginPath(); ctx.ellipse(-0.06, -0.01, 0.09, 0.03, 0, 0, TAU); ctx.fillStyle = shade(c, -0.1); ctx.fill(); ctx.strokeStyle = inkC; ctx.stroke();
  // head
  const hx = nib ? 0.12 : 0.1, hy = nib ? -0.1 : -0.25;
  // ears
  for (const [dx, a] of [[-0.02, -0.25], [0.03, 0.05]]) {
    ctx.save(); ctx.translate(hx + dx, hy - 0.05); ctx.rotate(nib ? a - 0.9 : a - 0.2);
    ctx.beginPath(); ctx.ellipse(0, -0.09, 0.035, 0.1, 0, 0, TAU); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -0.09, 0.015, 0.07, 0, 0, TAU); ctx.fillStyle = '#f2b8b0'; ctx.fill();
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(hx, hy, 0.08, 0.07, 0, 0, TAU); ctx.fillStyle = shade(c, 0.1); ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.arc(hx + 0.035, hy - 0.015, 0.014, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx + 0.039, hy - 0.02, 0.005, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e88a8a'; ctx.beginPath(); ctx.arc(hx + 0.075, hy + 0.005, 0.012, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(hx + 0.04, hy + 0.035, 0.03, 0.02, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function paintSquirrel(ctx, px, pose) {
  const lw = LW(px, 1.3), c = '#d9773a', inkC = ink(c, 0.66), run = pose === 'run';
  // big bushy tail
  ctx.beginPath();
  if (run) { ctx.moveTo(-0.1, -0.1); ctx.bezierCurveTo(-0.35, -0.08, -0.42, -0.3, -0.3, -0.36); ctx.bezierCurveTo(-0.22, -0.26, -0.24, -0.16, -0.08, -0.16); }
  else { ctx.moveTo(-0.08, -0.06); ctx.bezierCurveTo(-0.3, -0.05, -0.3, -0.42, -0.14, -0.44); ctx.bezierCurveTo(-0.04, -0.44, -0.02, -0.34, -0.1, -0.3); ctx.bezierCurveTo(-0.14, -0.26, -0.12, -0.14, -0.04, -0.12); }
  ctx.closePath();
  ctx.fillStyle = shade(c, 0.1); ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = rgba(shade(c, 0.5), 0.7); ctx.lineWidth = lw * 0.8; ctx.beginPath(); run ? ctx.arc(-0.28, -0.24, 0.06, 2.5, 5) : ctx.arc(-0.16, -0.32, 0.06, 3, 6); ctx.stroke();
  // body + head
  ctx.beginPath(); run ? ctx.ellipse(0, -0.1, 0.13, 0.065, -0.1, 0, TAU) : ctx.ellipse(0, -0.12, 0.08, 0.1, 0.2, 0, TAU);
  ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = inkC; ctx.stroke();
  ctx.fillStyle = '#fff0dc'; ctx.beginPath(); ctx.ellipse(run ? 0.04 : 0.04, run ? -0.07 : -0.1, 0.05, 0.035, 0, 0, TAU); ctx.fill();
  const hx = run ? 0.13 : 0.06, hy = run ? -0.15 : -0.23;
  ctx.beginPath(); ctx.moveTo(hx - 0.02, hy - 0.05); ctx.lineTo(hx - 0.01, hy - 0.1); ctx.lineTo(hx + 0.02, hy - 0.05); ctx.fillStyle = c; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(hx, hy, 0.055, 0, TAU); ctx.fillStyle = c; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.arc(hx + 0.022, hy - 0.01, 0.012, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(hx + 0.055, hy + 0.005, 0.008, 0, TAU); ctx.fill();
  // paws
  ctx.strokeStyle = inkC; ctx.lineWidth = lw;
  if (run) { ctx.beginPath(); ctx.moveTo(0.08, -0.07); ctx.lineTo(0.13, -0.01); ctx.moveTo(-0.07, -0.07); ctx.lineTo(-0.12, -0.01); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(0.02, -0.03); ctx.lineTo(0.03, 0); ctx.moveTo(-0.03, -0.03); ctx.lineTo(-0.04, 0); ctx.stroke(); ctx.fillStyle = '#b8845a'; ctx.beginPath(); ctx.ellipse(0.07, -0.15, 0.025, 0.03, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
}
function paintHedgehog(ctx, px, step) {
  const lw = LW(px, 1.3), c = '#8a6a4a', inkC = ink(c, 0.7);
  ctx.strokeStyle = '#4a3624'; ctx.lineWidth = lw * 1.4;
  const a = step ? 0.02 : -0.02;
  ctx.beginPath(); ctx.moveTo(-0.07 + a, -0.03); ctx.lineTo(-0.07 + a * 2, 0); ctx.moveTo(0.06 - a, -0.03); ctx.lineTo(0.06 - a * 2, 0); ctx.stroke();
  // spiny back
  ctx.beginPath(); ctx.moveTo(-0.16, -0.04);
  for (let i = 0; i <= 12; i++) { const t = i / 12, ang = Math.PI + t * Math.PI, r = i % 2 ? 0.15 : 0.19; ctx.lineTo(Math.cos(ang) * r * 1.05 - 0.01, -0.04 + Math.sin(ang) * r * 0.75); }
  ctx.closePath();
  ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = rgba('#d8c0a0', 0.6); ctx.lineWidth = lw * 0.7;
  for (let i = 0; i < 6; i++) { const x = -0.12 + i * 0.04; ctx.beginPath(); ctx.moveTo(x, -0.08); ctx.lineTo(x - 0.03, -0.14); ctx.stroke(); }
  // face
  ctx.beginPath(); ctx.moveTo(0.1, -0.1); ctx.quadraticCurveTo(0.2, -0.08, 0.22, -0.04); ctx.quadraticCurveTo(0.16, -0.01, 0.08, -0.03); ctx.closePath();
  ctx.fillStyle = '#e6cfae'; ctx.fill(); ctx.strokeStyle = inkC; ctx.stroke();
  ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.arc(0.225, -0.045, 0.014, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0.14, -0.065, 0.011, 0, TAU); ctx.fill();
}
function paintSnail(ctx, px) {
  const lw = LW(px, 1.2), shell = '#c98b52';
  ctx.beginPath(); ctx.moveTo(-0.1, 0); ctx.quadraticCurveTo(0.02, -0.04, 0.12, -0.01); ctx.quadraticCurveTo(0.15, -0.06, 0.13, -0.08); ctx.lineTo(0.16, -0.1);
  ctx.moveTo(0.12, -0.02); ctx.lineTo(0.12, 0.005); ctx.lineTo(-0.1, 0.005); ctx.closePath();
  ctx.fillStyle = '#c9c0a8'; ctx.fill(); ctx.strokeStyle = '#6a604a'; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.13, -0.07); ctx.lineTo(0.15, -0.12); ctx.moveTo(0.11, -0.06); ctx.lineTo(0.12, -0.11); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -0.06, 0.07, 0, TAU);
  const g = ctx.createRadialGradient(-0.02, -0.08, 0.01, 0, -0.06, 0.07); g.addColorStop(0, shade(shell, 0.35)); g.addColorStop(1, shade(shell, -0.25));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(shell, 0.66); ctx.stroke();
  ctx.strokeStyle = rgba(ink(shell, 0.5), 0.8); ctx.lineWidth = lw * 0.8; ctx.beginPath();
  for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * TAU * 1.6, r = 0.055 * (1 - t * 0.85); ctx.lineTo(Math.cos(a) * r, -0.06 + Math.sin(a) * r); }
  ctx.stroke();
}
function paintLadybug(ctx, px, open) {
  const lw = LW(px, 1.1);
  if (open) { ctx.fillStyle = 'rgba(230,240,255,0.7)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.07, -0.05, 0.05, 0.08, s * 0.6, 0, TAU); ctx.fill(); } }
  ctx.beginPath(); ctx.arc(0, -0.035, 0.045, 0, TAU); ctx.fillStyle = '#e8303c'; ctx.fill(); ctx.strokeStyle = '#5a0a14'; ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.arc(0.04, -0.035, 0.022, 0, TAU); ctx.fill();
  for (const [x, y] of [[-0.02, -0.055], [-0.015, -0.015], [0.01, -0.06]]) { ctx.beginPath(); ctx.arc(x, y, 0.008, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-0.015, -0.06, 0.008, 0, TAU); ctx.fill();
}
function paintFluff(ctx, px) {
  const lw = LW(px, 0.8);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = lw;
  for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 11) * Math.PI; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 0.12, -0.02 + Math.sin(a) * 0.1); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(0, -0.06, 0.12, 0.07, 0, Math.PI, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(150,120,80,0.9)'; ctx.lineWidth = lw * 1.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 0.08); ctx.stroke();
}
const LEAF_COLS = ['#e8a33a', '#d9722e', '#c9b13a', '#8fb84a', '#b8542e'];
function paintFallLeaf(ctx, px, k) {
  const c = LEAF_COLS[k % LEAF_COLS.length], lw = LW(px, 1);
  ctx.beginPath(); ctx.moveTo(-0.1, 0); ctx.quadraticCurveTo(0, -0.07, 0.1, 0); ctx.quadraticCurveTo(0, 0.07, -0.1, 0); ctx.closePath();
  ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = rgba(shade(c, 0.4), 0.8); ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(-0.13, 0); ctx.lineTo(0.08, 0); ctx.stroke();
}
function paintMoth(ctx, px) {
  ctx.fillStyle = 'rgba(245,240,225,0.95)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.05, 0, 0.055, 0.04, s * 0.5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#8a7a6a'; ctx.beginPath(); ctx.ellipse(0, 0, 0.012, 0.035, 0, 0, TAU); ctx.fill();
  void px;
}
function paintSparkle(ctx) {
  softEllipse(ctx, 0, 0, 0.5, 0.5, '#ffffff', 0.5, 0.05);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(0, -0.9); ctx.quadraticCurveTo(0.06, -0.06, 0.9, 0); ctx.quadraticCurveTo(0.06, 0.06, 0, 0.9); ctx.quadraticCurveTo(-0.06, 0.06, -0.9, 0); ctx.quadraticCurveTo(-0.06, -0.06, 0, -0.9); ctx.fill();
}
function paintDragonfly(ctx, px) {
  const lw = Math.max(0.03, px * 1.2);
  for (const [a, l] of [[-0.35, 0.62], [0.35, 0.62], [-0.2, 0.5], [0.2, 0.5]]) {
    ctx.save(); ctx.rotate(a + (a < 0 ? -Math.PI / 2 : Math.PI / 2));
    ctx.beginPath(); ctx.ellipse(0, -l * 0.5, 0.09, l * 0.5, 0, 0, TAU);
    ctx.fillStyle = 'rgba(220,245,255,0.6)'; ctx.fill(); ctx.strokeStyle = 'rgba(60,110,140,0.6)'; ctx.lineWidth = lw; ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(0, 0.15, 0.05, 0.42, 0, 0, TAU);
  const g = ctx.createLinearGradient(0, -0.3, 0, 0.6); g.addColorStop(0, '#3fd0e0'); g.addColorStop(1, '#2a6fd6');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#153a6a'; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -0.3, 0.09, 0, TAU); ctx.fillStyle = '#2aa7c8'; ctx.fill(); ctx.stroke();
}
function paintBirdShadow(ctx) {
  ctx.fillStyle = 'rgba(20,40,30,1)';
  ctx.beginPath(); ctx.moveTo(-0.9, -0.1); ctx.quadraticCurveTo(-0.4, -0.35, 0, 0.05); ctx.quadraticCurveTo(0.4, -0.35, 0.9, -0.1); ctx.quadraticCurveTo(0.4, -0.1, 0, 0.25); ctx.quadraticCurveTo(-0.4, -0.1, -0.9, -0.1); ctx.fill();
}

// sprites: every critter is drawn at a fixed world size k (units per sprite unit)
const SPR = {
  bird: (k, pose, r) => bank.get(`bird${k}${pose}`, r, (rr) => new Sprite(0.7, 0.6, 0.3, 0.5, rr, (c, px) => paintBird(c, px, k, pose))),
  frog: (pose, r) => bank.get('frog' + pose, r, (rr) => new Sprite(0.6, 0.35, 0.3, 0.28, rr, (c, px) => paintFrog(c, px, pose))),
  rabbit: (pose, r) => bank.get('rabbit' + pose, r, (rr) => new Sprite(0.6, 0.62, 0.3, 0.52, rr, (c, px) => paintRabbit(c, px, pose))),
  squirrel: (pose, r) => bank.get('squirrel' + pose, r, (rr) => new Sprite(0.7, 0.55, 0.42, 0.5, rr, (c, px) => paintSquirrel(c, px, pose))),
  hedgehog: (st, r) => bank.get('hedgehog' + st, r, (rr) => new Sprite(0.56, 0.3, 0.26, 0.24, rr, (c, px) => paintHedgehog(c, px, st))),
  snail: (r) => bank.get('snail', r, (rr) => new Sprite(0.4, 0.2, 0.18, 0.15, rr, paintSnail)),
  lady: (open, r) => bank.get('lady' + (open ? 1 : 0), r, (rr) => new Sprite(0.3, 0.2, 0.15, 0.15, rr, (c, px) => paintLadybug(c, px, open))),
  fluff: (r) => bank.get('fluff', r, (rr) => new Sprite(0.3, 0.24, 0.15, 0.14, rr, paintFluff)),
  leaf: (k, r) => bank.get('fleaf' + k, r, (rr) => new Sprite(0.3, 0.2, 0.15, 0.1, rr, (c, px) => paintFallLeaf(c, px, k))),
  moth: (r) => bank.get('moth', r, (rr) => new Sprite(0.24, 0.14, 0.12, 0.07, rr, paintMoth)),
  sparkle: (r) => bank.get('sparkle', r, (rr) => new Sprite(2, 2, 1, 1, rr, paintSparkle)),
  dragonfly: (r) => bank.get('dragonfly', r, (rr) => new Sprite(1.6, 1.6, 0.8, 0.8, rr, paintDragonfly)),
  birdshadow: (r) => bank.get('birdshadow', r, (rr) => new Sprite(2, 1, 1, 0.5, rr, paintBirdShadow)),
  shadow: (r) => bank.get('cshadow', r, (rr) => new Sprite(2.2, 1.2, 1.1, 0.6, rr, (c) => softEllipse(c, 0, 0, 1, 0.5, '#173512', 0.6, 0.25))),
};

// ------------------------------------------------------------------------------------------ helpers
function inView(v, x, z, m = 0) { const Y = z * SQ; return x > v.X0 - m && x < v.X1 + m && Y > v.Y0 - m && Y < v.Y1 + m; }
const ease = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------------------------------ life
export class Life {
  constructor(world) {
    this.w = world;
    this.t = 0;
    this.v = null;
    // dragonfly patrolling the pond
    const P = world.pondDef;
    this.fly = { x: P.x, z: P.z, y: 0.8, tx: P.x, tz: P.z, ty: 0.8, t: 0, face: 0, sortY: 0, draw: null };
    this.fly.draw = (ctx, s, t) => this._drawFly(ctx, s, t);
    this.flock = null; this.flockT = 8 + rnd() * 10;
    // lawn birds
    this.birds = [0, 1, 2].map((k) => ({ k, state: 'off', t: 2 + k * 3 + rnd() * 4, x: 0, z: 0, y: 0, face: 1, pose: 'stand', life: 0, sortY: 0, draw: null }));
    for (const b of this.birds) b.draw = (ctx, s) => this._drawBird(ctx, s, b);
    // frogs on the lily pads
    this.frogs = [{ pad: 0 }, { pad: 3 }].map((f, i) => ({ ...f, state: 'sit', t: 2 + i * 3, x: 0, z: 0, y: 0, face: i ? -1 : 1, croak: 0, from: null, to: null, p: 0, sortY: 0, draw: null }));
    for (const f of this.frogs) { f.draw = (ctx, s) => this._drawFrog(ctx, s, f); this._frogAt(f, f.pad); }
    // a leaping fish
    this.fish = { on: false, t: 5 + rnd() * 6, x: 0, z: 0, y: 0, p: 0, dir: 1, sortY: 0, draw: null };
    this.fish.draw = (ctx, s) => this._drawFish(ctx, s);
    // the rabbit, the squirrel and (after dark) the hedgehog
    this.rabbit = { state: 'off', t: 12 + rnd() * 15, x: 0, z: 0, y: 0, face: 1, hops: [], pose: 'sit', sortY: 0, draw: null };
    this.rabbit.draw = (ctx, s) => this._drawRabbit(ctx, s);
    this.squirrel = { state: 'off', t: 6 + rnd() * 10, x: 0, z: FENCE_LINE + 0.02, y: 1.02, face: 1, x1: 0, stop: 0, sortY: FENCE_LINE * SQ + 0.02, draw: null };
    this.squirrel.draw = (ctx, s) => this._drawSquirrel(ctx, s);
    this.hog = { state: 'off', t: 3, x: 0, z: 0, face: 1, tx: 0, tz: 0, stop: 0, left: 0, sortY: 0, draw: null };
    this.hog.draw = (ctx, s) => this._drawHog(ctx, s);
    // snails and ladybugs pottering about the edges
    this.snails = [[-7.6, 7.9], [-1.9, -8.1], [7.2, -0.3], [-13.9, -6.7], [5.1, 7.05]].map(([x, z], i) => ({ x, z, x0: x, z0: z, a: rnd() * TAU, sp: 0.035 + rnd() * 0.02, t: 0, sortY: 0, draw: null, i }));
    for (const sn of this.snails) sn.draw = (ctx, s) => this._drawSnail(ctx, s, sn);
    this.ladies = [[-3.4, 6.8], [4.5, -5.5], [-6.1, -2.1], [6.6, 1.2]].map(([x, z]) => ({ x, z, x0: x, z0: z, a: rnd() * TAU, t: rnd() * 3, fly: 0, y: 0, sortY: 0, draw: null }));
    for (const l of this.ladies) l.draw = (ctx, s) => this._drawLady(ctx, s, l);
    // drifting things: dandelion fluff, falling leaves, moths
    this.air = [];
    this.sparkles = [];
  }

  // ------------------------------------------------------------------------------------------ update
  update(dt, time) {
    this.t = time;
    const w = this.w, wk = w.weather.k;
    const v = w.stage.view(1.5);
    this.v = v;
    const day = 1 - Math.max(wk.night, wk.rain * 0.8);
    this._updateFly(dt);
    this._updateFlock(dt);
    for (const b of this.birds) this._updateBird(b, dt, v, day);
    for (const f of this.frogs) this._updateFrog(f, dt, wk);
    this._updateFish(dt, v);
    this._updateRabbit(dt, v, day);
    this._updateSquirrel(dt, v, day);
    this._updateHog(dt, v, wk.night);
    for (const sn of this.snails) {
      sn.t -= dt;
      if (sn.t <= 0) { sn.t = 2 + rnd() * 4; sn.a += (rnd() - 0.5) * 1.6; if (Math.hypot(sn.x - sn.x0, sn.z - sn.z0) > 0.6) sn.a = Math.atan2(sn.z0 - sn.z, sn.x0 - sn.x); }
      const sp = sn.sp * (1 + wk.rain * 1.5);
      sn.x += Math.cos(sn.a) * sp * dt; sn.z += Math.sin(sn.a) * sp * dt * 0.6;
      sn.sortY = sn.z * SQ;
    }
    for (const l of this.ladies) {
      l.t -= dt;
      if (l.fly > 0) {
        l.fly -= dt; const p = 1 - Math.max(0, l.fly) / 0.9;
        l.x = l.fx + (l.tx - l.fx) * p; l.z = l.fz + (l.tz - l.fz) * p; l.y = Math.sin(p * Math.PI) * 0.5;
      } else if (l.t <= 0) {
        if (rnd() < 0.25) { l.fly = 0.9; l.fx = l.x; l.fz = l.z; l.tx = l.x0 + (rnd() - 0.5) * 1.2; l.tz = l.z0 + (rnd() - 0.5) * 0.8; l.t = 3 + rnd() * 5; }
        else { l.t = 1 + rnd() * 3; l.a += (rnd() - 0.5) * 2; }
      } else { l.x += Math.cos(l.a) * 0.06 * dt; l.z += Math.sin(l.a) * 0.04 * dt; l.y = 0; }
      l.sortY = l.z * SQ + 0.01;
    }
    this._updateAir(dt, v, day, wk);
    this._updateSparkles(dt, day);
  }

  _updateFly(dt) {
    const f = this.fly, P = this.w.pondDef;
    f.t -= dt;
    if (f.t <= 0) {
      f.t = 0.8 + rnd() * 2.2;
      const a = rnd() * TAU, r = rnd();
      f.tx = P.x + Math.cos(a) * P.rx * 0.9 * r; f.tz = P.z + Math.sin(a) * P.rz * 0.9 * r; f.ty = 0.5 + rnd() * 0.9;
    }
    const k = 1 - Math.exp(-dt * 5), px = f.x;
    f.x += (f.tx - f.x) * k; f.z += (f.tz - f.z) * k; f.y += (f.ty - f.y) * k;
    if (Math.abs(f.x - px) > dt * 0.1) f.face = Math.atan2(f.tz - f.z, f.tx - f.x) + Math.PI / 2;
    f.sortY = f.z * SQ + 0.05;
  }
  _updateFlock(dt) {
    this.flockT -= dt;
    if (!this.flock && this.flockT <= 0) {
      const v = this.w.stage.view(2), dir = rnd() < 0.5 ? 1 : -1;
      const z0 = (v.Y0 + (v.Y1 - v.Y0) * (0.2 + rnd() * 0.6)) / SQ;
      this.flock = { x: dir > 0 ? v.X0 - 3 : v.X1 + 3, z: z0, dir, vz: (rnd() - 0.5) * 1.2, end: dir > 0 ? v.X1 + 3 : v.X0 - 3, n: 1 + Math.floor(rnd() * 3) };
    }
    if (this.flock) {
      const b = this.flock;
      b.x += b.dir * 5.5 * dt; b.z += b.vz * dt;
      if ((b.dir > 0 && b.x > b.end) || (b.dir < 0 && b.x < b.end)) { this.flock = null; this.flockT = 18 + rnd() * 25; }
    }
  }

  // an open bit of lawn in view (not on the beds, the pond, the hedges or a decoration)
  _lawnSpot(v, near = null, r = 0.5) {
    const w = this.w, P = w.pondDef;
    for (let i = 0; i < 14; i++) {
      let x, z;
      if (near) { const a = rnd() * TAU, d = r * (0.5 + rnd() * 0.5); x = near.x + Math.cos(a) * d; z = near.z + Math.sin(a) * d * 0.7; }
      else { x = v.X0 + 1 + rnd() * (v.X1 - v.X0 - 2); z = (v.Y0 + 1 + rnd() * (v.Y1 - v.Y0 - 2)) / SQ; }
      if (inBeds(x, z, 0.35) || Math.abs(x) > SIDE - 1.2 || z < FENCE_LINE + 1.1 || z > 13) continue;
      if (((x - P.x) / (P.rx + 0.5)) ** 2 + ((z - P.z) / (P.rz + 0.5)) ** 2 < 1) continue;
      if (w.blocked(x, z)) continue;
      return { x, z };
    }
    return null;
  }

  _updateBird(b, dt, v, day) {
    b.t -= dt;
    b.life += dt;
    switch (b.state) {
      case 'off': {
        if (b.t > 0 || day < 0.6) return;
        const spot = this._lawnSpot(v);
        if (!spot) { b.t = 2; return; }
        b.face = rnd() < 0.5 ? 1 : -1;
        b.fx = spot.x - b.face * (3 + rnd() * 2); b.fz = spot.z - 1 - rnd(); b.fy = 3.5;
        b.tx = spot.x; b.tz = spot.z; b.p = 0; b.dur = 1.4 + rnd() * 0.5; b.state = 'in'; b.life = 0;
        return;
      }
      case 'in': case 'out': {
        b.p += dt / b.dur;
        const p = Math.min(1, b.p), e = b.state === 'in' ? 1 - (1 - p) * (1 - p) : p * p;
        b.x = b.fx + (b.tx - b.fx) * e; b.z = b.fz + (b.tz - b.fz) * e;
        b.y = b.state === 'in' ? b.fy * (1 - p) * (1 - p) + Math.sin(p * Math.PI) * 0.3 : b.ty * p * p + Math.sin(p * Math.PI) * 0.5;
        b.pose = Math.sin(this.t * 38 + b.k) > 0 ? 'fly' : 'fly2';
        if (p >= 1) {
          if (b.state === 'in') { b.state = 'idle'; b.t = 0.4 + rnd(); b.y = 0; b.pose = 'stand'; }
          else { b.state = 'off'; b.t = 6 + rnd() * 14; }
        }
        break;
      }
      case 'idle': {
        b.pose = 'stand';
        if (b.t > 0) break;
        const leave = day < 0.6 || b.life > 18 + b.k * 7 || !inView(v, b.x, b.z, 2);
        const r = rnd();
        if (leave || r < 0.07) {
          b.state = 'out'; b.fx = b.x; b.fz = b.z; b.fy = 0; b.ty = 4; b.face = rnd() < 0.5 ? 1 : -1;
          b.tx = b.x + b.face * (5 + rnd() * 3); b.tz = b.z - 2 - rnd() * 2; b.p = 0; b.dur = 1.5;
        } else if (r < 0.5) { b.state = 'peck'; b.n = 1 + Math.floor(rnd() * 3); b.t = 0.28; b.pose = 'peck'; }
        else if (r < 0.9) {
          const to = this._lawnSpot(v, b, 0.45);
          if (to) { b.state = 'hop'; b.fx = b.x; b.fz = b.z; b.tx = to.x; b.tz = to.z; b.p = 0; b.face = to.x >= b.x ? 1 : -1; b.hopsLeft = 1 + Math.floor(rnd() * 2); }
          else b.t = 0.5;
        } else { b.face = -b.face; b.t = 0.6 + rnd() * 0.8; }
        break;
      }
      case 'peck': {
        if (b.t > 0) break;
        if (b.pose === 'peck') { b.pose = 'stand'; b.t = 0.18; }
        else if (--b.n > 0) { b.pose = 'peck'; b.t = 0.28; }
        else { b.state = 'idle'; b.t = 0.5 + rnd() * 1.2; }
        break;
      }
      case 'hop': {
        b.p += dt / 0.24;
        const p = Math.min(1, b.p);
        b.x = b.fx + (b.tx - b.fx) * p; b.z = b.fz + (b.tz - b.fz) * p; b.y = Math.sin(p * Math.PI) * 0.12;
        if (p >= 1) {
          b.y = 0;
          if (--b.hopsLeft > 0) { const to = this._lawnSpot(this.v, b, 0.3); if (to) { b.fx = b.x; b.fz = b.z; b.tx = to.x; b.tz = to.z; b.p = 0; b.face = to.x >= b.x ? 1 : -1; break; } }
          b.state = 'idle'; b.t = 0.3 + rnd() * 0.8;
        }
        break;
      }
      default: break;
    }
    b.sortY = b.z * SQ + 0.02;
  }

  _frogAt(f, i) {
    const l = this.w.lilies[i], P = this.w.pondDef;
    f.pad = i; f.x = P.x + l.x; f.z = P.z + l.z; f.y = 0.02;
  }
  _updateFrog(f, dt, wk) {
    f.t -= dt;
    f.croak = Math.max(0, f.croak - dt);
    if (f.state === 'sit') {
      if (f.t > 0) { if (rnd() < dt * (0.12 + wk.rain * 0.4 + wk.night * 0.3)) f.croak = 0.5; return; }
      // hop to a free pad
      const lil = this.w.lilies, taken = new Set(this.frogs.map((o) => o.pad));
      const free = lil.map((_, i) => i).filter((i) => !taken.has(i));
      const to = free[Math.floor(rnd() * free.length)];
      const P = this.w.pondDef;
      f.from = { x: f.x, z: f.z }; f.to = { x: P.x + lil[to].x, z: P.z + lil[to].z }; f.toPad = to; f.p = 0; f.state = 'hop';
      f.face = f.to.x >= f.x ? 1 : -1;
      this.w.ripple(f.x - P.x, f.z - P.z, true);
    } else {
      f.p += dt / 0.55;
      const p = Math.min(1, f.p);
      f.x = f.from.x + (f.to.x - f.from.x) * p; f.z = f.from.z + (f.to.z - f.from.z) * p; f.y = 0.02 + Math.sin(p * Math.PI) * 0.35;
      if (p >= 1) { this._frogAt(f, f.toPad); f.state = 'sit'; f.t = 4 + rnd() * 9; const P = this.w.pondDef; this.w.ripple(f.x - P.x, f.z - P.z, false); }
    }
    f.sortY = f.z * SQ + 0.05;
  }
  _updateFish(dt, v) {
    const f = this.fish, P = this.w.pondDef;
    if (!f.on) {
      f.t -= dt;
      if (f.t > 0 || !inView(v, P.x, P.z, 3)) return;
      const a = rnd() * TAU, r = rnd() * 0.55;
      f.x0 = P.x + Math.cos(a) * P.rx * r; f.z0 = P.z + Math.sin(a) * P.rz * r;
      f.dir = rnd() < 0.5 ? 1 : -1; f.p = 0; f.on = true; f.len = 0.55 + rnd() * 0.35;
      this.w.ripple(f.x0 - P.x, f.z0 - P.z, false);
      this._splash(f.x0, f.z0, 5);
    }
    f.p += dt / 0.85;
    const p = Math.min(1, f.p);
    f.x = f.x0 + f.dir * f.len * p; f.z = f.z0; f.y = Math.sin(p * Math.PI) * 0.55;
    f.sortY = f.z * SQ + 0.05;
    if (p >= 1) { f.on = false; f.t = 6 + rnd() * 10; this.w.ripple(f.x - P.x, f.z - P.z, false); this._splash(f.x, f.z, 6); }
  }
  _splash(x, z, n) {
    for (let i = 0; i < n; i++) this.air.push({ k: 'drop', x, z, y: 0.05, vx: (rnd() - 0.5) * 1.2, vz: (rnd() - 0.5) * 0.6, vy: 1.4 + rnd() * 1.2, t: 0, life: 0.7 });
  }

  // the rabbit pops out of a hedge near the view, hops onto the lawn, nibbles, and goes home
  _updateRabbit(dt, v, day) {
    const r = this.rabbit;
    r.t -= dt;
    if (r.state === 'off') {
      if (r.t > 0 || day < 0.7) return;
      const homes = this.w.burrows.filter((h) => inView(v, h.x, h.z, -0.5));
      if (!homes.length) { r.t = 4; return; }
      const h = homes[Math.floor(rnd() * homes.length)];
      r.home = h; r.x = h.x; r.z = h.z; r.y = 0;
      const path = [];
      let cur = { x: h.x, z: h.z };
      for (let i = 0; i < 4; i++) {
        const nx = cur.x + h.dx * (0.35 + rnd() * 0.2) + (rnd() - 0.5) * 0.3, nz = cur.z + h.dz * (0.35 + rnd() * 0.2) + (rnd() - 0.5) * 0.25;
        if (this.w.blocked(nx, nz, true) || inBeds(nx, nz, 0.3)) break;
        cur = { x: nx, z: nz }; path.push(cur);
      }
      if (!path.length) { r.t = 5; return; }
      r.hops = path; r.state = 'out'; r.hopI = 0; r.p = 0; r.fx = r.x; r.fz = r.z;
    }
    if (r.state === 'out' || r.state === 'back') {
      const to = r.hops[r.hopI];
      r.p += dt / 0.3;
      const p = Math.min(1, r.p);
      r.x = r.fx + (to.x - r.fx) * p; r.z = r.fz + (to.z - r.fz) * p; r.y = Math.sin(p * Math.PI) * 0.16;
      r.face = to.x >= r.fx ? 1 : -1; r.pose = 'hop';
      if (p >= 1) {
        r.y = 0; r.pose = 'sit'; r.fx = r.x; r.fz = r.z; r.p = -0.35 - rnd() * 0.3;         // a little pause between hops
        if (++r.hopI >= r.hops.length) {
          if (r.state === 'out') { r.state = 'sit'; r.t = 4 + rnd() * 5; r.nib = 0; }
          else { r.state = 'off'; r.t = 25 + rnd() * 30; }
        }
      }
    } else if (r.state === 'sit') {
      r.nib -= dt;
      if (r.nib <= 0) { r.pose = r.pose === 'nibble' ? 'sit' : 'nibble'; r.nib = r.pose === 'nibble' ? 0.8 + rnd() : 0.6 + rnd() * 1.4; if (rnd() < 0.3) r.face = -r.face; }
      if (r.t <= 0 || day < 0.7) { r.hops = [...r.hops.slice(0, -1).reverse(), { x: r.home.x, z: r.home.z }]; r.state = 'back'; r.hopI = 0; r.p = 0; r.fx = r.x; r.fz = r.z; }
    }
    r.sortY = r.z * SQ + 0.02;
  }
  // the squirrel scampers along the top rail of the fence, stops to look around, and hops down behind it
  _updateSquirrel(dt, v, day) {
    const q = this.squirrel;
    q.t -= dt;
    if (q.state === 'off') {
      if (q.t > 0 || day < 0.7 || FENCE_LINE * SQ < v.Y0 || FENCE_LINE * SQ > v.Y1) return;
      const runs = this.w.fenceRuns.filter(([a, b]) => b > v.X0 + 1 && a < v.X1 - 1);
      if (!runs.length) { q.t = 5; return; }
      const [a, b] = runs[Math.floor(rnd() * runs.length)];
      const lo = Math.max(a + 0.3, v.X0 + 0.5), hi = Math.min(b - 0.3, v.X1 - 0.5);
      if (hi - lo < 2) { q.t = 5; return; }
      q.face = rnd() < 0.5 ? 1 : -1;
      q.x = q.face > 0 ? lo : hi; q.x1 = q.face > 0 ? hi : lo; q.y = 1.02; q.state = 'run'; q.stop = 1 + rnd() * 2; q.fall = 0;
    }
    if (q.state === 'run') {
      q.x += q.face * 2.2 * dt; q.stop -= dt;
      q.y = 1.02 + Math.abs(Math.sin(this.t * 16)) * 0.04;
      if (q.stop <= 0) { q.state = 'look'; q.t = 0.8 + rnd() * 1.2; }
      if ((q.face > 0 && q.x >= q.x1) || (q.face < 0 && q.x <= q.x1)) { q.state = 'down'; q.fall = 0; }
    } else if (q.state === 'look') {
      q.y = 1.02;
      if (q.t <= 0) { q.state = 'run'; q.stop = 1 + rnd() * 2; if (rnd() < 0.3) q.face = -q.face, q.x1 = q.face > 0 ? Math.max(q.x1, q.x + 1) : Math.min(q.x1, q.x - 1); }
    } else if (q.state === 'down') {
      q.fall += dt;
      q.x += q.face * 1.2 * dt; q.y = 1.02 + Math.sin(Math.min(1, q.fall / 0.4) * Math.PI) * 0.2 - Math.min(1, q.fall / 0.4) * 1.1;
      if (q.fall > 0.4) { q.state = 'off'; q.t = 20 + rnd() * 25; }
    }
  }
  // after dark a hedgehog snuffles across the lawn
  _updateHog(dt, v, night) {
    const h = this.hog;
    h.t -= dt;
    if (h.state === 'off') {
      if (h.t > 0 || night < 0.6) return;
      const s = this._lawnSpot(v);
      if (!s) { h.t = 3; return; }
      h.x = s.x; h.z = s.z; h.state = 'walk'; h.left = 25 + rnd() * 20; h.face = rnd() < 0.5 ? 1 : -1; h.stop = 1; h.tx = h.x; h.tz = h.z; h.fade = 0;
    }
    h.left -= dt; h.fade = Math.min(1, h.fade + dt);
    if (h.left <= 0 || night < 0.3) { h.fade -= dt * 2; if (h.fade <= 0) { h.state = 'off'; h.t = 20; } }
    h.stop -= dt;
    if (h.stop <= 0) {
      const to = this._lawnSpot(v, h, 1.2);
      if (to) { h.tx = to.x; h.tz = to.z; h.face = to.x >= h.x ? 1 : -1; }
      h.stop = 2 + rnd() * 3;
    }
    const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
    h.moving = d > 0.05;
    if (h.moving) { h.x += (dx / d) * 0.35 * dt; h.z += (dz / d) * 0.35 * dt; }
    h.sortY = h.z * SQ + 0.02;
  }
  _updateAir(dt, v, day, wk) {
    const air = this.air, w = this.w;
    let fluffN = 0, leafN = 0, mothN = 0;
    for (const a of air) { if (a.k === 'fluff') fluffN++; else if (a.k === 'leaf') leafN++; else if (a.k === 'moth') mothN++; }
    // dandelion fluff on the breeze (day), a falling leaf from a tree in view now and then
    if (day > 0.5 && fluffN < 5 && rnd() < dt * 0.25) {
      air.push({ k: 'fluff', x: v.X0 - 0.5, z: (v.Y0 + rnd() * (v.Y1 - v.Y0)) / SQ, y: 0.6 + rnd() * 1.6, vx: 0.35 + rnd() * 0.25, t: 0, life: 30, ph: rnd() * 10 });
    }
    if (leafN < 6 && rnd() < dt * 0.35) {
      const trees = w.leafy.filter((t) => inView(v, t.x, t.z, 1));
      if (trees.length) {
        const t = trees[Math.floor(rnd() * trees.length)];
        air.push({ k: 'leaf', c: Math.floor(rnd() * 5), x: t.x + (rnd() - 0.5) * 2.4 * t.s, z: t.z + 0.3 + rnd() * 0.6, y: (2.2 + rnd() * 1.2) * t.s, vx: 0.15, t: 0, life: 14, ph: rnd() * 10, rest: 0 });
      }
    }
    // moths round the lamps after dark
    if (wk.night > 0.4 && mothN < 4 && rnd() < dt) {
      const L = w.lights[Math.floor(rnd() * w.lights.length)];
      air.push({ k: 'moth', cx: L.x, cz: L.z, cy: L.y, x: L.x, z: L.z, y: L.y, t: 0, life: 18 + rnd() * 10, ph: rnd() * 10, r: 0.25 + rnd() * 0.2 });
    }
    let j = 0;
    for (let i = 0; i < air.length; i++) {
      const a = air[i];
      a.t += dt;
      if (a.t > a.life) continue;
      if (a.k === 'fluff') {
        a.x += (a.vx * (1 + wk.rain)) * dt; a.y += Math.sin(a.t * 1.3 + a.ph) * 0.12 * dt; a.z += Math.sin(a.t * 0.7 + a.ph) * 0.08 * dt;
        if (a.x > v.X1 + 1) continue;
      } else if (a.k === 'leaf') {
        if (a.y > 0.01) { a.y -= 0.42 * dt; a.x += (a.vx + Math.sin(a.t * 2.4 + a.ph) * 0.5) * dt; a.rot = Math.sin(a.t * 3 + a.ph) * 0.9; }
        else { a.y = 0; a.rest += dt; if (a.rest > 4) continue; }
      } else if (a.k === 'moth') {
        if (wk.night < 0.2) continue;
        const ang = a.t * (2.2 + Math.sin(a.t * 0.9 + a.ph)) + a.ph;
        a.x = a.cx + Math.cos(ang) * a.r; a.z = a.cz + Math.sin(ang * 1.3) * a.r * 0.5; a.y = a.cy + Math.sin(ang * 1.7) * 0.18;
      } else if (a.k === 'drop') {
        a.vy -= 7 * dt; a.x += a.vx * dt; a.z += a.vz * dt; a.y += a.vy * dt;
        if (a.y < 0) continue;
      }
      air[j++] = a;
    }
    air.length = j;
  }
  _updateSparkles(dt, day) {
    const P = this.w.pondDef;
    if (day > 0.5 && this.sparkles.length < 4 && rnd() < dt * 3) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.75;
      this.sparkles.push({ x: P.x + Math.cos(a) * P.rx * r, z: P.z + Math.sin(a) * P.rz * r, t: 0, life: 0.5 + rnd() * 0.5, s: 0.1 + rnd() * 0.08 });
    }
    for (const s of this.sparkles) s.t += dt;
    this.sparkles = this.sparkles.filter((s) => s.t < s.life);
  }

  // ------------------------------------------------------------------------------------------ passes
  collect(list, s) {
    const v = this.v || s.view(1.5);
    const P = this.w.pondDef;
    if (inView(v, P.x, P.z, 3)) { list.push(this.fly); for (const f of this.frogs) list.push(f); if (this.fish.on) list.push(this.fish); }
    for (const b of this.birds) if (b.state !== 'off' && inView(v, b.x, b.z - b.y, 1)) list.push(b);
    if (this.rabbit.state !== 'off' && inView(v, this.rabbit.x, this.rabbit.z, 1)) list.push(this.rabbit);
    if (this.squirrel.state !== 'off' && inView(v, this.squirrel.x, this.squirrel.z, 1)) list.push(this.squirrel);
    if (this.hog.state !== 'off' && inView(v, this.hog.x, this.hog.z, 1)) list.push(this.hog);
    if (s.cam.ppu > 34) {
      for (const sn of this.snails) if (inView(v, sn.x, sn.z, 0.5)) list.push(sn);
      for (const l of this.ladies) if (inView(v, l.x, l.z, 0.5)) list.push(l);
    }
  }
  // on the water, after the lily pads
  water(ctx, s) {
    const ppu = s.cam.ppu, r = s.resFor(0.2);
    for (const sp of this.sparkles) {
      const k = Math.sin((sp.t / sp.life) * Math.PI);
      drawSprite(ctx, SPR.sparkle(r), s.sx(sp.x), s.sy(sp.z * SQ), ppu * sp.s * k, 1, 1, 0, 0.85 * k);
    }
  }
  // drifting things, after the depth-sorted sprites
  particles(ctx, s) {
    const ppu = s.cam.ppu;
    for (const a of this.air) {
      const X = s.sx(a.x), Y = s.sy(a.z * SQ - a.y * HY);
      if (X < -40 || X > s.vw + 40 || Y < -40 || Y > s.vh + 40) continue;
      const fade = Math.min(1, a.t / 0.6, (a.life - a.t) / 1.2);
      if (a.k === 'fluff') drawSprite(ctx, SPR.fluff(s.resFor(0.8)), X, Y, ppu * 0.8, 1, 1, Math.sin(a.t * 1.1 + a.ph) * 0.3, 0.9 * fade);
      else if (a.k === 'leaf') {
        if (a.y > 0.4) drawSprite(ctx, SPR.shadow(s.resFor(0.1)), s.sx(a.x) + a.y * 0.2 * ppu, s.sy(a.z * SQ), ppu * 0.06, 1, 1, 0, 0.18 * fade);
        drawSprite(ctx, SPR.leaf(a.c, s.resFor(0.8)), X, Y, ppu * 0.8, 1, a.y > 0.01 ? Math.cos(a.t * 4 + a.ph) : 0.6, a.rot || 0, fade * (a.rest > 3 ? 4 - a.rest : 1));
      } else if (a.k === 'moth') drawSprite(ctx, SPR.moth(s.resFor(0.9)), X, Y, ppu * 0.9, Math.abs(Math.sin(this.t * 22 + a.ph)) * 0.8 + 0.2, 1, 0, fade);
      else if (a.k === 'drop') { ctx.fillStyle = 'rgba(220,245,255,0.9)'; ctx.beginPath(); ctx.arc(X, Y, Math.max(1, ppu * 0.025), 0, TAU); ctx.fill(); }
    }
  }
  // shadows of passing birds (after the sprites)
  shadows(ctx, s, time) {
    const b = this.flock;
    if (!b) return;
    const ppu = s.cam.ppu, spr = SPR.birdshadow(s.resFor(0.8)), night = this.w.weather.k.night;
    for (let i = 0; i < b.n; i++) {
      const x = b.x - b.dir * i * 1.4, z = b.z + (i % 2 ? 0.9 : -0.7) * Math.min(1, i);
      const flap = 0.6 + 0.4 * Math.sin(time * 7 + i * 2);
      drawSprite(ctx, spr, s.sx(x), s.sy(z * SQ), ppu * 0.75, b.dir, flap, 0, 0.13 * (1 - night));
    }
  }

  // ------------------------------------------------------------------------------------------ drawing
  _shadow(ctx, s, x, z, y, r, a = 0.35) {
    drawSprite(ctx, SPR.shadow(s.resFor(0.2)), s.sx(x) + y * 0.2 * s.cam.ppu, s.sy(z * SQ), s.cam.ppu * r * (1 - Math.min(0.5, y * 0.4)), 1, 1, 0, a * (1 - Math.min(0.6, y * 0.4)));
  }
  _drawFly(ctx, s, time) {
    const f = this.fly, ppu = s.cam.ppu;
    this._shadow(ctx, s, f.x, f.z, f.y, 0.12, 0.25);
    drawSprite(ctx, SPR.dragonfly(s.resFor(0.4)), s.sx(f.x), s.sy(f.z * SQ - f.y * HY), ppu * 0.4, 1 + Math.sin(time * 60) * 0.08, 1, f.face);
  }
  _drawBird(ctx, s, b) {
    const ppu = s.cam.ppu, k = 0.95;
    this._shadow(ctx, s, b.x, b.z, b.y, 0.13, 0.4);
    drawSprite(ctx, SPR.bird(b.k, b.pose, s.resFor(k)), s.sx(b.x), s.sy(b.z * SQ - b.y * HY), ppu * k, b.face, 1);
  }
  _drawFrog(ctx, s, f) {
    const ppu = s.cam.ppu, k = 1.1;
    if (f.state === 'hop') this._shadow(ctx, s, f.x, f.z, f.y, 0.12, 0.3);
    const pose = f.state === 'hop' ? 'jump' : f.croak > 0 ? 'croak' : 'sit';
    const bob = f.state === 'sit' ? Math.sin(this.t * 0.9 + this.w.lilies[f.pad].seed) * 0.012 : 0;
    drawSprite(ctx, SPR.frog(pose, s.resFor(k)), s.sx(f.x), s.sy(f.z * SQ - f.y * HY + bob), ppu * k, f.face, 1);
  }
  _drawFish(ctx, s) {
    const f = this.fish, ppu = s.cam.ppu;
    const p = Math.min(1, f.p), rot = (p - 0.5) * 2.2 * f.dir;
    drawSprite(ctx, this.w.sprite('koi', { v: 0, seed: 0 }, s.resFor(0.5)), s.sx(f.x), s.sy(f.z * SQ - f.y * HY), ppu * 0.5, f.dir, 1, rot - (f.dir > 0 ? 0 : 0));
  }
  _drawRabbit(ctx, s) {
    const r = this.rabbit, ppu = s.cam.ppu, k = 1.15;
    this._shadow(ctx, s, r.x, r.z, r.y, 0.18, 0.4);
    drawSprite(ctx, SPR.rabbit(r.pose, s.resFor(k)), s.sx(r.x), s.sy(r.z * SQ - r.y * HY), ppu * k, r.face, 1);
  }
  _drawSquirrel(ctx, s) {
    const q = this.squirrel, ppu = s.cam.ppu, k = 1.0;
    drawSprite(ctx, SPR.squirrel(q.state === 'look' ? 'sit' : 'run', s.resFor(k)), s.sx(q.x), s.sy(q.z * SQ - q.y * HY), ppu * k, q.face, 1);
  }
  _drawHog(ctx, s) {
    const h = this.hog, ppu = s.cam.ppu, k = 1.1;
    const st = h.moving && Math.sin(this.t * 12) > 0 ? 1 : 0;
    this._shadow(ctx, s, h.x, h.z, 0, 0.16, 0.35 * h.fade);
    drawSprite(ctx, SPR.hedgehog(st, s.resFor(k)), s.sx(h.x), s.sy(h.z * SQ) - (h.moving ? Math.abs(Math.sin(this.t * 12)) * 0.01 * ppu : 0), ppu * k, h.face, 1, 0, Math.max(0, h.fade));
  }
  _drawSnail(ctx, s, sn) {
    const ppu = s.cam.ppu, k = 0.8;
    drawSprite(ctx, SPR.snail(s.resFor(k)), s.sx(sn.x), s.sy(sn.z * SQ), ppu * k, Math.cos(sn.a) >= 0 ? 1 : -1, 1);
  }
  _drawLady(ctx, s, l) {
    const ppu = s.cam.ppu, k = 0.8;
    if (l.y > 0.02) this._shadow(ctx, s, l.x, l.z, l.y, 0.04, 0.3);
    drawSprite(ctx, SPR.lady(l.fly > 0, s.resFor(k)), s.sx(l.x), s.sy(l.z * SQ - l.y * HY), ppu * k, Math.cos(l.a) >= 0 ? 1 : -1, 1);
  }
}
