# 抖音自动获客工具 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 本地 Node.js 工具，自动采集抖音竞品视频评论，AI筛选购买意向，自动回复评论 + 人工审核后发私信。

**Architecture:** Express 提供本地 Web 服务和 REST API；Playwright 管理浏览器会话，执行采集和触达动作；Kimi API 批量判断评论意向；better-sqlite3 持久化所有数据。

**Tech Stack:** Node.js 20+, TypeScript, Playwright, Express, better-sqlite3, Kimi API (moonshot-v1-8k)

---

## Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `.gitignore`

**Step 1: 初始化项目**

```bash
cd "/Users/mac/workspace/code/AI 自动获客"
mkdir douyin-leads && cd douyin-leads
npm init -y
```

**Step 2: 安装依赖**

```bash
npm install express better-sqlite3 playwright @playwright/test
npm install -D typescript @types/node @types/express @types/better-sqlite3 ts-node nodemon
npx playwright install chromium
```

**Step 3: 创建 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

**Step 4: 更新 `package.json` scripts**

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**Step 5: 创建 `.gitignore`**

```
node_modules/
dist/
data/
.env
```

**Step 6: 创建 `src/index.ts`（入口占位）**

```typescript
console.log('douyin-leads starting...');
```

**Step 7: 验证能跑起来**

```bash
npx ts-node src/index.ts
```
Expected: 输出 `douyin-leads starting...`

**Step 8: 初始化 git 并提交**

```bash
git init
git add .
git commit -m "feat: project init"
```

---

## Task 2: 数据库模块

**Files:**
- Create: `src/db/index.ts`
- Create: `src/db/schema.ts`

**Step 1: 创建目录结构**

```bash
mkdir -p src/db src/browser src/ai src/api src/web data/session
```

**Step 2: 创建 `src/db/schema.ts`**

```typescript
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS competitor_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  douyin_id TEXT,
  douyin_url TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_account_id INTEGER NOT NULL,
  video_url TEXT NOT NULL,
  video_title TEXT,
  user_id TEXT,
  user_nickname TEXT,
  user_profile_url TEXT,
  content TEXT NOT NULL,
  intent_score INTEGER DEFAULT 0,
  intent_label TEXT DEFAULT 'none',
  intent_reason TEXT,
  collected_at TEXT DEFAULT (datetime('now')),
  UNIQUE(video_url, user_id, content)
);

CREATE TABLE IF NOT EXISTS outreach_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  user_id TEXT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;
```

**Step 3: 创建 `src/db/index.ts`**

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA } from './schema';

const DB_PATH = path.join(process.cwd(), 'data', 'leads.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
  }
  return db;
}

// 竞品账号
export const accountsDb = {
  list: () => getDb().prepare('SELECT * FROM competitor_accounts ORDER BY created_at DESC').all(),
  add: (name: string, douyin_url: string) =>
    getDb().prepare('INSERT INTO competitor_accounts (name, douyin_url) VALUES (?, ?)').run(name, douyin_url),
  remove: (id: number) => getDb().prepare('DELETE FROM competitor_accounts WHERE id = ?').run(id),
};

