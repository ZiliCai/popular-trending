export function cleanText(s) {
  if (s == null) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

export function parseCount(v) {
  if (typeof v === 'number') return Math.round(v);
  if (v == null) return 0;
  const s = String(v).trim().toLowerCase().replace(/,/g, '');
  const m = s.match(/^([\d.]+)\s*([km]?)/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return 0;
  if (m[2] === 'k') n *= 1000;
  else if (m[2] === 'm') n *= 1_000_000;
  return Math.round(n);
}

export function makeResult(items, { ok = true, error = null } = {}) {
  return { ok, error, items: Array.isArray(items) ? items : [] };
}

export function failResult(error) {
  const msg = error && error.message ? error.message : String(error);
  return { ok: false, error: msg, items: [] };
}

export const SOURCE_KEYS = ['githubTrending', 'recentHighStars', 'helloGitHub', 'hnph'];

export function validateLatest(data) {
  const errors = [];
  if (!data || typeof data !== 'object') { errors.push('root is not an object'); return errors; }
  if (typeof data.updatedAt !== 'string' || !data.updatedAt) errors.push('updatedAt missing/empty');
  if (!data.sources || typeof data.sources !== 'object') { errors.push('sources missing'); return errors; }
  for (const key of SOURCE_KEYS) {
    const s = data.sources[key];
    if (!s || typeof s !== 'object') { errors.push(`sources.${key} missing`); continue; }
    if (typeof s.ok !== 'boolean') errors.push(`sources.${key}.ok not boolean`);
    if (!Array.isArray(s.items)) errors.push(`sources.${key}.items not array`);
  }
  return errors;
}
