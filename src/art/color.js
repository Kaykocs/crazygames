// Colour helpers for the illustrated look. Shading is hue-shifted like a painter would do it: shadows drift
// toward cool violet and gain saturation, highlights drift toward warm yellow and lose a little saturation.

const cache = new Map();

export function rgb(hex) {
  let v = cache.get(hex);
  if (v) return v;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  cache.set(hex, v);
  return v;
}

const to2 = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
export const hex = (r, g, b) => `#${to2(r)}${to2(g)}${to2(b)}`;

export function rgba(c, a = 1) {
  const [r, g, b] = rgb(c);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

export function toHsl(c) {
  let [r, g, b] = rgb(c);
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  if (s === 0) return hex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return hex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}

// rotate hue h toward target by up to `deg` degrees
function towardHue(h, target, deg) {
  let d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), deg);
}

// k in [-1, 1]: negative = shadow, positive = highlight
const shadeCache = new Map();
export function shade(c, k) {
  const ck = c + k;
  let v = shadeCache.get(ck);
  if (v) return v;
  const [h, s, l] = toHsl(c);
  if (k < 0) {
    const a = -k;
    const grey = s < 0.08;
    v = fromHsl(grey ? h : towardHue(h, 255, 34 * a), Math.min(1, s + (grey ? 0.12 * a : 0.14 * a)), l * (1 - 0.62 * a));
  } else {
    v = fromHsl(towardHue(h, 55, 18 * k), s * (1 - 0.25 * k), l + (1 - l) * 0.75 * k);
  }
  shadeCache.set(ck, v);
  return v;
}

// outline colour for a fill: a deep, muted version of itself leaning violet-brown (never pure black or neon)
const inkCache = new Map();
export function ink(c, k = 0.62) {
  const ck = c + k;
  let v = inkCache.get(ck);
  if (v) return v;
  const [h, s, l] = toHsl(c);
  const hh = s < 0.08 ? 280 : towardHue(h, 285, 22);
  v = fromHsl(hh, Math.min(0.72, s * 0.8 + 0.12), Math.max(0.1, l * (1 - k) * 0.75 + 0.06));
  inkCache.set(ck, v);
  return v;
}

export function lum(c) { const [r, g, b] = rgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
