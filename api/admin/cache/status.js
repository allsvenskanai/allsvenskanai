import { ADMIN_LEAGUES, getAdminTeams, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  try {
    const leagues = {};
    let apiCalls = 0;
    let staleFallback = false;
    for(const league of Object.values(ADMIN_LEAGUES)){
      const result = await getAdminTeams(league);
      leagues[league.key] = { ...league, teams:result.teams };
      apiCalls += result.apiCalls;
      staleFallback = staleFallback || result.staleFallback;
    }
    return sendJson(res, 200, { ok:true, leagues, meta:{ apiCalls, cacheEntries:null, staleFallback } });
  } catch(error) {
    console.error('[admin-cache-status]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Admin status failed', leagues:{}, meta:{ apiCalls:0, staleFallback:false } });
  }
}
