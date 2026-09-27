// Stage: the 2D canvas, device-pixel handling, quality tiers, the 3/4-view camera, the tiled ground layer and
// the frame composition (ground → ground effects → depth-sorted objects → particles → light & weather).
import { SQ, HY } from './view3q.js';

export const QUALITY = {
  low: { name: 'low', dpr: 1, particles: 0.5, ambient: 0.5, detail: 0.6, glow: false },
  medium: { name: 'medium', dpr: 1.5, particles: 0.8, ambient: 1, detail: 1, glow: true },
  high: { name: 'high', dpr: 2, particles: 1, ambient: 1, detail: 1, glow: true },
};
// never render more than this many canvas pixels (big / high-DPI screens get a slightly softer image, not a slide show)
const MAX_PIXELS = 3.4e6;

// best guess at a tier from the CrazyGames system info / the device
export function detectQuality(info) {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || info?.device?.type === 'mobile' || info?.device?.type === 'tablet';
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (cores <= 2 || mem <= 2) return 'low';
  if (mobile) return cores >= 6 && mem >= 4 ? 'high' : 'medium';
  return 'high';
}

// Sprite resolutions come in quarter-octave steps (…, 64, 76, 91, 108, 128, …), rounded up so a sprite is only
// ever drawn slightly smaller than painted: zooming crosses a new step every ~19 % instead of every few pixels.
const quantRes = (r) => Math.max(8, Math.round(Math.pow(2, Math.ceil(Math.log2(Math.max(1, r)) * 4 - 1e-9) / 4)));

// ------------------------------------------------------------------------------------------ tiled ground
// The ground (lawn, paths, pond...) is static art, so it is painted once into 256 px tiles per zoom level and
// cached. Missing tiles are painted a few per frame within a time budget, with a low-resolution overview of the
// whole map (and tiles from the previous zoom level) standing in until they are ready: no frame ever repaints
// the whole screen, so panning, zooming and buying plots never freeze.
const TILE = 256, PAD = 1;
const LV0 = 10, LVSTEP = 1.2;
const levelOf = (res) => Math.max(0, Math.round(Math.log(res / LV0) / Math.log(LVSTEP)));
const resOf = (k) => LV0 * Math.pow(LVSTEP, k);
const OVERVIEW = { X0: -30, X1: 30, Y0: -24 * SQ, Y1: 26 * SQ, res: 9 };

