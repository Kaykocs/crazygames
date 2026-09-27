// Inline SVG art for the UI: a procedural flower icon for every genotype, visitor portraits and UI icons.
import { COLORS, secondColor } from '../game/genetics.js';
import { flowerIconURL, seedIconURL } from '../art/flowers.js';
import { iconURL, hasPainted, visitorURL } from '../art/uiart.js';
import { ink, rgba } from '../art/color.js';
import { decorThumbURL } from '../art/world.js';

let uid = 0;
const id = (p) => `${p}${++uid}`;

// ------------------------------------------------------------------------------------------ flowers
const PETAL = {
  // top-view petal paths pointing up (−y), base at origin
  round: 'M0 -4 C 15 -8 17 -36 0 -42 C -17 -36 -15 -8 0 -4 Z',
  thin: 'M0 -6 C 5 -14 6 -38 0 -44 C -6 -38 -5 -14 0 -6 Z',
  point: 'M0 -4 C 12 -12 10 -28 0 -45 C -10 -28 -12 -12 0 -4 Z',
  heart: 'M0 -4 C 18 -10 22 -36 9 -42 C 4 -44 1 -40 0 -36 C -1 -40 -4 -44 -9 -42 C -22 -36 -18 -10 0 -4 Z',
  frill: 'M0 -4 C 12 -10 16 -30 10 -36 C 8 -41 4 -38 2 -42 C -1 -38 -5 -42 -8 -38 C -15 -32 -12 -10 0 -4 Z',
  lotus: 'M0 -2 C 11 -12 11 -32 0 -46 C -11 -32 -11 -12 0 -2 Z',
  swirl: 'M0 -4 C 16 -8 26 -30 12 -42 C 4 -46 -8 -40 -8 -30 C -8 -18 -6 -8 0 -4 Z',
};

function shapeLayers(shape) {
  switch (shape) {
    case 0: return [{ path: PETAL.round, n: 5, s: 1 }];
    case 1: return [{ path: PETAL.thin, n: 14, s: 1 }];
    case 2: return 'tulip';
    case 3: return [{ path: PETAL.point, n: 5, s: 1.05 }];
    case 4: return [{ path: PETAL.heart, n: 5, s: 1 }];
    case 5: return [{ path: PETAL.frill, n: 8, s: 1.05 }, { path: PETAL.frill, n: 8, s: 0.72, rot: 22.5 }];
    case 6: return [{ path: PETAL.lotus, n: 8, s: 1.02 }, { path: PETAL.lotus, n: 6, s: 0.7, rot: 30 }];
    case 7: return [{ path: PETAL.swirl, n: 6, s: 1 }];
    default: return [{ path: PETAL.round, n: 5, s: 1 }];
  }
}

function centerColor(g) {
  if ([1, 4, 9, 10].includes(g.c1)) return '#6b3d1c';
  if (g.c1 === 15) return '#e8c24a';
  if (g.shape === 6) return '#cfe38a';
  return '#f2b632';
}

const darken = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
};

// g: genes { c1, c2, shape, pattern, mut }. opts: { size, silhouette }. Painted by the same code as the garden.
export function flowerSVG(g, opts = {}) {
  const size = opts.size || 48;
  const url = flowerIconURL(g, size, { sil: !!opts.silhouette });
  return `<img class="flower-ico" src="${url}" width="${size}" height="${size}" alt="" draggable="false">`;
}

// seed icon for a species not yet discovered
export function seedSVG(g, size = 40) {
  return `<img class="flower-ico seed-ico" src="${seedIconURL(g, size)}" width="${size}" height="${size}" alt="" draggable="false">`;
}

