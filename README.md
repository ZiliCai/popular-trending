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
仓库：`ZiliCai/popular-trending`
1. 关联并推送本地仓库：
   ```bash
   git remote add origin https://github.com/ZiliCai/popular-trending.git
   git push -u origin main
   ```
2. 仓库 **Settings → Pages → Build and deployment → Source: GitHub Actions**。
3. 推送会自动触发 `Update & Deploy`（也支持每天 08:00 定时与手动 Run workflow）。首次若因 Pages 尚未启用而失败，启用后到 **Actions → Run workflow** 重跑一次即可。
4. 部署完成后访问 `https://ZiliCai.github.io/popular-trending/`。

## 数据源
| Tab | 来源 | 说明 |
|---|---|---|
| GitHub Trending | 抓取 github.com/trending | 每日，全语言，前 25 |
| 近期高星 | GitHub Search API | 近 30 天创建、按 star 排序，前 25 |
| HelloGitHub | hellogithub.com RSS | 前 15 |
| HN · PH | HN Firebase API + PH RSS | HN 12 + PH 6（PH 暂无票数） |
