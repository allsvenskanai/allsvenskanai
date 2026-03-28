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
    const response = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
    const data = await response.json();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
