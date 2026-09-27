// Procedural audio engine (Web Audio). No audio files: every sound is synthesized when it plays, so the game
// downloads nothing but code.
//
//   audio.init()                    idempotent; call from a user gesture (browsers keep the context suspended until one)
//   audio.play(name, opts)          one-shot SFX from the SFX table below. opts (all optional): volume (×), pitch
//                                   (ratio; melodic parts snap it to the scale), step (musical step for pitched
//                                   sounds), delay (s), minGap (s; overrides the sound's own rate limit)
//   audio.setMute(reason, on)       hard mutes that stack: 'ad' (an ad is playing), 'sdk' (CrazyGames muteAudio
//                                   setting), 'hidden' (tab in background). Any active reason silences everything.
//   audio.setSfx(on) / setMusic(on) the player's own toggles (the ambience follows the SFX toggle)
//   audio.startMusic()              the generative score (music.js) and the ambience beds
//   audio.setAmbience(mode)         'day' | 'golden' | 'rainbow' (wind, leaves, birdsong), 'night' (crickets, a
//                                   frog now and then), 'rain' (rain on leaves)
//   audio.setMusicMood(m)           'play' | 'menu' (calmer; used at night)
//
// Palette: soft, warm and organic (wood, water, air, glass). Everything pitched is tuned to C major pentatonic,
// which sits inside both keys the score plays in (C and F major), so rewards always ring consonant over the
// music. Every voice drifts a little in pitch and timbre, so a sound heard hundreds of times never machine-guns.
// Loudness after the master chain (max 100 ms RMS): UI ≈ −24 dBFS, gameplay −20…−16, big rewards up to −12;
// critters and ambience sit well below.
//
// Graph: voices   → sfxBus ──┐
//        voices   → reverb ──┤
//        ambience → sfxBus   ├→ master → glue compressor → limiter → soft clip → destination
//        music    → musicBus ┘
// Every node a sound creates is disconnected when its last source ends, so nothing piles up.
import { Music } from './music.js';

const SCALE = [0, 2, 4, 7, 9]; // major pentatonic: any run of steps sounds musical
export const pentaFreq = (root, step) => {
  const oct = Math.floor(step / SCALE.length), deg = ((step % SCALE.length) + SCALE.length) % SCALE.length;
  return root * Math.pow(2, oct + SCALE[deg] / 12);
};

const C4 = 261.63, C5 = 523.25;
const note = (step, root = C5) => pentaFreq(root, step); // C5 D5 E5 G5 A5 | C6 D6 E6 G6 A6 | C7 …
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const cents = (c) => Math.pow(2, c / 1200);
const dB = (d) => Math.pow(10, d / 20);
// call sites pass free pitch ratios; melodic parts move by whole pentatonic steps instead so they stay in key
const pitchStep = (p) => (p > 0 && p !== 1 ? Math.round((12 * Math.log2(p)) / 2.4) : 0);
// opts.step as a whole number in [lo, hi] (def when missing or not a number)
const stepOf = (o, def, lo, hi) => (Number.isFinite(o.step) ? Math.max(lo, Math.min(hi, Math.round(o.step))) : def);

