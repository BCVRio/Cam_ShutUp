# Cam's Xmas Soccer Rush ⚽🎄

A 3D mobile football game built with Three.js. You play **Cam** (the Bosco FC striker from the
*Cam Shut Up* Nunhead game) dribbling through a Christmas maze on the pitch of five famous
floodlit stadiums while zombie footballers and evil elves try to stop you scoring and winning
Christmas back for Santa.

Everything runs in the browser from static files: no build step, no server code.

## Play it

* Open `index.html` from any static host (GitHub Pages works: Settings → Pages → deploy from the
  `main` branch root). On a phone, "Add to Home Screen" installs it as a full-screen app.
* Local testing: `python3 -m http.server 8080` in the repo folder, then open
  `http://localhost:8080/` on your phone (same Wi-Fi) or in a desktop browser.

## How it plays

| | |
|---|---|
| **Move / dribble** | Drag anywhere on the left half of the screen (virtual joystick). Keyboard: WASD / arrows. |
| **Red lanes** | Defenders in red flash the lane they are about to slide-tackle along. Get out of it. |
| **TRICK** | Near a defender: **nutmeg** through their legs and burst past. Away from one: spin dash. (Space) |
| **ONE-TWO** | Pass to Mia on the wing; she returns it ahead of you. You cannot be tackled while the ball is away. (E) |
| **Heat** | Every trick, pass, coin and comet smash heats the ball. At full heat it becomes a **flaming comet** that flattens defenders and shrinks the keeper's reach. |
| **The box** | Cam runs to the spot and a target slides across the goal while the elf keeper patrols. **Tap** when the target is outside the keeper's reach. |
| **Stars** | ⭐ score · ⭐ no lives lost · ⭐ enough tricks. Coins buy ball skins in the shop. |

Five stadiums, each longer and busier: London (Arch Arena), Barcelona (Camp Gran), Rio (Praia
Bowl), Milan (Spiral Towers) and Munich (Diamond Dome). Score in all five to free Santa.

## Project layout

```
index.html              markup, HUD and menu screens
styles.css              mobile-first styling, safe-area aware
manifest.webmanifest    PWA manifest · sw.js offline cache
src/main.js             renderer bootstrap
src/game.js             game loop, player, ball, heat/comet, defender AI, penalty mini-game, results
src/world.js            stadium, pitch, maze generator, coins, decor, level table
src/characters.js       GLB character loading with procedural low-poly fallback avatars
src/input.js            touch joystick, action buttons, keyboard
src/ui.js               screens, level select, ball shop, result cards
src/audio.js            WebAudio synth + FlashBoards sound effects
src/save.js             localStorage progress (coins, stars, skins)
vendor/                 three.js r160 + GLTFLoader (no CDN dependency)
assets/models/*.glb     rigged, animated characters (Cam, Mia, zombie, elf, keeper)
assets/img/*.jpg        character references, stadium backdrops, title art
assets/textures/*.jpg   turf, ball, crowd, seats, Bosco FC crest
assets/audio/*.mp3      crowd loop, goal roar, whistle, bells
tools/shrink_glb.py     re-encodes textures inside a GLB (used to cut the models from 22 MB to 7 MB)
```

## Asset pipeline (Higgsfield + FlashBoards)

* **Cam** is the Bosco FC game-character render from the Nunhead project (Higgsfield, 11–12 Oct),
  converted to a rigged, textured GLB with a run cycle via Higgsfield `image_to_3d` (Meshy).
* **Zombie footballer, evil elf, elf keeper, Mia** and **Santa** were generated in the same
  A-pose studio style with GPT Image 2.5, then run through the same image → 3D → rig pipeline.
* **Stadium backdrops** (five Christmas-dressed night stadiums) and the **title key art** were
  generated with GPT Image 2.5 on Higgsfield.
* **Textures** (3G turf, leather ball, navy/gold crowd, seating, Bosco FC crest) come from the
  original Nunhead asset set.
* **Sound effects** (crowd bed, goal roar, whistle, sleigh bells) were generated with FlashBoards
  (ElevenLabs Sound Effects v2). Everything else is synthesised in WebAudio.

To swap a character, drop a new `assets/models/<kind>.glb` in place (facing +Z, metres, feet at
y = 0, first animation clip = run/walk). If a GLB is missing the game builds a simple blocky avatar
in the right kit instead.

## Tuning

Level difficulty lives in the `LEVELS` table at the top of `src/world.js` (length, defender count,
elf ratio, target speed, keeper speed and reach, fog). Skins and prices are in `src/save.js`.
