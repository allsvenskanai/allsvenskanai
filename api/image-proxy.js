export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rawUrl = String(req.query.url || '').trim();
  if (!rawUrl) return res.status(400).json({ error: 'url saknas' });

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Ogiltig url' });
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(400).json({ error: 'Ogiltigt protokoll' });
  }

  try {
    const response = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'AllsvenskanAI image proxy'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Image fetch failed: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
