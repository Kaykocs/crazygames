// The garden's surroundings: lawn, paths, pond, hive, fence, trees, bushes, props and the decorations the player
// buys. Static art is painted into the stage's cached ground layer or cached sprites; animated bits (pond life,
// windmill sails, fountain water, lantern glow, the gnome) are drawn per frame.
import { Sprite, SpriteBank, drawSprite, smoothClosed, softEllipse, rng, hash2 } from './paint.js';
import { shade, ink, rgba } from './color.js';
import { SQ, HY } from './view3q.js';
import { paintLawn } from './lawn.js';
import * as N from './nature.js';
import * as B from './built.js';
import * as D from './decor.js';
import { Weather } from './weather.js';
import { ease, clamp } from '../core/math.js';

const TAU = Math.PI * 2;
export const POND = { x: 9.1, z: -2.3, rx: 2.35, rz: 1.85 };
export const FENCE_Z = -8.9;
export const GATE = [-2.45, -0.75];

// decoration spots (world x, z)
export const DECOR_SPOTS = {
  birdbath: { x: -7.9, z: 0.4 },
  bench: { x: 7.7, z: 3.1 },
  arch: { x: -1.6, z: FENCE_Z + 0.05 },
  lanterns: { x: 3.3, z: -7.5 },
  windmill: { x: -10.9, z: -5.4 },
  fountain: { x: -8.6, z: 5.2 },
  gazebo: { x: 12.6, z: -6.2 },
  greenhouse: { x: -13.4, z: 0.9 },
  statue: { x: 6.9, z: -7.1 },
  rainbow: { x: POND.x, z: POND.z + 0.2 },
  gnome: { x: -5.3, z: 5.3 },
};

