# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**抖音自动获客工具** — 本地运行的 Node.js 工具，自动采集抖音竞品视频评论，AI 筛选购买意向用户，自动回复评论 + 人工审核后发私信。

## 启动

```bash
npm run dev        # 开发模式（nodemon 热重载）
npm run build      # 编译 TypeScript
npm start          # 运行编译后的版本
```

启动后访问 `http://localhost:3000`

## 技术栈

- **Node.js 20+ / TypeScript** + Express（本地 Web 服务）
- **Playwright**（浏览器自动化，采集抖音评论、发评论、发私信）
- **better-sqlite3**（本地 SQLite 数据库，零配置）
- **Kimi API**（moonshot-v1-8k，评论购买意向判断）
- **前端**：纯 HTML + Tailwind CDN（Dark Mode + Glassmorphism）

## 目录结构

```
src/
├── index.ts              # 入口，启动 Express
├── collect.ts            # 核心流程：采集 → AI 分析 → 自动回复 → 私信队列
├── db/
│   ├── index.ts          # 所有数据库操作（accountsDb, commentsDb, outreachDb, settingsDb）
│   └── schema.ts         # 4 张表的 DDL
├── ai/
│   └── intent.ts         # 调用 Kimi API，批量判断评论购买意向，返回 score + label + reason
├── browser/
│   ├── session.ts        # Playwright Session 管理（首次登录 + 持久化到 data/session/）
│   ├── collector.ts      # 采集视频评论（滚动加载，去重）
│   └── actions.ts        # 自动回复评论、发私信
├── api/
│   └── index.ts          # Express REST API（所有路由）
└── web/
    └── index.html        # 前端页面（侧边栏布局，4个页面）
data/
├── session/              # 抖音登录 Session（.gitignore 已排除）
└── leads.db              # SQLite 数据文件（.gitignore 已排除）
```

## 数据模型

4 张表，详见 `src/db/schema.ts`：
- `competitor_accounts` — 监控的竞品账号
- `comments` — 采集的评论（含 intent_score / intent_label / intent_reason）
- `outreach_actions` — 触达记录（comment_reply | dm，status: pending/sent/failed）
- `settings` — 配置项（kimi_api_key, auto_reply_template, dm_template）

## 核心业务逻辑

**`src/collect.ts`** 是主流程：
1. Playwright 采集视频评论 → `INSERT OR IGNORE`（自动去重）
2. 只把新插入的评论发给 Kimi API 批量分析
3. `score ≥ 60 && < 80` → 自动回复评论（Playwright 执行）
4. `score ≥ 80` → 插入 `outreach_actions`（status=pending，等待人工审核）

**登录机制**（`src/browser/session.ts`）：
- 首次运行打开真实浏览器，用户手动扫码
- Session 保存到 `data/session/douyin.json`，后续自动复用
- `isLoggedIn()` 通过检查 Session 文件是否存在判断

## 注意事项

- **Selector 需要调整**：抖音前端 `data-e2e` 属性随版本变化，联调时在 DevTools 核对实际 selector
- **账号安全**：建议用小号测试，Playwright 操作间有 `waitForTimeout` 模拟人工延迟
- **data/ 目录不提交**：Session 和数据库在 `.gitignore` 中
