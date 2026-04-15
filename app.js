const buttons = document.querySelectorAll(".league-btn");
const standingsContent = document.getElementById("standings-content");
const resultsContent = document.getElementById("results-content");
const statsContent = document.getElementById("stats-content");

let currentLeague = "allsvenskan";

const TEAM_NAME_OVERRIDES = {
  "Djurgården": "Djurgårdens IF",
  "Häcken": "BK Häcken"
};

function formatTeamName(name) {
  if (!name) return "Okänt lag";

  const cleanedName = String(name).replace(/\s+W$/i, "").trim();

  return TEAM_NAME_OVERRIDES[cleanedName] || cleanedName;
}

function renderPlaceholderContent() {
  const leagueName =
    currentLeague === "allsvenskan" ? "Allsvenskan" : "Damallsvenskan";

  statsContent.textContent = `HÃ¤r kommer statistik fÃ¶r ${leagueName} att visas.`;
}

function renderStandingsTable(rows) {
  if (!rows.length) {
    standingsContent.innerHTML = "<p>Ingen tabell tillgÃ¤nglig just nu.</p>";
    return;
  }

  const tableHtml = `
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
                    <img src="${row.logo ?? ""}" alt="" class="team-logo">
                    ${
                      row.teamId
                        ? `<a href="/team.html?id=${row.teamId}" class="team-link">${row.teamName ?? "OkÃ¤nt lag"}</a>`
                        : `${row.teamName ?? "OkÃ¤nt lag"}`
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

  standingsContent.innerHTML = tableHtml;
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

      return {
        position: Number(item?.position ?? item?.rank ?? 999),
        teamId: participant?.id ?? item?.participant_id ?? item?.team_id ?? null,
        teamName: formatTeamName(participant?.name),
        logo: participant?.image_path ?? "",
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

async function loadStandings() {
  standingsContent.innerHTML = "<p>Laddar tabell...</p>";

  try {
    const response = await fetch(`/api/standings?league=${currentLeague}`);
    const data = await response.json();

    if (!response.ok) {
      standingsContent.innerHTML = "<p>Kunde inte hÃ¤mta tabellen.</p>";
      console.error(data);
      return;
    }

    const rows = normalizeStandings(data);
    renderStandingsTable(rows);
  } catch (error) {
    standingsContent.innerHTML = "<p>NÃ¥got gick fel nÃ¤r tabellen skulle hÃ¤mtas.</p>";
    console.error(error);
  }
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

  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMatchDate(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getDisplayScore(match, homeTeam, awayTeam) {
  if (!homeTeam || !awayTeam) return "Kommande";

  const scores = Array.isArray(match?.scores) ? match.scores : [];
  const isFinished = Boolean(match?.finished || match?.result_info);

  const homeScore = getScoreValue(scores, homeTeam.id, "CURRENT");
  const awayScore = getScoreValue(scores, awayTeam.id, "CURRENT");

  if (homeScore === null || awayScore === null) {
    return isFinished ? "Slut" : "Kommande";
  }

  return `${homeScore} - ${awayScore}`;
}

function getMatchStatus(match, homeTeam, awayTeam) {
  const scores = Array.isArray(match?.scores) ? match.scores : [];

  const homeScore = homeTeam ? getScoreValue(scores, homeTeam.id, "CURRENT") : null;
  const awayScore = awayTeam ? getScoreValue(scores, awayTeam.id, "CURRENT") : null;

  if (match?.result_info) {
    return "Slut";
  }

  if (homeScore !== null && awayScore !== null) {
    return "Slut";
  }

  if (match?.starting_at) {
    return "Kommande";
  }

  return "OkÃ¤nd status";
}

function renderFixtures(matches) {
  const sortedMatches = Array.isArray(matches)
    ? [...matches].sort((a, b) => {
        const aHasScore = Array.isArray(a?.scores) && a.scores.length > 0 ? 1 : 0;
        const bHasScore = Array.isArray(b?.scores) && b.scores.length > 0 ? 1 : 0;
        return bHasScore - aHasScore;
      })
    : [];

  const firstMatches = sortedMatches.slice(0, 20);

  if (!firstMatches.length) {
    resultsContent.innerHTML = "<p>Inga matcher tillgÃ¤ngliga just nu.</p>";
    return;
  }

  resultsContent.innerHTML = `
    <div class="fixtures-list">
      ${firstMatches
        .map((match) => {
          const participants = Array.isArray(match?.participants) ? match.participants : [];
          const homeTeam = getParticipantByLocation(participants, "home");
          const awayTeam = getParticipantByLocation(participants, "away");
          const score = getDisplayScore(match, homeTeam, awayTeam);
          const status = getMatchStatus(match, homeTeam, awayTeam);
          const date = formatMatchDate(match?.starting_at);

          return `
            <div class="fixture-card">
              <div class="fixture-row">
                <div class="fixture-team fixture-team-left">
                  ${homeTeam ? formatTeamName(homeTeam.name) : "Hemmalag"}
                </div>

                <div class="fixture-center">
                  <div class="fixture-score">${score}</div>
                  <div class="fixture-status">${status}</div>
                  <div class="fixture-date">${date}</div>
                </div>

                <div class="fixture-team fixture-team-right">
                  ${awayTeam ? formatTeamName(awayTeam.name) : "Bortalag"}
                </div>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

async function loadFixtures() {
  resultsContent.innerHTML = "<p>Laddar resultat...</p>";

  try {
    const response = await fetch(`/api/fixtures?league=${currentLeague}`);
    const data = await response.json();

    if (!response.ok) {
      resultsContent.innerHTML = "<p>Kunde inte hÃ¤mta resultaten.</p>";
      console.error(data);
      return;
    }

    renderFixtures(data?.data || []);
  } catch (error) {
    resultsContent.innerHTML = "<p>NÃ¥got gick fel nÃ¤r resultaten skulle hÃ¤mtas.</p>";
    console.error(error);
  }
}

async function renderLeagueContent() {
  renderPlaceholderContent();
  await Promise.all([loadStandings(), loadFixtures()]);
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
