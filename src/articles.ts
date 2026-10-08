import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { asInt, escapeHtml, nowIso, slugify, uuid } from './utils';
import { requireRole } from './auth';
import { audit } from './audit';

const categories = new Set(['aesthetics','healthy-aging','longevity']);

function readHtmlAttr(raw:string,name:string):string|null {
  const re=new RegExp("\\b"+name+"\\s*=\\s*(?:\\\"([^\\\"]*)\\\"|'([^']*)'|([^\\s\\\"'=<>]+))","i");
  const m=raw.match(re); return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}
function safeHref(value:string):string|null {
  const v=value.trim(), lower=v.toLowerCase();
  if(/^https?:\/\//.test(lower) || /^mailto:/.test(lower) || /^tel:/.test(lower) || /^#/.test(v) || /^\/(?!\/)/.test(v) || /^\.\.?\//.test(v)) return v;
  return null;
}
function safeImageSrc(value:string):string|null {
  const v=value.trim(), lower=v.toLowerCase();
  if(/^https?:\/\//.test(lower) || /^\/media\//.test(v) || /^assets\//.test(v) || /^\.\.?\/assets\//.test(v)) return v;
  return null;
}
function sanitizeArticleHtml(input:string):string {
  const allowed=new Set(['p','h2','h3','h4','blockquote','ul','ol','li','strong','b','em','i','u','br','hr','a','code','pre','sup','sub','figure','figcaption','img']);
  const voids=new Set(['br','hr','img']);
  let html=input.slice(0,100_000)
    .replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<(script|style|iframe|object|embed|form|template|svg|math|noscript|meta|link|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
    .replace(/<(script|style|iframe|object|embed|form|template|svg|math|noscript|meta|link|base)\b[^>]*\/?\s*>/gi,'');
  html=html.replace(/<\s*(\/?)\s*([a-z0-9:-]+)([^>]*)>/gi,(full,closing,nameRaw,attrs)=>{
    const name=String(nameRaw).toLowerCase();
    if(!allowed.has(name)) return '';
    if(closing) return voids.has(name)?'':`</${name}>`;
    if(name==='a'){
      const hrefRaw=readHtmlAttr(String(attrs),'href');
      const href=hrefRaw?safeHref(hrefRaw):null;
      const targetRaw=readHtmlAttr(String(attrs),'target');
      const target=targetRaw==='_blank'?' target="_blank" rel="noopener noreferrer"':'';
      return `<a${href?` href="${escapeHtml(href)}"`:''}${target}>`;
    }
    if(name==='img'){
      const srcRaw=readHtmlAttr(String(attrs),'src');
      const src=srcRaw?safeImageSrc(srcRaw):null;
      if(!src) return '';
      const alt=readHtmlAttr(String(attrs),'alt')||'';
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt.slice(0,500))}" loading="lazy" decoding="async">`;
    }
    return `<${name}>`;
  });
  return html;
}

function normalizeArticleInput(input: any, partial = false) {
  const out: Record<string, any> = {};
  const take = (k: string, v: any) => { if (v !== undefined) out[k] = v; };
  take('title', input.title != null ? String(input.title).trim().slice(0,180) : undefined);
  take('subtitle', input.subtitle != null ? String(input.subtitle).trim().slice(0,300) : undefined);
  take('excerpt', input.excerpt != null ? String(input.excerpt).trim().slice(0,800) : undefined);
  take('body', input.body != null ? sanitizeArticleHtml(String(input.body)) : undefined);
  if (input.category !== undefined) {
    const c = String(input.category);
    if (!categories.has(c)) throw new HttpError(400, '文章分類無效');
    out.category = c;
  }
  take('slug', input.slug != null ? slugify(String(input.slug)) : undefined);
  take('cover_media_id', input.cover_media_id === null ? null : (input.cover_media_id ? String(input.cover_media_id) : undefined));
  if (input.read_time_minutes !== undefined) out.read_time_minutes = asInt(input.read_time_minutes, 6, 1, 120);
  if (input.featured !== undefined) out.featured = input.featured ? 1 : 0;
  take('seo_title', input.seo_title === null ? null : (input.seo_title != null ? String(input.seo_title).slice(0, 70) : undefined));
  take('seo_description', input.seo_description === null ? null : (input.seo_description != null ? String(input.seo_description).slice(0, 180) : undefined));
  if (!partial && !out.title) throw new HttpError(400, '文章標題不可空白');
  if (out.title !== undefined && !out.title) throw new HttpError(400, '文章標題不可空白');
  return out;
}

async function validateCoverMedia(env:Env,id:string|null|undefined):Promise<void>{
  if(!id) return;
  const media=await env.DB.prepare(`SELECT id,mime_type FROM media_assets WHERE id=?`).bind(id).first<any>();
  if(!media) throw new HttpError(400,'找不到指定的封面圖片');
  if(!String(media.mime_type||'').startsWith('image/')) throw new HttpError(400,'封面素材必須是圖片');
}

async function nextRevision(env: Env, articleId: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COALESCE(MAX(revision_no),0)+1 AS n FROM article_revisions WHERE article_id=?`).bind(articleId).first<any>();
  return Number(row?.n || 1);
}

async function snapshot(env: Env, articleId: string, user: AuthUser, note: string): Promise<void> {
  const article = await env.DB.prepare(`SELECT * FROM articles WHERE id=?`).bind(articleId).first<any>();
  if (!article) return;
  const n = await nextRevision(env, articleId);
  await env.DB.prepare(`INSERT INTO article_revisions (id,article_id,revision_no,snapshot_json,change_note,created_by,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(uuid(), articleId, n, JSON.stringify(article), note, user.id, nowIso()).run();
}

export async function listAdminArticles(env: Env): Promise<any[]> {
  const { results } = await env.DB.prepare(`SELECT a.*, m.public_url AS cover_url FROM articles a LEFT JOIN media_assets m ON m.id=a.cover_media_id ORDER BY COALESCE(a.published_at,a.updated_at) DESC`).all();
  return results || [];
}

export async function listPublicArticles(env: Env, url: URL): Promise<any[]> {
  const category = url.searchParams.get('category');
  const limit = asInt(url.searchParams.get('limit'), 50, 1, 100);
  let sql = `SELECT a.id,a.slug,a.title,a.subtitle,a.excerpt,a.category,a.read_time_minutes,a.featured,a.published_at,m.public_url AS cover_url,m.alt_text AS cover_alt FROM articles a LEFT JOIN media_assets m ON m.id=a.cover_media_id WHERE a.status='published'`;
  const binds: any[] = [];
  if (category && categories.has(category)) { sql += ` AND a.category=?`; binds.push(category); }
  sql += ` ORDER BY a.published_at DESC LIMIT ?`; binds.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results || [];
}

export async function getPublicArticle(env: Env, slug: string): Promise<any> {
  const row = await env.DB.prepare(`SELECT a.id,a.slug,a.title,a.subtitle,a.excerpt,a.body,a.category,a.read_time_minutes,a.featured,a.seo_title,a.seo_description,a.published_at,m.public_url AS cover_url,m.alt_text AS cover_alt FROM articles a LEFT JOIN media_assets m ON m.id=a.cover_media_id WHERE a.slug=? AND a.status='published'`).bind(slug).first<any>();
  if (!row) throw new HttpError(404, '找不到文章');
  return row;
}

export async function createArticle(env: Env, request: Request, user: AuthUser, input: any): Promise<any> {
  const data = normalizeArticleInput(input, false);
  await validateCoverMedia(env,data.cover_media_id);
  const id = uuid();
  let slug = data.slug || slugify(data.title);
  const exists = await env.DB.prepare(`SELECT id FROM articles WHERE slug=?`).bind(slug).first();
  if (exists) slug = `${slug}-${Date.now().toString(36)}`;
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO articles (id,slug,title,subtitle,excerpt,body,category,status,cover_media_id,read_time_minutes,featured,seo_title,seo_description,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?)`)
    .bind(id, slug, data.title, data.subtitle || '', data.excerpt || '', data.body || '', data.category || 'aesthetics', data.cover_media_id || null, data.read_time_minutes || 6, data.featured || 0, data.seo_title || null, data.seo_description || null, user.id, user.id, now, now).run();
  await snapshot(env, id, user, '建立文章');
  await audit(env, request, user, 'article.create', 'article', id, { slug });
  return env.DB.prepare(`SELECT * FROM articles WHERE id=?`).bind(id).first();
}

export async function updateArticle(env: Env, request: Request, user: AuthUser, id: string, input: any): Promise<any> {
  const current = await env.DB.prepare(`SELECT * FROM articles WHERE id=?`).bind(id).first<any>();
  if (!current) throw new HttpError(404, '找不到文章');
  if (current.status === 'published' && user.role === 'editor') throw new HttpError(403, '已發布文章需由 reviewer 以上權限修改');
  const data = normalizeArticleInput(input, true);
  if (Object.prototype.hasOwnProperty.call(data,'cover_media_id')) await validateCoverMedia(env,data.cover_media_id);
  const allowed = ['title','subtitle','excerpt','body','category','slug','cover_media_id','read_time_minutes','featured','seo_title','seo_description'];
  const keys = allowed.filter(k => Object.prototype.hasOwnProperty.call(data,k));
  if (!keys.length) return current;
  await snapshot(env, id, user, '修改前自動版本');
  const sets = keys.map(k => `${k}=?`);
  const vals = keys.map(k => data[k]);
  const resetReview = ['in_review','approved','published'].includes(String(current.status));
  if (resetReview) {
    sets.push("status='draft'","published_at=NULL");
  }
  sets.push('updated_by=?','updated_at=?'); vals.push(user.id, nowIso(), id);
  try {
    await env.DB.prepare(`UPDATE articles SET ${sets.join(',')} WHERE id=?`).bind(...vals).run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, '文章網址 slug 已存在');
    throw e;
  }
  await audit(env, request, user, 'article.update', 'article', id, { fields: keys, workflow_reset_to_draft: resetReview, previous_status: current.status });
  return env.DB.prepare(`SELECT * FROM articles WHERE id=?`).bind(id).first();
}

export async function transitionArticle(env: Env, request: Request, user: AuthUser, id: string, action: 'submit'|'approve'|'reject'|'publish'|'archive', note = ''): Promise<any> {
  const current = await env.DB.prepare(`SELECT * FROM articles WHERE id=?`).bind(id).first<any>();
  if (!current) throw new HttpError(404, '找不到文章');
  let status = current.status as string;
  if (action === 'submit') {
    if (!['draft','approved'].includes(status)) throw new HttpError(409, '目前狀態無法送審');
    status = 'in_review';
  } else if (action === 'approve') {
    requireRole(user, 'reviewer');
    if (status !== 'in_review') throw new HttpError(409, '只有待審文章可核准');
    status = 'approved';
  } else if (action === 'reject') {
    requireRole(user, 'reviewer');
    if (!['in_review','approved'].includes(status)) throw new HttpError(409, '目前狀態無法退回');
    status = 'draft';
  } else if (action === 'publish') {
    requireRole(user, 'reviewer');
    if (!['approved','published'].includes(status)) throw new HttpError(409, '文章需先核准才能發布');
    if (!String(current.excerpt || '').trim()) throw new HttpError(409, '發布前請補上文章摘要');
    if (!String(current.body || '').trim()) throw new HttpError(409, '發布前請補上文章內文');
    await validateCoverMedia(env,current.cover_media_id);
    status = 'published';
  } else if (action === 'archive') {
    requireRole(user, 'admin');
    status = 'archived';
  }
  await snapshot(env, id, user, `狀態變更：${action}`);
  await env.DB.prepare(`UPDATE articles SET status=?, published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END, updated_by=?,updated_at=? WHERE id=?`)
    .bind(status, status, nowIso(), user.id, nowIso(), id).run();
  if (status === 'published' && current.cover_media_id) {
    const publicUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/media/${current.cover_media_id}`;
    await env.DB.prepare(`UPDATE media_assets SET visibility='public',public_url=? WHERE id=?`).bind(publicUrl,current.cover_media_id).run();
  }
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'article',?,?,?,?,?)`)
    .bind(uuid(), id, action === 'archive' ? 'unpublish' : action, note, user.id, nowIso()).run();
  await audit(env, request, user, `article.${action}`, 'article', id, { from: current.status, to: status, note });
  return env.DB.prepare(`SELECT * FROM articles WHERE id=?`).bind(id).first();
}

export async function listArticleRevisions(env: Env, articleId: string): Promise<any[]> {
  const { results } = await env.DB.prepare(`SELECT r.id,r.revision_no,r.change_note,r.created_at,u.email AS created_by_email FROM article_revisions r LEFT JOIN staff_users u ON u.id=r.created_by WHERE r.article_id=? ORDER BY r.revision_no DESC`).bind(articleId).all();
  return results || [];
}

export async function restoreArticleRevision(env: Env, request: Request, user: AuthUser, articleId: string, revisionId: string): Promise<any> {
  requireRole(user, 'reviewer');
  const rev = await env.DB.prepare(`SELECT snapshot_json FROM article_revisions WHERE id=? AND article_id=?`).bind(revisionId, articleId).first<any>();
  if (!rev) throw new HttpError(404, '找不到版本');
  const s = JSON.parse(rev.snapshot_json);
  await snapshot(env, articleId, user, '還原前自動版本');
  await env.DB.prepare(`UPDATE articles SET slug=?,title=?,subtitle=?,excerpt=?,body=?,category=?,status='draft',cover_media_id=?,read_time_minutes=?,featured=?,seo_title=?,seo_description=?,published_at=NULL,updated_by=?,updated_at=? WHERE id=?`)
    .bind(s.slug,s.title,s.subtitle,s.excerpt,s.body,s.category,s.cover_media_id,s.read_time_minutes,s.featured,s.seo_title,s.seo_description,user.id,nowIso(),articleId).run();
  await audit(env, request, user, 'article.revision.restore', 'article', articleId, { revisionId });
  return env.DB.prepare(`SELECT * FROM articles WHERE id=?`).bind(articleId).first();
}
