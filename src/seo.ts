import type { Env } from './types';
import { escapeHtml } from './utils';
import { getPublicArticle, sanitizeArticleHtml } from './articles';

const JOURNAL = 'VINCENT JOURNAL';
const PERSON = '林哲緯';
const PERSON_PATH = '/about/vincent-lin';
const DESCRIPTION = 'VINCENT JOURNAL：以醫學知識理解男性美學、健康老化與長壽科學，分享有證據、克制且清楚的觀點。';

function origin(env: Env, request: Request): string {
  try { return new URL(env.PUBLIC_BASE_URL).origin; }
  catch { return new URL(request.url).origin; }
}
function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}
function respond(request: Request, body: string, contentType: string, status = 200, cache = 'public, max-age=300'): Response {
  return new Response(request.method === 'HEAD' ? null : body, {
    status,
    headers: { 'content-type': contentType, 'cache-control': cache }
  });
}
function meta(name: string, value: string): string {
  return '<meta name="' + escapeHtml(name) + '" content="' + escapeHtml(value) + '">';
}
function schema(data: unknown): string {
  return '<script type="application/ld+json">' + escapeJson(data) + '</script>';
}
function canonical(url: string): string {
  return '<link rel="canonical" href="' + escapeHtml(url) + '">';
}
function htmlDate(date: unknown): string {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date) ? date : '';
}
function urlForArticle(base: string, slug: string): string {
  return base + '/article.html?id=' + encodeURIComponent(slug);
}
function isVincent(name: unknown): boolean {
  return ['林哲緯', 'Vincent Lin', 'Che-Wei Lin', 'Che-Wei, Lin'].includes(String(name || '').trim());
}
function humanAuthor(base: string): object {
  return { '@type': 'Person', '@id': base + PERSON_PATH + '#person', name: PERSON,
    alternateName: ['Vincent Lin', 'Che-Wei Lin'] };
}

