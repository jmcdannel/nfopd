// NFOPD Daily: an AI-written regional snow discussion built only from public data —
// the latest NWS Area Forecast Discussions for the region's offices plus model snowfall
// at a few representative summits. Runs through Vercel AI Gateway on its zero-cost models,
// so it spends nothing. Used by api/daily.js.
const Anthropic = require('@anthropic-ai/sdk');

const UA = 'NFOPD/1.0 (No Friends On Powder Days snow app; https://github.com/jmcdannel/nfopd)';
// Tried in order. Both are $0 on AI Gateway (Claude and other paid models need purchased credits).
// To use a paid model instead, set NFOPD_DAILY_MODEL in the Vercel project, e.g. anthropic/claude-haiku-5.5.
const MODELS = process.env.NFOPD_DAILY_MODEL ? [process.env.NFOPD_DAILY_MODEL] : ['nvidia/nemotron-3.5-lightning-free', 'reflection/beam-free'];
const MODEL_NAME = { 'nvidia/nemotron-3.5-lightning-free': 'NVIDIA Nemotron 3.5 Lightning', 'reflection/beam-free': 'Reflection Beam', 'anthropic/claude-haiku-5.5': 'Claude Haiku 5.5' };
const fail = (message, status) => Object.assign(new Error(message), { status, expose: true });

