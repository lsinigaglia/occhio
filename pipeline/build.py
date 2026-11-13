"""Costruisce il grafo stradale di Roma con il rischio per tratto e l'elenco dei punti critici.

Input : data/raw/osm/t*.json (Overpass), data/raw/incidenti/*.csv (Open Data Roma Capitale)
Output: docs/data/graph.json, docs/data/hotspots.json

Uso: python pipeline/build.py
"""
import collections
import csv
import glob
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_OSM = os.path.join(ROOT, 'data', 'raw', 'osm')
RAW_INC = os.path.join(ROOT, 'data', 'raw', 'incidenti')
OUT = os.path.join(ROOT, 'docs', 'data')

# classi stradali percorribili a motore (l'ordine definisce l'indice salvato nel grafo)
CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
           'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']
CLS_IDX = {c: i for i, c in enumerate(CLASSES)}

TWO_WHEELS = ('motociclo', 'ciclomotore', 'velocipede', 'monopattino', 'bicicletta', 'motocarro')

LAT0, LON0 = 41.9, 12.5
MX = 111320 * math.cos(math.radians(LAT0))  # metri per grado di longitudine
MY = 110540                                 # metri per grado di latitudine


def xy(lat, lon):
    return (lon - LON0) * MX, (lat - LAT0) * MY


# ---------------------------------------------------------------- rete stradale
def load_osm():
    nodes, ways = {}, {}
    for f in sorted(glob.glob(os.path.join(RAW_OSM, 't*.json'))):
        with open(f, encoding='utf-8') as fh:
            d = json.load(fh)
        for e in d['elements']:
            if e['type'] == 'node':
                nodes[e['id']] = (e['lat'], e['lon'])
            elif e['type'] == 'way':
                t = e.get('tags', {})
                if t.get('highway') not in CLS_IDX:
                    continue
                if t.get('access') in ('private', 'no') or t.get('motor_vehicle') in ('no', 'private'):
                    continue
                if t.get('area') == 'yes':
                    continue
                ways[e['id']] = e
        del d
    return nodes, ways


def build_segments(nodes, ways):
    use = collections.Counter()
    for w in ways.values():
        nd = w['nodes']
        for n in nd:
            use[n] += 1
        use[nd[0]] += 1
        use[nd[-1]] += 1
    segs = []
    for w in ways.values():
        t = w['tags']
        hw = t['highway']
        ow = t.get('oneway', '')
        if ow in ('yes', 'true', '1'):
            d = 1
        elif ow in ('-1', 'reverse'):
            d = -1
        elif ow == 'no':
            d = 0
        elif t.get('junction') in ('roundabout', 'circular') or hw in ('motorway', 'motorway_link'):
            d = 1
        else:
            d = 0
        name = t.get('name') or t.get('ref') or ''
        rb = 1 if t.get('junction') in ('roundabout', 'circular') else 0
        nd = [n for n in w['nodes'] if n in nodes]
        cur = [nd[0]] if nd else []
        for n in nd[1:]:
            cur.append(n)
            if use[n] >= 2:
                if cur[0] != cur[-1] and len(cur) >= 2:
                    g = cur if d >= 0 else cur[::-1]
                    segs.append({'nd': g, 'cls': CLS_IDX[hw], 'name': name, 'ow': 1 if d != 0 else 0, 'rb': rb, 'way': w['id']})
                cur = [n]
    return segs


