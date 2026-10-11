#!/usr/bin/env python3
"""Convert OSM XML tiles + elevation grid into the game's world JSON (local metres, x east, z south)."""
import sys, json, math, glob, re, xml.etree.ElementTree as ET
SRC = sys.argv[1]; ELEV = sys.argv[2]; OUT = sys.argv[3]
LAT0, LON0 = 51.4690, -0.0545
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
def proj(lat, lon): return (round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KZ, 1))
nodes, ways, rels = {}, {}, {}
for f in sorted(glob.glob(SRC + '/tile*.osm')):
    for ev, el in ET.iterparse(f):
        if el.tag == 'node':
            nodes[int(el.get('id'))] = (float(el.get('lat')), float(el.get('lon')), {t.get('k'): t.get('v') for t in el.findall('tag')})
        elif el.tag == 'way':
            ways[int(el.get('id'))] = ([int(n.get('ref')) for n in el.findall('nd')], {t.get('k'): t.get('v') for t in el.findall('tag')})
        elif el.tag == 'relation':
            rels[int(el.get('id'))] = ([(m.get('type'), int(m.get('ref')), m.get('role')) for m in el.findall('member')], {t.get('k'): t.get('v') for t in el.findall('tag')})
        if el.tag in ('node', 'way', 'relation'): el.clear()
def pts(refs): return [proj(*nodes[r][:2]) for r in refs if r in nodes]
def area(p):
    return 0.5 * sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))
def ccw(p): return p if area(p) > 0 else p[::-1]
def centroid(p): return (round(sum(q[0] for q in p) / len(p), 1), round(sum(q[1] for q in p) / len(p), 1))
def num(v, d=0.0):
    try: return float(re.split(r'[;, ]', str(v).replace('m', '').strip())[0])
    except Exception: return d
def btype(t):
    b = t.get('building', 'yes'); a = t.get('amenity', '')
    if a == 'school' or b in ('school', 'kindergarten', 'college', 'university'): return 'school'
    if b in ('church', 'chapel', 'cathedral', 'mosque', 'temple', 'synagogue', 'place_of_worship') or a == 'place_of_worship': return 'church'
    if b in ('apartments', 'residential', 'dormitory') and num(t.get('building:levels', '0')) >= 4: return 'flats'
    if b in ('apartments',): return 'flats'
    if b in ('terrace', 'house', 'semidetached_house', 'detached', 'residential', 'yes', 'bungalow'): return 'terrace'
    if b in ('industrial', 'warehouse', 'garage', 'garages', 'shed', 'hut', 'roof', 'carport'): return 'shed' if b in ('shed', 'hut', 'garage', 'garages', 'roof', 'carport') else 'industrial'
    if b in ('retail', 'commercial', 'office', 'supermarket', 'pub', 'hotel'): return 'commercial'
    if b in ('train_station', 'transportation', 'public', 'civic', 'hospital'): return 'civic'
    return 'terrace'
def bheight(t, kind):
    h = t.get('height'); lv = t.get('building:levels')
    if h and num(h) > 0: return round(min(60, num(h)), 1)
    if lv and num(lv) > 0: return round(num(lv) * 3.1 + 0.8, 1)
    return {'terrace': 7.2, 'flats': 13.0, 'school': 7.5, 'church': 11.0, 'industrial': 7.0, 'commercial': 8.5, 'civic': 8.0, 'shed': 2.6}[kind]
out = {'origin': {'lat': LAT0, 'lon': LON0}, 'buildings': [], 'roads': [], 'rail': [], 'areas': [], 'pitches': [], 'fences': [], 'trees': [], 'pois': [], 'water': []}
seen_b = set()
def add_building(poly, t, oid):
    if len(poly) < 3 or oid in seen_b: return
    seen_b.add(oid)
    poly = ccw(poly); a = abs(area(poly))
    if a < 10: return
    kind = btype(t)
    out['buildings'].append({'p': poly, 'h': bheight(t, kind), 'k': kind, 'n': t.get('name', ''), 'a': round(a)})
