import { ADMIN_LEAGUES, getAdminTeams, getStoredTeamStatus, readStatsStore, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  try {
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
    return sendJson(res, 200, { ok:true, leagues, meta:{ apiCalls, cacheEntries:null, staleFallback } });
  } catch(error) {
    console.error('[admin-cache-status]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Admin status failed', leagues:{}, meta:{ apiCalls:0, staleFallback:false } });
  }
}
