# AI 大模型基准测试榜单显示板

随时在 iPhone / 桌面浏览器查看主流大模型在 17 个基准榜单的 Top 30 表现。数据来自 Artificial Analysis、Vellum、LiveBench 三家真实公开榜单。

## 在线访问（iPhone / 任何设备）

部署到 Vercel 后访问形如 `https://<project>.vercel.app/`。

### 一键部署
1. 把项目推到 GitHub。
2. 打开 https://vercel.com/new ，选这个仓库，**直接 Deploy**。
3. 30 秒后拿到 `https://xxx.vercel.app/`，手机浏览器打开即可。
4. iPhone 上 Safari → 分享 → 添加到主屏幕，桌面会显示一个 App 图标。

### 数据更新策略
- Vercel 上访问 `https://xxx.vercel.app/api/leaderboard` 都会**实时抓取**最新数据（≤ 8 秒）。
- 前端默认调用 `/api/leaderboard`，故每次打开页面都看到最新榜。
- 主页 `/api/refresh` 可作部署后健康检查。

## 本地开发

```bash
# 1) 安装 Python 依赖（仅标准库，无需 pip install）
python scripts/fetch_leaderboards.py    # 抓取并写入 data/benchmarks.json
python -m http.server 8765               # 启动静态服务
# 浏览器打开 http://localhost:8765/
# iPhone 访问 http://<电脑IP>:8765/  (需同一 WiFi)
```

## 数据源
- **Artificial Analysis** — 4 榜：Intelligence / Price / Speed / Context
- **Vellum LLM Leaderboard** — 6 榜：GPQA Diamond / AIME 2025 / SWE-Bench Verified / HLE / ARC-AGI 2 / MMMLU
- **LiveBench** — 7 榜：Global / Reasoning / Coding / Mathematics / Data Analysis / Language / IF

合计 17 榜，每榜 30 行。沙箱/网络受限环境下，Vellum / LiveBench 走本地 fallback 补足。

## 目录结构
```
.
├── index.html              # 主页面（含 PWA 头）
├── src/
│   ├── app.js              # 前端逻辑
│   └── style.css           # 样式
├── data/
│   ├── benchmarks.json     # 抓取结果（被脚本覆盖）
│   ├── fallback_livebench.json
│   └── fallback_vellum.json
├── api/
│   ├── leaderboard.py      # Vercel Serverless: 实时返回 JSON
│   └── refresh.py          # 健康检查/触发器
├── scripts/
│   └── fetch_leaderboards.py
├── vercel.json
└── package.json
```

## CLI 抓取
```bash
python scripts/fetch_leaderboards.py
# 输出示例：
#   - [OK] Artificial Analysis (120)
#   - [OK] Vellum LLM Leaderboard (180)
#   - [OK] LiveBench (210)
```
