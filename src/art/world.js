// The garden's surroundings: lawn, paths, pond, hive, fence, trees, bushes, props and the decorations the player
// buys. Static art is painted into the stage's cached ground layer or cached sprites; animated bits (pond life,
// windmill sails, fountain water, lantern glow, the gnome, critters) are drawn per frame.
import { Sprite, SpriteBank, drawSprite, smoothClosed, softEllipse, rng, hash2 } from './paint.js';
import { SQ, HY } from './view3q.js';
import { GroundMap, paintGrass, lawnDetails, stampItems } from './lawn.js';
import { paintMask1, paintMask2, paintTone, paintPaths, paintPond, paintMulch, pondPoints, warpMasks, warmTerrain } from './terrain.js';
import { warmStep, stampRes } from './stamps.js';
import { PATHS, inBeds, SIDE } from './plan.js';
import * as N from './nature.js';
import * as B from './built.js';
import * as D from './decor.js';
import * as S from './scenery.js';
import { Life } from './life.js';
import { Weather } from './weather.js';
import { decorURL } from './uiart.js';
import { ease } from '../core/math.js';

const TAU = Math.PI * 2;
const SWAY = {
  grass: 0.09, clump: 0.07, lavender: 0.06, reeds: 0.07, bush: 0.018, tree: 0.012, fir: 0.008, pot: 0.02,
  border: 0.022, iris: 0.05, sunflowers: 0.025, willow: 0.014, fern: 0.03, foxgloves: 0.05, meadow: 0.08,
};
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
  hive: () => [2.7, 2.5, 1.2, 1.95],
  fence: (s, len) => [len + 0.6, 1.45, 0.25, 1.2],
  shed: () => [3.6, 3.6, 1.05, 2.9],
  wheelbarrow: () => [2.0, 1.4, 1.0, 1.1],
  can: () => [1.2, 1.0, 0.45, 0.85],
  pot: () => [0.9, 1.1, 0.45, 0.95],
  sign: () => [1.0, 1.2, 0.5, 1.05],
  // decorations: room below the anchor for the whole contact shadow (the shop thumbnails keep THUMB)
  birdbath: () => [2.0, 1.55, 0.8, 1.2],
  bench: () => [2.6, 1.45, 1.1, 1.1],
  arch: () => [2.9, 3.35, 1.3, 2.95],
  lanterns: () => [3.6, 2.65, 1.6, 2.3],
  windmill: () => [2.8, 3.6, 1.1, 3.15],
  sails: () => [3, 3, 1.5, 1.5],
  fountain: () => [3.0, 2.45, 1.4, 1.8],
  gazebo: () => [4.4, 4.4, 1.9, 3.75],
  greenhouse: () => [4.0, 3.1, 1.55, 2.5],
  statue: () => [2.0, 2.35, 0.8, 2.0],
  rainbow: () => [3.8, 2.0, 1.9, 1.6],
  gnome: () => [0.95, 1.25, 0.42, 1.08],
  lily: () => [1.1, 0.8, 0.55, 0.45],
  koi: () => [1.1, 0.45, 0.55, 0.22],
  border: (s, len) => [len + 0.7, 2.45, 0.35, 2.25],
  wall: (s, len) => [len + 0.7, 1.75, 0.35, 1.45],
  pillar: () => [1.0, 2.15, 0.5, 1.95],
  gatepost: () => [0.5, 1.7, 0.25, 1.6],
  hedge: (s, len) => [len + 0.7, 1.55, 0.3, 1.35],
  hedgez: (s, len) => [2.3, len * SQ + 1.55, 1.1, len * SQ + 1.3],
  topiary: () => [0.9, 1.4, 0.45, 1.32],
  jetty: () => [2.6, 2.15, 2.25, 1.85],
  iris: (s) => [1.2 * s, 1.15 * s, 0.6 * s, 1.02 * s],
  lamp: () => [0.8, 2.55, 0.4, 2.38],
  vegbed: () => [2.7, 2.55, 0.25, 2.3],
  scarecrow: () => [1.6, 2.3, 0.8, 2.15],
  pumpkins: () => [1.7, 0.85, 0.85, 0.62],
  sunflowers: (s) => [1.3 * s, 2.9 * s, 0.65 * s, 2.7 * s],
  waterbutt: () => [1.3, 1.25, 0.5, 1.05],
  potstack: () => [1.3, 1.15, 0.65, 0.98],
  logpile: () => [1.8, 1.1, 0.9, 0.96],
  willow: (s) => [5.2 * s, 4.3 * s, 2.3 * s, 3.85 * s],
  fern: (s) => [1.3 * s, 0.85 * s, 0.65 * s, 0.68 * s],
  foxgloves: (s) => [0.95 * s, 1.45 * s, 0.47 * s, 1.32 * s],
  meadow: (s) => [1.15 * s, 1.15 * s, 0.57 * s, 1.02 * s],
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
  border: (c, px, p) => S.paintBorder(c, px, p.seed, p.len),
  wall: (c, px, p) => S.paintWall(c, px, p.seed, p.len),
  pillar: (c, px) => S.paintPillar(c, px),
  gatepost: (c, px) => S.paintGatePost(c, px),
  hedge: (c, px, p) => S.paintHedge(c, px, p.seed, p.len),
  hedgez: (c, px, p) => S.paintHedgeZ(c, px, p.seed, p.len),
  topiary: (c, px, p) => S.paintTopiary(c, px, p.seed),
  jetty: (c, px) => S.paintJetty(c, px),
  iris: (c, px, p) => S.paintIris(c, px, p.seed, p.s),
  lamp: (c, px) => S.paintLamp(c, px),
  vegbed: (c, px, p) => S.paintVegBed(c, px, p.seed, p.v),
  scarecrow: (c, px) => S.paintScarecrow(c, px),
  pumpkins: (c, px, p) => S.paintPumpkins(c, px, p.seed),
  sunflowers: (c, px, p) => S.paintSunflowers(c, px, p.seed, p.s),
  waterbutt: (c, px) => S.paintWaterButt(c, px),
  potstack: (c, px, p) => S.paintPotStack(c, px, p.seed),
  logpile: (c, px, p) => S.paintLogPile(c, px, p.seed),
  willow: (c, px, p) => S.paintWillow(c, px, p.seed, p.s),
  fern: (c, px, p) => S.paintFern(c, px, p.seed, p.s),
  foxgloves: (c, px, p) => S.paintFoxgloves(c, px, p.seed, p.s),
  meadow: (c, px, p) => S.paintMeadowTuft(c, px, p.seed, p.s, p.cols),
};

