import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLatest } from '../scripts/fetch.mjs';
import { validateLatest, makeResult } from '../scripts/normalize.mjs';

test('buildLatest produces a schema-valid object', () => {
  const r = makeResult([]);
  const data = buildLatest(
    { githubTrending: r, recentHighStars: r, helloGitHub: r, hnph: r },
    '2026-06-18T00:00:00Z',
  );
  assert.equal(data.updatedAt, '2026-06-18T00:00:00Z');
  assert.deepEqual(validateLatest(data), []);
  assert.ok('githubTrending' in data.sources && 'hnph' in data.sources);
});
