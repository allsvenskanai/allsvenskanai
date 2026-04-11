const cache = new Map();
const inFlight = new Map();

function isCurrentSeason(params) {
  const season = Number(params?.get?.('season') || 0);
  const currentYear = new Date().getFullYear();
  return !season || season === currentYear;
}

function getTTL(endpoint, params = new URLSearchParams()) {
  // 🔥 SMARTA REGLER
  if (endpoint.includes('standings')) return 1000 * 60 * 60 * 6; // 6h
  if (endpoint.includes('players')) return isCurrentSeason(params) ? 1000 * 60 * 20 : 1000 * 60 * 60 * 12; // 20 min aktiv säsong, 12h historik
  if (endpoint.includes('teams/statistics')) return isCurrentSeason(params) ? 1000 * 60 * 10 : 1000 * 60 * 60 * 6;
  if (endpoint.includes('teams')) return 1000 * 60 * 60 * 6;
  if (endpoint.includes('transfers')) return 1000 * 60 * 60 * 24; // 24h
  if (endpoint.includes('fixtures')) return 1000 * 60 * 5; // 5 min
  if (endpoint.includes('events')) return 1000 * 30; // live
  if (endpoint.includes('statistics')) return 1000 * 30;
  if (endpoint.includes('lineups')) return 1000 * 60;

  return 1000 * 60 * 10; // default 10 min
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.APIFOOTBALL_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'APIFOOTBALL_KEY saknas' });
  }

  const params = new URLSearchParams(req.query);
  const endpoint = req.query._endpoint;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint saknas' });
  }

  params.delete('_endpoint');
  const forceRefresh = params.get('_force') === '1' || params.has('cacheBust');
  params.delete('_force');
  params.delete('cacheBust');

  const url = `https://v3.football.api-sports.io/${endpoint}?${params.toString()}`;
  const cacheKey = url;

  // ✅ CACHE HIT
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiry > Date.now()) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached.data);
  }

  // 🔁 IN-FLIGHT (undvik spam)
  if (!forceRefresh && inFlight.has(cacheKey)) {
    const data = await inFlight.get(cacheKey);
    res.setHeader('X-Cache', 'DEDUPED');
    return res.status(200).json(data);
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, {
        headers: { 'x-apisports-key': apiKey }
      });

      const data = await response.json();

      const ttl = getTTL(endpoint, params);

      cache.set(cacheKey, {
        data,
        expiry: Date.now() + ttl
      });

      return data;
    } catch (err) {
      // fallback till gammal cache om finns
      if (cached) return cached.data;
      throw err;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, fetchPromise);

  try {
    const data = await fetchPromise;
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
