import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isChinese, buildTranslateUrl, parseTranslateResponse, translateText, translateMany } from '../scripts/translate.mjs';

test('isChinese detects CJK', () => {
  assert.equal(isChinese('你好'), true);
  assert.equal(isChinese('hello'), false);
  assert.equal(isChinese(''), false);
});

test('buildTranslateUrl encodes text and targets zh-CN', () => {
  const u = buildTranslateUrl('a b & c');
  assert.ok(u.includes('tl=zh-CN'));
  assert.ok(u.includes('q=a%20b%20%26%20c'));
});

test('parseTranslateResponse joins segments', () => {
  const json = [[['你好，', 'Hello, ', null, null], ['世界', 'world', null, null]], null, 'en'];
  assert.equal(parseTranslateResponse(json), '你好，世界');
  assert.equal(parseTranslateResponse(null), '');
});

test('translateText returns Chinese via injected fetch and skips Chinese input', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => [[['优雅的 HTTP', 'Elegant HTTP', null, null]], null, 'en'] });
  assert.equal(await translateText('Elegant HTTP', { fetchImpl }), '优雅的 HTTP');
  assert.equal(await translateText('已经中文', { fetchImpl: async () => { throw new Error('should not fetch'); } }), '已经中文');
});

test('translateText falls back to the original on failure', async () => {
  assert.equal(await translateText('keep me', { fetchImpl: async () => ({ ok: false, status: 500 }) }), 'keep me');
});

test('translateMany dedupes, skips Chinese, returns a lookup', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => [[['译文', '', null, null]], null, 'en'] }; };
  const lookup = await translateMany(['a', 'a', 'b', '中文'], { fetchImpl });
  assert.equal(calls, 2);
  assert.equal(lookup('a'), '译文');
  assert.equal(lookup('中文'), '中文');
});
