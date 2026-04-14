import { getTransfers } from '../services/public-data.js';
import { esc } from '../services/formatters.js';
import { sectionCard } from '../components/cards.js';
import { renderTable } from '../components/table.js';

export async function renderTransfers(){
  const data = await getTransfers();
  const transfers = data.transfers || [];
  return `
    <section class="page">
      <header class="page-hero">
        <span class="kicker">Cachead data</span>
        <h1 class="page-title">Transfers</h1>
        <p class="page-lead">Transfers läses från adminuppdaterad cache. Publika besökare triggar inga tunga importjobb.</p>
      </header>
      ${sectionCard('Senaste övergångar', renderTable({
        empty:'Transferdata är inte uppdaterad ännu.',
        rows:transfers,
        columns:[
          { label:'Spelare', render:item => esc(item.playerName || item.player?.name || item.name || 'Okänd spelare') },
          { label:'Från', render:item => esc(item.fromTeamName || item.from?.name || '–') },
          { label:'Till', render:item => esc(item.toTeamName || item.to?.name || '–') },
          { label:'Typ', render:item => esc(item.type || item.transferType || '–') },
        ],
      }), `${transfers.length} rader`)}
    </section>
  `;
}
