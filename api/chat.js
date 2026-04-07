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
  'häcken': 'BK Häcken',
  'hacken': 'BK Häcken',
  'bk häcken': 'BK Häcken',
  'sirius': 'IK Sirius FK',
  'ik sirius fk': 'IK Sirius FK',
  'ifk göteborg': 'IFK Göteborg',
  'ifk goteborg': 'IFK Göteborg',
  'gais': 'GAIS',
  'halmstad': 'Halmstads BK',
  'halmstads bk': 'Halmstads BK',
  'elfsborg': 'IF Elfsborg',
  'if elfsborg': 'IF Elfsborg',
  'brommapojkarna': 'IF Brommapojkarna',
  'if brommapojkarna': 'IF Brommapojkarna',
  'kalmar': 'Kalmar FF',
  'kalmar ff': 'Kalmar FF',
  'degerfors': 'Degerfors IF',
  'degerfors if': 'Degerfors IF',
  'mjällby': 'Mjällby AIF',
  'mjallby': 'Mjällby AIF',
  'mjällby aif': 'Mjällby AIF',
  'västerås': 'Västerås SK FK',
  'vasteras': 'Västerås SK FK',
  'västerås sk fk': 'Västerås SK FK',
  'örgryte': 'Örgryte IS',
  'orgryte': 'Örgryte IS',
  'örgryte is': 'Örgryte IS',
};

function json(res, status, body) {
  return res.status(status).json(body);
}

