import { esc, playerName, teamName } from '../services/formatters.js';

export function playerLeaderboardRows(players = [], valueKey = 'goals', limit = 10){
  return players
    .map(player => ({ player, value:Number(player?.[valueKey] ?? player?.stats?.[valueKey] ?? 0) }))
    .filter(entry => Number.isFinite(entry.value) && entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function renderPlayerLeaderboard(rows = [], label = 'Värde'){
  if(!rows.length) return '<div class="empty-box"><strong>Ingen data</strong><span>Statistiken är inte uppdaterad ännu.</span></div>';
  return `
    <div>
      ${rows.map((entry, index) => `
        <div class="leaderboard-row">
          <span class="rank">${index + 1}</span>
          <span>
            <span class="leader-name">${esc(playerName(entry.player))}</span>
            <span class="leader-meta">${esc(teamName(entry.player))}</span>
          </span>
          <strong class="leader-value" title="${esc(label)}">${esc(entry.value)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}
