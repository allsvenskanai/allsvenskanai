import { getHomeBundle } from '../services/public-data.js';
import { esc, formatDecimal, formatNumber } from '../services/formatters.js';
import { sectionCard, metricCard } from '../components/cards.js';
import { renderTable } from '../components/table.js';

function scoreLine(match = {}){
  const home = match.goals?.home ?? match.scores?.home ?? '–';
  const away = match.goals?.away ?? match.scores?.away ?? '–';
  return `${home}-${away}`;
}

function matchName(match = {}, side = 'home'){
  return match.teams?.[side]?.name
    || match.participants?.find(item => String(item.meta?.location || '').toLowerCase() === side)?.name
    || 'Okänt lag';
}

function statsSummary(stats = null){
  const players = stats?.players || [];
  const teams = stats?.teams || [];
  const goals = players.reduce((sum, player) => sum + Number(player.goals || player.stats?.goals || 0), 0);
  const minutes = players.reduce((sum, player) => sum + Number(player.minutes || player.stats?.minutes || 0), 0);
  return [
    metricCard('Cacheade lag', stats?.meta?.cachedTeamCount ?? teams.length),
    metricCard('Spelare i snapshot', players.length),
    metricCard('Mål i cache', goals),
    metricCard('Minuter', minutes, 'från cache'),
  ].join('');
}

export async function renderHome(){
  const { league, standings, fixtures, stats } = await getHomeBundle();
  const leader = standings[0];
  const played = standings.reduce((sum, row) => sum + Number(row.all?.played || 0), 0) / 2;
  const goals = standings.reduce((sum, row) => sum + Number(row.all?.goals?.for || 0), 0);

  return `
    <section class="page">
      <header class="page-hero">
        <span class="kicker">Ny grundarkitektur</span>
        <h1 class="page-title">${esc(league.name)} byggd för snabb data</h1>
        <p class="page-lead">
          Fas 1 av nya AllsvenskanAI: publik vy läser intern data, tung statistik flyttas till admin,
          och grunden är modulär istället för en monolit.
        </p>
        <div class="hero-actions">
          <a class="cta primary" href="/tabell" data-link>Se tabellen</a>
          <a class="cta" href="/statistik" data-link>Utforska statistik</a>
        </div>
      </header>

      <section class="grid-3">
        ${metricCard('Serieledare', leader?.team?.name || '–')}
        ${metricCard('Spelade matcher', Math.round(played))}
        ${metricCard('Mål per match', played ? formatDecimal(goals / played, 2) : '0,00')}
      </section>

      <section class="home-layout">
        ${sectionCard('Aktiv liga', `<div class="grid-3">${statsSummary(stats)}</div>`, league.publicName)}
        ${sectionCard('Senaste resultat', `
          <div class="match-list">
            ${(fixtures || []).slice(0, 6).map(match => `
              <article class="match-card-next">
                <strong class="match-team-name">${esc(matchName(match, 'home'))}</strong>
                <span class="match-score">${esc(scoreLine(match))}</span>
                <strong class="match-team-name away">${esc(matchName(match, 'away'))}</strong>
                <span class="match-meta">${esc(match.fixture?.status?.long || match.status || 'Match')}</span>
              </article>
            `).join('') || '<div class="empty-box"><strong>Inga matcher</strong><span>Ingen matchdata finns i cache just nu.</span></div>'}
          </div>
        `)}
      </section>

      ${sectionCard('Topp 5', renderTable({
        columns:[
          { label:'#', render:row => esc(row.rank || '') },
          { label:'Lag', render:row => `<a class="team-cell" href="/lag/${esc(row.team?.id || '')}" data-link>${row.team?.logo ? `<img class="team-logo" src="${esc(row.team.logo)}" alt="">` : ''}${esc(row.team?.name || 'Okänt lag')}</a>` },
          { label:'M', render:row => esc(row.all?.played || 0) },
          { label:'P', render:row => esc(row.points || 0) },
        ],
        rows:standings.slice(0, 5),
      }))}
    </section>
  `;
}
