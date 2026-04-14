import { emptyState } from '../components/loading-state.js';

export async function renderPlayer(){
  return emptyState('Spelarsida kommer i Fas 2', 'Spelarsidorna ska läsa normaliserad player-cache, inte göra tunga live-anrop.');
}