// Corner badge for a patterned variant: the pattern as a tiny glyph (split, stripes, dots, edge) in the flower's
// second colour over its main colour, so variants that look alike at chip size are easy to tell apart.
const PAT_GLYPH = {
  1: (a, b, e) => `<path d="M20 0V20H0Z" fill="${b}"/><path d="M21-1L-1 21" stroke="${e}" stroke-width="1.1"/>`,
  2: (a, b, e) => `<path d="M-3 17L17-3M3 23L23 3" stroke="${e}" stroke-width="6.2"/><path d="M-3 17L17-3M3 23L23 3" stroke="${b}" stroke-width="4.4"/>`,
  3: (a, b, e) => [[6.2, 6.6, 2.9], [14, 8.2, 2.5], [8.4, 14.2, 2.7]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${b}" stroke="${e}" stroke-width="0.9"/>`).join(''),
  4: (a, b, e) => `<rect width="20" height="20" fill="${b}"/><circle cx="10" cy="10" r="4.9" fill="${a}" stroke="${e}" stroke-width="0.9"/>`,
};
export function patternBadge(g, cls = 'pat') {
  const glyph = PAT_GLYPH[g.pattern];
  if (!glyph) return '';
  const a = COLORS[g.c1].hex, b = COLORS[g.c2 ?? secondColor(g.c1)].hex;
  return `<span class="${cls}" aria-hidden="true"><svg viewBox="0 0 20 20"><rect width="20" height="20" fill="${a}"/>${glyph(a, b, rgba(ink(b, 0.5), 0.6))}<ellipse cx="7.5" cy="4.6" rx="5" ry="2.4" fill="#fff" opacity=".3"/></svg></span>`;
}

// ------------------------------------------------------------------------------------------ visitors
const FACES = {
  bunny: (c) => `<ellipse cx="-14" cy="-40" rx="9" ry="22" fill="${c}" stroke="#5a4636" stroke-width="3"/><ellipse cx="14" cy="-40" rx="9" ry="22" fill="${c}" stroke="#5a4636" stroke-width="3"/><ellipse cx="-14" cy="-38" rx="4" ry="14" fill="#ffb3c7"/><ellipse cx="14" cy="-38" rx="4" ry="14" fill="#ffb3c7"/><circle r="30" fill="${c}" stroke="#5a4636" stroke-width="3"/>`,
  fox: (c) => `<path d="M-30 -8 L-26 -44 L-6 -26 Z M30 -8 L26 -44 L6 -26 Z" fill="${c}" stroke="#5a3a24" stroke-width="3" stroke-linejoin="round"/><circle r="30" fill="${c}" stroke="#5a3a24" stroke-width="3"/><path d="M-28 6 C -16 30 16 30 28 6 C 14 16 -14 16 -28 6 Z" fill="#fff5ea"/>`,
  hedgehog: (c) => `<path d="M-38 6 L-44 -10 L-34 -20 L-36 -36 L-20 -36 L-12 -48 L0 -40 L12 -48 L20 -36 L36 -36 L34 -20 L44 -10 L38 6 Z" fill="#7a5638" stroke="#4a3322" stroke-width="3" stroke-linejoin="round"/><circle r="28" fill="${c}" stroke="#4a3322" stroke-width="3"/>`,
  frog: (c) => `<circle cx="-16" cy="-24" r="12" fill="${c}" stroke="#2f6b2a" stroke-width="3"/><circle cx="16" cy="-24" r="12" fill="${c}" stroke="#2f6b2a" stroke-width="3"/><ellipse rx="34" ry="26" fill="${c}" stroke="#2f6b2a" stroke-width="3"/>`,
  duck: (c) => `<circle r="30" fill="${c}" stroke="#8a6a14" stroke-width="3"/><ellipse cx="0" cy="12" rx="16" ry="8" fill="#ff9f3d" stroke="#a85c14" stroke-width="3"/><path d="M-4 -30 C -2 -44 8 -44 6 -30" fill="${c}" stroke="#8a6a14" stroke-width="3"/>`,
  cat: (c) => `<path d="M-30 -6 L-26 -42 L-4 -28 Z M30 -6 L26 -42 L4 -28 Z" fill="${c}" stroke="#57506a" stroke-width="3" stroke-linejoin="round"/><circle r="30" fill="${c}" stroke="#57506a" stroke-width="3"/>`,
  bear: (c) => `<circle cx="-22" cy="-24" r="11" fill="${c}" stroke="#4d321e" stroke-width="3"/><circle cx="22" cy="-24" r="11" fill="${c}" stroke="#4d321e" stroke-width="3"/><circle r="30" fill="${c}" stroke="#4d321e" stroke-width="3"/><ellipse cy="12" rx="13" ry="10" fill="#e9c9a3"/>`,
  owl: (c) => `<path d="M-30 -18 L-24 -40 L-8 -28 Z M30 -18 L24 -40 L8 -28 Z" fill="${c}" stroke="#5a4633" stroke-width="3"/><ellipse rx="31" ry="33" fill="${c}" stroke="#5a4633" stroke-width="3"/><circle cx="-12" cy="-4" r="12" fill="#fff8e6"/><circle cx="12" cy="-4" r="12" fill="#fff8e6"/>`,
  queen: () => `<ellipse cx="-24" cy="-26" rx="14" ry="9" fill="#e8f6ff" stroke="#8ab" stroke-width="2" transform="rotate(-30 -24 -26)"/><ellipse cx="24" cy="-26" rx="14" ry="9" fill="#e8f6ff" stroke="#8ab" stroke-width="2" transform="rotate(30 24 -26)"/><circle r="28" fill="#ffc928" stroke="#5a3a10" stroke-width="3"/><path d="M-26 8 C -10 14 10 14 26 8" stroke="#2a1d12" stroke-width="7" fill="none"/><path d="M-16 -30 L-10 -44 L-2 -34 L0 -48 L2 -34 L10 -44 L16 -30 Z" fill="#ffd84d" stroke="#b07b10" stroke-width="2.5" stroke-linejoin="round"/>`,
};
export function visitorSVG(kind, color, size = 44) {
  const url = visitorURL(kind, color, size);
  if (url) return `<img class="ico visitor" src="${url}" width="${size}" height="${size}" alt="" draggable="false">`;
  const face = (FACES[kind] || FACES.bunny)(color);
  const eyeY = kind === 'owl' ? -4 : kind === 'frog' ? -24 : -4;
  const eyeX = kind === 'frog' ? 16 : 11;
  const eyes = `<circle cx="${-eyeX}" cy="${eyeY}" r="4.6" fill="#2a1d12"/><circle cx="${eyeX}" cy="${eyeY}" r="4.6" fill="#2a1d12"/><circle cx="${-eyeX + 1.6}" cy="${eyeY - 1.6}" r="1.6" fill="#fff"/><circle cx="${eyeX + 1.6}" cy="${eyeY - 1.6}" r="1.6" fill="#fff"/>`;
  const nose = kind === 'duck' || kind === 'owl' ? (kind === 'owl' ? '<path d="M-5 6 L0 14 L5 6 Z" fill="#f2a33a"/>' : '') : `<ellipse cy="${kind === 'frog' ? 6 : 8}" rx="${kind === 'frog' ? 10 : 4.5}" ry="${kind === 'frog' ? 2.5 : 3.2}" fill="#3a2418"/>`;
  const cheeks = '<circle cx="-19" cy="10" r="5" fill="#ff8fa8" opacity="0.55"/><circle cx="19" cy="10" r="5" fill="#ff8fa8" opacity="0.55"/>';
  return `<svg viewBox="-50 -56 100 100" width="${size}" height="${size}" aria-hidden="true">${face}${eyes}${nose}${cheeks}</svg>`;
}

// ------------------------------------------------------------------------------------------ UI icons
const I = {
  coin: '<circle cx="12" cy="12" r="10" fill="#ffcc33" stroke="#b7791f" stroke-width="2"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#e09b1f" stroke-width="1.6"/><path d="M10 8.5h3.2M10 12h3.6M10 15.5h3.2M11 7v10" stroke="#b7791f" stroke-width="1.6" stroke-linecap="round"/>',
  book: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5C4.7 20 4 19.3 4 18.5z" fill="#ff8fb8" stroke="#8a3a5a" stroke-width="1.8"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z" fill="#ffb3cf" stroke="#8a3a5a" stroke-width="1.8"/><circle cx="16.5" cy="10" r="2" fill="#fff"/>',
  gear: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" fill="#fff"/><path d="M19.4 13.5l1.6 1.2-1.8 3.1-1.9-.6a7 7 0 0 1-2 1.2l-.4 2H11l-.4-2a7 7 0 0 1-2-1.2l-1.9.6-1.8-3.1 1.6-1.2a7 7 0 0 1 0-3l-1.6-1.2 1.8-3.1 1.9.6a7 7 0 0 1 2-1.2l.4-2h3.8l.4 2a7 7 0 0 1 2 1.2l1.9-.6 1.8 3.1-1.6 1.2a7 7 0 0 1 0 3z" fill="#b9c3d6" stroke="#4a5570" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="#4a5570"/>',
  basket: '<path d="M3 10h18l-2 9.5c-.2.9-1 1.5-1.9 1.5H6.9c-.9 0-1.7-.6-1.9-1.5z" fill="#e0a45a" stroke="#7a4a1f" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 10l3-6M17 10l-3-6" stroke="#7a4a1f" stroke-width="1.8" stroke-linecap="round"/><path d="M8 13v5M12 13v5M16 13v5" stroke="#7a4a1f" stroke-width="1.4" stroke-linecap="round"/><circle cx="9" cy="8" r="2.4" fill="#ff6b8a" stroke="#7a2a3a" stroke-width="1.2"/><circle cx="14" cy="7.5" r="2.4" fill="#ffd23f" stroke="#8a6a14" stroke-width="1.2"/>',
  can: '<path d="M6 9h9v9.5c0 .8-.7 1.5-1.5 1.5h-6c-.8 0-1.5-.7-1.5-1.5z" fill="#6fc3ff" stroke="#1f5f8a" stroke-width="1.8"/><path d="M15 11l5-4" stroke="#1f5f8a" stroke-width="2.2" stroke-linecap="round"/><circle cx="20.5" cy="6.5" r="1.6" fill="#1f5f8a"/><path d="M8 9a4 3 0 0 1 5 0" fill="none" stroke="#1f5f8a" stroke-width="1.8"/><path d="M8 12.5h5" stroke="#fff" stroke-width="1.4" opacity="0.7"/>',
  shovel: '<path d="M14.5 3.5l6 6-2 2-6-6z" fill="#b87a4a" stroke="#6a3f1f" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 7l4 4-6.5 6.5c-1.4 1.4-3.6 1.4-5 0s-1.4-3.6 0-5z" fill="#c9d3dc" stroke="#55606e" stroke-width="1.8" stroke-linejoin="round"/>',
  bee: '<ellipse cx="12" cy="13" rx="6.5" ry="5.5" fill="#ffc928" stroke="#3a2a14" stroke-width="1.6"/><path d="M10 8.2v9.6M14 8.4v9.2" stroke="#3a2a14" stroke-width="2"/><ellipse cx="8" cy="6.5" rx="3.5" ry="2.5" fill="#e8f6ff" stroke="#6a8aa0" stroke-width="1.2"/><ellipse cx="16" cy="6.5" rx="3.5" ry="2.5" fill="#e8f6ff" stroke="#6a8aa0" stroke-width="1.2"/>',
  star: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="#ffd23f" stroke="#b7791f" stroke-width="1.6" stroke-linejoin="round"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2.5" fill="#ffcf5a" stroke="#8a5a14" stroke-width="1.8"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="#8a5a14" stroke-width="1.8"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff" stroke="#3a4a60" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" stroke="#3a4a60" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  music: '<path d="M9 17V6l10-2v11" stroke="#3a4a60" stroke-width="1.8" fill="none" stroke-linejoin="round"/><circle cx="7" cy="17" r="2.6" fill="#ff8fb8" stroke="#3a4a60" stroke-width="1.6"/><circle cx="17" cy="15" r="2.6" fill="#8fd3ff" stroke="#3a4a60" stroke-width="1.6"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#ffd23f" stroke="#a8740f" stroke-width="1.8"/><path d="M7 6H4.5c0 3 1.2 4.5 3 4.8M17 6h2.5c0 3-1.2 4.5-3 4.8" fill="none" stroke="#a8740f" stroke-width="1.8"/><path d="M10 14h4l.5 3h-5z M8 17h8v3H8z" fill="#e0a02a" stroke="#a8740f" stroke-width="1.6" stroke-linejoin="round"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="2" fill="#ff7aa6" stroke="#8a2a4a" stroke-width="1.8"/><rect x="3" y="7" width="18" height="4" rx="1.5" fill="#ff9ec0" stroke="#8a2a4a" stroke-width="1.8"/><path d="M12 7v13" stroke="#ffd23f" stroke-width="3"/><path d="M12 7c-2-4-6-4-6-1.5S10 7 12 7c2 0 6 .5 6-1.5S14 3 12 7z" fill="#ffd23f" stroke="#a8740f" stroke-width="1.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5" fill="#fff" stroke="#3a4a60" stroke-width="1.8"/><path d="M12 7v5l3.5 2" stroke="#3a4a60" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  sun: '<circle cx="12" cy="12" r="5" fill="#ffd23f" stroke="#c98a14" stroke-width="1.6"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#f0a818" stroke-width="1.8" stroke-linecap="round"/>',
  rain: '<path d="M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 7.5 3.8 3.8 0 0 1 17 15z" fill="#e8f1f8" stroke="#5a7890" stroke-width="1.6"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" stroke="#3f9cf0" stroke-width="1.8" stroke-linecap="round"/>',
  golden: '<circle cx="12" cy="13" r="5.5" fill="#ffb13d" stroke="#b86a14" stroke-width="1.6"/><path d="M3 19h18" stroke="#b86a14" stroke-width="1.8" stroke-linecap="round"/><path d="M12 3.5v2M5 7l1.4 1.4M19 7l-1.4 1.4" stroke="#ff9c2a" stroke-width="1.8" stroke-linecap="round"/>',
  night: '<path d="M16 3.5a8.5 8.5 0 1 0 4.5 13A7 7 0 0 1 16 3.5z" fill="#ffe99a" stroke="#8a7a3a" stroke-width="1.6"/><circle cx="6" cy="6" r="1" fill="#fff"/><circle cx="9" cy="3.5" r=".8" fill="#fff"/>',
  rainbow: '<path d="M3 17a9 9 0 0 1 18 0" stroke="#ff6b6b" stroke-width="2.4" fill="none"/><path d="M5.5 17a6.5 6.5 0 0 1 13 0" stroke="#ffd23f" stroke-width="2.4" fill="none"/><path d="M8 17a4 4 0 0 1 8 0" stroke="#5ec8ff" stroke-width="2.4" fill="none"/>',
  hand: '<path d="M9 11V4.8a1.6 1.6 0 0 1 3.2 0V10l.1-1.4a1.5 1.5 0 0 1 3 .1l-.1 1.8.2-.9a1.5 1.5 0 0 1 2.9.6l-.4 2 .1-.4a1.4 1.4 0 0 1 2.7.8L19 18c-.6 2.4-2.7 4-5.2 4H13c-1.8 0-3.4-.9-4.4-2.4l-3-4.6a1.6 1.6 0 0 1 2.6-1.8L9 14z" fill="#fff" stroke="#2a2a3a" stroke-width="1.6" stroke-linejoin="round"/>',
  sell: '<circle cx="12" cy="12" r="9" fill="#7ad37a" stroke="#2f7a2f" stroke-width="1.8"/><path d="M12 7v10M9.5 9.5c0-1.2 1.1-1.8 2.5-1.8s2.5.6 2.5 1.8-1.1 1.6-2.5 1.9-2.5.8-2.5 2 1.1 1.8 2.5 1.8 2.5-.6 2.5-1.8" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  target: '<circle cx="12" cy="12" r="9" fill="#fff" stroke="#e0536f" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="#ffb3c2" stroke="#e0536f" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#e0536f"/>',
  seed: '<ellipse cx="12" cy="13" rx="5.5" ry="7.5" fill="#c98a4a" stroke="#6a3f1f" stroke-width="1.8"/><path d="M12 5.5c-2 3-2 12 0 15" stroke="#6a3f1f" stroke-width="1.2" fill="none" opacity=".6"/><path d="M12 5.5c2-3 5-3.5 6-2.5-1 2-3.5 3-6 2.5z" fill="#6fc35a" stroke="#2f6b2a" stroke-width="1.2"/>',
  swap: '<path d="M6 8h11l-3-3M18 16H7l3 3" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="#fff" stroke="#3a4a60" stroke-width="1.8"/><path d="M12 11v6" stroke="#3a4a60" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.4" fill="#3a4a60"/>',
  // upgrades
  up_bees: '<path d="M4 20h16v-6l-3-4H7l-3 4z" fill="#f0c160" stroke="#8a5a14" stroke-width="1.6"/><path d="M6 14h12M5 17h14" stroke="#c98a2a" stroke-width="1.4"/><circle cx="12" cy="17" r="1.6" fill="#3a2412"/><ellipse cx="16.5" cy="6" rx="3.2" ry="2.6" fill="#ffc928" stroke="#3a2a14" stroke-width="1.3"/><path d="M15.5 3.6v4.8" stroke="#3a2a14" stroke-width="1.3"/>',
  up_fert: '<path d="M6 6h12l1 14H5z" fill="#c9a06a" stroke="#6a4a24" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 6l1.5-2.5h9L18 6" fill="#b88a55" stroke="#6a4a24" stroke-width="1.6"/><path d="M12 10c-3 2-3 6 0 8 3-2 3-6 0-8z" fill="#6fc35a" stroke="#2f6b2a" stroke-width="1.3"/>',
  up_market: '<path d="M3 9l2-5h14l2 5z" fill="#ff8fa8" stroke="#8a2a4a" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 9h18v2.5a2 2 0 0 1-4 0 2 2 0 0 1-5 0 2 2 0 0 1-5 0 2 2 0 0 1-4 0z" fill="#fff" stroke="#8a2a4a" stroke-width="1.4"/><rect x="5" y="13" width="14" height="7" fill="#e7c08a" stroke="#6a4a24" stroke-width="1.6"/>',
  up_wings: '<path d="M12 12C7 3 2 5 3 9s5 5 9 3zM12 12c5-9 10-7 9-3s-5 5-9 3z" fill="#e8f6ff" stroke="#5a86a8" stroke-width="1.6"/><path d="M12 12c-3 5-7 7-8 5s3-5 8-5zM12 12c3 5 7 7 8 5s-3-5-8-5z" fill="#cfe9ff" stroke="#5a86a8" stroke-width="1.4"/>',
  up_pouch: '<path d="M6 9c-2 4-2 11 6 11s8-7 6-11z" fill="#c98a5a" stroke="#6a3f1f" stroke-width="1.8"/><path d="M8 9c1-3 7-3 8 0" fill="none" stroke="#6a3f1f" stroke-width="1.8"/><path d="M9 6.5l6 0" stroke="#e0536f" stroke-width="2" stroke-linecap="round"/>',
  up_can: '',
  up_gnome: '<path d="M12 2l5 9H7z" fill="#e0445a" stroke="#7a1a2a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="#ffd2b3" stroke="#8a5a3a" stroke-width="1.4"/><path d="M8.5 14c0 5 7 5 7 0-1 1.5-6 1.5-7 0z" fill="#fff" stroke="#9aa" stroke-width="1.2"/><path d="M7 21c0-3 2-4.5 5-4.5s5 1.5 5 4.5z" fill="#4a8ad8" stroke="#1f4a7a" stroke-width="1.4"/>',
};
I.up_can = I.can;

export function icon(name, size = 22, cls = '') {
  if (hasPainted(name)) return `<img class="ico ${cls}" src="${iconURL(name, size)}" width="${size}" height="${size}" alt="" draggable="false">`;
  const body = I[name];
  if (!body) return '';
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}

// decoration thumbnails (small scenes)
const DECOR = {
  birdbath: '<ellipse cx="12" cy="9" rx="8" ry="2.6" fill="#bfe8ff" stroke="#6a7a88" stroke-width="1.4"/><path d="M4 9c0 3 16 3 16 0" fill="#d8dde2" stroke="#6a7a88" stroke-width="1.4"/><path d="M10 12h4l1 7H9z" fill="#d8dde2" stroke="#6a7a88" stroke-width="1.4"/><rect x="7" y="19" width="10" height="2.5" rx="1" fill="#c9ced4" stroke="#6a7a88" stroke-width="1.4"/>',
  bench: '<rect x="3" y="8" width="18" height="3" rx="1" fill="#c98a5a" stroke="#6a3f1f" stroke-width="1.4"/><rect x="3" y="12.5" width="18" height="3" rx="1" fill="#d99a66" stroke="#6a3f1f" stroke-width="1.4"/><path d="M5 15.5v5M19 15.5v5" stroke="#4a4a4a" stroke-width="2"/>',
  arch: '<path d="M4 21V11a8 8 0 0 1 16 0v10" fill="none" stroke="#8a5a3a" stroke-width="2.4"/><circle cx="6" cy="10" r="2" fill="#ff6b8a"/><circle cx="10" cy="5" r="2" fill="#ff8fb8"/><circle cx="15" cy="5" r="2" fill="#ff6b8a"/><circle cx="18.5" cy="10" r="2" fill="#ff8fb8"/><circle cx="5" cy="15" r="1.6" fill="#6fc35a"/><circle cx="19" cy="15" r="1.6" fill="#6fc35a"/>',
  lanterns: '<path d="M2 5c7 4 13 4 20 0" stroke="#6a4a24" stroke-width="1.2" fill="none"/><rect x="5" y="7" width="4" height="6" rx="1.8" fill="#ff8f5a" stroke="#8a3a1a" stroke-width="1.2"/><rect x="10.5" y="8" width="4" height="6" rx="1.8" fill="#ffd23f" stroke="#8a6a14" stroke-width="1.2"/><rect x="16" y="7" width="4" height="6" rx="1.8" fill="#ff6b8a" stroke="#8a2a4a" stroke-width="1.2"/>',
  windmill: '<path d="M9 21l1.5-11h3L15 21z" fill="#f2e6d0" stroke="#6a4a24" stroke-width="1.4"/><path d="M12 9L6 3M12 9l6-6M12 9l-6 6M12 9l6 6" stroke="#c98a5a" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="9" r="1.6" fill="#6a4a24"/>',
  fountain: '<path d="M3 17h18l-2 4H5z" fill="#d8dde2" stroke="#6a7a88" stroke-width="1.4"/><ellipse cx="12" cy="17" rx="9" ry="2" fill="#8fd3ff"/><path d="M10 17V10h4v7" fill="#d8dde2" stroke="#6a7a88" stroke-width="1.4"/><path d="M12 9c-2-4-5-4-6-1M12 9c2-4 5-4 6-1M12 9V3" stroke="#5ec8ff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  gazebo: '<path d="M3 10l9-7 9 7z" fill="#ff8fb8" stroke="#8a2a4a" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 10v10M19 10v10M12 10v10" stroke="#f2e6d0" stroke-width="2"/><path d="M3 20h18" stroke="#8a5a3a" stroke-width="2"/>',
  greenhouse: '<path d="M3 21V11l9-7 9 7v10z" fill="#bff0dc" stroke="#2f7a5a" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 4v17M3 14h18M7.5 8v13M16.5 8v13" stroke="#2f7a5a" stroke-width="1.1"/>',
  statue: '<rect x="7" y="17" width="10" height="4" rx="1" fill="#d8dde2" stroke="#6a7a88" stroke-width="1.4"/><ellipse cx="12" cy="11.5" rx="5" ry="4.5" fill="#ffd23f" stroke="#a8740f" stroke-width="1.4"/><path d="M10 7.5v8M14 7.5v8" stroke="#a8740f" stroke-width="1.4"/><ellipse cx="8" cy="6" rx="3" ry="2" fill="#fff4b8" stroke="#a8740f" stroke-width="1.2"/><ellipse cx="16" cy="6" rx="3" ry="2" fill="#fff4b8" stroke="#a8740f" stroke-width="1.2"/>',
  rainbow: I.rainbow + '<path d="M2 18h5M17 18h5" stroke="#c98a5a" stroke-width="2.4" stroke-linecap="round"/>',
};
export function decorIcon(idName, size = 44) {
  const url = decorThumbURL(idName, size);
  if (url) return `<img class="ico" src="${url}" width="${size}" height="${size}" alt="" draggable="false">`;
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${DECOR[idName] || ''}</svg>`;
}

export function weatherIcon(kind, size = 22) { return icon(kind === 'clear' ? 'sun' : kind, size); }
