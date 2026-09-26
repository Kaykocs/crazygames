// Persistence through the CrazyGames Data module (cloud-synced for logged-in players, local for guests) with a
// localStorage fallback when the SDK is absent. Saves are debounced; the SDK debounces again on its side.
import { sdk } from './sdk.js';

const KEY = 'buzzbloom.save.v1';
const SETTINGS_KEY = 'buzzbloom.settings.v1';

export function loadSave() {
  try {
    const raw = sdk.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v === 1 ? s : null;
  } catch (e) { console.warn('[save] corrupt save ignored', e); return null; }
}

let timer = null, pending = null;
export function saveSoon(state, delay = 1500) {
  pending = state;
  if (timer) return;
  timer = setTimeout(flush, delay);
}
export function flush() {
  clearTimeout(timer); timer = null;
  if (!pending) return;
  try {
    pending.saved = Date.now();
    sdk.setItem(KEY, JSON.stringify(pending));
  } catch (e) { console.warn('[save] failed', e); }
}
export function wipeSave() { sdk.removeItem(KEY); }

export function loadSettings(defaults) {
  try { const v = JSON.parse(sdk.getItem(SETTINGS_KEY)); return { ...defaults, ...(v || {}) }; } catch { return { ...defaults }; }
}
export function saveSettings(s) { try { sdk.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
