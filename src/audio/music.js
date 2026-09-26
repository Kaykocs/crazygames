// Procedural ambient garden music: soft pads, a round sine bass and a wandering kalimba melody on a major
// pentatonic, scheduled a little ahead of the audio clock. Seeded per phrase so it never loops audibly.
import { rng } from '../core/math.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// progressions as [root midi, chord intervals]; key of F / C alternate between sections
const SECTIONS = [
  [[53, [0, 4, 7, 11]], [50, [0, 3, 7, 10]], [58, [0, 4, 7, 14]], [48, [0, 4, 7, 9]]],   // Fmaj7  Dm7  Bbadd9  C6
  [[48, [0, 4, 7, 14]], [45, [0, 3, 7, 10]], [53, [0, 4, 7, 11]], [55, [0, 5, 7, 10]]],  // Cadd9  Am7  Fmaj7  G7sus
  [[50, [0, 3, 7, 10]], [55, [0, 4, 7, 9]], [48, [0, 4, 7, 11]], [53, [0, 4, 9, 14]]],   // Dm7  G6  Cmaj7  F6/9
];
const PENTA = [0, 2, 4, 7, 9];

export class Music {
  constructor(ctx, bus, reverb) {
    this.ctx = ctx; this.bus = bus; this.reverb = reverb;
    this.playing = false; this.paused = false;
    this.bpm = 76;
    this.step = 0;            // 8th-note counter
    this.nextT = 0;
    this.mood = 'play';
    this.rnd = rng((Math.random() * 1e9) | 0);
    this.section = 0;
    this.melodyPos = 7;
    this.timer = null;
    this.out = ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(bus);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.55; this.out.connect(this.wet); this.wet.connect(reverb);
    // gentle warmth on everything
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 5200; this.lp.Q.value = 0.3;
    this.lp.connect(this.out);
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.nextT = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this._tick(), 50);
  }
  stop() { this.playing = false; clearInterval(this.timer); this.timer = null; }
  setPaused(p) {
    this.paused = p;
    if (!p && this.playing) this.nextT = Math.max(this.nextT, this.ctx.currentTime + 0.1);
  }
  setMood(m) { this.mood = m; }

  _tick() {
    if (!this.playing || this.paused || this.ctx.state !== 'running') return;
    const spb = 60 / this.bpm / 2; // seconds per 8th
    // don't try to catch up after a stall (tab throttling): skip ahead instead of machine-gunning notes
    if (this.nextT < this.ctx.currentTime - 0.2) this.nextT = this.ctx.currentTime + 0.05;
    while (this.nextT < this.ctx.currentTime + 0.25) {
      this._schedule(this.step, this.nextT, spb);
      this.nextT += spb;
      this.step++;
    }
  }

  _schedule(step, t, spb) {
    const r = this.rnd;
    const bar = Math.floor(step / 8), inBar = step % 8;
    const chordIdx = bar % 4;
    if (inBar === 0 && chordIdx === 0 && bar > 0 && bar % 8 === 0) this.section = (this.section + 1 + r.int(2)) % SECTIONS.length;
    const [root, ivs] = SECTIONS[this.section][chordIdx];
    const calm = this.mood === 'menu';
    // pad + bass on each bar
    if (inBar === 0) {
      ivs.forEach((iv, i) => this._pad(mtof(root + 12 + iv), t + i * 0.03, spb * 8.4, calm ? 0.035 : 0.04));
      this._bass(mtof(root - 12), t, spb * 7.5, 0.13);
    }
    if (inBar === 4 && r.chance(0.5)) this._bass(mtof(root - 12 + (r.chance(0.5) ? 7 : 12)), t, spb * 3.5, 0.08);
    // melody: kalimba random walk on the pentatonic of the section's key, phrase-shaped density
    const keyRoot = this.section === 0 ? 65 : this.section === 1 ? 60 : 62;
    const density = calm ? 0.26 : (inBar % 2 === 0 ? 0.5 : 0.24);
    if (r() < density) {
      this.melodyPos += r.weighted([1, 3, 2, 3, 1]) - 2;
      this.melodyPos = Math.max(2, Math.min(12, this.melodyPos));
      const p = this.melodyPos, deg = PENTA[p % 5], oct = Math.floor(p / 5);
      const midi = keyRoot + deg + 12 * oct;
      this._kalimba(mtof(midi), t + (r() - 0.5) * 0.015, 0.06 + r() * 0.03);
      // occasional harmony a sixth below
      if (r.chance(0.18)) this._kalimba(mtof(midi - 9), t + 0.01, 0.035);
    }
    // sparkle
    if (inBar === 7 && r.chance(0.2)) this._bell(mtof(keyRoot + 24 + PENTA[r.int(5)]), t, 0.025);
    // soft shaker on off-beats (play mood only)
    if (!calm && inBar % 2 === 1) this._shaker(t, inBar === 3 || inBar === 7 ? 0.03 : 0.018);
  }

  _env(g, t, a, hold, rel, v) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  _pad(f, t, dur, v) {
    const c = this.ctx, g = c.createGain(), flt = c.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 0.5;
    for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      o.connect(flt); o.start(t); o.stop(t + dur + 0.1);
    }
    flt.connect(g); g.connect(this.lp);
    this._env(g, t, dur * 0.3, dur * 0.35, dur * 0.35, v);
  }
  _bass(f, t, dur, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o.connect(g); g.connect(this.lp);
    this._env(g, t, 0.06, dur * 0.4, dur * 0.6, v);
    o.start(t); o.stop(t + dur + 0.1);
  }
  _kalimba(f, t, v) {
    const c = this.ctx;
    const partials = [[1, 1, 1.4], [5.4, 0.18, 0.18], [2.01, 0.08, 0.5]];
    for (const [m, a, d] of partials) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v * a, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.lp); o.start(t); o.stop(t + d + 0.05);
    }
  }
  _bell(f, t, v) {
    const c = this.ctx;
    for (const [m, a, d] of [[1, 1, 2.2], [2.76, 0.3, 0.9], [5.4, 0.12, 0.4]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v * a, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.lp); o.start(t); o.stop(t + d + 0.05);
    }
  }
  _shaker(t, v) {
    const c = this.ctx;
    if (!this._nb) {
      const len = c.sampleRate * 0.5; this._nb = c.createBuffer(1, len, c.sampleRate);
      const d = this._nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this._nb; f.type = 'highpass'; f.frequency.value = 7000;
    s.connect(f); f.connect(g); g.connect(this.out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    s.start(t, Math.random() * 0.3); s.stop(t + 0.12);
  }
}