// sprite boxes (w, h, ax, ay) in world units for a given size s
const BOX = {
  tree: (s) => [4.8 * s, 5.2 * s, 2.2 * s, 4.3 * s],
  fir: (s) => [3 * s, 4.4 * s, 1.35 * s, 3.8 * s],
  bush: (s) => [2.5 * s, 1.7 * s, 1.2 * s, 1.25 * s],
  lavender: (s) => [1.7 * s, 1.4 * s, 0.85 * s, 1.2 * s],
  rock: (s) => [1.7 * s, 1.0 * s, 0.8 * s, 0.75 * s],
  mushrooms: (s) => [1.1 * s, 0.7 * s, 0.5 * s, 0.55 * s],
  log: (s) => [2.5 * s, 1.0 * s, 1.25 * s, 0.7 * s],
  reeds: (s) => [1.5 * s, 1.8 * s, 0.75 * s, 1.65 * s],
  clump: (s) => [1.3 * s, 0.9 * s, 0.65 * s, 0.75 * s],
  grass: (s) => [1.3 * s, 1.0 * s, 0.65 * s, 0.9 * s],
  hive: () => [2.6, 2.3, 1.2, 1.95],
  fence: (s, len) => [len + 0.6, 1.45, 0.25, 1.2],
  shed: () => [3.6, 3.5, 1.05, 2.9],
  wheelbarrow: () => [2.0, 1.35, 1.0, 1.1],
  can: () => [1.2, 1.0, 0.45, 0.85],
  pot: () => [0.9, 1.1, 0.45, 0.95],
  sign: () => [1.0, 1.15, 0.5, 1.05],
  birdbath: () => [1.8, 1.4, 0.8, 1.2],
  bench: () => [2.4, 1.3, 1.1, 1.1],
  arch: () => [2.6, 3.1, 1.25, 2.95],
  lanterns: () => [3.2, 2.5, 1.5, 2.3],
  windmill: () => [2.6, 3.3, 1.1, 3.15],
  sails: () => [3, 3, 1.5, 1.5],
  fountain: () => [2.8, 2.0, 1.3, 1.8],
  gazebo: () => [3.8, 4.0, 1.8, 3.75],
  greenhouse: () => [3.6, 2.7, 1.45, 2.5],
  statue: () => [1.8, 2.2, 0.8, 2.0],
  rainbow: () => [3.8, 1.9, 1.9, 1.6],
  gnome: () => [0.9, 1.15, 0.42, 1.08],
  lily: () => [1.1, 0.8, 0.55, 0.45],
  koi: () => [1.1, 0.45, 0.55, 0.22],
};
const PAINT = {
  tree: (c, px, p) => N.paintTree(c, px, p.seed, p.v || 'leafy', p.s),
  fir: (c, px, p) => N.paintFir(c, px, p.seed, p.s),
  bush: (c, px, p) => N.paintBush(c, px, p.seed, p.v || 'green', p.s, p.c || '#ffffff'),
  lavender: (c, px, p) => N.paintLavender(c, px, p.seed, p.s),
  rock: (c, px, p) => N.paintRock(c, px, p.seed, p.s),
  mushrooms: (c, px, p) => N.paintMushrooms(c, px, p.seed, p.s),
  log: (c, px, p) => N.paintLog(c, px, p.seed, p.s),
  reeds: (c, px, p) => N.paintReeds(c, px, p.seed, p.s),
  clump: (c, px, p) => N.paintFlowerClump(c, px, p.seed, p.s, p.cols),
  grass: (c, px, p) => N.paintTallGrass(c, px, p.seed, p.s),
  hive: (c, px) => B.paintHive(c, px),
  fence: (c, px, p) => B.paintFence(c, px, p.len, p.seed),
  shed: (c, px) => B.paintShed(c, px),
  wheelbarrow: (c, px) => B.paintWheelbarrow(c, px),
  can: (c, px) => B.paintWateringCan(c, px),
  pot: (c, px, p) => B.paintPot(c, px, p.seed, p.c),
  sign: (c, px) => B.paintSign(c, px),
  birdbath: (c, px) => D.paintBirdbath(c, px),
  bench: (c, px) => D.paintBench(c, px),
  arch: (c, px) => D.paintArch(c, px),
  lanterns: (c, px) => D.paintLanterns(c, px),
  windmill: (c, px) => D.paintWindmill(c, px),
  sails: (c, px) => D.paintSails(c, px),
  fountain: (c, px) => D.paintFountain(c, px),
  gazebo: (c, px) => D.paintGazebo(c, px),
  greenhouse: (c, px) => D.paintGreenhouse(c, px),
  statue: (c, px) => D.paintStatue(c, px),
  rainbow: (c, px) => D.paintRainbowBridge(c, px),
  gnome: (c, px) => D.paintGnome(c, px),
  lily: (c, px, p) => D.paintLilyPad(c, px, p.seed, p.c),
  koi: (c, px, p) => D.paintKoi(c, px, p.v),
};

const propBank = new SpriteBank();
export function propSprite(kind, p, res) {
  const s = p.s ?? 1;
  const key = `${kind}.${p.seed ?? 0}.${s}.${p.v ?? ''}.${p.len ?? ''}.${p.c ?? ''}.${p.cols ? p.cols.join('') : ''}`;
  return propBank.get(key, res, (r) => { const [w, h, ax, ay] = BOX[kind](s, p.len); return new Sprite(w, h, ax, ay, r, (c, px) => PAINT[kind](c, px, p)); });
}

