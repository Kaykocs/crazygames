// Procedural audio engine (Web Audio). No audio files: every sound is synthesized when it plays, so the game
// downloads nothing but code.
//
//   audio.init()                    idempotent; call from a user gesture (browsers keep the context suspended until one)
//   audio.play(name, opts)          one-shot SFX from the SFX table below ({ volume, pitch, step })
//   audio.setMute(reason, on)       hard mutes that stack: 'ad' (an ad is playing), 'sdk' (CrazyGames muteAudio
//                                   setting), 'hidden' (tab in background). Any active reason silences everything.
//   audio.setSfx(on) / setMusic(on) the player's own toggles
//
// Graph: voices → sfxBus ─┐
//        voices → reverb ─┤→ master → compressor → limiter → destination
//        music  → musicBus┘
import { Music } from './music.js';

const SCALE = [0, 2, 4, 7, 9]; // major pentatonic: any run of steps sounds musical
export const pentaFreq = (root, step) => {
  const oct = Math.floor(step / SCALE.length), deg = ((step % SCALE.length) + SCALE.length) % SCALE.length;
  return root * Math.pow(2, oct + SCALE[deg] / 12);
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.mutes = new Set();
    this.sfxOn = true;
    this.musicOn = true;
    this.lastPlay = new Map();
    this.music = null;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { try { this.ctx = new AC(); } catch { return; } }
    const ctx = this.ctx;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.master = g(this._masterTarget());
    this.sfxBus = g(this.sfxOn ? 0.9 : 0);
    this.musicBus = g(this.musicOn ? 0.55 : 0);
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    // shared soft room reverb (garden air)
    this.revIn = g(1);
    this.conv = ctx.createConvolver();
    this.conv.buffer = makeImpulse(ctx, 2.2, 2.6);
    this.revOut = g(0.32);
    this.revIn.connect(this.conv); this.conv.connect(this.revOut); this.revOut.connect(this.master);
    // master dynamics: gentle glue + safety limiter
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    this.master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    this.noise = makeNoise(ctx);
    this.ready = true;
    this.music = new Music(ctx, this.musicBus, this.revIn);
    const unlock = () => this.resume();
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    this.resume();
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

  setSfx(on) { this.sfxOn = !!on; if (this.ctx) this._ramp(this.sfxBus.gain, on ? 0.9 : 0); }
  setMusic(on) {
    this.musicOn = !!on;
    if (this.ctx) this._ramp(this.musicBus.gain, on ? 0.55 : 0, 0.4);
  }
  startMusic() { if (this.music) this.music.start(); this._startAmbience(); }

  // ---- ambience: birds by day, crickets at night, rain bed. Routed through the SFX bus, very quiet. ----
  setAmbience(mode) { this.ambMode = mode; if (this.ctx) this._applyAmbienceBeds(); }
  _startAmbience() {
    if (!this.ctx || this._ambTimer) return;
    this.ambOut = this.ctx.createGain(); this.ambOut.gain.value = 0.9; this.ambOut.connect(this.sfxBus);
    const bed = (type, f, q) => {
      const src = this.ctx.createBufferSource(), flt = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      src.buffer = this.noise; src.loop = true; flt.type = type; flt.frequency.value = f; flt.Q.value = q; g.gain.value = 0;
      src.connect(flt); flt.connect(g); g.connect(this.ambOut); src.start();
      return g;
    };
    this.windBed = bed('lowpass', 420, 0.5);
    this.rainBed = bed('bandpass', 2400, 0.6);
    this._applyAmbienceBeds();
    this._ambNext = this.ctx.currentTime + 1.5;
    this._ambTimer = setInterval(() => this._ambTick(), 250);
  }
  _applyAmbienceBeds() {
    if (!this.windBed) return;
    const m = this.ambMode || 'day';
    this._ramp(this.windBed.gain, m === 'rain' ? 0.02 : 0.035, 1.5);
    this._ramp(this.rainBed.gain, m === 'rain' ? 0.11 : 0, 2);
  }
  _ambTick() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.mutes.size || !this.sfxOn) return;
    const t = c.currentTime;
    if (t < this._ambNext) return;
    const m = this.ambMode || 'day';
    const out = this.ambOut;
    if (m === 'day' || m === 'golden' || m === 'rainbow') {
      // a little songbird: 2-5 quick chirps
      const n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1600, pan = c.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(out);
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.09 + Math.random() * 0.05), f = base * (1 + (Math.random() - 0.5) * 0.25);
        this.osc(pan, tt, { type: 'sine', f, f2: f * (1.25 + Math.random() * 0.3), glide: 0.05, a: 0.004, d: 0.06, v: 0.035 });
      }
      this._ambNext = t + 2.5 + Math.random() * 5;
    } else if (m === 'night') {
      // crickets
      const pan = c.createStereoPanner(); pan.pan.value = Math.random() * 1.4 - 0.7; pan.connect(out);
      for (let i = 0; i < 3; i++) this.osc(pan, t + i * 0.055, { type: 'sine', f: 4300 + Math.random() * 200, a: 0.003, d: 0.035, v: 0.02 });
      this._ambNext = t + 0.5 + Math.random() * 0.9;
    } else if (m === 'rain') {
      this.hiss(out, t, { type: 'highpass', f: 3500, q: 0.7, a: 0.001, d: 0.02, v: 0.03 });
      this._ambNext = t + 0.05 + Math.random() * 0.25;
    }
  }
  setMusicMood(m) { if (this.music) this.music.setMood(m); }

  // one-shot SFX. opts: { volume, pitch, step (musical step for pitched sounds), delay }
  play(name, opts = {}) {
    if (!this.ready || !this.sfxOn || this.mutes.size) return;
    const fn = SFX[name];
    if (!fn) { console.warn('[audio] unknown sfx', name); return; }
    // de-dupe identical sounds fired in the same few ms (e.g. 3 cells unlocking at once)
    const now = this.ctx.currentTime;
    const minGap = opts.minGap ?? 0.025;
    if (!opts.delay && now - (this.lastPlay.get(name) || -1) < minGap) return;
    this.lastPlay.set(name, now);
    try { fn(this, now + (opts.delay || 0), opts); } catch (e) { console.warn('[audio]', name, e); }
  }

  // ---- building blocks used by the SFX table ----
  out(vol = 1, rev = 0.25) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.sfxBus);
    if (rev > 0) { const s = this.ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(this.revIn); }
    return g;
  }
  // enveloped oscillator: a (attack), d (decay to 0, exponential)
  osc(dest, t, { type = 'sine', f = 440, f2 = null, glide = 0.1, a = 0.004, d = 0.3, v = 0.3, detune = 0 }) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + glide);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  // filtered noise burst
  hiss(dest, t, { type = 'bandpass', f = 2000, f2 = null, q = 1, a = 0.005, d = 0.2, v = 0.2, glide = 0.2 }) {
    const ctx = this.ctx, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise; src.loop = true;
    flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + glide);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    src.connect(flt); flt.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + a + d + 0.05);
  }
  // soft mallet (marimba-ish): fundamental + 4th partial, fast decay
  mallet(dest, t, f, v = 0.25, d = 0.5) {
    this.osc(dest, t, { f, a: 0.003, d, v });
    this.osc(dest, t, { f: f * 4.0, a: 0.002, d: d * 0.25, v: v * 0.22 });
    this.osc(dest, t, { f: f * 2.0, a: 0.003, d: d * 0.5, v: v * 0.12, type: 'triangle' });
  }
  // glassy bell (inharmonic partials)
  bell(dest, t, f, v = 0.18, d = 1.2) {
    this.osc(dest, t, { f, a: 0.002, d, v });
    this.osc(dest, t, { f: f * 2.76, a: 0.002, d: d * 0.45, v: v * 0.35 });
    this.osc(dest, t, { f: f * 5.4, a: 0.001, d: d * 0.2, v: v * 0.18 });
  }
}

