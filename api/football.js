const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';

function getToken() {
  return process.env.SPORTMONKS_API_TOKEN;
}

// ===============================
// CORE FETCH
// ===============================
async function sportmonks(path, params = {}) {
  const token = getToken();
  if (!token) throw new Error('SPORTMONKS_API_TOKEN saknas');

  const qs = new URLSearchParams(params);
  qs.set('api_token', token);

  const url = `${SPORTMONKS_BASE_URL}/${path}?${qs.toString()}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    console.error('Sportmonks error:', data);
    throw new Error(data?.message || 'API error');
  }

  return data;
}

// ===============================
// FIX 1: HÄMTA AKTIV SÄSONG
// ===============================
async function getCurrentSeasonId(leagueId) {
  const res = await sportmonks(`leagues/${leagueId}`, {
    include: 'seasons'
  });

  const seasons = res?.data?.seasons || [];

  // hitta aktiv säsong
  const current =
    seasons.find(s => s.is_current) ||
    seasons.sort((a, b) => b.year - a.year)[0];

  if (!current) throw new Error('Ingen säsong hittades');

  return current.id;
}

// ===============================
// STANDINGS (FIXAD)
// ===============================
async function getStandings(leagueId) {
  const seasonId = await getCurrentSeasonId(leagueId);

  const res = await sportmonks(`standings/seasons/${seasonId}`, {
    include: 'participant;details.type'
  });

  return {
    seasonId,
    data: res.data
  };
}

// ===============================
// FIX 2: RIKTIG TEAM STATISTIK
// ===============================
async function getTeamStats(teamId, leagueId) {
  const seasonId = await getCurrentSeasonId(leagueId);

  const res = await sportmonks(`teams/${teamId}`, {
    include: `statistics.season.${seasonId}`
  });

  return res.data;
}

// ===============================
// FIX 3: RIKTIG SPELARSTATISTIK
// ===============================
async function getPlayersByTeam(teamId, leagueId) {
  const seasonId = await getCurrentSeasonId(leagueId);

  const res = await sportmonks(`players`, {
    filters: `team_id:${teamId};season_id:${seasonId}`,
    include: 'statistics.details.type;team'
  });

  return res.data;
}

// ===============================
// EXPORTS
// ===============================
export async function handleStandings(req) {
  const leagueId = Number(req.query.league);

  const { seasonId, data } = await getStandings(leagueId);

  return {
    season: seasonId,
    standings: data
  };
}

export async function handleTeam(req) {
  const teamId = Number(req.query.team);
  const leagueId = Number(req.query.league);

  const stats = await getTeamStats(teamId, leagueId);

  return stats;
}

export async function handlePlayers(req) {
  const teamId = Number(req.query.team);
  const leagueId = Number(req.query.league);

  const players = await getPlayersByTeam(teamId, leagueId);

  return players;
}
