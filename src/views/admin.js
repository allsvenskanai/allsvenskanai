import { adminAction } from '../services/public-data.js';
import { getActiveLeague } from '../state/app-state.js';
import { esc } from '../services/formatters.js';

const ACTIONS = [
  ['cache-status', 'Cache-status'],
  ['update-standings', 'Uppdatera tabell'],
  ['update-fixtures', 'Uppdatera matcher'],
  ['update-team', 'Uppdatera valt lag'],
  ['update-all-teams', 'Uppdatera alla lag'],
  ['update-player-stats', 'Bygg spelarstatistik'],
  ['rebuild-leaderboards', 'Bygg leaderboards'],
  ['update-transfers', 'Uppdatera transfers'],
  ['clear-cache', 'Rensa cache'],
];

export async function renderAdmin(){
  const league = getActiveLeague();
  queueMicrotask(bindAdminView);
  return `
    <section class="page">
      <header class="page-hero">
        <span class="kicker">Privat drift</span>
        <h1 class="page-title">Admin</h1>
        <p class="page-lead">Admin ar den tunga vagen for import, refresh och rebuild. Publika vyer laser bara fardiga snapshots.</p>
      </header>

      <section class="grid-2">
        <form class="card card-pad" id="admin-form">
          <div class="card-title">
            <h2>Kontroller</h2>
            <small>${esc(league.name)}</small>
          </div>
          <label class="admin-field">
            <span>Admin secret</span>
            <input type="password" name="token" autocomplete="current-password" placeholder="ADMIN_SECRET">
          </label>
          <label class="admin-field">
            <span>Team ID</span>
            <input type="number" name="teamId" placeholder="Valfritt for lag-actions">
          </label>
          <label class="admin-field">
            <span>Limit</span>
            <input type="number" name="limit" value="16">
          </label>
          <div class="admin-actions">
            ${ACTIONS.map(([action, label]) => `<button class="cta ${action === 'cache-status' ? 'primary' : ''}" type="button" data-admin-action="${action}">${esc(label)}</button>`).join('')}
          </div>
        </form>

        <section class="card card-pad">
          <div class="card-title">
            <h2>Status och logg</h2>
            <small id="admin-status">Redo</small>
          </div>
          <div class="admin-log" id="admin-log">
            <div class="grid-3">
              <article class="metric-card"><span>Aktiv liga</span><strong>${esc(league.shortName)}</strong></article>
              <article class="metric-card"><span>Publik kalla</span><strong>/api/stats</strong></article>
              <article class="metric-card"><span>Tung import</span><strong>Admin</strong></article>
            </div>
            <p class="leader-meta">Valj en action for att se status, cachelage eller importresultat.</p>
          </div>
        </section>
      </section>
    </section>
  `;
}

function bindAdminView(){
  const form = document.getElementById('admin-form');
  const log = document.getElementById('admin-log');
  const status = document.getElementById('admin-status');
  if(!form || !log) return;
  form.addEventListener('click', async event => {
    const button = event.target.closest('[data-admin-action]');
    if(!button) return;
    const action = button.dataset.adminAction;
    const data = new FormData(form);
    const token = String(data.get('token') || '').trim();
    const payload = {
      league:getActiveLeague().key,
      teamId:String(data.get('teamId') || '').trim(),
      limit:Number(data.get('limit') || 16),
      force:true,
    };
    status.textContent = 'Kor...';
    button.disabled = true;
    try {
      const result = await adminAction(action, payload, token);
      status.textContent = 'Klart';
      log.innerHTML = renderAdminResult(result);
    } catch(error) {
      status.textContent = 'Fel';
      log.innerHTML = `<div class="error-box"><strong>Action misslyckades</strong><span>${esc(error.message)}</span></div>`;
    } finally {
      button.disabled = false;
    }
  });
}

function renderAdminResult(result = {}){
  const teams = result.teams || result.statuses || result.results || [];
  const summary = [
    ['Action', result.action || 'status'],
    ['API-anrop', result.apiCalls ?? 0],
    ['Stale fallback', result.staleFallback ? 'Ja' : 'Nej'],
    ['Lag', result.teamCount ?? teams.length ?? 0],
  ];
  return `
    <div class="grid-3">
      ${summary.map(([label, value]) => `<article class="metric-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('')}
    </div>
    ${teams.length ? `
      <div class="table-wrap card" style="margin-top:14px">
        <table class="data-table">
          <thead><tr><th>Lag</th><th>Status</th><th>Spelare</th><th>Uppdaterad</th></tr></thead>
          <tbody>
            ${teams.map(team => `
              <tr>
                <td>${esc(team.name || team.teamName || team.team?.name || team.id || team.teamId || 'Lag')}</td>
                <td>${team.ok === false ? 'Fel' : team.cache?.cached || team.cached ? 'Cachead' : 'Ej cachead'}</td>
                <td>${esc(team.cache?.playerCount ?? team.playerCount ?? 0)}</td>
                <td>${esc(team.cache?.updatedAt ? new Date(team.cache.updatedAt).toLocaleString('sv-SE') : team.updatedAt ? new Date(team.updatedAt).toLocaleString('sv-SE') : '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
    <details class="card card-pad" style="margin-top:14px">
      <summary>Ratt svar fran API</summary>
      <pre>${esc(JSON.stringify(result, null, 2))}</pre>
    </details>
  `;
}
