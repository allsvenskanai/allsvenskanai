export function esc(value = ''){
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatNumber(value, fallback = '0'){
  const number = Number(value);
  if(!Number.isFinite(number)) return fallback;
  return new Intl.NumberFormat('sv-SE').format(number);
}

export function formatDecimal(value, digits = 1, fallback = '0,0'){
  const number = Number(value);
  if(!Number.isFinite(number)) return fallback;
  return number.toLocaleString('sv-SE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatDate(value){
  if(!value) return '';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('sv-SE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

export function normalizeSearch(value = ''){
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function playerName(player = {}){
  return player.playerName || player.name || player.player?.name || 'Okänd spelare';
}

export function teamName(team = {}){
  return team.teamName || team.name || team.team?.name || 'Okänt lag';
}
