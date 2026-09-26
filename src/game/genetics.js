// Flower genetics: colours, shapes, patterns, mutations, cross-breeding, names and value. Pure logic.
//
// A flower's genes: { c1, c2, shape, pattern, mut }
//   c1 = main colour, c2 = second colour (used by patterns), shape = petal form, pattern, mut = mutation.
// The Flower Book species is (c1, shape); patterns and mutations are variants of a species.

export const COLORS = [
  { name: 'Red', hex: '#ea3f4f', tier: 1 },
  { name: 'Yellow', hex: '#ffcd2e', tier: 1 },
  { name: 'Blue', hex: '#3a7bf0', tier: 1 },
  { name: 'White', hex: '#f7f3ec', tier: 1 },
  { name: 'Orange', hex: '#ff8a33', tier: 2 },
  { name: 'Green', hex: '#63c94a', tier: 2 },
  { name: 'Purple', hex: '#9657f0', tier: 2 },
  { name: 'Pink', hex: '#ff85bd', tier: 2 },
  { name: 'Sky', hex: '#7fd0ff', tier: 2 },
  { name: 'Cream', hex: '#ffe8a0', tier: 2 },
  { name: 'Peach', hex: '#ffb088', tier: 3 },
  { name: 'Lavender', hex: '#c7a6ff', tier: 3 },
  { name: 'Teal', hex: '#17b3a6', tier: 3 },
  { name: 'Magenta', hex: '#e23c9d', tier: 3 },
  { name: 'Indigo', hex: '#4a43d6', tier: 3 },
  { name: 'Midnight', hex: '#2c2552', tier: 4 },
];
export const C = Object.fromEntries(COLORS.map((c, i) => [c.name.toUpperCase(), i]));

export const SHAPES = [
  { name: 'Blossom', tier: 1, petals: 5 },
  { name: 'Daisy', tier: 1, petals: 12 },
  { name: 'Tulip', tier: 2, petals: 6 },
  { name: 'Star', tier: 2, petals: 5 },
  { name: 'Heart', tier: 3, petals: 5 },
  { name: 'Frill', tier: 3, petals: 8 },
  { name: 'Lotus', tier: 4, petals: 10 },
  { name: 'Pinwheel', tier: 4, petals: 6 },
];
export const S = Object.fromEntries(SHAPES.map((s, i) => [s.name.toUpperCase(), i]));

export const PATTERNS = [
  { name: 'Plain', adj: '', mult: 1 },
  { name: 'Two-tone', adj: 'Two-tone', mult: 1.4 },
  { name: 'Striped', adj: 'Striped', mult: 1.8 },
  { name: 'Spotted', adj: 'Spotted', mult: 1.8 },
  { name: 'Tipped', adj: 'Tipped', mult: 2 },
];
export const P = { PLAIN: 0, TWOTONE: 1, STRIPED: 2, SPOTTED: 3, TIPPED: 4 };

export const MUTATIONS = [
  { name: 'None', adj: '', mult: 1 },
  { name: 'Dewy', adj: 'Dewy', mult: 2, weather: 'rain' },
  { name: 'Moonlit', adj: 'Moonlit', mult: 3, weather: 'night' },
  { name: 'Golden', adj: 'Golden', mult: 5, weather: 'golden' },
  { name: 'Rainbow', adj: 'Rainbow', mult: 10, weather: 'rainbow' },
  { name: 'Giant', adj: 'Giant', mult: 3 },
];
export const M = { NONE: 0, DEWY: 1, MOONLIT: 2, GOLDEN: 3, RAINBOW: 4, GIANT: 5 };

const pair = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

// colour mixing: unordered pair → { out, p }
export const COLOR_MIX = new Map([
  [pair(C.RED, C.YELLOW), { out: C.ORANGE, p: 0.55 }],
  [pair(C.RED, C.BLUE), { out: C.PURPLE, p: 0.55 }],
  [pair(C.YELLOW, C.BLUE), { out: C.GREEN, p: 0.55 }],
  [pair(C.RED, C.WHITE), { out: C.PINK, p: 0.55 }],
  [pair(C.BLUE, C.WHITE), { out: C.SKY, p: 0.55 }],
  [pair(C.YELLOW, C.WHITE), { out: C.CREAM, p: 0.55 }],
  [pair(C.ORANGE, C.WHITE), { out: C.PEACH, p: 0.5 }],
  [pair(C.PURPLE, C.WHITE), { out: C.LAVENDER, p: 0.5 }],
  [pair(C.GREEN, C.BLUE), { out: C.TEAL, p: 0.5 }],
  [pair(C.SKY, C.GREEN), { out: C.TEAL, p: 0.35 }],
  [pair(C.PURPLE, C.PINK), { out: C.MAGENTA, p: 0.5 }],
  [pair(C.RED, C.PURPLE), { out: C.MAGENTA, p: 0.35 }],
  [pair(C.PURPLE, C.BLUE), { out: C.INDIGO, p: 0.5 }],
  [pair(C.INDIGO, C.PURPLE), { out: C.MIDNIGHT, p: 0.25 }],
]);

// shape cross-breeding: unordered pair → { out, p }
export const SHAPE_MIX = new Map([
  [pair(S.BLOSSOM, S.BLOSSOM), { out: S.TULIP, p: 0.12 }],
  [pair(S.BLOSSOM, S.DAISY), { out: S.STAR, p: 0.22 }],
  [pair(S.TULIP, S.STAR), { out: S.HEART, p: 0.15 }],
  [pair(S.DAISY, S.STAR), { out: S.FRILL, p: 0.15 }],
  [pair(S.TULIP, S.FRILL), { out: S.LOTUS, p: 0.1 }],
  [pair(S.STAR, S.HEART), { out: S.PINWHEEL, p: 0.1 }],
]);

