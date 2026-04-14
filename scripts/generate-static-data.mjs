import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'static');
const TOKEN = process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://api.sportmonks.com/v3/football';

const LEAGUES = [
  { key:'allsvenskan', label:'Allsvenskan Herr', leagueId:573, seasonId:26806, seasonLabel:2026 },
  { key:'damallsvenskan', label:'Allsvenskan Dam', leagueId:576, seasonId:26782, seasonLabel:2026 },
];

if(!TOKEN){
  console.error('SPORTMONKS_API_TOKEN saknas. Static build avbruten.');
  process.exit(1);
}

await fs.mkdir(OUT_DIR, { recursive:true });

const manifest = {
  provider:'sportmonks',
  version:2,
  generatedAt:new Date().toISOString(),
  leagues:LEAGUES,
  queries:{},
};

function stableQueryKey(endpoint, params = {}){
  const qs = new URLSearchParams();
  Object.keys(params).sort().forEach(key => {
    const value = params[key];
    if(value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const suffix = qs.toString();
  return suffix ? `${endpoint}?${suffix}` : endpoint;
}

function safeSegment(value = ''){
  return String(value)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'query';
}

async function fetchSportmonks(endpoint, params = {}){
  const query = new URLSearchParams(params);
  query.set('api_token', TOKEN);
  const response = await fetch(`${BASE_URL}/${endpoint.replace(/^\/+/, '')}?${query.toString()}`, {
    headers:{ accept:'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if(!response.ok) throw new Error(data?.message || data?.error || `HTTP ${response.status} for ${endpoint}`);
  return data;
}

async function writeQuery(endpoint, params = {}){
  const key = stableQueryKey(endpoint, params);
  if(manifest.queries[key]) return null;
  const raw = await fetchSportmonks(endpoint, params);
  const fileName = `${safeSegment(endpoint)}-${Buffer.from(key).toString('base64url')}.json`;
  await fs.writeFile(path.join(OUT_DIR, fileName), JSON.stringify(raw), 'utf8');
  manifest.queries[key] = `/data/static/${fileName}`;
  console.log('[static:sportmonks]', key);
  return raw;
}

for(const league of LEAGUES){
  await writeQuery(`seasons/${league.seasonId}`, { include:'stages' }).catch(error => {
    console.warn('[static] season failed', league.key, error.message);
  });
  await writeQuery(`standings/seasons/${league.seasonId}`, { include:'participant;details.type;form;stage' }).catch(error => {
    console.warn('[static] standings failed', league.key, error.message);
  });
  await writeQuery(`teams/seasons/${league.seasonId}`, { include:'venue', per_page:50 }).catch(error => {
    console.warn('[static] teams failed', league.key, error.message);
  });
  await writeQuery('fixtures', {
    include:'participants;league;season;round;venue;state;scores',
    filters:`fixtureSeasons:${league.seasonId}`,
    per_page:50,
  }).catch(error => {
    console.warn('[static] fixtures failed', league.key, error.message);
  });
}

await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Sportmonks static manifest written with ${Object.keys(manifest.queries).length} queries.`);