const SFX_GAIN = 0.9, MUSIC_GAIN = 0.62;
const MAX_VOICES = 40;   // sounds still ringing; above this only important sounds start
const CROWD = 18;        // critters and other background sounds give way above this many
// per-sound level trims (dB), set from offline measurements of the rendered output
const TRIM = {
  drop: -0.5, dig: 2, pop: 4, pick: 0, coin: 1, bloom: 3.5, flip: -3, clear: 5, unlock: -1, reward: -1, win: 0,
  levelUp: -0.8, discover: 0, combo: 1.4, star: 0, button: 0.5, toggle: 0.7, invalid: 0, whoosh: 0, water: 0,
  shuffle: 2, hammer: 2, ice: 3.5, fail: -1, start: 1, grow: 3.5, pollen: 5.5, cross: -1, seedPop: 5, golden: 6,
  goldenCatch: 3.5, quest: -0.5, tutStep: -2.5, hint: -2, buzz: 0, splash: -3, ribbit: 4, birdChirp: -5,
};
// default minimum spacing between two plays of the same sound (s)
const GAP = {
  button: 0.04, toggle: 0.04, hint: 0.5, tutStep: 0.25, drop: 0.03, dig: 0.05, pop: 0.025, pick: 0.03, seedPop: 0.06,
  grow: 0.035, pollen: 0.08, cross: 0.12, coin: 0.05, bloom: 0.08, flip: 0.05, buzz: 0.25, splash: 0.4, ribbit: 0.5,
  birdChirp: 0.3, invalid: 0.2, whoosh: 0.15, water: 0.1, combo: 0.15, reward: 0.15, star: 0.1, unlock: 0.2,
  clear: 0.2, quest: 0.4, win: 0.4, levelUp: 0.8, discover: 0.6, golden: 1, goldenCatch: 0.5, shuffle: 0.2,
  ice: 0.1, fail: 0.5, start: 0.5, hammer: 0.1,
};
const BACKGROUND = new Set(['buzz', 'birdChirp', 'splash', 'ribbit', 'flip', 'hint', 'seedPop']);
const IMPORTANT = new Set(['discover', 'levelUp', 'goldenCatch', 'golden', 'win', 'quest', 'reward', 'invalid', 'button', 'toggle']);
// ambience levels (linear, into the SFX bus)
const AMB = { out: 1, wind: 0.032, rustle: 0.014, rain: 0.028, patter: 0.17, rumble: 0.025, cricket: 0.012, bird: 0.065, frog: 0.35, drop: 0.6 };

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.mutes = new Set();
    this.sfxOn = true;
    this.musicOn = true;
    this.lastPlay = new Map();
    this.music = null;
    this.voices = 0;      // sounds whose nodes are still connected
    this._busy = [];      // end times of the sounds still ringing (voice cap)
    this._v = null;       // the voice being built (node bookkeeping)
    this._lvl = 1;
    this._bus = null;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { try { this.ctx = new AC(); } catch { return; } }
    const ctx = this.ctx;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const hp = (f) => { const n = ctx.createBiquadFilter(); n.type = 'highpass'; n.frequency.value = f; n.Q.value = 0.5; return n; };
    this.master = g(this._masterTarget());
    this.sfxBus = g(this.sfxOn ? SFX_GAIN : 0);
    this.musicBus = g(this.musicOn ? MUSIC_GAIN : 0);
    // no SFX needs anything under ~60 Hz (small speakers can't play it and it only muddies the reverb)
    const sfxHp = hp(60);
    this.sfxBus.connect(sfxHp); sfxHp.connect(this.master);
    this.musicBus.connect(this.master);
    // shared soft room reverb (garden air); its impulse is loaded in _warm()
    this.revIn = g(1);
    const revHp = hp(110);
    this.conv = ctx.createConvolver();
    this.revOut = g(0.3);
    this.revIn.connect(revHp); revHp.connect(this.conv); this.conv.connect(this.revOut); this.revOut.connect(this.master);
    // master dynamics: gentle glue, a safety limiter, and a soft clipper that can never exceed −0.3 dBFS
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    const clip = ctx.createWaveShaper();
    clip.curve = softClip(); clip.oversample = 'none';
    this.master.connect(comp); comp.connect(lim); lim.connect(clip); clip.connect(ctx.destination);
    this.white = makeNoise(ctx, 1, false);
    this.pink = null;
    this._bus = this.sfxBus;
    this.ready = true;
    this.music = new Music(ctx, this.musicBus, this.revIn);
    const unlock = () => this.resume();
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    this.resume();
    // init runs inside the first tap: the heavier buffers (pink noise, then the reverb impulse, which also takes a
    // few ms to prepare) follow in two short tasks so that tap stays snappy. Until then noise is white and the
    // reverb silent.
    setTimeout(() => this._warm(false), 30);
  }
  _warm(all = true) {
    if (!this.ctx) return;
    if (!this.pink) {
      this.pink = makeNoise(this.ctx, 2, true);
      if (this.ambOut) this._applyAmbience();
      if (!all) { setTimeout(() => this._warm(), 200); return; }
    }
    if (!this.conv.buffer) this.conv.buffer = makeImpulse(this.ctx, 2, 2.8);
  }

  resume() {
    const c = this.ctx;
    if (c && c.state === 'suspended' && !this.mutes.size) c.resume().catch(() => {});
  }

  _masterTarget() { return this.mutes.size ? 0 : 1; }
  _ramp(param, v, t = 0.08) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(v, now + t);
  }

  setMute(reason, on) {
    const had = this.mutes.size > 0;
    if (on) this.mutes.add(reason); else this.mutes.delete(reason);
    if (!this.ctx) return;
    this._ramp(this.master.gain, this._masterTarget(), 0.12);
    // while hard-muted, also stop scheduling music notes (saves CPU during ads / background)
    if (this.music) this.music.setPaused(this.mutes.size > 0);
    if (had && !this.mutes.size) this.resume();
  }
  isMuted() { return this.mutes.size > 0; }

  setSfx(on) { this.sfxOn = !!on; if (this.ctx) this._ramp(this.sfxBus.gain, on ? SFX_GAIN : 0); }
  setMusic(on) {
    this.musicOn = !!on;
    if (this.ctx) this._ramp(this.musicBus.gain, on ? MUSIC_GAIN : 0, 0.4);
  }
  startMusic() { if (this.music) this.music.start(); this._startAmbience(); }
  setMusicMood(m) { if (this.music) this.music.setMood(m); }

  // one-shot SFX. opts: { volume, pitch, step, delay, minGap }
  play(name, opts = {}) {
    if (!this.ready || !this.sfxOn || this.mutes.size) return;
    const fn = SFX[name];
    if (!fn) { console.warn('[audio] unknown sfx', name); return; }
    // rate limit: the same sound fired again within its gap is dropped (e.g. 3 plots unlocking at once)
    const now = this.ctx.currentTime;
    const minGap = opts.minGap ?? GAP[name] ?? 0.03;
    if (!opts.delay && now - (this.lastPlay.get(name) ?? -1) < minGap) return;
    // voice cap: when a lot is ringing, background sounds give way first, then everything but the big moments.
    // A context that isn't running (not yet resumed, or interrupted) doesn't advance, so it only queues a few.
    const load = this._load(now);
    if (load >= MAX_VOICES && !IMPORTANT.has(name)) return;
    if (load >= CROWD && BACKGROUND.has(name)) return;
    if (this.ctx.state !== 'running' && load >= 6) return;
    this.lastPlay.set(name, now);
    // a little level drift per play too (±0.5 dB), on top of each sound's own pitch / timbre variation
    this._begin(this.sfxBus, dB((TRIM[name] || 0) + rand(-0.5, 0.5)) * (opts.volume ?? 1));
    try { fn(this, now + (opts.delay || 0), opts); } catch (e) { console.warn('[audio]', name, e); }
    this._seal();
  }

  // ---- voice bookkeeping: all nodes of one sound are disconnected when its last source has ended
  _begin(bus, lvl) { this._v = { nodes: [], end: 0, last: null }; this._bus = bus; this._lvl = lvl; }
  _seal() {
    const v = this._v;
    this._v = null;
    if (!v || !v.last) return;
    this.voices++;
    this._busy.push(v.end);
    v.last.onended = () => {
      this.voices--;
      for (const n of v.nodes) { try { n.disconnect(); } catch { /* already disconnected */ } }
    };
  }
  _n(node) { if (this._v) this._v.nodes.push(node); return node; }
  _src(s, t, end, offset = 0) {
    this._n(s);
    if (offset) s.start(t, offset); else s.start(t);
    s.stop(end);
    const v = this._v;
    if (v && end >= v.end) { v.end = end; v.last = s; }
  }
  _load(now) {
    const b = this._busy;
    let k = 0;
    for (let i = 0; i < b.length; i++) if (b[i] > now) b[k++] = b[i];
    b.length = k;
    return k;
  }

  // ---- building blocks used by the SFX table
  gain(v = 1, dest = null) { const g = this._n(this.ctx.createGain()); g.gain.value = v; if (dest) g.connect(dest); return g; }
  filter(type, f, q = 0.7, dest = null) {
    const b = this._n(this.ctx.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }
  // a sound's output: level (× the sound's trim and opts.volume) → optional stereo position → bus, + reverb send.
  // pan === true gives a centred panner the sound can automate (out.pan).
  out(vol = 1, rev = 0.2, pan = 0) {
    const c = this.ctx, g = this.gain(vol * this._lvl);
    let o = g;
    if (pan !== 0 && c.createStereoPanner) {
      const p = this._n(c.createStereoPanner());
      p.pan.value = pan === true ? 0 : Math.max(-1, Math.min(1, pan));
      g.connect(p); o = p; g.pan = p;
    }
    o.connect(this._bus);
    if (rev > 0) { const s = this.gain(rev); o.connect(s); s.connect(this.revIn); }
    return g;
  }
  // gain envelope: linear attack (an exponential one from near-silence snaps up in its last millisecond and
  // clicks), optional hold, exponential decay to silence
  env(p, t, a, hold, d, v) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(v, t + a);
    if (hold) p.setValueAtTime(v, t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
    return t + a + hold + d;
  }
  // enveloped oscillator (f → f2 glide)
  osc(dest, t, { type = 'sine', f = 440, f2 = 0, glide = 0.1, a = 0.004, hold = 0, d = 0.3, v = 0.3, detune = 0 }) {
    const o = this.ctx.createOscillator(), g = this.gain(0);
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + glide);
    if (detune) o.detune.value = detune;
    const end = this.env(g.gain, t, a, hold, d, v);
    o.connect(g); g.connect(dest);
    this._src(o, t, end + 0.02);
    return o;
  }
  // filtered noise burst (pink unless white)
  noise(dest, t, { type = 'bandpass', f = 2000, f2 = 0, glide = 0.2, q = 1, a = 0.005, hold = 0, d = 0.2, v = 0.2, white = false }) {
    const s = this.ctx.createBufferSource(), flt = this.filter(type, f, q), g = this.gain(0);
    s.buffer = white || !this.pink ? this.white : this.pink; s.loop = true;
    flt.frequency.setValueAtTime(f, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + glide);
    const end = this.env(g.gain, t, a, hold, d, v);
    s.connect(flt); flt.connect(g); g.connect(dest);
    this._src(s, t, end + 0.02, Math.random() * (s.buffer.duration - 0.05));
    return flt;
  }
  // glass / glockenspiel bell (free-bar partials); bright scales the upper partials
  bell(dest, t, f, v = 0.2, d = 1, bright = 1) {
    this.osc(dest, t, { f, a: 0.002, d, v });
    this.osc(dest, t, { f: f * 2.756, a: 0.002, d: d * 0.4, v: v * 0.3 * bright });
    if (bright > 0.4 && f < 2600) this.osc(dest, t, { f: f * 5.404, a: 0.002, d: d * 0.15, v: v * 0.1 * bright });
  }
  // kalimba: round fundamental, a soft octave and a quick metallic tine
  kalimba(dest, t, f, v = 0.2, d = 0.9) {
    this.osc(dest, t, { f, a: 0.003, d, v });
    this.osc(dest, t, { f: f * 2.01, a: 0.002, d: d * 0.3, v: v * 0.12 });
    this.osc(dest, t, { f: f * 5.9, a: 0.0015, d: d * 0.07, v: v * 0.14 });
  }
  // marimba: wooden bar (1 : 3.93) and a soft mallet knock
  mallet(dest, t, f, v = 0.25, d = 0.5, knock = 1) {
    this.osc(dest, t, { f, a: 0.003, d, v });
    this.osc(dest, t, { f: f * 3.93, a: 0.002, d: d * 0.22, v: v * 0.18 });
    if (knock) this.noise(dest, t, { f: Math.min(4000, f * 2.2), q: 1.4, a: 0.001, d: 0.02, v: v * 0.3 * knock });
  }
  // harp pluck: sawtooth through a low-pass that closes as the string rings out
  pluck(dest, t, f, v = 0.2, d = 0.8, bright = 6) {
    const o = this.ctx.createOscillator(), lp = this.filter('lowpass', Math.min(12000, f * bright), 0.5), g = this.gain(0);
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = rand(-4, 4);
    lp.frequency.setValueAtTime(Math.min(12000, f * bright), t);
    lp.frequency.setTargetAtTime(f * 1.4, t + 0.004, d * 0.16);
    const end = this.env(g.gain, t, 0.002, 0, d, v);
    o.connect(lp); lp.connect(g); g.connect(dest);
    this._src(o, t, end + 0.02);
  }
  // water drop / bubble: a sine chirping upward as it closes
  bubble(dest, t, f, v = 0.2, d = 0.08, rise = 2) {
    this.osc(dest, t, { f, f2: f * rise, glide: d * 0.6, a: 0.0015, d, v });
  }
  // coin clink: a warm fundamental with short metallic partials (lite: one partial fewer, for showers)
  clink(dest, t, f, v = 0.2, d = 0.3, lite = false) {
    this.osc(dest, t, { f, a: 0.0015, d, v });
    this.osc(dest, t, { f: f * 2.41, a: 0.0015, d: d * 0.3, v: v * 0.3 });
    if (!lite) this.osc(dest, t, { f: f * 3.87, a: 0.0015, d: d * 0.12, v: v * 0.08 });
  }
  // a few tiny glints on random pentatonic notes (steps lo…hi from C5)
  sparkle(dest, t, n, span, v, lo = 10, hi = 14) {
    for (let i = 0; i < n; i++) {
      const tt = t + (n > 1 ? (i / (n - 1)) * span : 0) + rand(0, 0.03);
      this.osc(dest, tt, { f: note(lo + ((Math.random() * (hi - lo + 1)) | 0)) * cents(rand(-6, 6)), a: 0.0015, d: rand(0.08, 0.2), v: v * rand(0.5, 1) * (1 - (0.5 * i) / n) });
    }
  }
  // soft pad chord: detuned triangle pairs under a gentle low-pass, slow swell
  pad(dest, t, freqs, dur, v, cutoff = 1500) {
    const lp = this.filter('lowpass', cutoff, 0.3, dest);
    for (const f of freqs) for (const det of [-7, 7]) this.osc(lp, t, { type: 'triangle', f, detune: det, a: dur * 0.25, hold: dur * 0.15, d: dur * 0.6, v });
  }
  // bee: a buzzing sawtooth with wing vibrato, a nasal formant and a small pitch bend
  buzzer(dest, t, { f = 220, dur = 0.4, v = 0.1, bend = 0.95, vib = 9, depth = 0.03, form = 1100 } = {}) {
    const c = this.ctx, o = c.createOscillator(), lfo = c.createOscillator();
    const lg = this.gain(f * depth), bp = this.filter('bandpass', form, 0.9), lp = this.filter('lowpass', 2600, 0.5), g = this.gain(0);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * bend, t + dur);
    lfo.frequency.value = vib;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.07, dur * 0.25));
    g.gain.setValueAtTime(v, t + dur * 0.55);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(dest);
    this._src(lfo, t, t + dur + 0.02);
    this._src(o, t, t + dur + 0.02);
  }
  // frog: a pulsing sawtooth through a throaty formant, two syllables ("rib-bit")
  croak(dest, t, { f = 200, v = 0.3, rate = 30 } = {}) {
    const c = this.ctx, o = c.createOscillator(), lfo = c.createOscillator();
    const lg = this.gain(0.5), am = this.gain(0.5), bp = this.filter('bandpass', f * 3.4, 2.2), g = this.gain(0);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.05, t + 0.07);
    o.frequency.setValueAtTime(f * 1.12, t + 0.11);
    o.frequency.linearRampToValueAtTime(f * 1.02, t + 0.22);
    lfo.frequency.value = rate;
    lfo.connect(lg); lg.connect(am.gain);
    const p = g.gain;
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(v, t + 0.012); p.linearRampToValueAtTime(v * 0.6, t + 0.06); p.linearRampToValueAtTime(0, t + 0.08);
    p.setValueAtTime(0, t + 0.11); p.linearRampToValueAtTime(v * 0.9, t + 0.123); p.linearRampToValueAtTime(v * 0.45, t + 0.2); p.linearRampToValueAtTime(0, t + 0.225);
    o.connect(am); am.connect(bp); bp.connect(g); g.connect(dest);
    this._src(lfo, t, t + 0.25);
    this._src(o, t, t + 0.25);
  }
  // songbird: one oscillator whose pitch and level are automated through a short call (kind 0-3)
  chirp(dest, t, v = 0.12, kind = (Math.random() * 4) | 0, base = rand(2600, 3500)) {
    const o = this.ctx.createOscillator(), g = this.gain(0);
    let tt = t;
    const tone = (f1, f2, dur, amp = 1, gap = 0) => {
      o.frequency.setValueAtTime(f1, tt);
      o.frequency.exponentialRampToValueAtTime(f2, tt + dur);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(v * amp, tt + Math.min(0.012, dur * 0.3));
      g.gain.linearRampToValueAtTime(0, tt + dur);
      tt += dur + gap;
    };
    if (kind === 0) { const n = 2 + ((Math.random() * 2) | 0); for (let i = 0; i < n; i++) tone(base, base * rand(1.3, 1.45), rand(0.045, 0.06), 1 - i * 0.12, rand(0.035, 0.06)); }
    else if (kind === 1) { for (let i = 0; i < 2; i++) tone(base * 1.45, base * 1.02, 0.06, 1 - i * 0.2, 0.05); }
    else if (kind === 2) { const n = 5 + ((Math.random() * 4) | 0); for (let i = 0; i < n; i++) tone(base * (i % 2 ? 1.12 : 1), base * (i % 2 ? 1.08 : 1.03), 0.028, 0.7 + 0.3 * Math.sin((i / n) * Math.PI), 0.004); }
    else { tone(base * 1.2, base * 1.14, 0.12, 1, 0.05); tone(base * 0.96, base * 0.9, 0.15, 0.85); }
    o.connect(g); g.connect(dest);
    this._src(o, t, tt + 0.02);
  }

  // ---- ambience: beds are built when first needed, cross-faded by mode, and torn down after fading out.
  // Events (birds, cricket chirps, frogs, big rain drops) are scheduled a little ahead of the audio clock.
  setAmbience(mode) { this.ambMode = mode; if (this.ambOut && this.pink) this._applyAmbience(); }
  _startAmbience() {
    if (!this.ctx || this.ambOut) return;
    this.ambOut = this.ctx.createGain(); this.ambOut.gain.value = AMB.out; this.ambOut.connect(this.sfxBus);
    this._beds = {};
    this._amb = { gust: 0, bird: 0, frog: 0, drop: 0 };
    if (this.pink) this._applyAmbience(); // otherwise _warm() starts the beds
    this._ambTimer = setInterval(() => this._ambTick(), 250);
  }
  _applyAmbience() {
    const m = this.ambMode || 'day';
    this._bed('wind', m === 'rain' ? 0.45 : m === 'night' ? 0.6 : 1);
    this._bed('rain', m === 'rain' ? 1 : 0);
    this._bed('night', m === 'night' ? 1 : 0);
  }
  _bed(kind, level) {
    const now = this.ctx.currentTime;
    let b = this._beds[kind];
    if (!b) { if (level <= 0) return; b = this._beds[kind] = this._buildBed(kind); }
    clearTimeout(b.kill);
    const p = b.gain.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(level, now, level > 0 ? 1.2 : 0.8);
    b.on = level > 0;
    if (!b.on) {
      b.kill = setTimeout(() => {
        if (this._beds[kind] !== b || b.on) return;
        for (const s of b.srcs) { try { s.stop(); } catch { /* not started */ } }
        for (const n of b.nodes) n.disconnect();
        delete this._beds[kind];
      }, 6000);
    }
  }
  _buildBed(kind) {
    const c = this.ctx, nodes = [], srcs = [];
    const N = (n) => { nodes.push(n); return n; };
    const gain = (v, dest) => { const g = N(c.createGain()); g.gain.value = v; g.connect(dest); return g; };
    const filt = (type, f, q, dest) => { const b = N(c.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; };
    const loop = (buf, dest, pan = 0, rate = 1) => {
      const s = N(c.createBufferSource());
      s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
      let o = s;
      if (pan && c.createStereoPanner) { const p = N(c.createStereoPanner()); p.pan.value = pan; s.connect(p); o = p; }
      o.connect(dest);
      s.start(c.currentTime, Math.random() * buf.duration);
      srcs.push(s);
    };
    const b = { gain: gain(0, this.ambOut), nodes, srcs, on: true };
    if (kind === 'wind') {
      // two decorrelated pink streams through a low-pass that breathes with the gusts; leaves rustle on top
      b.swell = gain(AMB.wind, b.gain);
      b.lp = filt('lowpass', 500, 0.3, filt('highpass', 110, 0.3, b.swell)); // no rumble: it only muddies small speakers
      loop(this.pink, b.lp, -0.7); loop(this.pink, b.lp, 0.7, 0.93);
      b.rustle = gain(0, b.gain);
      loop(this.white, filt('bandpass', 3400, 0.6, b.rustle), 0.2, 0.97);
    } else if (kind === 'rain') {
      // hiss of rain on the canopy, pitter-patter of drops on leaves (sparse clicks through two resonances), a low body
      this.dust = this.dust || makeDust(c, 3.3, 110);
      const hiss = gain(AMB.rain, b.gain);
      const hp = filt('highpass', 700, 0.3, filt('lowpass', 5000, 0.3, hiss));
      loop(this.pink, hp, -0.6); loop(this.pink, hp, 0.6, 1.07);
      loop(this.dust, filt('bandpass', 1900, 2.2, gain(AMB.patter, b.gain)), -0.45);
      loop(this.dust, filt('bandpass', 3300, 2.6, gain(AMB.patter * 0.7, b.gain)), 0.45, 0.83);
      loop(this.pink, filt('lowpass', 240, 0.3, gain(AMB.rumble, b.gain)), 0, 0.5);
    } else if (kind === 'night') {
      // three crickets: steady sine voices whose pulses are written as gain automation (no nodes per chirp)
      b.crickets = [0, 1, 2].map((i) => {
        const o = N(c.createOscillator());
        o.frequency.value = [4400, 4750, 4150][i] * rand(0.98, 1.02);
        const g = N(c.createGain()); g.gain.value = 0;
        let dest = b.gain;
        if (c.createStereoPanner) { const p = N(c.createStereoPanner()); p.pan.value = [-0.6, 0.55, 0.05][i]; p.connect(b.gain); dest = p; }
        o.connect(g); g.connect(dest);
        o.start(); srcs.push(o);
        return { g, next: 0, period: rand(0.55, 0.9), pulses: 3 + (i % 2), gap: rand(0.026, 0.034), v: AMB.cricket * [1, 0.7, 0.5][i] };
      });
    }
    return b;
  }
  _ambTick() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.mutes.size || !this.sfxOn) return;
    this._ambSchedule(c.currentTime + 1); // a second ahead: a stalled main thread must not leave gaps
  }
  // schedule ambience events up to `until` (audio clock)
  _ambSchedule(until) {
    const now = this.ctx.currentTime, m = this.ambMode || 'day', A = this._amb, beds = this._beds;
    const day = m === 'day' || m === 'golden' || m === 'rainbow';
    // after a pause, don't try to catch up
    for (const k in A) if (A[k] < now - 1) A[k] = now + Math.random();
    // gusts: the wind wanders in level and brightness, and the leaves rustle with the stronger ones
    const w = beds.wind;
    while (w && A.gust < until) {
      const t = A.gust, k = Math.random(), tc = rand(0.8, 2.2);
      w.swell.gain.setTargetAtTime(AMB.wind * (0.4 + k * 0.9), t, tc);
      w.lp.frequency.setTargetAtTime(300 + k * 800, t, tc);
      w.rustle.gain.setTargetAtTime(day ? AMB.rustle * k * k : 0, t, tc * 0.6);
      A.gust = t + rand(1.5, 4.5);
    }
    // birdsong: a call every few seconds from somewhere in the garden, sometimes answered
    if (day) {
      while (A.bird < until) {
        const t = A.bird;
        this._ambVoice(() => {
          // somewhere in the garden; distance = quieter, darker, wetter
          const call = (tt, v) => this.chirp(this.filter('lowpass', rand(4200, 6500), 0.3, this.out(dB(rand(-12, -1)), 0.45, rand(-0.9, 0.9))), tt, v);
          call(t, AMB.bird);
          if (Math.random() < 0.45) call(t + rand(0.7, 1.6), AMB.bird * 0.7); // another bird answers
        });
        A.bird = t + rand(2, 6);
      }
    } else A.bird = until;
    const night = beds.night;
    if (night && m === 'night') {
      for (const k of night.crickets) {
        if (k.next < now - 1) k.next = now + Math.random();
        while (k.next < until) {
          const t = k.next, p = k.g.gain;
          for (let i = 0; i < k.pulses; i++) {
            const ts = t + i * k.gap;
            p.setValueAtTime(0, ts); p.linearRampToValueAtTime(k.v, ts + 0.005); p.linearRampToValueAtTime(0, ts + 0.018);
          }
          // crickets keep their own rhythm, with an occasional rest
          k.next = t + k.period * rand(0.94, 1.06) + (Math.random() < 0.05 ? rand(2, 6) : 0);
        }
      }
      while (A.frog < until) {
        const t = A.frog;
        if (A.frog > now + 0.05) this._ambVoice(() => SFX.ribbit(this, t, {}), AMB.frog);
        A.frog = t + rand(7, 20);
      }
    } else A.frog = until + rand(2, 6);
    if (beds.rain && m === 'rain') {
      // heavier drops landing on big leaves / the pond
      while (A.drop < until) {
        const t = A.drop;
        this._ambVoice(() => {
          const out = this.out(dB(rand(-10, 0)) * AMB.drop, 0.3, rand(-0.8, 0.8));
          if (Math.random() < 0.6) this.bubble(out, t, rand(900, 2300), 0.1, rand(0.02, 0.035), rand(1.3, 1.8));
          else this.noise(out, t, { f: rand(600, 1400), q: 2, a: 0.001, d: rand(0.02, 0.05), v: 0.25 });
        });
        A.drop = t + rand(0.15, 0.7);
      }
    } else A.drop = until;
  }
  _ambVoice(fn, lvl = 1) {
    this._begin(this.ambOut, lvl);
    try { fn(); } catch (e) { console.warn('[audio] ambience', e); }
    this._seal();
  }
}

