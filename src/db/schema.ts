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
