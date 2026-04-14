import { getActiveLeague } from '../state/app-state.js';
import { getPublicStats } from '../services/public-data.js';
import { esc } from '../services/formatters.js';
import { emptyState } from '../components/loading-state.js';
import { renderPlayerLeaderboard, playerLeaderboardRows } from '../components/player-list.js';

const STAT_LABELS = {
  offense:'Offensiv',
  passing:'Passningsspel',
  defense:'Defensiv',
  discipline:'Disciplin',
  goalkeeper:'Målvakt',
  minutes:'Speltid',
};

const FIELD_LABELS = {
  goals:'Mål',
  assists:'Assist',
  shots:'Skott',
  shotsOnTarget:'Skott på mål',
  keyPasses:'Nyckelpass',
  passesTotal:'Passningar',
  passesAccurate:'Lyckade pass',
  passAccuracyPct:'Passnings%',
  tackles:'Tacklingar',
  interceptions:'Interceptions',
  blocks:'Blockar',
  yellowCards:'Gula kort',
  redCards:'Röda kort',
  saves:'Räddningar',
  goalsConceded:'Insläppta mål',
  cleanSheets:'Hållna nollor',
  appearances:'Matcher',
  starts:'Starter',
  minutes:'Minuter',
};

function availableGroups(stats = {}){
  const available = stats.availableStats || {};
  const players = stats.players || [];
  const inferred = {};
  for(const [group, fields] of Object.entries(available)){
    const realFields = fields.filter(field => players.some(player => Number(player?.[field] ?? player?.stats?.[field] ?? 0) > 0));
    if(realFields.length) inferred[group] = realFields;
  }
  if(Object.keys(inferred).length) return inferred;

  const fallback = {
    offense:['goals', 'assists', 'shots', 'shotsOnTarget'],
    passing:['passesTotal', 'passesAccurate', 'keyPasses'],
    defense:['tackles', 'interceptions', 'blocks'],
    discipline:['yellowCards', 'redCards'],
    goalkeeper:['saves', 'goalsConceded', 'cleanSheets'],
    minutes:['appearances', 'starts', 'minutes'],
  };
  return Object.fromEntries(Object.entries(fallback).map(([group, fields]) => [
    group,
    fields.filter(field => players.some(player => Number(player?.[field] ?? player?.stats?.[field] ?? 0) > 0)),
  ]).filter(([, fields]) => fields.length));
}

function renderGroup(group, fields, players){
  return `
    <section class="card card-pad">
      <div class="card-title">
        <h2>${esc(STAT_LABELS[group] || group)}</h2>
        <small>${esc(fields.length)} kategorier</small>
      </div>
      <div class="leaderboard-grid">
        ${fields.map(field => `
          <article class="card">
            <div class="card-pad">
              <div class="card-title">
                <h3>${esc(FIELD_LABELS[field] || field)}</h3>
              </div>
              ${renderPlayerLeaderboard(playerLeaderboardRows(players, field, 5), FIELD_LABELS[field] || field)}
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

export async function renderStatistics(){
  const league = getActiveLeague();
  const stats = await getPublicStats();
  const players = stats?.players || [];
  const groups = availableGroups(stats || {});
  const groupEntries = Object.entries(groups);

  return `
    <section class="page">
      <header class="page-hero">
        <span class="kicker">${esc(league.publicName)}</span>
        <h1 class="page-title">Statistik</h1>
        <p class="page-lead">
          Den nya statistikvyn läser bara färdiga snapshots. Den visar enbart statistikgrupper som faktiskt finns i cachead data.
        </p>
      </header>

      <section class="grid-3">
        <article class="metric-card"><span>Cacheade lag</span><strong>${esc(stats?.meta?.cachedTeamCount ?? stats?.teams?.length ?? 0)}</strong></article>
        <article class="metric-card"><span>Spelare</span><strong>${esc(players.length)}</strong></article>
        <article class="metric-card"><span>Senast uppdaterad</span><strong>${stats?.meta?.updatedAt ? 'Ja' : 'Nej'}</strong></article>
      </section>

      ${groupEntries.length
        ? groupEntries.map(([group, fields]) => renderGroup(group, fields, players)).join('')
        : emptyState('Statistik är inte uppdaterad ännu', 'Kör en adminimport för vald liga så fylls den här vyn automatiskt.')}
    </section>
  `;
}
