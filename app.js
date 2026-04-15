const buttons = document.querySelectorAll(".league-btn");
const standingsContent = document.getElementById("standings-content");
const resultsContent = document.getElementById("results-content");
const statsContent = document.getElementById("stats-content");

let currentLeague = "allsvenskan";

function renderPlaceholderContent() {
  const leagueName =
    currentLeague === "allsvenskan" ? "Allsvenskan" : "Damallsvenskan";

  resultsContent.textContent = `Här kommer resultat för ${leagueName} att visas.`;
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
      standingsContent.innerHTML = `<p>Kunde inte hämta tabellen.</p>`;
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

async function renderLeagueContent() {
  renderPlaceholderContent();
  await loadStandings();
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
