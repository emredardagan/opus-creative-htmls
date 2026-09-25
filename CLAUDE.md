# Creative: Emre Dardagan's games & toys

A static site of browser games and interactive toys, deployed on Vercel from `main` (no build step, `vercel.json` serves the repo root).

## Rules from Emre

- **No "New" badges.** Never add "New" labels or badges to the index (or anywhere else) for new games or toys.
- **Every new game or toy goes on `index.html`** with a thumbnail, in the right list (`games` or `toys`).
- **Thumbnails show gameplay, not the title screen.** Take the screenshot mid-play with the title overlay hidden. Save as `thumbs/<file>.jpg`, 800×500, JPEG.
- **Go full creative.** New pieces should be distinctive, polished and stunning, and must not repeat an idea, genre or look already in the collection. When asked for "chill" pieces, keep them calm and ambient.
- **Visual quality matters most.** Aim for the level of polished mobile games: consistent art direction, real 3D models, soft lighting and shadows, lively surroundings (no empty seas or bare ground), and game feel (pop-ups, particles, squash and stretch).
- **Single-file is not required.** Use shared assets, libraries and multiple files when they make things look better.
- **Use free assets and keep their licenses.** Prefer CC0 sources (Kenney, Poly Haven, KayKit, Quaternius). Put them under `assets/`, keep each pack's license file, and list new sources in `assets/README.md`.
- **Look in the free asset sources below before building something from primitives.** Real models, textures and sounds beat hand-made shapes.
- **Site identity:** the site is named **Emre Dardagan** (not "creative"), with the ED monogram logo (`favicon.svg` and the inline SVG in `index.html`).
- **The index keeps Emre's GitFut card** (`thumbs/fut-card.webp`, links to https://gitfut.com/emredardagan).
- **Featured games** (the two large cards at the top of Games): **Shellburg** and **Mixtape Commando**.
- **Only commit and push when Emre asks.**

## Free asset sources

Check the license of every file before using it. CC0 needs no credit, but we still record the source.

- **3D models**
  - [Kenney](https://kenney.nl/assets): 40,000+ assets (3D, 2D sprites, UI, fonts, sound effects), all CC0, no sign-up. The first place to look.
  - [Quaternius](https://quaternius.com): CC0 low-poly characters, animals, vehicles and environments, many rigged and animated.
  - [Poly Pizza](https://poly.pizza): search engine for free low-poly models with direct `.glb` downloads (`https://static.poly.pizza/<ResourceID>.glb`). The license differs per model: prefer CC0 (Quaternius, Kenney, and some others); many "Poly by Google" models are CC-BY 3.0 and need credit.
  - [Poly Haven](https://polyhaven.com): CC0 HDRIs, textures and realistic models.
  - [Sketchfab](https://sketchfab.com): thousands of free models with the "Downloadable" filter. Licenses vary, so check each one.
- **Textures and materials:** [ambientCG](https://ambientcg.com) has 2,000+ CC0 PBR materials (color, normal, roughness, metallic) up to 8K. The API (`https://ambientcg.com/api/v2/full_json?q=<term>`) and zips (`https://ambientcg.com/get?file=<Id>_1K-JPG.zip`) download directly. Use the `NormalGL` maps with three.js, and downscale to 512px or 1K.
- **Sound and music**
  - [freesound.org](https://freesound.org): huge community sound library (licenses vary per sound).
  - [Mixkit](https://mixkit.co): royalty-free sound effects and music.
  - [Zapsplat](https://zapsplat.com): 19,000+ sound effects.
  - [OpenGameArt](https://opengameart.org): music section with game tracks.
  - [Kenney Audio](https://kenney.nl/assets/category:Audio): CC0.
- **Character animation:** [Mixamo](https://mixamo.com) is Adobe's free service. Upload a character and pick from hundreds of animations (walk, run, attack, death).
- **Pixel art:** [Piskel](https://piskelapp.com) is free and runs in the browser. [Aseprite](https://aseprite.org) is paid, but you can build it from its GitHub source for free.
- **Fonts:** [itch.io free game fonts](https://itch.io/game-assets/free/tag-fonts) has pixel fonts made for games, like m5x7 and monogram.

## How the project is laid out

- `index.html`: landing page. Game and toy data live in the `games` and `toys` arrays in its script.
- `<name>.html`: one page per game or toy, at the repo root.
- Bigger games get their own folder (`harborlight/` with `index.html`, `style.css` and ES modules in `js/`). Their index entry sets `href: "<folder>/"`; `file` still names the thumbnail.
- `thumbs/`: index thumbnails (800×500 JPEG) and the GitFut card.
- `assets/kenney/…`: CC0 model packs (`.glb`), each with its `License.txt`.
- `assets/hdri/`: CC0 sky for image-based lighting.
- `assets/polypizza/`: CC0 models picked from Poly Pizza (sea life for Shellburg), with a `LICENSE.txt` listing creator and source for each file.
- `assets/ambientcg/`: CC0 textures from ambientCG (downscaled maps), with `LICENSE.txt`.
- `assets/kit/toybox.js` + `toybox.css`: shared 3D kit for new games. It provides the renderer, soft shadows, ACES tone mapping, HDRI light, N8AO ambient occlusion, model loading and cloning, particle bursts, pop-up text, a tiny synth and the HUD styles. `paw-crossing.html` is the reference game built on it.
- 3D pages load three.js (0.186) and friends through an import map from `cdn.jsdelivr.net`.

## Conventions

- Every HTML page starts with `<meta charset="utf-8">`.
- Pages must work at phone width (no horizontal scroll) and respect `prefers-reduced-motion`.
- Check changes in a browser before calling them done: take screenshots at desktop and mobile widths and confirm the console has no errors.
- Local preview: `python3 -m http.server 5173` from the repo root (also in `.claude/launch.json` as `static`).
