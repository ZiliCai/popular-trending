import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchGithubTrending } from './sources/githubTrending.mjs';
import { fetchRecentHighStars } from './sources/recentHighStars.mjs';
import { fetchHelloGitHub } from './sources/helloGitHub.mjs';
import { fetchHnPh } from './sources/hnph.mjs';
import { validateLatest, failResult } from './normalize.mjs';

const OUT = fileURLToPath(new URL('../public/data/latest.json', import.meta.url));

export function buildLatest(results, nowIso) {
  return {
    updatedAt: nowIso,
    sources: {
      githubTrending: results.githubTrending,
      recentHighStars: results.recentHighStars,
      helloGitHub: results.helloGitHub,
      hnph: results.hnph,
    },
  };
}

export async function main() {
  const settled = await Promise.allSettled([
    fetchGithubTrending({ limit: 25 }),
    fetchRecentHighStars({ limit: 25 }),
    fetchHelloGitHub({ limit: 15 }),
    fetchHnPh({ hnLimit: 12, phLimit: 6 }),
  ]);
  const [gt, rh, hg, hp] = settled.map((s) => (s.status === 'fulfilled' ? s.value : failResult(s.reason)));
  const data = buildLatest({ githubTrending: gt, recentHighStars: rh, helloGitHub: hg, hnph: hp }, new Date().toISOString());
  const errors = validateLatest(data);
  if (errors.length) { console.error('Schema errors:', errors); process.exitCode = 1; }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log('Wrote ' + OUT + ': ' + Object.entries(data.sources)
    .map(([k, v]) => `${k}=${v.items.length}${v.ok ? '' : '(failed)'}`).join(' '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
