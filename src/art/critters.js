// Living things: the garden's bees (driven by the simulation's bee states), ambient butterflies, and the seed
// bubbles bees leave behind. Painted as cute cartoon sprites; motion is eased and wobbly so it feels alive.
import { Sprite, SpriteBank, drawSprite, softEllipse, rng } from './paint.js';
import { shade, ink, rgba, mix } from './color.js';
import { SQ, HY } from './view3q.js';
import { damp, clamp, ease } from '../core/math.js';
import { COLORS } from '../game/genetics.js';

const TAU = Math.PI * 2;
export const BEE_SIZE = 0.5;        // world units per bee unit (body length ≈ 1)

// ------------------------------------------------------------------------------------------ bee art
function paintBeeBody(ctx, px) {
  const lw = Math.max(0.05, px * 1.7);
  const inkC = '#4a2a10';
  // dangling legs
  ctx.strokeStyle = inkC; ctx.lineWidth = lw * 0.9;
  for (const x of [-0.12, 0.05, 0.2]) { ctx.beginPath(); ctx.moveTo(x, 0.3); ctx.quadraticCurveTo(x - 0.02, 0.42, x - 0.07, 0.46); ctx.stroke(); }
  // stinger
  ctx.fillStyle = '#3a2412';
  ctx.beginPath(); ctx.moveTo(-0.46, -0.02); ctx.lineTo(-0.64, 0.08); ctx.lineTo(-0.45, 0.13); ctx.closePath(); ctx.fill();
  // body
  const body = () => { ctx.beginPath(); ctx.ellipse(0, 0, 0.52, 0.41, 0, 0, TAU); };
  body();
  const g = ctx.createRadialGradient(-0.12, -0.2, 0.05, 0, 0, 0.6);
  g.addColorStop(0, '#fff09a'); g.addColorStop(0.45, '#ffcd2a'); g.addColorStop(1, '#e08a0a');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); body(); ctx.clip();
  // stripes
  ctx.fillStyle = '#3a2412';
  for (const x of [-0.14, -0.4]) {
    ctx.beginPath(); ctx.ellipse(x, 0, 0.09, 0.5, 0.12, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (const x of [-0.16, -0.42]) { ctx.beginPath(); ctx.ellipse(x - 0.03, -0.18, 0.03, 0.12, 0.12, 0, TAU); ctx.fill(); }
  // fuzz / soft shading at the bottom
  const sg = ctx.createLinearGradient(0, -0.4, 0, 0.41);
  sg.addColorStop(0.55, 'rgba(120,50,0,0)'); sg.addColorStop(1, 'rgba(120,50,0,0.35)');
  ctx.fillStyle = sg; ctx.fillRect(-0.6, -0.5, 1.2, 1);
  ctx.restore();
  body(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
  // face
  ctx.fillStyle = '#1e140c';
  ctx.beginPath(); ctx.ellipse(0.27, -0.07, 0.085, 0.115, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0.295, -0.11, 0.035, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0.25, -0.02, 0.016, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,110,140,0.55)';
  ctx.beginPath(); ctx.ellipse(0.34, 0.1, 0.07, 0.045, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = inkC; ctx.lineWidth = lw * 0.8;
  ctx.beginPath(); ctx.arc(0.4, 0.02, 0.06, 0.3, 1.6); ctx.stroke();
  // antennae
  ctx.lineWidth = lw * 0.8;
  for (const [x0, x1, y1] of [[0.2, 0.36, -0.66], [0.3, 0.5, -0.6]]) {
    ctx.beginPath(); ctx.moveTo(x0, -0.35); ctx.quadraticCurveTo(x0 + 0.02, -0.55, x1, y1); ctx.stroke();
    ctx.fillStyle = '#3a2412'; ctx.beginPath(); ctx.arc(x1, y1, 0.05, 0, TAU); ctx.fill();
  }
  // glossy highlight
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(0.02, -0.26, 0.14, 0.06, -0.15, 0, TAU); ctx.fill();
}

function paintBeeWing(ctx, px) {
  // attached at (0, 0), extends up and back
  const lw = Math.max(0.04, px * 1.4);
  ctx.beginPath(); ctx.ellipse(-0.12, -0.34, 0.2, 0.36, -0.35, 0, TAU);
  const g = ctx.createLinearGradient(-0.3, -0.7, 0.1, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(190,230,255,0.6)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(70,120,160,0.75)'; ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = 'rgba(70,120,160,0.35)'; ctx.lineWidth = lw * 0.6;
  ctx.beginPath(); ctx.moveTo(-0.02, -0.05); ctx.quadraticCurveTo(-0.1, -0.35, -0.2, -0.6); ctx.stroke();
}

function paintPollen(ctx, px) {
  ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#b8770a'; ctx.lineWidth = Math.max(0.04, px * 1.2);
  for (const [x, y] of [[-0.1, 0.46], [0.12, 0.46]]) { ctx.beginPath(); ctx.arc(x, y, 0.08, 0, TAU); ctx.fill(); ctx.stroke(); }
}

// ------------------------------------------------------------------------------------------ butterflies
const BFLY = [
  { a: '#ff9f43', b: '#1d1420', dots: '#ffffff' },
  { a: '#6fc3ff', b: '#1d2a48', dots: '#e6f6ff' },
  { a: '#ffe066', b: '#3a2a10', dots: '#ffffff' },
  { a: '#ff8fc8', b: '#40183a', dots: '#fff0f8' },
  { a: '#c7a4ff', b: '#2c1850', dots: '#ffffff' },
];
function paintBflyWing(ctx, px, v) {
  const c = BFLY[v % BFLY.length], lw = Math.max(0.04, px * 1.3);
  // upper wing
  const up = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(0.2, -0.55, 0.8, -0.75, 0.9, -0.35); ctx.bezierCurveTo(0.95, -0.1, 0.5, 0.05, 0, 0.02); ctx.closePath(); };
  const lo = () => { ctx.beginPath(); ctx.moveTo(0, 0.02); ctx.bezierCurveTo(0.45, 0.05, 0.7, 0.35, 0.5, 0.55); ctx.bezierCurveTo(0.32, 0.7, 0.1, 0.4, 0, 0.06); ctx.closePath(); };
  for (const f of [lo, up]) {
    f();
    const g = ctx.createRadialGradient(0.1, 0, 0.05, 0.2, 0, 0.9);
    g.addColorStop(0, shade(c.a, 0.3)); g.addColorStop(0.7, c.a); g.addColorStop(1, shade(c.a, -0.3));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = c.b; ctx.lineWidth = lw * 2.4; ctx.stroke();
    ctx.strokeStyle = rgba(c.b, 0.6); ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.7, -0.45); ctx.moveTo(0, 0); ctx.lineTo(0.85, -0.2); ctx.moveTo(0, 0.03); ctx.lineTo(0.5, 0.45); ctx.stroke();
    ctx.restore();
    f(); ctx.strokeStyle = c.b; ctx.lineWidth = lw; ctx.stroke();
  }
  ctx.fillStyle = c.dots;
  for (const [x, y, r] of [[0.8, -0.38, 0.04], [0.7, -0.52, 0.035], [0.52, 0.48, 0.035]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
}
function paintBflyBody(ctx, px) {
  ctx.fillStyle = '#2b2130';
  ctx.beginPath(); ctx.ellipse(0, 0.05, 0.05, 0.3, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -0.28, 0.07, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2b2130'; ctx.lineWidth = Math.max(0.03, px * 1.2);
  ctx.beginPath(); ctx.moveTo(-0.02, -0.33); ctx.quadraticCurveTo(-0.1, -0.5, -0.16, -0.56); ctx.moveTo(0.02, -0.33); ctx.quadraticCurveTo(0.1, -0.5, 0.16, -0.56); ctx.stroke();
}

// ------------------------------------------------------------------------------------------ seed bubble
function paintOrb(ctx, px, g) {
  const c1 = COLORS[g.c1].hex, c2 = COLORS[g.c2 ?? g.c1].hex;
  const lw = Math.max(0.04, px * 1.4);
  softEllipse(ctx, 0, 0, 1.45, 1.45, c1, 0.4, 0.4);
  // bubble body
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
  const b = ctx.createRadialGradient(-0.25, -0.3, 0.1, 0, 0, 1);
  b.addColorStop(0, 'rgba(255,255,255,0.18)'); b.addColorStop(0.7, rgba(mix(c1, '#ffffff', 0.5), 0.22)); b.addColorStop(1, rgba(c1, 0.6));
  ctx.fillStyle = b; ctx.fill();
  // seed inside
  ctx.save(); ctx.rotate(0.35);
  ctx.beginPath(); ctx.moveTo(0, -0.55); ctx.bezierCurveTo(0.42, -0.35, 0.42, 0.45, 0, 0.55); ctx.bezierCurveTo(-0.42, 0.45, -0.42, -0.35, 0, -0.55); ctx.closePath();
  const s = ctx.createLinearGradient(-0.4, -0.5, 0.4, 0.5);
  s.addColorStop(0, shade(c1, 0.35)); s.addColorStop(0.55, c1); s.addColorStop(1, g.pattern ? c2 : shade(c1, -0.35));
  ctx.fillStyle = s; ctx.fill(); ctx.strokeStyle = ink(c1, 0.6); ctx.lineWidth = lw * 1.3; ctx.stroke();
  ctx.strokeStyle = rgba(ink(c1, 0.5), 0.5); ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(0, -0.45); ctx.quadraticCurveTo(0.12, 0, 0, 0.45); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-0.15, -0.2, 0.08, 0.18, 0, 0, TAU); ctx.fill();
  ctx.restore();
  // rim + specular
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
  ctx.strokeStyle = rgba(mix(c1, '#ffffff', 0.55), 0.9); ctx.lineWidth = lw * 1.4; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = lw * 2.2;
  ctx.beginPath(); ctx.arc(0, 0, 0.8, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0.52, 0.5, 0.08, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------------------------------------ shared sprites
export const bank = new SpriteBank();
const beeBody = (res) => bank.get('bee', res, (r) => new Sprite(1.6, 1.5, 0.75, 0.8, r, paintBeeBody));
const beeWing = (res) => bank.get('beewing', res, (r) => new Sprite(0.8, 0.9, 0.45, 0.8, r, paintBeeWing));
const pollen = (res) => bank.get('pollen', res, (r) => new Sprite(0.6, 0.7, 0.3, 0.1, r, paintPollen));
const bflyWing = (v, res) => bank.get('bw' + v, res, (r) => new Sprite(1.1, 1.4, 0.08, 0.8, r, (c, px) => paintBflyWing(c, px, v)));
const bflyBody = (res) => bank.get('bb', res, (r) => new Sprite(0.5, 1, 0.25, 0.6, r, paintBflyBody));
export const orbSprite = (g, res) => bank.get(`orb${g.c1}.${g.c2}.${g.pattern ? 1 : 0}`, res, (r) => new Sprite(3, 3, 1.5, 1.5, r, (c, px) => paintOrb(c, px, g)));
const SHADOW = (res) => bank.get('shadow', res, (r) => new Sprite(2.2, 1.2, 1.1, 0.6, r, (c) => softEllipse(c, 0, 0, 1, 0.5, '#173512', 0.55, 0.2)));
export const shadowSprite = SHADOW;

// ------------------------------------------------------------------------------------------ bees
export class Bees {
  constructor(fx) {
    this.fx = fx;
    this.views = [];
    this.R = rng(42);
  }
  _make() {
    return { x: -5, y: 1, z: -4, vx: 0, vz: 0, face: 1, bank: 0, seed: this.R() * 10, carry: 0, sortY: 0, draw: null };
  }
  // headY(i) → world height of flower head i; hive = {x, z, y}
  update(dt, time, bees, garden, headY, hive) {
    while (this.views.length < bees.length) {
      const v = this._make();
      v.x = hive.x; v.z = hive.z + 0.3; v.y = hive.y;
      v.draw = (ctx, s, t) => this._draw(ctx, s, v, t);
      this.views.push(v);
    }
    this.views.length = bees.length;
    for (let i = 0; i < bees.length; i++) {
      const b = bees[i], v = this.views[i];
      const sd = v.seed;
      let tx, ty, tz;
      switch (b.state) {
        case 'home': {
          const a = time * 1.3 + sd * 2;
          tx = hive.x + Math.cos(a) * 0.75 + 0.2; ty = hive.y + 0.35 + Math.sin(time * 2.1 + sd) * 0.2; tz = hive.z + 0.45 + Math.sin(a) * 0.45;
          v.carry = damp(v.carry, 0, 1, dt);
          break;
        }
        case 'atA': case 'atB': {
          const k = b.state === 'atA' ? b.a : b.b;
          const p = garden.pos[k];
          tx = p.x + Math.cos(time * 3 + sd) * 0.14; ty = headY(k) + 0.14 + Math.sin(time * 5 + sd) * 0.05; tz = p.z + 0.05 + Math.sin(time * 3 + sd) * 0.05;
          if (this.R() < dt * 5) this.fx?.pollen(p.x, headY(k), p.z, 2);
          if (b.state === 'atB' || b.t > 0.4) v.carry = Math.min(1, v.carry + dt * 2);
          break;
        }
        default: {
          const k = Math.min(1, b.t / Math.max(0.01, b.dur));
          const e = ease.inOutQuad(k);
          const hy = (j) => (j >= 0 ? headY(j) + 0.14 : hive.y + 0.2);
          const y0 = b.state === 'toA' && Math.abs(b.from.x - hive.x) < 0.01 ? hive.y + 0.3 : b.state === 'back' ? hy(b.b >= 0 ? b.b : -1) : hy(b.state === 'toB' ? b.a : -1);
          const y1 = b.state === 'back' ? hive.y + 0.25 : hy(b.state === 'toA' ? b.a : b.b);
          const arc = Math.sin(Math.PI * k) * 0.8;
          const wob = Math.sin(time * 7 + sd) * 0.06;
          tx = b.from.x + (b.to.x - b.from.x) * e + wob;
          ty = (isFinite(y0) ? y0 : 1) + ((isFinite(y1) ? y1 : 1) - (isFinite(y0) ? y0 : 1)) * e + arc;
          tz = b.from.z + (b.to.z - b.from.z) * e + (b.state === 'back' ? 0.4 * e : 0);
        }
      }
      const px0 = v.x, pz0 = v.z;
      v.x = damp(v.x, tx, 9, dt); v.y = damp(v.y, ty, 9, dt); v.z = damp(v.z, tz, 9, dt);
      const vx = (v.x - px0) / Math.max(dt, 1e-4), vz = (v.z - pz0) / Math.max(dt, 1e-4);
      v.vx = damp(v.vx, vx, 8, dt); v.vz = damp(v.vz, vz, 8, dt);
      if (Math.abs(v.vx) > 0.25) v.face = v.vx > 0 ? 1 : -1;
      else if (b.state === 'atA' || b.state === 'atB') v.face = Math.sin(time * 0.8 + sd) > 0 ? 1 : -1;
      v.bank = damp(v.bank, clamp(v.vz * 0.08 - Math.abs(v.vx) * 0.02, -0.4, 0.4), 6, dt);
      v.sortY = v.z * SQ + 0.02;
    }
  }
  collect(list) { for (const v of this.views) list.push(v); }
  _draw(ctx, s, v, time) {
    const res = s.resFor(BEE_SIZE), ppu = s.cam.ppu * BEE_SIZE;
    const gx = s.sx(v.x), gy = s.sy(v.z * SQ);
    const alt = Math.max(0, v.y);
    drawSprite(ctx, SHADOW(s.res), gx + alt * 0.2 * s.cam.ppu, gy + 0.02 * s.cam.ppu, s.cam.ppu * 0.2 * (1 - Math.min(0.5, alt * 0.2)), 1, 1, 0, 0.5 - Math.min(0.3, alt * 0.12));
    const x = gx, y = s.sy(v.z * SQ - v.y * HY);
    const flap = Math.sin(time * 52 + v.seed * 7);
    const f = v.face;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(v.bank * f);
    ctx.scale(f, 1);
    // wings behind, body, wing in front (with a faint blur copy)
    drawSprite(ctx, beeWing(res), -0.04 * ppu, -0.28 * ppu, ppu, 1, 0.35 + 0.65 * Math.abs(flap), -0.2, 0.9);
    drawSprite(ctx, beeBody(res), 0, 0, ppu);
    if (v.carry > 0.05) drawSprite(ctx, pollen(res), 0, 0, ppu, 1, 1, 0, v.carry);
    drawSprite(ctx, beeWing(res), 0.08 * ppu, -0.3 * ppu, ppu, 1, 0.3 + 0.7 * Math.abs(Math.sin(time * 52 + v.seed * 7 + 0.9)), 0.1, 0.92);
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------ butterflies
export class Butterflies {
  constructor(count = 3) {
    const R = rng(8);
    this.list = [];
    for (let i = 0; i < count; i++) {
      const b = { v: i, x: (R() - 0.5) * 12, z: (R() - 0.5) * 8, y: 1.5, gx: 0, gz: 0, gy: 1.5, t: 0, land: null, landT: 0, seed: R() * 100, face: 1, sortY: 0, draw: null };
      b.draw = (ctx, s, time) => this._draw(ctx, s, b, time);
      this.list.push(b);
    }
  }
  update(dt, time, spots) {
    for (const b of this.list) {
      b.t -= dt;
      if (b.land) {
        b.landT -= dt;
        b.x = damp(b.x, b.land.x, 5, dt); b.y = damp(b.y, b.land.y + 0.12, 5, dt); b.z = damp(b.z, b.land.z + 0.06, 5, dt);
        if (b.landT <= 0) { b.land = null; b.t = 0; }
      } else {
        if (b.t <= 0) {
          b.t = 3 + Math.random() * 4;
          if (spots.length && Math.random() < 0.4) { b.land = spots[(Math.random() * spots.length) | 0]; b.landT = 3 + Math.random() * 4; }
          else { b.gx = (Math.random() - 0.5) * 16; b.gy = 1 + Math.random() * 2; b.gz = (Math.random() - 0.5) * 12; }
        }
        const px = b.x;
        b.x = damp(b.x, b.gx + Math.sin(time * 1.3 + b.seed) * 0.8, 0.6, dt);
        b.y = damp(b.y, b.gy + Math.sin(time * 3 + b.seed) * 0.35, 1.2, dt);
        b.z = damp(b.z, b.gz + Math.cos(time * 1.1 + b.seed) * 0.6, 0.6, dt);
        if (Math.abs(b.x - px) > dt * 0.05) b.face = b.x > px ? 1 : -1;
      }
      b.sortY = b.z * SQ + 0.03;
    }
  }
  collect(list) { for (const b of this.list) list.push(b); }
  _draw(ctx, s, b, time) {
    const k = 0.34, res = s.resFor(k), ppu = s.cam.ppu * k;
    const gx = s.sx(b.x), gy = s.sy(b.z * SQ);
    drawSprite(ctx, SHADOW(s.res), gx + b.y * 0.2 * s.cam.ppu, gy, s.cam.ppu * 0.12, 1, 1, 0, 0.35);
    const x = gx, y = s.sy(b.z * SQ - b.y * HY);
    const flap = b.land ? 0.55 + 0.45 * Math.sin(time * 2.5 + b.seed) : Math.abs(Math.sin(time * 14 + b.seed));
    const w = 0.15 + 0.85 * flap;
    ctx.save(); ctx.translate(x, y); ctx.rotate(b.face * 0.25);
    drawSprite(ctx, bflyWing(b.v, res), 0, 0, ppu, w, 1);
    drawSprite(ctx, bflyWing(b.v, res), 0, 0, ppu, -w, 1);
    drawSprite(ctx, bflyBody(res), 0, 0, ppu);
    ctx.restore();
  }
}
