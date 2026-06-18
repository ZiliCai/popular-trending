import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, parseCount, makeResult, failResult, validateLatest, SOURCE_KEYS } from '../scripts/normalize.mjs';

test('cleanText collapses whitespace and handles null', () => {
  assert.equal(cleanText('  a\n  b '), 'a b');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(undefined), '');
});

test('parseCount parses commas, k/m suffixes, numbers, null', () => {
  assert.equal(parseCount('1,234'), 1234);
  assert.equal(parseCount('12.3k'), 12300);
  assert.equal(parseCount('2m'), 2000000);
  assert.equal(parseCount(5), 5);
  assert.equal(parseCount(null), 0);
  assert.equal(parseCount('320 stars today'), 320);
});

test('makeResult / failResult shapes', () => {
  assert.deepEqual(makeResult([1]), { ok: true, error: null, items: [1] });
  const f = failResult(new Error('boom'));
  assert.equal(f.ok, false);
  assert.equal(f.error, 'boom');
  assert.deepEqual(f.items, []);
});

test('validateLatest flags missing fields and passes a good object', () => {
  assert.ok(validateLatest(null).length > 0);
  const good = { updatedAt: '2026-06-18T00:00:00Z', sources: {} };
  for (const k of SOURCE_KEYS) good.sources[k] = { ok: true, error: null, items: [] };
  assert.deepEqual(validateLatest(good), []);
  const bad = { updatedAt: '', sources: { githubTrending: { ok: 'yes', items: 'no' } } };
  assert.ok(validateLatest(bad).length > 0);
});
