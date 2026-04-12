import {
  ADMIN_LEAGUES,
  clearAdminCache,
  clearStatsStore,
  getAdminTeams,
  getLeagueConfig,
  getStoredTeamStatus,
  readJsonBody,
  readStatsStore,
  rebuildStoredLeagueDataset,
  refreshStoredTeamStats,
  requireAdmin,
  sendJson,
} from '../lib/admin-stats-shared.js';

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
      results.push({ teamId:team.id, ok:true, playerCount:result.payload.playerCount, usefulPlayerCount:result.payload.usefulPlayerCount });
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
      results.push({ teamId:team.id, ok:true, playerCount:result.payload.playerCount });
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
      results.push({ teamId:team.id, ok:true, playerCount:result.payload.playerCount, usefulPlayerCount:result.payload.usefulPlayerCount });
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

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  const action = String(req.query?.action || body.action || '').trim();
  try {
    if(req.method !== 'POST' && action !== 'status') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
    const payload =
      action === 'status' ? await statusAction(body) :
      action === 'refresh-team' ? await refreshTeamAction(body) :
      action === 'refresh-league' ? await refreshLeagueAction(body) :
      action === 'refresh-recent' ? await refreshRecentAction(body) :
      action === 'rebuild-leaderboards' ? await rebuildLeaderboardsAction(body) :
      action === 'rebuild-player-stats' ? await rebuildPlayerStatsAction(body) :
      action === 'clear' ? await clearAction(body) :
      { ok:false, error:`Unknown admin action: ${action || '(missing)'}` };
    return sendJson(res, payload.ok === false ? 400 : 200, payload);
  } catch(error) {
    console.error('[admin]', { action, error:error.message });
    return sendJson(res, 200, { ok:false, action, error:error.message || 'Admin action failed', apiCalls:0 });
  }
}
