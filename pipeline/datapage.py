"""Costruisce docs/dati.html: una pagina sola con l'anteprima dei dati usati da Occhio!.

Mostra i numeri del percorso dei dati (rilevati, usati, punti critici), alcune righe vere
degli open data e i punti critici con più incidenti. Va rigenerata dopo pipeline/build.py.

Uso: python pipeline/datapage.py
"""
import csv
import glob
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_INC = os.path.join(ROOT, 'data', 'raw', 'incidenti')
DATA = os.path.join(ROOT, 'docs', 'data')
OUT = os.path.join(ROOT, 'docs', 'dati.html')

MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
PICCOLE = {'Di', 'Del', 'Della', 'Dei', 'Degli', 'Delle', 'Da', 'De', 'In', 'A', 'E', 'Al', 'Alla'}


def num(n):
    return f'{n:,}'.replace(',', '.')


def nome(s):
    """Scrive il nome di una strada come si legge, non tutto in maiuscolo."""
    out = []
    for i, w in enumerate(s.title().split()):
        out.append(w.upper() if re.fullmatch(r'[IVX]{2,}', w.upper()) else w.lower() if i and w in PICCOLE else w)
    return ' '.join(out)


def mese(ym):
    y, m = ym.split('-')
    return f'{MESI[int(m) - 1]} {y}'


def read_rows(path):
    with open(path, 'rb') as fh:
        raw = fh.read()
    try:
        txt = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        txt = raw.decode('cp1252', errors='replace')
    rd = csv.reader(txt.splitlines(), delimiter=';')
    hdr = [h.strip().lower() for h in next(rd)]
    ix = {h: i for i, h in enumerate(hdr)}
    if 'latitudine' in ix:
        ix['latitude'], ix['longitude'] = ix['latitudine'], ix['longitudine']
    for r in rd:
        if len(r) >= 30:
            yield {k: (r[i].strip() if i < len(r) else '') for k, i in ix.items()}


