import { XMLParser } from 'fast-xml-parser';
import { cleanText, makeResult, failResult } from '../normalize.mjs';

const HG_RSS = 'https://hellogithub.com/rss';

export function extractGithubUrl(html) {
  if (!html) return null;
  const m = String(html).match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/);
  return m ? m[0] : null;
}

export function isPeriodicalItem(e) {
  const title = cleanText(e?.title || '');
  const link = typeof e?.link === 'string' ? e.link : '';
  return /第\s*\d+\s*期/.test(title) || /\/periodical\//.test(link) || /\/volume\//.test(link);
}

export function parseHelloGitHubRss(xml, limit = 15) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const raw = doc?.rss?.channel?.item ?? [];
  const arr = (Array.isArray(raw) ? raw : [raw]).filter((e) => !isPeriodicalItem(e));
  return arr.slice(0, limit).map((e) => {
    const desc = cleanText(e.description || '');
    const gh = extractGithubUrl(e.description || '');
    const link = typeof e.link === 'string' ? e.link : '';
    return { name: cleanText(e.title), url: gh || cleanText(link), desc, category: cleanText(e.category || '') };
  });
}

export async function fetchHelloGitHub({ limit = 15, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(HG_RSS, { headers: { 'User-Agent': 'trending-dashboard' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return makeResult(parseHelloGitHubRss(await res.text(), limit));
  } catch (err) {
    return failResult(err);
  }
}
