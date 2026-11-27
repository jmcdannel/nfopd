#!/usr/bin/env python3
"""Build NFOPD's two deployable copies from nfopd.html.

    python3 build.py

- index.html: the web app for Vercel (or any static host with the /api proxy). Live data, no snapshot.
- dist/nfopd.html: the Claude artifact copy with snapshot.json embedded, for publishing.
  Make snapshot.json first: run `python3 serve.py`, open http://127.0.0.1:8765, then run
  `await NFOPD.saveSnapshot()` in the browser console.
"""
import json
import os
import subprocess
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
# Sentry: error tracking and a feedback form (website only). Paste the project's DSN here, or set NFOPD_SENTRY_DSN
# when building; with no DSN nothing is loaded and the Feedback button stays hidden. A DSN is public by design.
SENTRY_DSN = os.environ.get("NFOPD_SENTRY_DSN", "")
SENTRY_SDK = "https://browser.sentry-cdn.com/9.47.1/bundle.feedback.min.js"


def sentry_snippet(dsn: str) -> str:
    if not dsn:
        return ""
    try:
        release = "nfopd@" + subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=HERE, capture_output=True, text=True).stdout.strip()
    except OSError:
        release = "nfopd"
    # Errors raised before the SDK arrives are held and sent once it loads. The SDK loads after the page, so it never slows first paint.
    return (
        "<script>(function(){var early=[];function hold(e){early.push(e.error||e.reason||e.message)}"
        "addEventListener('error',hold);addEventListener('unhandledrejection',hold);"
        "addEventListener('load',function(){var s=document.createElement('script');s.src=" + json.dumps(SENTRY_SDK) + ";s.crossOrigin='anonymous';"
        "s.onload=function(){removeEventListener('error',hold);removeEventListener('unhandledrejection',hold);"
        "Sentry.init({dsn:" + json.dumps(dsn) + ",release:" + json.dumps(release) + ","
        "environment:location.hostname==='nfopd.vercel.app'?'production':'development',sendDefaultPii:false,"
        "ignoreErrors:['ResizeObserver loop','Load failed','Failed to fetch','NetworkError'],"
        "integrations:[Sentry.feedbackIntegration({autoInject:false,colorScheme:'dark',showBranding:false,isNameRequired:false,isEmailRequired:false,"
        "formTitle:'Send feedback',messagePlaceholder:'What went wrong, or what would make NFOPD better?',submitButtonLabel:'Send',successMessageText:'Thanks. Got it.'})]});"
        "early.forEach(function(e){e instanceof Error?Sentry.captureException(e):e&&Sentry.captureMessage(String(e))});"
        "var fb=Sentry.getFeedback&&Sentry.getFeedback(),btn=document.getElementById('feedback');if(fb&&btn){btn.hidden=false;fb.attachTo(btn)}};"
        "document.head.appendChild(s)})})();</script>"
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
(HERE / "index.html").write_text(SKELETON + page + ANALYTICS + PWA + sentry_snippet(SENTRY_DSN) + "</body></html>\n", "utf-8")
print("index.html written" + (" (Sentry on)" if SENTRY_DSN else " (Sentry off: no DSN set)"))

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
