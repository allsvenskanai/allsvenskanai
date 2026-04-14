import { getActiveLeague } from '../state/app-state.js';

const memoryCache = new Map();
const DEFAULT_TTL = 90_000;

function cacheKey(name, params = {}){
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');
  return `${name}:${query}`;
}

async function fetchJson(url, { ttl = DEFAULT_TTL, force = false } = {}){
  const key = `url:${url}`;
  const cached = memoryCache.get(key);
  if(!force && cached && Date.now() - cached.time < ttl) return cached.data;

  const response = await fetch(url, { headers:{ accept:'application/json' } });
  const data = await response.json().catch(() => ({}));
  if(!response.ok) {
    const error = new Error(data?.message || data?.error || `HTTP ${response.status}`);
    error.payload = data;
    throw error;
  }
  memoryCache.set(key, { time:Date.now(), data });
  return data;
}

function footballUrl(endpoint, params = {}){
  const league = getActiveLeague();
  const query = new URLSearchParams({
    _endpoint:endpoint,
    league:league.leagueId,
    season_id:league.seasonId,
    ...params,
  });
  return `/api/football?${query.toString()}`;
}

export function clearPublicDataCache(){
  memoryCache.clear();
}

export async function getStandings({ force = false } = {}){
  const data = await fetchJson(footballUrl('standings'), { ttl:2 * 60_000, force });
  return data?.response?.[0]?.league?.standings?.[0] || [];
}

export async function getFixtures({ force = false, last = '', next = '' } = {}){
  const params = {};
  if(last) params.last = last;
  if(next) params.next = next;
  const data = await fetchJson(footballUrl('fixtures', params), { ttl:90_000, force });
  return data?.response || [];
}

export async function getPublicStats({ force = false } = {}){
  const league = getActiveLeague();
  const query = new URLSearchParams({
    league:league.key,
    season:league.seasonLabel,
  });
  const data = await fetchJson(`/api/stats?${query.toString()}`, { ttl:2 * 60_000, force });
  return data?.response || null;
}

export async function getHomeBundle(){
  const league = getActiveLeague();
  const [standings, fixtures, stats] = await Promise.allSettled([
    getStandings(),
    getFixtures({ last:8 }),
    getPublicStats(),
  ]);
  return {
    league,
    standings:standings.status === 'fulfilled' ? standings.value : [],
    fixtures:fixtures.status === 'fulfilled' ? fixtures.value : [],
    stats:stats.status === 'fulfilled' ? stats.value : null,
    errors:[standings, fixtures, stats].filter(item => item.status === 'rejected').map(item => item.reason),
  };
}

export function cachedRequestKey(name, params = {}){
  return cacheKey(name, params);
}
