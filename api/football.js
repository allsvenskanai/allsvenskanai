export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.APIFOOTBALL_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'APIFOOTBALL_KEY saknas' });
  }
  if (!apiKey) return res.status(500).json({ error: 'APIFOOTBALL_KEY saknas' });

  const params = new URLSearchParams(req.query);
  const endpoint = req.query._endpoint;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint saknas' });
  }
  if (!endpoint) return res.status(400).json({ error: 'Endpoint saknas' });
  params.delete('_endpoint');

  const url = `https://v3.football.api-sports.io/${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-apisports-key': apiKey,
        Accept: 'application/json; charset=utf-8',
      },
      headers: { 'x-apisports-key': apiKey }
    });

    // Force read as UTF-8 bytes then decode correctly
    const bytes = await response.arrayBuffer();
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).send(decoded);
    return res.status(200).send(decoded);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
