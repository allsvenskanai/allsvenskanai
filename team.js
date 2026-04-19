const teamContent = document.getElementById("team-content");
const SQUAD_TTL = 24 * 60 * 60 * 1000;
const TEAM_DETAILS_TTL = 15 * 60 * 1000;
let squadLoadStarted = false;
let currentTeamState = null;

function isTeamDebugMode() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.search.includes("debug=1");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatFact(value) {
  return value === null || value === undefined || value === "" ? "Saknas" : value;
}

function formatCapacity(value) {
  if (value === null || value === undefined || value === "") return "Saknas";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("sv-SE") : value;
}

function formatNumber(value, fallback = "Saknas") {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("sv-SE") : fallback;
}

function formatDecimal(value, digits = 2, fallback = "Saknas") {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits).replace(".", ",") : fallback;
}

function formatPercent(value, fallback = "Saknas") {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${formatDecimal(parsed, 1)}%` : fallback;
}

function formatSigned(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Saknas";
  return parsed > 0 ? `+${parsed}` : String(parsed);
}

function formatDateTime(value) {
  if (!value) return "Tid ej satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tid ej satt";
  return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatLeagueLabel(leagueKey) {
  return leagueKey === "damallsvenskan" ? "Damallsvenskan" : "Allsvenskan";
}

function safeReadStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeWriteStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Kunde inte spara cache", error);
  }
}

function positionSv(position) {
  const raw = String(position || "").toLowerCase();
  if (!raw) return "Position saknas";
  if (raw.includes("målvakt") || raw.includes("malvakt")) return "Målvakt";
  if (raw.includes("försvarare") || raw.includes("forsvarare")) return "Försvarare";
  if (raw.includes("mittfältare") || raw.includes("mittfaltare")) return "Mittfältare";
  if (raw.includes("anfallare")) return "Anfallare";
  if (raw.includes("goal") || raw.includes("keeper") || raw === "gk") return "Målvakt";
  if (raw.includes("def") || raw.includes("back")) return "Försvarare";
  if (raw.includes("mid") || raw.includes("cm") || raw.includes("dm") || raw.includes("am")) return "Mittfältare";
  if (raw.includes("att") || raw.includes("for") || raw.includes("wing") || raw.includes("striker")) return "Anfallare";
  return position;
}

function squadPositionOrder(position) {
  const normalized = positionSv(position);
  if (normalized === "Målvakt") return 1;
  if (normalized === "Försvarare") return 2;
  if (normalized === "Mittfältare") return 3;
  if (normalized === "Anfallare") return 4;
  return 9;
}

function cleanPlayerName(player) {
  const nested = player.player?.data || player.player || {};
  const nestedJoined = [nested.firstname || nested.first_name, nested.lastname || nested.last_name].map((part) => String(part || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const joined = [player.firstname || player.firstName, player.lastname || player.lastName].map((part) => String(part || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const candidates = [nested.name, nestedJoined, joined, nested.fullName, nested.full_name, nested.fullname, nested.display_name, player.fullName, player.full_name, player.fullname, player.display_name, player.name, player.player?.name, player.player?.full_name, player.player?.fullname];
  const name = candidates.map((value) => String(value || "").replace(/\s+/g, " ").trim()).find(Boolean);
  return name || "Okänd spelare";
}

function playerMeta(player) {
  const parts = [];
  if (player.flag) parts.push(`<img src="${escapeHtml(player.flag)}" alt="" class="squad-flag">`);
  if (player.age) parts.push(`<span>${player.age} år</span>`);
  parts.push(`<span>${positionSv(player.position)}</span>`);
  return parts.join("");
}

function normalizeSquadForUi(players) {
  return (players || [])
    .map((player) => ({
      ...player,
      name: cleanPlayerName(player),
      position: positionSv(player.position),
      positionOrder: player.positionOrder || squadPositionOrder(player.position),
      number: Number.isFinite(Number(player.number)) ? Number(player.number) : null,
      stats: player.stats || {}
    }))
    .filter((player) => player.id || player.name !== "Okänd spelare")
    .sort((a, b) => {
      if (a.positionOrder !== b.positionOrder) return a.positionOrder - b.positionOrder;
      const aNumber = a.number ?? 999;
      const bNumber = b.number ?? 999;
      if (aNumber !== bNumber) return aNumber - bNumber;
      return a.name.localeCompare(b.name, "sv");
    });
}

function getOpponent(teamId, match) {
  return Number(match.homeTeamId) === Number(teamId) ? match.awayTeam : match.homeTeam;
}

function renderForm(form) {
  if (!form?.length) return '<span class="muted">Saknas</span>';
  return `<div class="team-form">${form.slice(-5).map((result) => `<span class="form-dot ${result === "W" ? "win" : result === "L" ? "loss" : "draw"}">${result}</span>`).join("")}</div>`;
}

function renderMatchRow(match, teamId) {
  const opponent = getOpponent(teamId, match) || {};
  const opponentName = formatTeamName(opponent.name, opponent.id);
  const opponentLogo = formatTeamLogo(opponent.logo, opponent.id);
  const score = match.hasScore ? `${match.homeScore}–${match.awayScore}` : "Kommande";
  const result = LeagueData.getTeamResult(teamId, match);
  const resultClass = result === "W" ? "win" : result === "L" ? "loss" : result === "D" ? "draw" : "";
  const teamIsHome = Number(match.homeTeamId) === Number(teamId);

  return `
    <a class="team-match-row" href="/?match=${encodeURIComponent(match.id)}#matcher">
      <div class="team-match-opponent">
        ${opponentLogo ? `<img src="${escapeHtml(opponentLogo)}" alt="">` : '<span class="squad-avatar"></span>'}
        <div>
          <strong>${escapeHtml(opponentName)}</strong>
          <span>${teamIsHome ? "Hemma" : "Borta"} • ${formatDateTime(match.startingAt)}</span>
        </div>
      </div>
      <div class="team-match-score ${resultClass}">
        <strong>${score}</strong>
        ${result ? `<span>${result}</span>` : ""}
      </div>
    </a>
  `;
}

function squadCacheKey(teamId) {
  return `squad_v2_${teamId}`;
}

function teamDetailsCacheKey(teamId, season) {
  return `team_details_v6_${teamId}_${season || "current"}`;
}

function getFreshCachedSquad(teamId) {
  const cached = safeReadStorage(squadCacheKey(teamId));
  if (cached?.players && cached?.fetchedAt && Date.now() - cached.fetchedAt < SQUAD_TTL) return normalizeSquadForUi(cached.players);
  return null;
}

async function loadSquad(teamId, snapshot) {
  const key = squadCacheKey(teamId);
  const cached = getFreshCachedSquad(teamId);
  if (cached) return cached;

  const params = new URLSearchParams({ id: teamId, league: snapshot?.leagueKey || "allsvenskan", season: snapshot?.season || "" });
  const response = await fetch(`/api/squad?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Kunde inte hämta truppen.");

  const players = normalizeSquadForUi(data.players || []);
  safeWriteStorage(key, { fetchedAt: Date.now(), players });
  return players;
}