// ------------------------------------------------------------------------------------------ layout
function buildLayout() {
  const L = [];
  const add = (kind, x, z, o = {}) => L.push({ kind, x, z, s: 1, seed: L.length * 7 + 3, ...o });
  // hive and its lavender
  add('hive', -5.6, -4.65);
  add('lavender', -7.1, -3.7, { s: 1.1 }); add('lavender', -4.1, -6.6, { s: 1 }); add('lavender', -6.9, -5.9, { s: 0.95 });
  add('clump', -6.3, -2.8, { s: 0.9, cols: ['#b692ea', '#ffffff', '#ffd23f'] });
  // fence with a gate for the rose arch
  for (let x = -21; x < GATE[0] - 0.1; x += 2.2) add('fence', x, FENCE_Z, { len: Math.min(2.2, GATE[0] - x) });
  for (let x = GATE[1]; x < 21; x += 2.2) add('fence', x, FENCE_Z, { len: 2.2 });
  // trees framing the garden
  const trees = [
    ['tree', -10.2, -7.6, 'blossom', 1.05], ['tree', 10.3, -8.3, 'leafy', 1.1], ['fir', 15.6, -7.4, null, 1.15], ['tree', -15.8, -4.2, 'leafy', 1.2],
    ['tree', 16.4, 0.8, 'apple', 1.15], ['tree', -15.6, 5.8, 'blossom', 1.15], ['tree', 15.6, 7.6, 'leafy', 1.2], ['tree', -11.2, 12.2, 'apple', 1.3],
    ['tree', 11.4, 13.4, 'blossom', 1.3], ['tree', -4.8, 16.4, 'leafy', 1.3], ['fir', 5.6, 17.2, null, 1.25], ['fir', -18.6, 1.2, null, 1.1],
    ['tree', -5.6, -11.6, 'apple', 1.1], ['tree', 0.8, -12.4, 'leafy', 1.2], ['tree', 6.4, -11.4, 'blossom', 1.05], ['fir', -12.4, -11.8, null, 1.1],
    ['fir', 13.2, -12.4, null, 1.2], ['tree', -19.5, -9.5, 'leafy', 1.2], ['tree', 19.8, -4.5, 'blossom', 1.1], ['tree', 20.5, 11, 'apple', 1.2],
  ];
  for (const [k, x, z, v, s] of trees) add(k, x, z, { v, s });
  // bushes
  const bushes = [
    [-11.4, 2.4, 'flowers', 1.1, '#ffffff'], [11.6, 4.3, 'berries', 1.05], [-10.9, 7.6, 'hydrangea', 1.1, '#8fb6ff'], [12.4, 9.6, 'green', 1.2],
    [-3.7, 9.7, 'flowers', 1, '#ff8fb8'], [4.6, 10.6, 'hydrangea', 1.05, '#ff9ecb'], [-12.6, -2.1, 'green', 1.1], [-8.6, -8.2, 'hydrangea', 1, '#c7a6ff'],
    [8.6, -8.3, 'flowers', 1, '#ffe066'], [-17, 9.5, 'green', 1.2], [17.6, 4.6, 'flowers', 1.1, '#ff8fb8'], [-7.6, 11.4, 'berries', 1], [8.4, 12.2, 'green', 1],
    [1.6, -10.4, 'flowers', 1, '#ffffff'], [-14.8, -8.4, 'flowers', 1, '#ff8fb8'], [15.2, -9.6, 'hydrangea', 1, '#8fb6ff'],
  ];
  for (const [x, z, v, s, c] of bushes) add('bush', x, z, { v, s, c });
  // pond edge
  add('reeds', POND.x + 1.7, POND.z - 1.2, { s: 1 }); add('reeds', POND.x - 1.9, POND.z - 0.9, { s: 0.8 }); add('reeds', POND.x + 2.2, POND.z + 0.6, { s: 0.85 });
  add('rock', POND.x - 2.4, POND.z + 1.4, { s: 0.7 }); add('clump', POND.x + 0.4, POND.z + 2.3, { s: 0.9, cols: ['#8fb6ff', '#ffffff', '#c7a6ff'] });
  // front of the garden: path props
  add('sign', -1.5, 7.5); add('wheelbarrow', 5.3, 7.7); add('can', -4.6, 7.3); add('pot', 3.1, 8.0, { c: '#ff6f9c' }); add('pot', 3.75, 8.35, { seed: 9, c: '#ffd23f' });
  add('log', -9.8, 9.3); add('mushrooms', -9.0, 10.1, { s: 1.1 }); add('mushrooms', 7.8, -5.0, { s: 0.9 }); add('mushrooms', -13.6, -4.9, { s: 1 });
  add('rock', -8.0, 8.3, { s: 0.8 }); add('rock', 9.2, 9.6, { s: 1 }); add('rock', -12.6, 4.6, { s: 0.7 }); add('rock', 13.4, -3.6, { s: 0.9 });
  add('shed', -14.6, -7.4);
  // flower clumps and tall grass sprinkled around the edges
  const R = rng(77);
  const ok = (x, z) => (x / 6.3) ** 2 + (z / 6.8) ** 2 > 1 && Math.hypot((x - POND.x) / (POND.rx + 0.8), (z - POND.z) / (POND.rz + 0.8)) > 1
    && !Object.values(DECOR_SPOTS).some((d) => Math.hypot(d.x - x, (d.z - z) * 1.3) < 1.8) && Math.abs(z - FENCE_Z) > 0.5
    && !(Math.abs(x - 0.6) < 1.2 && z > 6.5) && L.every((p) => Math.hypot(p.x - x, (p.z - z) * 1.3) > 1.1);
  for (let i = 0, n = 0; i < 400 && n < 46; i++) {
    const x = (R() - 0.5) * 40, z = (R() - 0.5) * 36;
    if (!ok(x, z)) continue;
    n++;
    if (n % 3 === 0) add('clump', x, z, { s: 0.8 + R() * 0.4, cols: [['#ff7eb6', '#ffffff', '#ffd23f'], ['#8f6bff', '#ffffff', '#4fb5ff'], ['#ff9f43', '#ffd23f', '#ffffff']][n % 3] });
    else add('grass', x, z, { s: 0.8 + R() * 0.5 });
  }
  // fence-foot grass
  for (let x = -20; x < 20; x += 1.7 + R()) if (x < GATE[0] - 0.3 || x > GATE[1] + 0.3) add('grass', x, FENCE_Z + 0.12, { s: 0.7 + R() * 0.3 });
  return L;
}

