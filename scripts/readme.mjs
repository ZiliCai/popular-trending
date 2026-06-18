// Fetch a repo's README and reduce it to a plain-text excerpt for LLM context.
const README_URL = (fullName) => `https://api.github.com/repos/${fullName}/readme`;

export function readmeExcerpt(md, max = 1200) {
  if (!md) return '';
  let s = String(md);
  s = s.replace(/```[\s\S]*?```/g, ' ');        // code fences
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');         // html comments
  s = s.replace(/<[^>]+>/g, ' ');                 // html tags
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');    // images
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');  // links -> text
  s = s.replace(/^[#>*\-\s]+/gm, ' ');            // leading list/heading markers
  s = s.replace(/[`*_>#|]/g, ' ');                // stray markdown
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, max);
}

export async function fetchReadme(fullName, { fetchImpl = fetch, token = process.env.GITHUB_TOKEN } = {}) {
  if (!fullName) return '';
  try {
    const headers = { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'trending-dashboard' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(README_URL(fullName), { headers });
    if (!res.ok) return '';
    return readmeExcerpt(await res.text());
  } catch {
    return '';
  }
}

// Fetch many READMEs with limited concurrency, deduping. Returns a lookup fn.
export async function fetchReadmes(fullNames, { fetchImpl = fetch, token = process.env.GITHUB_TOKEN, concurrency = 6 } = {}) {
  const unique = [...new Set((fullNames || []).filter(Boolean))];
  const map = new Map();
  let i = 0;
  const worker = async () => {
    while (i < unique.length) {
      const fn = unique[i++];
      map.set(fn, await fetchReadme(fn, { fetchImpl, token }));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, unique.length)) }, worker));
  return (fn) => map.get(fn) || '';
}