// 评论
export const commentsDb = {
  insert: (data: {
    competitor_account_id: number; video_url: string; video_title?: string;
    user_id?: string; user_nickname?: string; user_profile_url?: string; content: string;
  }) => {
    const stmt = getDb().prepare(`
      INSERT OR IGNORE INTO comments
        (competitor_account_id, video_url, video_title, user_id, user_nickname, user_profile_url, content)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.competitor_account_id, data.video_url, data.video_title ?? null,
      data.user_id ?? null, data.user_nickname ?? null, data.user_profile_url ?? null, data.content
    );
  },
  updateIntent: (id: number, score: number, label: string, reason: string) =>
    getDb().prepare('UPDATE comments SET intent_score=?, intent_label=?, intent_reason=? WHERE id=?')
      .run(score, label, reason, id),
  listWithIntent: () =>
    getDb().prepare("SELECT * FROM comments WHERE intent_label != 'none' ORDER BY intent_score DESC").all(),
  listPendingScore: () =>
    getDb().prepare('SELECT * FROM comments WHERE intent_score = 0 LIMIT 50').all(),
};

// 触达动作
export const outreachDb = {
  create: (comment_id: number, user_id: string, type: string, content: string) =>
    getDb().prepare('INSERT INTO outreach_actions (comment_id, user_id, type, content) VALUES (?, ?, ?, ?)')
      .run(comment_id, user_id, type, content),
  listPending: () =>
    getDb().prepare(`
      SELECT o.*, c.content as comment_content, c.user_nickname, c.video_url, c.video_title, c.intent_score
      FROM outreach_actions o JOIN comments c ON o.comment_id = c.id
      WHERE o.status = 'pending' ORDER BY o.created_at DESC
    `).all(),
  markSent: (id: number) =>
    getDb().prepare("UPDATE outreach_actions SET status='sent', sent_at=datetime('now') WHERE id=?").run(id),
  markFailed: (id: number) =>
    getDb().prepare("UPDATE outreach_actions SET status='failed' WHERE id=?").run(id),
};

// 配置
export const settingsDb = {
  get: (key: string): string | null => {
    const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  },
  set: (key: string, value: string) =>
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value),
};
```

**Step 4: 验证数据库能初始化**

在 `src/index.ts` 临时加入：
```typescript
import { getDb, accountsDb } from './db';
getDb();
accountsDb.add('测试账号', 'https://www.douyin.com/user/test');
console.log(accountsDb.list());
```

```bash
npx ts-node src/index.ts
```
Expected: 输出包含刚插入的账号记录，`data/leads.db` 文件已创建。

**Step 5: 提交**

```bash
git add .
git commit -m "feat: add database module with schema"
```

---

## Task 3: Kimi AI 意向判断模块

**Files:**
- Create: `src/ai/intent.ts`

**Step 1: 创建 `src/ai/intent.ts`**

Kimi API 兼容 OpenAI 格式，base URL 是 `https://api.moonshot.cn/v1`。

```typescript
import https from 'https';

export interface CommentInput {
  id: number;
  content: string;
}

export interface IntentResult {
  comment_id: number;
  score: number;
  label: 'none' | 'low' | 'high';
  reason: string;
}

const SYSTEM_PROMPT = `你是一个销售线索筛选助手。
判断抖音评论是否表达购买意向，返回 JSON 数组。

评判标准：
- 强意向 score 80-100：询价、求购买链接、问在哪买、问怎么联系
- 有意向 score 60-79：表达喜欢/感兴趣、问效果、问适不适合自己
- 无意向 score 0-59：闲聊、夸主播、无关内容

返回格式（仅返回JSON，不要其他文字）：
[{"comment_id": 1, "score": 85, "label": "high", "reason": "询问价格"}]`;

function callKimi(apiKey: string, messages: object[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'moonshot-v1-8k',
      messages,
      temperature: 0.1,
    });
    const req = https.request({
      hostname: 'api.moonshot.cn',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices[0].message.content);
        } catch {
          reject(new Error(`Kimi parse error: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function analyzeIntent(apiKey: string, comments: CommentInput[]): Promise<IntentResult[]> {
  if (comments.length === 0) return [];

  const userMessage = comments.map(c => `[${c.id}] ${c.content}`).join('\n');
  const raw = await callKimi(apiKey, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]);

  try {
    const results: IntentResult[] = JSON.parse(raw);
    return results.map(r => ({
      ...r,
      label: r.score >= 80 ? 'high' : r.score >= 60 ? 'low' : 'none',
    }));
  } catch {
    console.error('Kimi response parse failed:', raw);
    return [];
  }
}
```

**Step 2: 手动测试（需要真实 Kimi API Key）**

临时在 `src/index.ts` 测试：
```typescript
import { analyzeIntent } from './ai/intent';
const results = await analyzeIntent('YOUR_KEY', [
  { id: 1, content: '这个多少钱？在哪里买？' },
  { id: 2, content: '主播好漂亮啊' },
  { id: 3, content: '效果真的有那么好吗？' },
]);
console.log(JSON.stringify(results, null, 2));
```

Expected: id=1 score≥80 label=high，id=2 score<60 label=none，id=3 score 60-79 label=low

**Step 3: 提交**

```bash
git add .
git commit -m "feat: add Kimi intent analysis module"
```

---

## Task 4: Playwright 浏览器模块

**Files:**
- Create: `src/browser/session.ts`
- Create: `src/browser/collector.ts`
- Create: `src/browser/actions.ts`

**Step 1: 创建 `src/browser/session.ts`（Session 管理）**

```typescript
import { chromium, Browser, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';

const SESSION_DIR = path.join(process.cwd(), 'data', 'session');

let context: BrowserContext | null = null;

export async function getContext(): Promise<BrowserContext> {
  if (context) return context;

  const browser: Browser = await chromium.launch({
    headless: false,  // 必须显示，用户需要扫码
    args: ['--no-sandbox'],
  });

  const sessionFile = path.join(SESSION_DIR, 'douyin.json');
  const storageState = fs.existsSync(sessionFile) ? sessionFile : undefined;

  context = await browser.newContext({
    storageState,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  return context;
}

export async function saveSession(): Promise<void> {
  if (!context) return;
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  await context.storageState({ path: path.join(SESSION_DIR, 'douyin.json') });
  console.log('Session saved');
}

export async function login(): Promise<void> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  await page.goto('https://www.douyin.com');

  // 等待用户登录（检测到登录态为止，最多等3分钟）
  console.log('请在浏览器中扫码登录抖音...');
  await page.waitForSelector('[data-e2e="user-info"]', { timeout: 180_000 });
  await saveSession();
  await page.close();
  console.log('登录成功');
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    const ctx = await getContext();
    const page = await ctx.newPage();
    await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded' });
    const loggedIn = await page.$('[data-e2e="user-info"]') !== null;
    await page.close();
    return loggedIn;
  } catch {
    return false;
  }
}
```

**Step 2: 创建 `src/browser/collector.ts`（评论采集）**

```typescript
import { getContext } from './session';

export interface RawComment {
  user_id: string;
  user_nickname: string;
  user_profile_url: string;
  content: string;
}

export async function collectComments(videoUrl: string, maxComments = 100): Promise<RawComment[]> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  const comments: RawComment[] = [];

  try {
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 滚动加载评论
    for (let i = 0; i < 10 && comments.length < maxComments; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(1500);

      // 提取评论（selector 需根据抖音实际页面调整）
      const items = await page.$$eval('[data-e2e="comment-item"]', (els) =>
        els.map(el => ({
          user_id: el.querySelector('a')?.href?.split('/').pop() ?? '',
          user_nickname: el.querySelector('[data-e2e="comment-user-name"]')?.textContent?.trim() ?? '',
          user_profile_url: el.querySelector('a')?.href ?? '',
          content: el.querySelector('[data-e2e="comment-content"]')?.textContent?.trim() ?? '',
        })).filter(c => c.content)
      );

      for (const item of items) {
        if (!comments.find(c => c.user_id === item.user_id && c.content === item.content)) {
          comments.push(item);
        }
      }
    }
  } finally {
    await page.close();
  }

  return comments;
}

export async function getVideoTitle(videoUrl: string): Promise<string> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const title = await page.$eval('[data-e2e="video-desc"]', el => el.textContent?.trim() ?? '');
    return title;
  } catch {
    return '';
  } finally {
    await page.close();
  }
}
```

**Step 3: 创建 `src/browser/actions.ts`（评论回复 + 私信）**

```typescript
import { getContext } from './session';

