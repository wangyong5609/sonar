# 抖音自动获客工具 — 设计文档

## 产品定位

本地运行的 Node.js 工具，帮助老板在竞品抖音视频评论区自动发现潜在客户，并完成评论回复 + 私信触达的组合动作。

**当前阶段**：本地单用户工具（未来可升级为 SaaS）

---

## 技术栈

| 模块 | 技术 |
|------|------|
| 语言 | Node.js + TypeScript |
| 浏览器自动化 | Playwright |
| 本地 Web 服务 | Express |
| 本地数据库 | better-sqlite3（SQLite） |
| AI 意向判断 | Kimi API（moonshot-v1-8k） |
| 前端页面 | 纯 HTML + CSS（无框架） |

运行后访问 `http://localhost:3000` 操作。

---

## 架构

```
douyin-leads/
├── src/
│   ├── browser/        # Playwright：登录、采集评论、发评论、发私信
│   ├── ai/             # 调用 Kimi API 判断购买意向
│   ├── db/             # SQLite 数据模型与查询
│   ├── api/            # Express REST 接口
│   └── web/            # 本地前端（HTML 静态页面）
├── data/
│   ├── session/        # 抖音登录 Session 持久化
│   └── leads.db        # SQLite 数据文件
└── package.json
```

---

## 数据模型

```sql
-- 竞品账号
competitor_accounts (id, name, douyin_id, douyin_url, created_at)

-- 采集到的评论
comments (
  id, competitor_account_id,
  video_url, video_title,
  user_id, user_nickname, user_profile_url,
  content,           -- 评论原文
  intent_score,      -- AI 打分 0-100
  intent_label,      -- none | low | high
  collected_at
)

-- 触达记录
outreach_actions (
  id, comment_id, user_id,
  type,              -- comment_reply | dm
  content,           -- 发送内容
  status,            -- pending | sent | failed
  created_at, sent_at
)

-- 配置
settings (api_key, auto_reply_template, dm_template)
```

---

## 核心流程

```
用户添加竞品账号
  → 触发采集任务
  → Playwright 打开视频，滚动加载全部评论
  → 批量发送给 Kimi：判断哪些评论有购买意向
  → intent_score ≥ 60 → 自动回复评论（Playwright 执行）
  → intent_score ≥ 80 → 进入私信审核队列（status = pending）
  → 用户在「私信队列」页面编辑 + 确认发送
```

---

## 登录方案

首次运行时 Playwright 打开真实浏览器窗口，用户手动扫码登录抖音。登录成功后 Session 保存到 `data/session/` 目录，后续自动复用，无需重复登录。

---

## 操作界面（4个页面）

1. **竞品管理** — 添加/删除监控账号，手动触发采集
2. **线索列表** — 查看所有有意向的评论，按意向分排序
3. **私信审核队列** — 逐条审核，可编辑私信内容，点确认发送
4. **设置** — 填写 Kimi API Key，配置回复模板

---

## AI 意向判断 Prompt 设计

```
你是一个销售线索筛选助手。
以下是抖音视频下的用户评论，请判断每条评论是否表达了购买意向。

评判标准：
- 强意向（score 80-100）：询价、求购买链接、问在哪买、问怎么联系
- 有意向（score 60-79）：表达喜欢/感兴趣、问效果、问适不适合自己
- 无意向（score 0-59）：闲聊、夸主播、无关内容

返回 JSON 数组，每条包含：{ comment_id, score, label, reason }
```

---

## 未来升级路径

本地工具 → SaaS 时，各模块的迁移方向：

| 模块 | 本地 | 未来SaaS |
|------|------|---------|
| Playwright | 本地运行（永久） | 本地 Agent（不变） |
| AI 过滤 | 本地调用 Kimi | 迁移到云端 |
| SQLite | 本地文件 | 云端 MySQL |
| Express 前端 | localhost:3000 | 部署到服务器 |
