function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstValue(...values) {
  return values.map(clean).find(Boolean) || "";
}

function joinName(firstname, lastname) {
  return clean(`${firstname || ""} ${lastname || ""}`);
}

function resolvePlayer(row) {
  return row?.player?.data || row?.player || {};
}

function resolvePlayerName(row) {
  const player = resolvePlayer(row);

  return (
    firstValue(
      player.name,
      joinName(player.firstname || player.first_name, player.lastname || player.last_name),
      player.display_name,
      player.common_name,
      player.fullname,
      player.full_name
    ) || "Okänd spelare"
  );
}

function resolvePosition(row) {
  const position = row?.position?.data || row?.position || row?.detailedPosition?.data || row?.detailedPosition || {};

  return firstValue(
    position.name,
    position.developer_name,
    position.code,
    row.position_name
  );
}

function normalizePosition(position) {
  const raw = clean(position).toLowerCase();
  if (!raw) return "Position saknas";
  if (raw.includes("goal") || raw.includes("keeper") || raw === "gk") return "Målvakt";
  if (raw.includes("def") || raw.includes("back") || raw === "df") return "Försvarare";
  if (raw.includes("mid") || raw === "mf" || raw === "cm" || raw === "dm" || raw === "am") return "Mittfältare";
  if (raw.includes("att") || raw.includes("for") || raw.includes("wing") || raw.includes("striker") || raw === "fw") return "Anfallare";
  return position;
}

function positionOrder(position) {
  const normalized = normalizePosition(position);
  if (normalized === "Målvakt") return 1;
  if (normalized === "Försvarare") return 2;
  if (normalized === "Mittfältare") return 3;
  if (normalized === "Anfallare") return 4;
  return 9;
}

function normalizePlayer(row) {
  const player = resolvePlayer(row);
  const rawPosition = resolvePosition(row);
  const number = Number(row?.jersey_number ?? row?.shirt_number ?? row?.number);
  const birthDate = player.date_of_birth ? new Date(player.date_of_birth) : null;
  const age = birthDate && !Number.isNaN(birthDate.getTime())
    ? Math.max(0, Math.floor((Date.now() - birthDate.getTime()) / 31557600000))
    : null;

  return {
    id: player.id || row.player_id || null,
    name: resolvePlayerName(row),
    photo: player.image_path || player.photo || "",
    nationality: player.nationality?.name || player.country?.name || "",
    flag: player.nationality?.image_path || player.country?.image_path || "",
    age,
    position: normalizePosition(rawPosition),
    positionOrder: positionOrder(rawPosition),
    number: Number.isFinite(number) && number > 0 ? number : null
  };
}

function sortPlayers(players) {
  return players.sort((a, b) => {
    if (a.positionOrder !== b.positionOrder) return a.positionOrder - b.positionOrder;
    const aNumber = a.number ?? 999;
    const bNumber = b.number ?? 999;
    if (aNumber !== bNumber) return aNumber - bNumber;
    return a.name.localeCompare(b.name, "sv");
  });
}

async function sportmonksFetch(path, token) {
  const response = await fetch(`https://api.sportmonks.com/v3/football${path}`, {
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

  return { response, payload, text };
}

export default async function handler(req, res) {
  const teamId = req.query.id;
  const league = String(req.query.league || "").toLowerCase();
  const requestedSeason = req.query.season;
  const seasonId = Number(requestedSeason || (league === "damallsvenskan" ? 26782 : 26806));
  const token = process.env.SPORTMONKS_API_TOKEN;
  const debug = req.query.debug === "1" || process.env.NODE_ENV !== "production";

  if (!teamId) {
    return res.status(400).json({ error: "Missing team id" });
  }

  if (!token) {
    return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });
  }

  try {
    const includes = "player;position;detailedPosition";
    const seasonPath = `/squads/seasons/${encodeURIComponent(seasonId)}/teams/${encodeURIComponent(teamId)}?include=${includes}`;
    let { response, payload, text } = await sportmonksFetch(seasonPath, token);
    let source = "season-squad";

    if (!response.ok || !Array.isArray(payload?.data) || payload.data.length === 0) {
      if (debug) {
        console.warn("Season squad unavailable, trying current squad", {
          teamId,
          seasonId,
          status: response.status,
          payload
        });
      }

      const currentPath = `/squads/teams/${encodeURIComponent(teamId)}?include=${includes}`;
      const fallback = await sportmonksFetch(currentPath, token);
      response = fallback.response;
      payload = fallback.payload;
      text = fallback.text;
      source = "current-squad";
    }

    if (debug) {
      console.log("SQUAD RESPONSE:", payload);
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to load squad",
        details: payload?.message || payload?.error || text,
        teamId: Number(teamId),
        seasonId,
        source
      });
    }

    const rawPlayers = Array.isArray(payload?.data) ? payload.data : [];
    const normalized = rawPlayers.map(normalizePlayer);
    const missingNameCount = normalized.filter((player) => player.name === "Okänd spelare").length;

    if (debug && missingNameCount) {
      rawPlayers
        .filter((row) => normalizePlayer(row).name === "Okänd spelare")
        .slice(0, 5)
        .forEach((row) => console.log("Missing name for:", row));
    }

    return res.status(200).json({
      teamId: Number(teamId),
      seasonId,
      source,
      players: sortPlayers(normalized),
      rawCount: rawPlayers.length,
      count: normalized.length,
      missingNameCount
    });
  } catch (error) {
    console.warn("Squad endpoint failed", error);
    return res.status(500).json({
      error: "Failed to load squad",
      details: error.message,
      teamId: Number(teamId),
      seasonId
    });
  }
}
