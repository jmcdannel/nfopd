// GET /api/daily?region=Idaho → NFOPD Daily JSON for one western region.
// Only `region` is accepted, so the edge cache holds one copy per region and visitors can't
// force fresh (credit-spending) generations by varying the URL.
const { buildDaily, REGIONS } = require('./_daily');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const keys = [...url.searchParams.keys()];
  const region = url.searchParams.get('region');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*'); // public data; lets the browser-mode app read it
  if (keys.length !== 1 || !REGIONS[region]) {
    res.statusCode = 400;
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.end(JSON.stringify({ error: 'Pass exactly one parameter: region', regions: Object.keys(REGIONS) }));
  }
  // Deployed functions get a short-lived OIDC token for AI Gateway; an explicit key wins if one is set.
  const apiKey = process.env.AI_GATEWAY_API_KEY || req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  try {
    const out = await buildDaily(region, apiKey);
    // Six hours at the edge, then serve the old copy for up to 12 more while one request refreshes it.
    res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=21600, stale-while-revalidate=43200');
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = e.status || 502;
    res.setHeader('Cache-Control', 'public, s-maxage=600'); // don't hammer the gateway while it's failing
    res.end(JSON.stringify({ error: e.status ? e.message : 'The discussion could not be generated right now' }));
    console.error('daily', region, e.status || '', e.message);
  }
};
