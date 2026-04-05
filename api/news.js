export default async function handler(req, res) {
  const q = String(req.query.q || 'allsvenskan').trim();

  const cleanQuery = q
    .replace(/\bIK\b/gi, '')
    .replace(/\bIF\b/gi, '')
    .replace(/\bFK\b/gi, '')
    .replace(/\bFF\b/gi, '')
    .replace(/\bAIF\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const queryTerms = [cleanQuery, q, 'allsvenskan']
    .filter(Boolean)
    .map(s => s.toLowerCase());

  const feeds = [
    { name: 'SVT Sport', url: 'https://www.svt.se/sport/rss.xml' },
    { name: 'Fotbollskanalen', url: 'https://www.fotbollskanalen.se/rss/allsvenskan/' },
    { name: 'Aftonbladet Sport', url: 'https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/' }
  ];

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

  function parseItems(xml, sourceName) {
    const items = [];
    const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

    for (const item of matches.slice(0, 12)) {
      const title = stripHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
      const link = stripHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
      const description = stripHtml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
      const pubDateRaw = stripHtml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

      if (!title || !link) continue;

      let date = '';
      const d = new Date(pubDateRaw);
      if (!isNaN(d.getTime())) {
        date = d.toISOString().slice(0, 10);
      }

      items.push({
        title,
        url: link,
        summary: description.slice(0, 180) || 'Läs mer hos källan.',
        source: sourceName,
        date
      });
    }

    return items;
  }

  try {
    const fetched = await Promise.all(
      feeds.map(async feed => {
        try {
          const resp = await fetch(feed.url, {
            headers: {
              'user-agent': 'Mozilla/5.0 AllsvenskanAI News Fetcher'
            }
          });

          if (!resp.ok) return [];
          const xml = await resp.text();
          return parseItems(xml, feed.name);
        } catch {
          return [];
        }
      })
    );

    const allArticles = fetched.flat();

    const unique = [];
    const seen = new Set();

    for (const article of allArticles) {
      const key = `${article.title}|${article.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(article);
    }

    let filtered = unique.filter(article => {
      const hay = `${article.title} ${article.summary}`.toLowerCase();
      return queryTerms.some(term => term && hay.includes(term));
    });

    if (!filtered.length) {
      filtered = unique.filter(article => {
        const hay = `${article.title} ${article.summary}`.toLowerCase();
        return hay.includes('allsvenskan') || hay.includes('svensk fotboll');
      });
    }

    if (!filtered.length) {
      filtered = unique;
    }

    filtered.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json({
      news: filtered.slice(0, 6)
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Kunde inte hämta nyheter',
      details: err.message
    });
  }
}
