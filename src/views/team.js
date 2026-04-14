import { getTeamPageData } from '../services/public-data.js';
import { esc, formatDecimal, formatNumber, teamName } from '../services/formatters.js';
import { metricCard, sectionCard } from '../components/cards.js';
import { renderTable, formDots } from '../components/table.js';
import { playerLeaderboardRows, renderPlayerLeaderboard } from '../components/player-list.js';

const TEAM_FIELDS = [
  ['goals', 'Mål'],
  ['assists', 'Assist'],
  ['minutes', 'Minuter'],
  ['yellowCards', 'Gula kort'],
  ['passesTotal', 'Passningar'],
  ['tackles', 'Tacklingar'],
  ['saves', 'Räddningar'],
];

function playerValue(player, key){
  return Number(player?.[key] ?? player?.stats?.[key] ?? 0);
}

function squadTable(players = []){
  return renderTable({
    empty:'Spelartruppen är inte cachead ännu.',
    rows:players,
    columns:[
      { label:'Spelare', render:player => `<a href="/app.html#/spelare/${esc(player.playerId || player.id || '')}" data-link>${esc(player.playerName || player.name || 'Okänd spelare')}</a>` },
      { label:'Pos', render:player => esc(player.position || player.stats?.position || '–') },
      { label:'Min', render:player => esc(formatNumber(playerValue(player, 'minutes'))) },
      { label:'Mål', render:player => esc(formatNumber(playerValue(player, 'goals'))) },
      { label:'Assist', render:player => esc(formatNumber(playerValue(player, 'assists'))) },
    ],
  });
}

function availableTeamSections(players = []){
  return TEAM_FIELDS
    .map(([field, label]) => ({ field, label, rows:playerLeaderboardRows(players, field, 6) }))
    .filter(section => section.rows.length);
}

export async function renderTeam({ params = [] } = {}){
  const teamId = params[0];
  const data = await getTeamPageData(teamId);
  const players = data.players || [];
  const team = data.team || { name:`Lag ${teamId}` };
  const standing = data.standing;
  const played = Number(standing?.all?.played || 0);
  const points = Number(standing?.points || 0);
  const goalsFor = Number(standing?.all?.goals?.for || 0);
  const goalsAgainst = Number(standing?.all?.goals?.against || 0);
  const sections = availableTeamSections(players);

  return `
    <section class="page">
      <header class="page-hero">
        <span class="kicker">Lagsida</span>
        <h1 class="page-title">${esc(teamName(team))}</h1>
        <p class="page-lead">
          Lagsidan läser cachead spelar- och lagdata först. Om cache saknas visas en tydlig fallback istället för att bygga tung statistik live.
        </p>
        <div class="pill-row">
          ${standing?.rank ? `<span class="pill">Placering ${esc(standing.rank)}</span>` : ''}
          ${standing?.form ? `<span class="pill">Form ${formDots(standing.form)}</span>` : ''}
          <span class="pill">${esc(players.length)} spelare</span>
        </div>
      </header>

      <section class="grid-3">
        ${metricCard('Poäng', points)}
        ${metricCard('Poäng / match', played ? formatDecimal(points / played, 2) : '0,00')}
        ${metricCard('Målskillnad', goalsFor - goalsAgainst)}
      </section>

      <section class="grid-2">
        ${sectionCard('Trupp', squadTable(players), `${players.length} spelare`)}
        ${sectionCard('Lagstatistik', `
          <div class="grid-3">
            ${metricCard('Matcher', played)}
            ${metricCard('Gjorda mål', goalsFor)}
            ${metricCard('Insläppta', goalsAgainst)}
          </div>
        `)}
      </section>

      ${sections.length ? sectionCard('Intern statistik', `
        <div class="leaderboard-grid">
          ${sections.map(section => `
            <article class="card">
              <div class="card-pad">
                <div class="card-title"><h3>${esc(section.label)}</h3></div>
                ${renderPlayerLeaderboard(section.rows, section.label)}
              </div>
            </article>
          `).join('')}
        </div>
      `) : sectionCard('Intern statistik', '<div class="empty-box"><strong>Statistik saknas</strong><span>Cachea laget via admin för att fylla interna topplistor.</span></div>')}
    </section>
  `;
}
