"""Make every triangle's winding agree with its stored normals, in place, in a GLB (nunhead_green.glb by default).
The browser export has the terrace facades wound inside-out (mirrored geometry), which Unreal lights as if the walls
faced into the houses: black fronts under a dynamic sun. Only the index buffer is touched. Standard library only:
    python unreal\\fix_winding.py [file.glb]"""
import json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def main(path):
    with open(path, 'rb') as f: data = bytearray(f.read())
    n, _ = struct.unpack_from('<II', data, 12); j = json.loads(bytes(data[20:20 + n]))
    bin_off = 20 + n + 8   # the BIN chunk's payload starts after its 8 byte header
    acc, bv = j['accessors'], j['bufferViews']
    def layout(ai):
        a = acc[ai]; v = bv[a['bufferView']]; comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]; fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
        size = struct.calcsize('<' + fmt) * comps; return bin_off + v.get('byteOffset', 0) + a.get('byteOffset', 0), v.get('byteStride') or size, fmt, comps, a['count']
    def read(ai):
        off, stride, fmt, comps, count = layout(ai); return [struct.unpack_from('<' + fmt * comps, data, off + k * stride) for k in range(count)]
    flipped = total = 0; per_mesh = []
    for mi, m in enumerate(j['meshes']):
        for prim in m['primitives']:
            if 'indices' not in prim or 'NORMAL' not in prim['attributes']: continue
            P = read(prim['attributes']['POSITION']); N = read(prim['attributes']['NORMAL']); I = [t[0] for t in read(prim['indices'])]
            off, stride, fmt, comps, count = layout(prim['indices']); fl = 0
            for k in range(0, len(I) - 2, 3):
                a, b, c = P[I[k]], P[I[k + 1]], P[I[k + 2]]
                e1 = (b[0] - a[0], b[1] - a[1], b[2] - a[2]); e2 = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
                g = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
                nn = N[I[k]]; d = g[0] * nn[0] + g[1] * nn[1] + g[2] * nn[2]
                if d < 0:   # swap the second and third index: same triangle, opposite winding
                    struct.pack_into('<' + fmt, data, off + (k + 1) * stride, I[k + 2]); struct.pack_into('<' + fmt, data, off + (k + 2) * stride, I[k + 1]); fl += 1
            total += len(I) // 3; flipped += fl
            if fl: per_mesh.append((m.get('name') or 'mesh %d' % mi, fl, len(I) // 3))
    with open(path, 'wb') as f: f.write(data)
    for name, fl, n_ in sorted(per_mesh, key=lambda x: -x[1])[:12]: print('%-28s flipped %5d of %5d' % (name, fl, n_))
    print('flipped %d of %d triangles in %d meshes; wrote %s' % (flipped, total, len(per_mesh), os.path.basename(path)))


if __name__ == '__main__': main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'nunhead_green.glb'))
