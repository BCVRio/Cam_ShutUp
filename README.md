# Cam's Shut Up World

A Mario-style 3D open-world platformer starring Cam as the main character.
Every time he moves, jumps, stomps, grabs a coin or bonks a block, he says
**"shut up"** in his own voice.

![Key art](public/art/keyart.png)

## Play it

No build step. Serve the folder with any static server and open `index.html`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or push to GitHub Pages: the root `index.html` loads Three.js from a CDN and
every asset from `public/`.

| Control | Action |
| --- | --- |
| `W A S D` / arrow keys | move (relative to the camera) |
| `Shift` | run |
| `Space` | jump (hold for a higher jump) |
| drag mouse / `Q` `E` | orbit the camera, mouse wheel zooms |
| `M` | music on/off |
| touch | on-screen joystick + JUMP button on phones |

Collect coins (25 coins = 1-UP), bonk `?` blocks from below, stomp the
mushroom goombas from above, find the flag by the castle for a course clear.
Touching a goomba from the side costs a life.

## How Cam was made (Higgsfield pipeline)

1. **Reference** – frames were pulled from `IMG_9007.mov` (Cam shouting "shut
   up" four times) and uploaded as identity references.
2. **Avatar concept** – `gpt_image_2_5` with the three frames as references
   produced a Nintendo-style 3D character render in A-pose on white
   (`public/art/cam_apose_a.png`, `cam_apose_b.png`), keeping his face, hair,
   glasses, navy track jacket with red/white sleeve stripes, brown shorts and
   black socks.
3. **3D model** – Meshy `image_to_3d` (textured, remeshed to ~20k triangles,
   humanoid auto-rig at 1.4 m, Idle clip), then `3d_rigging` on the result for
   the `RunFast` and `Regular_Jump` clips. The three single-clip GLBs were
   merged by bone name into `public/models/cam.glb` (clips: `Idle`, `Run`,
   `Jump`).
4. **Voice** – the four on-camera "shut up" takes were cut from the video
   audio and peak-normalised: `public/audio/shutup_1..4.mp3`. The game cycles
   through them with a little pitch variation.
5. **World style** – key art and an environment style sheet
   (`public/art/world_style.png`) set the look; the in-game world is built
   procedurally from that palette.
6. **Music + SFX** – `sonilo_music` overworld loop, `mirelo_text_to_audio`
   coin and stomp sounds.

### Style formula (used for every generated visual)

> Nintendo-style stylized 3D render, smooth rounded appealing proportions with
> slightly oversized head and hands, clean matte surfaces with soft
> subsurface skin; environment in candy greens, sky blue and brick orange,
> hero in navy with red/white stripes so he pops against the grass, pickups
> and hazards in gold and mushroom brown; cheerful midday sunlight with soft
> shadows; high contrast, clean readable silhouettes, free third-person
> camera.

## Project layout

```
index.html            page, HUD, touch controls, importmap for Three.js
src/game.js           the whole game: world, player, physics, enemies, audio
public/models/cam.glb rigged + animated Cam (Idle / Run / Jump)
public/audio/         shutup_1..4.mp3, music_overworld.m4a, coin.mp3, stomp.mp3
public/art/           avatar renders, key art, world style sheet
```

### Tuning knobs (`src/game.js`, top of file)

`CFG.runShoutEvery` – seconds between "shut up"s while he keeps moving.
`CFG.jumpSpeed`, `CFG.gravity`, `CFG.walkSpeed`, `CFG.runSpeed` – feel.
`CFG.modelYawOffset` – rotate the GLB if a re-export faces the wrong way.
