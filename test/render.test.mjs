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

test('cardHtml uses Chinese fields in zh mode and originals in orig mode', () => {
  const item = { repo: 'a/b', url: 'https://x', desc: 'Elegant HTTP', descZh: '优雅的 HTTP', stars: 1 };
  const zh = cardHtml(item, 'githubTrending', false, 'zh');
  assert.ok(zh.includes('优雅的 HTTP') && !zh.includes('Elegant HTTP'));
  const orig = cardHtml(item, 'githubTrending', false, 'orig');
  assert.ok(orig.includes('Elegant HTTP') && !orig.includes('优雅的 HTTP'));
});

test('cardHtml prefers plain-language descPlain over descZh in zh mode', () => {
  const item = { repo: 'a/b', url: 'https://x', desc: 'A SQL database with version control', descZh: '带版本控制的 SQL 数据库', descPlain: '把数据库当 Git 用', stars: 1 };
  assert.ok(cardHtml(item, 'githubTrending', false, 'zh').includes('把数据库当 Git 用'));
  assert.ok(!cardHtml(item, 'githubTrending', false, 'zh').includes('带版本控制的 SQL 数据库'));
  assert.ok(cardHtml(item, 'githubTrending', false, 'orig').includes('A SQL database with version control'));
});

test('cardHtml swaps HN title via titleZh in zh mode only', () => {
  const hn = { kind: 'hn', title: 'Show HN: cool', titleZh: '展示:很酷', url: 'https://x', points: 5, comments: 2 };
  assert.ok(cardHtml(hn, 'hnph', false, 'zh').includes('展示:很酷'));
  assert.ok(cardHtml(hn, 'hnph', false, 'orig').includes('Show HN: cool'));
});

test('cardHtml shows topics chips only for recentHighStars with empty desc', () => {
  const out = cardHtml({ repo: 'a/b', url: 'https://x', desc: '', stars: 2907, lang: '', topics: ['ai', 'agent'] }, 'recentHighStars');
  assert.ok(out.includes('class="chip"') && out.includes('ai') && out.includes('agent'));
});
