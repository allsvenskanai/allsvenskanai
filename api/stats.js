import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const STATS_STORE_VERSION = 'v2';
const STATS_STORE_DIR = process.env.STATS_CACHE_DIR || path.join(os.tmpdir(), 'allsvenskanai-stats-cache');
const PUBLIC_LEAGUES = {
  allsvenskan: { key:'allsvenskan', name:'Allsvenskan Herr', leagueId:573, seasonId:26806, seasonLabel:2026 },
  damallsvenskan: { key:'damallsvenskan', name:'Allsvenskan Dam', leagueId:576, seasonId:26782, seasonLabel:2026 },
};

function sendJson(res, status, payload){
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

function getLeagueConfig(value){
  const key = String(value || '').toLowerCase();
  if(['herr', 'men', 'allsvenskan-herr'].includes(key)) return PUBLIC_LEAGUES.allsvenskan;
  if(['dam', 'women', 'allsvenskan-dam', 'damallsvenskan'].includes(key)) return PUBLIC_LEAGUES.damallsvenskan;
  return PUBLIC_LEAGUES[key]
    || Object.values(PUBLIC_LEAGUES).find(league => String(league.leagueId) === key || String(league.seasonId) === key)
    || PUBLIC_LEAGUES.allsvenskan;
}

function storeLeagueKey(league){
  return league.key === 'damallsvenskan' ? 'allsvenskan:dam' : 'allsvenskan:herr';
}

function statsStoreKeys(league){
  const key = storeLeagueKey(league);
  return {
    teams:`stats:${key}:${league.seasonLabel}:teams`,
    players:`stats:${key}:${league.seasonLabel}:players`,
    leaderboards:`stats:${key}:${league.seasonLabel}:leaderboards`,
  };
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
    if(error?.code !== 'ENOENT') console.warn('[public-stats] read failed', { part, league:league.key, error:error.message });
    return null;
  }
}

async function listStoredTeamPayloads(league){
  const prefix = `${STATS_STORE_VERSION}-${safeFilePart(league.key)}-${safeFilePart(league.seasonLabel)}-team-`;
  const files = await readdir(STATS_STORE_DIR).catch(() => []);
  const payloads = [];
  for(const file of files.filter(name => name.startsWith(prefix) && name.endsWith('.json'))){
    try {
      const raw = await readFile(path.join(STATS_STORE_DIR, file), 'utf8');
      const parsed = JSON.parse(raw);
      if(parsed?.data?.teamId) payloads.push(parsed.data);
    } catch(error) {
      console.warn('[public-stats] team cache read failed', { file, error:error.message });
    }
  }
  return payloads;
}

function dedupePlayers(players = []){
  const byKey = new Map();
  for(const player of players){
    const key = `${player.teamId || 'team'}:${player.playerId || player.id || player.playerName || player.name || ''}`;
    if(!key || key.endsWith(':')) continue;
    const current = byKey.get(key);
    const currentMinutes = Number(current?.stats?.minutes || current?.minutes || 0);
    const nextMinutes = Number(player?.stats?.minutes || player?.minutes || 0);
    if(!current || nextMinutes >= currentMinutes) byKey.set(key, player);
  }
  return [...byKey.values()];
}

function playerStat(player = {}, key = ''){
  const direct = Number(player?.[key]);
  if(Number.isFinite(direct)) return direct;
  const nested = Number(player?.stats?.[key]);
  if(Number.isFinite(nested)) return nested;
  const apiFootballLike = {
    goals:player?.statistics?.[0]?.goals?.total,
    assists:player?.statistics?.[0]?.goals?.assists,
    shots:player?.statistics?.[0]?.shots?.total,
    shotsOnTarget:player?.statistics?.[0]?.shots?.on,
    passesTotal:player?.statistics?.[0]?.passes?.total,
    passesAccurate:player?.statistics?.[0]?.passes?.accurate,
    keyPasses:player?.statistics?.[0]?.passes?.key,
    tackles:player?.statistics?.[0]?.tackles?.total,
    blocks:player?.statistics?.[0]?.tackles?.blocks,
    interceptions:player?.statistics?.[0]?.tackles?.interceptions,
    yellowCards:player?.statistics?.[0]?.cards?.yellow,
    redCards:player?.statistics?.[0]?.cards?.red,
    saves:player?.statistics?.[0]?.goals?.saves,
    goalsConceded:player?.statistics?.[0]?.goals?.conceded,
    appearances:player?.statistics?.[0]?.games?.appearances || player?.statistics?.[0]?.games?.appearences,
    starts:player?.statistics?.[0]?.games?.lineups,
    minutes:player?.statistics?.[0]?.games?.minutes,
  }[key];
  const value = Number(apiFootballLike);
  return Number.isFinite(value) ? value : 0;
}

function enrichPlayer(player = {}){
  const passesTotal = playerStat(player, 'passesTotal');
  const passesAccurate = playerStat(player, 'passesAccurate');
  const shots = playerStat(player, 'shots');
  const shotsOnTarget = playerStat(player, 'shotsOnTarget');
  return {
    ...player,
    goals:playerStat(player, 'goals'),
    assists:playerStat(player, 'assists'),
    shots,
    shotsOnTarget,
    keyPasses:playerStat(player, 'keyPasses'),
    passesTotal,
    passesAccurate,
    passAccuracyPct:passesTotal > 0 ? (passesAccurate / passesTotal) * 100 : playerStat(player, 'passAccuracyPct'),
    tackles:playerStat(player, 'tackles'),
    blocks:playerStat(player, 'blocks'),
    interceptions:playerStat(player, 'interceptions'),
    yellowCards:playerStat(player, 'yellowCards'),
    redCards:playerStat(player, 'redCards'),
    saves:playerStat(player, 'saves'),
    goalsConceded:playerStat(player, 'goalsConceded'),
    cleanSheets:playerStat(player, 'cleanSheets'),
    appearances:playerStat(player, 'appearances'),
    starts:playerStat(player, 'starts'),
    minutes:playerStat(player, 'minutes'),
    shotAccuracyPct:shots > 0 ? (shotsOnTarget / shots) * 100 : playerStat(player, 'shotAccuracyPct'),
  };
}

