import { bindRouter, renderCurrentRoute } from './router.js';
import { mountLeagueSwitcher } from './components/league-switcher.js';
import { clearPublicDataCache } from './services/public-data.js';
import { subscribeState } from './state/app-state.js';

function boot(){
  bindRouter();
  mountLeagueSwitcher(document.getElementById('league-switcher'), () => {
    clearPublicDataCache();
    renderCurrentRoute();
  });
  subscribeState(() => {
    document.documentElement.dataset.league = 'changed';
  });
  renderCurrentRoute();
}

if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once:true });
} else {
  boot();
}
