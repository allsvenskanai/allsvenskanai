export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.SPORTMONKS_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'SPORTMONKS_KEY saknas i Vercel environment variables.' });
  }

  const params = new URLSearchParams(req.query);
  const endpoint = req.query._endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint saknas' });
  params.delete('_endpoint');
  params.set('api_token', apiKey);

  const url = `https://api.sportmonks.com/v3/football/${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
