// Stand-in for https://sdk.crazygames.com/crazygames-sdk-v3.js used by the headless tests (the real SDK is
// served from CrazyGames' CDN). Mirrors the v3 surface the game uses and records every call in window.__sdkLog.
(function () {
  const log = (window.__sdkLog = []);
  const rec = (n, a) => { log.push({ n, a, t: performance.now() }); };
  const store = new Map();
  const params = new URLSearchParams(location.search);
  let settings = { muteAudio: params.get('muteAudio') === 'true', disableChat: false };
  const listeners = new Set();
  window.__sdkMock = {
    setMute(m) { settings = { ...settings, muteAudio: m }; listeners.forEach((f) => f(settings)); },
    store,
  };
  window.CrazyGames = {
    SDK: {
      environment: 'local',
      isQaTool: false,
      async init() { rec('init'); await new Promise((r) => setTimeout(r, 30)); },
      game: {
        get settings() { return settings; },
        addSettingsChangeListener(f) { listeners.add(f); },
        removeSettingsChangeListener(f) { listeners.delete(f); },
        loadingStart() { rec('loadingStart'); },
        loadingStop() { rec('loadingStop'); },
        gameplayStart() { rec('gameplayStart'); },
        gameplayStop() { rec('gameplayStop'); },
        happytime() { rec('happytime'); },
        reportGameCompletedPercentage(p) { rec('completion', p); },
        setGameContext(c) { rec('context', c); },
        clearGameContext() { rec('clearContext'); },
      },
      ad: {
        requestAd(type, cb) { rec('requestAd', type); setTimeout(() => cb.adError?.({ code: 'adsDisabledBasicLaunch', message: 'during Basic Launch ads are disabled' }), 10); },
        async hasAdblock() { return false; },
      },
      banner: { async requestBanner() { throw { code: 'bannersDisabledBasicLaunch' }; }, clearAllBanners() {} },
      user: {
        isUserAccountAvailable: true,
        systemInfo: { countryCode: 'US', locale: 'en-US', device: { type: /Mobi/.test(navigator.userAgent) ? 'mobile' : 'desktop' }, os: { name: 'Linux' }, browser: { name: 'Chrome' }, applicationType: 'web' },
        async getUser() { return null; },
        addAuthListener() {},
      },
      data: {
        getItem(k) { rec('data.getItem', k); return store.has(k) ? store.get(k) : null; },
        setItem(k, v) { rec('data.setItem', k); store.set(k, String(v)); },
        removeItem(k) { store.delete(k); },
        clear() { store.clear(); },
      },
    },
  };
})();