function stonePath() {
  const out = [];
  for (let z = 7.1; z < 22; z += 0.95) out.push({ x: 0.6 + Math.sin(z * 0.45) * 0.7, z, s: 0.95 + ((z * 7) % 1) * 0.2 });
  for (const [x, z] of [[-2.0, -6.7], [-1.7, -7.6], [-1.6, -8.4], [-1.5, -9.7], [-1.3, -10.8]]) out.push({ x, z, s: 0.85 });
  return out;
}

// ------------------------------------------------------------------------------------------ world
export class World {
  constructor(stage, quality) {
    this.stage = stage;
    this.q = quality;
    this.bank = new SpriteBank();
    this.layout = buildLayout();
    this.path = stonePath();
    this.decor = new Decor(this);
    this.weather = new Weather(quality);
    this.time = 0;
    this.pond = this._pondShape();
    this.lilies = [
      { x: -0.9, z: -0.5, seed: 3, c: '#ff9ecb' }, { x: 0.8, z: 0.55, seed: 5, c: null }, { x: 1.2, z: -0.4, seed: 8, c: '#ffffff' },
      { x: -1.2, z: 0.6, seed: 11, c: null }, { x: 0.2, z: -0.9, seed: 13, c: null },
    ];
    this.koi = [{ a: 0, sp: 0.35, r: 0.9, v: 0 }, { a: 2.5, sp: -0.28, r: 1.25, v: 1 }, { a: 4.2, sp: 0.22, r: 0.55, v: 0 }];
    this.ripples = [];
    this.props = this.layout.map((p) => ({ ...p, sortY: p.z * SQ, draw: null }));
    for (const p of this.props) p.draw = (ctx, s) => this._drawProp(ctx, s, p);
    stage.paintGround = (ctx, X0, Y0, X1, Y1, px) => this.paintGround(ctx, X0, Y0, X1, Y1, px);
  }

  sprite(kind, p, res) { return propSprite(kind, p, res); }

  _drawProp(ctx, s, p) {
    drawSprite(ctx, this.sprite(p.kind, p, s.res), s.sx(p.x), s.sy(p.z * SQ), s.cam.ppu);
  }