// ------------------------------------------------------------------------------------------------ SFX table
// (A, t, o): A is the engine (building blocks above), t the start time, o the call's opts.
const SFX = {
  // ---- garden actions
  // planting: a soft soil plop — a muffled body, the little "plop", a puff of earth and a few crumbs
  drop(A, t, o) {
    const p = (o.pitch || 1) * rand(0.95, 1.05), body = Math.max(0.85, p), out = A.out(1, 0.1);
    A.osc(out, t, { f: 230 * body, f2: 125 * body, glide: 0.06, a: 0.003, d: 0.09, v: 0.3 });
    A.bubble(out, t + 0.005, 310 * p, 0.34, 0.075, 1.85);
    A.noise(out, t, { type: 'lowpass', f: 1600 * p, q: 0.3, a: 0.002, d: 0.07, v: 0.9 });
    for (let i = 0; i < 3; i++) A.noise(out, t + 0.014 + i * rand(0.012, 0.02), { f: rand(1300, 2500) * p, q: 1.2, a: 0.001, d: rand(0.008, 0.02), v: rand(0.3, 0.5) });
  },
  // digging a plant up: a scoop through the soil, crumbs, and the plant popping free
  dig(A, t, o) {
    const p = (o.pitch || 1) * rand(0.95, 1.05), out = A.out(1, 0.12);
    A.noise(out, t, { f: 950 * p, f2: 520 * p, glide: 0.14, q: 0.8, a: 0.02, d: 0.14, v: 0.6, white: true });
    for (let i = 0; i < 4; i++) A.noise(out, t + 0.03 + i * rand(0.018, 0.03), { f: rand(1200, 2400), q: 1.5, a: 0.001, d: rand(0.01, 0.025), v: rand(0.3, 0.5) });
    A.osc(out, t + 0.02, { f: 190 * p, f2: 110 * p, glide: 0.07, a: 0.004, d: 0.09, v: 0.3 });
    A.bubble(out, t + 0.15, 380 * p, 0.3, 0.07, 2.2);
  },
  // harvesting a bloom: a juicy pop and a tiny chime; o.step (0..14) walks the chime up the pentatonic
  pop(A, t, o) {
    const s = stepOf(o, 0, 0, 10), n = note(3 + s) * cents(rand(-4, 4)); // G5 … G7
    const out = A.out(1, 0.16, rand(-0.12, 0.12));
    const b = 330 * (1 + s * 0.07) * rand(0.96, 1.04);
    A.bubble(out, t, b, 0.5, 0.07, 2.3);                                                   // the juicy "bloop"
    A.osc(out, t, { f: 200, f2: 115, glide: 0.04, a: 0.002, d: 0.045, v: 0.2 });            // a little body
    A.noise(out, t, { f: rand(2400, 3200), q: 1.4, a: 0.0008, d: 0.011, v: 0.22, white: true }); // the snap
    A.bubble(out, t + rand(0.028, 0.04), b * rand(1.9, 2.3), 0.12, 0.04, 1.7);              // a droplet after
    A.bell(out, t + 0.014, n, 0.13 * (1 - s * 0.045), 0.5, 0.9 - s * 0.05);                // tiny chime (softer as it climbs)
  },
  // collecting a seed: a round "bloop" up into the pouch and two quick kalimba notes
  pick(A, t, o) {
    const k = pitchStep(o.pitch), out = A.out(1, 0.2);
    A.bubble(out, t, rand(290, 320) * (o.pitch || 1), 0.4, 0.09, 2.2);
    A.kalimba(out, t + 0.035, note(6 + k), 0.16, 0.35);
    A.kalimba(out, t + 0.085, note(8 + k), 0.13, 0.5);
    A.noise(out, t, { type: 'highpass', f: 5000, q: 0.5, a: 0.001, d: 0.012, v: 0.05, white: true });
  },
  // a seed bubble popping out of a flower: light and bubbly
  seedPop(A, t) {
    const out = A.out(1, 0.2, rand(-0.3, 0.3)), f = rand(620, 720);
    A.bubble(out, t, f, 0.3, 0.05, 2.2);
    A.noise(out, t, { type: 'highpass', f: 3000, q: 0.7, a: 0.0005, d: 0.004, v: 0.08, white: true });
    A.bubble(out, t + rand(0.035, 0.05), f * rand(1.4, 1.6), 0.12, 0.035, 1.8);
  },
  // tapping a growing plant: a bouncy "bloop" with a springy wobble; o.step (0..12) climbs the pentatonic
  grow(A, t, o) {
    const s = stepOf(o, 0, 0, 12), f = pentaFreq(C4, s + 3) * cents(rand(-5, 5)); // G4 … C7
    const out = A.out(1, 0.15, rand(-0.1, 0.1));
    const o1 = A.osc(out, t, { f: f * rand(0.62, 0.7), f2: f, glide: 0.035, a: 0.002, d: 0.16, v: 0.34 });
    const o2 = A.osc(out, t, { f: f * 1.3, f2: f * 2, glide: 0.035, a: 0.002, d: 0.08, v: s < 7 ? 0.08 : 0.04 });
    // spring wobble: a quick vibrato that dies away
    const lfo = A.ctx.createOscillator(), lg = A.gain(0);
    lfo.frequency.value = rand(14, 19);
    lg.gain.setValueAtTime(f * 0.045, t + 0.03);
    lg.gain.exponentialRampToValueAtTime(f * 0.002, t + 0.17);
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    A._src(lfo, t, t + 0.2);
    A.osc(out, t, { f: 260, f2: 160, glide: 0.04, a: 0.002, d: 0.04, v: 0.08 });
    A.noise(out, t, { f: rand(2600, 3400), q: 1.5, a: 0.0008, d: 0.01, v: 0.2, white: true });
  },
  // pollen picked up at the start of a drag: a soft, fuzzy "fwip" with a few specks of sparkle
  pollen(A, t) {
    const out = A.out(1, 0.25, rand(-0.2, 0.2));
    A.noise(out, t, { f: 900, f2: 4200, glide: 0.09, q: 1.4, a: 0.03, d: 0.1, v: 1.2 });
    A.noise(out, t + 0.015, { f: 1500, f2: 5500, glide: 0.08, q: 2.2, a: 0.02, d: 0.08, v: 0.35, white: true });
    A.osc(out, t, { f: 520, f2: 1250, glide: 0.07, a: 0.01, d: 0.07, v: 0.16 });
    A.sparkle(out, t + 0.04, 3, 0.12, 0.05, 9, 13);
  },
  // pollen dropped on another bloom → a hybrid seed: a magical zip that resolves on a bright chord
  cross(A, t) {
    const out = A.out(1, 0.45);
    A.osc(out, t, { f: 420, f2: 1570, glide: 0.2, a: 0.03, d: 0.18, v: 0.13 });
    A.noise(out, t, { f: 900, f2: 6000, glide: 0.2, q: 3, a: 0.05, d: 0.16, v: 0.13 });
    const T = t + 0.2;
    A.bell(out, T, note(6), 0.1, 0.22, 0.8);                                                     // D6: the question…
    [5, 7, 8].forEach((s, i) => A.bell(out, T + 0.09 + i * 0.03, note(s), 0.11, 1.1, 0.8));      // …C E G: the answer
    A.mallet(out, T + 0.09, C4, 0.14, 0.6, 0);
    A.sparkle(out, T + 0.22, 5, 0.6, 0.03, 10, 15);
  },
  // a flower opening: a soft rising swell of air and three unfolding notes (pitch = the flower's colour)
  bloom(A, t, o) {
    const k = pitchStep(o.pitch), out = A.out(1, 0.35);
    A.osc(out, t, { f: rand(330, 360), f2: rand(640, 700), glide: 0.28, a: 0.07, d: 0.3, v: 0.16 });
    A.noise(out, t, { f: 1200, f2: 5200, glide: 0.35, q: 2.5, a: 0.12, d: 0.35, v: 0.12 });
    const base = 3 + k + pick([0, 1]);
    [0, 2, 4].forEach((s, i) => A.kalimba(out, t + 0.1 + i * rand(0.06, 0.075), note(base + s), 0.11 + i * 0.02, 0.6));
  },
  // a bee pollinating: one soft kalimba note tuned to the flower's colour (the garden plays itself)
  flip(A, t, o) {
    const out = A.out(1, 0.4, rand(-0.5, 0.5));
    A.kalimba(out, t, pentaFreq(C4, stepOf(o, 5, 0, 14)) * cents(rand(-4, 4)), 0.3, rand(0.7, 0.9));
  },
  // watering a growing plant: a gentle sprinkle
  water(A, t) {
    const out = A.out(1, 0.25);
    A.noise(out, t, { f: 2600, q: 0.9, a: 0.05, hold: 0.12, d: 0.25, v: 0.26 });
    A.noise(out, t, { f: 1000, q: 1.2, a: 0.03, hold: 0.08, d: 0.2, v: 0.14 });
    for (let i = 0; i < 9; i++) A.bubble(out, t + 0.02 + i * 0.038 + rand(0, 0.025), rand(750, 1900), rand(0.14, 0.22), rand(0.025, 0.045), rand(1.3, 1.8));
  },

  // ---- money and rewards
  // coins: two warm clinks stepping up (G→C, A→D or C→E), the second a touch brighter
  coin(A, t, o) {
    const k = pitchStep(o.pitch), [a, b] = pick([[3, 5], [4, 6], [5, 7]]);
    const out = A.out(1, 0.15, rand(-0.2, 0.2));
    A.clink(out, t, note(a + k) * cents(rand(-5, 5)), 0.2, 0.22);
    A.clink(out, t + rand(0.055, 0.07), note(b + k) * cents(rand(-5, 5)), 0.22, 0.38);
    A.noise(out, t, { type: 'highpass', f: 5000, q: 0.5, a: 0.0005, d: 0.006, v: 0.1, white: true });
  },
  // harvest combo: a rising chime; o.step (1..10) raises the pitch and brightens it
  combo(A, t, o) {
    const s = stepOf(o, 1, 1, 10), base = Math.round((s - 1) * 0.7), out = A.out(0.85 + s * 0.02, 0.35);
    const steps = s >= 5 ? [0, 2, 4, 5] : [0, 2, 4];
    steps.forEach((d, i) => A.bell(out, t + i * 0.05, note(base + d), 0.1 + i * 0.012, 0.6 + s * 0.05, 0.5 + s * 0.035));
    A.mallet(out, t, note(base - 5), 0.12, 0.35, 0);
    if (s >= 4) A.sparkle(out, t + 0.12, Math.min(6, s - 2), 0.3, 0.025 + s * 0.002, 10, 14);
    if (s >= 7) A.noise(out, t, { type: 'highpass', f: 6000, q: 0.5, a: 0.05, d: 0.4, v: 0.035, white: true });
  },
  // a mutation (dewy, moonlit, golden, rainbow…): a magical shimmer
  clear(A, t, o) {
    const k = pitchStep(o.pitch), out = A.out(1, 0.5);
    [0, 2, 3, 5, 7].forEach((s, i) => A.bell(out, t + i * 0.045, note(5 + s + k), 0.1, 1.1, 0.7));
    A.noise(out, t, { type: 'highpass', f: 6000, f2: 9000, glide: 0.5, q: 0.5, a: 0.05, d: 0.6, v: 0.05, white: true });
    A.osc(out, t, { type: 'triangle', f: C4, a: 0.08, d: 1.2, v: 0.08 });
  },
  // a new plot / a decoration revealed: a wooden "clunk", leaves rustling open and a rising chime
  unlock(A, t) {
    const out = A.out(1, 0.35);
    A.mallet(out, t, pentaFreq(C4, 3), 0.32, 0.4);                                           // G4
    A.noise(out, t + 0.03, { f: 2600, f2: 4200, glide: 0.25, q: 1.2, a: 0.04, d: 0.22, v: 0.1 });
    [5, 7, 8, 10].forEach((s, i) => A.bell(out, t + 0.1 + i * 0.06, note(s), 0.1 + i * 0.015, 0.8, 0.8));
  },
  // order delivered / upgrade bought: a bright little marimba run and a chime
  reward(A, t) {
    const out = A.out(1, 0.35);
    [0, 2, 3, 5].forEach((s, i) => A.mallet(out, t + i * 0.055, note(s), 0.2 + i * 0.02, 0.4));
    A.bell(out, t + 0.23, note(7), 0.1, 1, 0.8);
    A.bell(out, t + 0.25, note(8), 0.08, 1, 0.8);
  },
  // an order completed / decoration placed / a collection: a cheerful fanfare
  win(A, t) {
    const out = A.out(1, 0.4);
    [-2, 0, 2, 3].forEach((s, i) => A.mallet(out, t + i * 0.1, note(s), 0.26, 0.5));      // G4 C5 E5 G5
    [5, 7, 8, 10].forEach((s, i) => A.bell(out, t + 0.42 + i * 0.02, note(s), 0.07, 1.6, 0.7));
    A.mallet(out, t + 0.42, C4, 0.24, 0.9, 0.5);
    A.pad(out, t + 0.38, [C4, pentaFreq(C4, 2), pentaFreq(C4, 3)], 1.4, 0.035);
    A.sparkle(out, t + 0.5, 4, 0.6, 0.03, 10, 14);
  },
  // level up: a pickup "ta-da-da", then a big ringing chord with a harp sweep and twinkles
  levelUp(A, t) {
    const out = A.out(1, 0.45);
    [-2, 0, 2].forEach((s, i) => A.pluck(out, t + i * 0.09, note(s), 0.24, 0.35, 7));
    const T = t + 0.3;
    [3, 5, 7, 8, 10].forEach((s, i) => A.bell(out, T + i * 0.025, note(s), 0.08, 1.8, 0.8));
    A.mallet(out, T, C4, 0.3, 1, 0.5);
    A.mallet(out, T, C4 / 2, 0.2, 1.2, 0);
    A.pad(out, T, [C4, pentaFreq(C4, 2), pentaFreq(C4, 3), C5], 1.8, 0.03);
    for (let i = 0; i < 8; i++) A.pluck(out, T + 0.1 + i * 0.035, note(i + 2), 0.06, 0.5, 6);
    A.sparkle(out, T + 0.4, 6, 1, 0.03, 11, 16);
  },
  // a new species for the Flower Book: the biggest moment — a magic harp glissando, a warm chord blooming
  // open and twinkles drifting down
  discover(A, t) {
    const out = A.out(1, 0.5);
    for (let i = 0; i < 11; i++) A.pluck(out, t + i * 0.042, note(i - 2), 0.1 + i * 0.008, 0.6, 8);
    A.noise(out, t, { f: 2000, f2: 7000, glide: 0.5, q: 1.5, a: 0.3, d: 0.5, v: 0.07 });
    const T = t + 0.5;
    A.pad(out, T, [C4 / 2, C4, pentaFreq(C4, 3), pentaFreq(C4, 7)], 2.6, 0.03, 1800);
    [5, 7, 8, 9, 10].forEach((s, i) => A.bell(out, T + i * 0.05, note(s), 0.09, 2, 0.8));
    A.mallet(out, T, C4, 0.3, 1.2, 0.5);
    A.sparkle(out, T + 0.3, 9, 1.6, 0.03, 11, 17);
  },
  // an achievement: a bright bell with a warm body (o.step picks the note)
  star(A, t, o) {
    const s = stepOf(o, 0, 0, 20), out = A.out(1, 0.4), f = note(5 + ((s * 2) % 6));
    A.bell(out, t, f, 0.16, 1);
    A.osc(out, t, { f: f / 2, a: 0.004, d: 0.35, v: 0.1 });
    A.noise(out, t, { type: 'highpass', f: 7000, q: 0.5, a: 0.002, d: 0.15, v: 0.03, white: true });
  },
  // a starter quest completed: a short, happy "da-da-ding"
  quest(A, t) {
    const out = A.out(1, 0.35);
    A.mallet(out, t, note(2), 0.22, 0.3);
    A.mallet(out, t + 0.1, note(3), 0.22, 0.3);
    A.bell(out, t + 0.2, note(5), 0.15, 1.1);
    A.mallet(out, t + 0.2, note(0), 0.18, 0.6, 0.5);
    A.sparkle(out, t + 0.3, 3, 0.3, 0.03, 10, 13);
  },
  // the golden bee arrives: a shimmering harp glissando while it buzzes past
  golden(A, t) {
    const out = A.out(1, 0.5, true);
    if (out.pan) { out.pan.pan.setValueAtTime(-0.5, t); out.pan.pan.linearRampToValueAtTime(0.5, t + 0.6); }
    for (let i = 0; i < 14; i++) A.pluck(out, t + i * 0.04, note(i - 2), 0.07 + 0.05 * Math.sin((i / 13) * Math.PI), 0.9, 7);
    A.noise(out, t, { type: 'highpass', f: 5000, q: 0.5, a: 0.3, d: 0.8, v: 0.04, white: true });
    const bee = A.out(1, 0.2, true);
    if (bee.pan) { bee.pan.pan.setValueAtTime(0.8, t); bee.pan.pan.linearRampToValueAtTime(-0.8, t + 1.2); }
    A.buzzer(bee, t + 0.1, { f: 245, dur: 1.1, v: 0.09, bend: 1.08, vib: 11, depth: 0.02, form: 1300 });
  },
  // catching the golden bee: a bright strum and a shower of coins
  goldenCatch(A, t) {
    const out = A.out(1, 0.4);
    [0, 2, 3, 5].forEach((s, i) => A.pluck(out, t + i * 0.03, note(s), 0.14, 0.9, 7));
    A.bell(out, t + 0.12, note(10), 0.1, 1.4);
    const sides = [A.out(1, 0.3, -0.6), A.out(1, 0.3, 0.6), A.out(1, 0.3, 0.05)];
    for (let i = 0; i < 18; i++) {
      const tt = t + 0.05 + Math.pow(i / 18, 1.3) * 1.0 + rand(0, 0.03);
      A.clink(pick(sides), tt, note(pick([7, 8, 9, 10, 11, 12])) * cents(rand(-8, 8)), 0.09 * (1 - i / 30), rand(0.15, 0.3), true);
    }
  },

  // ---- tutorial
  // a tutorial step done: a tiny bright "ding"
  tutStep(A, t) {
    const out = A.out(1, 0.3);
    A.bell(out, t, note(pick([7, 8])), 0.18, 0.7);
    A.osc(out, t, { f: note(2), a: 0.003, d: 0.2, v: 0.05 });
  },
  // the tutorial hand appears: a very soft blip
  hint(A, t) {
    const out = A.out(1, 0.25);
    A.osc(out, t, { f: note(4), f2: note(5), glide: 0.05, a: 0.008, d: 0.14, v: 0.12 });
  },

  // ---- interface
  // a button: a soft wooden "tok"
  button(A, t) {
    const out = A.out(1, 0.06), f = rand(700, 760);
    A.osc(out, t, { f: f * 1.25, f2: f, glide: 0.012, a: 0.0015, d: 0.05, v: 0.3 });
    A.osc(out, t, { f: f * 2.62, a: 0.001, d: 0.018, v: 0.07 });
    A.noise(out, t, { f: rand(2600, 3400), q: 1.5, a: 0.0005, d: 0.006, v: 0.08, white: true });
  },
  // a toggle / tab / selection: a bubbly blip, up for on and down for off (opts.pitch < 1)
  toggle(A, t, o) {
    const off = o.pitch && o.pitch < 1, out = A.out(1, 0.06), f = rand(560, 600);
    A.osc(out, t, { f: off ? f * 1.35 : f, f2: off ? f * 0.9 : f * 1.5, glide: 0.035, a: 0.002, d: 0.06, v: 0.26 });
    A.noise(out, t, { f: 3000, q: 1.2, a: 0.0005, d: 0.005, v: 0.05, white: true });
  },
  // not allowed: a gentle "nope", two soft wooden notes stepping down
  invalid(A, t) {
    const out = A.out(1, 0.1), lp = A.filter('lowpass', 1600, 0.3, out);
    [[0, pentaFreq(C4, 2)], [0.11, C4]].forEach(([dt, f], i) => {                             // E4 → C4, "uh-uh"
      A.osc(lp, t + dt, { type: 'triangle', f: f * 1.03, f2: f * 0.97, glide: 0.08, a: 0.004, d: 0.13, v: 0.3 - i * 0.06 });
      A.osc(lp, t + dt, { f: f * 2, a: 0.003, d: 0.06, v: 0.09 });
    });
  },
  // panels / weather / order swap: a soft airy whoosh drifting across the stereo field
  whoosh(A, t) {
    const out = A.out(1, 0.2, true), dir = Math.random() < 0.5 ? -1 : 1;
    if (out.pan) { out.pan.pan.setValueAtTime(-0.6 * dir, t); out.pan.pan.linearRampToValueAtTime(0.6 * dir, t + 0.45); }
    A.noise(out, t, { f: rand(330, 380), f2: rand(1800, 2100), glide: 0.22, q: 0.9, a: 0.12, d: 0.28, v: 1.3 });
    A.noise(out, t + 0.05, { type: 'highpass', f: 2500, q: 0.4, a: 0.1, d: 0.2, v: 0.18 });
  },

  // ---- critters (quiet, pitch-varied)
  // a bee arriving at a flower: one short buzz
  buzz(A, t) {
    const out = A.out(1, 0.1, rand(-0.6, 0.6));
    A.buzzer(out, t, { f: rand(190, 270), dur: rand(0.28, 0.45), v: 0.1, bend: rand(0.9, 0.97), vib: rand(7, 12), form: rand(900, 1300) });
  },
  // a fish jumping in the pond: a plop and a few droplets
  splash(A, t) {
    const out = A.out(1, 0.25, rand(-0.5, 0.5));
    A.bubble(out, t, rand(330, 420), 0.3, 0.09, 2.4);
    A.noise(out, t, { f: 1800, q: 0.8, a: 0.002, d: 0.16, v: 0.12 });
    for (let i = 0; i < 3; i++) A.bubble(out, t + rand(0.12, 0.35), rand(1100, 2200), rand(0.04, 0.08), rand(0.025, 0.04), 1.6);
  },
  // a frog: a cute two-part croak
  ribbit(A, t) {
    const out = A.out(1, 0.2, rand(-0.5, 0.5));
    A.croak(out, t, { f: rand(170, 230), v: 0.3, rate: rand(26, 34) });
  },
  // one short songbird chirp
  birdChirp(A, t) {
    const out = A.out(1, 0.25, rand(-0.7, 0.7));
    A.chirp(A.filter('lowpass', 6500, 0.3, out), t, 0.12);
  },

  // ---- older names, kept so every existing call still sounds right in the garden
  // a leafy shuffle (orders reshuffled / restock)
  shuffle(A, t) {
    const out = A.out(1, 0.2);
    A.noise(out, t, { f: 900, f2: 2800, glide: 0.25, q: 1.2, a: 0.05, d: 0.25, v: 0.2 });
    [0, 1, 2].forEach((i) => A.mallet(out, t + 0.12 + i * 0.07, note(i * 2), 0.14, 0.25));
  },
  hammer(A, t, o) { SFX.dig(A, t, o); },
  // dew drops: a glassy tinkle
  ice(A, t) {
    const out = A.out(1, 0.4);
    A.bell(out, t, note(9), 0.1, 0.4, 0.6);
    A.bell(out, t + 0.05, note(11), 0.08, 0.35, 0.6);
    A.bubble(out, t, 1400, 0.06, 0.03, 1.6);
  },
  // a soft, falling "aww" (nothing in the garden is ever lost for good)
  fail(A, t) {
    const out = A.out(1, 0.4);
    [3, 2, 0].forEach((s, i) => A.mallet(out, t + i * 0.16, pentaFreq(C4, s + 2), 0.22, 0.55));
  },
  // a new day in the garden: an airy swell and a rising kalimba phrase
  start(A, t) {
    const out = A.out(1, 0.4);
    A.noise(out, t, { f: 400, f2: 1800, glide: 0.4, q: 1, a: 0.1, d: 0.3, v: 0.12 });
    [0, 1, 3].forEach((s, i) => A.kalimba(out, t + 0.1 + i * 0.09, note(s), 0.15, 0.5));
  },
};

