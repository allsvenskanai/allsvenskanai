import { getMatchDetails } from '../services/public-data.js';
import { esc, formatDate } from '../services/formatters.js';
import { metricCard, sectionCard } from '../components/cards.js';
import { emptyState } from '../components/loading-state.js';

function participant(match = {}, side = 'home'){
  return match.teams?.[side]
    || match.participants?.find(item => String(item.meta?.location || '').toLowerCase() === side)
    || null;
}

function score(match = {}){
  const home = match.goals?.home ?? match.scores?.home ?? '–';
  const away = match.goals?.away ?? match.scores?.away ?? '–';
  return `${home}-${away}`;
}

function renderEvents(events = []){
  if(!events?.length) return emptyState('Inga händelser', 'Händelser finns inte i snapshoten för den här matchen.');
  return `
    <div class="match-list">
      ${events.map(event => `
        <article class="match-card-next">
          <strong class="match-team-name">${esc(event.player_name || event.player?.name || event.type?.name || 'Händelse')}</strong>
          <span class="match-score">${esc(event.minute || event.time?.minute || '')}'</span>
          <strong class="match-team-name away">${esc(event.team_name || event.team?.name || '')}</strong>
          <span class="match-meta">${esc(event.type?.name || event.result || '')}</span>
        </article>
      `).join('')}
    </div>
  `;
}

export async function renderMatch({ params = [] } = {}){
  const matchId = params[0];
  const match = await getMatchDetails(matchId);
  if(!match) return emptyState('Matchen kunde inte laddas', 'Matchdetaljer saknas eller är inte cacheade ännu.');
  const home = participant(match, 'home');
  const away = participant(match, 'away');
  const status = match.fixture?.status?.long || match.status || match.state?.name || 'Match';

  return `
    <section class="page">
      <header class="page-hero">
        <span class="kicker">${esc(formatDate(match.fixture?.date || match.starting_at) || status)}</span>
        <h1 class="page-title">${esc(home?.name || 'Hemmalag')} ${esc(score(match))} ${esc(away?.name || 'Bortalag')}</h1>
        <p class="page-lead">Matchvyn hämtar en kontrollerad lätt matchdetalj via intern endpoint och visar bara data som finns.</p>
      </header>

      <section class="grid-3">
        ${metricCard('Status', status)}
        ${metricCard('Hemmalag', home?.name || '–')}
        ${metricCard('Bortalag', away?.name || '–')}
      </section>

      ${sectionCard('Händelser', renderEvents(match.events || []))}
    </section>
  `;
}
