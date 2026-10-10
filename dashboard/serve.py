"""Serve pack-owned read-only UI and forward same-origin API reads to Gas City."""
import argparse, http.client, http.server, pathlib, os
from urllib.parse import urlsplit
ROOT = pathlib.Path(__file__).resolve().parent
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_GET(self):
        if not self.path.startswith('/api/city/'):
            return super().do_GET()
        upstream = http.client.HTTPConnection(UPSTREAM.hostname, UPSTREAM.port, timeout=65)
        try:
            upstream.request('GET', self.path, headers={'Host':f'{UPSTREAM.hostname}:{UPSTREAM.port}','Connection':'close'})
            response = upstream.getresponse()
            body = response.read()
            self.send_response(response.status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control','no-store')
            self.send_header('Content-Length',str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (TimeoutError, OSError) as error:
            if isinstance(error, (BrokenPipeError,ConnectionResetError)): return
            self.send_error(502,'Gas City API unavailable')
        finally:
            upstream.close()
parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=43597)
parser.add_argument('--upstream', default=os.environ.get('DALPH_TRACKER_ENDPOINT', 'http://127.0.0.1:8372'))
args=parser.parse_args()
UPSTREAM=urlsplit(args.upstream)
if (UPSTREAM.scheme != 'http' or UPSTREAM.hostname != '127.0.0.1' or not UPSTREAM.port
        or UPSTREAM.path not in ('', '/') or UPSTREAM.query or UPSTREAM.fragment
        or UPSTREAM.username or UPSTREAM.password):
    parser.error('--upstream must be a loopback http://127.0.0.1:PORT endpoint')
http.server.ThreadingHTTPServer(('0.0.0.0',args.port),Handler).serve_forever()
