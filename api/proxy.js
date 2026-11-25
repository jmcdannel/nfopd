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
  'coppercolorado.com', 'eldora.com', 'brightonresort.com', 'snowbasin.com', 'pub-7925c8bdc8ac4f9ab378e230f5700977.r2.dev',
];
// How long Vercel's edge cache keeps each kind of response (seconds). Sources update on very different clocks.
const TTL = [
  [/wcc\.sc\.egov\.usda\.gov\/.*\/stations\?/, 86400], // SNOTEL station list
  [/previous-runs-api|ensemble-api/, 3600],                 // model archives and ensembles update a few times a day
  [/open-meteo\.com/, 1800],
  [/api\.weather\.gov\/points/, 86400],
  [/api\.weather\.gov\/alerts/, 300],
  [/api\.weather\.gov/, 900],                             // grid, 7-day, observations, discussions
  [/radar\.weather\.gov/, 300],
  [/wcc\.sc\.egov\.usda\.gov/, 1800],                    // SNOTEL readings are hourly
  [/avalanche\.(org|ca)|weather\.gc\.ca/, 900],
];
const ttlFor = (url, type) => type.startsWith('image/') ? 120 : (TTL.find(([re]) => re.test(url))?.[1] ?? 600); // resort reports: 10 min
const allowed = host => ALLOW.some(d => host === d || host.endsWith('.' + d));

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://localhost').searchParams;
  let target;
  try { target = new URL(q.get('url') || ''); } catch { res.statusCode = 400; return res.end('Missing or invalid url'); }
  if (!/^https?:$/.test(target.protocol) || !allowed(target.hostname)) { res.statusCode = 403; return res.end('Host not allowed'); }
  try {
    const r = await fetch(target, { headers: { 'User-Agent': UA, Accept: q.get('accept') || '*/*' }, redirect: 'follow' });
    if (!allowed(new URL(r.url).hostname)) { res.statusCode = 403; return res.end('Redirected to a host that is not allowed'); }
    const body = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'application/octet-stream';
    res.statusCode = r.status;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', r.ok ? `public, max-age=60, s-maxage=${ttlFor(target.href, type)}, stale-while-revalidate=1800` : 'no-store');
    res.end(body);
  } catch (e) {
    res.statusCode = 502;
    res.end('Upstream request failed: ' + e.message);
  }
};
