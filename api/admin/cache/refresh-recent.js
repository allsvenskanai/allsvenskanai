import { getAdminTeams, getLeagueConfig, getStoredTeamStatus, rebuildStoredLeagueDataset, refreshStoredTeamStats, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  if(req.method !== 'POST') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
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
    return sendJson(res, 200, {
      ok:true,
      action:'refresh-recent',
      league,
      teams:staleTeams,
      results,
      datasetMeta:rebuilt.dataset.meta,
      apiCalls:apiCalls + rebuilt.apiCalls,
      staleFallback:staleFallback || rebuilt.staleFallback,
      note:'Saknade/stale lag uppdaterades server-side och public dataset byggdes om.',
    });
  } catch(error) {
    console.error('[admin-refresh-recent]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Refresh recent failed', apiCalls:0 });
  }
}
