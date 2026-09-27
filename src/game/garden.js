// Garden simulation: plots, plants, bees, seeds, weather, orders, progression. Pure logic (no rendering),
// driven by tick(dt); everything that happens is reported through `emit` so the view, UI and audio can react.
// tools/sim.mjs runs it headless to balance the economy.
import { rng as makeRng } from '../core/math.js';
import { shapeHexagon, hexToWorld, DIRS, key } from './hex.js';
import {
  COLORS, SHAPES, M, breed, flowerValue, growTime, speciesId, makeFlower, C, S, MUTATIONS, sameGenes,
} from './genetics.js';
import {
  UPGRADES, upgradeCost, beeCount, beeSpeed, growMult, sellMult, pouchSize, canCharges, canRefill, gnomeInterval,
  xpForLevel, levelReward, UNLOCKS, unlocked, START_PLOTS, plotCost, SHOP_RESTOCK, shopStock, makeOrder, matches,
  orderText, dailyGift, harvestXp, ORDER_TTL, DECOR, decorBonus, ACHIEVEMENTS, colorRowReward, shapeColReward,
  discoveryCoins, dailySpecial,
} from './economy.js';
import { QUESTS } from './quests.js';

export const GARDEN_RADIUS = 3;
export const HIVE_POS = { x: -5.6, z: -4.4 };     // world units (hex size 1); the view places the hive model here
const BEE_SPEED = 2.6;                              // world units / s
const MAX_FLOATING = 6;
const SEED_AUTO_COLLECT = 25;                       // floating seeds drop into the pouch by themselves after this
const REGROW = 0.55;                                // regrow time as a fraction of the full grow time
const CROSS_REST = 8;                               // seconds a bloom rests after it was cross-pollinated
const MANUAL_SEED_AUTO = 3;                         // seeds from the player's own crosses fly to the pouch after this
const COMBO_WINDOW = 1.3;                           // seconds between harvests that keep a combo going
const TAP_GAIN = 0.14, TAP_FADE = 0.85;             // growth per tap (fraction of the grow time), fading per tap
const WEATHER = {
  rain: { dur: [45, 60], weight: 40, mut: M.DEWY, p: 0.3 },
  golden: { dur: [40, 55], weight: 25, mut: M.GOLDEN, p: 0.16 },
  night: { dur: [45, 60], weight: 25, mut: M.MOONLIT, p: 0.2 },
  rainbow: { dur: [30, 40], weight: 10, mut: M.RAINBOW, p: 0.12 },
};
export const OFFLINE_CAP = 8 * 3600;

