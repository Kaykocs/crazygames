// Shared tuning + content constants. Nothing here imports anything.

export const GAME_TITLE = 'Buzz & Bloom';
export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
export const DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

// CrazyGames Basic Launch: no ads. Set to true for Full Launch — the midgame / rewarded flows in core/sdk.js
// and the "watch an ad" buttons in the UI switch on together.
export const ADS_ENABLED = false;

// Quality tiers. 'auto' picks one from the device at boot and can step down at runtime if frames drop.
// post = HDR post stack (bloom, tilt-shift, grade); with it, MSAA happens in the render target instead of the canvas.
export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 0, antialias: true, post: false, msaa: 0, tiltShift: false, particles: 0.5, grass: 0.4 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, antialias: false, post: true, msaa: 2, tiltShift: true, particles: 0.8, grass: 0.7 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, antialias: false, post: true, msaa: 4, tiltShift: true, particles: 1, grass: 1 },
};

export const DEFAULT_SETTINGS = { sfx: true, music: true, haptics: true, quality: 'auto' };
