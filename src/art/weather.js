// Light and weather over the illustrated garden: drifting cloud shadows, warm golden hour with sunbeams, a cool
// moonlit night, rain (tint, streaks, splashes) and rainbows — blended smoothly — plus a soft vignette.
import { rgba } from './color.js';
import { SQ } from './view3q.js';
import { rng } from './paint.js';

const TAU = Math.PI * 2;
const KINDS = ['rain', 'night', 'golden', 'rainbow'];

export class Weather {
  constructor(quality) {
    this.q = quality;
    this.kind = 'clear';
    this.k = { rain: 0, night: 0, golden: 0, rainbow: 0 };
    const R = rng(4);
    this.clouds = Array.from({ length: 5 }, (_, i) => ({ x: (R() - 0.5) * 50, z: (R() - 0.5) * 36, r: 4 + R() * 4, sp: 0.18 + R() * 0.12, seed: R() * 10 }));
    this.drops = [];
    this.splash = [];
    this.vig = null;
    this.flash = 0;
  }
  set(kind) { this.kind = kind; }
  update(dt, time) {
    for (const k of KINDS) {
      const t = this.kind === k ? 1 : 0;
      this.k[k] += (t - this.k[k]) * (1 - Math.exp(-dt * 0.9));
      if (Math.abs(this.k[k] - t) < 0.001) this.k[k] = t;
    }
    for (const c of this.clouds) { c.x += c.sp * dt * (1 + this.k.rain * 1.5); if (c.x > 28) c.x = -28; }
  }

