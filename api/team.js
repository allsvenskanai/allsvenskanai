const TEAM_FACTS_OVERRIDES = {
  2678: { city: "Uppsala", venue: { name: "Studenternas IP", capacity: 10522 }, founded: 1907, chairman: "Ulrika Mostrom Agren", sportingDirector: "Jonathan Ederstrom", coach: "Andreas Engelmark" },
  443: { city: "Stockholm", venue: { name: "3Arena", capacity: 30000 }, founded: 1891, chairman: "Erik Gozzi", sportingDirector: null, coach: "Jani Honkavaara" },
  354: { city: "Malmo", venue: { name: "Eleda Stadion", capacity: 22500 }, founded: 1910, chairman: "Zlatko Rihter", sportingDirector: "Daniel Andersson", coach: "Miguel Angel Ramirez" },
  2535: { city: "Goteborg", venue: { name: "Nordic Wellness Arena", capacity: 6250 }, founded: 1940, chairman: "Anders Billstrom", sportingDirector: "Erik Friberg", coach: "Jens Gustafsson" },
  1226: { city: "Boras", venue: { name: "Boras Arena", capacity: 14500 }, founded: 1904, chairman: "Sune Lundqvist", sportingDirector: "Stefan Andreasson", coach: "Bjorn Hamberg" },
  1870: { city: "Goteborg", venue: { name: "Gamla Ullevi", capacity: 18454 }, founded: 1887, chairman: "Terje Johansson", sportingDirector: "Pontus Farnerud", coach: "Andreas Holmberg" },
  2825: { city: "Stockholm", venue: { name: "Strawberry Arena", capacity: 50128 }, founded: 1891, chairman: "Mikael Jomer", sportingDirector: "Miika Takkula", coach: "Jose Riveiro" },
  8671: { city: "Vasteras", venue: { name: "Hitachi Energy Arena", capacity: 8900 }, founded: 1904, chairman: "Magnus Breitholtz", sportingDirector: "Billy Magnusson", coach: "Alexander Rubin" },
  2353: { city: "Stockholm", venue: { name: "3Arena", capacity: 30000 }, founded: 1915, chairman: "Mattias Fri", sportingDirector: "Mikael Hjelmberg", coach: "Kalle Karlsson" },
  2753: { city: "Degerfors", venue: { name: "Stora Valla", capacity: 6545 }, founded: 1907, chairman: "Ulrika Eriksson", sportingDirector: "Patrik Werner", coach: "Henok Goitom" },
  3285: { city: "Stockholm", venue: { name: "Grimsta IP", capacity: 5000 }, founded: 1942, chairman: "Johan Strom", sportingDirector: "Sean Sabetkar", coach: "Ulf Kristiansson och Fredrik Landen" },
  432: { city: "Kalmar", venue: { name: "Guldfageln Arena", capacity: 12182 }, founded: 1910, chairman: "Joachim Lantz", sportingDirector: "Mats Wihlblad", coach: "Toni Koskela" },
  1777: { city: "Goteborg", venue: { name: "Gamla Ullevi", capacity: 18454 }, founded: 1894, chairman: "Stefan Tilk", sportingDirector: "Niklas Karlstrom", coach: "Fredrik Holmberg" },
  720: { city: "Halmstad", venue: { name: "Orjans Vall", capacity: 10873 }, founded: 1914, chairman: "Pelle Nilsson", sportingDirector: "Jesper Westerberg", coach: "Johan Lindholm" },
  532: { city: "Goteborg", venue: { name: "Gamla Ullevi", capacity: 18454 }, founded: 1904, chairman: "Magnus Nilsson", sportingDirector: "Hannes Stiller", coach: "Stefan Billborn" },
  411: { city: "Hallevik", venue: { name: "Strandvallen", capacity: 6000 }, founded: 1939, chairman: "Jan Sjoblom", sportingDirector: "Hasse Larsson", coach: "Karl Marius Aksum" },
  166845: { city: "Stockholm", venue: { name: "Skytteholms IP", capacity: 5200 }, founded: 1891, chairman: "Mikael Jomer", sportingDirector: "Zinar Spindari", coach: "Lukas Syberyjski" },
  253910: { city: "Goteborg", venue: { name: "Nordic Wellness Arena", capacity: 6250 }, founded: 1940, chairman: "Anders Billstrom", sportingDirector: "Christian Lundstrom", coach: "Elena Sadiku" },
  236826: { city: "Stockholm", venue: { name: "Grimsta IP", capacity: 5000 }, founded: 1942, chairman: "Johan Strom", sportingDirector: "Staffan Jacobsson", coach: "Daniel Gunnars" },
  19169: { city: "Stockholm", venue: { name: "3Arena", capacity: 30000 }, founded: 1891, chairman: "Erik Gozzi", sportingDirector: "Jean Balawo", coach: "Willie Kirk" },
  268948: { city: "Malmo", venue: { name: "Eleda Stadion", capacity: 22500 }, founded: 1910, chairman: "Zlatko Rihter", sportingDirector: "Maxim Khalil", coach: "Jonas Valfridsson" },
  19154: { city: "Malmo", venue: { name: "Malmo IP", capacity: 7600 }, founded: 1970, chairman: "Hakan Wifesson", sportingDirector: "Emelie Lundberg", coach: "Joel Kjetselberg" },
  27479: { city: "Stockholm", venue: { name: "Hammarby IP", capacity: 3700 }, founded: 1915, chairman: "Mattias Fri", sportingDirector: "Arnor Smarason", coach: "William Stromberg" },
  236821: { city: "Norrkoping", venue: { name: "Idrottsparken", capacity: 16000 }, founded: 1897, chairman: "Martin Gyllix", sportingDirector: "Dennis Popperyd", coach: "Stellan Carlsson" },
  19146: { city: "Kristianstad", venue: { name: "Kristianstads Fotbollsarena", capacity: 4700 }, founded: 1998, chairman: "Stina Trimark", sportingDirector: "Lovisa Strom", coach: "Nik Chamberlain" },
  19166: { city: "Eskilstuna", venue: { name: "Tunavallen", capacity: 7800 }, founded: 2002, chairman: "Mats Baverud", sportingDirector: null, coach: "Rickard Johansson" },
  19147: { city: "Pitea", venue: { name: "LF Arena", capacity: 6000 }, founded: 2012, chairman: "Mari Wigren", sportingDirector: "James Burgin", coach: "Fredrik Bernhardsson" },
  234951: { city: "Uppsala", venue: { name: "Studenternas IP", capacity: 10522 }, founded: 2016, chairman: null, sportingDirector: "Julius Brekkan", coach: "Samuel Fagerholm" },
  19145: { city: "Hassleholm", venue: { name: "Vittsjo Idrottspark", capacity: 2500 }, founded: 1933, chairman: "Jakob Wikenstal", sportingDirector: "Mladen Blagojevic", coach: "Mladen Blagojevic" },
  157605: { city: "Vaxjo", venue: { name: "Spiris Arena", capacity: 12000 }, founded: 2014, chairman: "Mans Hammarback", sportingDirector: "Kim Focic Aberg", coach: "Olof Unogard" }
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unwrap(value) {
  return value?.data || value || null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function statNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace?.("%", "") ?? value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = statNumeric(item);
      if (nested !== null) return nested;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const key of ["total", "count", "value", "goals", "percentage", "percent", "avg", "average", "all", "team", "participant", "home", "away"]) {
      const nested = statNumeric(value[key]);
      if (nested !== null) return nested;
    }
    for (const nestedValue of Object.values(value)) {
      const nested = statNumeric(nestedValue);
      if (nested !== null) return nested;
    }
  }
  return null;
}

