import express, { Request, Response } from 'express';
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
  app.get('/api/login/status', async (_: Request, res: Response) => {
    const loggedIn = await isLoggedIn();
    res.json({ loggedIn });
  });

  app.post('/api/login', async (_: Request, res: Response) => {
    try {
      await login();
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 竞品账号
  app.get('/api/accounts', (_: Request, res: Response) => res.json(accountsDb.list()));

  app.post('/api/accounts', (req: Request, res: Response) => {
    const { name, douyin_url } = req.body as { name?: string; douyin_url?: string };
    if (!name || !douyin_url) { res.status(400).json({ error: '缺少参数' }); return; }
    accountsDb.add(name, douyin_url);
    res.json({ ok: true });
  });

  app.delete('/api/accounts/:id', (req: Request, res: Response) => {
    accountsDb.remove(Number(req.params.id));
    res.json({ ok: true });
  });

  // 采集
  app.post('/api/collect', async (req: Request, res: Response) => {
    const { account_id, video_url } = req.body as { account_id?: number; video_url?: string };
    if (!account_id || !video_url) { res.status(400).json({ error: '缺少参数' }); return; }
    try {
      const result = await collectAndProcess(Number(account_id), video_url);
      res.json(result);
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 线索列表
  app.get('/api/leads', (_: Request, res: Response) => res.json(commentsDb.listWithIntent()));

  // 私信队列
  app.get('/api/outreach/pending', (_: Request, res: Response) => res.json(outreachDb.listPending()));

  app.post('/api/outreach/:id/send', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { content, user_profile_url } = req.body as { content?: string; user_profile_url?: string };
    if (!content || !user_profile_url) { res.status(400).json({ error: '缺少参数' }); return; }
    try {
      const ok = await sendDm(user_profile_url, content);
      if (ok) {
        outreachDb.markSent(id);
        res.json({ ok: true });
      } else {
        outreachDb.markFailed(id);
        res.status(500).json({ error: '发送失败，请检查登录状态' });
      }
    } catch (e: unknown) {
      outreachDb.markFailed(id);
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.delete('/api/outreach/:id', (req: Request, res: Response) => {
    outreachDb.markFailed(Number(req.params.id));
    res.json({ ok: true });
  });

  // 设置
  app.get('/api/settings', (_: Request, res: Response) => {
    res.json({
      kimi_api_key: settingsDb.get('kimi_api_key') ?? '',
      auto_reply_template: settingsDb.get('auto_reply_template') ?? '',
      dm_template: settingsDb.get('dm_template') ?? '',
    });
  });

  app.post('/api/settings', (req: Request, res: Response) => {
    const { kimi_api_key, auto_reply_template, dm_template } = req.body as Record<string, string>;
    if (kimi_api_key) settingsDb.set('kimi_api_key', kimi_api_key);
    if (auto_reply_template) settingsDb.set('auto_reply_template', auto_reply_template);
    if (dm_template) settingsDb.set('dm_template', dm_template);
    res.json({ ok: true });
  });

  return app;
}