def largest_scc(segs):
    """Tiene solo la componente fortemente connessa più grande (ogni percorso è calcolabile)."""
    ids = {}
    for s in segs:
        for n in (s['nd'][0], s['nd'][-1]):
            if n not in ids:
                ids[n] = len(ids)
    N = len(ids)
    fwd = [[] for _ in range(N)]
    rev = [[] for _ in range(N)]
    for s in segs:
        a, b = ids[s['nd'][0]], ids[s['nd'][-1]]
        fwd[a].append(b); rev[b].append(a)
        if not s['ow']:
            fwd[b].append(a); rev[a].append(b)
    order, seen = [], [False] * N
    for st in range(N):
        if seen[st]:
            continue
        seen[st] = True
        stack = [(st, 0)]
        while stack:
            v, i = stack[-1]
            if i < len(fwd[v]):
                stack[-1] = (v, i + 1)
                u = fwd[v][i]
                if not seen[u]:
                    seen[u] = True
                    stack.append((u, 0))
            else:
                order.append(v)
                stack.pop()
    comp = [-1] * N
    sizes = []
    for st in reversed(order):
        if comp[st] != -1:
            continue
        c = len(sizes)
        comp[st] = c
        stack, size = [st], 0
        while stack:
            v = stack.pop()
            size += 1
            for u in rev[v]:
                if comp[u] == -1:
                    comp[u] = c
                    stack.append(u)
        sizes.append(size)
    best = max(range(len(sizes)), key=lambda c: sizes[c])
    keep = [s for s in segs if comp[ids[s['nd'][0]]] == best and comp[ids[s['nd'][-1]]] == best]
    return keep, N, sizes[best]


def load_bans(segs, nid):
    """Divieti di svolta di OpenStreetMap (relazioni type=restriction con un nodo come "via").

    Ritorna terne (tratto di provenienza, nodo, tratto vietato). "only_*" diventa il divieto
    di tutte le altre uscite da quel nodo. I divieti con "via" su una strada (pochi) sono ignorati.
    """
    path = os.path.join(RAW_OSM, 'restrictions.json')
    if not os.path.exists(path):
        return []
    by_way_node = collections.defaultdict(list)
    at_node = collections.defaultdict(list)
    for i, s in enumerate(segs):
        for n in (s['nd'][0], s['nd'][-1]):
            by_way_node[(s['way'], n)].append(i)
            at_node[n].append(i)
    with open(path, encoding='utf-8') as fh:
        rels = json.load(fh)['elements']
    bans = set()
    for r in rels:
        t = r.get('tags', {})
        kind = t.get('restriction', '')
        if not (kind.startswith('no_') or kind.startswith('only_')) or kind in ('no_parking', 'no_entry'):
            continue
        if any(k in t.get('except', '') for k in ('motorcycle', 'moped', 'motor_vehicle')):
            continue
        fr = [m['ref'] for m in r['members'] if m['role'] == 'from' and m['type'] == 'way']
        to = [m['ref'] for m in r['members'] if m['role'] == 'to' and m['type'] == 'way']
        via = [m['ref'] for m in r['members'] if m['role'] == 'via' and m['type'] == 'node']
        if len(via) != 1 or not fr or not to or via[0] not in nid:
            continue
        v = via[0]
        fsegs = [i for w in fr for i in by_way_node.get((w, v), [])]
        tsegs = {i for w in to for i in by_way_node.get((w, v), [])}
        if not fsegs or not tsegs:
            continue
        same = set(fr) == set(to)
        for f in fsegs:
            if kind.startswith('no_'):
                for x in tsegs:
                    if not same or x == f:      # stessa strada: è vietata solo l'inversione
                        bans.add((f, nid[v], x))
            else:
                for x in at_node[v]:
                    if x not in tsegs and x != f:
                        bans.add((f, nid[v], x))
    return sorted(bans)


# ---------------------------------------------------------------- incidenti
def num(s):
    try:
        return int(float(s.replace(',', '.')))
    except Exception:
        return 0


