import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseTrendingHtml, fetchGithubTrending } from '../scripts/sources/githubTrending.mjs';

const html = await readFile(fileURLToPath(new URL('./fixtures/trending.html', import.meta.url)), 'utf8');

test('parses repo, url, desc, lang, stars, todayStars', () => {
  const items = parseTrendingHtml(html);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    repo: 'dolthub/dolt',
    url: 'https://github.com/dolthub/dolt',
    desc: 'Dolt – Git for Data',
    lang: 'Go',
    stars: 18500,
    todayStars: 320,
  });
});

test('missing description becomes empty string, repo still included', () => {
  const items = parseTrendingHtml(html);
  assert.equal(items[1].repo, 'owner/no-desc');
  assert.equal(items[1].desc, '');
});

test('limit caps the number of items', () => {
  assert.equal(parseTrendingHtml(html, 1).length, 1);
});

test('fetchGithubTrending returns failResult on HTTP error', async () => {
  const res = await fetchGithubTrending({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(res.ok, false);
  assert.deepEqual(res.items, []);
});
