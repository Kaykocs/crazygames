// Buzz & Bloom — boot, main loop, input, tutorial and the glue between simulation, view, UI, audio and the
// CrazyGames SDK.
import * as THREE from 'three';
import { sdk } from './core/sdk.js';
import { on } from './core/events.js';
import { audio } from './audio/audio.js';
import { Renderer, detectQuality } from './gfx/renderer.js';
import { Post } from './gfx/post.js';
import { World } from './gfx/world.js';
import { FX } from './gfx/fx.js';
import { Garden, newSave } from './game/garden.js';
import { GardenView, mutColor } from './game/view.js';
import { UI, fmt } from './ui/ui.js';
import { flowerSVG, seedSVG, icon } from './ui/icons.js';
import { loadSave, saveSoon, flush, wipeSave, loadSettings, saveSettings } from './core/save.js';
import { QUALITY, DEFAULT_SETTINGS, DEV } from './config.js';
import { COLORS, SHAPES, C, S, M, MUTATIONS, flowerName, makeFlower, speciesId, rarity } from './game/genetics.js';
import { UPGRADES, xpForLevel } from './game/economy.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const TIPS = [
  'Bees mix the colours of neighbouring blooms…',
  'Red + Blue makes Purple. What does Purple + White make?',
  'Rainbows are rare — and so are rainbow flowers!',
  'Your garden keeps growing while you are away.',
  'Swipe across blooms to harvest them all at once.',
];

function setLoading(p, tip) {
  const bar = document.querySelector('#loading .bar i');
  if (bar) bar.style.width = `${Math.round(p * 100)}%`;
  if (tip) { const t = document.querySelector('#loading .tip'); if (t) t.textContent = tip; }
}

const todayStr = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return todayStr(d); };

class Game {
  async boot() {
    setLoading(0.05, TIPS[(Math.random() * TIPS.length) | 0]);
    await sdk.init();
    sdk.loadingStart();
    this.settings = loadSettings(DEFAULT_SETTINGS);
    if (params.has('reset')) wipeSave();
    const qName = params.get('quality') || (this.settings.quality === 'auto' ? detectQuality(sdk.cg?.user?.systemInfo) : this.settings.quality);
    this.qName = QUALITY[qName] ? qName : 'medium';
    await nextFrame();
    setLoading(0.2);

    // --- renderer + scene
    const app = $('app');
    this.R = new Renderer(app, this.qName);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.3, 400);
    this.post = new Post(this.R.renderer, this.scene, this.camera);
    this.world = new World(this.R.renderer, this.scene, QUALITY[this.qName]);
    this.fx = new FX(this.scene, QUALITY[this.qName]);
    setLoading(0.45);
    await nextFrame();

    // --- game state
    let save = loadSave();
    const fresh = !save;
    if (!save) save = newSave();
    save.stats.sessions = (save.stats.sessions || 0) + 1;
    this.garden = new Garden(save, (n, p) => this.onGame(n, p));
    if (save.tutorial < 99) {
      this.garden.tutorialSpeed = 3;
      this.garden.forceChild = makeFlower(C.PURPLE, S.BLOSSOM);
    }
    this.view = new GardenView(this.scene, this.camera, this.garden, this.fx, QUALITY[this.qName]);
    this.ui = new UI($('ui'), this.garden, this._uiApi());
    this.ui.renderPouch();
    this.ui.renderOrders();
    for (const s of save.seeds) this.view.onEvent('seed', s);
    setLoading(0.7);
    await nextFrame();

    // --- sizing
    this.R.onResize = (w, h) => {
      this.post.resize(w, h);
      this.view.resize(w, h);
      this.view.setSafeArea(this.ui.insets());
      this.post.setFocus(0.5, 0.3);
    };
    this.R.onQuality = (q) => this._applyQuality(q);
    this.post.setup(QUALITY[this.qName], innerWidth, innerHeight);
    this.R.resize(true);
    addEventListener('resize', () => this._layoutSoon());
    addEventListener('orientationchange', () => this._layoutSoon());
    window.visualViewport?.addEventListener('resize', () => this._layoutSoon());

    // --- warm up shaders so the first bloom / burst never hitches
    this._warmup();
    try { await this.R.renderer.compileAsync(this.scene, this.camera); } catch { /* older browsers */ }
    for (let i = 0; i < 2; i++) { this._frame(1 / 60); await nextFrame(); }
    setLoading(1);

