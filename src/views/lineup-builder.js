import { getActiveLeague } from '../state/app-state.js';
import { getLineupBuilderData } from '../services/public-data.js';
import { esc, normalizeSearch } from '../services/formatters.js';
import { emptyState } from '../components/loading-state.js';

const STORAGE_KEY = 'allsvenskanai-next-lineup';

const FORMATIONS = {
  '4-4-2': [
    [{ code:'ANF', role:'Anfallare' }, { code:'ANF', role:'Anfallare' }],
    [{ code:'VM', role:'Vänster mittfält' }, { code:'CM', role:'Central mittfältare' }, { code:'CM', role:'Central mittfältare' }, { code:'HM', role:'Höger mittfält' }],
    [{ code:'VB', role:'Vänsterback' }, { code:'MB', role:'Mittback' }, { code:'MB', role:'Mittback' }, { code:'HB', role:'Högerback' }],
    [{ code:'MV', role:'Målvakt' }],
  ],
  '4-3-3': [
    [{ code:'VF', role:'Vänsterytter' }, { code:'ANF', role:'Anfallare' }, { code:'HF', role:'Högerytter' }],
    [{ code:'CM', role:'Central mittfältare' }, { code:'CM', role:'Central mittfältare' }, { code:'CM', role:'Central mittfältare' }],
    [{ code:'VB', role:'Vänsterback' }, { code:'MB', role:'Mittback' }, { code:'MB', role:'Mittback' }, { code:'HB', role:'Högerback' }],
    [{ code:'MV', role:'Målvakt' }],
  ],
  '3-5-2': [
    [{ code:'ANF', role:'Anfallare' }, { code:'ANF', role:'Anfallare' }],
    [{ code:'VM', role:'Vänster mittfält' }, { code:'CM', role:'Central mittfältare' }, { code:'OM', role:'Offensiv mittfältare' }, { code:'CM', role:'Central mittfältare' }, { code:'HM', role:'Höger mittfält' }],
    [{ code:'MB', role:'Mittback' }, { code:'MB', role:'Mittback' }, { code:'MB', role:'Mittback' }],
    [{ code:'MV', role:'Målvakt' }],
  ],
};

const state = {
  formation:'4-4-2',
  title:'Omgångens elva',
  subtitle:'',
  teamId:'all',
  selectedSlot:0,
  slots:{},
  data:null,
};

function loadSaved(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    Object.assign(state, {
      formation:saved.formation || state.formation,
      title:saved.title || state.title,
      subtitle:saved.subtitle || '',
      teamId:saved.teamId || 'all',
      slots:saved.slots || {},
    });
  } catch {}
}

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    formation:state.formation,
    title:state.title,
    subtitle:state.subtitle,
    teamId:state.teamId,
    slots:state.slots,
  }));
}

function flatSlots(){
  return FORMATIONS[state.formation].flat().map((slot, index) => ({ ...slot, index }));
}

function rowX(count, index){
  if(count === 1) return 50;
  const gap = Math.min(70 / Math.max(count - 1, 1), 22);
  const start = 50 - gap * (count - 1) / 2;
  return start + gap * index;
}

function rowY(rowIndex, rowCount){
  const values = rowCount === 4 ? [20, 44, 67, 86] : [18, 38, 58, 76, 88];
  return values[rowIndex] || 50;
}

