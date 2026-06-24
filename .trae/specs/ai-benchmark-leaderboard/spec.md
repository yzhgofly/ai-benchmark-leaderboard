# AI 大模型基准测试榜单显示板 Spec

## Why
需要一个统一的视图来快速浏览所有主流 AI 大模型在各类基准测试（Benchmark）上的 Top 30 排名表现。数据必须为真实公开榜单的最新版，每个基准都展示完整的 30 行。**需要支持在 iPhone 等移动设备随时随地查看**，故部署到 Vercel 并提供 serverless API 让前端永远拿到最新数据。

## What Changes
- `data/benchmarks.json` 由 Python 抓取脚本 `scripts/fetch_leaderboards.py` 生成。
- 新增 Vercel 部署：
  - `vercel.json` 路由配置（静态资源 + `/api/*` serverless）
  - `api/leaderboard.py` — 实时抓取并返回 JSON
  - `api/refresh.py` — 部署后健康检查
- 前端 `src/app.js` 优先调用 `/api/leaderboard`，失败时回退 `data/benchmarks.json`，从而**本地 + 部署**一套代码。
- 页面 `<head>` 增加 iOS PWA meta（apple-mobile-web-app-capable 等），iPhone Safari 可"添加到主屏幕"作为 App 图标。
- 新增 `README.md` 部署说明（一键 Vercel Deploy）。

## Impact
- 受影响代码：`vercel.json`、`api/leaderboard.py`、`api/refresh.py`、`src/app.js`、`index.html`、`README.md`

## ADDED Requirements

### Requirement: Vercel 一键部署
系统 SHALL 支持 Vercel 部署：仓库推到 GitHub 后 vercel.com 一键 Deploy 即可访问。

#### Scenario: 部署成功
- **WHEN** 用户在 Vercel 部署此项目
- **THEN** 静态资源（HTML/CSS/JS/JSON）从 CDN 加载；`/api/leaderboard` 返回实时抓取的 JSON

### Requirement: Serverless 实时数据
系统 SHALL 在 Vercel 部署时通过 `/api/leaderboard` serverless 函数返回最新数据，避免静态 JSON 过期。

#### Scenario: 浏览器请求数据
- **WHEN** 浏览器加载 `index.html`
- **THEN** 优先 `fetch('api/leaderboard')`，失败回退 `data/benchmarks.json`

### Requirement: iOS PWA 友好
系统 SHALL 主页 `<head>` 包含 PWA meta，使得 iPhone Safari 可"添加到主屏幕"作为 App 图标。

#### Scenario: 桌面图标
- **WHEN** iPhone Safari 用户点击分享 → 添加到主屏幕
- **THEN** 桌面上出现一个独立图标，点击进入全屏 Web App

## MODIFIED Requirements

### Requirement: 真实数据抓取脚本
系统 SHALL 提供一个 Python 脚本，从 Artificial Analysis、Vellum、LiveBench 抓取真实公开榜单数据，派生 17 个细分榜单，每个榜单补足到 30 行，归一化后写入 `data/benchmarks.json` 或在 serverless 上下文里直接返回。

## REMOVED Requirements
（无）