// Offices whose AFDs cover each region's ski areas, and summits that represent it.
// [name, lat, lon, summit ft]
const REGIONS = {
  'Idaho': { afd: ['BOI', 'PIH', 'OTX'], spots: [['Brundage', 45.004, -116.155, 7640], ['Tamarack', 44.671, -116.123, 7700], ['Sun Valley', 43.668, -114.403, 9150], ['Schweitzer', 48.368, -116.623, 6400]] },
  'Northern Rockies': { afd: ['MSO', 'TFX', 'RIW'], spots: [['Big Sky', 45.284, -111.401, 11166], ['Jackson Hole', 43.588, -110.828, 10450], ['Whitefish', 48.484, -114.353, 6817], ['Bridger Bowl', 45.817, -110.898, 8700]] },
  'Utah': { afd: ['SLC'], spots: [['Alta', 40.588, -111.638, 10550], ['Snowbasin', 41.216, -111.857, 9350], ['Park City', 40.651, -111.508, 10000], ['Brian Head', 37.702, -112.850, 11300]] },
  'Colorado': { afd: ['BOU', 'GJT', 'PUB'], spots: [['Steamboat', 40.457, -106.804, 10568], ['Vail', 39.606, -106.355, 11570], ['Wolf Creek', 37.472, -106.793, 11904], ['Arapahoe Basin', 39.642, -105.872, 13050]] },
  'Pacific Northwest': { afd: ['SEW', 'PQR', 'PDT'], spots: [['Mt. Baker', 48.857, -121.665, 5089], ['Stevens Pass', 47.745, -121.089, 5845], ['Crystal Mountain', 46.935, -121.475, 7012], ['Mt. Hood Meadows', 45.331, -121.665, 7300], ['Mt. Bachelor', 43.979, -121.688, 9065]] },
  'California & Nevada': { afd: ['REV', 'STO'], spots: [['Palisades Tahoe', 39.197, -120.235, 9050], ['Kirkwood', 38.685, -120.065, 9876], ['Mt. Rose', 39.328, -119.885, 9700], ['Mammoth', 37.631, -119.033, 11053]] },
  'Southwest': { afd: ['ABQ', 'FGZ'], spots: [['Taos', 36.596, -105.454, 12481], ['Arizona Snowbowl', 35.331, -111.711, 11500], ['Purgatory', 37.630, -107.814, 10822]] },
  'Alaska': { afd: ['AFC'], spots: [['Alyeska', 60.970, -149.098, 2750], ['Hilltop', 61.135, -149.769, 2000]] },
  'British Columbia': { afd: [], spots: [['Whistler', 50.108, -122.948, 7160], ['Revelstoke', 51.001, -118.163, 7300], ['Fernie', 49.462, -115.089, 6316], ['Big White', 49.722, -118.929, 7606]] },
  'Alberta': { afd: [], spots: [['Lake Louise', 51.441, -116.162, 8650], ['Sunshine Village', 51.078, -115.782, 8954], ['Marmot Basin', 52.800, -118.083, 8570]] },
  'Northeast': { afd: ['BTV', 'GYX', 'ALY'], spots: [['Jay Peak', 44.938, -72.505, 3968], ['Stowe', 44.530, -72.781, 3625], ['Killington', 43.605, -72.820, 4241], ['Sugarloaf', 45.031, -70.313, 4237], ['Whiteface', 44.366, -73.903, 4386], ['Loon', 44.036, -71.621, 3050]] },
  'Midwest': { afd: ['MQT', 'DLH', 'GRB'], spots: [['Mount Bohemia', 47.391, -88.013, 1500], ['Lutsen', 47.664, -90.714, 1688], ['Boyne Mountain', 45.164, -84.930, 1120], ['Granite Peak', 44.932, -89.682, 1942]] },
  'Southeast': { afd: ['RLX', 'RNK', 'GSP'], spots: [['Snowshoe', 38.411, -79.994, 4848], ['Beech Mountain', 36.196, -81.878, 5506], ['Wintergreen', 37.914, -78.944, 3515]] },
  'Quebec': { afd: [], spots: [['Mont Tremblant', 46.210, -74.585, 2871], ['Le Massif', 47.283, -70.570, 2645], ['Mont-Sainte-Anne', 47.075, -70.907, 2625], ['Mont Sutton', 45.105, -72.561, 3176]] },
  'Ontario': { afd: [], spots: [['Blue Mountain', 44.501, -80.316, 1483], ['Mount St. Louis Moonstone', 44.622, -79.669, 1345], ['Searchmont', 46.775, -84.049, 1600]] },
  'France': { afd: [], spots: [['Chamonix Grands Montets', 45.957, 6.953, 10768], ["Val d'Isère", 45.448, 6.980, 11340], ['Val Thorens', 45.297, 6.580, 10597], ["Alpe d'Huez", 45.092, 6.068, 10925], ['La Clusaz', 45.904, 6.423, 8530]] },
  'Switzerland': { afd: [], spots: [['Zermatt', 45.960, 7.723, 12740], ['Verbier', 46.096, 7.228, 10925], ['St. Moritz Corvatsch', 46.418, 9.821, 10837], ['Engelberg Titlis', 46.772, 8.438, 9934], ['Laax', 46.845, 9.213, 9902], ['Andermatt', 46.635, 8.594, 9722]] },
  'Austria': { afd: [], spots: [['St. Anton', 47.129, 10.268, 9222], ['Ischgl', 46.970, 10.293, 9422], ['Sölden', 46.965, 11.007, 10660], ['Kitzbühel', 47.447, 12.392, 6562], ['Saalbach', 47.391, 12.636, 6877], ['Obertauern', 47.249, 13.559, 7589]] },
  'Italy': { afd: [], spots: [['Cervinia', 45.936, 7.631, 11417], ['Courmayeur', 45.791, 6.969, 9045], ['Livigno', 46.538, 10.136, 9180], ['Val Gardena', 46.558, 11.676, 8264], ['Cortina', 46.540, 12.136, 9613], ['Madonna di Campiglio', 46.229, 10.826, 8202]] },
  'Scandinavia': { afd: [], spots: [['Åre', 63.399, 13.082, 4180], ['Hemsedal', 60.863, 8.552, 4905], ['Trysil', 61.315, 12.264, 3700], ['Riksgränsen', 68.427, 18.127, 2982]] },
  'Japan': { afd: [], spots: [['Niseko', 42.868, 140.673, 3937], ['Rusutsu', 42.748, 140.898, 3261], ['Furano', 43.328, 142.353, 3524], ['Hakuba Happo-one', 36.697, 137.837, 6007], ['Myoko Akakura', 36.892, 138.176, 4921], ['Nozawa Onsen', 36.923, 138.441, 5413]] },
  'New Zealand': { afd: [], spots: [['Mt Hutt', -43.471, 171.527, 6844], ['Treble Cone', -44.633, 168.897, 6851], ['The Remarkables', -45.054, 168.815, 6375], ['Whakapapa', -39.237, 175.556, 7546]] },
  'South America': { afd: [], spots: [['Portillo', -32.835, -70.129, 10860], ['Valle Nevado', -33.354, -70.249, 12041], ['Las Leñas', -35.149, -70.083, 11253], ['Cerro Catedral', -41.170, -71.439, 7152]] },
};

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json, application/json' } });
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).hostname}`);
  return r.json();
}

// Keep the forecast reasoning of an AFD and drop aviation, fire, hydrology and the boilerplate around it.
function trimAfd(text) {
  const body = text.replace(/\r/g, '');
  const parts = body.split(/\n(?=\.[A-Z][A-Z0-9 /]+\.\.\.)/);
  const keep = parts.filter(p => !/^\.(AVIATION|FIRE WEATHER|HYDROLOGY|MARINE|CLIMATE|AIR QUALITY)/.test(p));
  return keep.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 9000);
}

async function getAfd(office) {
  const list = await getJson(`https://api.weather.gov/products/types/AFD/locations/${office}`);
  const first = list['@graph']?.[0];
  if (!first) return null;
  const p = await getJson(`https://api.weather.gov/products/${first.id}`);
  return { office, issued: p.issuanceTime, text: trimAfd(p.productText || ''), url: `https://forecast.weather.gov/product.php?site=${office}&issuedby=${office}&product=AFD` };
}

