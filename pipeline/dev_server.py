"""Server di sviluppo: serve docs/ e fa da tramite verso i servizi esterni usati dall'app.

Serve solo per provare l'app su un telefono collegato via USB che non ha internet
(adb reverse tcp:5174 tcp:5174, poi aprire http://localhost:5174/?proxy). Online non serve.
"""
import os
import sys
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs')
ALLOWED = {'tiles.openfreemap.org', 'photon.komoot.io'}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=SITE, **k)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if not self.path.startswith('/_p/'):
            return super().do_GET()
        rest = self.path[4:]
        host = rest.split('/', 1)[0]
        if host not in ALLOWED:
            return self.send_error(403)
        try:
            req = urllib.request.Request('https://' + rest, headers={'User-Agent': 'dev-proxy/1.0'})
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read()
                ctype = r.headers.get('Content-Type', 'application/octet-stream')
            if 'json' in ctype:  # gli stili della mappa contengono altri indirizzi esterni
                for h in ALLOWED:
                    body = body.replace(b'https://' + h.encode(), b'http://' + self.headers['Host'].encode() + b'/_p/' + h.encode())
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            SimpleHTTPRequestHandler.end_headers(self)
            self.wfile.write(body)
        except Exception as e:
            self.send_error(502, str(e)[:80])


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5174
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
