import { getPublicStats, getStandings } from '../services/public-data.js';
import { createSearchIndex, searchIndex } from '../services/search.js';
import { esc, playerName, teamName } from '../services/formatters.js';

let searchCache = null;

export function clearSearchCache(){
  searchCache = null;
}

async function buildSearch(){
  const [stats, standings] = await Promise.allSettled([getPublicStats(), getStandings()]);
  const players = stats.status === 'fulfilled' ? stats.value?.players || [] : [];
  const teamsFromStats = stats.status === 'fulfilled' ? stats.value?.teams || [] : [];
  const teamsFromStandings = standings.status === 'fulfilled' ? standings.value.map(row => row.team).filter(Boolean) : [];
  const teams = [...teamsFromStats, ...teamsFromStandings];
  const items = [
    ...teams.map(team => ({
      type:'Lag',
      title:teamName(team),
      href:`/lag/${team.id || team.teamId}`,
      search:[teamName(team), team.short_code || team.code || ''].join(' '),
    })).filter(item => item.href.endsWith('undefined') === false),
    ...players.map(player => ({
      type:'Spelare',
      title:playerName(player),
      href:`/spelare/${player.playerId || player.id}`,
      search:[playerName(player), player.teamName || player.team?.name || '', player.position || ''].join(' '),
    })).filter(item => item.href.endsWith('undefined') === false),
  ];
  searchCache = createSearchIndex(items, [item => item.search]);
  return searchCache;
}

export function mountSearch(container){
  if(!container) return;
  container.innerHTML = `
    <div class="search-shell">
      <label class="search-box">
        <span class="sr-only">Sök</span>
        <input id="global-search" type="search" placeholder="Sök lag eller spelare">
      </label>
      <div class="search-results" id="global-search-results" hidden></div>
    </div>
  `;
  const input = container.querySelector('#global-search');
  const results = container.querySelector('#global-search-results');
  input.addEventListener('input', async () => {
    const query = input.value.trim();
    if(query.length < 2) {
      results.hidden = true;
      results.innerHTML = '';
      return;
    }
    const index = searchCache || await buildSearch();
    const matches = searchIndex(index, query, 8);
    results.innerHTML = matches.length ? matches.map(item => `
      <a class="search-result" href="${esc(item.href)}" data-link>
        <span>
          <strong>${esc(item.title)}</strong>
          <span>${esc(item.type)}</span>
        </span>
        <span>Öppna</span>
      </a>
    `).join('') : '<div class="search-result"><span><strong>Ingen träff</strong><span>Prova ett annat namn.</span></span></div>';
    results.hidden = false;
  });
  document.addEventListener('click', event => {
    if(!container.contains(event.target)) results.hidden = true;
  });
}