for wid, (refs, t) in ways.items():
    p = pts(refs)
    if len(p) < 2: continue
    closed = refs[0] == refs[-1] and len(p) >= 4
    if closed: p = p[:-1]
    if 'building' in t and closed: add_building(p, t, ('w', wid)); continue
    hw = t.get('highway')
    if hw:
        cls = hw
        if hw in ('primary', 'primary_link', 'trunk'): w = 9
        elif hw in ('secondary', 'secondary_link'): w = 8
        elif hw in ('tertiary', 'tertiary_link'): w = 7
        elif hw in ('residential', 'unclassified', 'living_street'): w = 6
        elif hw == 'service': w = 4
        elif hw in ('footway', 'path', 'cycleway', 'pedestrian', 'steps', 'bridleway', 'track'): w = 2
        else: continue
        out['roads'].append({'p': p, 'w': w, 'k': cls, 'n': t.get('name', '')}); continue
    if t.get('railway') in ('rail', 'light_rail'):
        out['rail'].append({'p': p, 'b': t.get('bridge', '') == 'yes', 'c': t.get('cutting', '') == 'yes'}); continue
    if closed:
        le, lu, na = t.get('leisure', ''), t.get('landuse', ''), t.get('natural', '')
        if le == 'pitch' or le == 'playground' or (le == 'sports_centre' and t.get('sport')):
            out['pitches'].append({'p': ccw(p), 'sport': t.get('sport', ''), 'surface': t.get('surface', ''), 'k': le, 'n': t.get('name', ''), 'c': centroid(p), 'a': round(abs(area(p)))}); continue
        kind = None
        if le in ('park', 'garden', 'recreation_ground', 'nature_reserve', 'common') or lu in ('grass', 'recreation_ground', 'village_green', 'meadow', 'greenfield') or na in ('grassland', 'heath'): kind = 'grass'
        elif lu == 'cemetery': kind = 'cemetery'
        elif lu == 'allotments': kind = 'allotments'
        elif na in ('wood', 'scrub') or lu == 'forest': kind = 'wood'
        elif na == 'water' or lu in ('reservoir', 'basin'): kind = 'water'
        elif t.get('amenity') == 'school': kind = 'school'
        elif lu in ('industrial', 'retail', 'commercial', 'railway'): kind = 'hard'
        elif t.get('amenity') == 'parking' or le == 'track': kind = 'hard'
        if kind: out['areas'].append({'p': ccw(p), 'k': kind, 'n': t.get('name', ''), 'c': centroid(p), 'a': round(abs(area(p)))}); continue
    if t.get('barrier') in ('fence', 'wall', 'railing', 'retaining_wall', 'hedge', 'gate'):
        out['fences'].append({'p': p, 'k': t.get('barrier'), 'h': num(t.get('height', '1.8'), 1.8) or 1.8}); continue
    if t.get('waterway'): out['water'].append({'p': p, 'k': t.get('waterway')})
for rid, (members, t) in rels.items():
    if t.get('type') != 'multipolygon': continue
    outers = [ways[ref][0] for (ty, ref, role) in members if ty == 'way' and role == 'outer' and ref in ways]
    # stitch outer rings (simple: treat each closed way as its own ring)
    for refs in outers:
        p = pts(refs)
        if len(p) >= 4 and refs[0] == refs[-1]: p = p[:-1]
        if len(p) < 3: continue
        if 'building' in t: add_building(p, t, ('r', rid, tuple(refs[:2])))
        elif t.get('leisure') in ('park', 'garden', 'recreation_ground', 'nature_reserve') or t.get('landuse') in ('grass', 'recreation_ground', 'cemetery') or t.get('amenity') == 'school':
            kind = 'cemetery' if t.get('landuse') == 'cemetery' else 'school' if t.get('amenity') == 'school' else 'grass'
            out['areas'].append({'p': ccw(p), 'k': kind, 'n': t.get('name', ''), 'c': centroid(p), 'a': round(abs(area(p)))})
for nid, (lat, lon, t) in nodes.items():
    if not t: continue
    x, z = proj(lat, lon)
    if t.get('natural') == 'tree': out['trees'].append([x, z]); continue
    if t.get('railway') == 'station': out['pois'].append({'x': x, 'z': z, 'k': 'station', 'n': t.get('name', '')}); continue
    a, s = t.get('amenity'), t.get('shop')
    if a in ('pub', 'cafe', 'restaurant', 'fast_food', 'post_box', 'bus_station', 'place_of_worship', 'library', 'community_centre') or s:
        out['pois'].append({'x': x, 'z': z, 'k': a or ('shop:' + s), 'n': t.get('name', '')})
    if t.get('highway') == 'bus_stop': out['pois'].append({'x': x, 'z': z, 'k': 'bus_stop', 'n': t.get('name', '')})
# named streets → sign positions (midpoint of first named segment)
# elevation
e = json.load(open(ELEV))
out['elev'] = e
out['elev']['x0'], out['elev']['z0'] = proj(e['lat1'], e['lon0'])   # NW corner → (x of lon0, z of lat1)
out['elev']['x1'], out['elev']['z1'] = proj(e['lat0'], e['lon1'])
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
import os
print('buildings', len(out['buildings']), 'roads', len(out['roads']), 'rail', len(out['rail']), 'areas', len(out['areas']), 'pitches', len(out['pitches']), 'fences', len(out['fences']), 'trees', len(out['trees']), 'pois', len(out['pois']), 'bytes', os.path.getsize(OUT))
print('--- schools:'); [print(' ', a['n'], a['c'], a['a']) for a in out['areas'] if a['k'] == 'school' and a['n']]
print('--- parks:'); [print(' ', a['n'], a['c'], a['a']) for a in out['areas'] if a['k'] in ('grass', 'cemetery') and a['n']]
print('--- pitches (sport, surface, name, centre, area):'); [print(' ', p['sport'], p['surface'], p['k'], p['n'], p['c'], p['a']) for p in sorted(out['pitches'], key=lambda q: -q['a'])[:30]]
print('--- stations/pubs:'); [print(' ', p['k'], p['n'], p['x'], p['z']) for p in out['pois'] if p['k'] in ('station', 'pub')]
print('--- named buildings sample:'); [print(' ', b['n'], b['k'], b['h'], b['a']) for b in out['buildings'] if b['n']][:40]
