// The golden bee: a rare visitor that drifts across the garden for a few seconds. Tapping it pays out a shower of
// coins. Game drives when it appears (Game._goldenTick); this only flies and paints it.
import { Sprite, SpriteBank, drawSprite, softEllipse } from './paint.js';
import { SQ, HY } from './view3q.js';

const TAU = Math.PI * 2;
const bank = new SpriteBank();
const SIZE = 0.8;                      // world units per bee unit

function paintBody(ctx, px) {
  const lw = Math.max(0.05, px * 1.7), inkC = '#6a3a06';
  ctx.strokeStyle = inkC; ctx.lineWidth = lw * 0.9;
  for (const x of [-0.12, 0.05, 0.2]) { ctx.beginPath(); ctx.moveTo(x, 0.3); ctx.quadraticCurveTo(x - 0.02, 0.42, x - 0.07, 0.46); ctx.stroke(); }
  ctx.fillStyle = '#7a4a0a';
  ctx.beginPath(); ctx.moveTo(-0.46, -0.02); ctx.lineTo(-0.64, 0.08); ctx.lineTo(-0.45, 0.13); ctx.closePath(); ctx.fill();
  const body = () => { ctx.beginPath(); ctx.ellipse(0, 0, 0.52, 0.41, 0, 0, TAU); };
  body();
  const g = ctx.createRadialGradient(-0.14, -0.22, 0.04, 0, 0, 0.62);
  g.addColorStop(0, '#fffbe0'); g.addColorStop(0.35, '#ffe45c'); g.addColorStop(0.75, '#f5b416'); g.addColorStop(1, '#c97c06');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); body(); ctx.clip();
  ctx.fillStyle = '#b8740a';
  for (const x of [-0.14, -0.4]) { ctx.beginPath(); ctx.ellipse(x, 0, 0.08, 0.5, 0.12, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const x of [-0.16, -0.42]) { ctx.beginPath(); ctx.ellipse(x - 0.03, -0.18, 0.03, 0.12, 0.12, 0, TAU); ctx.fill(); }
  ctx.restore();
  body(); ctx.strokeStyle = inkC; ctx.lineWidth = lw; ctx.stroke();
  // face
  ctx.fillStyle = '#2a1606';
  ctx.beginPath(); ctx.ellipse(0.27, -0.07, 0.085, 0.115, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0.295, -0.11, 0.035, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,120,120,0.6)';
  ctx.beginPath(); ctx.ellipse(0.34, 0.1, 0.07, 0.045, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = inkC; ctx.lineWidth = lw * 0.8;
  ctx.beginPath(); ctx.arc(0.4, 0.02, 0.06, 0.3, 1.6); ctx.stroke();
  // a tiny crown
  ctx.beginPath();
  ctx.moveTo(0.02, -0.36); ctx.lineTo(0.06, -0.6); ctx.lineTo(0.14, -0.46); ctx.lineTo(0.22, -0.64); ctx.lineTo(0.28, -0.46); ctx.lineTo(0.36, -0.58); ctx.lineTo(0.36, -0.33);
  ctx.closePath();
  ctx.fillStyle = '#ffd84d'; ctx.fill(); ctx.strokeStyle = inkC; ctx.lineWidth = lw * 0.8; ctx.stroke();
  ctx.fillStyle = '#ff6b8b'; ctx.beginPath(); ctx.arc(0.21, -0.43, 0.04, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.ellipse(0.0, -0.26, 0.14, 0.06, -0.15, 0, TAU); ctx.fill();
}
function paintWing(ctx, px) {
  ctx.beginPath(); ctx.ellipse(-0.12, -0.34, 0.2, 0.36, -0.35, 0, TAU);
  const g = ctx.createLinearGradient(-0.3, -0.7, 0.1, 0);
  g.addColorStop(0, 'rgba(255,255,240,0.98)'); g.addColorStop(1, 'rgba(255,226,140,0.7)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(190,130,20,0.8)'; ctx.lineWidth = Math.max(0.04, px * 1.4); ctx.stroke();
}
const body = (res) => bank.get('gbody', res, (r) => new Sprite(1.6, 1.7, 0.75, 1.0, r, paintBody));
const wing = (res) => bank.get('gwing', res, (r) => new Sprite(0.8, 0.9, 0.45, 0.8, r, paintWing));
const aura = (res) => bank.get('gaura', res, (r) => new Sprite(3, 3, 1.5, 1.5, r, (ctx) => softEllipse(ctx, 0, 0, 1.4, 1.4, '#ffe27a', 0.75, 0.02)));
const shadow = (res) => bank.get('gshadow', res, (r) => new Sprite(2.2, 1.2, 1.1, 0.6, r, (ctx) => softEllipse(ctx, 0, 0, 1, 0.5, '#173512', 0.5, 0.2)));

export class GoldenBee {
  constructor(fx) {
    this.fx = fx;
    this.on = false;
    this.x = 0; this.y = 1.6; this.z = 0; this.face = 1;
    this.sortY = 0;
    this.draw = (ctx, s, t) => this._draw(ctx, s, t);
    this.sparkT = 0;
  }
  // zip in from one side, bumble about over `mid` for most of the flight, zip out the other side (world units, seconds)
  start(from, to, dur = 11, mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }) {
    this.on = true; this.t = 0; this.dur = dur; this.from = from; this.to = to; this.mid = mid; this.caught = 0;
    this.seed = Math.random() * 10;
    this.face = to.x > from.x ? 1 : -1;
  }
  stop() { this.on = false; }
  get done() { return this.on && this.t >= this.dur; }
  update(dt, time) {
    if (!this.on) return;
    this.t += dt;
    if (this.caught) {
      // spin up and away
      this.caught += dt;
      this.y += dt * 4; this.x += this.face * dt * 2;
      if (this.caught > 0.7) this.on = false;
      return;
    }
    const p = this.at(this.t);
    this.x = p.x; this.y = p.y; this.z = p.z;
    this.sortY = this.z * SQ + 0.5;
    this.sparkT += dt;
    if (this.sparkT > 0.09) { this.sparkT = 0; this.fx?.sparkles(this.x - this.face * 0.3, this.y, this.z, '#ffe27a', 1, 0.2, 0.8); }
  }
  // where the bee is t seconds into its flight (world units)
  at(t) {
    const d = 2 * Math.min(1, t / this.dur) - 1, e = Math.abs(d) ** 2.2;   // 0 over the middle of the flight, 1 at its ends
    const m = this.mid, a = d < 0 ? this.from : this.to;
    return {
      x: m.x + (a.x - m.x) * e + Math.sin(t * 1.1 + this.seed) * 0.8,
      y: 1.7 + Math.sin(t * 2.3 + this.seed) * 0.35,
      z: m.z + (a.z - m.z) * e + Math.sin(t * 0.7 + this.seed * 2) * 1.1,
    };
  }
  catch() { this.caught = 0.001; this.fx?.sparkles(this.x, this.y, this.z, '#ffd23a', 14, 1.3, 1.1); this.fx?.petals(this.x, this.y, this.z, ['#ffd84d', '#ffe99a', '#f5b416'], 10); }
  collect(list) { if (this.on) list.push(this); }
  screen(s) { return s.project(this.x, this.y, this.z); }
  _draw(ctx, s, time) {
    const res = s.resFor(SIZE), ppu = s.cam.ppu * SIZE;
    const gx = s.sx(this.x), gy = s.sy(this.z * SQ);
    drawSprite(ctx, shadow(s.res), gx + this.y * 0.2 * s.cam.ppu, gy, s.cam.ppu * 0.3, 1, 1, 0, 0.3);
    const x = gx, y = s.sy(this.z * SQ - this.y * HY);
    const a = this.caught ? Math.max(0, 1 - this.caught / 0.7) : Math.min(1, this.t / 0.5, (this.dur - this.t) / 0.5 + 0.001);
    ctx.globalCompositeOperation = 'lighter';
    drawSprite(ctx, aura(s.resFor(0.6)), x, y - 0.1 * ppu, ppu * (0.9 + 0.12 * Math.sin(time * 6)), 1, 1, 0, 0.55 * a);
    ctx.globalCompositeOperation = 'source-over';
    const flap = Math.sin(time * 48 + this.seed * 7);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * 3 + this.seed) * 0.12 + (this.caught ? this.caught * 12 : 0));
    ctx.scale(this.face, 1);
    drawSprite(ctx, wing(res), -0.04 * ppu, -0.28 * ppu, ppu, 1, 0.35 + 0.65 * Math.abs(flap), -0.2, 0.9 * a);
    drawSprite(ctx, body(res), 0, 0, ppu, 1, 1, 0, a);
    drawSprite(ctx, wing(res), 0.08 * ppu, -0.3 * ppu, ppu, 1, 0.3 + 0.7 * Math.abs(Math.sin(time * 48 + this.seed * 7 + 0.9)), 0.1, 0.92 * a);
    ctx.restore();
  }
}
