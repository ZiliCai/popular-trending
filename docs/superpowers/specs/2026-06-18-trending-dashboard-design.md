# Trending Dashboard — Design Spec

- **Date:** 2026-06-18
- **Status:** Draft for user review
- **Repo name (tentative):** `trending-dashboard`
- **Page title (tentative):** 今日有趣 · Trending Dashboard

## 1. Overview

A self-updating single-page web dashboard that aggregates interesting & trending
GitHub / tech projects from four sources into one interface. A scheduled GitHub
Action regenerates the data once a day and deploys the static page to GitHub
Pages, so the榜单 stays fresh with zero manual work and is reachable from any
device via a public URL.

The visual direction is the **"Bento Pop"** mockup selected during brainstorming
(see `docs/visual-reference-bento.html`).

## 2. Goals

- Aggregate 4 sources into one page: **GitHub Trending**, **近期高星 (recent
  high-stars)**, **HelloGitHub (有趣项目)**, **HN · PH**.
- Refresh automatically **once per day** with no manual steps.
- Look genuinely good (Bento Pop direction), not templated.
- Free to run and host (GitHub Actions + GitHub Pages).
- Resilient: one failing source must not break the page.
- Mobile-friendly (usable at 375px wide).

## 3. Non-goals (v1 — explicitly out of scope)

- Historical trends / 24h star-delta / rank-change tracking.
- Email or RSS output.
- Product Hunt official GraphQL API (OAuth). v1 uses PH RSS.
- Weekly/monthly toggle, multi-language UI, user accounts, server/database.

## 4. Architecture

Static site + scheduled build. No runtime server.

```
GitHub Actions (cron: daily 00:00 UTC = 08:00 Asia/Shanghai)
  └─ node scripts/fetch.mjs
        ├─ sources/githubTrending.mjs   (scrape github.com/trending)
        ├─ sources/recentHighStars.mjs  (GitHub Search API)
        ├─ sources/helloGitHub.mjs      (RSS / monthly volume)
        └─ sources/hnph.mjs             (HN Firebase API + PH RSS)
        → normalize → write public/data/latest.json
  └─ upload public/ as Pages artifact → deploy to GitHub Pages
        → https://<user>.github.io/trending-dashboard/
```

The browser loads `public/index.html`, which fetches `data/latest.json` at page
load and renders the four tabs. The page is pure static assets — no build step
for the frontend.

## 5. Data sources

Each source is an isolated module exposing a uniform interface:

```js
// returns { items: NormalizedItem[], ok: boolean, error?: string }
export async function fetch(ctx) { ... }
```

The orchestrator runs all four with `Promise.allSettled` so a single failure is
contained.

### 5.1 GitHub Trending — `sources/githubTrending.mjs`
- **Method:** scrape `https://github.com/trending?since=daily` (all languages),
  parse with `cheerio`. Server-side fetch, so no CORS issue.
- **Per row (`article.Box-row`):** repo full name, description, language,
  total stars, "stars today".
- **Count:** top ~25.
- **Risk:** GitHub may change the trending HTML → parser breaks. Mitigated by
  isolating the parser and covering it with a saved-HTML fixture test.

### 5.2 近期高星 — `sources/recentHighStars.mjs`
- **Method:** GitHub Search REST API:
  `GET /search/repositories?q=created:>=<today-30d>&sort=stars&order=desc&per_page=25`.
- **Auth:** use the Actions-provided `GITHUB_TOKEN` env var to raise rate limits
  (search is 10 req/min unauthenticated). One request per run.
- **Fields:** `full_name`, `html_url`, `description`, `stargazers_count`,
  `language`, `created_at`.

### 5.3 HelloGitHub — `sources/helloGitHub.mjs`
- **Primary method:** fetch the HelloGitHub RSS feed (`https://hellogithub.com/rss`)
  and parse items (title, link, description).
- **Open question / spike:** RSS items may link to hellogithub.com article pages
  rather than directly to the GitHub repo, and may not expose category/language.
  **Implementation must begin with a short spike** to confirm the best access
  path; fallback is scraping the latest monthly volume page
  (`/periodical/volume/<N>`) for project name + GitHub url + category.
- **Count:** ~15.

### 5.4 HN · PH — `sources/hnph.mjs`
- **Hacker News:** official Firebase API — `GET /v0/topstories.json` for ids,
  then `GET /v0/item/<id>.json` for the top ~12 (title, url, score=points,
  descendants=comments). No auth.
- **Product Hunt:** RSS feed (`https://www.producthunt.com/feed`), top ~6
  (title, tagline, link). **Vote counts are not reliably available via RSS and
  may be omitted in v1.**

## 6. Data schema — `public/data/latest.json`

```json
{
  "updatedAt": "2026-06-18T00:00:00Z",
  "sources": {
    "githubTrending": {
      "ok": true, "error": null,
      "items": [
        { "repo": "owner/name", "url": "https://...", "desc": "…",
          "lang": "Go", "stars": 18500, "todayStars": 320 }
      ]
    },
    "recentHighStars": {
      "ok": true, "error": null,
      "items": [
        { "repo": "owner/name", "url": "https://...", "desc": "…",
          "lang": "Python", "stars": 4200 }
      ]
    },
    "helloGitHub": {
      "ok": true, "error": null,
      "items": [
        { "name": "gittype", "url": "https://...", "desc": "…",
          "lang": "Rust", "category": "游戏" }
      ]
    },
    "hnph": {
      "ok": true, "error": null,
      "items": [
        { "kind": "hn", "title": "…", "url": "https://...",
          "points": 412, "comments": 156 },
        { "kind": "ph", "title": "Kami", "url": "https://...",
          "desc": "…", "votes": 640 }
      ]
    }
  }
}
```

