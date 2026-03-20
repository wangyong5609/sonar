import { getContext } from './session';

export async function replyToComment(videoUrl: string, commentUserId: string, replyText: string): Promise<boolean> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

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
