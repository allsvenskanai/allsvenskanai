const SEASONS = {
  allsvenskan: 26806,
  damallsvenskan: 26782
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isGoalType(row) {
  const type = row?.type || {};
  const raw = `${type.name || ""} ${type.code || ""} ${type.developer_name || ""}`.toLowerCase();
  return !raw || raw.includes("goal") || raw.includes("score");
}

function normalizeScorer(row) {
  const player = row?.player || {};
  const team = row?.participant || row?.team || {};

  return {
    playerId: player.id || row.player_id || null,
    playerName: clean(player.display_name || player.name || `${player.firstname || ""} ${player.lastname || ""}`) || "Okänd spelare",
    playerPhoto: player.image_path || player.photo || "",
    teamId: team.id || row.participant_id || null,
    teamName: clean(team.name) || "Okänt lag",
    teamLogo: team.image_path || team.logo_path || team.logo || "",
    goals: Number(row.total || 0),
    position: Number(row.position || 999)
  };
}

export default async function handler(req, res) {
  const league = String(req.query.league || "allsvenskan").toLowerCase();
  const seasonId = Number(req.query.season || SEASONS[league] || SEASONS.allsvenskan);
  const token = process.env.SPORTMONKS_API_TOKEN;
  const debug = req.query.debug === "1" || process.env.NODE_ENV !== "production";

  if (!token) {
    return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });
  }

  try {
    const url =
      `https://api.sportmonks.com/v3/football/topscorers/seasons/${encodeURIComponent(seasonId)}` +
      `?include=player;participant;type&per_page=50&order=asc`;
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
      console.log("TOPSCORERS RAW:", { league, seasonId, payload });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to load top scorers",
        details: payload?.message || payload?.error || text,
        league,
        seasonId
      });
    }

    const scorers = (Array.isArray(payload?.data) ? payload.data : [])
      .filter(isGoalType)
      .map(normalizeScorer)
      .filter((player) => player.goals > 0)
      .sort((a, b) => {
        if (b.goals !== a.goals) return b.goals - a.goals;
        return a.position - b.position;
      });

    if (debug) {
      console.log("TOPSCORERS TOP 3:", scorers.slice(0, 3));
    }

    return res.status(200).json({
      league,
      seasonId,
      data: scorers
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load top scorers",
      details: error.message,
      league,
      seasonId
    });
  }
}
