// Records the CrazyGames preview videos: landscape 1920x1080 and portrait 1080x1920, ~18 s, 30 fps, silent.
//
// The game is really played — real mouse clicks / drags (desktop) and real touch events (portrait) — by a scripted
// "player" whose cursor moves like a hand does: bowed paths, minimum-jerk easing, small overshoots, tremor, reaction
// pauses. Every frame is rendered under a virtual clock (game loop, UI timers, CSS animations all advance exactly
// 1/30 s per frame), so the result is perfectly smooth no matter how slowly the headless browser renders. Shots are
// staged on a mature garden, captured to their own clips, then cut together with short crossfades.
//
//   node tools/video.mjs [--only=landscape|portrait] [--keep] [--shots=a,b] [--cut]
//     → crazygames-upload/3-videos/trailer-<format>-<WxH>.mp4 (clips are kept in build/video-clips with --keep)
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const FPS = 30, DT = 1000 / FPS;
const XF = 0.2;                       // crossfade between shots (s)

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { /* not on PATH */ }
  try { return execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim(); } catch { /* no pip build */ }
  throw new Error('ffmpeg not found: install it or `pip install imageio-ffmpeg`');
}
const FF = findFfmpeg();

const FORMATS = {
  landscape: { viewport: { width: 1280, height: 720 }, dpr: 1.5, size: [1920, 1080], touch: false },
  portrait: { viewport: { width: 432, height: 768 }, dpr: 2.5, size: [1080, 1920], touch: true },
};

// ------------------------------------------------------------------------------------------ page-side helpers
// Installed before the game boots; the virtual clock only takes over when __vt.start() is called.
const INIT = () => {
  const R = {
    raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window),
    st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window), si: window.setInterval.bind(window),
    pnow: performance.now.bind(performance), dnow: Date.now,
  };
  const vt = { active: false, now: 0, base: 0, dbase: 0, rafs: [], timers: new Map(), id: 1e7 };
  vt.start = () => {
    if (vt.active) return;
    vt.active = true; vt.base = R.pnow(); vt.dbase = R.dnow(); vt.now = 0;
    window.requestAnimationFrame = (cb) => { const id = vt.id++; vt.rafs.push({ id, cb }); return id; };
    window.cancelAnimationFrame = (id) => { vt.rafs = vt.rafs.filter((r) => r.id !== id); };
    window.setTimeout = (fn, ms = 0, ...a) => { const id = vt.id++; vt.timers.set(id, { at: vt.now + Math.max(0, +ms || 0), fn: typeof fn === 'function' ? fn : () => {}, a }); return id; };
    window.clearTimeout = (id) => { vt.timers.delete(id); };
    window.setInterval = (fn, ms, ...a) => { const id = vt.id++; const every = Math.max(1, +ms || 1); vt.timers.set(id, { at: vt.now + every, fn, a, every }); return id; };
    window.clearInterval = window.clearTimeout;
    performance.now = () => vt.base + vt.now;
    Date.now = () => vt.dbase + vt.now;
  };
  vt.frame = (ms) => {
    const end = vt.now + ms;
    for (let guard = 0; guard < 2000; guard++) {
      let best = null, bid = 0;
      for (const [id, t] of vt.timers) if (t.at <= end && (!best || t.at < best.at)) { best = t; bid = id; }
      if (!best) break;
      vt.now = Math.max(vt.now, best.at);
      if (best.every) best.at += best.every; else vt.timers.delete(bid);
      try { best.fn(...best.a); } catch (e) { console.error(e); }
    }
    vt.now = end;
    const list = vt.rafs; vt.rafs = [];
    for (const r of list) { try { r.cb(vt.base + vt.now); } catch (e) { console.error(e); } }
    // CSS transitions / animations and element.animate() follow the virtual clock too
    for (const a of document.getAnimations()) {
      if (a.__vt0 === undefined) a.__vt0 = vt.now - ms * 0.5;
      const t = (vt.now - a.__vt0) * (a.playbackRate || 1);
      const endT = a.effect?.getComputedTiming?.().endTime;
      try {
        if (Number.isFinite(endT) && t >= endT) { a.currentTime = endT; if (a.playState !== 'finished') a.finish(); }
        else { a.pause(); a.currentTime = t; }
      } catch { /* detached */ }
    }
  };
  window.__vt = vt;

  // the player's pointer: an arrow cursor (desktop) or a touch indicator (phone)
  const cur = { el: null, ring: null, mode: 'mouse', rings: [] };
  cur.ensure = (mode) => {
    cur.mode = mode;
    if (cur.el) return;
    const el = document.createElement('div');
    el.id = '__cur';
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;transition:none;';
    el.innerHTML = mode === 'mouse'
      ? '<svg width="30" height="30" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))"><path d="M4 2.5 L4 19.5 L8.4 15.4 L11.3 21.7 L14.2 20.4 L11.4 14.2 L17.5 14.2 Z" fill="#fff" stroke="#1d1d1f" stroke-width="1.4" stroke-linejoin="round"/></svg>'
      : '<div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.42);border:2.5px solid rgba(255,255,255,.95);box-shadow:0 2px 8px rgba(0,0,0,.3), inset 0 0 6px rgba(0,0,0,.12)"></div>';
    document.body.appendChild(el);
    cur.el = el;
  };
  // x, y: CSS px (tip / finger centre); down: pressed; vis: 0..1; ring: spawn a click ripple
  cur.set = (x, y, down, vis, ring) => {
    const el = cur.el;
    if (!el) return;
    if (cur.mode === 'mouse') {
      const s = down ? 0.88 : 1;
      el.style.transform = `translate(${x - 4}px, ${y - 2.5}px) scale(${s})`;
      el.style.transformOrigin = '4px 2.5px';
    } else {
      const s = down ? 1 : 1.25;
      el.style.transform = `translate(${x - 23}px, ${y - 23}px) scale(${s})`;
    }
    el.style.opacity = String(vis);
    if (ring) {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:0;top:0;width:40px;height:40px;border-radius:50%;pointer-events:none;z-index:2147483646;'
        + (cur.mode === 'mouse' ? 'border:3px solid rgba(255,255,255,.95);box-shadow:0 0 0 1.5px rgba(40,30,20,.35);' : 'border:3px solid rgba(255,255,255,.9);');
      document.body.appendChild(r);
      cur.rings.push({ el: r, x, y, t: 0 });
    }
    for (const q of cur.rings) {
      q.t += 1 / 30;
      const k = q.t / 0.38, sc = 0.35 + k * 1.1;
      q.el.style.transform = `translate(${q.x - 20}px, ${q.y - 20}px) scale(${sc})`;
      q.el.style.opacity = String(Math.max(0, 1 - k));
    }
    cur.rings = cur.rings.filter((q) => { if (q.t >= 0.38) { q.el.remove(); return false; } return true; });
  };
  window.__cur = cur;
};

