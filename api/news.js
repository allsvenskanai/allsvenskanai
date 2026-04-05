export default async function handler(req, res) {
  const q = String(req.query.q || 'allsvenskan').trim().toLowerCase();

  // =====================================
  // 🔥 HÄR ÄNDRAR DU ALLT (ENKELT)
  // =====================================

  // Startsidan
  const START_FEEDS = [
    { name: 'Allsvenskan', url: 'https://allsvenskan.se/nyheter' }
  ];

  // 🔥 LAG-SPECIFIKA RSS
  const TEAM_FEEDS = {
    malmö: [
      { name: 'Fotbollskanalen', url: 'https://www.fotbollskanalen.se/rss/allsvenskan/' }
    ],

    aik: [
      { name: 'Fotbollskanalen', url: 'https://www.fotbollskanalen.se/rss/allsvenskan/' }
    ],

    // 🔥 lägg till fler lag här
    // "hammarby": [ { name:'...', url:'...' } ]
  };

  // fallback om laget inte finns
  const DEFAULT_TEAM_FEEDS = [
    { name: 'Fotbollskanalen', url: 'https://www.fotbollskanalen.se/rss/allsvenskan/' },
    { name: 'SVT Sport', url: 'https://www.svt.se/sport/rss.xml' }
  ];

  // =====================================
  // 🔧 HJÄLP
  // =====================================

  function cleanTeam(str = '') {
    return str
      .replace(/\bik\b/gi,'')
      .replace(/\bif\b/gi,'')
      .replace(/\bfk\b/gi,'')
      .replace(/\bff\b/gi,'')
      .replace(/\baif\b/gi,'')
      .trim();
  }

  function getTeamKey(str) {
    return cleanTeam(str).split(' ')[0].toLowerCase();
  }

  function strip(str=''){
    return str
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs,'$1')
      .replace(/<[^>]*>/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function parse(xml, source){
    const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

    return items.slice(0,15).map(item=>{
      const title = strip(item.match(/<title>(.*?)<\/title>/i)?.[1]||'');
      const link = strip(item.match(/<link>(.*?)<\/link>/i)?.[1]||'');
      const desc = strip(item.match(/<description>(.*?)<\/description>/i)?.[1]||'');

      const dateRaw = strip(item.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]||'');
      let date = '';
      const d = new Date(dateRaw);
      if(!isNaN(d)) date = d.toISOString().slice(0,10);

      if(!title || !link) return null;

      return {
        title,
        url: link,
        summary: desc.slice(0,160),
        source,
        date
      };
    }).filter(Boolean);
  }

  function unique(list){
    const seen = new Set();
    return list.filter(a=>{
      const k = a.title + a.url;
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // =====================================
  // 🔥 VÄLJ FEEDS
  // =====================================

  let feeds;

  if(q === 'allsvenskan'){
    feeds = START_FEEDS;
  } else {
    const key = getTeamKey(q);
    feeds = TEAM_FEEDS[key] || DEFAULT_TEAM_FEEDS;
  }

  // =====================================
  // 🔥 HÄMTA RSS
  // =====================================

  try {
    const fetched = await Promise.all(
      feeds.map(async f=>{
        try{
          const r = await fetch(f.url);
          const xml = await r.text();
          return parse(xml, f.name);
        }catch{
          return [];
        }
      })
    );

    let news = unique(fetched.flat());

    // 🔥 sortera
    news.sort((a,b)=>{
      if(a.date && b.date) return b.date.localeCompare(a.date);
      return 0;
    });

    res.setHeader('Cache-Control','s-maxage=600');

    res.status(200).json({
      news: news.slice(0,6)
    });

  } catch(err){
    res.status(500).json({ error: err.message });
  }
}
