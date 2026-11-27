# NFOPD: No Friends On Powder Days

<img src="brand/nfopd-mark.svg" width="72" alt="NFOPD mark: two ski tracks weaving figure-8s in fresh powder below a snow stake">

Snow forecasts for the pre-dawn powder check. NOAA-first forecasts, a multi-model blend with real odds, each resort's own snow report and webcams, and a public track record of how the forecasts did. Covers every operating downhill area in the US and Canada, with hand-checked snow reports and cams for Idaho.

The whole app is one file, `nfopd.html`.

## Ways to run it

| How | What you get |
| --- | --- |
| **Vercel** (this repo deploys as-is) | Everything, live, and installable as an app from the browser (`manifest.webmanifest`, `sw.js`, `icons/`; `build.py` adds the tags to `index.html`). `api/proxy.js` fetches from the forecast, observation, avalanche and resort hosts the app uses, and nothing else. |
| **Local server**: `python3 serve.py`, then open http://127.0.0.1:8765 | Everything, live, in any browser. Python 3 standard library only. |
| **Claude desktop app** (open the published artifact in the Claude desktop app, click **Install as app**, then **Allow live data**) | Everything, live, fetched with `curl` on your Mac. Forecast history is kept in `~/Library/Application Support/NFOPD/history`. |
| **Published artifact in a browser** | The saved snapshot only. |

## Which ski areas

Every operating downhill area in the western US and Canada. East of the Rockies only those with 1,000 ft or more of vertical (`EAST_MIN_VERT` in `nfopd.html`). About 950 larger areas outside North America are listed with model forecasts only.

Forecasts for North American resorts are read at an upper-mountain point for each resort (`FXPT` in `nfopd.html`), not at the listed base location. A base-village point can put the NWS grid cell and the models on the valley floor, which under-forecasts snow.

## Data sources

