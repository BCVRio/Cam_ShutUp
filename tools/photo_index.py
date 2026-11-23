"""Index a folder of reference photos against the map: read each original's GPS, compass heading and lens, convert it
to a JPEG for the repo, project the position into map metres and cast a ray along the heading to find the building
facade it looks at. Writes <folder>/index.json, <folder>/map.png (positions, view wedges, hit facades) and
<folder>/contact.jpg (numbered thumbnails).

    python tools\\photo_index.py reference\\nunhead_green            (HEIC/JPG originals in that folder)
    python tools\\photo_index.py reference\\nunhead_green --no-jpeg  (metadata and map only)

Map axes: x east, z south, metres from public/maps/selondon.json's origin (same formula as tools/build_map.py).
Heading: EXIF GPSImgDirection, degrees clockwise from true north, so the view direction is (sin h, -cos h).
Needs Pillow and pillow-heif (pip install pillow pillow-heif)."""
import json, math, os, sys, glob
from PIL import Image, ImageDraw, ImageFont, ImageOps
try:
    import pillow_heif; pillow_heif.register_heif_opener()
except ImportError: pass

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, 'public', 'maps', 'selondon.json')
JPEG_LONG_SIDE = 2400; JPEG_QUALITY = 86
RAY_MAX = 90.0            # metres: a facade further than this is not what the photo is of
MAP_PAD = 60.0            # metres round the photos on the overview
MAP_SCALE = 4.0           # pixels per metre


def load_map():
    m = json.load(open(MAP, encoding='utf-8'))
    lat0, lon0 = m['origin']['lat'], m['origin']['lon']
    kx = math.cos(math.radians(lat0)) * 111320.0; kz = 110574.0
    def proj(lat, lon): return ((lon - lon0) * kx, -(lat - lat0) * kz)
    return m, proj


def dms(v):
    try: return float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
    except Exception: return None


def read_meta(path):
    im = Image.open(path); ex = im.getexif()
    out = {'file': os.path.basename(path), 'width': im.width, 'height': im.height}
    try: sub = ex.get_ifd(0x8769)
    except Exception: sub = {}
    try: gps = ex.get_ifd(0x8825)
    except Exception: gps = {}
    out['model'] = ex.get(0x0110); out['orientation'] = ex.get(0x0112, 1)
    out['taken'] = sub.get(0x9003); out['focal35'] = sub.get(0xA405)
    lat, lon = dms(gps.get(2)), dms(gps.get(4))
    if lat is not None and gps.get(1) == 'S': lat = -lat
    if lon is not None and gps.get(3) == 'W': lon = -lon
    out['lat'], out['lon'] = lat, lon
    out['alt'] = float(gps[6]) if 6 in gps else None
    out['heading'] = float(gps[17]) if 17 in gps else None
    out['heading_ref'] = gps.get(16)
    out['hdop'] = float(gps[11]) if 11 in gps else None
    # horizontal field of view from the 35 mm-equivalent focal length (that figure is for the 36 x 24 frame's
    # diagonal; the phone's 4:3 frame is a touch narrower, close enough for a wedge on a map)
    if out['focal35']:
        diag = math.degrees(2 * math.atan(21.63 / float(out['focal35'])))
        portrait = im.height > im.width or out['orientation'] in (5, 6, 7, 8)
        out['hfov'] = round(diag * (0.6 if portrait else 0.8), 1)
    else: out['hfov'] = None
    return out


def seg_hit(o, d, a, b):
    """Ray o + t d against segment a-b: (t, u) or None."""
    ex, ez = b[0] - a[0], b[1] - a[1]
    den = d[0] * ez - d[1] * ex
    if abs(den) < 1e-9: return None
    ax, az = a[0] - o[0], a[1] - o[1]
    t = (ax * ez - az * ex) / den
    u = (ax * d[1] - az * d[0]) / den
    if t > 0 and 0 <= u <= 1: return t, u
    return None


