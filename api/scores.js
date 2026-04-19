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

function normalizeScorer(row) {
  const player = row?.player || {};
  const team = row?.team || row?.participant || {};
  const value = row?.value || {};

  return {
    playerId: player.id || row.player_id || null,
    playerName: clean(player.display_name || player.name || `${player.firstname || ""} ${player.lastname || ""}`) || "Okänd spelare",
    playerPhoto: player.image_path || player.photo || "",
    teamId: team.id || row.team_id || row.participant_id || null,
    teamName: clean(team.name) || "Okänt lag",
    teamLogo: team.image_path || team.logo_path || team.logo || "",
    goals: numericValue(row.total, row.goals, value.total, value.goals, row.score),
    position: Number(row.position || 999)
  };
}

export default async function handler(req, res) {
  const league = String(req.query.league || "allsvenskan").toLowerCase();
  const seasonId = Number(req.query.season || SEASONS[league] || SEASONS.allsvenskan);
  const leagueId = LEAGUE_IDS[league] || LEAGUE_IDS.allsvenskan;
  const token = process.env.SPORTMONKS_API_TOKEN;
  const debug = req.query.debug === "1" || process.env.NODE_ENV !== "production";

  if (!token) {
    return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });
  }

  const params = new URLSearchParams({
    include: "player;team;type",
    filters: "seasonTopscorerTypes:208",
    per_page: "50",
    order: "asc"
  });
  const endpoint = `/football/topscorers/seasons/${encodeURIComponent(seasonId)}`;
  const url = `https://api.sportmonks.com/v3${endpoint}?${params.toString()}`;
  const requestDebug = {
    league,
    leagueId,
    seasonId,
    endpoint,
    query: Object.fromEntries(params.entries())
  };

  try {
    if (debug) {
      console.log("TOPSCORERS REQUEST:", requestDebug);
    }

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

    if (debug) {
      console.log("TOPSCORERS RAW:", { ...requestDebug, payload });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to load top scorers",
        details: payload?.message || payload?.error || text,
        ...requestDebug
      });
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

    if (debug) {
      console.log("TOPSCORERS MAPPED:", {
        rawCount: rawRows.length,
        mappedCount: scorers.length,
        top3: scorers.slice(0, 3)
      });
    }

    return res.status(200).json({
      league,
      leagueId,
      seasonId,
      data: scorers,
      debug: debug
        ? {
            ...requestDebug,
            rawCount: rawRows.length,
            mappedCount: scorers.length
          }
        : undefined
    });
  } catch (error) {
    console.error("TOPSCORERS ERROR:", { ...requestDebug, error });
    return res.status(500).json({
      error: "Failed to load top scorers",
      details: error.message,
      ...requestDebug
    });
  }
}
