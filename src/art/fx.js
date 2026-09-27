// 2D particles in world space (x, y up, z): petal bursts, sparkles, pollen, water, dust, leaves, confetti,
// ground rings, fireflies and drifting light motes. Same API as the old 3D effects.
import { Sprite, SpriteBank, drawSprite, softEllipse } from './paint.js';
import { shade, ink, rgba } from './color.js';
import { SQ, HY } from './view3q.js';
import { rng } from '../core/math.js';

const TAU = Math.PI * 2;
const bank = new SpriteBank();
const RES = 72;
const SPR = {
  petal: (c) => bank.get('petal' + c, RES, (r) => new Sprite(1.2, 1.2, 0.6, 0.6, r, (ctx, px) => {
    ctx.beginPath(); ctx.moveTo(0, -0.5); ctx.bezierCurveTo(0.42, -0.35, 0.36, 0.3, 0, 0.5); ctx.bezierCurveTo(-0.36, 0.3, -0.42, -0.35, 0, -0.5); ctx.closePath();
    const g = ctx.createLinearGradient(-0.3, -0.5, 0.3, 0.5); g.addColorStop(0, shade(c, 0.35)); g.addColorStop(1, shade(c, -0.25));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(c, 0.55); ctx.lineWidth = 0.07; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(-0.1, -0.3); ctx.quadraticCurveTo(-0.18, 0, -0.08, 0.25); ctx.stroke();
  })),
  leaf: (c) => bank.get('leaf' + c, RES, (r) => new Sprite(1.2, 1.2, 0.6, 0.6, r, (ctx) => {
    ctx.beginPath(); ctx.moveTo(0, -0.5); ctx.bezierCurveTo(0.4, -0.2, 0.3, 0.35, 0, 0.5); ctx.bezierCurveTo(-0.3, 0.35, -0.4, -0.2, 0, -0.5); ctx.closePath();
    ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = ink(c, 0.6); ctx.lineWidth = 0.07; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -0.45); ctx.lineTo(0, 0.45); ctx.strokeStyle = rgba(shade(c, 0.4), 0.8); ctx.lineWidth = 0.05; ctx.stroke();
  })),
  spark: (c) => bank.get('spark' + c, RES, (r) => new Sprite(2, 2, 1, 1, r, (ctx) => {
    softEllipse(ctx, 0, 0, 0.8, 0.8, c, 0.55, 0.05);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -0.95); ctx.quadraticCurveTo(0.08, -0.08, 0.95, 0); ctx.quadraticCurveTo(0.08, 0.08, 0, 0.95); ctx.quadraticCurveTo(-0.08, 0.08, -0.95, 0); ctx.quadraticCurveTo(-0.08, -0.08, 0, -0.95); ctx.fill();
    ctx.fillStyle = rgba(c, 0.8); ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, TAU); ctx.fill();
  })),
  glow: (c) => bank.get('glow' + c, RES, (r) => new Sprite(2, 2, 1, 1, r, (ctx) => {
    softEllipse(ctx, 0, 0, 1, 1, c, 0.9, 0.08);
    ctx.fillStyle = shade(c, 0.6); ctx.beginPath(); ctx.arc(0, 0, 0.18, 0, TAU); ctx.fill();
  })),
  dot: (c) => bank.get('dot' + c, RES, (r) => new Sprite(1.2, 1.2, 0.6, 0.6, r, (ctx) => {
    ctx.beginPath(); ctx.arc(0, 0, 0.45, 0, TAU);
    const g = ctx.createRadialGradient(-0.15, -0.15, 0.05, 0, 0, 0.45); g.addColorStop(0, shade(c, 0.5)); g.addColorStop(1, c);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(c, 0.5); ctx.lineWidth = 0.08; ctx.stroke();
  })),
  puff: (c) => bank.get('puff' + c, RES, (r) => new Sprite(2.2, 2.2, 1.1, 1.1, r, (ctx) => softEllipse(ctx, 0, 0, 1, 1, c, 0.8, 0.3))),
  drop: () => bank.get('drop', RES, (r) => new Sprite(1, 1.4, 0.5, 0.8, r, (ctx) => {
    ctx.beginPath(); ctx.moveTo(0, -0.6); ctx.bezierCurveTo(0.12, -0.3, 0.32, -0.05, 0.3, 0.15); ctx.arc(0, 0.15, 0.3, 0, Math.PI); ctx.bezierCurveTo(-0.32, -0.05, -0.12, -0.3, 0, -0.6); ctx.closePath();
    ctx.fillStyle = '#8fdcff'; ctx.fill(); ctx.strokeStyle = '#2f7fb0'; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(-0.1, 0.1, 0.07, 0.12, 0, 0, TAU); ctx.fill();
  })),
  confetti: (c) => bank.get('conf' + c, RES, (r) => new Sprite(1, 1, 0.5, 0.5, r, (ctx) => {
    ctx.fillStyle = c; ctx.fillRect(-0.4, -0.22, 0.8, 0.44);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-0.4, -0.22, 0.8, 0.12);
  })),
};