// ------------------------------------------------------------------------------------------ staging (page side)
// A mature, colourful garden. Runs in the page; `o` picks what each shot needs.
const STAGE = (o) => {
  const G = window.__game, g = G.garden, s = g.s, V = G.view;
  const key = (q, r) => q + ',' + r;
  if (s.tutorial < 99) G.debug.skipTutorial();
  // clear any UI leftovers
  G.ui.cards.length = 0;
  if (G.ui.cardOpen) G.ui._closeCard(true);
  if (G.ui.panel) G.ui.closePanel(true);
  document.querySelectorAll('.card-pop, .scrim, .toast, .float-txt, .flyer').forEach((e) => e.remove());
  G.ui.hoverInfo(0, 0, null);
  // progression (achievements and starter quests settled silently: no toasts popping into the shots)
  s.level = o.level ?? 14; s.xp = Math.round((o.xpK ?? 0.55) * 4000); s.coins = o.coins ?? 12480;

  s.upgrades.bees = 3; s.upgrades.gnome = 1; g.syncBees(); G.world.decor.setGnome(true);
  for (const id of o.decor ?? []) if (!s.decor[id]) { s.decor[id] = 1; G.world.decor.place(id, false); }
  // plots
  const R = o.radius ?? 2;
  g.plots.forEach((p, i) => {
    const d = Math.max(Math.abs(p.q), Math.abs(p.r), Math.abs(-p.q - p.r));
    p.owned = d <= R || (o.extra || []).includes(key(p.q, p.r));
    V.pv[i].bedK = p.owned ? 1 : 0;
    p.plant = null;
  });
  // flowers: [q, r, c1, shape, pattern, mut]
  const sp = g.s.book;
  for (const k in sp) delete sp[k];
  for (const [q, r, c1, shape, pattern = 0, mut = 0] of o.flowers || []) {
    const i = g.byKey.get(key(q, r));
    if (i === undefined || !g.plots[i].owned) continue;
    const genes = { c1, c2: pattern ? (c1 === 3 ? 7 : 3) : 3, shape, pattern, mut };
    const dur = g.plantDuration(genes);
    g.plots[i].plant = { g: genes, stage: o.growing?.includes(key(q, r)) ? 'grow' : 'bloom', t: o.growing?.includes(key(q, r)) ? dur * 0.4 : dur, dur, bloomT: 0, pollenT: o.rest ?? 99, harvests: 0, taps: 0 };
    sp[c1 * 8 + shape] = sp[c1 * 8 + shape] || { t: 1, n: 1 };
    const pv = V.pv[i];
    pv.g = genes; pv.stem = 0.64 * (mut === 5 ? 1.15 : 1); pv.head = mut === 5 ? 1.4 : 1; pv.open = 1; pv.pop = 0; pv.harvestT = 0;
  }
  for (const id of o.book || []) sp[id] = sp[id] || { t: 1, n: 1 };
  // seeds / pouch
  s.seeds = []; V.orbs.clear();
  s.pouch = (o.pouch || []).map(([c1, shape, n]) => ({ g: { c1, c2: 3, shape, pattern: 0, mut: 0 }, n }));
  G.ui.sel = -1; V.highlightEmpty = false;
  G.ui.dirty.pouch = G.ui.dirty.orders = true;
  // weather: set and fully blended, no announcement
  const kind = o.weather || 'clear';
  s.weather = { kind, until: s.t + 95, total: 140 };
  G._weather(kind, false);
  for (const k in G.world.weather.k) G.world.weather.k[k] = k === kind ? 1 : 0;
  g.tutorialSpeed = o.speed ?? 1;
  // bees home and resting unless a shot scripts them
  g.bees.forEach((b) => { b.state = 'home'; b.rest = o.beeRest ?? 1 + Math.random() * 2; b.a = b.b = -1; b.t = 0; });
  // camera
  V.override = null; V.focus = null;
  V.frame(true);
  V.user.x = o.camX ?? 0; V.user.y = o.camY ?? 0; V.user.zoom = o.zoom ?? 1; V.user.idle = 0;
  V._applyCam(true);
  V.drag = null; V.zips = []; V.golden.stop(); G.goldenT = 9999; G.hint = null; G.ui.tutFrame(null);
  g.combo = 0; g.comboT = -99;
  // achievements and starter quests settled silently (after plots, decor and book are staged): no toasts in the shots
  { const emit = g.emit; g.emit = () => {}; s.quest.i = 999; g.checkAchievements(); g.emit = emit; s.coins = o.coins ?? 12480; }
  document.querySelectorAll('.toast').forEach((e) => e.remove());
  window.__lockCam = !!o.lockCam;
  return true;
};

