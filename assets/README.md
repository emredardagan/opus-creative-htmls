# Shared assets

Everything in this folder is free to use in commercial and personal projects. Each pack keeps its original license file.

## What's here

| Folder | What | Source | License |
| --- | --- | --- | --- |
| `kenney/car-kit` | 45 low-poly vehicles (sedan, taxi, police, trucks, karts…) | [Kenney · Car Kit](https://kenney.nl/assets/car-kit) | CC0 |
| `kenney/city-kit-roads` | Road tiles, street lights, signs, traffic lights | [Kenney · City Kit (Roads)](https://kenney.nl/assets/city-kit-roads) | CC0 |
| `kenney/city-kit-suburban` | Houses, fences, paths, planters | [Kenney · City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban) | CC0 |
| `kenney/cube-pets` | 24 animals **with animations** (idle, walk, run, dance, eat, gestures) | [Kenney · Cube Pets](https://kenney.nl/assets/cube-pets) | CC0 |
| `kenney/nature-kit` | 329 trees, rocks, flowers, logs, cliffs, water pieces | [Kenney · Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 |
| `kenney/platformer-kit` | Grass/snow blocks, coins, chests, flags, characters, traps | [Kenney · Platformer Kit](https://kenney.nl/assets/platformer-kit) | CC0 |
| `kenney/particles` | 9 sprites picked from the Particle Pack (stars, sparks, smoke, circles…), downscaled to 128px | [Kenney · Particle Pack](https://kenney.nl/assets/particle-pack) | CC0 |
| `polypizza/` | Starfish, sea urchins (Quaternius), coral set (MiniPoly) and seaweed (Mohabins) living on Shellburg's shell | [Poly Pizza](https://poly.pizza), see `polypizza/LICENSE.txt` | CC0 |
| `ambientcg/` | Reptile-scale skin (Leather008) and bark ridges (Bark014) for the turtle, downscaled to 512px | [ambientCG](https://ambientcg.com), see `ambientcg/LICENSE.txt` | CC0 |
| `hdri/kloofendal_puresky_1k.hdr` | Sunny sky used for soft image-based lighting | [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | CC0 |

All models are `.glb` (glTF binary). Most Kenney kits share a single `Textures/colormap.png` palette texture next to the models.

## Libraries (loaded from jsDelivr, not stored here)

| Library | Used for | License |
| --- | --- | --- |
| [three.js](https://threejs.org) 0.186 | Rendering, glTF loading, HDR loading, post-processing | MIT |
| [N8AO](https://github.com/N8python/n8ao) 2.0 | Ambient occlusion (the soft contact shadows in every crease) | ISC |
| [postprocessing](https://github.com/pmndrs/postprocessing) 6.39 | Dependency of N8AO | Zlib |

## The Toybox kit (`kit/`)

`kit/toybox.js` + `kit/toybox.css` are the shared starting point for new 3D games, so they all look like one family:

- `createStage()`: renderer with ACES tone mapping, soft sun shadows, sky fill light, HDRI environment and ambient occlusion.
- `preload()` / `loaded()` / `cloneLoaded()`: load `.glb` models once, clone them cheaply (animated models get their own mixer).
- `Bursts`: sprite particle bursts using the Kenney particle sprites.
- `popText()`: "+1", "Close call!" style pop-ups that follow a 3D point.
- `Sfx`: tiny WebAudio synth for blips, chimes and noise hits.
- `toybox.css`: white pill HUD, round buttons, chunky orange call-to-action, pop-in panels, loading bar.

`paw-crossing.html` is the reference game built on it.

## More free sources worth using next

- **[Kenney](https://kenney.nl/assets)**: 200+ more CC0 kits (Food Kit, Tower Defense, Holiday, Minigolf, Train, Survival, Space…) plus UI packs and sound effects.
- **[KayKit](https://kaylousberg.itch.io)**: CC0 dungeon, city, restaurant and adventurer packs, many rigged and animated.
- **[Quaternius](https://quaternius.com)**: CC0 animated characters, animals and nature packs.
- **[Poly Pizza](https://poly.pizza)**: search engine for thousands of free low-poly models (check each model's license; many are CC0 or CC-BY).
- **[Sketchfab](https://sketchfab.com)**: free models with the "Downloadable" filter (licenses vary).
- **[Mixamo](https://mixamo.com)**: free character animations to put on rigged models.
- **[Poly Haven](https://polyhaven.com)**: CC0 HDRIs, textures and realistic models.
- **[ambientCG](https://ambientcg.com)**: CC0 PBR textures.
- **[Kenney Audio](https://kenney.nl/assets/category:Audio)**, **[freesound.org](https://freesound.org)**, **[Mixkit](https://mixkit.co)**, **[Zapsplat](https://zapsplat.com)** and **[OpenGameArt](https://opengameart.org)** for sound effects and music (check per-sound licenses).
- **[itch.io free fonts](https://itch.io/game-assets/free/tag-fonts)** for game fonts like m5x7 and monogram.
