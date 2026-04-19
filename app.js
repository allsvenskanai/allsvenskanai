const buttons = document.querySelectorAll(".league-btn");
const heroHighlight = document.getElementById("hero-highlight");
const heroMiniStats = document.getElementById("hero-mini-stats");
const standingsContent = document.getElementById("standings-content");
const liveMatchesContent = document.getElementById("live-matches-content");
const upcomingMatchesContent = document.getElementById("upcoming-matches-content");
const recentResultsContent = document.getElementById("recent-results-content");
const teamsGrid = document.getElementById("teams-grid");
const leagueSnapshotCard = document.getElementById("league-snapshot-card");
const attackCard = document.getElementById("attack-card");
const defenseCard = document.getElementById("defense-card");

let currentLeague = "allsvenskan";
const scorerCache = new Map();
const scorerInFlight = new Map();
const SCORER_TTL = 10 * 60 * 1000;

function isDebugMode() {
  return location.hostname === "localhost" || location.search.includes("debug=1");
}

function activeScorerLeagueId(league) {
  return league === "damallsvenskan" ? 576 : 573;
}

function leagueLabel() {
  return currentLeague === "allsvenskan" ? "Allsvenskan" : "Damallsvenskan";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emptyState(text) {
  return `<p class="empty-state">${text}</p>`;
}

function scorerCacheKey(league) {
  const season = window.LeagueData?.LEAGUES?.[league]?.season || "2026";
  return `${league}:${season}`;
}

function scorerSkeleton() {
  return `
    <div class="dashboard-skeleton-list">
      <span>Laddar skytteliga</span>
      <i></i>
    </div>
  `;
}

async function loadTopScorers(league) {
  const season = window.LeagueData?.LEAGUES?.[league]?.season;
  const leagueId = activeScorerLeagueId(league);
  const key = scorerCacheKey(league);
  const cached = scorerCache.get(key);

  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < SCORER_TTL) {
    return cached.data;
  }

  if (scorerInFlight.has(key)) {
    return scorerInFlight.get(key);
  }

  const params = new URLSearchParams({ league });
  if (season) params.set("season", season);
  if (isDebugMode()) params.set("debug", "1");
  const endpoint = `/api/scorers?${params.toString()}`;

  if (isDebugMode()) {
    console.log("Top scorers request", {
      league,
      leagueId,
      season,
      endpoint
    });
  }

  const request = fetch(endpoint)
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (isDebugMode()) {
        console.log("Top scorers response", {
          league,
          leagueId,
          season,
          endpoint,
          ok: response.ok,
          status: response.status,
          raw: data
        });
      }
      if (!response.ok) throw new Error(data?.details || data?.error || "Skytteligan kunde inte hämtas just nu.");
      if (!Array.isArray(data?.data)) throw new Error("Ogiltigt skytteligasvar.");
      const scorers = data.data
        .map((scorer) => ({
          ...scorer,
          goals: Number(scorer.goals || 0)
        }))
        .filter((scorer) => scorer.playerName && scorer.goals > 0)
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 3);
      scorerCache.set(key, { fetchedAt: Date.now(), data: scorers });
      if (isDebugMode()) {
        console.log("Top scorers mapped", { league, leagueId, season, scorers });
      }
      return scorers;
    })
    .finally(() => scorerInFlight.delete(key));

  scorerInFlight.set(key, request);
  return request;
}

