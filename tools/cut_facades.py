"""Cut rectified facade textures out of the indexed reference photos and write the manifest the game reads.

    python tools\\cut_facades.py reference\\nunhead_green

Reads <folder>/index.json (from photo_index.py) and <folder>/facades.json (hand-picked corner quads, see its _note).
For each facade: the quad's left and right columns become bearings from the camera (position, heading and lens from
the index); each ray's first hit on a building footprint, snapped to the nearest footprint corner, is where that end
of the texture lands on the map. The quad is perspective-warped to a flat rectangle of width (metres between the ends)
by the given height, at PPM pixels per metre, cut from the full-size original when it is beside the JPEG.
Writes public/textures/facades/<name>.jpg and public/maps/facades.json: [{name, texture, left, right, height, ...}],
left and right in map metres (x east, z south) as seen from the street, and <folder>/facades_map.png to check."""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageOps
try:
    import pillow_heif; pillow_heif.register_heif_opener()
except ImportError: pass

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, 'public', 'maps', 'selondon.json')
OUT_TEX = os.path.join(ROOT, 'public', 'textures', 'facades'); OUT_MANIFEST = os.path.join(ROOT, 'public', 'maps', 'facades.json')
PPM = 80; MAX_PX = 4096; RAY_MAX = 120.0; SNAP = 3.0


def seg_hit(o, d, a, b):
    ex, ez = b[0] - a[0], b[1] - a[1]; den = d[0] * ez - d[1] * ex
    if abs(den) < 1e-9: return None
    ax, az = a[0] - o[0], a[1] - o[1]; t = (ax * ez - az * ex) / den; u = (ax * d[1] - az * d[0]) / den
    return t if (t > 0 and 0 <= u <= 1) else None


def first_hit(bld, o, bearing):
    h = math.radians(bearing); d = (math.sin(h), -math.cos(h)); best = None
    for bi, b in enumerate(bld):
        pts = b['p']; n = len(pts)
        if math.hypot(pts[0][0] - o[0], pts[0][1] - o[1]) > RAY_MAX + 80: continue
        for i in range(n):
            t = seg_hit(o, d, pts[i], pts[(i + 1) % n])
            if t is not None and t <= RAY_MAX and (best is None or t < best[0]): best = (t, bi, i)
    if best is None: return None
    t, bi, i = best
    return {'t': t, 'building': bi, 'edge': i, 'x': o[0] + d[0] * t, 'z': o[1] + d[1] * t}


def snap(bld, pt, near):
    best = None
    for bi in near:
        for p in bld[bi]['p']:
            dd = math.hypot(p[0] - pt[0], p[1] - pt[1])
            if dd <= SNAP and (best is None or dd < best[0]): best = (dd, p)
    return (list(best[1]), True) if best else ([round(pt[0], 2), round(pt[1], 2)], False)


def frontage(bld, ids, cam, heading):
    h = math.radians(heading); vd = (math.sin(h), -math.cos(h)); rv = (math.cos(h), math.sin(h))
    edges = []
    for bi in ids:
        pts = bld[bi]['p']; n = len(pts)
        area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
        for i in range(n):
            a, c = pts[i], pts[(i + 1) % n]; ex, ez = c[0] - a[0], c[1] - a[1]; L = math.hypot(ex, ez)
            if L < 0.5: continue
            nx, nz = (ez / L, -ex / L) if area > 0 else (-ez / L, ex / L)       # outward for this winding (x east, z south)
            mx, mz = (a[0] + c[0]) / 2, (a[1] + c[1]) / 2
            if (cam[0] - mx) * nx + (cam[1] - mz) * nz <= 0: continue           # back wall
            if abs(vd[0] * nx + vd[1] * nz) < 0.35: continue                       # side wall, seen edge-on
            edges.append((a, c, L))
    if not edges: raise SystemExit('no camera-facing edges on buildings %s' % ids)
    # one direction for the row, pointing to the camera's right, weighted by edge length
    dx = dz = 0.0
    for a, c, L in edges:
        ex, ez = c[0] - a[0], c[1] - a[1]
        if ex * rv[0] + ez * rv[1] < 0: ex, ez = -ex, -ez
        dx += ex; dz += ez
    n = math.hypot(dx, dz); dx, dz = dx / n, dz / n
    tot = sum(L for _, _, L in edges); cx = sum((a[0] + c[0]) / 2 * L for a, c, L in edges) / tot; cz = sum((a[1] + c[1]) / 2 * L for a, c, L in edges) / tot
    us = [((p[0] - cx) * dx + (p[1] - cz) * dz) for a, c, _ in edges for p in (a, c)]
    u0, u1 = min(us), max(us)
    return [round(cx + dx * u0, 2), round(cz + dz * u0, 2)], [round(cx + dx * u1, 2), round(cz + dz * u1, 2)]


