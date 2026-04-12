import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';

export const ADMIN_LEAGUES = {
  allsvenskan: { key:'allsvenskan', name:'Allsvenskan Herr', leagueId:573, seasonId:26806, seasonLabel:2026 },
  damallsvenskan: { key:'damallsvenskan', name:'Allsvenskan Dam', leagueId:576, seasonId:26782, seasonLabel:2026 },
};

const adminMemoryCache = globalThis.__ALLSVENSKANAI_ADMIN_CACHE__ || new Map();
globalThis.__ALLSVENSKANAI_ADMIN_CACHE__ = adminMemoryCache;
const STATS_STORE_VERSION = 'v1';
const STATS_STORE_DIR = process.env.STATS_CACHE_DIR || path.join(os.tmpdir(), 'allsvenskanai-stats-cache');

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
  if(['herr', 'men', 'allsvenskan-herr'].includes(key)) return ADMIN_LEAGUES.allsvenskan;
  if(['dam', 'women', 'allsvenskan-dam', 'damallsvenskan'].includes(key)) return ADMIN_LEAGUES.damallsvenskan;
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

function storeLeagueKey(league){
  return league.key === 'damallsvenskan' ? 'allsvenskan:dam' : 'allsvenskan:herr';
}

export function statsStoreKeys(league){
  const key = storeLeagueKey(league);
  return {
    teams:`stats:${key}:${league.seasonLabel}:teams`,
    players:`stats:${key}:${league.seasonLabel}:players`,
    leaderboards:`stats:${key}:${league.seasonLabel}:leaderboards`,
  };
}

async function ensureStatsStoreDir(){
  await mkdir(STATS_STORE_DIR, { recursive:true });
}

