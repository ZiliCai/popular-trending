# Trending Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-updating static web dashboard that aggregates GitHub Trending, recent high-star repos, HelloGitHub, and HN·PH into one Bento-Pop-styled page, refreshed daily by a GitHub Action and served on GitHub Pages.

**Architecture:** A Node ESM build script fetches four isolated sources (each `{ok,error,items}`), normalizes them, and writes `public/data/latest.json`. A no-build static frontend (`index.html` + `style.css` + ESM `render.mjs`/`app.mjs`) fetches that JSON at load and renders four tabs. A scheduled GitHub Action runs the script and deploys `public/` to Pages.

**Tech Stack:** Node 20+ (ESM `.mjs`), `cheerio` (HTML parse), `fast-xml-parser` (RSS), built-in `node:test`, vanilla HTML/CSS/JS, GitHub Actions + GitHub Pages.

## Global Constraints

- Node `>=20`, all source files ESM (`.mjs`).
- Dependencies limited to `cheerio` and `fast-xml-parser`. Tests use built-in `node:test` only. No web-font network fetches in the frontend (system fonts + inline SVG only).
- Per-source result envelope is exactly `{ ok: boolean, error: string|null, items: [] }`.
- Per-source item counts: GitHub Trending **25**, 近期高星 **25**, HelloGitHub **15**, HN **12**, PH **6**.
- Refresh cron: `'0 0 * * *'` (daily 00:00 UTC = 08:00 Asia/Shanghai) + `workflow_dispatch`.
- **Never translate** project/repo/author names; keep description text in its original language (no translation in v1).
- **Do not filter** repos by star count or by whether a description exists.
- Missing description → store empty string `''`, never `null`, never a `"None"`/placeholder; frontend omits the description line entirely.
- 近期高星 source only: when a repo has no description, fall back to showing its `topics` as chips.
- PH via RSS; PH items have no `votes` field in v1.
- Repo name `trending-dashboard`; page title `今日有趣 · Trending Dashboard`.
- Visual source of truth: `docs/visual-reference-bento.html` (the approved "Bento Pop" mockup).

---

### Task 1: Project scaffold & test harness

