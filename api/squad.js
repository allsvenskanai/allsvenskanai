function normalizePlayer(row) {
  const player = row.player || row;
  const position = row.position || player.position || {};

  return {
    id: player.id || row.player_id || row.id,
    name: player.display_name || player.name || row.name || "Okänd spelare",
    photo: player.image_path || player.photo || row.image_path || "",
    position: position.name || position.developer_name || row.position_name || row.position || "",
    number: row.jersey_number || row.number || row.shirt_number || player.jersey_number || null
  };
}

function uniquePlayers(players) {
  const seen = new Map();

  for (const player of players) {
    if (!player.id) continue;
    seen.set(String(player.id), player);
  }

  return [...seen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "sv"));
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

    const rawPlayers = payload?.data?.players || payload?.data?.squad || [];
    const players = uniquePlayers(rawPlayers.map(normalizePlayer));

    return res.status(200).json({
      teamId: Number(id),
      players,
      rawCount: rawPlayers.length,
      count: players.length
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