function safeFilePart(value){
  return String(value || '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function statsStoreFile(league, part){
  return path.join(STATS_STORE_DIR, `${STATS_STORE_VERSION}-${safeFilePart(league.key)}-${safeFilePart(league.seasonLabel)}-${safeFilePart(part)}.json`);
}

export async function readStatsStore(league, part){
  try {
    const raw = await readFile(statsStoreFile(league, part), 'utf8');
    return JSON.parse(raw);
  } catch(error) {
    if(error?.code !== 'ENOENT') console.warn('[stats-store] read failed', { part, league:league.key, error:error.message });
    return null;
  }
}

export async function writeStatsStore(league, part, data){
  await ensureStatsStoreDir();
  const payload = {
    version:STATS_STORE_VERSION,
    leagueKey:league.key,
    leagueId:league.leagueId,
    season:league.seasonLabel,
    seasonId:league.seasonId,
    updatedAt:Date.now(),
    data,
  };
  await writeFile(statsStoreFile(league, part), JSON.stringify(payload), 'utf8');
  return payload;
}

export async function clearStatsStore(league = null, part = ''){
  await ensureStatsStoreDir();
  if(league){
    if(part){
      await rm(statsStoreFile(league, part), { force:true });
      await rebuildStoredLeagueDataset(league).catch(error => console.warn('[stats-store] rebuild after clear failed', { league:league.key, error:error.message }));
      return { scope:'part', league:league.key, part };
    }
    const prefix = `${STATS_STORE_VERSION}-${safeFilePart(league.key)}-${safeFilePart(league.seasonLabel)}-`;
    const files = await readdir(STATS_STORE_DIR).catch(() => []);
    await Promise.all(files.filter(file => file.startsWith(prefix)).map(file => rm(path.join(STATS_STORE_DIR, file), { force:true })));
    return { scope:'league', league:league.key };
  }
  await rm(STATS_STORE_DIR, { recursive:true, force:true });
  await ensureStatsStoreDir();
  return { scope:'all' };
}

function normalizeToken(value){
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function valueNumber(value, preferredKey = ''){
  if(value === null || value === undefined || value === '') return 0;
  if(typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if(typeof value === 'object'){
    const key = preferredKey && value[preferredKey] !== undefined ? preferredKey : ['total', 'count', 'value', 'average', 'avg'].find(item => value[item] !== undefined);
    return key ? valueNumber(value[key]) : 0;
  }
  const num = Number(String(value).replace('%','').replace(',', '.').trim());
  return Number.isFinite(num) ? num : 0;
}

function detailValue(details = [], names = [], preferredKey = ''){
  const wanted = names.map(normalizeToken);
  return (Array.isArray(details) ? details : [])
    .filter(detail => {
      const tokens = [detail?.type?.code, detail?.type?.name, detail?.type?.developer_name, detail?.name, detail?.code, detail?.type_id].map(normalizeToken);
      return tokens.some(token => wanted.some(want => token === want || token.includes(want)));
    })
    .reduce((sum, detail) => sum + valueNumber(detail?.value ?? detail?.total ?? detail?.count, preferredKey), 0);
}

function detailSubValue(details = [], names = [], key = ''){
  const wanted = names.map(normalizeToken);
  const row = (Array.isArray(details) ? details : []).find(detail => {
    const tokens = [detail?.type?.code, detail?.type?.name, detail?.type?.developer_name, detail?.name, detail?.code, detail?.type_id].map(normalizeToken);
    return tokens.some(token => wanted.some(want => token === want || token.includes(want)));
  });
  return valueNumber(row?.value, key);
}

function logo(entity = {}){ return entity.image_path || entity.logo_path || entity.logo || ''; }

function playerName(player = {}){
  return player.display_name || player.common_name || player.name || [player.firstname, player.lastname].filter(Boolean).join(' ') || `Spelare ${player.id || ''}`.trim();
}

function normalizeTeam(team = {}){
  return {
    id: team.id || team.team_id || null,
    name: team.name || team.short_code || `Lag ${team.id || team.team_id || ''}`.trim(),
    logo: logo(team),
  };
}

function normalizePlayerStat(item = {}, team = {}, league = {}){
  const player = item.player || item;
  const stats = Array.isArray(item.statistics) ? item.statistics : (Array.isArray(player.statistics) ? player.statistics : []);
  const details = [
    ...(Array.isArray(item.details) ? item.details : []),
    ...stats.flatMap(stat => Array.isArray(stat.details) ? stat.details : []),
  ];
  const teamEntity = item.team || team || stats.find(stat => stat.team)?.team || {};
  const appearances = detailValue(details, ['appearances', 'appearance']);
  const starts = detailValue(details, ['lineups', 'starts', 'starting']);
  const minutes = detailValue(details, ['minutes played', 'minutes']);
  const goals = detailValue(details, ['goals']);
  const assists = detailValue(details, ['assists']);
  const shots = detailValue(details, ['shots total', 'shots']);
  const passes = detailValue(details, ['passes']);
  const passAccuracy = detailValue(details, ['pass accuracy'], 'average');
  const saves = detailValue(details, ['saves']);
  const goalsConceded = detailValue(details, ['goals conceded', 'conceded']);
  const position = item.position?.name || item.detailedPosition?.name || player.position?.name || '';
  const rating = detailValue(details, ['rating', 'average rating'], 'average');
  const goalContributions = goals + assists;
  const per90 = value => minutes > 0 ? (value / minutes) * 90 : 0;
  const pct = (part, total) => total > 0 ? (part / total) * 100 : 0;
  const tackles = detailValue(details, ['tackles']);
  const interceptions = detailValue(details, ['interceptions']);
  const blocks = detailValue(details, ['blocks']);
  const duelsWon = detailValue(details, ['duels won']);
  const duelsTotal = detailValue(details, ['duels total', 'duels']);
  const shotsOn = detailValue(details, ['shots on target']);
  return {
    playerId: player.id || item.player_id,
    playerName: playerName(player),
    firstname: player.firstname || '',
    lastname: player.lastname || '',
    teamId: teamEntity.id || team.id || null,
    teamName: teamEntity.name || team.name || '',
    teamLogo: logo(teamEntity) || logo(team),
    photo: logo(player),
    position,
    stats: {
      appearances, starts, subIns:detailSubValue(details, ['substitutions', 'substitution'], 'in'), subOuts:detailSubValue(details, ['substitutions', 'substitution'], 'out'),
      bench:detailValue(details, ['bench']), minutes, goals, assists, shots, shotsOn, passes, keyPasses:detailValue(details, ['key passes']),
      tackles, interceptions, blocks, duelsWon, duelsTotal,
      foulsCommitted:detailValue(details, ['fouls committed']), foulsDrawn:detailValue(details, ['fouls drawn']),
      yellow:detailValue(details, ['yellow cards', 'yellow card', 'yellowcards', 'yellow']), red:detailValue(details, ['red cards', 'red card', 'redcards', 'red']),
      offsides:detailValue(details, ['offsides']), saves, goalsConceded,
      penaltiesSaved:detailValue(details, ['penalty saved']), penaltiesScored:detailValue(details, ['penalty scored']),
      penaltiesMissed:detailValue(details, ['penalty missed']), penaltiesWon:detailValue(details, ['penalty won']),
      penaltiesCommitted:detailValue(details, ['penalty committed']), rating,
    },
    derived: {
      goalContributions,
      goalsPer90:per90(goals), assistsPer90:per90(assists), pointsPer90:per90(goalContributions),
      shotsPer90:per90(shots), keyPassesPer90:per90(detailValue(details, ['key passes'])),
      conversionRate:pct(goals, shots), shotsPerGoal:goals > 0 ? shots / goals : 0, shotAccuracy:pct(shotsOn, shots),
      passAccuracy, accuratePasses:passes * (passAccuracy / 100), passesPer90:per90(passes),
      defActions:tackles + interceptions + blocks, defActionsPer90:per90(tackles + interceptions + blocks),
      duelWinRate:pct(duelsWon, duelsTotal), savePercentage:pct(saves, saves + goalsConceded),
      goalsConcededPerMatch:appearances > 0 ? goalsConceded / appearances : 0,
      minutesPerMatch:appearances > 0 ? minutes / appearances : 0,
      subApps:Math.max(detailSubValue(details, ['substitutions', 'substitution'], 'in') || (appearances - starts), 0),
      minutesPerGoal:goals > 0 ? minutes / goals : 0,
      minutesPerContribution:goalContributions > 0 ? minutes / goalContributions : 0,
    },
    flags: {
      goalkeeper: normalizeToken(position).includes('goalkeeper') || saves > 0 || goalsConceded > 0,
    }
  };
}

export async function refreshStoredTeamStats(teamId, league, options = {}){
  const teamsResult = await getAdminTeams(league, options);
  const team = teamsResult.teams.find(item => String(item.id) === String(teamId)) || { id:Number(teamId), name:`Lag ${teamId}`, logo:'' };
  const playersResult = await sportmonksAdminPaged('players', {
    include:'statistics.details.type;position;detailedPosition',
    filters:`playerStatisticSeasons:${league.seasonId};playerStatisticTeams:${teamId}`,
    per_page:50,
  }, { ...options, fetchAllPages:true });
  const players = playersResult.rows
    .map(item => normalizePlayerStat(item, team, league))
    .filter(player => player.playerId);
  const usefulPlayerCount = players.filter(player => [
    player.stats.appearances, player.stats.minutes, player.stats.goals, player.stats.assists,
    player.stats.yellow, player.stats.red, player.stats.rating
  ].some(value => Number(value || 0) > 0)).length;
  const payload = {
    teamId:Number(teamId),
    leagueId:league.leagueId,
    season:league.seasonLabel,
    seasonId:league.seasonId,
    team,
    players,
    playerCount:players.length,
    usefulPlayerCount,
    updatedAt:Date.now(),
    warning:players.length ? '' : 'Sportmonks returnerade inga spelarstats för laget.',
  };
  await writeStatsStore(league, `team-${teamId}`, payload);
  if(!options.skipRebuild) await rebuildStoredLeagueDataset(league);
  return {
    payload,
    apiCalls: teamsResult.apiCalls + playersResult.apiCalls,
    staleFallback: teamsResult.staleFallback || playersResult.staleFallback,
  };
}

export async function getStoredTeamStatus(team, league){
  const stored = await readStatsStore(league, `team-${team.id}`);
  const data = stored?.data || null;
  return {
    ...team,
    cache:{
      cached:Boolean(data),
      updatedAt:data?.updatedAt || stored?.updatedAt || null,
      playerCount:Number(data?.playerCount || data?.players?.length || 0),
      usefulPlayerCount:Number(data?.usefulPlayerCount || 0),
      emptyStats:Boolean(data && !Number(data?.usefulPlayerCount || 0)),
      warning:data?.warning || '',
    }
  };
}

export async function rebuildStoredLeagueDataset(league){
  const teamsResult = await getAdminTeams(league);
  const teams = teamsResult.teams;
  const teamPayloads = [];
  for(const team of teams){
    const stored = await readStatsStore(league, `team-${team.id}`);
    if(stored?.data) teamPayloads.push(stored.data);
  }
  const players = teamPayloads.flatMap(item => item.players || []);
  const teamStats = teamPayloads.map(item => ({
    teamId:item.teamId,
    leagueId:item.leagueId,
    season:item.season,
    team:item.team,
    updatedAt:item.updatedAt,
    warning:item.warning || '',
  }));
  const dataset = {
    year:league.seasonLabel,
    leagueKey:league.key,
    leagueId:league.leagueId,
    seasonId:league.seasonId,
    teams,
    players,
    teamStats,
    meta:{
      playerCount:players.length,
      teamCount:teams.length,
      cachedTeamCount:teamPayloads.length,
      updatedAt:Date.now(),
      source:'admin-persisted',
      storeKeys:statsStoreKeys(league),
      warning:players.length ? '' : 'Statistik är inte uppdaterad ännu.',
    }
  };
  await writeStatsStore(league, 'teams', teams);
  await writeStatsStore(league, 'players', players);
  await writeStatsStore(league, 'leaderboards', { players, teamStats, meta:dataset.meta });
  await writeStatsStore(league, 'dataset', dataset);
  return { dataset, apiCalls:teamsResult.apiCalls, staleFallback:teamsResult.staleFallback };
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