// Daily model snowfall (raw, Open-Meteo's liquid × 7 conversion, so treat it as rough) and liquid at each summit for the next 7 days.
async function getModels(spots) {
  const ft2m = ft => Math.round(ft * 0.3048);
  const models = ['ncep_nbm_conus', 'gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'];
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: spots.map(s => s[1]).join(','), longitude: spots.map(s => s[2]).join(','), elevation: spots.map(s => ft2m(s[3])).join(','),
    daily: 'snowfall_sum,precipitation_sum,temperature_2m_max,temperature_2m_min', models: models.join(','),
    forecast_days: '7', timezone: 'auto', temperature_unit: 'fahrenheit', precipitation_unit: 'inch',
  });
  const raw = await getJson(url);
  const arr = Array.isArray(raw) ? raw : [raw];
  return spots.map(([name, , , ft], i) => {
    const d = arr[i]?.daily || {};
    const rows = (d.time || []).map((day, j) => {
      const per = models.map(m => {
        const s = d['snowfall_sum_' + m]?.[j], p = d['precipitation_sum_' + m]?.[j];
        if (s == null && p == null) return null;
        return `${{ ncep_nbm_conus: 'NBM', gfs_seamless: 'GFS', ecmwf_ifs025: 'ECMWF', icon_seamless: 'ICON' }[m]} ${s == null ? '–' : s.toFixed(1) + '"'} snow/${p == null ? '–' : p.toFixed(2) + '"'} liquid`;
      }).filter(Boolean).join(', ');
      const tx = d['temperature_2m_max_ecmwf_ifs025']?.[j] ?? d['temperature_2m_max_gfs_seamless']?.[j];
      const tn = d['temperature_2m_min_ecmwf_ifs025']?.[j] ?? d['temperature_2m_min_gfs_seamless']?.[j];
      return `  ${day}: ${per || 'no data'}${tx != null ? `; summit ${Math.round(tn)}–${Math.round(tx)}°F` : ''}`;
    });
    return `${name} (summit ${ft} ft):\n${rows.join('\n')}`;
  }).join('\n\n');
}

const SYSTEM = `You write "NFOPD Daily", a short snow discussion for skiers in one region, in the voice of a seasoned mountain forecaster talking to a ski crew at 5 a.m.
Write about the mountains and ski areas only; skip valleys, plains, cities, coasts and surf unless they explain the mountain weather.
Use ONLY the forecaster discussions and model numbers you are given. Do not invent storms, totals, or resort conditions that the data does not support. When the NWS and the models disagree, say so. Give snowfall as ranges in inches, and favour the NWS forecasters' reasoning over raw model output. Mention snow levels, wind, and timing when the sources do. No hype, no emojis.
Return only a JSON object with these keys:
"headline": one line, at most 90 characters, the main story for skiers.
"next24": 1–3 sentences on the next 24 hours.
"next5": 2–4 sentences on days 2–5.
"extended": 1–2 sentences on days 6–10, with honest uncertainty.
"bestBets": array of up to 3 objects {"where": a resort or area named in the data, "why": a short reason}. Only include a place the sources give at least 3 inches of new snow in the next 5 days; otherwise return an empty array. Never list a place just for a dusting.
"confidence": "high", "medium" or "low", for the next 5 days.`;

