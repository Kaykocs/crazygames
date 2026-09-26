// Minimal tween scheduler driven by the game loop's dt (so animations pause with the game and can be stepped
// deterministically in tests). Every tween returns a promise that resolves when it finishes.
//
//   await tweens.to(dur, (k, raw) => {...}, { ease: ease.outBack, delay: 0.1 })
//   await tweens.wait(0.3)
import { ease as E } from './math.js';

class Tweens {
  constructor() { this.list = []; this.time = 0; }

  to(dur, update, { ease = E.outCubic, delay = 0, tag = null } = {}) {
    return new Promise((resolve) => {
      this.list.push({ t: -delay, dur: Math.max(1e-4, dur), update, ease, resolve, tag, started: false });
    });
  }
  wait(dur) { return this.to(dur, () => {}, { ease: E.linear }); }

  // finish (snap to the end) or drop everything with a tag
  finish(tag) {
    for (const tw of this.list) if (tw.tag === tag) { tw.update(1, 1); tw.done = true; tw.resolve(); }
    this.list = this.list.filter((tw) => !tw.done);
  }
  cancel(tag) { this.list = this.list.filter((tw) => { if (tw.tag === tag) { tw.resolve(); return false; } return true; }); }
  get busy() { return this.list.length > 0; }

  update(dt) {
    this.time += dt;
    if (!this.list.length) return;
    const list = this.list;
    this.list = [];
    const keep = [];
    for (const tw of list) {
      tw.t += dt;
      if (tw.t < 0) { keep.push(tw); continue; }
      const raw = Math.min(1, tw.t / tw.dur);
      try { tw.update(tw.ease(raw), raw); } catch (e) { console.error('[tween]', e); tw.t = tw.dur; }
      if (raw >= 1) tw.resolve(); else keep.push(tw);
    }
    // tweens created during this update were pushed to the fresh this.list
    this.list = keep.concat(this.list);
  }
}

export const tweens = new Tweens();
