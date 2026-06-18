import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnrichMessages, parseEnrichResponse, enrichItems } from '../scripts/enrich.mjs';

test('buildEnrichMessages lists items with index, label and text', () => {
  const msgs = buildEnrichMessages([{ _label: 'a/b', _text: 'A tool' }, { _label: 'c/d', _text: '' }]);
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[1].content.includes('0. a/b｜A tool'));
  assert.ok(msgs[1].content.includes('1. c/d｜(无简介)'));
});

test('parseEnrichResponse maps by index from {items:[...]}', () => {
  const out = parseEnrichResponse(JSON.stringify({ items: [
    { i: 1, plain: '第二个', keep: false },
    { i: 0, plain: '第一个', keep: true },
  ] }), 2);
  assert.deepEqual(out, [{ plain: '第一个', keep: true }, { plain: '第二个', keep: false }]);
});

test('parseEnrichResponse defaults keep to true and tolerates junk', () => {
  assert.equal(parseEnrichResponse('not json', 1), null);
  const out = parseEnrichResponse({ items: [{ i: 0, plain: 'x' }] }, 1);
  assert.deepEqual(out, [{ plain: 'x', keep: true }]);
});

test('enrichItems returns null without an API key (no fetch)', async () => {
  const res = await enrichItems([{ _label: 'a', _text: 'b' }], { apiKey: '', fetchImpl: async () => { throw new Error('should not fetch'); } });
  assert.equal(res, null);
});

test('enrichItems calls the LLM and parses choices content', async () => {
  let sentBody = null;
  const fetchImpl = async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ items: [{ i: 0, plain: '一个数据库', keep: true }] }) } }] }) };
  };
  const res = await enrichItems([{ _label: 'dolthub/dolt', _text: 'a SQL db' }], { apiKey: 'k', fetchImpl });
  assert.equal(sentBody.model, 'deepseek-chat');
  assert.deepEqual(res, [{ plain: '一个数据库', keep: true }]);
});

test('enrichItems returns null on HTTP error', async () => {
  const res = await enrichItems([{ _label: 'a', _text: 'b' }], { apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 429 }) });
  assert.equal(res, null);
});
