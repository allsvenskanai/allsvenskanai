export default async function handler(req, res) {
  try {
    const league = String(req.query.league || "allsvenskan").toLowerCase();
    const seasonId = league === "damallsvenskan" ? 26782 : 26806;

    const token = process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });
    }

    const url = `https://api.sportmonks.com/v3/football/schedules/seasons/${seasonId}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: token
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to load fixtures",
        seasonId,
        details: text
      });
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "Schedules response was not valid JSON",
        seasonId,
        details: text
      });
    }

    const schedules = Array.isArray(payload?.data) ? payload.data : [];
    const fixtures = schedules.flatMap((schedule) =>
      Array.isArray(schedule?.fixtures) ? schedule.fixtures : []
    );

    return res.status(200).json({
      league,
      seasonId,
      data: fixtures
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load fixtures",
      details: error.message
    });
  }
}
