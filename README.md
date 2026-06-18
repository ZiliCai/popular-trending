# 今日有趣 · Trending Dashboard

自动更新的榜单：聚合 GitHub Trending、近期高星、HelloGitHub、HN · PH，每天 08:00（北京时间）刷新并部署到 GitHub Pages。

> 界面默认中文，右上角「中文 / 原文」可一键切回英文原文。英文简介在构建时自动转为中文；若配置了 DeepSeek（见下），还会改写成"大白话"并过滤掉小众科研代码。

## 本地开发
```bash
npm install
npm test        # 运行单元测试
npm run build   # 抓取四个源，生成 public/data/latest.json
open public/index.html
```

## 一次性上线设置（GitHub）
仓库：`ZiliCai/popular-trending`
1. 关联并推送本地仓库：
   ```bash
   git remote add origin https://github.com/ZiliCai/popular-trending.git
   git push -u origin main
   ```
2. 仓库 **Settings → Pages → Build and deployment → Source: GitHub Actions**。
3. 推送会自动触发 `Update & Deploy`（也支持每天 08:00 定时与手动 Run workflow）。首次若因 Pages 尚未启用而失败，启用后到 **Actions → Run workflow** 重跑一次即可。
4. 部署完成后访问 `https://ZiliCai.github.io/popular-trending/`。

## 可选：大白话改写 + 过滤（DeepSeek）
默认用免费接口直译英文简介。配置 DeepSeek 后，构建时会把简介改写成"大白话"中文，并过滤掉小众 / 科研类项目（仅作用于 GitHub Trending 与近期高星）。
1. 在 [platform.deepseek.com](https://platform.deepseek.com) 申请 API key。
2. 仓库 **Settings → Secrets and variables → Actions → New repository secret**，名字填 `DEEPSEEK_API_KEY`，值填你的 key。
3. 下次构建（push / 每天 08:00 / 手动 Run workflow）即自动启用；失败会优雅回退到直译，不影响出榜。

## 数据源
| Tab | 来源 | 说明 |
|---|---|---|
| GitHub Trending | 抓取 github.com/trending | 每日，全语言，前 25 |
| 近期高星 | GitHub Search API | 近 30 天创建、按 star 排序，前 25 |
| HelloGitHub | api.hellogithub.com 官方 API | 前 15（项目级，中文简介） |
| HN · PH | HN Firebase API + PH RSS | HN 12 + PH 6（PH 暂无票数） |
