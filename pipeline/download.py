"""Scarica i dati grezzi in data/raw/: strade (OpenStreetMap) e incidenti (Open Data Roma Capitale).

Uso: python pipeline/download.py
I file già presenti vengono saltati; i server pubblici rispondono a tratti, quindi si riprova.
"""
import json
import os
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_OSM = os.path.join(ROOT, 'data', 'raw', 'osm')
RAW_INC = os.path.join(ROOT, 'data', 'raw', 'incidenti')
UA = {'User-Agent': 'occhio-data/1.0'}

OVERPASS = 'https://overpass-api.de/api/interpreter'
ROADS = ('way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|'
         'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]')
# Roma dentro il raccordo, in quattro riquadri (richieste più piccole passano più facilmente)
TILES = ['41.78,12.35,41.895,12.495', '41.78,12.495,41.895,12.64',
         '41.895,12.35,42.01,12.495', '41.895,12.495,42.01,12.64']

CKAN = 'https://dati.comune.roma.it/catalog/api/3/action/package_search?q=incidenti+stradali&rows=50'
YEARS = ('2021', '2022')


def fetch(url, data=None, timeout=240):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def retry(fn, tries=6, wait=8):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            print('   riprovo:', str(e)[:80])
            time.sleep(wait * (i + 1))
    return None


def roads():
    os.makedirs(RAW_OSM, exist_ok=True)
    for i, bb in enumerate(TILES, 1):
        out = os.path.join(RAW_OSM, f't{i}.json')
        if os.path.exists(out) and os.path.getsize(out) > 500_000:
            continue
        q = f'[out:json][timeout:100];{ROADS}({bb});out body;>;out skel qt;'
        body = retry(lambda: fetch(OVERPASS, urllib.parse.urlencode({'data': q}).encode()))
        if body and len(body) > 500_000:
            with open(out, 'wb') as fh:
                fh.write(body)
            print('strade', i, len(body))
        else:
            print('strade', i, 'NON SCARICATO')


def incidents():
    os.makedirs(RAW_INC, exist_ok=True)
    body = retry(lambda: fetch(CKAN))
    if not body:
        print('catalogo incidenti non raggiungibile')
        return
    for p in json.loads(body)['result']['results']:
        year = p['title'].strip()[-4:]
        if 'ncident' not in p['title'] or year not in YEARS:
            continue
        n = 0
        for x in p['resources']:
            if (x.get('format') or '').upper() != 'CSV':
                continue
            n += 1
            out = os.path.join(RAW_INC, f'{year}-{n:02d}.csv')
            if os.path.exists(out) and os.path.getsize(out) > 50_000:
                continue
            data = retry(lambda: fetch(x['url'], timeout=120), tries=3)
            if data and len(data) > 50_000:
                with open(out, 'wb') as fh:
                    fh.write(data)
                print('incidenti', year, n, len(data))
            else:
                print('incidenti', year, n, 'NON SCARICATO')


if __name__ == '__main__':
    roads()
    incidents()
