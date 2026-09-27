// Procedural textures, painted into canvases at load time (nothing is downloaded). All tile seamlessly.
import * as THREE from 'three';
import { rng } from '../core/math.js';

// ---- tileable value noise ----------------------------------------------------------------------------------
function makeNoise(seed, period) {
  const R = rng(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = R();
  const at = (x, y) => g[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
// fractal noise tiling over a canvas of `size` px: base cell count `cells` must divide into the period
function fbm(noises, x, y, size, cells) {
  let v = 0, amp = 0.5, f = cells / size;
  for (let o = 0; o < noises.length; o++) { v += noises[o](x * f, y * f) * amp; amp *= 0.5; f *= 2; }
  return v;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTexture(cv, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- wood planks: warm honey wood with flowing grain and a few knots ----------------------------------------
export function woodTexture() {
  const W = 256, H = 128, cv = canvas(W, H), g = cv.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const n1 = makeNoise(11, 8), n2 = makeNoise(12, 16), n3 = makeNoise(13, 32);
  const knots = [[60, 40, 9], [190, 90, 7], [128, 20, 5]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // grain runs along x; warp it with noise and around knots
      let warp = fbm([n1, n2], x, y, W, 8) * 18;
      for (const [kx, ky, kr] of knots) {
        const dx = x - kx, dy = (y - ky) * 2.2, dd = Math.sqrt(dx * dx + dy * dy);
        warp += (kr * 9) / (dd + kr) * Math.sign(dy || 1);
      }
      const grain = Math.sin((y + warp) * 0.62) * 0.5 + 0.5;
      const fine = fbm([n2, n3], x * 4, y, W, 16);
      let t = 0.55 + 0.28 * Math.pow(grain, 3) + 0.25 * (fine - 0.5);
      for (const [kx, ky, kr] of knots) { const dx = x - kx, dy = (y - ky) * 2.2; const dd = Math.sqrt(dx * dx + dy * dy); if (dd < kr) t -= 0.35 * (1 - dd / kr); }
      t = clamp01(t);
      const i = (y * W + x) * 4;
      d[i] = mix(150, 236, t); d[i + 1] = mix(92, 178, t); d[i + 2] = mix(48, 108, t); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(cv);
}

// ---- rich garden soil: clumps with light/shadow, pebbles, rootlets ------------------------------------------
export function soilTexture() {
  const S = 256, cv = canvas(S, S), g = cv.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const n1 = makeNoise(21, 8), n2 = makeNoise(22, 16), n3 = makeNoise(23, 32);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm([n1, n2, n3], x, y, S, 8);
      const t = clamp01(0.35 + (v - 0.5) * 1.3);
      const i = (y * S + x) * 4;
      d[i] = mix(58, 118, t); d[i + 1] = mix(36, 80, t); d[i + 2] = mix(24, 52, t); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const R = rng(24);
  const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };
  // clumps: lit top-left, shaded bottom-right
  for (let k = 0; k < 520; k++) {
    const x = R() * S, y = R() * S, r = 1.5 + R() * 4.5;
    wrap((ox, oy) => {
      const gr = g.createRadialGradient(x + ox - r * 0.35, y + oy - r * 0.35, r * 0.1, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(150,108,72,${0.55 + R() * 0.3})`);
      gr.addColorStop(0.7, 'rgba(90,60,38,0.5)');
      gr.addColorStop(1, 'rgba(40,24,14,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
    });
  }
  // little pebbles
  for (let k = 0; k < 34; k++) {
    const x = R() * S, y = R() * S, r = 0.8 + R() * 1.6, c = 120 + R() * 50;
    wrap((ox, oy) => {
      g.fillStyle = `rgb(${c},${c * 0.95},${c * 0.88})`;
      g.beginPath(); g.ellipse(x + ox, y + oy, r * 1.2, r, R() * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(x + ox - r * 0.3, y + oy - r * 0.3, r * 0.4, 0, Math.PI * 2); g.fill();
    });
  }
  // rootlets
  g.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = R() * S, y = R() * S, a = R() * 6.28;
    g.strokeStyle = `rgba(170,130,90,${0.25 + R() * 0.25})`; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { a += (R() - 0.5) * 1.2; x += Math.cos(a) * 4; y += Math.sin(a) * 4; g.lineTo(x, y); }
    g.stroke();
  }
  return toTexture(cv);
}

// ---- lawn ground under the grass blades: mottled greens, clover patches, a few sun-dried spots ---------------
export function lawnTexture() {
  const S = 512, cv = canvas(S, S), g = cv.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const n1 = makeNoise(31, 4), n2 = makeNoise(32, 8), n3 = makeNoise(33, 16), n4 = makeNoise(34, 128);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm([n1, n2, n3], x, y, S, 4);
      const fine = n4((x / S) * 128, (y / S) * 128);
      const t = clamp01(0.5 + (v - 0.5) * 1.6);
      const dry = clamp01((n2((x / S) * 8 + 3.3, (y / S) * 8 + 1.7) - 0.72) * 5);
      let r = mix(66, 118, t), gg = mix(118, 170, t), b = mix(40, 62, t);
      r = mix(r, 168, dry * 0.5); gg = mix(gg, 170, dry * 0.4); b = mix(b, 80, dry * 0.4);
      const f = 0.85 + fine * 0.3;
      const i = (y * S + x) * 4;
      d[i] = r * f; d[i + 1] = gg * f; d[i + 2] = b * f; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // clover leaves
  const R = rng(35);
  for (let k = 0; k < 420; k++) {
    const x = R() * S, y = R() * S, r = 1.6 + R() * 1.6;
    g.fillStyle = `rgba(${40 + R() * 20},${110 + R() * 40},${40 + R() * 20},0.55)`;
    for (let l = 0; l < 3; l++) { const a = (l / 3) * Math.PI * 2 + R(); g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r, 0, Math.PI * 2); g.fill(); }
  }
  return toTexture(cv);
}

// ---- bark: vertical fissures ----------------------------------------------------------------------------------
export function barkTexture() {
  const W = 128, H = 256, cv = canvas(W, H), g = cv.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const n1 = makeNoise(41, 8), n2 = makeNoise(42, 16);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const warp = fbm([n1, n2], x, y, W, 8) * 20;
      const f = Math.abs(Math.sin(((x + warp) / W) * Math.PI * 7));
      const t = clamp01(0.25 + Math.pow(f, 0.6) * 0.7 + (n2(x * 0.3, y * 0.1) - 0.5) * 0.2);
      const i = (y * W + x) * 4;
      d[i] = mix(56, 150, t); d[i + 1] = mix(36, 104, t); d[i + 2] = mix(26, 70, t); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(cv);
}

// ---- stone: speckled light rock ------------------------------------------------------------------------------
export function stoneTexture() {
  const S = 256, cv = canvas(S, S), g = cv.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const n1 = makeNoise(51, 8), n2 = makeNoise(52, 16), n3 = makeNoise(53, 128);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm([n1, n2], x, y, S, 8), s = n3((x / S) * 128, (y / S) * 128);
      const t = clamp01(0.55 + (v - 0.5) * 0.9 + (s > 0.8 ? -0.25 : s < 0.12 ? 0.15 : 0));
      const i = (y * S + x) * 4;
      d[i] = mix(120, 222, t); d[i + 1] = mix(116, 214, t); d[i + 2] = mix(108, 200, t); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(cv);
}

// ---- earth strata for the island's sides -----------------------------------------------------------------------
export function strataTexture() {
  const W = 512, H = 256, cv = canvas(W, H), g = cv.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const n1 = makeNoise(61, 8), n2 = makeNoise(62, 16);
  const bands = [[0, [96, 150, 58]], [0.07, [110, 76, 46]], [0.3, [132, 92, 58]], [0.5, [116, 80, 52]], [0.72, [150, 118, 86]], [1, [120, 96, 74]]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const warp = (fbm([n1, n2], x, y, W, 8) - 0.5) * 0.14;
      const t = clamp01(y / H + warp);
      let k = 0; while (k < bands.length - 2 && t > bands[k + 1][0]) k++;
      const [t0, c0] = bands[k], [t1, c1] = bands[k + 1];
      const u = clamp01((t - t0) / (t1 - t0));
      const s = 0.85 + n2((x / W) * 16, (y / H) * 16) * 0.3;
      const i = (y * W + x) * 4;
      d[i] = mix(c0[0], c1[0], u) * s; d[i + 1] = mix(c0[1], c1[1], u) * s; d[i + 2] = mix(c0[2], c1[2], u) * s; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // embedded stones
  const R = rng(63);
  for (let k = 0; k < 70; k++) {
    const x = R() * W, y = H * (0.2 + R() * 0.75), r = 2 + R() * 6, c = 150 + R() * 70;
    g.fillStyle = `rgb(${c},${c * 0.96},${c * 0.9})`;
    g.beginPath(); g.ellipse(x, y, r * 1.4, r, R() * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x + r * 0.2, y + r * 0.35, r * 1.2, r * 0.6, 0, 0, Math.PI * 2); g.fill();
  }
  const t = toTexture(cv);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---- soft cloud puff sprite (alpha) ---------------------------------------------------------------------------
export function cloudTexture() {
  const W = 256, H = 128, cv = canvas(W, H), g = cv.getContext('2d');
  const R = rng(71);
  for (let k = 0; k < 28; k++) {
    const x = 40 + R() * 176, y = 50 + R() * 40 - Math.sin(((x - 40) / 176) * Math.PI) * 22, r = 18 + R() * 26;
    const gr = g.createRadialGradient(x, y - r * 0.2, r * 0.2, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.6, 'rgba(250,252,255,0.75)');
    gr.addColorStop(1, 'rgba(235,242,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // soft blue-grey underside
  const sh = g.createLinearGradient(0, 70, 0, 128);
  sh.addColorStop(0, 'rgba(180,200,230,0)'); sh.addColorStop(1, 'rgba(170,190,225,0.55)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  return toTexture(cv, { repeat: false });
}

// ---- radial blob for contact shadows ---------------------------------------------------------------------------
export function blobTexture() {
  const S = 64, cv = canvas(S, S), g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return toTexture(cv, { repeat: false, srgb: false });
}

// ---- straw (hive) ----------------------------------------------------------------------------------------------
export function strawTexture() {
  const W = 256, H = 64, cv = canvas(W, H), g = cv.getContext('2d');
  g.fillStyle = '#e8b457'; g.fillRect(0, 0, W, H);
  const R = rng(81);
  for (let k = 0; k < 900; k++) {
    const x = R() * W, y = R() * H, l = 6 + R() * 18, v = R();
    g.strokeStyle = v < 0.5 ? `rgba(170,110,30,${0.35 + R() * 0.3})` : `rgba(255,225,150,${0.35 + R() * 0.35})`;
    g.lineWidth = 0.8 + R() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (R() - 0.5) * 2); g.stroke();
  }
  return toTexture(cv);
}
