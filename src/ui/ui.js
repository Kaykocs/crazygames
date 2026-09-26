// DOM UI: HUD, orders, seed pouch, tools, world labels, toasts, panels (shop / book / settings), celebration
// cards and the tutorial pointer. Reads game state from the Garden; every change goes through `api`.
import { icon, flowerSVG, seedSVG, visitorSVG, decorIcon, weatherIcon } from './icons.js';
import { COLORS, SHAPES, PATTERNS, MUTATIONS, flowerName, speciesName, speciesOf, colorRecipe, shapeRecipe, rarity, flowerValue, growTime, SPECIES_COUNT, speciesId } from '../game/genetics.js';
import { UPGRADES, upgradeCost, xpForLevel, DECOR, ACHIEVEMENTS, VISITORS, orderText, SHOP_RESTOCK, ORDER_TTL, unlocked } from '../game/economy.js';
import { ADS_ENABLED, GAME_TITLE } from '../config.js';

export const fmt = (n) => {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, '') + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
};
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const WEATHER_NAMES = { clear: 'Sunny', rain: 'Rain shower', golden: 'Golden hour', night: 'Starry night', rainbow: 'Rainbow!' };
const stars = (n) => `<span class="stars">${Array.from({ length: n }, () => icon('star', 14)).join('')}</span>`;

export class UI {
  constructor(root, garden, api) {
    this.root = root; this.g = garden; this.api = api;
    this.sel = -1;            // selected pouch entry
    this.tool = '';           // '' | 'water' | 'dig'
    this.coinsShown = garden.s.coins;
    this.cards = [];          // celebration queue
    this.cardOpen = null;
    this.panel = null;
    this.seenPouch = new Set(garden.s.pouch.map((e) => keyOf(e.g)));
    this.plotTags = new Map();
    this.dirty = { pouch: true, orders: true, tools: true, hud: true };
    this._build();
  }

  // ------------------------------------------------------------------------------------------ build
  _build() {
    const r = this.root;
    r.innerHTML = '';
    // top HUD
    const top = el('div', 'hud-top');
    this.coinsEl = el('div', 'pill coins hit', `${icon('coin')}<span class="num">0</span>`);
    this.coinsNum = this.coinsEl.querySelector('.num');
    const lvl = el('div', 'lvl');
    this.lvlBadge = el('div', 'lvl-badge display', '<span>1</span>');
    this.xpFill = el('div', 'xp-fill');
    const xp = el('div', 'xp');
    const track = el('div', 'xp-track'); track.appendChild(this.xpFill); xp.appendChild(track);
    this.xpLabel = el('div', 'xp-label', 'Gardener');
    xp.appendChild(this.xpLabel);
    lvl.append(this.lvlBadge, xp);
    const btns = el('div', 'top-btns');
    this.bookBtn = el('button', 'round-btn', `${icon('book')}<i class="dot"></i>`);
    this.bookBtn.setAttribute('aria-label', 'Flower Book');
    this.bookBtn.onclick = () => { this.api.sound('button'); this.openBook(); };
    this.setBtn = el('button', 'round-btn', icon('gear'));
    this.setBtn.setAttribute('aria-label', 'Settings');
    this.setBtn.onclick = () => { this.api.sound('button'); this.openSettings(); };
    btns.append(this.bookBtn, this.setBtn);
    top.append(this.coinsEl, lvl, btns);
    // sub chips
    const sub = el('div', 'hud-sub');
    this.weatherChip = el('div', 'chip weather', '');
    this.goalChip = el('div', 'chip goal hit', `${icon('target')}<span class="txt"></span><span class="bar"><i></i></span>`);
    this.goalChip.onclick = () => { this.api.sound('button'); this.openBook('goals'); };
    sub.append(this.weatherChip, this.goalChip);
    // orders
    this.ordersEl = el('div', 'orders');
    // bottom bar
    const bottom = el('div', 'bottom');
    this.shopBtn = el('button', 'tool shop', `${icon('basket')}<span class="lbl">Shop</span><i class="dot"></i>`);
    this.shopBtn.setAttribute('aria-label', 'Shop');
    this.shopBtn.onclick = () => { this.api.sound('button'); this.openShop(); };
    this.pouchEl = el('div', 'pouch hit');
    this.pouchHead = el('div', 'pouch-head', '');
    this.pouchList = el('div', 'pouch-list');
    this.pouchEl.append(this.pouchHead, this.pouchList);
    this.canBtn = el('button', 'tool', `${icon('can')}<span class="badge">3</span>`);
    this.canBtn.setAttribute('aria-label', 'Watering can');
    this.canBtn.onclick = () => this.setTool(this.tool === 'water' ? '' : 'water');
    this.digBtn = el('button', 'tool', icon('shovel'));
    this.digBtn.setAttribute('aria-label', 'Shovel');
    this.digBtn.onclick = () => this.setTool(this.tool === 'dig' ? '' : 'dig');
    const rightTools = el('div', ''); rightTools.style.cssText = 'display:flex;gap:.5em;';
    rightTools.append(this.canBtn, this.digBtn);
    bottom.append(this.shopBtn, this.pouchEl, rightTools);
    this.bottomEl = bottom;
    // layers
    this.labels = el('div', 'labels');
    this.toasts = el('div', 'toasts');
    this.modal = el('div', 'modal-layer');
    this.tut = el('div', 'tut-layer');
    this.fly = el('div', 'labels');
    r.append(this.labels, top, sub, this.ordersEl, bottom, this.toasts, this.fly, this.tut, this.modal);
    this.topEl = top;
    this.subEl = sub;
  }

