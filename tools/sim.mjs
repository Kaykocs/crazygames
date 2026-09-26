// Headless economy simulation: a bot plays the garden like a reasonable human and we log the pacing.
//   node tools/sim.mjs [minutes=90] [runs=3]
import { Garden, newSave } from '../src/game/garden.js';
import { flowerValue, speciesId, COLORS, SHAPES, SPECIES_COUNT } from '../src/game/genetics.js';
import { UPGRADES, upgradeCost, xpForLevel, DECOR, ACHIEVEMENTS } from '../src/game/economy.js';

const minutes = +(process.argv[2] || 90), runs = +(process.argv[3] || 3);

function run(seed, verbose) {
  const save = newSave();
  save.seed = seed;
  save.tutorial = 99;
  const events = {};
  const firsts = {};
  const g = new Garden(save, (name) => { events[name] = (events[name] || 0) + 1; if (!firsts[name]) firsts[name] = save.t; });
  const dt = 0.25;
  let nextAct = 0, nextLog = 300;
  const rows = [];
  const book = () => g.discoveredCount();
  while (save.t < minutes * 60) {
    g.tick(dt);
    if (save.t < nextAct) continue;
    nextAct = save.t + 1.2;              // a human does roughly one thing per second
    // collect seeds
    for (const sd of [...save.seeds]) { if (!g.collectSeed(sd.id)) break; }
    // harvest ripe blooms that bees had time to work on
    g.plots.forEach((p, i) => { if (p.plant?.stage === 'bloom' && p.plant.bloomT > 14) g.harvest(i); });
    // plant: novel species first, then most valuable
    const known = g.bookSet();
    const score = (e) => (known.has(speciesId(e.g)) ? 0 : 1000) + flowerValue(e.g);
    for (let i = 0; i < g.plots.length; i++) {
      const p = g.plots[i];
      if (!p.owned || p.plant || !save.pouch.length) continue;
      let best = 0;
      save.pouch.forEach((e, k) => { if (score(e) > score(save.pouch[best])) best = k; });
      g.plant(i, best);
    }
    // replace the weakest plant when a novel seed waits and no plot is free
    const novel = save.pouch.findIndex((e) => !known.has(speciesId(e.g)));
    if (novel >= 0 && !g.plots.some((p) => p.owned && !p.plant)) {
      let weak = -1, wv = Infinity;
      g.plots.forEach((p, i) => { if (p.plant && known.has(speciesId(p.plant.g)) && flowerValue(p.plant.g) < wv) { wv = flowerValue(p.plant.g); weak = i; } });
      if (weak >= 0 && g.canAccept(g.plots[weak].plant.g)) { g.dig(weak); g.plant(weak, save.pouch.findIndex((e) => !known.has(speciesId(e.g)))); }
    }
    // pouch hygiene: sell known low-value seeds when nearly full
    while (g.pouchFree() < 2) {
      let worst = -1, wv = Infinity;
      save.pouch.forEach((e, k) => { const v = (known.has(speciesId(e.g)) ? 0 : 1e6) + flowerValue(e.g); if (v < wv) { wv = v; worst = k; } });
      if (worst < 0 || wv >= 1e6) break;
      g.sellSeed(worst, true);
    }
    // buy: plots first, then upgrades
    for (let i = 0; i < g.plots.length; i++) if (g.canBuyPlot(i) && save.coins >= g.nextPlotCost() * 1.1) { g.buyPlot(i); break; }
    for (const k of ['bees', 'fert', 'market', 'pouch', 'wings', 'can', 'gnome']) {
      const lv = save.upgrades[k] || 0;
      if (lv < UPGRADES[k].max && save.level >= UPGRADES[k].unlock && save.coins >= upgradeCost(k, lv) * 1.3) g.buyUpgrade(k);
    }
    for (const d of DECOR) if (!save.decor[d.id] && save.coins > d.cost * 1.5) g.buyDecor(d.id);
    // shop: keep all four primaries around
    const onBoard = new Set(g.plots.filter((p) => p.plant).map((p) => p.plant.g.c1).concat(save.pouch.map((e) => e.g.c1)));
    save.shop.stock.forEach((it, k) => { if (!it.sold && COLORS[it.g.c1].tier === 1 && !onBoard.has(it.g.c1) && save.coins > it.price * 2) g.buySeed(k); });
    if (save.shop.stock[3] && !save.shop.stock[3].sold && save.coins > save.shop.stock[3].price * 3) g.buySeed(3);
    // water the slowest sprout
    if (save.can.charges > 0) {
      let slow = -1, rem = 0;
      g.plots.forEach((p, i) => { if (p.plant?.stage === 'grow' && p.plant.dur - p.plant.t > rem) { rem = p.plant.dur - p.plant.t; slow = i; } });
      if (slow >= 0 && rem > 20) g.water(slow);
    }
    if (save.t >= nextLog) {
      nextLog += 300;
      rows.push(`${String(Math.round(save.t / 60)).padStart(3)}m  pouch ${save.pouch.length}k/${g.pouchCount()}  lvl ${String(save.level).padStart(2)}  book ${String(book()).padStart(3)}/${SPECIES_COUNT}  plots ${g.ownedCount()}  coins ${String(save.coins).padStart(7)}  bees ${1 + (save.upgrades.bees || 0)}  decor ${Object.keys(save.decor).length}  ach ${Object.keys(save.ach).length}/${ACHIEVEMENTS.length}  harvests ${save.stats.harvests}  orders ${save.stats.orders}  seeds ${save.stats.seeds}  upgrades ${JSON.stringify(save.upgrades)}`);
    }
  }
  if (verbose) console.log(rows.join('\n'));
  const colors = new Set(Object.keys(save.book).map((id) => COLORS[Math.floor(id / 8)].name));
  const shapes = new Set(Object.keys(save.book).map((id) => SHAPES[id % 8].name));
  return { firsts, events, save, colors, shapes };
}

for (let r = 0; r < runs; r++) {
  const res = run(1000 + r * 77, r === 0);
  const f = res.firsts;
  const m = (s) => (s ? (s / 60).toFixed(1) + 'm' : '—');
  console.log(`run ${r}: first seed ${m(f.seed)}, first discovery ${m(f.discover)}, first order ${m(f['order:done'])}, lvl2 at ~${m(f.level)}, final lvl ${res.save.level}, book ${Object.keys(res.save.book).length}`);
  console.log(`   colours: ${[...res.colors].join(', ')}`);
  console.log(`   shapes: ${[...res.shapes].join(', ')}`);
  console.log(`   events: ${JSON.stringify(res.events)}`);
}
