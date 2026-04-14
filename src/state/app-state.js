import { DEFAULT_LEAGUE_KEY, getLeague, resolveLeagueKey } from '../config/leagues.js';

const STORAGE_KEY = 'allsvenskanai-next-league';

const listeners = new Set();

export const appState = {
  leagueKey: resolveLeagueKey(localStorage.getItem(STORAGE_KEY) || DEFAULT_LEAGUE_KEY),
};

export function getActiveLeague(){
  return getLeague(appState.leagueKey);
}

export function setActiveLeague(key){
  const next = resolveLeagueKey(key);
  if(next === appState.leagueKey) return;
  appState.leagueKey = next;
  localStorage.setItem(STORAGE_KEY, next);
  listeners.forEach(listener => listener(getActiveLeague()));
}

export function subscribeState(listener){
  listeners.add(listener);
  return () => listeners.delete(listener);
}