  // HUD insets for camera framing (pixels)
  insets() {
    const H = window.innerHeight, W = window.innerWidth;
    const b = this.bottomEl.getBoundingClientRect();
    const t = this.topEl.getBoundingClientRect();
    const o = this.ordersEl.getBoundingClientRect();
    const portrait = W / H < 0.8;
    let top = t.bottom + 6, right = 8, left = 8;
    if (portrait) top = Math.max(top, (o.height ? o.bottom : t.bottom) + 8);
    else if (o.height) right = Math.max(right, W - o.left + 6);
    const s = this.subEl.getBoundingClientRect();
    if (!portrait && s.height) left = Math.max(left, s.right * 0.35);
    return { top, bottom: H - b.top + 10, left, right };
  }

  // ------------------------------------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.g, s = g.s;
    // coins count up smoothly
    const target = s.coins;
    if (this.coinsShown !== target) {
      const d = target - this.coinsShown;
      this.coinsShown = Math.abs(d) < 1 ? target : this.coinsShown + d * Math.min(1, dt * 10) + Math.sign(d) * 0.5;
      if ((d > 0 && this.coinsShown > target) || (d < 0 && this.coinsShown < target)) this.coinsShown = target;
    }
    const cs = fmt(this.coinsShown);
    if (this.coinsNum.textContent !== cs) this.coinsNum.textContent = cs;
    // level / xp
    const lv = String(s.level);
    if (this.lvlBadge.firstChild.textContent !== lv) this.lvlBadge.firstChild.textContent = lv;
    const need = xpForLevel(s.level);
    this.xpFill.style.width = `${Math.min(100, (s.xp / need) * 100).toFixed(1)}%`;
    const xl = `${fmt(s.xp)} / ${fmt(need)} XP`;
    if (this.xpLabel.textContent !== xl) this.xpLabel.textContent = xl;
    // weather chip
    const w = s.weather;
    const wk = s.tutorial < 99 ? 'clear' : w.kind;
    const wLeft = w.until - s.t;
    const wHtml = `${weatherIcon(wk)}<span>${WEATHER_NAMES[wk]}</span>${s.tutorial >= 99 ? `<span class="t">${wk === 'clear' ? 'next ' : ''}${fmtTime(wLeft)}</span>` : ''}`;
    if (this._wHtml !== wHtml) { this._wHtml = wHtml; this.weatherChip.innerHTML = wHtml; this.weatherChip.classList.toggle('active', wk !== 'clear'); }
    // goal chip
    const goal = g.nextGoal();
    if (goal) {
      const txt = `${goal.text} (${fmt(Math.min(goal.value, goal.goal))}/${fmt(goal.goal)})`;
      const tEl = this.goalChip.querySelector('.txt');
      if (tEl.textContent !== txt) tEl.textContent = txt;
      this.goalChip.querySelector('.bar i').style.width = `${Math.round(goal.k * 100)}%`;
      this.goalChip.style.display = s.tutorial < 99 ? 'none' : '';
    } else this.goalChip.style.display = 'none';
    // can badge
    const canOk = g.has('can');
    this.canBtn.classList.toggle('locked', !canOk);
    const badge = this.canBtn.querySelector('.badge');
    const bc = canOk ? String(s.can.charges) : '';
    if (badge.textContent !== bc) badge.textContent = bc;
    badge.classList.toggle('empty', canOk && s.can.charges === 0);
    badge.style.display = canOk ? '' : 'none';
    this.canBtn.classList.toggle('on', this.tool === 'water');
    this.digBtn.classList.toggle('on', this.tool === 'dig');
    // shop dot when something affordable & new stock
    this.shopBtn.classList.toggle('has-dot', !!this.shopHasNews());
    if (this.dirty.pouch) this.renderPouch();
    if (this.dirty.orders) this.renderOrders();
    this._orderAges();
    this._updatePlotTags();
    this._updateTutorial();
    if (this.panel?.tick) this.panel.tick(dt);
  }

  shopHasNews() {
    const s = this.g.s;
    if (s.tutorial < 99) return false;
    if (s.shop && s.shop.at !== this._shopSeen) return true;
    for (const k in UPGRADES) {
      const u = UPGRADES[k], lv = s.upgrades[k] || 0;
      if (s.level >= u.unlock && lv < u.max && s.coins >= upgradeCost(k, lv) && !this._upSeen?.has(k + lv)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------ pouch
  renderPouch() {
    this.dirty.pouch = false;
    const g = this.g, s = g.s, list = this.pouchList;
    if (this.sel >= s.pouch.length) this.sel = -1;
    const cap = g.pouchCap();
    const total = g.pouchCount();
    const head = `<span>Seed pouch · ${total} seed${total === 1 ? '' : 's'}</span><span class="${s.pouch.length >= cap ? 'full' : ''}">${s.pouch.length}/${cap} kinds</span>`;
    if (this._pouchHead !== head) { this._pouchHead = head; this.pouchHead.innerHTML = head; }
    // only rebuild the chips when the pouch contents change (keeps the scroll position and avoids flicker)
    const sig = s.pouch.map((e) => `${keyOf(e.g)}x${e.n}:${s.book[speciesId(e.g)] ? 1 : 0}`).join('|') + `/${s.tutorial < 99}`;
    if (sig === this._pouchSig) { this._markSel(); return; }
    this._pouchSig = sig;
    this._rebuilds = (this._rebuilds || 0) + 1;
    const scroll = list.scrollLeft;
    list.innerHTML = '';
    if (!s.pouch.length) {
      list.appendChild(el('div', 'pouch-empty', s.tutorial < 99 ? 'Your seeds appear here' : 'No seeds — tap seed bubbles or visit the shop'));
      return;
    }
    const book = s.book;
    s.pouch.forEach((e, i) => {
      const k = keyOf(e.g);
      const known = !!book[speciesId(e.g)];
      const b = el('button', 'seedchip' + (i === this.sel ? ' sel' : '') + (this.seenPouch.has(k) ? '' : ' enter'),
        `${known ? flowerSVG(e.g, { size: 40 }) : seedSVG(e.g, 40)}${e.n > 1 ? `<span class="n">×${e.n}</span>` : ''}${known ? '' : '<span class="new">NEW</span>'}`);
      b.title = known ? flowerName(e.g) : 'Unknown hybrid — plant it to find out!';
      this.seenPouch.add(k);
      b.onclick = () => this.selectSeed(i === this.sel ? -1 : i);
      b.oncontextmenu = (ev) => { ev.preventDefault(); this.seedDetails(i); };
      let pressT = null;
      b.onpointerdown = () => { pressT = setTimeout(() => { pressT = null; this.seedDetails(i); }, 520); };
      b.onpointerup = b.onpointerleave = () => { if (pressT) clearTimeout(pressT); };
      list.appendChild(b);
    });
    list.scrollLeft = scroll;
  }
  _markSel() { [...this.pouchList.children].forEach((c, i) => c.classList?.toggle('sel', i === this.sel)); }

  selectSeed(i) {
    this.sel = i;
    if (i >= 0) this.tool = '';
    this.api.sound(i >= 0 ? 'pick' : 'toggle', { pitch: i >= 0 ? 1 : 0.9 });
    this._markSel();
    this.api.onSelect?.(i);
  }

  setTool(t) {
    if (t === 'water' && !this.g.has('can')) { this.toast(`${icon('lock')} Watering can unlocks at level 3`, 'warn'); return; }
    this.tool = t;
    if (t) { this.sel = -1; this._markSel(); }
    this.api.sound('toggle', { pitch: t ? 1 : 0.9 });
    if (t === 'dig') this.toast(`${icon('shovel')} Tap a plant to dig it up — its seed goes back in your pouch`, '', 2.6);
    if (t === 'water') this.toast(`${icon('can')} Tap a growing plant to water it`, '', 2);
    this.api.onSelect?.(this.sel);
  }

  seedDetails(i) {
    const e = this.g.s.pouch[i];
    if (!e) return;
    const known = !!this.g.s.book[speciesId(e.g)];
    const g = e.g;
    const sell = Math.max(1, Math.round(flowerValue(g) * 0.5));
    this.api.sound('button');
    this.showCard({
      kicker: known ? '' : 'Mystery seed',
      hero: known ? flowerSVG(g, { size: 120 }) : seedSVG(g, 120),
      title: known ? flowerName(g) : 'Unknown hybrid',
      desc: known ? `${stars(rarity(g))}<br>Worth ${fmt(this.g.sellValue(g))} coins · grows in ${fmtTime(this.g.plantDuration(g))}` : 'Plant it to discover what it becomes!',
      buttons: [
        { label: 'Plant', cls: '', act: () => this.selectSeed(i) },
        { label: `Sell 1 · ${fmt(sell)}`, cls: 'plain', act: () => this.api.sellSeed(i, false) },
        ...(e.n > 1 ? [{ label: `Sell all · ${fmt(sell * e.n)}`, cls: 'plain', act: () => this.api.sellSeed(i, true) }] : []),
      ],
      now: true,
    });
  }

  // ------------------------------------------------------------------------------------------ orders
  renderOrders() {
    this.dirty.orders = false;
    const s = this.g.s;
    this.ordersEl.innerHTML = '';
    const list = [];
    if (s.special && !s.special.done) list.push(['special', s.special]);
    s.orders.forEach((o, k) => { if (o) list.push([k, o]); });
    for (const [k, o] of list) {
      const v = o.special ? { id: 'queen', name: 'Queen Bee', color: '#ffc928' } : VISITORS[o.visitor];
      const reqG = { c1: o.req.c1 ?? 3, c2: null, shape: o.req.shape ?? 0, pattern: o.req.pattern ?? 0, mut: o.req.mut ?? 0 };
      const generic = o.req.c1 == null;
      const card = el('div', 'order hit' + (o.special ? ' special' : ''),
        `<div class="who">${visitorSVG(v.id, v.color, 40)}</div>
         <div class="want"><b>${o.special ? '★ ' : ''}${orderText(o.req)}</b><small>${icon('coin')} ${fmt(o.reward)}</small></div>
         <div class="need">${generic && o.req.shape == null ? rainbowQ(o.req) : flowerSVG(reqG, { size: 36 })}${o.qty > 1 ? `<span class="n">${o.got}/${o.qty}</span>` : ''}</div>
         ${o.special ? '' : '<div class="ago"><i></i></div>'}`);
      card.dataset.k = k;
      card.onclick = () => this.orderDetails(k, o, v);
      this.ordersEl.appendChild(card);
    }
    this.api.onLayout?.();
  }
  _orderAges() {
    for (const c of this.ordersEl.children) {
      const k = c.dataset.k;
      if (k === 'special') continue;
      const o = this.g.s.orders[+k];
      const bar = c.querySelector('.ago i');
      if (o && bar) bar.style.width = `${Math.max(0, 100 - ((o.age || 0) / ORDER_TTL) * 100).toFixed(0)}%`;
    }
  }
  orderDetails(k, o, v) {
    this.api.sound('button');
    const canSwap = k !== 'special' && o.got === 0;
    this.showCard({
      kicker: '',
      hero: `<div style="display:grid;place-items:center">${visitorSVG(v.id, v.color, 110)}</div>`,
      title: v.name,
      desc: `“Could you grow me ${o.qty > 1 ? `${o.qty}×` : 'a'} <b>${orderText(o.req)}</b>?”<br>Harvest a matching bloom and it goes straight to ${o.special ? 'her' : 'them'}.${o.special ? '<br><b>Today\'s special request — one per day!</b>' : ''}`,
      reward: `${icon('coin')} ${fmt(o.reward)} &nbsp; ${icon('star')} ${fmt(o.xp)} XP`,
      buttons: [
        { label: 'Got it', cls: '' },
        ...(canSwap ? [{ label: 'New request', cls: 'plain', icon: 'swap', act: () => this.api.swapOrder(k) }] : []),
      ],
      now: true,
    });
  }
  orderDone(k) {
    const c = [...this.ordersEl.children].find((x) => x.dataset.k === String(k));
    if (c) { c.classList.add('done'); setTimeout(() => { this.dirty.orders = true; }, 650); } else this.dirty.orders = true;
  }
  orderScreenPos(k) {
    const c = [...this.ordersEl.children].find((x) => x.dataset.k === String(k));
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // ------------------------------------------------------------------------------------------ world labels
  _updatePlotTags() {
    const g = this.g, view = this.api.view;
    if (!view) return;
    const cost = g.nextPlotCost();
    const show = g.s.tutorial >= 99;
    const seen = new Set();
    // the price is shown once, on the buyable plot closest to the middle; the others get a compact badge
    let lead = -1, leadD = Infinity;
    g.plots.forEach((p, i) => { if (!p.owned && g.canBuyPlot(i)) { const d = Math.hypot(g.pos[i].x, g.pos[i].z * 1.2); if (d < leadD) { leadD = d; lead = i; } } });
    g.plots.forEach((p, i) => {
      if (!show || p.owned || !g.canBuyPlot(i)) return;
      seen.add(i);
      let t = this.plotTags.get(i);
      if (!t) {
        t = el('button', 'plot-tag', '');
        t.onclick = (ev) => { ev.stopPropagation(); this.api.buyPlot(i, t); };
        this.labels.appendChild(t);
        this.plotTags.set(i, t);
      }
      const w = g.pos[i], pp = view.project(w.x, 0.25, w.z);
      t.style.left = `${pp.x}px`; t.style.top = `${pp.y}px`;
      // affordable: a green "+ price" button; otherwise just a small lock (the price shows on tap / hover)
      const afford = g.s.coins >= cost;
      const html = i === lead ? `${afford ? icon('plus', 14) : icon('lock')}${icon('coin')}<span class="num">${fmt(cost)}</span>` : afford ? icon('plus', 16) : icon('lock');
      t.classList.toggle('lead', i === lead);
      if (t._html !== html) { t._html = html; t.innerHTML = html; }
      t.title = `New plot: ${fmt(cost)} coins`;
      t.classList.toggle('afford', afford);
      t.classList.toggle('poor', !afford);
    });
    for (const [i, t] of this.plotTags) if (!seen.has(i)) { t.remove(); this.plotTags.delete(i); }
  }

  floatText(x, y, text, cls = '') {
    const f = el('div', `float-txt ${cls}`, text);
    f.style.left = `${x}px`; f.style.top = `${y}px`;
    this.fly.appendChild(f);
    setTimeout(() => f.remove(), 1150);
  }

  // coins fly from a screen point into the coin pill, then the counter bumps
  flyCoins(x, y, amount) {
    const n = Math.max(1, Math.min(8, Math.round(Math.log2(amount + 1))));
    const tr = this.coinsEl.getBoundingClientRect();
    const tx = tr.left + 22, ty = tr.top + tr.height / 2;
    for (let i = 0; i < n; i++) {
      const c = el('div', 'flyer', icon('coin'));
      this.fly.appendChild(c);
      const sx = x + (Math.random() - 0.5) * 50, sy = y + (Math.random() - 0.5) * 30;
      const mx = sx + (Math.random() - 0.5) * 120, my = sy - 60 - Math.random() * 60;
      const t0 = performance.now() + i * 45, dur = 620 + Math.random() * 180;
      const step = (now) => {
        const k = Math.min(1, Math.max(0, (now - t0) / dur));
        const e = k * k * (3 - 2 * k);
        const px = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * tx;
        const py = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * ty;
        c.style.transform = `translate(${px - 12}px, ${py - 12}px) scale(${1 - 0.3 * e})`;
        c.style.opacity = k <= 0 ? '0' : '1';
        if (k < 1) requestAnimationFrame(step);
        else { c.remove(); this.coinsEl.classList.remove('bump'); void this.coinsEl.offsetWidth; this.coinsEl.classList.add('bump'); if (i === 0) this.api.sound('coin', { pitch: 1 + Math.random() * 0.1 }); }
      };
      requestAnimationFrame(step);
    }
  }

  flySeed(x, y, gHtml) {
    const tr = this.pouchEl.getBoundingClientRect();
    const tx = tr.left + tr.width * 0.5, ty = tr.top + tr.height * 0.55;
    const c = el('div', 'flyer', gHtml);
    c.style.width = c.style.height = '2.4em';
    this.fly.appendChild(c);
    const t0 = performance.now(), dur = 650;
    const mx = (x + tx) / 2 + (Math.random() - 0.5) * 80, my = Math.min(y, ty) - 80;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = k * k * (3 - 2 * k);
      const px = (1 - e) * (1 - e) * x + 2 * (1 - e) * e * mx + e * e * tx;
      const py = (1 - e) * (1 - e) * y + 2 * (1 - e) * e * my + e * e * ty;
      c.style.transform = `translate(${px - 19}px, ${py - 19}px) scale(${1.2 - 0.5 * e}) rotate(${e * 360}deg)`;
      if (k < 1) requestAnimationFrame(step); else c.remove();
    };
    requestAnimationFrame(step);
  }

  flyToOrder(x, y, k, gHtml) {
    const p = this.orderScreenPos(k);
    if (!p) return;
    const c = el('div', 'flyer', gHtml);
    c.style.width = c.style.height = '2.6em';
    this.fly.appendChild(c);
    const t0 = performance.now(), dur = 700;
    const step = (now) => {
      const k2 = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k2, 3);
      c.style.transform = `translate(${x + (p.x - x) * e - 20}px, ${y + (p.y - y) * e - 20 - Math.sin(e * Math.PI) * 60}px) scale(${1.3 - 0.5 * e})`;
      if (k2 < 1) requestAnimationFrame(step); else c.remove();
    };
    requestAnimationFrame(step);
  }

  toast(html, kind = '', life = 2.4) {
    const t = el('div', `toast ${kind}`, html);
    t.style.setProperty('--life', `${life}s`);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => t.remove(), (life + 0.45) * 1000);
  }

  // ------------------------------------------------------------------------------------------ cards
  // { kicker, hero, title, desc, reward, list, buttons: [{label, cls, act}], now, auto }
  showCard(c) {
    if (c.now) { this.cards.unshift(c); if (this.cardOpen) this._closeCard(true); else this._nextCard(); return; }
    // several level-ups in a row become one card (keeps the latest level, merges unlock lists and rewards)
    if (c.merge) {
      const q = this.cards.find((x) => x.merge === c.merge);
      if (q) { Object.assign(q, c.mergeWith ? c.mergeWith(q) : c); return; }
    }
    if (c.tutorial) this.cards.unshift(c); else this.cards.push(c);
    if (!this.cardOpen && !this.panel) this._nextCard();
  }
  // hold celebrations while the tutorial is talking (they queue up and play right after it)
  holdCards(on) { this.hold = on; if (!on) this._nextCard(); }
  _nextCard() {
    if (this.cardOpen || !this.cards.length) return;
    if (this.hold && !this.cards[0].tutorial && !this.cards[0].now) return;
    const c = this.cards.shift();
    const scrim = el('div', 'scrim');
    const box = el('div', 'card-pop',
      `${c.tag ? `<div class="tag">${c.tag}</div>` : ''}${c.kicker ? `<div class="kicker display">${c.kicker}</div>` : ''}
       ${c.hero ? `<div class="hero">${c.hero}</div>` : ''}
       ${c.title ? `<div class="title">${c.title}</div>` : ''}${c.desc ? `<div class="desc">${c.desc}</div>` : ''}
       ${c.list ? `<div class="list">${c.list.map((x) => `<div>${x}</div>`).join('')}</div>` : ''}
       ${c.reward ? `<div class="reward">${c.reward}</div>` : ''}<div class="btns" style="display:flex;gap:.5em;justify-content:center;flex-wrap:wrap"></div>`);
    const btns = box.querySelector('.btns');
    const buttons = c.buttons || [{ label: 'Nice!', cls: '' }];
    for (const b of buttons) {
      const bb = el('button', `btn ${b.cls || ''} ${buttons.length === 1 ? 'big' : ''}`, `${b.icon ? icon(b.icon) : ''}${b.label}`);
      bb.onclick = () => { this.api.sound('button'); this._closeCard(); b.act?.(); };
      btns.appendChild(bb);
    }
    scrim.onclick = () => this._closeCard();
    this.modal.append(scrim, box);
    this.cardOpen = { scrim, box, c };
    c.onShow?.();
    if (c.auto) this.cardOpen.timer = setTimeout(() => this._closeCard(), c.auto * 1000);
  }
  _closeCard(immediate = false) {
    const o = this.cardOpen;
    if (!o) return;
    clearTimeout(o.timer);
    this.cardOpen = null;
    o.box.classList.add('leaving');
    o.scrim.style.transition = 'opacity .2s'; o.scrim.style.opacity = '0';
    setTimeout(() => { o.box.remove(); o.scrim.remove(); }, immediate ? 0 : 220);
    setTimeout(() => this._nextCard(), immediate ? 0 : 260);
  }
  get busy() { return !!(this.cardOpen || this.panel); }

  // ------------------------------------------------------------------------------------------ panels
  _openPanel(title, tabs, render, onTab) {
    this.closePanel(true);
    this.api.onPanel?.(true);
    const scrim = el('div', 'scrim');
    const box = el('div', 'panel');
    box.innerHTML = `<div class="panel-head"><div class="panel-title display">${title}</div><button class="close" aria-label="Close">${icon('close')}</button></div>
      ${tabs ? `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab" data-k="${k}">${l}</button>`).join('')}</div>` : ''}
      <div class="panel-body"></div><div class="panel-foot"></div>`;
    box.querySelector('.close').onclick = () => { this.api.sound('button'); this.closePanel(); };
    scrim.onclick = () => this.closePanel();
    this.modal.append(scrim, box);
    const body = box.querySelector('.panel-body'), foot = box.querySelector('.panel-foot');
    const P = (this.panel = { scrim, box, body, foot, tab: null, render });
    const setTab = (k) => {
      P.tab = k;
      box.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.k === k));
      body.scrollTop = 0;
      onTab?.(k);
      render(k);
    };
    box.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { this.api.sound('toggle'); setTab(t.dataset.k); }; });
    P.setTab = setTab;
    return P;
  }
  closePanel(immediate = false) {
    const p = this.panel;
    if (!p) return;
    this.panel = null;
    p.box.classList.add('leaving');
    p.scrim.style.transition = 'opacity .2s'; p.scrim.style.opacity = '0';
    setTimeout(() => { p.box.remove(); p.scrim.remove(); }, immediate ? 0 : 220);
    this.api.onPanel?.(false);
    if (!immediate) setTimeout(() => this._nextCard(), 250);
  }
  refreshPanel() { if (this.panel) this.panel.render(this.panel.tab); }

  openShop(tab = 'seeds') {
    const g = this.g;
    const tabs = [['seeds', 'Seeds'], ['upgrades', 'Upgrades'], ['decor', 'Decor']];
    const P = this._openPanel('Garden Shop', tabs, (k) => {
      const s = g.s;
      const body = P.body, foot = P.foot;
      body.innerHTML = '';
      if (k === 'seeds') {
        this._shopSeen = s.shop.at;
        const grid = el('div', 'grid');
        s.shop.stock.forEach((it, i) => {
          const known = !!s.book[speciesId(it.g)];
          const c = el('div', 'card' + (it.sold ? ' sold' : ''),
            `<div class="art">${flowerSVG(it.g, { size: 64 })}</div><div class="name">${flowerName(it.g)}</div>${stars(rarity(it.g))}
             <div class="sub">${known ? 'In your book' : '<b style="color:var(--rose-d)">New species!</b>'}</div>`);
          const b = el('button', `btn ${s.coins >= it.price && !it.sold ? 'honey' : 'plain disabled'} small`, it.sold ? 'Sold' : `${icon('coin')} ${fmt(it.price)}`);
          b.onclick = () => { if (this.api.buySeed(i)) this.refreshPanel(); };
          c.appendChild(b);
          grid.appendChild(c);
        });
        body.appendChild(grid);
        P.tick = () => { foot.innerHTML = `${icon('clock', 16)} New seeds in ${fmtTime(s.shop.at - s.t)}`; };
        P.tick();
      } else if (k === 'upgrades') {
        P.tick = null;
        foot.textContent = 'Upgrades last forever.';
        const rows = el('div', 'rows');
        for (const key in UPGRADES) {
          const u = UPGRADES[key], lv = s.upgrades[key] || 0, locked = s.level < u.unlock, maxed = lv >= u.max;
          const cost = upgradeCost(key, lv);
          const r = el('div', 'row' + (locked ? ' locked' : ''),
            `<div class="art">${icon('up_' + key, 34)}</div><div class="info"><b>${u.name} ${maxed ? '· MAX' : `· ${lv}/${u.max}`}</b><small>${locked ? `Unlocks at gardener level ${u.unlock}` : u.desc}</small>
             <div class="pips">${Array.from({ length: u.max }, (_, j) => `<i class="${j < lv ? 'on' : ''}"></i>`).join('')}</div></div>`);
          if (!locked && !maxed) {
            const b = el('button', `btn ${s.coins >= cost ? '' : 'plain disabled'} small`, `${icon('coin')} ${fmt(cost)}`);
            b.onclick = () => { if (this.api.buyUpgrade(key)) this.refreshPanel(); };
            r.appendChild(b);
          }
          rows.appendChild(r);
          this._upSeen = this._upSeen || new Set(); this._upSeen.add(key + lv);
        }
        body.appendChild(rows);
      } else {
        P.tick = null;
        foot.textContent = 'Decorations add a permanent bonus and appear in your garden.';
        const grid = el('div', 'grid');
        for (const d of DECOR) {
          const owned = !!s.decor[d.id];
          const c = el('div', 'card' + (owned ? ' sold' : ''), `<div class="art">${decorIcon(d.id, 60)}</div><div class="name">${d.name}</div><div class="sub">${d.text}</div>`);
          const b = el('button', `btn ${owned ? 'plain disabled' : s.coins >= d.cost ? 'honey' : 'plain disabled'} small`, owned ? `${icon('check')} Placed` : `${icon('coin')} ${fmt(d.cost)}`);
          b.onclick = () => { if (this.api.buyDecor(d.id)) this.refreshPanel(); };
          c.appendChild(b);
          grid.appendChild(c);
        }
        body.appendChild(grid);
      }
    });
    P.setTab(g.has('upgrades') ? tab : 'seeds');
    if (!g.has('upgrades')) P.box.querySelectorAll('.tab').forEach((t) => { if (t.dataset.k !== 'seeds') { t.disabled = true; t.innerHTML = `${icon('lock', 14)} ${t.textContent}`; t.style.opacity = 0.55; } });
  }

  openBook(tab = 'flowers') {
    const g = this.g;
    this.bookBtn.classList.remove('has-dot');
    const P = this._openPanel('Flower Book', [['flowers', 'Flowers'], ['goals', 'Goals']], (k) => {
      const s = g.s, body = P.body, foot = P.foot;
      body.innerHTML = '';
      P.tick = null;
      if (k === 'flowers') {
        const n = g.discoveredCount();
        const top = el('div', 'book-top', `<span>${n}/${SPECIES_COUNT}</span><div class="prog"><i style="width:${(n / SPECIES_COUNT) * 100}%"></i></div>${icon('book', 20)}`);
        body.appendChild(top);
        const grid = el('div', 'book-grid');
        grid.appendChild(el('div', ''));
        SHAPES.forEach((sh) => grid.appendChild(el('div', 'hdr', sh.name)));
        const note = el('div', 'book-note', 'Tap a flower to see how to grow it.');
        COLORS.forEach((c, ci) => {
          const dot = el('div', 'clr'); dot.style.background = c.hex; dot.title = c.name;
          grid.appendChild(dot);
          SHAPES.forEach((sh, si) => {
            const id = ci * 8 + si, e = s.book[id];
            const cell = el('button', 'book-cell' + (e ? '' : ' unknown') + (s.rows[ci] ? ' row-done' : ''),
              e ? flowerSVG({ c1: ci, c2: null, shape: si, pattern: 0, mut: 0 }, { size: 34 }) + (e.mut ? '<i class="m"></i>' : '') : `${flowerSVG({ c1: ci, shape: si, pattern: 0, mut: 0 }, { size: 34, silhouette: true })}<span class="q">?</span>`);
            cell.onclick = () => {
              this.api.sound('toggle');
              if (e) {
                const pats = PATTERNS.map((p, pi) => (e.pat & (1 << pi) ? p.name : null)).filter(Boolean).join(', ');
                const muts = MUTATIONS.map((m, mi) => (e.mut & (1 << mi) ? m.name : null)).filter(Boolean).join(', ');
                note.innerHTML = `<b>${speciesName(id)}</b> · grown ${e.n}× · patterns: ${pats || 'Plain'}${muts ? ` · mutations: ${muts}` : ''}`;
              } else {
                note.innerHTML = `<b>${speciesName(id)}</b> — colour: ${colorRecipe(ci)} · shape: ${shapeRecipe(si)}`;
              }
            };
            grid.appendChild(cell);
          });
        });
        body.appendChild(grid);
        body.appendChild(note);
        foot.textContent = 'Bees mix the colours and shapes of neighbouring blooms. Complete a row or column for a big reward!';
      } else {
        const rows = el('div', 'rows');
        const list = ACHIEVEMENTS.map((a) => ({ a, v: g.statValue(a.stat), done: !!s.ach[a.id] }));
        list.sort((x, y) => (x.done - y.done) || (y.v / y.a.goal - x.v / x.a.goal));
        for (const { a, v, done } of list) {
          rows.appendChild(el('div', 'row' + (done ? ' done' : ''),
            `<div class="art">${icon(done ? 'trophy' : 'target', 30)}</div><div class="info"><b>${a.name}</b><small>${a.text}</small>
             ${done ? '' : `<div class="prog"><i style="width:${Math.min(100, (v / a.goal) * 100)}%"></i></div>`}</div>
             <div style="font-weight:700;font-size:.85em;display:flex;align-items:center;gap:.2em;white-space:nowrap">${done ? icon('check', 20) : `${icon('coin', 18)}${fmt(a.reward)}`}</div>`));
        }
        body.appendChild(rows);
        const done = list.filter((x) => x.done).length;
        foot.textContent = `${done}/${ACHIEVEMENTS.length} goals complete`;
      }
    });
    P.setTab(tab);
  }

  openSettings() {
    const P = this._openPanel('Settings', null, () => {
      const st = this.api.getSettings(), body = P.body;
      body.innerHTML = '';
      const row = (label, ico, on, fn) => {
        const r = el('div', 'set-row', `<span style="display:flex;align-items:center;gap:.5em">${icon(ico, 26)}${label}</span>`);
        const sw = el('button', 'switch' + (on ? ' on' : ''));
        sw.setAttribute('aria-label', label);
        sw.onclick = () => { fn(!sw.classList.contains('on')); sw.classList.toggle('on'); this.api.sound('toggle'); };
        r.appendChild(sw);
        body.appendChild(r);
      };
      row('Sound effects', 'sound', st.sfx, (v) => this.api.setSetting('sfx', v));
      row('Music', 'music', st.music, (v) => this.api.setSetting('music', v));
      const q = el('div', 'set-row', `<span style="display:flex;align-items:center;gap:.5em">${icon('star', 26)}Graphics</span>`);
      const seg = el('div', 'seg');
      for (const [k, l] of [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Mid'], ['high', 'High']]) {
        const b = el('button', st.quality === k ? 'on' : '', l);
        b.onclick = () => { this.api.setSetting('quality', k); this.api.sound('toggle'); seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
        seg.appendChild(b);
      }
      q.appendChild(seg);
      body.appendChild(q);
      const how = el('div', 'set-row', `<span style="display:flex;align-items:center;gap:.5em">${icon('info', 26)}How to play</span>`);
      const hb = el('button', 'btn small sky', 'Show');
      hb.onclick = () => { this.closePanel(); this.howToPlay(); };
      how.appendChild(hb);
      body.appendChild(how);
      const stats = this.g.s.stats;
      body.appendChild(el('div', 'set-row', `<span style="color:var(--ink2);font-size:.85em">Blooms harvested ${fmt(stats.harvests)} · seeds ${fmt(stats.seeds)} · orders ${fmt(stats.orders)} · played ${fmtTime(stats.play)}</span>`));
      const reset = el('div', 'set-row', '<span style="color:var(--ink2)">Start a new garden</span>');
      const rb = el('button', 'btn small rose', 'Reset');
      rb.onclick = () => {
        if (rb.dataset.sure) { this.api.resetSave(); return; }
        rb.dataset.sure = '1'; rb.textContent = 'Tap again to confirm';
        setTimeout(() => { if (rb.isConnected) { rb.dataset.sure = ''; rb.textContent = 'Reset'; } }, 3000);
      };
      reset.appendChild(rb);
      body.appendChild(reset);
      P.foot.innerHTML = `${GAME_TITLE} · all art, sound and music are made in code`;
    });
    P.render();
  }

  howToPlay() {
    this.showCard({
      kicker: 'How to play',
      hero: flowerSVG({ c1: 6, c2: 3, shape: 3, pattern: 1, mut: 0 }, { size: 120 }),
      list: [
        `${icon('seed')} Pick a seed below, then tap soil to plant it`,
        `${icon('bee')} Bees cross neighbouring blooms into new seeds`,
        `${icon('book')} Mix colours: red + blue = purple, and more!`,
        `${icon('coin')} Tap blooms to harvest coins — swipe to harvest many`,
        `${icon('rainbow')} Weather can mutate blooms: golden, rainbow…`,
        `${icon('basket')} Buy plots, upgrades and decorations`,
      ],
      buttons: [{ label: 'Let\'s grow!' }],
      now: true,
    });
  }

  // ------------------------------------------------------------------------------------------ tutorial pointer
  // target: { el } (DOM element) or { world: {x,y,z} }; text shown in a bubble
  setTutorial(step) { this.tutStep = step; this._tutKey = null; }
  _updateTutorial() {
    const st = this.tutStep;
    if (!st) { if (this.tut.childElementCount) this.tut.innerHTML = ''; return; }
    if (this._tutKey !== st.key) {
      this._tutKey = st.key;
      this.tut.innerHTML = '';
      this.tutHand = el('div', 'tut-hand', icon('hand', 64));
      this.tutBubble = el('div', 'tut-bubble', `<div class="queen">${visitorSVG('queen', '#ffc928', 58)}</div>${st.text}`);
      if (st.target) this.tut.appendChild(this.tutHand);
      this.tut.appendChild(this.tutBubble);
    }
    let x = null, y = null;
    if (st.target?.el) {
      const r = st.target.el.getBoundingClientRect?.();
      if (r && r.width) { x = r.left + r.width * 0.55; y = r.top + r.height * 0.55; }
    } else if (st.target?.world && this.api.view) {
      const p = this.api.view.project(st.target.world.x, st.target.world.y, st.target.world.z);
      x = p.x; y = p.y;
    }
    if (x != null) { this.tutHand.style.display = ''; this.tutHand.style.transform = `translate(${x - 12}px, ${y - 6}px)`; }
    else if (this.tutHand) this.tutHand.style.display = 'none';
    // bubble sits above the bottom bar (or under the HUD when pointing low)
    const b = this.bottomEl.getBoundingClientRect();
    const low = y != null && y > window.innerHeight * 0.55;
    if (low) { this.tutBubble.style.top = `${this.topEl.getBoundingClientRect().bottom + (window.innerWidth / window.innerHeight < 0.8 ? 80 : 14)}px`; this.tutBubble.style.bottom = ''; }
    else { this.tutBubble.style.bottom = `${window.innerHeight - b.top + 12}px`; this.tutBubble.style.top = ''; }
  }
}

function keyOf(g) { return `${g.c1}.${g.c2}.${g.shape}.${g.pattern}`; }

function rainbowQ(req) {
  if (req.mut) return `<div style="width:2.2em;height:2.2em;display:grid;place-items:center">${icon({ 1: 'rain', 2: 'night', 3: 'golden', 4: 'rainbow', 5: 'star' }[req.mut] || 'star', 30)}</div>`;
  if (req.pattern) return flowerSVG({ c1: 3, c2: 7, shape: 0, pattern: req.pattern, mut: 0 }, { size: 36 });
  return icon('seed', 30);
}

export { fmtTime };