def cast(m, o, heading, hfov):
    """The building edge the view centre hits first, plus every building whose footprint lies inside the view wedge."""
    h = math.radians(heading); d = (math.sin(h), -math.cos(h))
    best = None; inview = {}
    for bi, b in enumerate(m['buildings']):
        pts = b['p']; n = len(pts)
        cx = sum(p[0] for p in pts) / n; cz = sum(p[1] for p in pts) / n
        dist = math.hypot(cx - o[0], cz - o[1])
        if dist > RAY_MAX + 60: continue
        for i in range(n):
            a, c = pts[i], pts[(i + 1) % n]
            hit = seg_hit(o, d, a, c)
            if hit and hit[0] <= RAY_MAX and (best is None or hit[0] < best['t']):
                ex, ez = c[0] - a[0], c[1] - a[1]; L = math.hypot(ex, ez) or 1
                # angle between the view direction and the edge normal: 0 means dead frontal
                nx, nz = -ez / L, ex / L
                cosang = abs(d[0] * nx + d[1] * nz)
                best = {'t': round(hit[0], 1), 'building': bi, 'name': b.get('n', ''), 'kind': b['k'], 'height': b['h'],
                        'edge': [list(a), list(c)], 'edge_len': round(L, 1), 'frontal_deg': round(math.degrees(math.acos(min(1, cosang))), 1)}
        if hfov:
            ang = math.degrees(math.atan2(cx - o[0], -(cz - o[1]))) % 360
            off = (ang - heading + 180) % 360 - 180
            if abs(off) <= hfov / 2 and dist <= RAY_MAX:
                inview[bi] = {'building': bi, 'name': b.get('n', ''), 'kind': b['k'], 'dist': round(dist, 1), 'bearing_off': round(off, 1)}
    return best, sorted(inview.values(), key=lambda r: (abs(r['bearing_off']), r['dist']))


def to_jpeg(path, out):
    im = Image.open(path); im = ImageOps.exif_transpose(im).convert('RGB')
    s = JPEG_LONG_SIDE / max(im.size)
    if s < 1: im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(out, 'JPEG', quality=JPEG_QUALITY, optimize=True)
    return im.size


def font(size):
    for name in ('arial.ttf', 'DejaVuSans.ttf', 'segoeui.ttf'):
        try: return ImageFont.truetype(name, size)
        except Exception: pass
    return ImageFont.load_default()


