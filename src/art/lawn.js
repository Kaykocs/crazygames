// The lawn, painted in layers into the cached ground tiles:
//  1. a world-aligned tone map (painted once at a few pixels per unit and upscaled into every tile): soft
//     painterly colour patches, mown stripes, warm meadows, cool tree shade, worn earth, damp pond margins;
//  2. zone masks sampled per detail (no grass on paths / water, meadow vs mown lawn, shade under trees);
//  3. stamped texture: fine grain and little grass marks that cluster into sunlit and shaded patches;
//  4. details in drifts: clover patches, daisies, buttercups, dandelions, violets, pebbles, fallen leaves and
//     petals, moss, toadstools, wildflowers and long grass in the meadows.
// Everything is seeded by world cell, so any tile at any zoom repaints exactly the same lawn.
import { hash2, noise2 } from './paint.js';
import { put, stampCount } from './stamps.js';

export const LAWN = {
  base: '#7cc458',
  patches: ['#96d36a', '#69b04b', '#a8cf62', '#6fbd63', '#8acb5f'],
};

// ------------------------------------------------------------------------------------------ ground map
// Low-resolution maps of the whole world in screen-space units (X = x, Y = z·SQ):
//   tone  – colour canvas blitted under every tile
//   mask  – per-pixel channels: [hard (no grass), wild (0 mown … 1 meadow), shade, woods]
export class GroundMap {
  constructor(bounds, res) {
    this.b = bounds; this.res = res;
    this.w = Math.ceil((bounds.X1 - bounds.X0) * res); this.h = Math.ceil((bounds.Y1 - bounds.Y0) * res);
    this.tone = null; this.m1 = null; this.m2 = null;
  }
  canvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    g.setTransform(this.res, 0, 0, this.res, -this.b.X0 * this.res, -this.b.Y0 * this.res);
    g.lineJoin = 'round'; g.lineCap = 'round';
    return { c, g };
  }
  // paintMask1(g) draws R = hard, G = wild, B = shade; paintMask2(g): R = woods, G = damp, B = worn;
  // paintTone(g, map) draws the colour map (may sample the masks)
  build(paintMask1, paintMask2, paintTone, warp) {
    const a = this.canvas(); a.g.fillStyle = '#000'; a.g.fillRect(this.b.X0, this.b.Y0, this.b.X1 - this.b.X0, this.b.Y1 - this.b.Y0);
    a.g.globalCompositeOperation = 'lighter'; paintMask1(a.g); this.m1 = a.g.getImageData(0, 0, this.w, this.h).data;
    const b = this.canvas(); b.g.fillStyle = '#000'; b.g.fillRect(this.b.X0, this.b.Y0, this.b.X1 - this.b.X0, this.b.Y1 - this.b.Y0);
    b.g.globalCompositeOperation = 'lighter'; paintMask2(b.g); this.m2 = b.g.getImageData(0, 0, this.w, this.h).data;
    warp?.(this);
    const t = this.canvas(); paintTone(t.g, this); this.tone = t.c;
    return this;
  }
  // world position of mask pixel (i, j)
  px2w(i, j) { return [this.b.X0 + (i + 0.5) / this.res, this.b.Y0 + (j + 0.5) / this.res]; }
  // bilinear sample of a mask channel (0..1); m: 1 or 2, ch: 0..2
  s(m, ch, X, Y) {
    const d = m === 1 ? this.m1 : this.m2;
    let fx = (X - this.b.X0) * this.res - 0.5, fy = (Y - this.b.Y0) * this.res - 0.5;
    if (fx < 0) fx = 0; else if (fx > this.w - 1.001) fx = this.w - 1.001;
    if (fy < 0) fy = 0; else if (fy > this.h - 1.001) fy = this.h - 1.001;
    const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const i = (iy * this.w + ix) * 4 + ch, W4 = this.w * 4;
    const a = d[i] + (d[i + 4] - d[i]) * tx, b = d[i + W4] + (d[i + W4 + 4] - d[i + W4]) * tx;
    return (a + (b - a) * ty) / 255;
  }
  // the tone map under a tile (with a margin so bilinear upscaling matches the neighbouring tiles exactly)
  blit(ctx, X0, Y0, X1, Y1) {
    const b = this.b, r = this.res;
    const sx0 = Math.max(0, Math.floor((X0 - b.X0) * r) - 2), sy0 = Math.max(0, Math.floor((Y0 - b.Y0) * r) - 2);
    const sx1 = Math.min(this.w, Math.ceil((X1 - b.X0) * r) + 2), sy1 = Math.min(this.h, Math.ceil((Y1 - b.Y0) * r) + 2);
    if (sx1 <= sx0 || sy1 <= sy0) return;
    ctx.drawImage(this.tone, sx0, sy0, sx1 - sx0, sy1 - sy0, b.X0 + sx0 / r, b.Y0 + sy0 / r, (sx1 - sx0) / r, (sy1 - sy0) / r);
  }
}

