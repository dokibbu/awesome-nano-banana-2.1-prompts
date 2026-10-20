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
const detail = (slug, zh) => `${SITE}${zh ? '/zh' : ''}/prompts/p/${slug}?${utm}`;
const modelPage = (zh) => `${SITE}${zh ? '/zh' : ''}/prompts/model/${cfg.modelPageSlug}?${utm}`;
const catPage = (slug, zh) => `${SITE}${zh ? '/zh' : ''}/prompts/${slug}?${utm}`;

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

const loc = (r, zh) => (zh && r.zh?.title ? r.zh : r.en) || {};
const fence = (t) => {
  let f = '```';
  while (t.includes(f)) f += '`';
  return `${f}text\n${t.trim()}\n${f}`;
};
const md = (s) => String(s || '').replace(/\|/g, '\\|');

function card(r, zh, rel) {
  const L = loc(r, zh);
  const a = r.author;
  const T = zh
    ? { by: '原作者', src: '原帖', open: '在 cinel 上查看详情并一键生成' }
    : { by: 'Author', src: 'Original post', open: 'View on cinel and generate with this prompt' };
  const w = r.images.width, h = r.images.height;
  return [
    `### ${md(L.title || r.slug)}`,
    '',
    `<a href="${detail(r.slug, zh)}"><img src="${rel}images/${r.slug}.webp" alt="${md(L.title || r.slug).replace(/"/g, '&quot;')}" width="${w >= h ? 480 : 360}"></a>`,
    '',
    L.short_note ? `> ${String(L.short_note).replace(/\n+/g, ' ')}\n` : '',
    fence(r.filled_prompt || r.original_prompt),
    '',
    `- ${T.by}: [@${a.handle}](${a.profile_url || `https://x.com/${a.handle}`})`,
    `- ${T.src}: ${r.source_url}`,
    `- [${T.open}](${detail(r.slug, zh)})`,
    '',
  ].join('\n');
}

const byCat = categories
  .map((c) => ({ c, list: items.filter((r) => r.category === c.slug) }))
  .filter((x) => x.list.length);
const featuredFor = (list) => {
  const fs_ = list.filter((r) => featured.includes(r.slug));
  const rest = list.filter((r) => !featured.includes(r.slug));
  return [...fs_, ...rest].slice(0, cfg.featuredPerCategory || 6);
};

function legal(zh) {
  return zh
    ? `## 许可与版权\n\n- 代码（scripts/、.github/）：MIT，见 [LICENSE](LICENSE)。\n- 提示词与示例：版权归各条目注明的原作者所有，**不是 CC0**。本仓库仅做索引和引用，每条都标注原作者和原帖链接。部分数据来自 MeiGen.ai 的 [NanoBanana Trending Prompts](https://github.com/jau123/nanobanana-trending-prompts)，遵循 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；我们做了修改（补全占位符、用 ${cfg.modelName} 重新生成示例图）。详见 [CONTENT_LICENSE.md](CONTENT_LICENSE.md)。\n- 删除请求：如果你是原作者，希望删除或修改署名，请通过 [cinel.ai](https://cinel.ai) 联系我们，或在本仓库提 Issue，我们会尽快处理。\n`
    : `## License & credits\n\n- Code (scripts/, .github/): MIT, see [LICENSE](LICENSE).\n- Prompts and examples: rights belong to the original authors credited on each item. This is **not CC0**. Every entry links to the author and the original post. Part of the data comes from [NanoBanana Trending Prompts](https://github.com/jau123/nanobanana-trending-prompts) by MeiGen.ai, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); changes were made (placeholders filled, example images regenerated with ${cfg.modelName}). See [CONTENT_LICENSE.md](CONTENT_LICENSE.md).\n- Takedown: if you are an original author and want an item removed or the credit changed, contact us via [cinel.ai](https://cinel.ai) or open an issue. We act on requests promptly.\n`;
}

