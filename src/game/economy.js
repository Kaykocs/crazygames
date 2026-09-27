// Economy + progression tables: upgrades, levels, unlocks, plot prices, seed shop, visitor orders, daily gift.
// Pure data/logic, tuned with tools/sim.mjs.
import { COLORS, SHAPES, C, S, P, M, makeFlower, flowerValue, speciesId, COLOR_MIX, SHAPE_MIX } from './genetics.js';

export const UPGRADES = {
  bees: { name: 'Bee Hive', desc: 'One more busy bee', max: 5, unlock: 3, cost: (k) => 250 * Math.pow(4.2, k), icon: 'bee' },
  fert: { name: 'Fertiliser', desc: 'Flowers grow faster', max: 10, unlock: 3, cost: (k) => 300 * Math.pow(2.5, k), icon: 'fert' },
  market: { name: 'Flower Market', desc: 'Blooms sell for 20 % more', max: 20, unlock: 4, cost: (k) => 400 * Math.pow(2.05, k), icon: 'market' },
  wings: { name: 'Swift Wings', desc: 'Bees fly 12 % faster', max: 8, unlock: 4, cost: (k) => 350 * Math.pow(2.6, k), icon: 'wings' },
  pouch: { name: 'Seed Pouch', desc: '+3 seed kinds', max: 8, unlock: 4, cost: (k) => 200 * Math.pow(2.4, k), icon: 'pouch' },
  can: { name: 'Watering Can', desc: '+1 water charge, faster refill', max: 6, unlock: 3, cost: (k) => 180 * Math.pow(2.4, k), icon: 'can' },
  gnome: { name: 'Garden Gnome', desc: 'Harvests ripe blooms for you', max: 6, unlock: 7, cost: (k) => 4000 * Math.pow(3.2, k), icon: 'gnome' },
};

export const upgradeCost = (key, level) => Math.round(UPGRADES[key].cost(level) / 10) * 10;

// effects of upgrade levels
export const beeCount = (u) => 1 + (u.bees || 0);
export const beeSpeed = (u) => 1 + 0.12 * (u.wings || 0);
export const growMult = (u) => 1 / (1 + 0.12 * (u.fert || 0));
export const sellMult = (u) => 1 + 0.2 * (u.market || 0);
export const pouchSize = (u) => 12 + 3 * (u.pouch || 0);         // distinct seed kinds (identical seeds stack)
export const canCharges = (u) => 3 + (u.can || 0);
export const canRefill = (u) => 18 - 2 * (u.can || 0);      // seconds per charge
export const gnomeInterval = (u) => (u.gnome ? 14 - 2 * u.gnome : 0);

// ---- gardener level ----
export const xpForLevel = (L) => Math.round(25 * Math.pow(L, 2.1) + 15);
export const harvestXp = (value) => Math.max(1, Math.round(Math.sqrt(value) * 0.9));
export const levelReward = (L) => 30 * L;

export const UNLOCKS = [
  { level: 2, key: 'orders', text: 'Visitors now bring orders' },
  { level: 2, key: 'rain', text: 'Rain showers speed up growth' },
  { level: 3, key: 'upgrades', text: 'Upgrades are open in the shop' },
  { level: 3, key: 'can', text: 'Watering can: tap a sprout to boost it' },
  { level: 4, key: 'golden', text: 'Golden hour can turn blooms to gold' },
  { level: 5, key: 'night', text: 'Starry nights make blooms glow' },
  { level: 7, key: 'gnome', text: 'The garden gnome can help you harvest' },
  { level: 8, key: 'rainbow', text: 'Rainbows bring the rarest mutation' },
];
export const unlocked = (level, key) => { const u = UNLOCKS.find((x) => x.key === key); return !u || level >= u.level; };

// ---- plots ----
export const START_PLOTS = 7;
export const plotCost = (owned) => { const c = 60 * Math.pow(1.5, Math.max(0, owned - START_PLOTS)); return c < 1000 ? Math.round(c / 5) * 5 : Math.round(c / 100) * 100; };

