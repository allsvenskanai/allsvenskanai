const teamContent = document.getElementById("team-content");

function formatFact(value) {
  return value === null || value === undefined || value === "" ? "Saknas" : value;
}

function formatCapacity(value) {
  if (value === null || value === undefined || value === "") return "Saknas";

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("sv-SE") : value;
}

function getErrorMessage(data, fallback) {
  return data?.error || data?.details || fallback;
}

function renderTeam(team) {
  const facts = [
    ["Stad", formatFact(team.city)],
    ["Arena", formatFact(team.venue?.name)],
    ["Arenakapacitet", formatCapacity(team.venue?.capacity)],
    ["Bildat", formatFact(team.founded)],
    ["StyrelseordfÃ¶rande", formatFact(team.chairman)],
    ["Sportchef", formatFact(team.sportingDirector)],
    ["TrÃ¤nare", formatFact(team.coach)]
  ];

  teamContent.innerHTML = `
    <div class="team-hero">
      <img src="${formatTeamLogo(team.logo, team.id)}" alt="" class="team-hero-logo">
      <div>
        <p class="eyebrow">Lagsida</p>
        <h2>${formatTeamName(team.name, team.id)}</h2>
      </div>
    </div>

    <section class="team-facts-card">
      <h3>Fakta</h3>
      <div class="team-facts-grid">
        ${facts
          .map(
            ([label, value]) => `
              <div class="team-fact">
                <span>${label}</span>
                <strong>${value}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </section>

    <div class="team-grid">
      <section class="team-info-card">
        <h3>Senaste matcher</h3>
        <p>Kommer snart.</p>
      </section>

      <section class="team-info-card">
        <h3>Statistik</h3>
        <p>Kommer snart.</p>
      </section>
    </div>
  `;
}

async function loadTeam() {
  const params = new URLSearchParams(window.location.search);
  const teamId = params.get("id");

  if (!teamId) {
    teamContent.innerHTML = "<p>Inget lag valt.</p>";
    return;
  }

  teamContent.innerHTML = "<p>Laddar lag...</p>";

  try {
    const response = await fetch(`/api/team?id=${encodeURIComponent(teamId)}`);
    const data = await response.json();

    if (!response.ok) {
      const message = getErrorMessage(data, "Kunde inte hÃ¤mta laget.");
      teamContent.innerHTML = `
        <p>Kunde inte hÃ¤mta laget.</p>
        <p class="error-detail">${message}</p>
      `;
      console.error(data);
      return;
    }

    renderTeam(data.team);
  } catch (error) {
    teamContent.innerHTML = "<p>NÃ¥got gick fel nÃ¤r laget skulle hÃ¤mtas.</p>";
    console.error(error);
  }
}

loadTeam();