const propBank = new SpriteBank();
export function propSprite(kind, p, res) {
  const s = p.s ?? 1;
  const key = `${kind}.${p.seed ?? 0}.${s}.${p.v ?? ''}.${p.len ?? ''}.${p.c ?? ''}.${p.cols ? p.cols.join('') : ''}`;
  return propBank.get(key, res, (r) => { const [w, h, ax, ay] = BOX[kind](s, p.len); return new Sprite(w, h, ax, ay, r, (c, px) => PAINT[kind](c, px, p)); });
}

// ------------------------------------------------------------------------------------------ layout
function pathClear(x, z, m) {
  for (const p of PATHS) {
    const b = p.box, d = p.w / 2 + m;
    if (x < b.x0 - d || x > b.x1 + d || z < b.z0 - d || z > b.z1 + d) continue;
    for (const [px, pz] of p.line) if (Math.hypot(px - x, pz - z) < d) return false;
  }
  return true;
}

export const JETTY = { x: 11.55, z: -1.2 };
export const LAMP = { x: -0.95, z: 9.75 };
const WARM_STEPS = [1, 2, 0.5];
const FLOWER_COLS = [['#ff7eb6', '#ffffff', '#ffd23f'], ['#8f6bff', '#ffffff', '#4fb5ff'], ['#ff9f43', '#ffd23f', '#ffffff'], ['#ffffff', '#ffd23f', '#ff8fb8']];

