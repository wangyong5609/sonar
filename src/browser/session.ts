import { chromium, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';

const SESSION_DIR = path.join(process.cwd(), 'data', 'session');

let context: BrowserContext | null = null;

export async function getContext(): Promise<BrowserContext> {
  if (context) return context;

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const sessionFile = path.join(SESSION_DIR, 'douyin.json');
  const storageState = fs.existsSync(sessionFile) ? sessionFile as string : undefined;

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

  console.log('请在浏览器中扫码登录抖音...');
  await page.waitForSelector('[data-e2e="user-info"]', { timeout: 180_000 });
  await saveSession();
  await page.close();
  console.log('登录成功');
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    const sessionFile = path.join(SESSION_DIR, 'douyin.json');
    return fs.existsSync(sessionFile);
  } catch {
    return false;
  }
}
