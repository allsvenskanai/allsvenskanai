import { getActiveLeague } from '../state/app-state.js';
import { getStandings } from '../services/public-data.js';
import { esc } from '../services/formatters.js';
import { renderTable, formDots } from '../components/table.js';

export async function renderStandings(){
  const league = getActiveLeague();
  const rows = await getStandings();
  return `
    <section class="page">
      <header class="page-hero">
        <span class="kicker">${esc(league.publicName)}</span>
        <h1 class="page-title">Tabell</h1>
        <p class="page-lead">Tabellen hämtas via den interna fotbollsproxyn och hålls separat från tung spelarstatistik.</p>
      </header>

      ${renderTable({
        empty:'Tabellen är inte tillgänglig just nu.',
        rows,
        columns:[
          { label:'#', render:row => esc(row.rank || '') },
          { label:'Lag', render:row => `<a class="team-cell" href="/lag/${esc(row.team?.id || '')}" data-link>${row.team?.logo ? `<img class="team-logo" src="${esc(row.team.logo)}" alt="">` : ''}${esc(row.team?.name || 'Okänt lag')}</a>` },
          { label:'M', render:row => esc(row.all?.played || 0) },
          { label:'V', render:row => esc(row.all?.win || 0) },
          { label:'O', render:row => esc(row.all?.draw || 0) },
          { label:'F', render:row => esc(row.all?.lose || 0) },
          { label:'GM', render:row => esc(row.all?.goals?.for || 0) },
          { label:'IM', render:row => esc(row.all?.goals?.against || 0) },
          { label:'+/-', render:row => esc(row.goalsDiff || 0) },
          { label:'Form', render:row => formDots(row.form) },
          { label:'P', render:row => `<strong class="leader-value">${esc(row.points || 0)}</strong>` },
        ],
      })}
    </section>
  `;
}