function cells(X0, Y0, X1, Y1, cw, ch, pad, fn) {
  const i0 = Math.floor((X0 - pad) / cw), i1 = Math.ceil((X1 + pad) / cw);
  const j0 = Math.floor((Y0 - pad) / ch), j1 = Math.ceil((Y1 + pad) / ch);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j);
}

// ------------------------------------------------------------------------------------------ texture
// fine grain + grass marks, straight into the tile (tiny, flat: no sorting needed)
export function paintGrass(ctx, X0, Y0, X1, Y1, px, map) {
  const res = 1 / px;
  if (res < 18) return;
  const nG = stampCount('grain');
  if (res >= 30) {
    cells(X0, Y0, X1, Y1, 0.62, 0.3, 0.5, (i, j) => {
      const x = (i + hash2(i, j, 101)) * 0.62, y = (j + hash2(i, j, 102)) * 0.3;
      if (map.s(1, 0, x, y) > 0.35) return;
      if (hash2(i, j, 103) > 0.72) return;
      put(ctx, 'grain', Math.floor(hash2(i, j, 104) * nG), x, y, res, hash2(i, j, 105) < 0.5);
    });
  }
  // sun flecks dappling the shade under the trees
  cells(X0, Y0, X1, Y1, 0.8, 0.5, 0.6, (i, j) => {
    const x = (i + hash2(i, j, 121)) * 0.8, y = (j + hash2(i, j, 122)) * 0.5;
    const sh = map.s(1, 2, x, y);
    if (sh < 0.3 || hash2(i, j, 123) > (sh - 0.25) * 0.9 || map.s(1, 0, x, y) > 0.5) return;
    put(ctx, 'dapple', Math.floor(hash2(i, j, 124) * 4), x, y, res, hash2(i, j, 125) < 0.5);
  });
  cells(X0, Y0, X1, Y1, 0.36, 0.22, 0.5, (i, j) => {
    const x = (i + hash2(i, j, 111)) * 0.36, y = (j + hash2(i, j, 112)) * 0.22;
    const hard = map.s(1, 0, x, y);
    if (hard > 0.3) return;
    const wild = map.s(1, 1, x, y), shade = map.s(1, 2, x, y);
    // marks gather in loose drifts with calmer lawn between them
    const dens = noise2(x * 0.42 + 3, y * 0.62, 13);
    const p = 0.08 + dens * dens * 0.62 + wild * 0.2 - hard;
    if (hash2(i, j, 113) > p) return;
    // light marks gather in sunny patches, dark marks in the hollows and in shade
    const sun = noise2(x * 0.55, y * 0.75, 7) * 0.8 + hash2(i, j, 114) * 0.4 - shade * 0.5;
    const v = Math.floor(hash2(i, j, 115) * 6) + (sun > 0.55 ? 6 : 0);
    put(ctx, 'grass', v, x, y, res, hash2(i, j, 116) < 0.5);
  });
}