export async function replyToComment(videoUrl: string, commentUserId: string, replyText: string): Promise<boolean> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 找到对应用户的评论并点击回复
    const commentEl = await page.$(`[href*="${commentUserId}"]`);
    if (!commentEl) return false;

    const replyBtn = await commentEl.$('[data-e2e="comment-reply"]');
    if (!replyBtn) return false;

    await replyBtn.click();
    await page.waitForTimeout(1000);
    await page.keyboard.type(replyText);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    return true;
  } catch (e) {
    console.error('replyToComment failed:', e);
    return false;
  } finally {
    await page.close();
  }
}

export async function sendDm(userProfileUrl: string, message: string): Promise<boolean> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(userProfileUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const msgBtn = await page.$('[data-e2e="user-info-send-msg"]');
    if (!msgBtn) return false;

    await msgBtn.click();
    await page.waitForTimeout(2000);
    await page.keyboard.type(message);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    return true;
  } catch (e) {
    console.error('sendDm failed:', e);
    return false;
  } finally {
    await page.close();
  }
}
```

**Step 4: 提交**

```bash
git add .
git commit -m "feat: add Playwright browser module (session, collector, actions)"
```

---

## Task 5: 核心采集流程（串联各模块）

**Files:**
- Create: `src/collect.ts`

**Step 1: 创建 `src/collect.ts`**

```typescript
import { collectComments, getVideoTitle } from './browser/collector';
import { replyToComment } from './browser/actions';
import { analyzeIntent } from './ai/intent';
import { commentsDb, outreachDb, settingsDb } from './db';

