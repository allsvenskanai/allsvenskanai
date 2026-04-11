const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';
const cache = new Map();
const inFlight = new Map();

function getSportmonksTtl(pathname) {
  const path = String(pathname || '').toLowerCase();
  if (path.includes('livescores') || path.includes('events') || path.includes('lineups')) return 30 * 1000;
  if (path.includes('fixtures')) return 5 * 60 * 1000;
  if (path.includes('standings')) return 15 * 60 * 1000;
  if (path.includes('statistics') || path.includes('topscorers')) return 10 * 60 * 1000;
  if (path.includes('players')) return 10 * 60 * 1000;
  if (path.includes('teams') || path.includes('squads') || path.includes('leagues') || path.includes('seasons')) return 6 * 60 * 60 * 1000;
  return 10 * 60 * 1000;
}

function sanitizePath(value = '') {
  const cleaned = String(value || '').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..') || cleaned.startsWith('http')) return '';
  return cleaned;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'SPORTMONKS_API_TOKEN saknas' });
  }

  const params = new URLSearchParams(req.query);
  const path = sanitizePath(params.get('path') || params.get('_path') || '');
  if (!path) {
    return res.status(400).json({ error: 'Sportmonks path saknas' });
  }

  params.delete('path');
  params.delete('_path');
  const forceRefresh = params.get('_force') === '1' || params.has('cacheBust');
  params.delete('_force');
  params.delete('cacheBust');
  params.set('api_token', token);

  const url = `${SPORTMONKS_BASE_URL}/${path}?${params.toString()}`;
  const cacheKey = url.replace(token, 'TOKEN');
  const cached = cache.get(cacheKey);

  if (!forceRefresh && cached && cached.expiry > Date.now()) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached.data);
  }

  if (!forceRefresh && inFlight.has(cacheKey)) {
    const data = await inFlight.get(cacheKey);
    res.setHeader('X-Cache', 'DEDUPED');
    return res.status(200).json(data);
  }

  const request = (async () => {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.message || data?.error || `Sportmonks HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.payload = data;
      throw err;
    }
    cache.set(cacheKey, {
      data,
      expiry: Date.now() + getSportmonksTtl(path)
    });
    return data;
  })();

  inFlight.set(cacheKey, request);

  try {
    const data = await request;
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (err) {
    if (cached?.data) {
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(cached.data);
    }
    return res.status(err.status || 500).json({
      error: err.message,
      details: err.payload || null
    });
  } finally {
    inFlight.delete(cacheKey);
  }
}