function readme(zh) {
  const name = (c) => (zh ? c.zh?.name : c.en?.name) || c.slug;
  const out = [];
  out.push(`# ${zh ? cfg.titleZh : cfg.title}`, '');
  out.push(zh ? `[English](README.md) | 中文` : `English | [中文](README_zh.md)`, '');
  out.push(
    zh
      ? `精选 **${items.length}** 条 ${cfg.modelName} 提示词，每条都附示例图、完整提示词、原作者和原帖链接。数据来自 [cinel.ai](${modelPage(true)}) 提示词库，自动同步更新。`
      : `A curated list of **${items.length}** ${cfg.modelName} prompts. Each one has an example image, the full prompt, and credit to the original author with a link to the original post. Data comes from the [cinel.ai](${modelPage(false)}) prompt library and syncs automatically.`,
    ''
  );
  out.push(zh ? `👉 [在 cinel.ai 浏览全部并在线生成](${modelPage(true)})` : `👉 [Browse all and generate online at cinel.ai](${modelPage(false)})`, '');
  out.push(zh ? '## 目录' : '## Contents', '');
  for (const { c, list } of byCat)
    out.push(`- [${name(c)}](#${c.slug}) (${list.length}) · [${zh ? '全部' : 'all'}](cases/${zh ? 'zh/' : ''}${c.slug}.md)`);
  out.push('');
  for (const { c, list } of byCat) {
    out.push(`<a id="${c.slug}"></a>`, '', `## ${name(c)}`, '');
    out.push(
      zh
        ? `精选 ${Math.min(list.length, cfg.featuredPerCategory || 6)} 条 · [查看本类全部 ${list.length} 条](cases/zh/${c.slug}.md) · [cinel 分类页](${catPage(c.slug, true)})`
        : `Featured ${Math.min(list.length, cfg.featuredPerCategory || 6)} · [See all ${list.length}](cases/${c.slug}.md) · [Category on cinel](${catPage(c.slug, false)})`,
      ''
    );
    for (const r of featuredFor(list)) out.push(card(r, zh, ''));
  }
  out.push(legal(zh));
  return out.join('\n');
}

function casePage(c, list, zh) {
  const name = (zh ? c.zh?.name : c.en?.name) || c.slug;
  const back = zh ? '../../README_zh.md' : '../README.md';
  const rel = zh ? '../../' : '../';
  return [
    `# ${name} · ${cfg.modelName} ${zh ? '提示词' : 'Prompts'}`,
    '',
    `[← ${zh ? '返回首页' : 'Back to README'}](${back}) · ${list.length} ${zh ? '条' : 'prompts'} · [cinel](${catPage(c.slug, zh)})`,
    '',
    ...list.map((r) => card(r, zh, rel)),
    zh ? '版权归各条目原作者所有；删除请求请通过 cinel.ai 联系。' : 'Rights belong to the credited original authors. Takedown requests: contact via cinel.ai.',
    '',
  ].join('\n');
}

fs.rmSync(path.join(ROOT, 'cases'), { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'cases/zh'), { recursive: true });
for (const { c, list } of byCat) {
  fs.writeFileSync(path.join(ROOT, 'cases', `${c.slug}.md`), casePage(c, list, false));
  fs.writeFileSync(path.join(ROOT, 'cases/zh', `${c.slug}.md`), casePage(c, list, true));
}
fs.writeFileSync(path.join(ROOT, 'README.md'), readme(false));
fs.writeFileSync(path.join(ROOT, 'README_zh.md'), readme(true));
fs.writeFileSync(
  path.join(ROOT, 'data.json'),
  JSON.stringify({ model: cfg.model, count: items.length, categories: Object.fromEntries(byCat.map(({ c, list }) => [c.slug, list.length])), slugs: items.map((r) => r.slug) }, null, 2) + '\n'
);
console.log(`${cfg.repo}: ${items.length} items, ${byCat.length} categories`);
