import { esc } from '../services/formatters.js';

export function renderTable({ columns = [], rows = [], empty = 'Ingen data tillgänglig.' } = {}){
  if(!rows.length) {
    return `<div class="empty-box"><strong>Tom vy</strong><span>${esc(empty)}</span></div>`;
  }
  return `
    <div class="card table-wrap">
      <table class="data-table">
        <thead>
          <tr>${columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${columns.map(column => `<td>${column.render ? column.render(row) : esc(row[column.key])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function formDots(form = ''){
  const values = Array.isArray(form) ? form : String(form || '').split('');
  return `<span class="form-dots">${values.slice(-5).map(token => {
    const cls = token === 'W' ? 'win' : token === 'L' ? 'loss' : 'draw';
    return `<span class="form-dot ${cls}" title="${esc(token)}"></span>`;
  }).join('')}</span>`;
}
