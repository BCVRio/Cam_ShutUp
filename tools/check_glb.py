"""Sanity-check GLB files from the world exporter: prints node, mesh, material, texture counts, triangle totals, the
largest embedded texture, the per-area node counts and the bounds. Standard library only.

    python tools/check_glb.py unreal/exports/*.glb
    python tools/check_glb.py unreal/exports          (every .glb in the folder)
"""
import glob
import json
import os
import struct
import sys

COMP_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
COMPS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}


def read_glb(path):
    with open(path, 'rb') as f:
        magic, version, length = struct.unpack('<4sII', f.read(12))
        if magic != b'glTF':
            raise ValueError('not a GLB (bad magic)')
        chunks = {}
        while f.tell() < length:
            n, kind = struct.unpack('<II', f.read(8))
            chunks[kind] = f.read(n)
            if n % 4:
                raise ValueError('chunk not 4-byte aligned')
    j = json.loads(chunks[0x4E4F534A].decode('utf-8'))
    return j, chunks.get(0x004E4942, b''), length, version


def image_size(data):
    """(width, height) of a PNG or JPEG in memory, or None."""
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        w, h = struct.unpack('>II', data[16:24])
        return w, h
    if data[:2] == b'\xff\xd8':
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            seglen = struct.unpack('>H', data[i + 2:i + 4])[0]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack('>HH', data[i + 5:i + 9])
                return w, h
            i += 2 + seglen
    return None


def view_bytes(j, blob, bv):
    v = j['bufferViews'][bv]
    off = v.get('byteOffset', 0)
    return blob[off:off + v['byteLength']]


def check(path):
    j, blob, length, version = read_glb(path)
    size = os.path.getsize(path)
    problems = []
    if size != length:
        problems.append('header length %d != file size %d' % (length, size))
    buffers = j.get('buffers', [])
    if buffers and buffers[0].get('byteLength', 0) > len(blob):
        problems.append('buffer 0 says %d bytes, BIN chunk has %d' % (buffers[0]['byteLength'], len(blob)))
    for i, v in enumerate(j.get('bufferViews', [])):
        if v.get('byteOffset', 0) + v['byteLength'] > len(blob):
            problems.append('bufferView %d runs past the BIN chunk' % i)
    for i, a in enumerate(j.get('accessors', [])):
        if 'bufferView' not in a:
            continue
        v = j['bufferViews'][a['bufferView']]
        stride = v.get('byteStride') or COMP_SIZE[a['componentType']] * COMPS[a['type']]
        need = a.get('byteOffset', 0) + (a['count'] - 1) * stride + COMP_SIZE[a['componentType']] * COMPS[a['type']]
        if a['count'] and need > v['byteLength']:
            problems.append('accessor %d overruns its bufferView' % i)

    nodes = j.get('nodes', [])
    meshes = j.get('meshes', [])
    mesh_nodes = sum(1 for n in nodes if 'mesh' in n)
    tris = 0
    prims = 0
    for n in nodes:
        if 'mesh' not in n:
            continue
        for p in meshes[n['mesh']]['primitives']:
            prims += 1
            mode = p.get('mode', 4)
            if 'indices' in p:
                cnt = j['accessors'][p['indices']]['count']
            else:
                cnt = j['accessors'][p['attributes']['POSITION']]['count']
            tris += cnt // 3 if mode == 4 else 0
    areas = {}
    for n in nodes:
        a = (n.get('extras') or {}).get('area')
        if a:
            areas[a] = areas.get(a, 0) + 1
    images = j.get('images', [])
    largest = (0, 0)
    mimes = {}
    for im in images:
        mimes[im.get('mimeType', '?')] = mimes.get(im.get('mimeType', '?'), 0) + 1
        if 'bufferView' in im:
            wh = image_size(view_bytes(j, blob, im['bufferView']))
            if wh is None:
                problems.append('image %d: could not read its size' % images.index(im))
            elif wh[0] * wh[1] > largest[0] * largest[1]:
                largest = wh
    # bounds from every POSITION accessor's min/max (local to its node; the exporter keeps world transforms on nodes,
    # so apply the node matrix translation when there is one and the node has no rotation/scale)
    lo = [float('inf')] * 3
    hi = [float('-inf')] * 3
    for n in nodes:
        if 'mesh' not in n:
            continue
        t = n.get('translation', [0, 0, 0])
        if 'matrix' in n:
            t = n['matrix'][12:15]
        for p in meshes[n['mesh']]['primitives']:
            a = j['accessors'][p['attributes']['POSITION']]
            if 'min' in a and 'max' in a:
                for k in range(3):
                    lo[k] = min(lo[k], a['min'][k] + t[k])
                    hi[k] = max(hi[k], a['max'][k] + t[k])
    rel = os.path.relpath(path).replace(os.sep, '/')
    print('%s  (%s MB, glTF %d)' % (rel, '{:,.1f}'.format(size / 1e6), version))
    print('  nodes %d (%d with meshes)   meshes %d   primitives used %d   triangles %s' % (len(nodes), mesh_nodes, len(meshes), prims, '{:,}'.format(tris)))
    print('  materials %d   textures %d   images %d (%s)   largest texture %dx%d' % (len(j.get('materials', [])), len(j.get('textures', [])), len(images), ', '.join('%s %d' % (k, v) for k, v in sorted(mimes.items())), largest[0], largest[1]))
    if areas:
        print('  areas: ' + ', '.join('%s %d' % (k, v) for k, v in sorted(areas.items())))
    if lo[0] < hi[0]:
        print('  bounds x %.1f..%.1f  y %.1f..%.1f  z %.1f..%.1f  (metres, Y up, approximate for rotated nodes)' % (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    ext = j.get('extensionsUsed', [])
    if ext:
        print('  extensions: ' + ', '.join(ext))
    if problems:
        print('  PROBLEMS: ' + '; '.join(problems))
    else:
        print('  OK')
    return not problems


def main(args):
    paths = []
    for a in args:
        if os.path.isdir(a):
            paths += sorted(glob.glob(os.path.join(a, '*.glb')))
        else:
            paths += sorted(glob.glob(a)) or [a]
    if not paths:
        print(__doc__)
        return 2
    ok = True
    for p in paths:
        try:
            ok = check(p) and ok
        except Exception as e:   # a file that does not parse is the finding, not a crash
            print('%s  FAILED: %s' % (p, e))
            ok = False
        print()
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
