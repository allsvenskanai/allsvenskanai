import { clearAdminCache, clearStatsStore, getLeagueConfig, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  if(req.method !== 'POST') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
    const scope = body.scope || 'all';
    const clearedMemory = clearAdminCache(scope);
    const clearedStore = scope === 'team'
      ? await clearStatsStore(getLeagueConfig(body.league || body.leagueKey || body.leagueId), `team-${Number(body.teamId || body.team || 0)}`)
      : scope === 'league'
      ? await clearStatsStore(getLeagueConfig(body.league || body.leagueKey || body.leagueId))
      : await clearStatsStore(null);
    return sendJson(res, 200, { ok:true, action:'clear', scope, cleared:{ memory:clearedMemory, store:clearedStore } });
  } catch(error) {
    console.error('[admin-clear]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Clear cache failed' });
  }
}
