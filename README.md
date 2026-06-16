# 🌍 Tiny World

A browser-based 3D game in the spirit of *tiny-planet* sandboxes — wander a
little procedurally-generated globe, collect glowing gems, and watch the sun
arc across a soft pastel sky. Built entirely with **WebGL + [Three.js](https://threejs.org/)**,
no build step required.

![Tiny World](https://img.shields.io/badge/three.js-r160-blue) ![No build](https://img.shields.io/badge/build-none-brightgreen)

## ✨ Features

- **A real tiny planet** — a noise-displaced icosphere with flat-shaded low-poly
  facets, biome colouring (ocean → beach → grass → forest → rock → snow), and
  **radial gravity** so you walk all the way around it.
- **Soft low-poly world** — instanced trees, rocks, flowers and grass that sway
  in the wind, drifting puffy clouds, and a shimmering translucent ocean.
- **Customizable wanderer** — pick a body colour, accent and hat; your character
  has a procedural walk cycle, idle breathing and the occasional blink.
- **Collect the gems** — glowing octahedral gems bob and spin across the land;
  wander close to scoop one up in a burst of sparkles and a little chime. They
  respawn elsewhere for an endless, chill loop.
- **Living day/night cycle** — the sun and moon orbit the planet while the sky,
  fog, lighting and a fading starfield drift through dawn, day, dusk and night.
- **All the bells & whistles** — bloom, SMAA anti-aliasing, ACES tone mapping,
  soft shadows, a loading screen, an intro camera sweep, and fully synthesized
  audio (ambient pad, pickups, footsteps) with **zero asset files**.

Every world is procedurally generated, so no two are the same.

## ▶️ How to run

Because it uses ES modules, open it through a tiny static web server (not
`file://`):

```bash
# from the project root, pick any one:
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000/> in a modern browser (Chrome, Edge, Firefox,
Safari). Three.js itself loads from a CDN via an import map, so there's nothing
to install.

It also deploys as-is to any static host (e.g. GitHub Pages).

## 🎮 Controls

| Action | Keyboard / Mouse | Touch |
| --- | --- | --- |
| Move | `W` `A` `S` `D` / arrow keys | left joystick |
| Look around | move the mouse (click to capture) | drag right side |
| Jump | `Space` | ↑ button |
| Sprint | hold `Shift` | — |
| Customize | `C` | 🎨 button |
| Mute | `M` | 🔊 button |

## 🗂️ Project structure

```
index.html            # entry: import map, canvas, UI overlays
styles.css            # HUD / menu / loading styling
src/
  main.js             # bootstrap, post-processing, game loop
  config.js           # all tunables (planet, player, palette…)
  world/              # planet, water, props, clouds, sky
  player/             # character model + surface controller
  systems/            # day/night, collectibles, particles, audio
  ui/                 # HUD, customizer
  utils/              # noise + spherical math helpers
```

## 🛠️ Tweaking

Almost everything is tunable from `src/config.js` — planet size and roughness,
number of trees/gems, day length, the colour palette and the customizer
swatches. Change them and reload.

---

Made with Three.js · procedurally generated · no two worlds alike.