def buildings_on(bld, L, R):
    lx, lz = L; rx, rz = R; ex, ez = rx - lx, rz - lz; n = math.hypot(ex, ez) or 1; ex, ez = ex / n, ez / n; out = set()
    for bi, b in enumerate(bld):
        pts = b['p']
        if math.hypot(pts[0][0] - lx, pts[0][1] - lz) > n + 60: continue
        for i in range(len(pts)):
            a, c = pts[i], pts[(i + 1) % len(pts)]
            # the same rule as src/map.js: midpoint within 2 m of the line, direction within 45 degrees, a metre of overlap
            dx, dz = c[0] - a[0], c[1] - a[1]; L = math.hypot(dx, dz) or 1
            if abs((dx * ex + dz * ez) / L) < 0.7: continue
            mx, mz = (a[0] + c[0]) / 2 - lx, (a[1] + c[1]) / 2 - lz
            if abs(mx * ez - mz * ex) > 2.0: continue
            ua = (a[0] - lx) * ex + (a[1] - lz) * ez; uc = (c[0] - lx) * ex + (c[1] - lz) * ez
            if max(ua, uc) > 1 and min(ua, uc) < n - 1: out.add(bi)
    return sorted(out)


def jpeg_size(folder, rec):
    """The quads are picked on the JPEG copy, whatever size the index was last run at."""
    with Image.open(os.path.join(folder, rec['jpeg'])) as j: return j.size


def perspective_coeffs(src, dst):
    """PIL wants the output->input mapping: coefficients taking dst corners to src corners."""
    A = []; B = []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()