// ------------------------------------------------------------------------------------------ details
// Pushes { y, k (stamp kind), v, x, f (flip) } items for the caller to sort with its own items and stamp.
export function lawnDetails(X0, Y0, X1, Y1, px, map, out, opts = {}) {
  const res = 1 / px;
  const petals = opts.petals || (() => 0);
  const tiny = res < 22;
  cells(X0, Y0, X1, Y1, 0.7, 0.42, 0.7, (i, j) => {
    const x = (i + hash2(i, j, 61)) * 0.7, y = (j + hash2(i, j, 62)) * 0.42;
    const hard = map.s(1, 0, x, y);
    if (hard > 0.25) return;
    const wild = map.s(1, 1, x, y), shade = map.s(1, 2, x, y);
    const woods = map.s(2, 0, x, y), damp = map.s(2, 1, x, y);
    const r = hash2(i, j, 63), f = hash2(i, j, 64) < 0.5, h = hash2(i, j, 65);
    // drifts: low-frequency noise decides where clover / daisies / violets gather
    const clov = noise2(x * 0.32 + 11, y * 0.45, 3), dais = noise2(x * 0.28 - 7, y * 0.4, 5), cold = noise2(x * 0.5, y * 0.6, 9);
    const push = (k, v, dx = 0, dy = 0) => out.push({ y: y + dy, x: x + dx, k, v, f });
    if (woods > 0.5) {
      // woods floor: ferns, leaf litter, moss, mushrooms
      if (r < 0.18) push('fern', Math.floor(h * 4));
      else if (r < 0.42) push('leaf', Math.floor(h * 16));
      else if (r < 0.52) push('moss', Math.floor(h * 6));
      else if (r < 0.56) push('shroom', Math.floor(h * 6));
      else if (r < 0.62) push('twig', Math.floor(h * 4));
      return;
    }
    if (wild > 0.55) {
      // meadow: long grass and wildflowers in drifts
      if (tiny && r > 0.5) return;
      const kind = Math.floor(noise2(x * 0.22, y * 0.3, 21) * 6);
      if (r < 0.34) push('meadow', Math.floor(h * 8));
      else if (r < 0.34 + 0.36 * wild) push('wild', kind + 6 * Math.floor(h * 3));
      else if (r < 0.8) push('flowers', Math.floor(h * 16));
      return;
    }
    if (tiny) { if (r < 0.1) push('daisy', Math.floor(h * 8)); return; }
    // tended lawn
    const pet = petals(x, y);
    if (pet > 0 && r < pet * 0.5) { push('petal', Math.floor(h * 8)); return; }
    if (shade > 0.35) {
      if (r < 0.2 * shade) { push('leaf', Math.floor(h * 16)); return; }
      if (r < 0.28 * shade) { push('moss', Math.floor(h * 6)); return; }
      if (r < 0.31 * shade) { push('shroom', Math.floor(h * 6)); return; }
    }
    if (damp > 0.3 && r < 0.12 * damp) { push('moss', Math.floor(h * 6)); return; }
    if (clov > 0.62 && r < (clov - 0.55) * 1.6) { push('clover', Math.floor(h * 8)); return; }
    if (dais > 0.6 && r < (dais - 0.52) * 1.1) { push('daisy', Math.floor(h * 8)); return; }
    if (r < 0.035) push('flowers', Math.floor(h * 4) * 4 + (cold > 0.55 ? 2 : cold > 0.45 ? 3 : 0));
    else if (r < 0.055) push('flowers', Math.floor(h * 4) * 4 + 1);
    else if (r < 0.075) push('pebble', Math.floor(h * 8));
    else if (r < 0.09 + wild * 0.08) push('tuft', Math.floor(h * 8));
    else if (r < 0.1) push('twig', Math.floor(h * 4));
  });
}

export function stampItems(ctx, items, px) {
  const res = 1 / px;
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.draw) it.draw(ctx, px);
    else put(ctx, it.k, it.v, it.x, it.y, res, it.f, it.s || 1);
  }
}
