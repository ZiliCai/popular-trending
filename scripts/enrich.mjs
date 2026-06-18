// Plain-language rewrite + "is it broadly interesting?" filtering via an
// OpenAI-compatible LLM (DeepSeek by default). Build-time only.
// On any failure returns null so the caller falls back to plain translation.
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const SYSTEM = `你是科技内容编辑。给定一批开源项目 / 科技条目，对每一个做两件事：
1) plain：用一句"大白话"中文简介，面向普通科技爱好者，不超过 40 字，不堆专业术语，讲清楚"它是干什么的、对谁有用"。
2) keep：判断它是否"大众向"。实用工具 / 应用 / 库 / 框架 / 好玩或有创意的项目 / 学习资源 => true；仅特定学术领域的科研代码、单篇论文复现、窄领域科学模型、纯数据集、课程作业等只有该领域专家才关心的 => false。拿不准时倾向 true，不要过度过滤。
只输出 JSON，不要解释。`;

export function buildEnrichMessages(items) {
  const list = items.map((it, i) => `${i}. ${it._label}｜${it._text || '(无简介)'}`).join('\n');
  const user = `下面每行是一个条目，格式 "序号. 名称｜原简介"：\n${list}\n\n` +
    `输出 JSON：{"items":[{"i":序号,"plain":"大白话中文简介","keep":true 或 false}, ...]}，为上面每个序号都给一条。`;
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

export async function enrichItems(items, { fetchImpl = fetch, apiKey = process.env.DEEPSEEK_API_KEY, model = 'deepseek-chat' } = {}) {
  if (!apiKey || !items || !items.length) return null;
  try {
    const res = await fetchImpl(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: buildEnrichMessages(items),
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return parseEnrichResponse(data?.choices?.[0]?.message?.content, items.length);
  } catch (err) {
    console.error('enrich failed:', err.message);
    return null;
  }
}
