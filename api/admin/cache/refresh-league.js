import { getAdminTeams, getLeagueConfig, rebuildStoredLeagueDataset, refreshStoredTeamStats, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  if(req.method !== 'POST') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
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
    return sendJson(res, 200, {
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
    });
  } catch(error) {
    console.error('[admin-refresh-league]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Refresh league failed', apiCalls:0 });
  }
}
