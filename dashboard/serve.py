"""Serve pack-owned read-only UI and forward same-origin API reads to Gas City."""
import argparse, http.client, http.server, pathlib
ROOT = pathlib.Path(__file__).resolve().parent
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_GET(self):
        if not self.path.startswith('/api/city/'):
            return super().do_GET()
        upstream = http.client.HTTPConnection('127.0.0.1', 8372, timeout=65)
        try:
            upstream.request('GET', self.path, headers={'Host':'127.0.0.1:8372','Connection':'close'})
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
args=parser.parse_args()
http.server.ThreadingHTTPServer(('0.0.0.0',args.port),Handler).serve_forever()
