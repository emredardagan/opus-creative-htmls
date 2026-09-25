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
- **Site identity:** the site is named **Emre Dardagan** (not "creative"), with the ED monogram logo (`favicon.svg` and the inline SVG in `index.html`).
- **The index keeps Emre's GitFut card** (`thumbs/fut-card.webp`, links to https://gitfut.com/emredardagan).
- **Featured games** (the two large cards at the top of Games): **Shellburg** and **Mixtape Commando**.
- **Only commit and push when Emre asks.**

## How the project is laid out

- `index.html`: landing page. Game and toy data live in the `games` and `toys` arrays in its script.
- `<name>.html`: one page per game or toy, at the repo root.
- `thumbs/`: index thumbnails (800×500 JPEG) and the GitFut card.
- `assets/kenney/…`: CC0 model packs (`.glb`), each with its `License.txt`.
- `assets/hdri/`: CC0 sky for image-based lighting.
- `assets/kit/toybox.js` + `toybox.css`: shared 3D kit for new games. It provides the renderer, soft shadows, ACES tone mapping, HDRI light, N8AO ambient occlusion, model loading and cloning, particle bursts, pop-up text, a tiny synth and the HUD styles. `paw-crossing.html` is the reference game built on it.
- 3D pages load three.js (0.186) and friends through an import map from `cdn.jsdelivr.net`.

## Conventions

- Every HTML page starts with `<meta charset="utf-8">`.
- Pages must work at phone width (no horizontal scroll) and respect `prefers-reduced-motion`.
- Check changes in a browser before calling them done: take screenshots at desktop and mobile widths and confirm the console has no errors.
- Local preview: `python3 -m http.server 5173` from the repo root (also in `.claude/launch.json` as `static`).
