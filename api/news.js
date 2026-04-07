
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const team = String(req.query.team || 'start').trim().toLowerCase();

  // =========================
  // ENDA STÃ„LLET DU BEHÃ–VER Ã„NDRA
  // =========================
  const FEEDS_BY_TEAM = {
    start: [
      {
        name: 'Google',
        url: 'https://news.google.com/rss/search?q=allsvenskan&hl=sv&gl=SE&ceid=SE%3Asv',
      },
    ],
    malmo: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=malmo%20ff&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    aik: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=aik&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    hammarby: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=hammarby&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    djurgarden: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=djurgarden%20allsvenskan&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    goteborg: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=ifk%20goteborg&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    elfsborg: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=elfsborg&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    hacken: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=hacken&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    mjallby: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=mjallby&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    sirius: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=sirius&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    vasteras: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=vasteras%20sk&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    brommapojkarna: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=brommapojkarna&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    degerfors: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=degerfors&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    halmstad: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=halmstad%20bk&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    orgryte: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=orgryte&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    gais: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=gais&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
    kalmar: [
      { name: 'Google News', url: 'https://news.google.com/rss/search?q=kalmar%20ff&hl=sv&gl=SE&ceid=SE%3Asv' },
    ],
  };
  start: [
    {
      name: 'Google',
      url: 'https://news.google.com/rss/search?q=allsvenskan&hl=sv&gl=SE&ceid=SE%3Asv'
    }
  ],

  malmo: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=malmÃ¶%20ff&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  aik: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=aik&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  hammarby: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=hammarby&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  djurgarden: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=djurgÃ¥rden%20allsvenskan&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  goteborg: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=ifk%20gÃ¶teborg&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  elfsborg: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=elfsborg&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  hacken: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=hÃ¤cken&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  mjallby: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=mjÃ¤llby&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  sirius: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=sirius&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  vasteras: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=VÃ¤sterÃ¥s%20sk&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  brommapojkarna: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=brommapojkarna&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  degerfors: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=degerfors&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  halmstad: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=halmstad%20bk&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  orgryte: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=Ã–rgryte&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  gais: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=gais&hl=sv&gl=SE&ceid=SE%3Asv' }
  ],

  kalmar: [
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=kalmar%20ff&hl=sv&gl=SE&ceid=SE%3Asv' }
  ]
};

  // Om team inte finns hÃ¤r blir det tom lista
  const feeds = FEEDS_BY_TEAM[team] || [];

  function decodeHtml(str = '') {
        url: link,
        summary: description.slice(0, 180),
        source: sourceName,
        date,
        date
      };
    }).filter(Boolean);
  }
      feeds.map(async feed => {
        try {
          const resp = await fetch(feed.url, {
            headers: { 'user-agent': 'Mozilla/5.0 AllsvenskanAI' },
            headers: { 'user-agent': 'Mozilla/5.0 AllsvenskanAI' }
          });

          if (!resp.ok) return [];

          const bytes = await resp.arrayBuffer();
          const xml = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
          const xml = await resp.text();
          return parseRss(xml, feed.name);
        } catch {
          return [];
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');

    return res.status(200).json({
      news: news.slice(0, 8),
      news: news.slice(0, 8)
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Kunde inte hämta nyheter',
      details: err.message,
      error: 'Kunde inte hÃ¤mta nyheter',
      details: err.message
    });
  }
}
