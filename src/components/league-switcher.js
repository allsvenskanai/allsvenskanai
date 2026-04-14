import { listLeagues } from '../config/leagues.js';
import { appState, setActiveLeague } from '../state/app-state.js';

export function mountLeagueSwitcher(container, onChange){
  if(!container) return;
  const render = () => {
    container.innerHTML = listLeagues().map(league => `
      <button type="button" class="${league.key === appState.leagueKey ? 'active' : ''}" data-league="${league.key}">
        ${league.shortName}
      </button>
    `).join('');
  };
  render();
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-league]');
    if(!button) return;
    setActiveLeague(button.dataset.league);
    render();
    onChange?.();
  });
}
