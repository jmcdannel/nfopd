// NFOPD snow conversion. Turns each weather model's hourly liquid precipitation into snowfall at the
// mountain's real elevation, then sums it by local day.
//
// Why: a model's own snowfall field is decided at the model's smoothed terrain, which sits below the
// real mountain, so warm storms come out as rain. Measured against 22 SNOTEL gauges over Oct 9 to
// Nov 25, 2026 (153 snow days), the hourly method below cut per-model daily error by 16% and
// storm-total error by 22% compared with the daily "snowfall / 7 x Kuchera(max temp)" it replaces.
// The constants are provisional: early-season data only. Re-check them in mid-winter.
//
//   snow(hour) = liquid x snowFraction(wet bulb) x ratio(temperature)
//   snowFraction: all snow at a wet bulb of 31 F or colder, none at 34 F or warmer
//   ratio: 0.75 x Kuchera, at most 10:1 (10 at 26 F and colder, 7.7 at 30 F, 6.0 at 32 F)
//
// The same three functions are repeated in nfopd.html for its own hourly charts. Keep them in step.
const UA = 'NFOPD/1.0 (No Friends On Powder Days snow app; https://github.com/jmcdannel/nfopd)';

function kuchera(tF) {
  const k = (tF - 32) / 1.8 + 273.15;
  return Math.max(3, Math.min(25, k > 271.16 ? 12 + 2 * (271.16 - k) : 12 + (271.16 - k)));
}
const snowRatio = tF => Math.min(10, 0.75 * kuchera(tF));
// With no wet bulb, split on air temperature one degree warmer (tested: within 3% of the wet-bulb split).
const snowFraction = (twF, tF) => { const [x, lo] = twF != null ? [twF, 31] : [tF, 32]; return x <= lo ? 1 : x >= lo + 3 ? 0 : (lo + 3 - x) / 3; };
const snowHour = (p, tF, twF) => (!p || tF == null ? 0 : p * snowFraction(twF, tF) * snowRatio(tF));

// Model sets: NOAA's US-only models at home, the best regional ones abroad. [Open-Meteo name, NFOPD id]
const SETS = {
  na: [['ncep_nbm_conus', 'nbm'], ['ncep_hrrr_conus', 'hrrr'], ['gfs_seamless', 'gfs'], ['ecmwf_ifs025', 'ecmwf'], ['gem_seamless', 'gem'], ['icon_seamless', 'icon']],
  eu: [['gfs_seamless', 'gfs'], ['ecmwf_ifs025', 'ecmwf'], ['icon_seamless', 'icon'], ['meteofrance_seamless', 'mf'], ['ukmo_seamless', 'ukmo'], ['gem_seamless', 'gem']],
  jp: [['gfs_seamless', 'gfs'], ['ecmwf_ifs025', 'ecmwf'], ['icon_seamless', 'icon'], ['jma_seamless', 'jma'], ['ukmo_seamless', 'ukmo'], ['gem_seamless', 'gem']],
  sh: [['gfs_seamless', 'gfs'], ['ecmwf_ifs025', 'ecmwf'], ['icon_seamless', 'icon'], ['ukmo_seamless', 'ukmo'], ['bom_access_global', 'bom'], ['gem_seamless', 'gem']],
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url) {
  for (const wait of [0, 2500, 6000]) {
    if (wait) await sleep(wait);
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    if (r.status !== 429 || wait === 6000) throw Object.assign(new Error(`${r.status} from ${new URL(url).hostname}`), { status: r.status === 429 ? 429 : 502 });
  }
}
const r2 = v => Math.round(v * 100) / 100;

