"""Exercise the Effect entrypoint against an actual bounded HTTP fixture."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import threading
import unittest

PACK = Path(__file__).resolve().parents[1]

class EffectHttpTests(unittest.TestCase):
    def invoke(self, argument):
        return subprocess.run(['mise', 'exec', 'node@24.20.0', '--', 'node',
                               str(PACK / 'scripts/beads-http.mjs'), argument],
                              cwd=PACK, capture_output=True, text=True, timeout=20)

    def fixture(self, status, body):
        calls = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append(self.path)
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(body).encode())
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server.server_port, calls

    def argument(self, port):
        return json.dumps({'endpoint': f'http://127.0.0.1:{port}', 'city': 'fixture',
                           'id': 'task-1', 'action': 'show', 'body': {}})

    def test_valid_response_is_decoded_and_encoded_at_the_boundary(self):
        port, calls = self.fixture(200, {'id': 'task-1', 'status': 'open', 'metadata': {'owner': 'fixture'}})
        result = self.invoke(self.argument(port))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['metadata'], {'owner': 'fixture'})
        self.assertEqual(calls, ['/v0/city/fixture/bead/task-1'])

    def test_http_refusal_is_a_typed_effect_failure(self):
        port, calls = self.fixture(403, {'error': 'fixture refusal'})
        result = self.invoke(self.argument(port))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('TrackerRejected', result.stderr)
        self.assertEqual(len(calls), 1)

    def test_success_status_with_invalid_body_is_not_accepted(self):
        port, calls = self.fixture(200, {'id': 'task-1', 'status': 123})
        result = self.invoke(self.argument(port))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SchemaError', result.stderr)
        self.assertEqual(len(calls), 1)

    def test_malformed_input_fails_before_http(self):
        result = self.invoke('{malformed')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SchemaError', result.stderr)

if __name__ == '__main__':
    unittest.main()
