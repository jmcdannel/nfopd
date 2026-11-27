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
    "body{margin:0;background:#0B1626}img{max-width:100%}[hidden]{display:none!important}</style>"
    # Installable web app: manifest, icons and the tags phones read (website only).
    "<title>NFOPD</title>"
    '<meta name="description" content="No Friends On Powder Days: snow totals, forecasts, odds, resort reports and webcams from NOAA, the models and the resorts themselves.">'
    '<meta name="theme-color" content="#0B1626">'
    '<link rel="manifest" href="/manifest.webmanifest">'
    '<link rel="icon" href="/favicon.ico" sizes="48x48">'
    '<link rel="icon" type="image/svg+xml" href="/icons/icon.svg">'
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">'
    '<meta name="mobile-web-app-capable" content="yes">'
    '<meta name="apple-mobile-web-app-capable" content="yes">'
    '<meta name="apple-mobile-web-app-title" content="NFOPD">'
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
    "</head><body>"
)
# The service worker makes the site installable and lets it open offline (see sw.js).
PWA = "<script>if ('serviceWorker' in navigator) addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });</script>"

# Vercel Web Analytics and Speed Insights (website only; they report once enabled in the Vercel dashboard).
ANALYTICS = (
    "<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>"
    '<script defer src="/_vercel/insights/script.js"></script>'
    "<script>window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };</script>"
    '<script defer src="/_vercel/speed-insights/script.js"></script>'
)
(HERE / "index.html").write_text(SKELETON + page + ANALYTICS + PWA + "</body></html>\n", "utf-8")
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