// ------------------------------------------------------------------------------------------ recorder
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const minJerk = (t) => t * t * t * (10 - 15 * t + 6 * t * t);

class Recorder {
  constructor(page, cdp, fmt, R) {
    this.page = page; this.cdp = cdp; this.fmt = fmt; this.R = R;
    this.x = fmt.viewport.width * 0.82; this.y = fmt.viewport.height * 0.86;
    this.down = false; this.vis = fmt.touch ? 0 : 1; this.ring = false;
    this.frames = 0; this.ff = null;
  }
  // --- clip output
  async open(file) {
    const [w, h] = this.fmt.size;
    this.ff = spawn(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-vf', `scale=${w}:${h}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    this.clipFrames = 0;
    this.file = file;
  }
  async close() {
    await new Promise((res, rej) => { this.ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))); this.ff.stdin.end(); });
    return this.clipFrames / FPS;
  }
  // --- one frame: advance the game 1/30 s, draw the pointer, grab the screen
  async frame(capture = true) {
    const vis = this.fmt.touch ? (this.down ? 1 : Math.max(0, this.vis - 0.34)) : this.vis;
    if (this.fmt.touch) this.vis = vis;
    await this.page.evaluate(([x, y, down, vis, ring, dt]) => {
      __vt.frame(dt);
      if (window.__lockCam && __game.view.user) __game.view.user.idle = 0;
      __cur.set(x, y, down, vis, ring);
    }, [this.x, this.y, this.down, vis, this.ring, DT]);
    this.ring = false;
    if (!capture) return;
    const buf = await this.page.screenshot({ type: 'png', animations: 'allow', caret: 'hide', scale: 'device' });
    if (!this.ff.stdin.write(buf)) await new Promise((r) => this.ff.stdin.once('drain', r));
    this.frames++; this.clipFrames++;
  }
  async warm(n) { for (let i = 0; i < n; i++) await this.frame(false); }
  async hold(sec) { const n = Math.round(sec * FPS); for (let i = 0; i < n; i++) { this._idle(i); await this.frame(); } }
  _idle(i) { if (!this.down && !this.fmt.touch) { this.x += Math.sin(this.frames * 0.21) * 0.25; this.y += Math.cos(this.frames * 0.17) * 0.2; } }
  // --- input
  async _move(x, y) {
    this.x = x; this.y = y;
    if (this.fmt.touch) { if (this.down) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }] }); }
    else await this.page.mouse.move(x, y);
  }
  async press() {
    this.down = true; this.ring = true;
    if (this.fmt.touch) { this.vis = 1; await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: this.x, y: this.y, radiusX: 8, radiusY: 8, force: 1, id: 1 }] }); }
    else await this.page.mouse.down();
  }
  async release() {
    this.down = false;
    if (this.fmt.touch) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await this.page.mouse.up();
  }
  // human-like move: bowed path, minimum-jerk easing, a little overshoot on long moves, tremor
  async moveTo(tx, ty, { speed = 1, settle = true } = {}) {
    const R = this.R, x0 = this.x, y0 = this.y, dx = tx - x0, dy = ty - y0, dist = Math.hypot(dx, dy);
    if (dist < 2) return;
    if (this.fmt.touch) {
      // a finger lifts and lands: no path, just a short beat of "travel" time
      const n = Math.max(3, Math.round((0.18 + Math.min(0.3, dist / 1500)) * FPS / speed));
      for (let i = 0; i < n; i++) await this.frame();
      this.x = tx; this.y = ty;
      return;
    }
    const dur = (0.26 + Math.min(0.5, dist / 1600)) / speed;
    const n = Math.max(4, Math.round(dur * FPS));
    const bow = (R() - 0.5) * 0.3 * dist, nx = -dy / dist, ny = dx / dist;
    const over = dist > 220 ? 0.025 + R() * 0.035 : 0;
    const ex = tx + dx * over, ey = ty + dy * over;
    const cx = x0 + dx * 0.55 + nx * bow, cy = y0 + dy * 0.55 + ny * bow;
    for (let i = 1; i <= n; i++) {
      const t = minJerk(i / n), u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * ex + (R() - 0.5) * 0.8;
      const y = u * u * y0 + 2 * u * t * cy + t * t * ey + (R() - 0.5) * 0.8;
      await this._move(x, y);
      await this.frame();
    }
    if (over) for (let i = 1; i <= 3; i++) { const k = minJerk(i / 3); await this._move(ex + (tx - ex) * k, ey + (ty - ey) * k); await this.frame(); }
    if (settle) for (let i = 0; i < 2 + Math.floor(R() * 3); i++) await this.frame();
  }
  async click(x, y, opts = {}) {
    await this.moveTo(x, y, opts);
    await this.press();
    for (let i = 0; i < 3; i++) await this.frame();
    await this.release();
    for (let i = 0; i < (opts.after ?? 3); i++) await this.frame();
  }
  // drag through points along a smooth curve at roughly `pps` CSS px per second
  async drag(points, { pps = 520, lead = true } = {}) {
    if (lead) await this.moveTo(points[0].x, points[0].y);
    await this.press();
    await this.frame();
    const P = [points[0], ...points, points[points.length - 1]];
    for (let s = 1; s < P.length - 2; s++) {
      const p0 = P[s - 1], p1 = P[s], p2 = P[s + 1], p3 = P[s + 2];
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const n = Math.max(3, Math.round((len / pps) * FPS * (0.85 + this.R() * 0.3)));
      for (let i = 1; i <= n; i++) {
        const t = i / n, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        await this._move(cr(p0.x, p1.x, p2.x, p3.x) + (this.R() - 0.5) * 1.2, cr(p0.y, p1.y, p2.y, p3.y) + (this.R() - 0.5) * 1.2);
        await this.frame();
      }
    }
    await this.frame();
    await this.release();
    await this.frame();
  }
  // --- where things are on screen right now
  head(q, r, dy = 0) { return this.page.evaluate(([q, r, dy]) => { const G = __game, i = G.garden.byKey.get(q + ',' + r), h = G.view.headPos(i); return G.view.project(h.x, h.y + dy, h.z); }, [q, r, dy]); }
  soil(q, r) { return this.page.evaluate(([q, r]) => { const G = __game, i = G.garden.byKey.get(q + ',' + r), w = G.garden.pos[i]; return G.view.project(w.x, 0.22, w.z); }, [q, r]); }
  el(sel, n = 0) { return this.page.evaluate(([sel, n]) => { const e = document.querySelectorAll(sel)[n]; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, [sel, n]); }
}

