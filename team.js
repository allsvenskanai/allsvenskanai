const teamContent = document.getElementById("team-content");
const SQUAD_TTL = 24 * 60 * 60 * 1000;
let squadLoadStarted = false;

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

function formatSigned(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Saknas";
  return parsed > 0 ? `+${parsed}` : String(parsed);
}

function formatDateTime(value) {
  if (!value) return "Tid ej satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tid ej satt";

  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
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
    console.warn("Kunde inte spara truppcache", error);
  }
}

function positionSv(position) {
  const raw = String(position || "").toLowerCase();
  if (!raw) return "Position saknas";
  if (raw.includes("position saknas")) return "Position saknas";
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
  const nestedJoined = [nested.firstname || nested.first_name, nested.lastname || nested.last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const joined = [player.firstname || player.firstName, player.lastname || player.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = [
    nested.name,
    nestedJoined,
    joined,
    nested.fullName,
    nested.full_name,
    nested.fullname,
    nested.display_name,
    player.fullName,
    player.full_name,
    player.fullname,
    player.display_name,
    player.name,
    player.player?.name,
    player.player?.full_name,
    player.player?.fullname
  ];
  const name = candidates.map((value) => String(value || "").replace(/\s+/g, " ").trim()).find(Boolean);
  return name || "Okänd spelare";
}

function playerMeta(player) {
  const parts = [];

  if (player.flag) {
    parts.push(`<img src="${player.flag}" alt="" class="squad-flag">`);
  }
  if (player.age) {
    parts.push(`<span>${player.age} år</span>`);
  }
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
      number: Number.isFinite(Number(player.number)) ? Number(player.number) : null
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

  return `<div class="team-form">${form
    .slice(-5)
    .map((result) => `<span class="form-dot ${result === "W" ? "win" : result === "L" ? "loss" : "draw"}">${result}</span>`)
    .join("")}</div>`;
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
        ${opponentLogo ? `<img src="${opponentLogo}" alt="">` : '<span class="squad-avatar"></span>'}
        <div>
          <strong>${opponentName}</strong>
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

function renderSquad(players) {
  if (!players.length) {
    return '<p class="team-empty">Ingen truppdata tillgänglig just nu.</p>';
  }

  return `
    <div class="squad-table">
      ${players
        .map((player) => {
          const tag = player.id ? "a" : "div";
          const href = player.id ? ` href="/?player=${encodeURIComponent(player.id)}#spelare"` : "";

          return `
            <${tag} class="squad-row"${href}>
              <div class="squad-player-main">
                ${player.photo ? `<img src="${player.photo}" alt="">` : '<span class="squad-avatar"></span>'}
                <div class="squad-player-copy">
                  <strong>${player.name || "Okänd spelare"}</strong>
                  <div class="squad-meta">${playerMeta(player)}</div>
                </div>
              </div>
              <div class="squad-row-right">
                <em>#${player.number || "–"}</em>
                ${player.id ? '<span class="squad-arrow">›</span>' : ""}
              </div>
            </${tag}>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSquadSkeleton(rows = 6) {
  return `
    <div class="squad-table squad-skeleton" aria-label="Laddar trupp">
      ${Array.from({ length: rows })
        .map(
          () => `
            <div class="squad-row skeleton-row">
              <div class="squad-player-main">
                <span class="squad-avatar skeleton-pulse"></span>
                <div class="squad-player-copy">
                  <strong class="skeleton-line wide"></strong>
                  <span class="skeleton-line medium"></span>
                </div>
              </div>
              <div class="squad-row-right">
                <em class="skeleton-line short"></em>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStats(standing, form) {
  if (!standing) {
    return '<p class="team-empty">Statistik uppdateras snart.</p>';
  }

  const pointsPerGame = standing.played > 0 ? (standing.points / standing.played).toFixed(2).replace(".", ",") : "0,00";
  const maxGoals = Math.max(standing.goalsFor, standing.goalsAgainst, 1);

  return `
    <div class="team-stat-grid">
      <div class="team-stat-card">
        <span>Gjorda mål</span>
        <strong>${formatNumber(standing.goalsFor)}</strong>
        <div class="stat-meter"><i style="width:${Math.min(100, (standing.goalsFor / maxGoals) * 100)}%"></i></div>
      </div>
      <div class="team-stat-card">
        <span>Insläppta mål</span>
        <strong>${formatNumber(standing.goalsAgainst)}</strong>
        <div class="stat-meter danger"><i style="width:${Math.min(100, (standing.goalsAgainst / maxGoals) * 100)}%"></i></div>
      </div>
      <div class="team-stat-card">
        <span>Poäng / match</span>
        <strong>${pointsPerGame}</strong>
      </div>
      <div class="team-stat-card">
        <span>Form</span>
        ${renderForm(form)}
      </div>
    </div>
  `;
}

function squadCacheKey(teamId) {
  return `squad_${teamId}`;
}

function getFreshCachedSquad(teamId) {
  const cached = safeReadStorage(squadCacheKey(teamId));
  if (cached?.players && cached?.fetchedAt && Date.now() - cached.fetchedAt < SQUAD_TTL) {
    return normalizeSquadForUi(cached.players);
  }

  return null;
}

async function loadSquad(teamId, snapshot) {
  const key = squadCacheKey(teamId);
  const cached = getFreshCachedSquad(teamId);
  if (cached) return cached;

  const params = new URLSearchParams({
    id: teamId,
    league: snapshot?.leagueKey || "allsvenskan",
    season: snapshot?.season || ""
  });
  const response = await fetch(`/api/squad?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Kunde inte hämta truppen.");

  const players = normalizeSquadForUi(data.players || []);
  safeWriteStorage(key, { fetchedAt: Date.now(), players });
  return players;
}

async function hydrateSquad(teamId, snapshot) {
  const container = document.getElementById("team-squad-content");
  if (!container || squadLoadStarted) return;
  squadLoadStarted = true;

  try {
    const players = await loadSquad(teamId, snapshot);
    container.innerHTML = renderSquad(players);
    const count = document.getElementById("team-squad-count");
    if (count) count.textContent = players.length ? `${players.length} spelare` : "Uppdateras";
  } catch (error) {
    console.warn("Kunde inte hämta trupp", error);
    container.innerHTML = '<p class="team-empty">Trupp kunde inte hämtas just nu.</p>';
    const count = document.getElementById("team-squad-count");
    if (count) count.textContent = "Fel";
  }
}

async function loadTeamContext(teamId, preferredLeague) {
  const primaryLeague = LeagueData.LEAGUES[preferredLeague] ? preferredLeague : "allsvenskan";
  const primarySnapshot = await LeagueData.loadLeagueSnapshot(primaryLeague);

  if (LeagueData.getTeamStanding(teamId, primarySnapshot) || LeagueData.getTeamFixtures(teamId, primarySnapshot).length) {
    return primarySnapshot;
  }

  const otherLeagueKeys = Object.keys(LeagueData.LEAGUES).filter((key) => key !== primaryLeague);
  const snapshots = [primarySnapshot];

  for (const league of otherLeagueKeys) {
    snapshots.push(await LeagueData.loadLeagueSnapshot(league));
  }

  return LeagueData.findLeagueForTeam(teamId, snapshots);
}

function buildFallbackTeam(teamId, standing, snapshot) {
  const fromTeams = snapshot?.derived?.teams?.find((team) => Number(team.id) === Number(teamId));
  return {
    id: teamId,
    name: standing?.teamName || fromTeams?.name || "Okänt lag",
    logo: standing?.logo || fromTeams?.logo || "",
    city: null,
    venue: { name: null, capacity: null },
    founded: null,
    chairman: null,
    sportingDirector: null,
    coach: null
  };
}

function renderTeam(team, snapshot) {
  const teamId = team.id;
  const cachedSquad = getFreshCachedSquad(teamId);
  const standing = LeagueData.getTeamStanding(teamId, snapshot);
  const latestMatches = LeagueData.getTeamRecentMatches(teamId, snapshot, 5);
  const upcomingMatches = LeagueData.getTeamUpcomingMatches(teamId, snapshot, 5);
  const form = LeagueData.getTeamForm(teamId, snapshot, 5);
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
    <div class="team-hero expanded">
      <img src="${formatTeamLogo(team.logo, team.id)}" alt="" class="team-hero-logo">
      <div class="team-hero-copy">
        <p class="eyebrow">${formatLeagueLabel(snapshot?.leagueKey)} 2026</p>
        <h2>${formatTeamName(team.name, team.id)}</h2>
        <div class="team-summary-grid">
          <div class="team-summary-stat">
            <span>Placering</span>
            <strong>${standing?.position ? `${standing.position}:a` : "Saknas"}</strong>
          </div>
          <div class="team-summary-stat">
            <span>Poäng</span>
            <strong>${standing ? formatNumber(standing.points) : "Saknas"}</strong>
          </div>
          <div class="team-summary-stat">
            <span>Målskillnad</span>
            <strong>${standing ? formatSigned(standing.goalDiff) : "Saknas"}</strong>
          </div>
          <div class="team-summary-stat">
            <span>Form</span>
            ${renderForm(form)}
          </div>
        </div>
      </div>
    </div>

    <section class="team-section team-facts-card">
      <div class="team-section-header">
        <h3>Fakta</h3>
      </div>
      <div class="team-facts-grid">
        ${facts.map(([label, value]) => `
          <div class="team-fact">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="team-section">
      <div class="team-section-header">
        <h3>Senaste matcher</h3>
        <span>5 senaste</span>
      </div>
      ${latestMatches.length ? latestMatches.map((match) => renderMatchRow(match, teamId)).join("") : '<p class="team-empty">Inga matcher ännu.</p>'}
    </section>

    <section class="team-section">
      <div class="team-section-header">
        <h3>Kommande matcher</h3>
        <span>Nästa matcher</span>
      </div>
      ${upcomingMatches.length ? upcomingMatches.map((match) => renderMatchRow(match, teamId)).join("") : '<p class="team-empty">Inga matcher ännu.</p>'}
    </section>

    <section class="team-section" id="trupp">
      <div class="team-section-header">
        <h3>Trupp</h3>
        <span id="team-squad-count">${cachedSquad ? `${cachedSquad.length} spelare` : "Laddar"}</span>
      </div>
      <div id="team-squad-content">
        ${cachedSquad ? renderSquad(cachedSquad) : renderSquadSkeleton()}
      </div>
    </section>

    <section class="team-section">
      <div class="team-section-header">
        <h3>Statistik</h3>
        <span>Säsong</span>
      </div>
      ${renderStats(standing, form)}
    </section>
  `;

  if (!cachedSquad) {
    hydrateSquad(teamId, snapshot);
  }
}

async function loadTeam() {
  const params = new URLSearchParams(window.location.search);
  const teamId = params.get("id");
  const preferredLeague = params.get("league") || "allsvenskan";

  if (!teamId) {
    teamContent.innerHTML = "<p>Inget lag valt.</p>";
    return;
  }

  teamContent.innerHTML = "<p>Laddar lag...</p>";

  try {
    const snapshot = await loadTeamContext(teamId, preferredLeague);
    const standing = LeagueData.getTeamStanding(teamId, snapshot);
    const facts = await LeagueData.loadTeamFacts(teamId).catch((error) => {
      console.warn("Kunde inte hämta lagfakta, använder snapshot-data", error);
      return buildFallbackTeam(teamId, standing, snapshot);
    });

    renderTeam({ ...buildFallbackTeam(teamId, standing, snapshot), ...facts }, snapshot);
  } catch (error) {
    teamContent.innerHTML = `
      <p>Kunde inte hämta laget.</p>
      <p class="error-detail">${error.message || "Något gick fel när laget skulle hämtas."}</p>
    `;
    console.error(error);
  }
}

loadTeam();
