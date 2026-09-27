// GardenView (2D): turns the Garden simulation into the illustrated garden — planters, growing flowers, seed
// bubbles and bees — owns camera framing and picking. It never changes game state; it only reads and animates.
import { COLORS, M, speciesId } from '../game/genetics.js';
import { key } from '../game/hex.js';
import { HIVE_POS } from '../game/garden.js';
import { damp, clamp, ease, rng, smoothstep, lerp } from '../core/math.js';

const TAU = Math.PI * 2;
import { SQ, HY } from './view3q.js';
import { drawSprite, Sprite, softEllipse } from './paint.js';
import { planterSprite, wetSprite, glowSprite, rimSprite, saleSprite, SOIL_Y, PLANTER } from './planter.js';
import { paintHead, paintTulip, paintLotus, paintBud, paintLeaf, geneKey } from './flowers.js';
import { Bees, Butterflies, bank, orbSprite, shadowSprite } from './critters.js';
import { HIVE_ENTRANCE } from './built.js';
import { propSprite } from './world.js';
import { GoldenBee } from './golden.js';

// wild meadow growing on plots the player hasn't claimed yet (cleared when the plot is bought): soft long grass
// with wildflowers, and on each plot one accent — a flower clump, a fern in the shadier back rows, a foxglove,
// toadstools or a mossy stone. Sizes and seeds come from small pools so plots share a few dozen sprites.
const WILD_COLS = [['#ffffff', '#ffe98a'], ['#ffffff', '#c9b6ff'], ['#ffd6e8', '#ffffff'], ['#ffe98a', '#ffffff'], ['#b8d4ff', '#ffffff'], ['#ff9cc2', '#ffffff']];
function wildPatch(i, R) {
  // where the plot sits (same order as the garden's hexagon of radius 3)
  let q = 0, r = 0;
  for (let n = 0, a = -3; a <= 3; a++) for (let b = Math.max(-3, -a - 3); b <= Math.min(3, -a + 3); b++, n++) if (n === i) { q = a; r = b; }
  const z = Math.sqrt(3) * (r + q / 2), ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  const out = [];
  const pick = (m) => Math.floor(R() * m);
  const size = (a) => [0.62, 0.7, 0.78, 0.86][Math.min(3, a + pick(2))];
  const put = (kind, k, a, rad, extra) => {
    const ang = a + (R() - 0.5) * 0.8;
    out.push({ kind, dx: Math.cos(ang) * rad, dz: Math.sin(ang) * rad * 0.8, seed: 1000 + pick(7) * 13 + k, ...extra });
  };
  const a0 = R() * Math.PI * 2;
  // long grass with a few flowers: one or two tufts
  put('meadow', 0, a0, 0.12 + R() * 0.25, { s: size(1), cols: WILD_COLS[pick(WILD_COLS.length)] });
  if (R() < 0.6) put('meadow', 1, a0 + 2.4, 0.45 + R() * 0.15, { s: size(0), cols: WILD_COLS[pick(WILD_COLS.length)] });
  // the accent
  const t = R(), shady = z < -1.5;
  const a1 = a0 + 4.2;
  if (t < 0.3) put('clump', 2, a1, 0.45, { s: 0.7, cols: WILD_COLS[pick(WILD_COLS.length)] });
  else if (t < (shady ? 0.58 : 0.42)) put('fern', 3, a1, 0.42, { s: 0.8 });
  else if (t < (shady ? 0.64 : 0.54)) put('foxgloves', 4, a1, 0.4, { s: 0.75 });
  else if (t < (shady ? 0.68 : 0.57)) put('mushrooms', 5, a1, 0.45, { s: 0.65 });
  else if (t < 0.74) put('rock', 6, a1, 0.45, { s: 0.42 });
  else if (t < 0.9) put('meadow', 7, a1, 0.45, { s: 0.62, cols: WILD_COLS[pick(WILD_COLS.length)] });
  else put('grass', 7, a1, 0.45, { s: 0.62 });
  // outer plots grow a little wilder
  if (ring >= 3 && R() < 0.45) put(R() < 0.5 ? 'bush' : 'grass', 8, a0 + 1.2, 0.55, R() < 0.5 ? { s: 0.5, v: 'flowers', c: '#ffffff' } : { s: 0.7 });
  return out;
}

export const STEM_H = 0.64;          // world height of a grown stem
export const HEAD_R = 0.5;           // world units per head unit
export const BED_TOP = SOIL_Y;
export const FLOWER_H = STEM_H;

const headSpr = (g, res) => bank.get('h' + geneKey(g), res, (r) => (g.shape === 2
  ? new Sprite(3, 3, 1.5, 1.6, r, (c, px) => paintTulip(c, g, { lw: Math.max(0.045, px * 1.6) }))
  : g.shape === 6
    ? new Sprite(3.2, 3.1, 1.6, 1.7, r, (c, px) => paintLotus(c, g, { lw: Math.max(0.045, px * 1.6) }))
    : new Sprite(3.1, 3.1, 1.55, 1.55, r, (c, px) => paintHead(c, g, { lw: Math.max(0.042, px * 1.5) }))));
