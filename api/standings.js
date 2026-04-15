export default async function handler(req, res) {
  try {
    const league = String(req.query.league || "allsvenskan").toLowerCase();
    const leagueId = league === "damallsvenskan" ? 139 : 113;

    const token = process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });
    }

    const headers = {
      Accept: "application/json",
      Authorization: token
    };

    // 1) Hämta seasons och hitta aktuell season för ligan
    const seasonsUrl =
      `https://api.sportmonks.com/v3/football/seasons` +
      `?filters=league_id:${leagueId}` +
      `&select=id,name,league_id,is_current,finished,pending`;

    const seasonsResponse = await fetch(seasonsUrl, { headers });

    if (!seasonsResponse.ok) {
      const text = await seasonsResponse.text();
      return res.status(seasonsResponse.status).json({
        error: "Failed to load seasons",
        details: text
      });
    }

    const seasonsPayload = await seasonsResponse.json();
    const seasons = Array.isArray(seasonsPayload?.data) ? seasonsPayload.data : [];

    const currentSeason =
      seasons.find((s) => Number(s.is_current) === 1) ||
      seasons.find((s) => Number(s.finished) === 0) ||
      seasons[0];

    if (!currentSeason?.id) {
      return res.status(404).json({
        error: "No season found for league",
        league,
        leagueId
      });
    }

    // 2) Hämta standings för riktig season-id
    const standingsUrl =
      `https://api.sportmonks.com/v3/football/standings/seasons/${currentSeason.id}` +
      `?include=participant;details.type`;

    const standingsResponse = await fetch(standingsUrl, { headers });

    if (!standingsResponse.ok) {
      const text = await standingsResponse.text();
      return res.status(standingsResponse.status).json({
        error: "Sportmonks request failed",
        details: text,
        seasonId: currentSeason.id
      });
    }

    const standingsPayload = await standingsResponse.json();

    return res.status(200).json({
      league,
      leagueId,
      season: {
        id: currentSeason.id,
        name: currentSeason.name || null,
        is_current: currentSeason.is_current ?? null
      },
      data: standingsPayload?.data || []
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load standings",
      details: error.message
    });
  }
}