// ------------------------------------------------------------------------------------------ the garden we film
// [q, r, colour, shape, pattern, mutation] — a rainbow of species, a couple of rare variants for sparkle
const FLOWERS = [
  [0, 0, 7, 5], [1, 0, 1, 1], [0, 1, 2, 0], [-1, 1, 0, 0], [-1, 0, 6, 3], [0, -1, 12, 7], [1, -1, 13, 4],
  [2, -1, 8, 5, 0, 3], [2, 0, 4, 1], [1, 1, 11, 3], [0, 2, 9, 6], [-1, 2, 5, 7], [-2, 2, 14, 3], [-2, 1, 10, 0, 1],
  [-2, 0, 3, 7], [-1, -1, 7, 2], [0, -2, 6, 6, 0, 4], [1, -2, 1, 5], [2, -2, 0, 4, 2],
];
const DECOR = ['birdbath', 'bench', 'arch', 'lanterns', 'fountain'];
const BASE = { flowers: FLOWERS, decor: DECOR, radius: 2, lockCam: true, pouch: [[1, 1, 4], [2, 0, 2], [6, 3, 1]], coins: 12480 };

const SHOTS = {
  // 1. hook: carry pollen from one bloom onto another — a pollen trail, and a glowing hybrid seed pops out
  async cross(rec, fmt) {
    await rec.page.evaluate(STAGE, { ...BASE, zoom: fmt.touch ? 1.5 : 1.6, beeRest: 99, rest: 0 });
    await rec.page.evaluate((touch) => {
      const G = __game, g = G.garden, V = G.view, A = g.byKey.get('-1,1'), B = g.byKey.get('1,0');
      const mx = (g.pos[A].x + g.pos[B].x) / 2, mz = (g.pos[A].z + g.pos[B].z) / 2;
      V.user.x = mx - V.base.x; V.user.y = mz * 0.72 - 0.45 - V.base.y + (touch ? 0.25 : 0); V._applyCam(true);
      g.forceChild = { c1: 6, c2: 3, shape: 3, pattern: 0, mut: 0 };
      delete g.s.book[6 * 8 + 3];
    }, fmt.touch);
    await rec.warm(30);
    const a = await rec.head(-1, 1, -0.02), b = await rec.head(1, 0, -0.02);
    rec.x = a.x + (fmt.touch ? 0 : 170); rec.y = a.y + 150;
    await rec.hold(0.2);
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 60 };
    await rec.drag([a, { x: a.x + (mid.x - a.x) * 0.5, y: (a.y + mid.y) / 2 }, mid, b], { pps: fmt.touch ? 330 : 420 });
    await rec.moveTo(b.x + 70, b.y + 110, { speed: 0.9 });
    await rec.hold(0.55);
    const orb = await rec.page.evaluate(() => { const o = [...__game.view.orbs.values()].find((x) => !x.leaving); return o ? __game.view.orbScreen(o.id) : null; });
    if (orb) await rec.click(orb.x, orb.y, { after: 14 });
    await rec.hold(0.2);
  },
  // 2. drag the mystery seed onto the soil, tap-tap-tap: it shoots up and opens — a brand new species!
  async discover(rec, fmt) {
    await rec.page.evaluate(STAGE, { ...BASE, zoom: fmt.touch ? 1.45 : 1.55, beeRest: 99, flowers: FLOWERS.filter(([q, r]) => !(q === 0 && r === 0)), pouch: [[6, 3, 1], [1, 1, 4], [2, 0, 2]] });
    await rec.page.evaluate((touch) => {
      const G = __game, g = G.garden, V = G.view, i = g.byKey.get('0,0');
      V.user.x = g.pos[i].x - V.base.x; V.user.y = g.pos[i].z * 0.72 - 0.5 - V.base.y + (touch ? 0.35 : 0); V._applyCam(true);
      g.s.pouch[0].g = { c1: 6, c2: 3, shape: 3, pattern: 0, mut: 0 };
      delete g.s.book[6 * 8 + 3];
      G.ui.dirty.pouch = true;
    }, fmt.touch);
    await rec.warm(8);
    const chip = await rec.el('.pouch-list .seedchip', 0);
    const soil = await rec.soil(0, 0);
    rec.x = chip.x + (fmt.touch ? 0 : 140); rec.y = chip.y - 60;
    await rec.hold(0.1);
    await rec.drag([chip, { x: chip.x + (soil.x - chip.x) * 0.3, y: chip.y - 90 }, { x: soil.x, y: soil.y - 4 }], { pps: fmt.touch ? 420 : 560 });
    // a quick grow: short enough that eight quick taps and the natural growth open it
    await rec.page.evaluate(() => { const G = __game, g = G.garden, pl = g.plots[g.byKey.get('0,0')].plant; if (pl) { pl.dur = 2.6; pl.t = 0.2; } });
    const sprout = await rec.page.evaluate(() => { const G = __game, w = G.garden.pos[G.garden.byKey.get('0,0')]; return G.view.project(w.x, 0.55, w.z); });
    await rec.moveTo(sprout.x, sprout.y, { speed: 1.2 });
    for (let k = 0; k < 9; k++) {
      if (await rec.page.evaluate(() => !!document.querySelector('.card-pop:not(.leaving)'))) break;
      await rec.press(); await rec.frame(); await rec.frame(); await rec.release(); await rec.frame(); await rec.frame();
      rec.x += (rec.R() - 0.5) * 6; rec.y += (rec.R() - 0.5) * 5;
    }
    for (let i = 0; i < 60; i++) {
      await rec.frame();
      if (await rec.page.evaluate(() => !!document.querySelector('.card-pop:not(.leaving)'))) break;
    }
    await rec.moveTo(sprout.x + (fmt.touch ? 0 : 160), sprout.y + 120, { speed: 0.6 });
    await rec.hold(1.1);
  },
  // 3. harvest as fast as you can: combo ×2 ×3 ×4 … coins everywhere
  async combo(rec, fmt) {
    await rec.page.evaluate(STAGE, { ...BASE, zoom: fmt.touch ? 1.1 : 1.15, camY: fmt.touch ? 0.1 : 0.12, beeRest: 99 });
    await rec.warm(30);
    const row = fmt.touch ? [[-2, 1], [-1, 1], [0, 1], [1, 0], [2, -1], [2, 0]] : [[-2, 1], [-1, 0], [0, 0], [1, -1], [2, -1], [2, 0]];
    const pts = [];
    for (const [q, r] of row) pts.push(await rec.head(q, r, -0.05));
    rec.x = pts[0].x + (fmt.touch ? 0 : 200); rec.y = pts[0].y + 140;
    await rec.hold(0.15);
    for (const p of pts) await rec.click(p.x, p.y, { speed: 2.4, after: 1 });
    await rec.moveTo(pts[pts.length - 1].x + 60, pts[pts.length - 1].y + 100, { speed: 0.8 });
    await rec.hold(0.7);
  },
  // 4. a golden bee drifts by — catch it!
  async golden(rec, fmt) {
    await rec.page.evaluate(STAGE, { ...BASE, zoom: fmt.touch ? 1.2 : 1.3, beeRest: 1 });
    await rec.page.evaluate(() => {
      const G = __game, st = G.stage, cx = st.cam.x, cz = st.cam.y / 0.72, span = st.vw / st.cam.ppu / 2 + 0.8;
      G.view.golden.start({ x: cx + span, z: cz - 0.8 }, { x: cx - span, z: cz + 0.6 }, 7);
      G.view.golden.seed = 1.3;
    });
    await rec.warm(2);
    rec.x = fmt.viewport.width * 0.3; rec.y = fmt.viewport.height * 0.78;
    // watch it come in, then go for it
    for (let i = 0; i < 26; i++) await rec.frame();
    const gpos = async (lead) => rec.page.evaluate((lead) => { const gb = __game.view.golden, w = gb.at(gb.t + lead); return __game.view.project(w.x, w.y, w.z); }, lead);
    const aim = await gpos(0.45);
    await rec.moveTo(aim.x, aim.y, { speed: 1.25, settle: false });
    const now = await gpos(0);
    rec.x = now.x; rec.y = now.y;
    await rec.press(); await rec.frame(); await rec.frame(); await rec.release();
    await rec.hold(1.1);
  },
  // 5. starry night: fireflies, lanterns and moonlit flowers that glow
  async night(rec, fmt) {
    const fl = FLOWERS.map((f) => ([[0, 1], [-1, 0], [1, -1], [2, 0], [-2, 2], [0, -2]].some(([q, r]) => q === f[0] && r === f[1]) ? [f[0], f[1], f[2], f[3], f[4] || 0, 2] : f));
    await rec.page.evaluate(STAGE, { ...BASE, flowers: fl, weather: 'night', zoom: fmt.touch ? 1.1 : 1.18, camY: -0.25, beeRest: 0.5 });
    await rec.warm(90);
    const a = await rec.head(0, 1, -0.05), b = await rec.head(-1, 0, -0.05);
    rec.x = a.x + (fmt.touch ? 0 : 200); rec.y = a.y + 120;
    await rec.hold(0.3);
    await rec.click(a.x, a.y, { after: 5 });
    await rec.click(b.x, b.y, { after: 10 });
    await rec.hold(0.5);
  },
  // 6. grow the garden: buy a new plot, then sow seeds straight from the pouch
  async expand(rec, fmt) {
    const fl = FLOWERS.filter(([q, r]) => !([[2, 0], [1, 1]].some(([a, b]) => a === q && b === r)));
    await rec.page.evaluate(STAGE, { ...BASE, flowers: fl, coins: 21350, zoom: fmt.touch ? 1.0 : 1.08, camX: fmt.touch ? 0.6 : 0.9, beeRest: 1 });
    await rec.warm(20);
    const tag = await rec.page.evaluate(() => {
      const G = __game, g = G.garden, i = g.byKey.get('3,-1');
      const t = G.ui.plotTags.get(i);
      if (!t) return null;
      const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    const start = await rec.soil(2, 0);
    rec.x = start.x - 120; rec.y = start.y + 150;
    await rec.hold(0.1);
    if (tag) await rec.click(tag.x, tag.y, { after: 16 });
    else { const s = await rec.soil(3, -1); await rec.click(s.x, s.y, { after: 16 }); }
    const chip = await rec.el('.pouch-list .seedchip', 0);
    await rec.click(chip.x, chip.y, { after: 3 });
    const pts = [await rec.soil(3, -1), await rec.soil(2, 0), await rec.soil(1, 1)];
    await rec.drag(pts.map((p) => ({ x: p.x, y: p.y - 4 })), { pps: fmt.touch ? 300 : 430 });
    await rec.moveTo(pts[2].x - 80, pts[2].y + 90, { speed: 0.8 });
    await rec.hold(0.4);
  },
  // 7. decorate: buy the windmill and watch it pop into the garden
  async decorate(rec, fmt) {
    await rec.page.evaluate(STAGE, { ...BASE, coins: 84210, zoom: 1, beeRest: 0.5 });
    await rec.warm(20);
    const basket = await rec.el('.tool.shop');
    rec.x = fmt.viewport.width * 0.45; rec.y = fmt.viewport.height * 0.55;
    await rec.hold(0.1);
    await rec.click(basket.x, basket.y, { after: 7 });
    const tab = await rec.el('.panel .tab[data-k="decor"]');
    await rec.click(tab.x, tab.y, { after: 5 });
    const buy = await rec.el('.panel .grid .card:nth-child(5) .btn');
    await rec.click(buy.x, buy.y, { after: 2 });
    await rec.page.evaluate(() => { window.__lockCam = false; });
    await rec.moveTo(fmt.viewport.width * (fmt.touch ? 0.5 : 0.72), fmt.viewport.height * 0.8, { speed: 0.6 });
    await rec.hold(1.2);
  },
  // 8. finale: the whole garden under a rainbow
  async finale(rec, fmt) {
    await rec.page.evaluate(STAGE, { ...BASE, decor: [...DECOR, 'windmill', 'gazebo', 'statue'], weather: 'rainbow', zoom: fmt.touch ? 0.95 : 0.98, beeRest: 0.3 });
    await rec.warm(60);
    rec.x = fmt.viewport.width * 1.1; rec.y = fmt.viewport.height * 1.1;
    rec.vis = 0;
    // a slow push-in, the camera easing like a hand on the mouse wheel
    const n = Math.round(2.0 * FPS);
    for (let i = 0; i < n; i++) {
      await rec.page.evaluate((k) => { const V = __game.view; V.user.zoom = 0.98 + 0.08 * k; V.user.idle = 0; V._applyCam(true); }, minJerk(i / n));
      await rec.frame();
    }
  },
};
const ALL = ['cross', 'discover', 'combo', 'golden', 'night', 'expand', 'decorate', 'finale'];
// --shots=a,b re-records just those clips (needs --keep'd clips of the rest); --cut only re-assembles the clips
const ORDER = args.cut ? [] : args.shots ? String(args.shots).split(',') : ALL;
const clipDur = (file) => {
  const out = (() => { try { return execFileSync(FF, ['-hide_banner', '-i', file], { stdio: ['ignore', 'pipe', 'pipe'] }).toString(); } catch (e) { return String(e.stderr || ''); } })();
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};

// ------------------------------------------------------------------------------------------ main
mkdirSync('build/video-clips', { recursive: true });
const ctx0 = await esbuild.context({ entryPoints: ['src/main.js'], bundle: true, outfile: 'game.js', format: 'iife', define: { __DEV__: 'false' }, logLevel: 'error' });
const { port } = await ctx0.serve({ servedir: '.', port: 0, host: '127.0.0.1' });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] });
const mock = readFileSync('tools/mock-sdk.js', 'utf8');
const only = args.only ? String(args.only).split(',') : Object.keys(FORMATS);