const budSpr = (g, st, res) => bank.get(`b${g.c1}.${g.mut === 3 || g.mut === 4 ? g.mut : 0}.${st}`, res,
  (r) => new Sprite(1.6, 2.1, 0.8, 1.25, r, (c, px) => paintBud(c, g, [0.25, 0.6, 1][st], Math.max(0.05, px * 1.6))));
const LEAF_COLS = ['#5dbb4c', '#4aa843', '#6cc458'];
const glowSpr = (res, c) => bank.get('fglow' + c, res, (r) => new Sprite(2.4, 2.4, 1.2, 1.2, r, (ctx) => softEllipse(ctx, 0, 0, 1.15, 1.15, c, 0.85, 0.05)));
const leafSpr = (v, res) => bank.get('leaf' + v, res, (r) => new Sprite(1.1, 1.15, 0.45, 1.05, r, (c, px) => paintLeaf(c, LEAF_COLS[v % 3], Math.max(0.05, px * 1.5), v % 2 ? 0.14 : -0.1)));

// where the stem meets each head sprite, in head units above the head's anchor
const ATTACH = { 2: -0.45, 6: -0.42 };

export class GardenView {
  constructor(stage, garden, fx, quality) {
    this.stage = stage; this.garden = garden; this.fx = fx;
    this.time = 0;
    this.N = garden.plots.length;
    this.R = rng(3);
    this.pv = garden.plots.map((p, i) => ({
      i, stem: 0, head: 0, open: 0, pop: 0, harvestT: 0, bedK: p.owned ? 1 : 0, hover: 0, wet: 0, bump: 0, tap: 0, ringT: 0, ringK: 0, rest: 0, target: 0,
      seed: this.R(), lean: (this.R() - 0.5) * 0.06, leafV: Math.floor(this.R() * 3), g: null, sortY: 0, draw: null,
    }));
    for (const pv of this.pv) pv.draw = (ctx, s, t) => this._drawPlot(ctx, s, pv, t);
    this.wild = garden.plots.map((p, i) => wildPatch(i, rng(500 + i * 31)).map((w) => {
      const e = { ...w, i, sortY: 0, draw: null };
      e.draw = (ctx, s) => this._drawWild(ctx, s, e);
      return e;
    }));
    this.bees = new Bees(fx);
    this.butterflies = new Butterflies(quality.ambient >= 1 ? 4 : 2);
    this.orbs = new Map();
    this.golden = new GoldenBee(fx);
    this.drag = null;                                      // pollen being carried: { from, x, y, over, ok }
    this.zips = [];                                        // pollen flying from one bloom to another after a cross
    this.hoverPlot = -1;
    this.highlightEmpty = false;
    this.cam = { x: 0, z: 0 };
    this.safe = { left: 0, right: 0, top: 0, bottom: 0 };
    this.base = { x: 0, y: 0, ppu: 60 };                  // automatic framing of the garden
    this.user = { x: 0, y: 0, zoom: 1, idle: 99 };        // the player's pan (screen units) / zoom on top of it
    this.focus = null;                                     // { x, y, t, dur }: a short look at something new
    this.hive = { x: HIVE_POS.x, z: HIVE_POS.z, y: HIVE_ENTRANCE };
    this.frame(true);
  }

  // ------------------------------------------------------------------------------------------ camera
  setSafeArea(s) { this.safe = s; this.frame(); }
  resize() { this.frame(true); }

