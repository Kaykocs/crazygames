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
    // play the tutorial like a brand-new player: follow the pointing hand with real taps and drags
    const touch = !!VIEWS[name].hasTouch;
    const cdp = touch ? await ctx.newCDPSession(page) : null;
    const tap = async (x, y) => { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
    const drag = async (x0, y0, x1, y1, steps = 12) => {
      if (touch) {
        const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
        for (let k = 1; k <= steps; k++) { const t = k / steps; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) }); await page.waitForTimeout(16); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(x0, y0); await page.mouse.down();
        for (let k = 1; k <= steps; k++) { const t = k / steps; await page.mouse.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); await page.waitForTimeout(16); }
        await page.mouse.up();
      }
    };
    const state = () => page.evaluate(() => {
      const G = __game, st = G._tutStep(), sp = st?.spec?.(G), h = sp?.hand;
      return { t: G.garden.s.tutorial, key: st?.key || null, hand: h ? { tap: h.tap ? { x: h.tap.x, y: h.tap.y } : null, drag: h.drag || null } : null,
        card: !!document.querySelector('.card-pop:not(.leaving) .btn'), text: document.querySelector('.tut-bubble .txt')?.textContent || '' };
    });
    const seen = new Set();
    let shots = 0;
    const shot = async (tag) => page.screenshot({ path: `shots/${name}-t${String(++shots).padStart(2, '0')}-${tag}.png` });
    const t0 = Date.now();
    for (let k = 0; k < 160; k++) {
      const st = await state();
      if (st.t >= 99 && !st.card) break;
      if (st.key && !seen.has(st.key)) {
        seen.add(st.key); await page.waitForTimeout(300); await shot(st.key); console.log(`[${name}] step ${st.key}: "${st.text}"`);
        if (st.key === 'collect') console.log(`[${name}]   orb/hand`, await page.evaluate(() => { const id = [...__game.view.orbs.keys()][0]; const o = __game.view.orbScreen(id); const r = document.querySelector('.tut-hand')?.getBoundingClientRect(); return JSON.stringify({ orb: [Math.round(o.x), Math.round(o.y)], hand: r ? [Math.round(r.left + 12), Math.round(r.top + 6)] : null }); }));
      }
      if (st.card) {
        if (!seen.has('card' + st.t)) { seen.add('card' + st.t); await page.waitForTimeout(700); await shot('card'); }
        await page.locator('.card-pop:not(.leaving) .btn').first().click();
        await page.waitForTimeout(500);
        continue;
      }
      if (st.hand?.drag) { const d = st.hand.drag; await drag(d.x0, d.y0, d.x1, d.y1); await page.waitForTimeout(450); }
      else if (st.hand?.tap) { await tap(st.hand.tap.x, st.hand.tap.y); await page.waitForTimeout(st.key === 'harvest' ? 100 : 260); }
      else await page.waitForTimeout(300);
    }
    const after = await page.evaluate(() => { const g = __game.garden; return { tut: g.s.tutorial, quest: g.currentQuest()?.id, coins: g.s.coins, level: g.s.level, bestCombo: g.s.stats.bestCombo, book: g.discoveredCount() }; });
    console.log(`[${name}] tutorial played in ${((Date.now() - t0) / 1000).toFixed(0)} s (headless):`, JSON.stringify(after));
    if (after.tut < 99) { errors++; console.log(`[${name}] tutorial did not finish`); }
    await page.waitForTimeout(1400);
    await shot('quest-hint');
    // the first quest: tap the quest chip for a hint, then buy a plot where the hand points
    let hint = await page.evaluate(() => { const h = __game.hint && __game._hintSpec(__game.hint.kind); return h?.hand?.tap || null; });
    if (!hint) {
      const chip = await page.evaluate(() => { const r = document.querySelector('.chip.goal').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await tap(chip.x, chip.y);
      await page.waitForTimeout(600);
      hint = await page.evaluate(() => { const h = __game.hint && __game._hintSpec(__game.hint.kind); return h?.hand?.tap || null; });
    }
    console.log(`[${name}] quest hint points at`, JSON.stringify(hint));
    if (hint) { await tap(hint.x, hint.y); await page.waitForTimeout(900); }
    const q2 = await page.evaluate(() => ({ quest: __game.garden.currentQuest()?.id, plots: __game.garden.ownedCount() }));
    console.log(`[${name}] after following the quest hint`, JSON.stringify(q2));
    if (q2.quest === 'plot') { errors++; console.log(`[${name}] first quest (buy a plot) not completed by its hint`); }
    await shot('quest2');
    // the golden bee: appears, gets tapped, pays out
    await page.evaluate(() => { __game.debug.golden(); __game.debug.step(17); __game.debug.sim(3.5); __game.debug.freeze(); });
    const gbp = await page.evaluate(() => { const gb = __game.view.golden; return gb.on ? gb.screen(__game.stage) : null; });
    await shot('golden');
    if (gbp) {
      const c0 = await page.evaluate(() => __game.garden.s.coins);
      await tap(gbp.x, gbp.y);
      await page.evaluate(() => __game.debug.unfreeze());
      await page.waitForTimeout(300);
      const c1 = await page.evaluate(() => __game.garden.s.coins);
      console.log(`[${name}] golden bee caught: +${c1 - c0} coins`);
      if (c1 <= c0) { errors++; console.log(`[${name}] golden bee tap failed`); }
      await shot('golden-caught');
    }
    else { errors++; console.log(`[${name}] golden bee did not appear`); }
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