  // ------------------------------------------------------------------------------------------ ground
  _density(X, Y) {
    const x = X, z = Y / SQ;
    const dp = Math.hypot((x - POND.x) / (POND.rx + 0.3), (z - POND.z) / (POND.rz + 0.3));
    if (dp < 1) return 0;
    let d = 1;
    const dg = (x / 6.2) ** 2 + (z / 6.6) ** 2;
    if (dg < 1) d = 0.55;
    for (const st of this.path) if (Math.abs(st.x - x) < 0.5 && Math.abs(st.z - z) < 0.4) return 0.1;
    return d;
  }
  _wild(X, Y) {
    const z = Y / SQ, x = X;
    let w = z < FENCE_Z - 0.3 ? 0.8 : 0;
    const r = Math.hypot(x / 15, z / 12);
    if (r > 1) w = Math.max(w, Math.min(1, (r - 1) * 3));
    return w;
  }

  paintGround(ctx, X0, Y0, X1, Y1, px) {
    paintLawn(ctx, X0, Y0, X1, Y1, px, { density: (X, Y) => this._density(X, Y), wild: (X, Y) => this._wild(X, Y) });
    // the tended garden: a softly lighter, mown clearing with a darker rim of longer grass
    softEllipse(ctx, 0, 0, 7.6, 7.6 * SQ * 1.1, '#b8ea8a', 0.3, 0.55);
    // wilder, deeper meadow beyond the fence
    const g = ctx.createLinearGradient(0, FENCE_Z * SQ - 0.4, 0, FENCE_Z * SQ - 3.5);
    g.addColorStop(0, 'rgba(40,90,30,0)'); g.addColorStop(1, 'rgba(40,90,30,0.28)');
    ctx.fillStyle = g; ctx.fillRect(X0, Y0, X1 - X0, FENCE_Z * SQ - 0.4 - Y0);
    // worn earth in front of the hive
    softEllipse(ctx, -5.4, -4.0 * SQ, 1.3, 0.55, '#c9a878', 0.35, 0.3);
    // stepping stones
    for (const st of this.path) {
      const X = st.x, Y = st.z * SQ;
      if (X < X0 - 1 || X > X1 + 1 || Y < Y0 - 1 || Y > Y1 + 1) continue;
      ctx.save(); ctx.translate(X, Y); B.paintStone(ctx, px, Math.round(st.z * 13 + 50), st.s); ctx.restore();
    }
    this._paintPond(ctx, px);
  }

