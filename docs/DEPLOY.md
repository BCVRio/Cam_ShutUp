# Deploying Steal a Nunhead to Roblox

There are two independent steps: (1) uploading the generated assets so the game can reference them
by id, and (2) publishing the place itself. Both can be done by hand in Studio or automated with
Open Cloud API keys. Nothing here requires anything beyond a Roblox account.

## 0. Create the experience (once)

1. Open Roblox Studio, **New > Baseplate**, then **File > Publish to Roblox As...** and give it the
   name *Steal a Nunhead*. This creates the experience (universe) and its start place.
2. Note the ids in the Creator Dashboard (https://create.roblox.com/dashboard/creations):
   open the experience, **Overview** shows the **Universe ID**, and **Places** shows the **Place ID**.
3. In the experience's **Settings > Permissions**, keep it private until you have play-tested.

## 1. Publish the place

### By hand (simplest)

```bash
rojo build -o build/StealANunhead.rbxl
```

Open `build/StealANunhead.rbxl` in Studio, **File > Publish to Roblox As...**, pick the experience
from step 0. Done. Repeat whenever the code changes (or use `rojo serve` + the Rojo plugin to sync
live and publish from Studio).

### Automated (Open Cloud)

1. Creator Dashboard > **Open Cloud > API Keys > Create API Key**.
2. Add the **Universe Places** API, operation **Write**, and select the experience.
3. Export and run:

```bash
export ROBLOX_API_KEY=...
export ROBLOX_UNIVERSE_ID=...
export ROBLOX_PLACE_ID=...
rojo build -o build/StealANunhead.rbxl
python scripts/publish_place.py          # or --saved to upload without publishing
```

### From GitHub Actions

`.github/workflows/build.yml` runs the tests and builds the place on every push, and publishes on
pushes to `main` (or when run manually with *publish = true*). Add these repository secrets:
`ROBLOX_API_KEY`, `ROBLOX_UNIVERSE_ID`, `ROBLOX_PLACE_ID`.

## 2. Upload the assets

The game works without any of this (silent, part-built items). Each uploaded asset lights up a
feature.

### Audio and images via Open Cloud (recommended)

1. Create an API key (or extend the one above) with the **Assets** API, **Read** and **Write**.
2. Find your **User ID** (profile URL `roblox.com/users/<id>/profile`) or the **Group ID** if the
   game is group-owned.
3. Run:

```bash
export ROBLOX_API_KEY=...
export ROBLOX_USER_ID=...        # or ROBLOX_GROUP_ID
python scripts/upload_assets.py
```

The script uploads every entry in `assets/manifest.json` that has no id yet, writes the ids back,
and regenerates `src/shared/Assets.luau`. Commit both. Rebuild and republish the place.

Notes:
* Audio uploads require an ID-verified account (Roblox grants verified accounts a free monthly
  audio upload allowance). Audio assets are private to the uploader's experiences by default, which
  is exactly what we want.
* New audio and decals go through moderation; they usually clear within a few minutes.
* The icon and thumbnail for the game *page* are set separately in Creator Dashboard >
  **Experience > Basic Info** (upload `assets/images/game_icon.png` and `thumbnail.png` there).
  The `GameIcon` / `Thumbnail` entries in the manifest are only there so the HUD can show them.

### Audio and images by hand

Creator Dashboard > **Development Items > Audio / Decals > Upload**. After moderation, copy each
asset id into the matching `robloxAssetId` in `assets/manifest.json`, then:

```bash
python scripts/sync_assets.py
```

### 3D meshes (always by hand)

Open Cloud cannot create MeshParts from `.glb`, so these go through Studio's 3D Importer:

1. In Studio: **Avatar tab > 3D Import**, choose a `.glb` from `assets/models/`.
2. Set **Scale Unit** to *Studs* and leave the rest at defaults, then **Import**.
3. Select the imported MeshPart and copy its **MeshId** (Properties panel, a `rbxassetid://` number).
4. Paste the number into that mesh's `robloxAssetId` in `assets/manifest.json` and run
   `python scripts/sync_assets.py`. Delete the imported MeshPart from the place; the game builds its
   own from the id.

Any collectible with a mesh id uses the mesh instead of its part-built body (see
`CollectibleFactory.build`). Entries with `aliases` share one mesh across several collectibles
(all three foxes, both parakeets).

## 3. First play-test checklist

* Open the experience in Studio, **Test > Local Server** with 2 players so you can steal from yourself.
* Buy something, place it, collect, steal it back with the second player, whack them with the bat.
* Lock the base and confirm the second player is blocked by the shield.
* Leave and rejoin: cash and pedestals should persist (needs *Enable Studio Access to API Services*
  in Game Settings > Security, or a real published server).
