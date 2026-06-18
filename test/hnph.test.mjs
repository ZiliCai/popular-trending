import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mapHnItem, parsePhRss, fetchHnPh } from '../scripts/sources/hnph.mjs';

const phXml = await readFile(fileURLToPath(new URL('./fixtures/ph.xml', import.meta.url)), 'utf8');

test('mapHnItem maps score/descendants and falls back to HN url', () => {
  assert.deepEqual(mapHnItem({ id: 1, title: 'Hello', score: 412, descendants: 156 }), {
    kind: 'hn', title: 'Hello', url: 'https://news.ycombinator.com/item?id=1', points: 412, comments: 156,
  });
  assert.equal(mapHnItem({ id: 2, title: 'X', url: 'https://x.com', score: 1, descendants: 0 }).url, 'https://x.com');
});

test('parsePhRss parses items and caps at limit', () => {
  const out = parsePhRss(phXml, 6);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { kind: 'ph', title: 'Kami', url: 'https://www.producthunt.com/posts/kami', desc: 'AI document design templates' });
  assert.equal(parsePhRss(phXml, 1).length, 1);
});

test('fetchHnPh combines HN + PH and survives one side failing', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('topstories.json')) return { ok: true, json: async () => [10] };
    if (url.includes('/item/')) return { ok: true, json: async () => ({ id: 10, title: 'Story', score: 5, descendants: 2 }) };
    if (url.includes('producthunt')) return { ok: false, status: 503 };
    return { ok: false, status: 404 };
  };
  const res = await fetchHnPh({ fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.items.filter((i) => i.kind === 'hn').length, 1);
  assert.equal(res.items.filter((i) => i.kind === 'ph').length, 0);
});
