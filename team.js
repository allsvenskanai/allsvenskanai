const teamContent = document.getElementById("team-content");
const LEAGUE_KEYS = ["allsvenskan", "damallsvenskan"];

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

function getErrorMessage(data, fallback) {
  return data?.error || data?.details || fallback;
}

function getDetailValue(details, codes) {
  const wanted = Array.isArray(codes) ? codes : [codes];
  const found = (details || []).find((detail) => {
    const code = detail?.type?.code || detail?.type?.developer_name || detail?.type?.name;
    return wanted.includes(code);
  });

  return Number(found?.value?.total ?? found?.value ?? 0);
}

function normalizeStandings(payload) {
  return (payload?.data || [])
    .map((row) => {
      const details = row.details || [];
      const team = row.participant || row.team || {};
      const goalsFor = getDetailValue(details, ["OVERALL_SCORED", "GOALS_FOR"]);
      const goalsAgainst = getDetailValue(details, ["OVERALL_CONCEDED", "GOALS_AGAINST"]);

      return {
        position: Number(row.position || row.rank || 0),
        teamId: team.id || row.participant_id || row.team_id,
        teamName: formatTeamName(team.name, team.id || row.participant_id || row.team_id),
        logo: formatTeamLogo(team.image_path || team.logo_path || team.logo, team.id || row.participant_id || row.team_id),
        played: getDetailValue(details, ["OVERALL_MATCHES", "MATCHES_PLAYED"]),
        points: getDetailValue(details, ["TOTAL_POINTS", "POINTS"]),
        goalsFor,
        goalsAgainst,
        goalDiff: goalsFor - goalsAgainst
      };
    })
    .filter((row) => row.teamId);
}

function parseKickoffTime(match) {
  if (match.starting_at_timestamp) {
    const timestamp = Number(match.starting_at_timestamp);
    return new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000);
  }

  const raw = match.starting_at || match.starting_at_datetime || match.date || match.time?.starting_at;
  if (!raw) return null;

  const normalized = typeof raw === "string" && raw.includes(" ") ? raw.replace(" ", "T") + "Z" : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getScoreValue(score) {
  return Number(
    score?.score?.goals ??
      score?.score?.goal ??
      score?.score?.value ??
      score?.goals ??
      score?.value ??
      0
  );
}

function getParticipant(match, location) {
  return (match.participants || []).find((team) => team.meta?.location === location || team.location === location);
}

function getParticipantScore(match, participantId) {
  const score = (match.scores || [])
    .filter((entry) => Number(entry.participant_id) === Number(participantId))
    .find((entry) => {
      const description = String(entry.description || entry.type?.description || "").toUpperCase();
      return !description || description.includes("CURRENT") || description.includes("2ND_HALF") || description.includes("FULLTIME");
    });

  return score ? getScoreValue(score) : null;
}

function isFinished(match) {
  const state = String(match.state?.name || match.state?.short_name || match.status || "").toLowerCase();
  return ["ft", "full-time", "finished", "after extra time"].some((word) => state.includes(word));
}

function normalizeFixture(match, teamId) {
  const home = getParticipant(match, "home") || (match.participants || [])[0] || {};
  const away = getParticipant(match, "away") || (match.participants || [])[1] || {};
  const kickoff = parseKickoffTime(match);
  const homeScore = getParticipantScore(match, home.id);
  const awayScore = getParticipantScore(match, away.id);
  const teamIsHome = Number(home.id) === Number(teamId);
  const teamScore = teamIsHome ? homeScore : awayScore;
  const opponentScore = teamIsHome ? awayScore : homeScore;
  const opponent = teamIsHome ? away : home;
  const finished = isFinished(match);
  let form = "";

  if (finished && teamScore !== null && opponentScore !== null) {
    form = teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "D";
  }

  return {
    id: match.id,
    kickoff,
    kickoffMs: kickoff ? kickoff.getTime() : 0,
    home,
    away,
    opponent,
    homeScore,
    awayScore,
    teamIsHome,
    finished,
    form,
    href: `/?match=${encodeURIComponent(match.id)}#matcher`
  };
}

function positionSv(position) {
  const raw = String(position || "").toLowerCase();
  if (!raw) return "Saknas";
  if (raw.includes("goal") || raw.includes("keeper") || raw === "gk") return "Målvakt";
  if (raw.includes("def") || raw.includes("back")) return "Försvarare";
  if (raw.includes("mid") || raw.includes("cm") || raw.includes("dm") || raw.includes("am")) return "Mittfältare";
  if (raw.includes("att") || raw.includes("for") || raw.includes("wing") || raw.includes("striker")) return "Anfallare";
  return position;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getErrorMessage(data, `Kunde inte hämta ${url}`));
  }

  return data;
}

async function loadLeagueContext(teamId) {
  const contexts = await Promise.all(
    LEAGUE_KEYS.map(async (league) => {
      const [standings, fixtures] = await Promise.all([
        fetchJson(`/api/standings?league=${league}`).catch((error) => {
          console.warn("Kunde inte hämta tabell", league, error);
          return { data: [] };
        }),
        fetchJson(`/api/fixtures?league=${league}`).catch((error) => {
          console.warn("Kunde inte hämta matcher", league, error);
          return { data: [] };
        })
      ]);

      const rows = normalizeStandings(standings);
      const allFixtures = fixtures.data || [];
      const teamFixtures = allFixtures
        .filter((match) => (match.participants || []).some((team) => Number(team.id) === Number(teamId)))
        .map((match) => normalizeFixture(match, teamId));

      return {
        league,
        standing: rows.find((row) => Number(row.teamId) === Number(teamId)) || null,
        fixtures: teamFixtures
      };
    })
  );

  return (
    contexts.find((context) => context.standing) ||
    contexts.find((context) => context.fixtures.length) ||
    { league: "allsvenskan", standing: null, fixtures: [] }
  );
}