// One series (a model, or an ensemble member) of hourly values → per-day snow, liquid and temperatures.
// A day counts only when at least 20 of its hours have data, so a short-range model's last partial day reads as "no data".
function byDay(dayOf, nDays, P, T, W) {
  const snow = new Array(nDays).fill(0), liq = new Array(nDays).fill(0), tx = new Array(nDays).fill(null), tn = new Array(nDays).fill(null), n = new Array(nDays).fill(0);
  if (P && T) for (let i = 0; i < P.length; i++) {
    const d = dayOf[i], p = P[i], t = T[i];
    if (p == null || t == null) continue;
    n[d]++; liq[d] += p; snow[d] += snowHour(p, t, W ? W[i] : null);
    if (tx[d] == null || t > tx[d]) tx[d] = t;
    if (tn[d] == null || t < tn[d]) tn[d] = t;
  }
  const ok = d => n[d] >= 20;
  return { s: snow.map((v, d) => (ok(d) ? r2(v) : null)), p: liq.map((v, d) => (ok(d) ? r2(v) : null)), x: tx.map((v, d) => (ok(d) ? Math.round(v) : null)), n: tn.map((v, d) => (ok(d) ? Math.round(v) : null)) };
}
function calendar(h) {
  const dates = [], dayOf = new Array(h.time.length);
  h.time.forEach((t, i) => { const d = t.slice(0, 10); if (dates[dates.length - 1] !== d) dates.push(d); dayOf[i] = dates.length - 1; });
  return { dates, dayOf };
}

// Daily snow by model for up to 50 points. Returns one entry per point:
// { tz, dates, m: { gfs: { s, p, x, n }, ... }, p24, n24 } with s = snow in., p = liquid in., x/n = max/min F.
async function computeModels({ lat, lon, elev, set = 'na', past = 7, days = 16 }) {
  const models = SETS[set];
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: lat.join(','), longitude: lon.join(','), elevation: elev.join(','), hourly: 'precipitation,temperature_2m,wet_bulb_temperature_2m',
    models: models.map(m => m[0]).join(','), past_days: String(past), forecast_days: String(days), timezone: 'auto', temperature_unit: 'fahrenheit', precipitation_unit: 'inch',
  });
  const raw = await getJson(url), now = Date.now();
  return (Array.isArray(raw) ? raw : [raw]).map(loc => {
    const h = loc.hourly, { dates, dayOf } = calendar(h), m = {};
    for (const [key, id] of models) m[id] = byDay(dayOf, dates.length, h['precipitation_' + key], h['temperature_2m_' + key], h['wet_bulb_temperature_2m_' + key]);
    // Last and next 24 hours from the GFS family (HRRR-blended over the US), by the clock rather than the calendar day.
    const P = h.precipitation_gfs_seamless, T = h.temperature_2m_gfs_seamless, W = h.wet_bulb_temperature_2m_gfs_seamless;
    let p24 = 0, n24 = 0;
    if (P && T) h.time.forEach((s, i) => { const t = Date.parse(s + ':00Z') - loc.utc_offset_seconds * 1000, v = snowHour(P[i], T[i], W ? W[i] : null); if (t <= now && t > now - 864e5) p24 += v; else if (t > now && t <= now + 864e5) n24 += v; });
    return { tz: loc.timezone, dates, m, p24: r2(p24), n24: r2(n24) };
  });
}

// Daily snow for every ensemble member (31 GEFS + 51 ECMWF) at one point, for odds and confidence.
async function computeEnsemble({ lat, lon, elev }) {
  const base = 'https://ensemble-api.open-meteo.com/v1/ensemble?' + new URLSearchParams({
    latitude: String(lat), longitude: String(lon), elevation: String(elev), hourly: 'precipitation,temperature_2m,wet_bulb_temperature_2m',
    timezone: 'auto', temperature_unit: 'fahrenheit', precipitation_unit: 'inch',
  });
  const res = await Promise.allSettled([getJson(base + '&models=gfs_seamless&forecast_days=16'), getJson(base + '&models=ecmwf_ifs025&forecast_days=15')]);
  const members = [], used = []; let dates = null;
  res.forEach((x, i) => {
    const h = x.value?.hourly; if (!h) return;
    const cal = calendar(h); if (!dates || cal.dates.length > dates.length) dates = cal.dates;
    used.push(i ? 'ECMWF' : 'GEFS');
    for (const k of Object.keys(h)) { const mm = k.match(/^precipitation(_member\d+)?$/); if (!mm) continue; const sfx = mm[1] || ''; members.push(byDay(cal.dayOf, cal.dates.length, h[k], h['temperature_2m' + sfx], h['wet_bulb_temperature_2m' + sfx]).s); }
  });
  if (members.length < 10) throw Object.assign(new Error(res.find(x => x.reason)?.reason?.message || 'Ensemble data unavailable'), { status: res.some(x => x.reason?.status === 429) ? 429 : 502 });
  return { dates, used, members };
}

module.exports = { computeModels, computeEnsemble, snowHour, snowRatio, snowFraction, kuchera, SETS };
