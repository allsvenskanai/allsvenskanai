import { getAdminTeams, getLeagueConfig, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  if(req.method !== 'POST') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
    const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
    const teamsResult = await getAdminTeams(league, { force:Boolean(body.forceTeams) });
    const maxTeams = Math.max(1, Math.min(Number(body.limit || teamsResult.teams.length || 1), teamsResult.teams.length || 1));
    const teams = teamsResult.teams.slice(0, maxTeams);
    return sendJson(res, 200, {
      ok:true,
      action:'refresh-league',
      league,
      teams,
      apiCalls:teamsResult.apiCalls,
      staleFallback:teamsResult.staleFallback,
      cacheReused:teamsResult.apiCalls === 0,
      note:'Auktoriserad ligarefresh. Frontend refreshar team-cachen sekventiellt för att undvika dubbla API-anrop.',
    });
  } catch(error) {
    console.error('[admin-refresh-league]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Refresh league failed', apiCalls:0 });
  }
}