**Files:**
- Create: `package.json`
- Create: `test/smoke.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` (runs `node --test`), `npm run build` (runs `node scripts/fetch.mjs`); `type: module` so all `.mjs` use ESM imports.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "trending-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "node scripts/fetch.mjs",
    "test": "node --test"
  },
  "dependencies": {
    "cheerio": "^1.0.0",
    "fast-xml-parser": "^4.5.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`, exit 0.

- [ ] **Step 3: Write the smoke test**

`test/smoke.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test harness runs', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json test/smoke.test.mjs
git commit -m "chore: scaffold project + node:test harness"
```

---

### Task 2: Shared normalization utilities

**Files:**
- Create: `scripts/normalize.mjs`
- Test: `test/normalize.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `cleanText(s) -> string` (collapse whitespace, `''` for null/undefined)
  - `parseCount(v) -> number` (handles `"1,234"`, `"12.3k"`, `5`, null→0)
  - `makeResult(items, {ok=true,error=null}) -> {ok,error,items}`
  - `failResult(error) -> {ok:false,error:string,items:[]}`
  - `SOURCE_KEYS = ['githubTrending','recentHighStars','helloGitHub','hnph']`
  - `validateLatest(data) -> string[]` (empty array = valid)

- [ ] **Step 1: Write the failing test**

`test/normalize.test.mjs`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/normalize.test.mjs`
Expected: FAIL — cannot find module `../scripts/normalize.mjs`.

- [ ] **Step 3: Write the implementation**

`scripts/normalize.mjs`:
```js
export function cleanText(s) {
  if (s == null) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

export function parseCount(v) {
  if (typeof v === 'number') return Math.round(v);
  if (v == null) return 0;
  const s = String(v).trim().toLowerCase().replace(/,/g, '');
  const m = s.match(/^([\d.]+)\s*([km]?)/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return 0;
  if (m[2] === 'k') n *= 1000;
  else if (m[2] === 'm') n *= 1_000_000;
  return Math.round(n);
}

export function makeResult(items, { ok = true, error = null } = {}) {
  return { ok, error, items: Array.isArray(items) ? items : [] };
}

export function failResult(error) {
  const msg = error && error.message ? error.message : String(error);
  return { ok: false, error: msg, items: [] };
}

export const SOURCE_KEYS = ['githubTrending', 'recentHighStars', 'helloGitHub', 'hnph'];

export function validateLatest(data) {
  const errors = [];
  if (!data || typeof data !== 'object') { errors.push('root is not an object'); return errors; }
  if (typeof data.updatedAt !== 'string' || !data.updatedAt) errors.push('updatedAt missing/empty');
  if (!data.sources || typeof data.sources !== 'object') { errors.push('sources missing'); return errors; }
  for (const key of SOURCE_KEYS) {
    const s = data.sources[key];
    if (!s || typeof s !== 'object') { errors.push(`sources.${key} missing`); continue; }
    if (typeof s.ok !== 'boolean') errors.push(`sources.${key}.ok not boolean`);
    if (!Array.isArray(s.items)) errors.push(`sources.${key}.items not array`);
  }
  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/normalize.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/normalize.mjs test/normalize.test.mjs
git commit -m "feat: shared normalization utilities + latest.json validator"
```

---

### Task 3: GitHub Trending source (scrape + parse)

**Files:**
- Create: `scripts/sources/githubTrending.mjs`
- Create: `test/fixtures/trending.html`
- Test: `test/githubTrending.test.mjs`

**Interfaces:**
- Consumes: `cleanText`, `parseCount`, `makeResult`, `failResult` from `../normalize.mjs`.
- Produces:
  - `parseTrendingHtml(html, limit=25) -> Array<{repo,url,desc,lang,stars,todayStars}>`
  - `fetchGithubTrending({limit=25, fetchImpl=fetch}) -> Promise<{ok,error,items}>`

- [ ] **Step 1: Create the fixture**

`test/fixtures/trending.html` (synthetic but matches GitHub's selectors; second row intentionally has no `<p>` to cover missing-description):
```html
<div class="Box">
  <article class="Box-row">
    <h2><a href="/dolthub/dolt">dolthub / dolt</a></h2>
    <p class="col-9">Dolt – Git for Data</p>
    <span itemprop="programmingLanguage">Go</span>
    <a href="/dolthub/dolt/stargazers">18,500</a>
    <span class="float-sm-right">320 stars today</span>
  </article>
  <article class="Box-row">
    <h2><a href="/owner/no-desc">owner / no-desc</a></h2>
    <span itemprop="programmingLanguage">Rust</span>
    <a href="/owner/no-desc/stargazers">2,907</a>
    <span class="float-sm-right">12 stars today</span>
  </article>
</div>
```

- [ ] **Step 2: Write the failing test**

`test/githubTrending.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseTrendingHtml, fetchGithubTrending } from '../scripts/sources/githubTrending.mjs';

const html = await readFile(fileURLToPath(new URL('./fixtures/trending.html', import.meta.url)), 'utf8');

test('parses repo, url, desc, lang, stars, todayStars', () => {
  const items = parseTrendingHtml(html);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    repo: 'dolthub/dolt',
    url: 'https://github.com/dolthub/dolt',
    desc: 'Dolt – Git for Data',
    lang: 'Go',
    stars: 18500,
    todayStars: 320,
  });
});

test('missing description becomes empty string, repo still included', () => {
  const items = parseTrendingHtml(html);
  assert.equal(items[1].repo, 'owner/no-desc');
  assert.equal(items[1].desc, '');
});

test('limit caps the number of items', () => {
  assert.equal(parseTrendingHtml(html, 1).length, 1);
});

test('fetchGithubTrending returns failResult on HTTP error', async () => {
  const res = await fetchGithubTrending({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(res.ok, false);
  assert.deepEqual(res.items, []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/githubTrending.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

`scripts/sources/githubTrending.mjs`:
```js
import * as cheerio from 'cheerio';
import { cleanText, parseCount, makeResult, failResult } from '../normalize.mjs';

const TRENDING_URL = 'https://github.com/trending?since=daily';

export function parseTrendingHtml(html, limit = 25) {
  const $ = cheerio.load(html);
  const items = [];
  $('article.Box-row').each((_, el) => {
    if (items.length >= limit) return;
    const $el = $(el);
    const repo = cleanText($el.find('h2 a').attr('href') || '').replace(/^\//, '');
    if (!repo) return;
    const desc = cleanText($el.find('p').first().text());
    const lang = cleanText($el.find('[itemprop="programmingLanguage"]').first().text());
    const stars = parseCount($el.find('a[href$="/stargazers"]').first().text());
    const todayStars = parseCount(cleanText($el.find('span.float-sm-right').first().text()));
    items.push({ repo, url: `https://github.com/${repo}`, desc, lang, stars, todayStars });
  });
  return items;
}

export async function fetchGithubTrending({ limit = 25, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(TRENDING_URL, { headers: { 'User-Agent': 'trending-dashboard' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return makeResult(parseTrendingHtml(html, limit));
  } catch (err) {
    return failResult(err);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/githubTrending.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/sources/githubTrending.mjs test/githubTrending.test.mjs test/fixtures/trending.html
git commit -m "feat: GitHub Trending source (scrape + parse, missing-desc safe)"
```

---

### Task 4: 近期高星 source (GitHub Search API)

**Files:**
- Create: `scripts/sources/recentHighStars.mjs`
- Test: `test/recentHighStars.test.mjs`

**Interfaces:**
- Consumes: `cleanText`, `parseCount`, `makeResult`, `failResult` from `../normalize.mjs`.
- Produces:
  - `sinceDate(now=new Date(), daysAgo=30) -> 'YYYY-MM-DD'`
  - `buildSearchUrl(since, perPage=25) -> string`
  - `mapSearchItem(repo) -> {repo,url,desc,lang,stars,topics}`
  - `fetchRecentHighStars({limit=25, token, now, fetchImpl=fetch}) -> Promise<{ok,error,items}>`

- [ ] **Step 1: Write the failing test**

`test/recentHighStars.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinceDate, buildSearchUrl, mapSearchItem, fetchRecentHighStars } from '../scripts/sources/recentHighStars.mjs';

test('sinceDate returns YYYY-MM-DD 30 days before now', () => {
  const now = new Date('2026-06-18T00:00:00Z');
  assert.equal(sinceDate(now, 30), '2026-05-19');
});

test('buildSearchUrl encodes query and per_page', () => {
  const url = buildSearchUrl('2026-05-19', 25);
  assert.ok(url.includes('created%3A%3E%3D2026-05-19'));
  assert.ok(url.includes('per_page=25'));
  assert.ok(url.includes('sort=stars'));
});

test('mapSearchItem keeps high-star repo with null description (empty string + topics)', () => {
  const out = mapSearchItem({
    full_name: 'FoundZiGu/GuJumpgate', html_url: 'https://github.com/FoundZiGu/GuJumpgate',
    description: null, language: null, stargazers_count: 3902, topics: ['ai', 'agent', 'llm', 'tooling', 'extra'],
  });
  assert.equal(out.desc, '');
  assert.equal(out.lang, '');
  assert.equal(out.stars, 3902);
  assert.deepEqual(out.topics, ['ai', 'agent', 'llm', 'tooling']); // capped at 4
});

test('fetchRecentHighStars maps items from API json', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ items: [
    { full_name: 'a/b', html_url: 'https://github.com/a/b', description: 'hi', language: 'Go', stargazers_count: 100, topics: [] },
  ] }) });
  const res = await fetchRecentHighStars({ fetchImpl, now: new Date('2026-06-18T00:00:00Z') });
  assert.equal(res.ok, true);
  assert.equal(res.items[0].repo, 'a/b');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recentHighStars.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`scripts/sources/recentHighStars.mjs`:
```js
import { cleanText, parseCount, makeResult, failResult } from '../normalize.mjs';

const API = 'https://api.github.com/search/repositories';

export function sinceDate(now = new Date(), daysAgo = 30) {
  const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function buildSearchUrl(since, perPage = 25) {
  const q = encodeURIComponent(`created:>=${since} sort:stars`);
  return `${API}?q=${q}&sort=stars&order=desc&per_page=${perPage}`;
}

export function mapSearchItem(repo) {
  return {
    repo: repo.full_name,
    url: repo.html_url,
    desc: cleanText(repo.description),
    lang: cleanText(repo.language),
    stars: parseCount(repo.stargazers_count),
    topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 4) : [],
  };
}

export async function fetchRecentHighStars({ limit = 25, token = process.env.GITHUB_TOKEN, now = new Date(), fetchImpl = fetch } = {}) {
  try {
    const url = buildSearchUrl(sinceDate(now), limit);
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'trending-dashboard' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return makeResult((data.items || []).slice(0, limit).map(mapSearchItem));
  } catch (err) {
    return failResult(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/recentHighStars.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/sources/recentHighStars.mjs test/recentHighStars.test.mjs
git commit -m "feat: 近期高星 source via GitHub Search API (topics fallback ready)"
```

---

### Task 5: HN · PH source (HN Firebase API + PH RSS)

**Files:**
- Create: `scripts/sources/hnph.mjs`
- Create: `test/fixtures/ph.xml`
- Test: `test/hnph.test.mjs`

**Interfaces:**
- Consumes: `XMLParser` from `fast-xml-parser`; `cleanText`, `parseCount`, `makeResult`, `failResult` from `../normalize.mjs`.
- Produces:
  - `mapHnItem(item) -> {kind:'hn',title,url,points,comments}`
  - `parsePhRss(xml, limit=6) -> Array<{kind:'ph',title,url,desc}>`
  - `fetchHn({limit=12, fetchImpl}) -> Promise<Array>`
  - `fetchPh({limit=6, fetchImpl}) -> Promise<Array>`
  - `fetchHnPh({hnLimit=12, phLimit=6, fetchImpl}) -> Promise<{ok,error,items}>`

- [ ] **Step 1: Create the PH RSS fixture**

`test/fixtures/ph.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Product Hunt</title>
  <item>
    <title>Kami</title>
    <link>https://www.producthunt.com/posts/kami</link>
    <description>AI document design templates</description>
  </item>
  <item>
    <title>CodexBar</title>
    <link>https://www.producthunt.com/posts/codexbar</link>
    <description>See quota for 40+ AI coding tools in your menubar</description>
  </item>
</channel></rss>
```

- [ ] **Step 2: Write the failing test**

`test/hnph.test.mjs`:
```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/hnph.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

`scripts/sources/hnph.mjs`:
```js
import { XMLParser } from 'fast-xml-parser';
import { cleanText, parseCount, makeResult, failResult } from '../normalize.mjs';

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const PH_RSS = 'https://www.producthunt.com/feed';

export function mapHnItem(item) {
  return {
    kind: 'hn',
    title: cleanText(item.title),
    url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
    points: parseCount(item.score),
    comments: parseCount(item.descendants),
  };
}

export function parsePhRss(xml, limit = 6) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const raw = doc?.rss?.channel?.item ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.slice(0, limit).map((e) => {
    const link = typeof e.link === 'string' ? e.link : (e.link?.['@_href'] || e.link?.['#text'] || '');
    return { kind: 'ph', title: cleanText(e.title), url: cleanText(link), desc: cleanText(e.description || '') };
  });
}

export async function fetchHn({ limit = 12, fetchImpl = fetch } = {}) {
  const idsRes = await fetchImpl(HN_TOP);
  if (!idsRes.ok) throw new Error(`HN HTTP ${idsRes.status}`);
  const ids = (await idsRes.json()).slice(0, limit);
  const items = [];
  for (const id of ids) {
    const r = await fetchImpl(HN_ITEM(id));
    if (!r.ok) continue;
    const it = await r.json();
    if (it && it.title) items.push(mapHnItem(it));
  }
  return items;
}

export async function fetchPh({ limit = 6, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(PH_RSS, { headers: { 'User-Agent': 'trending-dashboard' } });
  if (!res.ok) throw new Error(`PH HTTP ${res.status}`);
  return parsePhRss(await res.text(), limit);
}

export async function fetchHnPh({ hnLimit = 12, phLimit = 6, fetchImpl = fetch } = {}) {
  try {
    const [hn, ph] = await Promise.allSettled([
      fetchHn({ limit: hnLimit, fetchImpl }),
      fetchPh({ limit: phLimit, fetchImpl }),
    ]);
    if (hn.status === 'rejected' && ph.status === 'rejected') return failResult(hn.reason || ph.reason);
    return makeResult([
      ...(hn.status === 'fulfilled' ? hn.value : []),
      ...(ph.status === 'fulfilled' ? ph.value : []),
    ]);
  } catch (err) {
    return failResult(err);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/hnph.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/sources/hnph.mjs test/hnph.test.mjs test/fixtures/ph.xml
git commit -m "feat: HN (Firebase API) + PH (RSS) source, fault-tolerant"
```

---

### Task 6: HelloGitHub source (RSS) — with access spike

**Files:**
- Create: `scripts/sources/helloGitHub.mjs`
- Create: `test/fixtures/hellogithub.xml`
- Test: `test/helloGitHub.test.mjs`

**Interfaces:**
- Consumes: `XMLParser`; `cleanText`, `makeResult`, `failResult` from `../normalize.mjs`.
- Produces:
  - `extractGithubUrl(html) -> string|null`
  - `parseHelloGitHubRss(xml, limit=15) -> Array<{name,url,desc,category}>`
  - `fetchHelloGitHub({limit=15, fetchImpl=fetch}) -> Promise<{ok,error,items}>`

- [ ] **Step 1: Spike — confirm the real feed shape**

Run: `node -e "fetch('https://hellogithub.com/rss').then(r=>r.text()).then(t=>console.log(t.slice(0,1500)))"`
Expected: prints RSS XML. Note whether `<description>` contains a `github.com/owner/repo` link and whether `<category>` is present. If the structure differs from the fixture below (e.g. Atom `<entry>` instead of `<item>`), adjust `parseHelloGitHubRss` accordingly before continuing. If the feed only links to article pages with no embedded GitHub URL, that is acceptable for v1 — `url` falls back to the article link.

- [ ] **Step 2: Create the fixture**

`test/fixtures/hellogithub.xml` (one item with an embedded GitHub link, one without):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>HelloGitHub</title>
  <item>
    <title>gittype</title>
    <link>https://hellogithub.com/repository/abc</link>
    <category>游戏</category>
    <description>把你的代码变成打字游戏关卡 https://github.com/unhappychoice/gittype</description>
  </item>
  <item>
    <title>opentoonz</title>
    <link>https://hellogithub.com/repository/def</link>
    <category>工具</category>
    <description>吉卜力同源的开源 2D 动画软件</description>
  </item>
</channel></rss>
```

- [ ] **Step 3: Write the failing test**

`test/helloGitHub.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extractGithubUrl, parseHelloGitHubRss, fetchHelloGitHub } from '../scripts/sources/helloGitHub.mjs';

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

test('fetchHelloGitHub returns failResult on HTTP error', async () => {
  const res = await fetchHelloGitHub({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(res.ok, false);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test test/helloGitHub.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 5: Write the implementation**

`scripts/sources/helloGitHub.mjs`:
```js
import { XMLParser } from 'fast-xml-parser';
import { cleanText, makeResult, failResult } from '../normalize.mjs';

const HG_RSS = 'https://hellogithub.com/rss';

export function extractGithubUrl(html) {
  if (!html) return null;
  const m = String(html).match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/);
  return m ? m[0] : null;
}

export function parseHelloGitHubRss(xml, limit = 15) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const raw = doc?.rss?.channel?.item ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.slice(0, limit).map((e) => {
    const desc = cleanText(e.description || '');
    const gh = extractGithubUrl(e.description || '');
    const link = typeof e.link === 'string' ? e.link : '';
    return { name: cleanText(e.title), url: gh || cleanText(link), desc, category: cleanText(e.category || '') };
  });
}

export async function fetchHelloGitHub({ limit = 15, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(HG_RSS, { headers: { 'User-Agent': 'trending-dashboard' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return makeResult(parseHelloGitHubRss(await res.text(), limit));
  } catch (err) {
    return failResult(err);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/helloGitHub.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add scripts/sources/helloGitHub.mjs test/helloGitHub.test.mjs test/fixtures/hellogithub.xml
git commit -m "feat: HelloGitHub source via RSS (GitHub-url extraction + article fallback)"
```

---

### Task 7: Orchestrator (`fetch.mjs`) — assemble & write latest.json

**Files:**
- Create: `scripts/fetch.mjs`
- Test: `test/buildLatest.test.mjs`

**Interfaces:**
- Consumes: the four `fetch*` functions; `validateLatest`, `failResult` from `./normalize.mjs`.
- Produces:
  - `buildLatest(results, nowIso) -> {updatedAt, sources:{githubTrending,recentHighStars,helloGitHub,hnph}}`
  - `main() -> Promise<void>` (runs all sources via `Promise.allSettled`, validates, writes `public/data/latest.json`)

- [ ] **Step 1: Write the failing test**

`test/buildLatest.test.mjs`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/buildLatest.test.mjs`
Expected: FAIL — module not found / `buildLatest` undefined.

- [ ] **Step 3: Write the implementation**

`scripts/fetch.mjs`:
```js
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchGithubTrending } from './sources/githubTrending.mjs';
import { fetchRecentHighStars } from './sources/recentHighStars.mjs';
import { fetchHelloGitHub } from './sources/helloGitHub.mjs';
import { fetchHnPh } from './sources/hnph.mjs';
import { validateLatest, failResult } from './normalize.mjs';

const OUT = fileURLToPath(new URL('../public/data/latest.json', import.meta.url));

export function buildLatest(results, nowIso) {
  return {
    updatedAt: nowIso,
    sources: {
      githubTrending: results.githubTrending,
      recentHighStars: results.recentHighStars,
      helloGitHub: results.helloGitHub,
      hnph: results.hnph,
    },
  };
}

export async function main() {
  const settled = await Promise.allSettled([
    fetchGithubTrending({ limit: 25 }),
    fetchRecentHighStars({ limit: 25 }),
    fetchHelloGitHub({ limit: 15 }),
    fetchHnPh({ hnLimit: 12, phLimit: 6 }),
  ]);
  const [gt, rh, hg, hp] = settled.map((s) => (s.status === 'fulfilled' ? s.value : failResult(s.reason)));
  const data = buildLatest({ githubTrending: gt, recentHighStars: rh, helloGitHub: hg, hnph: hp }, new Date().toISOString());
  const errors = validateLatest(data);
  if (errors.length) { console.error('Schema errors:', errors); process.exitCode = 1; }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log('Wrote ' + OUT + ': ' + Object.entries(data.sources)
    .map(([k, v]) => `${k}=${v.items.length}${v.ok ? '' : '(failed)'}`).join(' '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/buildLatest.test.mjs`
Expected: PASS, 1 test.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, all tests across all files.

- [ ] **Step 6: Integration run (live network)**

Run: `npm run build`
Expected: prints `Wrote .../public/data/latest.json: githubTrending=25 recentHighStars=25 helloGitHub=... hnph=...`. Open `public/data/latest.json` and confirm it is valid JSON with four populated `sources`. If a source shows `(failed)`, note its `error` — a single failure is acceptable (the page degrades gracefully); investigate only if multiple fail.

- [ ] **Step 7: Commit (code only — generated data handled in Task 9)**

```bash
git add scripts/fetch.mjs test/buildLatest.test.mjs
git commit -m "feat: orchestrator assembles + validates + writes latest.json"
```

---

### Task 8: Frontend render helpers (`public/render.mjs`)

**Files:**
- Create: `public/render.mjs`
- Test: `test/render.test.mjs`

**Interfaces:**
- Consumes: nothing (pure, browser+node compatible ESM).
- Produces:
  - `escapeHtml(s) -> string`
  - `formatCount(n) -> string` (e.g. `18500 -> '18,500'`)
  - `itemMatches(item, query) -> boolean`
  - `filterItems(items, query) -> Array`
  - `cardHtml(item, sourceKey) -> string` (anchor card; omits desc line when empty; topics chips for `recentHighStars` only when desc empty)

- [ ] **Step 1: Write the failing test**

`test/render.test.mjs`:
```js
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

test('cardHtml shows topics chips only for recentHighStars with empty desc', () => {
  const out = cardHtml({ repo: 'a/b', url: 'https://x', desc: '', stars: 2907, lang: '', topics: ['ai', 'agent'] }, 'recentHighStars');
  assert.ok(out.includes('class="chip"') && out.includes('ai') && out.includes('agent'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`public/render.mjs`:
```js
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatCount(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

export function itemMatches(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const hay = [item.repo, item.name, item.title, item.desc].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

export function filterItems(items, query) {
  return items.filter((it) => itemMatches(it, query));
}

function langSpan(lang) {
  return lang ? `<span class="lang"><span class="dot"></span>${escapeHtml(lang)}</span>` : '';
}

export function cardHtml(item, sourceKey) {
  const title = escapeHtml(item.repo || item.name || item.title || '');
  const url = escapeHtml(item.url || '#');
  const desc = item.desc ? `<p class="desc">${escapeHtml(item.desc)}</p>` : '';
  let meta = '';
  if (sourceKey === 'githubTrending') {
    meta = `<div class="meta"><span class="stars">★ ${formatCount(item.stars)}</span>`
      + (item.todayStars ? `<span class="today">▲ ${formatCount(item.todayStars)}</span>` : '')
      + langSpan(item.lang) + `</div>`;
  } else if (sourceKey === 'recentHighStars') {
    const topics = (!item.desc && Array.isArray(item.topics) && item.topics.length)
      ? `<div class="topics">${item.topics.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    meta = `<div class="meta"><span class="stars">★ ${formatCount(item.stars)}</span>${langSpan(item.lang)}</div>${topics}`;
  } else if (sourceKey === 'helloGitHub') {
    meta = `<div class="meta">`
      + (item.category ? `<span class="chip">${escapeHtml(item.category)}</span>` : '')
      + langSpan(item.lang) + `</div>`;
  } else if (sourceKey === 'hnph') {
    meta = item.kind === 'hn'
      ? `<div class="meta"><span class="points">▲ ${formatCount(item.points)}</span><span class="comments">${formatCount(item.comments)} 评论</span></div>`
      : `<div class="meta"><span class="chip ph">Product Hunt</span></div>`;
  }
  return `<a class="card source-${sourceKey}" href="${url}" target="_blank" rel="noopener"><h3 class="title">${title}</h3>${desc}${meta}</a>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/render.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add public/render.mjs test/render.test.mjs
git commit -m "feat: pure frontend render helpers (browser+node ESM, tested)"
```

---

### Task 9: Frontend page — index.html, style.css, app.mjs (Bento Pop) + sample data

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.mjs`
- Create: `public/data/latest.json` (committed sample for offline/local dev; the Action overwrites it in CI)

**Interfaces:**
- Consumes: `cardHtml`, `filterItems` from `./render.mjs`; fetches `./data/latest.json`.
- Produces: a working static page. Verified manually in a browser.

**Visual fidelity:** Port the look from `docs/visual-reference-bento.html` (the approved mockup). Reuse its CSS for the bento grid, hard offset "sticker" shadows (grow on hover, snap inward on press), tab segmented control, search field, light/dark theme, and source color system. The starter `style.css` below establishes the tokens and core structure; copy the richer rules (hero tile, exact spacing, dark theme polish, focus-visible, reduced-motion) from the mockup, adapting selectors to the class names emitted by `render.mjs` (`.card`, `.title`, `.desc`, `.meta`, `.stars`, `.today`, `.lang .dot`, `.chip`, `.topics`, `.points`, `.comments`, `.source-<key>`).

- [ ] **Step 1: Create the sample data file**

`public/data/latest.json` (valid, lets the page render offline before any build):
```json
{
  "updatedAt": "2026-06-18T00:00:00Z",
  "sources": {
    "githubTrending": { "ok": true, "error": null, "items": [
      { "repo": "dolthub/dolt", "url": "https://github.com/dolthub/dolt", "desc": "像 Git 一样能版本控制的 SQL 数据库", "lang": "Go", "stars": 18500, "todayStars": 320 },
      { "repo": "gyroflow/gyroflow", "url": "https://github.com/gyroflow/gyroflow", "desc": "用陀螺仪数据做视频防抖", "lang": "Rust", "stars": 7200, "todayStars": 210 }
    ] },
    "recentHighStars": { "ok": true, "error": null, "items": [
      { "repo": "whichllm/whichllm", "url": "https://github.com/whichllm/whichllm", "desc": "按硬件挑最合适的本地 LLM", "lang": "Python", "stars": 4200, "topics": [] },
      { "repo": "FoundZiGu/GuJumpgate", "url": "https://github.com/FoundZiGu/GuJumpgate", "desc": "", "lang": "", "stars": 3902, "topics": ["ai", "agent", "llm"] }
    ] },
    "helloGitHub": { "ok": true, "error": null, "items": [
      { "name": "gittype", "url": "https://github.com/unhappychoice/gittype", "desc": "把代码变成打字游戏", "lang": "Rust", "category": "游戏" }
    ] },
    "hnph": { "ok": true, "error": null, "items": [
      { "kind": "hn", "title": "Show HN: Folo – an RSS reader", "url": "https://news.ycombinator.com/item?id=46033915", "points": 412, "comments": 156 },
      { "kind": "ph", "title": "Kami", "url": "https://www.producthunt.com/posts/kami", "desc": "AI 文档设计模板" }
    ] }
  }
}
```

- [ ] **Step 2: Create `public/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>今日有趣 · Trending Dashboard</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="topbar">
    <h1 class="brand">今日有趣 <span class="brand-en">Trending Dashboard</span></h1>
    <div class="controls">
      <input id="search" class="search" type="search" placeholder="搜索项目…" aria-label="搜索" />
      <button id="theme" class="theme-toggle" type="button" aria-label="切换明暗">◑</button>
    </div>
    <p class="updated">最后更新 <time id="updated">—</time></p>
  </header>

  <nav class="tabs" role="tablist">
    <button class="tab is-active" data-source="githubTrending" role="tab">GitHub Trending</button>
    <button class="tab" data-source="recentHighStars" role="tab">近期高星</button>
    <button class="tab" data-source="helloGitHub" role="tab">HelloGitHub</button>
    <button class="tab" data-source="hnph" role="tab">HN · PH</button>
  </nav>

  <main id="grid" class="bento" aria-live="polite">
    <p class="state">加载中…</p>
  </main>

  <script type="module" src="app.mjs"></script>
</body>
</html>
```

- [ ] **Step 3: Create `public/app.mjs`**

```js
import { cardHtml, filterItems } from './render.mjs';

const grid = document.getElementById('grid');
const searchEl = document.getElementById('search');
const updatedEl = document.getElementById('updated');
const tabs = [...document.querySelectorAll('.tab')];

let data = null;
let activeSource = 'githubTrending';

function render() {
  if (!data) return;
  const src = data.sources[activeSource];
  if (!src || src.ok === false) {
    grid.innerHTML = `<p class="state">本次未更新${src && src.error ? `（${src.error}）` : ''}</p>`;
    return;
  }
  const items = filterItems(src.items || [], searchEl.value.trim());
  grid.innerHTML = items.length
    ? items.map((it, i) => cardHtml(it, activeSource).replace('class="card', i === 0 ? 'class="card hero' : 'class="card')).join('')
    : `<p class="state">没有匹配的项目</p>`;
}

function setActive(source) {
  activeSource = source;
  tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.source === source));
  render();
}

tabs.forEach((t) => t.addEventListener('click', () => setActive(t.dataset.source)));
searchEl.addEventListener('input', render);

document.getElementById('theme').addEventListener('click', () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
});

fetch('./data/latest.json')
  .then((r) => r.json())
  .then((d) => {
    data = d;
    updatedEl.textContent = new Date(d.updatedAt).toLocaleString('zh-CN');
    render();
  })
  .catch((err) => { grid.innerHTML = `<p class="state">加载失败：${err.message}</p>`; });
```

- [ ] **Step 4: Create `public/style.css` (tokens + core; port richer rules from the mockup)**

```css
:root {
  --canvas: #f5efe3; --ink: #15130f; --ink-2: #5b554a; --surface: #fffdf7;
  --violet: #6a4cff; --amber: #c9851f; --magenta: #e5398f; --teal: #0f8f86; --fire: #e8512b;
  --radius: 16px; --shadow: 4px 4px 0 var(--ink); --shadow-lg: 7px 7px 0 var(--ink);
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s6: 24px; --s8: 32px;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
}
[data-theme="dark"] { --canvas: #15130f; --ink: #f5efe3; --ink-2: #b8b1a3; --surface: #211d16; --shadow: 4px 4px 0 #000; --shadow-lg: 7px 7px 0 #000; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--canvas); color: var(--ink); font-family: var(--font); font-variant-numeric: tabular-nums; }
.topbar { padding: var(--s6) var(--s6) var(--s3); display: flex; flex-wrap: wrap; gap: var(--s3); align-items: baseline; }
.brand { font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -.02em; }
.brand-en { font-size: 14px; color: var(--ink-2); font-weight: 600; }
.controls { margin-left: auto; display: flex; gap: var(--s2); }
.search { background: var(--surface); border: 2px solid var(--ink); border-radius: 999px; padding: var(--s2) var(--s4); font: inherit; box-shadow: var(--shadow); }
.search:focus-visible { outline: 3px solid var(--fire); outline-offset: 2px; }
.theme-toggle { border: 2px solid var(--ink); background: var(--surface); border-radius: 999px; width: 40px; cursor: pointer; box-shadow: var(--shadow); }
.updated { width: 100%; margin: 0; color: var(--ink-2); font-size: 12px; }
.tabs { display: flex; flex-wrap: wrap; gap: var(--s2); padding: 0 var(--s6) var(--s4); }
.tab { border: 2px solid var(--ink); background: var(--surface); border-radius: 999px; padding: var(--s2) var(--s4); font: inherit; font-weight: 700; cursor: pointer; transition: transform .12s, box-shadow .12s; }
.tab:hover { transform: translate(-1px,-1px); box-shadow: var(--shadow); }
.tab.is-active { background: var(--violet); color: #fff; box-shadow: var(--shadow); }
.bento { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--s4); padding: 0 var(--s6) var(--s8); }
.card { display: flex; flex-direction: column; gap: var(--s2); text-decoration: none; color: inherit; background: var(--surface); border: 2px solid var(--ink); border-radius: var(--radius); padding: var(--s4); box-shadow: var(--shadow); transition: transform .12s, box-shadow .12s; }
.card:hover { transform: translate(-2px,-2px); box-shadow: var(--shadow-lg); }
.card:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 var(--ink); }
.card:focus-visible { outline: 3px solid var(--fire); outline-offset: 2px; }
.card.hero { grid-column: span 2; background: var(--violet); color: #fff; }
.card.hero.source-recentHighStars { background: var(--amber); }
.card.hero.source-helloGitHub { background: var(--teal); color:#fff; }
.card.hero.source-hnph { background: var(--magenta); color: #fff; }
.title { margin: 0; font-size: 18px; font-weight: 800; }
.desc { margin: 0; color: var(--ink-2); font-size: 14px; }
.card.hero .desc { color: rgba(255,255,255,.9); }
.meta { display: flex; flex-wrap: wrap; gap: var(--s3); align-items: center; font-size: 13px; font-weight: 700; margin-top: auto; }
.stars { color: var(--amber); } .today { color: var(--fire); } .points { color: var(--fire); }
.lang .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--teal); margin-right: 4px; }
.chip { border: 1.5px solid currentColor; border-radius: 999px; padding: 1px var(--s2); font-size: 12px; }
.topics { display: flex; flex-wrap: wrap; gap: var(--s1); }
.state { padding: var(--s8); color: var(--ink-2); }
@media (max-width: 560px) { .bento { grid-template-columns: 1fr; } .card.hero { grid-column: span 1; } .topbar { padding: var(--s4); } }
@media (prefers-reduced-motion: reduce) { .card, .tab { transition: none; } }
```

- [ ] **Step 5: Manual verification**

Run: `open public/index.html` (macOS).
Verify:
1. Page loads with the sample data, header shows "最后更新 …".
2. All four tabs switch content; the first card of each tab is a colored hero tile.
3. Search filters cards live; clearing restores them.
4. The `FoundZiGu/GuJumpgate` card (empty desc) shows topic chips and **no** empty description line.
5. Theme toggle flips light/dark; contrast stays readable.
6. Resize to ~375px: grid collapses to one column, hero spans one column.
7. Cards open their URL in a new tab.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS (render + all prior tests).

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/style.css public/app.mjs public/data/latest.json
git commit -m "feat: Bento Pop frontend wired to latest.json + offline sample data"
```

---

### Task 10: GitHub Action + README (scheduling, Pages deploy, setup docs)

**Files:**
- Create: `.github/workflows/update.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `npm ci`, `npm run build`, `public/` artifact.
- Produces: a daily-scheduled + manually-dispatchable workflow that builds data and deploys `public/` to GitHub Pages.

- [ ] **Step 1: Create the workflow**

`.github/workflows/update.yml`:
```yaml
name: Update & Deploy
on:
  schedule:
    - cron: '0 0 * * *'   # daily 00:00 UTC = 08:00 Asia/Shanghai
  workflow_dispatch: {}
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: public
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Create the README with one-time setup steps**

`README.md`:
````markdown
# 今日有趣 · Trending Dashboard

自动更新的榜单：聚合 GitHub Trending、近期高星、HelloGitHub、HN · PH，每天 08:00（北京时间）刷新并部署到 GitHub Pages。

## 本地开发
```bash
npm install
npm test        # 运行单元测试
npm run build   # 抓取四个源，生成 public/data/latest.json
open public/index.html
```

## 一次性上线设置（GitHub）
1. 在 GitHub 新建空仓库 `trending-dashboard`。
2. 关联并推送本地仓库：
   ```bash
   git remote add origin git@github.com:<你的用户名>/trending-dashboard.git
   git push -u origin main
   ```
3. 仓库 **Settings → Pages → Build and deployment → Source: GitHub Actions**。
4. **Actions** 标签 → 选择 "Update & Deploy" → **Run workflow** 跑第一次（或等每天 08:00 自动触发）。
5. 部署完成后访问 `https://<你的用户名>.github.io/trending-dashboard/`。

## 数据源
| Tab | 来源 | 说明 |
|---|---|---|
| GitHub Trending | 抓取 github.com/trending | 每日，全语言，前 25 |
| 近期高星 | GitHub Search API | 近 30 天创建、按 star 排序，前 25 |
| HelloGitHub | hellogithub.com RSS | 前 15 |
| HN · PH | HN Firebase API + PH RSS | HN 12 + PH 6（PH 暂无票数） |
````

- [ ] **Step 3: Validate the workflow YAML**

Run: `node -e "const y=require('node:fs').readFileSync('.github/workflows/update.yml','utf8'); if(!/cron: '0 0 \* \* \*'/.test(y)) throw new Error('cron missing'); console.log('cron + structure OK')"`
Expected: prints `cron + structure OK`. (Full validation happens on first push when GitHub parses the workflow.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/update.yml README.md
git commit -m "ci: daily build + GitHub Pages deploy; add README setup docs"
```

---

### Task 11: Final verification & handoff

**Files:** none (verification only).

- [ ] **Step 1: Full suite + build, green**

Run: `npm test && npm run build`
Expected: all tests pass; `latest.json` regenerated with ≥3 of 4 sources populated.

- [ ] **Step 2: Manual page check against fresh data**

Run: `open public/index.html`
Expected: page reflects the freshly built `latest.json`; all 7 checks from Task 9 Step 5 still pass.

- [ ] **Step 3: Confirm the user-facing setup path**

Re-read `README.md` "一次性上线设置" and confirm each command is runnable as written for the user's GitHub account. (Deployment itself is performed by the user — `gh` CLI is not installed locally.)

- [ ] **Step 4: Final commit if anything changed**

```bash
git add -A
git commit -m "chore: final verification pass" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Network in tests:** every source's pure parser/mapper is tested against fixtures with an injected `fetchImpl`; **no test hits the network**. Only `npm run build` (Task 7 Step 6, Task 11) makes real requests.
- **A failing source is not a failing build:** `Promise.allSettled` + per-source `{ok,error}` means one dead source degrades to a "本次未更新" tab. Only treat the build as broken if `validateLatest` returns errors or multiple sources fail.
- **HelloGitHub spike (Task 6 Step 1) is mandatory before trusting that source** — adjust the parser to the real feed shape if it differs from the fixture.
- **Frontend visual fidelity:** the starter `style.css` is intentionally minimal-but-real; richer Bento Pop details (hero layout, dark-theme polish) come from `docs/visual-reference-bento.html`. Do not ship the generic starter as final — match the mockup.
