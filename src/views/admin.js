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
        <p class="page-lead">Admin är den tunga vägen för import, refresh och rebuild. Publika vyer läser bara färdiga snapshots.</p>
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
            <input type="number" name="teamId" placeholder="Valfritt för lag-actions">
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
            <h2>Logg</h2>
            <small id="admin-status">Redo</small>
          </div>
          <pre class="admin-log" id="admin-log">Välj en action för att börja.</pre>
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
    status.textContent = 'Kör...';
    button.disabled = true;
    try {
      const result = await adminAction(action, payload, token);
      status.textContent = 'Klart';
      log.textContent = JSON.stringify(result, null, 2);
    } catch(error) {
      status.textContent = 'Fel';
      log.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
