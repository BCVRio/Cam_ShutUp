"""Write unreal/grass_card.glb: a grass tuft (three crossed cards, 0.6 m wide, 0.3 m tall) with a procedurally drawn
blade texture, alpha-masked and double-sided, metres, Y up, so Interchange imports it like the street export.
Standard library only (no PIL):   python unreal\\make_grass.py"""
import json, math, os, random, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 256, 512


def png(width, height, rgba_rows):
    def chunk(tag, data): return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(row) for row in rgba_rows)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def blade_texture(seed=3):
    """Blades as tapered strips, dark at the root, lighter and a little yellow at the tip, alpha 255 on the blade."""
    rnd = random.Random(seed)
    px = [[0, 0, 0, 0] for _ in range(W * H)]
    for _ in range(46):
        x0 = rnd.uniform(0.04, 0.96) * W; h = rnd.uniform(0.55, 1.0) * H; w0 = rnd.uniform(9, 16); lean = rnd.uniform(-0.35, 0.35); bend = rnd.uniform(-0.6, 0.6)
        tint = rnd.uniform(-0.12, 0.12)
        for yi in range(int(h)):
            t = yi / h                                   # 0 root .. 1 tip (image row 0 is the top, so flip when writing)
            cx = x0 + lean * yi + bend * (yi * yi) / h
            wid = max(1.0, w0 * (1 - t) ** 0.8)
            r, g, b = 0.16 + 0.42 * t + tint, 0.38 + 0.44 * t, 0.10 + 0.12 * t
            for xi in range(int(cx - wid / 2), int(cx + wid / 2) + 1):
                if 0 <= xi < W:
                    i = (H - 1 - yi) * W + xi
                    sh = 1.0 - 0.25 * abs((xi - cx) / (wid / 2 + 1e-3))          # darker edges
                    px[i] = [int(255 * min(1, r * sh)), int(255 * min(1, g * sh)), int(255 * min(1, b * sh)), 255]
    rows = [[c for x in range(W) for c in px[y * W + x]] for y in range(H)]
    return png(W, H, rows)


def glb():
    tex = blade_texture()
    pos, nrm, uv, idx = [], [], [], []
    cards = 3; w, h = 0.6, 0.3     # a mown green: short tufts
    for c in range(cards):
        a = math.pi * c / cards; dx, dz = math.cos(a) * w / 2, math.sin(a) * w / 2
        base = len(pos)
        for (sx, y, u, v) in ((-1, 0, 0, 1), (1, 0, 1, 1), (1, h, 1, 0), (-1, h, 0, 0)):
            pos.append((dx * sx, y, dz * sx)); nrm.append((0.0, 1.0, 0.0)); uv.append((u, v))     # lit like the ground: normals up
        idx += [base, base + 1, base + 2, base, base + 2, base + 3]
    def pack(fmt, items): return b''.join(struct.pack('<' + fmt, *it) for it in items)
    bufs = [pack('fff', pos), pack('fff', nrm), pack('ff', uv), b''.join(struct.pack('<H', i) for i in idx), tex]
    views, blob, off = [], b'', 0
    for i, b in enumerate(bufs):
        pad = (-len(b)) % 4; views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b)}); blob += b + b'\x00' * pad; off += len(b) + pad
    mins = [min(p[i] for p in pos) for i in range(3)]; maxs = [max(p[i] for p in pos) for i in range(3)]
    j = {
        'asset': {'version': '2.0', 'generator': 'make_grass.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': 'grass_card'}],
        'meshes': [{'name': 'grass_card', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
        'materials': [{'name': 'grass_card', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.85}, 'alphaMode': 'MASK', 'alphaCutoff': 0.45, 'doubleSided': True}],
        'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
        'images': [{'bufferView': 4, 'mimeType': 'image/png', 'name': 'grass_blades'}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': mins, 'max': maxs},
            {'bufferView': 1, 'componentType': 5126, 'count': len(nrm), 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5126, 'count': len(uv), 'type': 'VEC2'},
            {'bufferView': 3, 'componentType': 5123, 'count': len(idx), 'type': 'SCALAR'}],
        'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + blob
    return out, tex


if __name__ == '__main__':
    data, tex = glb()
    with open(os.path.join(HERE, 'grass_card.glb'), 'wb') as f: f.write(data)
    with open(os.path.join(HERE, 'grass_blades.png'), 'wb') as f: f.write(tex)   # the same texture, handy to look at
    print('wrote grass_card.glb (%d bytes) and grass_blades.png' % len(data))