// ---- seed shop ----
export const SHOP_RESTOCK = 150; // seconds
const BASICS = [C.RED, C.YELLOW, C.BLUE, C.WHITE];
export const seedPrice = (g) => Math.max(5, Math.round((flowerValue(g) * 3.2) / 5) * 5);

export function shopStock(level, rnd) {
  const out = [];
  const shapes = [S.BLOSSOM, S.DAISY];
  // two basics always
  const b = [...BASICS].sort(() => rnd() - 0.5);
  out.push(makeFlower(b[0], shapes[Math.floor(rnd() * 2)]));
  out.push(makeFlower(b[1], shapes[Math.floor(rnd() * 2)]));
  out.push(makeFlower(b[2], shapes[Math.floor(rnd() * 2)]));
  // a rarer pick that scales with level
  const r = rnd();
  if (level >= 3 && r < 0.55) {
    const t2c = COLORS.map((c, i) => [c, i]).filter(([c]) => c.tier === 2).map(([, i]) => i);
    const t2s = [S.TULIP, S.STAR];
    const g = makeFlower(t2c[Math.floor(rnd() * t2c.length)], rnd() < 0.5 ? S.BLOSSOM : t2s[Math.floor(rnd() * 2)]);
    if (level >= 6 && rnd() < 0.35) g.pattern = 1 + Math.floor(rnd() * 4);
    out.push(g);
  } else out.push(makeFlower(b[3], shapes[Math.floor(rnd() * 2)], rnd() < 0.3 && level >= 2 ? 1 + Math.floor(rnd() * 4) : 0));
  return out.map((g) => ({ g, price: seedPrice(g), sold: false }));
}

// ---- visitors & orders ----
export const VISITORS = [
  { id: 'bunny', name: 'Bea the Bunny', color: '#f3d9c9' },
  { id: 'fox', name: 'Finn the Fox', color: '#ff9a4d' },
  { id: 'hedgehog', name: 'Hazel the Hedgehog', color: '#b88a63' },
  { id: 'frog', name: 'Fern the Frog', color: '#7ccc5c' },
  { id: 'duck', name: 'Dot the Duck', color: '#ffe06a' },
  { id: 'cat', name: 'Clover the Cat', color: '#c9c3d9' },
  { id: 'bear', name: 'Bruno the Bear', color: '#a6764f' },
  { id: 'owl', name: 'Olive the Owl', color: '#b59a7a' },
];

// does flower f satisfy request req ({ c1?, shape?, pattern?, mut? })
export function matches(req, f) {
  if (req.c1 != null && f.c1 !== req.c1) return false;
  if (req.shape != null && f.shape !== req.shape) return false;
  if (req.pattern != null && f.pattern !== req.pattern) return false;
  if (req.mut != null && f.mut !== req.mut) return false;
  return true;
}

export function orderText(req) {
  const parts = [];
  if (req.mut != null) parts.push(['', 'Dewy', 'Moonlit', 'Golden', 'Rainbow', 'Giant'][req.mut]);
  if (req.pattern != null) parts.push(['Plain', 'Two-tone', 'Striped', 'Spotted', 'Tipped'][req.pattern]);
  if (req.c1 != null) parts.push(COLORS[req.c1].name);
  parts.push(req.shape != null ? SHAPES[req.shape].name : 'flower');
  return parts.join(' ');
}

// Build an order the player can reasonably reach from what they have discovered (book = Set of species ids).
export const ORDER_TTL = 300;   // seconds before an unfilled visitor moves on

