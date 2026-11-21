"""Find where the pitch goes: the largest connected grass patch of the street export (node map_mesh_0 in
nunhead_green.glb) is Nunhead Green itself. Writes unreal/pitch.json with its centre, long axis and half extents in the
export's own metres / Y-up frame; build_green.py maps those into the level. Standard library only:
    python unreal\\find_pitch.py"""
import json, math, os, struct

HERE = os.path.dirname(os.path.abspath(__file__))


def read_glb(path):
    with open(path, 'rb') as f:
        f.read(12); n, _ = struct.unpack('<II', f.read(8)); j = json.loads(f.read(n)); f.read(8); blob = f.read()
    return j, blob


def accessor(j, blob, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]; fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
    size = struct.calcsize('<' + fmt) * comps; stride = v.get('byteStride') or size
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * comps, blob, off + k * stride) for k in range(a['count'])]


def main():
    j, blob = read_glb(os.path.join(HERE, 'nunhead_green.glb'))
    node = next(n for n in j['nodes'] if n.get('name') == 'map_mesh_0')
    prim = j['meshes'][node['mesh']]['primitives'][0]
    P = accessor(j, blob, prim['attributes']['POSITION']); I = [t[0] for t in accessor(j, blob, prim['indices'])]
    tris = [(I[k], I[k + 1], I[k + 2]) for k in range(0, len(I), 3)]
    # weld vertices by position, then union-find triangles that share a welded vertex
    key = {}; vid = []
    for p in P:
        k = (round(p[0], 2), round(p[1], 2), round(p[2], 2)); vid.append(key.setdefault(k, len(key)))
    parent = list(range(len(key)))
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    def union(a, b):
        a, b = find(a), find(b)
        if a != b: parent[a] = b
    for a, b, c in tris: union(vid[a], vid[b]); union(vid[a], vid[c])
    comp = {}
    for a, b, c in tris:
        pa, pb, pc = P[a], P[b], P[c]
        area = 0.5 * abs((pb[0] - pa[0]) * (pc[2] - pa[2]) - (pc[0] - pa[0]) * (pb[2] - pa[2]))   # projected on the ground plane (x, z)
        cx, cy, cz = (pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3
        c = comp.setdefault(find(vid[a]), {'area': 0.0, 'sx': 0.0, 'sy': 0.0, 'sz': 0.0, 'tris': []})
        c['area'] += area; c['sx'] += cx * area; c['sy'] += cy * area; c['sz'] += cz * area; c['tris'].append((cx, cz, area))
    big = max(comp.values(), key=lambda c: c['area'])
    A = big['area']; cx, cy, cz = big['sx'] / A, big['sy'] / A, big['sz'] / A
    # long axis by weighted PCA of the triangle centroids on the ground plane
    sxx = sum((x - cx) ** 2 * w for x, z, w in big['tris']) / A; szz = sum((z - cz) ** 2 * w for x, z, w in big['tris']) / A; sxz = sum((x - cx) * (z - cz) * w for x, z, w in big['tris']) / A
    ang = 0.5 * math.atan2(2 * sxz, sxx - szz); ax, az = math.cos(ang), math.sin(ang)
    along = [((x - cx) * ax + (z - cz) * az) for x, z, w in big['tris']]; across = [(-(x - cx) * az + (z - cz) * ax) for x, z, w in big['tris']]
    out = {
        'up_axis': 'Y', 'units': 'm', 'source': 'nunhead_green.glb node map_mesh_0, largest connected patch',
        'centre_gltf': [round(cx, 2), round(cy, 2), round(cz, 2)], 'long_axis_gltf_xz': [round(ax, 4), round(az, 4)],
        'half_length_m': round((max(along) - min(along)) / 2, 1), 'half_width_m': round((max(across) - min(across)) / 2, 1), 'area_m2': round(A, 1),
        'patches': len(comp), 'mesh_min_gltf': [round(min(p[i] for p in P), 2) for i in range(3)], 'mesh_max_gltf': [round(max(p[i] for p in P), 2) for i in range(3)]}
    with open(os.path.join(HERE, 'pitch.json'), 'w') as f: json.dump(out, f, indent=2)
    print(json.dumps(out, indent=2))


if __name__ == '__main__': main()
