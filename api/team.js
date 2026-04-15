const TEAM_FACTS_OVERRIDES = {
  // Add manual fixes by Sportmonks team id when the API does not provide them.
  354: {
    city: "Malmö",
    venue: {
      name: "Eleda Stadion",
      capacity: 22500
    },
    chairman: "Zlatko Rihter",
    sportingDirector: "Daniel Andersson",
    coach: "Miguel Angel Ramirez"
  },
  2678: {
    city: "Uppsala",
    venue: {
      name: "Studenternas IP",
      capacity: 10522
    },
    chairman: "Ulrika Moström Ågren",
    sportingDirector: "Jonathan Ederström",
    coach: "Andreas Engelmark"
  },
};

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function normalizeTeam(team, id) {
  const override = TEAM_FACTS_OVERRIDES[id] || {};
  const venue = team?.venue || team?.stadium || null;
  const coach = Array.isArray(team?.coach) ? team.coach[0] : team?.coach;

  return {
    id: team?.id ?? id,
    name: team?.name ?? "Okänt lag",
    logo: team?.image_path ?? "",
    country: firstValue(team?.country?.name, team?.country_name, override.country),
    founded: firstValue(team?.founded, team?.founded_at, override.founded),
    city: firstValue(team?.city?.name, team?.city_name, venue?.city_name, override.city),
    venue: {
      name: firstValue(venue?.name, venue?.stadium_name, override.venue?.name),
      capacity: firstValue(venue?.capacity, override.venue?.capacity)
    },
    coach: firstValue(coach?.display_name, coach?.name, override.coach),
    chairman: firstValue(team?.chairman, override.chairman),
    sportingDirector: firstValue(team?.sporting_director, override.sportingDirector)
  };
}

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
      team: normalizeTeam(team, id)
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load team",
      details: error.message
    });
  }
}
