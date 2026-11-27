// NFOPD data proxy (Vercel function). Fetches only from the forecast, observation,
// avalanche and resort hosts the app reads, adds the User-Agent NWS asks for, and lets
// Vercel's edge cache absorb repeat requests. It is not a general-purpose proxy.
const UA = 'NFOPD/1.0 (No Friends On Powder Days snow app; https://github.com/jmcdannel/nfopd)';
const ALLOW = [
  'weather.gov', 'open-meteo.com', 'wcc.sc.egov.usda.gov', 'avalanche.org', 'weather.gc.ca', 'avalanche.ca',
  // resort reports and feeds
  'tamarackidaho.com', 'brundage.com', 'bogusbasin.org', 'payettelakesskiclub.org', 'sunvalley.com', 'schweitzer.com',
  'mtnfeed.com', 'mtnpowder.com', 'silvermt.com', 'skilookout.com', 'losttrail.com', 'snocountry.com', 'pomerelle.com',
  'onthesnow.com', 'pebblecreekskiarea.com', 'grandtarghee.com', 'soldiermountain.com',
  // webcam image hosts
  'ytimg.com', 'storage.googleapis.com', 'hdrelay.com', 'roundshot.com', 'ipcamlive.com', 'yellowstone.ai',
  'd1xrbm8v2c14yb.cloudfront.net', 'seejh.com', 'brownrice.com', 'snow.com', 'ozolio.com', 'hdrelay.io', 'b-cdn.net', 'redresort.com', 'panoramaresort.com', 'sunpeaksresort.com',
  'coppercolorado.com', 'eldora.com', 'brightonresort.com', 'snowbasin.com',
  'alta.com', 'digitaloceanspaces.com', 'prismcam.com', 'snowbird.com', 'powdermountain.com', 'ixnay.net', 'sundanceresort.com', 'jacksonhole.com', 'zaneray.com',
  'bigskyresort.com', 'amazonaws.com', 'bridgerbowl.com', 'skiwhitefish.com', 'arapahoebasin.com', 'azurefd.net', 'aspensnowmass.com', 'tellurideskiresort.com',
  'wolfcreekski.com', 'skiloveland.com', 'webcam.io', 'skimonarch.com', 'purgatory.ski', 'skitaos.com', 'skisantafe.com', 'snowbowl.ski', 'summitatsnoqualmie.com',
  'missionridge.com', 'mtbachelor.com', 'skihood.com', 'wetmet.net', 'timberlinelodge.com', 'skirose.com', 'revelstokemountainresort.com', 'skircr.com',
  'kickinghorseresort.com', 'skifernie.com', 'skikimberley.com', 'skinakiska.com', 'skiwhitewater.com', 'whitewatermountainresort.com', 'skisilverstar.com',
  'skibanff.com', 'skimarmot.com', 'banffnorquay.com', 'mtbaker.us', 'pub-7925c8bdc8ac4f9ab378e230f5700977.r2.dev',
  // independent forecasters' feeds (NFOPD shows short excerpts and links back)
  'skaping.com', 'webcam.io', 'rainviewer.com', 'blogspot.com', 'snowalarm.com', 'weatherwest.com', 'powderchasers.com', 'youtube.com', 'mountainweather.com',
];
// How long Vercel's edge cache keeps each kind of response (seconds). Sources update on very different clocks.
const TTL = [
  [/wcc\.sc\.egov\.usda\.gov\/.*\/stations\?/, 86400], // SNOTEL station list
  [/archive-api\.open-meteo\.com/, 21600],                 // season history changes once a day
  [/previous-runs-api|ensemble-api/, 3600],                 // model archives and ensembles update a few times a day
  [/api\.open-meteo\.com\/v1\/forecast\?latitude=(?:[-\d.]+(?:,|%2C)){2,}/, 10800], // whole-region batches are heavy; models refresh every few hours
  [/open-meteo\.com/, 1800],
  [/api\.weather\.gov\/points/, 86400],
  [/api\.weather\.gov\/alerts/, 300],
  [/api\.weather\.gov/, 900],                             // grid, 7-day, observations, discussions
  [/radar\.weather\.gov/, 300],
  [/wcc\.sc\.egov\.usda\.gov/, 1800],                    // SNOTEL readings are hourly
  [/avalanche\.(org|ca)|weather\.gc\.ca/, 900],
  [/blogspot\.com|snowalarm\.com|weatherwest\.com|powderchasers\.com|youtube\.com\/feeds|mountainweather\.com/, 1800], // forecaster feeds
];
const ttlFor = (url, type) => type.startsWith('image/') ? 120 : (TTL.find(([re]) => re.test(url))?.[1] ?? 600); // resort reports: 10 min
const allowed = host => ALLOW.some(d => host === d || host.endsWith('.' + d));
const { cached } = require('./_cache');
// Hosts that rate-limit: their JSON goes through the server-side cache, so a 429 serves the last good copy.
const KEEPS = /(^|\.)(open-meteo\.com|wcc\.sc\.egov\.usda\.gov)$/;

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://localhost').searchParams;
  let target;
  try { target = new URL(q.get('url') || ''); } catch { res.statusCode = 400; return res.end('Missing or invalid url'); }
  if (!/^https?:$/.test(target.protocol) || !allowed(target.hostname)) { res.statusCode = 403; return res.end('Host not allowed'); }
  if (KEEPS.test(target.hostname)) {
    const ttl = ttlFor(target.href, 'application/json');
    try {
      const hit = await cached('proxy|' + target.href, ttl, async () => {
        const r = await fetch(target, { headers: { 'User-Agent': UA, Accept: 'application/json' }, redirect: 'follow' });
        if (!allowed(new URL(r.url).hostname)) throw Object.assign(new Error('Redirected to a host that is not allowed'), { status: 403 });
        if (!r.ok) throw Object.assign(new Error(`${r.status} from upstream`), { status: r.status, body: await r.text().catch(() => '') });
        return { type: r.headers.get('content-type') || 'application/json', body: await r.text() };
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', hit.value.type);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-NFOPD-Cache', hit.stale ? `stale ${hit.age}s` : hit.age ? `hit ${hit.age}s` : 'miss');
      res.setHeader('Cache-Control', hit.stale ? 'public, max-age=60, s-maxage=600' : `public, max-age=60, s-maxage=${Math.max(300, ttl - hit.age)}, stale-while-revalidate=1800`);
      return res.end(hit.value.body);
    } catch (e) {
      res.statusCode = e.status || 502;
      res.setHeader('Cache-Control', 'no-store');
      return res.end(e.body || 'Upstream request failed: ' + e.message);
    }
  }
  try {
    const r = await fetch(target, { headers: { 'User-Agent': UA, Accept: q.get('accept') || '*/*' }, redirect: 'follow' });
    if (!allowed(new URL(r.url).hostname)) { res.statusCode = 403; return res.end('Redirected to a host that is not allowed'); }
    const body = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'application/octet-stream';
    res.statusCode = r.status;
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox"); // proxied bytes never run as a page here
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', r.ok ? `public, max-age=60, s-maxage=${ttlFor(target.href, type)}, stale-while-revalidate=1800` : 'no-store');
    res.end(body);
  } catch (e) {
    res.statusCode = 502;
    res.end('Upstream request failed: ' + e.message);
  }
};