export async function collectAndProcess(
  accountId: number,
  videoUrl: string
): Promise<{ collected: number; highIntent: number }> {
  const apiKey = settingsDb.get('kimi_api_key');
  if (!apiKey) throw new Error('Kimi API Key 未配置，请先在设置页填写');

  const autoReplyTemplate = settingsDb.get('auto_reply_template') ?? '您好，感谢关注！有任何问题欢迎私信我们 😊';
  const dmTemplate = settingsDb.get('dm_template') ?? '您好 {nickname}，看到您对相关产品感兴趣，欢迎私信了解详情！';

  // 1. 采集评论
  console.log(`采集视频评论: ${videoUrl}`);
  const videoTitle = await getVideoTitle(videoUrl);
  const rawComments = await collectComments(videoUrl, 100);
  console.log(`采集到 ${rawComments.length} 条评论`);

  // 2. 存入数据库（去重）
  const inserted: number[] = [];
  for (const c of rawComments) {
    const result = commentsDb.insert({
      competitor_account_id: accountId,
      video_url: videoUrl,
      video_title: videoTitle,
      user_id: c.user_id,
      user_nickname: c.user_nickname,
      user_profile_url: c.user_profile_url,
      content: c.content,
    });
    if (result.lastInsertRowid) inserted.push(Number(result.lastInsertRowid));
  }

  // 3. AI 意向分析（只分析新插入的）
  const pending = commentsDb.listPendingScore().filter(c => inserted.includes((c as any).id));
  if (pending.length === 0) return { collected: rawComments.length, highIntent: 0 };

  console.log(`AI 分析 ${pending.length} 条新评论...`);
  const results = await analyzeIntent(apiKey, pending.map((c: any) => ({ id: c.id, content: c.content })));

  // 4. 更新意向分 + 触发动作
  let highIntentCount = 0;
  for (const r of results) {
    commentsDb.updateIntent(r.comment_id, r.score, r.label, r.reason);

    const comment = (pending as any[]).find(c => c.id === r.comment_id);
    if (!comment) continue;

    if (r.score >= 60 && r.score < 80) {
      // 自动回复评论
      const replyText = autoReplyTemplate.replace('{nickname}', comment.user_nickname ?? '');
      const ok = await replyToComment(videoUrl, comment.user_id, replyText);
      if (ok) outreachDb.create(r.comment_id, comment.user_id, 'comment_reply', replyText);
    }

    if (r.score >= 80) {
      // 进入私信待审核队列
      highIntentCount++;
      const dmContent = dmTemplate.replace('{nickname}', comment.user_nickname ?? '朋友');
      outreachDb.create(r.comment_id, comment.user_id, 'dm', dmContent);
    }
  }

  return { collected: rawComments.length, highIntent: highIntentCount };
}
```

**Step 2: 提交**

```bash
git add .
git commit -m "feat: add collect pipeline (collect -> AI filter -> auto reply -> DM queue)"
```

---

## Task 6: Express API 层

**Files:**
- Create: `src/api/index.ts`

**Step 1: 创建 `src/api/index.ts`**

```typescript
import express from 'express';
import path from 'path';
import { accountsDb, commentsDb, outreachDb, settingsDb } from '../db';
import { collectAndProcess } from '../collect';
import { login, isLoggedIn } from '../browser/session';
import { sendDm } from '../browser/actions';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../web')));

  // 登录状态
  app.get('/api/login/status', async (_, res) => {
    const loggedIn = await isLoggedIn();
    res.json({ loggedIn });
  });

  app.post('/api/login', async (_, res) => {
    try {
      await login();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 竞品账号
  app.get('/api/accounts', (_, res) => res.json(accountsDb.list()));

  app.post('/api/accounts', (req, res) => {
    const { name, douyin_url } = req.body;
    if (!name || !douyin_url) return res.status(400).json({ error: '缺少参数' });
    accountsDb.add(name, douyin_url);
    res.json({ ok: true });
  });

  app.delete('/api/accounts/:id', (req, res) => {
    accountsDb.remove(Number(req.params.id));
    res.json({ ok: true });
  });

  // 采集（传入视频URL）
  app.post('/api/collect', async (req, res) => {
    const { account_id, video_url } = req.body;
    if (!account_id || !video_url) return res.status(400).json({ error: '缺少参数' });
    try {
      const result = await collectAndProcess(Number(account_id), video_url);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 线索列表
  app.get('/api/leads', (_, res) => res.json(commentsDb.listWithIntent()));

  // 私信队列
  app.get('/api/outreach/pending', (_, res) => res.json(outreachDb.listPending()));

  app.post('/api/outreach/:id/send', async (req, res) => {
    const id = Number(req.params.id);
    const { content, user_profile_url } = req.body;
    try {
      const ok = await sendDm(user_profile_url, content);
      if (ok) {
        outreachDb.markSent(id);
        res.json({ ok: true });
      } else {
        outreachDb.markFailed(id);
        res.status(500).json({ error: '发送失败，请检查登录状态' });
      }
    } catch (e: any) {
      outreachDb.markFailed(id);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/outreach/:id', (req, res) => {
    outreachDb.markFailed(Number(req.params.id));
    res.json({ ok: true });
  });

  // 设置
  app.get('/api/settings', (_, res) => {
    res.json({
      kimi_api_key: settingsDb.get('kimi_api_key') ?? '',
      auto_reply_template: settingsDb.get('auto_reply_template') ?? '',
      dm_template: settingsDb.get('dm_template') ?? '',
    });
  });

  app.post('/api/settings', (req, res) => {
    const { kimi_api_key, auto_reply_template, dm_template } = req.body;
    if (kimi_api_key) settingsDb.set('kimi_api_key', kimi_api_key);
    if (auto_reply_template) settingsDb.set('auto_reply_template', auto_reply_template);
    if (dm_template) settingsDb.set('dm_template', dm_template);
    res.json({ ok: true });
  });

  return app;
}
```

**Step 2: 更新 `src/index.ts`**

```typescript
import { createApp } from './api';

const app = createApp();
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ 抖音自动获客工具运行中`);
  console.log(`👉 打开浏览器访问: http://localhost:${PORT}`);
});
```

**Step 3: 提交**

```bash
git add .
git commit -m "feat: add Express API layer"
```

---

## Task 7: 前端页面

**Files:**
- Create: `src/web/index.html`

**Step 1: 创建 `src/web/index.html`**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>抖音自动获客</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #f5f5f5; }
    nav { background: #fe2c55; padding: 12px 24px; color: white; display: flex; gap: 20px; align-items: center; }
    nav span { font-size: 18px; font-weight: bold; margin-right: auto; }
    nav a { color: white; text-decoration: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
    nav a.active, nav a:hover { background: rgba(255,255,255,0.2); }
    .page { display: none; padding: 24px; max-width: 960px; margin: 0 auto; }
    .page.active { display: block; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .btn-primary { background: #fe2c55; color: white; }
    .btn-danger { background: #ff4d4f; color: white; }
    .btn-success { background: #52c41a; color: white; }
    input, textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; margin-bottom: 8px; }
    textarea { height: 80px; resize: vertical; }
    .badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; }
    .badge-high { background: #fff1f0; color: #cf1322; }
    .badge-low { background: #fff7e6; color: #d46b08; }
    .score { font-weight: bold; color: #fe2c55; }
    .flex { display: flex; gap: 8px; align-items: flex-start; }
    .login-status { font-size: 13px; padding: 4px 10px; border-radius: 12px; }
    .login-status.ok { background: #f6ffed; color: #389e0d; }
    .login-status.no { background: #fff1f0; color: #cf1322; }
  </style>
</head>
<body>
  <nav>
    <span>🎯 抖音自动获客</span>
    <a onclick="showPage('accounts')" class="active" id="nav-accounts">竞品管理</a>
    <a onclick="showPage('leads')" id="nav-leads">线索列表</a>
    <a onclick="showPage('queue')" id="nav-queue">私信队列 <span id="queue-badge"></span></a>
    <a onclick="showPage('settings')" id="nav-settings">设置</a>
    <span id="login-status" class="login-status no">未登录</span>
    <button class="btn btn-primary" onclick="doLogin()" id="login-btn">登录抖音</button>
  </nav>

  <!-- 竞品管理 -->
  <div class="page active" id="page-accounts">
    <div class="card">
      <h3 style="margin-bottom:12px">添加竞品账号</h3>
      <input id="acc-name" placeholder="账号名称（备注）">
      <input id="acc-url" placeholder="抖音主页链接 https://www.douyin.com/user/xxx">
      <button class="btn btn-primary" onclick="addAccount()">添加</button>
    </div>
    <div id="accounts-list"></div>
    <div class="card" style="margin-top:16px">
      <h3 style="margin-bottom:12px">采集评论</h3>
      <input id="collect-account" placeholder="选择竞品账号ID">
      <input id="collect-url" placeholder="视频链接 https://www.douyin.com/video/xxx">
      <button class="btn btn-primary" onclick="doCollect()" id="collect-btn">开始采集</button>
      <p id="collect-result" style="margin-top:8px;font-size:13px;color:#666"></p>
    </div>
  </div>

  <!-- 线索列表 -->
  <div class="page" id="page-leads">
    <button class="btn btn-primary" onclick="loadLeads()" style="margin-bottom:16px">刷新</button>
    <div id="leads-list"></div>
  </div>

  <!-- 私信队列 -->
  <div class="page" id="page-queue">
    <button class="btn btn-primary" onclick="loadQueue()" style="margin-bottom:16px">刷新</button>
    <div id="queue-list"></div>
  </div>

  <!-- 设置 -->
  <div class="page" id="page-settings">
    <div class="card">
      <h3 style="margin-bottom:12px">API 配置</h3>
      <input id="s-apikey" placeholder="Kimi API Key (sk-xxx)" type="password">
      <h3 style="margin:12px 0">自动评论回复模板</h3>
      <textarea id="s-reply" placeholder="变量：{nickname}"></textarea>
      <h3 style="margin:12px 0">私信默认模板</h3>
      <textarea id="s-dm" placeholder="变量：{nickname}"></textarea>
      <button class="btn btn-primary" onclick="saveSettings()">保存设置</button>
    </div>
  </div>

  <script>
    const api = (url, opt) => fetch(url, { headers: {'Content-Type':'application/json'}, ...opt }).then(r => r.json());

    function showPage(name) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
      document.getElementById('page-' + name).classList.add('active');
      document.getElementById('nav-' + name).classList.add('active');
      if (name === 'accounts') loadAccounts();
      if (name === 'leads') loadLeads();
      if (name === 'queue') loadQueue();
      if (name === 'settings') loadSettings();
    }

    async function checkLogin() {
      const { loggedIn } = await api('/api/login/status');
      const el = document.getElementById('login-status');
      const btn = document.getElementById('login-btn');
      el.textContent = loggedIn ? '已登录' : '未登录';
      el.className = 'login-status ' + (loggedIn ? 'ok' : 'no');
      btn.style.display = loggedIn ? 'none' : 'inline-block';
    }

    async function doLogin() {
      document.getElementById('login-btn').textContent = '等待扫码...';
      await api('/api/login', { method: 'POST' });
      checkLogin();
    }

    async function loadAccounts() {
      const accounts = await api('/api/accounts');
      const el = document.getElementById('accounts-list');
      el.innerHTML = accounts.map(a => `
        <div class="card flex">
          <div style="flex:1"><strong>${a.name}</strong><br><a href="${a.douyin_url}" target="_blank" style="font-size:12px;color:#666">${a.douyin_url}</a></div>
          <span style="font-size:12px;color:#999">ID: ${a.id}</span>
          <button class="btn btn-danger" onclick="deleteAccount(${a.id})">删除</button>
        </div>`).join('');
    }

    async function addAccount() {
      const name = document.getElementById('acc-name').value.trim();
      const douyin_url = document.getElementById('acc-url').value.trim();
      if (!name || !douyin_url) return alert('请填写名称和链接');
      await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name, douyin_url }) });
      loadAccounts();
    }

    async function deleteAccount(id) {
      if (!confirm('确认删除？')) return;
      await api(`/api/accounts/${id}`, { method: 'DELETE' });
      loadAccounts();
    }

    async function doCollect() {
      const account_id = document.getElementById('collect-account').value.trim();
      const video_url = document.getElementById('collect-url').value.trim();
      if (!account_id || !video_url) return alert('请填写账号ID和视频链接');
      const btn = document.getElementById('collect-btn');
      const result = document.getElementById('collect-result');
      btn.disabled = true; btn.textContent = '采集中...';
      result.textContent = '正在采集，请稍候（可能需要1-3分钟）...';
      try {
        const r = await api('/api/collect', { method: 'POST', body: JSON.stringify({ account_id: Number(account_id), video_url }) });
        result.textContent = r.error ? `错误: ${r.error}` : `✅ 采集完成：${r.collected} 条评论，${r.highIntent} 个高意向线索进入私信队列`;
      } finally {
        btn.disabled = false; btn.textContent = '开始采集';
      }
    }

    async function loadLeads() {
      const leads = await api('/api/leads');
      document.getElementById('leads-list').innerHTML = leads.length === 0
        ? '<div class="card">暂无线索，请先采集评论</div>'
        : leads.map(l => `
          <div class="card">
            <div class="flex">
              <span class="badge badge-${l.intent_label}">${l.intent_label === 'high' ? '强意向' : '有意向'}</span>
              <span class="score">${l.intent_score}分</span>
              <strong>${l.user_nickname || '匿名用户'}</strong>
            </div>
            <p style="margin:8px 0;color:#333">${l.content}</p>
            <p style="font-size:12px;color:#999">理由：${l.intent_reason || '-'} | 视频：${l.video_title || l.video_url}</p>
          </div>`).join('');
    }

    async function loadQueue() {
      const items = await api('/api/outreach/pending');
      document.getElementById('queue-badge').textContent = items.length > 0 ? `(${items.length})` : '';
      document.getElementById('queue-list').innerHTML = items.length === 0
        ? '<div class="card">队列为空</div>'
        : items.map(item => `
          <div class="card" id="q-${item.id}">
            <div class="flex">
              <span class="badge badge-high">强意向 ${item.intent_score}分</span>
              <strong>${item.user_nickname || '匿名用户'}</strong>
            </div>
            <p style="margin:8px 0;font-size:13px;color:#666">原评论：${item.comment_content}</p>
            <textarea id="dm-content-${item.id}">${item.content}</textarea>
            <div class="flex">
              <button class="btn btn-success" onclick="sendDm(${item.id}, '${item.user_profile_url}')">发送私信</button>
              <button class="btn" onclick="skipDm(${item.id})" style="background:#f0f0f0">跳过</button>
            </div>
          </div>`).join('');
    }

    async function sendDm(id, profileUrl) {
      const content = document.getElementById(`dm-content-${id}`).value;
      const btn = event.target;
      btn.disabled = true; btn.textContent = '发送中...';
      const r = await api(`/api/outreach/${id}/send`, { method: 'POST', body: JSON.stringify({ content, user_profile_url: profileUrl }) });
      if (r.ok) {
        document.getElementById(`q-${id}`).remove();
      } else {
        alert('发送失败: ' + r.error);
        btn.disabled = false; btn.textContent = '发送私信';
      }
    }

    async function skipDm(id) {
      await api(`/api/outreach/${id}`, { method: 'DELETE' });
      document.getElementById(`q-${id}`).remove();
    }

    async function loadSettings() {
      const s = await api('/api/settings');
      document.getElementById('s-apikey').value = s.kimi_api_key;
      document.getElementById('s-reply').value = s.auto_reply_template;
      document.getElementById('s-dm').value = s.dm_template;
    }

    async function saveSettings() {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({
        kimi_api_key: document.getElementById('s-apikey').value,
        auto_reply_template: document.getElementById('s-reply').value,
        dm_template: document.getElementById('s-dm').value,
      })});
      alert('保存成功');
    }

    // 初始化
    checkLogin();
    loadAccounts();
    setInterval(checkLogin, 30000);
  </script>
</body>
</html>
```

**Step 2: 验证整体能跑起来**

```bash
npx ts-node src/index.ts
```

Expected: 终端输出 `✅ 抖音自动获客工具运行中`，浏览器访问 `http://localhost:3000` 看到页面。

**Step 3: 提交**

```bash
git add .
git commit -m "feat: add web UI (4 pages: accounts, leads, queue, settings)"
```

---

## Task 8: 联调验证

**Step 1: 先配置 Kimi API Key**

访问 `http://localhost:3000`，进入「设置」页，填写：
- Kimi API Key（从 https://platform.moonshot.cn 获取）
- 自动回复模板：`你好 {nickname}，感谢关注！有任何问题欢迎私信了解 😊`
- 私信模板：`您好 {nickname}，看到您对我们的产品感兴趣，欢迎私信详聊！`

**Step 2: 登录抖音**

点击「登录抖音」按钮，在弹出的浏览器窗口中扫码登录。

**Step 3: 添加竞品账号并采集**

1. 在「竞品管理」添加一个竞品账号
2. 找一个该账号的视频链接，填入采集框
3. 点击「开始采集」，等待结果

**Step 4: 检查线索和队列**

- 「线索列表」应出现有意向的评论
- 「私信队列」应出现强意向（≥80分）的用户

**Step 5: 测试发私信**

在私信队列找一条，编辑内容后点「发送私信」，确认抖音里消息已发出。

**Step 6: 最终提交**

```bash
git add .
git commit -m "feat: complete douyin leads tool v1.0"
```

---

## 注意事项

- **Selector 需要调整**：抖音前端 `data-e2e` 属性可能随版本变化，联调时需在浏览器 DevTools 核对实际 selector
- **频率控制**：每次操作后 `waitForTimeout` 模拟人工延迟，避免触发风控
- **账号安全**：建议用小号测试，确认稳定后再用主号
