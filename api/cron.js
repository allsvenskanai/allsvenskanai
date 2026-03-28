import { initializeApp, getApps } from 'firebase-admin/app';
import { credential } from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

if (!getApps().length) {
  initializeApp({
    credential: credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const LEAGUE = 113;
const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY;

async function afFetch(endpoint, params = {}) {
  const q = new URLSearchParams(params);
  const r = await fetch(`https://v3.football.api-sports.io/${endpoint}?${q}`, {
    headers: { 'x-apisports-key': APIFOOTBALL_KEY }
  });
  const d = await r.json();
  return d.response || [];
}

async function sendNotification(tokens, title, body, url = '/') {
  if (!tokens.length) return;
  const messaging = getMessaging();
  
  const messages = tokens.map(token => ({
    token,
    notification: { title, body },
    webpush: {
      fcmOptions: { link: `https://allsvenskanai.se${url}` },
      notification: {
        title, body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
      }
    }
  }));

  // Send in batches of 500
  for (let i = 0; i < messages.length; i += 500) {
    const batch = messages.slice(i, i + 500);
    await messaging.sendEach(batch);
  }
}

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getFirestore();
  const sentRef = db.collection('sentNotifications');
  const subsSnap = await db.collection('subscribers').get();
  
  if (subsSnap.empty) return res.status(200).json({ ok: true, message: 'No subscribers' });

  // Build map: teamId → [tokens]
  const teamTokens = {};
  const allTokens = [];
  subsSnap.forEach(doc => {
    const { token, teams } = doc.data();
    allTokens.push(token);
    (teams || []).forEach(teamId => {
      if (!teamTokens[teamId]) teamTokens[teamId] = [];
      teamTokens[teamId].push(token);
    });
  });

  const notifications = [];

  // 1. Check live fixtures for goals
  try {
    const live = await afFetch('fixtures', { league: LEAGUE, live: 'all' });
    for (const fixture of live) {
      const homeTeam = fixture.teams?.home;
      const awayTeam = fixture.teams?.away;
      const homeGoals = fixture.goals?.home;
      const awayGoals = fixture.goals?.away;
      const minute = fixture.fixture?.status?.elapsed;
      const fixtureId = fixture.fixture?.id;

      // Get events for this fixture
      const events = await afFetch('fixtures/events', { fixture: fixtureId });
      const goals = events.filter(e => e.type === 'Goal');

      for (const goal of goals) {
        const key = `goal-${fixtureId}-${goal.time?.elapsed}-${goal.player?.id}`;
        const alreadySent = await sentRef.doc(key).get();
        if (alreadySent.exists) continue;

        const scoringTeamId = goal.team?.id;
        const tokens = teamTokens[scoringTeamId] || [];
        // Also notify fans of the other team
        const otherTeamId = scoringTeamId === homeTeam?.id ? awayTeam?.id : homeTeam?.id;
        const otherTokens = teamTokens[otherTeamId] || [];
        const allRelevant = [...new Set([...tokens, ...otherTokens])];

        if (allRelevant.length) {
          const scorer = goal.player?.name || 'Okänd spelare';
          const title = `⚽ MÅL! ${goal.team?.name}`;
          const body = `${scorer} (${goal.time?.elapsed}') · ${homeTeam?.name} ${homeGoals}–${awayGoals} ${awayTeam?.name}`;
          await sendNotification(allRelevant, title, body, '/resultat');
          await sentRef.doc(key).set({ sentAt: new Date().toISOString() });
          notifications.push({ type: 'goal', key });
        }
      }
    }
  } catch(e) {
    console.error('Live check error:', e);
  }

  // 2. Check for new transfers (run less frequently — only if minute is 0 or 30)
  const now = new Date();
  if (now.getMinutes() === 0 || now.getMinutes() === 30) {
    try {
      const today = now.toISOString().slice(0, 10);
      
      for (const [teamId, tokens] of Object.entries(teamTokens)) {
        const transfers = await afFetch('transfers', { team: teamId });
        for (const tr of transfers) {
          for (const x of (tr.transfers || [])) {
            if (!x.date || x.date !== today) continue;
            const key = `transfer-${tr.player?.id}-${x.date}-${x.teams?.in?.id}`;
            const alreadySent = await sentRef.doc(key).get();
            if (alreadySent.exists) continue;

            const playerName = tr.player?.name || 'Okänd spelare';
            const isIn = x.teams?.in?.id == teamId;
            const title = isIn ? `🔵 Ny spelare klar!` : `🔴 Spelare lämnar`;
            const body = isIn
              ? `${playerName} klar för ${x.teams?.in?.name}`
              : `${playerName} lämnar ${x.teams?.out?.name}`;
            
            await sendNotification(tokens, title, body, '/overgangar');
            await sentRef.doc(key).set({ sentAt: new Date().toISOString() });
            notifications.push({ type: 'transfer', key });
          }
        }
      }
    } catch(e) {
      console.error('Transfer check error:', e);
    }
  }

  // 3. Match start notifications (5 min before)
  try {
    const upcoming = await afFetch('fixtures', { league: LEAGUE, next: 10 });
    for (const fixture of upcoming) {
      const kickoff = new Date(fixture.fixture?.date);
      const diffMin = (kickoff - now) / 60000;
      if (diffMin > 5 || diffMin < 0) continue;

      const homeTeamId = fixture.teams?.home?.id;
      const awayTeamId = fixture.teams?.away?.id;
      const key = `kickoff-${fixture.fixture?.id}`;
      const alreadySent = await sentRef.doc(key).get();
      if (alreadySent.exists) continue;

      const tokens = [...new Set([
        ...(teamTokens[homeTeamId] || []),
        ...(teamTokens[awayTeamId] || [])
      ])];

      if (tokens.length) {
        const title = `🏟 Match börjar snart!`;
        const body = `${fixture.teams?.home?.name} vs ${fixture.teams?.away?.name} · om 5 minuter`;
        await sendNotification(tokens, title, body, '/resultat');
        await sentRef.doc(key).set({ sentAt: new Date().toISOString() });
        notifications.push({ type: 'kickoff', key });
      }
    }
  } catch(e) {
    console.error('Kickoff check error:', e);
  }

  return res.status(200).json({ ok: true, notifications: notifications.length, sent: notifications });
}