def draw_map(m, recs, out):
    xs = [r['x'] for r in recs if r.get('x') is not None]; zs = [r['z'] for r in recs if r.get('z') is not None]
    if not xs: return
    x0, x1 = min(xs) - MAP_PAD, max(xs) + MAP_PAD; z0, z1 = min(zs) - MAP_PAD, max(zs) + MAP_PAD
    W, H = int((x1 - x0) * MAP_SCALE), int((z1 - z0) * MAP_SCALE)
    im = Image.new('RGB', (W, H), (245, 243, 238)); dr = ImageDraw.Draw(im, 'RGBA')
    P = lambda x, z: ((x - x0) * MAP_SCALE, (z - z0) * MAP_SCALE)
    hit_edges = {(r['facade']['building'], tuple(map(tuple, r['facade']['edge']))) for r in recs if r.get('facade')}
    hit_b = {r['facade']['building'] for r in recs if r.get('facade')}
    for road in m.get('roads', []):
        pts = road.get('p') or road.get('pts') or []
        if len(pts) > 1: dr.line([P(*p) for p in pts], fill=(255, 255, 255), width=int(MAP_SCALE * (road.get('w', 6))))
    for a in m.get('areas', []):
        pts = a.get('p') or []
        if len(pts) > 2 and str(a.get('k', '')).startswith(('park', 'green', 'grass', 'playground', 'pitch')): dr.polygon([P(*p) for p in pts], fill=(205, 228, 190))
    for bi, b in enumerate(m['buildings']):
        pts = [P(*p) for p in b['p']]
        if all(px < 0 or px > W or pz < 0 or pz > H for px, pz in pts): continue
        dr.polygon(pts, fill=(255, 230, 170) if bi in hit_b else (215, 210, 200), outline=(120, 110, 100))
    f = font(int(MAP_SCALE * 2.6)); fs = font(int(MAP_SCALE * 2))
    for bi, b in enumerate(m['buildings']):
        if b.get('n') and bi in hit_b:
            cx = sum(p[0] for p in b['p']) / len(b['p']); cz = sum(p[1] for p in b['p']) / len(b['p'])
            dr.text(P(cx, cz), b['n'], fill=(60, 50, 40), font=fs, anchor='mm')
    for r in recs:
        if r.get('x') is None: continue
        o = P(r['x'], r['z'])
        if r.get('heading') is not None:
            h = math.radians(r['heading']); L = (r['facade']['t'] if r.get('facade') else 30) * MAP_SCALE
            if r.get('hfov'):
                a0 = h - math.radians(r['hfov'] / 2); a1 = h + math.radians(r['hfov'] / 2)
                wedge = [o] + [(o[0] + L * math.sin(a0 + (a1 - a0) * k / 12), o[1] - L * math.cos(a0 + (a1 - a0) * k / 12)) for k in range(13)]
                dr.polygon(wedge, fill=(70, 120, 220, 40))
            dr.line([o, (o[0] + L * math.sin(h), o[1] - L * math.cos(h))], fill=(40, 80, 200), width=2)
        if r.get('facade'):
            e = r['facade']['edge']; dr.line([P(*e[0]), P(*e[1])], fill=(220, 60, 40), width=4)
        dr.ellipse([o[0] - 5, o[1] - 5, o[0] + 5, o[1] + 5], fill=(30, 60, 180), outline='white')
        dr.text((o[0] + 7, o[1] - 7), r['label'], fill=(20, 30, 120), font=f)
    dr.text((8, 8), 'x east, z south, metres; 1 px = %.2f m; blue: photo and view centre; red: facade hit; shaded: in view' % (1 / MAP_SCALE), fill=(60, 60, 60), font=fs)
    im.save(out)


