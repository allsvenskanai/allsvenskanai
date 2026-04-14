const TEAM_SEARCH_TERMS = {
  start: 'allsvenskan OR damallsvenskan',
  malmo: 'Malmö FF',
  aik: 'AIK fotboll',
  hammarby: 'Hammarby fotboll',
  djurgarden: 'Djurgården fotboll',
  goteborg: 'IFK Göteborg',
  elfsborg: 'IF Elfsborg',
  hacken: 'BK Häcken',
  mjallby: 'Mjällby AIF',
  sirius: 'IK Sirius',
  vasteras: 'Västerås SK',
  brommapojkarna: 'IF Brommapojkarna',
  degerfors: 'Degerfors IF',
  halmstad: 'Halmstads BK',
  orgryte: 'Örgryte IS',
  gais: 'GAIS',
  kalmar: 'Kalmar FF',
  pitea: 'Piteå IF',
  rosengard: 'FC Rosengård',
  kristianstad: 'Kristianstads DFF',
  linkoping: 'Linköpings FC',
  norrkoping: 'IFK Norrköping dam',
  vaxjo: 'Växjö DFF',
  vittsjo: 'Vittsjö GIK',
};

function googleNewsUrl(query){
  const encoded = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encoded}&hl=sv&gl=SE&ceid=SE%3Asv`;
}

function decodeHtml(str = ''){
  return String(str || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(str = ''){
  return decodeHtml(str)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRss(xml = '', sourceName = 'Google News'){
  const items = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, 20).map(item => {
    const title = stripHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const link = stripHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const description = stripHtml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const pubDateRaw = stripHtml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');
    if(!title || !link) return null;
    const dateObj = new Date(pubDateRaw);
    return {
      title,
      url:link,
      summary:description.slice(0, 180),
      source:sourceName,
      date:Number.isNaN(dateObj.getTime()) ? '' : dateObj.toISOString().slice(0, 10),
    };
  }).filter(Boolean);
}

function uniqueArticles(list = []){
  const seen = new Set();
  return list.filter(article => {
    const key = `${article.title}|${article.url}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function handler(req, res){
  const team = String(req.query.team || 'start').trim().toLowerCase();
  const query = TEAM_SEARCH_TERMS[team] || TEAM_SEARCH_TERMS.start;
  try {
    const response = await fetch(googleNewsUrl(query), {
      headers:{ 'user-agent':'Mozilla/5.0 AllsvenskanAI' },
    });
    if(!response.ok) {
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
      return res.status(200).json({ news:[] });
    }
    const xml = await response.text();
    const news = uniqueArticles(parseRss(xml)).sort((a, b) => {
      if(a.date && b.date) return b.date.localeCompare(a.date);
      if(a.date) return -1;
      if(b.date) return 1;
      return 0;
    });
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({ news:news.slice(0, 8) });
  } catch(error) {
    console.warn('[news]', { team, error:error.message });
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ news:[] });
  }
}
