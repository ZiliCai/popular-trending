import { XMLParser } from 'fast-xml-parser';
import { cleanText, parseCount, makeResult, failResult } from '../normalize.mjs';

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const PH_RSS = 'https://www.producthunt.com/feed';

export function mapHnItem(item) {
  return {
    kind: 'hn',
    title: cleanText(item.title),
    url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
    points: parseCount(item.score),
    comments: parseCount(item.descendants),
  };
}

export function parsePhRss(xml, limit = 6) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const raw = doc?.rss?.channel?.item ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.slice(0, limit).map((e) => {
    const link = typeof e.link === 'string' ? e.link : (e.link?.['@_href'] || e.link?.['#text'] || '');
    return { kind: 'ph', title: cleanText(e.title), url: cleanText(link), desc: cleanText(e.description || '') };
  });
}

export async function fetchHn({ limit = 12, fetchImpl = fetch } = {}) {
  const idsRes = await fetchImpl(HN_TOP);
  if (!idsRes.ok) throw new Error(`HN HTTP ${idsRes.status}`);
  const ids = (await idsRes.json()).slice(0, limit);
  const items = [];
  for (const id of ids) {
    const r = await fetchImpl(HN_ITEM(id));
    if (!r.ok) continue;
    const it = await r.json();
    if (it && it.title) items.push(mapHnItem(it));
  }
  return items;
}

export async function fetchPh({ limit = 6, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(PH_RSS, { headers: { 'User-Agent': 'trending-dashboard' } });
  if (!res.ok) throw new Error(`PH HTTP ${res.status}`);
  return parsePhRss(await res.text(), limit);
}

export async function fetchHnPh({ hnLimit = 12, phLimit = 6, fetchImpl = fetch } = {}) {
  try {
    const [hn, ph] = await Promise.allSettled([
      fetchHn({ limit: hnLimit, fetchImpl }),
      fetchPh({ limit: phLimit, fetchImpl }),
    ]);
    if (hn.status === 'rejected' && ph.status === 'rejected') return failResult(hn.reason || ph.reason);
    return makeResult([
      ...(hn.status === 'fulfilled' ? hn.value : []),
      ...(ph.status === 'fulfilled' ? ph.value : []),
    ]);
  } catch (err) {
    return failResult(err);
  }
}
