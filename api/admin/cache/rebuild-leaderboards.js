import { getAdminTeams, getLeagueConfig, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  if(req.method !== 'POST') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
    const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
    const teamsResult = await getAdminTeams(league);
    return sendJson(res, 200, {
      ok:true,
      action:'rebuild-leaderboards',
      league,
      teamCount:teamsResult.teams.length,
      apiCalls:teamsResult.apiCalls,
      staleFallback:teamsResult.staleFallback,
      note:'Aggregerade leaderboards byggs i adminsidans browser-cache från befintliga team-cacher.',
    });
  } catch(error) {
    console.error('[admin-rebuild-leaderboards]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Rebuild leaderboards failed', apiCalls:0 });
  }
}