async function loadTeamDetails(teamId, snapshot) {
  const key = teamDetailsCacheKey(teamId, snapshot?.season);
  const cached = safeReadStorage(key);
  if (cached?.team && cached?.fetchedAt && Date.now() - cached.fetchedAt < TEAM_DETAILS_TTL) return cached.team;

  const params = new URLSearchParams({ id: teamId, league: snapshot?.leagueKey || "allsvenskan", season: snapshot?.season || "", stats: "1" });
  const response = await fetch(`/api/team?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.details || data?.error || "Kunde inte hämta laget.");
  safeWriteStorage(key, { fetchedAt: Date.now(), team: data.team });
  return data.team;
}

function metricValue(metrics, keys) {
  for (const key of keys) {
    const value = metrics?.[key];
    if (value !== null && value !== undefined && value !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

function validateMetricValue(label, raw, options = {}) {
  const parsed = Number(raw);
  const result = {
    label,
    raw,
    normalized: null,
    valid: false,
    reason: ""
  };

  if (!Number.isFinite(parsed)) {
    result.reason = "missing_or_not_numeric";
    return result;
  }

  let normalized = parsed;
  if (options.kind === "percentage") {
    if (normalized > 0 && normalized <= 1) normalized *= 100;
    if (normalized < 0 || normalized > 100) {
      result.reason = "invalid_percentage_range";
      if (isTeamDebugMode()) console.warn("TEAM STAT CARD VALIDATION:", result);
      return result;
    }
  }

  if (options.integer && !Number.isInteger(normalized)) {
    normalized = Math.round(normalized);
  }

  if (options.min !== undefined && normalized < options.min) {
    result.reason = "below_min";
    if (isTeamDebugMode()) console.warn("TEAM STAT CARD VALIDATION:", result);
    return result;
  }

  if (options.max !== undefined && normalized > options.max) {
    result.reason = "above_max";
    if (isTeamDebugMode()) console.warn("TEAM STAT CARD VALIDATION:", result);
    return result;
  }

  result.normalized = normalized;
  result.valid = true;
  result.reason = "ok";
  if (isTeamDebugMode()) console.log("TEAM STAT CARD VALIDATION:", result);
  return result;
}

function missingMetricKeys(metrics, keys) {
  return keys.filter((key) => metrics?.[key] === null || metrics?.[key] === undefined || metrics?.[key] === "");
}

function addMetric(list, label, value, formatter = formatNumber, hint = "", options = {}) {
  const validation = validateMetricValue(label, value, options);
  if (!validation.valid) return;
  list.push({ label, value: formatter(validation.normalized), raw: value, normalized: validation.normalized, hint });
}

function normalizePossessionMetric(raw, played) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed > 100 && played > 1) {
    const average = parsed / played;
    if (average >= 0 && average <= 100) {
      if (isTeamDebugMode()) {
        console.log("TEAM POSSESSION NORMALIZED FROM ACCUMULATED VALUE:", {
          raw,
          played,
          normalized: average
        });
      }
      return average;
    }
  }
  return parsed;
}

function playedFixtures(teamId, snapshot) {
  return LeagueData.getTeamFixtures(teamId, snapshot).filter((match) => match.isFinished && match.hasScore);
}

function cleanSheets(teamId, snapshot) {
  return playedFixtures(teamId, snapshot).filter((match) => {
    const conceded = Number(match.homeTeamId) === Number(teamId) ? Number(match.awayScore) : Number(match.homeScore);
    return conceded === 0;
  }).length;
}

function recordFor(teamId, matches) {
  return matches.reduce((acc, match) => {
    const result = LeagueData.getTeamResult(teamId, match);
    const scored = Number(match.homeTeamId) === Number(teamId) ? Number(match.homeScore) : Number(match.awayScore);
    const conceded = Number(match.homeTeamId) === Number(teamId) ? Number(match.awayScore) : Number(match.homeScore);
    acc.played += 1;
    acc.goalsFor += scored;
    acc.goalsAgainst += conceded;
    if (result === "W") { acc.wins += 1; acc.points += 3; }
    if (result === "D") { acc.draws += 1; acc.points += 1; }
    if (result === "L") acc.losses += 1;
    return acc;
  }, { played: 0, wins: 0, draws: 0, losses: 0, points: 0, goalsFor: 0, goalsAgainst: 0 });
}

function coverageAllows(team, family) {
  const value = team?.statistics?.coverage?.available?.[family];
  return value !== false;
}

const TEAM_STAT_GROUP_TITLES = {
  overview: "Översikt",
  attack: "Anfall",
  passing: "Passning / bollinnehav",
  defense: "Försvar",
  discipline: "Disciplin",
  homeaway: "Hemma / borta",
  timing: "Tidsmönster"
};

const TEAM_API_METRICS = [
  { group: "attack", label: "Skott", keys: ["SHOTS", "TOTAL_SHOTS", "SHOTS_TOTAL", "SHOTS_TOTALS"], options: { integer: true, min: 0, max: 1200 } },
  { group: "attack", label: "Skott på mål", keys: ["SHOTS_ON_TARGET", "SHOTS_ON_GOAL", "ON_TARGET", "SHOTS_ON_GOALS"], options: { integer: true, min: 0, max: 1200 } },
  { group: "attack", label: "Skott utanför", keys: ["SHOTS_OFF_TARGET", "SHOTS_OFF_GOAL", "OFF_TARGET", "SHOTS_OFF_GOALS"], options: { integer: true, min: 0, max: 1200 } },
  { group: "attack", label: "Big chances", keys: ["BIG_CHANCES", "BIG_CHANCE_CREATED"], options: { integer: true, min: 0, max: 500 } },
  { group: "attack", label: "Missade big chances", keys: ["BIG_CHANCES_MISSED", "BIG_CHANCE_MISSED"], options: { integer: true, min: 0, max: 500 } },
  { group: "attack", label: "xG", keys: ["EXPECTED_GOALS", "XG"], formatter: (v) => formatDecimal(v, 2), options: { min: 0, max: 150 } },
  { group: "attack", label: "Straffmål", keys: ["PENALTY_GOALS", "PENALTIES_SCORED", "PENALTIES"], options: { integer: true, min: 0, max: 100 } },
  { group: "attack", label: "Fasta situationer", keys: ["SET_PIECE_GOALS", "SETPIECE_GOALS"], options: { integer: true, min: 0, max: 100 } },
  { group: "passing", label: "Bollinnehav", keys: ["BALL_POSSESSION", "POSSESSION"], formatter: formatPercent, options: { kind: "percentage" }, normalize: (value, context) => normalizePossessionMetric(value, context.played) },
  { group: "passing", label: "Passningar", keys: ["PASSES", "TOTAL_PASSES", "PASSES_TOTAL"], options: { integer: true, min: 0, max: 25000 } },
  { group: "passing", label: "Passningar / match", keys: ["PASSES", "TOTAL_PASSES", "PASSES_TOTAL"], formatter: (v) => formatDecimal(v, 1), options: { min: 0, max: 1500 }, normalize: (value, context) => context.played > 0 ? value / context.played : null },
  { group: "passing", label: "Passnings%", keys: ["PASS_ACCURACY", "PASSES_ACCURACY", "PASSING_ACCURACY"], formatter: formatPercent, options: { kind: "percentage" } },
  { group: "passing", label: "Nyckelpass", keys: ["KEY_PASSES", "KEYPASS", "KEY_PASS"], options: { integer: true, min: 0, max: 1000 } },
  { group: "passing", label: "Inlägg", keys: ["CROSSES", "TOTAL_CROSSES"], options: { integer: true, min: 0, max: 2500 } },
  { group: "passing", label: "Lyckade inlägg", keys: ["SUCCESSFUL_CROSSES", "ACCURATE_CROSSES"], options: { integer: true, min: 0, max: 2500 } },
  { group: "passing", label: "Långbollar", keys: ["LONG_BALLS", "TOTAL_LONG_BALLS"], options: { integer: true, min: 0, max: 2500 } },
  { group: "passing", label: "Lyckade långbollar", keys: ["SUCCESSFUL_LONG_BALLS", "ACCURATE_LONG_BALLS"], options: { integer: true, min: 0, max: 2500 } },
  { group: "defense", label: "Tacklingar", keys: ["TACKLES"], options: { integer: true, min: 0, max: 2500 } },
  { group: "defense", label: "Interceptions", keys: ["INTERCEPTIONS"], options: { integer: true, min: 0, max: 2500 } },
  { group: "defense", label: "Rensningar", keys: ["CLEARANCES"], options: { integer: true, min: 0, max: 3000 } },
  { group: "defense", label: "Blockerade skott", keys: ["BLOCKED_SHOTS", "BLOCKS"], options: { integer: true, min: 0, max: 1500 } },
  { group: "defense", label: "Vunna dueller", keys: ["DUELS_WON"], options: { integer: true, min: 0, max: 5000 } },
  { group: "defense", label: "Luftdueller vunna", keys: ["AERIAL_DUELS_WON", "AERIALS_WON"], options: { integer: true, min: 0, max: 2500 } },
  { group: "defense", label: "Räddningar", keys: ["SAVES"], options: { integer: true, min: 0, max: 1000 } },
  { group: "defense", label: "xGA", keys: ["EXPECTED_GOALS_AGAINST", "XGA"], formatter: (v) => formatDecimal(v, 2), options: { min: 0, max: 150 } },
  { group: "discipline", label: "Gula kort", keys: ["YELLOWCARDS", "YELLOW_CARDS"], options: { integer: true, min: 0, max: 250 } },
  { group: "discipline", label: "Röda kort", keys: ["REDCARDS", "RED_CARDS"], options: { integer: true, min: 0, max: 50 } },
  { group: "discipline", label: "Frisparkar orsakade", keys: ["FOULS", "FOULS_COMMITTED"], options: { integer: true, min: 0, max: 2500 } },
  { group: "discipline", label: "Frisparkar vunna", keys: ["FOULS_DRAWN"], options: { integer: true, min: 0, max: 2500 } },
  { group: "discipline", label: "Offside", keys: ["OFFSIDES"], options: { integer: true, min: 0, max: 500 } },
  { group: "timing", label: "Mål 0–15", keys: ["GOALS_0_15", "GOALS_FOR_0_15"], options: { integer: true, min: 0, max: 100 } },
  { group: "timing", label: "Mål 16–30", keys: ["GOALS_16_30", "GOALS_FOR_16_30"], options: { integer: true, min: 0, max: 100 } },
  { group: "timing", label: "Mål 31–45", keys: ["GOALS_31_45", "GOALS_FOR_31_45"], options: { integer: true, min: 0, max: 100 } },
  { group: "timing", label: "Mål 46–60", keys: ["GOALS_46_60", "GOALS_FOR_46_60"], options: { integer: true, min: 0, max: 100 } },
  { group: "timing", label: "Mål 61–75", keys: ["GOALS_61_75", "GOALS_FOR_61_75"], options: { integer: true, min: 0, max: 100 } },
  { group: "timing", label: "Mål 76–90", keys: ["GOALS_76_90", "GOALS_FOR_76_90"], options: { integer: true, min: 0, max: 100 } }
];

function addApiMetric(groups, descriptor, metrics, context, hidden) {
  const raw = metricValue(metrics, descriptor.keys);
  const value = descriptor.normalize ? descriptor.normalize(raw, context) : raw;
  const before = groups[descriptor.group].length;
  addMetric(groups[descriptor.group], descriptor.label, value, descriptor.formatter || formatNumber, "", descriptor.options || {});
  if (groups[descriptor.group].length === before) {
    hidden.push({ label: descriptor.label, keys: descriptor.keys, raw, reason: raw === null ? "missing" : "invalid" });
  }
}

function buildTeamStatGroups(team, standing, snapshot, form) {
  const metrics = team?.statistics?.metrics || {};
  const hiddenMetrics = [];
  if (isTeamDebugMode()) {
    console.log("TEAM PAGE STATS SOURCE:", {
      teamId: team?.id,
      league: snapshot?.leagueKey,
      season: snapshot?.season,
      coverage: team?.statistics?.coverage || null,
      sourceObject: team?.statistics,
      metrics
    });
  }
  const played = Number(standing?.played || 0);
  const goalsFor = Number(standing?.goalsFor || 0);
  const goalsAgainst = Number(standing?.goalsAgainst || 0);
  const allPlayed = playedFixtures(team.id, snapshot);
  const homeRecord = recordFor(team.id, allPlayed.filter((match) => Number(match.homeTeamId) === Number(team.id)));
  const awayRecord = recordFor(team.id, allPlayed.filter((match) => Number(match.awayTeamId) === Number(team.id)));

  const groupsByKey = { overview: [], attack: [], passing: [], defense: [], discipline: [], homeaway: [], timing: [] };
  const overview = groupsByKey.overview;
  addMetric(overview, "Placering", standing?.position);
  addMetric(overview, "Poäng", standing?.points);
  addMetric(overview, "Vinster", standing?.won);
  addMetric(overview, "Oavgjorda", standing?.draw);
  addMetric(overview, "Förluster", standing?.lost);
  addMetric(overview, "Målskillnad", standing?.goalDiff, formatSigned);
  addMetric(overview, "Gjorda mål", standing?.goalsFor);
  addMetric(overview, "Insläppta mål", standing?.goalsAgainst);
  addMetric(overview, "Poäng / match", played > 0 ? standing.points / played : null, (v) => formatDecimal(v, 2));
  addMetric(overview, "Hållna nollor", cleanSheets(team.id, snapshot));

  const attack = groupsByKey.attack;
  addMetric(attack, "Gjorda mål", goalsFor, formatNumber, "", { integer: true, min: 0 });
  addMetric(attack, "Mål / match", played > 0 ? goalsFor / played : null, (v) => formatDecimal(v, 2), "", { min: 0 });

  const defense = groupsByKey.defense;
  addMetric(defense, "Insläppta mål", goalsAgainst, formatNumber, "", { integer: true, min: 0 });
  addMetric(defense, "Hållna nollor", cleanSheets(team.id, snapshot), formatNumber, "", { integer: true, min: 0, max: played || 30 });

  if (coverageAllows(team, "fixtureStatistics")) {
    TEAM_API_METRICS.forEach((descriptor) => addApiMetric(groupsByKey, descriptor, metrics, { played }, hiddenMetrics));
  } else {
    hiddenMetrics.push({ family: "fixtureStatistics", reason: "coverage_false" });
  }

  const homeAway = groupsByKey.homeaway;
  addMetric(homeAway, "Hemma", homeRecord.played, (v) => `${homeRecord.wins}-${homeRecord.draws}-${homeRecord.losses}`);
  addMetric(homeAway, "Borta", awayRecord.played, (v) => `${awayRecord.wins}-${awayRecord.draws}-${awayRecord.losses}`);
  addMetric(homeAway, "Hemmapoäng", homeRecord.points);
  addMetric(homeAway, "Bortapoäng", awayRecord.points);
  addMetric(homeAway, "Mål hemma", homeRecord.goalsFor);
  addMetric(homeAway, "Mål borta", awayRecord.goalsFor);

  const groups = [
    { key: "overview", title: TEAM_STAT_GROUP_TITLES.overview, metrics: groupsByKey.overview, after: `<div class="team-stat-form-row"><span>Form</span>${renderForm(form)}</div>` },
    { key: "attack", title: TEAM_STAT_GROUP_TITLES.attack, metrics: groupsByKey.attack },
    { key: "passing", title: TEAM_STAT_GROUP_TITLES.passing, metrics: groupsByKey.passing },
    { key: "defense", title: TEAM_STAT_GROUP_TITLES.defense, metrics: groupsByKey.defense },
    { key: "discipline", title: TEAM_STAT_GROUP_TITLES.discipline, metrics: groupsByKey.discipline },
    { key: "homeaway", title: TEAM_STAT_GROUP_TITLES.homeaway, metrics: groupsByKey.homeaway },
    { key: "timing", title: TEAM_STAT_GROUP_TITLES.timing, metrics: groupsByKey.timing }
  ].filter((group) => group.metrics.length || group.after);

  if (isTeamDebugMode()) {
    console.log("TEAM PAGE STATS CATEGORY MAPPING:", {
      teamId: team?.id,
      mapped: Object.fromEntries(groups.map((group) => [group.key, group.metrics.map((metric) => metric.label)])),
      missing: {
        attack: missingMetricKeys(metrics, ["SHOTS", "TOTAL_SHOTS", "SHOTS_ON_TARGET", "SHOTS_OFF_TARGET"]),
        passing: missingMetricKeys(metrics, ["BALL_POSSESSION", "PASSES", "TOTAL_PASSES", "PASS_ACCURACY"]),
        defense: missingMetricKeys(metrics, ["TACKLES", "INTERCEPTIONS"]),
        discipline: missingMetricKeys(metrics, ["YELLOW_CARDS", "RED_CARDS", "FOULS", "OFFSIDES"])
      },
      hiddenMetrics
    });
  }

  return groups;
}

function renderMetricGrid(metrics) {
  return `<div class="team-metric-grid">${metrics.map((metric) => `
    <div class="team-metric-card">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      ${metric.hint ? `<small>${escapeHtml(metric.hint)}</small>` : ""}
    </div>
  `).join("")}</div>`;
}

function renderTeamStatsHub(team, standing, snapshot, form) {
  if (!standing && !team?.statistics?.hasStatistics) return '<p class="team-empty">Statistik uppdateras snart.</p>';
  const groups = buildTeamStatGroups(team, standing, snapshot, form);
  return `<div class="team-stat-groups">${groups.map((group) => `
    <article class="team-stat-group" id="lagstat-${group.key}">
      <h4>${group.title}</h4>
      ${group.metrics.length ? renderMetricGrid(group.metrics) : ""}
      ${group.after || ""}
    </article>
  `).join("")}</div>`;
}

function playerStat(player, key) {
  const value = player?.stats?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const PLAYER_STAT_CONFIG = [
  { key: "appearances", label: "Matcher", short: "M", top: true, options: { integer: true, min: 0, max: 60 } },
  { key: "starts", label: "Starter", short: "Start", top: true, options: { integer: true, min: 0, max: 60 } },
  { key: "minutes", label: "Minuter", short: "Min", top: true, options: { integer: true, min: 0, max: 6000 } },
  { key: "goals", label: "Mål", short: "Mål", top: true, options: { integer: true, min: 0, max: 80 } },
  { key: "assists", label: "Assist", short: "A", top: true, options: { integer: true, min: 0, max: 80 } },
  { key: "rating", label: "Rating", short: "Rat", top: true, formatter: (v) => formatDecimal(v, 2), options: { min: 0, max: 10 } },
  { key: "shots", label: "Skott", short: "Skott", top: true, options: { integer: true, min: 0, max: 400 } },
  { key: "shotsOnTarget", label: "Skott på mål", short: "SOT", top: true, options: { integer: true, min: 0, max: 300 } },
  { key: "passAccuracyPct", label: "Passnings%", short: "Pass%", formatter: (v) => formatDecimal(v, 1), options: { kind: "percentage" } },
  { key: "keyPasses", label: "Nyckelpass", short: "Nyckel", top: true, options: { integer: true, min: 0, max: 300 } },
  { key: "chancesCreated", label: "Skapade chanser", short: "Chanser", top: true, options: { integer: true, min: 0, max: 300 } },
  { key: "tackles", label: "Tacklingar", short: "Tack", top: true, options: { integer: true, min: 0, max: 500 } },
  { key: "interceptions", label: "Interceptions", short: "Int", top: true, options: { integer: true, min: 0, max: 500 } },
  { key: "saves", label: "Räddningar", short: "Rädd", top: true, options: { integer: true, min: 0, max: 300 } },
  { key: "cleanSheets", label: "Hållna nollor", short: "Nollor", options: { integer: true, min: 0, max: 60 } },
  { key: "yellowCards", label: "Gula kort", short: "G", top: true, options: { integer: true, min: 0, max: 30 } },
  { key: "redCards", label: "Röda kort", short: "R", top: true, options: { integer: true, min: 0, max: 10 } }
];

function validatedPlayerStat(player, config) {
  const validation = validateMetricValue(config.label, playerStat(player, config.key), config.options || {});
  return validation.valid ? validation.normalized : null;
}

function availablePlayerStatConfigs(players) {
  return PLAYER_STAT_CONFIG.filter((config) => players.some((player) => validatedPlayerStat(player, config) !== null));
}

function renderPlayerTopLists(players) {
  const lists = availablePlayerStatConfigs(players).filter((config) => config.top).map((config) => {
    const rows = players
      .map((player) => ({ player, value: validatedPlayerStat(player, config) }))
      .filter((row) => row.value !== null && row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    return { key: config.key, label: config.label, formatter: config.formatter || formatNumber, rows };
  }).filter((list) => list.rows.length);

  if (!lists.length) return '<p class="team-empty">Spelarstatistik uppdateras snart. Truppen visas nedan.</p>';

  return `<div class="player-toplist-grid">${lists.map((list) => `
    <article class="player-toplist-card">
      <h4>${list.label}</h4>
      ${list.rows.map(({ player, value }, index) => `
        <a href="/?player=${encodeURIComponent(player.id || "")}#spelare" class="player-toplist-row">
          <span>${index + 1}</span>
          <strong>${escapeHtml(player.name)}</strong>
          <em>${escapeHtml(list.formatter(value))}</em>
        </a>
      `).join("")}
    </article>
  `).join("")}</div>`;
}

function renderPlayerStatsTable(players) {
  const statColumns = availablePlayerStatConfigs(players);

  return `<div class="player-stats-table-wrap">
    <table class="player-stats-table">
      <thead><tr><th>Spelare</th><th>Pos</th><th>#</th><th>Ålder</th>${statColumns.map((config) => `<th>${escapeHtml(config.short || config.label)}</th>`).join("")}</tr></thead>
      <tbody>${players.map((player) => `
        <tr>
          <td><a href="/?player=${encodeURIComponent(player.id || "")}#spelare">${escapeHtml(player.name)}</a></td>
          <td>${escapeHtml(positionSv(player.position))}</td>
          <td>${player.number || "-"}</td>
          <td>${player.age || "-"}</td>
          ${statColumns.map((config) => {
            const value = validatedPlayerStat(player, config);
            const formatter = config.formatter || (config.options?.kind === "percentage" ? (v) => formatDecimal(v, 1) : formatNumber);
            return `<td>${value === null ? "-" : escapeHtml(formatter(value))}</td>`;
          }).join("")}
        </tr>
      `).join("")}</tbody>
    </table>
  </div>`;
}

function renderPlayerStats(players) {
  if (!players.length) return '<p class="team-empty">Ingen spelarstatistik tillgänglig just nu.</p>';
  const available = availablePlayerStatConfigs(players);
  if (isTeamDebugMode()) {
    console.log("TEAM PLAYER STATS MAPPING:", {
      available: available.map((config) => config.key),
      hidden: PLAYER_STAT_CONFIG.filter((config) => !available.includes(config)).map((config) => config.key),
      sample: players.slice(0, 3).map((player) => ({ id: player.id, name: player.name, stats: player.stats }))
    });
  }
  if (!available.length) return '<p class="team-empty">Spelarstatistik uppdateras snart. Truppen visas nedan.</p>';
  return `${renderPlayerTopLists(players)}${renderPlayerStatsTable(players)}`;
}

function renderSquad(players) {
  if (!players.length) return '<p class="team-empty">Ingen truppdata tillgänglig just nu.</p>';
  return `<div class="squad-table">${players.map((player) => {
    const tag = player.id ? "a" : "div";
    const href = player.id ? ` href="/?player=${encodeURIComponent(player.id)}#spelare"` : "";
    return `<${tag} class="squad-row"${href}>
      <div class="squad-player-main">
        ${player.photo ? `<img src="${escapeHtml(player.photo)}" alt="">` : '<span class="squad-avatar"></span>'}
        <div class="squad-player-copy"><strong>${escapeHtml(player.name || "Okänd spelare")}</strong><div class="squad-meta">${playerMeta(player)}</div></div>
      </div>
      <div class="squad-row-right"><em>#${player.number || "–"}</em>${player.id ? '<span class="squad-arrow">›</span>' : ""}</div>
    </${tag}>`;
  }).join("")}</div>`;
}

function renderSquadSkeleton(rows = 6) {
  return `<div class="squad-table squad-skeleton" aria-label="Laddar trupp">${Array.from({ length: rows }).map(() => `
    <div class="squad-row skeleton-row"><div class="squad-player-main"><span class="squad-avatar skeleton-pulse"></span><div class="squad-player-copy"><strong class="skeleton-line wide"></strong><span class="skeleton-line medium"></span></div></div><div class="squad-row-right"><em class="skeleton-line short"></em></div></div>
  `).join("")}</div>`;
}

function renderTeamSkeleton() {
  return "<p>Laddar lag...</p>";
}

async function hydrateSquadAndPlayerStats(teamId, snapshot) {
  const squadContainer = document.getElementById("team-squad-content");
  const playerStatsContainer = document.getElementById("team-player-stats-content");
  if (!squadContainer || squadLoadStarted) return;
  squadLoadStarted = true;

  try {
    const players = await loadSquad(teamId, snapshot);
    squadContainer.innerHTML = renderSquad(players);
    if (playerStatsContainer && coverageAllows(currentTeamState?.team, "playerStatistics")) {
      playerStatsContainer.innerHTML = renderPlayerStats(players);
    }
    const count = document.getElementById("team-squad-count");
    if (count) count.textContent = players.length ? `${players.length} spelare` : "Uppdateras";
  } catch (error) {
    console.warn("Kunde inte hämta trupp", error);
    squadContainer.innerHTML = '<p class="team-empty">Trupp kunde inte hämtas just nu.</p>';
    if (playerStatsContainer) playerStatsContainer.innerHTML = '<p class="team-empty">Spelarstatistik kunde inte hämtas just nu.</p>';
    const count = document.getElementById("team-squad-count");
    if (count) count.textContent = "Fel";
  }
}

async function loadTeamContext(teamId, preferredLeague) {
  const primaryLeague = LeagueData.LEAGUES[preferredLeague] ? preferredLeague : "allsvenskan";
  const primarySnapshot = await LeagueData.loadLeagueSnapshot(primaryLeague);
  if (LeagueData.getTeamStanding(teamId, primarySnapshot) || LeagueData.getTeamFixtures(teamId, primarySnapshot).length) return primarySnapshot;
  const otherLeagueKeys = Object.keys(LeagueData.LEAGUES).filter((key) => key !== primaryLeague);
  const snapshots = [primarySnapshot];
  for (const league of otherLeagueKeys) snapshots.push(await LeagueData.loadLeagueSnapshot(league));
  return LeagueData.findLeagueForTeam(teamId, snapshots);
}

function buildFallbackTeam(teamId, standing, snapshot) {
  const fromTeams = snapshot?.derived?.teams?.find((team) => Number(team.id) === Number(teamId));
  return { id: Number(teamId), name: standing?.teamName || fromTeams?.name || "Okänt lag", logo: standing?.logo || fromTeams?.logo || "", city: null, venue: { name: null, capacity: null }, founded: null, chairman: null, sportingDirector: null, coach: null, statistics: { hasStatistics: false, metrics: {} } };
}

function renderTeam(team, snapshot) {
  const teamId = team.id;
  const cachedSquad = getFreshCachedSquad(teamId);
  const standing = LeagueData.getTeamStanding(teamId, snapshot);
  const latestMatches = LeagueData.getTeamRecentMatches(teamId, snapshot, 5);
  const upcomingMatches = LeagueData.getTeamUpcomingMatches(teamId, snapshot, 5);
  const form = LeagueData.getTeamForm(teamId, snapshot, 5);
  const playerStatsSupported = coverageAllows(team, "playerStatistics");
  const facts = [["Stad", formatFact(team.city)], ["Arena", formatFact(team.venue?.name)], ["Arenakapacitet", formatCapacity(team.venue?.capacity)], ["Bildat", formatFact(team.founded)], ["Styrelseordförande", formatFact(team.chairman)], ["Sportchef", formatFact(team.sportingDirector)], ["Tränare", formatFact(team.coach)]];

  teamContent.innerHTML = `
    <div class="team-hero expanded">
      <img src="${escapeHtml(formatTeamLogo(team.logo, team.id))}" alt="" class="team-hero-logo">
      <div class="team-hero-copy">
        <p class="eyebrow">${formatLeagueLabel(snapshot?.leagueKey)} 2026</p>
        <h2>${escapeHtml(formatTeamName(team.name, team.id))}</h2>
        <div class="team-summary-grid">
          <div class="team-summary-stat"><span>Placering</span><strong>${standing?.position ? `${standing.position}:a` : "Saknas"}</strong></div>
          <div class="team-summary-stat"><span>Poäng</span><strong>${standing ? formatNumber(standing.points) : "Saknas"}</strong></div>
          <div class="team-summary-stat"><span>Målskillnad</span><strong>${standing ? formatSigned(standing.goalDiff) : "Saknas"}</strong></div>
          <div class="team-summary-stat"><span>Form</span>${renderForm(form)}</div>
        </div>
      </div>
    </div>

    <nav class="team-subnav" aria-label="Lagsidans sektioner">
      <a href="#oversikt">Översikt</a><a href="#lagstatistik">Lagstatistik</a><a href="#spelarstatistik">Spelarstatistik</a><a href="#trupp">Trupp</a><a href="#matcher">Matcher</a><a href="#form">Form & trender</a>
    </nav>

    <section class="team-section team-facts-card" id="oversikt">
      <div class="team-section-header"><h3>Fakta</h3></div>
      <div class="team-facts-grid">${facts.map(([label, value]) => `<div class="team-fact"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
    </section>

    <section class="team-section" id="lagstatistik">
      <div class="team-section-header"><h3>Lagstatistik</h3><span>Säsong 2026</span></div>
      ${renderTeamStatsHub(team, standing, snapshot, form)}
    </section>

    <section class="team-section" id="spelarstatistik">
      <div class="team-section-header"><h3>Spelarstatistik</h3><span>Interna topplistor</span></div>
      <div id="team-player-stats-content">${!playerStatsSupported ? '<p class="team-empty">Spelarstatistik stöds inte för den här säsongen ännu.</p>' : cachedSquad ? renderPlayerStats(cachedSquad) : renderSquadSkeleton(4)}</div>
    </section>

    <section class="team-section" id="trupp">
      <div class="team-section-header"><h3>Trupp</h3><span id="team-squad-count">${cachedSquad ? `${cachedSquad.length} spelare` : "Laddar"}</span></div>
      <div id="team-squad-content">${cachedSquad ? renderSquad(cachedSquad) : renderSquadSkeleton()}</div>
    </section>

    <section class="team-section" id="matcher">
      <div class="team-split-grid">
        <article><div class="team-section-header"><h3>Senaste matcher</h3><span>5 senaste</span></div>${latestMatches.length ? latestMatches.map((match) => renderMatchRow(match, teamId)).join("") : '<p class="team-empty">Inga matcher ännu.</p>'}</article>
        <article><div class="team-section-header"><h3>Kommande matcher</h3><span>Nästa matcher</span></div>${upcomingMatches.length ? upcomingMatches.map((match) => renderMatchRow(match, teamId)).join("") : '<p class="team-empty">Inga matcher ännu.</p>'}</article>
      </div>
    </section>

    <section class="team-section" id="form">
      <div class="team-section-header"><h3>Form & trender</h3><span>Byggt från matchdata</span></div>
      ${renderTeamStatsHub(team, standing, snapshot, form)}
    </section>
  `;

  if (!cachedSquad) hydrateSquadAndPlayerStats(teamId, snapshot);
}

async function loadTeam() {
  const params = new URLSearchParams(window.location.search);
  const teamId = params.get("id");
  const preferredLeague = params.get("league") || "allsvenskan";
  if (!teamId) { teamContent.innerHTML = "<p>Inget lag valt.</p>"; return; }

  teamContent.innerHTML = renderTeamSkeleton();

  try {
    const snapshot = await loadTeamContext(teamId, preferredLeague);
    const standing = LeagueData.getTeamStanding(teamId, snapshot);
    const fallback = buildFallbackTeam(teamId, standing, snapshot);
    const details = await loadTeamDetails(teamId, snapshot).catch((error) => {
      console.warn("Kunde inte hämta djup lagdata, använder snapshot-data", error);
      return fallback;
    });
    currentTeamState = { team: { ...fallback, ...details }, snapshot };
    renderTeam(currentTeamState.team, snapshot);
  } catch (error) {
    teamContent.innerHTML = `<p>Kunde inte hämta laget.</p><p class="error-detail">${escapeHtml(error.message || "Något gick fel när laget skulle hämtas.")}</p>`;
    console.error(error);
  }
}

loadTeam();
