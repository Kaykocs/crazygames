// CrazyGames HTML5 SDK v3 wrapper.
//
// The SDK script is included by index.html (<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js">).
// Everything here degrades to a silent no-op when the SDK is missing (blocked, offline, self-hosted), so the game
// never depends on it to run.
//
// Ads: the game ships for a CrazyGames *Basic Launch*, where no ads are shown. ADS_ENABLED (config.js) is false,
// so midgame()/rewarded() never call the ad module and the UI hides every ad-gated option. Flip the flag for
// Full Launch and the ad flow (pause + mute while the ad plays, reward only on adFinished) is already wired.
import { ADS_ENABLED } from '../config.js';
import { emit } from './events.js';

const INIT_TIMEOUT_MS = 6000;

class SDK {
  constructor() {
    this.cg = null;              // window.CrazyGames.SDK once initialised
    this.environment = 'none';   // 'crazygames' | 'local' | 'disabled' | 'none' (script missing)
    this.inGameplay = false;
    this.inLoading = false;
    this.adPlaying = false;
    this.settings = { muteAudio: false, disableChat: false };
    this.log = [];               // call log (read by the headless tests)
  }

  get available() { return !!this.cg && this.environment !== 'disabled'; }
  get adsEnabled() { return ADS_ENABLED && this.available; }

  _rec(name) { this.log.push(name); if (this.log.length > 400) this.log.shift(); }

  async init() {
    const g = window.CrazyGames && window.CrazyGames.SDK;
    if (!g) { console.info('[sdk] CrazyGames SDK not present — running standalone'); return; }
    try {
      await Promise.race([g.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('init timeout')), INIT_TIMEOUT_MS))]);
      this.cg = g;
      this.environment = g.environment || 'crazygames';
      this._rec('init:' + this.environment);
      if (this.environment === 'disabled') return;
      try {
        const s = g.game.settings;
        if (s) this.settings = { ...this.settings, ...s };
        g.game.addSettingsChangeListener?.((ns) => {
          this.settings = { ...this.settings, ...ns };
          emit('sdk:settings', this.settings);
        });
      } catch (e) { console.warn('[sdk] settings', e); }
    } catch (e) {
      console.warn('[sdk] init failed — running standalone', e);
      this.cg = null; this.environment = 'none';
    }
  }

  // ---- game module (guarded: every start/stop call is paired and never repeated) ----
  loadingStart() { if (this.inLoading) return; this.inLoading = true; this._call('loadingStart', () => this.cg.game.loadingStart()); }
  loadingStop() { if (!this.inLoading) return; this.inLoading = false; this._call('loadingStop', () => this.cg.game.loadingStop()); }
  gameplayStart() { if (this.inGameplay || this.adPlaying) return; this.inGameplay = true; this._call('gameplayStart', () => this.cg.game.gameplayStart()); }
  gameplayStop() { if (!this.inGameplay) return; this.inGameplay = false; this._call('gameplayStop', () => this.cg.game.gameplayStop()); }
  happytime() { this._call('happytime', () => this.cg.game.happytime()); }

  _call(name, fn) {
    this._rec(name);
    if (!this.available) return;
    try { fn(); } catch (e) { console.warn('[sdk]', name, e); }
  }

  // ---- data module: cloud-synced for logged-in players; localStorage fallback when the SDK is absent ----
  getItem(key) {
    if (this.available && this.cg.data) { try { return this.cg.data.getItem(key); } catch (e) { console.warn('[sdk] data.getItem', e); } }
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  setItem(key, value) {
    if (this.available && this.cg.data) { try { this.cg.data.setItem(key, value); return; } catch (e) { console.warn('[sdk] data.setItem', e); } }
    try { window.localStorage.setItem(key, value); } catch { /* private mode / quota */ }
  }
  removeItem(key) {
    if (this.available && this.cg.data) { try { this.cg.data.removeItem(key); return; } catch { /* ignore */ } }
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }

  // ---- ads (inert while ADS_ENABLED is false) ----
  // Resolves when the game may continue. Pauses gameplay + mutes audio for the ad's duration.
  midgame() { return this._ad('midgame').then(() => undefined); }
  // Resolves true only if the ad finished (grant the reward), false otherwise.
  rewarded() { return this._ad('rewarded'); }

  _ad(type) {
    if (!this.adsEnabled || this.adPlaying) return Promise.resolve(false);
    return new Promise((resolve) => {
      const wasPlaying = this.inGameplay;
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        this.adPlaying = false;
        emit('ad:end', { type, ok });
        if (wasPlaying) this.gameplayStart();
        resolve(ok);
      };
      try {
        this._rec('ad:' + type);
        this.cg.ad.requestAd(type, {
          adStarted: () => { this.adPlaying = true; this.gameplayStop(); emit('ad:start', { type }); },
          adFinished: () => done(true),
          adError: (err) => { console.info('[sdk] ad unavailable', err); done(false); },
        });
      } catch (e) { console.warn('[sdk] requestAd', e); done(false); }
    });
  }
}

export const sdk = new SDK();