function anthropicTextResponse(text) {
  return {
    id: 'local-answer',
    type: 'message',
    role: 'assistant',
    model: 'local-routing',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function getQuestion(messages = []) {
  const userMessage = [...messages].reverse().find(m => m?.role === 'user');
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
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTeam(question, standings = []) {
  const normalizedQuestion = normalizeText(question);
  const teams = standings.map(row => row.team).filter(Boolean);

  for (const team of teams) {
    const teamName = normalizeText(team.name || '');
    if (teamName && normalizedQuestion.includes(teamName)) return team;
  }

  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (normalizedQuestion.includes(alias)) {
      return teams.find(team => team.name === canonical) || null;
    }
  }

  return null;
}

function isAdvancedQuestion(question = '') {
  const q = normalizeText(question);
  return [
    'analysera',
    'jämför',
    'jamfor',
    'varför',
    'varfor',
    'förklara',
    'forklara',
    'prognos',
    'trend',
    'sammanfatta',
    'marknadsvärde',
    'marknadsvarde',
    'transfermarkt',
    'sök på',
    'sok pa',
  ].some(token => q.includes(token));
}

function needsWebSearch(question = '') {
  const q = normalizeText(question);
  return ['transfermarkt', 'sök på', 'sok pa', 'webben', 'senaste nytt', 'aktuellt'].some(token => q.includes(token));
}

async function fetchFootball(apiKey, endpoint, params = {}) {
  const search = new URLSearchParams(params);
  const url = `https://v3.football.api-sports.io/${endpoint}?${search.toString()}`;
  const response = await fetch(url, {
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

async function getStandings(apiKey) {
  let standings = await fetchFootball(apiKey, 'standings', { league: LEAGUE_ID, season: DEFAULT_SEASON });
  let table = standings[0]?.league?.standings?.[0] || [];
  if (!table.length) {
    standings = await fetchFootball(apiKey, 'standings', { league: LEAGUE_ID, season: DEFAULT_SEASON - 1 });
    table = standings[0]?.league?.standings?.[0] || [];
  }
  return table;
}

function formatMatchRow(fixture) {
  const home = fixture?.teams?.home?.name || '—';
  const away = fixture?.teams?.away?.name || '—';
  const homeGoals = fixture?.goals?.home ?? '–';
  const awayGoals = fixture?.goals?.away ?? '–';
  return `- ${home} ${homeGoals}-${awayGoals} ${away}`;
}

async function tryLocalAnswer(question, apiKey) {
  const q = normalizeText(question);
  const standings = await getStandings(apiKey);
  const matchedTeam = extractTeam(question, standings);

  if (q.includes('flest mal') || q.includes('skytteliga') || q === 'mal?' || q === 'flest mal?') {
    const scorers = await fetchFootball(apiKey, 'players/topscorers', { league: LEAGUE_ID, season: DEFAULT_SEASON }).catch(() => []);
    const top = scorers.slice(0, 5);
    if (top.length) {
      return [
        'Skytteligan just nu:',
        ...top.map((item, index) => `${index + 1}. ${item.player?.name || '—'} (${item.statistics?.[0]?.team?.name || '—'}) – ${item.statistics?.[0]?.goals?.total || 0} mål`),
      ].join('\n');
    }
  }

  if (q.includes('leder tabellen') || q.includes('flest poang') || q === 'tabellen' || q === 'tabellen?' || q.includes('tabell')) {
    if (standings.length) {
      if (q.includes('leder') || q.includes('flest poang')) {
        const leader = standings[0];
        return `${leader.team?.name || 'Okänt lag'} leder tabellen på ${leader.points || 0} poäng med ${leader.goalsDiff >= 0 ? '+' : ''}${leader.goalsDiff || 0} i målskillnad.`;
      }
      return [
        'Toppen i tabellen:',
        ...standings.slice(0, 5).map(row => `${row.rank}. ${row.team?.name || '—'} – ${row.points || 0}p (${row.goalsDiff >= 0 ? '+' : ''}${row.goalsDiff || 0})`),
      ].join('\n');
    }
  }

  if (matchedTeam && (q.includes('matcher') || q.includes('senaste') || q.endsWith('?') || q === normalizeText(matchedTeam.name))) {
    const fixtures = await fetchFootball(apiKey, 'fixtures', { team: matchedTeam.id, season: DEFAULT_SEASON, last: 3 }).catch(() => []);
    if (fixtures.length) {
      return [
        `${matchedTeam.name} senaste matcher:`,
        ...fixtures.map(formatMatchRow),
      ].join('\n');
    }
  }

  if (matchedTeam && (q.includes('malskillnad') || q.includes('form') || q.includes('poang') || q.includes('tabell'))) {
    const row = standings.find(entry => entry.team?.id === matchedTeam.id);
    if (row) {
      return [
        `${matchedTeam.name}:`,
        `- Placering: ${row.rank}`,
        `- Poäng: ${row.points || 0}`,
        `- Målskillnad: ${row.goalsDiff >= 0 ? '+' : ''}${row.goalsDiff || 0}`,
        `- Form: ${row.form || 'Ingen formdata'}`,
      ].join('\n');
    }
  }

  return null;
}

async function callAnthropic({ apiKey, model, system, messages, maxTokens, useWebSearch }) {
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
  };

  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      ...(useWebSearch ? { 'anthropic-beta': 'web-search-2025-03-05' } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { response, data };
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

  try {
    if (footballApiKey && question) {
      const localAnswer = await tryLocalAnswer(question, footballApiKey);
      if (localAnswer) {
        return json(res, 200, anthropicTextResponse(localAnswer));
      }
    }

    if (!anthropicApiKey) {
      return json(res, 500, { error: { message: 'API-nyckel saknas på servern.' } });
    }

    const advanced = isAdvancedQuestion(question);
    const useWebSearch = needsWebSearch(question);
    const model = advanced ? SONNET_MODEL : HAIKU_MODEL;
    const system = advanced ? SYSTEM_SONNET : SYSTEM_HAIKU;
    const maxTokens = advanced ? 250 : 120;
    const compactMessages = question
      ? [{ role: 'user', content: question }]
      : messages.map(message => ({
          role: message.role,
          content: typeof message.content === 'string' ? message.content : '',
        }));

    const { response, data } = await callAnthropic({
      apiKey: anthropicApiKey,
      model,
      system,
      messages: compactMessages,
      maxTokens,
      useWebSearch,
    });

    return json(res, response.status, data);
  } catch (err) {
    return json(res, 500, { error: { message: err.message } });
  }
}
