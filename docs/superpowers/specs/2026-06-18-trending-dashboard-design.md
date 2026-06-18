# Trending Dashboard — 设计文档(Design Spec)

- **日期:** 2026-06-18
- **状态:** 草案,待用户最终确认
- **仓库名(暂定):** `trending-dashboard`
- **页面标题(暂定):** 今日有趣 · Trending Dashboard

## 1. 概述

一个**会自动更新**的单页 Web 榜单,把四个来源的"有趣 / 热门" GitHub 与科技
项目聚合到同一个界面。由一个定时的 GitHub Action 每天重新抓取数据,并把静态
页面部署到 GitHub Pages —— 榜单零人工维护就能保持新鲜,任何设备都能通过一个
公开网址访问。

视觉方向采用头脑风暴中选定的 **"Bento Pop"** 方案(见
`docs/visual-reference-bento.html`)。

## 2. 目标

- 把 4 个源聚合到一页:**GitHub Trending**、**近期高星**、
  **HelloGitHub(有趣项目)**、**HN · PH**。
- **每天自动刷新一次**,无需任何手动步骤。
- 界面要真好看(Bento Pop 方向),不像模板。
- 完全免费运行与托管(GitHub Actions + GitHub Pages)。
- 容错:任何一个源失败都不能让整页崩掉。
- 移动端友好(375px 宽度可用)。

## 3. 非目标(v1 明确不做)

- 历史趋势 / 24 小时涨星 / 排名变化追踪。
- 邮件或 RSS 输出。
- Product Hunt 官方 GraphQL API(需 OAuth)。**v1 用 PH 的 RSS;官方 API 作为
  后续升级**。
- 周榜/月榜切换、多语言界面、用户账号、服务器/数据库。

## 4. 架构

静态站点 + 定时构建,无运行时服务器。

```
GitHub Actions(cron:每天 00:00 UTC = 北京时间 08:00)
  └─ node scripts/fetch.mjs
        ├─ sources/githubTrending.mjs   (抓取 github.com/trending)
        ├─ sources/recentHighStars.mjs  (GitHub Search API)
        ├─ sources/helloGitHub.mjs      (RSS / 月刊页)
        └─ sources/hnph.mjs             (HN Firebase API + PH RSS)
        → 归一化 → 写出 public/data/latest.json
  └─ 把 public/ 作为 Pages 制品上传 → 部署到 GitHub Pages
        → https://<用户名>.github.io/trending-dashboard/
```

浏览器加载 `public/index.html`,在页面加载时拉取 `data/latest.json` 并渲染四个
tab。页面是纯静态资源,前端**无构建步骤**。

## 5. 数据源

每个源是一个独立模块,暴露统一接口:

```js
// 返回 { items: NormalizedItem[], ok: boolean, error?: string }
export async function fetch(ctx) { ... }
```

编排器用 `Promise.allSettled` 跑这四个,任何单点失败都被隔离。

### 5.1 GitHub Trending — `sources/githubTrending.mjs`
- **方式:** 抓取 `https://github.com/trending?since=daily`(全语言),用
  `cheerio` 解析。服务端抓取,无 CORS 问题。
- **每行(`article.Box-row`):** 仓库全名、描述、语言、总 star 数、"今日 star"。
- **数量:** 约前 25 条。
- **风险:** GitHub 可能改动 trending 页结构 → 解析失效。缓解:解析逻辑独立,
  并用一份保存的 HTML 固定样本(fixture)做测试覆盖。

### 5.2 近期高星 — `sources/recentHighStars.mjs`
- **方式:** GitHub Search REST API:
  `GET /search/repositories?q=created:>=<今天-30天>&sort=stars&order=desc&per_page=25`。
- **鉴权:** 使用 Actions 自带的 `GITHUB_TOKEN` 环境变量提升额度(搜索接口未鉴权
  时为 10 次/分钟)。每次运行只请求 1 次。
- **字段:** `full_name`、`html_url`、`description`、`stargazers_count`、
  `language`、`created_at`。

### 5.3 HelloGitHub — `sources/helloGitHub.mjs`
- **方式:** 调官方项目级 API `https://api.hellogithub.com/v1/`,返回 JSON
  `{ success, page, has_more, data: [...] }`,每条含 `full_name`(owner/repo)、
  `title`(中文简介)、`primary_lang`(语言)等。
- **映射:** `name = full_name`、`url = https://github.com/<full_name>`、
  `desc = title || summary`(**中文**,这是 HelloGitHub 的价值)、`lang = primary_lang`。
- **为什么不用 RSS:** `https://hellogithub.com/rss` 实测是**月刊期号**订阅源(122 条
  全是「第 N 期」→ `/periodical/volume/N`),不是项目级数据,故弃用。
