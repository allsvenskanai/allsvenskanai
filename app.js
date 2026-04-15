const buttons = document.querySelectorAll(".league-btn");
const standingsContent = document.getElementById("standings-content");
const resultsContent = document.getElementById("results-content");
const statsContent = document.getElementById("stats-content");

let currentLeague = "allsvenskan";

function renderPlaceholderContent() {
  const leagueName =
    currentLeague === "allsvenskan" ? "Allsvenskan" : "Damallsvenskan";

  statsContent.textContent = `Här kommer statistik för ${leagueName} att visas.`;
}

function renderStandingsTable(rows) {
  if (!rows.length) {
    standingsContent.innerHTML = "<p>Ingen tabell tillgänglig just nu.</p>";
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
                  <td>${row.teamName ?? "Okänt lag"}</td>
                  <td>${row.played ?? 0}</td>
                  <td>${row.won ?? 0}</td>
                  <td>${row.draw ?? 0}</td>
                  <td>${row.lost ?? 0}</td>
                  <td>${row.goalsFor ?? 0}</td>
                  <td>${row.goalsAgainst ?? 0}</td>
                  <td>${row.goalDiff ?? 0}</td>
                  <td><strong>${row.points ?? 0}</strong></td>
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
  const tableRows = [];
  const standings = payload?.data || [];

  for (const item of standings) {
    const participant =
      item.participant ||
      item.team ||
      item.participants?.[0] ||
      null;

    const details = Array.isArray(item.details) ? item.details : [];

    const getDetail = (name) => {
      const found = details.find((d) => d.type?.developer_name === name);
      return found ? Number(found.value) : 0;
    };

    tableRows.push({
      position: item.position ?? item.rank ?? "-",
      teamName: participant?.name ?? "Okänt lag",
      played: getDetail("played"),
      won: getDetail("won"),
      draw: getDetail("draw"),
      lost: getDetail("lost"),
      goalsFor: getDetail("goals_for"),
      goalsAgainst: getDetail("goals_against"),
      goalDiff: getDetail("goal_difference"),
      points: getDetail("points")
    });
  }

  return tableRows.sort((a, b) => (a.position || 999) - (b.position || 999));
}

async function loadStandings() {
  standingsContent.innerHTML = "<p>Laddar tabell...</p>";

  try {
    const response = await fetch(`/api/standings?league=${currentLeague}`);
    const data = await response.json();

    if (!response.ok) {
      standingsContent.innerHTML = "<p>Kunde inte hämta tabellen.</p>";
      console.error(data);
      return;
    }

    const rows = normalizeStandings(data);
    renderStandingsTable(rows);
  } catch (error) {
    standingsContent.innerHTML = "<p>Något gick fel när tabellen skulle hämtas.</p>";
    console.error(error);
  }
}

function getFixtureTeam(fixture, location) {
  const participants = Array.isArray(fixture?.participants)
    ? fixture.participants
    : [];

  return (
    participants.find((team) => team?.meta?.location === location) ||
    participants.find((team) => team?.location === location) ||
    participants.find((team) => team?.pivot?.location === location) ||
    null
  );
}

function getFixtureScore(fixture, location) {
  const scores = Array.isArray(fixture?.scores) ? fixture.scores : [];

  const score = scores.find((item) => {
    const participantLocation = String(
      item?.score?.participant ||
      item?.participant ||
      item?.description ||
      item?.meta?.location ||
      ""
    ).toLowerCase();

    const isCurrent =
      item?.description === "CURRENT" ||
      item?.type?.developer_name === "CURRENT" ||
      item?.score?.description === "CURRENT";

    return isCurrent && participantLocation === location;
  });

  return score?.score?.goals ?? score?.score?.value ?? score?.goals ?? null;
}

function renderFixtures(fixtures) {
  const firstFixtures = fixtures.slice(0, 20);

  if (!firstFixtures.length) {
    resultsContent.innerHTML = "<p>Inga matcher tillgängliga just nu.</p>";
    return;
  }

  resultsContent.innerHTML = `
    <div class="fixtures-list">
      ${firstFixtures
        .map((fixture) => {
          const homeTeam = getFixtureTeam(fixture, "home");
          const awayTeam = getFixtureTeam(fixture, "away");
          const homeScore = getFixtureScore(fixture, "home");
          const awayScore = getFixtureScore(fixture, "away");
          const hasScore = homeScore !== null && awayScore !== null;

          return `
            <div class="fixture-row">
              <span>${homeTeam?.name ?? "Hemmalag"}</span>
              <strong>${hasScore ? `${homeScore} - ${awayScore}` : "Kommande"}</strong>
              <span>${awayTeam?.name ?? "Bortalag"}</span>
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
      resultsContent.innerHTML = "<p>Kunde inte hämta resultaten.</p>";
      console.error(data);
      return;
    }

    renderFixtures(data?.data || []);
  } catch (error) {
    resultsContent.innerHTML = "<p>Något gick fel när resultaten skulle hämtas.</p>";
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
