import * as cheerio from 'cheerio';
import { cleanText, parseCount, makeResult, failResult } from '../normalize.mjs';

const TRENDING_URL = 'https://github.com/trending?since=daily';

export function parseTrendingHtml(html, limit = 25) {
  const $ = cheerio.load(html);
  const items = [];
  $('article.Box-row').each((_, el) => {
    if (items.length >= limit) return;
    const $el = $(el);
    const repo = cleanText($el.find('h2 a').attr('href') || '').replace(/^\//, '');
    if (!repo) return;
    const desc = cleanText($el.find('p').first().text());
    const lang = cleanText($el.find('[itemprop="programmingLanguage"]').first().text());
    const stars = parseCount($el.find('a[href$="/stargazers"]').first().text());
    const todayStars = parseCount(cleanText($el.find('span.float-sm-right').first().text()));
    items.push({ repo, url: `https://github.com/${repo}`, desc, lang, stars, todayStars });
  });
  return items;
}

export async function fetchGithubTrending({ limit = 25, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(TRENDING_URL, { headers: { 'User-Agent': 'trending-dashboard' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return makeResult(parseTrendingHtml(html, limit));
  } catch (err) {
    return failResult(err);
  }
}