const STAT_GROUP_FIELDS = {
  offense:['goals', 'assists', 'shots', 'shotsOnTarget', 'keyPasses'],
  passing:['passesTotal', 'passesAccurate', 'passAccuracyPct', 'keyPasses'],
  defense:['tackles', 'interceptions', 'blocks'],
  discipline:['yellowCards', 'redCards'],
  goalkeeper:['saves', 'goalsConceded', 'cleanSheets'],
  minutes:['appearances', 'starts', 'minutes'],
};

function buildAvailableStats(players = []){
  return Object.fromEntries(Object.entries(STAT_GROUP_FIELDS).map(([group, fields]) => [
    group,
    fields.filter(field => players.some(player => playerStat(player, field) > 0)),
  ]).filter(([, fields]) => fields.length));
}

function buildLeaderboards(players = [], availableStats = {}){
  const leaderboards = {};
  for(const [group, fields] of Object.entries(availableStats)){
    leaderboards[group] = {};
    for(const field of fields){
      leaderboards[group][field] = players
        .map(player => ({ ...player, value:playerStat(player, field) }))
        .filter(player => player.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 25);
    }
  }
  return leaderboards;
}

function buildDatasetFromTeams(league, storedDataset = null, teamPayloads = []){
  const storedTeams = Array.isArray(storedDataset?.teams) ? storedDataset.teams : [];
  const teams = storedTeams.length ? storedTeams : teamPayloads.map(item => item.team).filter(team => team?.id);
  const players = dedupePlayers(teamPayloads.flatMap(item => Array.isArray(item.players) ? item.players : [])).map(enrichPlayer);
  const availableStats = storedDataset?.availableStats && Object.keys(storedDataset.availableStats).length
    ? storedDataset.availableStats
    : buildAvailableStats(players);
  const leaderboards = storedDataset?.leaderboards && Object.keys(storedDataset.leaderboards).length
    ? storedDataset.leaderboards
    : buildLeaderboards(players, availableStats);
  const teamStats = teamPayloads.map(item => ({
    teamId:item.teamId,
    leagueId:item.leagueId,
    season:item.season,
    team:item.team,
    playerCount:Number(item.playerCount || item.players?.length || 0),
    usefulPlayerCount:Number(item.usefulPlayerCount || 0),
    updatedAt:item.updatedAt,
    cacheKey:item.cacheKey || '',
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
    availableStats,
    leaderboards,
    meta:{
      playerCount:players.length,
      teamCount:teams.length,
      cachedTeamCount:teamPayloads.length,
      updatedAt:Date.now(),
      source:'public-team-cache-aggregate',
      warning:players.length ? '' : 'Statistik ar inte uppdaterad annu.',
    }
  };
}

function normalizeStoredStatsResponse(league, data = {}){
  const players = dedupePlayers(Array.isArray(data.players) ? data.players : []).map(enrichPlayer);
  const availableStats = data.availableStats && Object.keys(data.availableStats).length
    ? data.availableStats
    : buildAvailableStats(players);
  return {
    ...data,
    year:data.year || league.seasonLabel,
    leagueKey:data.leagueKey || league.key,
    leagueId:data.leagueId || league.leagueId,
    seasonId:data.seasonId || league.seasonId,
    players,
    availableStats,
    leaderboards:data.leaderboards && Object.keys(data.leaderboards).length
      ? data.leaderboards
      : buildLeaderboards(players, availableStats),
    meta:{
      ...(data.meta || {}),
      playerCount:players.length,
      updatedAt:data.meta?.updatedAt || data.updatedAt || Date.now(),
    },
  };
}

export default async function handler(req, res){
  if(req.method !== 'GET') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
    const league = getLeagueConfig(req.query?.league || req.query?.leagueKey || req.query?.leagueId || 'allsvenskan');
    const teamId = Number(req.query?.team || req.query?.teamId || 0);
    const stored = teamId ? await readStatsStore(league, `team-${teamId}`) : await readStatsStore(league, 'dataset');
    if(!teamId){
      const teamPayloads = await listStoredTeamPayloads(league);
      if(teamPayloads.length){
        const dataset = buildDatasetFromTeams(league, stored?.data || null, teamPayloads);
        res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
        return res.status(200).json({
          ok:true,
          response:dataset,
          updatedAt:dataset.meta.updatedAt,
          league,
          teamId:null,
          keys:statsStoreKeys(league),
          aggregatedFromTeamCaches:true,
        });
      }
    }
    if(!stored?.data){
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      return res.status(200).json({
        ok:false,
        response:null,
        message:'Statistik ar inte uppdaterad annu.',
        league,
        teamId:teamId || null,
        keys:statsStoreKeys(league),
      });
    }
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
    const response = normalizeStoredStatsResponse(league, stored.data);
    return res.status(200).json({
      ok:true,
      response,
      updatedAt:stored.updatedAt || response?.meta?.updatedAt || response?.updatedAt || null,
      league,
      teamId:teamId || null,
      keys:statsStoreKeys(league),
    });
  } catch(error) {
    console.error('[public-stats]', error);
    return sendJson(res, 200, { ok:false, response:null, message:'Statistik kunde inte lasas just nu.', error:error.message });
  }
}
