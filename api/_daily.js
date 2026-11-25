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
  const models = ['ncep_nbm_conus', 'gfs_seamless', 'ecmwf_ifs025'];
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
        return `${{ ncep_nbm_conus: 'NBM', gfs_seamless: 'GFS', ecmwf_ifs025: 'ECMWF' }[m]} ${s == null ? '–' : s.toFixed(1) + '"'} snow/${p == null ? '–' : p.toFixed(2) + '"'} liquid`;
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
Use ONLY the NWS forecaster discussions and model numbers you are given. Do not invent storms, totals, or resort conditions that the data does not support. When the NWS and the models disagree, say so. Give snowfall as ranges in inches, and favour the NWS forecasters' reasoning over raw model output. Mention snow levels, wind, and timing when the sources do. No hype, no emojis.
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
      : 'No NWS forecaster discussion covers this region (Canada). Rely on the model numbers and say the discussion is model-based.',
    models ? `=== Model snowfall and liquid at representative summits (NBM = NOAA National Blend; GFS = NOAA; ECMWF = European) ===\n${models}` : '',
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
      ...(models ? [{ name: 'NOAA NBM and GFS, ECMWF IFS via Open-Meteo', url: 'https://open-meteo.com/' }] : []),
    ],
  };
}

module.exports = { buildDaily, REGIONS };
