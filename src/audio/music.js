// Generative garden music: warm pads, a round bass and a plucked lead (kalimba, marimba, harp or music box)
// that states a short motif and develops it over each 8-bar section: motif, answer, sequence, cadence.
// Harmony stays in C and F major (the SFX are tuned to C major pentatonic, which sits inside both), the
// arrangement drifts between sparse and fuller sections, the lead instrument rotates, and every few minutes
// the music rests for a section and lets the garden ambience through, so a long session never settles into
// an audible loop. Notes are scheduled up to a second ahead of the audio clock from a 50 ms timer, so a busy
// main thread (heavy frames, slow phones) doesn't make it stumble.
//   new Music(ctx, bus, reverbIn); start(); stop(); setPaused(p); setMood('play' | 'menu')
import { rng } from '../core/math.js';

const LOOKAHEAD = 1; // s
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];

// four-bar progressions: [tonic pitch class, [[root midi, chord intervals] × 4]]
const PROGS = [
  [0, [[48, [0, 4, 7, 11]], [45, [0, 3, 7, 10]], [50, [0, 3, 7, 10]], [43, [0, 5, 7, 10]]]], // Cmaj7 Am7 Dm7 G7sus4
  [0, [[48, [0, 4, 7, 14]], [53, [0, 4, 7, 11]], [45, [0, 3, 7, 10]], [43, [0, 5, 7, 14]]]], // Cadd9 Fmaj7 Am7 Gsus
  [0, [[53, [0, 4, 7, 11]], [48, [0, 4, 7, 14]], [50, [0, 3, 7, 10]], [43, [0, 5, 7, 10]]]], // Fmaj7 Cadd9 Dm7 G7sus4
  [0, [[45, [0, 3, 7, 10]], [53, [0, 4, 7, 11]], [48, [0, 4, 7, 14]], [43, [0, 5, 7, 10]]]], // Am7 Fmaj7 Cadd9 G7sus4
  [0, [[48, [0, 4, 7, 9]], [50, [0, 3, 7, 10]], [53, [0, 4, 7, 9]], [43, [0, 5, 7, 10]]]],   // C6 Dm7 F6 G7sus4
  // (F major's dominant is voiced C6 / Cadd9, without the F, so pentatonic SFX never rub against it)
  [5, [[53, [0, 4, 7, 11]], [50, [0, 3, 7, 10]], [46, [0, 4, 7, 11]], [48, [0, 4, 7, 9]]]],  // Fmaj7 Dm7 Bbmaj7 C6
  [5, [[46, [0, 4, 7, 14]], [48, [0, 4, 7, 9]], [45, [0, 3, 7, 10]], [50, [0, 3, 7, 10]]]],  // Bbadd9 C6 Am7 Dm7
  [5, [[53, [0, 4, 7, 14]], [43, [0, 3, 7, 10]], [46, [0, 4, 7, 11]], [48, [0, 4, 7, 14]]]], // Fadd9 Gm7 Bbmaj7 Cadd9
  [5, [[50, [0, 3, 7, 10]], [46, [0, 4, 7, 11]], [53, [0, 4, 7, 14]], [48, [0, 4, 7, 9]]]],  // Dm7 Bbmaj7 Fadd9 C6
];
// two-bar motif rhythms as [eighth-note slot 0..15, length in eighths]
const RHYTHMS = [
  [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[1, 1], [2, 1], [3, 1], [4, 4], [9, 1], [10, 1], [11, 1], [12, 4]],
  [[0, 2], [2, 2], [4, 1], [5, 1], [6, 2], [8, 6], [14, 2]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 4], [4, 2], [6, 2], [8, 4], [13, 1], [14, 2]],
  [[2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 1], [11, 1], [12, 4]],
  [[0, 2], [3, 2], [6, 2], [8, 2], [11, 2], [14, 2]],
];
// the section's last two bars: fewer notes and a long landing
const CADENCES = [
  [[0, 2], [2, 2], [4, 4], [8, 8]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 8]],
  [[0, 3], [3, 1], [4, 4], [8, 6]],
  [[2, 2], [4, 2], [6, 2], [8, 8]],
];
const ARPS = [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 0, 2, 1, 3], [0, 1, 2, 1, 3, 2, 1, 2], [3, 2, 1, 0, 1, 2, 3, 2]];
const LEADS = ['kalimba', 'marimba', 'harp', 'musicbox'];
// mix (peak amplitude per note): the lead carries the tune, pads and bass stay a soft bed under it
const MIX = {
  pad: 0.02, padSparse: 0.023, padRest: 0.018, bass: 0.05, bass2: 0.037,
  kalimba: 0.132, marimba: 0.157, harp: 0.088, musicbox: 0.048, arpHarp: 0.049, arpMarimba: 0.077, shaker: 0.145, wood: 0.1,
};

