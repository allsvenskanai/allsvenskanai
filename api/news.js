export default async function handler(req, res) {
  const team = String(req.query.team || 'start').trim().toLowerCase();

  // =========================
  // ENDA STÄLLET DU BEHÖVER ÄNDRA
  // =========================
  const FEEDS_BY_TEAM = {
    start: [
      {
        name: 'Fotbollskanalen',
        url: 'https://www.fotbollskanalen.se/rss/allsvenskan/'
      }
    ],

    malmo: [
      {
        name: 'Google News',
        url: 'https://news.google.com/rss/search?q=Malm%C3%B6%20FF&hl=sv&gl=SE&ceid=SE:sv'
      }
    ],

    aik: [
      {
        name: 'Google News',
        url: 'https://news.google.com/rss/search?q=AIK&hl=sv&gl=SE&ceid=SE:sv'
      }
    ],

    hammarby: [
      {
        name: 'Google News',
        url: 'https://news.google.com/rss/search?q=Hammarby&hl=sv&gl=SE&ceid=SE:sv'
      }
    ]
  };

  // Om team inte finns här blir det tom lista
  const feeds = FEEDS_BY_TEAM[team] || [];

  function decodeHtml(str = '') {
    return str
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function stripHtml(str = '') {
    return decodeHtml(str)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseRss(xml, sourceName) {
    const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

    return items.slice(0, 20).map(item => {
      const title = stripHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
      const link = stripHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
      const description = stripHtml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
      const pubDateRaw = stripHtml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

      if (!title || !link) return null;

      let date = '';
      const d = new Date(pubDateRaw);
      if (!isNaN(d.getTime())) {
        date = d.toISOString().slice(0, 10);
      }

      return {
        title,
        url: link,
        summary: description.slice(0, 180),
        source: sourceName,
        date
      };
    }).filter(Boolean);
  }

  function uniqueArticles(list = []) {
    const seen = new Set();
    return list.filter(article => {
      const key = `${article.title}|${article.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (!feeds.length) {
    return res.status(200).json({ news: [] });
  }

  try {
    const fetched = await Promise.all(
      feeds.map(async feed => {
        try {
          const resp = await fetch(feed.url, {
            headers: { 'user-agent': 'Mozilla/5.0 AllsvenskanAI' }
          });

          if (!resp.ok) return [];
          const xml = await resp.text();
          return parseRss(xml, feed.name);
        } catch {
          return [];
        }
      })
    );

    const news = uniqueArticles(fetched.flat()).sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');

    return res.status(200).json({
      news: news.slice(0, 8)
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Kunde inte hämta nyheter',
      details: err.message
    });
  }
}
