// Art lab: renders showcase sheets of the illustrated assets for visual iteration (tools/lab.mjs).
import { headSprite, budSprite, leafSprite, paintHead, paintTulip, paintBud, paintLeaf } from './flowers.js';
import { drawSprite } from './paint.js';
import { paintGrass } from './lawn.js';
import { planterSprite, saleSprite, glowSprite, wetSprite, SOIL_Y } from './planter.js';
import { SQ, HY } from './view3q.js';
import { hexToWorld, shapeHexagon } from '../game/hex.js';
import * as N from './nature.js';
import * as B from './built.js';
import * as S from './scenery.js';
import { iconURL, visitorURL } from './uiart.js';
import { decorThumbURL } from './world.js';

const params = new URLSearchParams(location.search);
const scene = params.get('scene') || 'flowers';
const W = +(params.get('w') || 1600), H = +(params.get('h') || 1000);
const cv = document.createElement('canvas');
cv.width = W; cv.height = H;
document.body.appendChild(cv);
const ctx = cv.getContext('2d');
ctx.lineJoin = 'round'; ctx.lineCap = 'round';

const scenes = {
  flowers() {
    ctx.fillStyle = '#86c95f'; ctx.fillRect(0, 0, W, H);
    const cell = 96, ppu = 34;
    for (let s = 0; s < 8; s++) for (let c = 0; c < 16; c++) {
      const g = { c1: c, c2: 3, shape: s, pattern: 0, mut: 0 };
      drawSprite(ctx, headSprite(g, ppu), 50 + c * cell, 60 + s * 110, ppu);
    }
  },
  variants() {
    ctx.fillStyle = '#86c95f'; ctx.fillRect(0, 0, W, H);
    const ppu = 56;
    const rows = [];
    for (let s = 0; s < 8; s++) rows.push([0, 1, 2, 3, 4].map((p) => ({ c1: [0, 2, 6, 7, 12, 13, 8, 4][s], c2: [3, 3, 3, 13, 3, 9, 2, 3][s], shape: s, pattern: p, mut: 0 })).concat([1, 2, 3, 4, 5].map((m) => ({ c1: [0, 2, 6, 7, 12, 13, 8, 4][s], c2: 3, shape: s, pattern: 0, mut: m }))));
    rows.forEach((r, y) => r.forEach((g, x) => drawSprite(ctx, headSprite(g, ppu), 80 + x * 150, 70 + y * 118, ppu * 0.8)));
  },
  big() {
    ctx.fillStyle = '#8bd06a'; ctx.fillRect(0, 0, W, H);
    const ppu = 150;
    const list = [{ c1: 0, shape: 0 }, { c1: 1, shape: 1 }, { c1: 7, shape: 2 }, { c1: 2, shape: 3 }, { c1: 13, shape: 4 }, { c1: 6, shape: 5 }, { c1: 7, shape: 6 }, { c1: 12, shape: 7 }];
    list.forEach((g, i) => drawSprite(ctx, headSprite({ c2: 3, pattern: 0, mut: 0, ...g }, ppu), 200 + (i % 4) * 380, 250 + Math.floor(i / 4) * 450, ppu));
    for (let k = 0; k < 3; k++) drawSprite(ctx, budSprite({ c1: 0 }, k, 120), 1400 + k * 60, 950, 120 * 0.5);
    for (let v = 0; v < 3; v++) drawSprite(ctx, leafSprite(v, 150), 60 + v * 70, 980, 150 * 0.5);
  },
};
scenes.garden = () => {
  const ppu = +(params.get('ppu') || 72), dpr = 1;
  const cx = W / 2, cy = H / 2 + 40;
  ctx.save();
  ctx.setTransform(ppu, 0, 0, ppu, cx, cy);
  const px = 1 / ppu;
  const t0 = performance.now();
  ctx.fillStyle = '#7cc458'; ctx.fillRect(-cx / ppu, -cy / ppu, W / ppu, H / ppu);
  paintGrass(ctx, -cx / ppu, -cy / ppu, (W - cx) / ppu, (H - cy) / ppu, px, { s: () => 0 });
  console.log('lawn ms', performance.now() - t0);
  ctx.restore();
  const res = Math.round(ppu * dpr);
  const HR = 0.5, STEM = 0.62;
  const cellsAll = shapeHexagon(2);
  const genes = [
    { c1: 0, shape: 0 }, { c1: 2, shape: 0 }, { c1: 6, shape: 3 }, { c1: 1, shape: 1 }, { c1: 7, shape: 2 }, { c1: 13, shape: 4 }, { c1: 12, shape: 7 },
    { c1: 6, shape: 5 }, { c1: 3, shape: 6 }, { c1: 4, shape: 1 }, { c1: 8, shape: 0 }, { c1: 11, shape: 3 },
  ];
  const list = cellsAll.map((c, i) => { const w = hexToWorld(c.q, c.r, 1); return { ...c, x: w.x, z: w.z, owned: Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(-c.q - c.r)) <= 1 || i % 3 === 0, i }; });
  list.sort((a, b) => a.z - b.z);
  const sx = (x) => cx + x * ppu, sy = (z, y = 0) => cy + (z * SQ - y * HY) * ppu;
  let n = 0;
  for (const p of list) if (!p.owned) drawSprite(ctx, saleSprite(res), sx(p.x), sy(p.z), ppu);
  for (const p of list) {
    if (!p.owned) continue;
    drawSprite(ctx, planterSprite(p.i % 3, res), sx(p.x), sy(p.z), ppu);
    if (p.i === 4) drawSprite(ctx, wetSprite(res), sx(p.x), sy(p.z), ppu);
    const g = { c2: 3, pattern: n % 5 === 3 ? 2 : 0, mut: n === 6 ? 3 : 0, ...genes[n % genes.length] };
    n++;
    if (n === 5) { drawSprite(ctx, glowSprite(res), sx(p.x), sy(p.z), ppu); continue; }
    const bx = sx(p.x), by = sy(p.z, SOIL_Y);
    // leaves
    drawSprite(ctx, leafSprite(n % 3, Math.round(res * 0.42)), bx - 2, by, ppu * 0.42, 1, 1, -1.0);
    drawSprite(ctx, leafSprite((n + 1) % 3, Math.round(res * 0.38)), bx + 2, by, ppu * 0.38, -1, 1, 1.05);
    // stem
    const top = by - STEM * HY * ppu;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2f6b25'; ctx.lineWidth = 0.075 * ppu + 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + 4, (by + top) / 2, bx, top); ctx.stroke();
    ctx.strokeStyle = '#58b246'; ctx.lineWidth = 0.075 * ppu;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,240,150,0.7)'; ctx.lineWidth = 0.02 * ppu;
    ctx.beginPath(); ctx.moveTo(bx - 1.5, by - 3); ctx.quadraticCurveTo(bx + 2.5, (by + top) / 2, bx - 1.5, top + 4); ctx.stroke();
    const hs = g.shape === 2 ? HR * 0.85 : HR;
    drawSprite(ctx, headSprite(g, Math.round(res * hs)), bx, top, ppu * hs);
  }
};
scenes.props = () => {
  ctx.fillStyle = '#7cc458'; ctx.fillRect(0, 0, W, H);
  const ppu = +(params.get('ppu') || 80);
  const at = (x, y, fn) => { ctx.save(); ctx.setTransform(ppu, 0, 0, ppu, x, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; fn(ctx, 1 / ppu); ctx.restore(); };
  at(170, 520, (c, px) => N.paintTree(c, px, 3, 'leafy'));
  at(480, 520, (c, px) => N.paintTree(c, px, 5, 'blossom'));
  at(790, 520, (c, px) => N.paintTree(c, px, 8, 'apple'));
  at(1080, 520, (c, px) => N.paintFir(c, px, 2));
  at(1380, 520, (c, px) => N.paintTree(c, px, 9, 'autumn', 0.8));
  at(140, 800, (c, px) => N.paintBush(c, px, 1, 'green'));
  at(360, 800, (c, px) => N.paintBush(c, px, 2, 'flowers', 1, '#ffffff'));
  at(580, 800, (c, px) => N.paintBush(c, px, 3, 'berries'));
  at(800, 800, (c, px) => N.paintBush(c, px, 4, 'hydrangea', 1.1, '#8fb6ff'));
  at(1010, 800, (c, px) => N.paintLavender(c, px, 5));
  at(1200, 800, (c, px) => N.paintRock(c, px, 6));
  at(1380, 800, (c, px) => N.paintMushrooms(c, px, 7, 1.2));
  at(1520, 800, (c, px) => N.paintReeds(c, px, 8));
  at(200, 960, (c, px) => N.paintLog(c, px, 9));
  at(480, 960, (c, px) => N.paintFlowerClump(c, px, 10));
  at(700, 960, (c, px) => N.paintTallGrass(c, px, 11));
  at(900, 960, (c, px) => N.paintFlowerClump(c, px, 12, 1, ['#8f6bff', '#ffffff', '#4fb5ff']));
};
scenes.built = () => {
  ctx.fillStyle = '#7cc458'; ctx.fillRect(0, 0, W, H);
  const ppu = +(params.get('ppu') || 90);
  const at = (x, y, fn) => { ctx.save(); ctx.setTransform(ppu, 0, 0, ppu, x, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; fn(ctx, 1 / ppu); ctx.restore(); };
  at(180, 420, (c, px) => B.paintHive(c, px));
  at(420, 420, (c, px) => B.paintFence(c, px, 3));
  at(1000, 420, (c, px) => B.paintShed(c, px));
  at(1350, 420, (c, px) => N.paintTree(c, px, 3, 'leafy', 0.9));
  at(150, 800, (c, px) => B.paintWheelbarrow(c, px));
  at(380, 800, (c, px) => B.paintWateringCan(c, px));
  at(560, 800, (c, px) => B.paintPot(c, px, 1));
  at(700, 800, (c, px) => B.paintPot(c, px, 2, '#ffd23f'));
  at(900, 800, (c, px) => B.paintStone(c, px, 3));
  at(1060, 800, (c, px) => B.paintStone(c, px, 4, 0.8));
  at(1250, 800, (c, px) => B.paintSign(c, px));
};
scenes.scenery = () => {
  ctx.fillStyle = '#7cc458'; ctx.fillRect(0, 0, W, H);
  const ppu = +(params.get('ppu') || 80);
  const at = (x, y, fn) => { ctx.save(); ctx.setTransform(ppu, 0, 0, ppu, x, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; fn(ctx, 1 / ppu); ctx.restore(); };
  at(40, 250, (c, px) => { B.paintFence(c, px, 2.2, 3); });
  at(40, 290, (c, px) => S.paintBorder(c, px, 5, 2.4));
  at(260, 290, (c, px) => S.paintBorder(c, px, 11, 2.4));
  at(480, 290, (c, px) => S.paintWall(c, px, 7, 2.6));
  at(720, 260, (c, px) => S.paintPillar(c, px));
  at(800, 290, (c, px) => S.paintGatePost(c, px));
  at(900, 290, (c, px) => S.paintGateLeaf(c, px));
  at(980, 290, (c, px) => S.paintHedge(c, px, 3, 2.2));
  at(1260, 290, (c, px) => S.paintHedgeZ(c, px, 4, 2.2));
  at(1380, 290, (c, px) => S.paintTopiary(c, px, 5));
  at(1560, 290, (c, px) => S.paintJetty(c, px));
  at(60, 560, (c, px) => S.paintIris(c, px, 3));
  at(160, 560, (c, px) => S.paintLamp(c, px));
  at(240, 560, (c, px) => S.paintVegBed(c, px, 1, 0));
  at(440, 560, (c, px) => S.paintVegBed(c, px, 2, 1));
  at(640, 560, (c, px) => S.paintVegBed(c, px, 3, 2));
  at(840, 560, (c, px) => S.paintVegBed(c, px, 4, 3));
  at(1080, 560, (c, px) => S.paintScarecrow(c, px));
  at(1200, 560, (c, px) => S.paintPumpkins(c, px, 3));
  at(1330, 560, (c, px) => S.paintSunflowers(c, px, 4));
  at(1460, 560, (c, px) => S.paintWaterButt(c, px));
  at(1540, 560, (c, px) => S.paintPotStack(c, px, 2));
  at(200, 900, (c, px) => S.paintWillow(c, px, 3));
  at(420, 900, (c, px) => S.paintLogPile(c, px, 1));
  at(560, 900, (c, px) => S.paintFern(c, px, 2));
  at(660, 900, (c, px) => S.paintFoxgloves(c, px, 3));
  at(760, 900, (c, px) => S.paintMeadowTuft(c, px, 4));
  at(860, 900, (c, px) => S.paintMeadowTuft(c, px, 9, 0.8));
  at(960, 900, (c, px) => N.paintTallGrass(c, px, 11));
  at(1060, 900, (c, px) => N.paintFlowerClump(c, px, 10));
};
scenes.ui = async () => {
  ctx.fillStyle = '#fff4dc'; ctx.fillRect(0, 0, W, H);
  const load = (url) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = url; });
  const names = ['coin', 'basket', 'book', 'gear', 'can', 'shovel', 'gift', 'trophy', 'star', 'bee', 'seed', 'sun', 'rain', 'golden', 'night', 'rainbow', 'target', 'lock', 'clock', 'up_bees', 'up_fert', 'up_market', 'up_wings', 'up_pouch', 'up_gnome'];
  let i = 0;
  for (const n of names) { const im = await load(iconURL(n, 72)); ctx.drawImage(im, 20 + (i % 13) * 92, 20 + Math.floor(i / 13) * 92, 72, 72); i++; }
  // small sizes
  i = 0;
  for (const n of names.slice(0, 13)) { const im = await load(iconURL(n, 24)); ctx.drawImage(im, 20 + i * 40, 215, 24, 24); i++; }
  const vis = [['bunny', '#f3d9c9'], ['fox', '#ff9a4d'], ['hedgehog', '#b88a63'], ['frog', '#7ccc5c'], ['duck', '#ffe06a'], ['cat', '#c9c3d9'], ['bear', '#a6764f'], ['owl', '#b59a7a'], ['queen', '#ffc928']];
  i = 0;
  for (const [k, c] of vis) { const im = await load(visitorURL(k, c, 96)); ctx.drawImage(im, 20 + i * 110, 270, 96, 96); i++; }
  const dec = ['birdbath', 'bench', 'arch', 'lanterns', 'windmill', 'fountain', 'gazebo', 'greenhouse', 'statue', 'rainbow'];
  i = 0;
  for (const d of dec) { const im = await load(decorThumbURL(d, 110)); ctx.fillStyle = '#ffffff'; ctx.fillRect(20 + i * 125, 400, 110, 110); ctx.drawImage(im, 20 + i * 125, 400, 110, 110); i++; }
};
(async () => { await (scenes[scene] || scenes.flowers)(); window.__labDone = true; })();
