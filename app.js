const buttons = document.querySelectorAll(".league-btn");
const standingsContent = document.getElementById("standings-content");
const resultsContent = document.getElementById("results-content");
const statsContent = document.getElementById("stats-content");

let currentLeague = "allsvenskan";

function renderLeagueContent() {
  const leagueName =
    currentLeague === "allsvenskan" ? "Allsvenskan" : "Damallsvenskan";

  standingsContent.textContent = `Här kommer tabellen för ${leagueName} att visas.`;
  resultsContent.textContent = `Här kommer resultat för ${leagueName} att visas.`;
  statsContent.textContent = `Här kommer statistik för ${leagueName} att visas.`;
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
