// Powderline data proxy (Vercel function). Fetches only from the forecast, observation,
// avalanche and resort hosts the app reads, adds the User-Agent NWS asks for, and lets
// Vercel's edge cache absorb repeat requests. It is not a general-purpose proxy.
const UA = 'Powderline/1.0 (personal snow forecast app; https://github.com/jmcdannel/powderline)';
const ALLOW = [
  'weather.gov', 'open-meteo.com', 'wcc.sc.egov.usda.gov', 'avalanche.org',
  // resort reports and feeds
  'tamarackidaho.com', 'brundage.com', 'bogusbasin.org', 'payettelakesskiclub.org', 'sunvalley.com', 'schweitzer.com',
  'mtnfeed.com', 'mtnpowder.com', 'silvermt.com', 'skilookout.com', 'losttrail.com', 'snocountry.com', 'pomerelle.com',
  'onthesnow.com', 'pebblecreekskiarea.com', 'grandtarghee.com', 'soldiermountain.com',
  // webcam image hosts
  'ytimg.com', 'storage.googleapis.com', 'hdrelay.com', 'roundshot.com', 'ipcamlive.com', 'yellowstone.ai',
  'd1xrbm8v2c14yb.cloudfront.net', 'seejh.com', 'pub-7925c8bdc8ac4f9ab378e230f5700977.r2.dev',
];
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
    res.setHeader('Cache-Control', r.ok ? `public, s-maxage=${type.startsWith('image/') ? 60 : 300}, stale-while-revalidate=600` : 'no-store');
    res.end(body);
  } catch (e) {
    res.statusCode = 502;
    res.end('Upstream request failed: ' + e.message);
  }
};
