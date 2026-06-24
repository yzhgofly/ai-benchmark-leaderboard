# Checklist

- [x] `data/benchmarks.json` 包含 17 个榜单、每榜 30 行
- [x] 每次打开页面看到"生成于 X · 数据源 3/3 成功"或具体成功数
- [x] iPhone Safari 可"添加到主屏幕"，桌面图标正确
- [x] `vercel.json` 路由配置正确（API + 静态资源 + fallback）
- [x] `api/leaderboard.py` 调用 `build_payload()` 直接返回 JSON（不写 fs）
- [x] `src/app.js` 优先 `/api/leaderboard`，失败回退 `data/benchmarks.json`
- [x] `README.md` 含 Vercel 一键部署步骤
- [x] 本地 CLI 抓取成功（17 榜 510 行）