// ------------------------------------------------------------------------------------------------ DSP helpers
// white or pink noise (pink: Paul Kellet's filter, normalised) — pink is softer and warmer for airy sounds
function makeNoise(ctx, seconds, pink) {
  const len = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) { d[i] = w; continue; }
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    d[i] = v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  if (pink) { let m = 0; for (let i = 0; i < len; i++) m += d[i]; m /= len; for (let i = 0; i < len; i++) d[i] = (d[i] - m) / peak; }
  return b;
}

// rain patter: sparse, tiny decaying noise ticks (~perSec per second) — looped through resonant filters
function makeDust(ctx, seconds, perSec) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
  const n = Math.floor(seconds * perSec), tick = Math.floor(sr * 0.003);
  for (let k = 0; k < n; k++) {
    const at = Math.floor(Math.random() * (len - tick)), amp = Math.pow(Math.random(), 2.5) * (Math.random() < 0.5 ? -1 : 1);
    for (let i = 0; i < tick; i++) d[at + i] += amp * (Math.random() * 2 - 1) * Math.exp(-i / (tick * 0.25));
  }
  return b;
}

// stereo impulse: exponentially decaying, darkening noise tail (envelope and filter updated every 64 samples,
// which keeps init cheap on the main thread)
function makeImpulse(ctx, seconds, decay) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr), fade = sr * 0.004;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, a = 0, env = 0;
    for (let i = 0; i < len; i++) {
      if ((i & 63) === 0) { const x = i / len; a = 0.08 + 0.7 * Math.exp(-x * 5); env = Math.pow(1 - x, decay); }
      lp += (Math.random() * 2 - 1 - lp) * a;
      d[i] = lp * env * (i < fade ? i / fade : 1);
    }
  }
  return buf;
}

// transparent below −0.9 dBFS, then a smooth knee into a ceiling of 0.965 (≈ −0.3 dBFS)
function softClip() {
  const n = 2049, c = new Float32Array(n), k = 0.9, r = 0.075;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a < k ? a : k + r * Math.tanh((a - k) / r));
  }
  return c;
}

export const audio = new AudioEngine();
