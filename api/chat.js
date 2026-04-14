const LEAGUE_ID = 573;
const DEFAULT_SEASON = 26806;

const SYSTEM_HAIKU = `
Du hjälper en fotbollssajt om Allsvenskan.
Svara kort på svenska.
Använd bara datan jag skickar.
Hitta inte på något.
Max 2 meningar eller en kort lista.
`;

const SYSTEM_SONNET = `
Du hjälper en fotbollssajt om Allsvenskan.
Svara tydligt på svenska.
Använd bara datan jag skickar.
Om datan inte räcker, säg det kort.
Max 120 ord.
`;

const HAIKU_MODEL = process.env.ANTHROPIC_HAIKU_MODEL || 'claude-3-5-haiku-20241022';
const SONNET_MODEL = process.env.ANTHROPIC_SONNET_MODEL || 'claude-sonnet-4-20250514';

function chatSeasonId(yearOrSeason = DEFAULT_SEASON){
  const numeric = Number(yearOrSeason || DEFAULT_SEASON);
  if(numeric === 2026) return 26806;
  return numeric || DEFAULT_SEASON;
}

function requestOrigin(req){
  const configured = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  if(configured) {
    const trimmed = configured.replace(/\/$/, '');
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  }
  const vercelUrl = process.env.VERCEL_URL || '';
  if(vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`;
  return `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
}

const SUPPORTED_INTENTS = [
  'top_scorers',
  'latest_matches',
  'standings',
  'table_leader',
  'most_points',
  'goal_difference',
  'form',
];

const TEAM_ALIASES = {
  'aik': 'AIK',
  'aik stockholm': 'AIK',
  'mff': 'Malmö FF',
  'malmö': 'Malmö FF',
  'malmo': 'Malmö FF',
  'malmö ff': 'Malmö FF',
  'hammarby': 'Hammarby IF',
  'hammarby if': 'Hammarby IF',
  'djurgården': 'Djurgårdens IF',
  'djurgarden': 'Djurgårdens IF',
  'djurgårdens if': 'Djurgårdens IF',
  'göteborg': 'IFK Göteborg',
  'goteborg': 'IFK Göteborg',
  'ifk göteborg': 'IFK Göteborg',
  'ifk goteborg': 'IFK Göteborg',
  'häcken': 'BK Häcken',
  'hacken': 'BK Häcken',
  'bk häcken': 'BK Häcken',
};

function json(res, status, body) {
  return res.status(status).json(body);
}

function messageResponse(text, meta = {}) {
  return {
    id: 'backend-answer',
    type: 'message',
    role: 'assistant',
    model: 'backend-routing',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    meta,
  };
}

function getQuestion(messages = []) {
  const userMessage = [...messages].reverse().find(message => message?.role === 'user');
  if (!userMessage) return '';
  if (typeof userMessage.content === 'string') return userMessage.content.trim();
  if (Array.isArray(userMessage.content)) {
    return userMessage.content
      .filter(part => part?.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('\n')
      .trim();
  }
  return '';
}

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!.,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksAbbreviatedPlayerName(name = '') {
  return /^[A-ZÅÄÖ]\.\s+/u.test(String(name || '').trim());
}

function buildPlayerFullName(firstname = '', lastname = '') {
  return [firstname, lastname]
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function getPlayerDisplayName(player = {}) {
  const fullname = player?.fullname || player?.full_name || '';
  if (String(fullname || '').trim()) return String(fullname).trim();

  const firstLast = buildPlayerFullName(
    player?.firstname || player?.first_name || '',
    player?.lastname || player?.last_name || ''
  );
  const rawName = String(player?.name || '').trim();

  if (firstLast && (!rawName || looksAbbreviatedPlayerName(rawName))) return firstLast;
  if (rawName && !looksAbbreviatedPlayerName(rawName)) return rawName;
  if (firstLast) return firstLast;
  return rawName || '—';
}

function extractJson(text = '') {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function textFromAnthropic(data) {
  return (data?.content || [])
    .filter(block => block?.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();
}

async function callAnthropic({ apiKey, model, system, messages, maxTokens }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  const data = await response.json();
  return { response, data };
}

async function fetchFootball(apiKey, endpoint, params = {}) {
  const normalizedParams = { ...params };
  if(normalizedParams.season !== undefined && normalizedParams.season_id === undefined) {
    normalizedParams.season_id = chatSeasonId(normalizedParams.season);
    delete normalizedParams.season;
  }
  const search = new URLSearchParams({ _endpoint:endpoint, ...normalizedParams });
  const response = await fetch(`${apiKey.replace(/\/$/, '')}/api/football?${search.toString()}`, {
    headers:{ accept:'application/json' },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Football API ${response.status}`);
  }
  return data.response || [];
}

async function fetchStandings(apiKey, season, allowFallback = false) {
  let data = await fetchFootball(apiKey, 'standings', { league: LEAGUE_ID, season_id:chatSeasonId(season) }).catch(() => []);
  let standings = data[0]?.league?.standings?.[0] || [];
  if (!standings.length && allowFallback && chatSeasonId(season) !== DEFAULT_SEASON) {
    data = await fetchFootball(apiKey, 'standings', { league: LEAGUE_ID, season_id: DEFAULT_SEASON }).catch(() => []);
    standings = data[0]?.league?.standings?.[0] || [];
  }
  return standings;
}

function resolveTeam(teamName, standings = []) {
  if (!teamName) return null;
  const normalized = normalizeText(teamName);
  const teams = standings.map(row => row.team).filter(Boolean);

  for (const team of teams) {
    if (normalizeText(team.name || '') === normalized) return team;
  }

  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (normalized === normalizeText(alias) || normalized.includes(normalizeText(alias))) {
      const normalizedAlias = normalizeText(alias);
      return teams.find(team => normalizeText(team.name || '') === normalizeText(canonical))
        || teams.find(team => normalizeText(team.name || '').includes(normalizedAlias))
        || null;
    }
  }

  return null;
}

function extractExplicitYear(question) {
  const match = String(question).match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

async function interpretQuestion({ apiKey, question, standings }) {
  const teamNames = standings.map(row => row.team?.name).filter(Boolean);
  const prompt = [
    'Tolkar en användarfråga om Allsvenskan.',
    `Tillåtna intents: ${SUPPORTED_INTENTS.join(', ')}`,
    'Returnera ENDAST JSON med exakt dessa nycklar:',
    'intent, team, year, scope, confidence',
    'team måste vara ett exakt lagnamn från listan eller null.',
    'scope måste vara "season" eller "all_time".',
    'confidence måste vara ett tal mellan 0 och 1.',
    `Tillgängliga lag: ${teamNames.join(', ')}`,
    'Om du är osäker: intent = null, team = null, confidence under 0.5.',
    `Fråga: ${question}`,
  ].join('\n');

  const { response, data } = await callAnthropic({
    apiKey,
    model: HAIKU_MODEL,
    system: SYSTEM_HAIKU,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 120,
  });

  if (!response.ok) {
    throw new Error(data?.error?.message || `Anthropic ${response.status}`);
  }

  return extractJson(textFromAnthropic(data));
}

function validateInterpretation(parsed, question, standings) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'missing_json' };
  if (!SUPPORTED_INTENTS.includes(parsed.intent)) return { ok: false, reason: 'unsupported_intent' };

  const explicitYear = extractExplicitYear(question);
  const year = Number.isInteger(parsed.year) ? parsed.year : explicitYear || DEFAULT_SEASON;
  const scope = parsed.scope === 'all_time' ? 'all_time' : 'season';
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence);
  const team = resolveTeam(parsed.team, standings);

  if (parsed.team && !team) return { ok: false, reason: 'unknown_team' };
  if (explicitYear && year !== explicitYear) return { ok: false, reason: 'year_mismatch' };
  if (Number.isFinite(confidence) && confidence < 0.45) return { ok: false, reason: 'low_confidence' };

  return {
    ok: true,
    interpretation: {
      intent: parsed.intent,
      team,
      year,
      scope,
      confidence: Number.isFinite(confidence) ? confidence : 0.5,
    },
  };
}

function compactStandingRow(row) {
  return {
    team: row.team?.name || '—',
    rank: row.rank || 0,
    points: row.points || 0,
    goalDifference: row.goalsDiff || 0,
    form: row.form || '',
  };
}

function formScore(form = '') {
  return String(form)
    .slice(-5)
    .split('')
    .reduce((sum, token) => sum + (token === 'W' ? 3 : token === 'D' ? 1 : 0), 0);
}

async function runIntent({ footballApiKey, interpretation, standings }) {
  const { intent, team, year, scope } = interpretation;

  if (scope === 'all_time') {
    return { ok: false, reason: 'unsupported_scope', message: 'Historisk statistik finns inte tillgänglig ännu.' };
  }

  switch (intent) {
    case 'table_leader':
    case 'most_points': {
      const row = standings[0];
      if (!row) return { ok: false, reason: 'no_data', message: 'Tabelldata saknas just nu.' };
      return {
        ok: true,
        kind: 'teams',
        title: intent === 'table_leader' ? 'Leder tabellen' : 'Flest poäng',
        rows: [compactStandingRow(row)],
      };
    }
    case 'standings':
      return {
        ok: true,
        kind: 'teams',
        title: 'Toppen i tabellen',
        rows: standings.slice(0, 5).map(compactStandingRow),
      };
    case 'goal_difference':
      return {
        ok: true,
        kind: 'teams',
        title: 'Bäst målskillnad',
        rows: [...standings].sort((a, b) => (b.goalsDiff || 0) - (a.goalsDiff || 0)).slice(0, 5).map(compactStandingRow),
      };
    case 'form':
      return {
        ok: true,
        kind: 'teams',
        title: 'Bäst form',
        rows: [...standings].sort((a, b) => formScore(b.form) - formScore(a.form)).slice(0, 5).map(compactStandingRow),
      };
    case 'top_scorers': {
      const seasonId = chatSeasonId(year);
      if (team) {
        const players = await fetchFootball(footballApiKey, 'players', { league: LEAGUE_ID, season_id: seasonId, team: team.id }).catch(() => []);
        const rows = players
          .map(item => ({
            player: getPlayerDisplayName(item.player),
            team: team.name,
            goals: item.statistics?.[0]?.goals?.total || 0,
          }))
          .filter(item => item.goals > 0)
          .sort((a, b) => b.goals - a.goals)
          .slice(0, 5);
        if (!rows.length) return { ok: false, reason: 'no_team_scorers', message: `Ingen målstatistik hittades för ${team.name} ${year}.` };
        return { ok: true, kind: 'scorers', title: `Flest mål i ${team.name}`, team: team.name, rows };
      }

      const scorers = await fetchFootball(footballApiKey, 'players/topscorers', { league: LEAGUE_ID, season_id: seasonId }).catch(() => []);
      const rows = scorers.slice(0, 5).map(item => ({
        player: getPlayerDisplayName(item.player),
        team: item.statistics?.[0]?.team?.name || '—',
        goals: item.statistics?.[0]?.goals?.total || 0,
      }));
      if (!rows.length) return { ok: false, reason: 'no_scorers', message: `Ingen skytteliga hittades för ${year}.` };
      return { ok: true, kind: 'scorers', title: 'Flest mål i Allsvenskan', rows };
    }
    case 'latest_matches': {
      const seasonId = chatSeasonId(year);
      const params = team
        ? { team: team.id, season_id: seasonId, last: 3 }
        : { league: LEAGUE_ID, season_id: seasonId, last: 3 };
      const fixtures = await fetchFootball(footballApiKey, 'fixtures', params).catch(() => []);
      const rows = fixtures.map(item => ({
        home: item.teams?.home?.name || '—',
        away: item.teams?.away?.name || '—',
        score: `${item.goals?.home ?? '–'}-${item.goals?.away ?? '–'}`,
        status: item.fixture?.status?.short || 'NS',
      }));
      if (!rows.length) {
        return { ok: false, reason: 'no_matches', message: team ? `Inga matcher hittades för ${team.name} ${year}.` : `Inga matcher hittades för ${year}.` };
      }
      return { ok: true, kind: 'matches', title: team ? `${team.name} senaste matcher` : 'Senaste matcher', team: team?.name || null, rows };
    }
    default:
      return { ok: false, reason: 'unsupported_intent', message: 'Den frågan stöds inte ännu.' };
  }
}

function validateResult(intent, interpretation, result) {
  if (!result?.ok) return false;

  if (interpretation.scope === 'all_time') return false;

  if (intent === 'top_scorers') {
    if (result.kind !== 'scorers' || !result.rows.every(row => typeof row.player === 'string')) return false;
    if (interpretation.team && !result.rows.every(row => row.team === interpretation.team.name)) return false;
  }

  if (intent === 'latest_matches') {
    if (result.kind !== 'matches' || !result.rows.every(row => typeof row.home === 'string' && typeof row.away === 'string')) return false;
  }

  if (['standings', 'table_leader', 'most_points', 'goal_difference', 'form'].includes(intent)) {
    if (result.kind !== 'teams' || !result.rows.every(row => typeof row.team === 'string')) return false;
  }

  return true;
}

function renderResult(result) {
  if (!result?.ok) return result?.message || 'Testa att fråga om tabellen, mål, poäng eller senaste matcher för ett lag.';

  if (result.kind === 'scorers') {
    return [
      `${result.title}:`,
      ...result.rows.map((row, index) => `${index + 1}. ${row.player} (${row.team}) – ${row.goals} mål`),
    ].join('\n');
  }

  if (result.kind === 'matches') {
    return [
      `${result.title}:`,
      ...result.rows.map(row => `- ${row.home} ${row.score} ${row.away}`),
    ].join('\n');
  }

  return [
    `${result.title}:`,
    ...result.rows.map(row => `${row.rank}. ${row.team} – ${row.points}p (${row.goalDifference >= 0 ? '+' : ''}${row.goalDifference})`),
  ].join('\n');
}

function safeFallback(question, reason) {
  return messageResponse(
    'Testa att fråga om tabellen, mål, poäng eller senaste matcher för ett lag.',
    { question, reason }
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const footballApiBase = requestOrigin(req);
  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return json(res, 400, { error: { message: 'Ogiltigt format.' } });
  }

  const question = getQuestion(messages);
  if (!question) {
    return json(res, 400, { error: { message: 'Fråga saknas.' } });
  }

  try {
    if (!anthropicApiKey) {
      return json(res, 500, { error: { message: 'API-nyckel saknas på servern.' } });
    }
    const explicitYear = extractExplicitYear(question);
    const standings = await fetchStandings(footballApiBase, explicitYear || DEFAULT_SEASON, !explicitYear);
    const parsed = await interpretQuestion({ apiKey: anthropicApiKey, question, standings });
    const validated = validateInterpretation(parsed, question, standings);

    console.log('[chat:interpret]', {
      question,
      parsed,
      validated,
    });

    if (!validated.ok) {
      return json(res, 200, safeFallback(question, validated.reason));
    }

    const result = await runIntent({
      footballApiKey: footballApiBase,
      interpretation: validated.interpretation,
      standings,
    });

    const ok = validateResult(validated.interpretation.intent, validated.interpretation, result);
    console.log('[chat:result]', {
      question,
      interpretation: validated.interpretation,
      resultKind: result?.kind || null,
      validation: ok,
    });

    if (!ok) {
      return json(res, 200, safeFallback(question, result?.reason || 'validation_failed'));
    }

    return json(res, 200, messageResponse(renderResult(result), {
      interpretation: validated.interpretation,
      resultKind: result.kind,
      haikuModel: HAIKU_MODEL,
      sonnetModel: SONNET_MODEL,
    }));
  } catch (err) {
    console.error('[chat:error]', err);
    return json(res, 500, { error: { message: err.message } });
  }
}