function buildLayout() {
  const L = [];
  const add = (kind, x, z, o = {}) => L.push({ kind, x, z, s: 1, seed: L.length * 7 + 3, ...o });
  const R = rng(77);

  // --- the hive in its lavender, beside the walk
  add('hive', -5.6, -4.65);
  add('lavender', -6.25, -5.8, { s: 0.95 }); add('lavender', -4.3, -6.35, { s: 1 }); add('lavender', -6.3, -2.9, { s: 0.9 });
  add('lavender', -4.2, -7.9, { s: 0.85 });

  // --- back boundary: old stone wall on the left, picket fence with a gateway, cottage border in front
  const WALL_Z = FENCE_Z + 0.2;
  for (let x = -SIDE; x < -9.0; x += 2.9) add('wall', x, WALL_Z, { len: Math.min(2.9, -9.0 - x) });
  add('pillar', -8.85, WALL_Z + 0.02);
  for (let x = -8.55; x < GATE[0] - 0.1; x += 2.2) add('fence', x, FENCE_Z, { len: Math.min(2.2, GATE[0] - x) });
  for (let x = GATE[1]; x < SIDE - 0.1; x += 2.2) add('fence', x, FENCE_Z, { len: Math.min(2.2, SIDE - x) });
  add('gatepost', GATE[0], FENCE_Z + 0.03); add('gatepost', GATE[1], FENCE_Z + 0.03);
  const BORDER_Z = FENCE_Z + 0.5;
  const borderRuns = [[-8.3, -2.75], [-0.45, 9.05], [11.0, 17.2]];
  for (const [a, b] of borderRuns) for (let x = a; x < b - 0.3; x += 2.1) add('border', x, BORDER_Z, { len: Math.min(2.1, b - x) });
  // shed corner (in front of the wall)
  add('shed', -14.6, -7.4);
  add('waterbutt', -12.75, -7.05); add('logpile', -16.55, -7.45, { seed: 4 }); add('potstack', -16.3, -5.9, { seed: 2 });
  add('wheelbarrow', -9.9, -3.3);

  // --- side hedges and the front hedge with its gateway
  for (let z = FENCE_Z + 0.3; z < 13.4; z += 2) for (const x of [-SIDE, SIDE]) add('hedgez', x, Math.min(13.4, z + 2), { len: Math.min(2, 13.4 - z) });
  const FRONT_Z = 13.5;
  for (let x = -SIDE + 0.45; x < 0.15; x += 2.2) add('hedge', x, FRONT_Z, { len: Math.min(2.2, 0.15 - x) });
  for (let x = 2.15; x < SIDE - 0.5; x += 2.2) add('hedge', x, FRONT_Z, { len: Math.min(2.2, SIDE - 0.45 - x) });
  add('topiary', -0.15, FRONT_Z + 0.3, { seed: 3 }); add('topiary', 2.45, FRONT_Z + 0.3, { seed: 8 });

  // --- trees: two framing the back corners inside the fence, the willow by the pond, the rest round the edges
  const trees = [
    ['tree', -9.6, -7.95, 'blossom', 1.05], ['tree', 10.0, -8.05, 'leafy', 1.1], ['willow', 15.0, -2.6, null, 1.0],
    ['tree', 15.2, 4.2, 'apple', 1.1], ['tree', -15.6, -1.1, 'blossom', 1.05], ['tree', 13.6, 10.6, 'blossom', 1.2],
    // beyond the fence
    ['tree', -6.4, -11.4, 'apple', 1.1], ['tree', 2.8, -12.9, 'leafy', 1.25], ['tree', 7.6, -11.3, 'blossom', 1.05], ['fir', -12.4, -11.9, null, 1.1],
    ['fir', 13.8, -11.8, null, 1.2], ['fir', -3.2, -14.2, null, 1.15], ['tree', 10.8, -14.6, 'leafy', 1.2], ['tree', -16.6, -12.8, 'leafy', 1.2],
    ['tree', -20.5, -9.5, 'leafy', 1.2], ['tree', 20.4, -8.5, 'blossom', 1.1],
    // outside the side hedges
    ['fir', -20.2, -3.0, null, 1.2], ['tree', -21.0, 3.5, 'leafy', 1.25], ['tree', -19.8, 11.0, 'apple', 1.2], ['tree', 20.6, -2.5, 'leafy', 1.2],
    ['fir', 20.2, 4.5, null, 1.15], ['tree', 21.0, 11.5, 'apple', 1.2],
    // beyond the front hedge, flanking the lane
    ['tree', -4.8, 16.6, 'leafy', 1.3], ['fir', 5.6, 17.4, null, 1.25], ['tree', -10.5, 18.5, 'blossom', 1.2], ['tree', 11.5, 19.0, 'leafy', 1.3],
    ['fir', -2.8, 22.5, null, 1.2], ['tree', 4.6, 24.5, 'apple', 1.2],
  ];
  for (const [k, x, z, v, s] of trees) add(k, x, z, { v, s });
  // the woods all around: groves of trees and shrubs beyond the meadows, thickening with distance
  for (let i = 0, n = 0; i < 1600 && n < 95; i++) {
    const a = R() * TAU, r = 0.66 + R() * 0.62;
    const x = Math.cos(a) * 38 * r, z = 6 + Math.sin(a) * 36 * r;
    if (Math.abs(x) < 22 && z > -19 && z < 27) continue;
    if (Math.abs(x) > 44 || z < -46 || z > 52) continue;
    if (Math.abs(x - 0.4) < 2.6 && (z > 25 || z < -18)) continue;            // keep the lanes clear
    const far = Math.min(1, Math.max((Math.abs(x) - 22) / 12, (-19 - z) / 12, (z - 27) / 12));
    if (L.some((p) => (p.kind === 'tree' || p.kind === 'fir') && Math.hypot(p.x - x, (p.z - z) * 1.25) < 3.8 - far * 1.2)) continue;
    n++;
    const t = R();
    add(t < 0.4 ? 'fir' : 'tree', x, z, { v: t < 0.85 ? (R() < 0.7 ? 'leafy' : 'apple') : R() < 0.5 ? 'blossom' : 'autumn', s: 1.15 + R() * 0.35 + far * 0.1 });
    if (R() < 0.45) add('bush', x + (R() - 0.5) * 2.4, z + 0.8 + R() * 0.8, { v: 'green', s: 0.9 + R() * 0.3 });
  }

  // --- bushes
  const bushes = [
    [-11.9, -2.2, 'green', 1.1], [13.0, 7.3, 'green', 1.1], [-4.2, 10.4, 'flowers', 1, '#ff8fb8'], [4.4, 10.8, 'hydrangea', 1.05, '#ff9ecb'],
    [-16.1, 11.2, 'green', 1.1], [16.0, 6.4, 'flowers', 1.0, '#ff8fb8'], [-7.9, 11.5, 'berries', 1], [8.4, 12.0, 'green', 1],
    [1.2, -10.7, 'flowers', 1, '#ffffff'], [15.6, -7.9, 'hydrangea', 1, '#8fb6ff'], [-8.9, -1.6, 'hydrangea', 0.9, '#c7a6ff'],
    [-16.0, 2.8, 'green', 1.0], [16.2, -5.2, 'berries', 0.95], [4.9, -10.3, 'hydrangea', 1, '#ff9ecb'], [-9.0, -10.4, 'green', 1.1],
  ];
  for (const [x, z, v, s, c] of bushes) add('bush', x, z, { v, s, c });

  // --- the pond: jetty, reeds, irises, rocks
  add('jetty', JETTY.x, JETTY.z);
  add('reeds', 6.95, -3.3, { s: 0.95 }); add('reeds', 11.25, -3.4, { s: 0.9 }); add('reeds', 11.55, -2.2, { s: 0.8 });
  add('iris', 7.0, -1.55, { s: 0.9 }); add('iris', 10.2, -4.25, { s: 0.85 }); add('iris', 6.65, -2.55, { s: 0.75 });
  add('rock', 6.55, -0.7, { s: 0.7 }); add('rock', 12.0, -2.9, { s: 0.6 }); add('fern', 11.9, -3.6, { s: 0.9 });

  // --- front: lamp, sign, pots by the junction; flowers along the lane
  add('lamp', LAMP.x, LAMP.z); add('sign', 2.3, 9.85); add('can', -2.55, 9.5);
  add('pot', -1.75, 9.3, { c: '#ff6f9c' }); add('pot', -1.3, 9.62, { seed: 9, c: '#ffd23f' });
  for (const [x, z, k] of [[-0.6, 11.2, 0], [2.4, 11.8, 1], [-0.4, 12.7, 2], [2.6, 12.9, 3], [3.4, 10.3, 0]]) add('clump', x, z, { s: 0.85, cols: FLOWER_COLS[k] });

  // --- kitchen garden (front left): raised beds, scarecrow, sunflowers, pumpkins
  add('vegbed', -15.6, 4.7, { seed: 1, v: 0 }); add('vegbed', -12.6, 4.7, { seed: 2, v: 1 });
  add('vegbed', -15.6, 7.4, { seed: 3, v: 2 }); add('vegbed', -12.6, 7.4, { seed: 4, v: 3 });
  add('scarecrow', -13.0, 5.95);
  add('sunflowers', -16.2, 3.35, { seed: 5, s: 0.95 }); add('sunflowers', -10.1, 3.2, { seed: 7, s: 0.85 });
  add('pumpkins', -15.9, 9.25, { seed: 3 }); add('pumpkins', -11.2, 9.35, { seed: 6 });

  // --- wildflower corner (front right) and meadow plants round the edges
  for (let i = 0, n = 0; i < 200 && n < 16; i++) {
    const a = R() * TAU, r = Math.sqrt(R());
    const x = 14.2 + Math.cos(a) * 3.2 * r, z = 8.6 + Math.sin(a) * 2.8 * r;
    if (!pathClear(x, z, 0.4) || L.some((p) => Math.hypot(p.x - x, (p.z - z) * 1.3) < 0.9)) continue;
    n++;
    const t = R();
    if (t < 0.5) add('meadow', x, z, { s: 0.85 + R() * 0.35 });
    else if (t < 0.7) add('foxgloves', x, z, { s: 0.9 + R() * 0.2 });
    else add('clump', x, z, { s: 0.8 + R() * 0.3, cols: FLOWER_COLS[Math.floor(R() * 4)] });
  }
  // meadow plants peeking through the fence and along the hedges
  for (let x = -16.5; x < 17; x += 1.3 + R() * 1.1) {
    if (x > GATE[0] - 1 && x < GATE[1] + 1) continue;
    const z = FENCE_Z - 0.45 - R() * 0.6;
    add(R() < 0.6 ? 'meadow' : 'foxgloves', x, z, { s: 0.9 + R() * 0.3 });
  }
  const ok = (x, z) => !inBeds(x, z, 0.8) && Math.hypot((x - POND.x) / (POND.rx + 0.9), (z - POND.z) / (POND.rz + 0.9)) > 1
    && !Object.values(DECOR_SPOTS).some((d) => Math.hypot(d.x - x, (d.z - z) * 1.3) < 1.9)
    && pathClear(x, z, 0.45) && L.every((p) => Math.hypot(p.x - x, (p.z - z) * 1.3) > 1.0);
  for (let z = FENCE_Z + 1; z < 13; z += 0.9 + R() * 0.8) for (const sgn of [-1, 1]) {
    const x = sgn * (SIDE - 0.85 - R() * 0.5);
    if (!ok(x, z)) continue;
    const t = R();
    add(t < 0.45 ? 'grass' : t < 0.75 ? 'meadow' : t < 0.88 ? 'fern' : 'clump', x, z, { s: 0.75 + R() * 0.35, cols: FLOWER_COLS[Math.floor(R() * 4)] });
  }
  // a few soft tufts at the foot of trees and rocks
  for (const p of L.slice()) {
    if (p.kind !== 'tree' && p.kind !== 'rock') continue;
    if (Math.abs(p.x) > 24 || p.z < -16 || p.z > 20) continue;
    for (let k = 0; k < 2; k++) {
      const x = p.x + (R() - 0.5) * 1.6 * p.s, z = p.z + 0.25 + R() * 0.5;
      if (ok(x, z)) add(R() < 0.6 ? 'grass' : 'fern', x, z, { s: 0.7 + R() * 0.3 });
    }
  }
  // mushrooms under the trees, a log in the long grass
  add('log', -10.4, 10.2); add('mushrooms', -9.7, 10.9, { s: 1.1 }); add('mushrooms', 13.2, -5.0, { s: 0.9 }); add('mushrooms', -15.2, -2.2, { s: 0.8 });
  add('rock', -9.3, 9.1, { s: 0.8 }); add('rock', 9.6, 10.3, { s: 1 }); add('rock', 14.2, 1.3, { s: 0.8 });
  return L;
}

