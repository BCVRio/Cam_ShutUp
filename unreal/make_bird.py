"""Write unreal/bird.glb: the street-life birds as four tiny meshes, a body (a squashed low-poly ball, nose along +X)
and a wing (one triangle sweeping out to +Z, which Interchange turns into Unreal's +Y) in dark (the flocks over the
greens) and grey (the pigeons on the grass). Metres, Y up, no textures; the C++ BirdFlock actor mirrors the wing for
the other side and flaps both. Standard library only:   python unreal\\make_bird.py"""
import json, math, os, struct

HERE = os.path.dirname(os.path.abspath(__file__))


def body(rings=5, segs=8, r=0.05, sx=2.2, sy=0.8, sz=1.0):
    pos, nrm, idx = [], [], []
    for i in range(rings + 1):
        phi = math.pi * i / rings
        for j in range(segs):
            th = 2 * math.pi * j / segs
            n = (math.sin(phi) * math.cos(th), math.cos(phi), math.sin(phi) * math.sin(th))
            pos.append((n[0] * r * sx, n[1] * r * sy, n[2] * r * sz)); nrm.append(n)
    for i in range(rings):
        for j in range(segs):
            a = i * segs + j; b = i * segs + (j + 1) % segs; c = (i + 1) * segs + j; d = (i + 1) * segs + (j + 1) % segs
            idx += [a, c, b, b, c, d]
    return pos, nrm, idx


def wing():
    pos = [(0.0, 0.0, 0.0), (0.08, 0.05, 0.32), (-0.08, 0.05, 0.32)]
    nrm = [(0.0, 1.0, 0.0)] * 3
    return pos, nrm, [0, 1, 2]


def glb():
    parts = [('bird_body_dark', body(), 0), ('bird_wing_dark', wing(), 0), ('bird_body_grey', body(), 1), ('bird_wing_grey', wing(), 1)]
    def pack(fmt, items): return b''.join(struct.pack('<' + fmt, *it) for it in items)
    views, accessors, meshes, nodes, blob, off = [], [], [], [], b'', 0
    def add_view(b):
        nonlocal blob, off
        pad = (-len(b)) % 4; views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b)}); blob += b + b'\x00' * pad; off += len(b) + pad
        return len(views) - 1
    for name, (pos, nrm, idx), mat in parts:
        vp, vn, vi = add_view(pack('fff', pos)), add_view(pack('fff', nrm)), add_view(b''.join(struct.pack('<H', i) for i in idx))
        mins = [min(p[i] for p in pos) for i in range(3)]; maxs = [max(p[i] for p in pos) for i in range(3)]
        a0 = len(accessors)
        accessors += [{'bufferView': vp, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': mins, 'max': maxs},
                      {'bufferView': vn, 'componentType': 5126, 'count': len(nrm), 'type': 'VEC3'},
                      {'bufferView': vi, 'componentType': 5123, 'count': len(idx), 'type': 'SCALAR'}]
        meshes.append({'name': name, 'primitives': [{'attributes': {'POSITION': a0, 'NORMAL': a0 + 1}, 'indices': a0 + 2, 'material': mat}]})
        nodes.append({'mesh': len(meshes) - 1, 'name': name})
    j = {'asset': {'version': '2.0', 'generator': 'make_bird.py'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
         'materials': [{'name': 'bird_dark', 'pbrMetallicRoughness': {'baseColorFactor': [0.06, 0.06, 0.07, 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.9}, 'doubleSided': True},
                       {'name': 'bird_grey', 'pbrMetallicRoughness': {'baseColorFactor': [0.40, 0.40, 0.43, 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.9}, 'doubleSided': True}],
         'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    return b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + blob


if __name__ == '__main__':
    out = os.path.join(HERE, 'bird.glb')
    with open(out, 'wb') as f: f.write(glb())
    print('wrote', out, os.path.getsize(out), 'bytes')
