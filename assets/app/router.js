import { loadingState, errorState } from './components/loading-state.js';
import { renderHome } from './views/home.js';
import { renderStandings } from './views/standings.js';
import { renderResults } from './views/results.js';
import { renderStatistics } from './views/statistics.js';
import { renderMatch } from './views/match.js';
import { renderTeam } from './views/team.js';
import { renderPlayer } from './views/player.js';
import { renderTransfers } from './views/transfers.js';
import { renderLineupBuilder } from './views/lineup-builder.js';
import { renderAdmin } from './views/admin.js';

const routes = [
  { pattern:/^\/(?:app\.html)?$/, id:'home', render:renderHome },
  { pattern:/^\/tabell\/?$/, id:'standings', render:renderStandings },
  { pattern:/^\/resultat\/?$/, id:'results', render:renderResults },
  { pattern:/^\/statistik\/?$/, id:'statistics', render:renderStatistics },
  { pattern:/^\/match\/([^/]+)\/?$/, id:'match', render:renderMatch },
  { pattern:/^\/lag\/([^/]+)\/?$/, id:'team', render:renderTeam },
  { pattern:/^\/spelare\/([^/]+)\/?$/, id:'player', render:renderPlayer },
  { pattern:/^\/(?:transfers|overgangar|övergångar)\/?$/, id:'transfers', render:renderTransfers },
  { pattern:/^\/lineup-builder\/?$/, id:'lineup', render:renderLineupBuilder },
  { pattern:/^\/admin\/?$/, id:'admin', render:renderAdmin },
];

function currentPath(){
  const hashPath = location.hash?.replace(/^#/, '');
  if(hashPath) return hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
  return location.pathname === '/app.html' ? '/' : location.pathname;
}

function normalizePath(pathname = '/'){
  if(pathname === '/app.html') return '/';
  return pathname || '/';
}

function matchRoute(pathname){
  const normalized = normalizePath(pathname);
  for(const route of routes){
    const match = normalized.match(route.pattern);
    if(match) return { ...route, params:match.slice(1), path:normalized };
  }
  return { id:'not-found', params:[], path:normalized, render:renderHome };
}

export function navigate(path){
  const url = new URL(path, location.origin);
  const nextPath = url.hash ? url.hash.replace(/^#/, '') : normalizePath(url.pathname);
  const normalizedNext = nextPath || '/';
  if(currentPath() === normalizedNext) return renderCurrentRoute();
  location.hash = normalizedNext;
  return null;
}

export async function renderCurrentRoute(){
  const app = document.getElementById('app');
  if(!app) return;
  const route = matchRoute(currentPath());
  app.innerHTML = loadingState('Laddar vy...');
  updateActiveLinks(route.path);
  try {
    app.innerHTML = await route.render({ params:route.params, route });
    app.focus({ preventScroll:true });
  } catch(error) {
    console.error('[router]', error);
    app.innerHTML = errorState(error);
  }
}

export function bindRouter(){
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-link]');
    if(!link) return;
    const url = new URL(link.href, location.origin);
    if(url.origin !== location.origin) return;
    event.preventDefault();
    navigate(url.href);
  });
  window.addEventListener('hashchange', renderCurrentRoute);
  window.addEventListener('popstate', renderCurrentRoute);
}

function updateActiveLinks(path){
  const normalized = normalizePath(path);
  document.querySelectorAll('a[data-link]').forEach(link => {
    const url = new URL(link.href, location.origin);
    const linkPath = normalizePath(url.hash ? url.hash.replace(/^#/, '') : url.pathname);
    const active = linkPath === normalized || (normalized === '/' && linkPath === '/');
    link.classList.toggle('active', active);
  });
}