class Ground {
  constructor(stage) {
    this.s = stage;
    this.tiles = new Map();
    this.want = [];
    this.frame = 0;
    this.overview = null;
    this.level = -1; this.prevLevel = -1;
    this.budgetMs = 5;
  }
  invalidate() { this.tiles.clear(); this.overview = null; }
  _res() {
    // the ground is soft: cap its resolution at 1.5 device px per CSS px
    const d = Math.min(this.s._dpr || 1, 1.5);
    return this.s.target.ppu * d;
  }
  _paint(k, i, j) {
    const res = resOf(k), unit = TILE / res;
    const c = document.createElement('canvas');
    c.width = c.height = TILE + PAD * 2;
    const g = c.getContext('2d', { alpha: false });
    const X0 = i * unit - PAD / res, Y0 = j * unit - PAD / res;
    g.setTransform(res, 0, 0, res, -X0 * res, -Y0 * res);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const X1 = X0 + (TILE + PAD * 2) / res, Y1 = Y0 + (TILE + PAD * 2) / res;
    g.fillStyle = '#7cc458'; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    this.s.paintGround?.(g, X0, Y0, X1, Y1, 1 / res);
    return { c, used: this.frame };
  }
  _overview() {
    const o = OVERVIEW;
    const c = document.createElement('canvas');
    c.width = Math.ceil((o.X1 - o.X0) * o.res); c.height = Math.ceil((o.Y1 - o.Y0) * o.res);
    const g = c.getContext('2d', { alpha: false });
    g.setTransform(o.res, 0, 0, o.res, -o.X0 * o.res, -o.Y0 * o.res);
    g.fillStyle = '#7cc458'; g.fillRect(o.X0, o.Y0, o.X1 - o.X0, o.Y1 - o.Y0);
    this.s.paintGround?.(g, o.X0, o.Y0, o.X1, o.Y1, 1 / o.res, { coarse: true });
    this.overview = c;
  }
  _range(k, v) {
    const unit = TILE / resOf(k);
    return { unit, i0: Math.floor(v.X0 / unit), i1: Math.floor(v.X1 / unit), j0: Math.floor(v.Y0 / unit), j1: Math.floor(v.Y1 / unit) };
  }
  // paint every visible tile now (used while the loading screen is up)
  fill() {
    const k = levelOf(this._res()), r = this._range(k, this.s.view(0.5));
    for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) {
      const key = k + ':' + i + ':' + j;
      if (!this.tiles.has(key)) this.tiles.set(key, this._paint(k, i, j));
    }
    if (!this.overview) this._overview();
  }
  // paint missing tiles nearest the middle of the screen first, within the time budget
  tick() {
    if (!this.want.length) return;
    if (this.s.zooming) { this.want.length = 0; return; }       // mid-zoom: the previous level stands in until it settles
    const t0 = performance.now();
    const c = this.s.cam;
    this.want.sort((a, b) => (a.cx - c.x) ** 2 + (a.cy - c.y) ** 2 - ((b.cx - c.x) ** 2 + (b.cy - c.y) ** 2));
    for (const w of this.want) {
      if (performance.now() - t0 > this.budgetMs) break;
      if (!this.tiles.has(w.key)) this.tiles.set(w.key, this._paint(w.k, w.i, w.j));
    }
    this.want.length = 0;
  }
  _drawLevel(ctx, k, v, onlyMissing = null) {
    const s = this.s, ppu = s.cam.ppu, r = this._range(k, v), res = resOf(k);
    const size = (TILE + PAD * 2) / res * ppu, off = PAD / res;
    let missing = 0;
    for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) {
      const key = k + ':' + i + ':' + j, t = this.tiles.get(key);
      if (t) {
        t.used = this.frame;
        // tiles overlap by their padding, so there are no seams even when drawn at fractional positions
        ctx.drawImage(t.c, s.sx(i * r.unit - off), s.sy(j * r.unit - off), size, size);
      } else {
        missing++;
        if (!onlyMissing) this.want.push({ key, k, i, j, cx: (i + 0.5) * r.unit, cy: (j + 0.5) * r.unit });
      }
    }
    return missing;
  }
  draw(ctx) {
    this.frame++;
    if (!this.overview) this._overview();
    const s = this.s, k = levelOf(this._res()), v = s.view(0.05);
    if (k !== this.level) { this.prevLevel = this.level; this.level = k; }
    // count missing first (cheap), then layer: overview → previous level → this level
    const r = this._range(k, v);
    let missing = 0;
    for (let j = r.j0; j <= r.j1 && !missing; j++) for (let i = r.i0; i <= r.i1; i++) if (!this.tiles.has(k + ':' + i + ':' + j)) { missing++; break; }
    if (missing) {
      const o = OVERVIEW, ppu = s.cam.ppu;
      ctx.drawImage(this.overview, s.sx(o.X0), s.sy(o.Y0), (o.X1 - o.X0) * ppu, (o.Y1 - o.Y0) * ppu);
      if (this.prevLevel >= 0 && this.prevLevel !== k) this._drawLevel(ctx, this.prevLevel, v, true);
    }
    this._drawLevel(ctx, k, v);
    // forget tiles that have not been on screen for a while
    if (this.frame % 120 === 0 && this.tiles.size > 160) {
      const old = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let n = 0; n < old.length - 140; n++) this.tiles.delete(old[n][0]);
    }
  }
}

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
    this.paintGround = null;          // (ctx, X0, Y0, X1, Y1, px, opts) painted in screen-space world units
    this.ground = new Ground(this);
    this.onResize = null;
    this.onQuality = null;
    this.fps = { t: 0, n: 0, slow: 0 };
    this.vw = 1; this.vh = 1;
    this.resize(true);
  }

  get dpr() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    return Math.max(0.75, Math.min(window.devicePixelRatio || 1, this.q.dpr, Math.sqrt(MAX_PIXELS / (w * h))));
  }
  // true while the player is zooming (sprite and ground repaints wait for the zoom to settle)
  get zooming() { return performance.now() - (this.zoomAt || -1e9) < 180; }
  get width() { return this.vw; }
  get height() { return this.vh; }
  // device pixels per world unit at the camera's target zoom (sprites are painted for this)
  get res() { return quantRes(this.target.ppu * this._dpr); }
  resFor(scale) { return quantRes(this.target.ppu * this._dpr * scale); }

  resize(force = false) {
    const w = Math.max(1, Math.round(window.innerWidth)), h = Math.max(1, Math.round(window.innerHeight));
    const dpr = this.dpr;
    if (!force && w === this.vw && h === this.vh && this._dpr === dpr) return;
    this.vw = w; this.vh = h; this._dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.onResize?.(w, h);
  }

  setQuality(name) {
    const q = QUALITY[name];
    if (!q || q === this.q) return;
    this.q = q;
    this.ground.invalidate();
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
    if (Math.abs(ppu - this.target.ppu) > 1e-3) this.zoomAt = performance.now();
    this.target.x = x; this.target.y = y; this.target.ppu = ppu;
    if (snap) { this.cam.x = x; this.cam.y = y; this.cam.ppu = ppu; }
  }
  updateCamera(dt) {
    const c = this.cam, t = this.target, k = 1 - Math.exp(-3.2 * dt);
    c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k;
    c.ppu += (t.ppu - c.ppu) * k;
    if (Math.abs(t.ppu - c.ppu) < 0.002 * t.ppu && Math.abs(t.x - c.x) < 0.002 && Math.abs(t.y - c.y) < 0.002) { c.x = t.x; c.y = t.y; c.ppu = t.ppu; }
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

  // ------------------------------------------------------------------------------------------ frame
  render(time) {
    const ctx = this.ctx, dpr = this._dpr;
    this.ground.tick();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.imageSmoothingEnabled = true;
    if (this.cam.shake > 0) {
      const s = this.cam.shake * this.cam.shake * 6;
      ctx.translate(Math.sin(time * 61) * s, Math.cos(time * 47) * s);
    }
    ctx.fillStyle = '#7cc458';
    ctx.fillRect(-20, -20, this.vw + 40, this.vh + 40);
    this.ground.draw(ctx);
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
    for (const l of this.layers) l.hud?.(ctx, this, time);
  }
}
