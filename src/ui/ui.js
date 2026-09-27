// DOM UI: HUD, orders, seed pouch, tools, world labels, toasts, panels (shop / book / settings), celebration
// cards and the tutorial pointer. Reads game state from the Garden; every change goes through `api`.
import { icon, flowerSVG, seedSVG, visitorSVG, decorIcon, weatherIcon, patternBadge } from './icons.js';
import { COLORS, SHAPES, PATTERNS, MUTATIONS, flowerName, speciesName, speciesOf, colorRecipe, shapeRecipe, rarity, flowerValue, growTime, SPECIES_COUNT, speciesId, secondColor } from '../game/genetics.js';
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
    this._warmIcons();
    document.fonts?.ready.then(() => this._fitPouchHead());
  }

  // Paint the Flower Book icons a few at a time while the player is busy elsewhere, so opening the book is instant.
  _warmIcons() {
    const jobs = [];
    SHAPES.forEach((sh, si) => jobs.push(() => flowerSVG({ c1: 0, shape: si, pattern: 0, mut: 0 }, { size: 34, silhouette: true })));
    const known = [], rest = [];
    COLORS.forEach((c, ci) => SHAPES.forEach((sh, si) => (this.g.s.book[ci * 8 + si] ? known : rest).push({ c1: ci, c2: null, shape: si, pattern: 0, mut: 0 })));
    for (const g of [...known, ...rest]) jobs.push(() => flowerSVG(g, { size: 34 }));
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 6 }), 120));
    const step = (dl) => {
      const t0 = performance.now();
      while (jobs.length && (dl.timeRemaining() > 4 || performance.now() - t0 < 2)) { jobs.shift()(); if (performance.now() - t0 > 6) break; }
      if (jobs.length) idle(step, { timeout: 1500 });
    };
    setTimeout(() => idle(step, { timeout: 1500 }), 2500);
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
    this.goalChip = el('div', 'chip goal hit', `${icon('target')}<span class="txt"></span><span class="rw"></span><span class="bar"><i></i></span>`);
    this.goalChip.onclick = () => { this.api.sound('button'); if (this.g.currentQuest()) this.api.questHint?.(); else this.openBook('goals'); };
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
    // a mouse wheel scrolls the pouch sideways (trackpads and touch already do)
    this.pouchList.addEventListener('wheel', (e) => {
      const l = this.pouchList;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || l.scrollWidth <= l.clientWidth) return;
      l.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 20 : 1);
      e.preventDefault();
    }, { passive: false });
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
    // portrait: toasts sit just under the orders row and the chips just above the bottom bar, whose sizes vary
    this.root.style.setProperty('--orders-b', `${Math.round(o.height ? o.bottom : t.bottom)}px`);
    this.root.style.setProperty('--bar-h', `${Math.round(H - b.top)}px`);
    this._fitPouchHead();
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
    const xw = `${Math.min(100, (s.xp / need) * 100).toFixed(1)}%`;
    if (this._xw !== xw) { this._xw = xw; this.xpFill.style.width = xw; }
    const xl = `${fmt(s.xp)} / ${fmt(need)} XP`;
    if (this.xpLabel.textContent !== xl) this.xpLabel.textContent = xl;
    // weather chip
    const w = s.weather;
    const wk = s.tutorial < 99 ? 'clear' : w.kind;
    const wLeft = w.until - s.t;
    const wHtml = `${weatherIcon(wk)}<span>${WEATHER_NAMES[wk]}</span>${s.tutorial >= 99 ? `<span class="t">${wk === 'clear' ? 'next ' : ''}${fmtTime(wLeft)}</span>` : ''}`;
    if (this._wHtml !== wHtml) { this._wHtml = wHtml; this.weatherChip.innerHTML = wHtml; this.weatherChip.classList.toggle('active', wk !== 'clear'); }
    // goal chip: the current starter quest (with its reward), then the achievement ladder
    const quest = g.currentQuest();
    const goal = quest || g.nextGoal();
    if (goal) {
      const txt = quest ? (quest.goal > 1 ? `${quest.text} (${quest.value}/${quest.goal})` : quest.text) : `${goal.text} (${fmt(Math.min(goal.value, goal.goal))}/${fmt(goal.goal)})`;
      const ic = quest ? quest.icon : GOAL_ICON[goal.stat] || 'target';
      const rw = quest ? (quest.reward.coins ? `${icon('coin')}${fmt(quest.reward.coins)}` : `${icon('seed')}×${quest.reward.seeds.reduce((n, x) => n + x[2], 0)}`) : '';
      if (this._goalRw !== rw) { this._goalRw = rw; this.goalChip.querySelector('.rw').innerHTML = rw; this.goalChip.classList.toggle('quest', !!quest); }
      if (this._goalIco !== ic) { this._goalIco = ic; this.goalChip.querySelector('.ico')?.remove(); this.goalChip.insertAdjacentHTML('afterbegin', icon(ic)); }
      if (this._goalTxt !== txt) { this._goalTxt = txt; this.goalChip.querySelector('.txt').textContent = txt; }
      const gw = `${Math.round(goal.k * 100)}%`;
      if (this._goalW !== gw) { this._goalW = gw; this.goalChip.querySelector('.bar i').style.width = gw; }
      const gd = s.tutorial < 99 ? 'none' : '';
      if (this._goalD !== gd) { this._goalD = gd; this.goalChip.style.display = gd; }
    } else if (this._goalD !== 'none') { this._goalD = 'none'; this.goalChip.style.display = 'none'; }
    // can badge
    const canOk = g.has('can');
    this.canBtn.classList.toggle('locked', !canOk);
    const badge = this.canBtn.querySelector('.badge');
    const bc = canOk ? String(s.can.charges) : '';
    if (badge.textContent !== bc) badge.textContent = bc;
    badge.classList.toggle('empty', canOk && s.can.charges === 0);
    const bd = canOk ? '' : 'none';
    if (badge.style.display !== bd) badge.style.display = bd;
    this.canBtn.classList.toggle('on', this.tool === 'water');
    this.digBtn.classList.toggle('on', this.tool === 'dig');
    // shop dot when something affordable & new stock
    this.shopBtn.classList.toggle('has-dot', !!this.shopHasNews());
    if (this.dirty.pouch) this.renderPouch();
    if (this.dirty.orders) this.renderOrders();
    this._orderAges();
    this._updatePlotTags();
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
    const full = s.pouch.length >= cap;
    const seeds = `${fmt(total)} seed${total === 1 ? '' : 's'}`;
    // a full pouch turns warm and says what to do (short wording on narrow phones)
    const head = full
      ? `<span>${icon('up_pouch')}<span class="t long">Pouch full — plant or sell seeds</span><span class="t short">Full — plant or sell</span></span><span>${s.pouch.length}/${cap}</span>`
      : `<span><span class="t long">Seed pouch · ${seeds}</span><span class="t short">${seeds}</span></span><span>${s.pouch.length}/${cap} kinds</span>`;
    if (this._pouchHead !== head) { this._pouchHead = head; this.pouchHead.innerHTML = head; this.pouchEl.classList.toggle('full', full); this._fitPouchHead(); }
    // only rebuild the chips when the pouch contents change (keeps the scroll position and avoids flicker)
    const sig = s.pouch.map((e) => `${keyOf(e.g)}x${e.n}:${s.book[speciesId(e.g)] ? 1 : 0}`).join('|') + `/${s.tutorial < 99}`;
    if (sig === this._pouchSig) { this._markSel(); return; }
    this._pouchSig = sig;
    this._rebuilds = (this._rebuilds || 0) + 1;
    const scroll = list.scrollLeft;
    this._chipTip(null);
    list.innerHTML = '';
    if (!s.pouch.length) {
      list.appendChild(el('div', 'pouch-empty', s.tutorial < 99 ? 'Your seeds appear here' : 'No seeds — tap seed bubbles or visit the shop'));
      return;
    }
    const book = s.book;
    s.pouch.forEach((e, i) => {
      const k = keyOf(e.g);
      const known = !!book[speciesId(e.g)];
      // known variants get a pattern badge (top-right); mystery seeds show shape and pattern on the seed itself
      const b = el('button', 'seedchip' + (i === this.sel ? ' sel' : '') + (this.seenPouch.has(k) ? '' : ' enter'),
        `${known ? flowerSVG(e.g, { size: 40 }) + patternBadge(e.g) : seedSVG(e.g, 40)}${e.n > 1 ? `<span class="n">×${stackCount(e.n)}</span>` : ''}${known ? '' : '<span class="new">NEW</span>'}`);
      // the full variant name: the game's tooltip on hover (mouse), the details card on press-and-hold (touch)
      const pd = e.g.pattern ? ` · ${patternDesc(e.g)}` : '';
      const tip = known ? `${flowerSVG(e.g, { size: 20 })}<span><b>${flowerName(e.g)}</b>${pd}</span>` : `${seedSVG(e.g, 20)}<span><b>Mystery seed</b>${pd} — plant it to find out!</span>`;
      b.setAttribute('aria-label', `${known ? variantName(e.g) : `Mystery seed${pd}`}${e.n > 1 ? `, ${e.n} seeds` : ''}`);
      this.seenPouch.add(k);
      // tap selects; press-and-hold (touch) or right-click (mouse) opens the details card with Sell. A scroll of the
      // pouch cancels the press, and the click / contextmenu that follow a long press don't act a second time.
      let pressT = null, held = false;
      const cancel = () => { if (pressT) { clearTimeout(pressT); pressT = null; } };
      const details = () => { held = true; this._chipTip(null); swallowNextClick(); this.seedDetails(i); };
      b.onclick = () => { if (held) { held = false; return; } this.selectSeed(i === this.sel ? -1 : i); };
      b.oncontextmenu = (ev) => { ev.preventDefault(); if (held) return; cancel(); details(); };
      b.onpointerdown = (ev) => { held = false; cancel(); if (ev.button === 0) pressT = setTimeout(() => { pressT = null; details(); }, 520); };
      b.onpointerup = b.onpointercancel = cancel;
      b.onpointerenter = (ev) => { if (ev.pointerType === 'mouse') this._chipTip(b, tip); };
      b.onpointerleave = () => { cancel(); this._chipTip(null); };
      list.appendChild(b);
    });
    list.scrollLeft = scroll;
  }
  _markSel() { [...this.pouchList.children].forEach((c, i) => c.classList?.toggle('sel', i === this.sel)); }
  // the short header wording, only where the long one doesn't fit (checked on change and on resize)
  _fitPouchHead() {
    const h = this.pouchHead, t = h.querySelector('.t.long');
    h.classList.remove('tight');
    if (t && t.scrollWidth > t.clientWidth + 1) h.classList.add('tight');
  }
  // hover tooltip for a pouch chip, just above it (null hides it)
  _chipTip(b, html) {
    if (!b) { if (this._tipChip) { this._tipChip = null; this.hoverInfo(0, 0, null); } return; }
    this._tipChip = b;
    const r = b.getBoundingClientRect();
    this.hoverInfo(r.left + r.width / 2, r.top + 14, html);
  }

  selectSeed(i) {
    this.sel = i;
    if (i >= 0) this.tool = '';
    this.api.sound(i >= 0 ? 'pick' : 'toggle', { pitch: i >= 0 ? 1 : 0.9, volume: i >= 0 ? 0.6 : 1 });
    this._markSel();
    // a chip picked with a number key (or half scrolled out) slides fully into view
    const c = i >= 0 && this.pouchList.children[i], l = this.pouchList;
    if (c) {
      const lr = l.getBoundingClientRect(), cr = c.getBoundingClientRect(), pad = 10;
      if (cr.left < lr.left + pad) l.scrollLeft -= lr.left + pad - cr.left;
      else if (cr.right > lr.right - pad) l.scrollLeft += cr.right - (lr.right - pad);
    }
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
    if (!e || this.g.s.tutorial < 99) return;          // no selling the tutorial's seeds by accident
    const known = !!this.g.s.book[speciesId(e.g)];
    const g = e.g;
    const sell = Math.max(1, Math.round(flowerValue(g) * 0.5));
    const pd = patternDesc(g);
    const variant = g.pattern ? `<span class="variant">${patternBadge(g, 'pat-i')}${pd[0].toUpperCase() + pd.slice(1)}</span>` : '';
    this.api.sound('button');
    this.showCard({
      kicker: known ? '' : 'Mystery seed',
      hero: known ? flowerSVG(g, { size: 120 }) : seedSVG(g, 120),
      title: known ? flowerName(g) : 'Unknown hybrid',
      desc: known ? `${variant}${stars(rarity(g))}Worth ${fmt(this.g.sellValue(g))} coins · grows in ${fmtTime(this.g.plantDuration(g))}` : `${variant}Plant it to discover what it becomes!`,
      buttons: [
        { label: 'Plant', cls: '', act: () => this.selectSeed(i) },
        { label: `Sell 1 · ${icon('coin')}${fmt(sell)}`, cls: 'plain', act: () => this._sellSeed(i, false) },
        ...(e.n > 1 ? [{ label: `Sell all · ${icon('coin')}${fmt(sell * e.n)}`, cls: 'plain', act: () => this._sellSeed(i, true) }] : []),
      ],
      now: true,
    });
  }

  // selling removes entries from the pouch, so keep the selection on the same seed (or clear it if it's gone)
  _sellSeed(i, all) {
    const s = this.g.s, keep = s.pouch[this.sel];
    this.api.sellSeed(i, all);
    const k = keep ? s.pouch.indexOf(keep) : -1;
    if (k !== this.sel) { this.sel = k; this._markSel(); this.api.onSelect?.(k); }
  }

  // no room for another kind of seed: say how to make room, and point at the pouch
  pouchFull() {
    // one toast per swipe across several bubbles, but the pouch nudges every time
    const now = performance.now();
    if (!(now - this._fullAt < 2500)) {
      this._fullAt = now;
      const how = matchMedia('(pointer: coarse)').matches ? 'press and hold' : 'right-click';
      this.toast(`${icon('up_pouch')}<span>Pouch full! Plant seeds, or ${how} a seed to sell it</span>`, 'warn', 3.4);
    }
    this.pouchEl.classList.remove('nudge'); void this.pouchEl.offsetWidth; this.pouchEl.classList.add('nudge');
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
      // a patterned request needs a second colour, or the pattern is painted in the petal colour and can't be seen
      const reqG = { c1: o.req.c1 ?? 3, c2: o.req.pattern ? secondColor(o.req.c1 ?? 3) : null, shape: o.req.shape ?? 0, pattern: o.req.pattern ?? 0, mut: o.req.mut ?? 0 };
      const generic = o.req.c1 == null;
      const card = el('div', 'order hit' + (o.special ? ' special' : ''),
        `<div class="who">${visitorSVG(v.id, v.color, 40)}</div>
         <div class="want"><b>${o.special ? '★ ' : ''}${orderText(o.req)}</b><small>${icon('coin')} ${fmt(o.reward)}</small></div>
         <div class="need">${generic && o.req.shape == null ? rainbowQ(o.req) : flowerSVG(reqG, { size: 36 })}${o.req.pattern ? patternBadge(generic ? { c1: 3, c2: 7, pattern: o.req.pattern } : reqG) : ''}${o.qty > 1 ? `<span class="n">${o.got}/${o.qty}</span>` : ''}</div>
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
      // affordable: a green "+ price" button; otherwise just a small lock (the price shows on tap / hover)
      const afford = g.s.coins >= cost;
      const html = i === lead ? `${afford ? icon('plus', 14) : icon('lock')}${icon('coin')}<span class="num">${fmt(cost)}</span>` : afford ? icon('plus', 16) : icon('lock');
      t.classList.toggle('lead', i === lead);
      if (t._html !== html) { t._html = html; t.innerHTML = html; t._w = 0; }
      t.title = `New plot: ${fmt(cost)} coins`;
      t.classList.toggle('afford', afford);
      t.classList.toggle('poor', !afford);
      // a plot at the screen edge keeps its price tag fully on screen (width measured once per content change)
      const hw = (t._w ||= t.offsetWidth) / 2 + 6, W = innerWidth;
      const x = pp.x >= 0 && pp.x <= W ? Math.max(hw, Math.min(W - hw, pp.x)) : pp.x;
      const tl = `translate(${x.toFixed(1)}px, ${pp.y.toFixed(1)}px) translate(-50%, -50%)`;
      if (t._tl !== tl) { t._tl = tl; t.style.transform = tl; }
    });
    for (const [i, t] of this.plotTags) if (!seen.has(i)) { t.remove(); this.plotTags.delete(i); }
  }

  hoverInfo(x, y, html) {
    // in the fly-up layer, above the HUD chips and orders (the world-label layer sits under them)
    if (!this.hoverEl) { this.hoverEl = el('div', 'hover-tip'); this.fly.appendChild(this.hoverEl); }
    if (!html) { this.hoverEl.style.display = 'none'; return; }
    if (this._hoverHtml !== html) { this._hoverHtml = html; this.hoverEl.innerHTML = html; this._hoverWH = null; }
    this.hoverEl.style.display = '';
    // stay on screen: slide in from the side edges, drop below the pointer near the top (size measured per text)
    const [w, h] = (this._hoverWH ||= [this.hoverEl.offsetWidth, this.hoverEl.offsetHeight]);
    const below = y - h - 28 < 4;
    const cx = Math.max(w / 2 + 6, Math.min(innerWidth - w / 2 - 6, x));
    this.hoverEl.style.transform = `translate(${Math.round(cx)}px, ${Math.round(y)}px) translate(-50%, ${below ? '26px' : 'calc(-100% - 22px)'})`;
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

  // a finished starter quest: the chip celebrates and the reward flies out of it
  questDone(p) {
    const r = this.goalChip.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 90), y = r.top + r.height / 2;
    this.goalChip.classList.remove('done'); void this.goalChip.offsetWidth; this.goalChip.classList.add('done');
    const bits = [];
    if (p.got.coins) { bits.push(`${icon('coin')} +${fmt(p.got.coins)}`); setTimeout(() => this.flyCoins(x, y, p.got.coins), 150); }
    p.got.seeds.forEach((sd, k) => { bits.push(`${flowerSVG(sd.g, { size: 26 })} ×${sd.n}`); setTimeout(() => this.flySeed(x, y, flowerSVG(sd.g, { size: 36 })), 200 + k * 150); });
    this.toast(`${icon('check')} <b>Quest complete!</b> ${bits.join(' ')}`, 'good', 2.8);
    this.api.sound('quest');
    this.dirty.pouch = true;
  }
  // a seed icon following the pointer while a seed is dragged out of the pouch
  dragGhost(html) { const d = el('div', 'drag-ghost', html); this.fly.appendChild(d); return d; }

  toast(html, kind = '', life = 2.4) {
    // landscape: keep the column clear of the chips on the left and the orders on the right (it stays centred)
    const W = innerWidth, s = this.subEl.getBoundingClientRect(), o = this.ordersEl.getBoundingClientRect();
    const side = W / innerHeight < 0.8 ? 0 : Math.max(s.width ? s.right : 0, o.width ? W - o.left : 0);
    this.toasts.style.setProperty('--side', side ? `${Math.round(side + 8)}px` : '');
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
       ${c.list ? `<div class="list">${c.list.map(listItem).join('')}</div>` : ''}
       ${c.reward ? `<div class="reward">${c.reward}</div>` : ''}<div class="btns"></div>`);
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
          const desc = key === 'pouch' ? (maxed ? `Holds ${g.pouchCap()} seed kinds` : `${u.desc} · holds ${g.pouchCap()} now`) : u.desc;
          const r = el('div', 'row' + (locked ? ' locked' : ''),
            `<div class="art">${icon('up_' + key, 34)}</div><div class="info"><b>${u.name} ${maxed ? '· MAX' : `· ${lv}/${u.max}`}</b><small>${locked ? `Unlocks at gardener level ${u.unlock}` : nbsp(desc)}</small>
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
          const c = el('div', 'card' + (owned ? ' sold' : ''), `<div class="art">${decorIcon(d.id, 60)}</div><div class="name">${d.name}</div><div class="sub">${nbsp(d.text)}</div>`);
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
        SHAPES.forEach((sh) => grid.appendChild(el('div', 'hdr', sh.name.replace(/^(Blos|Pin)/, '$1&shy;'))));
        // the note lives in the footer, which stays in view however far the grid is scrolled
        const note = el('div', 'book-note', 'Tap a flower to see how to grow it. Complete a row or column for a big reward!');
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
                note.innerHTML = `<span><b>${speciesName(id)}</b> · grown ${e.n}× · patterns: ${pats || 'Plain'}${muts ? ` · mutations: ${muts}` : ''}</span>`;
              } else {
                note.innerHTML = `<span><b>${speciesName(id)}</b> — colour: ${colorRecipe(ci)} · shape: ${shapeRecipe(si)}</span>`;
              }
            };
            grid.appendChild(cell);
          });
        });
        body.appendChild(grid);
        foot.innerHTML = '';
        foot.appendChild(note);
      } else {
        const rows = el('div', 'rows');
        const list = ACHIEVEMENTS.map((a) => ({ a, v: g.statValue(a.stat), done: !!s.ach[a.id] }));
        list.sort((x, y) => (x.done - y.done) || (y.v / y.a.goal - x.v / x.a.goal));
        for (const { a, v, done } of list) {
          rows.appendChild(el('div', 'row' + (done ? ' done' : ''),
            `<div class="art">${icon(done ? 'trophy' : GOAL_ICON[a.stat] || 'target', 30)}</div><div class="info"><b>${a.name}</b><small>${a.text}</small>
             ${done ? '' : `<div class="prog"><i style="width:${Math.min(100, (v / a.goal) * 100)}%"></i></div>`}</div>
             <div style="font-weight:700;font-size:max(11px,.85em);display:flex;align-items:center;gap:.2em;white-space:nowrap">${done ? icon('check', 20) : `${icon('coin', 18)}${fmt(a.reward)}`}</div>`));
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
      body.appendChild(el('div', 'set-row', `<span style="color:var(--ink2);font-size:max(11px,.85em)">Blooms harvested ${fmt(stats.harvests)} · seeds ${fmt(stats.seeds)} · orders ${fmt(stats.orders)} · played ${fmtTime(stats.play)}</span>`));
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
        `${icon('seed')} Drag a seed from your pouch onto the soil`,
        `${icon('star')} Tap growing flowers to make them grow faster`,
        `${icon('bee')} Drag pollen from one bloom onto another to cross them — bees cross neighbours too`,
        `${icon('book')} Mix colours: red + blue = purple, and more!`,
        `${icon('coin')} Tap blooms to harvest — quick taps make a combo`,
        `${icon('rainbow')} Weather can mutate blooms: golden, rainbow…`,
      ],
      buttons: [{ label: 'Let\'s grow!' }],
      now: true,
    });
  }

  // ------------------------------------------------------------------------------------------ tutorial & hints
  // Called every frame with the current step (or null). spec: { key, text, hand, holes, dim, skip, soft }
  //   hand: { tap: {x, y} } | { drag: {x0, y0, x1, y1}, ghost: html } | null      (screen pixels)
  //   holes: [{ x, y, r }] spotlight holes in the dimmed screen (the rest of the screen is blocked by Game)
  tutFrame(spec) {
    const L = this.tut;
    if (!spec || this.cardOpen || this.panel) { if (this._tut) { L.innerHTML = ''; this._tut = null; } return; }
    let T = this._tut;
    if (!T || T.key !== spec.key) {
      L.innerHTML = '';
      T = this._tut = { key: spec.key, text: null, holes: null, bh: 0, t0: performance.now(), pos: '', topY: null, frameN: 0 };
      if (spec.dim) {
        T.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        T.svg.setAttribute('class', 'tut-dim');
        T.svg.innerHTML = `<defs><radialGradient id="tutHole"><stop offset="0.6" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient>
          <mask id="tutMask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"><rect width="100%" height="100%" fill="#fff"/><g class="holes"></g></mask></defs>
          <rect width="100%" height="100%" fill="rgba(36,20,8,0.5)" mask="url(#tutMask)"/><g class="rings"></g>`;
        L.appendChild(T.svg);
      }
      T.ghost = el('div', 'tut-ghost');
      T.hand = el('div', 'tut-hand', icon('hand', 64));
      T.bubble = el('div', 'tut-bubble' + (spec.soft ? ' soft' : ''), `${spec.soft ? '' : `<div class="queen">${visitorSVG('queen', '#ffc928', 58)}</div>`}<span class="txt"></span>`);
      if (spec.skip) {
        const sk = el('button', 'tut-skip', 'Skip');
        sk.onclick = (e) => { e.stopPropagation(); this.api.sound('button'); this.api.skipTutorial?.(); };
        T.bubble.appendChild(sk);
      }
      L.append(T.ghost, T.hand, T.bubble);
      if (!spec.soft) this.api.sound('hint');
    }
    if (T.text !== spec.text) {
      T.text = spec.text;
      T.bubble.querySelector('.txt').innerHTML = spec.text;
      T.bubble.classList.remove('pop'); void T.bubble.offsetWidth; T.bubble.classList.add('pop');
      T.bh = T.bubble.offsetHeight;
    }
    // spotlight holes (+ a dashed ring around each target)
    const holes = spec.holes || [];
    const hk = holes.map((h) => `${Math.round(h.x)},${Math.round(h.y)},${Math.round(h.r)}`).join(';');
    if (T.svg && T.holes !== hk) {
      T.holes = hk;
      T.svg.querySelector('.holes').innerHTML = holes.map((h) => `<circle cx="${h.x}" cy="${h.y}" r="${h.r / 0.6}" fill="url(#tutHole)"/>`).join('');
      T.svg.querySelector('.rings').innerHTML = holes.map((h) => `<circle class="ring" cx="${h.x}" cy="${h.y}" r="${h.r}"/>`).join('');
    }
    // the hand: taps in place, or drags from one point to another (with what it carries under the finger)
    const h = spec.hand;
    const hs = T.hand.style, gs = T.ghost.style;
    if (!h) { hs.display = 'none'; gs.display = 'none'; }
    else if (h.tap) {
      hs.display = ''; gs.display = 'none';
      T.hand.classList.remove('drag');
      hs.opacity = '1';
      hs.transform = `translate(${h.tap.x - 12}px, ${h.tap.y - 6}px)`;
    } else if (h.drag) {
      const d = h.drag, C = 2400, t = ((performance.now() - T.t0) % C) / C;
      const e = t < 0.14 ? 0 : t > 0.64 ? 1 : ease01((t - 0.14) / 0.5);
      const mx = (d.x0 + d.x1) / 2, my = Math.min(d.y0, d.y1) - Math.max(30, Math.hypot(d.x1 - d.x0, d.y1 - d.y0) * 0.2);
      const x = (1 - e) * (1 - e) * d.x0 + 2 * (1 - e) * e * mx + e * e * d.x1;
      const y = (1 - e) * (1 - e) * d.y0 + 2 * (1 - e) * e * my + e * e * d.y1;
      const press = t < 0.1 ? 1 - t / 0.1 * 0.15 : t < 0.7 ? 0.85 : Math.min(1, 0.85 + (t - 0.7) / 0.08 * 0.15);
      const a = t < 0.08 ? t / 0.08 : t > 0.84 ? Math.max(0, 1 - (t - 0.84) / 0.12) : 1;
      T.hand.classList.add('drag');
      hs.display = ''; hs.opacity = a.toFixed(3);
      hs.transform = `translate(${x - 12}px, ${y - 6}px) scale(${press.toFixed(3)})`;
      if (h.ghost && t > 0.1 && t < 0.72) {
        if (T.ghostHtml !== h.ghost) { T.ghostHtml = h.ghost; T.ghost.innerHTML = h.ghost; }
        gs.display = ''; gs.opacity = a.toFixed(3);
        gs.transform = `translate(${x - 22}px, ${y - 30}px)`;
      } else gs.display = 'none';
    }
    // bubble: under the top HUD, or above the bottom bar when a target is up there
    if (T.topY == null || T.frameN++ % 30 === 0) {
      const sub = this.subEl.getBoundingClientRect();         // the chips sit under the HUD on wide screens, at the bottom on phones
      T.topY = Math.max(this.topEl.getBoundingClientRect().bottom, this.xpLabel.getBoundingClientRect().bottom, sub.top < window.innerHeight / 2 ? sub.bottom : 0) + 10;
    }
    const top = T.topY;
    const up = holes.some((o) => o.y - o.r < top + T.bh + 12) || (h?.tap && h.tap.y < top + T.bh + 40);
    const pos = up ? `b${Math.round(window.innerHeight - this.bottomEl.getBoundingClientRect().top + 12)}` : `t${Math.round(top)}`;
    if (T.pos !== pos) {
      T.pos = pos;
      if (up) { T.bubble.style.top = ''; T.bubble.style.bottom = `${pos.slice(1)}px`; } else { T.bubble.style.bottom = ''; T.bubble.style.top = `${pos.slice(1)}px`; }
    }
  }
  // a wrong tap while the tutorial is waiting for something specific: the bubble wiggles
  tutNudge() {
    const b = this._tut?.bubble;
    if (!b) return;
    b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
  }
}

const ease01 = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// one picture per kind of goal
const GOAL_ICON = { discoveries: 'book', harvests: 'basket', seeds: 'seed', orders: 'gift', plots: 'shovel', level: 'star', mutations: 'rainbow', decor: 'up_market' };

function keyOf(g) { return `${g.c1}.${g.c2}.${g.shape}.${g.pattern}`; }

// the pattern in its second colour, e.g. "white stripes"; variantName adds it to the flower's name so two
// variants that share a name (a white-striped and a pink-striped Purple Blossom) can be told apart
const PATTERN_PART = ['', 'centre', 'stripes', 'spots', 'tips'];
function patternDesc(g) { return g.pattern ? `${COLORS[g.c2 ?? g.c1].name.toLowerCase()} ${PATTERN_PART[g.pattern]}` : ''; }
function variantName(g) { return g.pattern ? `${flowerName(g)} · ${patternDesc(g)}` : flowerName(g); }
// card list row: the leading icon, then all of the text in one span (a flex row would otherwise split
// "Discover all <b>128 species</b> for your Flower Book" into three side-by-side columns)
function listItem(x) {
  const m = x.match(/^\s*(<img\b[^>]*>|<svg\b[\s\S]*?<\/svg>)\s*([\s\S]*)$/);
  return m ? `<div>${m[1]}<span>${m[2]}</span></div>` : `<div><span>${x}</span></div>`;
}
// A long press opens a card whose scrim now lies under the finger; the click some browsers send on release must
// not land on it (it would close the card at once). The next pointerdown ends the guard, so real taps get through.
function swallowNextClick() {
  const swallow = (e) => { e.stopPropagation(); e.preventDefault(); done(); };
  const done = () => { removeEventListener('click', swallow, true); removeEventListener('pointerdown', done, true); };
  addEventListener('click', swallow, true);
  addEventListener('pointerdown', done, true);
}
// keep "20 %" together when the line wraps
const nbsp = (t) => t.replace(/ %/g, '\u00a0%');
// stack counts stay short enough to sit under a chip
function stackCount(n) { return n < 1000 ? String(n) : n < 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : fmt(n); }

function rainbowQ(req) {
  if (req.mut) return `<div style="width:2.2em;height:2.2em;display:grid;place-items:center">${icon({ 1: 'rain', 2: 'night', 3: 'golden', 4: 'rainbow', 5: 'star' }[req.mut] || 'star', 30)}</div>`;
  if (req.pattern) return flowerSVG({ c1: 3, c2: 7, shape: 0, pattern: req.pattern, mut: 0 }, { size: 36 });
  return icon('seed', 30);
}

export { fmtTime };
