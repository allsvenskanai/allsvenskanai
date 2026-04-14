import { getPlayerPageData } from '../services/public-data.js';
import { esc, formatDecimal, formatNumber, playerName, teamName } from '../services/formatters.js';
import { metricCard, sectionCard } from '../components/cards.js';
import { emptyState } from '../components/loading-state.js';

const GROUPS = {
  offense:[['goals', 'Mål'], ['assists', 'Assist'], ['shots', 'Skott'], ['shotsOnTarget', 'Skott på mål'], ['keyPasses', 'Nyckelpass']],
  passing:[['passesTotal', 'Passningar'], ['passesAccurate', 'Lyckade pass'], ['passAccuracyPct', 'Passnings%']],
  defense:[['tackles', 'Tacklingar'], ['interceptions', 'Interceptions'], ['blocks', 'Blockar']],
  discipline:[['yellowCards', 'Gula kort'], ['redCards', 'Röda kort']],
  goalkeeper:[['saves', 'Räddningar'], ['goalsConceded', 'Insläppta mål'], ['cleanSheets', 'Hållna nollor']],
  minutes:[['appearances', 'Matcher'], ['starts', 'Starter'], ['minutes', 'Minuter']],
};

const GROUP_LABELS = {
  offense:'Offensiv',
  passing:'Passningsspel',
  defense:'Defensiv',
  discipline:'Disciplin',
  goalkeeper:'Målvakt',
  minutes:'Speltid',
};

function value(player, key){
  return Number(player?.[key] ?? player?.stats?.[key] ?? 0);
}

function renderStatGroups(player){
  const groups = Object.entries(GROUPS)
    .map(([group, fields]) => [group, fields.filter(([key]) => value(player, key) > 0)])
    .filter(([, fields]) => fields.length);
  if(!groups.length) return emptyState('Statistik saknas', 'Spelaren finns i cache, men saknar användbara statistikfält.');
  return groups.map(([group, fields]) => sectionCard(GROUP_LABELS[group] || group, `
    <div class="grid-3">
      ${fields.map(([key, label]) => metricCard(label, key.includes('Pct') ? formatDecimal(value(player, key), 1) : formatNumber(value(player, key)))).join('')}
    </div>
  `)).join('');
}

export async function renderPlayer({ params = [] } = {}){
  const playerId = params[0];
  const { player, team } = await getPlayerPageData(playerId);
  if(!player) {
    return emptyState('Spelaren finns inte i cache', 'Kör adminimport eller kontrollera att länken pekar på rätt spelare.');
  }
  const minutes = value(player, 'minutes');
  const goals = value(player, 'goals');
  const assists = value(player, 'assists');

  return `
    <section class="page">
      <header class="page-hero">
        <span class="kicker">${esc(teamName(team || player))}</span>
        <h1 class="page-title">${esc(playerName(player))}</h1>
        <p class="page-lead">
          Spelarsidan bygger på normaliserad cachead statistik. Den visar bara fält som faktiskt finns.
        </p>
        <div class="pill-row">
          ${player.position ? `<span class="pill">${esc(player.position)}</span>` : ''}
          ${player.teamId ? `<a class="pill" href="/lag/${esc(player.teamId)}" data-link>${esc(teamName(team || player))}</a>` : ''}
        </div>
      </header>

      <section class="grid-3">
        ${metricCard('Minuter', minutes)}
        ${metricCard('Mål', goals)}
        ${metricCard('Assist', assists)}
      </section>

      ${renderStatGroups(player)}
    </section>
  `;
}