function renderTopScorersRows(scorers) {
  if (!scorers.length) {
    return emptyState("Ingen skytteligadata tillgänglig just nu.");
  }

  return `
    <div class="top-scorer-list">
      ${scorers
        .slice(0, 3)
        .map(
          (scorer, index) => `
            <a href="/?player=${scorer.playerId || ""}#spelare" class="top-scorer-row">
              <span class="top-scorer-rank">${index + 1}</span>
              <div class="top-scorer-main">
                <strong>${escapeHtml(scorer.playerName)}</strong>
                <small>${escapeHtml(formatTeamName(scorer.teamName, scorer.teamId))}</small>
              </div>
              <em>${scorer.goals} mål</em>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

async function hydrateHeroTopScorers(league) {
  const target = document.getElementById("hero-topscorers");
  if (!target) return;

  target.innerHTML = scorerSkeleton();

  try {
    const scorers = await loadTopScorers(league);
    if (league !== currentLeague) return;
    target.innerHTML = renderTopScorersRows(scorers);
  } catch (error) {
    console.warn("Skytteligan kunde inte hämtas", error);
    if (league === currentLeague) {
      target.innerHTML = emptyState("Skytteligan kunde inte hämtas just nu.");
    }
  }
}

function teamLogoHtml(team, className = "team-logo") {
  const logo = team?.logo || "";
  const name = team?.teamName || team?.name || "Lag";

  if (!logo) return `<span class="${className} team-logo-placeholder"></span>`;

  return `<img src="${escapeHtml(logo)}" alt="" class="${className}" loading="lazy">`;
}

function renderStandingsTable(rows) {
  if (!rows.length) {
    standingsContent.innerHTML = emptyState("Ingen tabell tillgänglig just nu.");
    return;
  }

  standingsContent.innerHTML = `
    <div class="table-wrap">
      <table class="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Lag</th>
            <th>Sp</th>
            <th>V</th>
            <th>O</th>
            <th>F</th>
            <th>GM</th>
            <th>IM</th>
            <th>+/-</th>
            <th>P</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${row.position ?? "-"}</td>
                  <td class="team-cell">
                    ${teamLogoHtml(row)}
                    ${
                      row.teamId
                        ? `<a href="/team.html?id=${row.teamId}&league=${currentLeague}" class="team-link">${escapeHtml(row.teamName)}</a>`
                        : escapeHtml(row.teamName)
                    }
                  </td>
                  <td>${row.played ?? "-"}</td>
                  <td>${row.won ?? "-"}</td>
                  <td>${row.draw ?? "-"}</td>
                  <td>${row.lost ?? "-"}</td>
                  <td>${row.goalsFor ?? "-"}</td>
                  <td>${row.goalsAgainst ?? "-"}</td>
                  <td>${row.goalDiff ?? "-"}</td>
                  <td><strong>${row.points ?? "-"}</strong></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function normalizeStandings(payload) {
  const standings = Array.isArray(payload?.data) ? payload.data : [];

  function getDetail(item, key) {
    const details = Array.isArray(item?.details) ? item.details : [];
    const found = details.find(
      (d) =>
        d?.type?.developer_name === key ||
        d?.type?.name === key
    );

    if (!found) return 0;

    const parsed = Number(found.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return standings
    .map((item) => {
      const participant =
        item?.participant ||
        item?.team ||
        item?.participants?.[0] ||
        null;
      const teamId = participant?.id ?? item?.participant_id ?? item?.team_id ?? null;

      return {
        position: Number(item?.position ?? item?.rank ?? 999),
        teamId,
        teamName: formatTeamName(participant?.name, teamId),
        logo: formatTeamLogo(participant?.image_path, teamId),
        played: getDetail(item, "OVERALL_MATCHES"),
        won: getDetail(item, "OVERALL_WINS"),
        draw: getDetail(item, "OVERALL_DRAWS"),
        lost: getDetail(item, "OVERALL_LOST"),
        goalsFor: getDetail(item, "OVERALL_SCORED"),
        goalsAgainst: getDetail(item, "OVERALL_CONCEDED"),
        goalDiff: getDetail(item, "OVERALL_GOAL_DIFFERENCE"),
        points: Number(item?.points ?? getDetail(item, "TOTAL_POINTS"))
      };
    })
    .sort((a, b) => a.position - b.position);
}

function getParticipantByLocation(participants, location) {
  return (
    participants.find((team) => team?.meta?.location === location) ||
    participants.find((team) => team?.location === location) ||
    participants.find((team) => team?.pivot?.location === location) ||
    null
  );
}

function getScoreValue(scores, participantId, description = "CURRENT") {
  const row = scores.find(
    (score) =>
      Number(score?.participant_id) === Number(participantId) &&
      score?.description === description
  );

  if (!row) return null;

  const rawValue =
    row?.score?.goals ??
    row?.score?.value ??
    row?.score ??
    null;

  if (rawValue === null || rawValue === undefined || rawValue === "") return null;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseKickoffTime(match) {
  const timestamp =
    match?.starting_at_timestamp ??
    match?.starting_at_time ??
    match?.time?.starting_at?.timestamp ??
    null;

  if (timestamp !== null && timestamp !== undefined && timestamp !== "") {
    const parsedTimestamp = Number(timestamp);
    if (Number.isFinite(parsedTimestamp)) {
      return parsedTimestamp > 100000000000
        ? parsedTimestamp
        : parsedTimestamp * 1000;
    }
  }

  const rawDate =
    match?.starting_at ??
    match?.time?.starting_at?.date_time ??
    match?.time?.starting_at?.date ??
    "";

  if (!rawDate) return null;

  const dateString = String(rawDate).trim();
  const normalizedDateString =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateString)
      ? `${dateString.replace(" ", "T")}Z`
      : dateString;
  const parsedDate = new Date(normalizedDateString);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
}

function sortByKickoffAsc(a, b) {
  return (a.kickoffMs ?? Number.MAX_SAFE_INTEGER) - (b.kickoffMs ?? Number.MAX_SAFE_INTEGER);
}

function sortByKickoffDesc(a, b) {
  return (b.kickoffMs ?? 0) - (a.kickoffMs ?? 0);
}

function getUpcomingMatches(fixtures, limit = 5) {
  const now = Date.now();
  const upcoming = fixtures
    .filter((match) => !match.isLive && !match.isFinished && match.kickoffMs !== null && match.kickoffMs >= now)
    .sort(sortByKickoffAsc);

  if (upcoming.length) return upcoming.slice(0, limit);

  return fixtures
    .filter((match) => !match.isLive && !match.isFinished)
    .sort(sortByKickoffAsc)
    .slice(0, limit);
}

function normalizeFixture(match) {
  const participants = Array.isArray(match?.participants) ? match.participants : [];
  const scores = Array.isArray(match?.scores) ? match.scores : [];
  const homeTeam = getParticipantByLocation(participants, "home");
  const awayTeam = getParticipantByLocation(participants, "away");
  const homeScore = homeTeam ? getScoreValue(scores, homeTeam.id, "CURRENT") : null;
  const awayScore = awayTeam ? getScoreValue(scores, awayTeam.id, "CURRENT") : null;
  const hasScore = homeScore !== null && awayScore !== null;
  const isFinished = Boolean(match?.finished || match?.result_info || hasScore);
  const statusText = String(match?.state?.name || match?.state?.short_name || match?.status || "").toLowerCase();
  const isLive = statusText.includes("live") || statusText.includes("1st") || statusText.includes("2nd");
  const kickoffMs = parseKickoffTime(match);

  return {
    id: match?.id,
    startingAt: kickoffMs !== null ? new Date(kickoffMs).toISOString() : (match?.starting_at || ""),
    kickoffMs,
    homeTeam: homeTeam
      ? {
          id: homeTeam.id,
          name: formatTeamName(homeTeam.name, homeTeam.id),
          logo: formatTeamLogo(homeTeam.image_path, homeTeam.id)
        }
      : null,
    awayTeam: awayTeam
      ? {
          id: awayTeam.id,
          name: formatTeamName(awayTeam.name, awayTeam.id),
          logo: formatTeamLogo(awayTeam.image_path, awayTeam.id)
        }
      : null,
    homeScore,
    awayScore,
    hasScore,
    isFinished,
    isLive
  };
}

function formatMatchDate(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).replace(",", " •");
}

function matchCard(match, variant = "") {
  const homeWon = match.hasScore && Number(match.homeScore) > Number(match.awayScore);
  const awayWon = match.hasScore && Number(match.awayScore) > Number(match.homeScore);
  const score = match.hasScore ? `${match.homeScore} - ${match.awayScore}` : "vs";
  const meta = match.isLive ? "Live nu" : match.isFinished ? "Slut" : formatMatchDate(match.startingAt);
  const href = match.id ? `#matcher` : "#matcher";

  return `
    <a href="${href}" class="match-card ${variant}">
      <div class="match-team ${homeWon ? "winner" : ""}">
        ${teamLogoHtml(match.homeTeam, "match-team-logo")}
        <span>${escapeHtml(match.homeTeam?.name || "Hemmalag")}</span>
      </div>
      <div class="match-score-block">
        <strong>${score}</strong>
        <small>${meta || "Match"}</small>
      </div>
      <div class="match-team right ${awayWon ? "winner" : ""}">
        <span>${escapeHtml(match.awayTeam?.name || "Bortalag")}</span>
        ${teamLogoHtml(match.awayTeam, "match-team-logo")}
      </div>
    </a>
  `;
}

function renderMatchColumn(container, matches, fallback, variant = "") {
  container.innerHTML = matches.length
    ? matches.map((match) => matchCard(match, variant)).join("")
    : emptyState(fallback);
}

function renderHero(rows, fixtures) {
  const topTeams = rows.slice(0, 3);
  const liveMatches = fixtures.filter((match) => match.isLive).slice(0, 2);
  const nextMatch = getUpcomingMatches(fixtures, 1)[0];
  const playedMatches = rows.reduce((sum, row) => sum + Number(row.played || 0), 0) / 2;
  const goals = rows.reduce((sum, row) => sum + Number(row.goalsFor || 0), 0);
  const leader = topTeams[0];

  if (heroMiniStats) {
    heroMiniStats.innerHTML = `
      <div>
        <span>Serieledare</span>
        <strong>${leader ? escapeHtml(leader.teamName) : "Uppdateras"}</strong>
      </div>
      <div>
        <span>Spelade matcher</span>
        <strong>${Math.round(playedMatches)}</strong>
      </div>
      <div>
        <span>Mål totalt</span>
        <strong>${goals}</strong>
      </div>
    `;
  }

  heroHighlight.innerHTML = `
    <div class="dashboard-header">
      <span>${leagueLabel()} 2026</span>
      <strong>Ligapuls</strong>
    </div>

    <section class="dashboard-section next-match-feature hero-dashboard-main">
      <h3>Nästa match</h3>
      ${
        nextMatch
          ? `
            <div class="next-match-teams">
              <span>${escapeHtml(nextMatch.homeTeam?.name || "Hemmalag")}</span>
              <strong>VS</strong>
              <span>${escapeHtml(nextMatch.awayTeam?.name || "Bortalag")}</span>
            </div>
            <p>${formatMatchDate(nextMatch.startingAt)}</p>
          `
          : emptyState("Matchschemat uppdateras")
      }
    </section>

    <section class="dashboard-section">
      <h3>Live / Aktivt nu</h3>
      <div class="dashboard-live-list">
        ${
          liveMatches.length
            ? liveMatches.map((match) => matchCard(match, "live compact")).join("")
            : `
              <p class="dashboard-soft-state">Inga matcher live just nu</p>
              ${nextMatch ? matchCard(nextMatch, "soon compact") : ""}
            `
        }
      </div>
    </section>

    <section class="dashboard-section">
      <h3>Tabelltopp</h3>
      <div class="dashboard-table-top">
        ${
          topTeams.length
            ? topTeams
                .map(
                  (team) => `
                    <a href="/team.html?id=${team.teamId}&league=${currentLeague}" class="dashboard-team-row">
                      <span>${team.position}. ${escapeHtml(team.teamName)}</span>
                      <strong>${team.points} p</strong>
                    </a>
                  `
                )
                .join("")
            : emptyState("Ingen tabell tillgänglig")
        }
      </div>
    </section>

    <section class="dashboard-section">
      <h3>Skytteliga</h3>
      <div id="hero-topscorers">${scorerSkeleton()}</div>
    </section>
  `;

  hydrateHeroTopScorers(currentLeague);
}
function renderQuickStats(rows) {
  const playedMatches = rows.reduce((sum, row) => sum + Number(row.played || 0), 0) / 2;
  const goals = rows.reduce((sum, row) => sum + Number(row.goalsFor || 0), 0);
  const bestAttack = [...rows].sort((a, b) => b.goalsFor - a.goalsFor).slice(0, 5);
  const bestDefense = [...rows].sort((a, b) => a.goalsAgainst - b.goalsAgainst).slice(0, 5);

  leagueSnapshotCard.innerHTML = `
    <h3>Ligaläge</h3>
    <div class="snapshot-grid">
      <div><span>Matcher</span><strong>${Math.round(playedMatches)}</strong></div>
      <div><span>mål</span><strong>${goals}</strong></div>
      <div><span>mål/match</span><strong>${playedMatches > 0 ? (goals / playedMatches).toFixed(2) : "0.00"}</strong></div>
    </div>
  `;

  attackCard.innerHTML = listCard("Bästa anfall", bestAttack, (row) => `${row.goalsFor} mål`);
  defenseCard.innerHTML = listCard("Bästa försvar", bestDefense, (row) => `${row.goalsAgainst} insläppta`);
}

function listCard(title, rows, valueGetter) {
  return `
    <h3>${title}</h3>
    <div class="mini-list">
      ${rows.length
        ? rows
            .map(
              (row, index) => `
                <a href="/team.html?id=${row.teamId}&league=${currentLeague}" class="mini-row">
                  <span>${index + 1}. ${escapeHtml(row.teamName)}</span>
                  <strong>${valueGetter(row)}</strong>
                </a>
              `
            )
            .join("")
        : emptyState("Data saknas just nu.")}
    </div>
  `;
}

function renderTeams(rows) {
  teamsGrid.innerHTML = rows.length
    ? rows
        .map(
          (team) => `
            <a href="/team.html?id=${team.teamId}&league=${currentLeague}" class="team-card">
              ${teamLogoHtml(team, "team-card-logo")}
              <strong>${escapeHtml(team.teamName)}</strong>
              <span>${team.points} poäng</span>
            </a>
          `
        )
        .join("")
    : emptyState("Inga lag tillgängliga just nu.");
}

async function loadStandings() {
  standingsContent.innerHTML = emptyState("Laddar tabell...");
  const snapshot = await LeagueData.loadLeagueSnapshot(currentLeague);
  return snapshot.standings;
}

async function loadFixtures() {
  liveMatchesContent.innerHTML = emptyState("Laddar matcher...");
  upcomingMatchesContent.innerHTML = emptyState("Laddar matcher...");
  recentResultsContent.innerHTML = emptyState("Laddar matcher...");

  const snapshot = await LeagueData.loadLeagueSnapshot(currentLeague);
  return snapshot.fixtures;
}

function renderFixtures(fixtures) {
  const live = fixtures.filter((match) => match.isLive).slice(0, 4);
  const upcoming = getUpcomingMatches(fixtures, 5);
  const recent = fixtures
    .filter((match) => match.isFinished)
    .sort(sortByKickoffDesc)
    .slice(0, 5);
  const liveFallback = upcoming.slice(0, 3);

  liveMatchesContent.innerHTML = live.length
    ? live.map((match) => matchCard(match, "live")).join("")
    : `
      <div class="match-column-note">Nästa avspark</div>
      ${liveFallback.length
        ? liveFallback.map((match) => matchCard(match, "soon")).join("")
        : emptyState("Inga matcher schemalagda just nu.")}
    `;
  renderMatchColumn(upcomingMatchesContent, upcoming, "Inga kommande matcher hittades.");
  renderMatchColumn(recentResultsContent, recent, "Inga resultat tillgängliga ännu.");
}

async function renderLeagueContent() {
  try {
    const [standings, fixtures] = await Promise.all([loadStandings(), loadFixtures()]);

    renderHero(standings, fixtures);
    renderStandingsTable(standings);
    renderFixtures(fixtures);
    renderQuickStats(standings);
    renderTeams(standings);
  } catch (error) {
    console.error(error);
    const message = error?.message || "Något gick fel när startsidan skulle laddas.";
    heroHighlight.innerHTML = emptyState(message);
    standingsContent.innerHTML = emptyState(message);
    liveMatchesContent.innerHTML = emptyState(message);
    upcomingMatchesContent.innerHTML = emptyState(message);
    recentResultsContent.innerHTML = emptyState(message);
  }
}

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    buttons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    currentLeague = button.dataset.league;
    renderLeagueContent();
  });
});

renderLeagueContent();

