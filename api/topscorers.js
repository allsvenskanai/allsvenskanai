const SEASONS = {
  allsvenskan: 26806,
  damallsvenskan: 26782
};

const LEAGUE_IDS = {
  allsvenskan: 573,
  damallsvenskan: 576
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isGoalType(row) {
  const type = row?.type || {};
  const raw = `${type.name || ""} ${type.code || ""} ${type.developer_name || ""}`.toLowerCase();
  return Number(row?.type_id) === 208 || raw.includes("goal") || raw.includes("score");
}

function numericValue(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function unwrap(entity) {
  return entity?.data || entity || {};
}

function normalizeScorer(row) {
  const player = unwrap(row?.player);
  const team = unwrap(row?.participant || row?.team);
  const value = row?.value || {};

  return {
    playerId: player.id || row.player_id || null,
    playerName:
      clean(
        player.display_name ||
          player.common_name ||
          player.name ||
          `${player.firstname || ""} ${player.lastname || ""}`
      ) || "Okänd spelare",
    playerPhoto: player.image_path || player.photo || "",
    teamId: team.id || row.participant_id || row.team_id || null,
    teamName: clean(team.name || team.short_code) || "Okänt lag",
    teamLogo: team.image_path || team.logo_path || team.logo || "",
    goals: numericValue(row.total, row.goals, value.total, value.goals, row.score),
    position: Number(row.position || 999)
  };
}

async function fetchSportmonksJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: token
    }
  });
  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  return { response, text, payload };
}

function emptyTopScorers({ league, leagueId, seasonId, warning, status = 200 }) {
  return {
    status,
    body: {
      league,
      leagueId,
      seasonId,
      data: [],
      warnings: [warning]
    }
  };
}

export default async function handler(req, res) {
  const league = String(req.query.league || "allsvenskan").toLowerCase();
  const seasonId = Number(req.query.season || SEASONS[league] || SEASONS.allsvenskan);
  const leagueId = LEAGUE_IDS[league] || LEAGUE_IDS.allsvenskan;
  const token = process.env.SPORTMONKS_API_TOKEN;
  const debug = req.query.debug === "1" || process.env.NODE_ENV !== "production";

  if (!token) {
    console.warn("TOPSCORERS MISSING SPORTMONKS_API_TOKEN", { league, leagueId, seasonId });
    const fallback = emptyTopScorers({
      league,
      leagueId,
      seasonId,
      warning: "SPORTMONKS_API_TOKEN saknas på servern."
    });
    return res.status(fallback.status).json(fallback.body);
  }

  const params = new URLSearchParams({
    include: "player;participant;type",
    filters: "seasonTopscorerTypes:208",
    per_page: "50",
    order: "desc"
  });
  const endpoint = `/football/topscorers/seasons/${encodeURIComponent(seasonId)}`;
  const baseUrl = `https://api.sportmonks.com/v3${endpoint}`;
  const requestDebug = {
    league,
    leagueId,
    seasonId,
    endpoint,
    fullUrl: `${baseUrl}?${params.toString()}`,
    query: Object.fromEntries(params.entries())
  };

  try {
    if (debug) console.log("TOPSCORERS REQUEST:", requestDebug);

    let url = `${baseUrl}?${params.toString()}`;
    let { response, text, payload } = await fetchSportmonksJson(url, token);

    if (debug) {
      console.log("TOPSCORERS RAW RESPONSE:", {
        ...requestDebug,
        status: response.status,
        ok: response.ok,
        rawText: text,
        payload
      });
    }

    if (!response.ok && response.status < 500) {
      const fallbackParams = new URLSearchParams({
        include: "player;participant;type",
        per_page: "50",
        order: "desc"
      });
      url = `${baseUrl}?${fallbackParams.toString()}`;
      console.warn("TOPSCORERS RETRY WITHOUT FILTER:", {
        ...requestDebug,
        fallbackFullUrl: url,
        firstStatus: response.status,
        firstError: payload?.message || payload?.error || text
      });
      ({ response, text, payload } = await fetchSportmonksJson(url, token));
      requestDebug.query = Object.fromEntries(fallbackParams.entries());
      requestDebug.fullUrl = url;
    }

    if (!response.ok) {
      console.warn("TOPSCORERS HTTP ERROR, RETURNING EMPTY DATA:", {
        ...requestDebug,
        status: response.status,
        details: payload?.message || payload?.error || text
      });
      const fallback = emptyTopScorers({
        league,
        leagueId,
        seasonId,
        warning: "Skytteligan kunde inte hämtas just nu."
      });
      return res.status(fallback.status).json(fallback.body);
    }

    const rawRows = Array.isArray(payload?.data) ? payload.data : [];
    const scorers = rawRows
      .filter(isGoalType)
      .map(normalizeScorer)
      .filter((player) => player.goals > 0)
      .sort((a, b) => {
        if (b.goals !== a.goals) return b.goals - a.goals;
        return a.position - b.position;
      });

    return res.status(200).json({
      league,
      leagueId,
      seasonId,
      data: scorers,
      warnings: scorers.length ? [] : ["Ingen skytteligadata tillgänglig just nu."]
    });
  } catch (error) {
    console.error("TOPSCORERS THROWN ERROR, RETURNING EMPTY DATA:", {
      ...requestDebug,
      message: error?.message,
      stack: error?.stack
    });
    const fallback = emptyTopScorers({
      league,
      leagueId,
      seasonId,
      warning: "Skytteligan kunde inte hämtas just nu."
    });
    return res.status(fallback.status).json(fallback.body);
  }
}