export class FX {
  constructor(quality) {
    this.q = quality;
    this.list = [];
    this.cap = Math.round(700 * (quality.particles ?? 1));
    this.R = rng(9);
    this.fireflies = 0; this.motes = 0; this.rain = 0;
    this.amb = 0;
  }
  setQuality(q) { this.q = q; this.cap = Math.round(700 * (q.particles ?? 1)); }
  _p(o) {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g ?? 0, drag: o.drag ?? 0,
      size: o.size ?? 0.1, grow: o.grow ?? 0, life: o.life ?? 1, age: 0, a: o.a ?? 1, spr: o.spr, add: !!o.add,
      rot: o.rot ?? this.R() * TAU, spin: o.spin ?? 0, floor: o.floor ?? -99, wander: o.wander ?? 0, fadeAt: o.fadeAt ?? 0.6, fadeIn: o.fadeIn ?? 0,
      pulse: o.pulse ?? 0, flip: o.flip ?? 0, ring: o.ring ?? null, seed: this.R() * 10,
    });
  }
  // burst size, trimmed while lots of particles are already alive (spam-tapping stays smooth)
  n(k) { const L = this.list.length, load = L > 320 ? 0.3 : L > 160 ? 0.6 : 1; return Math.max(1, Math.round(k * (this.q.particles ?? 1) * load)); }

  petals(x, y, z, colors, n = 14) {
    const R = this.R;
    for (let i = 0, m = this.n(n); i < m; i++) {
      const a = R() * TAU, sp = 1.2 + R() * 1.8;
      this._p({ x, y, z, vx: Math.cos(a) * sp, vy: 2 + R() * 2.4, vz: Math.sin(a) * sp * 0.7, g: 6, drag: 1.6, size: 0.14 + R() * 0.1, life: 1.2 + R() * 0.8, spr: SPR.petal(colors[i % colors.length]), spin: (R() - 0.5) * 9, floor: 0.02, flip: 6 + R() * 6 });
    }
  }
  drift(x, y, z, color) {
    const R = this.R;
    this._p({ x, y, z, vx: 0.25 + R() * 0.3, vy: -0.35, g: 0.05, drag: 0.4, wander: 1.2, size: 0.08 + R() * 0.04, life: 7 + R() * 3, spr: SPR.petal(color), spin: (R() - 0.5) * 3, floor: 0.01, flip: 3 + R() * 3, fadeAt: 0.8 });
  }
  sparkles(x, y, z, color = '#fff6c2', n = 10, spread = 0.6, big = 1) {
    const R = this.R;
    for (let i = 0, m = this.n(n); i < m; i++) {
      const a = R() * TAU, r = R() * spread;
      this._p({ x: x + Math.cos(a) * r, y: y + R() * spread, z: z + Math.sin(a) * r * 0.6, vy: 0.6 + R() * 1.2, vx: Math.cos(a) * 0.4, vz: Math.sin(a) * 0.3, drag: 1.5, size: (0.14 + R() * 0.16) * big, life: 0.7 + R() * 0.7, spr: SPR.spark(color), add: true, spin: (R() - 0.5) * 3, fadeAt: 0.4 });
    }
  }
  pollen(x, y, z, n = 5) {
    const R = this.R;
    for (let i = 0, m = this.n(n); i < m; i++) this._p({ x: x + (R() - 0.5) * 0.3, y: y + R() * 0.2, z: z + (R() - 0.5) * 0.2, vx: (R() - 0.5) * 0.6, vy: 0.2 + R() * 0.5, vz: (R() - 0.5) * 0.4, g: 0.4, drag: 1, size: 0.05 + R() * 0.03, life: 0.9 + R() * 0.6, spr: SPR.dot('#ffd23a') });
  }
  water(x, y, z, n = 16) {
    const R = this.R;
    for (let i = 0, m = this.n(n); i < m; i++) this._p({ x: x + (R() - 0.5) * 0.7, y: y + 1.2 + R() * 0.5, z: z + (R() - 0.5) * 0.5, vy: -3 - R() * 2, g: 9, size: 0.09 + R() * 0.05, life: 0.5, spr: SPR.drop(), rot: 0, floor: y, fadeAt: 0.8 });
    setTimeout(() => this.ring(x, y, z, '#d6f4ff', 0.9), 250);
  }
  ring(x, y, z, color = '#ffffff', size = 1) { this._p({ x, y, z, size: size * 0.3, grow: 2.4, life: 0.55, ring: color, a: 0.8, fadeAt: 0.2 }); }
  leaves(x, y, z, n = 8) {
    const R = this.R;
    for (let i = 0, m = this.n(n); i < m; i++) {
      const a = R() * TAU, sp = 0.8 + R() * 1.5;
      this._p({ x, y, z, vx: Math.cos(a) * sp, vy: 1.5 + R() * 1.5, vz: Math.sin(a) * sp * 0.6, g: 6, drag: 2, size: 0.1 + R() * 0.07, life: 0.9 + R() * 0.5, spr: SPR.leaf(R() < 0.5 ? '#6cbf4b' : '#9a6a3e'), spin: (R() - 0.5) * 8, floor: 0.02 });
    }
  }
  dust(x, y, z, n = 8) {
    const R = this.R;
    for (let i = 0, m = this.n(n); i < m; i++) {
      const a = R() * TAU, sp = 0.5 + R() * 1;
      this._p({ x, y, z, vx: Math.cos(a) * sp, vy: 0.4 + R() * 0.5, vz: Math.sin(a) * sp * 0.6, g: 1, drag: 2.5, size: 0.16 + R() * 0.14, life: 0.7 + R() * 0.4, spr: SPR.puff('#c9a57a'), a: 0.6, grow: 1.2 });
    }
  }
  confetti(center, n = 60) {
    const R = this.R;
    const cols = ['#ff6b8b', '#ffd23f', '#6bd66b', '#4fb5ff', '#b28bff', '#ff9f43'];
    for (let i = 0, m = this.n(n); i < m; i++) this._p({ x: center.x + (R() - 0.5) * 14, y: 5 + R() * 5, z: center.z + (R() - 0.5) * 10, vy: -1 - R(), g: 1.2, drag: 0.8, size: 0.16 + R() * 0.1, life: 4 + R() * 2, spr: SPR.confetti(cols[i % cols.length]), spin: (R() - 0.5) * 8, wander: 4, floor: 0.02, flip: 8 + R() * 8 });
  }
  setFireflies(on) { this.fireflies = on ? 1 : 0; }
  setMotes(on) { this.motes = on ? 1 : 0; }
  setRain(on) { this.rain = on ? 1 : 0; }

  // center: {x, z} of the view (ambient particles spawn around it)
  update(dt, center, spanX = 12, spanZ = 9) {
    const R = this.R, amb = this.q.ambient ?? 1;
    if (this.fireflies && R() < dt * 9 * amb) {
      const x = center.x + (R() - 0.5) * spanX * 2, z = center.z + (R() - 0.5) * spanZ * 2;
      this._p({ x, y: 0.3 + R() * 1.8, z, wander: 1.6, drag: 1, size: 0.07 + R() * 0.05, life: 4 + R() * 3, spr: SPR.glow('#dcff7a'), add: true, pulse: 4, fadeIn: 0.8, fadeAt: 0.7 });
    }
    if (this.motes && R() < dt * 7 * amb) {
      const x = center.x + (R() - 0.5) * spanX * 2, z = center.z + (R() - 0.5) * spanZ * 2;
      this._p({ x, y: 0.2 + R() * 2.5, z, vy: 0.12, wander: 0.9, size: 0.06 + R() * 0.05, life: 3 + R() * 2, spr: SPR.glow('#ffe39a'), add: true, fadeIn: 0.6 });
    }
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.wander) { p.vx += (R() - 0.5) * p.wander * dt * 6; p.vz += (R() - 0.5) * p.wander * dt * 6; p.vy += (R() - 0.5) * p.wander * dt * 3; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; p.wander = 0; p.flip = 0; }
      p.rot += p.spin * dt;
      L[j++] = p;
    }
    L.length = j;
  }

  particles(ctx, s, time) { this._draw(ctx, s, time, false); }
  glow(ctx, s, time) { ctx.globalCompositeOperation = 'lighter'; this._draw(ctx, s, time, true); ctx.globalCompositeOperation = 'source-over'; }
  _draw(ctx, s, time, additive) {
    const ppu = s.cam.ppu;
    for (const p of this.list) {
      if (p.add !== additive) continue;
      const t = p.age / p.life;
      let a = p.a * (t > p.fadeAt ? 1 - (t - p.fadeAt) / (1 - p.fadeAt) : 1);
      if (p.fadeIn) a *= Math.min(1, p.age / p.fadeIn);
      if (p.pulse) a *= 0.55 + 0.45 * Math.sin(time * p.pulse + p.seed);
      if (a <= 0.01) continue;
      const X = s.sx(p.x), Y = s.sy(p.z * SQ - p.y * HY);
      const size = p.size * (1 + p.grow * t);
      if (p.ring) {
        ctx.globalAlpha = a; ctx.strokeStyle = p.ring; ctx.lineWidth = Math.max(1, ppu * 0.03);
        ctx.beginPath(); ctx.ellipse(X, Y, size * ppu, size * ppu * SQ, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      const fl = p.flip ? Math.cos(time * p.flip + p.seed) : 1;
      drawSprite(ctx, p.spr, X, Y, ppu * size, 1, Math.abs(fl) < 0.15 ? 0.15 * Math.sign(fl || 1) : fl, p.rot, a);
    }
  }
}
