import { getActiveLeague } from '../state/app-state.js';
import { getFixtures } from '../services/public-data.js';
import { esc, formatDate } from '../services/formatters.js';
import { emptyState } from '../components/loading-state.js';

function teamName(match = {}, side = 'home'){
  return match.teams?.[side]?.name
    || match.participants?.find(item => String(item.meta?.location || '').toLowerCase() === side)?.name
    || 'Okänt lag';
}

function score(match = {}){
  const home = match.goals?.home ?? match.scores?.home ?? '–';
  const away = match.goals?.away ?? match.scores?.away ?? '–';
  return `${home}-${away}`;
}

export async function renderResults(){
  const league = getActiveLeague();
  const fixtures = await getFixtures({ last:30 });
  return `
    <section class="page">
      <header class="page-hero">
        <span class="kicker">${esc(league.publicName)}</span>
        <h1 class="page-title">Resultat</h1>
        <p class="page-lead">Matchdata hålls lätt och dynamisk. Tunga spelardataset byggs inte här.</p>
      </header>

      <section class="card card-pad">
        <div class="card-title">
          <h2>Senaste matcher</h2>
          <small>${esc(fixtures.length)} matcher</small>
        </div>
        <div class="match-list">
          ${fixtures.length ? fixtures.map(match => `
            <a class="match-card-next" href="/match/${esc(match.fixture?.id || match.id || '')}" data-link>
              <strong class="match-team-name">${esc(teamName(match, 'home'))}</strong>
              <span class="match-score">${esc(score(match))}</span>
              <strong class="match-team-name away">${esc(teamName(match, 'away'))}</strong>
              <span class="match-meta">${esc(formatDate(match.fixture?.date || match.starting_at) || match.fixture?.status?.long || 'Match')}</span>
            </a>
          `).join('') : emptyState('Inga resultat', 'Det finns ingen matchdata för vald liga ännu.')}
        </div>
      </section>
    </section>
  `;
}
