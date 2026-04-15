export default async function handler(req, res) {
  try {
    const league = String(req.query.league || "allsvenskan").toLowerCase();

    const leagueId = league === "damallsvenskan" ? 139 : 113;
    const season = 2026;

    const token = process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });
    }

    const url = `https://api.sportmonks.com/v3/football/standings/seasons/${season}?filters=league_id:${leagueId}&include=participant;details.type`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: token
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Sportmonks request failed",
        details: text
      });
    }

    const data = await response.json();

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load standings",
      details: error.message
    });
  }
}
