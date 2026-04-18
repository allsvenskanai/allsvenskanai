function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function playerName(player) {
  const nested = player?.player || {};
  const nestedFirstLast = clean(`${nested.firstname || ""} ${nested.lastname || ""}`);
  const flatFirstLast = clean(`${player?.firstname || ""} ${player?.lastname || ""}`);

  return (
    clean(nested.name) ||
    nestedFirstLast ||
    clean(player?.name) ||
    flatFirstLast ||
    "Okänd spelare"
  );
}

function normalizePosition(position) {
  const raw = clean(position).toLowerCase();
  if (!raw) return "Position saknas";
  if (raw.includes("goalkeeper") || raw.includes("keeper") || raw === "gk") return "Målvakt";
  if (raw.includes("defender") || raw.includes("defence") || raw.includes("defense") || raw === "df") return "Försvarare";
  if (raw.includes("midfielder") || raw.includes("midfield") || raw === "mf") return "Mittfältare";
  if (raw.includes("attacker") || raw.includes("forward") || raw.includes("striker") || raw === "fw") return "Anfallare";
  return position || "Position saknas";
}

function positionOrder(position) {
  const normalized = normalizePosition(position);
  if (normalized === "Målvakt") return 1;
  if (normalized === "Försvarare") return 2;
  if (normalized === "Mittfältare") return 3;
  if (normalized === "Anfallare") return 4;
  return 9;
}

function normalizePlayer(player) {
  const nested = player?.player || {};
  const name = playerName(player);
  const rawPosition = player?.position || nested.position || "";
  const number = Number(player?.number ?? nested.number ?? player?.shirt_number ?? nested.shirt_number);

  return {
    id: nested.id || player?.id || null,
    name,
    photo: nested.photo || player?.photo || "",
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

function getApiFootballToken() {
  return (
    process.env.API_FOOTBALL_KEY ||
    process.env.APIFOOTBALL_API_KEY ||
    process.env.FOOTBALL_API_KEY ||
    process.env.RAPIDAPI_KEY ||
    process.env.X_RAPIDAPI_KEY ||
    ""
  );
}

export default async function handler(req, res) {
  const { id } = req.query;
  const token = getApiFootballToken();
  const debug = req.query.debug === "1" || process.env.NODE_ENV !== "production";

  if (!id) {
    return res.status(400).json({ error: "Missing team id" });
  }

  if (!token) {
    return res.status(500).json({
      error: "Missing API-Football token",
      details: "Set API_FOOTBALL_KEY, APIFOOTBALL_API_KEY, FOOTBALL_API_KEY or RAPIDAPI_KEY in Vercel."
    });
  }

  try {
    const url = `https://v3.football.api-sports.io/players/squads?team=${encodeURIComponent(id)}`;
    const response = await fetch(url, {
      headers: {
        "x-apisports-key": token
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (debug) {
      console.log("SQUAD RESPONSE:", payload);
    }

    if (!response.ok) {
      console.warn("API-Football squad request failed", response.status, payload);
      return res.status(200).json({
        teamId: Number(id),
        players: [],
        warning: payload?.message || payload?.errors || "Squad data unavailable"
      });
    }

    const squad = Array.isArray(payload?.response?.[0]?.players)
      ? payload.response[0].players
      : [];
    const normalized = squad.map(normalizePlayer);
    const missingNameCount = normalized.filter((player) => player.name === "Okänd spelare").length;

    if (debug && missingNameCount) {
      squad
        .filter((player) => playerName(player) === "Okänd spelare")
        .slice(0, 5)
        .forEach((player) => console.log("Missing name for:", player));
    }

    return res.status(200).json({
      teamId: Number(id),
      players: sortPlayers(normalized),
      rawCount: squad.length,
      count: normalized.length,
      missingNameCount
    });
  } catch (error) {
    console.warn("Squad endpoint failed", error);
    return res.status(200).json({
      teamId: Number(id),
      players: [],
      warning: error.message || "Squad data unavailable"
    });
  }
}
