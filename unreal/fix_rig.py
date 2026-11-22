"""Normalise a character GLB's units for Unreal, writing a copy: the browser models keep the mesh in metres but the
armature in centimetres under an 'Armature' node scaled 0.01, with that 100 hidden in the inverse bind matrices.
Interchange keeps the mesh at metre size and the animations at centimetre size, so a clip blows the limbs out a
hundredfold and a blend space freezes. This bakes the armature scale away: joints and animation translations in
metres, bind matrices to match, the armature at scale 1. Standard library only, idempotent:
    python unreal\\fix_rig.py public\\models\\cam.glb unreal\\characters\\cam.glb"""
import json, os, struct, sys


def fix(src, dst):
    with open(src, 'rb') as f: data = bytearray(f.read())
    n = struct.unpack_from('<I', data, 12)[0]; j = json.loads(bytes(data[20:20 + n]))
    bin_off = 20 + n + 8
    acc, bv, nodes = j['accessors'], j['bufferViews'], j['nodes']
    def layout(ai):
        a = acc[ai]; v = bv[a['bufferView']]; comps = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        assert a['componentType'] == 5126, 'float accessors only'
        return bin_off + v.get('byteOffset', 0) + a.get('byteOffset', 0), v.get('byteStride') or 4 * comps, comps, a['count']
    def scale_accessor(ai, factor, mask=None):
        off, stride, comps, count = layout(ai)
        for k in range(count):
            vals = list(struct.unpack_from('<' + 'f' * comps, data, off + k * stride))
            vals = [v * factor if (mask is None or mask[i]) else v for i, v in enumerate(vals)]
            struct.pack_into('<' + 'f' * comps, data, off + k * stride, *vals)
        a = acc[ai]
        for key in ('min', 'max'):
            if key in a: a[key] = [v * factor if (mask is None or mask[i]) else v for i, v in enumerate(a[key])]
    parent = {}
    for i, nd in enumerate(nodes):
        for c in nd.get('children', []): parent[c] = i
    done_anim = set(); report = []
    for skin in j.get('skins', []):
        joints = skin['joints']
        # the armature: the nearest ancestor of the first joint carrying a uniform scale other than 1
        k = joints[0]; arm = None
        while k in parent:
            k = parent[k]; s = nodes[k].get('scale')
            if s and abs(s[0] - 1) > 1e-6 and abs(s[0] - s[1]) < 1e-6 and abs(s[0] - s[2]) < 1e-6: arm = k; break
        if arm is None: report.append('skin: armature already at scale 1'); continue
        s = nodes[arm]['scale'][0]
        nodes[arm]['scale'] = [1.0, 1.0, 1.0]
        for ji in joints:
            t = nodes[ji].get('translation')
            if t: nodes[ji]['translation'] = [v * s for v in t]
        if 'inverseBindMatrices' in skin:
            mask = [r != 3 for c in range(4) for r in range(4)]     # column-major: every element but the bottom row
            scale_accessor(skin['inverseBindMatrices'], s, mask)
        jset = set(joints)
        for an in j.get('animations', []):
            for ch in an['channels']:
                if ch['target'].get('node') in jset and ch['target']['path'] == 'translation':
                    out = an['samplers'][ch['sampler']]['output']
                    if out not in done_anim: scale_accessor(out, s); done_anim.add(out)
        report.append('skin: armature %s scale %g baked into %d joints, bind matrices and %d translation tracks' % (nodes[arm].get('name'), s, len(joints), len(done_anim)))
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    blob = bytes(data[bin_off:])
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + blob
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    with open(dst, 'wb') as f: f.write(out)
    return report


if __name__ == '__main__':
    src = sys.argv[1]; dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'characters', os.path.basename(src))
    for line in fix(src, dst): print(line)
    print('wrote', dst)
