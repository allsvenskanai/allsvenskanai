export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.APIFOOTBALL_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIFOOTBALL_KEY saknas' });

  const params = new URLSearchParams(req.query);
  const endpoint = req.query._endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint saknas' });
  params.delete('_endpoint');

  const url = `https://v3.football.api-sports.io/${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey }
    });
    // Parse JSON — Node fetch handles UTF-8 correctly via .json()
    const data = await response.json();
    // Re-stringify to ensure proper UTF-8 output
    const json = JSON.stringify(data);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(json);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