    // --- audio + settings
    audio.setSfx(this.settings.sfx); audio.setMusic(this.settings.music);
    audio.setMute('sdk', !!sdk.settings.muteAudio);
    on('sdk:settings', (s) => audio.setMute('sdk', !!s.muteAudio));
    const unlockAudio = () => { audio.init(); audio.setSfx(this.settings.sfx); audio.setMusic(this.settings.music); audio.startMusic(); };
    addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
    addEventListener('keydown', unlockAudio, { once: true, capture: true });
    document.addEventListener('visibilitychange', () => this._visibility());

    this._input();
    this._commonFixes();

    // --- offline progress, daily gift, tutorial
    if (!fresh) {
      const away = (Date.now() - (save.saved || Date.now())) / 1000;
      const rep = this.garden.offline(away);
      if (rep) this._welcomeBack(rep);
      this.garden.ensureSpecial(todayStr());
    }
    if (save.tutorial >= 99) this.garden.claimDaily(todayStr(), yesterdayStr());
    this.ui.dirty.pouch = this.ui.dirty.orders = true;
    this._tutorial();

    // --- go
    this.clock = new THREE.Timer();
    this.time = 0;
    $('loading').classList.add('done');
    setTimeout(() => $('loading')?.remove(), 700);
    sdk.loadingStop();
    sdk.gameplayStart();
    sdk.cg && this._reportProgress();
    this.lastSave = 0;
    requestAnimationFrame(() => this._loop());
    if (DEV || params.has('debug')) this._debugHooks();
    window.__game = this;
  }

  // ------------------------------------------------------------------------------------------ ui api
  _uiApi() {
    const self = this;
    return {
      get view() { return self.view; },
      sound: (n, o) => audio.play(n, o),
      sellSeed: (i, all) => { const c = self.garden.sellSeed(i, all); if (c) { self.ui.toast(`${icon('coin')} Sold for ${fmt(c)}`, 'good'); self.ui.dirty.pouch = true; saveSoon(self.garden.s); } },
      buySeed: (i) => {
        const it = self.garden.s.shop.stock[i];
        if (!self.garden.buySeed(i)) { audio.play('invalid'); if (it && self.garden.s.coins < it.price) self.ui.toast(`Not enough coins`, 'warn'); return false; }
        return true;
      },
      buyUpgrade: (k) => { if (!self.garden.buyUpgrade(k)) { audio.play('invalid'); return false; } return true; },
      buyDecor: (id) => { if (!self.garden.buyDecor(id)) { audio.play('invalid'); return false; } return true; },
      buyPlot: (i, tag) => self._buyPlot(i, tag),
      swapOrder: (k) => { if (self.garden.swapOrder(k)) { self.ui.dirty.orders = true; audio.play('whoosh'); } },
      getSettings: () => ({ ...self.settings }),
      setSetting: (k, v) => {
        self.settings[k] = v; saveSettings(self.settings);
        if (k === 'sfx') audio.setSfx(v);
        if (k === 'music') { audio.setMusic(v); if (v) audio.startMusic(); }
        if (k === 'quality') self._setQuality(v);
      },
      resetSave: () => { wipeSave(); flush(); location.reload(); },
      onPanel: (open) => { if (open) sdk.gameplayStop(); else sdk.gameplayStart(); },
      onSelect: (i) => { self.view.highlightEmpty = self.ui.sel >= 0; self._tutorialEvent('select', { i }); },
      onLayout: () => self._layoutSoon(),
    };
  }

  _layoutSoon() {
    clearTimeout(this._layoutT);
    this._layoutT = setTimeout(() => { this.R.resize(true); this.view.setSafeArea(this.ui.insets()); }, 60);
  }

  // ------------------------------------------------------------------------------------------ game events
  onGame(name, p) {
    const g = this.garden, ui = this.ui, view = this.view;
    if (!ui || !view) return;          // events fired while the garden is still being constructed
    view.onEvent(name, p);
    const at = (i, dy = 0) => { const h = view.headPos(i); return view.project(h.x, h.y + dy, h.z); };
    switch (name) {
      case 'plant':
        audio.play('drop', { pitch: 0.9 + Math.random() * 0.2 });
        ui.dirty.pouch = true;
        break;
      case 'bloom':
        audio.play('bloom', { pitch: 0.9 + (p.g.c1 % 5) * 0.06, volume: 0.6, minGap: 0.08 });
        break;
      case 'harvest': {
        const pt = at(p.i);
        if (p.delivered !== null && p.delivered !== undefined) {
          audio.play('reward');
          ui.flyToOrder(pt.x, pt.y, p.delivered, flowerSVG(p.g, { size: 40 }));
          ui.dirty.orders = true;
        } else {
          audio.play('pop', { step: this._harvestChain(), volume: 0.8, minGap: 0.01 });
          ui.floatText(pt.x, pt.y - 10, `+${fmt(p.coins)}`, p.g.mut ? 'gold' : '');
          ui.flyCoins(pt.x, pt.y, p.coins);
        }
        break;
      }
      case 'seed': audio.play('pop', { step: 8, volume: 0.45 }); break;
      case 'seedCollected': {
        const o = view.orbScreen(p.id);
        if (o) ui.flySeed(o.x, o.y, g.s.book[speciesId(p.g)] ? flowerSVG(p.g, { size: 36 }) : seedSVG(p.g, 36));
        audio.play('pick', { pitch: 1.1, volume: p.auto ? 0.4 : 0.8 });
        ui.dirty.pouch = true;
        break;
      }
      case 'bee:pollinate':
        // the garden plays itself: every pollination is a soft note tuned to the flower's colour
        audio.play('flip', { step: 3 + (p.g.c1 * 3) % 10, volume: 0.35, minGap: 0.05 });
        break;
      case 'discover': this._discover(p); break;
      case 'variant':
        if (p.mut) ui.toast(`${flowerSVG(p.g, { size: 26 })} New variant: <b>${flowerName(p.g)}</b>`, 'gold');
        break;
      case 'mutate': {
        const pt = at(p.i, 0.2);
        ui.floatText(pt.x, pt.y, MUTATIONS[p.g.mut].name + '!', 'gold');
        audio.play('clear', { pitch: 1.2, volume: 0.6, minGap: 0.2 });
        if (p.g.mut === M.RAINBOW && !g.s.stats.rainbowSeen) { g.s.stats.rainbowSeen = 1; sdk.happytime(); }
        break;
      }
      case 'water': audio.play('whoosh', { volume: 0.7 }); break;
      case 'dig': audio.play('drop', { pitch: 0.7 }); ui.dirty.pouch = true; break;
      case 'plot': audio.play('unlock'); ui.toast(`${icon('check')} New plot!`, 'good'); this._layoutSoon(); break;
      case 'upgrade': {
        audio.play('reward');
        ui.toast(`${icon('up_' + p.k, 24)} ${UPGRADES[p.k].name} → level ${p.level}`, 'good');
        ui.dirty.pouch = true;
        break;
      }
      case 'decor': {
        audio.play('win');
        ui.toast(`${icon('star')} ${p.d.name} placed! ${p.d.text}`, 'gold', 3);
        this.world.placeDecor?.(p.id, true);
        break;
      }
      case 'buySeed': audio.play('coin'); ui.dirty.pouch = true; break;
      case 'sellSeed': audio.play('coin'); break;
      case 'pouchFull':
        audio.play('invalid');
        ui.toast(`Seed pouch is full — plant or sell some seeds`, 'warn');
        break;
      case 'order:new': ui.dirty.orders = true; audio.play('button'); break;
      case 'order:leave': ui.dirty.orders = true; break;
      case 'order:progress': ui.dirty.orders = true; break;
      case 'order:done': {
        ui.orderDone(p.k);
        const pos = ui.orderScreenPos(p.k) || { x: innerWidth / 2, y: 120 };
        setTimeout(() => { ui.flyCoins(pos.x, pos.y, p.order.reward); ui.floatText(pos.x, pos.y + 20, `+${fmt(p.order.reward)}`, 'gold'); }, 250);
        audio.play('win');
        break;
      }
      case 'special': ui.dirty.orders = true; break;
      case 'level': {
        audio.play('win');
        this.fx.confetti({ x: view.cam.x, y: 0, z: view.cam.z }, 70);
        const unlockList = [
          ...p.unlocks.map((u) => `${icon('check', 18)} ${u.text}`),
          ...p.upgrades.map((k) => `${icon('up_' + k, 18)} New upgrade: ${UPGRADES[k].name}`),
        ];
        ui.showCard({
          merge: 'level', lvl: p.level, unlockList, coins: p.reward,
          kicker: 'Level up!', hero: `<div class="display" style="font-size:4.2em">${p.level}</div>`,
          title: 'You\'re a better gardener!', list: unlockList.length ? unlockList : null,
          reward: `${icon('coin')} +${fmt(p.reward)}`, auto: unlockList.length ? 0 : 3.5,
          mergeWith: (q) => {
            const list = [...(q.unlockList || []), ...unlockList], coins = (q.coins || 0) + p.reward;
            return { lvl: p.level, unlockList: list, coins, hero: `<div class="display" style="font-size:4.2em">${p.level}</div>`, list: list.length ? list : null, reward: `${icon('coin')} +${fmt(coins)}`, auto: list.length ? 0 : 3.5 };
          },
        });
        ui.dirty.pouch = ui.dirty.orders = true;
        if (p.level % 5 === 0) sdk.happytime();
        break;
      }
      case 'achievement':
        audio.play('star', { step: 2 });
        ui.toast(`${icon('trophy')} <b>${p.a.name}</b> · +${fmt(p.a.reward)} coins`, 'gold', 3);
        break;
      case 'collection': {
        const what = p.kind === 'color' ? `every ${COLORS[p.index].name} flower` : `every ${SHAPES[p.index].name}`;
        ui.showCard({ kicker: 'Collection!', hero: icon('trophy', 120), title: `You grew ${what}!`, reward: `${icon('coin')} +${fmt(p.reward)}` });
        audio.play('win');
        sdk.happytime();
        break;
      }
      case 'weather': this._weather(p.kind, true); break;
      case 'restock': if (ui.panel?.tab === 'seeds') ui.refreshPanel(); break;
      case 'daily': {
        ui.showCard({
          kicker: 'Daily gift', hero: icon('gift', 110), title: p.streak > 1 ? `Day ${p.streak} streak!` : 'Welcome back, gardener!',
          desc: 'Come back tomorrow for a bigger gift.', reward: `${icon('coin')} +${fmt(p.coins)} &nbsp; ${flowerSVG(p.seed, { size: 30 })}`,
        });
        ui.dirty.pouch = true;
        break;
      }
      case 'gnome': break;
      default: break;
    }
    if (name !== 'bee:visit' && name !== 'bee:pollinate' && name !== 'can') saveSoon(g.s);
    this._tutorialEvent(name, p);
    if (name === 'discover' || name === 'decor' || name === 'level') this._reportProgress();
  }

  _harvestChain() {
    const now = performance.now();
    this._hc = now - (this._hcT || 0) < 700 ? (this._hc || 0) + 1 : 0;
    this._hcT = now;
    return Math.min(this._hc, 14);
  }

  _discover(p) {
    const g = p.g, ui = this.ui;
    const tiers = COLORS[g.c1].tier + SHAPES[g.shape].tier;
    audio.play('combo', { step: Math.min(4, tiers) });
    this.ui.bookBtn.classList.add('has-dot');
    if (tiers <= 2 && !g.pattern) {
      ui.toast(`${flowerSVG(g, { size: 26 })} New species: <b>${flowerName(g, { withMut: false })}</b> · +${fmt(p.coins)}`, 'good', 2.6);
      return;
    }
    ui.showCard({
      tutorial: this.garden.s.tutorial < 99,
      tag: '★'.repeat(rarity(g)), kicker: 'New species!', hero: flowerSVG({ ...g, mut: 0 }, { size: 150 }),
      title: flowerName(g, { withMut: false }), desc: `Added to your Flower Book (${this.garden.discoveredCount()}/128)`,
      reward: `${icon('coin')} +${fmt(p.coins)}`,
    });
    const h = this.view.headPos(this.garden.plots.findIndex((pl) => pl.plant && speciesId(pl.plant.g) === p.id));
    if (h && isFinite(h.x)) this.fx.sparkles(h.x, h.y, h.z, '#fff4a8', 24, 0.8, 1.4);
  }

  _weather(kind, announce) {
    this.world.setWeather(kind);
    this.post.setWeather(kind);
    this.fx.setRain(kind === 'rain');
    this.fx.setFireflies(kind === 'night');
    this.fx.setMotes(kind === 'golden' || kind === 'rainbow');
    audio.setMusicMood(kind === 'night' ? 'menu' : 'play');
    if (!announce) return;
    const msg = {
      rain: `${icon('rain')} Rain shower! Flowers grow twice as fast`,
      golden: `${icon('golden')} Golden hour! Blooms may turn to gold`,
      night: `${icon('night')} Starry night! Blooms may start to glow`,
      rainbow: `${icon('rainbow')} A rainbow! The rarest mutation is possible`,
    }[kind];
    if (msg) { this.ui.toast(msg, 'gold', 3.5); audio.play('whoosh'); }
  }

  _welcomeBack(rep) {
    const hrs = rep.seconds >= 3600 ? `${Math.floor(rep.seconds / 3600)}h ${Math.round((rep.seconds % 3600) / 60)}m` : `${Math.round(rep.seconds / 60)} min`;
    const list = [];
    if (rep.bloomed) list.push(`${icon('star', 18)} ${rep.bloomed} flowers bloomed`);
    if (rep.seeds) list.push(`${icon('bee', 18)} Your bees made ${rep.seeds} seeds`);
    if (rep.coins > 0) list.push(`${icon('coin', 18)} The gnome earned ${fmt(rep.coins)} coins`);
    for (const d of (rep.discoveries || []).slice(0, 3)) list.push(`${flowerSVG(d, { size: 18 })} New: ${flowerName(d, { withMut: false })}`);
    if (!list.length) return;
    this.ui.showCard({ kicker: 'Welcome back!', title: `You were away ${hrs}`, list, buttons: [{ label: 'Let\'s go!' }] });
  }

  _buyPlot(i, tagEl) {
    const g = this.garden, cost = g.nextPlotCost();
    if (g.s.coins < cost) {
      audio.play('invalid');
      tagEl?.classList.remove('shake'); void tagEl?.offsetWidth; tagEl?.classList.add('shake');
      this.ui.toast(`Need ${fmt(cost - g.s.coins)} more coins for this plot`, 'warn');
      return;
    }
    g.buyPlot(i);
  }

  _reportProgress() {
    // completion % = Flower Book progress (the game's long-term goal)
    const pct = Math.floor((this.garden.discoveredCount() / 128) * 100);
    if (pct === this._pct) return;
    this._pct = pct;
    try { if (sdk.available && sdk.cg.game.reportGameCompletedPercentage) sdk.cg.game.reportGameCompletedPercentage(pct); } catch { /* optional API */ }
  }

  // ------------------------------------------------------------------------------------------ input
  _input() {
    const cv = this.R.renderer.domElement;
    const g = this.garden, ui = this.ui, view = this.view;
    let down = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      if (ui.busy) return;
      const p = pos(e);
      cv.setPointerCapture?.(e.pointerId);
      down = { x: p.x, y: p.y, moved: false, mode: null, done: new Set(), t: performance.now() };
      this._tapAt(p.x, p.y, down);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (!down) {
        if (e.pointerType === 'mouse' && !ui.busy) {
          const i = view.pickPlot(p.x, p.y);
          view.hoverPlot = i;
          const seedHit = view.pickSeed(p.x, p.y) != null;
          cv.style.cursor = seedHit || (i >= 0 && (g.plots[i].owned || g.canBuyPlot(i))) ? 'pointer' : 'default';
        }
        return;
      }
      if (Math.hypot(p.x - down.x, p.y - down.y) > 6) down.moved = true;
      // swipe: keep harvesting / planting / collecting along the path
      if (down.mode) this._swipeAt(p.x, p.y, down);
    });
    const end = () => { down = null; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { view.hoverPlot = -1; });
    // keyboard shortcuts (desktop)
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'Escape') { if (ui.panel) ui.closePanel(); else if (ui.cardOpen) ui._closeCard(); else { ui.selectSeed(-1); ui.setTool(''); } return; }
      if (ui.busy) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && g.s.pouch[n - 1]) ui.selectSeed(ui.sel === n - 1 ? -1 : n - 1);
      else if (e.code === 'KeyW') ui.setTool(ui.tool === 'water' ? '' : 'water');
      else if (e.code === 'KeyD') ui.setTool(ui.tool === 'dig' ? '' : 'dig');
      else if (e.code === 'KeyB') ui.openBook();
      else if (e.code === 'KeyS') ui.openShop();
    });
  }

  _tapAt(x, y, down) {
    const g = this.garden, ui = this.ui, view = this.view;
    const seedId = view.pickSeed(x, y);
    if (seedId != null) { g.collectSeed(seedId); down.mode = 'collect'; return; }
    const i = view.pickPlot(x, y);
    if (i < 0) return;
    const plot = g.plots[i], pl = plot.plant;
    const tut = g.s.tutorial < 99 ? TUT[g.s.tutorial]?.key : null;
    if (!plot.owned) { if (g.canBuyPlot(i) && g.s.tutorial >= 99) this._buyPlot(i, ui.plotTags.get(i)); return; }
    if (ui.tool === 'water') {
      if (pl && pl.stage === 'grow') { if (!g.water(i)) { audio.play('invalid'); ui.toast('The watering can is empty — it refills by itself', 'warn'); } }
      else audio.play('invalid');
      down.mode = 'water'; down.done.add(i);
      return;
    }
    if (ui.tool === 'dig') {
      if (pl) g.dig(i); else audio.play('invalid');
      return;
    }
    if (pl && pl.stage === 'bloom') {
      if (tut && tut !== 'harvest') { ui.toast('Let the bees visit your blooms first!', ''); return; }
      g.harvest(i); down.mode = 'harvest'; down.done.add(i);
      return;
    }
    if (!pl) {
      if (tut === 'plant2' && !g.nb[i].some((j) => g.plots[j].plant)) { audio.play('invalid'); ui.toast(`${icon('bee')} Plant it right <b>next to</b> your first flower!`, ''); return; }
      if (ui.sel >= 0) { this._plantAt(i); down.mode = tut ? null : 'plant'; down.done.add(i); }
      else if (g.s.pouch.length) { audio.play('invalid'); ui.toast(`${icon('seed')} Pick a seed from your pouch first`, ''); ui.pouchEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 350 }); }
      else ui.toast(`${icon('basket')} No seeds — buy some in the shop!`, '');
      return;
    }
    // growing plant: show what it is and when it blooms
    const left = (pl.dur - pl.t) / g.speedNow();
    const known = !!g.s.book[speciesId(pl.g)];
    ui.toast(`${known ? flowerSVG(pl.g, { size: 26 }) : seedSVG(pl.g, 26)} ${known ? flowerName(pl.g) : 'Mystery hybrid'} · blooms in ${Math.ceil(left)}s${g.has('can') && g.s.can.charges ? ' — water it to speed up!' : ''}`, '', 2);
    audio.play('toggle');
  }

  _swipeAt(x, y, down) {
    const g = this.garden, view = this.view;
    if (down.mode === 'harvest' || down.mode === 'collect') {
      const seedId = view.pickSeed(x, y);
      if (seedId != null) g.collectSeed(seedId);
      const i = view.pickPlot(x, y);
      if (i >= 0 && !down.done.has(i) && g.isBloom(i) && !(g.s.tutorial < 99 && TUT[g.s.tutorial]?.key !== 'harvest')) { down.done.add(i); g.harvest(i); }
    } else if (down.mode === 'plant') {
      const i = view.pickPlot(x, y);
      if (i >= 0 && !down.done.has(i) && g.plots[i].owned && !g.plots[i].plant && this.ui.sel >= 0) { down.done.add(i); this._plantAt(i); }
    } else if (down.mode === 'water') {
      const i = view.pickPlot(x, y);
      if (i >= 0 && !down.done.has(i) && g.plots[i].plant?.stage === 'grow' && g.s.can.charges > 0) { down.done.add(i); g.water(i); }
    }
  }

  _plantAt(i) {
    const g = this.garden, ui = this.ui;
    const e = g.s.pouch[ui.sel];
    if (!e) return;
    const last = e.n === 1;
    g.plant(i, ui.sel);
    if (last) { ui.sel = -1; this.view.highlightEmpty = false; }
    ui.dirty.pouch = true;
  }

  // CrazyGames "common fixes": no page scroll from wheel / arrows / space, no context menu
  _commonFixes() {
    addEventListener('wheel', (e) => { if (!e.target.closest?.('.panel-body, .pouch-list')) e.preventDefault(); }, { passive: false });
    addEventListener('keydown', (e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _visibility() {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      audio.setMute('hidden', true);
      flush();
    } else {
      audio.setMute('hidden', false);
      if (this.hiddenAt) {
        const away = (Date.now() - this.hiddenAt) / 1000;
        this.hiddenAt = 0;
        if (away > 45) { const rep = this.garden.offline(away); if (rep) this._welcomeBack(rep); this.ui.dirty.pouch = true; }
        if (this.garden.s.tutorial >= 99) this.garden.claimDaily(todayStr(), yesterdayStr());
      }
    }
  }

  // ------------------------------------------------------------------------------------------ tutorial
  _tutorial() {
    const s = this.garden.s;
    this.ui.holdCards(s.tutorial < 99);
    if (s.tutorial >= 99) { this.ui.setTutorial(null); this.garden.tutorialSpeed = 1; return; }
    const step = TUT[s.tutorial];
    if (!step) { this._finishTutorial(); return; }
    this.ui.setTutorial({ key: step.key, text: step.text, target: step.target ? step.target(this) : null });
  }
  _tutorialEvent(name, p) {
    const s = this.garden.s;
    if (s.tutorial >= 99) return;
    const step = TUT[s.tutorial];
    if (step?.done && step.done(this, name, p)) { s.tutorial++; this._tutorial(); }
  }
  _tutorialTick() {
    const s = this.garden.s;
    if (s.tutorial >= 99) return;
    const step = TUT[s.tutorial];
    if (step?.check && step.check(this)) { s.tutorial++; this._tutorial(); return; }
    // keep pointer targets fresh (plots move while the camera eases)
    if (step?.target) this.ui.tutStep = { key: step.key, text: step.text, target: step.target(this) };
  }
  _finishTutorial() {
    const s = this.garden.s;
    if (s.tutorial >= 99) return;
    s.tutorial = 99;
    this.garden.tutorialSpeed = 1;
    this.ui.setTutorial(null);
    this.ui.holdCards(false);
    s.weather.until = s.t + 90;
    this.garden.addXp(0);
    this.ui.showCard({
      kicker: 'Your garden awaits!', hero: flowerSVG({ c1: C.PURPLE, shape: S.BLOSSOM, pattern: 0, mut: 0 }, { size: 120 }),
      list: [
        `${icon('book', 18)} Discover all <b>128 species</b> for your Flower Book`,
        `${icon('bee', 18)} Plant different colours side by side`,
        `${icon('basket', 18)} Buy new plots with coins`,
        `${icon('rainbow', 18)} Watch the weather for rare mutations`,
      ],
      buttons: [{ label: 'Let\'s grow!' }],
    });
    this.garden.claimDaily(todayStr(), yesterdayStr());
    saveSoon(s);
    this._layoutSoon();
  }

  // ------------------------------------------------------------------------------------------ quality
  _setQuality(name) {
    const qn = name === 'auto' ? detectQuality(sdk.cg?.user?.systemInfo) : name;
    if (!QUALITY[qn] || qn === this.qName) return;
    this.qName = qn;
    this.R.setQuality(qn);
    this.post.setup(QUALITY[qn], this.R.width, this.R.height);
  }
  _applyQuality(q) {
    this.world.setShadows(q.shadows);
    this.scene.traverse((o) => { if (o.material) { for (const m of [].concat(o.material)) m.needsUpdate = true; } });
    if (this.post.q && q.post === false) this.post.setup({ ...q, post: false }, this.R.width, this.R.height);
  }

  _warmup() {
    const p = { x: 0, y: -20, z: 0 };
    this.fx.petals(p.x, p.y, p.z, ['#fff'], 2);
    this.fx.sparkles(p.x, p.y, p.z, '#fff', 2);
  }

  // ------------------------------------------------------------------------------------------ loop
  _loop() {
    requestAnimationFrame(() => this._loop());
    this.clock.update();
    const raw = this.clock.getDelta();
    if (this.frozen) return;
    this.R.govern(raw, !document.hidden && this.settings.quality === 'auto' && !params.has('quality'));
    this._frame(Math.min(raw, 1 / 20));
  }

  _frame(dt) {
    this.time = (this.time || 0) + dt;
    const g = this.garden;
    g.tick(dt);
    this.view.update(dt, this.time);
    this.world.update(dt, this.time);
    this.fx.update(dt, this.camera, { x: this.view.cam.x, y: 0, z: this.view.cam.z });
    this.post.update(dt);
    this.post.render();
    this.view.flowers.afterRender?.();
    this.ui.update(dt);
    this._tutorialTick();
    this.lastSave += dt;
    if (this.lastSave > 10) { this.lastSave = 0; saveSoon(g.s, 200); }
  }

  _debugHooks() {
    this.debug = {
      coins: (n = 10000) => { this.garden.earn(n); },
      level: (n = 5) => { for (let i = 0; i < n; i++) this.garden.addXp(xpForLevel(this.garden.s.level) - this.garden.s.xp); },
      skipTutorial: () => { this._finishTutorial(); },
      weather: (k) => { const w = this.garden.s.weather; w.kind = k; w.until = this.garden.s.t + 60; this._weather(k, true); },
      freeze: () => { this.frozen = true; },
      unfreeze: () => { this.frozen = false; this.clock.update(); },
      step: (ms = 16.7) => { const n = Math.max(1, Math.round(ms / (1000 / 60))); for (let i = 0; i < n; i++) this._frame(1 / 60); },
      // fast-forward the simulation (no rendering in between), then draw one frame
      sim: (seconds = 5) => {
        const n = Math.round(seconds / 0.05);
        for (let i = 0; i < n; i++) {
          this.garden.tick(0.05); this.view.update(0.05, (this.time += 0.05)); this.world.update(0.05, this.time); this.post.update(0.05);
          this.fx.update(0.05, this.camera, { x: 0, y: 0, z: 0 }); this._tutorialTick();
        }
        this._frame(1 / 60);
      },
      grant: (c1, shape, pattern = 0, mut = 0, n = 1) => { this.garden.addSeed(makeFlower(c1, shape, pattern, null, mut), n); this.ui.dirty.pouch = true; },
    };
  }
}

// ------------------------------------------------------------------------------------------ tutorial steps
// Each step: text, optional pointer target, and a completion test (event-driven `done` or polled `check`).
const TUT = [
  {
    key: 'pick', text: 'Welcome to your garden! Tap a <b>seed</b> to pick it up.',
    target: (G) => ({ el: G.ui.pouchList.children[0] }),
    done: (G, n, p) => (n === 'select' && p.i >= 0) || n === 'plant',
  },
  {
    key: 'plant1', text: 'Now tap the <b>soil</b> to plant it.',
    target: (G) => (G.ui.sel < 0 ? { el: G.ui.pouchList.children[0] } : { world: { ...G.garden.pos[centerPlot(G.garden)], y: 0.3 } }),
    done: (G, n) => n === 'plant',
  },
  {
    key: 'plant2', text: 'Plant the other seed <b>right next to it</b>.',
    target: (G) => (G.ui.sel < 0 ? { el: G.ui.pouchList.children[0] } : { world: { ...G.garden.pos[neighbourPlot(G.garden)], y: 0.3 } }),
    done: (G, n) => n === 'plant',
  },
  {
    key: 'grow', text: 'Watch them grow… <b>bees</b> love neighbouring blooms!',
    done: (G, n) => n === 'seed',
  },
  {
    key: 'collect', text: 'A bee mixed your flowers into a <b>new seed</b>! Tap the bubble.',
    target: (G) => { const o = [...G.view.orbs.values()][0]; return o ? { world: { x: o.g.position.x, y: o.g.position.y, z: o.g.position.z } } : null; },
    done: (G, n) => n === 'seedCollected',
  },
  {
    key: 'harvest', text: 'Tap a <b>bloom</b> to harvest it for coins.',
    target: (G) => { const i = G.garden.plots.findIndex((p, k) => G.garden.isBloom(k)); return i >= 0 ? { world: G.view.headPos(i) } : null; },
    done: (G, n, p) => n === 'harvest' && !p.auto,
  },
  {
    key: 'plant3', text: 'Now plant your <b>new seed</b> — what will it be?',
    target: (G) => {
      if (G.ui.sel < 0) { const k = G.garden.s.pouch.findIndex((e) => e.g.c1 === C.PURPLE); return { el: G.ui.pouchList.children[Math.max(0, k)] }; }
      const i = G.garden.plots.findIndex((p) => p.owned && !p.plant);
      return i >= 0 ? { world: { ...G.garden.pos[i], y: 0.3 } } : null;
    },
    done: (G, n, p) => n === 'plant' && p.g.c1 === C.PURPLE,
  },
  {
    key: 'wait', text: 'Red + Blue… let\'s see what grows!',
    done: (G, n, p) => n === 'discover' && p.g.c1 === C.PURPLE,
  },
];
function centerPlot(g) { return g.byKey.get('0,0'); }
function neighbourPlot(g) {
  const planted = g.plots.findIndex((p) => p.plant);
  const nb = (planted >= 0 ? g.nb[planted] : g.nb[centerPlot(g)]).find((j) => g.plots[j].owned && !g.plots[j].plant);
  return nb ?? centerPlot(g);
}
// the last tutorial step finishes the tutorial after the discovery card
const _origDone = TUT[TUT.length - 1].done;
TUT[TUT.length - 1].done = (G, n, p) => { const ok = _origDone(G, n, p); if (ok) setTimeout(() => G._finishTutorial(), 1600); return false; };

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot-error');
  if (el) { el.textContent = 'Something went wrong while loading: ' + e.message; el.style.display = 'block'; }
});
addEventListener('pagehide', () => flush());
addEventListener('beforeunload', () => flush());
