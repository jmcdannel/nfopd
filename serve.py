#!/usr/bin/env python3
"""NFOPD (No Friends On Powder Days) local server.

Serves nfopd.html at http://127.0.0.1:8765 and proxies the data sources the
page reads (NOAA/NWS, Open-Meteo, SNOTEL, avalanche.org, resort websites and
webcams), so the app works in any browser with no install. Standard library only.

    python3 serve.py            # then open http://127.0.0.1:8765
    python3 serve.py --port 9000
"""
import argparse
import http.server
import ipaddress
import socket
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAGE = HERE / "nfopd.html"
UA = "NFOPD/1.0 (No Friends On Powder Days snow app; github.com/jmcdannel/nfopd)"
SKELETON = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>"
    "</head><body>"
)


def public_host(host: str) -> bool:
    """Refuse proxying to this machine or the local network."""
    try:
        for info in socket.getaddrinfo(host, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        return True
    except OSError:
        return False


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, code, body, ctype="text/plain; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path in ("/", "/index.html"):
            html = SKELETON + PAGE.read_text("utf-8") + "</body></html>"
            return self.send(200, html.encode(), "text/html; charset=utf-8")
        if url.path == "/proxy/health":
            return self.send(200, b"ok")
        if url.path == "/proxy":
            q = urllib.parse.parse_qs(url.query)
            target = (q.get("url") or [""])[0]
            parts = urllib.parse.urlsplit(target)
            if parts.scheme not in ("http", "https") or not parts.hostname or not public_host(parts.hostname):
                return self.send(400, b"Unsupported URL")
            headers = {"User-Agent": UA, "Accept": (q.get("accept") or ["*/*"])[0]}
            try:
                with urllib.request.urlopen(urllib.request.Request(target, headers=headers), timeout=40) as r:
                    return self.send(r.status, r.read(), r.headers.get("Content-Type", "application/octet-stream"))
            except urllib.error.HTTPError as e:
                return self.send(e.code, e.read() or str(e).encode())
            except Exception as e:  # network errors, timeouts
                return self.send(502, str(e).encode())
        self.send(404, b"Not found")

    def do_POST(self):
        # The page posts a data snapshot here; build.py embeds it into the published copy.
        if urllib.parse.urlsplit(self.path).path != "/snapshot":
            return self.send(404, b"Not found")
        if self.headers.get("X-NFOPD") != "1":  # blocks cross-site form posts
            return self.send(403, b"Forbidden")
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > 15_000_000:
            return self.send(400, b"Bad size")
        (HERE / "snapshot.json").write_bytes(self.rfile.read(n))
        self.send(200, b"saved")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"NFOPD running at http://127.0.0.1:{args.port}  (Ctrl+C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
