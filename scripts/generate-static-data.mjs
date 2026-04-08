import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'static');

const API_KEY = process.env.APIFOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE = 113;
const SEASONS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

if (!API_KEY) {
  console.error('APIFOOTBALL_KEY saknas');
  process.exit(1);
}

await fs.mkdir(OUT_DIR, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  queries: {},
};

function stableQueryKey(endpoint, params = {}) {
  const qs = new URLSearchParams();
  Object.keys(params).sort().forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const suffix = qs.toString();
  return suffix ? `${endpoint}?${suffix}` : endpoint;
}
function canonicalStaticQueryKey(endpointOrKey, params = null) {
  if (params !== null) return stableQueryKey(endpointOrKey, params);
  const raw = String(endpointOrKey || '').trim();
  if (!raw) return '';
  const [endpoint, query = ''] = raw.split('?');
  if (!query) return endpoint;
  return stableQueryKey(endpoint, Object.fromEntries(new URLSearchParams(query).entries()));
}

function safeSegment(value = '') {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'query';
}

async function fetchApiRaw(endpoint, params = {}) {
  const search = new URLSearchParams(params);
  const response = await fetch(`${BASE_URL}/${endpoint}?${search.toString()}`, {
    headers: { 'x-apisports-key': API_KEY },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || `HTTP ${response.status} for ${endpoint}`);
  }
  if (data?.errors && Object.keys(data.errors).length) {
    throw new Error(Object.values(data.errors).join(', '));
  }
  return data;
}

async function writeStaticQuery(endpoint, params = {}) {
  const key = canonicalStaticQueryKey(endpoint, params);
  if (manifest.queries[key]) return null;
  const raw = await fetchApiRaw(endpoint, params);
  const fileName = `${safeSegment(endpoint)}-${Buffer.from(key).toString('base64url')}.json`;
  const relPath = `/data/static/${fileName}`;
  await fs.writeFile(path.join(OUT_DIR, fileName), JSON.stringify(raw), 'utf8');
  manifest.queries[key] = relPath;
  console.log('[static]', key);
  return raw;
}

async function writePaginatedQuerySet(endpoint, params = {}, onPage = null) {
  const first = await writeStaticQuery(endpoint, params);
  if (!first) return;
  if (typeof onPage === 'function') await onPage(first, params.page || 1);
  const totalPages = Number(first?.paging?.total || 1);
  for (let page = 2; page <= totalPages; page += 1) {
    const raw = await writeStaticQuery(endpoint, { ...params, page });
    if (raw && typeof onPage === 'function') await onPage(raw, page);
  }
}

const teamIds = new Set();
const playerIds = new Set();

for (const season of SEASONS) {
  const standingsRaw = await writeStaticQuery('standings', { league: LEAGUE, season });
  const rows = standingsRaw?.response?.[0]?.league?.standings?.[0] || [];
  rows.forEach((row) => {
    if (row?.team?.id) teamIds.add(row.team.id);
  });
}

for (const teamId of teamIds) {
  await writeStaticQuery('teams', { id: teamId }).catch(() => null);
  await writeStaticQuery('players/squads', { team: teamId }).catch(() => null);
  await writeStaticQuery('transfers', { team: teamId }).catch(() => null);

  for (const season of SEASONS) {
    await writeStaticQuery('teams/statistics', { league: LEAGUE, season, team: teamId }).catch(() => null);
    await writePaginatedQuerySet('fixtures', { league: LEAGUE, season, team: teamId }, null).catch(() => null);
    await writePaginatedQuerySet('players', { league: LEAGUE, season, team: teamId }, async (raw) => {
      (raw?.response || []).forEach((entry) => {
        if (entry?.player?.id) playerIds.add(entry.player.id);
      });
    }).catch(() => null);
  }
}

for (const playerId of playerIds) {
  await writeStaticQuery('players/profiles', { player: playerId }).catch(() => null);
  await writeStaticQuery('transfers', { player: playerId }).catch(() => null);
  for (const season of SEASONS) {
    await writeStaticQuery('players', { id: playerId, season }).catch(() => null);
  }
}

await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Static manifest written with ${Object.keys(manifest.queries).length} queries.`);
