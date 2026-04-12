const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';
const CACHE_VERSION = 'sportmonks-adapter:v3';
const cache = new Map();
const inFlight = new Map();
const resolvedSeasonCache = new Map();

const LEAGUE_CONFIG = {
  573: { key: 'allsvenskan', name: 'Allsvenskan', leagueId: 573, seasonId: 26806, seasonLabel: 2026 },
  576: { key: 'damallsvenskan', name: 'Damallsvenskan', leagueId: 576, seasonId: 26782, seasonLabel: 2026 },
  113: { key: 'allsvenskan', name: 'Allsvenskan', leagueId: 573, seasonId: 26806, seasonLabel: 2026 },
  549: { key: 'damallsvenskan', name: 'Damallsvenskan', leagueId: 576, seasonId: 26782, seasonLabel: 2026 },
};

function getToken(){ return process.env.SPORTMONKS_API_TOKEN; }

function getLeagueConfigByKey(keyOrId){
  const wanted = String(keyOrId || '').toLowerCase();
  return Object.values(LEAGUE_CONFIG).find(cfg =>
    cfg.key === wanted || String(cfg.leagueId) === wanted || cfg.name.toLowerCase() === wanted
  ) || LEAGUE_CONFIG[Number(keyOrId)] || LEAGUE_CONFIG[573];
}

function normalizeRequestParams(params = {}){
  const clean = { ...(params || {}) };
  if(clean.season !== undefined && clean.season_id === undefined){
    clean.season_id = clean.season;
    delete clean.season;
  }
  delete clean._endpoint;
  delete clean._force;
  delete clean.cacheBust;
  Object.keys(clean).forEach(key => {
    if(clean[key] === undefined || clean[key] === null || clean[key] === '') delete clean[key];
  });
  return clean;
}

function requestSeasonId(params = {}, leagueConfig = null){
  const seasonId = Number(params.season_id || params.season || 0);
  return seasonId || leagueConfig?.seasonId || LEAGUE_CONFIG[573].seasonId;
}

function getTTL(pathOrEndpoint, params = {}){
  const key = String(pathOrEndpoint || '').toLowerCase();
  const seasonId = Number(params.season_id || params.season || 0);
  const activeSeason = Object.values(LEAGUE_CONFIG).some(cfg => cfg.seasonId === seasonId) || !seasonId;
  if(key.includes('livescores') || key.includes('events') || key.includes('lineups')) return 30 * 1000;
  if(key.includes('fixtures')) return 5 * 60 * 1000;
  if(key.includes('standings')) return activeSeason ? 10 * 60 * 1000 : 6 * 60 * 60 * 1000;
  if(key.includes('players') || key.includes('statistics') || key.includes('topscorers')) return activeSeason ? 10 * 60 * 1000 : 12 * 60 * 60 * 1000;
  if(key.includes('teams') || key.includes('squads') || key.includes('seasons') || key.includes('leagues')) return 6 * 60 * 60 * 1000;
  if(key.includes('transfers')) return 24 * 60 * 60 * 1000;
  return 10 * 60 * 1000;
}

function stableParams(params = {}){
  return Object.keys(params).sort().reduce((acc, key) => {
    if(params[key] !== undefined && params[key] !== null && params[key] !== '') acc[key] = params[key];
    return acc;
  }, {});
}