const STAT_TYPE_KEYS = {
  34: "CORNERS",
  43: "ATTACKS",
  44: "DANGEROUS_ATTACKS",
  45: "BALL_POSSESSION",
  47: "PENALTIES",
  51: "OFFSIDES",
  52: "GOALS",
  56: "FOULS",
  78: "TACKLES",
  79: "ASSISTS",
  82: "YELLOW_CARDS",
  83: "RED_CARDS",
  84: "YELLOWRED_CARDS",
  106: "DUELS_WON",
  188: "MATCHES"
};

function statKey(detail) {
  const type = unwrap(detail?.type) || {};
  const byType = STAT_TYPE_KEYS[Number(detail?.type_id)];
  return clean(type.developer_name || type.code || type.name || byType || detail?.type_id).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function metricAliases(key) {
  const aliases = new Set([key]);
  if (key === "GOALS") aliases.add("GOALS_FOR");
  if (key === "BALL_POSSESSION") aliases.add("POSSESSION");
  if (key === "PENALTIES") aliases.add("PENALTY_GOALS");
  if (key === "FOULS") aliases.add("FOULS_COMMITTED");
  if (key === "YELLOWCARDS") aliases.add("YELLOW_CARDS");
  if (key === "REDCARDS") aliases.add("RED_CARDS");
  return Array.from(aliases);
}

function setMetric(metrics, key, detail) {
  if (!key) return;
  const value = statNumeric(detail?.value ?? detail?.data?.value ?? detail?.data);
  if (value === null) return;
  metricAliases(key).forEach((alias) => {
    if (metrics[alias] === undefined) metrics[alias] = value;
  });
}

function normalizeStatisticsRows(rows, seasonId) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const seasonRows = sourceRows.filter((row) => !seasonId || !row?.season_id || Number(row.season_id) === Number(seasonId));
  const metrics = {};
  const rawDetails = [];

  seasonRows.forEach((row) => {
    const details = Array.isArray(row?.details) ? row.details : Array.isArray(row?.details?.data) ? row.details.data : [];
    details.forEach((detail) => {
      const key = statKey(detail);
      if (!key) return;
      rawDetails.push({ key, typeId: detail?.type_id, value: detail?.value ?? detail?.data ?? null });
      setMetric(metrics, key, detail);
    });
  });

  return {
    hasStatistics: Object.keys(metrics).length > 0,
    metrics,
    rawDetails,
    rawRowCount: sourceRows.length,
    rawDetailCount: rawDetails.length
  };
}

