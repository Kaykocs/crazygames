// Stage: the 2D canvas, device-pixel handling, quality tiers, the 3/4-view camera, a cached ground layer and
// the frame composition (ground → ground effects → depth-sorted objects → particles → light & weather).
import { SQ, HY } from './view3q.js';

export const QUALITY = {
  low: { name: 'low', dpr: 1, particles: 0.5, ambient: 0.5, detail: 0.6, glow: false },
  medium: { name: 'medium', dpr: 1.5, particles: 0.8, ambient: 1, detail: 1, glow: true },
  high: { name: 'high', dpr: 2, particles: 1, ambient: 1, detail: 1, glow: true },
};

// best guess at a tier from the CrazyGames system info / the device
export function detectQuality(info) {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || info?.device?.type === 'mobile' || info?.device?.type === 'tablet';
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (cores <= 2 || mem <= 2) return 'low';
  if (mobile) return cores >= 6 && mem >= 4 ? 'high' : 'medium';
  return 'high';
}

const quantRes = (r) => Math.max(8, Math.round(r / 6) * 6);

export class Stage {
  constructor(container, qualityName = 'high') {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', 'Garden');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.q = QUALITY[qualityName] || QUALITY.high;
    this.cam = { x: 0, y: 0, ppu: 60, shake: 0 };
    this.target = { x: 0, y: 0, ppu: 60 };
    this.layers = [];                 // objects with optional ground / collect / particles / overlay / glow / post passes
    this.list = [];
    this.gcv = document.createElement('canvas');
    this.gctx = this.gcv.getContext('2d', { alpha: false });
    this.bake = null;                 // { X0, Y0, X1, Y1, ppu, dpr }
    this.groundDirty = true;
    this.paintGround = null;          // (ctx, X0, Y0, X1, Y1, px) painted in screen-space world units
    this.onResize = null;
    this.onQuality = null;
    this.fps = { t: 0, n: 0, slow: 0 };
    this.vw = 1; this.vh = 1;
    this.resize(true);
  }

  get dpr() { return Math.min(window.devicePixelRatio || 1, this.q.dpr); }
  get width() { return this.vw; }
  get height() { return this.vh; }
  // device pixels per world unit at the camera's target zoom (sprites are painted for this)
  get res() { return quantRes(this.target.ppu * this.dpr); }
  resFor(scale) { return quantRes(this.target.ppu * this.dpr * scale); }

  resize(force = false) {
    const w = Math.max(1, Math.round(window.innerWidth)), h = Math.max(1, Math.round(window.innerHeight));
    const dpr = this.dpr;
    if (!force && w === this.vw && h === this.vh && this._dpr === dpr) return;
    this.vw = w; this.vh = h; this._dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.groundDirty = true;
    this.onResize?.(w, h);
  }

  setQuality(name) {
    const q = QUALITY[name];
    if (!q || q === this.q) return;
    this.q = q;
    this.resize(true);
    this.onQuality?.(q);
  }

  // automatic quality: step down after sustained slow frames
  govern(dt, active) {
    if (!active) return;
    const f = this.fps;
    f.t += dt; f.n++;
    if (f.t < 2) return;
    const fps = f.n / f.t;
    f.t = 0; f.n = 0;
    if (fps < 40) f.slow++; else f.slow = Math.max(0, f.slow - 1);
    if (f.slow >= 3) {
      f.slow = 0;
      if (this.q.name === 'high') this.setQuality('medium');
      else if (this.q.name === 'medium') this.setQuality('low');
    }
  }

