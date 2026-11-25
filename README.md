# Powderline

A personal snow forecast app: NOAA forecasts, model blends, resort snow reports and webcams in one place. The whole app is one file, `powderline.html`.

## Three ways to run it

| How | What you get |
| --- | --- |
| **Install as a Claude desktop app** (open the published artifact in the Claude desktop app, click **Install as app**, then **Allow live data**) | Everything, live. Data is fetched with `curl` on your Mac. Downloads are cached in your temp folder and forecast history is kept in `~/Library/Application Support/Powderline/history`. |
| **Local server**: `python3 serve.py`, then open http://127.0.0.1:8765 | Everything, live, in any browser. Python 3 standard library only. |
| **Open the published page in a browser** | The saved snapshot only: forecasts and reports as of the last publish. |

## Data sources

- **NOAA / National Weather Service** (api.weather.gov): official grid forecast (hourly snowfall, temperature, snow level, wind), the 7-day point forecast (the same one weather.gov's MapClick page shows), current observations, watches and warnings, Area Forecast Discussions, and RIDGE radar loops.
- **Weather models** via Open-Meteo: NOAA's NBM, HRRR and GFS, plus ECMWF, GEM and ICON. The past 7 days come from the same models.
- **USDA NRCS SNOTEL**: observed snow depth and snow water at the nearest station, ranked by distance and elevation.
- **avalanche.org**: danger rating and travel advice for the forecast zone that contains the resort.
- **Resort websites**: each resort's own snow report and webcam images (see `REPORTS` and `CAMS` in `powderline.html`).

## What Powderline adds

- **Powderline blend.** A weighted blend of NWS (3), NBM (3), HRRR (2), ECMWF (2), GFS (1), GEM (1) and ICON (1), shown with the model range and a confidence label. With four or more models, the single highest and lowest are left out of the average, so one runaway model can't drive the number.
- **Kuchera snow ratio.** Models delivered as liquid × 7 are converted to snow with a temperature-based ratio. NBM already carries NOAA's own snow ratio, so its snowfall is used as issued. A snow-quality label (Dense, Average, Light, Blower) comes from the blended ratio.
- **Three-way 24-hour check.** The resort's reported new snow, the SNOTEL depth gain and the model estimate, side by side.
- **Snow level against the mountain.** The NWS snow level is plotted against base and summit elevation, so you can see when rain reaches the base.
- **Forecast scoring** (desktop app). Each day's forecast is saved and later compared with SNOTEL observations.

## Idaho resort coverage

| Resort | Snow report | Webcams |
| --- | --- | --- |
| Tamarack | Resort snow report page | 5 YouTube live cams |
| Brundage | Brundage app-data JSON | 6 stills, 4 live streams |
| Bogus Basin | Conditions page | 9 (PrismCam, YouTube, parking cams) |
| Schweitzer | MTNPowder feed | Roundshot panorama, 6 YouTube cams |
| Silver Mountain | Snow report page | 4 stills |
| Lookout Pass | PowderWatch JSON | 3 live cams |
| Lost Trail | Snow report page | Chair 1 cam, which streams only while the area is open |
| Little Ski Hill | Status and announcements only | None published |

## Publishing a fresh snapshot

1. Start the server: `python3 serve.py`
2. Open http://127.0.0.1:8765, then run `await Powderline.saveSnapshot()` in the browser console. This writes `snapshot.json`.
3. Run `python3 build.py`. This writes `dist/powderline.html` with the snapshot embedded, ready to publish.

## Adding a resort

1. Add a row to `RESORTS`: id, name, state, region, latitude, longitude, base ft, summit ft, website.
2. Optionally add an entry to `REPORTS` that returns `{ new24, new48, new7d, overnight, base, summit, season, liftsOpen, liftsTotal, runsOpen, runsTotal, status, conditions, updated, comment }`.
3. Optionally add webcams to `CAMS` as `{ name, image, page }`. Add `bust: true` when the image server caches too long.
