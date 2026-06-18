import { cleanText, makeResult, failResult } from '../normalize.mjs';

// HelloGitHub's RSS feed lists monthly *issues* (第 N 期), not individual
// projects. The official on-list API returns project-level items instead.
const HG_API = 'https://api.hellogithub.com/v1/';

export function mapApiItem(it) {
  const fullName = cleanText(it.full_name);
  return {
    name: fullName,
    url: fullName ? `https://github.com/${fullName}` : '',
    desc: cleanText(it.title || it.summary || ''),
    lang: cleanText(it.primary_lang),
    category: '',
  };
}

export function parseHelloGitHubApi(json, limit = 15) {
  const data = json && Array.isArray(json.data) ? json.data : [];
  return data.slice(0, limit).map(mapApiItem);
}

export async function fetchHelloGitHub({ limit = 15, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(HG_API, { headers: { 'User-Agent': 'trending-dashboard' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return makeResult(parseHelloGitHubApi(json, limit));
  } catch (err) {
    return failResult(err);
  }
}