// Build an order the player can reasonably reach from what they have discovered (book = Set of species ids).
export function makeOrder(level, book, rnd, weatherKinds, recent = []) {
  // an empty Flower Book (e.g. the tutorial was skipped) asks for the shop's basic blossoms
  const known = book.size ? [...book] : BASICS.map((c) => c * 8 + S.BLOSSOM);
  const knownColors = [...new Set(known.map((id) => Math.floor(id / 8)))];
  const knownShapes = [...new Set(known.map((id) => id % 8))];
  // colours one cross away from what the player already has
  const reachColors = new Set(knownColors);
  for (const [k, v] of COLOR_MIX) { const [a, b] = k.split('|').map(Number); if (reachColors.has(a) && reachColors.has(b)) reachColors.add(v.out); }
  const reachShapes = new Set(knownShapes);
  for (const [k, v] of SHAPE_MIX) { const [a, b] = k.split('|').map(Number); if (reachShapes.has(a) && reachShapes.has(b)) reachShapes.add(v.out); }
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  let req;
  for (let tries = 0; tries < 12; tries++) {
    const roll = rnd();
    if (level < 4 || roll < 0.3) req = { c1: pick(rnd() < 0.6 ? knownColors : [...reachColors]) };
    else if (roll < 0.45) req = { shape: pick(rnd() < 0.6 ? knownShapes : [...reachShapes]) };
    else if (roll < 0.78) { const id = pick(known); req = { c1: Math.floor(id / 8), shape: id % 8 }; }
    else if (roll < 0.9 && level >= 5) { req = { pattern: 1 + Math.floor(rnd() * 4) }; if (rnd() < 0.4) req.c1 = pick(knownColors); }
    else if (weatherKinds.length && level >= 4) req = { mut: { rain: M.DEWY, night: M.MOONLIT, golden: M.GOLDEN, rainbow: M.RAINBOW }[pick(weatherKinds)] };
    else req = { c1: pick(knownColors) };
    if (!recent.includes(orderText(req))) break;
  }
  // reward from the value of a typical flower satisfying the request
  const est = makeFlower(req.c1 ?? C.RED, req.shape ?? S.BLOSSOM, req.pattern ?? P.PLAIN, null, req.mut ?? 0);
  const v = flowerValue(est);
  const qty = v <= 12 && rnd() < 0.5 ? 2 + Math.floor(rnd() * 2) : 1;
  return {
    req, qty, got: 0, age: 0,
    reward: Math.round((v * 5 * qty + 25) / 5) * 5,
    xp: Math.round(Math.sqrt(v) * 6 * qty + 12),
    visitor: Math.floor(rnd() * VISITORS.length),
  };
}

// ---- daily gift (retention hook) ----
export function dailyGift(streak, rnd) {
  const s = Math.min(streak, 7);
  const coins = 60 + 40 * s;
  // better seed on longer streaks
  const tier2 = COLORS.map((c, i) => [c, i]).filter(([c]) => c.tier === 2).map(([, i]) => i);
  const g = s >= 3
    ? makeFlower(tier2[Math.floor(rnd() * tier2.length)], s >= 5 ? (rnd() < 0.5 ? S.TULIP : S.STAR) : S.BLOSSOM, s >= 6 ? 1 + Math.floor(rnd() * 4) : 0)
    : makeFlower(BASICS[Math.floor(rnd() * 4)], rnd() < 0.5 ? S.BLOSSOM : S.DAISY);
  return { coins, seed: g };
}

export { speciesId };

// ---- decorations: long-term coin sink; each one adds a permanent bonus and appears in the garden ----
export const DECOR = [
  { id: 'birdbath', name: 'Birdbath', cost: 800, bonus: { sell: 0.05 }, text: '+5 % flower prices' },
  { id: 'bench', name: 'Garden Bench', cost: 2500, bonus: { xp: 0.1 }, text: '+10 % gardener XP' },
  { id: 'arch', name: 'Rose Arch', cost: 7000, bonus: { grow: 0.06 }, text: 'Flowers grow 6 % faster' },
  { id: 'lanterns', name: 'Paper Lanterns', cost: 20000, bonus: { sell: 0.08 }, text: '+8 % flower prices' },
  { id: 'windmill', name: 'Windmill', cost: 60000, bonus: { bee: 0.1 }, text: 'Bees fly 10 % faster' },
  { id: 'fountain', name: 'Fountain', cost: 180000, bonus: { sell: 0.12 }, text: '+12 % flower prices' },
  { id: 'gazebo', name: 'Gazebo', cost: 500000, bonus: { xp: 0.15 }, text: '+15 % gardener XP' },
  { id: 'greenhouse', name: 'Greenhouse', cost: 1500000, bonus: { grow: 0.12 }, text: 'Flowers grow 12 % faster' },
  { id: 'statue', name: 'Golden Bee Statue', cost: 5000000, bonus: { sell: 0.25 }, text: '+25 % flower prices' },
  { id: 'rainbow', name: 'Rainbow Bridge', cost: 20000000, bonus: { mut: 0.5 }, text: 'Weather mutations 50 % more likely' },
];
export function decorBonus(owned) {
  const b = { sell: 0, xp: 0, grow: 0, bee: 0, mut: 0 };
  for (const d of DECOR) if (owned[d.id]) for (const k in d.bonus) b[k] += d.bonus[k];
  return b;
}

