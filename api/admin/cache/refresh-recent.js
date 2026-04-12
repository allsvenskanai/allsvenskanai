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
      action:'refresh-recent',
      league,
      teams:teamsResult.teams,
      apiCalls:teamsResult.apiCalls,
      staleFallback:teamsResult.staleFallback,
      note:'Frontend väljer lag med saknad/stale browser-cache och refreshar dem sekventiellt.',
    });
  } catch(error) {
    console.error('[admin-refresh-recent]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Refresh recent failed', apiCalls:0 });
  }
}