def contact_sheet(recs, folder, out, cols=6, cell=360):
    recs = [r for r in recs if r.get('jpeg')]
    rows = (len(recs) + cols - 1) // cols
    im = Image.new('RGB', (cols * cell, rows * (cell + 28)), 'white'); dr = ImageDraw.Draw(im); f = font(18)
    for i, r in enumerate(recs):
        t = Image.open(os.path.join(folder, r['jpeg'])); t.thumbnail((cell - 8, cell - 8))
        x, y = (i % cols) * cell, (i // cols) * (cell + 28)
        im.paste(t, (x + 4, y + 4 + (cell - 8 - t.height) // 2))
        cap = '%s  %s' % (r['label'], (r['facade']['name'] or r['facade']['kind']) if r.get('facade') else 'no facade')
        dr.text((x + 6, y + cell + 2), cap, fill='black', font=f)
    im.save(out, 'JPEG', quality=80)


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'reference', 'nunhead_green')
    make_jpeg = '--no-jpeg' not in sys.argv
    m, proj = load_map()
    overrides = load_json(os.path.join(folder, 'overrides.json')); captions = load_json(os.path.join(folder, 'captions.json'))
    files = sorted(f for f in glob.glob(os.path.join(folder, '*')) if f.lower().endswith(('.heic', '.heif', '.jpg', '.jpeg')) and not os.path.basename(f).startswith(('contact', 'map')))
    originals = [f for f in files if f.lower().endswith(('.heic', '.heif'))] or files
    recs = []
    for i, path in enumerate(originals):
        r = read_meta(path); r['label'] = '%02d' % (i + 1); r['source'] = os.path.basename(path)
        stem = os.path.splitext(os.path.basename(path))[0]
        if make_jpeg and not path.lower().endswith(('.jpg', '.jpeg')):
            r['jpeg'] = stem + '.jpg'; r['jpeg_size'] = to_jpeg(path, os.path.join(folder, r['jpeg']))
        elif path.lower().endswith(('.jpg', '.jpeg')): r['jpeg'] = os.path.basename(path)
        elif os.path.exists(os.path.join(folder, stem + '.jpg')): r['jpeg'] = stem + '.jpg'     # converted on an earlier run
        r['caption'] = captions.get(r['source'], '')
        if r['lat'] is not None:
            x, z = proj(r['lat'], r['lon']); r['x'], r['z'] = round(x, 1), round(z, 1)
        ov = overrides.get(r['source'], {})
        if 'x' in ov: r['x'], r['z'] = ov['x'], ov['z']
        if 'heading' in ov: r['exif_heading'] = r['heading']; r['heading'] = ov['heading']
        r['overridden'] = sorted(k for k in ov if k in ('x', 'z', 'heading'))
        if r.get('x') is not None and r['heading'] is not None:
            r['facade'], r['in_view'] = cast(m, (r['x'], r['z']), r['heading'], r['hfov'])
            # a facade under 8 m away would fill the frame; with these lenses that means the heading is wrong
            r['suspect'] = bool(r['facade']) and r['facade']['t'] < 8
        recs.append(r)
        fac = r.get('facade')
        print('%s %s  (%7.1f, %7.1f) hdg %5.1f%s f35 %-3s -> %s%s' % (r['label'], r['source'], r.get('x', float('nan')), r.get('z', float('nan')), r['heading'] or -1,
              '*' if r['overridden'] else ' ', r['focal35'],
              ('%s %s #%d at %.0f m, %.0f deg off frontal' % (fac['kind'], fac['name'] or '', fac['building'], fac['t'], fac['frontal_deg'])) if fac else 'nothing within %.0f m' % RAY_MAX,
              '  SUSPECT' if r.get('suspect') else ''))
    json.dump({'folder': os.path.relpath(folder, ROOT), 'map': os.path.relpath(MAP, ROOT), 'axes': 'x east, z south, metres', 'photos': recs},
              open(os.path.join(folder, 'index.json'), 'w', encoding='utf-8'), indent=1)
    draw_map(m, recs, os.path.join(folder, 'map.png'))
    if any(r.get('jpeg') for r in recs): contact_sheet(recs, folder, os.path.join(folder, 'contact.jpg'))
    write_readme(recs, folder)
    print('wrote index.json, map.png, contact.jpg, README.md in', folder)


def load_json(path):
    try: return json.load(open(path, encoding='utf-8'))
    except FileNotFoundError: return {}


def write_readme(recs, folder):
    name = os.path.basename(folder.rstrip('\\/'))
    L = ['# %s reference photos' % name.replace('_', ' ').title(), '',
         'Generated by `tools/photo_index.py` from the originals in this folder (HEIC and MOV stay local, ignored by git; the',
         'JPEGs here are %d px copies). `index.json` has each photo\'s map position, heading, lens and the facade it looks at;' % JPEG_LONG_SIDE,
         '`map.png` draws them; `overrides.json` corrects headings the phone compass got wrong; `captions.json` is written by hand.', '',
         'Position: x east, z south, metres from the map origin (same as the game). Heading: degrees from true north, `*` where',
         'overridden. Facade: the building edge the view centre hits, how far, and how far off dead frontal (0 is square on).', '',
         '| # | File | Taken | x, z | Heading | Lens | Facade | What it shows |', '|---|---|---|---|---|---|---|---|']
    for r in recs:
        fac = r.get('facade'); f = ('%s%s at %.0f m, %.0f° off' % ((fac['name'] + ' ') if fac['name'] else '', fac['kind'], fac['t'], fac['frontal_deg'])) if fac else 'none'
        if r.get('suspect'): f += ' (suspect)'
        L.append('| %s | %s | %s | %s | %s | %s mm | %s | %s |' % (r['label'], r.get('jpeg') or r['source'], (r.get('taken') or '')[11:16],
                 ('%.0f, %.0f' % (r['x'], r['z'])) if r.get('x') is not None else '?', ('%.0f%s' % (r['heading'], '*' if 'heading' in r['overridden'] else '')) if r.get('heading') is not None else '?',
                 r.get('focal35') or '?', f, r.get('caption', '')))
    open(os.path.join(folder, 'README.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')


if __name__ == '__main__': main()