// how each colour / shape can be obtained (Flower Book hints)
export function colorRecipe(ci) {
  if (COLORS[ci].tier === 1) return 'Sold in the seed shop';
  for (const [k, v] of COLOR_MIX) if (v.out === ci) { const [a, b] = k.split('|').map(Number); return `Cross ${COLORS[a].name} + ${COLORS[b].name}`; }
  return '';
}
export function shapeRecipe(si) {
  if (SHAPES[si].tier === 1) return 'Sold in the seed shop';
  for (const [k, v] of SHAPE_MIX) if (v.out === si) { const [a, b] = k.split('|').map(Number); return a === b ? `Cross two ${SHAPES[a].name}s` : `Cross ${SHAPES[a].name} + ${SHAPES[b].name}`; }
  return '';
}

export const TIER_MULT = [0, 1, 2.4, 5, 10];

export function makeFlower(c1, shape, pattern = 0, c2 = null, mut = 0) {
  return { c1, c2: c2 ?? secondColor(c1), shape, pattern, mut };
}

// a pleasant default second colour for patterned flowers without one: white on dark colours, a deeper
// neighbour on light ones
export function secondColor(c1) {
  const light = [C.WHITE, C.CREAM, C.YELLOW, C.SKY, C.PEACH, C.LAVENDER, C.PINK];
  if (light.includes(c1)) return c1 === C.WHITE ? C.PINK : c1 === C.YELLOW ? C.ORANGE : c1 === C.SKY ? C.BLUE : c1 === C.PINK ? C.MAGENTA : c1 === C.CREAM ? C.ORANGE : c1 === C.PEACH ? C.RED : C.PURPLE;
  return C.WHITE;
}

export function speciesId(f) { return f.c1 * 8 + f.shape; }
export function speciesOf(id) { return { c1: Math.floor(id / 8), shape: id % 8 }; }
export const SPECIES_COUNT = COLORS.length * SHAPES.length;

export function flowerName(f, { withMut = true } = {}) {
  const parts = [];
  if (withMut && f.mut) parts.push(MUTATIONS[f.mut].adj);
  if (f.pattern) parts.push(PATTERNS[f.pattern].adj);
  parts.push(COLORS[f.c1].name, SHAPES[f.shape].name);
  return parts.join(' ');
}
export const speciesName = (id) => { const s = speciesOf(id); return `${COLORS[s.c1].name} ${SHAPES[s.shape].name}`; };

export function flowerValue(f) {
  const v = 4 * TIER_MULT[COLORS[f.c1].tier] * TIER_MULT[SHAPES[f.shape].tier] * PATTERNS[f.pattern].mult * MUTATIONS[f.mut].mult;
  return Math.max(1, Math.round(v));
}
// rarity 1..5 for UI (stars): combines tiers, pattern and mutation
export function rarity(f) {
  const t = COLORS[f.c1].tier + SHAPES[f.shape].tier + (f.pattern ? 1 : 0) + (f.mut ? 2 : 0);
  return Math.max(1, Math.min(5, Math.ceil((t - 1) / 2)));
}

// seconds to grow from seed to first bloom (before upgrades / weather)
export function growTime(f) {
  const t = COLORS[f.c1].tier + SHAPES[f.shape].tier - 1;
  return 10 * Math.pow(t, 1.25);
}

// Cross two parents → child genes. rnd: () => [0,1)
export function breed(a, b, rnd) {
  const pick = (x, y) => (rnd() < 0.5 ? x : y);
  let c1, c2, pattern = null;
  // colour
  const rule = COLOR_MIX.get(pair(a.c1, b.c1));
  const r = rnd();
  if (rule && r < rule.p) {
    c1 = rule.out;
  } else if (a.c1 !== b.c1 && r < (rule ? rule.p : 0) + 0.2) {
    // two-tone of both parents
    if (rnd() < 0.5) { c1 = a.c1; c2 = b.c1; } else { c1 = b.c1; c2 = a.c1; }
    pattern = P.TWOTONE;
  } else {
    c1 = pick(a.c1, b.c1);
  }
  // pattern
  if (pattern === null) {
    pattern = pick(a.pattern, b.pattern);
    if (rnd() < 0.05) pattern = 1 + Math.floor(rnd() * 4);
  }
  if (c2 == null) {
    // carry a parent's second colour when the pattern came from it, else pick a nice default
    const donor = a.pattern === pattern ? a : b.pattern === pattern ? b : null;
    c2 = donor && donor.pattern ? donor.c2 : secondColor(c1);
    if (c2 === c1) c2 = secondColor(c1);
  }
  // shape
  let shape;
  const srule = SHAPE_MIX.get(pair(a.shape, b.shape));
  const rs = rnd();
  if (srule && rs < srule.p) shape = srule.out;
  else if (rs > 0.98) {
    // rare spontaneous shape mutation: one tier up from the better parent
    const tier = Math.min(4, Math.max(SHAPES[a.shape].tier, SHAPES[b.shape].tier) + 1);
    const options = SHAPES.map((s, i) => [s, i]).filter(([s]) => s.tier === tier).map(([, i]) => i);
    shape = options[Math.floor(rnd() * options.length)];
  } else shape = pick(a.shape, b.shape);
  return { c1, c2, shape, pattern, mut: 0 };
}

export function sameGenes(a, b) {
  return a.c1 === b.c1 && a.shape === b.shape && a.pattern === b.pattern && (a.pattern === 0 || a.c2 === b.c2) && a.mut === b.mut;
}