// what the ground painter needs to know about the layout: shade casters, worn earth, groves
function groundScene(layout) {
  const trees = layout.filter((p) => p.kind === 'tree' || p.kind === 'fir' || p.kind === 'willow').map((p) => ({ x: p.x, z: p.z, s: p.s * (p.kind === 'fir' ? 0.75 : 1), kind: p.v }));
  const shrubs = layout.filter((p) => p.kind === 'bush' || p.kind === 'lavender' || p.kind === 'sunflowers').map((p) => ({ x: p.x, z: p.z, s: p.s }));
  const groves = trees.filter((t) => Math.abs(t.x) > 22 || t.z < -15 || t.z > 18).map((t) => ({ x: t.x + 0.4, z: t.z + 0.4, r: 3.2 * t.s }));
  const worn = [
    { x: -5.5, z: -3.9, rx: 1.2, rz: 0.7, a: 0.55 },     // the bees' landing in front of the hive
    { x: -14.5, z: -6.6, rx: 1.0, rz: 0.6, a: 0.6 },     // shed door
    { x: -1.6, z: -8.5, rx: 1.0, rz: 0.5, a: 0.4 },      // the gate
    { x: -13.0, z: 5.6, rx: 4.0, rz: 3.2, a: 0.3 },      // round the kitchen garden
    { x: 0.6, z: 8.6, rx: 1.4, rz: 0.7, a: 0.3 },        // front junction
  ];
  const mulch = [{ x0: -16.1, z0: 3.3, x1: -9.95, z1: 7.95 }];
  return { pond: POND, trees, shrubs, worn, groves, mulch };
}

