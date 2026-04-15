export default async function handler(req, res) {
  try {
    const league = String(req.query.league || "allsvenskan").toLowerCase();

    const seasonId = league === "damallsvenskan" ? 26782 : 26806;

    const token = process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });
    }

    const url = `https://api.sportmonks.com/v3/football/fixtures/seasons/${seasonId}?include=participants;scores`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: token
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Failed to load fixtures",
        details: text,
        seasonId
      });
    }

    const data = await response.json();

    return res.status(200).json({
      league,
      seasonId,
      data: data?.data || []
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load fixtures",
      details: error.message
    });
  }
}
