import { bindRouter, renderCurrentRoute } from './router.js';
import { mountLeagueSwitcher } from './components/league-switcher.js';
import { clearSearchCache, mountSearch } from './components/search-box.js';
import { clearPublicDataCache } from './services/public-data.js';
import { subscribeState } from './state/app-state.js';

function boot(){
  bindRouter();
  mountSearch(document.getElementById('global-search-slot'));
  mountLeagueSwitcher(document.getElementById('league-switcher'), () => {
    clearPublicDataCache();
    clearSearchCache();
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