// ------------------------------------------------------------------------------------------ world
export class World {
  constructor(stage, quality) {
    this.stage = stage;
    this.q = quality;
    this.bank = new SpriteBank();
    this.layout = buildLayout();
    this.scene = groundScene(this.layout);
    this.map = null;
    this.decor = new Decor(this);
    this.weather = new Weather(quality);
    this.fx = null;                 // set by the game so the world can shed petals
    this.time = 0;
    this.pondDef = POND;
    this.pond = pondPoints(POND, 0.97);
    this.lilies = [
      { x: -0.9, z: -0.5, seed: 3, c: '#ff9ecb' }, { x: 0.3, z: 0.4, seed: 5, c: null }, { x: 1.2, z: -0.4, seed: 8, c: '#ffffff' },
      { x: -1.2, z: 0.6, seed: 11, c: null }, { x: 0.2, z: -0.9, seed: 13, c: null }, { x: -1.6, z: -0.1, seed: 17, c: null },
      { x: -0.3, z: 0.9, seed: 19, c: '#fff2f8' },
    ];
    this.koi = [{ a: 0, sp: 0.35, r: 0.9, v: 0 }, { a: 2.5, sp: -0.28, r: 1.25, v: 1 }, { a: 4.2, sp: 0.22, r: 0.55, v: 0 }];
    this.ripples = [];
    this.props = this.layout.map((p) => ({ ...p, sortY: p.z * SQ, draw: null }));
    for (const p of this.props) p.draw = (ctx, s) => this._drawProp(ctx, s, p);
    this.blossoms = this.layout.filter((p) => p.v === 'blossom');
    // what the critters need to know: where they may not stand, where the rabbits live, the fence top, trees
    // that drop leaves, and the lamps the moths circle
    this._solid = this._solidGrid();
    this.burrows = [
      { x: -17.25, z: 6.1, dx: 1, dz: 0.1 }, { x: -17.25, z: -2.6, dx: 1, dz: 0.15 }, { x: 17.25, z: 7.9, dx: -1, dz: -0.1 }, { x: 17.25, z: -4.4, dx: -1, dz: 0.1 },
      { x: -6.2, z: 13.2, dx: 0.1, dz: -1 }, { x: 6.8, z: 13.2, dx: -0.1, dz: -1 }, { x: -8.9, z: -1.95, dx: 0.7, dz: 0.8 }, { x: 13.0, z: 6.95, dx: -0.8, dz: 0.6 },
      { x: 5.6, z: -8.55, dx: 0.1, dz: 1 }, { x: -5.0, z: -8.55, dx: -0.1, dz: 1 },
    ];
    this.fenceRuns = [[-8.55, GATE[0]], [GATE[1], SIDE]];
    this.leafy = this.layout.filter((p) => (p.kind === 'tree' && p.v !== 'blossom') || p.kind === 'willow');
    this.lights = [
      { x: LAMP.x, z: LAMP.z, y: -S.LAMP_Y / HY, c: '#ffd88a', r: 1.3 },
      { x: JETTY.x + S.JETTY_LAMP[0], z: JETTY.z, y: -S.JETTY_LAMP[1] / HY, c: '#ffd88a', r: 0.9 },
    ];
    this.life = new Life(this);
    stage.paintGround = (ctx, X0, Y0, X1, Y1, px, opts) => this.paintGround(ctx, X0, Y0, X1, Y1, px, opts);
  }

