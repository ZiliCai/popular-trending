import { cardHtml, filterItems } from './render.mjs';

const grid = document.getElementById('grid');
const searchEl = document.getElementById('search');
const updatedEl = document.getElementById('updated');
const tabs = [...document.querySelectorAll('.tab')];

let data = null;
let activeSource = 'githubTrending';

function render() {
  if (!data) return;
  const src = data.sources[activeSource];
  if (!src || src.ok === false) {
    grid.innerHTML = `<p class="state">本次未更新${src && src.error ? `（${src.error}）` : ''}</p>`;
    return;
  }
  const items = filterItems(src.items || [], searchEl.value.trim());
  grid.innerHTML = items.length
    ? items.map((it, i) => cardHtml(it, activeSource).replace('class="card', i === 0 ? 'class="card hero' : 'class="card')).join('')
    : `<p class="state">没有匹配的项目</p>`;
}

function setActive(source) {
  activeSource = source;
  tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.source === source));
  render();
}

tabs.forEach((t) => t.addEventListener('click', () => setActive(t.dataset.source)));
searchEl.addEventListener('input', render);

document.getElementById('theme').addEventListener('click', () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
});

fetch('./data/latest.json')
  .then((r) => r.json())
  .then((d) => {
    data = d;
    updatedEl.textContent = new Date(d.updatedAt).toLocaleString('zh-CN');
    render();
  })
  .catch((err) => { grid.innerHTML = `<p class="state">加载失败：${err.message}</p>`; });
