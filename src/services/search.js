import { normalizeSearch } from './formatters.js';

export function createSearchIndex(items = [], fields = []){
  return items.map(item => ({
    item,
    blob: normalizeSearch(fields.map(field => {
      if(typeof field === 'function') return field(item);
      return item?.[field] || '';
    }).join(' ')),
  }));
}

export function searchIndex(index = [], query = '', limit = 20){
  const normalized = normalizeSearch(query);
  if(!normalized) return index.slice(0, limit).map(entry => entry.item);
  return index
    .filter(entry => entry.blob.includes(normalized))
    .slice(0, limit)
    .map(entry => entry.item);
}
