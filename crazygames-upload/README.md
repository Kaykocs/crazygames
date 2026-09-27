# Buzz & Bloom — CrazyGames upload kit

Everything to submit the game on the CrazyGames Developer Portal (**Basic Launch**): the files in upload
order, and every text field ready to copy. On GitHub, each grey box has a copy button in its corner.

## 1. Files

| # | File | Upload it as |
|---|---|---|
| 1 | [`1-game/buzz-and-bloom-1.0.0.zip`](1-game/buzz-and-bloom-1.0.0.zip) | **Game files** (HTML5). `index.html` sits at the root of the zip. 188 KB. |
| 2 | [`2-covers/cover-landscape-1920x1080.png`](2-covers/cover-landscape-1920x1080.png) | **Landscape cover** (16:9) |
| 3 | [`2-covers/cover-portrait-800x1200.png`](2-covers/cover-portrait-800x1200.png) | **Portrait cover** (2:3) |
| 4 | [`2-covers/cover-square-800x800.png`](2-covers/cover-square-800x800.png) | **Square cover** (1:1) |
| 5 | [`3-videos/trailer-landscape-1920x1080.mp4`](3-videos/trailer-landscape-1920x1080.mp4) | **Landscape preview video** (19.8 s, 30 fps, no sound, 17.8 MB) |
| 6 | [`3-videos/trailer-portrait-1080x1920.mp4`](3-videos/trailer-portrait-1080x1920.mp4) | **Portrait / mobile preview video** (18.1 s, 30 fps, no sound, 13.6 MB) |

The covers show only the game title as text. The videos are real gameplay with no text overlays.

## 2. Texts

### Game title
```
Buzz & Bloom
```

### Short description (one line)
```
Breed magical flowers with your bees, discover 128 species and grow the coziest garden.
```

### Description
```
Buzz & Bloom is a cozy flower-breeding game set in a hand-illustrated garden. Drag pollen from one flower onto another to cross them and see what grows: red and blue make purple, blossoms and daisies make stars, and rare lotus and pinwheel flowers are waiting to be discovered. Tap sprouts to help them grow, harvest your blooms for coins and chain quick harvests into combos.

Your bees buzz between neighbouring flowers and make new seeds all by themselves, and your garden keeps growing while you're away. Fill the Flower Book with all 128 species, grow the flowers friendly visitors ask for, buy more land, unlock upgrades and decorate with a windmill, a fountain, a gazebo and more. Keep an eye on the sky: rain makes flowers grow twice as fast, while golden hours, starry nights and rainbows can turn blooms into rare golden, moonlit and rainbow variants. And if a golden bee flies by, catch it!

Features:
- 128 flower species to breed from 16 colours and 8 petal shapes, plus patterns and rare weather mutations
- A lively hand-drawn garden with birds, frogs, fish, butterflies and a busy beehive
- Relaxing play with no fail state; your garden grows while you're away
- Quests, visitor orders, achievements and daily gifts
- Plays on desktop and mobile, in portrait and landscape
```

### Controls
```
Plant: drag a seed from your pouch onto the soil (or tap the seed, then the soil)
Grow: tap or click a growing flower to make it grow faster
Cross: drag from one flower onto another
Harvest: tap or click a bloom; quick taps in a row make a combo
Collect seeds: tap the seed bubbles
Look around: drag the lawn; mouse wheel or pinch to zoom; the target button (or H) brings you back to the garden
Keyboard: 1-9 pick seeds, W watering can, D shovel, S shop, B Flower Book, H back to the garden, Esc close
```

### Tips / FAQ (if the form or page has room for it)
```
How do I get new flowers? Drag pollen from one bloom onto another. Red + Blue make Purple, Red + Yellow make Orange, Blossom + Daisy can make a Star. The Flower Book shows the recipe for every species.
How do I earn coins faster? Harvest blooms quickly one after another for a combo, fill visitor orders, and tap the golden bee when it flies by.
Does my garden keep growing when I leave? Yes. Flowers grow and your bees keep making seeds for up to 8 hours.
```

### Category and tags
- **Category:** Casual
- **Tags** (choose the closest ones the portal offers): Idle, Farming, Relaxing, Cute, Simulation, Collecting, 2D, Flowers

## 3. Form answers

| Question | Answer |
|---|---|
| Game type / technology | HTML5 (JavaScript and Canvas 2D, no engine) |
| Devices | Desktop and mobile (phones and tablets) |
| Orientation | Both portrait and landscape |
| CrazyGames SDK | Yes, HTML5 SDK v3: loading and gameplay events, happytime, the Data module for saves, and the mute setting |
| Saves progress | Yes, with the CrazyGames **Data module** (answer "Yes, using the Data Module") |
| Ads | None (Basic Launch). There are no ad calls anywhere in the game. |
| In-game purchases | None |
| Multiplayer, chat or user-generated content | None |
| Login or account needed | No |
| Languages | English |
| Content / age | Suitable for everyone: no violence, blood, gambling or scary content |
| Fullscreen | Left to the CrazyGames player (there's no in-game fullscreen button) |
| Third-party assets | Fonts Fredoka and Lilita One (SIL Open Font License; the licence files are in the zip). All art, sound and music are generated in code. |
| Version | 1.0.0 |

If the form asks how the game was made or whether AI tools were used: the code, the procedural art and the
synthesised audio were written with an AI coding assistant. Answer that question according to CrazyGames'
current policy.

## 4. Before you press submit

- [ ] Search CrazyGames for "Buzz & Bloom" to make sure the name isn't taken.
- [ ] Upload the zip and open the portal's preview/QA page. Play the tutorial on a computer and on a phone,
      check that sound starts after the first tap, and that the CrazyGames mute setting silences the game.
- [ ] Tick mobile support and both orientations.
- [ ] Decide yourself on exclusivity (whether the game is published on other sites).

## Rebuilding these files

From the repository root: `npm run build` puts a fresh zip in `1-game/`, `node tools/covers.mjs` repaints the
covers into `2-covers/`, and `node tools/video.mjs` re-records both trailers into `3-videos/`.
