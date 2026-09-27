// Art lab renderer: bundles src/art/lab.js and screenshots a scene.
//   node tools/lab.mjs <scene> [w] [h]   → shots/lab-<scene>.png
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [scene = 'flowers', w = '1600', h = '1000', ...rest] = process.argv.slice(2);
mkdirSync('build/lab', { recursive: true });
await esbuild.build({ entryPoints: ['src/art/lab.js'], bundle: true, format: 'iife', outfile: 'build/lab/lab.js', logLevel: 'warning' });
writeFileSync('build/lab/index.html', `<!doctype html><html><body style="margin:0;background:#222"><script src="lab.js"></script></body></html>`);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
const t0 = Date.now();
await page.goto('file://' + resolve('build/lab/index.html') + `?scene=${scene}&w=${w}&h=${h}&${rest.join('&')}`);
await page.waitForFunction('window.__labDone', null, { timeout: 120000 });
const ms = Date.now() - t0;
mkdirSync('shots', { recursive: true });
await page.screenshot({ path: `shots/lab-${scene}.png` });
console.log(`rendered ${scene} in ${ms} ms`, errors.length ? '\nERRORS:\n' + errors.join('\n') : '');
await browser.close();
