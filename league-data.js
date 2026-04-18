(function () {
  const LEAGUES = {
    allsvenskan: {
      key: "allsvenskan",
      label: "Allsvenskan",
      season: 26806
    },
    damallsvenskan: {
      key: "damallsvenskan",
      label: "Damallsvenskan",
      season: 26782
    }
  };
  const SNAPSHOT_TTL = 10 * 60 * 1000;
  const TEAM_FACT_TTL = 24 * 60 * 60 * 1000;
  const snapshotCache = new Map();
  const teamFactCache = new Map();
  const inFlightSnapshots = new Map();
  const inFlightTeamFacts = new Map();

  function debug(...args) {
    if (location.hostname === "localhost" || location.search.includes("debug=1")) {
      console.debug("[LeagueData]", ...args);
    }
  }

  function cacheKey(leagueKey, season) {
    return `aai:league-snapshot:${leagueKey}:${season}`;
  }

  function teamFactKey(teamId) {
    return `aai:team-facts:${teamId}`;
  }

  function safeReadStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("Kunde inte läsa cache", key, error);
      return null;
    }
  }

  function safeWriteStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Kunde inte spara cache", key, error);
    }
  }

  function isFresh(entry, ttl) {
    return Boolean(entry?.fetchedAt && Date.now() - entry.fetchedAt < ttl);
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || data?.details || `Kunde inte hämta ${url}`);
    }

    return data;
  }

  function getDetail(item, keys) {
    const wanted = Array.isArray(keys) ? keys : [keys];
    const details = Array.isArray(item?.details) ? item.details : [];
    const found = details.find((detail) => {
      const code = detail?.type?.developer_name || detail?.type?.code || detail?.type?.name;
      return wanted.includes(code);
    });
    const raw = found?.value?.total ?? found?.value ?? 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeStandings(payload) {
    return (Array.isArray(payload?.data) ? payload.data : [])
      .map((item) => {
        const participant = item?.participant || item?.team || item?.participants?.[0] || null;
        const teamId = participant?.id ?? item?.participant_id ?? item?.team_id ?? null;
        const goalsFor = getDetail(item, ["OVERALL_SCORED", "GOALS_FOR"]);
        const goalsAgainst = getDetail(item, ["OVERALL_CONCEDED", "GOALS_AGAINST"]);

        return {
          position: Number(item?.position ?? item?.rank ?? 999),
          teamId,
          teamName: formatTeamName(participant?.name, teamId),
          logo: formatTeamLogo(participant?.image_path || participant?.logo_path || participant?.logo, teamId),
          played: getDetail(item, ["OVERALL_MATCHES", "MATCHES_PLAYED"]),
          won: getDetail(item, ["OVERALL_WINS", "WINS"]),
          draw: getDetail(item, ["OVERALL_DRAWS", "DRAWS"]),
          lost: getDetail(item, ["OVERALL_LOST", "OVERALL_LOSSES", "LOSSES"]),
          goalsFor,
          goalsAgainst,
          goalDiff: getDetail(item, ["OVERALL_GOAL_DIFFERENCE", "GOAL_DIFFERENCE"]) || goalsFor - goalsAgainst,
          points: Number(item?.points ?? getDetail(item, ["TOTAL_POINTS", "POINTS"]))
        };
      })
      .filter((row) => row.teamId)
      .sort((a, b) => a.position - b.position);
  }

  function getParticipantByLocation(participants, location) {
    return (
      participants.find((team) => team?.meta?.location === location) ||
      participants.find((team) => team?.location === location) ||
      participants.find((team) => team?.pivot?.location === location) ||
      null
    );
  }

  function getScoreValue(scores, participantId) {
    const rows = scores.filter((score) => Number(score?.participant_id) === Number(participantId));
    const row =
      rows.find((score) => String(score?.description || "").toUpperCase() === "CURRENT") ||
      rows.find((score) => String(score?.description || "").toUpperCase().includes("FULLTIME")) ||
      rows[0];

    if (!row) return null;

    const raw = row?.score?.goals ?? row?.score?.goal ?? row?.score?.value ?? row?.score ?? null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseKickoffMs(match) {
    const timestamp = match?.starting_at_timestamp ?? match?.time?.starting_at?.timestamp ?? null;
    if (timestamp !== null && timestamp !== undefined && timestamp !== "") {
      const parsed = Number(timestamp);
      if (Number.isFinite(parsed)) return parsed > 100000000000 ? parsed : parsed * 1000;
    }

    const raw = match?.starting_at || match?.time?.starting_at?.date_time || match?.time?.starting_at?.date || "";
    if (!raw) return null;

    const dateString = String(raw).trim();
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateString)
      ? `${dateString.replace(" ", "T")}Z`
      : dateString;
    const parsedDate = new Date(normalized);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
  }

  function isLiveFixture(match) {
    const state = String(match?.state?.name || match?.state?.short_name || match?.status || "").toLowerCase();
    return state.includes("live") || state.includes("1st") || state.includes("2nd") || state.includes("halvlek");
  }

  function isFinishedFixture(match, hasScore) {
    const state = String(match?.state?.name || match?.state?.short_name || match?.status || "").toLowerCase();
    return Boolean(match?.finished || match?.result_info || state.includes("finished") || state.includes("full") || state === "ft" || hasScore);
  }

  function normalizeFixture(match) {
    const participants = Array.isArray(match?.participants) ? match.participants : [];
    const scores = Array.isArray(match?.scores) ? match.scores : [];
    const home = getParticipantByLocation(participants, "home") || participants[0] || null;
    const away = getParticipantByLocation(participants, "away") || participants[1] || null;
    const homeScore = home ? getScoreValue(scores, home.id) : null;
    const awayScore = away ? getScoreValue(scores, away.id) : null;
    const hasScore = homeScore !== null && awayScore !== null;
    const kickoffMs = parseKickoffMs(match);
    const isLive = isLiveFixture(match);
    const isFinished = !isLive && isFinishedFixture(match, hasScore);
    const winnerTeamId =
      hasScore && isFinished
        ? homeScore > awayScore
          ? home?.id
          : awayScore > homeScore
            ? away?.id
            : null
        : null;

    return {
      id: match?.id,
      kickoffMs,
      startingAt: kickoffMs !== null ? new Date(kickoffMs).toISOString() : (match?.starting_at || ""),
      status: match?.state?.name || match?.status || "",
      homeTeamId: home?.id || null,
      awayTeamId: away?.id || null,
      homeTeam: home
        ? {
            id: home.id,
            name: formatTeamName(home.name, home.id),
            logo: formatTeamLogo(home.image_path || home.logo_path || home.logo, home.id)
          }
        : null,
      awayTeam: away
        ? {
            id: away.id,
            name: formatTeamName(away.name, away.id),
            logo: formatTeamLogo(away.image_path || away.logo_path || away.logo, away.id)
          }
        : null,
      homeScore,
      awayScore,
      hasScore,
      isLive,
      isFinished,
      winnerTeamId
    };
  }

  function sortByKickoffAsc(a, b) {
    return (a.kickoffMs ?? Number.MAX_SAFE_INTEGER) - (b.kickoffMs ?? Number.MAX_SAFE_INTEGER);
  }

  function sortByKickoffDesc(a, b) {
    return (b.kickoffMs ?? 0) - (a.kickoffMs ?? 0);
  }

  function addFixture(target, teamId, fixture) {
    if (!teamId) return;
    const key = String(teamId);
    if (!target[key]) target[key] = [];
    target[key].push(fixture);
  }

  function buildDerived(standings, fixtures) {
    const standingsByTeamId = {};
    const fixturesByTeamId = {};
    const teamsById = {};

    standings.forEach((row) => {
      standingsByTeamId[String(row.teamId)] = row;
      teamsById[String(row.teamId)] = {
        id: row.teamId,
        name: row.teamName,
        logo: row.logo
      };
    });

    fixtures.forEach((fixture) => {
      addFixture(fixturesByTeamId, fixture.homeTeamId, fixture);
      addFixture(fixturesByTeamId, fixture.awayTeamId, fixture);
      if (fixture.homeTeam) teamsById[String(fixture.homeTeam.id)] = fixture.homeTeam;
      if (fixture.awayTeam) teamsById[String(fixture.awayTeam.id)] = fixture.awayTeam;
    });

    const recentMatchesByTeamId = {};
    const upcomingMatchesByTeamId = {};

    Object.keys(fixturesByTeamId).forEach((teamId) => {
      const teamFixtures = fixturesByTeamId[teamId];
      recentMatchesByTeamId[teamId] = teamFixtures.filter((match) => match.isFinished).sort(sortByKickoffDesc);
      upcomingMatchesByTeamId[teamId] = teamFixtures
        .filter((match) => !match.isLive && !match.isFinished && (match.kickoffMs === null || match.kickoffMs >= Date.now()))
        .sort(sortByKickoffAsc);
    });

    return {
      standingsByTeamId,
      fixturesByTeamId,
      recentMatchesByTeamId,
      upcomingMatchesByTeamId,
      teams: Object.values(teamsById)
    };
  }

  async function fetchLeagueSnapshot(leagueKey, season) {
    const [standingsPayload, fixturesPayload] = await Promise.all([
      fetchJson(`/api/standings?league=${encodeURIComponent(leagueKey)}`),
      fetchJson(`/api/fixtures?league=${encodeURIComponent(leagueKey)}`)
    ]);
    const standings = normalizeStandings(standingsPayload);
    const fixtures = (Array.isArray(fixturesPayload?.data) ? fixturesPayload.data : []).map(normalizeFixture).sort(sortByKickoffAsc);

    const derived = buildDerived(standings, fixtures);

    return {
      leagueId: leagueKey,
      leagueKey,
      season,
      fetchedAt: Date.now(),
      standings,
      fixtures,
      teams: derived.teams,
      derived
    };
  }

  function storeSnapshot(snapshot) {
    snapshotCache.set(cacheKey(snapshot.leagueKey, snapshot.season), snapshot);
    safeWriteStorage(cacheKey(snapshot.leagueKey, snapshot.season), snapshot);
    return snapshot;
  }

  function refreshSnapshot(leagueKey, season) {
    const key = cacheKey(leagueKey, season);
    if (inFlightSnapshots.has(key)) return inFlightSnapshots.get(key);

    debug("refresh snapshot", key);
    const request = fetchLeagueSnapshot(leagueKey, season)
      .then(storeSnapshot)
      .finally(() => inFlightSnapshots.delete(key));
    inFlightSnapshots.set(key, request);
    return request;
  }

  async function loadLeagueSnapshot(leagueKey = "allsvenskan", season) {
    const config = LEAGUES[leagueKey] || LEAGUES.allsvenskan;
    const resolvedSeason = season || config.season;
    const key = cacheKey(config.key, resolvedSeason);
    const memoryEntry = snapshotCache.get(key);
    const storageEntry = memoryEntry || safeReadStorage(key);

    if (storageEntry?.standings && storageEntry?.fixtures) {
      if (!storageEntry.derived) {
        storageEntry.derived = buildDerived(storageEntry.standings, storageEntry.fixtures);
      }
      snapshotCache.set(key, storageEntry);
      if (isFresh(storageEntry, SNAPSHOT_TTL)) {
        debug("use fresh snapshot", key);
        return storageEntry;
      }

      debug("use stale snapshot and refresh in background", key);
      refreshSnapshot(config.key, resolvedSeason).catch((error) => console.warn("Snapshot refresh failed", error));
      return storageEntry;
    }

    return refreshSnapshot(config.key, resolvedSeason);
  }

  async function loadTeamFacts(teamId) {
    const key = teamFactKey(teamId);
    const memoryEntry = teamFactCache.get(key);
    const storageEntry = memoryEntry || safeReadStorage(key);

    if (storageEntry?.team) {
      teamFactCache.set(key, storageEntry);
      if (isFresh(storageEntry, TEAM_FACT_TTL)) {
        debug("use fresh team facts", key);
        return storageEntry.team;
      }
    }

    if (inFlightTeamFacts.has(key)) return inFlightTeamFacts.get(key);

    const request = fetchJson(`/api/team?id=${encodeURIComponent(teamId)}`)
      .then((payload) => {
        const entry = { fetchedAt: Date.now(), team: payload.team };
        teamFactCache.set(key, entry);
        safeWriteStorage(key, entry);
        return payload.team;
      })
      .catch((error) => {
        if (storageEntry?.team) {
          console.warn("Team facts refresh failed, using stale cache", error);
          return storageEntry.team;
        }
        throw error;
      })
      .finally(() => inFlightTeamFacts.delete(key));

    inFlightTeamFacts.set(key, request);
    return request;
  }

  function getTeamStanding(teamId, snapshot) {
    return snapshot?.derived?.standingsByTeamId?.[String(teamId)] || null;
  }

  function getTeamFixtures(teamId, snapshot) {
    return snapshot?.derived?.fixturesByTeamId?.[String(teamId)] || [];
  }

  function getTeamRecentMatches(teamId, snapshot, limit = 5) {
    return (snapshot?.derived?.recentMatchesByTeamId?.[String(teamId)] || []).slice(0, limit);
  }

  function getTeamUpcomingMatches(teamId, snapshot, limit = 5) {
    return (snapshot?.derived?.upcomingMatchesByTeamId?.[String(teamId)] || []).slice(0, limit);
  }

  function getTeamResult(teamId, match) {
    if (!match?.isFinished || !match.hasScore) return "";
    if (match.winnerTeamId === null) return "D";
    return Number(match.winnerTeamId) === Number(teamId) ? "W" : "L";
  }

  function getTeamForm(teamId, snapshot, limit = 5) {
    return getTeamRecentMatches(teamId, snapshot, limit)
      .slice()
      .reverse()
      .map((match) => getTeamResult(teamId, match))
      .filter(Boolean);
  }

  function getTeamPosition(teamId, snapshot) {
    return getTeamStanding(teamId, snapshot)?.position ?? null;
  }

  function getTeamPoints(teamId, snapshot) {
    return getTeamStanding(teamId, snapshot)?.points ?? null;
  }

  function getTeamGoalDifference(teamId, snapshot) {
    return getTeamStanding(teamId, snapshot)?.goalDiff ?? null;
  }

  function findLeagueForTeam(teamId, snapshots) {
    return snapshots.find((snapshot) => getTeamStanding(teamId, snapshot) || getTeamFixtures(teamId, snapshot).length) || snapshots[0] || null;
  }

  window.LeagueData = {
    LEAGUES,
    loadLeagueSnapshot,
    loadTeamFacts,
    getTeamStanding,
    getTeamFixtures,
    getTeamRecentMatches,
    getTeamUpcomingMatches,
    getTeamForm,
    getTeamPosition,
    getTeamPoints,
    getTeamGoalDifference,
    getTeamResult,
    findLeagueForTeam,
    sortByKickoffAsc,
    sortByKickoffDesc
  };
})();