def cut(folder, rec, quad, width_m, height_m, out_path):
    src = os.path.join(folder, rec['source'])
    if not os.path.exists(src): src = os.path.join(folder, rec['jpeg'])
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    jw, jh = jpeg_size(folder, rec); s = im.width / jw
    q = [(x * s, y * s) for x, y in quad]
    W = min(MAX_PX, int(round(width_m * PPM))); H = min(MAX_PX, int(round(height_m * PPM)))
    co = perspective_coeffs(q, [(0, 0), (W, 0), (W, H), (0, H)])
    out = im.transform((W, H), Image.PERSPECTIVE, co, Image.BICUBIC)
    os.makedirs(os.path.dirname(out_path), exist_ok=True); out.save(out_path, 'JPEG', quality=88, optimize=True)
    return W, H, im.width


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'reference', 'nunhead_green')
    m = json.load(open(MAP, encoding='utf-8')); bld = m['buildings']
    idx = {r['source'].rsplit('.', 1)[0]: r for r in json.load(open(os.path.join(folder, 'index.json'), encoding='utf-8'))['photos']}
    spec = json.load(open(os.path.join(folder, 'facades.json'), encoding='utf-8'))['facades']
    manifest = []
    for f in spec:
        rec = idx[f['photo']]; jw, jh = jpeg_size(folder, rec)
        focal = (jw / 2) / math.tan(math.radians(rec['hfov'] / 2))
        ends = []
        if f.get('ends'):
            ends = [(list(f['ends'][0]), True, None), (list(f['ends'][1]), True, None)]
        elif f.get('buildings'):
            # the frontage of the named buildings: their edges that face the camera, projected on to one line
            L, R = frontage(bld, f['buildings'], (rec['x'], rec['z']), rec['heading'])
            ends = [(L, True, None), (R, True, None)]
        for px in ([] if ends else ((f['quad'][0][0] + f['quad'][3][0]) / 2, (f['quad'][1][0] + f['quad'][2][0]) / 2)):
            bearing = rec['heading'] + math.degrees(math.atan((px - jw / 2) / focal))
            hit = first_hit(bld, (rec['x'], rec['z']), bearing)
            if hit is None: print('%s: the %s edge ray at %.1f deg hits nothing' % (f['name'], 'left' if not ends else 'right', bearing)); break
            pt, snapped = snap(bld, (hit['x'], hit['z']), [hit['building']])
            ends.append((pt, snapped, hit))
        if len(ends) < 2: continue
        (L, ls, lh), (R, rs, rh) = ends
        width = math.hypot(R[0] - L[0], R[1] - L[1])
        if width < 2: print('%s: ends %.1f m apart, skipped' % (f['name'], width)); continue
        on = buildings_on(bld, L, R)
        name = f['name']; tex = os.path.join(OUT_TEX, name + '.jpg')
        W, H, srcw = cut(folder, rec, f['quad'], width, f['height'], tex)
        print('%-18s %s  L %s%s R %s%s  %.1f x %.1f m  %dx%d px from %d px  buildings %s' % (name, f['photo'], L, '' if ls else '~', R, '' if rs else '~', width, f['height'], W, H, srcw,
              [str(b) + (('=' + bld[b]['n']) if bld[b].get('n') else '') for b in on]))
        manifest.append({'name': name, 'texture': 'textures/facades/' + name + '.jpg', 'left': L, 'right': R, 'width': round(width, 2), 'height': f['height'],
                         'buildings': on, 'photo': rec['source'], 'camera': [rec['x'], rec['z']], 'heading': rec['heading']})
    json.dump({'generator': 'tools/cut_facades.py', 'axes': 'x east, z south, metres; left/right as seen from the street', 'facades': manifest},
              open(OUT_MANIFEST, 'w', encoding='utf-8'), indent=1)
    draw_check(bld, manifest, os.path.join(folder, 'facades_map.png'))
    print('wrote', OUT_MANIFEST, 'and facades_map.png')


def draw_check(bld, manifest, out, scale=5.0, pad=40):
    if not manifest: return
    xs = [p[0] for f in manifest for p in (f['left'], f['right'])] + [f['camera'][0] for f in manifest]
    zs = [p[1] for f in manifest for p in (f['left'], f['right'])] + [f['camera'][1] for f in manifest]
    x0, z0 = min(xs) - pad, min(zs) - pad; W = int((max(xs) - x0 + pad) * scale); H = int((max(zs) - z0 + pad) * scale)
    im = Image.new('RGB', (W, H), (245, 243, 238)); dr = ImageDraw.Draw(im); P = lambda x, z: ((x - x0) * scale, (z - z0) * scale)
    hit = {b for f in manifest for b in f['buildings']}
    for bi, b in enumerate(bld):
        pts = [P(*p) for p in b['p']]
        if all(px < 0 or px > W or pz < 0 or pz > H for px, pz in pts): continue
        dr.polygon(pts, fill=(255, 225, 160) if bi in hit else (215, 210, 200), outline=(120, 110, 100))
    for f in manifest:
        dr.line([P(*f['left']), P(*f['right'])], fill=(30, 160, 60), width=5)
        dr.line([P(*f['camera']), P(*f['left'])], fill=(60, 90, 200), width=1); dr.line([P(*f['camera']), P(*f['right'])], fill=(60, 90, 200), width=1)
        c = P(*f['camera']); dr.ellipse([c[0] - 4, c[1] - 4, c[0] + 4, c[1] + 4], fill=(30, 60, 180))
        mid = P((f['left'][0] + f['right'][0]) / 2, (f['left'][1] + f['right'][1]) / 2); dr.text((mid[0] + 4, mid[1] + 4), f['name'], fill=(0, 80, 0))
    im.save(out)


if __name__ == '__main__': main()