- **数量:** 前 15 条(API 每页 20)。

### 5.4 HN · PH — `sources/hnph.mjs`
- **Hacker News:** 官方 Firebase API —— `GET /v0/topstories.json` 拿 id 列表,
  再 `GET /v0/item/<id>.json` 取前约 12 条(标题、url、score=点数、
  descendants=评论数)。无需鉴权。
- **Product Hunt:** **RSS 源**(`https://www.producthunt.com/feed`),取前约 6 条
  (标题、简介、链接)。**RSS 通常不带票数(votes),v1 暂不显示票数;后续可升级
  官方 API 补上**(官方 API 非商业用途免费,需注册应用拿 token)。

## 6. 数据结构 — `public/data/latest.json`

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
          "desc": "…" }
      ]
    }
  }
}
```

每个源带 `ok`/`error`,这样前端可以在某个抓取失败的 tab 上显示一个小小的
"本次未更新"标记,而不影响其它部分。(PH 走 RSS 时,条目不含 `votes` 字段。)

## 7. 前端(视觉:Bento Pop)

最终视觉以 `docs/visual-reference-bento.html` 为准。实现时把这份样稿的 CSS/JS
落成正式资源文件,并改为读取 `data/latest.json`,而非内嵌的示例数据。

- **文件:** `public/index.html`、`public/style.css`、`public/app.js`。
- **布局:** bento 网格;当前 tab 的第一条用一个灌满该源主题色的 hero 大块,其余
  用大小不一的方块。
- **配色:** 奶油底 + 近黑墨字(AA 对比),四个源各占一色(电光紫 / 焦糖琥珀 /
  品红 / 深青)+ 朱红火焰强调色;通过 `data-theme` 提供完整暗色主题。
- **标志性细节:** 硬质偏移"贴纸阴影"(无模糊),悬停时变大、按下时内缩;数据用
  大号等宽数字(tabular figures)。
- **组件:** 4 个 tab 的分段导航(GitHub Trending / 近期高星 / HelloGitHub /
  HN · PH)、实时过滤可见方块的搜索框、明暗切换、页头的"最后更新 <时间>"。
- **行为:** 切换 tab、搜索均为原生 JS 操作已加载的 JSON;卡片外链
  (`target="_blank" rel="noopener"`)。
- **响应式:** 375px 宽度时方块塌缩为单列。
- **无障碍:** `:focus-visible` 焦点态、AA 对比、`prefers-reduced-motion` 时关闭
  阴影/缩放过渡。
- **加载/空/错误态:** JSON 解析前显示骨架屏或"加载中…";当
  `sources.<x>.ok === false` 时,该 tab 显示"本次未更新"提示。

## 8. 仓库结构

```
trending-dashboard/
  public/
    index.html
    style.css
    app.js
    data/latest.json          # 由 Action 生成
  scripts/
    fetch.mjs                 # 编排器
    normalize.mjs             # 公共辅助函数 + schema 常量
    sources/
      githubTrending.mjs
      recentHighStars.mjs
      helloGitHub.mjs
      hnph.mjs
  test/
    githubTrending.test.mjs   # 用保存的 HTML 固定样本测试解析
    hnph.test.mjs
    schema.test.mjs           # 校验生成的 JSON 结构
    fixtures/
  .github/workflows/update.yml
  package.json
  README.md
  docs/
    visual-reference-bento.html
    superpowers/specs/2026-06-18-trending-dashboard-design.md