function playerInitials(player){
  return String(player?.name || '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function renderPitch(){
  let slotIndex = 0;
  return `
    <section class="lb-next-preview card">
      <div class="lb-next-card" id="lineup-export-node">
        <div class="lb-next-head">
          <span>AllsvenskanAI</span>
          <strong>${esc(state.title || 'Startelva')}</strong>
          <small>${esc(state.subtitle || getActiveLeague().name)}</small>
        </div>
        <div class="lb-next-pitch">
          <span class="pitch-line halfway"></span>
          <span class="pitch-circle"></span>
          <span class="pitch-box top"></span>
          <span class="pitch-box bottom"></span>
          ${FORMATIONS[state.formation].map((row, rowIndex, rows) => row.map((slot, index) => {
            const currentIndex = slotIndex++;
            const player = state.slots[currentIndex];
            return `
              <button type="button" class="lb-next-slot ${state.selectedSlot === currentIndex ? 'active' : ''}" data-slot="${currentIndex}" style="left:${rowX(row.length, index)}%;top:${rowY(rowIndex, rows.length)}%">
                <span class="slot-badge">${esc(slot.code)}</span>
                <span class="slot-avatar">${player ? esc(playerInitials(player)) : '+'}</span>
                <strong>${esc(player?.name || 'Välj spelare')}</strong>
                <small>${esc(player?.teamName || slot.role)}</small>
              </button>
            `;
          }).join('')).join('')}
        </div>
        <div class="lb-next-foot">
          <span>ALLSVENSKANAI</span>
          <span>${esc(state.formation)} • ${esc(getActiveLeague().name)}</span>
        </div>
      </div>
    </section>
  `;
}

function filteredPlayers(){
  const query = normalizeSearch(document.getElementById('lb-player-search')?.value || '');
  const players = state.data?.players || [];
  return players
    .filter(player => state.teamId === 'all' || String(player.teamId) === String(state.teamId))
    .filter(player => !query || normalizeSearch(`${player.name} ${player.teamName} ${player.position}`).includes(query))
    .slice(0, 32);
}

function renderPlayerResults(){
  const target = document.getElementById('lb-player-results');
  if(!target) return;
  const players = filteredPlayers();
  target.innerHTML = players.length ? players.map(player => `
    <button type="button" class="lb-next-result" data-player="${esc(player.id)}">
      <span class="slot-avatar small">${esc(playerInitials(player))}</span>
      <span>
        <strong>${esc(player.name)}</strong>
        <small>${esc(player.teamName || 'Okänt lag')} • ${esc(player.position || 'Position saknas')}</small>
      </span>
    </button>
  `).join('') : '<div class="empty-box"><strong>Ingen träff</strong><span>Prova ett annat namn eller byt lagfilter.</span></div>';
}

function redraw(){
  const root = document.getElementById('lineup-builder-root');
  if(!root) return;
  root.querySelector('#lb-pitch-wrap').innerHTML = renderPitch();
  save();
}

function bind(){
  const root = document.getElementById('lineup-builder-root');
  if(!root) return;
  root.addEventListener('input', event => {
    if(event.target.id === 'lb-title') state.title = event.target.value;
    if(event.target.id === 'lb-subtitle') state.subtitle = event.target.value;
    if(event.target.id === 'lb-player-search') renderPlayerResults();
    redraw();
  });
  root.addEventListener('change', event => {
    if(event.target.id === 'lb-formation') state.formation = event.target.value;
    if(event.target.id === 'lb-team') state.teamId = event.target.value;
    redraw();
    renderPlayerResults();
  });
  root.addEventListener('click', async event => {
    const slot = event.target.closest('[data-slot]');
    const playerButton = event.target.closest('[data-player]');
    if(slot) {
      state.selectedSlot = Number(slot.dataset.slot);
      redraw();
      return;
    }
    if(playerButton) {
      const player = (state.data?.players || []).find(item => String(item.id) === String(playerButton.dataset.player));
      if(player) {
        state.slots[state.selectedSlot] = player;
        redraw();
      }
      return;
    }
    if(event.target.closest('[data-clear-lineup]')) {
      state.slots = {};
      redraw();
      return;
    }
    if(event.target.closest('[data-remove-slot]')) {
      delete state.slots[state.selectedSlot];
      redraw();
      return;
    }
    if(event.target.closest('[data-export-lineup]')) {
      await exportLineupPng();
    }
  });
  renderPlayerResults();
}

async function exportLineupPng(){
  const node = document.getElementById('lineup-export-node');
  if(!node) return;
  const styles = `
    .lb-next-card{width:984px;height:1824px;border-radius:42px;padding:56px;background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.08),transparent 430px),linear-gradient(180deg,#0d2216,#07130d);box-sizing:border-box;color:#fff;font-family:Arial,sans-serif}
    .lb-next-head,.lb-next-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}
    .lb-next-head span,.lb-next-foot span{color:#d8b85d;font-size:18px;font-weight:900;letter-spacing:2px;text-transform:uppercase}
    .lb-next-head strong{display:block;color:#fff;font-family:Arial,sans-serif;font-size:72px;line-height:.9;text-transform:uppercase;text-align:center}
    .lb-next-head small{color:rgba(255,255,255,.75);font-size:20px;font-weight:900;letter-spacing:1px;text-transform:uppercase}
    .lb-next-pitch{position:relative;height:1450px;margin:48px 0;overflow:hidden;border:3px solid rgba(255,255,255,.28);border-radius:34px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 90px,rgba(255,255,255,.01) 90px 180px),linear-gradient(180deg,#1f8d50,#126b3c)}
    .pitch-line,.pitch-circle,.pitch-box{position:absolute;pointer-events:none;border-color:rgba(255,255,255,.34)}
    .pitch-line.halfway{left:0;right:0;top:50%;border-top:3px solid rgba(255,255,255,.34)}
    .pitch-circle{left:50%;top:50%;width:220px;height:220px;border:3px solid rgba(255,255,255,.34);border-radius:50%;transform:translate(-50%,-50%)}
    .pitch-box{left:27%;width:46%;height:180px;border:3px solid rgba(255,255,255,.34)}
    .pitch-box.top{top:-3px}.pitch-box.bottom{bottom:-3px}
    .lb-next-slot{position:absolute;z-index:3;display:grid;justify-items:center;gap:8px;width:160px;padding:0;border:0;color:#fff;background:transparent;transform:translate(-50%,-50%)}
    .slot-badge{min-width:54px;padding:7px 12px;border-radius:999px;color:#fff;background:#06100b;font-size:15px;font-weight:900;letter-spacing:.8px;text-align:center}
    .slot-avatar{display:grid;place-items:center;width:96px;height:96px;border:5px solid rgba(255,255,255,.92);border-radius:50%;color:#06100b;background:linear-gradient(135deg,#f5f0df,#caa94f);font-size:38px;font-weight:900;box-shadow:0 18px 34px rgba(0,0,0,.34)}
    .lb-next-slot strong{max-width:170px;padding:6px 10px;border-radius:999px;background:rgba(2,8,5,.58);font-size:18px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lb-next-slot small{max-width:176px;color:#d9efe0;font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
  `;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
      <foreignObject width="1080" height="1920">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:1080px;height:1920px;background:#06100b;padding:48px;box-sizing:border-box;">
          <style>${styles}</style>
          ${node.outerHTML}
        </div>
      </foreignObject>
    </svg>`;
  const img = new Image();
  const blob = new Blob([svg], { type:'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#06100b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  canvas.toBlob(blobOut => {
    if(!blobOut) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blobOut);
    link.download = `allsvenskanai-${Date.now()}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, 'image/png', 1);
}