  // ------------------------------------------------------------------------------------------ camera
  setTarget(x, y, ppu, snap = false) {
    this.target.x = x; this.target.y = y; this.target.ppu = ppu;
    if (snap) { this.cam.x = x; this.cam.y = y; this.cam.ppu = ppu; this.groundDirty = true; }
  }
  updateCamera(dt) {
    const c = this.cam, t = this.target, k = 1 - Math.exp(-3.2 * dt);
    c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k;
    c.ppu += (t.ppu - c.ppu) * k;
    if (Math.abs(t.ppu - c.ppu) < 0.02 * t.ppu && Math.abs(t.x - c.x) < 0.02 && Math.abs(t.y - c.y) < 0.02) { c.x = t.x; c.y = t.y; c.ppu = t.ppu; }
    c.shake = Math.max(0, c.shake - dt * 3);
  }
  // screen-space world units → CSS pixels
  sx(X) { return (X - this.cam.x) * this.cam.ppu + this.vw / 2; }
  sy(Y) { return (Y - this.cam.y) * this.cam.ppu + this.vh / 2; }
  project(x, y, z, out = { x: 0, y: 0, vis: true }) {
    out.x = this.sx(x); out.y = this.sy(z * SQ - y * HY); out.vis = true;
    return out;
  }
  // CSS pixels → world (x, z) on the horizontal plane at height y
  unproject(px, py, y = 0) {
    const X = (px - this.vw / 2) / this.cam.ppu + this.cam.x, Y = (py - this.vh / 2) / this.cam.ppu + this.cam.y;
    return { x: X, z: (Y + y * HY) / SQ };
  }
  // visible rectangle in screen-space world units (with a margin in units)
  view(m = 0) {
    const hw = this.vw / 2 / this.cam.ppu, hh = this.vh / 2 / this.cam.ppu;
    return { X0: this.cam.x - hw - m, X1: this.cam.x + hw + m, Y0: this.cam.y - hh - m, Y1: this.cam.y + hh + m };
  }

  // ------------------------------------------------------------------------------------------ ground layer
  _bakeGround() {
    const t = this.target, dpr = this.dpr;
    const hw = this.vw / 2 / t.ppu, hh = this.vh / 2 / t.ppu;
    const m = 0.12;
    const X0 = t.x - hw * (1 + m), X1 = t.x + hw * (1 + m), Y0 = t.y - hh * (1 + m), Y1 = t.y + hh * (1 + m);
    const W = Math.ceil((X1 - X0) * t.ppu * dpr), H = Math.ceil((Y1 - Y0) * t.ppu * dpr);
    if (this.gcv.width !== W || this.gcv.height !== H) { this.gcv.width = W; this.gcv.height = H; }
    const g = this.gctx;
    const k = t.ppu * dpr;
    g.setTransform(k, 0, 0, k, -X0 * k, -Y0 * k);
    g.lineJoin = 'round'; g.lineCap = 'round';
    this.paintGround?.(g, X0, Y0, X1, Y1, 1 / k);
    this.bake = { X0, Y0, X1, Y1, ppu: t.ppu };
    this.groundDirty = false;
  }
  _groundValid() {
    const b = this.bake, t = this.target;
    if (!b || this.groundDirty) return false;
    if (Math.abs(b.ppu / t.ppu - 1) > 0.02) return false;
    const hw = this.vw / 2 / t.ppu, hh = this.vh / 2 / t.ppu;
    return t.x - hw >= b.X0 - 1e-3 && t.x + hw <= b.X1 + 1e-3 && t.y - hh >= b.Y0 - 1e-3 && t.y + hh <= b.Y1 + 1e-3;
  }

  // ------------------------------------------------------------------------------------------ frame
  render(time) {
    if (!this._groundValid()) this._bakeGround();
    const ctx = this.ctx, dpr = this._dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.imageSmoothingEnabled = true;
    if (this.cam.shake > 0) {
      const s = this.cam.shake * this.cam.shake * 6;
      ctx.translate(Math.sin(time * 61) * s, Math.cos(time * 47) * s);
    }
    const b = this.bake, ppu = this.cam.ppu;
    ctx.fillStyle = '#7cc458';
    ctx.fillRect(-20, -20, this.vw + 40, this.vh + 40);
    ctx.drawImage(this.gcv, this.sx(b.X0), this.sy(b.Y0), (b.X1 - b.X0) * ppu, (b.Y1 - b.Y0) * ppu);
    for (const l of this.layers) l.ground?.(ctx, this, time);
    const list = this.list;
    list.length = 0;
    for (const l of this.layers) l.collect?.(list, this, time);
    list.sort((a, b2) => a.sortY - b2.sortY);
    for (let i = 0; i < list.length; i++) list[i].draw(ctx, this, time);
    for (const l of this.layers) l.particles?.(ctx, this, time);
    for (const l of this.layers) l.overlay?.(ctx, this, time);
    for (const l of this.layers) l.glow?.(ctx, this, time);
    for (const l of this.layers) l.post?.(ctx, this, time);
  }
}