async function sportmonks(path, params = {}, options = {}){
  const token = getToken();
  if(!token) throw new Error('SPORTMONKS_API_TOKEN saknas');

  const cleanParams = stableParams(params);
  const force = Boolean(options.force);
  const query = new URLSearchParams(cleanParams);
  query.set('api_token', token);

  const cleanPath = String(path || '').replace(/^\/+/, '');
  const url = `${SPORTMONKS_BASE_URL}/${cleanPath}?${query.toString()}`;
  const cacheKey = `${CACHE_VERSION}:${url.replace(token, 'TOKEN')}`;
  const cached = cache.get(cacheKey);
  const ttl = options.ttl ?? getTTL(cleanPath, cleanParams);

  if(!force && cached && cached.expiry > Date.now()) return cached.data;
  if(!force && inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const request = (async () => {
    try{
      const response = await fetch(url, { headers:{ accept:'application/json' } });
      const data = await response.json().catch(() => ({}));
      if(!response.ok){
        const err = new Error(data?.message || data?.error || `Sportmonks HTTP ${response.status}`);
        err.status = response.status;
        err.payload = data;
        throw err;
      }
      cache.set(cacheKey, { data, expiry: Date.now() + ttl });
      return data;
    }catch(err){
      if(cached?.data){
        console.warn('[sportmonks] using stale cache after failed request', { path:cleanPath, error:err.message });
        return cached.data;
      }
      throw err;
    }finally{
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, request);
  return request;
}

async function sportmonksPaged(path, params = {}, options = {}){
  const perPage = Number(params.per_page || 50);
  let page = Number(params.page || 1);
  const rows = [];
  let pagination = null;
  while(true){
    const data = await sportmonks(path, { ...params, per_page:perPage, page }, options);
    const chunk = Array.isArray(data?.data) ? data.data : (data?.data ? [data.data] : []);
    rows.push(...chunk);
    pagination = data?.pagination || data?.meta?.pagination || data?.meta || {};
    const current = Number(pagination?.current_page || page);
    const total = Number(pagination?.total_pages || pagination?.last_page || current);
    const hasMore = Boolean(pagination?.has_more) || current < total;
    if(!options.fetchAllPages || !hasMore) break;
    page += 1;
  }
  return { data:rows, pagination };
}

async function resolveLeagueSeason(leagueId, seasonId){
  const cfg = getLeagueConfigByKey(leagueId);
  const resolvedSeasonId = requestSeasonId({ season_id:seasonId }, cfg);
  const key = `${cfg.leagueId}:${resolvedSeasonId}`;
  if(resolvedSeasonCache.has(key)) return resolvedSeasonCache.get(key);
  const resolved = { key:cfg.key, name:cfg.name, leagueId:cfg.leagueId, seasonId:resolvedSeasonId, seasonLabel:cfg.seasonLabel };
  resolvedSeasonCache.set(key, resolved);
  return resolved;
}

async function getSeasonIdForLeague(leagueKey){ return getLeagueConfigByKey(leagueKey).seasonId; }

function normalizeToken(value = ''){
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function valueNumber(value, preferredKey = ''){
  if(value === null || value === undefined || value === '') return 0;
  if(typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if(typeof value === 'object'){
    if(preferredKey && value[preferredKey] !== undefined) return valueNumber(value[preferredKey]);
    if(value.total !== undefined) return valueNumber(value.total);
    if(value.count !== undefined) return valueNumber(value.count);
    if(value.goals !== undefined) return valueNumber(value.goals);
    if(value.average !== undefined) return valueNumber(value.average);
    if(value.value !== undefined) return valueNumber(value.value);
  }
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function detailValue(details = [], names = [], preferredKey = ''){
  const wanted = names.map(normalizeToken);
  const rows = (Array.isArray(details) ? details : []).filter(detail => {
    const tokens = [detail?.type?.code, detail?.type?.name, detail?.type?.developer_name, detail?.name, detail?.code, detail?.type_id].map(normalizeToken);
    return tokens.some(token => wanted.some(want => token === want || token.includes(want)));
  });
  return rows.reduce((sum, row) => sum + valueNumber(row?.value ?? row?.total ?? row?.count, preferredKey), 0);
}

function detailSubValue(details = [], names = [], key = ''){
  const wanted = names.map(normalizeToken);
  const row = (Array.isArray(details) ? details : []).find(detail => {
    const tokens = [detail?.type?.code, detail?.type?.name, detail?.type?.developer_name, detail?.name, detail?.code, detail?.type_id].map(normalizeToken);
    return tokens.some(token => wanted.some(want => token === want || token.includes(want)));
  });
  return valueNumber(row?.value, key);
}

function logo(entity = {}){ return entity.image_path || entity.logo_path || entity.logo || ''; }

function normalizeTeam(team = {}){
  return {
    id: team.id,
    name: team.name || team.short_code || team.code || 'Lag',
    code: team.short_code || team.code || '',
    country: team.country_id || '',
    founded: team.founded || null,
    national: false,
    logo: logo(team),
  };
}

function playerName(player = {}){
  return player.display_name || player.common_name || player.name || [player.firstname, player.lastname].filter(Boolean).join(' ') || 'Spelare';
}

function normalizePosition(value = ''){
  const raw = normalizeToken(value);
  if(raw.includes('goal')) return 'Goalkeeper';
  if(raw.includes('def')) return 'Defender';
  if(raw.includes('mid')) return 'Midfielder';
  if(raw.includes('attack') || raw.includes('forward') || raw.includes('striker')) return 'Attacker';
  return value || '';
}

function scoreValue(scores = [], participantId, description = 'CURRENT'){
  const rows = Array.isArray(scores) ? scores : [];
  const exact = rows.find(score => Number(score?.participant_id) === Number(participantId) && String(score?.description || '').toUpperCase() === description);
  const any = rows.find(score => Number(score?.participant_id) === Number(participantId));
  return Number(exact?.score?.goals ?? exact?.score ?? any?.score?.goals ?? any?.score ?? 0);
}

function fixtureParticipants(fixture = {}){
  const participants = Array.isArray(fixture.participants) ? fixture.participants : [];
  const home = participants.find(item => item?.meta?.location === 'home') || participants[0] || {};
  const away = participants.find(item => item?.meta?.location === 'away') || participants[1] || {};
  return { home, away };
}

function fixtureFinished(fixture = {}){
  const state = normalizeToken(fixture.state?.short_name || fixture.state?.name || fixture.fixture?.status?.short || '');
  return Boolean(fixture.result_info) || ['ft', 'aet', 'pen', 'finished', 'after extra time'].some(token => state.includes(token));
}

function normalizeFixture(fixture = {}){
  const { home, away } = fixtureParticipants(fixture);
  const homeScore = fixture.home_score ?? scoreValue(fixture.scores, home.id);
  const awayScore = fixture.away_score ?? scoreValue(fixture.scores, away.id);
  const finished = fixtureFinished(fixture);
  const state = String(fixture.state?.short_name || fixture.state?.name || '').toUpperCase();
  return {
    fixture: {
      id: fixture.id,
      referee: fixture.referee || null,
      timezone: 'UTC',
      date: fixture.starting_at || '',
      timestamp: fixture.starting_at_timestamp || null,
      periods: {},
      venue: fixture.venue ? { id:fixture.venue.id, name:fixture.venue.name, city:fixture.venue.city_name || fixture.venue.city || '' } : {},
      status: { long: fixture.state?.name || fixture.result_info || '', short: finished ? 'FT' : (state || 'NS'), elapsed: fixture.length || null },
    },
    league: { id: fixture.league_id, season: fixture.season_id, round: fixture.round?.name || '' },
    teams: {
      home: { ...normalizeTeam(home), winner: finished ? homeScore > awayScore : null },
      away: { ...normalizeTeam(away), winner: finished ? awayScore > homeScore : null },
    },
    goals: { home: homeScore, away: awayScore },
    score: { fulltime: { home: homeScore, away: awayScore } },
    _sportmonks: fixture,
  };
}

async function getRegularSeasonStage(seasonId, options = {}){
  const raw = await sportmonks(`seasons/${seasonId}`, { include:'stages' }, options);
  const stages = Array.isArray(raw?.data?.stages) ? raw.data.stages : [];
  const regular = stages.find(stage => normalizeToken(stage?.type?.name || stage?.type || stage?.type_name) === 'league')
    || stages.find(stage => normalizeToken(stage?.name).includes('regular season'))
    || stages.find(stage => normalizeToken(stage?.type?.name || stage?.type || stage?.type_name).includes('league'))
    || stages[0]
    || null;
  if(!regular?.id) console.warn('[sportmonks-adapter] regular season stage missing', { seasonId, stageCount:stages.length });
  return regular;
}

async function getStandingsForSeason(seasonId, options = {}){
  const [stage, raw] = await Promise.all([
    getRegularSeasonStage(seasonId, options).catch(err => {
      console.warn('[sportmonks-adapter] stage lookup failed', { seasonId, error:err.message });
      return null;
    }),
    sportmonks(`standings/seasons/${seasonId}`, { include:'participant;details.type;form;stage', ...(options.params || {}) }, options),
  ]);
  const rows = Array.isArray(raw?.data) ? raw.data : [];
  const stageId = Number(stage?.id || 0);
  const filtered = stageId ? rows.filter(row => Number(row?.stage_id || row?.stage?.id || row?.stage?.data?.id || 0) === stageId) : rows;
  return { raw, stage, rows: filtered.length ? filtered : rows };
}

async function getFixturesForSeason(seasonId, extraFilters = {}, options = {}){
  const filters = ['fixtureSeasons:' + seasonId, extraFilters.stageId ? 'fixtureStages:' + extraFilters.stageId : '', extraFilters.filters || ''].filter(Boolean).join(';');
  return sportmonksPaged('fixtures', {
    include: extraFilters.include || 'participants;league;season;round;venue;state;scores',
    filters,
    per_page: extraFilters.per_page || 50,
  }, { ...options, fetchAllPages: options.fetchAllPages !== false });
}

async function getTeamById(teamId, include = [], options = {}){
  const includeParam = Array.isArray(include) ? include.filter(Boolean).join(';') : include;
  return sportmonks('teams/' + teamId, includeParam ? { include: includeParam } : {}, options);
}

async function getTeamSquadBySeason(teamId, seasonId, options = {}){
  // Sportmonks docs: /football/squads/seasons/{seasonID}/teams/{teamID}
  return sportmonks(`squads/seasons/${seasonId}/teams/${teamId}`, { include:'player;team;position;details.type' }, options);
}

async function getTeamSeasonStatistics(teamId, seasonId, options = {}){
  // This endpoint may depend on plan/coverage. Callers fall back to standings if unavailable.
  return sportmonks(`statistics/seasons/${teamId}/${seasonId}`, { include:'details.type' }, options);
}

async function getPlayerById(playerId, include = [], options = {}){
  const includeParam = Array.isArray(include) ? include.filter(Boolean).join(';') : include;
  return sportmonks('players/' + playerId, includeParam ? { include: includeParam } : {}, options);
}

async function getPlayerSeasonStatistics(playerId, seasonId, options = {}){
  return sportmonks('players/' + playerId, {
    include:'statistics.details.type;position;detailedPosition;teams',
    filters:'playerStatisticSeasons:' + seasonId,
  }, options);
}

async function getFixtureById(fixtureId, include = [], options = {}){
  const includeParam = Array.isArray(include) ? include.filter(Boolean).join(';') : include;
  return sportmonks('fixtures/' + fixtureId, {
    include: includeParam || 'participants;league;season;round;venue;state;scores;events;lineups.details.type;statistics.details.type',
  }, options);
}

function normalizeStandingRow(row = {}){
  const team = row.participant || row.team || {};
  const details = row.details || [];
  const played = detailValue(details, ['played', 'matches played']) || valueNumber(row.overall?.games_played || row.all?.played);
  const win = detailValue(details, ['won', 'wins']) || valueNumber(row.overall?.won || row.all?.win);
  const draw = detailValue(details, ['draw', 'draws']) || valueNumber(row.overall?.draw || row.all?.draw);
  const lose = detailValue(details, ['lost', 'losses']) || valueNumber(row.overall?.lost || row.all?.lose);
  const goalsFor = detailValue(details, ['goals for', 'goals scored', 'goals_scored']) || valueNumber(row.overall?.goals_scored || row.all?.goals?.for);
  const goalsAgainst = detailValue(details, ['goals against', 'goals conceded', 'goals_conceded']) || valueNumber(row.overall?.goals_against || row.all?.goals?.against);
  const points = detailValue(details, ['points']) || valueNumber(row.points);
  return {
    rank: Number(row.position || row.rank || 0),
    team: normalizeTeam(team),
    points,
    goalsDiff: Number(row.goal_difference ?? row.goalsDiff ?? (goalsFor - goalsAgainst)),
    group: row.group?.name || '',
    form: String(row.form || ''),
    status: row.result || '',
    description: row.description || '',
    all: { played, win, draw, lose, goals:{ for:goalsFor, against:goalsAgainst } },
    home: row.home || { played:0, win:0, draw:0, lose:0, goals:{ for:0, against:0 } },
    away: row.away || { played:0, win:0, draw:0, lose:0, goals:{ for:0, against:0 } },
    update: row.updated_at || '',
    _sportmonks: row,
  };
}

function normalizeSquadPlayer(item = {}){
  const player = item.player || item;
  return {
    id: player.id || item.player_id,
    name: playerName(player),
    firstname: player.firstname || '',
    lastname: player.lastname || '',
    age: player.date_of_birth ? Math.max(0, new Date().getFullYear() - Number(String(player.date_of_birth).slice(0, 4))) : null,
    number: item.jersey_number || item.shirt_number || null,
    position: normalizePosition(item.position?.name || item.detailedPosition?.name || player.position?.name || ''),
    photo: logo(player),
  };
}

function normalizePlayerStat(item = {}, team = {}, league = {}, seasonId = null){
  const player = item.player || item;
  const stats = Array.isArray(item.statistics) ? item.statistics : (Array.isArray(player.statistics) ? player.statistics : []);
  const details = [
    ...(Array.isArray(item.details) ? item.details : []),
    ...stats.flatMap(stat => Array.isArray(stat.details) ? stat.details : []),
  ];
  const appearances = detailValue(details, ['appearances', 'appearance']);
  const starts = detailValue(details, ['lineups', 'starts', 'starting']);
  const minutes = detailValue(details, ['minutes played', 'minutes']);
  const goals = detailValue(details, ['goals']);
  const assists = detailValue(details, ['assists']);
  const yellow = detailValue(details, ['yellow cards', 'yellow card', 'yellowcards', 'yellow']);
  const red = detailValue(details, ['red cards', 'red card', 'redcards', 'red']);
  const saves = detailValue(details, ['saves']);
  const conceded = detailValue(details, ['goals conceded', 'conceded']);
  const rating = detailValue(details, ['rating', 'average rating'], 'average');
  const teamEntity = item.team || team || stats.find(stat => stat.team)?.team || {};
  return {
    player: {
      id: player.id || item.player_id,
      name: playerName(player),
      firstname: player.firstname || '',
      lastname: player.lastname || '',
      age: player.date_of_birth ? Math.max(0, new Date().getFullYear() - Number(String(player.date_of_birth).slice(0, 4))) : null,
      photo: logo(player),
    },
    statistics: [{
      team: normalizeTeam(teamEntity),
      league: { id: league.leagueId, name: league.name || '', season: seasonId || league.seasonId || '' },
      games: {
        appearences: appearances,
        appearances,
        lineups: starts,
        minutes,
        number: item.jersey_number || item.shirt_number || null,
        position: normalizePosition(item.position?.name || item.detailedPosition?.name || player.position?.name || ''),
        rating: rating || null,
      },
      substitutes: { in: detailSubValue(details, ['substitutions', 'substitution'], 'in'), out: detailSubValue(details, ['substitutions', 'substitution'], 'out'), bench: detailValue(details, ['bench']) },
      shots: { total: detailValue(details, ['shots total', 'shots']), on: detailValue(details, ['shots on target']) },
      goals: { total: goals, conceded, assists, saves },
      passes: { total: detailValue(details, ['passes']), key: detailValue(details, ['key passes']), accuracy: detailValue(details, ['pass accuracy'], 'average') },
      tackles: { total: detailValue(details, ['tackles']), blocks: detailValue(details, ['blocks']), interceptions: detailValue(details, ['interceptions']) },
      duels: { total: detailValue(details, ['duels total', 'duels']), won: detailValue(details, ['duels won']) },
      dribbles: { attempts: detailValue(details, ['dribbles attempts']), success: detailValue(details, ['dribbles success']) },
      fouls: { drawn: detailValue(details, ['fouls drawn']), committed: detailValue(details, ['fouls committed']) },
      cards: { yellow, red },
      penalty: { won: detailValue(details, ['penalty won']), commited: detailValue(details, ['penalty committed']), scored: detailValue(details, ['penalty scored']), missed: detailValue(details, ['penalty missed']), saved: detailValue(details, ['penalty saved']) },
    }],
    _sportmonks: item,
    _statsFallback: !details.length,
  };
}

function normalizeTeamStatistics(stats = {}, standingRow = null){
  const row = standingRow ? normalizeStandingRow(standingRow) : null;
  return {
    fixtures: {
      played: { total: row?.all?.played || 0, home: row?.home?.played || 0, away: row?.away?.played || 0 },
      wins: { total: row?.all?.win || 0, home: row?.home?.win || 0, away: row?.away?.win || 0 },
      draws: { total: row?.all?.draw || 0, home: row?.home?.draw || 0, away: row?.away?.draw || 0 },
      loses: { total: row?.all?.lose || 0, home: row?.home?.lose || 0, away: row?.away?.lose || 0 },
    },
    goals: {
      for: { total:{ total: row?.all?.goals?.for || 0, home: row?.home?.goals?.for || 0, away: row?.away?.goals?.for || 0 }, average:{ total: row?.all?.played ? String((row.all.goals.for / row.all.played).toFixed(2)) : '0' }, minute:{} },
      against: { total:{ total: row?.all?.goals?.against || 0, home: row?.home?.goals?.against || 0, away: row?.away?.goals?.against || 0 }, average:{ total: row?.all?.played ? String((row.all.goals.against / row.all.played).toFixed(2)) : '0' }, minute:{} },
    },
    clean_sheet: { total: detailValue(stats.details || [], ['clean sheets']) },
    failed_to_score: { total: detailValue(stats.details || [], ['failed to score']) },
    _sportmonks: stats,
  };
}

function emptyResponse(extra = {}){ return { response: [], paging:{ current:1, total:1 }, ...extra }; }

async function safeEndpoint(name, fn, fallback = emptyResponse()){
  try{
    return await fn();
  }catch(err){
    console.warn(`[sportmonks-adapter] ${name} failed`, { error: err.message, details: err.payload || null });
    return fallback;
  }
}

async function handleStandings(params, force){
  const league = await resolveLeagueSeason(params.league, params.season_id || params.season);
  const standings = await getStandingsForSeason(league.seasonId, { force });
  const rows = standings.rows.map(normalizeStandingRow).sort((a, b) => a.rank - b.rank);
  return {
    response: [{
      league: { id: league.leagueId, season_id: league.seasonId, stage_id: standings.stage?.id || null, name: league.name, season: league.seasonId, standings: [rows] },
    }],
  };
}

async function handleTeams(params, force){
  if(params.id){
    const raw = await getTeamById(params.id, 'venue', { force });
    return { response: raw?.data ? [{ team: normalizeTeam(raw.data), venue: raw.data.venue || {} }] : [] };
  }
  const league = await resolveLeagueSeason(params.league, params.season_id || params.season);
  const raw = await sportmonksPaged(`teams/seasons/${league.seasonId}`, { include:'venue', per_page:50 }, { force, fetchAllPages:true });
  return { response: raw.data.map(team => ({ team: normalizeTeam(team), venue: team.venue || {} })) };
}

async function handleFixtures(params, force){
  if(params.id){
    const raw = await getFixtureById(params.id, 'participants;league;season;round;venue;state;scores;events;lineups.details.type;statistics.details.type', { force });
    return { response: raw?.data ? [normalizeFixture(raw.data)] : [] };
  }
  const league = params.league ? await resolveLeagueSeason(params.league, params.season_id || params.season) : null;
  const stage = league?.seasonId ? await getRegularSeasonStage(league.seasonId, { force }).catch(() => null) : null;
  const raw = league?.seasonId
    ? await getFixturesForSeason(league.seasonId, { stageId: stage?.id || null, filters: params.team ? `fixtureTeams:${params.team}` : '' }, { force, fetchAllPages:true })
    : await sportmonksPaged('fixtures', { include:'participants;league;season;round;venue;state;scores', per_page:50 }, { force, fetchAllPages:true });
  let fixtures = raw.data.map(normalizeFixture);
  if(params.last) fixtures = fixtures.filter(f => f.fixture.status.short === 'FT').sort((a,b) => String(b.fixture.date).localeCompare(String(a.fixture.date))).slice(0, Number(params.last));
  if(params.next) fixtures = fixtures.filter(f => f.fixture.status.short !== 'FT').sort((a,b) => String(a.fixture.date).localeCompare(String(b.fixture.date))).slice(0, Number(params.next));
  return { response: fixtures, paging:{ current:1, total:1 } };
}

async function handleSquad(params, force){
  if(!params.team) return emptyResponse();
  const league = await resolveLeagueSeason(params.league, params.season_id || params.season);
  const raw = await getTeamSquadBySeason(params.team, league.seasonId, { force });
  return { response: [{ team:{ id:Number(params.team) }, players:(raw?.data || []).map(normalizeSquadPlayer) }] };
}

async function handlePlayers(params, force){
  const league = await resolveLeagueSeason(params.league || 573, params.season_id || params.season);
  if(params.id){
    const raw = await getPlayerSeasonStatistics(params.id, league.seasonId, { force });
    const player = raw?.data || {};
    const team = Array.isArray(player.teams) ? player.teams[0] : {};
    return { response: player?.id ? [normalizePlayerStat(player, team, league, league.seasonId)] : [], paging:{ current:1, total:1 } };
  }
  if(params.team){
    const squad = await getTeamSquadBySeason(params.team, league.seasonId, { force });
    const team = normalizeTeam(squad?.data?.find(item => item?.team)?.team || { id:params.team });
    return { response:(squad?.data || []).map(item => normalizePlayerStat(item, team, league, league.seasonId)), paging:{ current:1, total:1 } };
  }
  const raw = await sportmonksPaged('players', {
    include:'statistics.details.type;position;detailedPosition',
    filters:'playerStatisticSeasons:' + league.seasonId,
    per_page:50,
  }, { force, fetchAllPages:true });
  let players = raw.data.map(item => normalizePlayerStat(item, {}, league, league.seasonId));
  if(params.search){
    const q = String(params.search).toLowerCase();
    players = players.filter(item => String(item.player?.name || '').toLowerCase().includes(q));
  }
  return { response: players, paging:{ current:1, total:1 } };
}

async function handlePlayerProfile(params, force){
  const playerId = params.player || params.id;
  if(!playerId) return emptyResponse();
  const raw = await getPlayerById(playerId, 'position;detailedPosition;statistics.details.type;teams', { force });
  const player = raw?.data || {};
  return {
    response: player?.id ? [{
      player: { id:player.id, name:playerName(player), firstname:player.firstname || '', lastname:player.lastname || '', age:null, photo:logo(player), nationality:player.nationality || '' },
      statistics: [],
      _sportmonks: player,
    }] : [],
  };
}

async function handleTeamStatistics(params, force){
  const league = await resolveLeagueSeason(params.league, params.season_id || params.season);
  const standings = await getStandingsForSeason(league.seasonId, { force, params:{ include:'participant;details.type;stage' } });
  const row = (standings.rows || []).find(item => Number(item?.participant?.id) === Number(params.team));
  const seasonStats = await getTeamSeasonStatistics(params.team, league.seasonId, { force }).catch(err => {
    console.warn('[sportmonks-adapter] team season statistics unavailable; standings fallback used', { teamId:params.team, seasonId:league.seasonId, error:err.message });
    return { data: [] };
  });
  const stats = Array.isArray(seasonStats?.data) ? seasonStats.data[0] || {} : seasonStats?.data || {};
  return { response: normalizeTeamStatistics(stats, row) };
}

async function handleTopScorers(params, force){
  const league = await resolveLeagueSeason(params.league || 573, params.season_id || params.season);
  const raw = await sportmonks(`topscorers/seasons/${league.seasonId}`, { include:'participant;type;player;team' }, { force });
  const rows = Array.isArray(raw?.data) ? raw.data : [];
  return { response: rows.map(row => {
    const player = row.player || row.participant || {};
    const normalized = normalizePlayerStat(player, row.team || {}, league, league.seasonId);
    const typeName = normalizeToken(row?.type?.name || row?.type?.developer_name || '');
    if(typeName.includes('assist')) normalized.statistics[0].goals.assists = Number(row.total || 0);
    else if(typeName.includes('card')) normalized.statistics[0].cards.yellow = Number(row.total || 0);
    else normalized.statistics[0].goals.total = Number(row.total || 0);
    return normalized;
  }) };
}

async function handleFixtureChild(endpoint, params, force){
  const fixtureId = params.fixture || params.id;
  if(!fixtureId) return emptyResponse();
  const includeMap = {
    'fixtures/events': 'events.type;participants',
    'fixtures/lineups': 'lineups.player;lineups.team;lineups.position;lineups.details.type;participants',
    'fixtures/players': 'lineups.player;lineups.team;lineups.details.type;participants',
    'fixtures/statistics': 'statistics.details.type;participants',
  };
  const raw = await getFixtureById(fixtureId, includeMap[endpoint] || 'participants', { force });
  const fixture = raw?.data || {};
  if(endpoint === 'fixtures/events') return { response: fixture.events || [] };
  if(endpoint === 'fixtures/lineups') return { response: fixture.lineups || [] };
  if(endpoint === 'fixtures/players') return { response: fixture.lineups || [] };
  if(endpoint === 'fixtures/statistics') return { response: fixture.statistics || [] };
  return emptyResponse();
}

async function routeEndpoint(endpoint, params, force){
  switch(endpoint){
    case 'standings':
      return safeEndpoint(endpoint, () => handleStandings(params, force));
    case 'teams':
      return safeEndpoint(endpoint, () => handleTeams(params, force));
    case 'teams/statistics':
      return safeEndpoint(endpoint, () => handleTeamStatistics(params, force), { response: normalizeTeamStatistics({}, null) });
    case 'fixtures':
      return safeEndpoint(endpoint, () => handleFixtures(params, force));
    case 'players':
      return safeEndpoint(endpoint, () => handlePlayers(params, force));
    case 'players/squads':
      return safeEndpoint(endpoint, () => handleSquad(params, force));
    case 'players/profiles':
      return safeEndpoint(endpoint, () => handlePlayerProfile(params, force));
    case 'players/topscorers':
      return safeEndpoint(endpoint, () => handleTopScorers(params, force));
    case 'fixtures/lineups':
    case 'fixtures/events':
    case 'fixtures/statistics':
    case 'fixtures/players':
      return safeEndpoint(endpoint, () => handleFixtureChild(endpoint, params, force));
    case 'transfers':
      return { response: [] };
    default:
      console.warn('[sportmonks-adapter] unsupported endpoint', { endpoint });
      return { response: [] };
  }
}

export default async function handler(req, res){
  if(req.method !== 'GET'){
    return res.status(405).json({ error:'Method not allowed' });
  }

  if(!getToken()){
    return res.status(500).json({ error:'SPORTMONKS_API_TOKEN saknas' });
  }

  const endpoint = String(req.query._endpoint || '').trim();
  if(!endpoint){
    return res.status(400).json({ error:'Missing _endpoint', response:[] });
  }

  const params = normalizeRequestParams(req.query);
  const force = req.query._force === '1' || Boolean(req.query.cacheBust);
  const cacheKey = `${CACHE_VERSION}:adapter:${endpoint}:${JSON.stringify(stableParams(params))}`;
  const cached = cache.get(cacheKey);

  if(!force && cached && cached.expiry > Date.now()){
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached.data);
  }

  if(!force && inFlight.has(cacheKey)){
    const data = await inFlight.get(cacheKey);
    res.setHeader('X-Cache', 'DEDUPED');
    return res.status(200).json(data);
  }

  const request = routeEndpoint(endpoint, params, force);
  inFlight.set(cacheKey, request);

  try{
    const data = await request;
    cache.set(cacheKey, { data, expiry: Date.now() + getTTL(endpoint, params) });
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  }catch(err){
    console.error('[sportmonks-adapter] fatal handler error', { endpoint, params, error:err.message, details:err.payload || null });
    if(cached?.data){
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(cached.data);
    }
    return res.status(200).json({ response: [], error: err.message || 'Sportmonks adapter error' });
  }finally{
    inFlight.delete(cacheKey);
  }
}
