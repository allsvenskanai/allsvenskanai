const LEAGUE_ID = 113;
const DEFAULT_SEASON = 2026;

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

const SUPPORTED_ACTIONS = [
  'get_table_leader',
  'get_standings',
  'get_top_scorers',
  'get_team_top_scorers',
  'get_latest_matches',
  'get_team_latest_matches',
  'get_most_points',
  'get_best_goal_difference',
  'get_best_form',
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

function anthropicTextResponse(text, meta = {}) {
  return {
    id: 'server-answer',
    type: 'message',
    role: 'assistant',
    model: meta.model || 'server-routing',
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

function extractJson(text = '') {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
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

function textFromAnthropic(data) {
  return (data?.content || [])
    .filter(block => block?.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();
}

async function fetchFootball(apiKey, endpoint, params = {}) {
  const search = new URLSearchParams(params);
  const response = await fetch(`https://v3.football.api-sports.io/${endpoint}?${search.toString()}`, {
    headers: { 'x-apisports-key': apiKey },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || `Football API ${response.status}`);
  }
  if (data?.errors && Object.keys(data.errors).length) {
    throw new Error(Object.values(data.errors).join(', '));
  }
  return data.response || [];
}

async function getStandings(apiKey, season = DEFAULT_SEASON) {
  let data = await fetchFootball(apiKey, 'standings', { league: LEAGUE_ID, season });
  let standings = data[0]?.league?.standings?.[0] || [];
  if (!standings.length && season !== DEFAULT_SEASON - 1) {
    data = await fetchFootball(apiKey, 'standings', { league: LEAGUE_ID, season: DEFAULT_SEASON - 1 });
    standings = data[0]?.league?.standings?.[0] || [];
  }
  return standings;
}

function resolveTeamName(name, standings = []) {
  if (!name) return null;
  const normalized = normalizeText(name);
  const teams = standings.map(row => row.team).filter(Boolean);

  for (const team of teams) {
    if (normalizeText(team.name || '') === normalized) return team;
  }

  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (normalized === normalizeText(alias)) {
      return teams.find(team => team.name === canonical) || null;
    }
  }

  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (normalized.includes(normalizeText(alias))) {
      return teams.find(team => team.name === canonical) || null;
    }
  }

  return null;
}

function normalizeInterpreterResult(parsed, standings) {
  if (!parsed || typeof parsed !== 'object') return null;

  let action = parsed.action || null;
  const intent = parsed.intent || null;
  const hasTeam = !!parsed.team;
  const scope = parsed.scope === 'all_time' ? 'all_time' : 'season';
  const year = Number.isInteger(parsed.year) ? parsed.year : DEFAULT_SEASON;

  const intentToAction = {
    top_scorers: hasTeam ? 'get_team_top_scorers' : 'get_top_scorers',
    latest_matches: hasTeam ? 'get_team_latest_matches' : 'get_latest_matches',
    standings: 'get_standings',
    table_leader: 'get_table_leader',
    most_points: 'get_most_points',
    goal_difference: 'get_best_goal_difference',
    form: 'get_best_form',
  };

  if (!action && intent) {
    action = intentToAction[intent] || null;
  }

  if (!SUPPORTED_ACTIONS.includes(action)) return null;

  const team = resolveTeamName(parsed.team, standings);
  if (action.startsWith('get_team_') && !team) return null;

  return {
    action,
    intent: intent || action.replace(/^get_/, ''),
    team,
    year,
    scope,
    confidence: parsed.confidence || 'medium',
  };
}

async function interpretQuestion({ apiKey, question, standings }) {
  const teamNames = standings.map(row => row.team?.name).filter(Boolean);
  const interpreterPrompt = [
    'Tolkar en användarfråga om Allsvenskan.',
    `Välj exakt en action från: ${SUPPORTED_ACTIONS.join(', ')}`,
    'Returnera ENDAST JSON med nycklarna: action, intent, team, year, scope, confidence.',
    'scope måste vara "season" eller "all_time".',
    'team måste vara ett exakt lagnamn från listan eller null.',
    `Tillgängliga lag: ${teamNames.join(', ')}`,
    'Om du är osäker, sätt confidence till "low" och action till null.',
    `Fråga: ${question}`,
  ].join('\n');

  const { response, data } = await callAnthropic({
    apiKey,
    model: HAIKU_MODEL,
    system: SYSTEM_HAIKU,
    messages: [{ role: 'user', content: interpreterPrompt }],
    maxTokens: 120,
  });

  if (!response.ok) {
    throw new Error(data?.error?.message || `Anthropic ${response.status}`);
  }

  const parsed = extractJson(textFromAnthropic(data));
  return normalizeInterpreterResult(parsed, standings);
}

function compactStandingRow(row) {
  return {
    team: row.team?.name || '—',
    rank: row.rank || 0,
    points: row.points || 0,
    goal_difference: row.goalsDiff || 0,
    form: row.form || '',
  };
}

function formScore(form = '') {
  return String(form)
    .slice(-5)
    .split('')
    .reduce((sum, token) => sum + (token === 'W' ? 3 : token === 'D' ? 1 : 0), 0);
}

async function runAction({ action, team, year, scope, footballApiKey, standings }) {
  if (scope === 'all_time') {
    return {
      kind: 'unsupported_scope',
      title: team ? `${team.name} historiskt` : 'Historisk statistik',
      rows: [],
      note: 'Historisk statistik finns inte tillgänglig ännu.',
    };
  }

  switch (action) {
    case 'get_table_leader':
    case 'get_most_points':
      return {
        kind: 'standings',
        title: action === 'get_table_leader' ? 'Leder tabellen' : 'Flest poäng',
        rows: standings.slice(0, 1).map(compactStandingRow),
      };
    case 'get_standings':
      return {
        kind: 'standings',
        title: 'Toppen i tabellen',
        rows: standings.slice(0, 5).map(compactStandingRow),
      };
    case 'get_best_goal_difference':
      return {
        kind: 'standings',
        title: 'Bäst målskillnad',
        rows: [...standings]
          .sort((a, b) => (b.goalsDiff || 0) - (a.goalsDiff || 0))
          .slice(0, 5)
          .map(compactStandingRow),
      };
    case 'get_best_form':
      return {
        kind: 'standings',
        title: 'Bäst form',
        rows: [...standings]
          .sort((a, b) => formScore(b.form) - formScore(a.form))
          .slice(0, 5)
          .map(compactStandingRow),
      };
    case 'get_top_scorers': {
      const scorers = await fetchFootball(footballApiKey, 'players/topscorers', { league: LEAGUE_ID, season: year });
      return {
        kind: 'scorers',
        title: 'Flest mål i Allsvenskan',
        rows: scorers.slice(0, 5).map((item, index) => ({
          rank: index + 1,
          player: item.player?.name || '—',
          team: item.statistics?.[0]?.team?.name || '—',
          goals: item.statistics?.[0]?.goals?.total || 0,
        })),
      };
    }
    case 'get_team_top_scorers': {
      const players = await fetchFootball(footballApiKey, 'players', { league: LEAGUE_ID, season: year, team: team.id });
      return {
        kind: 'scorers',
        title: `Flest mål i ${team.name}`,
        team: team.name,
        rows: players
          .map(item => ({
            player: item.player?.name || '—',
            team: team.name,
            goals: item.statistics?.[0]?.goals?.total || 0,
          }))
          .filter(item => item.goals > 0)
          .sort((a, b) => b.goals - a.goals)
          .slice(0, 5)
          .map((item, index) => ({ ...item, rank: index + 1 })),
      };
    }
    case 'get_latest_matches': {
      const fixtures = await fetchFootball(footballApiKey, 'fixtures', { league: LEAGUE_ID, season: year, last: 3 });
      return {
        kind: 'matches',
        title: 'Senaste matcher',
        rows: fixtures.map(item => ({
          home: item.teams?.home?.name || '—',
          away: item.teams?.away?.name || '—',
          score: `${item.goals?.home ?? '–'}-${item.goals?.away ?? '–'}`,
          status: item.fixture?.status?.short || 'NS',
        })),
      };
    }
    case 'get_team_latest_matches': {
      const fixtures = await fetchFootball(footballApiKey, 'fixtures', { team: team.id, season: year, last: 3 });
      return {
        kind: 'matches',
        title: `${team.name} senaste matcher`,
        team: team.name,
        rows: fixtures.map(item => ({
          home: item.teams?.home?.name || '—',
          away: item.teams?.away?.name || '—',
          score: `${item.goals?.home ?? '–'}-${item.goals?.away ?? '–'}`,
          status: item.fixture?.status?.short || 'NS',
        })),
      };
    }
    default:
      return null;
  }
}

async function formatAnswer({ apiKey, question, action, data, advanced = false }) {
  const formatterPrompt = [
    `Fråga: ${question}`,
    `Action: ${action}`,
    `Data: ${JSON.stringify(data)}`,
    'Svara kort på svenska och använd bara datan.',
  ].join('\n');

  const { response, data: anthropicData } = await callAnthropic({
    apiKey,
    model: advanced ? SONNET_MODEL : HAIKU_MODEL,
    system: advanced ? SYSTEM_SONNET : SYSTEM_HAIKU,
    messages: [{ role: 'user', content: formatterPrompt }],
    maxTokens: advanced ? 250 : 120,
  });

  if (!response.ok) {
    throw new Error(anthropicData?.error?.message || `Anthropic ${response.status}`);
  }

  return anthropicData;
}

function safeFallback(question, reason) {
  return anthropicTextResponse(
    'Testa att fråga om tabellen, mål, poäng eller senaste matcher för ett lag.',
    { reason, question }
  );
}

function needsAdvancedFormatting(question = '') {
  const normalized = normalizeText(question);
  return ['jämför', 'jamfor', 'analysera', 'förklara', 'forklara'].some(token => normalized.includes(token));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const footballApiKey = process.env.APIFOOTBALL_KEY;
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

    if (!footballApiKey) {
      return json(res, 500, { error: { message: 'Fotbollsdata saknas på servern.' } });
    }

    const standings = await getStandings(footballApiKey);
    const interpretation = await interpretQuestion({
      apiKey: anthropicApiKey,
      question,
      standings,
    });

    console.log('[chat:interpret]', {
      question,
      interpretation,
    });

    if (!interpretation || !interpretation.action || interpretation.confidence === 'low') {
      return json(res, 200, safeFallback(question, 'uncertain_interpretation'));
    }

    const actionData = await runAction({
      action: interpretation.action,
      team: interpretation.team,
      year: interpretation.year,
      scope: interpretation.scope,
      footballApiKey,
      standings,
    });

    if (!actionData) {
      return json(res, 200, safeFallback(question, 'unsupported_action'));
    }

    if (actionData.kind === 'unsupported_scope') {
      return json(res, 200, anthropicTextResponse(actionData.note, { reason: 'unsupported_scope' }));
    }

    const formatted = await formatAnswer({
      apiKey: anthropicApiKey,
      question,
      action: interpretation.action,
      data: actionData,
      advanced: needsAdvancedFormatting(question),
    });

    formatted.meta = {
      ...(formatted.meta || {}),
      interpretation,
      action: interpretation.action,
    };

    return json(res, 200, formatted);
  } catch (err) {
    console.error('[chat:error]', err);
    return json(res, 500, { error: { message: err.message } });
  }
}
