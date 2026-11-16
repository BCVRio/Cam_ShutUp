#!/usr/bin/env python3
"""Upload everything in assets/manifest.json to Roblox via the Open Cloud Assets API,
then write the returned asset ids back into the manifest and regenerate Assets.luau.

Prerequisites
-------------
1. Create an Open Cloud API key at https://create.roblox.com/dashboard/credentials
   with the "Assets" API, Read + Write, scoped to your user (or the group that owns the game).
2. Export it:  export ROBLOX_API_KEY=...
3. Tell the script who owns the assets (one of):
       export ROBLOX_USER_ID=123456
       export ROBLOX_GROUP_ID=7890
4. Run:  python scripts/upload_assets.py            # uploads anything without an id
         python scripts/upload_assets.py --force    # re-uploads everything

Audio uploads need the account to be ID-verified or hold the audio upload allowance;
Roblox returns a clear error if not. Meshes (.glb) cannot be turned into MeshParts through this API,
so mesh entries are skipped here - import them with Studio's 3D Importer and paste the MeshId into
the manifest by hand (see docs/DEPLOY.md). Only the Python standard library is used.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "assets" / "manifest.json"
API = "https://apis.roblox.com/assets/v1"

ASSET_TYPES = {
    "audio": "Audio",
    "image": "Decal",
    "itemIcon": "Decal",
}


def multipart(fields: dict[str, str], file_field: str, path: Path) -> tuple[bytes, str]:
    boundary = f"----nunhead{uuid.uuid4().hex}"
    body = bytearray()
    for name, value in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        body += value.encode() + b"\r\n"
    ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if path.suffix == ".glb":
        ctype = "model/gltf-binary"
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="{file_field}"; filename="{path.name}"\r\n'.encode()
    body += f"Content-Type: {ctype}\r\n\r\n".encode()
    body += path.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def request(method: str, url: str, key: str, data: bytes | None = None, ctype: str | None = None) -> dict:
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("x-api-key", key)
    if ctype:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise SystemExit(f"{method} {url} -> HTTP {e.code}: {detail}") from None


def upload(entry: dict, key: str, creator: dict) -> int:
    path = ROOT / entry["file"]
    if not path.exists():
        raise SystemExit(f"missing file {path}")
    meta = {
        "assetType": ASSET_TYPES[entry["kind"]],
        "displayName": entry.get("displayName") or entry["key"],
        "description": entry.get("description") or f"Steal a Nunhead asset: {entry['key']}",
        "creationContext": {"creator": creator},
    }
    body, ctype = multipart({"request": json.dumps(meta)}, "fileContent", path)
    op = request("POST", f"{API}/assets", key, body, ctype)
    op_path = op.get("path")
    if not op_path:
        raise SystemExit(f"unexpected response: {op}")

    # Poll the long-running operation
    for _ in range(60):
        status = request("GET", f"{API}/{op_path}", key)
        if status.get("done"):
            if "error" in status:
                raise SystemExit(f"upload failed for {entry['key']}: {status['error']}")
            return int(status["response"]["assetId"])
        time.sleep(2)
    raise SystemExit(f"timed out waiting for {entry['key']}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-upload assets that already have an id")
    ap.add_argument("--only", help="comma-separated list of keys to upload")
    args = ap.parse_args()

    key = os.environ.get("ROBLOX_API_KEY")
    if not key:
        raise SystemExit("set ROBLOX_API_KEY (Open Cloud key with Assets read/write)")
    if os.environ.get("ROBLOX_GROUP_ID"):
        creator = {"groupId": os.environ["ROBLOX_GROUP_ID"]}
    elif os.environ.get("ROBLOX_USER_ID"):
        creator = {"userId": os.environ["ROBLOX_USER_ID"]}
    else:
        raise SystemExit("set ROBLOX_USER_ID or ROBLOX_GROUP_ID")

    only = set(args.only.split(",")) if args.only else None
    manifest = json.loads(MANIFEST.read_text())
    changed = 0
    for entry in manifest["assets"]:
        if only and entry["key"] not in only:
            continue
        if entry.get("robloxAssetId") and not args.force:
            continue
        if entry["kind"] == "mesh":
            print(f"skipping  {entry['kind']:9} {entry['key']:22} (import .glb via Studio 3D Importer)")
            continue
        print(f"uploading {entry['kind']:9} {entry['key']:22} {entry['file']} ...", end=" ", flush=True)
        asset_id = upload(entry, key, creator)
        entry["robloxAssetId"] = asset_id
        changed += 1
        print(asset_id)
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")  # save progress as we go

    print(f"{changed} asset(s) uploaded")
    if changed:
        import subprocess

        subprocess.check_call([sys.executable, str(ROOT / "scripts" / "sync_assets.py")])
    return 0


if __name__ == "__main__":
    sys.exit(main())
