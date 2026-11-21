# Nunhead Green in Unreal Engine 5 — the experiment

The browser game's Nunhead Green area (terrain, roads with kerbs and markings, pavements, the terraces with their
Higgsfield house modules, trees, lamps, garden walls, parked cars, benches, the Green itself) is exported to
`nunhead_green.glb` straight from the live game scene, with the same PBR textures. `build_green.py` imports it
into a fresh level, lights it (sun, sky light, sky atmosphere, volumetric fog and clouds, a post-process look)
and saves it. Lumen global illumination and reflections are on in any new UE 5 project, so the same meshes get
real bounced light, soft contact shadows and proper reflections on the puddles.

## What is in here

- `Project/` — the Unreal C++ project: `NunheadGTA.uproject`, the `NunheadGTA` game module
  (the player character with Enhanced Input for keyboard and Xbox pad, a Chaos football with Magnus curl,
  goals, match flow and HUD, team-mates and Rovers with a chase / support / keeper brain) and the
  Lumen + Nanite project settings.
- `build_green.py` — builds the level in the editor: imports the street export and the player model, lights it,
  places the goals, ball, Bosco team-mates and Rovers, sets the game mode, saves.
- `nunhead_green.glb` — Nunhead Green exported from the browser game (626 objects, PBR textures).
- `make_grass.py` / `grass_card.glb` — a grass clump (three crossed cards with a drawn blade texture) that the
  `GrassField` actor scatters over the Green by line trace, with a masked two-sided material and a wind sway.
- `audio/` — WAVs for the whistle, crowd loop / roar / groan and the voices (converted from `public/audio` with ffmpeg).
- `find_pitch.py` / `pitch.json` — where the Green is in the export (its largest grass patch), so the pitch lands on it.
- `fix_winding.py` — flips any triangle wound against its normal, in place. The browser export had the terrace
  facades inside-out (mirrored geometry), which a dynamic sun lights as black walls. Run it on any new export.
- `create_project.py` — Windows one-shot: copies the project, writes `OpenAndBuild.bat`.

The C++ needs a compiler: on Windows install Visual Studio 2022 or 2026 (Community, or the free Build Tools:
`winget install Microsoft.VisualStudio.2022.BuildTools`) with the "Game development with C++" workload
(Build Tools: "Desktop development with C++" plus a Windows 10/11 SDK) before opening the project; the editor
compiles the module on first open. UE 5.8 wants MSVC 14.38 or newer and takes the VS 2026 toolset too.
On Linux the engine ships its own toolchain.

## Quickest way (Windows)

    python unreal\create_project.py

makes the project at `unreal\NunheadGTA` inside this repo (pass another path to put it elsewhere), copies the level script and the GLB in,
and writes `OpenAndBuild.bat`. It finds the newest UE 5 install through the Epic launcher's install list, so the engine can be on any drive.
To compile without opening the editor (errors show up in the console):

    "<engine>\Engine\Build\BatchFiles\Build.bat" NunheadGTAEditor Win64 Development -Project="<repo>\unreal\NunheadGTA\NunheadGTA.uproject" -WaitMutex

Running the bat again rebuilds the level in place (it empties `NunheadGreen` and fills it again).
To test a change end to end without touching the editor:

    powershell -File unreal\test_cycle.ps1

closes the editor, refreshes the project, compiles, rebuilds the level, runs the game standalone for 45 seconds
(the bots play on their own) and saves `NunheadGTA\Saved\Screenshots\WindowsEditor\nunhead_auto.png`; `-SkipLevel` keeps the saved level. Double-click that: the editor opens the project and builds the level itself.
First run compiles shaders, so give it a few minutes. Then open Content → Nunhead → NunheadGreen and press Play.

## Manual steps (Unreal 5.3 or newer)

1. Create a new project: Games → Third Person, Blueprint, Starter Content off, Raytracing on if offered.
   Name it `NunheadGTA` anywhere you like.
2. Edit → Plugins: enable **Python Editor Script Plugin** (and keep **Interchange Framework** / **glTF Importer**
   enabled, they are on by default). Restart the editor when asked.
3. Window → Output Log. At the bottom change the `Cmd` dropdown to **Python** and run:

       py "C:/path/to/Cam_ShutUp/unreal/build_green.py"

   (forward slashes are fine). Import takes a minute or two; the first time Unreal compiles shaders for every
   material, which is the slow part on a laptop.
4. Content Browser → Nunhead → open **NunheadGreen**. Press Play to walk round as the mannequin.
5. For the golden-hour version run it again with an environment variable `EVENING=1` set before launching the
   editor, or just rotate the Sun actor down to about -9° pitch and tint it orange.

## Playing

| Control | Action |
| --- | --- |
| `W A S D` / left stick | move (camera relative) |
| `Shift` / bumpers | sprint |
| `Space` / A | jump; jump into the ball at head height to head it where the camera looks |
| hold `F` / mouse / X / RT, release | charge a shot; `A`/`D` or the stick while charging curls it |
| tap `F` / X | pass to the team-mate most in front of the camera (within about 60 degrees, up to 30 m) |
| `B` / B | call the ball to your feet |
| run into the ball | dribble |

The match (Bosco FC v Nunhead Rovers, 3 minutes) starts on the first real kick; the referee's whistle marks
kick-off, goals, restarts and full time. The crowd loop runs under everything, roars at a Bosco goal, groans at a
Rovers goal or a Cam shot that misses by a little; a ball behind the line or over the sides is a goal kick / throw in
and play resets. Keepers hold their line and dive at a shot they cannot reach on their feet. The camera backs off as
the ball gets further away. Idle and run blend by speed through a 1D blend space `build_green.py` makes for each
character (`cam_BS`, `npc_boy_home_BS`...); with no blend space the clips switch.

## The look

`DefaultEngine.ini` turns on hardware ray tracing for Lumen, virtual shadow maps and DX12; the game mode pushes the
scalability groups to Epic when it starts (`bForceEpicScalability` in `DefaultGame.ini`). `build_green.py` sets
Lumen scene detail, final gather and reflection quality to 2, adds light shafts, bloom, a touch of lens flare and
chromatic fringe, no motion blur, and grows roughly 0.6 grass clumps per square metre on the Green
(`GRASS=0` skips it; `Density` on the Grass actor changes it, then Scatter again from the Details panel).

## Cam

Cam's rigged, animated model is `public/models/cam.glb` (idle, run, jump and dance clips in one file); the
build script imports it and names the clips `cam_Anim_idle` etc. so the C++ character finds them. To play as Cam: open `BP_ThirdPersonCharacter`, set the Mesh component's Skeletal Mesh to Cam's,
then retarget the mannequin's animation blueprint with an IK Retargeter (mannequin → Cam's skeleton), or make a
small Animation Blueprint that blends `cam_idle` and `cam_run` by speed.

## What transfers and what does not

Transfers: geometry, materials and textures, instance placement, the map accuracy.
Does not: the game logic (ball physics, bots, matches, shops, cards, menus), which would be rebuilt in
Blueprints. Treat this level as the look test the browser version is measured against.

## Scale and axes

The GLB is in metres, Y up. Interchange converts to Unreal's centimetres and Z up on import, so the level comes
in at real-world scale. The export keeps the browser game's world origin, so Nunhead Green is **not** at 0,0,0:
its grass sheet is centred about (-294, 412) m in the export's X/Z with the ground some 17 m up. `find_pitch.py`
measures that from the GLB into `pitch.json`, and `build_green.py` puts the pitch there, snapping the goals, ball
and players onto the traced ground; the game mode takes the pitch frame from the two goals, so nothing assumes the origin.