- **NOAA / National Weather Service** (US): the official grid forecast (hourly snowfall, temperature, snow level, wind), the 7-day point forecast (the same one weather.gov's MapClick page shows), observations, watches and warnings, Area Forecast Discussions, and RIDGE radar loops.
- **Environment and Climate Change Canada** (Canada): the official city forecast nearest each resort, with current conditions and alerts.
- **Weather models** via Open-Meteo: NOAA's NBM, HRRR and GFS, plus ECMWF, GEM and ICON. Also the GEFS (31 runs) and ECMWF (51 runs) ensembles, and an archive of past model runs.
- **USDA NRCS SNOTEL**: observed snow depth, snow water and precipitation at the nearest station.
- **Avalanche danger**: avalanche.org centers (US) and Avalanche Canada.
- **Resorts**: each resort's own snow report and webcam images (see `REPORTS` and `CAMS` in `nfopd.html`).
- **Ski area list**: [OpenSkiMap](https://openskimap.org), data © OpenStreetMap contributors (ODbL).
- **Local forecasters**: each avalanche center's mountain-weather discussion (avalanche.org), plus the latest post from free independent forecasters: Jim Steenburgh (Wasatch Weather Weenies), Chris Tomer, Mike Weissbluth (SnowAlarm), Cliff Mass, Daniel Swain (Weather West), Jim Woodmencey (MountainWeather.com) and Powderchasers. NFOPD shows a short excerpt and links to the original. NWAC, CAIC, Utah Avalanche Center and Avalanche Canada weather forecasts are linked, not fetched.

## What NFOPD adds

- **NFOPD Daily.** A short regional snow discussion for each western region, written by AI from the latest NWS Area Forecast Discussions and NBM/GFS/ECMWF summit snowfall (`api/daily.js`). It runs through Vercel AI Gateway on a zero-cost model (NVIDIA Nemotron 3.5 Lightning), authenticated with the deployment's OIDC token, so it needs no API key and costs nothing. Each region is regenerated at most every 6 hours (edge cache). Set `NFOPD_DAILY_MODEL` (for example `anthropic/claude-haiku-5.5`) to use a paid model once AI Gateway credits are added.
- **NFOPD blend.** A weighted blend of NWS (3), NBM (3), HRRR (2), ECMWF (2), GFS (1), GEM (1) and ICON (1), shown with the model range. With four or more models, the single highest and lowest are left out of the average, so one runaway model can't drive the number.
- **Odds and confidence out to 15 days.** For the next 5 days, days 6–10 and days 11–15: the likely range (10th to 90th percentile across 82 ensemble runs), the chance of 1", 6" and 12"+, and a 0–100 confidence score (the share of runs within 40% or 1" of the middle run).
- **Track record.** For each resort with a nearby SNOTEL gauge, what the models forecast 1, 3 and 5 days ahead over the last 30 days, compared with the water the gauge measured. You see storm days caught and whether forecasts ran wet or dry.
- **Snow timeline.** On every resort page: daily snowfall for the last 15 days, the last 24 hours and the next 15 days, grouped in 5-day blocks with totals and the model range. Past days are model estimates, not measurements.
- **Pinpoint map.** Each forecast page shows a satellite map of the exact forecast point. Tap the map to move the point and load that spot's forecast.
- **Kuchera snow ratio.** Models delivered as liquid × 7 are converted to snow with a temperature-based ratio. NBM already carries NOAA's own snow ratio, so its snowfall is used as issued.
- **Three-way 24-hour check.** The resort's reported new snow, the SNOTEL depth gain and the model estimate, side by side.
- **Snow level against the mountain.** The snow level is plotted against base and summit elevation.

## Brand

| | |
| --- | --- |
| Name | **NFOPD**, short for No Friends On Powder Days |
| Mark | `brand/nfopd-mark.svg`: a blaze-orange snow stake above fresh powder, carved by two tracks weaving figure-8s |
| Wordmark | NFOPD in Barlow Condensed ExtraBold Italic: NFO in snow white, PD in powder blue `#6FB4FF` with a snow-white cap across the top of each letter; tagline in Barlow Condensed Bold caps, tracked wide, in lamp amber |
| Colors | Blaze orange `#FF6A13` · Night navy `#0B1626` · Snow white `#EEF3F8` · Powder blue `#6FB4FF` · Lamp amber `#F6C46A` |

## Idaho coverage (hand-checked feeds)

| Resort | Snow report | Webcams |
| --- | --- | --- |
| Tamarack | Resort snow report page | 5 YouTube live cams |
| Brundage | Brundage app-data JSON | 6 stills, 4 live streams |
| Bogus Basin | Conditions page | 9 (PrismCam, YouTube, parking cams) |
| Sun Valley | Mountain report page | 7 stills (Prism, HDRelay) |
| Schweitzer | MTNPowder feed | Roundshot panorama, 6 YouTube cams |
| Silver Mountain | Snow report page | 4 stills |
| Lookout Pass | PowderWatch JSON | 3 live cams |
| Lost Trail | Snow report page | Chair 1 cam, which streams only while open |
| Grand Targhee | Mountain report page | 6 (stills and YouTube) |
| Pomerelle | Conditions page | None published |
| Soldier Mountain | SnoCountry feed | 1 (the site blocks automated reads) |
| Magic Mountain, Kelly Canyon | OnTheSnow feed | Kelly: 3 YouTube cams |
| Pebble Creek | Resort JSON | 1 YouTube cam |
| Little Ski Hill | Status and announcements only | None published |

Every other US and Canadian area gets forecasts, odds, the track record (where there's a SNOTEL gauge), avalanche danger and the official forecast.

## Publishing a fresh snapshot (for the Claude artifact)

1. `python3 serve.py`
2. Open http://127.0.0.1:8765 and run `await NFOPD.saveSnapshot()` in the browser console. This writes `snapshot.json`.
3. `python3 build.py` writes `index.html` (the web app) and `dist/nfopd.html` (the artifact, snapshot embedded).

## Adding a resort feed

Every area is already in the catalog. To add a resort's own report or cams, add an entry to `REPORTS` that returns `{ new24, new48, new7d, overnight, base, summit, season, liftsOpen, liftsTotal, runsOpen, runsTotal, status, conditions, updated, comment }`, and webcams to `CAMS` as `{ name, image, page }` (add `bust: true` when the image server caches too long). Then add the resort's hosts to `ALLOW` in `api/proxy.js`.
