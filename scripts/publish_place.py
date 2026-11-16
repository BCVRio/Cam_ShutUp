#!/usr/bin/env python3
"""Publish build/StealANunhead.rbxl to Roblox with the Open Cloud Place Publishing API.

    export ROBLOX_API_KEY=...        # Open Cloud key with "Universe Places" write permission
    export ROBLOX_UNIVERSE_ID=...    # from Creator Dashboard > your experience > Overview
    export ROBLOX_PLACE_ID=...       # the start place id
    python scripts/publish_place.py [--saved]   # --saved uploads without publishing (Studio "Save")

Build the place first:  rojo build -o build/StealANunhead.rbxl
Only the Python standard library is used.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLACE_FILE = ROOT / "build" / "StealANunhead.rbxl"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--saved", action="store_true", help="upload as a saved version instead of publishing")
    ap.add_argument("--file", default=str(PLACE_FILE))
    args = ap.parse_args()

    key = os.environ.get("ROBLOX_API_KEY")
    universe = os.environ.get("ROBLOX_UNIVERSE_ID")
    place = os.environ.get("ROBLOX_PLACE_ID")
    if not (key and universe and place):
        raise SystemExit("set ROBLOX_API_KEY, ROBLOX_UNIVERSE_ID and ROBLOX_PLACE_ID")

    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"{path} not found - run `rojo build -o {path}` first")

    version_type = "Saved" if args.saved else "Published"
    url = f"https://apis.roblox.com/universes/v1/{universe}/places/{place}/versions?versionType={version_type}"
    req = urllib.request.Request(url, data=path.read_bytes(), method="POST")
    req.add_header("x-api-key", key)
    req.add_header("Content-Type", "application/octet-stream")
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            body = json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"publish failed: HTTP {e.code}: {e.read().decode(errors='replace')}") from None

    print(f"{version_type} place {place} as version {body.get('versionNumber', '?')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