  // fit owned + purchasable plots (with flower height) inside the screen minus the HUD insets
  frame(snap = false) {
    if (this.override) return;
    const g = this.garden, st = this.stage;
    let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
    g.plots.forEach((p, i) => {
      if (!p.owned && !g.canBuyPlot(i)) return;
      const w = g.pos[i];
      const m = p.owned ? 1.05 : 0.85;
      X0 = Math.min(X0, w.x - m); X1 = Math.max(X1, w.x + m);
      Y0 = Math.min(Y0, w.z * SQ - (p.owned ? 1.3 : 0.55)); Y1 = Math.max(Y1, w.z * SQ + (p.owned ? 0.72 : 0.55));
    });
    if (!isFinite(X0)) { X0 = -2; X1 = 2; Y0 = -2; Y1 = 2; }
    const s = this.safe, W = st.vw, H = st.vh;
    const aw = Math.max(80, W - s.left - s.right), ah = Math.max(80, H - s.top - s.bottom);
    let ppu = Math.min(aw / (X1 - X0), ah / (Y1 - Y0)) * 0.94;
    ppu = clamp(ppu, 22, Math.min(118, Math.max(W, H) / 11.5));
    const cx = (X0 + X1) / 2 - ((s.left - s.right) / 2) / ppu;
    const cy = (Y0 + Y1) / 2 - ((s.top - s.bottom) / 2) / ppu;
    this.base.x = cx; this.base.y = cy; this.base.ppu = ppu;
    this.cam.x = cx; this.cam.z = cy / SQ;
    this._applyCam(snap);
  }
  _applyCam(snap = false) {
    if (this.override) return;
    const b = this.base, u = this.user;
    let x = b.x + u.x, y = b.y + u.y, ppu = b.ppu * u.zoom;
    if (this.focus) { x = this.focus.x; y = this.focus.y; ppu = Math.max(b.ppu, 46); }
    x = clamp(x, -17, 17); y = clamp(y, -13 * SQ, 15 * SQ);
    this.stage.setTarget(x, y, ppu, snap);
  }
  // direct manipulation: drag to pan (screen px), pinch / wheel to zoom about a screen point
  panBy(dx, dy) {
    const ppu = this.stage.cam.ppu;
    this.user.x -= dx / ppu; this.user.y -= dy / ppu; this.user.idle = 0; this.focus = null;
    this._clampUser();
    this._applyCam(true);
  }
  zoomAt(k, sx, sy) {
    const st = this.stage, u = this.user;
    const z0 = u.zoom, z1 = clamp(z0 * k, 0.7, 1.9);
    if (z1 === z0) return;
    const p0 = this.base.ppu * z0, p1 = this.base.ppu * z1;
    // keep the world point under the cursor where it is
    const ox = (sx - st.vw / 2), oy = (sy - st.vh / 2);
    u.x += ox / p0 - ox / p1; u.y += oy / p0 - oy / p1;
    u.zoom = z1; u.idle = 0; this.focus = null;
    this._clampUser();
    this._applyCam(true);
  }
  _clampUser() {
    const u = this.user, b = this.base;
    u.x = clamp(u.x, -17 - b.x, 17 - b.x); u.y = clamp(u.y, -13 * SQ - b.y, 15 * SQ - b.y);
  }
  // glide to a world point for a moment (e.g. a new decoration), then come back to the garden
  focusOn(x, z, dur = 2.6) {
    this.user.x = 0; this.user.y = 0; this.user.zoom = 1;
    this.focus = { x, y: z * SQ - 0.9, t: 0, dur };
    this._applyCam();
  }
  // fixed hero camera (cover art / trailer): { x, z, ppu }
  setCameraOverride(o) { this.override = o; if (o) this.stage.setTarget(o.x, o.z * SQ, o.ppu, true); }

  // ------------------------------------------------------------------------------------------ picking
  project(x, y, z, out) { return this.stage.project(x, y, z, out); }
  headY(i) { const pv = this.pv[i]; return SOIL_Y + pv.stem + 0.1 * pv.head; }
  headPos(i) { const w = this.garden.pos[i]; return { x: w.x, y: this.headY(i), z: w.z }; }

