// Dev server: bundles src/main.js on every request (esbuild, in memory) and serves the repo root.
//   node tools/dev.mjs [port]      → http://localhost:8080
// Useful URL params: ?level=12 (jump to a level), ?reset (wipe the save), ?mock-sdk (use tools/mock-sdk.js
// instead of the CrazyGames CDN script, e.g. offline), ?debug (show the FPS / state overlay).
import * as esbuild from 'esbuild';

const port = +(process.argv[2] || process.env.PORT || 8080);
const ctx = await esbuild.context({
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'game.js',
  format: 'iife',
  target: ['es2020'],
  sourcemap: 'inline',
  define: { __DEV__: 'true' },
  logLevel: 'info',
});
const { hosts } = await ctx.serve({ servedir: '.', port, host: '0.0.0.0' });
console.log(`dev server on http://localhost:${port}/  (${hosts.join(', ')})`);
