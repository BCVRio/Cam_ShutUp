"""Serve the repo for the world exporter and accept its files.

    python tools/export_server.py [port]        (default 8000)

Serves the repository root like `python -m http.server` and, in addition, takes POST /__export/<name> and writes the
body to unreal/exports/<name>. Then open http://localhost:8000/tools/export.html and press Export (or add ?auto=1).
Plain `python -m http.server 8000` works too; the page then offers the GLBs as downloads instead of writing them."""
import http.server
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'unreal', 'exports')
NAME = re.compile(r'^/__export/([A-Za-z0-9][A-Za-z0-9_.-]{0,80})$')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        m = NAME.match(self.path)
        if not m or '..' in m.group(1):
            self.send_error(404, 'POST only to /__export/<name>')
            return
        name = m.group(1)
        length = int(self.headers.get('Content-Length') or 0)
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, name)
        written = 0
        with open(path, 'wb') as f:
            while written < length:
                chunk = self.rfile.read(min(1 << 20, length - written))
                if not chunk:
                    break
                f.write(chunk)
                written += len(chunk)
        body = json.dumps({'ok': written == length, 'path': os.path.relpath(path, ROOT).replace(os.sep, '/'), 'bytes': written}).encode()
        self.send_response(200 if written == length else 500)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        sys.stderr.write('wrote %s (%d bytes)\n' % (path, written))

    def log_message(self, fmt, *args):   # keep the console to the exports and errors
        if self.command == 'POST' or (args and str(args[1]).startswith(('4', '5'))):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print('serving %s on http://localhost:%d/  (exports go to %s)' % (ROOT, port, OUT))
    print('open http://localhost:%d/tools/export.html' % port)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
