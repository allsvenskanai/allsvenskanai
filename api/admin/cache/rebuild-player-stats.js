import { getAdminTeams, getLeagueConfig, rebuildStoredLeagueDataset, refreshStoredTeamStats, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  if(req.method !== 'POST') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
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
    return sendJson(res, 200, {
      ok:true,
      action:'rebuild-player-stats',
      league,
      results,
      datasetMeta:rebuilt.dataset.meta,
      apiCalls:apiCalls + rebuilt.apiCalls,
      staleFallback:staleFallback || rebuilt.staleFallback,
      note:'Player stats rebuilt server-side and saved for public statistics.',
    });
  } catch(error) {
    console.error('[admin-rebuild-player-stats]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Rebuild player stats failed', apiCalls:0 });
  }
}
