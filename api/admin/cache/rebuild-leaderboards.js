import { getLeagueConfig, rebuildStoredLeagueDataset, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  if(req.method !== 'POST') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
    const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
    const result = await rebuildStoredLeagueDataset(league);
    return sendJson(res, 200, {
      ok:true,
      action:'rebuild-leaderboards',
      league,
      datasetMeta:result.dataset.meta,
      teamCount:result.dataset.teams.length,
      playerCount:result.dataset.players.length,
      apiCalls:result.apiCalls,
      staleFallback:result.staleFallback,
      note:'Public leaderboards rebuilt from persisted team caches.',
    });
  } catch(error) {
    console.error('[admin-rebuild-leaderboards]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Rebuild leaderboards failed', apiCalls:0 });
  }
}
