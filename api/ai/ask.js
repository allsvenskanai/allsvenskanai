const SEASONS = {
  allsvenskan: 26806,
  damallsvenskan: 26782
};

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const ANSWER_CACHE_TTL_MS = 5 * 60 * 1000;
const rateLimitStore = new Map();
const answerCache = new Map();

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function logServerEvent(event, details = {}) {
  console.error(`[api/ai/ask] ${event}`, details);
}

function readBody(req) {
  if (!req.body) return { body: {}, invalidBody: false };
  if (typeof req.body === "string") {
    try {
      return { body: JSON.parse(req.body), invalidBody: false };
    } catch (error) {
      logServerEvent("invalid request body", { message: error.message });
      return { body: {}, invalidBody: true };
    }
  }
  if (typeof req.body !== "object") {
    logServerEvent("invalid request body", { bodyType: typeof req.body });
    return { body: {}, invalidBody: true };
  }
  return { body: req.body, invalidBody: false };
}

function safeCacheSet(key, value) {
  try {
    answerCache.set(key, { fetchedAt: Date.now(), value });
  } catch (error) {
    logServerEvent("data fetch/cache error", { stage: "answerCache.set", message: error.message });
  }
}

function getClientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function isRateLimited(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  entry.count += 1;
  rateLimitStore.set(key, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function getDetail(item, keys) {
  const wanted = Array.isArray(keys) ? keys : [keys];
  const details = Array.isArray(item?.details) ? item.details : [];
  const found = details.find((detail) => {
    const code = detail?.type?.developer_name || detail?.type?.code || detail?.type?.name;
    return wanted.includes(code);
  });
  const raw = found?.value?.total ?? found?.value ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStandings(payload) {
  return (Array.isArray(payload?.data) ? payload.data : [])
    .map((item) => {
      const participant = item?.participant || item?.team || item?.participants?.[0] || null;
      const teamId = participant?.id ?? item?.participant_id ?? item?.team_id ?? null;
      const goalsFor = getDetail(item, ["OVERALL_SCORED", "GOALS_FOR"]);
      const goalsAgainst = getDetail(item, ["OVERALL_CONCEDED", "GOALS_AGAINST"]);

      return {
        position: Number(item?.position ?? item?.rank ?? 999),
        teamId,
        teamName: clean(participant?.name) || "Okänt lag",
        played: getDetail(item, ["OVERALL_MATCHES", "MATCHES_PLAYED"]),
        won: getDetail(item, ["OVERALL_WINS", "WINS"]),
        draw: getDetail(item, ["OVERALL_DRAWS", "DRAWS"]),
        lost: getDetail(item, ["OVERALL_LOST", "OVERALL_LOSSES", "LOSSES"]),
        goalsFor,
        goalsAgainst,
        goalDiff: getDetail(item, ["OVERALL_GOAL_DIFFERENCE", "GOAL_DIFFERENCE"]) || goalsFor - goalsAgainst,
        points: Number(item?.points ?? getDetail(item, ["TOTAL_POINTS", "POINTS"]))
      };
    })
    .filter((row) => row.teamId)
    .sort((a, b) => a.position - b.position);
}

function unwrap(value) {
  return value?.data || value || {};
}

function participantByLocation(participants, location) {
  return (
    participants.find((team) => team?.meta?.location === location) ||
    participants.find((team) => team?.location === location) ||
    participants.find((team) => team?.pivot?.location === location) ||
    null
  );
}

function scoreFor(scores, participantId) {
  const rows = scores.filter((score) => Number(score?.participant_id) === Number(participantId));
  const row =
    rows.find((score) => String(score?.description || "").toUpperCase() === "CURRENT") ||
    rows.find((score) => String(score?.description || "").toUpperCase().includes("FULLTIME")) ||
    rows[0];
  const raw = row?.score?.goals ?? row?.score?.goal ?? row?.score?.value ?? row?.score ?? null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseKickoffMs(match) {
  const timestamp = match?.starting_at_timestamp ?? match?.time?.starting_at?.timestamp ?? null;
  if (timestamp !== null && timestamp !== undefined && timestamp !== "") {
    const parsed = Number(timestamp);
    if (Number.isFinite(parsed)) return parsed > 100000000000 ? parsed : parsed * 1000;
  }

  const raw = match?.starting_at || match?.time?.starting_at?.date_time || match?.time?.starting_at?.date || "";
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const parsedDate = new Date(normalized);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
}

function normalizeFixtures(payload) {
  return (Array.isArray(payload?.data?.fixtures) ? payload.data.fixtures : [])
    .map((match) => {
      const participants = Array.isArray(match?.participants) ? match.participants : [];
      const scores = Array.isArray(match?.scores) ? match.scores : [];
      const home = participantByLocation(participants, "home") || participants[0] || null;
      const away = participantByLocation(participants, "away") || participants[1] || null;
      const homeScore = home ? scoreFor(scores, home.id) : null;
      const awayScore = away ? scoreFor(scores, away.id) : null;
      const hasScore = homeScore !== null && awayScore !== null;
      const state = String(match?.state?.name || match?.state?.short_name || match?.status || "").toLowerCase();
      const isLive = state.includes("live") || state.includes("1st") || state.includes("2nd");
      const isFinished = !isLive && Boolean(match?.finished || match?.result_info || state.includes("finished") || state.includes("full") || state === "ft" || hasScore);
      const kickoffMs = parseKickoffMs(match);

      return {
        id: match?.id,
        startingAt: kickoffMs !== null ? new Date(kickoffMs).toISOString() : match?.starting_at || "",
        homeTeamId: home?.id || null,
        awayTeamId: away?.id || null,
        homeTeam: clean(home?.name) || "Hemmalag",
        awayTeam: clean(away?.name) || "Bortalag",
        homeScore,
        awayScore,
        hasScore,
        isFinished
      };
    })
    .filter((match) => match.homeTeamId && match.awayTeamId);
}

function statNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace?.("%", "") ?? value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    for (const key of ["total", "count", "value", "goals", "percentage", "avg", "average"]) {
      const parsed = statNumeric(value[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function statKey(detail) {
  const type = unwrap(detail?.type);
  return clean(type.developer_name || type.code || type.name || detail?.type_id)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

function normalizeTeamStats(payload) {
  const metrics = {};
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  rows.forEach((row) => {
    const details = Array.isArray(row?.details) ? row.details : [];
    details.forEach((detail) => {
      const key = statKey(detail);
      const value = statNumeric(detail?.value ?? detail?.data?.value ?? detail?.data);
      if (key && value !== null && metrics[key] === undefined) metrics[key] = value;
    });
  });

  return metrics;
}

async function sportmonksFetch(path, token) {
  try {
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
  } catch (error) {
    logServerEvent("data fetch/cache error", { stage: "sportmonksFetch", path, message: error.message });
    throw error;
  }
}

function findMentionedTeams(question, standings) {
  const normalizedQuestion = normalizeText(question);
  return standings
    .filter((team) => {
      const name = normalizeText(team.teamName);
      if (!name || name.length < 3) return false;
      const words = name.split(" ").filter((word) => word.length >= 3);
      return normalizedQuestion.includes(name) || words.some((word) => normalizedQuestion.includes(word));
    })
    .slice(0, 2);
}

function summarizeTeamFixtures(teamId, fixtures) {
  return fixtures
    .filter((match) => Number(match.homeTeamId) === Number(teamId) || Number(match.awayTeamId) === Number(teamId))
    .filter((match) => match.isFinished && match.hasScore)
    .sort((a, b) => new Date(b.startingAt).getTime() - new Date(a.startingAt).getTime())
    .slice(0, 5)
    .map((match) => ({
      datum: match.startingAt ? match.startingAt.slice(0, 10) : null,
      hemma: match.homeTeam,
      borta: match.awayTeam,
      resultat: `${match.homeScore}-${match.awayScore}`
    }));
}

async function buildFootballContext({ question, league, seasonId, token }) {
  const warnings = [];
  const usedData = [];
  let standings = [];
  let fixtures = [];
  const teamStats = [];

  const [standingsResult, fixturesResult] = await Promise.allSettled([
    sportmonksFetch(`/standings/seasons/${encodeURIComponent(seasonId)}?include=participant;details.type`, token),
    sportmonksFetch(`/seasons/${encodeURIComponent(seasonId)}?include=fixtures.participants;fixtures.scores`, token)
  ]);

  if (standingsResult.status === "fulfilled" && standingsResult.value.response.ok) {
    standings = normalizeStandings(standingsResult.value.payload);
    if (standings.length) usedData.push("standings");
    else warnings.push("Tabellunderlag saknas.");
  } else {
    logServerEvent("data fetch/cache error", {
      stage: "standings",
      status: standingsResult.status,
      httpStatus: standingsResult.value?.response?.status,
      message: standingsResult.reason?.message || standingsResult.value?.payload?.message || standingsResult.value?.text
    });
    warnings.push("Tabellen kunde inte hämtas från datakällan.");
  }

  if (fixturesResult.status === "fulfilled" && fixturesResult.value.response.ok) {
    fixtures = normalizeFixtures(fixturesResult.value.payload);
    if (fixtures.length) usedData.push("fixtures");
    else warnings.push("Matchunderlag saknas.");
  } else {
    logServerEvent("data fetch/cache error", {
      stage: "fixtures",
      status: fixturesResult.status,
      httpStatus: fixturesResult.value?.response?.status,
      message: fixturesResult.reason?.message || fixturesResult.value?.payload?.message || fixturesResult.value?.text
    });
    warnings.push("Matcher kunde inte hämtas från datakällan.");
  }

  const mentionedTeams = findMentionedTeams(question, standings);
  await Promise.all(
    mentionedTeams.map(async (team) => {
      const path = `/statistics/seasons/teams/${encodeURIComponent(team.teamId)}?include=details.type&filters=teamStatisticSeasons:${encodeURIComponent(seasonId)}&per_page=50`;
      const result = await sportmonksFetch(path, token);
      if (!result.response.ok) {
        logServerEvent("data fetch/cache error", {
          stage: "team_stats",
          teamId: team.teamId,
          httpStatus: result.response.status,
          message: result.payload?.message || result.payload?.error || result.text
        });
        warnings.push(`Lagstatistik kunde inte hämtas för ${team.teamName}.`);
        return;
      }
      const metrics = normalizeTeamStats(result.payload);
      if (Object.keys(metrics).length) {
        teamStats.push({
          teamId: team.teamId,
          teamName: team.teamName,
          metrics
        });
      } else {
        warnings.push(`Lagstatistik saknas för ${team.teamName}.`);
      }
    })
  );

  if (teamStats.length) usedData.push("team_stats");

  return {
    league,
    seasonId,
    standings: standings.slice(0, 16),
    fixtures: mentionedTeams.length
      ? Object.fromEntries(mentionedTeams.map((team) => [team.teamName, summarizeTeamFixtures(team.teamId, fixtures)]))
      : fixtures
          .filter((match) => match.isFinished && match.hasScore)
          .sort((a, b) => new Date(b.startingAt).getTime() - new Date(a.startingAt).getTime())
          .slice(0, 8),
    teamStats,
    warnings,
    usedData
  };
}

function fallbackAnswer(message, warnings = []) {
  return {
    answer: `Slutsats\n${message}\n\nAnalys\nUnderlaget räcker inte för en fotbollsanalys utan risk för gissningar.\n\nStatistik som stöd\nIngen tillförlitlig statistik kunde användas.\n\nOsäkerheter\n${warnings.length ? warnings.join(" ") : "Datakällan saknas eller svarade inte."}`,
    confidence: "low",
    usedData: [],
    warnings
  };
}

function normalizeAiPayload(payload, usedData, warnings) {
  const confidence = ["low", "medium", "high"].includes(payload?.confidence) ? payload.confidence : usedData.length >= 2 ? "medium" : "low";
  const sections = payload?.sections || {};
  const answer = [
    ["Slutsats", sections.conclusion || payload?.conclusion],
    ["Analys", sections.analysis || payload?.analysis],
    ["Statistik som stöd", sections.statistics || payload?.statistics],
    ["Osäkerheter", sections.uncertainties || payload?.uncertainties || warnings.join(" ")]
  ]
    .map(([title, text]) => `${title}\n${clean(text) || "Underlag saknas."}`)
    .join("\n\n");

  return {
    answer,
    confidence,
    usedData,
    warnings: Array.from(new Set([...(warnings || []), ...(Array.isArray(payload?.warnings) ? payload.warnings.map(clean).filter(Boolean) : [])]))
  };
}

async function askOpenAI({ question, context }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Du är en svensk fotbollsanalytiker för AllsvenskanAI. Använd bara data i JSON-underlaget. Hitta aldrig på statistik, tabellplaceringar, matcher eller orsaker. Om underlaget saknas ska du säga det tydligt. Svara på svenska och kortfattat. Returnera strikt JSON med confidence (low|medium|high), sections.conclusion, sections.analysis, sections.statistics, sections.uncertainties och warnings[]."
        },
        {
          role: "user",
          content: JSON.stringify({
            question,
            data: context
          })
        }
      ]
    })
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || text || "OpenAI-anropet misslyckades.");
  }

  const content = payload?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {
      confidence: "low",
      sections: {
        conclusion: "AI-svaret kunde inte tolkas.",
        analysis: clean(content),
        statistics: "Underlaget kunde inte struktureras.",
        uncertainties: "Svaret kom inte tillbaka som giltig JSON."
      },
      warnings: ["AI-svaret kunde inte tolkas som JSON."]
    };
  }
}

async function handleAsk(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Endast POST stöds." });
  }

  if (!process.env.OPENAI_API_KEY) {
    logServerEvent("missing OPENAI_API_KEY");
    return res.status(500).json({
      error: "OPENAI_API_KEY saknas på servern"
    });
  }

  if (isRateLimited(req)) {
    return res.status(429).json({
      error: "För många frågor just nu. Försök igen om en minut.",
      answer: "",
      confidence: "low",
      usedData: [],
      warnings: ["Rate limit uppnådd."]
    });
  }

  const { body, invalidBody } = readBody(req);
  if (invalidBody) {
    return res.status(400).json({
      error: "Ogiltig JSON i request body.",
      answer: "",
      confidence: "low",
      usedData: [],
      warnings: ["Ogiltig request body."]
    });
  }
  const question = clean(body?.question);
  const league = ["allsvenskan", "damallsvenskan"].includes(String(body?.league || "").toLowerCase())
    ? String(body.league).toLowerCase()
    : "allsvenskan";
  const requestedSeason = Number(body?.season);
  const seasonId = Number.isFinite(requestedSeason) && requestedSeason > 10000 ? requestedSeason : SEASONS[league] || SEASONS.allsvenskan;

  if (!question) {
    logServerEvent("invalid request body", { reason: "empty question" });
    return res.status(400).json({
      error: "Frågan får inte vara tom.",
      answer: "",
      confidence: "low",
      usedData: [],
      warnings: ["Tom fråga blockerades."]
    });
  }

  if (question.length > 500) {
    logServerEvent("invalid request body", { reason: "question too long", length: question.length });
    return res.status(400).json({
      error: "Frågan får vara max 500 tecken.",
      answer: "",
      confidence: "low",
      usedData: [],
      warnings: ["Frågan var längre än 500 tecken."]
    });
  }

  const cacheKey = JSON.stringify({ question: normalizeText(question), league, seasonId });
  const cached = answerCache.get(cacheKey);
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < ANSWER_CACHE_TTL_MS) {
    return res.status(200).json(cached.value);
  }

  const sportmonksToken = process.env.SPORTMONKS_API_TOKEN;
  if (!sportmonksToken) {
    const value = fallbackAnswer("Sportmonks-nyckeln saknas, så AllsvenskanAI har inget statistiskt underlag att analysera.", ["SPORTMONKS_API_TOKEN saknas på servern."]);
    safeCacheSet(cacheKey, value);
    return res.status(200).json(value);
  }

  let stage = "data";
  try {
    const context = await buildFootballContext({ question, league, seasonId, token: sportmonksToken });

    if (!context.usedData.length) {
      const value = fallbackAnswer("Underlaget saknas för den här frågan just nu.", context.warnings);
      safeCacheSet(cacheKey, value);
      return res.status(200).json(value);
    }

    stage = "openai";
    const aiPayload = await askOpenAI({ question, context });
    const value = normalizeAiPayload(aiPayload, context.usedData, context.warnings);
    safeCacheSet(cacheKey, value);
    return res.status(200).json(value);
  } catch (error) {
    logServerEvent(stage === "openai" ? "OpenAI error" : "data fetch/cache error", { stage, message: error.message });
    return res.status(500).json({
      error: stage === "openai" ? "AI-anropet misslyckades." : "Underlaget kunde inte hämtas.",
      details: clean(error.message).slice(0, 240),
      answer: "",
      confidence: "low",
      usedData: [],
      warnings: [stage === "openai" ? "AI-anropet misslyckades." : "Datahämtningen misslyckades."]
    });
  }
}

export default async function handler(req, res) {
  try {
    return await handleAsk(req, res);
  } catch (error) {
    logServerEvent("unhandled endpoint error", {
      message: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({
      error: "AI-endpointen fick ett oväntat serverfel.",
      details: clean(error?.message).slice(0, 240),
      answer: "",
      confidence: "low",
      usedData: [],
      warnings: ["Oväntat serverfel i AI-endpointen."]
    });
  }
}