  // plot under a screen point: flower heads first (they stand above their bed), then the soil plane
  pickPlot(sx, sy) {
    let best = -1, bestY = -Infinity;
    const ppu = this.stage.cam.ppu;
    this.pv.forEach((pv, i) => {
      if (pv.head < 0.25) return;
      const h = this.headPos(i), p = this.project(h.x, h.y, h.z);
      const r = Math.max(22, 0.55 * pv.head * ppu);
      if (Math.hypot(p.x - sx, (p.y - sy) * 1.15) < r && p.y > bestY) { bestY = p.y; best = i; }
    });
    if (best >= 0) return best;
    const w = this.stage.unproject(sx, sy, SOIL_Y * 0.7);
    const q = (2 / 3) * w.x, r = (-1 / 3) * w.x + (Math.sqrt(3) / 3) * w.z;
    const idx = this.garden.byKey.get(key(...axialRound(q, r)));
    return idx === undefined ? -1 : idx;
  }
  pickSeed(sx, sy) {
    let best = null, bestD = 46;
    for (const [id, o] of this.orbs) {
      if (o.leaving) continue;
      const p = this.project(o.x, o.y, o.z);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }
  orbScreen(id) { const o = this.orbs.get(id); return o ? this.project(o.x, o.y, o.z) : null; }
  orbWorld(o) { return { x: o.x, y: o.y, z: o.z }; }

  // ------------------------------------------------------------------------------------------ events
  onEvent(name, p) {
    const pv = p && p.i !== undefined ? this.pv[p.i] : null;
    const w = p && p.i !== undefined ? this.garden.pos[p.i] : null;
    const fx = this.fx;
    switch (name) {
      case 'plant': pv.stem = 0; pv.head = 0; pv.open = 0; pv.bump = 1; fx.dust(w.x, SOIL_Y, w.z, 8); break;
      case 'bloom': pv.pop = 1; { const h = this.headPos(p.i); fx.sparkles(h.x, h.y, h.z, p.isNew ? '#fff4a8' : '#ffffff', p.isNew ? 16 : 7, 0.5); } break;
      case 'harvest': {
        pv.harvestT = 1;
        const h = this.headPos(p.i), c1 = COLORS[p.g.c1].hex, c2 = COLORS[p.g.c2 ?? p.g.c1].hex;
        fx.petals(h.x, h.y, h.z, p.g.pattern ? [c1, c2, c1] : [c1], 12);
        if (p.g.mut) fx.sparkles(h.x, h.y, h.z, mutColor(p.g.mut), 10, 0.5);
        break;
      }
      case 'dig': pv.bump = 1; fx.leaves(w.x, SOIL_Y + 0.2, w.z, 10); fx.dust(w.x, SOIL_Y, w.z, 6); break;
      case 'water': pv.wet = 1; fx.water(w.x, SOIL_Y, w.z, 18); break;
      case 'mutate': { const h = this.headPos(p.i); fx.sparkles(h.x, h.y, h.z, mutColor(p.g.mut), 18, 0.6, 1.3); pv.pop = 0.6; break; }
      case 'plot': pv.bedK = 0; fx.dust(w.x, 0.1, w.z, 18); fx.leaves(w.x, 0.2, w.z, 10); fx.sparkles(w.x, 0.5, w.z, '#fff1b0', 14, 0.9); this.stage.cam.shake = 0.35; this.frame(); break;
      case 'seed': this._addOrb(p); break;
      case 'seedCollected': this._removeOrb(p.id); break;
      case 'bee:pollinate': { const h = this.headPos(p.i); fx.pollen(h.x, h.y + 0.1, h.z, 8); break; }
      case 'boost': {
        pv.tap = 1; pv.ringT = 1.5; pv.ringK = p.k;
        const top = SOIL_Y + pv.stem + 0.15;
        fx.sparkles(w.x, top, w.z, p.k >= 1 ? '#fff4a8' : '#d8ffb0', p.k >= 1 ? 10 : 4, 0.35, 0.8);
        if (p.taps % 2 === 1) fx.leaves(w.x, SOIL_Y + 0.15, w.z, 2);
        break;
      }
      case 'cross': {
        this.zips.push({ a: p.a, b: p.b, t: 0, c: COLORS[p.g.c1].hex });
        this.pv[p.a].rest = 1; this.pv[p.b].pop = Math.max(this.pv[p.b].pop, 0.45);
        const h = this.headPos(p.a); fx.pollen(h.x, h.y + 0.1, h.z, 6);
        break;
      }
      default: break;
    }
  }

  _addOrb(seed) {
    const from = this.headPos(seed.i);
    const o = { id: seed.id, g: seed.g, i: seed.i, x: from.x, y: from.y, z: from.z, born: this.time, leaving: false, leaveT: 0, seed: this.R() * 10, k: 0, sortY: 0, draw: null };
    o.draw = (ctx, s, t) => this._drawOrb(ctx, s, o, t);
    this.orbs.set(seed.id, o);
    this.fx.sparkles(from.x, from.y + 0.2, from.z, COLORS[seed.g.c1].hex, 8, 0.4);
  }
  _removeOrb(id) { const o = this.orbs.get(id); if (o) { o.leaving = true; o.leaveT = 0; } }

  // ------------------------------------------------------------------------------------------ update
  update(dt, time) {
    this.time = time;
    const g = this.garden;
    // the camera drifts back to the garden a few seconds after the player stops looking around
    const u = this.user;
    u.idle += dt;
    if (this.focus) { this.focus.t += dt; if (this.focus.t >= this.focus.dur) this.focus = null; this._applyCam(); }
    else if (u.idle > 7 && (Math.abs(u.x) + Math.abs(u.y) > 0.01 || Math.abs(u.zoom - 1) > 0.005)) {
      const k = 1 - Math.exp(-1.6 * dt);
      u.x -= u.x * k; u.y -= u.y * k; u.zoom += (1 - u.zoom) * k;
      this._applyCam();
    }
    for (let i = 0; i < this.N; i++) this._animPlot(this.pv[i], g.plots[i], dt);
    this._orbs(dt, time);
    this.golden.update(dt, time);
    for (const z of this.zips) z.t += dt;
    if (this.zips.length && this.zips[0].t > 0.6) this.zips = this.zips.filter((z) => z.t <= 0.6);
    this.bees.update(dt, time, g.bees, g, (i) => this.headY(i), this.hive);
    const spots = [];
    this.pv.forEach((pv, i) => { if (g.isBloom(i) && pv.open > 0.8) spots.push(this.headPos(i)); });
    this.butterflies.update(dt, time, spots);
  }

  _animPlot(pv, plot, dt) {
    const g = this.garden, pl = plot.plant;
    pv.bedK = plot.owned ? Math.min(1, pv.bedK + dt * 1.2) : 0;
    pv.hover = damp(pv.hover, this.hoverPlot === pv.i ? 1 : 0, 14, dt);
    pv.wet = Math.max(0, pv.wet - dt * 0.15);
    pv.bump = Math.max(0, pv.bump - dt * 3);
    pv.tap = Math.max(0, pv.tap - dt * 2.4);
    pv.ringT = Math.max(0, pv.ringT - dt);
    pv.rest = Math.max(0, pv.rest - dt * 0.8);
    pv.target = damp(pv.target, this.drag && this.drag.over === pv.i && this.drag.ok ? 1 : 0, 16, dt);
    let tStem = 0, tHead = 0, tOpen = 0;
    if (pl) {
      pv.g = pl.g;
      const giant = pl.g.mut === M.GIANT ? 1.4 : 1;
      if (pl.stage === 'bloom') { tStem = STEM_H * (giant > 1 ? 1.15 : 1); tHead = giant; tOpen = 1; }
      else {
        const k = clamp(pl.t / pl.dur, 0, 1);
        const sprout = smoothstep(0, 0.22, k), bud = smoothstep(0.18, 0.85, k), op = smoothstep(0.82, 1, k);
        tStem = STEM_H * (0.25 * sprout + 0.75 * bud);
        tHead = bud > 0.01 ? (0.45 + 0.55 * bud) * giant : 0;
        tOpen = 0.25 * op;
      }
    }
    if (pv.harvestT > 0) {
      pv.harvestT = Math.max(0, pv.harvestT - dt * 3.2);
      const k = 1 - pv.harvestT;
      pv.head = k < 0.25 ? lerp(pv.head, tHead * 1.2 + 0.2, 0.5) : damp(pv.head, tHead, 12, dt);
      pv.open = damp(pv.open, tOpen, 14, dt);
    } else if (pv.pop > 0) {
      pv.pop = Math.max(0, pv.pop - dt * 1.4);
      const k = 1 - pv.pop;
      pv.open = lerp(0.3, tOpen, ease.outElastic(Math.min(1, k * 1.1)));
      pv.head = tHead * (1 + Math.sin(k * Math.PI) * 0.15);
    } else {
      pv.open = damp(pv.open, tOpen, 6, dt);
      pv.head = damp(pv.head, tHead, 6, dt);
    }
    pv.stem = damp(pv.stem, tStem, 5, dt);
    if (!pl && pv.head < 0.02 && pv.stem < 0.02) pv.g = null;
    pv.sortY = g.pos[pv.i].z * SQ;
  }

  _orbs(dt, time) {
    for (const [id, o] of this.orbs) {
      const w = this.garden.pos[o.i];
      if (o.leaving) {
        o.leaveT += dt;
        o.y += dt * 3;
        if (o.leaveT > 0.35) this.orbs.delete(id);
        continue;
      }
      const age = time - o.born;
      o.k = ease.outBack(Math.min(1, age / 0.6));
      const base = this.headY(o.i) + 0.75;
      o.x = damp(o.x, w.x + Math.sin(o.seed) * 0.22, 4, dt);
      o.z = damp(o.z, w.z + 0.12, 4, dt);
      o.y = damp(o.y, base + Math.sin(time * 2.4 + o.seed) * 0.08, 4, dt);
      o.sortY = o.z * SQ + 0.05;
    }
  }

  // ------------------------------------------------------------------------------------------ stage layer
  ground(ctx, s) {
    const g = this.garden;
    if (g.s.tutorial < 99 || this.hideSale) return;
    const res = s.res, ppu = s.cam.ppu;
    for (let i = 0; i < this.N; i++) {
      const p = g.plots[i];
      if (p.owned || !g.canBuyPlot(i)) continue;
      const w = g.pos[i];
      drawSprite(ctx, saleSprite(res), s.sx(w.x), s.sy(w.z * SQ), ppu, 1, 1, 0, 0.75 + 0.25 * this.pv[i].hover);
    }
  }
  collect(list) {
    for (let i = 0; i < this.N; i++) {
      if (this.garden.plots[i].owned || this.pv[i].g) list.push(this.pv[i]);
      if (!this.garden.plots[i].owned) {
        const w = this.garden.pos[i];
        for (const e of this.wild[i]) { e.sortY = (w.z + e.dz) * SQ; list.push(e); }
      }
    }
    for (const o of this.orbs.values()) list.push(o);
    this.golden.collect(list);
    this.bees.collect(list);
    this.butterflies.collect(list);
  }

  _drawPlot(ctx, s, pv, time) {
    const g = this.garden, plot = g.plots[pv.i], w = g.pos[pv.i];
    const ppu = s.cam.ppu, res = s.res;
    const X = s.sx(w.x), Y = s.sy(w.z * SQ);
    // --- planter
    if (plot.owned) {
      const k = pv.bedK;
      const rise = k >= 1 ? 1 : ease.outBack(clamp(k * 1.25, 0, 1));
      const b = Math.sin(pv.bump * Math.PI);
      const sy = Math.max(0.02, rise * (1 - b * 0.08)), sx = (1 + (1 - Math.min(1, k * 1.25)) * 0.15) * (1 + b * 0.05);
      drawSprite(ctx, planterSprite(pv.i % 3, res), X, Y, ppu, sx, sy);
      if (k >= 1) {
        if (pv.wet > 0.02) drawSprite(ctx, wetSprite(res), X, Y, ppu, 1, 1, 0, pv.wet);
        if (this.highlightEmpty && !plot.plant) {
          ctx.globalCompositeOperation = 'lighter';
          drawSprite(ctx, glowSprite(res), X, Y, ppu, 1, 1, 0, 0.35 + 0.25 * Math.sin(time * 5 + pv.i));
          ctx.globalCompositeOperation = 'source-over';
        }
        if (pv.hover > 0.02) drawSprite(ctx, rimSprite(res), X, Y, ppu, 1, 1, 0, pv.hover * 0.9);
      }
    }
    // --- plant (squashes and stretches when tapped)
    if (!pv.g || pv.stem < 0.005) return;
    const Ys = s.sy(w.z * SQ - SOIL_Y * HY);
    const bounce = pv.tap > 0.01 ? Math.sin((1 - pv.tap) * Math.PI * 3) * pv.tap * 0.2 : 0;
    const grow = 1 + pv.target * 0.1;
    if (bounce || grow !== 1) {
      ctx.save(); ctx.translate(X, Ys); ctx.scale((1 - bounce * 0.55) * grow, (1 + bounce) * grow); ctx.translate(-X, -Ys);
      this._drawPlant(ctx, s, pv, time, X, Ys, w);
      ctx.restore();
    } else this._drawPlant(ctx, s, pv, time, X, Ys, w);
  }

  _drawPlant(ctx, s, pv, time, X, Ys, w) {
    const g = this.garden, gg = pv.g, ppu = s.cam.ppu, res = s.res;
    const rain = g.s.weather.kind === 'rain' ? 1.8 : 1;
    const sway = (Math.sin(time * 1.3 + pv.seed * 6.2) * 0.035 * rain + Math.sin(time * 0.37 + w.x * 0.3) * 0.02) * (pv.stem / STEM_H) + pv.lean * pv.stem;
    const stemPx = pv.stem * HY * ppu;
    const topX = X + sway * ppu, topY = Ys - stemPx;
    const grown = clamp(pv.stem / STEM_H, 0, 1);
    // soft shadow of the head on the soil
    if (pv.head > 0.2) drawSprite(ctx, shadowSprite(res), X + 0.1 * ppu, Ys + 0.03 * ppu, ppu * 0.36 * pv.head, 1, 0.8, 0, 0.45);
    // leaves (sprout leaves when tiny)
    const lres = s.resFor(0.4);
    if (grown < 0.35) {
      const k = clamp(pv.stem / (STEM_H * 0.25), 0, 1) * 0.22;
      drawSprite(ctx, leafSpr(pv.leafV, lres), X - 1, topY + 1, ppu * k, 1, 1, -1.15 + sway);
      drawSprite(ctx, leafSpr(pv.leafV + 1, lres), X + 1, topY + 1, ppu * k, -1, 1, 1.15 + sway);
    } else {
      const lk = 0.22 + 0.2 * grown;
      drawSprite(ctx, leafSpr(pv.leafV, lres), X - 1, Ys - 0.02 * ppu, ppu * lk, 1, 1, -0.95 + sway * 0.3);
      drawSprite(ctx, leafSpr(pv.leafV + 1, lres), X + 1, Ys - 0.05 * ppu, ppu * lk * 0.9, -1, 1, 1.0 + sway * 0.3);
      if (grown > 0.8) drawSprite(ctx, leafSpr(pv.leafV + 2, lres), X + sway * ppu * 0.35 + 1, Ys - stemPx * 0.42, ppu * lk * 0.62, -1, 1, 0.75 + sway);
    }
    // stem
    const cxp = X + sway * ppu * 0.25 + Math.sin(pv.seed * 9) * 0.04 * ppu, cyp = (Ys + topY) / 2;
    const sw = Math.max(1.6, (0.045 + 0.03 * grown) * ppu);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X, Ys); ctx.quadraticCurveTo(cxp, cyp, topX, topY);
    ctx.strokeStyle = '#2d6a26'; ctx.lineWidth = sw + Math.max(1.2, ppu * 0.022); ctx.stroke();
    ctx.strokeStyle = '#5bb548'; ctx.lineWidth = sw; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X - sw * 0.2, Ys - 2); ctx.quadraticCurveTo(cxp - sw * 0.25, cyp, topX - sw * 0.2, topY + 3);
    ctx.strokeStyle = 'rgba(200,245,160,0.65)'; ctx.lineWidth = sw * 0.3; ctx.stroke();
    // head: bud until it opens, then the bloom (with a crossfade during the pop)
    if (pv.head < 0.02) return;
    const hk = pv.head * HEAD_R;
    const rot = sway * 0.9;
    if (pv.open < 0.3) {
      const budK = clamp((pv.head - 0.45) / 0.55, 0, 1);
      const st = budK < 0.33 ? 0 : budK < 0.75 ? 1 : 2;
      const tremble = pv.open > 0.18 ? Math.sin(time * 30 + pv.seed) * 0.03 : 0;
      drawSprite(ctx, budSpr(gg, st, s.resFor(HEAD_R)), topX, topY + 0.02 * ppu, ppu * hk * 0.95, 1, 1, rot + tremble);
    } else {
      const f = clamp((pv.open - 0.3) / 0.7, 0, 1);
      if (f < 0.35) drawSprite(ctx, budSpr(gg, 2, s.resFor(HEAD_R)), topX, topY + 0.02 * ppu, ppu * hk * 0.95, 1, 1, rot, 1 - f / 0.35);
      const giant = gg.mut === M.GIANT ? 1.4 : 1;
      const hres = s.resFor(HEAD_R * giant);
      const scale = hk * (0.35 + 0.65 * f);
      const att = ATTACH[gg.shape] ?? 0.12;
      drawSprite(ctx, headSpr(gg, hres), topX, topY + att * scale * ppu, ppu * scale, 1, 1, rot, Math.min(1, f * 3));
    }
  }

  _drawWild(ctx, s, e) {
    const w = this.garden.pos[e.i];
    const buyable = this.garden.s.tutorial >= 99 && this.garden.canBuyPlot(e.i);
    const k = buyable ? 0.82 : 1;
    const sway = this.world ? this.world.wind(w.x + e.dx, w.z + e.dz, e.kind, this.time) : 0;
    drawSprite(ctx, propSprite(e.kind, e, s.res), s.sx(w.x + e.dx), s.sy((w.z + e.dz) * SQ), s.cam.ppu * k, 1, 1, 0, 1, sway);
  }

  // ------------------------------------------------------------------------------------------ hud (on top of everything)
  // growth rings on tapped plants, the pollen trail while the player carries pollen, crossing targets and rests
  hud(ctx, s, time) {
    const g = this.garden, ppu = s.cam.ppu;
    ctx.lineCap = 'round';
    for (let i = 0; i < this.N; i++) {
      const pv = this.pv[i], pl = g.plots[i].plant;
      if (pv.ringT > 0 && pv.g) this._growRing(ctx, s, pv, pl);
      if (pv.rest > 0.01 && !this.drag && g.resting(i) > 0) this._restClock(ctx, s, i, pv.rest);
      // a species nobody has seen yet: a little "?" bobs over it until it blooms
      if (pl && pl.stage === 'grow' && pv.stem > 0.05 && !g.s.book[speciesId(pl.g)]) this._mystery(ctx, s, i, pv, time);
    }
    const d = this.drag;
    if (d && g.isBloom(d.from)) {
      const p0 = this._headScreen(d.from);
      // every other bloom shows whether it can take the pollen right now
      for (let j = 0; j < this.N; j++) {
        if (j === d.from || !g.isBloom(j) || this.pv[j].open < 0.6) continue;
        if (g.resting(j) > 0) { this._restClock(ctx, s, j, 1); continue; }
        const pj = this._headScreen(j), r = Math.max(20, 0.5 * this.pv[j].head * ppu);
        const on = d.over === j && d.ok;
        ctx.globalAlpha = on ? 1 : 0.55 + 0.3 * Math.sin(time * 6 + j);
        ctx.strokeStyle = on ? '#fff6b0' : '#ffffff'; ctx.lineWidth = on ? 5 : 3;
        ctx.setLineDash(on ? [] : [6, 7]); ctx.lineDashOffset = -time * 20;
        ctx.beginPath(); ctx.ellipse(pj.x, pj.y, r * (on ? 1.15 : 1), r * 0.85 * (on ? 1.15 : 1), 0, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // the source bloom glows gold and a sparkling trail follows the pointer (snapping to a valid target)
      const r0 = Math.max(20, 0.5 * this.pv[d.from].head * ppu);
      ctx.strokeStyle = 'rgba(255,214,80,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(p0.x, p0.y, r0, r0 * 0.85, 0, 0, TAU); ctx.stroke();
      let x1 = d.x, y1 = d.y;
      if (d.ok && d.over >= 0) { const pb = this._headScreen(d.over); x1 = pb.x; y1 = pb.y; }
      this._trail(ctx, p0.x, p0.y, x1, y1, time, 1);
      const pr = 9 + Math.sin(time * 12) * 1.5;
      ctx.fillStyle = 'rgba(255,220,90,0.35)'; ctx.beginPath(); ctx.arc(x1, y1, pr * 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#a8680a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x1, y1, pr, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x1 - pr * 0.3, y1 - pr * 0.35, pr * 0.3, 0, TAU); ctx.fill();
    }
    // pollen zipping from one bloom to the other after a cross
    for (const z of this.zips) {
      const pa = this._headScreen(z.a), pb = this._headScreen(z.b);
      const k = Math.min(1, z.t / 0.28);
      if (k < 1) this._trail(ctx, pa.x, pa.y, pb.x, pb.y, time, 1 - k * 0.6, k);
      else {
        const f = (z.t - 0.28) / 0.32;
        ctx.globalAlpha = Math.max(0, 1 - f); ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 4 * (1 - f) + 1;
        ctx.beginPath(); ctx.ellipse(pb.x, pb.y, 16 + f * 50, (16 + f * 50) * 0.8, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  _headScreen(i) { const h = this.headPos(i); return this.project(h.x, h.y, h.z); }
  _mystery(ctx, s, i, pv, time) {
    const w = this.garden.pos[i];
    const p = this.project(w.x, SOIL_Y + pv.stem + 0.2 * pv.head + 0.55, w.z);
    const r = clamp(s.cam.ppu * 0.17, 9, 15), y = p.y + Math.sin(time * 2.6 + pv.seed * 5) * 3;
    ctx.fillStyle = 'rgba(40,20,60,0.25)'; ctx.beginPath(); ctx.ellipse(p.x + 2, y + 3, r, r, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8f5cf0'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.beginPath(); ctx.arc(p.x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = `700 ${Math.round(r * 1.35)}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', p.x, y + r * 0.06);
  }
  // a curved, glowing pollen path between two screen points; upto < 1 draws only the leading part (a comet)
  _trail(ctx, x0, y0, x1, y1, time, a = 1, upto = 1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - Math.max(24, dist * 0.28);
    const pt = (t) => ({ x: (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, y: (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1 });
    if (upto < 1) {
      for (let k = 0; k < 7; k++) {
        const t = upto - k * 0.045;
        if (t < 0) break;
        const p = pt(t), r = 8 - k;
        ctx.globalAlpha = a * (1 - k / 7);
        ctx.fillStyle = k ? '#ffe27a' : '#ffffff';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = 0.35 * a; ctx.strokeStyle = '#ffd650'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 6;
    ctx.setLineDash([1, 13]); ctx.lineDashOffset = -time * 70;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // growth progress around the base of a tapped plant
  _growRing(ctx, s, pv, pl) {
    const w = this.garden.pos[pv.i], ppu = s.cam.ppu;
    const k = pl ? (pl.stage === 'bloom' ? 1 : clamp(pl.t / pl.dur, 0, 1)) : pv.ringK;
    const a = Math.min(1, pv.ringT / 0.45);
    const cx = s.sx(w.x), cy = s.sy(w.z * SQ - SOIL_Y * HY) + 2;
    const rx = Math.max(18, 0.6 * ppu), ry = rx * SQ;
    ctx.globalAlpha = a;
    ctx.lineWidth = Math.max(5, 0.1 * ppu); ctx.strokeStyle = 'rgba(58,34,14,0.6)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(3, 0.065 * ppu); ctx.strokeStyle = k >= 1 ? '#ffe45c' : '#9af06a';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, k)); ctx.stroke();
    const e = -Math.PI / 2 + TAU * k;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx + Math.cos(e) * rx, cy + Math.sin(e) * ry, Math.max(2.5, 0.05 * ppu), 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // a small clock over a resting bloom (it was just crossed and needs a moment before it can be crossed again)
  _restClock(ctx, s, i, a) {
    const p = this._headScreen(i), pl = this.garden.plots[i].plant;
    const left = this.garden.resting(i), k = 1 - left / 8;
    const x = p.x + Math.max(14, 0.32 * s.cam.ppu), y = p.y - Math.max(16, 0.42 * s.cam.ppu), r = 9;
    if (!pl) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(58,34,14,0.75)'; ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1)); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // magical blooms glow after dark (drawn additively after the colour grade)
  glow(ctx, s, time) {
    const night = this.nightK ? this.nightK() : 0;
    if (night < 0.05) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.N; i++) {
      const pv = this.pv[i];
      if (!pv.g || pv.open < 0.5) continue;
      const m = pv.g.mut;
      const col = m === M.MOONLIT ? '#8fc4ff' : m === M.GOLDEN ? '#ffd24a' : m === M.RAINBOW ? '#ffffff' : null;
      const h = this.headPos(i), p = this.project(h.x, h.y, h.z);
      drawSprite(ctx, glowSpr(s.res, col || '#ffe9b0'), p.x, p.y - 0.1 * s.cam.ppu, s.cam.ppu * (col ? 0.8 : 0.45) * pv.head, 1, 1, 0, night * (col ? 0.75 : 0.28) * (0.85 + 0.15 * Math.sin(time * 2 + i)));
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawOrb(ctx, s, o, time) {
    const k = o.leaving ? Math.max(0.001, 1 - o.leaveT / 0.35) : Math.max(0.001, o.k);
    const r = 0.3 * k;
    const X = s.sx(o.x), Yg = s.sy(o.z * SQ), Y = s.sy(o.z * SQ - o.y * HY);
    drawSprite(ctx, shadowSprite(s.res), X + 0.15 * s.cam.ppu, Yg, s.cam.ppu * 0.2 * k, 1, 1, 0, 0.3);
    const pulse = 1 + Math.sin(time * 3 + o.seed) * 0.03;
    drawSprite(ctx, orbSprite(o.g, s.resFor(0.3)), X, Y, s.cam.ppu * r * pulse, 1, 1, Math.sin(time * 1.5 + o.seed) * 0.15, o.leaving ? k : 1);
  }
}

function axialRound(q, r) {
  let x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return [rx, rz];
}

export function mutColor(m) { return ['#ffffff', '#9fe8ff', '#c9d4ff', '#ffd54a', '#ff9ff3', '#b6ff9f'][m] || '#ffffff'; }