for (const name of only) {
  const fmt = FORMATS[name];
  const context = await browser.newContext({ viewport: fmt.viewport, deviceScaleFactor: fmt.dpr, hasTouch: fmt.touch });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => console.log(`[${name}] pageerror:`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] console.error:`, m.text()); });
  await page.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: mock }));
  await page.addInitScript(INIT);
  await page.goto(`http://127.0.0.1:${port}/index.html?reset&quality=high&debug`);
  await page.waitForFunction(() => window.__game && document.getElementById('loading') == null, null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((mode) => { __game.settings.quality = 'high'; __game.ui.hoverInfo = () => {}; __vt.start(); __cur.ensure(mode); }, fmt.touch ? 'touch' : 'mouse');
  const cdp = await context.newCDPSession(page);
  const rec = new Recorder(page, cdp, fmt, rng(name === 'landscape' ? 11 : 23));
  for (const shot of ORDER) {
    const t0 = Date.now();
    const file = `build/video-clips/${name}-${shot}.mp4`;
    await rec.open(file);
    await SHOTS[shot](rec, fmt);
    const dur = await rec.close();
    console.log(`[${name}] ${shot}: ${dur.toFixed(2)} s (${rec.clipFrames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s to record)`);
  }
  // cut: crossfade every recorded clip together, in story order
  // the final cut stays under 20 s: the land-buying shot sits out and each shot's closing hold is capped
  // [in-point, max length] per shot: the decorate shot skips the walk to the shop so the windmill reveal fits
  const CUT = { cross: [0, 3.3], discover: [0, 4.8], combo: [0, 2.9], golden: [0, 2.5], night: [0, 2.0], decorate: [fmt.touch ? 0.5 : 1.1, 4.0], finale: [0, 2.0] };
  const clips = Object.keys(CUT).map((shot) => ({ shot, file: `build/video-clips/${name}-${shot}.mp4` })).filter((c) => existsSync(c.file))
    .map((c) => { const [ss, len] = CUT[c.shot]; return { file: c.file, ss, dur: Math.min(clipDur(c.file) - ss, len) }; });
  if (clips.length < 2) { console.log(`[${name}] only ${clips.length} clip(s) in build/video-clips: record the other shots, then --cut`); await context.close(); continue; }
  const total = clips.reduce((s, c) => s + c.dur, 0) - XF * (clips.length - 1);
  const inputs = clips.flatMap((c) => ['-ss', c.ss.toFixed(3), '-t', c.dur.toFixed(3), '-i', c.file]);
  let filter = '', last = '[0:v]', off = 0;
  for (let i = 1; i < clips.length; i++) {
    off += clips[i - 1].dur - XF;
    const out = i === clips.length - 1 ? '[v]' : `[x${i}]`;
    filter += `${last}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}${out};`;
    last = out;
  }
  mkdirSync('crazygames-upload/3-videos', { recursive: true });
  const outFile = `crazygames-upload/3-videos/trailer-${name}-${fmt.size[0]}x${fmt.size[1]}.mp4`;
  execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', filter.replace(/;$/, ''), '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', outFile], { stdio: 'inherit' });
  console.log(`[${name}] → ${outFile}  ${total.toFixed(1)} s, ${(statSync(outFile).size / 1e6).toFixed(1)} MB`);
  await context.close();
}
await browser.close();
await ctx0.dispose();
if (!args.keep) rmSync('build/video-clips', { recursive: true, force: true });
