# Buzz & Bloom — design notes

A relaxing single-player garden game for CrazyGames. Plant flowers on a honeycomb of soil plots, let your bees
cross-pollinate neighbours into hybrid seeds, discover every species for the Flower Book, harvest blooms for
coins, and fill cute visitors' orders. No timers that punish, no fail state, and the garden keeps growing while
you're away.

## Why this game
- Cozy garden games are the biggest trend with CrazyGames' young audience (Roblox *Grow a Garden* hit 21M+ CCU in
  2025) but a single-player cozy garden is under-served there, unlike hexa/block/screw/jam puzzles (saturated).
- Idle + discovery games rate highest among relaxing releases (Evo Fish 8.9, Tiny Fishing, Little Alchemy).
- CrazyGames' Basic → Full Launch gate is playtime (10+ min), day-1 retention (10-15 %) and conversion to
  gameplay (80 %+). Offline growth, a collection book and orders are the strongest hooks for all three.

## Core loop (first 60 seconds)
Every tap does something; nothing asks the player to wait.
1. Land directly in the garden (no title screen). A spotlight tutorial shows one action at a time with a pointing
   hand; everything outside the spotlight waits, and wrong taps get a friendly nudge.
2. Drag the red seed into the soil → tap the sprout (4 taps) → it blooms. Same with the blue seed.
3. Drag from the red bloom onto the blue one → a pollen trail, a glowing hybrid seed pops out → tap it.
4. Plant the mystery seed ("?" badge) → tap-tap-tap → *NEW SPECIES: Purple Blossom!*
5. Harvest the three blooms quickly → *Combo ×3!* → reward card → starter quests begin (buy a plot, plant, cross,
   discover, combo, order…), each with a reward and a pointing hand on request.
6. ~45 s later the first golden bee drifts across the garden: tap it for a shower of coins.

The active verbs and their numbers:
- **Tap to grow**: +14 % of the grow time per tap, each further tap in the same growth cycle ×0.85 (so taps
  matter a lot early and less for rare, slow flowers; the timer still matters). Tutorial taps are a flat 26 %.
- **Cross by hand**: any two blooms, anywhere; both rest 8 s afterwards (a clock shows it). The seed flies to
  the pouch after 3 s. Bees keep crossing adjacent blooms automatically (idle progress).
- **Combos**: harvests less than 1.3 s apart chain; coins ×1.25 per step up to ×2.
- **Golden bee**: every 75-150 s after the tutorial, 11 s on screen; pays max(40 + 25 × level, 6 × best bloom).

## Genetics
A flower = `{ c1, c2, shape, pattern, mut }`.

**Colours** (16, 4 tiers). Tier 1 is sold in the shop, the rest must be bred:
| Tier | Colours |
|---|---|
| 1 | Red, Yellow, Blue, White |
| 2 | Orange (R+Y), Green (Y+B), Purple (R+B), Pink (R+W), Sky (B+W), Cream (Y+W) |
| 3 | Peach (Orange+W), Lavender (Purple+W), Teal (Green+Blue), Magenta (Purple+Pink), Indigo (Purple+Blue) |
| 4 | Midnight (Indigo + Purple, 25 %) |

Crossing two colours with a mix rule gives the mix 55 %, a bicolour of both parents 20 %, else one parent's
colour. Without a rule the child takes either parent's colour (sometimes bicolour).

**Shapes** (8, 4 tiers): Blossom, Daisy (shop) → Tulip (Blossom×Blossom 12 %), Star (Blossom×Daisy 22 %) → Heart
(Tulip×Star 15 %), Frill (Daisy×Star 15 %) → Lotus (Tulip×Frill 10 %), Pinwheel (Star×Heart 10 %). Otherwise
inherited 50/50, plus a 2 % random shape mutation.

**Patterns**: Plain, Two-tone, Striped, Spotted, Tipped. Inherited 50/50; 5 % pattern mutation.

**Mutations** (per plant, not inherited), rolled when a flower blooms during weather:
Dewy (rain) ×2, Moonlit (night) ×3, Golden (golden hour) ×5, Rainbow (rainbow) ×10. Giant 1 % any time ×3.

**Flower Book** = colour × shape = 128 species. Patterns and mutations are tracked as variants.

## Numbers
- Value = 4 × T(colour) × T(shape) × pattern × mutation, T = [1, 2.2, 4.5, 9] by tier;
  pattern ×[1, 1.4, 1.8, 1.8, 2].
- Grow time = 10 s × (tierC + tierS − 1)^1.25; regrow after harvest = 55 % of that. Rain ×2 speed.
- Bees: one pollination per bee every ~7 s (flight time) when two adjacent blooms exist.
- Plots: start with 7 (radius 1 honeycomb), buy outward to 37. Cost 60 × 1.45^n.
- Seed pouch: 12 seed kinds (identical seeds stack), +3 per Seed Pouch upgrade up to 36.

## Progression
- Gardener level from XP (harvest value, discoveries, orders). Levels unlock upgrades, weather, visitors.
- Upgrades: Bees (+1, up to 6), Wings (bee speed), Fertiliser (grow speed), Market (sell value),
  Pouch size, Watering can charges.
- Orders: 3 visitor slots; each asks for a colour/shape/pattern the player can reach; reward ≈ 4× value + XP.
- Weather cycle: clear 100-160 s, then Rain / Golden hour / Night / Rainbow for 40-60 s.
- Offline: growth and bee seeds continue for up to 8 h (seeds capped by pouch space).

## CrazyGames integration
- Basic Launch: no ads anywhere (`ADS_ENABLED = false`); nothing is gated behind an ad.
- SDK: `loadingStart/Stop`, `gameplayStart` as soon as the garden is interactive, `gameplayStop` while a full
  panel (shop, book, settings) is open, `muteAudio` respected, Data module saves, `happytime` only for rare
  moments (first Rainbow flower, completing a colour row of the book), completion % = book progress.
- Full Launch later: rewarded "double offline harvest", "instant bloom", midgame between big panels.
