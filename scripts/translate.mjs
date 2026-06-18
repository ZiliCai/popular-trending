// Build-time translation via the free Google "gtx" endpoint (no API key).
// On any failure each call gracefully returns the original text, so the build
// never breaks — worst case the UI shows the original language.
const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

export function isChinese(s) {
  return /[一-鿿]/.test(s || '');
}

export function buildTranslateUrl(text, tl = 'zh-CN', sl = 'auto') {
  return `${ENDPOINT}?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
}

export function parseTranslateResponse(json) {
  if (!Array.isArray(json) || !Array.isArray(json[0])) return '';
  return json[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('');
}

export async function translateText(text, { fetchImpl = fetch, tl = 'zh-CN', retries = 1 } = {}) {
  const t = (text || '').trim();
  if (!t || isChinese(t)) return text || '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(buildTranslateUrl(t, tl), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = parseTranslateResponse(await res.json());
      if (out) return out;
      throw new Error('empty translation');
    } catch {
      if (attempt === retries) return text;
    }
  }
  return text;
}

// Translate many texts with limited concurrency, deduping identical inputs.
// Returns a lookup function: original text -> translated (or original on skip/fail).
export async function translateMany(texts, { fetchImpl = fetch, tl = 'zh-CN', concurrency = 5 } = {}) {
  const unique = [...new Set((texts || []).filter((t) => t && !isChinese(t)))];
  const out = new Map();
  let i = 0;
  const worker = async () => {
    while (i < unique.length) {
      const t = unique[i++];
      out.set(t, await translateText(t, { fetchImpl, tl }));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, unique.length)) }, worker));
  return (text) => (text && out.has(text) ? out.get(text) : text || '');
}