def load_incidents():
    inc = {}
    for f in sorted(glob.glob(os.path.join(RAW_INC, '*.csv'))):
        with open(f, 'rb') as fh:
            raw = fh.read()
        try:
            txt = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            txt = raw.decode('cp1252', errors='replace')
        rd = csv.reader(txt.splitlines(), delimiter=';')
        hdr = [h.strip().lower() for h in next(rd)]
        ix = {h: i for i, h in enumerate(hdr)}

        def g(r, k):
            i = ix.get(k)
            return r[i].strip() if i is not None and i < len(r) else ''
        for r in rd:
            if len(r) < 30:
                continue
            p = g(r, 'protocollo')
            it = inc.get(p)
            if it is None:
                try:
                    lat = float(g(r, 'latitude').replace(',', '.'))
                    lon = float(g(r, 'longitude').replace(',', '.'))
                except ValueError:
                    lat = lon = 0.0
                dt = g(r, 'dataoraincidente')
                hour = num(dt[11:13]) if len(dt) >= 13 else -1
                it = inc[p] = {
                    'lat': lat, 'lon': lon, 'hour': hour, 'ym': dt[6:10] + '-' + dt[3:5],
                    's1': g(r, 'strada1'), 's2': g(r, 'strada2'), 'loc2': g(r, 'localizzazione2'),
                    'nat': g(r, 'naturaincidente'), 'part': g(r, 'particolaritastrade'),
                    'fondo': g(r, 'fondostradale'), 'meteo': g(r, 'condizioneatmosferica'),
                    'luce': g(r, 'illuminazione'),
                    'feriti': num(g(r, 'num_feriti')), 'ris': num(g(r, 'num_riservata')),
                    'morti': num(g(r, 'num_morti')), 'veh': set(), 'ped': False,
                }
            v = g(r, 'tipoveicolo')
            if v:
                it['veh'].add(v)
            if 'pedone' in g(r, 'tipopersona').lower():
                it['ped'] = True
    out = []
    for it in inc.values():
        if not (41.6 < it['lat'] < 42.2 and 12.2 < it['lon'] < 12.9):
            continue
        vl = ' '.join(it['veh']).lower()
        it['tw'] = any(k in vl for k in TWO_WHEELS)
        it['moto'] = 'motociclo' in vl or 'ciclomotore' in vl
        it['bici'] = 'velocipede' in vl or 'bicicletta' in vl
        it['mono'] = 'monopattino' in vl
        if 'pedone' in it['nat'].lower():
            it['ped'] = True
        sev = 10 if it['morti'] > 0 else 6 if it['ris'] > 0 else 3 if it['feriti'] > 0 else 1
        it['sev'] = sev
        it['w'] = sev * (2.5 if it['tw'] else 1.0)
        it['x'], it['y'] = xy(it['lat'], it['lon'])
        out.append(it)
    # Coordinate "di ripiego": quando la posizione esatta non è nota, il sistema di origine mette
    # l'incidente su un punto fisso della strada. Si riconoscono perché la stessa coordinata
    # raccoglie incidenti con molte traverse diverse o con posizione "da specificare".
    by = collections.defaultdict(list)
    for it in out:
        by[(it['lat'], it['lon'])].append(it)
    good, dropped = [], 0
    for v in by.values():
        cross = {i['s2'] for i in v if i['s2']}
        vague = sum(1 for i in v if i['loc2'].lower().startswith('da specificare'))
        if len(cross) >= 4 or vague >= 4 or (len(v) >= 8 and len(cross) >= 3):
            dropped += len(v)
        else:
            good.extend(v)
    print('scartati per coordinata di ripiego', dropped)
    return good, len(inc)


# ---------------------------------------------------------------- geometria
def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


CELL = 50.0


