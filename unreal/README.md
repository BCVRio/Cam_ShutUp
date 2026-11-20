# Nunhead Green in Unreal Engine 5 — the experiment

The browser game's Nunhead Green area (terrain, roads with kerbs and markings, pavements, the terraces with their
Higgsfield house modules, trees, lamps, garden walls, parked cars, benches, the Green itself) is exported to
`nunhead_green.glb` straight from the live game scene, with the same PBR textures. `build_green.py` imports it
into a fresh level, lights it (sun, sky light, sky atmosphere, volumetric fog and clouds, a post-process look)
and saves it. Lumen global illumination and reflections are on in any new UE 5 project, so the same meshes get
real bounced light, soft contact shadows and proper reflections on the puddles.

## Steps (Unreal 5.3 or newer)

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

## Cam

Cam's rigged, animated models are in `public/models/cam_idle.glb`, `cam_run.glb`, `cam_jump.glb` and
`cam_dance.glb`. Drag any of them into the Content Browser: Interchange imports the skeletal mesh, skeleton and
animation. To play as Cam: open `BP_ThirdPersonCharacter`, set the Mesh component's Skeletal Mesh to Cam's,
then retarget the mannequin's animation blueprint with an IK Retargeter (mannequin → Cam's skeleton), or make a
small Animation Blueprint that blends `cam_idle` and `cam_run` by speed.

## What transfers and what does not

Transfers: geometry, materials and textures, instance placement, the map accuracy.
Does not: the game logic (ball physics, bots, matches, shops, cards, menus), which would be rebuilt in
Blueprints. Treat this level as the look test the browser version is measured against.

## Scale and axes

The GLB is in metres, Y up. Interchange converts to Unreal's centimetres and Z up on import, so the level comes
in at real-world scale with the export origin (the centre of Nunhead Green) at 0,0,0.
