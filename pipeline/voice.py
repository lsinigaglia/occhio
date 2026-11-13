"""Genera con ElevenLabs le clip vocali degli avvisi: "Occhio", i nomi delle strade, le mezze frasi.

Uso:
    python pipeline/voice.py --voice <voice_id> [--model eleven_v4] [--only "Via Marmorata|Via Nicola Zabaglia"]

La chiave si legge da .env (ELEVENLABS_API_KEY), che non va nella repo. Le clip già presenti
non vengono rigenerate. Alla fine aggiorna docs/audio/index.json, che dice all'app cosa esiste.
"""
import argparse
import json
import os
import re
import unicodedata
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, 'docs', 'audio')

# le stesse chiavi usate in docs/app.js (PHRASES)
PHRASES = {
    'ped': 'Attenzione agli attraversamenti pedonali.',
    'lat': 'Attenzione a chi svolta o si immette.',
    'tamp': 'Tieni la distanza.',
    'sosta': 'Attenzione a portiere e doppie file.',
    'fondo': 'Fondo insidioso, rallenta.',
    'rallenta': 'Rallenta.',
}
ROMAN = {'Ii': 'Secondo', 'Iii': 'Terzo', 'Iv': 'Quattro', 'Vi': 'Sesto', 'Xii': 'Dodicesimo', 'Xx': 'Venti',
         'Xxi': 'Ventuno', 'Xxiii': 'Ventitreesimo', 'Xxiv': 'Ventiquattro', 'Xxv': 'Venticinque'}


def slug(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def spoken(name):
    """Scrive il nome come va letto: scioglie le abbreviazioni più comuni."""
    words = name.split()
    out = []
    for i, w in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else ''
        if w in ('S.', 'S'):
            w = 'Santa' if nxt.lower().endswith('a') else "Sant'" if nxt[:1].lower() in 'aeiou' else 'San'
        elif w in ('Ss.', 'Ss'):
            w = 'Santi'
        elif w in ROMAN:
            w = ROMAN[w]
        elif w in ('Di', 'Del', 'Della', 'Dei', 'Degli', 'Delle', 'Da', 'De', 'In', 'A', 'E'):
            w = w.lower()
        out.append(w)
    return ' '.join(out).replace("Sant' ", "Sant'") + '.'


def tts(key, voice, model, text):
    body = {'text': text, 'model_id': model, 'language_code': 'it'}
    for attempt in (body, {'text': text, 'model_id': model}):
        req = urllib.request.Request(
            f'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_64',
            data=json.dumps(attempt).encode(), headers={'xi-api-key': key, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            err = f'{e.code} {e.read().decode("utf-8", "replace")[:200]}'
    raise RuntimeError(err)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', required=True)
    ap.add_argument('--model', default='eleven_v4')
    ap.add_argument('--only', default='', help='nomi di strada separati da | (per generarne solo alcuni)')
    ap.add_argument('--force', action='store_true', help='rigenera anche le clip già presenti')
    a = ap.parse_args()
    env = dict(l.strip().split('=', 1) for l in open(os.path.join(ROOT, '.env')) if '=' in l)
    key = env['ELEVENLABS_API_KEY']
    with open(os.path.join(ROOT, 'docs', 'data', 'hotspots.json'), encoding='utf-8') as fh:
        names = sorted({h['s1'] for h in json.load(fh)['items'] if h['s1']})
    if a.only:
        wanted = {slug(x) for x in a.only.split('|')}
        names = [n for n in names if slug(n) in wanted]
    jobs = [('occhio.mp3', 'Occhio!')]
    jobs += [(f'p/{k}.mp3', t) for k, t in PHRASES.items()]
    jobs += [(f'n/{slug(n)}.mp3', spoken(n)) for n in names]
    os.makedirs(os.path.join(AUDIO, 'n'), exist_ok=True)
    os.makedirs(os.path.join(AUDIO, 'p'), exist_ok=True)
    made = chars = 0
    for rel, text in jobs:
        out = os.path.join(AUDIO, rel)
        if os.path.exists(out) and os.path.getsize(out) > 500 and not a.force:
            continue
        try:
            data = tts(key, a.voice, a.model, text)
        except Exception as e:
            print('ERRORE', rel, str(e)[:160])
            break
        with open(out, 'wb') as fh:
            fh.write(data)
        made += 1
        chars += len(text)
        print(rel, '<-', text)
    index = {
        'voice': a.voice, 'model': a.model,
        'names': sorted(f[:-4] for f in os.listdir(os.path.join(AUDIO, 'n')) if f.endswith('.mp3')),
        'phrases': sorted(f[:-4] for f in os.listdir(os.path.join(AUDIO, 'p')) if f.endswith('.mp3')),
    }
    with open(os.path.join(AUDIO, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(index, fh)
    print(f'generate {made} clip ({chars} caratteri); in totale {len(index["names"])} nomi e {len(index["phrases"])} frasi')


if __name__ == '__main__':
    main()
