const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';

export const ADMIN_LEAGUES = {
  allsvenskan: { key:'allsvenskan', name:'Allsvenskan Herr', leagueId:573, seasonId:26806, seasonLabel:2026 },
  damallsvenskan: { key:'damallsvenskan', name:'Allsvenskan Dam', leagueId:576, seasonId:26782, seasonLabel:2026 },
};

const adminMemoryCache = globalThis.__ALLSVENSKANAI_ADMIN_CACHE__ || new Map();
globalThis.__ALLSVENSKANAI_ADMIN_CACHE__ = adminMemoryCache;

export async function readJsonBody(req){
  if(req.method === 'GET') return {};
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch(e) { resolve({}); }
    });
  });
}

export function requireAdmin(req, res, body = {}){
  const secret = process.env.ADMIN_SECRET;
  if(!secret){
    res.status(500).json({ ok:false, error:'ADMIN_SECRET saknas i miljön.' });
    return false;
  }
  const provided = req.headers['x-admin-token'] || req.query?.token || body?.token || '';
  if(String(provided) !== String(secret)){
    res.status(401).json({ ok:false, error:'Unauthorized' });
    return false;
  }
  return true;
}

export function getLeagueConfig(value){
  const key = String(value || '').toLowerCase();
  return ADMIN_LEAGUES[key]
    || Object.values(ADMIN_LEAGUES).find(league => String(league.leagueId) === key || String(league.seasonId) === key)
    || ADMIN_LEAGUES.allsvenskan;
}

function stableParams(params = {}){
  return Object.keys(params).sort().reduce((acc, key) => {
    if(params[key] !== undefined && params[key] !== null && params[key] !== '') acc[key] = params[key];
    return acc;
  }, {});
}

function adminTtl(path){
  const key = String(path || '').toLowerCase();
  if(key.includes('standings')) return 5 * 60 * 1000;
  if(key.includes('players')) return 10 * 60 * 1000;
  if(key.includes('teams') || key.includes('squads') || key.includes('seasons')) return 60 * 60 * 1000;
  return 5 * 60 * 1000;
}

export async function sportmonksAdmin(path, params = {}, options = {}){
  const token = process.env.SPORTMONKS_API_TOKEN;
  if(!token) throw new Error('SPORTMONKS_API_TOKEN saknas');
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const cleanParams = stableParams(params);
  const query = new URLSearchParams(cleanParams);
  query.set('api_token', token);
  const url = `${SPORTMONKS_BASE_URL}/${cleanPath}?${query.toString()}`;
  const cacheKey = `admin:${cleanPath}:${JSON.stringify(cleanParams)}`;
  const cached = adminMemoryCache.get(cacheKey);
  const ttl = options.ttl ?? adminTtl(cleanPath);
  if(!options.force && cached && cached.expires > Date.now()) return { data:cached.data, cache:'hit' };
  try {
    const response = await fetch(url, { headers:{ accept:'application/json' } });
    const data = await response.json().catch(() => ({}));
    if(!response.ok) throw new Error(data?.message || data?.error || `Sportmonks HTTP ${response.status}`);
    adminMemoryCache.set(cacheKey, { data, expires:Date.now() + ttl, createdAt:Date.now() });
    return { data, cache:'miss' };
  } catch(error) {
    if(cached?.data) return { data:cached.data, cache:'stale', warning:error.message };
    throw error;
  }
}

export async function sportmonksAdminPaged(path, params = {}, options = {}){
  const rows = [];
  let page = Number(params.page || 1);
  let apiCalls = 0;
  let staleFallback = false;
  while(true){
    const result = await sportmonksAdmin(path, { ...params, page, per_page:params.per_page || 50 }, options);
    apiCalls += result.cache === 'hit' ? 0 : 1;
    staleFallback = staleFallback || result.cache === 'stale';
    const data = result.data;
    const chunk = Array.isArray(data?.data) ? data.data : (data?.data ? [data.data] : []);
    rows.push(...chunk);
    const pagination = data?.pagination || data?.meta?.pagination || data?.meta || {};
    const current = Number(pagination.current_page || page);
    const total = Number(pagination.total_pages || pagination.last_page || current);
    const hasMore = Boolean(pagination.has_more) || current < total;
    if(!hasMore || options.fetchAllPages === false) break;
    page += 1;
  }
  return { rows, apiCalls, staleFallback };
}

export async function getAdminTeams(league, options = {}){
  const result = await sportmonksAdminPaged(`teams/seasons/${league.seasonId}`, { include:'venue', per_page:50 }, options);
  return {
    teams: result.rows.map(team => ({
      id: team.id,
      name: team.name || team.short_code || `Lag ${team.id}`,
      logo: team.image_path || team.logo_path || team.logo || '',
    })),
    apiCalls: result.apiCalls,
    staleFallback: result.staleFallback,
  };
}

export async function getAdminTeamPlayers(teamId, league, options = {}){
  const result = await sportmonksAdminPaged('players', {
    include:'statistics.details.type;position;detailedPosition',
    filters:`playerStatisticSeasons:${league.seasonId};playerStatisticTeams:${teamId}`,
    per_page:50,
  }, options);
  return {
    playerCount: result.rows.length,
    statsPlayerCount: result.rows.filter(player => Array.isArray(player.statistics) && player.statistics.length).length,
    apiCalls: result.apiCalls,
    staleFallback: result.staleFallback,
  };
}

export function clearAdminCache(scope = 'all'){
  const before = adminMemoryCache.size;
  if(scope === 'all') adminMemoryCache.clear();
  return { before, after:adminMemoryCache.size };
}

export function sendJson(res, status, payload){
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}
