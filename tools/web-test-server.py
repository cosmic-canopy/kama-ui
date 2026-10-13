#!/usr/bin/env python3
"""web-test-server.py — serve the web test page, and wait for its verdict.

    web-test-server.py <dir> <port> <timeout-seconds>

Serves <dir> on 127.0.0.1:<port>. The page (tests/web/kama_ui_test.js) POSTs {run, failed, verdict, output} to /report
when the suite ends; this prints what the program printed, then the verdict, and exits 0 for PASS, 1 for FAIL, and 2 if
no report arrived in time. Nothing else is needed from the browser — no DOM dump, no screenshot.
"""
import http.server
import json
import sys
import threading

ROOT, PORT, TIMEOUT = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
result = {}
done = threading.Event()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path != "/report":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length", "0"))
        try:
            result.update(json.loads(self.rfile.read(n).decode("utf-8")))
        except ValueError:
            result["verdict"] = "kama-ui web: unreadable report"
        self.send_response(204)
        self.end_headers()
        done.set()

    def log_message(self, fmt, *args):   # quiet: the verdict is the output
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
print(f"web-test-server: serving {ROOT} on http://127.0.0.1:{PORT}/", flush=True)
arrived = done.wait(TIMEOUT)
server.shutdown()
if not arrived:
    print(f"web-test-server: no report within {TIMEOUT:.0f} s", flush=True)
    sys.exit(2)
out = result.get("output", "")
if out:
    print(out.rstrip("\n"), flush=True)
print(result.get("verdict", "?"), flush=True)
sys.exit(0 if result.get("failed", 1) == 0 and result.get("run", 0) > 0 else 1)