function client(apiKey) {
  return new Anthropic({ apiKey, baseURL: process.env.NFOPD_GATEWAY_URL || 'https://ai-gateway.vercel.sh', maxRetries: 1, timeout: 45_000 });
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The model returned no JSON');
  const o = JSON.parse(m[0]);
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  return {
    headline: str(o.headline, 120), next24: str(o.next24, 600), next5: str(o.next5, 900), extended: str(o.extended, 500),
    bestBets: Array.isArray(o.bestBets) ? o.bestBets.slice(0, 3).map(b => ({ where: str(b?.where, 60), why: str(b?.why, 200) })).filter(b => b.where) : [],
    confidence: ['high', 'medium', 'low'].includes(o.confidence) ? o.confidence : 'medium',
  };
}

async function buildDaily(region, apiKey) {
  const cfg = REGIONS[region];
  if (!cfg) throw fail('Unknown region', 400);
  if (!apiKey) throw fail('AI Gateway credentials are not configured', 503);
  const [afds, models] = await Promise.all([
    Promise.allSettled(cfg.afd.map(getAfd)).then(rs => rs.map(r => r.value).filter(Boolean)),
    getModels(cfg.spots).catch(() => ''),
  ]);
  if (!afds.length && !models) throw fail('No source data available right now', 502);
  const now = new Date().toISOString();
  const user = [
    `Region: ${region}. Current time (UTC): ${now}.`,
    afds.length ? afds.map(a => `=== NWS ${a.office} Area Forecast Discussion, issued ${a.issued} ===\n${a.text}`).join('\n\n')
      : 'No forecaster discussion is available for this region. Rely on the model numbers and say plainly that this discussion is model-based. If it is the off-season there (little or no snow in the data), say so briefly.',
    models ? `=== Model snowfall and liquid at representative summits (NBM = NOAA National Blend, US only; GFS = NOAA; ECMWF = European; ICON = German) ===\n${models}` : '',
  ].filter(Boolean).join('\n\n');

  const ai = client(apiKey);
  let out, used, lastErr;
  for (const model of MODELS) {
    try {
      const msg = await ai.messages.create({
        model, max_tokens: 8000, system: SYSTEM,
        // A summary task: skip the long reasoning pass, which otherwise used the whole token budget.
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: user }],
      });
      if (msg.stop_reason === 'refusal') throw new Error('refused');
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      try { out = parseJson(text); }
      catch (e) { throw new Error(`unparseable reply (stop ${msg.stop_reason}; blocks ${msg.content.map(b => b.type).join(',')}; ${text.length} chars: ${text.slice(0, 80)})`); }
      used = model; break;
    } catch (e) {
      // Keep a short, non-secret reason (status and error type) so failures can be diagnosed from the response.
      lastErr = [lastErr, `${model.split('/')[1]}: ${e.status || ''} ${e.error?.error?.type || e.error?.type || e.name || ''} ${String(e.error?.error?.message || (e.status ? '' : e.message) || '').slice(0, 220)}`.trim()].filter(Boolean).join(' | ');
      console.error('daily model failed', model, e.status || '', String(e.message).slice(0, 300));
    }
  }
  if (!out) throw Object.assign(new Error('No model answered'), { status: 502, detail: lastErr });
  return {
    region, generated: now, model: MODEL_NAME[used] || used,
    ...out,
    sources: [
      ...afds.map(a => ({ name: `NWS ${a.office} Area Forecast Discussion`, issued: a.issued, url: a.url })),
      ...(models ? [{ name: 'NOAA GFS, ECMWF IFS and other models via Open-Meteo', url: 'https://open-meteo.com/' }] : []),
    ],
  };
}

module.exports = { buildDaily, REGIONS };
