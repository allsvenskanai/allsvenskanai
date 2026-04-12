import { clearAdminCache, requireAdmin, readJsonBody, sendJson } from './_shared.js';

export default async function handler(req, res){
  const body = await readJsonBody(req);
  if(!requireAdmin(req, res, body)) return;
  if(req.method !== 'POST') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
    const cleared = clearAdminCache(body.scope || 'all');
    return sendJson(res, 200, { ok:true, action:'clear', scope:body.scope || 'all', cleared });
  } catch(error) {
    console.error('[admin-clear]', error);
    return sendJson(res, 200, { ok:false, error:error.message || 'Clear cache failed' });
  }
}