function renderForm(form) {
  if (!form?.length) return '<span class="muted">Saknas</span>';

  return `<div class="team-form">${form
    .slice(-5)
    .map((result) => `<span class="form-dot ${result === "W" ? "win" : result === "L" ? "loss" : "draw"}">${result}</span>`)
    .join("")}</div>`;
}

function renderMatchRow(match, teamId) {
  const opponentName = formatTeamName(match.opponent?.name, match.opponent?.id);
  const opponentLogo = formatTeamLogo(match.opponent?.image_path || match.opponent?.logo_path || match.opponent?.logo, match.opponent?.id);
  const score = match.homeScore !== null && match.awayScore !== null ? `${match.homeScore}–${match.awayScore}` : "Kommande";
  const resultClass = match.form === "W" ? "win" : match.form === "L" ? "loss" : match.form === "D" ? "draw" : "";

  return `
    <a class="team-match-row" href="${match.href}">
      <div class="team-match-opponent">
        <img src="${opponentLogo}" alt="">
        <div>
          <strong>${opponentName}</strong>
          <span>${match.teamIsHome ? "Hemma" : "Borta"} • ${formatDateTime(match.kickoff)}</span>
        </div>
      </div>
      <div class="team-match-score ${resultClass}">
        <strong>${score}</strong>
        ${match.form ? `<span>${match.form}</span>` : ""}
      </div>
    </a>
  `;
}

function renderSquad(players) {
  if (!players.length) {
    return '<p class="team-empty">Truppdata uppdateras snart.</p>';
  }

  return `
    <div class="squad-table">
      ${players
        .map(
          (player) => `
            <a class="squad-row" href="/?player=${encodeURIComponent(player.id)}#spelare">
              <div class="squad-player">
                ${player.photo ? `<img src="${player.photo}" alt="">` : '<span class="squad-avatar"></span>'}
                <strong>${player.name || "Okänd spelare"}</strong>
              </div>
              <span>${positionSv(player.position)}</span>
              <em>#${player.number || "–"}</em>
            </a>
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

function renderTeam(team, context, squad) {
  const facts = [
    ["Stad", formatFact(team.city)],
    ["Arena", formatFact(team.venue?.name)],
    ["Arenakapacitet", formatCapacity(team.venue?.capacity)],
    ["Bildat", formatFact(team.founded)],
    ["Styrelseordförande", formatFact(team.chairman)],
    ["Sportchef", formatFact(team.sportingDirector)],
    ["Tränare", formatFact(team.coach)]
  ];
  const fixtures = [...context.fixtures].sort((a, b) => a.kickoffMs - b.kickoffMs);
  const latestMatches = fixtures.filter((match) => match.finished).sort((a, b) => b.kickoffMs - a.kickoffMs).slice(0, 5);
  const upcomingMatches = fixtures.filter((match) => !match.finished && match.kickoffMs >= Date.now()).slice(0, 5);
  const form = latestMatches.slice().reverse().map((match) => match.form).filter(Boolean).slice(-5);
  const standing = context.standing;

  teamContent.innerHTML = `
    <div class="team-hero expanded">
      <img src="${formatTeamLogo(team.logo, team.id)}" alt="" class="team-hero-logo">
      <div class="team-hero-copy">
        <p class="eyebrow">Lagsida</p>
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

    <section class="team-section">
      <div class="team-section-header">
        <h3>Senaste matcher</h3>
        <span>5 senaste</span>
      </div>
      ${latestMatches.length ? latestMatches.map((match) => renderMatchRow(match, team.id)).join("") : '<p class="team-empty">Inga matcher ännu.</p>'}
    </section>

    <section class="team-section">
      <div class="team-section-header">
        <h3>Kommande matcher</h3>
        <span>Nästa matcher</span>
      </div>
      ${upcomingMatches.length ? upcomingMatches.map((match) => renderMatchRow(match, team.id)).join("") : '<p class="team-empty">Inga matcher ännu.</p>'}
    </section>

    <section class="team-section">
      <div class="team-section-header">
        <h3>Trupp</h3>
        <span>${squad.length ? `${squad.length} spelare` : "Uppdateras"}</span>
      </div>
      ${renderSquad(squad)}
    </section>

    <section class="team-section">
      <div class="team-section-header">
        <h3>Statistik</h3>
        <span>Säsong</span>
      </div>
      ${renderStats(standing, form)}
    </section>
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
    const [teamData, context, squadData] = await Promise.all([
      fetchJson(`/api/team?id=${encodeURIComponent(teamId)}`),
      loadLeagueContext(teamId),
      fetchJson(`/api/squad?id=${encodeURIComponent(teamId)}`).catch((error) => {
        console.warn("Kunde inte hämta trupp", error);
        return { players: [] };
      })
    ]);

    renderTeam(teamData.team, context, squadData.players || []);
  } catch (error) {
    teamContent.innerHTML = `
      <p>Kunde inte hämta laget.</p>
      <p class="error-detail">${error.message || "Något gick fel när laget skulle hämtas."}</p>
    `;
    console.error(error);
  }
}

loadTeam();
