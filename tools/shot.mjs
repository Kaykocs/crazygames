// Headless screenshots + smoke test. Serves the repo with esbuild (dev bundle) or dist/ (--dist), routes the
// CrazyGames SDK CDN to tools/mock-sdk.js, loads the game at several viewports and saves PNGs to shots/.
// Fails (exit 1) on page errors or console errors.
//   node tools/shot.mjs [--dist] [--only=desktop|phone|landscape] [--play] [--q=medium]
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { extname, join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
mkdirSync('shots', { recursive: true });

// --- server
let url, stop;
if (args.dist) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
    const p = join('dist', decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    try { const b = readFileSync(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
    catch { res.writeHead(404); res.end(); }
  }).listen(0);
  url = `http://127.0.0.1:${srv.address().port}/index.html`;
  stop = () => srv.close();
} else {
  const ctx = await esbuild.context({ entryPoints: ['src/main.js'], bundle: true, outfile: 'game.js', format: 'iife', define: { __DEV__: 'true' }, logLevel: 'error' });
  const { port } = await ctx.serve({ servedir: '.', port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${port}/index.html`;
  stop = () => ctx.dispose();
}

const VIEWS = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  small: { viewport: { width: 821, height: 462 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36' },
};
const only = args.only ? String(args.only).split(',') : ['desktop', 'phone', 'landscape'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let errors = 0;
const mock = readFileSync('tools/mock-sdk.js', 'utf8');

for (const name of only) {
  const ctx = await browser.newContext(VIEWS[name]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  await page.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: mock }));
  page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log(`[${name}] console.error:`, m.text()); } else if (args.verbose) console.log(`[${name}]`, m.type(), m.text()); });
  page.on('pageerror', (e) => { errors++; console.log(`[${name}] pageerror:`, e.message); });
  page.on('response', (r) => { if (r.status() >= 400) console.log(`[${name}] HTTP ${r.status()}:`, r.url()); });
  const q = args.q ? `&quality=${args.q}` : '';
  const t0 = Date.now();
  await page.goto(`${url}?reset${q}${args.dist ? '&debug' : ''}`);
  await page.waitForFunction(() => window.__game && document.getElementById('loading') == null || document.getElementById('loading')?.classList.contains('done'), null, { timeout: 90000 });
  console.log(`[${name}] booted in ${Date.now() - t0} ms`);
  await page.waitForTimeout(1500);
  await page.screenshot({ animations: 'disabled', path: `shots/${name}-0-start.png` });
  if (args.beauty) {
    // a mature garden without the tutorial, for judging the full-quality look
    await page.evaluate(() => {
      const G = __game, g = G.garden;
      G.debug.skipTutorial(); G.debug.coins(30000000); G.debug.level(9);
      for (const id of ['birdbath', 'bench', 'arch', 'lanterns', 'windmill', 'fountain', 'gazebo', 'greenhouse', 'statue', 'rainbow']) g.buyDecor(id);
      g.s.upgrades.gnome = 1; G.world.decor.setGnome(true);
      g.s.coins = 9000;
      for (let i = 0; i < 16; i++) { const j = g.plots.findIndex((p, k) => !p.owned && g.canBuyPlot(k)); if (j >= 0) g.buyPlot(j); }
      const genes = [[0, 0, 0], [1, 1, 0], [2, 2, 0], [6, 3, 1], [7, 4, 0], [8, 5, 2], [4, 6, 0], [5, 7, 0], [12, 0, 3], [13, 2, 0], [14, 3, 0], [11, 1, 4], [10, 4, 0], [9, 5, 0], [15, 6, 1], [3, 7, 0], [7, 3, 2], [6, 0, 0], [2, 1, 0], [0, 5, 1], [1, 4, 3], [12, 6, 0], [7, 0, 0]];
      let n = 0;
      g.plots.forEach((p, i) => { if (p.owned && !p.plant && n < genes.length) { const [c, s, pt] = genes[n++]; g.addSeed({ c1: c, c2: 3, shape: s, pattern: pt, mut: n === 5 ? 3 : n === 11 ? 4 : n === 17 ? 2 : 0 }); g.plant(i, g.s.pouch.findIndex((e) => e.g.c1 === c && e.g.shape === s)); const pl = g.plots[i].plant; pl.t = pl.dur - 0.01; } });
      g.s.pouch = [];
      for (const [c, s] of [[6, 0], [7, 3], [12, 1], [4, 2], [15, 6]]) g.addSeed({ c1: c, c2: 3, shape: s, pattern: 0, mut: 0 }, 1 + (c % 3));
      G.ui.dirty.pouch = true;
    });
    const dismiss = async () => { for (let k = 0; k < 40 && (await page.evaluate(() => !!document.querySelector('.card-pop:not(.leaving)') || __game.ui.cards.length)); k++) { await page.evaluate(() => { __game.ui.cards.length = 0; document.querySelectorAll('.card-pop:not(.leaving) .btn').forEach((b) => b.click()); }); await page.waitForTimeout(300); } };
    await page.evaluate(() => __game.debug.sim(4));
    await dismiss();
    await page.evaluate(() => { __game.garden.plots.forEach((p) => { if (p.plant) { p.plant.g.mut = p.plant.g.mut || 0; } }); __game.debug.sim(2); });
    await dismiss();
    await page.waitForTimeout(800);
    await page.screenshot({ animations: 'disabled', path: `shots/${name}-beauty-clear.png` });
    for (const w of ['golden', 'night', 'rainbow', 'rain']) {
      await page.evaluate((w) => { __game.debug.weather(w); __game.debug.sim(7); }, w);
      await dismiss();
      await page.waitForTimeout(600);
      await page.screenshot({ animations: 'disabled', path: `shots/${name}-beauty-${w}.png` });
    }
  }
  if (args.panels) {
    // every menu / card once, on a mid-game save
    await page.evaluate(() => { const G = __game; G.debug.skipTutorial(); G.debug.coins(250000); G.debug.level(12); G.ui.cards.length = 0; document.querySelectorAll('.card-pop .btn').forEach((b) => b.click()); });
    await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelectorAll('.card-pop .btn').forEach((b) => b.click()));
    await page.waitForTimeout(700);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ animations: 'disabled', path: `shots/${name}-p-${tag}.png` }); };
    for (const [tag, fn] of [
      ['upgrades', () => __game.ui.openShop('upgrades')], ['decor', () => __game.ui.openShop('decor')],
      ['goals', () => __game.ui.openBook('goals')], ['settings', () => __game.ui.openSettings()],
    ]) { await page.evaluate(fn); await snap(tag); await page.evaluate(() => __game.ui.closePanel(true)); await page.waitForTimeout(300); }
    await page.evaluate(() => { const g = __game.garden; g.addXp(Math.max(1, (typeof g.s.xp === 'number' ? 0 : 0) + 400000)); });
    await snap('levelup');
    await page.evaluate(() => { document.querySelectorAll('.card-pop .btn').forEach((b) => b.click()); __game.ui.cards.length = 0; });
    await page.waitForTimeout(600);
    await page.evaluate(() => { const g = __game.garden; g.s.daily.last = ''; g.claimDaily('2099-1-1', '2098-12-31'); });
    await snap('daily');
  }
  if (args.play) {
    // play the tutorial through real input
    const g = () => page.evaluate(() => ({ step: __game.garden.s.tutorial, pouch: __game.garden.s.pouch.length, seeds: __game.garden.s.seeds.length }));
    const tapChip = async (i = 0) => { const loc = page.locator('.seedchip').nth(i); if (await loc.count()) await loc.click({ timeout: 10000, force: true }); };
    const tapWorld = async (x, y, z) => {
      const p = await page.evaluate(([x, y, z]) => __game.view.project(x, y, z), [x, y, z]);
      if (VIEWS[name].hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    };
    await tapChip(0);
    const c = await page.evaluate(() => ({ ...__game.garden.pos[__game.garden.byKey.get('0,0')] }));
    await tapWorld(c.x, 0.2, c.z);
    await page.waitForTimeout(300);
    await tapChip(0);
    const n = await page.evaluate(() => { const g = __game.garden; const j = g.nb[g.byKey.get('0,0')].find((k) => g.plots[k].owned && !g.plots[k].plant); return { ...g.pos[j] }; });
    await tapWorld(n.x, 0.2, n.z);
    console.log(`[${name}] after planting`, await g());
    await page.evaluate(() => __game.debug.sim(2));
    await page.waitForTimeout(400);
    await page.screenshot({ animations: 'disabled', path: `shots/${name}-1-growing.png` });
    for (let k = 0; k < 40 && !(await page.evaluate(() => __game.garden.s.seeds.length > 0)); k++) await page.evaluate(() => __game.debug.sim(1));
    await page.evaluate(() => __game.debug.sim(0.6));
    await page.waitForTimeout(400);
    await page.screenshot({ animations: 'disabled', path: `shots/${name}-2-seed.png` });
    const orb = await page.evaluate(() => { const o = [...__game.view.orbs.keys()][0]; return __game.view.orbScreen(o); });
    if (VIEWS[name].hasTouch) await page.touchscreen.tap(orb.x, orb.y); else await page.mouse.click(orb.x, orb.y);
    await page.waitForTimeout(600);
    console.log(`[${name}] after collect`, await g());
    // harvest a bloom
    const bloom = await page.evaluate(() => { const g = __game.garden; const i = g.plots.findIndex((p, k) => g.isBloom(k)); return i >= 0 ? __game.view.headPos(i) : null; });
    if (bloom) await tapWorld(bloom.x, bloom.y, bloom.z);
    await page.waitForTimeout(700);
    await page.screenshot({ animations: 'disabled', path: `shots/${name}-3-harvest.png` });
    // plant the hybrid
    const k = await page.evaluate(() => __game.garden.s.pouch.findIndex((e) => e.g.c1 === 6));
    await tapChip(Math.max(0, k));
    const e = await page.evaluate(() => { const g = __game.garden; const i = g.plots.findIndex((p) => p.owned && !p.plant); return { ...g.pos[i] }; });
    await tapWorld(e.x, 0.2, e.z);
    for (let k = 0; k < 60 && !(await page.evaluate(() => !!document.querySelector('.card-pop'))); k++) {
      const t0 = Date.now();
      await page.evaluate(() => __game.debug.sim(0.5));
      if (args.verbose) console.log(`[${name}] sim`, k, Date.now() - t0, 'ms', await page.evaluate(() => JSON.stringify({ step: __game.garden.s.tutorial, cards: __game.ui.cards.length, open: !!__game.ui.cardOpen, plants: __game.garden.plots.filter((p) => p.plant).map((p) => p.plant.stage + ':' + p.plant.g.c1 + ':' + p.plant.t.toFixed(1)) })));
    }
    await page.evaluate(() => __game.debug.sim(0.8));
    await page.waitForTimeout(900);
    await page.screenshot({ animations: 'disabled', path: `shots/${name}-4-discovery.png` });
    console.log(`[${name}] tutorial state`, await g());
    await page.waitForTimeout(2600);
    await page.evaluate(() => { document.querySelectorAll('.card-pop .btn').forEach((b) => b.click()); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { document.querySelectorAll('.card-pop .btn').forEach((b) => b.click()); });
    await page.waitForTimeout(600);
    // a richer garden for the beauty shots
    await page.evaluate(() => {
      const G = __game, g = G.garden;
      G.debug.coins(50000); G.debug.level(8);
      for (let i = 0; i < 12; i++) { const j = g.plots.findIndex((p, k) => !p.owned && g.canBuyPlot(k)); if (j >= 0) g.buyPlot(j); }
      const genes = [[0, 0], [1, 1], [2, 2], [6, 3], [7, 4], [8, 5], [4, 6], [5, 7], [12, 0], [13, 2], [14, 3], [11, 1], [10, 4], [9, 5], [15, 6], [3, 7], [7, 3], [6, 0], [2, 1]];
      let n = 0;
      g.plots.forEach((p, i) => { if (p.owned && !p.plant && n < genes.length) { const [c, s] = genes[n++]; g.addSeed({ c1: c, c2: 3, shape: s, pattern: n % 4 === 0 ? 2 : n % 5 === 0 ? 1 : 0, mut: 0 }); g.plant(i, g.s.pouch.length - 1); const pl = g.plots[i].plant; pl.t = pl.dur; } });
      document.querySelectorAll('.card-pop .btn').forEach((b) => b.click());
    });
    await page.evaluate(() => __game.debug.sim(3));
    await page.evaluate(() => document.querySelectorAll('.card-pop .btn').forEach((b) => b.click()));
    await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelectorAll('.card-pop .btn').forEach((b) => b.click()); __game.debug.sim(2); });
    await page.waitForTimeout(600);
    await page.screenshot({ animations: 'disabled', path: `shots/${name}-5-garden.png` });
    const dismiss = async () => { for (let k = 0; k < 12 && (await page.evaluate(() => !!document.querySelector('.card-pop:not(.leaving)'))); k++) { await page.evaluate(() => document.querySelectorAll('.card-pop:not(.leaving) .btn').forEach((b) => b.click())); await page.waitForTimeout(350); } };
    await dismiss();
    await page.screenshot({ animations: 'disabled', path: `shots/${name}-5-garden.png` });
    for (const w of ['golden', 'night', 'rain']) {
      await page.evaluate((w) => { __game.debug.weather(w); __game.debug.sim(6); }, w);
      await dismiss();
      await page.waitForTimeout(500);
      await page.screenshot({ animations: 'disabled', path: `shots/${name}-6-${w}.png` });
    }
    await page.evaluate(() => __game.debug.weather('clear'));
    // look around: drag the lawn and zoom with the wheel (desktop) — then let it settle
    if (!VIEWS[name].isMobile) {
      const vp = VIEWS[name].viewport;
      await page.mouse.move(vp.width * 0.08, vp.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(vp.width * 0.3, vp.height * 0.55, { steps: 6 });
      await page.mouse.up();
      await page.mouse.move(vp.width * 0.5, vp.height * 0.5);
      await page.mouse.wheel(0, -240);
      await page.evaluate(() => __game.debug.sim(0.6));
      await page.screenshot({ animations: 'disabled', path: `shots/${name}-6-pan.png` });
      const cam = await page.evaluate(() => ({ user: __game.view.user, cam: __game.stage.cam }));
      console.log(`[${name}] after pan/zoom`, JSON.stringify(cam));
      // a drag that starts on a buyable plot pans; a clean click buys it
      await page.evaluate(() => { __game.view.user.x = 0; __game.view.user.y = 0; __game.view.user.zoom = 1; __game.view._applyCam(true); __game.debug.coins(1e6); __game.debug.sim(0.3); });
      const plot = await page.evaluate(() => { const g = __game.garden; const i = g.plots.findIndex((p, k) => !p.owned && g.canBuyPlot(k)); const w = g.pos[i]; const pt = __game.view.project(w.x - 0.45, 0.1, w.z + 0.25); return { i, x: pt.x, y: pt.y }; });
      const owned = () => page.evaluate((i) => __game.garden.plots[i].owned, plot.i);
      await page.mouse.move(plot.x, plot.y); await page.mouse.down(); await page.mouse.move(plot.x + 80, plot.y + 10, { steps: 5 }); await page.mouse.up();
      const afterDrag = await owned();
      await page.evaluate(() => { __game.view.user.x = 0; __game.view.user.y = 0; __game.view._applyCam(true); __game.debug.sim(0.2); });
      await page.mouse.click(plot.x, plot.y);
      const afterClick = await owned();
      console.log(`[${name}] buy by tap: drag=${afterDrag} click=${afterClick}`);
      if (afterDrag || !afterClick) { errors++; console.log(`[${name}] plot tap-to-buy check failed`); }
      // buying a decoration closes the shop and shows it off
      await page.evaluate(() => { __game.debug.coins(5000); __game.ui.openShop(); __game.garden.buyDecor('birdbath'); });
      await page.evaluate(() => __game.debug.sim(1.2));
      await page.screenshot({ animations: 'disabled', path: `shots/${name}-6-decor.png` });
      await page.evaluate(() => __game.debug.sim(10));
    }
    await page.evaluate(() => __game.ui.openShop());
    await page.waitForTimeout(700);
    await page.screenshot({ animations: 'disabled', path: `shots/${name}-7-shop.png` });
    await page.evaluate(() => { __game.ui.closePanel(true); __game.ui.openBook(); });
    await page.waitForTimeout(700);
    await page.screenshot({ animations: 'disabled', path: `shots/${name}-8-book.png` });
    const log = await page.evaluate(() => (window.__sdkLog || []).map((x) => x.n).filter((n) => !n.startsWith('data.')));
    console.log(`[${name}] sdk calls:`, log.join(' '));
    const perf = await page.evaluate(() => { const t0 = performance.now(); for (let i = 0; i < 20; i++) __game.stage.render(__game.time); return { msPerFrame: +((performance.now() - t0) / 20).toFixed(2), objects: __game.stage.list.length, q: __game.qName, dpr: __game.stage.dpr }; });
    console.log(`[${name}] render`, JSON.stringify(perf));
  }
  await ctx.close();
}
await browser.close();
stop();
if (errors) { console.log(`FAIL: ${errors} error(s)`); process.exit(1); }
console.log('OK');
