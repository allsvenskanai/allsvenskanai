import { getLeagueConfig, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  if(req.method !== 'POST') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
    const league = getLeagueConfig(body.league || body.leagueKey || body.leagueId);
    const teamId = Number(body.teamId || body.team || 0);
    if(!teamId) return sendJson(res, 400, { ok:false, error:'teamId saknas' });
    return sendJson(res, 200, {
      ok:true,
      action:'refresh-team',
      league,
      teamId,
      apiCalls:0,
      staleFallback:false,
      cacheReused:true,
      note:'Auktoriserad team-refresh. Frontend uppdaterar browser-cachen via befintligt statistikflöde.',
    });
  } catch(error) {
    console.error('[admin-refresh-team]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Refresh team failed', apiCalls:0 });
  }
}
