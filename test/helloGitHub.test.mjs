import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extractGithubUrl, parseHelloGitHubRss, fetchHelloGitHub, isPeriodicalItem } from '../scripts/sources/helloGitHub.mjs';

const xml = await readFile(fileURLToPath(new URL('./fixtures/hellogithub.xml', import.meta.url)), 'utf8');

test('extractGithubUrl finds a repo link or returns null', () => {
  assert.equal(extractGithubUrl('see https://github.com/a/b here'), 'https://github.com/a/b');
  assert.equal(extractGithubUrl('no link'), null);
});

test('parseHelloGitHubRss prefers embedded GitHub url, falls back to article link', () => {
  const out = parseHelloGitHubRss(xml);
  assert.equal(out[0].name, 'gittype');
  assert.equal(out[0].url, 'https://github.com/unhappychoice/gittype');
  assert.equal(out[0].category, '游戏');
  assert.equal(out[1].url, 'https://hellogithub.com/repository/def');
});

test('excludes HelloGitHub periodical/digest items (第 N 期 / volume pages)', () => {
  assert.equal(isPeriodicalItem({ title: 'HelloGitHub 第 122 期', link: 'https://hellogithub.com/periodical/volume/122' }), true);
  assert.equal(isPeriodicalItem({ title: 'gittype', link: 'https://github.com/x/y' }), false);
  const out = parseHelloGitHubRss(xml);
  assert.ok(!out.some((i) => /第\s*\d+\s*期/.test(i.name)));
  assert.equal(out[0].name, 'gittype');
});

test('fetchHelloGitHub returns failResult on HTTP error', async () => {
  const res = await fetchHelloGitHub({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(res.ok, false);
});
