export default async function handler(req, res) {
  try {
    const query = req.query.q || 'allsvenskan';

    // RSS-källor (enkla och stabila)
    const sources = [
      `https://www.svt.se/sport/rss.xml`,
      `https://www.fotbollskanalen.se/rss/allsvenskan/`,
      `https://allsvenskan.se/rss`
    ];

    const articles = [];

    for (const url of sources) {
      try {
        const r = await fetch(url);
        const text = await r.text();

        const items = text.split('<item>').slice(1, 6);

        items.forEach(item => {
          const title = item.match(/<title>(.*?)<\/title>/)?.[1] || '';
          const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
          const desc = item.match(/<description>(.*?)<\/description>/)?.[1] || '';

          if (title.toLowerCase().includes(query.toLowerCase())) {
            articles.push({
              title,
              link,
              summary: desc.replace(/<[^>]+>/g, '').slice(0, 120)
            });
          }
        });

      } catch (e) {
        console.log('RSS fel:', url);
      }
    }

    // fallback om inget hittas
    if (!articles.length) {
      return res.status(200).json({
        articles: [
          {
            title: 'Se senaste nytt på SVT Sport',
            link: 'https://www.svt.se/sport',
            summary: 'Sportnyheter och uppdateringar'
          },
          {
            title: 'Fotbollskanalen - Allsvenskan',
            link: 'https://www.fotbollskanalen.se/allsvenskan/',
            summary: 'Nyheter om Allsvenskan'
          }
        ]
      });
    }

    res.status(200).json({ articles });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
