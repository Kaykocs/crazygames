// Frame-time probe: plays a mature garden in real time and records every frame interval during typical actions
// (idle, mouse sweeps, wheel zoom, buying a plot, a decoration reveal, opening the Flower Book). Reports the median,
// 95th percentile and worst frame per scenario, so freezes show up as numbers.
//   node tools/perf.mjs [--w=1920] [--h=1080] [--dpr=1] [--q=high]
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const W = +(args.w || 1920), H = +(args.h || 1080), DPR = +(args.dpr || 1), Q = args.q || 'high';
const ctx = await esbuild.context({ entryPoints: ['src/main.js'], bundle: true, outfile: 'game.js', format: 'iife', define: { __DEV__: 'false' }, logLevel: 'error' });
const { port } = await ctx.serve({ servedir: '.', port: 0, host: '127.0.0.1' });
const browser = await chromium.launch({ args: args.gpu ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync('tools/mock-sdk.js', 'utf8') }));
await page.addInitScript(() => {
  window.__ft = [];
  let last = 0;
  const loop = (t) => { if (last) window.__ft.push(t - last); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
await page.goto(`http://127.0.0.1:${port}/index.html?reset&quality=${Q}&debug`);
await page.waitForFunction(() => window.__game && document.getElementById('loading') == null, null, { timeout: 120000 });
await page.evaluate(() => {
  const G = __game, g = G.garden;
  G.debug.skipTutorial(); G.debug.coins(3e6); G.debug.level(12);
  for (const id of ['birdbath', 'bench', 'arch', 'lanterns', 'fountain']) g.buyDecor(id);
  for (let i = 0; i < 14; i++) { const j = g.plots.findIndex((p, k) => !p.owned && g.canBuyPlot(k)); if (j >= 0) g.buyPlot(j); }
  let n = 0;
  g.plots.forEach((p, i) => { if (p.owned && !p.plant) { const c = n % 16, s = n % 8; n++; g.addSeed({ c1: c, c2: 3, shape: s, pattern: n % 5, mut: n % 7 === 0 ? 3 : 0 }); g.plant(i, g.s.pouch.length - 1); const pl = g.plots[i].plant; if (pl) pl.t = pl.dur; } });
  G.ui.cards.length = 0; document.querySelectorAll('.card-pop .btn').forEach((b) => b.click());
});
await page.waitForTimeout(3000);
const stats = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { frames: a.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), worst: +s[s.length - 1].toFixed(1), over50: a.filter((x) => x > 50).length }; };
async function measure(name, fn) {
  await page.evaluate(() => { window.__ft = []; });
  await fn();
  const ft = await page.evaluate(() => window.__ft.slice());
  console.log(name.padEnd(18), JSON.stringify(stats(ft.length ? ft : [0])));
}
const cx = W / 2, cy = H / 2;
await measure('idle', async () => { await page.waitForTimeout(3000); });
await measure('mouse sweep', async () => {
  for (let k = 0; k < 3; k++) for (let i = 0; i <= 60; i++) { await page.mouse.move(cx - 420 + i * 14, cy - 150 + Math.sin(i * 0.3) * 120); await page.waitForTimeout(8); }
});
await measure('wheel zoom', async () => {
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
  await page.waitForTimeout(1500);
});
await measure('drag pan', async () => {
  await page.mouse.move(60, cy); await page.mouse.down();
  for (let i = 0; i < 40; i++) { await page.mouse.move(60 + i * 12, cy + i * 3); await page.waitForTimeout(16); }
  await page.mouse.up(); await page.waitForTimeout(1200);
});
await measure('buy plot', async () => {
  await page.evaluate(() => { const g = __game.garden; const j = g.plots.findIndex((p, k) => !p.owned && g.canBuyPlot(k)); if (j >= 0) g.buyPlot(j); });
  await page.waitForTimeout(2500);
});
await measure('decor reveal', async () => {
  await page.evaluate(() => { __game.ui.openShop('decor'); __game.garden.buyDecor('windmill'); });
  await page.waitForTimeout(4000);
});
await measure('open book', async () => {
  await page.evaluate(() => __game.ui.openBook());
  await page.waitForTimeout(1500);
  await page.evaluate(() => __game.ui.closePanel(true));
});
await measure('night weather', async () => { await page.evaluate(() => __game.debug.weather('night')); await page.waitForTimeout(3000); });
await page.evaluate(() => __game.debug.weather('clear'));
await page.waitForTimeout(1500);
// what costs what: JS time per frame vs total, and frame time with individual passes switched off
const js = await page.evaluate(() => { const t0 = performance.now(); for (let i = 0; i < 10; i++) __game._frame(1 / 60); return +((performance.now() - t0) / 10).toFixed(2); });
console.log('js per frame      ', js, 'ms');
if (args.layers) {
  for (const [name, fn] of [
    ['no overlay/post', () => { const w = __game.world; w._ov = w.overlay; w._po = w.post; w.overlay = () => {}; w.post = () => {}; }],
    ['no sprites', () => { const s = __game.stage; s._col = s.layers.map((l) => l.collect); s.layers.forEach((l) => { l._c = l.collect; l.collect = null; }); }],
    ['no ground', () => { const g = __game.stage.ground; g._d = g.draw; g.draw = () => {}; }],
  ]) {
    await page.evaluate(fn);
    await measure(name, async () => { await page.waitForTimeout(2500); });
  }
}
await browser.close();
await ctx.dispose();
