export const LEAGUES = {
  allsvenskan: {
    key: 'allsvenskan',
    shortName: 'Herr',
    name: 'Allsvenskan Herr',
    publicName: 'Allsvenskan 2026',
    leagueId: 573,
    seasonId: 26806,
    seasonLabel: 2026,
  },
  damallsvenskan: {
    key: 'damallsvenskan',
    shortName: 'Dam',
    name: 'Allsvenskan Dam',
    publicName: 'Damallsvenskan 2026',
    leagueId: 576,
    seasonId: 26782,
    seasonLabel: 2026,
  },
};

export const DEFAULT_LEAGUE_KEY = 'allsvenskan';

export function getLeague(key = DEFAULT_LEAGUE_KEY){
  return LEAGUES[key] || LEAGUES[DEFAULT_LEAGUE_KEY];
}

export function listLeagues(){
  return Object.values(LEAGUES);
}

export function resolveLeagueKey(value = ''){
  const normalized = String(value || '').toLowerCase();
  if(['herr', 'men', 'allsvenskan-herr', '573', '26806'].includes(normalized)) return 'allsvenskan';
  if(['dam', 'women', 'allsvenskan-dam', 'damallsvenskan', '576', '26782'].includes(normalized)) return 'damallsvenskan';
  return LEAGUES[normalized] ? normalized : DEFAULT_LEAGUE_KEY;
}