async function renderArticle(request: Request, env: Env, base: string, slug: string): Promise<Response | null> {
  let article: any;
  try { article = await getPublicArticle(env, slug); }
  catch { return null; } // Retain the existing client-side demo/fallback experience.
  const assetUrl = new URL('/article.html', request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  if (!asset.ok) return asset;
  const title = String(article.seo_title || article.title || JOURNAL).trim();
  const summary = String(article.seo_description || article.excerpt || article.subtitle || DESCRIPTION).trim().slice(0, 180);
  const location = urlForArticle(base, article.slug);
  const byline = String(article.author_name || '').trim();
  const author = isVincent(byline) ? humanAuthor(base) :
    (byline ? { '@type': 'Person', name: byline } : { '@type': 'Organization', name: JOURNAL });
  const imageUrl = /^https:\/\//i.test(String(article.cover_url || '')) ? article.cover_url : null;
  const structured: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    '@id': location + '#article', headline: article.title, description: summary,
    mainEntityOfPage: { '@type': 'WebPage', '@id': location }, inLanguage: 'zh-Hant',
    author, publisher: { '@type': 'Organization', name: JOURNAL, url: base },
    datePublished: htmlDate(article.published_at) || undefined,
    dateModified: htmlDate(article.updated_at) || undefined,
    image: imageUrl || undefined
  };
  const extraHead = meta('description', summary) + canonical(location) +
    '<meta property="og:type" content="article">' +
    '<meta property="og:title" content="' + escapeHtml(title) + '">' +
    '<meta property="og:description" content="' + escapeHtml(summary) + '">' +
    '<meta property="og:url" content="' + escapeHtml(location) + '">' +
    (imageUrl ? '<meta property="og:image" content="' + escapeHtml(imageUrl) + '">' : '') +
    (isVincent(byline) ? '<link rel="author" href="' + PERSON_PATH + '">' : '') +
    schema(structured);
  const body = '<div class="meta">' + escapeHtml(article.category || 'EDITORIAL') + '</div>' +
    '<h1 class="article-title">' + escapeHtml(article.title) + '</h1>' +
    '<p class="lead">' + escapeHtml(article.excerpt || article.subtitle || '') + '</p>' +
    (imageUrl ? '<img class="cover" src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(article.cover_alt || article.title) + '">' : '') +
    (byline ? '<p class="meta">作者：' +
      (isVincent(byline) ? '<a href="' + PERSON_PATH + '">' + escapeHtml(byline) + '</a>' : escapeHtml(byline)) +
      '</p>' : '') +
    '<div class="article-body">' + sanitizeArticleHtml(String(article.body || '')) + '</div>';
  const template = await asset.text();
  const replaced = template.replace(/<title>[^<]*<\/title>/, '<title>' + escapeHtml(title) + '｜' + JOURNAL + '</title>')
    .replace('</head>', extraHead + '</head>')
    .replace('<article class="article-reader" id="articleRoot"></article>',
      '<article class="article-reader" id="articleRoot">' + body + '</article>');
  return respond(request, replaced, 'text/html; charset=utf-8');
}

function renderPerson(request: Request, base: string): Response {
  const page = base + PERSON_PATH;
  const title = '林哲緯 Vincent Lin｜關於作者｜VINCENT JOURNAL';
  const description = '林哲緯（Vincent Lin／Che-Wei Lin）是 VINCENT JOURNAL 的內容創作者，關注男性外觀美學、醫學知識、健康老化與長壽科學。';
  const person = { '@context': 'https://schema.org', '@type': 'ProfilePage', '@id': page,
    mainEntity: { ...humanAuthor(base), description: '醫學系學生、醫學內容創作者；關注男性美學及健康老化。',
      url: page, knowsAbout: ['男性美學', '健康老化', '醫學知識傳播', '長壽科學'] } };
  const markup = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#f7f5f0">' +
    '<title>' + escapeHtml(title) + '</title>' + meta('description', description) + canonical(page) +
    '<meta property="og:type" content="profile"><meta property="og:title" content="' + escapeHtml(title) + '">' +
    '<meta property="og:description" content="' + escapeHtml(description) + '">' + schema(person) +
    '<link rel="stylesheet" href="/styles.css">' +
    '</head><body><header class="site-header shell"><a class="wordmark" href="/">VINCENT <span>JOURNAL</span></a>' +
    '<p class="brand-subtitle">AESTHETICS · HEALTHY AGING · LONGEVITY</p>' +
    '<nav class="site-nav"><a href="/discover">DISCOVER</a><a href="/">HOME</a></nav></header>' +
    '<main class="shell" style="max-width:900px;min-height:65vh;padding:90px 24px">' +
    '<p class="meta">THE EDITOR / ABOUT</p><h1 style="font-size:clamp(2.8rem,8vw,6rem);line-height:1.1">林哲緯 <span style="font-weight:400">Vincent Lin</span></h1>' +
    '<p style="font-size:1.15rem;line-height:1.9;max-width:680px;margin-top:32px">我是一名醫學系學生，也是 VINCENT JOURNAL 的內容創作者。我關心醫學知識如何轉化為有判斷力的生活觀點，特別聚焦男性外觀美學、健康老化與長壽科學。</p>' +
    '<p style="line-height:1.9;max-width:680px">在這裡，我希望以解剖、研究及醫學證據作為討論的起點，保留個體差異、風險與尚待驗證的問題。克制、精準、自然，是我理解美學的方式。</p>' +
    '<p style="line-height:1.9;max-width:680px">英文姓名亦使用 Che-Wei Lin。此網站內容為知識與觀點分享，不構成個別診斷、治療建議或醫療服務招攬。</p>' +
    '<p style="margin-top:32px"><a class="outline-cta" href="/discover">閱讀文章 ↗</a></p>' +
    '</main><footer class="site-footer"><a class="footer-wordmark" href="/">VINCENT JOURNAL</a><span>© VINCENT JOURNAL</span></footer></body></html>';
  return respond(request, markup, 'text/html; charset=utf-8');
}

async function sitemap(request: Request, env: Env, base: string): Promise<Response> {
  const pages: { url: string; modified?: string }[] = [
    { url: base + '/' }, { url: base + '/discover' }, { url: base + PERSON_PATH }
  ];
  try {
    const result = await env.DB.prepare(
      "SELECT slug, updated_at FROM articles WHERE status='published' AND (published_at IS NULL OR published_at<=?) ORDER BY published_at DESC LIMIT 1000"
    ).bind(new Date().toISOString()).all<{slug: string; updated_at: string}>();
    for (const row of result.results || []) {
      pages.push({ url: urlForArticle(base, row.slug), modified: htmlDate(row.updated_at) });
    }
  } catch (e) { console.error('sitemap_articles_failed', e); }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    pages.map(item => '<url><loc>' + escapeHtml(item.url) + '</loc>' +
      (item.modified ? '<lastmod>' + escapeHtml(item.modified.slice(0, 10)) + '</lastmod>' : '') +
      '</url>').join('') + '</urlset>';
  return respond(request, xml, 'application/xml; charset=utf-8', 200, 'public, max-age=600');
}

/** Return null for every route unrelated to SEO, CMS and website visuals remain unchanged. */
export async function handleSeoRoute(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const base = origin(env, request);
  if (url.pathname === '/robots.txt') {
    const text = 'User-agent: *\nAllow: /\nDisallow: /studio\nDisallow: /api/admin/\nSitemap: ' +
      base + '/sitemap.xml\n';
    return respond(request, text, 'text/plain; charset=utf-8');
  }
  if (url.pathname === '/sitemap.xml') return sitemap(request, env, base);
  if (url.pathname === PERSON_PATH || url.pathname === PERSON_PATH + '/') return renderPerson(request, base);
  if ((url.pathname === '/article.html' || url.pathname === '/article') && url.searchParams.get('id') &&
      url.searchParams.get('id') !== 'about') {
    return renderArticle(request, env, base, url.searchParams.get('id')!);
  }
  return null;
}
