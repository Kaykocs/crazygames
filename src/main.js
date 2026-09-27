// Buzz & Bloom — boot, main loop, input, tutorial and the glue between simulation, view, UI, audio and the
// CrazyGames SDK.
import { sdk } from './core/sdk.js';
import { on } from './core/events.js';
import { audio } from './audio/audio.js';
import { Stage, detectQuality, QUALITY } from './art/stage.js';
import { World } from './art/world.js';
import { FX } from './art/fx.js';
import { tickBanks } from './art/paint.js';
import { Garden, newSave } from './game/garden.js';
import { GardenView, mutColor } from './art/garden.js';
import { UI, fmt } from './ui/ui.js';
import { flowerSVG, seedSVG, icon, visitorSVG } from './ui/icons.js';
import { SOIL_Y } from './art/planter.js';
import { loadSave, saveSoon, flush, wipeSave, loadSettings, saveSettings } from './core/save.js';
import { DEFAULT_SETTINGS, DEV } from './config.js';
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
  'Drag pollen from one bloom to another to cross them.',
  'Tap growing flowers to make them grow faster.',
  'Harvest blooms quickly one after another for a combo!',
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

    // --- stage (2D canvas) + world
    const app = $('app');
    this.stage = new Stage(app, this.qName);
    this.world = new World(this.stage, QUALITY[this.qName]);
    this.fx = new FX(QUALITY[this.qName]);
    setLoading(0.45);
    await nextFrame();

    // --- game state
    let save = loadSave();
    const fresh = !save;
    if (!save) save = newSave();
    save.stats.sessions = (save.stats.sessions || 0) + 1;
    this.garden = new Garden(save, (n, p) => this.onGame(n, p));
    if (save.tutorial < 99) this.garden.forceChild = makeFlower(C.PURPLE, S.BLOSSOM);    // the tutorial's first cross
    this.view = new GardenView(this.stage, this.garden, this.fx, QUALITY[this.qName]);
    this.view.nightK = () => this.world.weather.k.night;
    this.view.world = this.world;
    this.world.fx = this.fx;
    this.stage.layers = [this.world, this.view, this.fx];
    this.ui = new UI($('ui'), this.garden, this._uiApi());
    this.ui.renderPouch();
    this.ui.renderOrders();
    for (const s of save.seeds) this.view.onEvent('seed', s);
    for (const id in save.decor) this.world.decor.place(id, false);
    this.world.decor.setGnome((save.upgrades.gnome || 0) > 0);
    setLoading(0.7);
    await nextFrame();

    // --- sizing
    this.stage.onResize = (w, h) => {
      this.view.resize(w, h);
      this.view.setSafeArea(this.ui.insets());
    };
    this.stage.onQuality = (q) => this._applyQuality(q);
    this.stage.resize(true);
    this.stage.ground.fill();
    addEventListener('resize', () => this._layoutSoon());
    addEventListener('orientationchange', () => this._layoutSoon());
    window.visualViewport?.addEventListener('resize', () => this._layoutSoon());

    // --- paint the first frames (sprite caches) while the loading screen is still up
    this._warmup();
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
    this.last = performance.now();
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
    if (params.get('cover')) this._coverMode(params.get('cover'));
  }

  // Store art: a composed close-up of a lush garden with the title (the only text CrazyGames allows on covers).
  _coverMode(kind) {
    const g = this.garden, s = g.s;
    this._finishTutorial();
    this.ui.cards.length = 0; this.ui._closeCard(true);
    this.goldenT = 1e9; this._lastHint = 1e9;
    $('ui').style.display = 'none';
    audio.setMute('cover', true);
    const flowers = [
      [7, 4, 1], [1, 1, 0], [6, 3, 0], [8, 5, 2], [0, 0, 0], [13, 2, 0], [4, 6, 0], [12, 3, 3], [11, 1, 0], [9, 5, 0], [2, 7, 0],
      [10, 4, 0], [5, 0, 2], [15, 6, 1], [3, 5, 4], [7, 7, 0], [14, 3, 0], [6, 0, 1], [1, 3, 0],
    ];
    g.plots.forEach((p) => { if (Math.max(Math.abs(p.q), Math.abs(p.r), Math.abs(-p.q - p.r)) <= 2) p.owned = true; });
    let n = 0;
    g.plots.forEach((p, i) => {
      if (!p.owned || n >= flowers.length) return;
      const [c1, shape, pattern] = flowers[n++];
      p.plant = { g: { c1, c2: pattern ? (c1 === 3 ? 7 : 3) : 3, shape, pattern, mut: n === 8 ? 3 : n === 14 ? 4 : 0 }, stage: 'bloom', t: 1, dur: 1, bloomT: 0, pollenT: 99, harvests: 0 };
    });
    s.seeds = [];
    for (const id of ['birdbath', 'lanterns', 'windmill', 'fountain']) { s.decor[id] = 1; this.world.decor.place(id, false); }
    s.weather = { kind: 'clear', until: 1e9, total: 1e9 };
    this._weather('clear', false);
    const W = innerWidth, H = innerHeight;
    // the garden sits low in the frame so the title has the sky-ish top band to itself
    const shots = {
      landscape: { x: 0.3, z: -2.1, ppu: Math.min(W / 14.5, H / 8.6) },
      portrait: { x: 0.1, z: -3.2, ppu: Math.min(W / 9.6, H / 14.5) },
      square: { x: 0.2, z: -2.6, ppu: Math.min(W / 11, H / 10.5) },
    };
    const sh = shots[kind] || shots.landscape;
    this.view.setCameraOverride(sh);
    this.view.hideSale = true;
    // bees busy on the flowers in shot
    const busy = g.plots.map((p, i) => i).filter((i) => g.isBloom(i));
    g.bees.length = 0;
    g.s.upgrades.bees = 3; g.syncBees();
    g.bees.forEach((b, k) => { b.state = 'atA'; b.a = busy[(k * 5 + 3) % busy.length]; b.b = b.a; b.t = 0; b.dur = 1e9; });
    const title = document.createElement('div');
    title.id = 'cover-title';
    title.className = kind;
    title.innerHTML = kind === 'landscape' ? '<span>Buzz &amp; Bloom</span>' : '<span>Buzz &amp;</span><span>Bloom</span>';
    document.body.appendChild(title);
    this.coverReady = true;
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
      skipTutorial: () => self._finishTutorial(true),
      questHint: () => self._questHint(),
      onLayout: () => self._layoutSoon(),
      catchGoldenAt: (cx, cy) => self._goldenAt(cx, cy),
    };
  }

  _layoutSoon() {
    clearTimeout(this._layoutT);
    // the canvas is only resized when the window really changed (a forced resize clears it and re-frames with a jump)
    this._layoutT = setTimeout(() => { this.stage.resize(); this.view.setSafeArea(this.ui.insets()); }, 60);
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
          ui.floatText(pt.x, pt.y - 10, `+${fmt(p.coins)}`, p.g.mut || p.combo > 1 ? 'gold' : '');
          ui.flyCoins(pt.x, pt.y, p.coins);
        }
        if (p.combo > 1) {
          setTimeout(() => ui.floatText(pt.x, pt.y - 46, `Combo ×${p.combo}!`, p.combo >= 4 ? 'combo hot' : 'combo'), 60);
          if ([2, 3, 5, 8, 12].includes(p.combo)) audio.play('combo', { step: Math.min(10, p.combo) });
          if (p.combo >= 3) { const h = view.headPos(p.i); this.fx.sparkles(h.x, h.y, h.z, '#ffe45c', Math.min(10, 4 + p.combo * 2), 0.6); }
        }
        break;
      }
      case 'boost': audio.play('grow', { step: Math.min(12, p.taps - 1), minGap: 0.02 }); break;
      case 'cross': audio.play('cross'); break;
      case 'quest':
        ui.questDone(p);
        if (g.s.quest.i <= 4) this._questHintSoon(2200);
        break;
      case 'seed': audio.play('seedPop', p.manual ? {} : { volume: 0.6 }); break;
      case 'seedCollected': {
        const o = view.orbScreen(p.id);
        if (o) ui.flySeed(o.x, o.y, g.s.book[speciesId(p.g)] ? flowerSVG(p.g, { size: 36 }) : seedSVG(p.g, 36));
        audio.play('pick', { pitch: 1.1, volume: p.auto ? 0.4 : 0.8 });
        ui.dirty.pouch = true;
        break;
      }
      case 'bee:visit': audio.play('buzz', { volume: 0.5, minGap: 0.35 }); break;
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
      case 'water': audio.play('water'); break;
      case 'dig': audio.play('dig'); ui.dirty.pouch = true; break;
      case 'plot': audio.play('unlock'); ui.toast(`${icon('check')} New plot!`, 'good'); this._layoutSoon(); break;
      case 'upgrade': {
        audio.play('reward');
        if (p.k === 'gnome') this.world.decor.setGnome(true);
        ui.toast(`${icon('up_' + p.k, 24)} ${UPGRADES[p.k].name} → level ${p.level}`, 'good');
        ui.dirty.pouch = true;
        break;
      }
      case 'decor': {
        // close the shop and glide over to the new decoration so the player sees it pop into the garden
        audio.play('win');
        ui.toast(`${icon('star')} ${p.d.name} placed! ${p.d.text}`, 'gold', 3);
        this.world.decor.place(p.id, true);
        if (ui.panel) ui.closePanel();
        const d = this.world.decor.items[p.id];
        if (d) {
          view.focusOn(d.position.x, d.position.z, 3.2);
          setTimeout(() => { this.fx.sparkles(d.position.x, 1, d.position.z, '#fff1b0', 26, 1.3, 1.4); this.fx.dust(d.position.x, 0.1, d.position.z, 14); audio.play('unlock'); }, 650);
        }
        break;
      }
      case 'buySeed': audio.play('coin'); ui.dirty.pouch = true; break;
      case 'sellSeed': audio.play('coin'); break;
      case 'pouchFull':
        audio.play('invalid');
        ui.pouchFull();
        break;
      case 'order:new': ui.dirty.orders = true; audio.play('tutStep', { volume: 0.7 }); break;
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
        audio.play('levelUp');
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
        audio.play('levelUp');
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
      case 'gnome': this.world.decor.hop(); break;
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
    audio.play('discover', { step: Math.min(4, tiers) });
    this.ui.bookBtn.classList.add('has-dot');
    if (tiers <= 2 && !g.pattern) {
      const i = this.garden.plots.findIndex((pl) => pl.plant && speciesId(pl.plant.g) === p.id);
      if (this.garden.s.tutorial < 99 && i >= 0) {
        const h = this.view.headPos(i), q = this.view.project(h.x, h.y + 0.6, h.z);
        ui.floatText(q.x, q.y, `New: ${flowerName(g, { withMut: false })}!`, 'gold');
      } else ui.toast(`${flowerSVG(g, { size: 26 })} New species: <b>${flowerName(g, { withMut: false })}</b> · +${fmt(p.coins)}`, 'good', 2.6);
      return;
    }
    const one = {
      tutorial: this.garden.s.tutorial < 99, merge: 'discover', found: [g], coins: p.coins,
      tag: '★'.repeat(rarity(g)), kicker: 'New species!', hero: flowerSVG({ ...g, mut: 0 }, { size: 150 }),
      title: flowerName(g, { withMut: false }), desc: `Added to your Flower Book (${this.garden.discoveredCount()}/128)`,
      reward: `${icon('coin')} +${fmt(p.coins)}`,
    };
    // several discoveries waiting in the queue become one "N new species" card
    one.mergeWith = (q) => {
      const found = [...q.found, g], coins = q.coins + p.coins;
      return {
        found, coins, tag: '', kicker: `${found.length} new species!`,
        hero: `<div class="bunch" style="display:flex;flex-wrap:wrap;gap:.2em;justify-content:center;align-items:center;width:100%;height:100%">${found.slice(0, 6).map((f) => flowerSVG({ ...f, mut: 0 }, { size: found.length > 4 ? 60 : 76 })).join('')}</div>`,
        title: found.map((f) => flowerName(f, { withMut: false })).slice(0, 4).join(', ') + (found.length > 4 ? '…' : ''),
        desc: `Added to your Flower Book (${this.garden.discoveredCount()}/128)`, reward: `${icon('coin')} +${fmt(coins)}`,
      };
    };
    ui.showCard(one);
    const h = this.view.headPos(this.garden.plots.findIndex((pl) => pl.plant && speciesId(pl.plant.g) === p.id));
    if (h && isFinite(h.x)) this.fx.sparkles(h.x, h.y, h.z, '#fff4a8', 24, 0.8, 1.4);
  }

  _weather(kind, announce) {
    this.world.setWeather(kind);
    this.fx.setRain(kind === 'rain');
    this.fx.setFireflies(kind === 'night');
    this.fx.setMotes(kind === 'golden' || kind === 'rainbow');
    audio.setMusicMood(kind === 'night' ? 'menu' : 'play');
    audio.setAmbience(kind === 'clear' ? 'day' : kind);
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
  // Garden gestures: tap soil to plant, tap a growing plant to make it grow, tap a bloom to harvest it, drag from a
  // bloom onto another to cross them, drag the lawn to look around (pinch / wheel to zoom). Swipes keep planting,
  // growing, watering or collecting along the way. Seeds can also be dragged straight out of the pouch.
  _input() {
    const cv = this.stage.canvas;
    const g = this.garden, ui = this.ui, view = this.view;
    let down = null;
    const pts = new Map();           // active pointers (for pinch zoom)
    let pinch = null;
    const tut = () => g.s.tutorial < 99;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const pinchState = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    addEventListener('pointerdown', () => this._poke(), { capture: true });
    cv.addEventListener('pointerdown', (e) => {
      if (ui.busy || e.button > 0) return;          // right / middle clicks do nothing
      const p = pos(e);
      cv.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, p);
      if (pts.size === 2) {
        if (down?.mode === 'pollen') this._dropPollen(down, null);
        if (tut()) return;
        pinch = pinchState(); if (down) down.mode = 'pinch';
        return;
      }
      if (pts.size > 2) return;
      down = { x: p.x, y: p.y, lx: p.x, ly: p.y, moved: false, mode: null, done: new Set(), t: performance.now() };
      // taps on empty lawn start a pan; anything else is a garden action (and swipes continue it)
      if (!this._tapAt(p.x, p.y, down) && !down.mode && !tut()) down.mode = 'pan';
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pinch && pts.size === 2) {
        const n = pinchState();
        if (n.d > 10 && pinch.d > 10) view.zoomAt(n.d / pinch.d, n.x, n.y);
        view.panBy(n.x - pinch.x, n.y - pinch.y);
        pinch = n;
        return;
      }
      if (!down) {
        // hover is resolved once per frame in _frame (pointermove can fire far more often than we draw)
        if (e.pointerType === 'mouse' && !ui.busy) this._hover = this._mouse = p;
        else { this._hover = this._mouse = null; ui.hoverInfo(0, 0, null); }
        return;
      }
      if (Math.hypot(p.x - down.x, p.y - down.y) > (e.pointerType === 'mouse' ? 6 : 10)) down.moved = true;
      if (down.mode === 'buy' && down.moved) down.mode = 'pan';
      if (down.mode === 'bloom' && down.moved) this._pickPollen(down, p);
      if (down.mode === 'pollen') { this._carryPollen(p); return; }
      if (down.mode === 'pan') {
        if (down.moved) { view.panBy(p.x - down.lx, p.y - down.ly); cv.style.cursor = 'grabbing'; }
        down.lx = p.x; down.ly = p.y;
        return;
      }
      if (down.mode && down.mode !== 'pinch') this._swipeAt(p.x, p.y, down);
    });
    const end = (e) => {
      if (down && pts.size === 1 && pts.has(e.pointerId)) {
        const p = pos(e), up = e.type === 'pointerup';
        if (down.mode === 'buy' && !down.moved && up) {
          const i = view.pickPlot(p.x, p.y);
          if (i === down.buy) this._buyPlot(i, ui.plotTags.get(i));
        } else if (down.mode === 'bloom' && up) this._harvestTap(down.i);
        else if (down.mode === 'pollen') this._dropPollen(down, up ? p : null);
      }
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) { down = null; if (cv.style.cursor === 'grabbing') cv.style.cursor = 'grab'; }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => { if (!ui.busy && !tut()) { const p = pos(e); view.zoomAt(Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0022), p.x, p.y); } }, { passive: true });
    cv.addEventListener('pointerleave', () => { this._hover = this._mouse = null; view.hoverPlot = -1; ui.hoverInfo(0, 0, null); });
    // keyboard shortcuts (desktop)
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'Escape') { if (ui.panel) ui.closePanel(); else if (ui.cardOpen) ui._closeCard(); else { ui.selectSeed(-1); ui.setTool(''); } return; }
      if (ui.busy) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && g.s.pouch[n - 1]) ui.selectSeed(ui.sel === n - 1 ? -1 : n - 1);
      else if (tut()) return;
      else if (e.code === 'KeyW') ui.setTool(ui.tool === 'water' ? '' : 'water');
      else if (e.code === 'KeyD') ui.setTool(ui.tool === 'dig' ? '' : 'dig');
      else if (e.code === 'KeyB') ui.openBook();
      else if (e.code === 'KeyS') ui.openShop();
      else if (e.code === 'KeyH' || e.key === 'Home') view.recenter();
    });
    this._tutGate();
    this._pouchDrag();
  }

  // any input: hints go away, idle help starts counting again
  _poke() { this._lastInput = this.time || 0; if (this.hint) { this.hint = null; this.ui.tutFrame(null); } }

  _tapAt(x, y, down) {
    const g = this.garden, ui = this.ui, view = this.view;
    const tk = this._tutKey();
    // a golden bee beats everything else under the finger
    const gb = view.golden;
    if (gb.on && !gb.caught) {
      const q = gb.screen(this.stage);
      if (Math.hypot(q.x - x, q.y - y) < Math.max(52, this.stage.cam.ppu * 0.75)) { this._catchGolden(); down.mode = 'none'; return true; }
    }
    const seedId = view.pickSeed(x, y);
    if (seedId != null) { g.collectSeed(seedId); down.mode = 'collect'; return true; }
    const i = ui.sel >= 0 && !ui.tool ? view.pickPlant(x, y) : view.pickPlot(x, y);
    if (i < 0) return false;
    const plot = g.plots[i], pl = plot.plant;
    // plots are bought on a clean tap (released without dragging), so looking around never spends coins
    if (!plot.owned) { if (g.canBuyPlot(i) && !tk) { down.mode = 'buy'; down.buy = i; return true; } return false; }
    if (ui.tool === 'water') {
      if (pl && pl.stage === 'grow') { if (!g.water(i)) { audio.play('invalid'); ui.toast('The watering can is empty — it refills by itself', 'warn'); } }
      else audio.play('invalid');
      down.mode = 'water'; down.done.add(i);
      return true;
    }
    if (ui.tool === 'dig') {
      if (pl) g.dig(i); else audio.play('invalid');
      return true;
    }
    // blooms wait for the release: a tap harvests, a drag carries pollen to another bloom
    if (pl && pl.stage === 'bloom') { down.mode = 'bloom'; down.i = i; return true; }
    if (!pl) {
      if (tk && !tk.startsWith('plant')) { this._tutWrong(); return true; }
      if (ui.sel >= 0) { this._plantAt(i); down.mode = tk ? 'none' : 'plant'; down.done.add(i); }
      else if (g.s.pouch.length) { audio.play('invalid'); if (tk) this._tutWrong(); else ui.toast(`${icon('seed')} Pick a seed from your pouch first`, ''); ui.pouchEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 350 }); }
      else ui.toast(`${icon('basket')} No seeds — buy some in the shop!`, '');
      return true;
    }
    // a growing plant: every tap makes it grow (swipe across several to grow them all)
    g.boost(i);
    down.mode = 'boost'; down.done.add(i);
    return true;
  }

  _harvestTap(i) {
    const g = this.garden;
    if (!g.isBloom(i)) return;
    const tk = this._tutKey();
    if (tk && tk !== 'harvest') { this._tutWrong(tk === 'cross' ? 'Hold and <b>drag</b> to the other flower!' : null); return; }
    g.harvest(i);
  }

  // pollen: picked up by dragging away from a bloom, carried to another bloom, dropped to cross them
  _pickPollen(down, p) {
    const g = this.garden, i = down.i;
    down.mode = 'none';
    if (!g.isBloom(i)) return;
    const tk = this._tutKey();
    if (tk && tk !== 'cross') { this._tutWrong(); return; }
    if (g.resting(i) > 0) { this.view.pv[i].rest = 1; this._restingHint(); return; }
    down.mode = 'pollen';
    this.view.drag = { from: i, x: p.x, y: p.y, over: -1, ok: false };
    this.view.pv[i].tap = 0.6;
    const h = this.view.headPos(i);
    this.fx.pollen(h.x, h.y + 0.1, h.z, 6);
    audio.play('pollen');
  }
  _carryPollen(p) {
    const d = this.view.drag;
    if (!d) return;
    d.x = p.x; d.y = p.y;
    const j = this.view.pickPlot(p.x, p.y);
    const over = j >= 0 && j !== d.from && this.garden.isBloom(j) ? j : -1;
    if (over !== d.over) {
      d.over = over;
      d.ok = over >= 0 && this.garden.canCross(d.from, over);
      if (d.ok) audio.play('toggle', { pitch: 1.35, volume: 0.45 });
    }
  }
  _dropPollen(down, p) {
    const d = this.view.drag;
    this.view.drag = null;
    if (down) down.mode = 'none';
    if (!d || !p) return;                    // cancelled (a second finger, pointercancel)
    const g = this.garden;
    if (d.ok && d.over >= 0 && g.canCross(d.from, d.over)) { g.cross(d.from, d.over); return; }
    // barely moved and let go on the same flower: that was a tap
    if (this.view.pickPlot(p.x, p.y) === d.from && Math.hypot(p.x - down.x, p.y - down.y) < 28) { this._harvestTap(d.from); return; }
    audio.play('invalid', { volume: 0.5 });
    const w = this.stage.unproject(p.x, p.y, 0.8);
    this.fx.pollen(w.x, 0.8, w.z, 6);
    if (d.over >= 0 && g.resting(d.over) > 0) { this.view.pv[d.over].rest = 1; this._restingHint(); }
    else if (this._tutKey()) this._tutSay('Let go <b>on the blue flower</b>!');
    else if (!this._dropHintT || this.time - this._dropHintT > 20) { this._dropHintT = this.time; this.ui.toast(`${icon('bee')} Drop the pollen on another bloom to cross them`, ''); }
  }
  _restingHint() {
    audio.play('invalid', { volume: 0.4 });
    if (this._restHintT && this.time - this._restHintT < 15) return;
    this._restHintT = this.time;
    this.ui.toast(`${icon('bee')} Crossed flowers rest for a few seconds`, '');
  }

  // one-line description of a plot for the desktop hover tooltip
  _plotInfo(i) {
    const g = this.garden;
    if (i < 0) return null;
    const plot = g.plots[i], pl = plot.plant;
    if (!plot.owned) return g.canBuyPlot(i) && g.s.tutorial >= 99 ? `${icon('coin', 16)} New plot · ${fmt(g.nextPlotCost())} coins` : null;
    if (!pl) return this.ui.sel >= 0 ? `${icon('seed', 16)} Plant here` : null;
    const known = !!g.s.book[speciesId(pl.g)];
    const name = known || pl.stage === 'bloom' ? flowerName(pl.g) : 'Mystery hybrid';
    if (pl.stage === 'bloom') {
      const rest = g.resting(i);
      return `${flowerSVG(pl.g, { size: 20 })} <b>${name}</b> · ${icon('coin', 16)}${fmt(g.sellValue(pl.g))} · ${rest > 0 ? `resting ${Math.ceil(rest)}s` : 'drag to cross'}`;
    }
    return `${known ? flowerSVG(pl.g, { size: 20 }) : seedSVG(pl.g, 20)} ${name} · blooms in ${Math.ceil((pl.dur - pl.t) / g.speedNow())}s · tap to grow`;
  }

  _swipeAt(x, y, down) {
    const g = this.garden, view = this.view;
    if (down.mode === 'collect') { const seedId = view.pickSeed(x, y); if (seedId != null) g.collectSeed(seedId); return; }
    const i = down.mode === 'plant' ? view.pickPlant(x, y) : view.pickPlot(x, y);
    if (i < 0 || down.done.has(i)) return;
    const pl = g.plots[i].plant;
    if (down.mode === 'plant') { if (g.plots[i].owned && !pl && this.ui.sel >= 0) { down.done.add(i); this._plantAt(i); } }
    else if (down.mode === 'water') { if (pl?.stage === 'grow' && g.s.can.charges > 0) { down.done.add(i); g.water(i); } }
    else if (down.mode === 'boost') { if (pl?.stage === 'grow') { down.done.add(i); g.boost(i); } }
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

  // drag a seed straight out of the pouch onto the soil (tapping the seed, then the soil, works too)
  // The pouch scrolls sideways under the finger (handled here, so a diagonal drag toward the garden is never
  // mistaken for a scroll by the browser); moving up out of it picks the seed up.
  _pouchDrag() {
    const ui = this.ui, list = ui.pouchList, cv = this.stage.canvas;
    list.style.touchAction = 'none';
    let pd = null;
    const cpos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    list.addEventListener('pointerdown', (e) => {
      if (ui.busy || e.button > 0) return;
      const chip = e.target.closest?.('.seedchip');
      pd = { id: e.pointerId, chip, idx: chip ? [...list.querySelectorAll('.seedchip')].indexOf(chip) : -1, x: e.clientX, y: e.clientY, on: false, scroll: false, sl: list.scrollLeft, ghost: null };
    });
    addEventListener('pointermove', (e) => {
      if (!pd || e.pointerId !== pd.id) return;
      const dx = e.clientX - pd.x, dy = e.clientY - pd.y;
      if (pd.scroll) { list.scrollLeft = pd.sl - dx; return; }
      if (!pd.on) {
        if (pd.chip && dy < -8 && -dy > Math.abs(dx) * 0.45 && this.garden.s.pouch[pd.idx]) {
          pd.on = true;
          pd.chip.dispatchEvent(new PointerEvent('pointerleave'));       // cancels the chip's long-press
          if (ui.sel !== pd.idx) ui.selectSeed(pd.idx);
          const img = pd.chip.querySelector('img');
          pd.ghost = ui.dragGhost(img ? img.outerHTML : '');
          pd.chip.classList.add('dragging');
        } else if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          pd.scroll = true; pd.chip?.dispatchEvent(new PointerEvent('pointerleave'));
          list.style.scrollBehavior = 'auto';
          this._noClickUntil = performance.now() + 10000;
          return;
        } else return;
      }
      pd.ghost.style.transform = `translate(${e.clientX - 24}px, ${e.clientY - 44}px)`;
      const p = cpos(e), i = this.view.pickPlant(p.x, p.y), g = this.garden;
      this.view.hoverPlot = i >= 0 && g.plots[i].owned && !g.plots[i].plant ? i : -1;
    });
    const up = (e) => {
      if (!pd || e.pointerId !== pd.id) return;
      const d = pd;
      pd = null;
      if (d.scroll) { list.style.scrollBehavior = ''; this._noClickUntil = performance.now() + 250; return; }
      if (!d.on) return;
      d.ghost?.remove(); d.chip.classList.remove('dragging');
      this._noClickUntil = performance.now() + 350;
      this.view.hoverPlot = -1;
      if (e.type !== 'pointerup' || ui.busy) return;
      const p = cpos(e), i = this.view.pickPlant(p.x, p.y), g = this.garden;
      if (i >= 0 && g.plots[i].owned && !g.plots[i].plant) {
        const tk = this._tutKey();
        if (tk && !tk.startsWith('plant')) { this._tutWrong(); return; }
        this._plantAt(i);
      } else if (i >= 0 && g.plots[i].owned) { audio.play('invalid'); ui.toast('That spot is taken — drop the seed on empty soil', ''); }
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    list.addEventListener('click', (e) => { if (performance.now() < (this._noClickUntil || 0)) { e.stopPropagation(); e.preventDefault(); } }, { capture: true });
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
  // A spotlight walks a new player through one small action at a time (see TUT at the bottom): plant, tap to grow,
  // cross two blooms by hand, collect the seed, grow a brand-new species, harvest a combo. Everything outside the
  // spotlight waits, wrong taps get a friendly nudge, and every step has a way forward so nobody gets stuck.
  _tutStep() { const s = this.garden.s; return s.tutorial < 99 ? TUT[s.tutorial] || null : null; }
  _tutKey() { return this._tutStep()?.key || null; }
  _tutorial() {
    const s = this.garden.s;
    this.ui.holdCards(s.tutorial < 99);
    if (s.tutorial >= 99) { this.ui.tutFrame(null); this.garden.tutorialSpeed = 1; return; }
    const step = TUT[s.tutorial];
    if (!step) { if (!this._finishing) { this._finishing = true; this.ui.tutFrame(null); setTimeout(() => this._finishTutorial(), 900); } return; }
    this.tutT = 0; this.tutN = 0; this._tutSayT = 0;
    this.garden.tutBees = false;
  }
  _tutNext() {
    this.garden.s.tutorial++;
    audio.play('tutStep');
    this._tutorial();
    saveSoon(this.garden.s);
  }
  _tutorialEvent(name, p) {
    const step = this._tutStep();
    if (step?.done && step.done(this, name, p)) this._tutNext();
  }
  _tutorialTick(dt = 0.05) {
    const step = this._tutStep();
    if (!step) { this._hintTick(); return; }
    this.tutT += dt;
    if (step.check?.(this)) { this._tutNext(); return; }
    step.keep?.(this);
    const text = this._tutSayT > this.time ? this._tutSayTxt : typeof step.text === 'function' ? step.text(this) : step.text;
    if (!text) { this.ui.tutFrame(null); return; }
    const sp = step.spec?.(this) || { hand: null, holes: [] };
    this.ui.tutFrame({ key: step.key, text, dim: true, skip: true, ...sp });
  }
  // a wrong move while the tutorial waits for something specific
  _tutWrong(msg) {
    audio.play('invalid', { volume: 0.45 });
    this.ui.tutNudge();
    if (msg) this._tutSay(msg);
  }
  _tutSay(html, secs = 2.6) { this._tutSayTxt = html; this._tutSayT = this.time + secs; }
  // block everything outside the current step's spotlight (buttons, panels, the camera) until the step is done
  _tutGate() {
    const block = (e) => {
      const step = this._tutStep();
      if (!step || this.ui.cardOpen || this.ui.panel) return;
      const t = e.target;
      if (t.closest?.('.tut-bubble, .modal-layer')) return;
      const gate = step.gate || [];
      if (t === this.stage.canvas && gate.includes('garden')) return;
      if (t.closest?.('.pouch') && gate.includes('pouch')) return;
      e.stopPropagation(); e.preventDefault();
      if (e.type === 'pointerdown') this._tutWrong();
    };
    for (const type of ['pointerdown', 'click']) addEventListener(type, block, { capture: true });
  }
  _finishTutorial(skipped = false) {
    const g = this.garden, s = g.s;
    if (s.tutorial >= 99) return;
    s.tutorial = 99;
    this._finishing = false;
    g.tutorialSpeed = 1; g.tutBees = false; g.forceChild = null;
    this.ui.tutFrame(null);
    s.weather.until = s.t + 90;
    g.earn(60);
    g.startQuests();
    this.goldenT = 45;
    // new gardeners start their daily streak tomorrow (no gift card on top of everything else today)
    if (!s.daily.last) s.daily.last = todayStr();
    this.ui.showCard({
      now: true, kicker: skipped ? 'Welcome, gardener!' : 'You did it!', hero: visitorSVG('queen', '#ffc928', 120),
      title: 'You\'re a natural gardener!',
      list: [
        `${icon('bee', 18)} Drag pollen between blooms to breed new flowers`,
        `${icon('book', 18)} Discover all <b>128 species</b>`,
        `${icon('basket', 18)} Harvest fast for <b>combo</b> coins`,
        `${icon('gift', 18)} Finish quests for rewards`,
      ],
      reward: `${icon('coin')} +60`,
      buttons: [{ label: 'Let\'s grow!', act: () => this._questHintSoon(700) }],
    });
    this.ui.holdCards(false);
    g.addXp(0);
    this.ui.dirty.pouch = this.ui.dirty.orders = true;
    saveSoon(s);
    this._layoutSoon();
  }
  // where the tutorial wants things: red in the middle, blue beside it, the hybrid next to both (front row first)
  _plantedIdx(c1) { return this.garden.plots.findIndex((p) => p.plant && p.plant.g.c1 === c1); }
  _tutPlot(kind) {
    const g = this.garden, empty = (j) => g.plots[j].owned && !g.plots[j].plant;
    const center = g.byKey.get('0,0');
    const any = () => g.plots.findIndex((p, j) => empty(j));
    if (kind === 'red') return empty(center) ? center : any();
    const red = this._plantedIdx(C.RED), base = red >= 0 ? red : center;
    if (kind === 'blue') {
      const nb = g.nb[base].filter(empty).sort((a, b) => (g.pos[b].x + 0.3 * g.pos[b].z) - (g.pos[a].x + 0.3 * g.pos[a].z));
      return nb.length ? nb[0] : any();
    }
    const blue = this._plantedIdx(C.BLUE);
    const both = g.nb[base].filter((j) => empty(j) && blue >= 0 && g.nb[blue].includes(j)).sort((a, b) => g.pos[b].z - g.pos[a].z);
    return both.length ? both[0] : any();
  }
  // tutorial seeds can't run out: if one went missing, it's back in the pouch
  _tutSeed(c1) {
    const g = this.garden;
    if (this._plantedIdx(c1) < 0 && !g.s.pouch.some((e) => e.g.c1 === c1)) { g.addSeed(makeFlower(c1, S.BLOSSOM)); this.ui.dirty.pouch = true; }
  }
  // spotlight specs (screen pixels)
  _scr(i, y) { const w = this.garden.pos[i]; return this.view.project(w.x, y, w.z); }
  _chipSpot(k = 0) {
    const c = this.ui.pouchList.querySelectorAll('.seedchip')[k];
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width * 0.7 } : null;
  }
  _soilSpot(i) { const p = this._scr(i, SOIL_Y); return { x: p.x, y: p.y, r: Math.max(34, this.stage.cam.ppu * 0.78) }; }
  _headSpot(i) { const h = this.view.headPos(i), p = this.view.project(h.x, h.y, h.z); return { x: p.x, y: p.y, r: Math.max(32, this.stage.cam.ppu * 0.55) }; }
  _plantSpec(i, k = 0) {
    if (i < 0) return null;
    const chip = this._chipSpot(k), soil = this._soilSpot(i);
    const e = this.garden.s.pouch[k];
    if (this.ui.sel < 0 && chip && e) {
      const ghost = this.garden.s.book[speciesId(e.g)] ? flowerSVG(e.g, { size: 44 }) : seedSVG(e.g, 44);
      return { hand: { drag: { x0: chip.x, y0: chip.y, x1: soil.x, y1: soil.y }, ghost }, holes: [chip, soil] };
    }
    return { hand: { tap: soil }, holes: chip ? [soil, chip] : [soil] };
  }
  _growSpec(i) {
    if (i < 0) return null;
    const pv = this.view.pv[i];
    const p = this._scr(i, SOIL_Y + pv.stem * 0.55 + 0.12);
    return { hand: { tap: p }, holes: [{ x: p.x, y: p.y - 4, r: Math.max(40, this.stage.cam.ppu * 0.8) }] };
  }
  _crossSpec(a, b) {
    if (a < 0 || b < 0) return null;
    const A = this._headSpot(a), B = this._headSpot(b);
    return { hand: { drag: { x0: A.x, y0: A.y, x1: B.x, y1: B.y }, ghost: '<div class="pollen-ball"></div>' }, holes: [A, B] };
  }
  _orbSpec() {
    const id = [...this.view.orbs.keys()].find((k) => !this.view.orbs.get(k).leaving);
    if (id == null) return null;
    const p = this.view.orbScreen(id);
    return { hand: { tap: p }, holes: [{ x: p.x, y: p.y, r: 38 }] };
  }
  _bloomsSpec() {
    const blooms = this.garden.plots.map((p, i) => i).filter((i) => this.garden.isBloom(i));
    if (!blooms.length) return null;
    const k = Math.floor((this.time || 0) * 1.6) % blooms.length;
    return { hand: { tap: this._headSpot(blooms[k]) }, holes: blooms.map((i) => this._headSpot(i)) };
  }

  // ------------------------------------------------------------------------------------------ quest hints
  // Tapping the quest chip (or standing still for a while as a new player) shows where to do the current quest.
  _questHintSoon(ms) { clearTimeout(this._qhT); this._qhT = setTimeout(() => this._questHint(), ms); }
  _questHint(tries = 0) {
    const q = this.garden.currentQuest();
    if (!q) return;
    if (this.ui.busy) { if (tries < 20) this._qhT = setTimeout(() => this._questHint(tries + 1), 700); return; }
    this._hintN = (this._hintN || 0) + 1;
    this.hint = { key: `hint${this._hintN}`, kind: q.hint, until: (this.time || 0) + 5 };
    this._lastHint = this.time || 0;
  }
  _hintTick() {
    const g = this.garden;
    if (this.hint && (this.time > this.hint.until || this.ui.busy)) { this.hint = null; this.ui.tutFrame(null); }
    // new gardeners who stand still for a while get shown what to do next
    if (!this.hint && g.s.level <= 5 && !this.ui.busy && !this.view.drag && this.time - (this._lastInput || 0) > 12 && this.time - (this._lastHint || 0) > 30) this._questHint();
    if (!this.hint) return;
    const h = this._hintSpec(this.hint.kind);
    if (!h) { this.hint = null; this.ui.tutFrame(null); return; }
    this.ui.tutFrame({ key: this.hint.key, text: h.text, soft: true, hand: h.hand || null, holes: [] });
  }
  _hintSpec(kind) {
    const g = this.garden, ui = this.ui;
    const at = (el) => { const r = el?.getBoundingClientRect(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
    const emptyPlot = () => g.plots.findIndex((p) => p.owned && !p.plant);
    const growing = () => g.plots.findIndex((p) => p.plant && p.plant.stage === 'grow');
    const pair = () => {
      const bl = g.plots.map((p, i) => i).filter((i) => g.isBloom(i) && g.resting(i) <= 0);
      for (const a of bl) for (const b of bl) if (a !== b && g.nb[a].includes(b)) return [a, b];
      return bl.length >= 2 ? [bl[0], bl[1]] : null;
    };
    const plant = () => {
      const i = emptyPlot();
      if (!g.s.pouch.length) return { text: 'Buy seeds in the <b>shop</b>', hand: { tap: at(ui.shopBtn) } };
      if (i < 0) return { text: 'Buy more land for new flowers', hand: null };
      const sp = this._plantSpec(i);
      return { text: 'Drag a seed onto empty soil', hand: sp?.hand };
    };
    const grow = () => { const i = growing(); return i >= 0 ? { text: 'Tap growing flowers to make them <b>bloom</b>', hand: this._growSpec(i).hand } : plant(); };
    switch (kind) {
      case 'plot': {
        const cost = g.nextPlotCost();
        if (g.s.coins < cost) return { text: `Harvest flowers to earn ${fmt(cost)} coins for new land`, hand: this._bloomsSpec()?.hand || null };
        let best = null;
        for (const [i, tag] of ui.plotTags) { if (g.canBuyPlot(i) && tag.isConnected) { const p = at(tag); if (p && (!best || Math.abs(p.x - innerWidth / 2) < Math.abs(best.x - innerWidth / 2))) best = p; } }
        return { text: 'Tap a <b>price tag</b> to buy new land', hand: best ? { tap: best } : null };
      }
      case 'plant': return plant();
      case 'grow': return grow();
      case 'cross': { const pr = pair(); return pr ? { text: 'Drag from one bloom onto another to <b>cross</b> them', hand: this._crossSpec(pr[0], pr[1]).hand } : grow(); }
      case 'harvest': { const b = this._bloomsSpec(); return b ? { text: 'Tap blooms quickly one after another', hand: b.hand } : grow(); }
      case 'order': { const o = ui.ordersEl.querySelector('.order'); return { text: 'Grow the flower a visitor asks for, then harvest it', hand: o ? { tap: at(o) } : null }; }
      case 'water': return g.has('can') ? { text: 'Tap the <b>watering can</b>, then a growing flower', hand: { tap: at(ui.canBtn) } } : grow();
      case 'shop': return { text: 'Open the <b>shop</b>', hand: { tap: at(ui.shopBtn) } };
      case 'golden': return { text: 'Golden bees visit now and then — tap one!', hand: null };
      default: return null;
    }
  }

  // ------------------------------------------------------------------------------------------ golden bee
  _goldenTick(dt) {
    const g = this.garden, gb = this.view.golden;
    if (g.s.tutorial < 99) return;
    if (gb.on) { if (gb.done) gb.stop(); return; }
    if (this.ui.busy) return;
    this.goldenT = (this.goldenT ?? 60) - dt;
    if (this.goldenT > 0) return;
    this.goldenT = 75 + Math.random() * 75;
    // it spends most of its flight over the middle of the clear play area (never behind the HUD, where it can't be tapped)
    const st = this.stage, sa = this.view.safe, cx = st.cam.x;
    const mid = st.unproject((sa.left + st.vw - sa.right) / 2, (sa.top + st.vh - sa.bottom) / 2, 1.7);
    const span = st.vw / st.cam.ppu / 2 + 1.2, left = Math.random() < 0.5;
    const z0 = mid.z - 1.5 + Math.random() * 2, z1 = mid.z - 1.5 + Math.random() * 2;
    mid.x += (Math.random() - 0.5) * 1.5; mid.z += (Math.random() - 0.5) * 0.8;
    gb.start({ x: cx + (left ? -span : span), z: z0 }, { x: cx + (left ? span : -span), z: z1 }, 11, mid);
    audio.play('golden');
    if ((g.s.stats.goldenSeen || 0) < 2) { g.s.stats.goldenSeen = (g.s.stats.goldenSeen || 0) + 1; this.ui.toast(`${icon('bee')} A <b>golden bee</b>! Tap it quickly!`, 'gold', 3); }
  }
  // a golden bee under the finger (client coordinates) is caught even where a world label sits on top of it
  _goldenAt(cx, cy) {
    const gb = this.view.golden;
    if (!gb.on || gb.caught) return false;
    const r = this.stage.canvas.getBoundingClientRect(), q = gb.screen(this.stage);
    if (Math.hypot(q.x - (cx - r.left), q.y - (cy - r.top)) >= Math.max(52, this.stage.cam.ppu * 0.75)) return false;
    this._poke(); this._catchGolden();
    return true;
  }
  _catchGolden() {
    const gb = this.view.golden, p = gb.screen(this.stage);
    gb.catch();
    const coins = this.garden.catchGolden();
    this.ui.floatText(p.x, p.y - 24, `+${fmt(coins)}`, 'gold big');
    this.ui.flyCoins(p.x, p.y, coins * 4);
    audio.play('goldenCatch');
    this.stage.cam.shake = 0.25;
    if (!this._goldenHappy) { this._goldenHappy = true; sdk.happytime(); }
  }

  // ------------------------------------------------------------------------------------------ quality
  _setQuality(name) {
    const qn = name === 'auto' ? detectQuality(sdk.cg?.user?.systemInfo) : name;
    if (!QUALITY[qn] || qn === this.qName) return;
    this.qName = qn;
    this.stage.setQuality(qn);
  }
  _applyQuality(q) {
    this.qName = q.name;
    this.fx.setQuality(q);
    this.world.weather.q = q;
  }

  _warmup() {
    // paint every species already in the garden and the common particle sprites up front
    const p = { x: 0, y: -40, z: 0 };
    this.fx.petals(p.x, p.y, p.z, ['#ffffff'], 1);
    this.fx.sparkles(p.x, p.y, p.z, '#fff6c2', 1);
  }

  // ------------------------------------------------------------------------------------------ loop
  _loop() {
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const raw = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    if (this.frozen) return;
    this.stage.govern(raw, !document.hidden && this.settings.quality === 'auto' && !params.has('quality'));
    this._frame(Math.min(raw, 1 / 20));
  }

  _hoverTick() {
    // re-check the spot under a resting mouse now and then (plants grow, bloom and get harvested under it)
    if (!this._hover && this._mouse && this.time - (this._hoverT || 0) > 0.3) this._hover = this._mouse;
    const p = this._hover;
    if (!p) return;
    this._hover = null;
    this._hoverT = this.time;
    const g = this.garden, ui = this.ui, view = this.view, cv = this.stage.canvas;
    if (ui.busy || view.drag) { ui.hoverInfo(0, 0, null); return; }
    const i = view.pickPlot(p.x, p.y);
    view.hoverPlot = i;
    const seedId = view.pickSeed(p.x, p.y), seedHit = seedId != null;
    const cur = seedHit || (i >= 0 && (g.plots[i].owned || g.canBuyPlot(i))) ? 'pointer' : 'grab';
    if (this._cursor !== cur) { this._cursor = cur; cv.style.cursor = cur; }
    const fits = !seedHit || g.canAccept(g.s.seeds.find((s) => s.id === seedId)?.g ?? {});
    const clicking = this.time - (this._lastInput ?? -9) < 0.6;         // no tooltip churn while tapping away
    ui.hoverInfo(p.x, p.y, g.s.tutorial < 99 || clicking ? null : seedHit ? (fits ? `${icon('seed', 18)} New seed — click to collect` : `${icon('up_pouch', 18)} Pouch full — plant or sell seeds first`) : this._plotInfo(i));
  }

  _frame(dt) {
    this.time = (this.time || 0) + dt;
    const g = this.garden;
    this._hoverTick();
    g.tick(dt);
    this.view.update(dt, this.time);
    this.world.update(dt, this.time);
    this.fx.update(dt, this.view.cam);
    this.stage.updateCamera(dt);
    tickBanks(this.frozen ? 50 : this.stage.zooming ? 0 : 5);        // repaint sprites once a zoom settles
    this.stage.warm(this.frozen ? 0 : 2.5, this.time);                 // paint stand-ins for scenery not seen yet
    this.stage.render(this.time);
    this._goldenTick(dt);
    this.ui.update(dt);
    this._tutorialTick(dt);
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
      unfreeze: () => { this.frozen = false; this.last = performance.now(); },
      step: (ms = 16.7) => { const n = Math.max(1, Math.round(ms / (1000 / 60))); for (let i = 0; i < n; i++) this._frame(1 / 60); },
      // fast-forward the simulation (no rendering in between), then draw one frame
      sim: (seconds = 5) => {
        const n = Math.round(seconds / 0.05);
        for (let i = 0; i < n; i++) {
          this.garden.tick(0.05); this.view.update(0.05, (this.time += 0.05)); this.world.update(0.05, this.time);
          this.fx.update(0.05, this.view.cam); this.stage.updateCamera(0.05); this._tutorialTick();
        }
        this._frame(1 / 60);
      },
      grant: (c1, shape, pattern = 0, mut = 0, n = 1) => { this.garden.addSeed(makeFlower(c1, shape, pattern, null, mut), n); this.ui.dirty.pouch = true; },
      golden: () => { this.goldenT = 0; },
      cross: (a, b) => this.garden.cross(a, b),
    };
  }
}

// ------------------------------------------------------------------------------------------ tutorial steps
// Each step: text (or text(G)), spec(G) → { hand, holes } for the spotlight, gate = what may be touched, and a
// completion test: done(G, event, payload) or a polled check(G). keep(G) runs every frame (safety nets).
const planted = (G, n) => n === 'plant';
const TUT = [
  {
    key: 'plant1', gate: ['garden', 'pouch'],
    text: (G) => (G.ui.sel < 0 ? 'Drag the <b>seed</b> into the soil!' : 'Now tap the <b>soil</b> to plant it!'),
    spec: (G) => G._plantSpec(G._tutPlot('red')), keep: (G) => G._tutSeed(C.RED), done: planted,
  },
  {
    key: 'grow1', gate: ['garden'],
    text: (G) => (G.garden.plots[G._plantedIdx(C.RED)]?.plant?.taps ? 'Keep tapping!' : 'Tap the sprout to make it <b>grow</b>!'),
    spec: (G) => G._growSpec(G._plantedIdx(C.RED)), done: (G, n) => n === 'bloom',
  },
  {
    key: 'plant2', gate: ['garden', 'pouch'],
    text: (G) => (G.ui.sel < 0 ? 'Now plant the <b>blue</b> seed next to it!' : 'Tap the <b>soil</b> to plant it!'),
    spec: (G) => G._plantSpec(G._tutPlot('blue')), keep: (G) => G._tutSeed(C.BLUE), done: planted,
  },
  {
    key: 'grow2', gate: ['garden'], text: 'Tap, tap, tap!',
    spec: (G) => G._growSpec(G._plantedIdx(C.BLUE)), done: (G, n) => n === 'bloom',
  },
  {
    key: 'cross', gate: ['garden'],
    text: 'Drag from the <b>red</b> flower to the <b>blue</b> one to mix them!',
    spec: (G) => G._crossSpec(G._plantedIdx(C.RED), G._plantedIdx(C.BLUE)),
    // still stuck after a while? a bee shows how it's done
    keep: (G) => { if (G.tutT > 25) G.garden.tutBees = true; },
    done: (G, n) => n === 'cross' || n === 'seed',
  },
  {
    key: 'collect', gate: ['garden'], text: 'A new seed! <b>Tap</b> it to collect it.',
    spec: (G) => G._orbSpec(), done: (G, n) => n === 'seedCollected',
    check: (G) => !G.garden.s.seeds.length && G.garden.s.pouch.some((e) => e.g.c1 === C.PURPLE),
  },
  {
    key: 'plant3', gate: ['garden', 'pouch'],
    text: (G) => (G.ui.sel < 0 ? 'Plant your <b>mystery seed</b>!' : 'Tap the <b>soil</b> to plant it!'),
    spec: (G) => G._plantSpec(G._tutPlot('hybrid'), Math.max(0, G.garden.s.pouch.findIndex((e) => e.g.c1 === C.PURPLE))),
    keep: (G) => G._tutSeed(C.PURPLE), done: (G, n, p) => n === 'plant' && p.g.c1 === C.PURPLE,
  },
  {
    key: 'grow3', gate: ['garden'], text: 'Tap it to see what grows!',
    spec: (G) => G._growSpec(G._plantedIdx(C.PURPLE)), done: (G, n, p) => n === 'discover' && p.g.c1 === C.PURPLE,
  },
  // the discovery card is up: wait for the player to close it
  { key: 'reveal', gate: [], text: null, check: (G) => G.tutT > 0.4 && !G.ui.cardOpen && !G.ui.cards.some((c) => c.tutorial) },
  {
    key: 'harvest', gate: ['garden'], text: 'Tap all your flowers <b>fast</b> to harvest them!',
    spec: (G) => G._bloomsSpec(), done: (G, n, p) => n === 'harvest' && !p.auto && ++G.tutN >= 3,
    check: (G) => G.tutT > 2 && !G.garden.plots.some((p, i) => G.garden.isBloom(i)) && G.tutN > 0,
  },
];

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot-error');
  if (el) { el.textContent = 'Something went wrong while loading: ' + e.message; el.style.display = 'block'; }
});
addEventListener('pagehide', () => flush());
addEventListener('beforeunload', () => flush());