Per-source `ok`/`error` lets the frontend show a small "本次未更新" badge on a
tab whose fetch failed, without breaking the rest of the page.

## 7. Frontend (visual: Bento Pop)

Canonical look = `docs/visual-reference-bento.html`. The implementation ports
that mockup's CSS/JS into real assets and wires them to `data/latest.json`
instead of the embedded sample.

- **Files:** `public/index.html`, `public/style.css`, `public/app.js`.
- **Layout:** bento grid; the top item per active tab gets a hero tile flooded
  in that source's signature color; remaining items in varying-size tiles.
- **Palette:** cream canvas + near-black ink (AA), four source colors
  (electric violet / burnt amber / hot magenta / deep teal) + vermilion fire
  accent; full dark theme via `data-theme`.
- **Signature:** hard offset "sticker" shadows (no blur) that grow on hover and
  snap inward on press; big tabular-figure numbers for the data.
- **Components:** 4-tab segmented nav (GitHub Trending / 近期高星 / HelloGitHub /
  HN · PH), live search box filtering visible tiles, light/dark toggle,
  "最后更新 <time>" in the header.
- **Behavior:** tab switch + search are vanilla JS over the loaded JSON; cards
  link out (`target="_blank" rel="noopener"`).
- **Responsive:** tiles collapse to a single column at 375px.
- **A11y:** `:focus-visible` states, AA contrast, `prefers-reduced-motion`
  disables the shadow/scale transitions.
- **Loading/empty/error states:** skeleton or "加载中…" before JSON resolves; a
  per-tab "本次未更新" notice when `sources.<x>.ok === false`.

## 8. Repository structure

```
trending-dashboard/
  public/
    index.html
    style.css
    app.js
    data/latest.json          # generated by the Action
  scripts/
    fetch.mjs                 # orchestrator
    normalize.mjs             # shared helpers + schema constants
    sources/
      githubTrending.mjs
      recentHighStars.mjs
      helloGitHub.mjs
      hnph.mjs
  test/
    githubTrending.test.mjs   # parser test against saved HTML fixture
    hnph.test.mjs
    schema.test.mjs           # validates generated JSON shape
    fixtures/
  .github/workflows/update.yml
  package.json
  README.md
  docs/
    visual-reference-bento.html
    superpowers/specs/2026-06-18-trending-dashboard-design.md
```

- **Dependencies (kept minimal):** `cheerio` (HTML parse). RSS parsed with a
  small XML parser (`fast-xml-parser`) or a hand-rolled regex for the few fields
  needed. Tests use the built-in `node:test` runner (no extra dep).
- **Node:** ESM (`.mjs`), Node 20+ (CI uses `actions/setup-node`).

## 9. CI / scheduling — `.github/workflows/update.yml`

- **Triggers:** `schedule: cron '0 0 * * *'` (daily 00:00 UTC = 08:00 CST) +
  `workflow_dispatch` (manual run button).
- **Steps:** checkout → setup-node → `npm ci` → `node scripts/fetch.mjs`
  (with `GITHUB_TOKEN` in env) → `actions/upload-pages-artifact` on `public/` →
  `actions/deploy-pages`.
- **Permissions:** `pages: write`, `id-token: write`, `contents: read`.
- v1 deploys the artifact directly (no commit of generated data). Keeping a git
  history of `latest.json` is a possible future nicety, not v1.

## 10. Deployment (one-time manual setup)

`gh` CLI is not installed, so the user does the GitHub side by hand:
1. Create an empty GitHub repo `trending-dashboard`.
2. Push the local project (Claude provides the exact commands).
3. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. First run via the workflow's "Run workflow" button (or wait for the cron).

## 11. Testing strategy

- **Per-source parsers:** unit tests against saved fixtures (no live network in
  CI) asserting the normalized shape — especially the Trending scraper.
- **Schema test:** validate a generated `latest.json` against the expected shape;
  fails the build on drift.
- **Manual:** open the deployed page, switch tabs, search, toggle theme, check
  375px width.
- Built with TDD where practical (write the normalizer test from a fixture, then
  the parser).

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| GitHub Trending HTML changes → scraper breaks | Isolated parser + fixture test; clear failure logged; page still renders other 3 sources |
| HelloGitHub access path uncertain | Start implementation with a short spike; RSS primary, volume-page scrape fallback |
| PH votes unavailable via RSS | Show PH items without votes in v1; note as known limitation |
| Search API rate limit | Use Actions `GITHUB_TOKEN`; one request per run |
| Pages setup is manual | Documented step-by-step; `workflow_dispatch` for first run |

## 13. Open questions (confirm during review)

1. Repo name `trending-dashboard` and page title "今日有趣 · Trending Dashboard"
   — OK, or prefer something else?
2. Daily refresh at 08:00 CST — confirmed? (More frequent is possible.)
3. PH via RSS (votes possibly omitted) — acceptable for v1?
4. Per-source item counts (Trending 25 / 近期高星 25 / HelloGitHub 15 / HN 12 /
   PH 6) — reasonable defaults?
