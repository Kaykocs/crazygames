// Renders the three CrazyGames cover images (landscape 1920x1080, portrait 800x1200, square 800x800) from the
// game's ?cover= mode into crazygames-upload/2-covers/. Only the game title appears as text, as the cover rules require.
//   node tools/covers.mjs
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = 'crazygames-upload/2-covers';
mkdirSync(OUT, { recursive: true });
const ctx = await esbuild.context({ entryPoints: ['src/main.js'], bundle: true, outfile: 'game.js', format: 'iife', define: { __DEV__: 'false' }, logLevel: 'error' });
const { port } = await ctx.serve({ servedir: '.', port: 0, host: '127.0.0.1' });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mock = readFileSync('tools/mock-sdk.js', 'utf8');
const SIZES = { landscape: [1920, 1080], portrait: [800, 1200], square: [800, 800] };
for (const [kind, [w, h]] of Object.entries(SIZES)) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(240000);
  await page.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: mock }));
  page.on('pageerror', (e) => console.log(kind, 'pageerror', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?reset&quality=high&debug&cover=${kind}`);
  await page.waitForFunction(() => window.__game && window.__game.coverReady, null, { timeout: 240000 });
  // let the blooms open fully and the bees settle, then freeze a frame
  await page.evaluate(() => { __game.debug.freeze(); for (let i = 0; i < 12; i++) __game.debug.sim(0.5); });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  // a layout pass may have resized (cleared) the canvas while frozen: draw the final frame right before the shot
  await page.evaluate(() => __game.debug.sim(0.1));
  await page.screenshot({ path: `${OUT}/cover-${kind}-${w}x${h}.png`, animations: 'disabled' });
  console.log('wrote', `${OUT}/cover-${kind}-${w}x${h}.png`);
  await page.close();
}
await browser.close();
await ctx.dispose();
