import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readmeExcerpt, fetchReadme, fetchReadmes } from '../scripts/readme.mjs';

test('readmeExcerpt strips markdown noise and caps length', () => {
  const md = '# Title\n\n![badge](http://x/y.png)\n\nSome **bold** text with [a link](http://x).\n\n```js\ncode();\n```\nMore text.';
  const out = readmeExcerpt(md, 200);
  assert.ok(!out.includes('![') && !out.includes('```') && !out.includes('](http'));
  assert.ok(out.includes('Some bold text with a link'));
  assert.ok(out.includes('More text'));
  assert.equal(readmeExcerpt('', 200), '');
  assert.ok(readmeExcerpt('x'.repeat(500), 100).length <= 100);
});

test('fetchReadme returns excerpt on 200 and empty on error', async () => {
  const ok = await fetchReadme('a/b', { fetchImpl: async () => ({ ok: true, text: async () => '# Hi\n\nHello world' }) });
  assert.ok(ok.includes('Hello world'));
  assert.equal(await fetchReadme('a/b', { fetchImpl: async () => ({ ok: false, status: 404 }) }), '');
  assert.equal(await fetchReadme('', { fetchImpl: async () => { throw new Error('nope'); } }), '');
});

test('fetchReadmes dedupes and returns a lookup', async () => {
  let calls = 0;
  const getR = await fetchReadmes(['a/b', 'a/b', 'c/d'], { fetchImpl: async () => { calls++; return { ok: true, text: async () => 'readme ' + calls }; } });
  assert.equal(calls, 2);
  assert.ok(getR('a/b').startsWith('readme'));
  assert.equal(getR('x/y'), '');
});