// ---- achievements: a ladder of goals so there is always a next thing within reach ----
const tiers = (id, name, stat, goals, reward, fmt) => goals.map((goal, i) => ({ id: `${id}${i}`, name: `${name} ${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}`, stat, goal, reward: reward(goal, i), text: fmt(goal) }));
export const ACHIEVEMENTS = [
  ...tiers('disc', 'Botanist', 'discoveries', [5, 12, 25, 45, 70, 100], (g, i) => 100 * Math.pow(3.2, i), (g) => `Discover ${g} species`),
  ...tiers('harv', 'Harvester', 'harvests', [25, 150, 600, 2500, 10000], (g, i) => 80 * Math.pow(3.4, i), (g) => `Harvest ${g.toLocaleString('en-US')} blooms`),
  ...tiers('seed', 'Seed Keeper', 'seeds', [15, 100, 500, 2000], (g, i) => 90 * Math.pow(3.4, i), (g) => `Collect ${g.toLocaleString('en-US')} seeds`),
  ...tiers('ord', 'Good Neighbour', 'orders', [3, 15, 50, 150], (g, i) => 150 * Math.pow(3.3, i), (g) => `Fill ${g} visitor orders`),
  ...tiers('plot', 'Landscaper', 'plots', [10, 16, 24, 32, 37], (g, i) => 120 * Math.pow(3.5, i), (g) => `Own ${g} garden plots`),
  ...tiers('lvl', 'Green Thumb', 'level', [5, 10, 15, 20, 30], (g, i) => 200 * Math.pow(3.5, i), (g) => `Reach gardener level ${g}`),
  ...tiers('mut', 'Weather Watcher', 'mutations', [1, 3, 5], (g, i) => 300 * Math.pow(4, i), (g) => `Grow ${g} kind${g > 1 ? 's' : ''} of weather mutation`),
  ...tiers('dec', 'Decorator', 'decor', [1, 3, 6, 10], (g, i) => 400 * Math.pow(4, i), (g) => `Place ${g} decoration${g > 1 ? 's' : ''}`),
].map((a) => ({ ...a, reward: Math.round(a.reward / 10) * 10 }));

// ---- Flower Book collection rewards ----
export const colorRowReward = (ci) => 400 * TIER_REWARD[COLORS[ci].tier];
export const shapeColReward = (si) => 1500 * TIER_REWARD[SHAPES[si].tier];
const TIER_REWARD = [0, 1, 3, 9, 27];
export const discoveryCoins = (g) => Math.round(flowerValue({ ...g, pattern: 0, mut: 0 }) * 4 + 10);

// ---- daily special order (same request for everyone on a given day, scaled to the player's progress) ----
export function dailySpecial(dateStr, level, book, rnd) {
  const o = makeOrder(Math.max(level, 5), book, rnd, [], []);
  o.special = true;
  o.date = dateStr;
  o.qty = 1;
  o.reward = Math.round((o.reward * 6 + 200) / 50) * 50;
  o.xp = o.xp * 4;
  o.visitor = -1;             // the Queen Bee
  return o;
}
