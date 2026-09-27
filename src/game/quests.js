// Starter quests: a short chain of small, concrete goals that picks up right after the tutorial. Each one pays a
// reward and can point at where to do it, so a new player always knows what to do next. When the chain is done
// the HUD goal falls back to the achievement ladder.
//   stat: a Garden.statValue key; abs = compare the stat itself (otherwise progress counts from the quest's start)
//   hint: what the pointing hand shows (see Game._questHint)
import { C, S } from './genetics.js';

export const QUESTS = [
  { id: 'plot', text: 'Buy a new garden plot', icon: 'shovel', stat: 'plots', goal: 1, hint: 'plot', reward: { seeds: [[C.YELLOW, S.BLOSSOM, 2]] } },
  { id: 'plantY', text: 'Plant 2 seeds', icon: 'seed', stat: 'plants', goal: 2, hint: 'plant', reward: { coins: 30 } },
  { id: 'cross', text: 'Cross two blooms 3 times', icon: 'bee', stat: 'crosses', goal: 3, hint: 'cross', reward: { seeds: [[C.WHITE, S.DAISY, 2]] } },
  { id: 'disc6', text: 'Discover 6 species', icon: 'book', stat: 'discoveries', goal: 6, abs: true, hint: 'grow', reward: { coins: 60 } },
  { id: 'combo', text: 'Harvest a ×3 combo', icon: 'basket', stat: 'bestCombo', goal: 3, abs: true, hint: 'harvest', reward: { coins: 50 } },
  { id: 'order', text: 'Fill a visitor\'s order', icon: 'gift', stat: 'orders', goal: 1, hint: 'order', reward: { coins: 80 } },
  { id: 'plots10', text: 'Own 10 garden plots', icon: 'shovel', stat: 'plots', goal: 10, abs: true, hint: 'plot', reward: { seeds: [[C.RED, S.DAISY, 2]] } },
  { id: 'lvl3', text: 'Reach gardener level 3', icon: 'star', stat: 'level', goal: 3, abs: true, hint: 'cross', reward: { coins: 100 } },
  { id: 'water', text: 'Water a growing flower', icon: 'can', stat: 'waters', goal: 1, hint: 'water', reward: { coins: 60 } },
  { id: 'upgrade', text: 'Buy an upgrade in the shop', icon: 'up_fert', stat: 'upgrades', goal: 1, abs: true, hint: 'shop', reward: { coins: 120 } },
  { id: 'disc12', text: 'Discover 12 species', icon: 'book', stat: 'discoveries', goal: 12, abs: true, hint: 'cross', reward: { coins: 150 } },
  { id: 'golden', text: 'Catch a golden bee', icon: 'bee', stat: 'golden', goal: 1, hint: 'golden', reward: { coins: 150 } },
  { id: 'decor', text: 'Place a decoration', icon: 'up_market', stat: 'decor', goal: 1, abs: true, hint: 'shop', reward: { coins: 250 } },
];
