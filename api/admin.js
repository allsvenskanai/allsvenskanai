import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';
const ADMIN_LEAGUES = {
  allsvenskan: { key:'allsvenskan', name:'Allsvenskan Herr', leagueId:573, seasonId:26806, seasonLabel:2026 },
  damallsvenskan: { key:'damallsvenskan', name:'Allsvenskan Dam', leagueId:576, seasonId:26782, seasonLabel:2026 },
};
const adminMemoryCache = globalThis.__ALLSVENSKANAI_ADMIN_CACHE__ || new Map();
globalThis.__ALLSVENSKANAI_ADMIN_CACHE__ = adminMemoryCache;
const STATS_STORE_VERSION = 'v2';
const STATS_STORE_DIR = process.env.STATS_CACHE_DIR || path.join(os.tmpdir(), 'allsvenskanai-stats-cache');

async function readJsonBody(req){
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

function sendJson(res, status, payload){
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

function requireAdmin(req, res, body = {}){
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

function getLeagueConfig(value){
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

function adminTtl(pathname){
  const key = String(pathname || '').toLowerCase();
  if(key.includes('standings')) return 5 * 60 * 1000;
  if(key.includes('players')) return 10 * 60 * 1000;
  if(key.includes('teams') || key.includes('squads') || key.includes('seasons')) return 60 * 60 * 1000;
  return 5 * 60 * 1000;
}

async function sportmonksAdmin(pathname, params = {}, options = {}){
  const token = process.env.SPORTMONKS_API_TOKEN;
  if(!token) throw new Error('SPORTMONKS_API_TOKEN saknas');
  const cleanPath = String(pathname || '').replace(/^\/+/, '');
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

async function sportmonksAdminPaged(pathname, params = {}, options = {}){
  const rows = [];
  let page = Number(params.page || 1);
  let apiCalls = 0;
  let staleFallback = false;
  while(true){
    const result = await sportmonksAdmin(pathname, { ...params, page, per_page:params.per_page || 50 }, options);
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

async function getAdminTeams(league, options = {}){
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

function storeLeagueKey(league){
  return league.key === 'damallsvenskan' ? 'allsvenskan:dam' : 'allsvenskan:herr';
}

function statsStoreKeys(league){
  const key = storeLeagueKey(league);
  return {
    teams:`stats:${key}:${league.seasonLabel}:teams`,
    teamPattern:`stats:${key}:${league.seasonLabel}:teams:<teamId>`,
    players:`stats:${key}:${league.seasonLabel}:players`,
    leaderboards:`stats:${key}:${league.seasonLabel}:leaderboards`,
  };
}

function teamStatsStoreKey(league, teamId){
  return `stats:${storeLeagueKey(league)}:${league.seasonLabel}:teams:${teamId}`;
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

async function readStatsStore(league, part){
  try {
    const raw = await readFile(statsStoreFile(league, part), 'utf8');
    return JSON.parse(raw);
  } catch(error) {
    if(error?.code !== 'ENOENT') console.warn('[stats-store] read failed', { part, league:league.key, error:error.message });
    return null;
  }
}

async function writeStatsStore(league, part, data){
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

async function listStoredTeamPayloads(league){
  await ensureStatsStoreDir();
  const prefix = `${STATS_STORE_VERSION}-${safeFilePart(league.key)}-${safeFilePart(league.seasonLabel)}-team-`;
  const files = await readdir(STATS_STORE_DIR).catch(() => []);
  const payloads = [];
  for(const file of files.filter(item => item.startsWith(prefix) && item.endsWith('.json'))){
    try {
      const raw = await readFile(path.join(STATS_STORE_DIR, file), 'utf8');
      const parsed = JSON.parse(raw);
      if(parsed?.data?.teamId) payloads.push(sanitizeTeamPayload(league, parsed.data));
    } catch(error) {
      console.warn('[stats-store] team payload read failed', { league:league.key, file, error:error.message });
    }
  }
  return payloads;
}

async function clearStatsStore(league = null, part = ''){
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

function detailValueFiltered(details = [], names = [], excludedNames = [], preferredKey = ''){
  const wanted = names.map(normalizeToken);
  const excluded = excludedNames.map(normalizeToken);
  return (Array.isArray(details) ? details : [])
    .filter(detail => {
      const tokens = [detail?.type?.code, detail?.type?.name, detail?.type?.developer_name, detail?.name, detail?.code, detail?.type_id].map(normalizeToken);
      const matchesWanted = tokens.some(token => wanted.some(want => token === want || token.includes(want)));
      const matchesExcluded = tokens.some(token => excluded.some(skip => token === skip || token.includes(skip)));
      return matchesWanted && !matchesExcluded;
    })
    .reduce((sum, detail) => sum + valueNumber(detail?.value ?? detail?.total ?? detail?.count, preferredKey), 0);
}

function detailValueStrict(details = [], names = [], excludedNames = [], preferredKey = ''){
  const wanted = names.map(normalizeToken);
  const excluded = excludedNames.map(normalizeToken);
  return (Array.isArray(details) ? details : [])
    .filter(detail => {
      const tokens = [detail?.type?.code, detail?.type?.name, detail?.type?.developer_name, detail?.name, detail?.code, detail?.type_id].map(normalizeToken);
      const matchesWanted = tokens.some(token => wanted.includes(token));
      const matchesExcluded = tokens.some(token => excluded.includes(token));
      return matchesWanted && !matchesExcluded;
    })
    .reduce((sum, detail) => sum + valueNumber(detail?.value ?? detail?.total ?? detail?.count, preferredKey), 0);
}

function detailValueByType(details = [], names = [], excludedNames = [], preferredKey = ''){
  const wanted = names.map(normalizeToken);
  const excluded = excludedNames.map(normalizeToken);
  return (Array.isArray(details) ? details : [])
    .filter(detail => {
      const tokens = [detail?.type?.code, detail?.type?.name, detail?.type?.developer_name, detail?.name, detail?.code, detail?.type_id].map(normalizeToken);
      const matchesWanted = tokens.some(token => wanted.some(want => token === want || token.includes(want)));
      const matchesExcluded = tokens.some(token => excluded.some(skip => token === skip || token.includes(skip)));
      return matchesWanted && !matchesExcluded;
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

function playerAge(player = {}){
  const raw = player.date_of_birth || player.birthdate || player.birth_date || player.dob;
  if(!raw) return null;
  const date = new Date(raw);
  if(Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const beforeBirthday = now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate());
  if(beforeBirthday) age -= 1;
  return age > 0 && age < 80 ? age : null;
}

function entityId(value){
  if(value === null || value === undefined || value === '') return null;
  if(typeof value === 'object') return entityId(value.id ?? value.team_id ?? value.season_id ?? value.player_id);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function statTeamId(stat = {}){
  return entityId(
    stat.team_id ?? stat.team?.id ?? stat.participant_id ?? stat.participant?.id ??
    stat.player_statistic?.team_id ?? stat.meta?.team_id
  );
}

function statSeasonId(stat = {}){
  return entityId(
    stat.season_id ?? stat.season?.id ?? stat.player_statistic?.season_id ??
    stat.meta?.season_id ?? stat.fixture?.season_id
  );
}

function statLeagueId(stat = {}){
  return entityId(
    stat.league_id ?? stat.league?.id ?? stat.player_statistic?.league_id ??
    stat.meta?.league_id ?? stat.fixture?.league_id
  );
}

function getPlayerStatistics(item = {}){
  const player = item.player || item;
  return Array.isArray(item.statistics) ? item.statistics : (Array.isArray(player.statistics) ? player.statistics : []);
}

function itemDirectlyMatchesTeamSeason(item = {}, teamId, seasonId){
  const directTeamId = entityId(item.team_id ?? item.team?.id ?? item.current_team_id ?? item.currentTeam?.id);
  const directSeasonId = entityId(item.season_id ?? item.season?.id);
  return Boolean(directTeamId && String(directTeamId) === String(teamId) && (!directSeasonId || String(directSeasonId) === String(seasonId)));
}

function statMatchesTeamSeason(stat = {}, teamId, seasonId, leagueId = null){
  const sid = statSeasonId(stat);
  const tid = statTeamId(stat);
  const lid = statLeagueId(stat);
  const seasonOk = !sid || String(sid) === String(seasonId);
  const leagueOk = !lid || !leagueId || String(lid) === String(leagueId);
  const teamOk = tid && String(tid) === String(teamId);
  return Boolean(seasonOk && leagueOk && teamOk);
}

function itemMatchesTeamSeason(item = {}, teamId, seasonId, leagueId = null){
  const stats = getPlayerStatistics(item);
  if(stats.some(stat => statMatchesTeamSeason(stat, teamId, seasonId, leagueId))) return true;
  return itemDirectlyMatchesTeamSeason(item, teamId, seasonId);
}

function filterPlayerItemForTeamSeason(item = {}, team = {}, league = {}){
  const player = item.player || item;
  const directMatch = itemDirectlyMatchesTeamSeason(item, team.id, league.seasonId);
  const stats = getPlayerStatistics(item).filter(stat => {
    if(statMatchesTeamSeason(stat, team.id, league.seasonId, league.leagueId)) return true;
    const sid = statSeasonId(stat);
    const tid = statTeamId(stat);
    const lid = statLeagueId(stat);
    return directMatch && !tid && (!sid || String(sid) === String(league.seasonId)) && (!lid || String(lid) === String(league.leagueId));
  });
  return {
    ...item,
    player:{
      ...player,
      statistics:stats,
    },
    statistics:stats,
    team,
  };
}

function playerHasUsefulStats(player = {}){
  const stats = player.stats || {};
  return [
    stats.appearances, stats.minutes, stats.goals, stats.assists,
    stats.yellow, stats.red, stats.rating, stats.starts,
    stats.passes, stats.accuratePasses, stats.keyPasses, stats.shots, stats.shotsOn,
    stats.tackles, stats.interceptions, stats.blocks, stats.duelsWon, stats.duelsTotal,
    stats.saves, stats.goalsConceded, stats.cleanSheets,
    stats.xg, stats.xa, stats.progressivePasses, stats.progressiveRuns,
    stats.crosses, stats.longPasses,
  ].some(value => Number(value || 0) > 0);
}

function sanitizeCachedPlayerGoals(player = {}){
  const stats = player.stats || {};
  const rawGoals = valueNumber(stats.goals ?? player.goals);
  const assists = valueNumber(stats.assists ?? player.assists);
  const passes = valueNumber(stats.passes);
  const accuratePasses = valueNumber(stats.accuratePasses ?? player.derived?.accuratePasses);
  const passAccuracy = passes > 0 && accuratePasses > 0
    ? (accuratePasses / passes) * 100
    : valueNumber(player.derived?.passAccuracy ?? stats.passAccuracy);
  const conceded = valueNumber(stats.goalsConceded);
  const shots = valueNumber(stats.shots ?? player.shots) + valueNumber(stats.shotsOn ?? player.shotsOnTarget);
  const isGoalkeeper = Boolean(player.flags?.goalkeeper || normalizeToken(player.position).includes('goalkeeper') || normalizeToken(player.position).includes('malvakt') || conceded > 0 || valueNumber(stats.saves) > 0);
  const goals = isGoalkeeper && conceded > 0 && rawGoals === conceded && !shots ? 0 : rawGoals;
  const minutes = valueNumber(stats.minutes ?? player.minutes);
  const goalContributions = goals + assists;
  return {
    ...player,
    goals,
    assists,
    stats:{ ...stats, goals, assists, goalsConceded:conceded, passes, accuratePasses },
    derived:{
      ...(player.derived || {}),
      goalContributions,
      goalsPer90:minutes > 0 ? (goals / minutes) * 90 : 0,
      assistsPer90:minutes > 0 ? (assists / minutes) * 90 : 0,
      pointsPer90:minutes > 0 ? (goalContributions / minutes) * 90 : 0,
      minutesPerGoal:goals > 0 ? minutes / goals : 0,
      minutesPerContribution:goalContributions > 0 ? minutes / goalContributions : 0,
      passAccuracy,
      accuratePasses,
      passesPer90:minutes > 0 ? (passes / minutes) * 90 : 0,
      cardsPer90:minutes > 0 ? ((valueNumber(stats.yellow) + valueNumber(stats.red)) / minutes) * 90 : 0,
      foulsPer90:minutes > 0 ? (valueNumber(stats.foulsCommitted) / minutes) * 90 : 0,
      goalsConcededPer90:minutes > 0 ? (conceded / minutes) * 90 : 0,
    },
    flags:{ ...(player.flags || {}), goalkeeper:isGoalkeeper },
  };
}

function playerStatScore(player = {}){
  const stats = player.stats || {};
  return [
    stats.appearances, stats.minutes, stats.goals, stats.assists, stats.rating,
    stats.yellow, stats.red, stats.shots, stats.passes, stats.saves,
  ].reduce((sum, value) => sum + (Number(value || 0) > 0 ? 1 : 0), 0);
}

function chooseBetterPlayerStat(current, next){
  if(!current) return next;
  if(!next) return current;
  const currentScore = playerStatScore(current);
  const nextScore = playerStatScore(next);
  if(nextScore > currentScore) return next;
  if(nextScore < currentScore) return current;
  return Number(next.stats?.minutes || 0) >= Number(current.stats?.minutes || 0) ? next : current;
}

function dedupePlayers(players = []){
  const byPlayer = new Map();
  for(const player of players){
    const key = `${player.teamId || 'team'}:${player.playerId || ''}`;
    if(!player.playerId || byPlayer.has(key) && !playerHasUsefulStats(player) && playerHasUsefulStats(byPlayer.get(key))) continue;
    byPlayer.set(key, chooseBetterPlayerStat(byPlayer.get(key), player));
  }
  return [...byPlayer.values()];
}

function sanitizeTeamPayload(league, payload = {}){
  if(!payload?.teamId) return payload;
  const originalPlayers = Array.isArray(payload.players) ? payload.players : [];
  const invalidOversizedTeamCache = originalPlayers.length > 100;
  const players = invalidOversizedTeamCache
    ? []
    : dedupePlayers(originalPlayers.filter(player => String(player.teamId || payload.teamId) === String(payload.teamId)).map(sanitizeCachedPlayerGoals));
  const usefulPlayerCount = players.filter(playerHasUsefulStats).length;
  return {
    ...payload,
    cacheKey:payload.cacheKey || teamStatsStoreKey(league, payload.teamId),
    players,
    squad:Array.isArray(payload.squad) && payload.squad.length ? payload.squad.filter(player => String(player.teamId || payload.teamId) === String(payload.teamId)) : players.map(player => ({
      id:player.playerId,
      playerId:player.playerId,
      name:player.playerName,
      playerName:player.playerName,
      firstname:player.firstname || '',
      lastname:player.lastname || '',
      teamId:player.teamId,
      teamName:player.teamName,
      season:player.season,
      seasonId:player.seasonId,
      leagueId:player.leagueId,
      leagueKey:player.leagueKey,
      position:player.position || '',
      photo:player.photo || '',
      age:player.age ?? null,
      nationality:player.nationality || '',
      country:player.country || '',
    })),
    playerCount:players.length,
    usefulPlayerCount,
    debug:{
      ...(payload.debug || {}),
      sanitizedOriginalPlayers:originalPlayers.length,
      sanitizedPlayers:players.length,
      playersWithGoals:players.filter(player => Number(player.stats?.goals || 0) > 0).length,
      invalidOversizedTeamCache,
    },
    warning:invalidOversizedTeamCache ? 'Ogiltig gammal team-cache: for manga spelare. Refresha laget i admin.' : (payload.warning || ''),
  };
}

function normalizePlayerStat(item = {}, team = {}){
  const player = item.player || item;
  const stats = Array.isArray(item.statistics) ? item.statistics : (Array.isArray(player.statistics) ? player.statistics : []);
  const details = [
    ...(Array.isArray(item.details) ? item.details : []),
    ...stats.flatMap(stat => Array.isArray(stat.details) ? stat.details : []),
  ];
  const teamEntity = item.team || team || stats.find(stat => stat.team)?.team || {};
  const appearances = detailValueStrict(details, ['appearances', 'appearance']);
  const starts = detailValueStrict(details, ['lineups', 'starts', 'starting']);
  const minutes = detailValueStrict(details, ['minutes played', 'minutes']);
  const goals = detailValueStrict(details, ['goals', 'goal', 'goals scored', 'scored goals', 'total goals'], ['goals conceded', 'conceded goals', 'conceded', 'against', 'goals against', 'goals allowed', 'own goal', 'own goals', 'penalty', 'penalties']);
  const assists = detailValueFiltered(details, ['assists', 'assist'], ['expected assists']);
  const shots = detailValueStrict(details, ['shots total', 'total shots', 'shots'], ['shots on target', 'on target', 'blocked shots']);
  const passes = detailValueStrict(details, ['passes', 'total passes', 'passes total'], ['accurate passes', 'successful passes', 'completed passes', 'key passes', 'pass accuracy', 'passes accuracy', 'percentage', 'percent']);
  const accuratePasses = detailValueStrict(details, ['accurate passes', 'passes accurate', 'successful passes', 'completed passes'], ['percentage', 'percent', 'accuracy']);
  const keyPasses = detailValueStrict(details, ['key passes', 'passes key', 'key pass']);
  const rawPassAccuracy = detailValueStrict(details, ['pass accuracy', 'passes accuracy', 'passing accuracy', 'pass percentage'], [], 'average');
  const passAccuracy = passes > 0 && accuratePasses > 0 ? (accuratePasses / passes) * 100 : rawPassAccuracy;
  const saves = detailValueStrict(details, ['saves']);
  const goalsConceded = detailValueStrict(details, ['goals conceded', 'conceded goals', 'conceded', 'goals against', 'against', 'goals allowed']);
  const cleanSheets = detailValueStrict(details, ['clean sheets', 'cleansheets', 'clean sheet']);
  const position = item.position?.name || item.detailedPosition?.name || player.position?.name || '';
  const rating = detailValueStrict(details, ['rating', 'average rating'], [], 'average');
  const goalContributions = goals + assists;
  const per90 = value => minutes > 0 ? (value / minutes) * 90 : 0;
  const pct = (part, total) => total > 0 ? (part / total) * 100 : 0;
  const tackles = detailValueStrict(details, ['tackles', 'total tackles']);
  const interceptions = detailValueStrict(details, ['interceptions']);
  const blocks = detailValueStrict(details, ['blocks', 'blocked shots']);
  const duelsWon = detailValueStrict(details, ['duels won', 'won duels']);
  const duelsTotal = detailValueStrict(details, ['duels total', 'total duels', 'duels'], ['duels won', 'won duels', 'duels lost', 'lost duels']);
  const shotsOn = detailValueStrict(details, ['shots on target', 'on target']);
  const xg = detailValueStrict(details, ['expected goals', 'xg', 'expected goal'], [], 'average');
  const xa = detailValueStrict(details, ['expected assists', 'xa', 'expected assist'], [], 'average');
  const progressivePasses = detailValueStrict(details, ['progressive passes', 'progressive pass']);
  const progressiveRuns = detailValueStrict(details, ['progressive runs', 'progressive run', 'progressive carries', 'progressive carry']);
  const crosses = detailValueStrict(details, ['crosses', 'total crosses']);
  const accurateCrosses = detailValueStrict(details, ['accurate crosses', 'successful crosses', 'completed crosses']);
  const longPasses = detailValueStrict(details, ['long passes', 'total long passes']);
  const accurateLongPasses = detailValueStrict(details, ['accurate long passes', 'successful long passes', 'completed long passes']);
  return {
    playerId: player.id || item.player_id,
    playerName: playerName(player),
    firstname: player.firstname || '',
    lastname: player.lastname || '',
    age:playerAge(player),
    nationality:player.nationality?.name || player.country?.name || player.nationality || player.country || '',
    country:player.country?.name || player.nationality?.name || player.country || player.nationality || '',
    teamId: teamEntity.id || team.id || null,
    teamName: teamEntity.name || team.name || '',
    teamLogo: logo(teamEntity) || logo(team),
    photo: logo(player),
    position,
    minutes,
    goals,
    assists,
    shots,
    shotsOnTarget:shotsOn,
    keyPasses,
    stats: {
      appearances, starts, subIns:detailSubValue(details, ['substitutions', 'substitution'], 'in'), subOuts:detailSubValue(details, ['substitutions', 'substitution'], 'out'),
      bench:detailValueStrict(details, ['bench']), minutes, goals, assists, shots, shotsOn, passes, accuratePasses, keyPasses,
      tackles, interceptions, blocks, duelsWon, duelsTotal,
      foulsCommitted:detailValueStrict(details, ['fouls committed']), foulsDrawn:detailValueStrict(details, ['fouls drawn']),
      yellow:detailValueStrict(details, ['yellow cards', 'yellow card', 'yellowcards', 'yellow']), red:detailValueStrict(details, ['red cards', 'red card', 'redcards', 'red']),
      offsides:detailValueStrict(details, ['offsides']), saves, goalsConceded, cleanSheets,
      penaltiesSaved:detailValueStrict(details, ['penalty saved']), penaltiesScored:detailValueStrict(details, ['penalty scored']),
      penaltiesMissed:detailValueStrict(details, ['penalty missed']), penaltiesWon:detailValueStrict(details, ['penalty won']),
      penaltiesCommitted:detailValueStrict(details, ['penalty committed']), rating,
      xg, xa, progressivePasses, progressiveRuns, crosses, accurateCrosses, longPasses, accurateLongPasses,
    },
    derived: {
      goalContributions,
      goalsPer90:per90(goals), assistsPer90:per90(assists), pointsPer90:per90(goalContributions),
      shotsPer90:per90(shots), keyPassesPer90:per90(keyPasses),
      conversionRate:pct(goals, shots), shotsPerGoal:goals > 0 ? shots / goals : 0, shotAccuracy:pct(shotsOn, shots),
      passAccuracy, accuratePasses, passesPer90:per90(passes),
      defActions:tackles + interceptions + blocks, defActionsPer90:per90(tackles + interceptions + blocks),
      duelWinRate:pct(duelsWon, duelsTotal), savePercentage:pct(saves, saves + goalsConceded),
      goalsConcededPerMatch:appearances > 0 ? goalsConceded / appearances : 0,
      goalsConcededPer90:per90(goalsConceded),
      minutesPerMatch:appearances > 0 ? minutes / appearances : 0,
      subApps:Math.max(detailSubValue(details, ['substitutions', 'substitution'], 'in') || (appearances - starts), 0),
      minutesPerGoal:goals > 0 ? minutes / goals : 0,
      minutesPerContribution:goalContributions > 0 ? minutes / goalContributions : 0,
      cardsPer90:per90(detailValueStrict(details, ['yellow cards', 'yellow card', 'yellowcards', 'yellow']) + detailValueStrict(details, ['red cards', 'red card', 'redcards', 'red'])),
      foulsPer90:per90(detailValueStrict(details, ['fouls committed'])),
      xgPer90:per90(xg),
      xaPer90:per90(xa),
    },
    flags: {
      goalkeeper: normalizeToken(position).includes('goalkeeper') || saves > 0 || goalsConceded > 0,
    }
  };
}

function compactTeam(team = {}){
  if(!team) return null;
  return {
    id:Number(team.id || team.team_id || 0) || null,
    name:team.name || team.display_name || team.short_code || '',
    logo:team.image_path || team.logo_path || team.logo || '',
  };
}

function normalizeTransferRow(row = {}, league){
  const player = row.player || row.playerData || row.participant || {};
  const fromTeam = row.fromTeam || row.from_team || row.teamOut || row.teams?.out || row.from || {};
  const toTeam = row.toTeam || row.to_team || row.teamIn || row.teams?.in || row.to || {};
  const type = row.type?.name || row.transferType?.name || row.type || row.transfer_type || row.status || 'Okänd';
  const date = row.date || row.transfer_date || row.start_date || row.created_at || '';
  return {
    id:row.id || `${player.id || row.player_id || ''}-${date}-${compactTeam(toTeam)?.id || ''}`,
    date:String(date || '').slice(0, 10),
    type:String(type || 'Okänd'),
    playerId:Number(player.id || row.player_id || 0) || null,
    playerName:player.display_name || player.name || row.player_name || 'Okänd spelare',
    teamIn:compactTeam(toTeam),
    teamOut:compactTeam(fromTeam),
    league:league.key,
    leagueId:league.leagueId,
    season:league.seasonLabel,
    seasonId:league.seasonId,
  };
}

function normalizeStoredTransfers(rows = [], league){
  const seen = new Set();
  return (rows || [])
    .map(row => normalizeTransferRow(row, league))
    .filter(row => row.playerId || row.playerName)
    .filter(row => {
      const year = Number(String(row.date || '').slice(0, 4));
      return !row.date || !year || year >= Number(league.seasonLabel) - 1;
    })
    .filter(row => {
      const key = `${row.playerId || row.playerName}:${row.date}:${row.teamIn?.id || ''}:${row.teamOut?.id || ''}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
}

async function refreshStoredTeamStats(teamId, league, options = {}){
  const teamsResult = await getAdminTeams(league, options);
  const team = teamsResult.teams.find(item => String(item.id) === String(teamId)) || { id:Number(teamId), name:`Lag ${teamId}`, logo:'' };
  const playersResult = await sportmonksAdminPaged('players', {
    include:'statistics.details.type;position;detailedPosition',
    filters:`playerStatisticSeasons:${league.seasonId};playerStatisticTeams:${teamId}`,
    per_page:50,
  }, { ...options, fetchAllPages:true });
  const rawRowsFetched = playersResult.rows.length;
  let teamSeasonRows = playersResult.rows
    .filter(item => itemMatchesTeamSeason(item, team.id, league.seasonId, league.leagueId))
    .map(item => filterPlayerItemForTeamSeason(item, team, league));
  const usedTrustedSmallResponseFallback = !teamSeasonRows.length && rawRowsFetched > 0 && rawRowsFetched <= 100;
  if(usedTrustedSmallResponseFallback) {
    // Some Sportmonks plans omit team_id in included player statistics even when the endpoint
    // filter is honored. Trust only small filtered responses; never trust huge league/global sets.
    teamSeasonRows = playersResult.rows.map(item => filterPlayerItemForTeamSeason({ ...item, team_id:team.id, team }, team, league));
  }
  const normalizedPlayers = teamSeasonRows
    .map(item => ({
      ...normalizePlayerStat(item, team),
      leagueId:league.leagueId,
      leagueKey:league.key,
      season:league.seasonLabel,
      seasonId:league.seasonId,
    }))
    .filter(player => player.playerId && String(player.teamId || team.id) === String(team.id));
  const players = dedupePlayers(normalizedPlayers);
  const usefulPlayerCount = players.filter(playerHasUsefulStats).length;
  const debug = {
    cacheKey:teamStatsStoreKey(league, teamId),
    rawRowsFetched,
    afterTeamSeasonFilter:teamSeasonRows.length,
    afterNormalize:normalizedPlayers.length,
    afterDedupe:players.length,
    usefulPlayerCount,
    emptyStatsCount:Math.max(players.length - usefulPlayerCount, 0),
    playersWithGoals:players.filter(player => Number(player.stats?.goals || 0) > 0).length,
    usedTrustedSmallResponseFallback,
    filters:`playerStatisticSeasons:${league.seasonId};playerStatisticTeams:${teamId}`,
  };
  const payload = {
    teamId:Number(teamId),
    teamName:team.name || `Lag ${teamId}`,
    league:league.key,
    leagueKey:league.key,
    leagueId:league.leagueId,
    season:league.seasonLabel,
    seasonId:league.seasonId,
    cacheKey:teamStatsStoreKey(league, teamId),
    team,
    squad:players.map(player => ({
      id:player.playerId,
      playerId:player.playerId,
      name:player.playerName,
      playerName:player.playerName,
      firstname:player.firstname || '',
      lastname:player.lastname || '',
      teamId:player.teamId,
      teamName:player.teamName,
      season:player.season,
      seasonId:player.seasonId,
      leagueId:player.leagueId,
      leagueKey:player.leagueKey,
      position:player.position || '',
      photo:player.photo || '',
      age:player.age ?? null,
      nationality:player.nationality || '',
      country:player.country || '',
    })),
    players,
    playerCount:players.length,
    usefulPlayerCount,
    updatedAt:Date.now(),
    debug,
    warning:players.length ? '' : 'Sportmonks returnerade inga spelarstats for laget.',
  };
  await writeStatsStore(league, `team-${teamId}`, payload);
  if(!options.skipRebuild) await rebuildStoredLeagueDataset(league);
  return {
    payload,
    apiCalls: teamsResult.apiCalls + playersResult.apiCalls,
    staleFallback: teamsResult.staleFallback || playersResult.staleFallback,
  };
}

async function getStoredTeamStatus(team, league){
  const stored = await readStatsStore(league, `team-${team.id}`);
  const data = stored?.data ? sanitizeTeamPayload(league, stored.data) : null;
  const players = Array.isArray(data?.players) ? data.players : [];
  const usefulPlayerCount = players.filter(playerHasUsefulStats).length;
  return {
    ...team,
    cache:{
      cached:Boolean(data),
      cacheKey:teamStatsStoreKey(league, team.id),
      updatedAt:data?.updatedAt || stored?.updatedAt || null,
      playerCount:Number(data?.playerCount || players.length || 0),
      usefulPlayerCount:Number(data?.usefulPlayerCount || usefulPlayerCount || 0),
      emptyStats:Boolean(data && !Number(data?.usefulPlayerCount || usefulPlayerCount || 0)),
      debug:data?.debug || null,
      warning:data?.warning || '',
    }
  };
}

function buildStoredLeagueDataset(league, teams = [], teamPayloads = []){
  const players = dedupePlayers(teamPayloads.flatMap(item => item.players || []));
  const statInventory = [...new Set(players.flatMap(player => {
    const stats = player.stats || {};
    const derived = player.derived || {};
    return [
      ...Object.entries(stats).filter(([, value]) => Number(value || 0) > 0).map(([key]) => `stats.${key}`),
      ...Object.entries(derived).filter(([, value]) => Number(value || 0) > 0).map(([key]) => `derived.${key}`),
    ];
  }))].sort();
  const teamStats = teamPayloads.map(item => ({
    teamId:item.teamId,
    leagueId:item.leagueId,
    season:item.season,
    team:item.team,
    playerCount:Number(item.playerCount || item.players?.length || 0),
    usefulPlayerCount:Number(item.usefulPlayerCount || (item.players || []).filter(playerHasUsefulStats).length || 0),
    updatedAt:item.updatedAt,
    cacheKey:item.cacheKey || teamStatsStoreKey(league, item.teamId),
    debug:item.debug || null,
    warning:item.warning || '',
  }));
  return {
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
      statInventory,
      statFieldCount:statInventory.length,
      warning:players.length ? '' : 'Statistik ar inte uppdaterad annu.',
    }
  };
}

async function rebuildStoredLeagueDataset(league){
  const teamsResult = await getAdminTeams(league);
  const teams = teamsResult.teams;
  const configuredTeamIds = new Set(teams.map(team => String(team.id)));
  const allTeamPayloads = await listStoredTeamPayloads(league);
  const teamPayloads = allTeamPayloads.filter(item => configuredTeamIds.has(String(item.teamId)));
  const dataset = buildStoredLeagueDataset(league, teams, teamPayloads);
  await writeStatsStore(league, 'teams', teams);
  await writeStatsStore(league, 'players', dataset.players);
  await writeStatsStore(league, 'leaderboards', { players:dataset.players, teamStats:dataset.teamStats, meta:dataset.meta });
  await writeStatsStore(league, 'dataset', dataset);
  return { dataset, apiCalls:teamsResult.apiCalls, staleFallback:teamsResult.staleFallback };
}

function clearAdminCache(scope = 'all'){
  const before = adminMemoryCache.size;
  if(scope === 'all') adminMemoryCache.clear();
  return { before, after:adminMemoryCache.size };
}

async function statusAction(){
  const leagues = {};
  let apiCalls = 0;
  let staleFallback = false;
  for(const league of Object.values(ADMIN_LEAGUES)){
    const result = await getAdminTeams(league);
    const dataset = await readStatsStore(league, 'dataset');
    const teams = [];
    for(const team of result.teams) teams.push(await getStoredTeamStatus(team, league));
    leagues[league.key] = {
      ...league,
      teams,
      datasetMeta:dataset?.data?.meta || null,
      updatedAt:dataset?.updatedAt || dataset?.data?.meta?.updatedAt || null,
    };
    apiCalls += result.apiCalls;
    staleFallback = staleFallback || result.staleFallback;
  }
  return { ok:true, leagues, meta:{ apiCalls, cacheEntries:null, staleFallback } };
}

async function refreshTeamAction(body){
  const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
  const teamId = Number(body.teamId || body.team || 0);
  if(!teamId) return { ok:false, error:'teamId saknas' };
  const result = await refreshStoredTeamStats(teamId, league, { force:Boolean(body.force) });
  return {
    ok:true,
    action:'refresh-team',
    league,
    teamId,
    players:result.payload.players,
    playerCount:result.payload.playerCount,
    usefulPlayerCount:result.payload.usefulPlayerCount,
    debug:result.payload.debug,
    cacheKey:result.payload.cacheKey,
    updatedAt:result.payload.updatedAt,
    apiCalls:result.apiCalls,
    staleFallback:result.staleFallback,
    cacheReused:false,
    note:'Lagstatistik hamtad fran Sportmonks och sparad for publik statistikvy.',
  };
}

async function refreshLeagueAction(body){
  const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
  const teamsResult = await getAdminTeams(league, { force:Boolean(body.forceTeams) });
  const maxTeams = Math.max(1, Math.min(Number(body.limit || teamsResult.teams.length || 1), teamsResult.teams.length || 1));
  const teams = teamsResult.teams.slice(0, maxTeams);
  let apiCalls = teamsResult.apiCalls;
  let staleFallback = teamsResult.staleFallback;
  const results = [];
  for(const team of teams){
    try {
      const result = await refreshStoredTeamStats(team.id, league, { force:Boolean(body.force), skipRebuild:true });
      apiCalls += result.apiCalls;
      staleFallback = staleFallback || result.staleFallback;
      results.push({ teamId:team.id, ok:true, playerCount:result.payload.playerCount, usefulPlayerCount:result.payload.usefulPlayerCount, debug:result.payload.debug });
    } catch(error) {
      console.warn('[admin-refresh-league] team failed', { league:league.key, teamId:team.id, error:error.message });
      results.push({ teamId:team.id, ok:false, error:error.message });
    }
  }
  const rebuilt = await rebuildStoredLeagueDataset(league);
  return {
    ok:true,
    action:'refresh-league',
    league,
    teams,
    results,
    datasetMeta:rebuilt.dataset.meta,
    apiCalls:apiCalls + rebuilt.apiCalls,
    staleFallback:staleFallback || rebuilt.staleFallback,
    cacheReused:false,
    note:'Ligastatistik sparad som public dataset. Publika statistikvyn laser bara detta dataset.',
  };
}

async function refreshRecentAction(body){
  const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
  const teamsResult = await getAdminTeams(league);
  const statuses = [];
  for(const team of teamsResult.teams) statuses.push(await getStoredTeamStatus(team, league));
  const staleMs = Number(body.staleMs || 6 * 60 * 60 * 1000);
  const staleTeams = statuses.filter(team => !team.cache?.cached || team.cache?.emptyStats || !team.cache?.updatedAt || Date.now() - Number(team.cache.updatedAt) > staleMs);
  let apiCalls = teamsResult.apiCalls;
  let staleFallback = teamsResult.staleFallback;
  const results = [];
  for(const team of staleTeams){
    try {
      const result = await refreshStoredTeamStats(team.id, league, { force:Boolean(body.force), skipRebuild:true });
      apiCalls += result.apiCalls;
      staleFallback = staleFallback || result.staleFallback;
      results.push({ teamId:team.id, ok:true, playerCount:result.payload.playerCount, usefulPlayerCount:result.payload.usefulPlayerCount, debug:result.payload.debug });
    } catch(error) {
      console.warn('[admin-refresh-recent] team failed', { league:league.key, teamId:team.id, error:error.message });
      results.push({ teamId:team.id, ok:false, error:error.message });
    }
  }
  const rebuilt = await rebuildStoredLeagueDataset(league);
  return {
    ok:true,
    action:'refresh-recent',
    league,
    teams:staleTeams,
    results,
    datasetMeta:rebuilt.dataset.meta,
    apiCalls:apiCalls + rebuilt.apiCalls,
    staleFallback:staleFallback || rebuilt.staleFallback,
    note:'Saknade/stale lag uppdaterades server-side och public dataset byggdes om.',
  };
}

async function rebuildLeaderboardsAction(body){
  const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
  const result = await rebuildStoredLeagueDataset(league);
  return {
    ok:true,
    action:'rebuild-leaderboards',
    league,
    datasetMeta:result.dataset.meta,
    teamCount:result.dataset.teams.length,
    playerCount:result.dataset.players.length,
    apiCalls:result.apiCalls,
    staleFallback:result.staleFallback,
    note:'Public leaderboards rebuilt from persisted team caches.',
  };
}

async function rebuildPlayerStatsAction(body){
  const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
  const teamsResult = await getAdminTeams(league, { force:Boolean(body.forceTeams) });
  let apiCalls = teamsResult.apiCalls;
  let staleFallback = teamsResult.staleFallback;
  const results = [];
  for(const team of teamsResult.teams){
    try {
      const result = await refreshStoredTeamStats(team.id, league, { force:Boolean(body.force), skipRebuild:true });
      apiCalls += result.apiCalls;
      staleFallback = staleFallback || result.staleFallback;
      results.push({ teamId:team.id, ok:true, playerCount:result.payload.playerCount, usefulPlayerCount:result.payload.usefulPlayerCount, debug:result.payload.debug });
    } catch(error) {
      console.warn('[admin-rebuild-player-stats] team failed', { league:league.key, teamId:team.id, error:error.message });
      results.push({ teamId:team.id, ok:false, error:error.message });
    }
  }
  const rebuilt = await rebuildStoredLeagueDataset(league);
  return {
    ok:true,
    action:'rebuild-player-stats',
    league,
    results,
    datasetMeta:rebuilt.dataset.meta,
    apiCalls:apiCalls + rebuilt.apiCalls,
    staleFallback:staleFallback || rebuilt.staleFallback,
    note:'Player stats rebuilt server-side and saved for public statistics.',
  };
}

async function publicTransfersAction(req){
  const query = req.query || {};
  const league = getLeagueConfig(query.league || query.leagueKey || query.leagueId || 'allsvenskan');
  const stored = await readStatsStore(league, 'transfers');
  const data = stored?.data || null;
  if(!data) {
    return {
      ok:false,
      transfers:[],
      teams:[],
      meta:{ publicMissing:true, league:league.key, season:league.seasonLabel, updatedAt:null, teamCount:0 },
      message:'Övergångar är inte uppdaterade ännu.',
    };
  }
  return {
    ok:true,
    transfers:Array.isArray(data.transfers) ? data.transfers : [],
    teams:Array.isArray(data.teams) ? data.teams : [],
    meta:{
      ...(data.meta || {}),
      league:league.key,
      season:league.seasonLabel,
      updatedAt:stored.updatedAt || data.updatedAt || null,
      teamCount:Number(data.meta?.teamCount || data.teams?.length || 0),
    },
  };
}

async function refreshTransfersAction(body){
  const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
  const teamsResult = await getAdminTeams(league, { force:Boolean(body.forceTeams) });
  let rows = [];
  let apiCalls = teamsResult.apiCalls;
  let staleFallback = teamsResult.staleFallback;
  let warning = '';
  try {
    // Sportmonks transfer availability differs by plan. Keep this admin-only and
    // store an empty, safe payload if the endpoint/include is unavailable.
    const transferResult = await sportmonksAdminPaged('transfers', {
      include:'player;fromTeam;toTeam;type',
      filters:`seasons:${league.seasonId}`,
      per_page:50,
    }, { force:Boolean(body.force), fetchAllPages:true, ttl:30 * 60 * 1000 });
    rows = transferResult.rows;
    apiCalls += transferResult.apiCalls;
    staleFallback = staleFallback || transferResult.staleFallback;
  } catch(error) {
    warning = `Sportmonks transfers kunde inte hämtas: ${error.message}`;
    console.warn('[admin-transfers] refresh failed', { league:league.key, error:error.message });
  }
  const transfers = normalizeStoredTransfers(rows, league);
  const stored = await writeStatsStore(league, 'transfers', {
    transfers,
    teams:teamsResult.teams,
    updatedAt:Date.now(),
    meta:{
      league:league.key,
      season:league.seasonLabel,
      seasonId:league.seasonId,
      transferCount:transfers.length,
      rawRowsFetched:rows.length,
      teamCount:teamsResult.teams.length,
      warning,
    },
  });
  return {
    ok:true,
    action:'refresh-transfers',
    league,
    transferCount:transfers.length,
    rawRowsFetched:rows.length,
    teamCount:teamsResult.teams.length,
    warning,
    apiCalls,
    staleFallback,
    updatedAt:stored.updatedAt,
  };
}

async function clearTransfersAction(body){
  const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
  await clearStatsStore(league, 'transfers');
  return { ok:true, action:'clear-transfers', league, cleared:true };
}

async function clearAction(body){
  const scope = body.scope || 'all';
  const clearedMemory = clearAdminCache(scope);
  const clearedStore = scope === 'team'
    ? await clearStatsStore(getLeagueConfig(body.league || body.leagueKey || body.leagueId), `team-${Number(body.teamId || body.team || 0)}`)
    : scope === 'league'
      ? await clearStatsStore(getLeagueConfig(body.league || body.leagueKey || body.leagueId))
      : await clearStatsStore(null);
  return { ok:true, action:'clear', scope, cleared:{ memory:clearedMemory, store:clearedStore } };
}

async function publicStatsAction(req){
  const query = req.query || {};
  const league = getLeagueConfig(query.league || query.leagueKey || query.leagueId || 'allsvenskan');
  const teamId = Number(query.team || query.teamId || 0);
  if(teamId){
    const stored = await readStatsStore(league, `team-${teamId}`);
    if(!stored?.data) {
      return {
        ok:false,
        response:null,
        message:'Statistik ar inte uppdaterad annu.',
        league,
        teamId,
        keys:{ ...statsStoreKeys(league), team:teamStatsStoreKey(league, teamId) },
      };
    }
    const teamPayload = sanitizeTeamPayload(league, stored.data);
    return {
      ok:true,
      response:teamPayload,
      updatedAt:stored.updatedAt || teamPayload?.updatedAt || null,
      league,
      teamId,
      keys:{ ...statsStoreKeys(league), team:teamStatsStoreKey(league, teamId) },
    };
  }

  const stored = await readStatsStore(league, 'dataset');
  const teamPayloads = await listStoredTeamPayloads(league);
  if(teamPayloads.length) {
    const storedTeams = Array.isArray(stored?.data?.teams) ? stored.data.teams : [];
    const payloadTeams = teamPayloads.map(item => item.team).filter(team => team?.id);
    const teams = storedTeams.length ? storedTeams : payloadTeams;
    const dataset = buildStoredLeagueDataset(league, teams, teamPayloads);
    return {
      ok:true,
      response:dataset,
      updatedAt:dataset.meta.updatedAt,
      league,
      teamId:null,
      keys:statsStoreKeys(league),
      aggregatedFromTeamCaches:true,
    };
  }

  // Public reads must never call Sportmonks. The stored aggregate is only a fallback;
  // fresh public output is normally assembled from admin-written team cache files.
  if(stored?.data?.players?.length || stored?.data?.teamStats?.length) {
    return {
      ok:true,
      response:stored.data,
      updatedAt:stored.updatedAt || stored.data?.meta?.updatedAt || null,
      league,
      teamId:null,
      keys:statsStoreKeys(league),
    };
  }

  return {
    ok:false,
    response:null,
    message:'Statistik ar inte uppdaterad annu.',
    league,
    teamId:null,
    keys:statsStoreKeys(league),
  };
}

function normalizeAdminAction(action = ''){
  const normalized = String(action || '').trim();
  return ({
    'cache-status':'status',
    'update-team':'refresh-team',
    'update-all-teams':'refresh-league',
    'update-player-stats':'rebuild-player-stats',
    'update-transfers':'refresh-transfers',
    'clear-cache':'clear',
  })[normalized] || normalized;
}

export default async function handler(req, res){
  const body = await readJsonBody(req);
  const action = normalizeAdminAction(req.query?.action || body.action || '');
  try {
    if(action === 'public-stats'){
      if(req.method !== 'GET') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
      const payload = await publicStatsAction(req);
      res.setHeader('Cache-Control', payload.ok ? 'public, max-age=120, s-maxage=300, stale-while-revalidate=600' : 'public, max-age=60, s-maxage=60');
      return res.status(200).json(payload);
    }
    if(action === 'public-transfers'){
      if(req.method !== 'GET') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
      const payload = await publicTransfersAction(req);
      res.setHeader('Cache-Control', payload.ok ? 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800' : 'public, max-age=60, s-maxage=120');
      return res.status(200).json(payload);
    }
    if(!requireAdmin(req, res, body)) return;
    if(req.method !== 'POST' && action !== 'status') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
    const payload =
      action === 'status' ? await statusAction(body) :
      action === 'refresh-team' ? await refreshTeamAction(body) :
      action === 'refresh-league' ? await refreshLeagueAction(body) :
      action === 'refresh-recent' ? await refreshRecentAction(body) :
      action === 'rebuild-leaderboards' ? await rebuildLeaderboardsAction(body) :
      action === 'rebuild-player-stats' ? await rebuildPlayerStatsAction(body) :
      action === 'refresh-transfers' ? await refreshTransfersAction(body) :
      action === 'clear-transfers' ? await clearTransfersAction(body) :
      action === 'clear' ? await clearAction(body) :
      { ok:false, error:`Unknown admin action: ${action || '(missing)'}` };
    return sendJson(res, payload.ok === false ? 400 : 200, payload);
  } catch(error) {
    console.error('[admin]', { action, error:error.message });
    return sendJson(res, 200, { ok:false, action, error:error.message || 'Admin action failed', apiCalls:0 });
  }
}
