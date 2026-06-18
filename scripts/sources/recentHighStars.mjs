import { cleanText, parseCount, makeResult, failResult } from '../normalize.mjs';

const API = 'https://api.github.com/search/repositories';

export function sinceDate(now = new Date(), daysAgo = 30) {
  const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function buildSearchUrl(since, perPage = 25) {
  const q = encodeURIComponent(`created:>=${since} sort:stars`);
  return `${API}?q=${q}&sort=stars&order=desc&per_page=${perPage}`;
}

export function mapSearchItem(repo) {
  return {
    repo: repo.full_name,
    url: repo.html_url,
    desc: cleanText(repo.description),
    lang: cleanText(repo.language),
    stars: parseCount(repo.stargazers_count),
    topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 4) : [],
  };
}

export async function fetchRecentHighStars({ limit = 25, token = process.env.GITHUB_TOKEN, now = new Date(), fetchImpl = fetch } = {}) {
  try {
    const url = buildSearchUrl(sinceDate(now), limit);
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'trending-dashboard' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return makeResult((data.items || []).slice(0, limit).map(mapSearchItem));
  } catch (err) {
    return failResult(err);
  }
}
