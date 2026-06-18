export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatCount(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

export function itemMatches(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const hay = [item.repo, item.name, item.title, item.desc].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

export function filterItems(items, query) {
  return items.filter((it) => itemMatches(it, query));
}

function langSpan(lang) {
  return lang ? `<span class="lang"><span class="dot"></span>${escapeHtml(lang)}</span>` : '';
}

export function cardHtml(item, sourceKey) {
  const title = escapeHtml(item.repo || item.name || item.title || '');
  const url = escapeHtml(item.url || '#');
  const desc = item.desc ? `<p class="desc">${escapeHtml(item.desc)}</p>` : '';
  let meta = '';
  if (sourceKey === 'githubTrending') {
    meta = `<div class="meta"><span class="stars">★ ${formatCount(item.stars)}</span>`
      + (item.todayStars ? `<span class="today">▲ ${formatCount(item.todayStars)}</span>` : '')
      + langSpan(item.lang) + `</div>`;
  } else if (sourceKey === 'recentHighStars') {
    const topics = (!item.desc && Array.isArray(item.topics) && item.topics.length)
      ? `<div class="topics">${item.topics.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    meta = `<div class="meta"><span class="stars">★ ${formatCount(item.stars)}</span>${langSpan(item.lang)}</div>${topics}`;
  } else if (sourceKey === 'helloGitHub') {
    meta = `<div class="meta">`
      + (item.category ? `<span class="chip">${escapeHtml(item.category)}</span>` : '')
      + langSpan(item.lang) + `</div>`;
  } else if (sourceKey === 'hnph') {
    meta = item.kind === 'hn'
      ? `<div class="meta"><span class="points">▲ ${formatCount(item.points)}</span><span class="comments">${formatCount(item.comments)} 评论</span></div>`
      : `<div class="meta"><span class="chip ph">Product Hunt</span></div>`;
  }
  return `<a class="card source-${sourceKey}" href="${url}" target="_blank" rel="noopener"><h3 class="title">${title}</h3>${desc}${meta}</a>`;
}
