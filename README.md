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