function hashDate(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function newSave() {
  return {
    v: 2,
    t: 0,
    saved: Date.now(),
    coins: 40,
    xp: 0,
    level: 1,
    plots: shapeHexagon(GARDEN_RADIUS).map((c) => ({ q: c.q, r: c.r, owned: Math.abs(c.q) + Math.abs(c.r) + Math.abs(-c.q - c.r) <= 2, plant: null })),
    pouch: [{ g: makeFlower(C.RED, S.BLOSSOM), n: 1 }, { g: makeFlower(C.BLUE, S.BLOSSOM), n: 1 }],
    upgrades: {},
    book: {},
    orders: [null, null, null],
    orderT: 6,
    shop: null,
    weather: { kind: 'clear', until: 150, total: 150 },
    can: { charges: 3, t: 0 },
    seeds: [],
    tutorial: 0,
    stats: { harvests: 0, discoveries: 0, orders: 0, seeds: 0, play: 0, sessions: 0, earned: 0, mutMask: 0, plants: 0, crosses: 0, boosts: 0, bestCombo: 0, golden: 0, waters: 0 },
    quest: { i: 0, base: 0 },
    daily: { last: '', streak: 0 },
    decor: {},
    ach: {},
    rows: {},
    cols: {},
    special: null,
    seed: (Math.random() * 2 ** 31) | 0,
  };
}

export class Garden {
  constructor(save, emit = () => {}) {
    this.s = save;
    this.emit = emit;
    this.rnd = makeRng((save.seed ^ (save.t * 1000)) >>> 0);
    this.plots = save.plots;
    this.byKey = new Map(this.plots.map((p, i) => [key(p.q, p.r), i]));
    this.pos = this.plots.map((p) => hexToWorld(p.q, p.r, 1));
    this.nb = this.plots.map((p) => DIRS.map(([dq, dr]) => this.byKey.get(key(p.q + dq, p.r + dr))).filter((i) => i !== undefined));
    this.bees = [];
    this.syncBees();
    this.mutT = 0;
    this.seedId = 1 + save.seeds.reduce((m, s) => Math.max(m, s.id), 0);
    this.recentOrders = [];
    this.tutorialSpeed = 1;
    this.combo = 0; this.comboT = -99;
    if (!save.quest) save.quest = { i: 0, base: 0 };
    if (!save.shop) this.restock();
  }

  // ------------------------------------------------------------------------------------------ queries
  get level() { return this.s.level; }
  get coins() { return this.s.coins; }
  has(key) { return unlocked(this.s.level, key); }
  ownedCount() { return this.plots.reduce((n, p) => n + (p.owned ? 1 : 0), 0); }
  pouchCap() { return pouchSize(this.s.upgrades); }
  pouchFree() { return this.pouchCap() - this.s.pouch.length; }       // free *kinds*; identical seeds stack
  pouchCount() { return this.s.pouch.reduce((n, e) => n + e.n, 0); }
  canAccept(g) { return this.pouchFree() > 0 || this.s.pouch.some((e) => sameGenes(e.g, g)); }
  // add one seed to the pouch (stacking identical genes). Returns the entry index or -1 when there is no room.
  addSeed(g, n = 1) {
    const clean = { ...g, mut: 0 };
    const k = this.s.pouch.findIndex((e) => sameGenes(e.g, clean));
    if (k >= 0) { this.s.pouch[k].n += n; return k; }
    if (this.pouchFree() <= 0) return -1;
    this.s.pouch.push({ g: clean, n });
    return this.s.pouch.length - 1;
  }
  bookSet() { return new Set(Object.keys(this.s.book).map(Number)); }
  discoveredCount() { return Object.keys(this.s.book).length; }
  isBloom(i) { const p = this.plots[i].plant; return !!p && p.stage === 'bloom'; }
  canBuyPlot(i) {
    const p = this.plots[i];
    return !p.owned && this.nb[i].some((j) => this.plots[j].owned);
  }
  nextPlotCost() { return plotCost(this.ownedCount()); }
  weatherKinds() { return Object.keys(WEATHER).filter((k) => this.has(k)); }
  get bonus() { return decorBonus(this.s.decor); }
  sellValue(g) { return Math.round(flowerValue(g) * sellMult(this.s.upgrades) * (1 + this.bonus.sell)); }
  plantDuration(g) { return (growTime(g) * growMult(this.s.upgrades)) / (1 + this.bonus.grow); }
  earn(n) { this.s.coins += n; this.s.stats.earned += n; }
  statValue(stat) {
    const st = this.s.stats;
    switch (stat) {
      case 'plots': return this.ownedCount();
      case 'level': return this.s.level;
      case 'decor': return Object.keys(this.s.decor).length;
      case 'upgrades': return Object.values(this.s.upgrades).reduce((n, v) => n + v, 0);
      case 'mutations': { let n = 0, m = st.mutMask; while (m) { n += m & 1; m >>= 1; } return n; }
      default: return st[stat] || 0;
    }
  }
  // the unfinished achievement closest to completion (shown in the HUD as the next goal)
  nextGoal() {
    let best = null, bestK = -1;
    for (const a of ACHIEVEMENTS) {
      if (this.s.ach[a.id]) continue;
      const k = Math.min(1, this.statValue(a.stat) / a.goal);
      if (k > bestK) { bestK = k; best = a; }
    }
    return best ? { ...best, value: this.statValue(best.stat), k: bestK } : null;
  }
  // the starter quest in progress (null once the chain is done or during the tutorial)
  currentQuest() {
    const s = this.s;
    if (s.tutorial < 99) return null;
    const q = QUESTS[s.quest.i];
    if (!q) return null;
    const value = Math.max(0, this.statValue(q.stat) - (q.abs ? 0 : s.quest.base));
    return { ...q, value: Math.min(value, q.goal), k: Math.min(1, value / q.goal) };
  }
  startQuests() { this.s.quest = { i: 0, base: 0 }; this._beginQuest(); }
  _beginQuest() { const q = QUESTS[this.s.quest.i]; this.s.quest.base = q && !q.abs ? this.statValue(q.stat) : 0; }
  _checkQuest() {
    const q = this.currentQuest();
    if (!q || q.value < q.goal) return;
    const got = { coins: q.reward.coins || 0, seeds: [] };
    if (got.coins) this.earn(got.coins);
    for (const [c1, shape, n] of q.reward.seeds || []) {
      const g = makeFlower(c1, shape);
      if (this.addSeed(g, n) >= 0) got.seeds.push({ g, n });
      else { const c = flowerValue(g) * 3 * n; got.coins += c; this.earn(c); }     // no room: pay out instead
    }
    this.s.quest.i++;
    this._beginQuest();
    this.emit('quest', { q, got, next: this.currentQuest() });
  }
  checkAchievements() {
    this._checkQuest();
    for (const a of ACHIEVEMENTS) {
      if (this.s.ach[a.id] || this.statValue(a.stat) < a.goal) continue;
      this.s.ach[a.id] = Date.now();
      this.earn(a.reward);
      this.emit('achievement', { a });
    }
  }
  speedNow() { return (this.s.weather.kind === 'rain' ? 2 : 1) * this.tutorialSpeed; }

  // ------------------------------------------------------------------------------------------ actions
  plant(i, pouchIdx) {
    const p = this.plots[i];
    const e = this.s.pouch[pouchIdx];
    if (!p || !p.owned || p.plant || !e) return false;
    const g = e.g;
    if (--e.n <= 0) this.s.pouch.splice(pouchIdx, 1);
    p.plant = { g: { ...g, mut: 0 }, stage: 'grow', t: 0, dur: this.plantDuration(g), bloomT: 0, pollenT: 0, harvests: 0, taps: 0 };
    this.s.stats.plants = (this.s.stats.plants || 0) + 1;
    this.emit('plant', { i, g });
    this.checkAchievements();
    return true;
  }

  harvest(i, { auto = false } = {}) {
    const p = this.plots[i];
    if (!p || !p.plant || p.plant.stage !== 'bloom') return null;
    const pl = p.plant, g = pl.g;
    const value = this.sellValue(g);
    let delivered = null;
    for (let k = 0; k < this.s.orders.length && !auto; k++) {
      const o = this.s.orders[k];
      if (o && o.got < o.qty && matches(o.req, g) && o.reward / o.qty >= value * 0.9) { delivered = k; break; }
    }
    pl.stage = 'grow';
    pl.t = pl.dur * (1 - REGROW);
    pl.taps = 0;
    pl.harvests++;
    // quick harvests in a row build a combo that multiplies the coins (×1.25, ×1.5 … up to ×2)
    let combo = 0;
    if (!auto) {
      this.combo = this.s.t - this.comboT <= COMBO_WINDOW ? this.combo + 1 : 1;
      this.comboT = this.s.t;
      combo = this.combo;
      if (combo > (this.s.stats.bestCombo || 0)) this.s.stats.bestCombo = combo;
    }
    const mult = 1 + 0.25 * Math.min(4, Math.max(0, combo - 1));
    pl.g.mut = pl.g.mut === M.GIANT ? M.GIANT : 0;       // weather mutations wash off; giants stay giant
    this.s.stats.harvests++;
    let coins = 0;
    if (delivered !== null) {
      const o = this.s.orders[delivered];
      o.got++;
      this.emit('order:progress', { k: delivered, i, g });
      if (o.got >= o.qty) this._completeOrder(delivered);
    } else if (!auto && this.s.special && !this.s.special.done && matches(this.s.special.req, g)) {
      delivered = 'special';
      const o = this.s.special;
      o.done = true;
      this.earn(o.reward);
      this.s.stats.orders++;
      this.emit('order:done', { k: 'special', order: o });
      this.addXp(o.xp);
    } else {
      coins = auto ? Math.round(value * 0.6) : Math.round(value * mult);
      this.earn(coins);
    }
    this.addXp(harvestXp(flowerValue(g)));
    this.emit('harvest', { i, g, coins, delivered, auto, combo });
    this.checkAchievements();
    return { coins, delivered };
  }

  // remove a plant and get its seed back (nothing is ever lost)
  dig(i) {
    const p = this.plots[i];
    if (!p || !p.plant) return false;
    const g = { ...p.plant.g, mut: 0 };
    if (this.addSeed(g) < 0) { this.emit('pouchFull', {}); return false; }
    p.plant = null;
    this.emit('dig', { i, g });
    return true;
  }

  water(i) {
    const p = this.plots[i];
    if (!p || !p.plant || p.plant.stage !== 'grow' || this.s.can.charges <= 0) return false;
    this.s.can.charges--;
    p.plant.t = Math.min(p.plant.dur, p.plant.t + p.plant.dur * 0.4);
    this.s.stats.waters = (this.s.stats.waters || 0) + 1;
    this.emit('water', { i });
    this.checkAchievements();
    return true;
  }

  // tap a growing plant to make it grow: each tap in a growth cycle helps a little less than the one before
  boost(i) {
    const pl = this.plots[i]?.plant;
    if (!pl || pl.stage !== 'grow') return null;
    const k = pl.taps || 0;
    const frac = this.s.tutorial < 99 ? 0.26 : TAP_GAIN * Math.pow(TAP_FADE, k);
    pl.taps = k + 1;
    const before = pl.t;
    pl.t = Math.min(pl.dur, pl.t + pl.dur * frac);
    this.s.stats.boosts = (this.s.stats.boosts || 0) + 1;
    const out = { i, taps: pl.taps, gain: (pl.t - before) / pl.dur, k: pl.t / pl.dur };
    this.emit('boost', out);
    return out;
  }

  // the player carries pollen from bloom a to bloom b: an instant cross, and both blooms rest for a moment
  canCross(a, b) {
    return a !== b && a >= 0 && b >= 0 && this.isBloom(a) && this.isBloom(b) && this.plots[a].plant.pollenT <= 0 && this.plots[b].plant.pollenT <= 0;
  }
  resting(i) { const pl = this.plots[i]?.plant; return pl && pl.stage === 'bloom' ? Math.max(0, pl.pollenT) : 0; }
  cross(a, b) {
    if (!this.canCross(a, b)) return null;
    const A = this.plots[a].plant, B = this.plots[b].plant;
    let child = breed(A.g, B.g, this.rnd);
    if (this.forceChild) { child = { ...this.forceChild }; this.forceChild = null; }   // tutorial: a guaranteed wow
    A.pollenT = B.pollenT = CROSS_REST;
    this.s.stats.crosses = (this.s.stats.crosses || 0) + 1;
    const seed = this._spawnSeed(child, b, a, true);
    this.emit('cross', { a, b, g: child, seed });
    this.addXp(2);
    return seed;
  }

  // a golden bee was caught: a handful of coins scaled to the garden's progress
  catchGolden() {
    let best = 0;
    this.plots.forEach((p) => { if (p.plant) best = Math.max(best, this.sellValue(p.plant.g)); });
    const coins = Math.round(Math.max(40 + 25 * this.s.level, best * 6) / 5) * 5;
    this.earn(coins);
    this.s.stats.golden = (this.s.stats.golden || 0) + 1;
    this.addXp(5 + this.s.level);
    this.emit('golden', { coins });
    return coins;
  }

  collectSeed(id, { auto = false } = {}) {
    const k = this.s.seeds.findIndex((s) => s.id === id);
    if (k < 0) return false;
    const s = this.s.seeds[k];
    if (this.addSeed(s.g) < 0) { if (!auto) this.emit('pouchFull', {}); return false; }
    this.s.seeds.splice(k, 1);
    this.s.stats.seeds++;
    this.emit('seedCollected', { id, g: s.g, i: s.i, auto });
    this.checkAchievements();
    return true;
  }

  // sell one seed from a pouch stack (or the whole stack)
  sellSeed(idx, all = false) {
    const e = this.s.pouch[idx];
    if (!e) return 0;
    const n = all ? e.n : 1;
    const c = Math.max(1, Math.round(flowerValue(e.g) * 0.5)) * n;
    e.n -= n;
    if (e.n <= 0) this.s.pouch.splice(idx, 1);
    this.s.coins += c;
    this.emit('sellSeed', { g: e.g, coins: c, n });
    return c;
  }

  buyPlot(i) {
    if (!this.canBuyPlot(i)) return false;
    const cost = this.nextPlotCost();
    if (this.s.coins < cost) return false;
    this.s.coins -= cost;
    this.plots[i].owned = true;
    this.emit('plot', { i, cost });
    this.checkAchievements();
    return true;
  }

  buyUpgrade(k) {
    const u = UPGRADES[k];
    const lv = this.s.upgrades[k] || 0;
    if (!u || lv >= u.max || this.s.level < u.unlock) return false;
    const cost = upgradeCost(k, lv);
    if (this.s.coins < cost) return false;
    this.s.coins -= cost;
    this.s.upgrades[k] = lv + 1;
    if (k === 'bees') this.syncBees();
    if (k === 'can') this.s.can.charges = canCharges(this.s.upgrades);
    this.emit('upgrade', { k, level: lv + 1, cost });
    return true;
  }

  buyDecor(id) {
    const d = DECOR.find((x) => x.id === id);
    if (!d || this.s.decor[id] || this.s.coins < d.cost) return false;
    this.s.coins -= d.cost;
    this.s.decor[id] = Date.now();
    this.syncBees();
    this.emit('decor', { id, d });
    this.checkAchievements();
    return true;
  }

  // today's special request (one per day, big reward)
  ensureSpecial(todayStr) {
    if (this.s.special && this.s.special.date === todayStr) return this.s.special;
    if (this.s.level < 3 || this.s.tutorial < 99) return null;
    const R = makeRng(hashDate(todayStr) ^ this.s.seed);
    this.s.special = dailySpecial(todayStr, this.s.level, this.bookSet(), R);
    this.emit('special', { order: this.s.special });
    return this.s.special;
  }

  buySeed(idx) {
    const it = this.s.shop.stock[idx];
    if (!it || it.sold || this.s.coins < it.price) return false;
    if (!this.canAccept(it.g)) { this.emit('pouchFull', {}); return false; }
    this.s.coins -= it.price;
    it.sold = true;
    this.addSeed(it.g);
    this.emit('buySeed', { g: it.g, price: it.price });
    return true;
  }

  restock() {
    this.s.shop = { stock: shopStock(this.s.level, this.rnd), at: this.s.t + SHOP_RESTOCK };
    this.emit('restock', {});
  }

  swapOrder(k) {
    const o = this.s.orders[k];
    if (!o || o.got > 0) return false;
    this.s.orders[k] = null;
    this.s.orderT = 1.5;
    this.emit('order:swap', { k });
    return true;
  }

  claimDaily(todayStr, yesterdayStr) {
    const d = this.s.daily;
    if (d.last === todayStr) return null;
    d.streak = d.last === yesterdayStr ? d.streak + 1 : 1;
    d.last = todayStr;
    const gift = dailyGift(d.streak, this.rnd);
    this.s.coins += gift.coins;
    this.addSeed(gift.seed);
    this.emit('daily', { ...gift, streak: d.streak });
    return { ...gift, streak: d.streak };
  }

  addXp(n) {
    this.s.xp += Math.round(n * (1 + this.bonus.xp));
    while (this.s.xp >= xpForLevel(this.s.level)) {
      this.s.xp -= xpForLevel(this.s.level);
      this.s.level++;
      const reward = levelReward(this.s.level);
      this.earn(reward);
      const unlocks = UNLOCKS.filter((u) => u.level === this.s.level);
      const ups = Object.entries(UPGRADES).filter(([, u]) => u.unlock === this.s.level).map(([k]) => k);
      if (ups.includes('can')) this.s.can.charges = canCharges(this.s.upgrades);
      this.emit('level', { level: this.s.level, reward, unlocks, upgrades: ups });
    }
    this.checkAchievements();
  }

  _completeOrder(k) {
    const o = this.s.orders[k];
    this.earn(o.reward);
    this.s.stats.orders++;
    this.recentOrders.push(orderText(o.req));
    if (this.recentOrders.length > 6) this.recentOrders.shift();
    this.s.orders[k] = null;
    this.s.orderT = 6 + this.rnd() * 8;
    this.emit('order:done', { k, order: o });
    this.addXp(o.xp);
  }

  // ------------------------------------------------------------------------------------------ simulation
  syncBees() {
    const n = beeCount(this.s.upgrades);
    while (this.bees.length < n) {
      this.bees.push({ id: this.bees.length, state: 'home', t: 0, dur: 0, rest: 0.5 + this.bees.length * 0.7, from: { ...HIVE_POS }, to: { ...HIVE_POS }, a: -1, b: -1, chain: 0 });
    }
  }

  tick(dt) {
    const s = this.s;
    s.t += dt;
    s.stats.play += dt;
    this._weather(dt);
    this._plants(dt);
    this._bees(dt);
    this._seeds(dt);
    this._orders(dt);
    // shop restock
    if (s.shop && s.t >= s.shop.at) this.restock();
    // watering can refill
    const maxC = canCharges(s.upgrades);
    if (s.can.charges < maxC) {
      s.can.t += dt;
      if (s.can.t >= canRefill(s.upgrades)) { s.can.t = 0; s.can.charges++; this.emit('can', { charges: s.can.charges }); }
    } else s.can.t = 0;
    // gnome helper
    const gi = gnomeInterval(s.upgrades);
    if (gi && this.has('gnome')) {
      this.gnomeT = (this.gnomeT || 0) + dt;
      if (this.gnomeT >= gi) {
        this.gnomeT = 0;
        // oldest bloom that has had time to be pollinated
        let best = -1, bestT = 18;
        this.plots.forEach((p, i) => { if (p.plant?.stage === 'bloom' && p.plant.bloomT > bestT) { bestT = p.plant.bloomT; best = i; } });
        if (best >= 0) { this.emit('gnome', { i: best }); this.harvest(best, { auto: true }); }
      }
    }
  }

  _weather(dt) {
    const w = this.s.weather;
    if (this.s.tutorial < 99) return;              // clear skies until the tutorial is finished
    if (this.s.t < w.until) {
      if (w.kind !== 'clear') {
        this.mutT += dt;
        if (this.mutT >= 8) { this.mutT = 0; this._mutateBlooms(0.25); }
      }
      return;
    }
    if (w.kind === 'clear') {
      const kinds = this.weatherKinds();
      if (!kinds.length) { w.until = this.s.t + 60; return; }
      const k = kinds[this.rnd.weighted(kinds.map((x) => WEATHER[x].weight))];
      const [a, b] = WEATHER[k].dur;
      const dur = a + this.rnd() * (b - a);
      Object.assign(w, { kind: k, until: this.s.t + dur, total: dur });
    } else {
      const dur = 100 + this.rnd() * 60;
      Object.assign(w, { kind: 'clear', until: this.s.t + dur, total: dur });
    }
    this.mutT = 0;
    this.emit('weather', { kind: w.kind, dur: w.total });
  }

  _mutateBlooms(scale) {
    const wk = WEATHER[this.s.weather.kind];
    if (!wk) return;
    this.plots.forEach((p, i) => {
      const pl = p.plant;
      if (pl?.stage === 'bloom' && !pl.g.mut && this.rnd() < wk.p * scale * (1 + this.bonus.mut)) {
        pl.g.mut = wk.mut;
        this._record(pl.g);
        this.emit('mutate', { i, g: pl.g });
      }
    });
  }

  _plants(dt) {
    const speed = this.speedNow();
    const wk = WEATHER[this.s.weather.kind];
    this.plots.forEach((p, i) => {
      const pl = p.plant;
      if (!pl) return;
      if (pl.stage === 'grow') {
        pl.t += dt * speed;
        if (pl.t >= pl.dur) {
          pl.t = pl.dur;
          pl.stage = 'bloom';
          pl.bloomT = 0;
          pl.pollenT = 0;
          if (wk && this.rnd() < wk.p * (1 + this.bonus.mut)) pl.g.mut = wk.mut;
          else if (!pl.g.mut && this.rnd() < 0.01) pl.g.mut = M.GIANT;
          const isNew = this._record(pl.g);
          this.emit('bloom', { i, g: pl.g, isNew });
        }
      } else {
        pl.bloomT += dt;
        pl.pollenT = Math.max(0, pl.pollenT - dt);
      }
    });
  }

  // Flower Book bookkeeping. Returns true when this is a brand-new species.
  _record(g) {
    const id = speciesId(g);
    let e = this.s.book[id];
    const isNew = !e;
    if (!e) e = this.s.book[id] = { n: 0, pat: 0, mut: 0, t: Date.now() };
    e.n++;
    const newPat = !(e.pat & (1 << g.pattern));
    const newMut = g.mut && !(e.mut & (1 << g.mut));
    e.pat |= 1 << g.pattern;
    if (g.mut) { e.mut |= 1 << g.mut; this.s.stats.mutMask |= 1 << g.mut; }
    if (isNew) {
      this.s.stats.discoveries++;
      const tiers = COLORS[g.c1].tier + SHAPES[g.shape].tier;
      const coins = discoveryCoins(g);
      this.earn(coins);
      this.addXp(15 * tiers);
      this.emit('discover', { g, id, coins });
      this._bookRewards(g);
    } else if (newPat || newMut) this.emit('variant', { g, id, pattern: newPat, mut: newMut });
    this.checkAchievements();
    return isNew;
  }

  // completing every shape of a colour, or every colour of a shape, pays a collection bonus
  _bookRewards(g) {
    const book = this.s.book;
    if (!this.s.rows[g.c1] && SHAPES.every((_, si) => book[g.c1 * 8 + si])) {
      this.s.rows[g.c1] = 1;
      const r = colorRowReward(g.c1);
      this.earn(r);
      this.emit('collection', { kind: 'color', index: g.c1, reward: r });
    }
    if (!this.s.cols[g.shape] && COLORS.every((_, ci) => book[ci * 8 + g.shape])) {
      this.s.cols[g.shape] = 1;
      const r = shapeColReward(g.shape);
      this.earn(r);
      this.emit('collection', { kind: 'shape', index: g.shape, reward: r });
    }
  }

  // bloomed neighbour pairs a bee could work on
  _pairs() {
    const out = [];
    if (this.s.tutorial < 99 && !this.tutBees) return out;     // the tutorial teaches crossing by hand first
    const busy = new Set();
    for (const b of this.bees) if (b.a >= 0) { busy.add(b.a); busy.add(b.b); }
    this.plots.forEach((p, a) => {
      if (!this.isBloom(a) || p.plant.pollenT > 0 || busy.has(a)) return;
      for (const b of this.nb[a]) {
        if (!this.isBloom(b) || busy.has(b)) continue;
        const ga = p.plant.g, gb = this.plots[b].plant.g;
        const w = (ga.c1 !== gb.c1 ? 1.6 : 1) * (ga.shape !== gb.shape ? 1.3 : 1);
        out.push({ a, b, w });
      }
    });
    return out;
  }

  _bees(dt) {
    const speed = BEE_SPEED * beeSpeed(this.s.upgrades) * (1 + this.bonus.bee) * this.tutorialSpeed;
    for (const bee of this.bees) {
      bee.t += dt;
      switch (bee.state) {
        case 'home':
          bee.rest -= dt;
          if (bee.rest <= 0) {
            if (this.s.seeds.length >= MAX_FLOATING) { bee.rest = 2; break; }
            const pairs = this._pairs();
            if (!pairs.length) { bee.rest = 1.2; break; }
            const pk = pairs[this.rnd.weighted(pairs.map((x) => x.w))];
            this._fly(bee, 'toA', this.pos[pk.a], speed);
            bee.a = pk.a; bee.b = pk.b;
          }
          break;
        case 'toA': case 'toB': case 'back':
          if (bee.t >= bee.dur) {
            bee.t = 0;
            if (bee.state === 'back') { bee.state = 'home'; bee.rest = 1.2 + this.rnd() * 1.5; bee.a = bee.b = -1; bee.chain = 0; break; }
            // the target may have been harvested on the way
            const target = bee.state === 'toA' ? bee.a : bee.b;
            if (!this.isBloom(target)) { this._fly(bee, 'back', HIVE_POS, speed); break; }
            bee.state = bee.state === 'toA' ? 'atA' : 'atB';
            bee.dur = 0.9;
            this.emit(bee.state === 'atA' ? 'bee:visit' : 'bee:pollinate', { bee: bee.id, i: target, g: this.plots[target].plant.g });
          }
          break;
        case 'atA':
          if (bee.t >= bee.dur) {
            if (!this.isBloom(bee.b)) { this._fly(bee, 'back', HIVE_POS, speed); break; }
            this._fly(bee, 'toB', this.pos[bee.b], speed);
          }
          break;
        case 'atB':
          if (bee.t >= bee.dur) {
            if (this.isBloom(bee.a) && this.isBloom(bee.b) && this.plots[bee.a].plant.pollenT <= 0 && this.plots[bee.b].plant.pollenT <= 0) {
              const A = this.plots[bee.a].plant, B = this.plots[bee.b].plant;
              let child = breed(A.g, B.g, this.rnd);
              if (this.forceChild) { child = { ...this.forceChild }; this.forceChild = null; }
              A.pollenT = B.pollenT = 9;
              this._spawnSeed(child, bee.b, bee.a);
            }
            bee.chain++;
            // chain straight to another pair if there is one close by, otherwise head home
            const here = this._beePos(bee);
            bee.a = bee.b = -1;
            const pairs = bee.chain < 3 ? this._pairs() : [];
            if (pairs.length && this.s.seeds.length < MAX_FLOATING) {
              const pk = pairs[this.rnd.weighted(pairs.map((x) => x.w))];
              bee.a = pk.a; bee.b = pk.b;
              this._fly(bee, 'toA', this.pos[pk.a], speed, here);
            } else this._fly(bee, 'back', HIVE_POS, speed, here);
          }
          break;
      }
    }
  }

  _fly(bee, state, to, speed, from = this._beePos(bee)) {
    bee.from = from; bee.to = { x: to.x, z: to.z };
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    bee.dur = Math.max(0.6, d / speed + 0.25);
    bee.t = 0;
    bee.state = state;
  }

  // logical bee position (the view adds the flight arc and wobble)
  _beePos(bee) {
    if (bee.state === 'home') return { ...HIVE_POS };
    if (bee.state === 'atA') return { ...this.pos[bee.a] };
    if (bee.state === 'atB') return { ...this.pos[bee.b] };
    const k = Math.min(1, bee.t / Math.max(1e-3, bee.dur));
    return { x: bee.from.x + (bee.to.x - bee.from.x) * k, z: bee.from.z + (bee.to.z - bee.from.z) * k };
  }

  _spawnSeed(g, i, from, manual = false) {
    const seed = { id: this.seedId++, g, i, from, age: 0, manual };
    this.s.seeds.push(seed);
    this.emit('seed', seed);
    return seed;
  }

  _seeds(dt) {
    for (const sd of [...this.s.seeds]) {
      sd.age += dt;
      const wait = sd.manual ? (this.s.tutorial < 99 ? 7 : MANUAL_SEED_AUTO) : SEED_AUTO_COLLECT;
      if (sd.age > wait && this.canAccept(sd.g)) this.collectSeed(sd.id, { auto: true });
    }
  }

  _orders(dt) {
    if (!this.has('orders') || this.s.tutorial < 99) return;
    // visitors who waited long enough without any delivery move on (keeps impossible asks from clogging a slot)
    this.s.orders.forEach((o, k) => {
      if (!o) return;
      o.age = (o.age || 0) + dt;
      if (o.age > ORDER_TTL && o.got === 0) { this.s.orders[k] = null; this.s.orderT = Math.min(this.s.orderT, 4); this.emit('order:leave', { k, order: o }); }
    });
    const empty = this.s.orders.findIndex((o) => !o);
    if (empty < 0) return;
    this.s.orderT -= dt;
    if (this.s.orderT > 0) return;
    const o = makeOrder(this.s.level, this.bookSet(), this.rnd, this.weatherKinds(), this.recentOrders);
    this.recentOrders.push(orderText(o.req));
    if (this.recentOrders.length > 6) this.recentOrders.shift();
    this.s.orders[empty] = o;
    this.s.orderT = 10 + this.rnd() * 10;
    this.emit('order:new', { k: empty, order: o });
  }

  // Catch up on time spent away: growth, bee seeds (straight into the pouch) and the gnome. No weather.
  offline(seconds) {
    const t = Math.min(OFFLINE_CAP, Math.max(0, seconds));
    if (t < 30) return null;
    const report = { seconds: t, bloomed: 0, seeds: 0, coins: 0 };
    const emitSave = this.emit;
    const events = [];
    this.emit = (name, p) => events.push([name, p]);
    const step = 5;
    const beeRate = beeCount(this.s.upgrades) * beeSpeed(this.s.upgrades) / 9;     // seeds / s while pairs exist
    let beeAcc = 0;
    const coins0 = this.s.coins;
    for (let e = 0; e < t; e += step) {
      this.s.t += step;
      this.plots.forEach((p) => {
        const pl = p.plant;
        if (pl && pl.stage === 'grow') {
          pl.t += step;
          if (pl.t >= pl.dur) { pl.t = pl.dur; pl.stage = 'bloom'; pl.bloomT = 0; report.bloomed++; this._record(pl.g); }
        } else if (pl) pl.bloomT += step;
      });
      beeAcc += beeRate * step;
      while (beeAcc >= 1) {
        beeAcc -= 1;
        const pairs = this._pairs();
        if (!pairs.length) break;
        const pk = pairs[this.rnd.weighted(pairs.map((x) => x.w))];
        if (this.addSeed(breed(this.plots[pk.a].plant.g, this.plots[pk.b].plant.g, this.rnd)) < 0) break;
        report.seeds++;
      }
      const gi = gnomeInterval(this.s.upgrades);
      if (gi && this.has('gnome')) {
        this.gnomeT = (this.gnomeT || 0) + step;
        while (this.gnomeT >= gi) {
          this.gnomeT -= gi;
          const i = this.plots.findIndex((p) => p.plant?.stage === 'bloom' && p.plant.bloomT > 18);
          if (i >= 0) this.harvest(i, { auto: true });
        }
      }
      if (this.s.shop && this.s.t >= this.s.shop.at) this.restock();
    }
    // floating seeds from last session land in the pouch
    for (const sd of [...this.s.seeds]) this.collectSeed(sd.id, { auto: true });
    this.s.can.charges = canCharges(this.s.upgrades);
    report.coins = this.s.coins - coins0;
    report.discoveries = events.filter(([n]) => n === 'discover').map(([, p]) => p.g);
    this.emit = emitSave;
    for (const [n, p] of events) if (n === 'level') this.emit(n, p);
    return report;
  }
}

export { MUTATIONS, UPGRADES, upgradeCost };
