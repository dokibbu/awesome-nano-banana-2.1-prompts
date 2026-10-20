#!/usr/bin/env node
// Generates README.md, README_zh.md, cases/*.md and images/ from the cinel-app prompt library.
// Usage: node scripts/generate.mjs --src /path/to/cinel-app
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.resolve(args.src || process.env.CINEL_APP_DIR || '../cinel-app');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const P = path.join(SRC, 'src/content/prompts');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(P, f), 'utf8'));

const records = readJson('prompts.json').records;
const categories = [...readJson('categories.json').categories].sort((a, b) => a.order - b.order);
const featured = readJson('featured.json').slugs;
const dimensions = readJson('dimensions.json');
const NOINDEX = new Set(['held_out', 'replaced', 'still_bad', 'removed']);
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\./g, '-');

// Mirrors promptsForExampleModel() / isPromptIndexable() in cinel-app src/lib/prompts-gallery.ts
const items = records
  .filter((r) => r.review?.status !== 'removed' && r.content_status === 'complete')
  .filter((r) => r.author?.handle && r.source_url && !NOINDEX.has(r.review?.status ?? ''))
  .filter((r) => r.images?.width && r.images?.height && dimensions[r.slug])
  .filter((r) => norm(r.model_used) === norm(cfg.model))
  .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));

const SITE = 'https://cinel.ai';
const utm = `utm_source=github&utm_medium=awesome&utm_campaign=${cfg.repo}`;

// Images
const imgDir = path.join(ROOT, 'images');
fs.mkdirSync(imgDir, { recursive: true });
const keep = new Set();
for (const r of items) {
  const src = path.join(SRC, 'public/prompts/large', `${r.slug}.webp`);
  if (!fs.existsSync(src)) throw new Error(`missing image ${src}`);
  const name = `${r.slug}.webp`;
  keep.add(name);
  const dst = path.join(imgDir, name);
  const buf = fs.readFileSync(src);
  if (!fs.existsSync(dst) || !buf.equals(fs.readFileSync(dst))) fs.writeFileSync(dst, buf);
}
for (const f of fs.readdirSync(imgDir)) if (!keep.has(f)) fs.rmSync(path.join(imgDir, f));

const I18N = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n.json'), 'utf8'));
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const detailL = (slug, t) => `${SITE}${t.site}/prompts/p/${slug}?${utm}`;
const modelPageL = (t) => `${SITE}${t.site}/prompts/model/${cfg.modelPageSlug}?${utm}`;
const catPageL = (slug, t) => `${SITE}${t.site}/prompts/${slug}?${utm}`;
const fence = (t) => {
  let f = '```';
  while (t.includes(f)) f += '`';
  return `${f}text\n${t.trim()}\n${f}`;
};
const md = (s) => String(s || '').replace(/\|/g, '\\|');
const badge = (s) => encodeURIComponent(String(s).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_'));

function badges(rel) {
  return Object.values(I18N)
    .map((t) => `[![${t.flag} ${t.name}](https://img.shields.io/badge/${badge(`${t.flag} ${t.name}`)}-${badge(t.view)}-${t.color})](${rel}${t.file})`)
    .join('\n');
}

function card(r, t, rel) {
  const L = (t.zhContent && r.zh?.title ? r.zh : r.en) || {};
  const a = r.author;
  const w = r.images.width, h = r.images.height;
  const title = md(L.title || r.slug);
  return [
    `### ${title}`,
    '',
    `<a href="${detailL(r.slug, t)}"><img src="${rel}images/${r.slug}.webp" alt="${title.replace(/"/g, '&quot;')}" width="${w >= h ? 480 : 360}"></a>`,
    '',
    L.short_note ? `> ${String(L.short_note).replace(/\n+/g, ' ')}\n` : '',
    fence(r.filled_prompt || r.original_prompt),
    '',
    `- ${t.by}: [@${a.handle}](${a.profile_url || `https://x.com/${a.handle}`})`,
    `- ${t.src}: ${r.source_url}`,
    `- [${t.open}](${detailL(r.slug, t)})`,
    '',
  ].join('\n');
}

const byCat = categories
  .map((c) => ({ c, list: items.filter((r) => r.category === c.slug) }))
  .filter((x) => x.list.length);
const K = cfg.featuredPerCategory || 6;
const featuredFor = (list) => {
  const a = list.filter((r) => featured.includes(r.slug));
  const b = list.filter((r) => !featured.includes(r.slug));
  return [...a, ...b].slice(0, K);
};
const catName = (c, t) => t.cats?.[c.slug] || c.en?.name || c.slug;

function readme(t) {
  const v = { model: cfg.modelName, n: items.length, modelPage: modelPageL(t) };
  const out = [`# ${fill(t.title, v)}`, '', badges(''), ''];
  out.push(fill(t.intro, v), '', `👉 [${t.browse}](${modelPageL(t)})`, '');
  out.push(`## ${t.contents}`, '');
  for (const { c, list } of byCat)
    out.push(`- [${catName(c, t)}](#${c.slug}) (${list.length}) · [${t.all}](cases/${t.cases}${c.slug}.md)`);
  out.push('');
  for (const { c, list } of byCat) {
    out.push(`<a id="${c.slug}"></a>`, '', `## ${catName(c, t)}`, '');
    out.push(`${fill(t.featured, { k: Math.min(list.length, K) })} · [${fill(t.seeAll, { n: list.length })}](cases/${t.cases}${c.slug}.md) · [${t.catOnCinel}](${catPageL(c.slug, t)})`, '');
    for (const r of featuredFor(list)) out.push(card(r, t, ''));
  }
  out.push(`## ${t.licenseH}`, '', t.license, '');
  return out.join('\n');
}

function casePage(c, list, t, depth) {
  const rel = depth;
  return [
    `# ${catName(c, t)} · ${cfg.modelName}`,
    '',
    `[← README](${rel}${t.file}) · ${list.length} · [${t.catOnCinel}](${catPageL(c.slug, t)})`,
    '',
    ...list.map((r) => card(r, t, rel)),
  ].join('\n');
}

fs.rmSync(path.join(ROOT, 'cases'), { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'cases/zh'), { recursive: true });
for (const { c, list } of byCat) {
  fs.writeFileSync(path.join(ROOT, 'cases', `${c.slug}.md`), casePage(c, list, I18N.en, '../'));
  fs.writeFileSync(path.join(ROOT, 'cases/zh', `${c.slug}.md`), casePage(c, list, I18N.zh, '../../'));
}
for (const t of Object.values(I18N)) fs.writeFileSync(path.join(ROOT, t.file), readme(t));
fs.writeFileSync(
  path.join(ROOT, 'data.json'),
  JSON.stringify({ model: cfg.model, count: items.length, categories: Object.fromEntries(byCat.map(({ c, list }) => [c.slug, list.length])), slugs: items.map((r) => r.slug) }, null, 2) + '\n'
);
console.log(`${cfg.repo}: ${items.length} items, ${byCat.length} categories, ${Object.keys(I18N).length} READMEs`);
