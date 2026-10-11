# Cam's Shut Up: SE London

An open-world football game starring Cam, set in a real slice of south-east
London rebuilt street by street from OpenStreetMap data. Every time he moves,
jumps or kicks the ball he says **"shut up"** in his own voice.

![Opening page](public/art/keyart_bosco.jpg)

## Play it

No build step. Serve the folder with any static server and open `index.html`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The page loads Three.js from jsDelivr and every asset from `public/`.

| Control | Action |
| --- | --- |
| `W A S D` / arrow keys | move (relative to the camera) |
| `Shift` | run |
| `Space` | jump (jump into the ball to head it) |
| hold `F` / mouse button, release | charge a kick and shoot; `A`/`D` while charging curls it |
| `B` | call the ball to your feet |
| `G` | emote |
| drag the mouse / `Q` `X` | look around |
| `M` | music on/off |
| `Esc` | menu |
| touch | left stick (push far to run), KICK (hold to charge), JUMP, BALL, EMOTE, drag to look |

## The four worlds

All four are in one connected map (about 1.3 km by 0.9 km around Nunhead and
Telegraph Hill). Walk, or pick a world from the menu to drop straight in.

- **Nunhead** — Nunhead Green, the station, Evelina Road, the terraces. Knock
  down the target boards on the green.
- **Bosco FC Stadium** — stands, floodlights, advert boards and a crest built
  around the real pitch at St Thomas the Apostle College. A 3-minute match,
  Bosco FC v Nunhead Rovers, with keepers and outfield bots.
- **The Cage** — the fenced court at Edmund Waller School on Telegraph Hill.
  A 90-second cage match.
- **Dr Harold Moody Park** — a free kickabout with a keeper on the park.

## The ball

The ball is a real rigid body: gravity, quadratic air drag, Magnus curl from
side spin, restitution and friction that depend on the surface (grass, astro,
tarmac), impact friction that converts slip into spin, no-slip rolling with
the spin locked to the velocity, rolling resistance, slope roll, swept
collisions against posts, bars, nets, fences, boards and buildings. Dribble by
running into it, cushion it when it comes at you, charge a shot and curl it.

## Graphics

Three presets in Settings. **Ultra** (desktop default): three-cascade shadow
maps, ground-truth ambient occlusion, bloom, SMAA, a carpet of wind-blown
grass around Cam. **High** (phone default): full PBR materials with derived
normal and roughness maps on every surface, image-based lighting from a
Higgsfield sky panorama, bloom and SMAA. **Low**: albedo-only materials and a
gradient sky for older phones. Facades, slate, tarmac, pavement, astroturf,
seats, the foliage, the crowd in the stands, the ball leather and the sky
were all generated with Higgsfield; the terraces get pitched slate roofs with
chimney stacks built from their real footprints.

## How it was made

- **Map** — `tools/build_map.py` pulls OpenStreetMap buildings, roads, rail,
  parks, pitches, fences and trees for the area, plus Open-Meteo elevation,
  and writes `public/maps/selondon.json` in local metres. `src/map.js` turns
  that into terrain, textured building blocks with street-level facades,
  roads with pavements and markings, railway, fences, trees, lamps, street
  signs, pubs and shops. Map data © OpenStreetMap contributors (ODbL).
- **Cam** — his likeness comes from a short video, turned into concept art and
  a rigged, animated PBR model with Higgsfield (image generation, image-to-3D,
  rigging). Five outfits live in the Locker.
- **Voice** — "shut up" is his real recording; the other lines (yay, ooh,
  oh yeah, oh no, woohoo) were cloned from it.
- **Art** — facades, slate, tarmac, pavement, astroturf, stadium seats, the
  Bosco FC crest, the opening-page key art and the world postcards were
  generated with Higgsfield.

## Files

```
index.html               opening page, HUD, touch controls
src/core.js              config, audio, renderer, materials, player state
src/map.js               world from map data: terrain, buildings, roads, collision
src/ball.js              football physics
src/football.js          arenas, goals, keepers, bots, matches
src/player.js            controller, camera, input, outfit loading
src/locker.js            outfits and accessories
src/ui.js                menu, minimap, big map, settings
src/game.js              main loop
tools/build_map.py       OSM + elevation → public/maps/selondon.json
public/models            Cam's GLB models (one per outfit)
public/audio             voice lines and music
public/textures, art     Higgsfield-generated textures, key art, postcards
```
