// Production build → dist/ (index.html + one minified JS bundle + one CSS file + the font) and a zip of it in
// build/ that can be uploaded to the CrazyGames developer portal as-is (index.html at the zip root).
//   node tools/build.mjs
import * as esbuild from 'esbuild';
import { rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
mkdirSync('build', { recursive: true });

await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  outfile: 'dist/game.js',
  format: 'iife',
  target: ['es2020', 'safari14'],
  define: { __DEV__: 'false', __VERSION__: JSON.stringify(pkg.version) },
  legalComments: 'none',
  logLevel: 'warning',
});
await esbuild.build({
  entryPoints: ['styles/game.css'],
  bundle: true,
  minify: true,
  outfile: 'dist/game.css',
  loader: { '.woff2': 'file' },
  assetNames: 'assets/[name]-[hash]',
  logLevel: 'warning',
});

// index.html: same file as dev, pointed at the built stylesheet
let html = readFileSync('index.html', 'utf8');
html = html.replace('href="styles/game.css"', 'href="game.css"');
if (!html.includes('href="game.css"')) throw new Error('index.html: stylesheet link not found');
if (!html.includes('src="game.js"')) throw new Error('index.html: game.js script tag not found');
writeFileSync('dist/index.html', html);

// report
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk('dist');
let total = 0, totalGz = 0;
for (const f of files) {
  const b = readFileSync(f);
  total += b.length;
  const gz = /\.(js|css|html)$/.test(f) ? gzipSync(b).length : b.length;
  totalGz += gz;
  console.log(`  ${f.padEnd(40)} ${(b.length / 1024).toFixed(1).padStart(8)} KB   (${(gz / 1024).toFixed(1)} KB gz)`);
}
console.log(`  ${files.length} files, ${(total / 1024).toFixed(1)} KB (${(totalGz / 1024).toFixed(1)} KB over the wire)`);

const zipName = `build/${pkg.name}-${pkg.version}.zip`;
rmSync(zipName, { force: true });
execFileSync('zip', ['-r', '-q', '-X', '../' + zipName, '.'], { cwd: 'dist' });
console.log(`  upload package: ${zipName} (${(statSync(zipName).size / 1024).toFixed(1)} KB)`);