  // one soft cloud-shaped shadow, painted once and stretched per cloud
  _cloudSprite() {
    if (this.cloudSpr) return this.cloudSpr;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const g = c.getContext('2d');
    for (const [dx, dy, k] of [[-0.42, 0, 0.62], [0.12, -0.12, 0.8], [0.5, 0.08, 0.56], [0, 0.18, 0.6]]) {
      const x = 128 + dx * 128, y = 80 + dy * 110, r = k * 105;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(20,50,60,0.55)'); gr.addColorStop(0.6, 'rgba(20,50,60,0.3)'); gr.addColorStop(1, 'rgba(20,50,60,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.72, 0, 0, TAU); g.fill();
    }
    this.cloudSpr = c;
    return c;
  }
  _cloudShadows(ctx, s) {
    const ppu = s.cam.ppu;
    const a = 0.2 + this.k.rain * 0.16 - this.k.night * 0.16;
    if (a <= 0.02) return;
    const spr = this._cloudSprite();
    ctx.globalAlpha = a;
    for (const c of this.clouds) {
      const X = s.sx(c.x), Y = s.sy(c.z * SQ), w = c.r * 2.6 * ppu, h = w * 0.55;
      if (X + w / 2 < 0 || X - w / 2 > s.vw || Y + h / 2 < 0 || Y - h / 2 > s.vh) continue;
      ctx.drawImage(spr, X - w / 2, Y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  // colour grading pass (after the world, before glows)
  overlay(ctx, s, time) {
    const W = s.vw, H = s.vh, k = this.k;
    this._cloudShadows(ctx, s);
    if (k.golden > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba('#ffd9a0', k.golden * 0.55); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = rgba('#ff9a3c', k.golden * 0.55); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen';
      this._rays(ctx, W, H, time, k.golden);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (k.rain > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba('#8196b0', k.rain * 0.75); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `rgba(128,128,128,${k.rain * 0.25})`; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (k.night > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba('#3b4a9a', k.night * 0.85); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(W * 0.2, -H * 0.1, 0, W * 0.2, -H * 0.1, Math.max(W, H) * 0.9);
      g.addColorStop(0, `rgba(120,150,255,${0.3 * k.night})`); g.addColorStop(1, 'rgba(120,150,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (k.rainbow > 0.01) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `rgba(255,255,255,${k.rainbow * 0.35})`; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen';
      this._rainbow(ctx, W, H, k.rainbow);
      this._rays(ctx, W, H, time, k.rainbow * 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  _rays(ctx, W, H, time, a) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = W * (0.05 + i * 0.22) + Math.sin(time * 0.2 + i) * W * 0.02;
      const w = W * (0.05 + (i % 2) * 0.04);
      const alpha = a * (0.1 + 0.05 * Math.sin(time * 0.7 + i * 1.3));
      const g = ctx.createLinearGradient(x, 0, x - H * 0.5, H);
      g.addColorStop(0, `rgba(255,236,170,${alpha})`); g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + w, -10); ctx.lineTo(x + w - H * 0.55, H); ctx.lineTo(x - H * 0.55, H); ctx.closePath(); ctx.fill();
    }
  }

  _rainbow(ctx, W, H, a) {
    const cols = ['#ff5f6d', '#ff9f43', '#ffd93d', '#6bd66b', '#4fb5ff', '#8f6bff'];
    const R = Math.max(W, H) * 0.75, cx = W * 0.55, cy = H * 0.95;
    const bw = R * 0.035;
    for (let i = 0; i < cols.length; i++) {
      ctx.strokeStyle = rgba(cols[i], 0.32 * a); ctx.lineWidth = bw;
      ctx.beginPath(); ctx.arc(cx, cy, R - i * bw, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    }
  }

  // additive glows after grading (none at the moment besides particles; kept for lanterns etc.)
  glow() {}

  // rain streaks + vignette, drawn last
  post(ctx, s, time) {
    const W = s.vw, H = s.vh, k = this.k;
    if (k.rain > 0.02) {
      const target = Math.round(160 * k.rain * (this.q.particles ?? 1));
      while (this.drops.length < target) this.drops.push({ x: Math.random() * (W + 200) - 100, y: Math.random() * H, v: 900 + Math.random() * 500, l: 14 + Math.random() * 14 });
      if (this.drops.length > target) this.drops.length = target;
      ctx.strokeStyle = `rgba(220,235,255,${0.45 * k.rain})`; ctx.lineWidth = 1.2;
      ctx.beginPath();
      const dt = 1 / 60;
      for (const d of this.drops) {
        d.y += d.v * dt; d.x -= d.v * dt * 0.18;
        if (d.y > H) {
          if (Math.random() < 0.5) this.splash.push({ x: d.x, y: H * (0.3 + Math.random() * 0.7), t: 0 });
          d.y = -20 - Math.random() * 60; d.x = Math.random() * (W + 200) - 50;
        }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.18, d.y - d.l);
      }
      ctx.stroke();
      ctx.strokeStyle = `rgba(230,240,255,${0.5 * k.rain})`;
      for (const p of this.splash) {
        p.t += 1 / 60;
        const r = 2 + p.t * 30;
        ctx.globalAlpha = Math.max(0, 1 - p.t / 0.3);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.35, 0, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      this.splash = this.splash.filter((p) => p.t < 0.3);
    } else if (this.drops.length) { this.drops.length = 0; this.splash.length = 0; }
    // vignette + warm sunlight from the upper left, baked into one small image (one full-screen draw)
    const day = Math.round((1 - Math.max(k.night, k.rain)) * 20) / 20;
    if (!this.vig || this.vig.w !== W || this.vig.h !== H || this.vig.day !== day) {
      const c = this.vig?.c || document.createElement('canvas');
      c.width = Math.max(1, Math.round(W / 4)); c.height = Math.max(1, Math.round(H / 4));
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      if (day > 0) {
        const warm = g.createLinearGradient(0, 0, c.width, c.height);
        warm.addColorStop(0, `rgba(255,244,200,${0.16 * day})`); warm.addColorStop(0.55, 'rgba(255,244,200,0)');
        g.fillStyle = warm; g.fillRect(0, 0, c.width, c.height);
      }
      const gr = g.createRadialGradient(c.width / 2, c.height * 0.48, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height * 0.48, Math.hypot(c.width, c.height) * 0.62);
      gr.addColorStop(0, 'rgba(30,20,50,0)'); gr.addColorStop(1, 'rgba(30,20,50,0.38)');
      g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      this.vig = { c, w: W, h: H, day };
    }
    ctx.drawImage(this.vig.c, 0, 0, W, H);
  }
}
