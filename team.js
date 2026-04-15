const teamContent = document.getElementById("team-content");

function formatTeamName(name) {
  if (!name) return "Okänt lag";

  return String(name).replace(/\s+W$/i, "").trim();
}

function formatFact(value) {
  return value === null || value === undefined || value === "" ? "Saknas" : value;
}

function formatCapacity(value) {
  if (value === null || value === undefined || value === "") return "Saknas";

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("sv-SE") : value;
}

function renderTeam(team) {
  const facts = [
    ["Stad", formatFact(team.city)],
    ["Arena", formatFact(team.venue?.name)],
    ["Arenakapacitet", formatCapacity(team.venue?.capacity)],
    ["Bildat", formatFact(team.founded)],
    ["Styrelseordförande", formatFact(team.chairman)],
    ["Sportchef", formatFact(team.sportingDirector)],
    ["Tränare", formatFact(team.coach)]
  ];

  teamContent.innerHTML = `
    <div class="team-hero">
      <img src="${team.logo || ""}" alt="" class="team-hero-logo">
      <div>
        <p class="eyebrow">Lagsida</p>
        <h2>${formatTeamName(team.name)}</h2>
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
      teamContent.innerHTML = "<p>Kunde inte hämta laget.</p>";
      console.error(data);
      return;
    }

    renderTeam(data.team);
  } catch (error) {
    teamContent.innerHTML = "<p>Något gick fel när laget skulle hämtas.</p>";
    console.error(error);
  }
}

loadTeam();