  _pondShape() {
    const pts = [];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const k = 1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a + 2);
      pts.push([Math.cos(a) * POND.rx * k, Math.sin(a) * POND.rz * k * SQ]);
    }
    return pts;
  }

  _paintPond(ctx, px) {
    const P = this.pond;
    ctx.save();
    ctx.translate(POND.x, POND.z * SQ);
    const scaled = (k, dy = 0) => P.map(([x, y]) => [x * k, y * k + dy]);
    // muddy bank and a dark wet ring
    ctx.beginPath(); smoothClosed(ctx, scaled(1.12, 0.05)); ctx.fillStyle = 'rgba(60,70,30,0.35)'; ctx.fill();
    ctx.beginPath(); smoothClosed(ctx, scaled(1.04)); ctx.fillStyle = '#6b6a48'; ctx.fill();
    // water
    ctx.beginPath(); smoothClosed(ctx, scaled(0.97));
    const w = ctx.createRadialGradient(0.2, 0.3, 0.2, 0, 0, POND.rx);
    w.addColorStop(0, '#3a9fd2'); w.addColorStop(0.65, '#57bfe4'); w.addColorStop(1, '#8fdcef');
    ctx.fillStyle = w; ctx.fill();
    ctx.save(); ctx.clip();
    // depth shadow under the far bank, sky reflection near it
    const sh = ctx.createLinearGradient(0, -POND.rz * SQ, 0, -POND.rz * SQ + 0.7);
    sh.addColorStop(0, 'rgba(10,40,70,0.5)'); sh.addColorStop(1, 'rgba(10,40,70,0)');
    ctx.fillStyle = sh; ctx.fillRect(-POND.rx * 1.2, -POND.rz, POND.rx * 2.4, 1.2);
    softEllipse(ctx, -0.7, -0.35, 1.2, 0.28, '#ffffff', 0.35, 0.2);
    softEllipse(ctx, 0.9, 0.25, 0.8, 0.18, '#dff6ff', 0.3, 0.2);
    ctx.restore();
    // rim stones around the edge, far ones first
    const stones = [];
    const R = rng(31);
    for (let i = 0; i < 26; i++) {
      const t = i / 26, a = t * TAU + R() * 0.1;
      const k = 1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a + 2);
      stones.push({ x: Math.cos(a) * POND.rx * k * 1.02, y: Math.sin(a) * POND.rz * k * SQ * 1.02, r: 0.2 + R() * 0.14, seed: i });
    }
    stones.sort((p, q) => p.y - q.y);
    for (const st of stones) {
      const pts = [];
      const Rs = rng(st.seed + 5);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const rr = st.r * (0.85 + Rs() * 0.3); pts.push([st.x + Math.cos(a) * rr * 1.2, st.y + Math.sin(a) * rr * 0.75]); }
      ctx.beginPath(); smoothClosed(ctx, pts.map(([x, y]) => [x + 0.03, y + 0.05])); ctx.fillStyle = 'rgba(20,40,20,0.35)'; ctx.fill();
      ctx.beginPath(); smoothClosed(ctx, pts);
      const col = shade('#cfc7b5', (Rs() - 0.5) * 0.15);
      const g = ctx.createLinearGradient(st.x - st.r, st.y - st.r, st.x + st.r, st.y + st.r);
      g.addColorStop(0, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.3));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#6f6655'; ctx.lineWidth = Math.max(0.02, px * 1.3); ctx.stroke();
      if (Rs() < 0.4) { ctx.fillStyle = rgba('#78b848', 0.9); ctx.beginPath(); ctx.ellipse(st.x - st.r * 0.2, st.y - st.r * 0.45, st.r * 0.55, st.r * 0.2, 0, 0, TAU); ctx.fill(); }
    }
    // lily pads
    for (const l of this.lilies) {
      ctx.save(); ctx.translate(l.x, l.z * SQ); PAINT.lily(ctx, px, l); ctx.restore();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------------------------------ per-frame layers
  update(dt, time) {
    this.time = time;
    this.weather.update(dt, time);
    this.decor.update(dt, time);
    for (const k of this.koi) k.a += k.sp * dt;
    if (Math.random() < dt * 0.8) this.ripples.push({ x: (Math.random() - 0.5) * POND.rx * 1.2, z: (Math.random() - 0.5) * POND.rz * 1.1, t: 0 });
    if (this.weather.k.rain > 0.3 && Math.random() < dt * 12 * this.weather.k.rain) this.ripples.push({ x: (Math.random() - 0.5) * POND.rx * 1.6, z: (Math.random() - 0.5) * POND.rz * 1.5, t: 0, small: true });
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < (r.small ? 0.8 : 2.2));
  }

  // animated water: koi under the surface, ripples and glints
  ground(ctx, s, time) {
    const ppu = s.cam.ppu, cx = s.sx(POND.x), cy = s.sy(POND.z * SQ);
    const vw = s.view(3);
    if (POND.x + POND.rx < vw.X0 || POND.x - POND.rx > vw.X1) return;
    ctx.save();
    ctx.beginPath(); smoothClosed(ctx, this.pond.map(([x, y]) => [cx + x * ppu * 0.93, cy + y * ppu * 0.93]));
    ctx.clip();
    for (const k of this.koi) {
      const x = Math.cos(k.a) * k.r * 1.3, z = Math.sin(k.a) * k.r * 0.8;
      const dir = Math.atan2(Math.cos(k.a) * 0.8 * Math.sign(k.sp) * SQ, -Math.sin(k.a) * 1.3 * Math.sign(k.sp));
      drawSprite(ctx, this.sprite('koi', { v: k.v, seed: k.v }, s.resFor(0.6)), cx + x * ppu, cy + z * SQ * ppu, ppu * 0.6, 1, 1, dir, 0.75);
    }
    ctx.lineWidth = Math.max(1, ppu * 0.022);
    for (const r of this.ripples) {
      const life = r.small ? 0.8 : 2.2, k = r.t / life;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * (r.small ? 0.5 : 0.45)})`;
      const rr = (r.small ? 0.25 : 0.7) * ease.outCubic(k) * ppu;
      ctx.beginPath(); ctx.ellipse(cx + r.x * ppu, cy + r.z * SQ * ppu, rr, rr * SQ, 0, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 7; i++) {
      const ph = time * 0.35 + i * 1.7;
      const a = 0.5 + 0.5 * Math.sin(ph * 2.1);
      const x = Math.sin(i * 2.3 + time * 0.12) * POND.rx * 0.7, z = Math.cos(i * 1.7) * POND.rz * 0.55;
      ctx.globalAlpha = a * 0.8;
      ctx.beginPath(); ctx.moveTo(cx + (x - 0.18) * ppu, cy + z * SQ * ppu); ctx.lineTo(cx + (x + 0.18) * ppu, cy + z * SQ * ppu); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  collect(list, s) {
    const v = s.view(5);
    for (const p of this.props) {
      const Y = p.z * SQ;
      if (p.x < v.X0 || p.x > v.X1 || Y < v.Y0 || Y > v.Y1 + 4.5) continue;
      list.push(p);
    }
    this.decor.collect(list, s);
  }

  overlay(ctx, s, time) { this.weather.overlay(ctx, s, time); }
  glow(ctx, s, time) { this.decor.glow(ctx, s, time, this.weather.k.night); this.weather.glow(ctx, s, time); }
  post(ctx, s, time) { this.weather.post(ctx, s, time); }

  setWeather(kind) { this.weather.set(kind); }
  setShadows() {}
}

// ------------------------------------------------------------------------------------------ decorations
class Decor {
  constructor(world) {
    this.w = world;
    this.items = {};          // id → { x, z, k (appear 0..1), sortY, draw, position: {x, z} }
    this.gnome = null;
  }
  place(id, animate = false) {
    if (this.items[id]) return;
    const spot = DECOR_SPOTS[id];
    if (!spot) return;
    const it = { id, x: spot.x, z: spot.z, k: animate ? 0 : 1, sortY: spot.z * SQ, position: { x: spot.x, y: 0, z: spot.z }, draw: null };
    it.draw = (ctx, s, t) => this._draw(ctx, s, it, t);
    this.items[id] = it;
  }
  setGnome(on) {
    if (on && !this.gnome) {
      const g = { id: 'gnome', x: DECOR_SPOTS.gnome.x, z: DECOR_SPOTS.gnome.z, k: 1, hop: 0, sortY: DECOR_SPOTS.gnome.z * SQ, draw: null };
      g.draw = (ctx, s, t) => this._draw(ctx, s, g, t);
      this.gnome = g;
    } else if (!on) this.gnome = null;
  }
  hop() { if (this.gnome) this.gnome.hop = 1; }
  update(dt) {
    for (const it of Object.values(this.items)) it.k = Math.min(1, it.k + dt * 1.5);
    if (this.gnome) this.gnome.hop = Math.max(0, this.gnome.hop - dt * 2.2);
  }
  collect(list) {
    for (const it of Object.values(this.items)) list.push(it);
    if (this.gnome) list.push(this.gnome);
  }
  _draw(ctx, s, it, time) {
    const w = this.w, ppu = s.cam.ppu;
    const X = s.sx(it.x), Y = s.sy(it.z * SQ);
    const k = it.k >= 1 ? 1 : ease.outBack(it.k);
    const sy = Math.max(0.01, k), sx = 1 + (1 - Math.min(1, it.k)) * 0.2;
    if (it.id === 'gnome') {
      const h = Math.sin(it.hop * Math.PI) * 0.35;
      drawSprite(ctx, w.shadowSpr(s), X + 0.05 * ppu, Y + 0.02 * ppu, ppu * 0.3, 1, 1, 0, 0.3);
      drawSprite(ctx, w.sprite('gnome', { seed: 1 }, s.res), X, Y - h * HY * ppu, ppu, 1 - h * 0.2, 1 + h * 0.25);
      return;
    }
    drawSprite(ctx, w.sprite(it.id, { seed: 1 }, s.res), X, Y, ppu, sx, sy);
    if (it.k < 1) return;
    if (it.id === 'windmill') {
      const [hx, hy] = D.WINDMILL_HUB;
      drawSprite(ctx, w.sprite('sails', { seed: 1 }, s.res), X + hx * ppu, Y + hy * ppu, ppu, 1, 1, time * 0.9);
    } else if (it.id === 'fountain') {
      // arcs of water from the top spout into the upper bowl and from the bowl into the basin
      const top = Y + D.FOUNTAIN_TOP * ppu;
      ctx.strokeStyle = 'rgba(210,240,255,0.85)'; ctx.lineWidth = Math.max(1.2, ppu * 0.035);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + time * 0.3, dx = Math.cos(a) * 0.42, dz = Math.sin(a) * 0.2;
        ctx.beginPath(); ctx.moveTo(X, top); ctx.quadraticCurveTo(X + dx * ppu * 0.6, top - 0.3 * ppu, X + dx * ppu, Y + (-1.28 + dz) * ppu); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(210,240,255,0.6)';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU, dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5 * SQ * 0.55;
        const f = (time * 1.6 + i * 0.37) % 1;
        ctx.globalAlpha = 0.9 - f * 0.5;
        ctx.beginPath(); ctx.moveTo(X + dx * ppu, Y + (-1.25 + dz) * ppu); ctx.quadraticCurveTo(X + dx * 1.35 * ppu, Y + (-1.2 + dz) * ppu, X + dx * 1.55 * ppu, Y + (-0.35 + dz * 1.4) * ppu); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 6; i++) { const f = (time * 0.8 + i / 6) % 1; ctx.beginPath(); ctx.arc(X + Math.cos(i * 2.1) * (0.3 + f * 0.5) * ppu, Y + (-0.3 + Math.sin(i * 2.1) * 0.25) * ppu, ppu * 0.03 * (1 - f), 0, TAU); ctx.fill(); }
    }
  }
  glow(ctx, s, time, night) {
    if (night < 0.05) return;
    const ppu = s.cam.ppu;
    ctx.globalCompositeOperation = 'lighter';
    const lant = this.items.lanterns;
    if (lant && lant.k >= 1) {
      const X = s.sx(lant.x), Y = s.sy(lant.z * SQ);
      for (const [x, c] of D.LANTERNS) {
        const y = D.lanternY(x) + 0.2;
        drawSprite(ctx, this.w.glowSpr(s, c), X + x * ppu, Y + y * ppu, ppu * 0.9, 1, 1, 0, night * (0.75 + 0.1 * Math.sin(time * 3 + x * 5)));
      }
    }
    // shed window and hive entrance glow warmly at night
    const shed = this.w.props.find((p) => p.kind === 'shed');
    if (shed) drawSprite(ctx, this.w.glowSpr(s, '#ffcf7a'), s.sx(shed.x + 0.35), s.sy(shed.z * SQ - 0.85), ppu * 0.7, 1, 1, 0, night * 0.8);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// shared little sprites
World.prototype.shadowSpr = function (s) { return this.bank.get('shadow', s.res, (r) => new Sprite(2.2, 1.2, 1.1, 0.6, r, (c) => softEllipse(c, 0, 0, 1, 0.5, '#173512', 0.55, 0.2))); };
World.prototype.glowSpr = function (s, color) { return this.bank.get('glow' + color, s.res, (r) => new Sprite(2.4, 2.4, 1.2, 1.2, r, (c) => softEllipse(c, 0, 0, 1.15, 1.15, color, 0.8, 0.05))); };