export async function renderLineupBuilder(){
  loadSaved();
  state.data = await getLineupBuilderData();
  const teams = state.data.teams || [];
  if(!state.data.players.length) {
    return emptyState('Spelardata saknas', 'Kör adminimport för lag/spelare så fylls lineup buildern med cachead data.');
  }
  queueMicrotask(bind);
  return `
    <section class="page" id="lineup-builder-root">
      <header class="page-hero">
        <span class="kicker">Lineup Builder</span>
        <h1 class="page-title">Bygg din startelva</h1>
        <p class="page-lead">Ny modulär builder som läser cachead spelar- och lagdata. Ingen tung spelarimport körs från publik vy.</p>
      </header>
      <section class="lb-next-layout">
        <aside class="card card-pad lb-next-controls">
          <div class="card-title"><h2>Kontroller</h2><small>${esc(state.data.players.length)} spelare</small></div>
          <label class="admin-field"><span>Titel</span><input id="lb-title" value="${esc(state.title)}"></label>
          <label class="admin-field"><span>Underrubrik</span><input id="lb-subtitle" value="${esc(state.subtitle)}" placeholder="${esc(getActiveLeague().name)}"></label>
          <label class="admin-field"><span>Formation</span><select id="lb-formation">${Object.keys(FORMATIONS).map(item => `<option ${item === state.formation ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></label>
          <label class="admin-field"><span>Lagfilter</span><select id="lb-team"><option value="all">Alla lag</option>${teams.map(team => `<option value="${esc(team.id || team.teamId)}" ${String(team.id || team.teamId) === String(state.teamId) ? 'selected' : ''}>${esc(team.name || team.teamName)}</option>`).join('')}</select></label>
          <label class="admin-field"><span>Sök spelare</span><input id="lb-player-search" type="search" placeholder="Sök namn, lag eller position"></label>
          <div class="admin-actions">
            <button type="button" class="cta primary" data-export-lineup>Exportera PNG</button>
            <button type="button" class="cta" data-remove-slot>Rensa position</button>
            <button type="button" class="cta" data-clear-lineup>Rensa elva</button>
          </div>
          <div id="lb-player-results" class="lb-next-results"></div>
        </aside>
        <div id="lb-pitch-wrap">${renderPitch()}</div>
      </section>
    </section>
  `;
}
