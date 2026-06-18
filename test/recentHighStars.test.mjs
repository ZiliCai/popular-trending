import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinceDate, buildSearchUrl, mapSearchItem, fetchRecentHighStars } from '../scripts/sources/recentHighStars.mjs';

test('sinceDate returns YYYY-MM-DD 30 days before now', () => {
  const now = new Date('2026-06-18T00:00:00Z');
  assert.equal(sinceDate(now, 30), '2026-05-19');
});

test('buildSearchUrl encodes query and per_page', () => {
  const url = buildSearchUrl('2026-05-19', 25);
  assert.ok(url.includes('created%3A%3E%3D2026-05-19'));
  assert.ok(url.includes('per_page=25'));
  assert.ok(url.includes('sort=stars'));
});

test('mapSearchItem keeps high-star repo with null description (empty string + topics)', () => {
  const out = mapSearchItem({
    full_name: 'FoundZiGu/GuJumpgate', html_url: 'https://github.com/FoundZiGu/GuJumpgate',
    description: null, language: null, stargazers_count: 3902, topics: ['ai', 'agent', 'llm', 'tooling', 'extra'],
  });
  assert.equal(out.desc, '');
  assert.equal(out.lang, '');
  assert.equal(out.stars, 3902);
  assert.deepEqual(out.topics, ['ai', 'agent', 'llm', 'tooling']); // capped at 4
});

test('fetchRecentHighStars maps items from API json', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ items: [
    { full_name: 'a/b', html_url: 'https://github.com/a/b', description: 'hi', language: 'Go', stargazers_count: 100, topics: [] },
  ] }) });
  const res = await fetchRecentHighStars({ fetchImpl, now: new Date('2026-06-18T00:00:00Z') });
  assert.equal(res.ok, true);
  assert.equal(res.items[0].repo, 'a/b');
});
