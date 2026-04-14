import { esc } from '../services/formatters.js';

export function loadingState(text = 'Laddar data...'){
  return `
    <section class="page-state" aria-live="polite">
      <div class="loader-ring"></div>
      <p>${esc(text)}</p>
    </section>
  `;
}

export function errorState(error, title = 'Något gick fel'){
  return `
    <section class="error-box">
      <strong>${esc(title)}</strong>
      <span>${esc(error?.message || error || 'Försök igen om en stund.')}</span>
    </section>
  `;
}

export function emptyState(title = 'Ingen data', text = 'Det finns inget att visa just nu.'){
  return `
    <section class="empty-box">
      <strong>${esc(title)}</strong>
      <span>${esc(text)}</span>
    </section>
  `;
}