function normalizeTeamStatistics(team, seasonId) {
  return normalizeStatisticsRows(team?.statistics, seasonId);
}

function mergeStatistics(primary, fallback) {
  const merged = {
    hasStatistics: Boolean(primary?.hasStatistics || fallback?.hasStatistics),
    metrics: { ...(fallback?.metrics || {}), ...(primary?.metrics || {}) },
    rawDetails: [...(fallback?.rawDetails || []), ...(primary?.rawDetails || [])],
    sources: {
      direct: primary || null,
      teamInclude: fallback || null
    }
  };
  merged.hasStatistics = Object.keys(merged.metrics).length > 0;
  return merged;
}

function mergeMissing(apiValue, fallbackValue) {
  return apiValue === null || apiValue === undefined || apiValue === "" ? fallbackValue ?? null : apiValue;
}

function normalizeTeam(rawTeam, seasonId) {
  const team = unwrap(rawTeam) || {};
  const venue = unwrap(team.venue) || {};
  const override = TEAM_FACTS_OVERRIDES[team.id] || {};
  const overrideVenue = override.venue || {};

  return {
    id: team.id,
    name: team.name || override.name || "Okant lag",
    logo: team.image_path || team.logo_path || team.logo || override.logo || "",
    country: team.country?.name || team.country_name || null,
    founded: mergeMissing(team.founded, override.founded),
    city: mergeMissing(team.city, override.city),
    venue: {
      name: mergeMissing(venue.name || team.venue_name, overrideVenue.name),
      capacity: mergeMissing(venue.capacity || team.venue_capacity, overrideVenue.capacity)
    },
    coach: mergeMissing(team.coach?.name || team.coach_name, override.coach),
    chairman: mergeMissing(team.chairman, override.chairman),
    sportingDirector: mergeMissing(team.sportingDirector || team.sporting_director, override.sportingDirector),
    statistics: normalizeTeamStatistics(team, seasonId)
  };
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
  const seasonId = Number(req.query.season || (req.query.league === "damallsvenskan" ? 26782 : 26806));
  const includeStats = req.query.stats === "1" || req.query.stats === "true";
  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!teamId) return res.status(400).json({ error: "Missing team id" });
  if (!token) return res.status(500).json({ error: "Missing SPORTMONKS_API_TOKEN" });

  const includes = includeStats ? "venue;statistics.details.type" : "venue";
  const filters = includeStats ? `&filters=teamStatisticSeasons:${encodeURIComponent(seasonId)}` : "";
  const path = `/teams/${encodeURIComponent(teamId)}?include=${encodeURIComponent(includes)}${filters}`;

  try {
    let directStats = null;
    if (includeStats) {
      const directPath = `/statistics/seasons/teams/${encodeURIComponent(teamId)}?include=details.type&filters=teamStatisticSeasons:${encodeURIComponent(seasonId)}&per_page=50`;
      const direct = await sportmonksFetch(directPath, token);
      console.log("TEAM STATS DIRECT RAW RESPONSE:", {
        teamId: Number(teamId),
        seasonId,
        path: directPath,
        status: direct.response.status,
        ok: direct.response.ok,
        payload: direct.payload
      });

      if (direct.response.ok) {
        directStats = normalizeStatisticsRows(direct.payload?.data, seasonId);
        if (!directStats.hasStatistics) {
          const unfilteredPath = `/statistics/seasons/teams/${encodeURIComponent(teamId)}?include=details.type&per_page=50`;
          const unfiltered = await sportmonksFetch(unfilteredPath, token);
          console.warn("TEAM STATS DIRECT EMPTY, RETRYING WITHOUT SEASON FILTER:", {
            teamId: Number(teamId),
            seasonId,
            path: unfilteredPath,
            status: unfiltered.response.status,
            ok: unfiltered.response.ok,
            payload: unfiltered.payload
          });
          if (unfiltered.response.ok) {
            directStats = normalizeStatisticsRows(unfiltered.payload?.data, seasonId);
          }
        }
        console.log("TEAM STATS DIRECT MAPPED METRICS:", {
          teamId: Number(teamId),
          seasonId,
          metrics: directStats.metrics,
          rawRowCount: directStats.rawRowCount,
          rawDetailCount: directStats.rawDetailCount,
          rawKeys: directStats.rawDetails.map((detail) => detail.key)
        });
      } else {
        console.warn("TEAM STATS DIRECT ENDPOINT FAILED:", {
          teamId: Number(teamId),
          seasonId,
          status: direct.response.status,
          details: direct.payload?.message || direct.payload?.error || direct.text
        });
      }
    }

    let { response, payload, text } = await sportmonksFetch(path, token);
    console.log("TEAM ENDPOINT RAW RESPONSE:", {
      teamId: Number(teamId),
      seasonId,
      path,
      status: response.status,
      ok: response.ok,
      payload
    });

    if (!response.ok && includeStats) {
      console.warn("Team include statistics request failed, retrying basic team endpoint", {
        teamId,
        seasonId,
        status: response.status,
        details: payload?.message || payload?.error || text
      });
      ({ response, payload, text } = await sportmonksFetch(`/teams/${encodeURIComponent(teamId)}?include=venue`, token));
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to load team",
        details: payload?.message || payload?.error || text,
        teamId: Number(teamId),
        seasonId
      });
    }

    const team = normalizeTeam(payload?.data, seasonId);
    if (includeStats) {
      team.statistics = mergeStatistics(directStats, team.statistics);
      console.log("TEAM STATS FINAL MAPPED METRICS:", {
        teamId: Number(teamId),
        seasonId,
        metrics: team.statistics.metrics,
        rawDetails: team.statistics.rawDetails
      });
    }
    return res.status(200).json({ team, seasonId, statsIncluded: includeStats });
  } catch (error) {
    console.error("Team endpoint failed", error);
    return res.status(500).json({
      error: "Failed to load team",
      details: error.message,
      teamId: Number(teamId),
      seasonId
    });
  }
}
