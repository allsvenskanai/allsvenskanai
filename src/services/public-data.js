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

export async function getTeamStats(teamId, { force = false } = {}){
  if(!teamId) return null;
  const league = getActiveLeague();
  const query = new URLSearchParams({
    league:league.key,
    season:league.seasonLabel,
    team:teamId,
  });
  const data = await fetchJson(`/api/stats?${query.toString()}`, { ttl:2 * 60_000, force });
  return data?.response || null;
}

export async function getTeamPageData(teamId){
  const [stats, aggregate, standings, fixtures] = await Promise.allSettled([
    getTeamStats(teamId),
    getPublicStats(),
    getStandings(),
    getFixtures({ last:80 }),
  ]);
  const aggregateData = aggregate.status === 'fulfilled' ? aggregate.value : null;
  const teamPayload = stats.status === 'fulfilled' ? stats.value : null;
  const teamFromAggregate = (aggregateData?.teamStats || []).find(item => Number(item.teamId) === Number(teamId));
  const standingRow = (standings.status === 'fulfilled' ? standings.value : []).find(row => Number(row.team?.id) === Number(teamId));
  const teamFixtures = (fixtures.status === 'fulfilled' ? fixtures.value : []).filter(match => {
    const home = Number(match.teams?.home?.id || 0);
    const away = Number(match.teams?.away?.id || 0);
    return home === Number(teamId) || away === Number(teamId);
  });
  return {
    teamId:Number(teamId),
    team:teamPayload?.team || teamFromAggregate?.team || standingRow?.team || null,
    players:teamPayload?.players || teamFromAggregate?.players || aggregateData?.players?.filter(player => Number(player.teamId || player.team?.id || 0) === Number(teamId)) || [],
    stats:teamPayload?.stats || teamFromAggregate?.stats || null,
    standing:standingRow || null,
    fixtures:teamFixtures,
    meta:teamPayload?.meta || aggregateData?.meta || null,
  };
}

export async function getPlayerPageData(playerId){
  const stats = await getPublicStats();
  const players = stats?.players || [];
  const player = players.find(item => Number(item.playerId || item.id || item.player?.id || 0) === Number(playerId)) || null;
  const teamId = Number(player?.teamId || player?.team?.id || 0);
  return {
    playerId:Number(playerId),
    player,
    team:teamId ? (stats?.teams || []).find(team => Number(team.id || team.teamId || 0) === teamId) || null : null,
    related:teamId ? players.filter(item => Number(item.teamId || item.team?.id || 0) === teamId).slice(0, 8) : [],
    meta:stats?.meta || null,
  };
}

export async function getMatchDetails(matchId, { force = false } = {}){
  if(!matchId) return null;
  const data = await fetchJson(footballUrl('fixtures', { id:matchId }), { ttl:60_000, force });
  return data?.response?.[0] || null;
}

export async function getTransfers({ force = false } = {}){
  const league = getActiveLeague();
  const query = new URLSearchParams({
    action:'public-transfers',
    league:league.key,
    season:league.seasonLabel,
  });
  const data = await fetchJson(`/api/admin?${query.toString()}`, { ttl:5 * 60_000, force });
  return {
    transfers:data?.transfers || [],
    teams:data?.teams || [],
    meta:data?.meta || null,
    ok:Boolean(data?.ok),
  };
}

export async function adminAction(action, payload = {}, token = ''){
  const response = await fetch(`/api/admin?action=${encodeURIComponent(action)}`, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Admin-Token':token,
    },
    body:JSON.stringify({ ...payload, token }),
  });
  const data = await response.json().catch(() => ({}));
  if(!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `Admin action failed: ${action}`);
  }
  return data;
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
