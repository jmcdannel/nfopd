// A server-side cache in front of rate-limited upstreams (Open-Meteo above all).
// Uses Vercel's Runtime Cache: shared by every function call in the region, survives deploys, needs no setup.
//
// cached(key, ttl, fn) returns { value, age, stale }:
//   - a copy younger than `ttl` seconds is returned without calling upstream at all;
//   - otherwise fn() runs and its result is saved for three days;
//   - if fn() fails (a 429, a timeout) and an older copy exists, that copy comes back marked stale.
// So one visitor's fetch serves everyone for the TTL, and a rate limit shows old data instead of an error.
const crypto = require('crypto');

let store = null;
try { store = require('@vercel/functions').getCache({ namespace: 'nfopd' }); } catch { store = null; }
const mem = new Map(); // the same instance often serves several requests; skip the round trip
const KEEP = 3 * 86400;
const hash = s => crypto.createHash('sha1').update(s).digest('hex');

async function cached(key, ttl, fn) {
  const k = hash(key), now = Date.now();
  let hit = mem.get(k) || null;
  if (!hit && store) { try { hit = await store.get(k); } catch { hit = null; } }
  if (hit && typeof hit.t === 'number' && now - hit.t < ttl * 1000) return { value: hit.v, age: Math.round((now - hit.t) / 1000), stale: false };
  try {
    const value = await fn(), entry = { t: now, v: value };
    mem.set(k, entry); if (mem.size > 150) mem.delete(mem.keys().next().value);
    if (store) { try { await store.set(k, entry, { ttl: KEEP }); } catch { /* cache is best-effort */ } }
    return { value, age: 0, stale: false };
  } catch (err) {
    if (hit && typeof hit.t === 'number') return { value: hit.v, age: Math.round((now - hit.t) / 1000), stale: true, error: err };
    throw err;
  }
}

module.exports = { cached };
