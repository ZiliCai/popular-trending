import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mapApiItem, parseHelloGitHubApi, fetchHelloGitHub } from '../scripts/sources/helloGitHub.mjs';

const json = JSON.parse(await readFile(fileURLToPath(new URL('./fixtures/hellogithub.json', import.meta.url)), 'utf8'));

test('mapApiItem builds repo name, GitHub url, Chinese desc, language', () => {
  const out = mapApiItem({ full_name: 't8y2/dbx', title: '轻量级跨平台数据库桌面客户端', primary_lang: 'Rust' });
  assert.deepEqual(out, {
    name: 't8y2/dbx',
    url: 'https://github.com/t8y2/dbx',
    desc: '轻量级跨平台数据库桌面客户端',
    lang: 'Rust',
    category: '',
  });
});

test('mapApiItem falls back to summary when title missing', () => {
  assert.equal(mapApiItem({ full_name: 'a/b', summary: 'desc here' }).desc, 'desc here');
});

test('parseHelloGitHubApi maps the data array and caps at limit', () => {
  const out = parseHelloGitHubApi(json, 15);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 't8y2/dbx');
  assert.equal(out[0].url, 'https://github.com/t8y2/dbx');
  assert.equal(parseHelloGitHubApi(json, 1).length, 1);
});

test('parseHelloGitHubApi tolerates a missing data array', () => {
  assert.deepEqual(parseHelloGitHubApi({}, 15), []);
});

test('fetchHelloGitHub maps items via injected fetchImpl', async () => {
  const res = await fetchHelloGitHub({ fetchImpl: async () => ({ ok: true, json: async () => json }) });
  assert.equal(res.ok, true);
  assert.equal(res.items[0].name, 't8y2/dbx');
});

test('fetchHelloGitHub returns failResult on HTTP error', async () => {
  const res = await fetchHelloGitHub({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(res.ok, false);
});
