// Editorial rewrite (2-3 sentence, README-informed) + "is it broadly
// interesting?" filtering via an OpenAI-compatible LLM (DeepSeek by default).
// Build-time only. On failure returns null so the caller falls back to plain
// translation. Calls are chunked so large batches never truncate the JSON.
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const SYSTEM = `你是科技内容编辑，给开源项目 / 科技条目写"让普通科技爱好者也想点开看"的中文简介。
对每个条目：
1) plain：写 2-3 句中文（共约 50-120 字），主要依据提供的 README 摘要，说清楚【是什么】+【为什么有意思 / 亮点】+【适合谁】。要有信息量和"钩子"，不要只给一句干巴巴的定义，也不要堆术语。没有 README 摘要时，就根据名称和原简介尽量写具体，别空泛。
2) keep：是否"大众向"。实用工具 / 应用 / 库 / 框架 / 有创意或好玩的项目 / 学习资源 => true；仅特定学术领域的科研代码、单篇论文复现、窄领域科学模型、纯数据集、课程作业等只有该领域专家才关心的 => false。拿不准时倾向 true。
只输出 JSON，不要解释。`;

export function buildEnrichMessages(items) {
  const list = items.map((it, i) => {
    const readme = it._readme ? `\n   README摘要：${it._readme}` : '';
    return `${i}. ${it._label}｜${it._text || '(无简介)'}${readme}`;
  }).join('\n\n');
  const user = `下面每个条目为 "序号. 名称｜原简介"，可能附一行 README 摘要：\n${list}\n\n` +
    `输出 JSON：{"items":[{"i":序号,"plain":"2-3句中文简介","keep":true 或 false}, ...]}，为上面每个序号都给一条。`;
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];
}

export function parseEnrichResponse(content, count) {
  let obj;
  try {
    obj = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return null;
  }
  const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.items) ? obj.items : null;
  if (!arr) return null;
  const out = new Array(count).fill(null);
  for (const e of arr) {
    const i = Number(e?.i);
    if (Number.isInteger(i) && i >= 0 && i < count) {
      out[i] = { plain: typeof e.plain === 'string' ? e.plain.trim() : '', keep: e.keep !== false };
    }
  }
  return out;
}

async function callDeepSeek(items, { fetchImpl, apiKey, model }) {
  const res = await fetchImpl(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: buildEnrichMessages(items),
      temperature: 0.4,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

export async function enrichItems(items, { fetchImpl = fetch, apiKey = process.env.DEEPSEEK_API_KEY, model = 'deepseek-chat', batchSize = 18 } = {}) {
  if (!apiKey || !items || !items.length) return null;
  const out = new Array(items.length).fill(null);
  let any = false;
  for (let start = 0; start < items.length; start += batchSize) {
    const chunk = items.slice(start, start + batchSize);
    try {
      const parsed = parseEnrichResponse(await callDeepSeek(chunk, { fetchImpl, apiKey, model }), chunk.length);
      if (parsed) {
        any = true;
        parsed.forEach((e, j) => { if (e) out[start + j] = e; });
      }
    } catch (err) {
      console.error('enrich batch failed:', err.message);
    }
  }
  return any ? out : null;
}
