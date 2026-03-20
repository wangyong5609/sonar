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
  const allPending = commentsDb.listPendingScore() as Array<{ id: number; content: string; user_id: string; user_nickname: string }>;
  const pending = allPending.filter(c => inserted.includes(c.id));
  if (pending.length === 0) return { collected: rawComments.length, highIntent: 0 };

  console.log(`AI 分析 ${pending.length} 条新评论...`);
  const results = await analyzeIntent(apiKey, pending.map(c => ({ id: c.id, content: c.content })));

  // 4. 更新意向分 + 触发动作
  let highIntentCount = 0;
  for (const r of results) {
    commentsDb.updateIntent(r.comment_id, r.score, r.label, r.reason);

    const comment = pending.find(c => c.id === r.comment_id);
    if (!comment) continue;

    if (r.score >= 60 && r.score < 80) {
      const replyText = autoReplyTemplate.replace('{nickname}', comment.user_nickname ?? '');
      const ok = await replyToComment(videoUrl, comment.user_id, replyText);
      if (ok) outreachDb.create(r.comment_id, comment.user_id, 'comment_reply', replyText);
    }

    if (r.score >= 80) {
      highIntentCount++;
      const dmContent = dmTemplate.replace('{nickname}', comment.user_nickname ?? '朋友');
      outreachDb.create(r.comment_id, comment.user_id, 'dm', dmContent);
    }
  }

  return { collected: rawComments.length, highIntent: highIntentCount };
}
