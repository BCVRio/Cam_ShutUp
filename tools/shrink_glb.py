#!/usr/bin/env python3
"""Shrink the textures embedded in a GLB (re-encode as JPEG, max 1024px) and repack the binary buffer.
Usage: python3 tools/shrink_glb.py in.glb out.glb [max_size] [quality]
Only touches image bufferViews; geometry/animation data is copied as-is."""
import sys, struct, json, io
from PIL import Image

def pad4(b, fill=b'\x00'):
    return b + fill * ((4 - len(b) % 4) % 4)

def main(src, dst, max_size=1024, quality=82):
    data = open(src, 'rb').read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, 'not a GLB'
    off = 12
    jlen, jtype = struct.unpack_from('<II', data, off); off += 8
    gltf = json.loads(data[off:off + jlen]); off += jlen
    blen, btype = struct.unpack_from('<II', data, off); off += 8
    binb = data[off:off + blen]
    views = gltf['bufferViews']
    img_views = {im['bufferView']: im for im in gltf.get('images', []) if 'bufferView' in im}
    new_bin = bytearray()
    for i, bv in enumerate(views):
        start = bv.get('byteOffset', 0); chunk = binb[start:start + bv['byteLength']]
        if i in img_views:
            im = Image.open(io.BytesIO(chunk)).convert('RGB')
            if max(im.size) > max_size:
                im.thumbnail((max_size, max_size), Image.LANCZOS)
            out = io.BytesIO(); im.save(out, 'JPEG', quality=quality, optimize=True); chunk = out.getvalue()
            img_views[i]['mimeType'] = 'image/jpeg'
            print(f'  image view {i}: {im.size} -> {len(chunk)//1024} KB')
        while len(new_bin) % 4: new_bin.append(0)
        bv['byteOffset'] = len(new_bin); bv['byteLength'] = len(chunk)
        new_bin += chunk
    new_bin = pad4(bytes(new_bin))
    gltf['buffers'][0]['byteLength'] = len(new_bin)
    jbytes = pad4(json.dumps(gltf, separators=(',', ':')).encode(), b' ')
    total = 12 + 8 + len(jbytes) + 8 + len(new_bin)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', magic, version, total))
        f.write(struct.pack('<II', len(jbytes), 0x4E4F534A)); f.write(jbytes)
        f.write(struct.pack('<II', len(new_bin), 0x004E4942)); f.write(new_bin)
    print(f'{src}: {len(data)//1024} KB -> {total//1024} KB')

if __name__ == '__main__':
    a = sys.argv[1:]
    main(a[0], a[1], int(a[2]) if len(a) > 2 else 1024, int(a[3]) if len(a) > 3 else 82)
