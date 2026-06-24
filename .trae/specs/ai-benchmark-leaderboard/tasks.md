# Tasks

- [x] Task 1-8: 17 个榜单、每榜 30 行（已完成）

- [x] Task 9: Vercel 部署 + iPhone 移动端支持
  - [x] SubTask 9.1: 抽取 fetch_leaderboards.py 为可复用模块（build_payload）
  - [x] SubTask 9.2: 新增 `api/leaderboard.py` 与 `api/refresh.py` serverless 端点
  - [x] SubTask 9.3: 新增 `vercel.json` 路由配置
  - [x] SubTask 9.4: `src/app.js` 优先 `/api/leaderboard`，回退静态 JSON
  - [x] SubTask 9.5: `index.html` 增加 iOS PWA meta（apple-mobile-web-app-capable 等）
  - [x] SubTask 9.6: `README.md` 部署说明（Vercel 一键）
  - [x] SubTask 9.7: 本地验证（HTML 200、JSON 200、CLI 抓取 17 榜 510 行）

# Task Dependencies
- Task 9 depends on Task 8