// ------------------------------------------------------------------------------------------------ SFX table
const SFX = {
  // lifting a stack from the tray
  pick(A, t, o) {
    const out = A.out(0.8 * (o.volume ?? 1), 0.15);
    A.osc(out, t, { type: 'sine', f: 330 * (o.pitch || 1), f2: 620 * (o.pitch || 1), glide: 0.09, a: 0.005, d: 0.14, v: 0.28 });
    A.osc(out, t + 0.03, { type: 'triangle', f: 880 * (o.pitch || 1), a: 0.003, d: 0.08, v: 0.06 });
  },
  // stack lands in a cell
  drop(A, t, o) {
    const out = A.out(0.9 * (o.volume ?? 1), 0.18);
    A.osc(out, t, { type: 'sine', f: 190, f2: 70, glide: 0.12, a: 0.003, d: 0.18, v: 0.5 });
    A.hiss(out, t, { type: 'lowpass', f: 1400, q: 0.7, a: 0.002, d: 0.07, v: 0.18 });
    A.mallet(out, t + 0.01, 523.25 * (o.pitch || 1), 0.12, 0.25);
  },
  // released somewhere invalid
  invalid(A, t) {
    const out = A.out(0.7, 0.1);
    A.osc(out, t, { type: 'triangle', f: 260, f2: 180, glide: 0.14, a: 0.004, d: 0.16, v: 0.22 });
    A.osc(out, t + 0.09, { type: 'triangle', f: 200, f2: 150, glide: 0.12, a: 0.004, d: 0.16, v: 0.18 });
  },
  // one tile flipping onto another stack; o.step walks up a pentatonic scale so chains play a melody
  flip(A, t, o) {
    const step = o.step || 0;
    const f = pentaFreq(392, Math.min(step, 17));
    const out = A.out(0.75 * (o.volume ?? 1), 0.3);
    A.mallet(out, t, f, 0.2, 0.32);
    A.hiss(out, t, { type: 'highpass', f: 5000, q: 0.5, a: 0.001, d: 0.03, v: 0.05 });
  },
  // a tile popping during a clear (rising bubbles)
  pop(A, t, o) {
    const step = o.step || 0;
    const f = pentaFreq(523.25, Math.min(step, 14));
    const out = A.out(0.6 * (o.volume ?? 1), 0.35);
    A.osc(out, t, { type: 'sine', f: f * 0.8, f2: f * 1.6, glide: 0.06, a: 0.002, d: 0.1, v: 0.22 });
  },
  // a full stack clears: shimmering chord
  clear(A, t, o) {
    const out = A.out(0.8 * (o.volume ?? 1), 0.5);
    const root = 523.25 * (o.pitch || 1);
    [0, 4, 7, 12, 16].forEach((s, i) => A.bell(out, t + i * 0.045, root * Math.pow(2, s / 12), 0.1, 1.1));
    A.hiss(out, t, { type: 'highpass', f: 6000, f2: 9000, q: 0.5, a: 0.02, d: 0.5, v: 0.06, glide: 0.5 });
  },
  // combo (2+ clears in one move)
  combo(A, t, o) {
    const out = A.out(0.8, 0.5);
    const n = Math.min(6, 2 + (o.step || 0));
    for (let i = 0; i < n; i++) A.bell(out, t + i * 0.06, pentaFreq(659.25, i * 2), 0.09, 0.8);
  },
  // a flower sprouts in the garden
  bloom(A, t, o) {
    const out = A.out(0.5 * (o.volume ?? 1), 0.5);
    A.osc(out, t, { type: 'sine', f: 300 * (o.pitch || 1), f2: 900 * (o.pitch || 1), glide: 0.25, a: 0.02, d: 0.3, v: 0.12 });
    A.bell(out, t + 0.16, 1046.5 * (o.pitch || 1), 0.06, 0.9);
  },
  // coins ticking into the counter
  coin(A, t, o) {
    const out = A.out(0.55 * (o.volume ?? 1), 0.2);
    const f = 1318.5 * (o.pitch || 1);
    A.osc(out, t, { type: 'square', f, a: 0.001, d: 0.05, v: 0.05 });
    A.osc(out, t + 0.05, { type: 'square', f: f * 1.335, a: 0.001, d: 0.12, v: 0.05 });
  },
  // UI button
  button(A, t) {
    const out = A.out(0.6, 0.1);
    A.osc(out, t, { type: 'sine', f: 640, f2: 900, glide: 0.05, a: 0.002, d: 0.07, v: 0.2 });
  },
  toggle(A, t, o) {
    const out = A.out(0.6, 0.1);
    A.osc(out, t, { type: 'sine', f: o.pitch && o.pitch < 1 ? 700 : 900, f2: o.pitch && o.pitch < 1 ? 500 : 1300, glide: 0.06, a: 0.002, d: 0.08, v: 0.18 });
  },
  // soft whoosh for screen transitions / shuffles
  whoosh(A, t, o) {
    const out = A.out(0.6 * (o.volume ?? 1), 0.2);
    A.hiss(out, t, { type: 'bandpass', f: 500, f2: 3000, q: 1.2, a: 0.08, d: 0.25, v: 0.25, glide: 0.3 });
  },
  shuffle(A, t) {
    const out = A.out(0.7, 0.2);
    A.hiss(out, t, { type: 'bandpass', f: 800, f2: 2600, q: 1.5, a: 0.05, d: 0.3, v: 0.25, glide: 0.3 });
    [0, 1, 2].forEach((i) => A.mallet(out, t + 0.12 + i * 0.07, pentaFreq(523.25, i * 2), 0.1, 0.2));
  },
  // hammer smashing a stack
  hammer(A, t) {
    const out = A.out(0.9, 0.25);
    A.osc(out, t, { type: 'sine', f: 140, f2: 45, glide: 0.2, a: 0.002, d: 0.3, v: 0.6 });
    A.hiss(out, t, { type: 'lowpass', f: 3000, f2: 400, q: 0.8, a: 0.001, d: 0.35, v: 0.35, glide: 0.3 });
    A.hiss(out, t + 0.02, { type: 'bandpass', f: 2500, q: 2, a: 0.001, d: 0.12, v: 0.2 });
  },
  // vines on a locked cell wither away
  unlock(A, t) {
    const out = A.out(0.7, 0.4);
    A.hiss(out, t, { type: 'bandpass', f: 1800, f2: 5000, q: 2, a: 0.01, d: 0.25, v: 0.12, glide: 0.25 });
    [0, 2, 4].forEach((s, i) => A.bell(out, t + 0.1 + i * 0.07, pentaFreq(784, s), 0.08, 0.7));
  },
  // ice cracking off a frozen stack
  ice(A, t) {
    const out = A.out(0.7, 0.4);
    A.hiss(out, t, { type: 'highpass', f: 3500, q: 0.7, a: 0.001, d: 0.12, v: 0.3 });
    A.bell(out, t, 1760, 0.08, 0.35);
    A.bell(out, t + 0.05, 2349, 0.06, 0.3);
  },
  // level goal reached
  win(A, t) {
    const out = A.out(0.9, 0.45);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => A.mallet(out, t + i * 0.11, f, 0.22, 0.6));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => A.bell(out, t + 0.5, f, 0.07, 1.8));
  },
  // stars popping on the results card
  star(A, t, o) {
    const out = A.out(0.7, 0.4);
    const f = pentaFreq(784, (o.step || 0) * 2);
    A.bell(out, t, f, 0.12, 0.9);
    A.osc(out, t, { type: 'sine', f: f / 2, a: 0.003, d: 0.25, v: 0.12 });
  },
  // out of space
  fail(A, t) {
    const out = A.out(0.8, 0.4);
    [392, 329.63, 261.63].forEach((f, i) => A.mallet(out, t + i * 0.16, f, 0.2, 0.55));
  },
  // booster granted / revive
  reward(A, t) {
    const out = A.out(0.8, 0.45);
    [0, 2, 4, 5, 7].forEach((s, i) => A.bell(out, t + i * 0.05, pentaFreq(659.25, s), 0.08, 0.9));
  },
  // level start
  start(A, t) {
    const out = A.out(0.6, 0.4);
    A.hiss(out, t, { type: 'bandpass', f: 400, f2: 1800, q: 1, a: 0.1, d: 0.3, v: 0.12, glide: 0.4 });
    [0, 2, 4].forEach((s, i) => A.mallet(out, t + 0.1 + i * 0.08, pentaFreq(392, s + 5), 0.14, 0.4));
  },
};

// ------------------------------------------------------------------------------------------------ DSP helpers
function makeNoise(ctx) {
  const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// stereo impulse: exponentially decaying, darkening noise tail
function makeImpulse(ctx, seconds, decay) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const a = 0.08 + 0.7 * Math.exp(-x * 5);
      lp += (Math.random() * 2 - 1 - lp) * a;
      d[i] = lp * Math.pow(1 - x, decay) * (i < sr * 0.004 ? i / (sr * 0.004) : 1);
    }
  }
  return buf;
}

export const audio = new AudioEngine();
