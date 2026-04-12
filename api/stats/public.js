import { getLeagueConfig, readStatsStore, sendJson, statsStoreKeys } from '../admin/cache/_shared.js';

export default async function handler(req, res){
  if(req.method !== 'GET') return sendJson(res, 405, { ok:false, error:'Method not allowed' });
  try {
    const league = getLeagueConfig(req.query?.league || req.query?.leagueKey || req.query?.leagueId || 'allsvenskan');
    const stored = await readStatsStore(league, 'dataset');
    if(!stored?.data){
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      return res.status(200).json({
        ok:false,
        response:null,
        message:'Statistik är inte uppdaterad ännu.',
        league,
        keys:statsStoreKeys(league),
      });
    }
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      ok:true,
      response:stored.data,
      updatedAt:stored.updatedAt || stored.data?.meta?.updatedAt || null,
      league,
      keys:statsStoreKeys(league),
    });
  } catch(error) {
    console.error('[public-stats]', error);
    return sendJson(res, 200, { ok:false, response:null, message:'Statistik kunde inte läsas just nu.', error:error.message });
  }
}
