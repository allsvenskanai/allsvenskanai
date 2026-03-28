import { initializeApp, getApps } from 'firebase-admin/app';
import { credential } from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    credential: credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestore();

  if (req.method === 'POST') {
    const { token, teams } = req.body;
    if (!token) return res.status(400).json({ error: 'Token krävs' });

    await db.collection('subscribers').doc(token).set({
      token,
      teams: teams || [],
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token krävs' });
    await db.collection('subscribers').doc(token).delete();
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
