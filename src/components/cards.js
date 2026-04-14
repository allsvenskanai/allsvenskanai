import { esc, formatNumber } from '../services/formatters.js';

export function metricCard(label, value, note = ''){
  const displayValue = Number.isFinite(Number(value)) && String(value).trim() !== ''
    ? formatNumber(value)
    : String(value ?? '–');
  return `
    <article class="metric-card">
      <span>${esc(label)}</span>
      <strong>${esc(displayValue)}</strong>
      ${note ? `<small>${esc(note)}</small>` : ''}
    </article>
  `;
}

export function sectionCard(title, body, meta = ''){
  return `
    <section class="card card-pad">
      <div class="card-title">
        <h2>${esc(title)}</h2>
        ${meta ? `<small>${esc(meta)}</small>` : ''}
      </div>
      ${body}
    </section>
  `;
}
