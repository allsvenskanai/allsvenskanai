const SEASONS = {
  allsvenskan: 26806,
  damallsvenskan: 26782
};

const LEAGUE_IDS = {
  allsvenskan: 573,
  damallsvenskan: 576
};

const CACHE_TTL = 10 * 60 * 1000;
const memoryCache = new Map();

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unwrap(entity) {
  return entity?.data || entity || {};
}

function numericValue(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function metricFromType(row) {
  const type = row?.type || {};
  const raw = `${type.name || ""} ${type.code || ""} ${type.developer_name || ""} ${row?.type_id || ""}`
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (Number(row?.type_id) === 208 || raw.includes("goal") || raw.includes("score")) return "goals";
  if (raw.includes("assist")) return "assists";
  if (raw.includes("yellow")) return "yellowCards";
  if (raw.includes("red")) return "redCards";
  if (raw.includes("clean")) return "cleanSheets";
  if (raw.includes("minute")) return "minutes";
  if (raw.includes("save")) return "saves";
  return "";
}

function metricLabel(metric) {
  return {
    goals: "Mål",
    assists: "Assist",
    yellowCards: "Gula kort",
    redCards: "Röda kort",
    cleanSheets: "Nollor",
    minutes: "Minuter",
    saves: "Räddningar"
  }[metric] || metric;
}

function normalizePosition(player) {
  const position = unwrap(player?.position);
  const raw = clean(position.name || position.developer_name || position.code || player?.position_name);
  const lower = raw.toLowerCase();
  if (!raw) return "";
  if (lower.includes("goal") || lower.includes("keeper") || lower === "gk") return "Målvakt";
  if (lower.includes("def") || lower.includes("back")) return "Försvarare";
  if (lower.includes("mid") || lower.includes("cm") || lower.includes("dm") || lower.includes("am")) return "Mittfältare";
  if (lower.includes("att") || lower.includes("for") || lower.includes("wing") || lower.includes("striker")) return "Anfallare";
  return raw;
}

function normalizeRow(row) {
  const metric = metricFromType(row);
  if (!metric) return null;

  const player = unwrap(row?.player);
  const team = unwrap(row?.participant || row?.team);
  const value = row?.value || {};
  const amount = numericValue(row.total, row.goals, row.assists, value.total, value.goals, value.value, row.score);

  if (!amount || amount <= 0) return null;

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
    position: normalizePosition(player),
    metric,
    value: amount,
    rank: Number(row.position || 999)
  };
}

function mergePlayer(rows) {
  const byPlayer = new Map();
  rows.forEach((row) => {
    const key = row.playerId ? String(row.playerId) : `${row.playerName}:${row.teamId || row.teamName}`;
    const existing = byPlayer.get(key) || {
      playerId: row.playerId,
      playerName: row.playerName,
      playerPhoto: row.playerPhoto,
      teamId: row.teamId,
      teamName: row.teamName,
      teamLogo: row.teamLogo,
      position: row.position,
      stats: {}
    };
    existing.stats[row.metric] = Math.max(Number(existing.stats[row.metric] || 0), Number(row.value || 0));
    byPlayer.set(key, existing);
  });
  return Array.from(byPlayer.values());
}

function groupCategories(rows) {
  return rows.reduce((acc, row) => {
    if (!acc[row.metric]) {
      acc[row.metric] = {
        metric: row.metric,
        label: metricLabel(row.metric),
        rows: []
      };
    }
    acc[row.metric].rows.push(row);
    return acc;
  }, {});
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

function emptyPayload({ league, leagueId, seasonId, warning }) {
  return {
    league,
    leagueId,
    seasonId,
    categories: {},
    players: [],
    warnings: warning ? [warning] : ["Spelarstatistik saknas just nu."]
  };
}

export default async function handler(req, res) {
  const league = String(req.query.league || "allsvenskan").toLowerCase();
  const seasonId = Number(req.query.season || SEASONS[league] || SEASONS.allsvenskan);
  const leagueId = LEAGUE_IDS[league] || LEAGUE_IDS.allsvenskan;
  const token = process.env.SPORTMONKS_API_TOKEN;
  const cacheKey = `${league}:${seasonId}`;

  if (!token) {
    console.warn("PLAYERSTATS MISSING SPORTMONKS_API_TOKEN", { league, leagueId, seasonId });
    return res.status(200).json(emptyPayload({ league, leagueId, seasonId, warning: "SPORTMONKS_API_TOKEN saknas på servern." }));
  }

  const cached = memoryCache.get(cacheKey);
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return res.status(200).json(cached.payload);
  }

  const params = new URLSearchParams({
    include: "player;participant;type",
    per_page: "100",
    order: "desc"
  });
  const endpoint = `/football/topscorers/seasons/${encodeURIComponent(seasonId)}`;
  const url = `https://api.sportmonks.com/v3${endpoint}?${params.toString()}`;

  try {
    const { response, text, payload } = await fetchSportmonksJson(url, token);

    if (!response.ok) {
      console.warn("PLAYERSTATS HTTP ERROR, RETURNING EMPTY DATA:", {
        league,
        leagueId,
        seasonId,
        status: response.status,
        details: payload?.message || payload?.error || text
      });
      return res.status(200).json(emptyPayload({ league, leagueId, seasonId, warning: "Spelarstatistik kunde inte hämtas just nu." }));
    }

    const rawRows = Array.isArray(payload?.data) ? payload.data : [];
    const rows = rawRows.map(normalizeRow).filter(Boolean);
    const categories = groupCategories(rows);
    Object.values(categories).forEach((category) => {
      category.rows = category.rows
        .sort((a, b) => {
          if (b.value !== a.value) return b.value - a.value;
          return a.rank - b.rank;
        })
        .slice(0, 50);
    });

    const body = {
      league,
      leagueId,
      seasonId,
      categories,
      players: mergePlayer(rows),
      warnings: rows.length ? [] : ["Spelarstatistik saknas just nu."]
    };
    memoryCache.set(cacheKey, { fetchedAt: Date.now(), payload: body });
    return res.status(200).json(body);
  } catch (error) {
    console.error("PLAYERSTATS THROWN ERROR, RETURNING EMPTY DATA:", {
      league,
      leagueId,
      seasonId,
      message: error?.message,
      stack: error?.stack
    });
    return res.status(200).json(emptyPayload({ league, leagueId, seasonId, warning: "Spelarstatistik kunde inte hämtas just nu." }));
  }
}