def sample():
    """Dodici incidenti veri dell'ultimo mese disponibile, presi a intervalli regolari."""
    last = sorted(glob.glob(os.path.join(RAW_INC, '*.csv')))[-1]
    inc = {}
    for r in read_rows(last):
        it = inc.setdefault(r['protocollo'], {'r': r, 'veh': []})
        v = r.get('tipoveicolo', '')
        if v and v not in it['veh']:
            it['veh'].append(v)
    def punto(r):
        # il verbale indica il punto con una traversa oppure con un numero civico
        if r.get('strada2'):
            return 'incrocio con ' + nome(r['strada2'])
        if r.get('strada02', '').startswith('del civico') and r.get('chilometrica'):
            return 'civico ' + r['chilometrica']
        return ''
    for it in inc.values():
        it['punto'] = punto(it['r'])
    good = [it for it in inc.values() if it['punto'] and it['r'].get('latitude') and it['r'].get('naturaincidente')]
    good.sort(key=lambda it: (it['r']['dataoraincidente'][6:10], it['r']['dataoraincidente'][3:5], it['r']['dataoraincidente'][0:2], it['r']['dataoraincidente'][11:16]))
    step = max(1, len(good) // 12)
    return good[::step][:12], os.path.basename(last)[:-4]


def main():
    with open(os.path.join(DATA, 'hotspots.json'), encoding='utf-8') as fh:
        hs = json.load(fh)
    meta, items = hs['meta'], hs['items']
    files = sorted(glob.glob(os.path.join(RAW_INC, '*.csv')))
    total = len({r['protocollo'] for f in files for r in read_rows(f)})
    in_hot = sum(h['n'] for h in items)
    rows, ym = sample()
    top = sorted(items, key=lambda h: h['n'], reverse=True)[:12]
    periodo = f"{mese(meta['dal'])} – {mese(meta['al'])}"
    e = html.escape

    tr_inc = ''.join(
        f"<tr><td class='nw'>{e(it['r']['dataoraincidente'][:16])}</td><td>{e(nome(it['r']['strada1']))}</td>"
        f"<td>{e(it['punto'])}</td><td>{e(it['r']['naturaincidente'])}</td>"
        f"<td>{e(', '.join(it['veh'][:3]))}</td><td class='n'>{e(it['r'].get('num_feriti', '') or '0')}</td>"
        f"<td class='nw mono'>{e(it['r']['latitude'])}, {e(it['r']['longitude'])}</td></tr>" for it in rows)
    tr_hot = ''.join(
        f"<tr><td class='n'>{i + 1}</td><td><b>{e(nome(h['s1']))}</b>{' · ' + e(nome(h['s2'])) if h['s2'] else ''}</td>"
        f"<td class='n big'>{h['n']}</td><td class='n'>{h['tw']}</td><td class='n'>{h['feriti']}</td><td class='n'>{h['morti'] or '–'}</td></tr>"
        for i, h in enumerate(top))

    page = f"""<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Occhio! — i dati</title>
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap">
<style>
:root {{ --ink: #141414; --paper: #F6F3EC; --orange: #FF9800; --soft: #55524A; --line: #D9D4C7; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--paper); color: var(--ink); font: 400 17px/1.45 Inter, Arial, sans-serif; }}
main {{ max-width: 1240px; margin: 0 auto; padding: 28px 16px 56px; }}
header {{ display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }}
.tag {{ background: var(--orange); font: 400 26px/1 Anton, Impact, sans-serif; letter-spacing: 2px; text-transform: uppercase; padding: 9px 14px 7px; }}
h1 {{ font: 400 40px/1.1 Anton, Impact, sans-serif; text-transform: uppercase; letter-spacing: 1px; margin: 0; }}
h2 {{ font: 400 26px/1.15 Anton, Impact, sans-serif; text-transform: uppercase; letter-spacing: 1px; margin: 40px 0 6px; }}
p.sub {{ margin: 0 0 14px; color: var(--soft); }}
.flow {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 24px; }}
.step {{ background: var(--ink); color: var(--paper); border-radius: 14px; padding: 18px 18px 16px; }}
.step .num {{ font: 400 54px/1 Anton, Impact, sans-serif; color: var(--orange); }}
.step .what {{ margin-top: 8px; font-size: 16px; line-height: 1.35; }}
.wrap {{ overflow-x: auto; background: #fff; border: 2px solid var(--line); border-radius: 14px; }}
table {{ border-collapse: collapse; width: 100%; font-size: 15px; }}
th {{ text-align: left; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--soft); padding: 11px 12px; border-bottom: 2px solid var(--line); white-space: nowrap; }}
td {{ padding: 9px 12px; border-bottom: 1px solid #ECE8DD; vertical-align: top; }}
tr:last-child td {{ border-bottom: 0; }}
td.n, th.n {{ text-align: right; font-variant-numeric: tabular-nums; }}
td.big {{ font-weight: 600; font-size: 17px; }}
td.nw {{ white-space: nowrap; }}
td.mono {{ font-family: ui-monospace, Consolas, monospace; font-size: 13.5px; color: var(--soft); }}
.note {{ margin-top: 12px; color: var(--soft); font-size: 15px; }}
a {{ color: inherit; text-underline-offset: 3px; }}
footer {{ margin-top: 40px; padding-top: 16px; border-top: 2px solid var(--line); color: var(--soft); font-size: 15px; }}
@media (max-width: 820px) {{ .flow {{ grid-template-columns: 1fr 1fr; }} h1 {{ font-size: 30px; }} .step .num {{ font-size: 40px; }} }}
</style>
</head>
<body>
<main>
<header><span class="tag">Occhio!</span><h1>I dati, {e(periodo)}</h1></header>

<div class="flow">
<div class="step"><div class="num">{num(total)}</div><div class="what">incidenti rilevati dalla Polizia Locale di Roma Capitale</div></div>
<div class="step"><div class="num">{num(meta['incidenti'])}</div><div class="what">con posizione affidabile: sono quelli che usiamo</div></div>
<div class="step"><div class="num">{num(len(items))}</div><div class="what">punti critici: 90 metri di strada con almeno {meta.get('soglia', 22)} incidenti</div></div>
<div class="step"><div class="num">{num(in_hot)}</div><div class="what">incidenti avvenuti in quei punti: più di uno su cinque</div></div>
</div>

<h2>Com'è fatto il dato di partenza</h2>
<p class="sub">Dodici incidenti veri di {e(mese(ym))}, così come li pubblica il Comune: quando, in che punto della strada (incrocio o numero civico), che tipo, chi era coinvolto, quanti feriti, le coordinate.</p>
<div class="wrap"><table>
<tr><th>Data e ora</th><th>Strada</th><th>Punto</th><th>Tipo di incidente</th><th>Veicoli</th><th class="n">Feriti</th><th>Coordinate</th></tr>
{tr_inc}
</table></div>
<p class="note">Le coordinate sono ricavate dall'indirizzo del verbale e arrotondate a circa 10 metri. Scartiamo gli incidenti segnati su un punto generico della strada, perché creerebbero punti critici finti.</p>

<h2>I dodici punti con più incidenti</h2>
<p class="sub">Ognuno è un tratto di circa 90 metri. Lungo un percorso, Occhio! unisce quelli vicini in un solo tratto critico.</p>
<div class="wrap"><table>
<tr><th class="n">#</th><th>Dove</th><th class="n">Incidenti</th><th class="n">In moto o bici</th><th class="n">Con feriti</th><th class="n">Morti</th></tr>
{tr_hot}
</table></div>

<footer>Fonti: <a href="https://dati.comune.roma.it/catalog/dataset?tags=incidenti">open data di Roma Capitale</a> (incidenti), <a href="https://www.openstreetmap.org">OpenStreetMap</a> (strade). Codice e procedura: <a href="https://github.com/lsinigaglia/occhio">github.com/lsinigaglia/occhio</a>. I dati pubblici si fermano ad agosto 2022.</footer>
</main>
</body>
</html>
"""
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(page)
    print('scritto', OUT, '| incidenti rilevati', total, '| usati', meta['incidenti'], '| punti critici', len(items), '| nei punti critici', in_hot)


if __name__ == '__main__':
    main()
