function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstValue(...values) {
  for (const value of values) {
    const cleaned = compact(value);
    if (cleaned) return cleaned;
  }

  return "";
}

function joinName(firstname, lastname) {
  const first = compact(firstname);
  const last = compact(lastname);
  if (!first && !last) return "";
  if (first && last && first.toLowerCase() === last.toLowerCase()) return first;
  return compact(`${first} ${last}`);
}

function unwrapPlayer(row) {
  return (
    row?.player?.data ||
    row?.player ||
    row?.details?.player ||
    row?.participant ||
    row?.person ||
    row
  );
}

function resolvePlayerName(row) {
  const player = unwrapPlayer(row);
  const firstLast = joinName(
    player?.firstname || player?.first_name || row?.firstname || row?.first_name,
    player?.lastname || player?.last_name || row?.lastname || row?.last_name
  );

  return firstValue(
    firstLast,
    player?.display_name,
    player?.fullname,
    player?.full_name,
    player?.common_name,
    player?.name,
    row?.display_name,
    row?.fullname,
    row?.full_name,
    row?.common_name,
    row?.name
  ) || "Okänd spelare";
}

function resolvePosition(row) {
  const player = unwrapPlayer(row);
  const position =
    row?.position?.data ||
    row?.position ||
    player?.position?.data ||
    player?.position ||
    row?.details?.position ||
    {};

  return firstValue(
    position?.name,
    position?.developer_name,
    position?.code,
    row?.position_name,
    row?.position,
    player?.position_name,
    player?.position
  );
}

function normalizePosition(position) {
  const raw = compact(position).toLowerCase();
  if (!raw) return "Position saknas";
  if (raw.includes("goal") || raw.includes("keeper") || raw === "gk" || raw === "mv") return "Målvakt";
  if (raw.includes("def") || raw.includes("back") || raw === "df" || raw === "fb" || raw === "cb") return "Försvarare";
  if (raw.includes("mid") || raw === "cm" || raw === "dm" || raw === "am" || raw === "mf") return "Mittfältare";
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

function resolvePhoto(row) {
  const player = unwrapPlayer(row);
  return firstValue(
    player?.image_path,
    player?.photo,
    player?.logo,
    row?.image_path,
    row?.photo
  );
}

function resolveNumber(row) {
  const player = unwrapPlayer(row);
  const raw =
    row?.jersey_number ??
    row?.shirt_number ??
    row?.number ??
    row?.details?.jersey_number ??
    player?.jersey_number ??
    player?.shirt_number ??
    player?.number ??
    null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizePlayer(row) {
  const player = unwrapPlayer(row);
  const id = player?.id || row?.player_id || row?.participant_id || row?.id || null;
  const rawPosition = resolvePosition(row);

  return {
    id,
    name: resolvePlayerName(row),
    photo: resolvePhoto(row),
    position: normalizePosition(rawPosition),
    positionOrder: positionOrder(rawPosition),
    number: resolveNumber(row)
  };
}

function uniquePlayers(players) {
  const seen = new Map();

  for (const player of players) {
    if (!player.id && player.name === "Okänd spelare") continue;
    const key = player.id ? String(player.id) : player.name.toLowerCase();
    seen.set(key, { ...seen.get(key), ...player });
  }

  return [...seen.values()].sort((a, b) => {
    if (a.positionOrder !== b.positionOrder) return a.positionOrder - b.positionOrder;
    const aNumber = a.number ?? 999;
    const bNumber = b.number ?? 999;
    if (aNumber !== bNumber) return aNumber - bNumber;
    return String(a.name).localeCompare(String(b.name), "sv");
  });
}

function collectRawPlayers(payload) {
  const data = payload?.data || {};
  return (
    data?.players?.data ||
    data?.players ||
    data?.squad?.data ||
    data?.squad ||
    data?.playersSquads?.data ||
    data?.playersSquads ||
    []
  );
}

export default async function handler(req, res) {
  const { id } = req.query;
  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!id) {
    return res.status(400).json({ error: "Missing team id" });
  }

  if (!token) {
    return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });
  }

  try {
    const url =
      `https://api.sportmonks.com/v3/football/teams/${encodeURIComponent(id)}` +
      `?include=players;players.position&api_token=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.warn("Sportmonks squad request failed", response.status, payload?.message || payload);
      return res.status(200).json({
        teamId: Number(id),
        players: [],
        warning: payload?.message || "Squad data unavailable"
      });
    }

    const rawPlayers = collectRawPlayers(payload);
    const normalized = rawPlayers.map(normalizePlayer);
    const missingNameCount = normalized.filter((player) => player.name === "Okänd spelare").length;
    const players = uniquePlayers(normalized);

    if (missingNameCount) {
      console.warn("Squad players missing names", {
        teamId: id,
        missingNameCount,
        sampleKeys: Object.keys(rawPlayers.find((row) => normalizePlayer(row).name === "Okänd spelare") || {})
      });
    }

    return res.status(200).json({
      teamId: Number(id),
      players,
      rawCount: rawPlayers.length,
      count: players.length,
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
