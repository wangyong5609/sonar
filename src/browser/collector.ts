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

    for (let i = 0; i < 10 && comments.length < maxComments; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(1500);

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
    const title = await page.$eval('[data-e2e="video-desc"]', el => el.textContent?.trim() ?? '').catch(() => '');
    return title;
  } finally {
    await page.close();
  }
}
