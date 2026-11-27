// GET /api/snow — daily snowfall by model (or by ensemble member) at mountain elevation.
//   Models:   ?lat=44.68,45.01&lon=-116.16,-116.13&elev=2190,2280&set=na&past=7&days=16   (elev in metres, up to 50 points)
//   Ensemble: ?ens=1&lat=44.68&lon=-116.16&elev=2190
// The conversion lives in _snow.js. Only these parameters are accepted, so the edge cache keeps one
// copy per request shape and nobody can force repeat fetches by padding the URL.
const { computeModels, computeEnsemble, SETS } = require('./_snow');
const { cached } = require('./_cache');

const num = (s, lo, hi) => { const v = Number(s); return s !== '' && Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
const list = (s, lo, hi) => { const a = String(s || '').split(',').map(x => num(x, lo, hi)); return a.length && a.every(v => v != null) ? a : null; };

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://localhost').searchParams, keys = [...q.keys()];
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const bad = msg => { res.statusCode = 400; res.setHeader('Cache-Control', 'public, s-maxage=86400'); res.end(JSON.stringify({ error: msg })); };
  const ens = q.get('ens') === '1';
  const allowed = ens ? ['ens', 'lat', 'lon', 'elev'] : ['lat', 'lon', 'elev', 'set', 'past', 'days'];
  if (keys.some(k => !allowed.includes(k)) || new Set(keys).size !== keys.length) return bad('Unknown or repeated parameter');
  const lat = list(q.get('lat'), -85, 85), lon = list(q.get('lon'), -180, 180), elev = list(q.get('elev'), -100, 9000);
  if (!lat || !lon || !elev || lat.length !== lon.length || lat.length !== elev.length) return bad('lat, lon and elev must be equal-length lists of numbers');
  try {
    let hit, ttl;
    if (ens) {
      if (lat.length !== 1) return bad('The ensemble takes one point');
      ttl = 3600;
      hit = await cached(`ens|${lat[0]}|${lon[0]}|${elev[0]}`, ttl, () => computeEnsemble({ lat: lat[0], lon: lon[0], elev: elev[0] }));
    } else {
      const set = q.get('set') || 'na', past = num(q.get('past') ?? '7', 0, 16), days = num(q.get('days') ?? '16', 1, 16);
      if (!SETS[set] || past == null || days == null || lat.length > 50) return bad('Bad set, past or days, or more than 50 points');
      // Whole-region batches are heavy upstream and models refresh every few hours; single resorts stay fresher.
      ttl = lat.length > 2 ? 10800 : 1800;
      hit = await cached(`models|${set}|${past}|${days}|${lat}|${lon}|${elev}`, ttl, () => computeModels({ lat, lon, elev, set, past, days }));
    }
    // A stale copy (upstream is rate-limiting or down) is served, but only held at the edge briefly so it refreshes soon.
    res.setHeader('Cache-Control', hit.stale ? 'public, max-age=60, s-maxage=600' : `public, max-age=300, s-maxage=${Math.max(300, ttl - hit.age)}, stale-while-revalidate=1800`);
    res.setHeader('X-NFOPD-Cache', hit.stale ? `stale ${hit.age}s` : hit.age ? `hit ${hit.age}s` : 'miss');
    res.end(JSON.stringify(hit.value));
  } catch (e) {
    res.statusCode = e.status === 429 ? 429 : 502;
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: e.status === 429 ? 'The weather model service is rate-limiting; try again shortly' : 'Model data could not be loaded' }));
    console.error('snow', e.status || '', e.message);
  }
};
