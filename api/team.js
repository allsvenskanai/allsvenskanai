export default async function handler(req, res) {
  try {
    const id = String(req.query.id || "").trim();

    if (!id) {
      return res.status(400).json({ error: "Missing team id" });
    }

    const token = process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });
    }

    const url = `https://api.sportmonks.com/v3/football/teams/${encodeURIComponent(id)}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: token
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Failed to load team",
        details: text,
        id
      });
    }

    const data = await response.json();
    const team = data?.data || null;

    return res.status(200).json({
      team: {
        id: team?.id ?? id,
        name: team?.name ?? "Okänt lag",
        logo: team?.image_path ?? ""
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load team",
      details: error.message
    });
  }
}
