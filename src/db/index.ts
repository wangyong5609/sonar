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
      SELECT o.*, c.content as comment_content, c.user_nickname, c.video_url, c.video_title,
             c.intent_score, c.user_profile_url
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