  // coarse occupancy grid (1 unit cells) of everything a critter shouldn't stand in
  _solidGrid() {
    const hard = new Set(), soft = new Set();
    const mark = (g, x0, z0, x1, z1) => { for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let z = Math.floor(z0); z <= Math.floor(z1); z++) g.add(x + ',' + z); };
    const H = { tree: 0.8, fir: 0.7, willow: 1.2, bush: 0.9, lavender: 0.6, rock: 0.5, hive: 0.8, shed: 1.3, sunflowers: 0.5, pumpkins: 0.6, scarecrow: 0.4, lamp: 0.3, sign: 0.3, can: 0.3, pot: 0.3, waterbutt: 0.5, potstack: 0.5, logpile: 0.7, log: 0.9, reeds: 0.5, topiary: 0.4, wheelbarrow: 0.8 };
    const S = { clump: 0.4, meadow: 0.4, grass: 0.35, fern: 0.4, foxgloves: 0.35, mushrooms: 0.3, iris: 0.4 };
    for (const p of this.layout) {
      if (p.kind === 'vegbed') mark(hard, p.x - 0.1, p.z - 1.1, p.x + 2.3, p.z + 0.1);
      else if (p.kind === 'jetty') mark(hard, p.x - 2, p.z - 0.8, p.x + 0.2, p.z + 0.1);
      else if (H[p.kind]) { const r = H[p.kind] * (p.s || 1); mark(hard, p.x - r, p.z - r * 0.7, p.x + r, p.z + r * 0.5); }
      else if (S[p.kind]) { const r = S[p.kind] * (p.s || 1); mark(soft, p.x - r, p.z - r * 0.7, p.x + r, p.z + r * 0.5); }
    }
    return { hard, soft };
  }
  // is (x, z) taken by a prop or decoration? (hardOnly: low plants don't count)
  blocked(x, z, hardOnly = false) {
    const k = Math.floor(x) + ',' + Math.floor(z);
    if (this._solid.hard.has(k) || (!hardOnly && this._solid.soft.has(k))) return true;
    for (const it of Object.values(this.decor.items)) if (Math.abs(it.x - x) < 1.4 && Math.abs(it.z - z) < 1.0) return true;
    return false;
  }
  ripple(x, z, small) { this.ripples.push({ x, z, t: 0, small }); }

  sprite(kind, p, res) { return propSprite(kind, p, res); }

  // wind: soft plants lean and bob, trees and bushes barely breathe
  wind(x, z, kind, time) {
    const amp = SWAY[kind];
    if (!amp) return 0;
    const gust = 1 + this.weather.k.rain * 1.6;
    return (Math.sin(time * 1.6 + x * 0.55 + z * 0.35) * 0.7 + Math.sin(time * 3.1 + x * 1.7) * 0.3) * amp * gust;
  }
  _drawProp(ctx, s, p) {
    drawSprite(ctx, this.sprite(p.kind, p, s.res), s.sx(p.x), s.sy(p.z * SQ), s.cam.ppu, 1, 1, 0, 1, this.wind(p.x, p.z, p.kind, this.time));
  }

  // ------------------------------------------------------------------------------------------ ground
  // the low-resolution colour + zone maps of the whole world, built on first use
  _map() {
    if (!this.map) {
      const sc = this.scene;
      this.map = new GroundMap({ X0: -46, X1: 46, Y0: -36, Y1: 38 }, 4).build(
        (g) => paintMask1(g, sc), (g) => paintMask2(g, sc), (g, m) => paintTone(g, m, sc), warpMasks);
    }
    return this.map;
  }
  _petals(x, y) {
    let k = 0;
    for (const t of this.blossoms) {
      const dx = (x - t.x - 0.5) / (2.4 * t.s), dy = (y - t.z * SQ - 0.2) / (1.3 * t.s);
      const d = dx * dx + dy * dy;
      if (d < 1) k = Math.max(k, 1 - d);
    }
    return k;
  }

  paintGround(ctx, X0, Y0, X1, Y1, px, opts = {}) {
    const map = this._map();
    map.blit(ctx, X0, Y0, X1, Y1);
    if (opts.coarse) return;             // low-res overview: colour only
    const items = [];
    paintGrass(ctx, X0, Y0, X1, Y1, px, map);
    for (const m of this.scene.mulch) {
      if (m.x1 < X0 - 0.3 || m.x0 > X1 + 0.3 || m.z1 * SQ < Y0 - 0.3 || m.z0 * SQ > Y1 + 0.3) continue;
      paintMulch(ctx, px, m);
      // long grass leaning over the edge of the plot
      for (let x = m.x0 + 0.2; x < m.x1 - 0.1; x += 0.55) for (const [z, dz] of [[m.z0, -0.02], [m.z1, 0.03]]) {
        const h = hash2(Math.round(x * 10), Math.round(z * 10), 5);
        if (h < 0.55) items.push({ y: (z + dz) * SQ, x: x + h * 0.3, k: h < 0.2 ? 'edge' : 'tuft', v: Math.floor(h * 60), f: h < 0.3 });
      }
    }
    paintPaths(ctx, X0, Y0, X1, Y1, px, map, items);
    const P = POND;
    if (X1 > P.x - P.rx - 1.5 && X0 < P.x + P.rx + 1.5 && Y1 > (P.z - P.rz - 1.5) * SQ && Y0 < (P.z + P.rz + 1.5) * SQ) paintPond(ctx, px, P);
    lawnDetails(X0, Y0, X1, Y1, px, map, items, { petals: (x, y) => this._petals(x, y) });
    stampItems(ctx, items, px);
  }
  // in idle frames, paint the ground stamps of this zoom and the next zoom steps up and down, a little at a time,
  // so the first tile at a new zoom level doesn't have to paint them
  _warm() {
    const r = stampRes(this.stage.target.ppu * Math.min(this.stage._dpr || 1, 1.5));
    if (r === this._warmed || this.stage.ground.want?.length) return;
    for (const k of WARM_STEPS) {
      const rr = r * k;
      if (rr < 16 || rr > 256) continue;
      warmTerrain(rr);
      if (!warmStep(rr, 1.2)) return;
    }
    this._warmed = r;
  }

  // ------------------------------------------------------------------------------------------ per-frame layers
  update(dt, time) {
    this.time = time;
    this.weather.update(dt, time);
    this.life.update(dt, time);
    if (this.map) this._warm();
    // blossom trees shed a petal now and then
    if (this.fx) {
      const v = this.stage.view(2);
      for (const p of this.blossoms) {
        if (p.x < v.X0 || p.x > v.X1 || p.z * SQ < v.Y0 - 3 || p.z * SQ > v.Y1 + 3) continue;
        if (Math.random() < dt * 0.9 * (this.q.ambient ?? 1)) this.fx.drift(p.x + (Math.random() - 0.5) * 3 * p.s, 3.2 * p.s, p.z + (Math.random() - 0.3) * 1.2, Math.random() < 0.6 ? '#ffc4dc' : '#ffffff');
      }
    }
    this.decor.update(dt, time);
    for (const k of this.koi) k.a += k.sp * dt;
    if (Math.random() < dt * 0.8) this.ripples.push({ x: (Math.random() - 0.5) * POND.rx * 1.2, z: (Math.random() - 0.5) * POND.rz * 1.1, t: 0 });
    if (this.weather.k.rain > 0.3 && Math.random() < dt * 12 * this.weather.k.rain) this.ripples.push({ x: (Math.random() - 0.5) * POND.rx * 1.6, z: (Math.random() - 0.5) * POND.rz * 1.5, t: 0, small: true });
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < (r.small ? 0.8 : 2.2));
  }

  // animated water: koi under the surface, lily pads on it, ripples and glints
  ground(ctx, s, time) {
    const ppu = s.cam.ppu, cx = s.sx(POND.x), cy = s.sy(POND.z * SQ);
    const vw = s.view(3);
    if (POND.x + POND.rx < vw.X0 || POND.x - POND.rx > vw.X1 || (POND.z + POND.rz) * SQ < vw.Y0 || (POND.z - POND.rz) * SQ > vw.Y1) return;
    ctx.save();
    ctx.beginPath(); smoothClosed(ctx, this.pond.map(([x, y]) => [cx + x * ppu, cy + y * ppu]));
    ctx.clip();
    for (const k of this.koi) {
      const x = Math.cos(k.a) * k.r * 1.3, z = Math.sin(k.a) * k.r * 0.8;
      const dir = Math.atan2(Math.cos(k.a) * 0.8 * Math.sign(k.sp) * SQ, -Math.sin(k.a) * 1.3 * Math.sign(k.sp));
      drawSprite(ctx, this.sprite('koi', { v: k.v, seed: k.v }, s.resFor(0.6)), cx + x * ppu, cy + z * SQ * ppu, ppu * 0.6, 1, 1, dir, 0.7);
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
    // lily pads float over the fish, bobbing very slightly
    const lres = s.resFor(1);
    for (const l of this.lilies) {
      const bob = Math.sin(time * 0.9 + l.seed) * 0.012;
      drawSprite(ctx, this.sprite('lily', l, lres), cx + l.x * ppu, cy + (l.z * SQ + bob) * ppu, ppu);
    }
    this.life.water(ctx, s, time);
  }
  particles(ctx, s, time) { this.life.particles(ctx, s, time); }

  collect(list, s) {
    this.life.collect(list, s);
    const v = s.view(5);
    for (const p of this.props) {
      const Y = p.z * SQ;
      if (p.x < v.X0 || p.x > v.X1 || Y < v.Y0 || Y > v.Y1 + 4.5) continue;
      list.push(p);
    }
    this.decor.collect(list, s);
  }

  overlay(ctx, s, time) { this.life.shadows(ctx, s, time); this.weather.overlay(ctx, s, time); }
  glow(ctx, s, time) {
    const night = this.weather.k.night;
    this.decor.glow(ctx, s, time, night);
    if (night > 0.05) {
      // the lamp by the lane and the jetty lantern: a warm halo and a pool of light on the ground
      const ppu = s.cam.ppu, v = s.view(3);
      ctx.globalCompositeOperation = 'lighter';
      for (const L of this.lights) {
        if (L.x < v.X0 || L.x > v.X1 || L.z * SQ < v.Y0 || L.z * SQ > v.Y1 + 3) continue;
        const f = 0.9 + 0.1 * Math.sin(time * 2.3 + L.x);
        drawSprite(ctx, this.glowSpr(s, L.c), s.sx(L.x), s.sy(L.z * SQ + 0.1), ppu * L.r * 1.3, 1, 0.45, 0, night * 0.35);
        drawSprite(ctx, this.glowSpr(s, L.c), s.sx(L.x), s.sy(L.z * SQ - L.y * HY), ppu * L.r, 1, 1, 0, night * 0.85 * f);
      }
      // moonlight on the pond
      const P = POND;
      if (P.x > v.X0 && P.x < v.X1 + 3) {
        drawSprite(ctx, this.glowSpr(s, '#bcd4ff'), s.sx(P.x - 0.5), s.sy(P.z * SQ - 0.15), ppu * 1.1, 1.3, 0.3, 0, night * 0.4);
        ctx.strokeStyle = `rgba(230,240,255,${0.5 * night})`; ctx.lineWidth = Math.max(1, ppu * 0.02);
        for (let i = 0; i < 4; i++) {
          const x = P.x - 0.9 + i * 0.35 + Math.sin(time * 0.8 + i) * 0.05, y = P.z * SQ - 0.3 + i * 0.07, l = 0.25 - i * 0.03;
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 1.7 + i * 2);
          ctx.beginPath(); ctx.moveTo(s.sx(x - l), s.sy(y)); ctx.lineTo(s.sx(x + l), s.sy(y)); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    this.weather.glow(ctx, s, time);
  }
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
    const it = { id, x: spot.x, z: spot.z, k: animate ? -0.9 : 1, sortY: spot.z * SQ, position: { x: spot.x, y: 0, z: spot.z }, draw: null };
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
    if (it.k <= 0) return;                  // waiting for the camera to arrive
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
        drawSprite(ctx, this.w.glowSpr(s, c), X + x * ppu, Y + y * ppu, ppu * 0.75, 1, 1, 0, night * (0.5 + 0.08 * Math.sin(time * 3 + x * 5)));
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

// shop thumbnail of a decoration, painted by the same code as the garden (framed as before the in-world boxes
// grew room for their shadows)
const THUMB = {
  birdbath: [1.8, 1.4, 0.8, 1.2], bench: [2.4, 1.3, 1.1, 1.1], arch: [2.6, 3.1, 1.25, 2.95], lanterns: [3.2, 2.5, 1.5, 2.3],
  fountain: [2.8, 2.0, 1.3, 1.8], gazebo: [3.8, 4.0, 1.8, 3.75], greenhouse: [3.6, 2.7, 1.45, 2.5], statue: [1.8, 2.2, 0.8, 2.0],
  rainbow: [3.8, 1.9, 1.9, 1.6], gnome: [0.9, 1.15, 0.42, 1.08],
};
export function decorThumbURL(id, size) {
  if (!PAINT[id]) return null;
  if (id === 'windmill') {
    return decorURL(id, size, (ctx, px) => { PAINT.windmill(ctx, px); ctx.save(); ctx.translate(D.WINDMILL_HUB[0], D.WINDMILL_HUB[1]); ctx.rotate(0.35); PAINT.sails(ctx, px); ctx.restore(); }, [3.0, 4.3, 1.5, 4.05]);
  }
  return decorURL(id, size, (ctx, px) => PAINT[id](ctx, px, { seed: 1 }), THUMB[id] || BOX[id]());
}
