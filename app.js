const buttons = document.querySelectorAll(".league-btn");
const heroHighlight = document.getElementById("hero-highlight");
const standingsContent = document.getElementById("standings-content");
const liveMatchesContent = document.getElementById("live-matches-content");
const upcomingMatchesContent = document.getElementById("upcoming-matches-content");
const recentResultsContent = document.getElementById("recent-results-content");
const teamsGrid = document.getElementById("teams-grid");
const leagueSnapshotCard = document.getElementById("league-snapshot-card");
const attackCard = document.getElementById("attack-card");
const defenseCard = document.getElementById("defense-card");

let currentLeague = "allsvenskan";

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
                        ? `<a href="/team.html?id=${row.teamId}" class="team-link">${escapeHtml(row.teamName)}</a>`
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

  return {
    id: match?.id,
    startingAt: match?.starting_at || match?.starting_at_timestamp || "",
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
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function matchCard(match, variant = "") {
  const score = match.hasScore ? `${match.homeScore} - ${match.awayScore}` : "Kommande";
  const meta = match.isLive ? "Live" : match.isFinished ? "Slut" : formatMatchDate(match.startingAt);
  const href = match.id ? `#matcher` : "#matcher";

  return `
    <a href="${href}" class="match-card ${variant}">
      <div class="match-team">
        ${teamLogoHtml(match.homeTeam, "match-team-logo")}
        <span>${escapeHtml(match.homeTeam?.name || "Hemmalag")}</span>
      </div>
      <div class="match-score-block">
        <strong>${score}</strong>
        <small>${meta || "Match"}</small>
      </div>
      <div class="match-team right">
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
  const nextMatch = fixtures.find((match) => !match.isFinished);

  heroHighlight.innerHTML = `
    <div class="dashboard-header">
      <span>${leagueLabel()} 2026</span>
      <strong>Ligapuls</strong>
    </div>

    <section class="dashboard-section">
      <h3>Live / Aktivt nu</h3>
      <div class="dashboard-live-list">
        ${
          liveMatches.length
            ? liveMatches.map((match) => matchCard(match, "live compact")).join("")
            : emptyState("Inga matcher live")
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
                    <a href="/team.html?id=${team.teamId}" class="dashboard-team-row">
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
      ${emptyState("Skytteligadata saknas ännu")}
    </section>

    <section class="dashboard-section next-match-feature">
      <h3>Nästa match</h3>
      ${
        nextMatch
          ? `
            <div class="next-match-teams">
              <span>${escapeHtml(nextMatch.homeTeam?.name || "Hemmalag")}</span>
              <strong>mot</strong>
              <span>${escapeHtml(nextMatch.awayTeam?.name || "Bortalag")}</span>
            </div>
            <p>${formatMatchDate(nextMatch.startingAt)}</p>
          `
          : emptyState("Inget schema tillgängligt")
      }
    </section>
  `;
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
      <div><span>Mål</span><strong>${goals}</strong></div>
      <div><span>Mål/match</span><strong>${playedMatches > 0 ? (goals / playedMatches).toFixed(2) : "0.00"}</strong></div>
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
                <a href="/team.html?id=${row.teamId}" class="mini-row">
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
            <a href="/team.html?id=${team.teamId}" class="team-card">
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
  const response = await fetch(`/api/standings?league=${currentLeague}`);
  const data = await response.json();

  if (!response.ok) throw new Error(data?.error || "Kunde inte hämta tabellen.");

  return normalizeStandings(data);
}

async function loadFixtures() {
  liveMatchesContent.innerHTML = emptyState("Laddar matcher...");
  upcomingMatchesContent.innerHTML = emptyState("Laddar matcher...");
  recentResultsContent.innerHTML = emptyState("Laddar matcher...");

  const response = await fetch(`/api/fixtures?league=${currentLeague}`);
  const data = await response.json();

  if (!response.ok) throw new Error(data?.error || "Kunde inte hämta matcher.");

  return (Array.isArray(data?.data) ? data.data : [])
    .map(normalizeFixture)
    .sort((a, b) => new Date(a.startingAt) - new Date(b.startingAt));
}

function renderFixtures(fixtures) {
  const now = Date.now();
  const live = fixtures.filter((match) => match.isLive).slice(0, 4);
  const upcoming = fixtures
    .filter((match) => !match.isFinished && new Date(match.startingAt).getTime() >= now)
    .slice(0, 5);
  const recent = fixtures
    .filter((match) => match.isFinished)
    .sort((a, b) => new Date(b.startingAt) - new Date(a.startingAt))
    .slice(0, 5);

  renderMatchColumn(liveMatchesContent, live, "Inga live-matcher just nu.", "live");
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
