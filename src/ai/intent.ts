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
      res.on('data', (chunk: Buffer) => data += chunk);
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