```

- **依赖(尽量精简):** `cheerio`(解析 HTML)。RSS 用一个小型 XML 解析器
  (`fast-xml-parser`),或针对需要的少数字段手写解析。测试用内置的 `node:test`
  (无额外依赖)。
- **Node:** ESM(`.mjs`),Node 20+(CI 用 `actions/setup-node`)。

## 9. CI / 定时 — `.github/workflows/update.yml`

- **触发:** `schedule: cron '0 0 * * *'`(每天 00:00 UTC = 北京时间 08:00)+
  `workflow_dispatch`(手动运行按钮)。
- **步骤:** checkout → setup-node → `npm ci` → `node scripts/fetch.mjs`
  (env 里带 `GITHUB_TOKEN`)→ `actions/upload-pages-artifact`(目标 `public/`)
  → `actions/deploy-pages`。
- **权限:** `pages: write`、`id-token: write`、`contents: read`。
- v1 直接部署制品(不把生成的数据提交回仓库)。保留 `latest.json` 的 git 历史
  是将来可加的小功能,非 v1 必需。

## 10. 部署(一次性手动设置)

由于未安装 `gh` CLI,GitHub 那侧由用户手动完成:
1. 在 GitHub 上新建空仓库 `trending-dashboard`。
2. 把本地项目推上去(Claude 会给出确切命令)。
3. 仓库 **Settings → Pages → Build and deployment → Source: GitHub Actions**。
4. 用工作流的 "Run workflow" 按钮跑第一次(或等定时触发)。

## 11. 测试策略

- **各源解析器:** 针对保存的固定样本做单元测试(CI 中不依赖实时网络),断言
  归一化后的结构 —— 尤其是 Trending 解析器。
- **schema 测试:** 校验生成的 `latest.json` 是否符合预期结构;结构漂移则构建失败。
- **手动:** 打开已部署页面,切 tab、搜索、明暗切换,检查 375px 宽度。
- 在可行处采用 TDD(先从固定样本写归一化测试,再写解析器)。

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| GitHub Trending 页面结构变动 → 解析失效 | 解析器独立 + 固定样本测试;失败清晰记录;整页仍渲染其它 3 个源 |
| HelloGitHub 取数路径不确定 | 实现先做小 spike;RSS 为主,月刊页抓取为备 |
| PH 走 RSS 拿不到票数 | v1 PH 卡片不显示票数;记为已知限制,后续官方 API 补上 |
| Search API 额度限制 | 用 Actions `GITHUB_TOKEN`;每次运行只请求 1 次 |
| Pages 设置需手动 | 提供逐步说明;`workflow_dispatch` 用于首跑 |

## 13. 数据质量与边界情况

### 13.1 缺少简介
- **归一化:** 取不到 description 时设为空字符串,不报错。
- **前端:** 不渲染简介行;Bento 方块在有/无简介时都保持版式完整,不留空洞;
  **不显示"暂无简介"之类的占位文字**。
- HN 条目本来就只有标题、没有简介,属正常情况。
- **不按"有无简介"过滤仓库。** 依据(实测):GitHub Search API 会返回
  `description: null` 的高星仓库(如 `FoundZiGu/GuJumpgate` 3,902⭐、
  `MisoLabsAI/MisoTTS` 2,907⭐),按简介过滤会误伤好项目。同类项目
  (`huchenme/github-trending-api`、`bonfy/github-trending`、`EvanLi/Github-Ranking`)
  也都**不按简介过滤**,只是展示难看(留字面 `None` 或孤零零的冒号);我们取其
  "保留仓库"、但展示更干净(省略整行)。
- **hypothesis 备注:** "无简介 ⇒ 低星 ⇒ 自然被过滤" 仅对 **Trending 页成立**
  (实测前 20 名 0 个无简介),对 **近期高星(Search API)不成立**,故仍需优雅
  处理而非依赖过滤。
- **topics 兜底(v1,仅"近期高星"源):** 该源用 Search API,本就返回 `topics`;当
  高星仓库无简介时,用 topics 小 chip 补一行,避免空卡。Trending 源不返回 topics
  且实测基本都有简介,无需处理。

### 13.2 语言(构建时翻译 + 中英切换)
> 决定更新(用户反馈"全是英文看不懂"):v1 改为**翻译 + 可切换**,不再"保持原文"。
- **构建时翻译:** 每天构建时把英文简介翻成中文(`scripts/translate.mjs`,免费
  Google `gtx` 端点,**无需密钥**),结果以 `descZh` / `titleZh` 字段存进
  `latest.json`。任一翻译失败时**优雅回退为原文**,绝不阻断构建。HelloGitHub 已是
  中文,`isChinese()` 自动跳过。
- **项目名 / 仓库名 / 作者名永不翻译**(如 `dolthub/dolt` 保持原样)。
- **前端「中文 / 原文」开关:** 顶部一键切换,默认中文,选择存 `localStorage`;
  渲染时 `descZh`/`titleZh` 存在且为中文模式则用译文,否则用原文。
- **后续可升级:** 若要更高的术语翻译质量,可改用 LLM(Claude API)翻译,代价是需要
  Anthropic API key + 一个 GitHub Secret + 每天约几分钱。

## 14. 待确认项(请在评审时拍板)

1. 仓库名 `trending-dashboard`、页面标题"今日有趣 · Trending Dashboard"
   —— 可以吗,还是想换别的?
2. 每天北京时间 08:00 刷新一次 —— 够吗?(可以更频繁。)
3. ~~PH 取数方式~~ —— **已定:v1 用 RSS,后续升级官方 API。**
4. 每源条数(Trending 25 / 近期高星 25 / HelloGitHub 15 / HN 12 / PH 6)
   —— 默认合理吗?
