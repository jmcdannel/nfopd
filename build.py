#!/usr/bin/env python3
"""Build NFOPD's two deployable copies from nfopd.html.

    python3 build.py

- index.html: the web app for Vercel (or any static host with the /api proxy). Live data, no snapshot.
- dist/nfopd.html: the Claude artifact copy with snapshot.json embedded, for publishing.
  Make snapshot.json first: run `python3 serve.py`, open http://127.0.0.1:8765, then run
  `await NFOPD.saveSnapshot()` in the browser console.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
page = (HERE / "nfopd.html").read_text("utf-8")
marker = '<script type="application/json" id="pl-snapshot">{}</script>'
assert marker in page, "snapshot placeholder not found"

SKELETON = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>"
    "</head><body>"
)
(HERE / "index.html").write_text(SKELETON + page + "</body></html>\n", "utf-8")
print("index.html written")

snap_path = HERE / "snapshot.json"
if snap_path.exists():
    snap = snap_path.read_text("utf-8")
    json.loads(snap)  # fail early on a broken snapshot
    out = page.replace(marker, '<script type="application/json" id="pl-snapshot">' + snap.replace("</", "<\\/") + "</script>")
    (HERE / "dist").mkdir(exist_ok=True)
    (HERE / "dist" / "nfopd.html").write_text(out, "utf-8")
    print(f"dist/nfopd.html written ({len(out) / 1e6:.1f} MB)")
else:
    print("snapshot.json not found; skipped the artifact copy")