def main():
    nodes, ways = load_osm()
    print('nodi OSM', len(nodes), 'strade', len(ways))
    segs = build_segments(nodes, ways)
    segs, n_all, n_scc = largest_scc(segs)
    print('tratti', len(segs), 'nodi grafo', n_all, 'nella componente principale', n_scc)

    # indici dei nodi del grafo
    nid = {}
    for s in segs:
        for n in (s['nd'][0], s['nd'][-1]):
            if n not in nid:
                nid[n] = len(nid)
    N = len(nid)
    nlat = [0.0] * N; nlon = [0.0] * N
    for n, i in nid.items():
        nlat[i], nlon[i] = nodes[n]
    deg = [0] * N
    for s in segs:
        s['a'], s['b'] = nid[s['nd'][0]], nid[s['nd'][-1]]
        deg[s['a']] += 1; deg[s['b']] += 1
        pts = [xy(*nodes[n]) for n in s['nd']]
        s['pts'] = pts
        s['len'] = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
        s['risk'] = 0.0; s['n'] = 0
    bans = load_bans(segs, nid)
    print('divieti di svolta applicati', len(bans))

    # griglia spaziale dei pezzi di tratto
    grid = collections.defaultdict(list)
    for si, s in enumerate(segs):
        p = s['pts']
        for i in range(len(p) - 1):
            x0, x1 = sorted((p[i][0], p[i + 1][0])); y0, y1 = sorted((p[i][1], p[i + 1][1]))
            for cx in range(int(x0 // CELL), int(x1 // CELL) + 1):
                for cy in range(int(y0 // CELL), int(y1 // CELL) + 1):
                    grid[(cx, cy)].append((si, i))

    def near_segs(x, y, radius):
        res = {}
        r = int(radius // CELL) + 1
        cx0, cy0 = int(x // CELL), int(y // CELL)
        for cx in range(cx0 - r, cx0 + r + 1):
            for cy in range(cy0 - r, cy0 + r + 1):
                for si, i in grid.get((cx, cy), ()):
                    p = segs[si]['pts']
                    d = seg_dist(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])
                    if d <= radius and d < res.get(si, 1e9):
                        res[si] = d
        return res

    incidents, n_tot = load_incidents()
    months = sorted({it['ym'] for it in incidents})
    print('incidenti', n_tot, 'geolocalizzati', len(incidents), 'mesi', months[0], '->', months[-1], len(months))

    nrisk = [0.0] * N
    ncnt = [0] * N
    nx = [0.0] * N; ny = [0.0] * N
    for i in range(N):
        nx[i], ny[i] = xy(nlat[i], nlon[i])
    snapped = 0
    for it in incidents:
        ns = near_segs(it['x'], it['y'], 35.0)
        if not ns:
            continue
        snapped += 1
        si = min(ns, key=ns.get)
        s = segs[si]
        best, bd = -1, 25.0
        for n in (s['a'], s['b']):
            d = math.hypot(it['x'] - nx[n], it['y'] - ny[n])
            if d < bd and deg[n] >= 3:
                best, bd = n, d
        if best >= 0:
            nrisk[best] += it['w']
            ncnt[best] += 1
        else:
            s['risk'] += it['w']
            s['n'] += 1
    print('incidenti agganciati alla rete', snapped, f'{100 * snapped / len(incidents):.1f}%')

    # ------------------------------------------------------------ punti critici
    HC = 30.0
    cells = collections.defaultdict(list)
    for k, it in enumerate(incidents):
        cells[(int(it['x'] // HC), int(it['y'] // HC))].append(k)

    def window(c):
        out = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                out.extend(cells.get((c[0] + dx, c[1] + dy), ()))
        return out
    score = {c: sum(incidents[k]['w'] for k in window(c)) for c in cells}
    claimed = [False] * len(incidents)
    hotspots = []
    MIN_N = int(os.environ.get('HOT_MIN', '8'))
    for c in sorted(score, key=score.get, reverse=True):
        ks = [k for k in window(c) if not claimed[k]]
        if len(ks) < MIN_N:
            continue
        for k in ks:
            claimed[k] = True
        its = [incidents[k] for k in ks]
        lat = sum(i['lat'] for i in its) / len(its)
        lon = sum(i['lon'] for i in its) / len(its)
        x, y = xy(lat, lon)
        s1 = collections.Counter(i['s1'] for i in its if i['s1'])
        s2 = collections.Counter(i['s2'] for i in its if i['s2'])
        main_s = s1.most_common(1)[0][0] if s1 else ''
        cross = next((n for n, _ in s2.most_common(3) if n != main_s), '')
        if not cross and len(s1) > 1:
            cross = s1.most_common(2)[1][0]
        nat = collections.Counter(i['nat'] for i in its if i['nat'])
        part = collections.Counter(i['part'] for i in its if i['part'])
        n = len(its)
        hotspots.append({
            'lat': round(lat, 5), 'lon': round(lon, 5),
            's1': main_s.title(), 's2': cross.title(),
            'n': n,
            'w': round(sum(i['w'] for i in its), 1),
            'feriti': sum(1 for i in its if i['sev'] >= 3),
            'gravi': sum(1 for i in its if i['sev'] >= 6),
            'morti': sum(i['morti'] for i in its),
            'tw': sum(1 for i in its if i['tw']),
            'moto': sum(1 for i in its if i['moto']),
            'bici': sum(1 for i in its if i['bici']),
            'mono': sum(1 for i in its if i['mono']),
            'ped': sum(1 for i in its if i['ped']),
            'notte': sum(1 for i in its if i['hour'] >= 20 or 0 <= i['hour'] < 6),
            'punta': sum(1 for i in its if 7 <= i['hour'] < 10 or 17 <= i['hour'] < 20),
            'bagnato': sum(1 for i in its if i['fondo'] and i['fondo'].lower() != 'asciutto'),
            'nat': nat.most_common(3),
            'part': part.most_common(1)[0][0] if part else '',
            'segs': sorted(near_segs(x, y, 40.0)),
        })
    hotspots.sort(key=lambda h: h['w'], reverse=True)
    for i, h in enumerate(hotspots):
        h['id'] = i
    print('punti critici', len(hotspots), 'incidenti coperti', sum(h['n'] for h in hotspots))
    for h in hotspots[:15]:
        print(f"  {h['n']:4d} inc | {h['tw']:3d} due ruote | {h['feriti']:3d} con feriti | {h['s1']} / {h['s2']} | {h['part']}")

    # ------------------------------------------------------------ output
    names, nidx = [''], {'': 0}
    geom, goff = [], [0]
    for s in segs:
        if s['name'] not in nidx:
            nidx[s['name']] = len(names); names.append(s['name'])
        for n in s['nd'][1:-1]:
            la, lo = nodes[n]
            geom.append(round(la * 1e5)); geom.append(round(lo * 1e5))
        goff.append(len(geom))
    graph = {
        'meta': {'incidenti': len(incidents), 'dal': months[0], 'al': months[-1], 'mesi': len(months),
                 'fonte': 'Open Data Roma Capitale (incidenti), OpenStreetMap (strade)'},
        'classes': CLASSES,
        'lat': [round(v * 1e5) for v in nlat], 'lon': [round(v * 1e5) for v in nlon],
        'nrisk': [round(v * 10) for v in nrisk],
        'ncnt': ncnt,
        'a': [s['a'] for s in segs], 'b': [s['b'] for s in segs],
        'ow': [s['ow'] for s in segs], 'rb': [s['rb'] for s in segs],
        'len': [round(s['len']) for s in segs], 'cls': [s['cls'] for s in segs],
        'risk': [round(s['risk'] * 10) for s in segs], 'cnt': [s['n'] for s in segs],
        'name': [nidx[s['name']] for s in segs], 'names': names,
        'ban': [x for b in bans for x in b],
        'geom': geom, 'goff': goff,
    }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'graph.json'), 'w', encoding='utf-8') as fh:
        json.dump(graph, fh, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, 'hotspots.json'), 'w', encoding='utf-8') as fh:
        json.dump({'meta': graph['meta'], 'items': hotspots}, fh, ensure_ascii=False, separators=(',', ':'))
    for f in ('graph.json', 'hotspots.json'):
        print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1e6, 2), 'MB')


if __name__ == '__main__':
    main()
