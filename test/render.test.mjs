import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, formatCount, itemMatches, filterItems, cardHtml } from '../public/render.mjs';

test('escapeHtml escapes dangerous chars', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('formatCount adds thousands separators', () => {
  assert.equal(formatCount(18500), '18,500');
  assert.equal(formatCount(0), '0');
});

test('filterItems matches title/repo/desc case-insensitively', () => {
  const items = [{ repo: 'dolthub/dolt', desc: 'Git for Data' }, { title: 'SQLite', desc: '' }];
  assert.equal(filterItems(items, 'sql').length, 1);
  assert.equal(filterItems(items, '').length, 2);
  assert.equal(itemMatches({ repo: 'a/b', desc: 'x' }, 'zzz'), false);
});

test('cardHtml omits desc line when empty and links out safely', () => {
  const withDesc = cardHtml({ repo: 'a/b', url: 'https://x', desc: 'hello', stars: 100, todayStars: 5, lang: 'Go' }, 'githubTrending');
  assert.ok(withDesc.includes('target="_blank"') && withDesc.includes('rel="noopener"'));
  assert.ok(withDesc.includes('class="desc"'));
  assert.ok(withDesc.includes('18,500') === false && withDesc.includes('100'));
  const noDesc = cardHtml({ repo: 'a/b', url: 'https://x', desc: '', stars: 100, lang: 'Go' }, 'githubTrending');
  assert.ok(!noDesc.includes('class="desc"'));
});

test('cardHtml marks hero card when isHero is true', () => {
  const hero = cardHtml({ repo: 'a/b', url: 'https://x', desc: 'hi', stars: 1 }, 'githubTrending', true);
  assert.ok(hero.includes('class="card hero source-githubTrending"'));
  const normal = cardHtml({ repo: 'a/b', url: 'https://x', desc: 'hi', stars: 1 }, 'githubTrending');
  assert.ok(normal.includes('class="card source-githubTrending"') && !normal.includes('hero'));
});

test('cardHtml shows topics chips only for recentHighStars with empty desc', () => {
  const out = cardHtml({ repo: 'a/b', url: 'https://x', desc: '', stars: 2907, lang: '', topics: ['ai', 'agent'] }, 'recentHighStars');
  assert.ok(out.includes('class="chip"') && out.includes('ai') && out.includes('agent'));
});