export class Music {
  constructor(ctx, bus, reverb) {
    this.ctx = ctx; this.bus = bus; this.reverb = reverb;
    this.playing = false; this.paused = false;
    this.bpm = 84;
    this.step = 0;            // 8th-note counter
    this.nextT = 0;
    this.mood = 'play';
    this.rnd = rng((Math.random() * 1e9) | 0);
    this.timer = null;
    this.sec = null;          // the current 8-bar section
    this.barInSec = 0;
    this.energy = 2;          // 1 sparse … 3 full; a slow random walk between sections
    this.recent = [];         // last progressions (not repeated back to back)
    this.lead = null;
    this.sinceRest = 0;
    this.restEvery = 6 + this.rnd.int(3);
    this.melLast = 74;
    this.voicing = [60, 64, 67, 71];
    this.out = ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(bus);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.5; this.out.connect(this.wet); this.wet.connect(reverb);
    // gentle warmth on everything, and a darker shared filter for the pads
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 5200; this.lp.Q.value = 0.3;
    this.lp.connect(this.out);
    this.padLp = ctx.createBiquadFilter(); this.padLp.type = 'lowpass'; this.padLp.frequency.value = 1200; this.padLp.Q.value = 0.2;
    this.padLp.connect(this.lp);
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
  setMood(m) {
    if (m === this.mood) return;
    this.mood = m;
    // night is darker and sparser; the next section adapts its arrangement, the pad colour changes now
    this.padLp.frequency.setTargetAtTime(m === 'menu' ? 800 : 1200, this.ctx.currentTime, 1.5);
  }

  _tick() {
    if (!this.playing || this.paused || this.ctx.state !== 'running') return;
    // don't try to catch up after a stall (tab throttling): skip ahead instead of machine-gunning notes
    if (this.nextT < this.ctx.currentTime - 0.2) this.nextT = this.ctx.currentTime + 0.05;
    this._fill(this.ctx.currentTime + LOOKAHEAD);
  }
  _fill(until) {
    const spb = 60 / this.bpm / 2; // seconds per 8th
    while (this.nextT < until) {
      this._schedule(this.step, this.nextT, spb);
      this.nextT += spb;
      this.step++;
    }
  }

  // ------------------------------------------------------------------------------------ composition
  _newSection() {
    const r = this.rnd, calm = this.mood === 'menu';
    const rest = ++this.sinceRest > this.restEvery;
    if (rest) { this.sinceRest = 0; this.restEvery = 5 + r.int(4); }
    let p;
    do { p = r.int(PROGS.length); } while (this.recent.includes(p));
    this.recent.push(p);
    if (this.recent.length > 3) this.recent.shift();
    const [key, chords] = PROGS[p];
    // energy wanders, but is pulled back toward the middle so neither sparse nor full stretches last long
    if (this.sec && !rest) this.energy = Math.max(1, Math.min(calm ? 1 : 3, this.energy + r.pick(this.energy === 1 ? [0, 1, 1] : this.energy === 3 ? [-1, -1, 0] : [-1, 0, 0, 1])));
    if (calm) this.energy = 1;
    const energy = rest ? 0 : this.energy;
    const pool = calm ? ['kalimba', 'musicbox'] : LEADS;
    let lead;
    do { lead = r.pick(pool); } while (lead === this.lead && pool.length > 1);
    this.lead = lead;
    const voicings = chords.map((ch) => this._voice(ch));
    const mel = energy ? this._melody(key, chords, energy) : [];
    const bySlot = [];
    for (const n of mel) (bySlot[n[0]] = bySlot[n[0]] || []).push(n);
    this.sec = {
      chords, voicings, energy, rest, lead, mel: bySlot,
      arp: !calm && (energy === 3 || (energy === 2 && r.chance(0.35))), arpInst: lead === 'marimba' ? 'harp' : 'marimba', arpPat: r.pick(ARPS),
    };
  }

  // close voicing around the previous chord (smooth voice leading), no semitone clusters
  _voice([root, ivs]) {
    const center = this.voicing.reduce((a, b) => a + b, 0) / this.voicing.length;
    let notes = ivs.map((iv) => {
      const pc = (root + iv) % 12;
      let m = pc + 12 * Math.round((center - pc) / 12);
      while (m < 55) m += 12;
      while (m > 74) m -= 12;
      return m;
    }).sort((a, b) => a - b);
    // a semitone pair (the 7th against the root) opens up: the lower note drops an octave, or the upper one rises
    for (let i = 1; i < notes.length; i++) if (notes[i] - notes[i - 1] <= 1) { if (notes[i - 1] >= 64) notes[i - 1] -= 12; else notes[i] += 12; }
    notes = notes.sort((a, b) => a - b);
    this.voicing = notes;
    return notes;
  }

  // an 8-bar melody: motif (bars 1-2), answer (3-4), sequence (5-6), cadence (7-8), on the key's pentatonic,
  // with strong beats pulled onto chord tones
  _melody(key, chords, energy) {
    const r = this.rnd;
    const pcs = PENTA.map((x) => (x + key) % 12);
    const ladder = [];
    for (let m = 62; m <= 86; m++) if (pcs.includes(m % 12)) ladder.push(m);
    const near = (m) => { let bi = 0; for (let i = 1; i < ladder.length; i++) if (Math.abs(ladder[i] - m) < Math.abs(ladder[bi] - m)) bi = i; return bi; };
    const contour = (n) => {
      const c = [0];
      for (let i = 1; i < n; i++) {
        const last = i > 1 ? c[i - 1] - c[i - 2] : 0;
        const d = Math.abs(last) >= 2 ? -Math.sign(last) * (1 + r.int(2)) : r.pick([-2, -1, -1, 0, 1, 1, 2]);
        c.push(c[i - 1] + d);
      }
      return c;
    };
    const rhythm = r.pick(RHYTHMS), cont = contour(rhythm.length), n = rhythm.length;
    // keep the tune in a comfortable register: centre the motif on the last phrase's landing note
    const lo = Math.min(...cont), hi = Math.max(...cont);
    const start = Math.max(-lo, Math.min(ladder.length - 1 - hi, near(this.melLast) - Math.round((lo + hi) / 2)));
    const notes = [];
    const place = (bar0, rh, c, off, last = false) => {
      rh.forEach(([s, len], i) => {
        const slot = bar0 * 8 + s, chord = chords[Math.floor(slot / 8) % 4];
        let m = ladder[Math.max(0, Math.min(ladder.length - 1, start + c[i] + off))];
        if (s % 4 === 0 || (last && i === rh.length - 1)) m = toChordTone(m, chord, ladder);
        notes.push([slot, m, len, (s % 4 === 0 ? 1 : 0.8) * r.range(0.85, 1.05)]);
      });
    };
    const tail = [r.pick([-2, -1, 1]), r.pick([-1, 1, 2])];
    place(0, rhythm, cont, 0);
    place(2, rhythm, cont.map((x, i) => (i >= n - 2 ? x + tail[i - (n - 2)] : x)), 0);
    place(4, rhythm, cont, r.pick([-2, -1, 1, 2]));
    const cad = r.pick(CADENCES), cc = contour(cad.length);
    const drift = cc[cc.length - 1];
    place(6, cad, cc.map((x) => x - Math.round(drift / 2)), 0, true);
    this.melLast = notes[notes.length - 1][1];
    // sparse sections keep the strong beats and some of the rest
    return energy <= 1 ? notes.filter((x) => x[0] % 4 === 0 || r.chance(0.45)) : notes;
  }

  // ------------------------------------------------------------------------------------ playback
  _schedule(step, t, spb) {
    const r = this.rnd, inBar = step % 8;
    if (inBar === 0) {
      if (!this.sec || this.barInSec >= 8) { this._newSection(); this.barInSec = 0; }
      this._bar(t, spb);
      this.barInSec++;
    }
    const sec = this.sec, bar = this.barInSec - 1, slot = bar * 8 + inBar, calm = this.mood === 'menu';
    const tt = t + (inBar % 2 ? spb * 0.14 : 0); // a light swing on the off-beats
    for (const [, m, len, v] of sec.mel[slot] || []) this._lead(sec.lead, mtof(m), tt + (r() - 0.5) * 0.012, len * spb, v);
    if (sec.arp && bar < 7) {
      const vc = sec.voicings[bar % 4];
      this._arp(sec.arpInst, mtof(vc[sec.arpPat[inBar] % vc.length] + 12), tt, (inBar % 4 === 0 ? 1 : 0.75) * r.range(0.85, 1.05));
    }
    if (!calm && sec.energy >= 2 && inBar % 2 === 1) this._shaker(tt, MIX.shaker * (inBar === 3 || inBar === 7 ? 1 : 0.6) * r.range(0.7, 1.1));
    if (!calm && sec.energy >= 3 && (inBar === 2 || inBar === 6)) this._wood(t, MIX.wood * r.range(0.8, 1.1));
    // a glint of bells at the end of phrases
    if (inBar === 7 && (bar === 3 || bar === 7) && !sec.rest && r.chance(0.3)) this._bell(mtof(84 + r.pick(PENTA)), tt, 0.02);
  }

  _bar(t, spb) {
    const r = this.rnd, sec = this.sec, bar = this.barInSec, chord = sec.chords[bar % 4], vc = sec.voicings[bar % 4];
    const len = spb * 8;
    if (sec.rest) {
      // resting: a soft pad fades out over the first half, then only the garden (and the odd bell)
      if (bar < 4) vc.forEach((m, i) => this._pad(mtof(m), t + i * 0.05, len * 1.1, MIX.padRest * (1 - bar * 0.2)));
      else if (r.chance(0.35)) this._bell(mtof(79 + r.pick(PENTA)), t + spb * r.int(6), 0.018);
      return;
    }
    const pv = sec.energy <= 1 ? MIX.padSparse : MIX.pad;
    vc.forEach((m, i) => this._pad(mtof(m), t + i * 0.03, len * 1.05, pv));
    const b = 40 + ((((chord[0] - 40) % 12) + 12) % 12); // E2 … D#3: low enough to be warm, high enough for phones
    const B = MIX.bass, B2 = MIX.bass2;
    if (sec.energy <= 1) this._bass(mtof(b), t, len * 0.9, B);
    else if (sec.energy === 2) { this._bass(mtof(b), t, spb * 3.6, B); this._bass(mtof(b + 7), t + spb * 4, spb * 3.4, B2); }
    else {
      this._bass(mtof(b), t, spb * 2.7, B);
      this._bass(mtof(b + 12), t + spb * 3.14, spb * 0.8, B2 * 0.65);
      this._bass(mtof(b + 7), t + spb * 4, spb * 1.8, B2);
      this._bass(mtof(b + (r.chance(0.5) ? 12 : 10)), t + spb * 6, spb * 1.8, B2 * 0.8);
    }
  }

  _lead(kind, f, t, dur, v) {
    if (kind === 'kalimba') this._kalimba(f, t, MIX.kalimba * v);
    else if (kind === 'marimba') this._marimba(f, t, MIX.marimba * v);
    else if (kind === 'harp') this._harp(f, t, MIX.harp * v, Math.max(0.6, dur * 1.5));
    else this._bell(f * 2, t, MIX.musicbox * v);
  }
  _arp(kind, f, t, v) {
    if (kind === 'harp') this._harp(f, t, MIX.arpHarp * v, 0.5);
    else this._marimba(f, t, MIX.arpMarimba * v);
  }

  // ------------------------------------------------------------------------------------ instruments
  _pad(f, t, dur, v) {
    const c = this.ctx, g = vca(c), pair = [];
    for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      o.connect(g); o.start(t); o.stop(t + dur + 0.1);
      pair.push(o);
    }
    done(pair[1], pair[0], g);
    g.connect(this.padLp);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + dur * 0.28);
    g.gain.setValueAtTime(v, t + dur * 0.62);
    g.gain.linearRampToValueAtTime(0, t + dur);
  }
  _bass(f, t, dur, v) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = vca(c), g2 = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o2.type = 'triangle'; o2.frequency.value = f; g2.gain.value = 0.35; // a little edge so it reads on small speakers
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.lp);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.03);
    g.gain.setValueAtTime(v, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    done(o, g, g2);
  }
  _partials(f, t, v, list) {
    const c = this.ctx;
    for (const [m, a, d] of list) {
      const o = c.createOscillator(), g = vca(c);
      o.type = 'sine'; o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v * a, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.lp); o.start(t); o.stop(t + d + 0.05);
      done(o, g);
    }
  }
  _kalimba(f, t, v) { this._partials(f, t, v, [[1, 1, 1.4], [5.9, 0.14, 0.12], [2.01, 0.08, 0.5]]); }
  _marimba(f, t, v) { this._partials(f, t, v, [[1, 1, 0.9], [3.93, 0.16, 0.14]]); }
  _bell(f, t, v) { this._partials(f, t, v, [[1, 1, 2.2], [2.76, 0.3, 0.9], [5.4, 0.12, 0.4]]); }
  _harp(f, t, v, d) {
    const c = this.ctx, o = c.createOscillator(), lp = c.createBiquadFilter(), g = vca(c);
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.Q.value = 0.3;
    lp.frequency.setValueAtTime(Math.min(9000, f * 6), t);
    lp.frequency.setTargetAtTime(f * 1.3, t + 0.005, 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(lp); lp.connect(g); g.connect(this.lp);
    o.start(t); o.stop(t + d + 0.05);
    done(o, lp, g);
  }
  _noiseBuf() {
    if (!this._nb) {
      const c = this.ctx, len = c.sampleRate * 0.5;
      this._nb = c.createBuffer(1, len, c.sampleRate);
      const d = this._nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this._nb;
  }
  _shaker(t, v) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = vca(c);
    s.buffer = this._noiseBuf(); f.type = 'bandpass'; f.frequency.value = 7500; f.Q.value = 0.8;
    s.connect(f); f.connect(g); g.connect(this.out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    s.start(t, Math.random() * 0.3); s.stop(t + 0.1);
    done(s, f, g);
  }
  // a soft wooden tick on the backbeat (fullest sections only)
  _wood(t, v) {
    const c = this.ctx, o = c.createOscillator(), g = vca(c);
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.02);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.06);
    done(o, g);
  }
}

// a note's envelope gain starts closed: a source that starts between samples must not leak a frame at gain 1
function vca(c) {
  const g = c.createGain();
  g.gain.value = 0;
  return g;
}

// once a note's source has ended, unhook its nodes from the graph
function done(src, ...nodes) {
  src.onended = () => { src.disconnect(); for (const n of nodes) n.disconnect(); };
}

// nearest note on the ladder that belongs to the chord
function toChordTone(m, [root, ivs], ladder) {
  const tones = ivs.map((i) => (root + i) % 12);
  if (tones.includes(m % 12)) return m;
  let best = m, bd = 99;
  for (const x of ladder) if (tones.includes(x % 12) && Math.abs(x - m) < bd) { bd = Math.abs(x - m); best = x; }
  return best;
}
