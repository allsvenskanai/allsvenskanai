export default async function handler(req, res) {
  const q = String(req.query.q || 'allsvenskan').trim().toLowerCase();

  // =========================
  // HÄR LÄGGER DU IN DINA KÄLLOR
  // =========================

  // Startsidan
  const START_FEEDS = [
    { name: 'Fotbollskanalen', url: 'https://www.fotbollskanalen.se/rss/allsvenskan/' }
  ];

  // Lagsidor
  const TEAM_FEEDS = {
    malmö: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=Malm%C3%B6%20ff&hl=sv&gl=SE&ceid=SE%3Asv' }
    ],

    aik: [
      { name: 'Fotbollskanalen', url: 'https://www.fotbollskanalen.se/rss/allsvenskan/' }
    ],

    hammarby: [
      { name: 'Fotbollskanalen', url: 'https://www.fotbollskanalen.se/rss/allsvenskan/' }
    ]
  };

  // Om laget inte finns här -> tom lista
  const DEFAULT_TEAM_FEEDS = [];

  // =========================
  // HJÄLPFUNKTIONER
  // =========================

  function cleanTeam(str = '') {
    return str
      .replace(/\bik\b/gi, '')
      .replace(/\bif\b/gi, '')
      .replace(/\bfk\b/gi, '')
      .replace(/\bff\b/gi, '')
      .replace(/\baif\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getTeamKey(str) {
    return cleanTeam(str).split(' ')[0].toLowerCase();
  }

  function decodeHtml(str = '') {
    return str
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function strip(str=''){
    return decodeHtml(str)
      .replace(/<[^>]*>/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function parse(xml, source){
    const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

    return items.slice(0, 20).map(item => {
      const title = strip(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
      const link = strip(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
      const desc = strip(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
      const pubDateRaw = strip(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

      if (!title || !link) return null;

      let date = '';
      const d = new Date(pubDateRaw);
      if (!isNaN(d.getTime())) {
        date = d.toISOString().slice(0, 10);
      }

      return {
        title,
        url: link,
        summary: desc.slice(0, 180),
        source,
        date
      };
    }).filter(Boolean);
  }

  function unique(list){
    const seen = new Set();
    return list.filter(a => {
      const key = `${a.title}|${a.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function filterArticlesForTeam(list, teamQuery) {
    const clean = cleanTeam(teamQuery).toLowerCase();
    const firstWord = clean.split(' ')[0];

    if (!clean) return list;

    return list.filter(article => {
      const hay = `${article.title} ${article.summary}`.toLowerCase();
      return hay.includes(clean) || (firstWord && hay.includes(firstWord));
    });
  }

  // =========================
  // VÄLJ FEEDS
  // =========================

  let feeds = [];

  if (q === 'allsvenskan') {
    feeds = START_FEEDS;
  } else {
    const key = getTeamKey(q);
    feeds = TEAM_FEEDS[key] || DEFAULT_TEAM_FEEDS;
  }

  // Om du inte lagt in några feeds -> tom lista
  if (!feeds.length) {
    return res.status(200).json({ news: [] });
  }

  // =========================
  // HÄMTA OCH RETURNERA
  // =========================

  try {
    const fetched = await Promise.all(
      feeds.map(async f => {
        try {
          const r = await fetch(f.url, {
            headers: { 'user-agent': 'Mozilla/5.0 AllsvenskanAI' }
          });

          if (!r.ok) return [];
          const xml = await r.text();
          return parse(xml, f.name);
        } catch {
          return [];
        }
      })
    );

    let news = unique(fetched.flat());

  // Visa exakt det som finns i feeden, utan extra filtrering
// if (q !== 'allsvenskan') {
//   news = filterArticlesForTeam(news, q);
// }
    
    news.sort((a,b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({
      news: news.slice(0, 6)
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Kunde inte hämta nyheter',
      details: err.message
    });
  }
}
