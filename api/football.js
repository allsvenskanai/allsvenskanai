const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';

function getToken() {
  return process.env.SPORTMONKS_API_TOKEN;
}

// =========================
// FETCH
// =========================
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
    throw new Error(data?.message || `HTTP ${res.status}`);
  }

  return data;
}

// =========================
// AKTIV SÄSONG
// =========================
async function getCurrentSeasonId(leagueId) {
  const res = await sportmonks(`leagues/${leagueId}`, {
    include: 'seasons'
  });

  const seasons = res?.data?.seasons || [];

  const current =
    seasons.find(s => s.is_current) ||
    seasons.sort((a, b) => (b.year || 0) - (a.year || 0))[0];

  if (!current) throw new Error('Ingen säsong hittades');

  return current.id;
}

// =========================
// STANDINGS
// =========================
async function handleStandings(params) {
  const leagueId = Number(params.league);
  const seasonId = await getCurrentSeasonId(leagueId);

  const res = await sportmonks(`standings/seasons/${seasonId}`, {
    include: 'participant;details.type'
  });

  return {
    season: seasonId,
    data: res.data
  };
}

// =========================
// TEAM
// =========================
async function handleTeam(params) {
  const teamId = Number(params.team);
  const leagueId = Number(params.league);

  const seasonId = await getCurrentSeasonId(leagueId);

  const res = await sportmonks(`teams/${teamId}`, {
    include: `statistics.season.${seasonId}`
  });

  return res.data;
}

// =========================
// PLAYERS
// =========================
async function handlePlayers(params) {
  const teamId = Number(params.team);
  const leagueId = Number(params.league);

  const seasonId = await getCurrentSeasonId(leagueId);

  const res = await sportmonks(`players`, {
    filters: `team_id:${teamId};season_id:${seasonId}`,
    include: 'statistics.details.type;team'
  });

  return res.data;
}

// =========================
// MAIN HANDLER (DETTA FIXAR 500!!!)
// =========================
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const endpoint = String(req.query._endpoint || '').trim();

    if (!endpoint) {
      return res.status(400).json({ error: 'Missing _endpoint' });
    }

    const params = { ...req.query };
    delete params._endpoint;

    switch (endpoint) {
      case 'standings': {
        const data = await handleStandings(params);
        return res.status(200).json(data);
      }

      case 'team':
      case 'teams': {
        const data = await handleTeam(params);
        return res.status(200).json(data);
      }

      case 'players': {
        const data = await handlePlayers(params);
        return res.status(200).json(data);
      }

      default:
        return res.status(400).json({ error: `Unknown endpoint: ${endpoint}` });
    }

  } catch (err) {
    console.error('[API CRASH]', err);

    return res.status(500).json({
      error: err.message || 'Internal server error'
    });
  }
}
