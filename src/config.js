// Shared tuning + content constants. Nothing here imports anything.

export const GAME_TITLE = 'Buzz & Bloom';
export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
export const DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

// CrazyGames Basic Launch: no ads. Set to true for Full Launch — the midgame / rewarded flows in core/sdk.js
// and the "watch an ad" buttons in the UI switch on together.
export const ADS_ENABLED = false;

// Quality tiers (resolution, particles, ambient life) live in art/stage.js; 'auto' picks one from the device
// at boot and steps down at runtime if frames drop.
export const DEFAULT_SETTINGS = { sfx: true, music: true, haptics: true, quality: 'auto' };
