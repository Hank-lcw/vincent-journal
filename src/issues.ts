import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { requireRole } from './auth';
import { audit } from './audit';
import { asInt, nowIso, slugify, uuid } from './utils';

async function validateIssueCover(env:Env,id:string|null|undefined):Promise<void>{
  if(!id) return;
  const row=await env.DB.prepare(`SELECT id,mime_type FROM media_assets WHERE id=?`).bind(id).first<any>();
  if(!row) throw new HttpError(400,'找不到指定的刊物封面');
  if(!String(row.mime_type||'').startsWith('image/')) throw new HttpError(400,'刊物封面必須是圖片');
}

function normalizeIssueInput(input:any,partial=false):Record<string,any>{
  const out:Record<string,any>={};
  if(input.volume!==undefined) out.volume=asInt(input.volume,1,1,9999);
  if(input.title!==undefined) out.title=String(input.title||'').trim().slice(0,220);
  if(input.subtitle!==undefined) out.subtitle=String(input.subtitle||'').trim().slice(0,500);
  if(input.editor_note!==undefined) out.editor_note=String(input.editor_note||'').slice(0,12_000);
  if(input.slug!==undefined) out.slug=slugify(String(input.slug||''));
  if(input.cover_media_id!==undefined) out.cover_media_id=input.cover_media_id?String(input.cover_media_id):null;
  if(!partial && !out.title) throw new HttpError(400,'刊物標題不可空白');
  if(out.title!==undefined && !out.title) throw new HttpError(400,'刊物標題不可空白');
  return out;
}

export async function listAdminIssues(env:Env,user:AuthUser):Promise<any[]>{
  requireRole(user,'editor');
  const {results}=await env.DB.prepare(`SELECT i.*,
    (SELECT COUNT(*) FROM issue_articles ia WHERE ia.issue_id=i.id) AS article_count
    FROM issues i ORDER BY i.volume DESC LIMIT 100`).all<any>();
  return results||[];
}

export async function getIssueArticlesAdmin(env:Env,user:AuthUser,id:string):Promise<any[]>{
  requireRole(user,'editor');
  const issue=await env.DB.prepare(`SELECT id FROM issues WHERE id=?`).bind(id).first<any>();
  if(!issue) throw new HttpError(404,'找不到刊物');
  const {results}=await env.DB.prepare(`SELECT ia.article_id,ia.position,ia.is_cover_story,a.title,a.slug,a.status,a.category
    FROM issue_articles ia JOIN articles a ON a.id=ia.article_id
    WHERE ia.issue_id=? ORDER BY ia.position, a.created_at`).bind(id).all<any>();
  return results||[];
}

export async function createIssue(env:Env,request:Request,user:AuthUser,input:any):Promise<any>{
  requireRole(user,'editor');
  const data=normalizeIssueInput(input,false);
  await validateIssueCover(env,data.cover_media_id);
  if(!data.volume){
    const row=await env.DB.prepare(`SELECT COALESCE(MAX(volume),0)+1 AS n FROM issues`).first<any>();
    data.volume=Number(row?.n||1);
  }
  const id=uuid(),now=nowIso(),slug=data.slug||`vol-${String(data.volume).padStart(3,'0')}`;
  try{
    await env.DB.prepare(`INSERT INTO issues (id,volume,slug,title,subtitle,editor_note,cover_media_id,status,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'draft',?,?,?,?)`)
      .bind(id,data.volume,slug,data.title,data.subtitle||'',data.editor_note||'',data.cover_media_id||null,user.id,user.id,now,now).run();
  }catch(e){
    if(String(e).includes('UNIQUE')) throw new HttpError(409,'刊物期數或網址 slug 已存在');
    throw e;
  }
  await audit(env,request,user,'issue.create','issue',id,{volume:data.volume,slug});
  return env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
}

export async function updateIssue(env:Env,request:Request,user:AuthUser,id:string,input:any):Promise<any>{
  requireRole(user,'editor');
  const row=await env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first<any>();
  if(!row) throw new HttpError(404,'找不到刊物');
  if(row.status==='published' && user.role==='editor') throw new HttpError(403,'已發布刊物需由 reviewer 以上權限修改');
  const data=normalizeIssueInput(input,true);
  if(Object.prototype.hasOwnProperty.call(data,'cover_media_id')) await validateIssueCover(env,data.cover_media_id);
  const allowed=['volume','slug','title','subtitle','editor_note','cover_media_id'];
  const keys=allowed.filter(k=>Object.prototype.hasOwnProperty.call(data,k));
  if(!keys.length) return row;
  const sets=keys.map(k=>`${k}=?`),vals=keys.map(k=>data[k]);
  const reset=['in_review','approved','published'].includes(String(row.status));
  if(reset) sets.push("status='draft'","published_at=NULL");
  sets.push('updated_by=?','updated_at=?'); vals.push(user.id,nowIso(),id);
  try{await env.DB.prepare(`UPDATE issues SET ${sets.join(',')} WHERE id=?`).bind(...vals).run();}
  catch(e){if(String(e).includes('UNIQUE')) throw new HttpError(409,'刊物期數或網址 slug 已存在');throw e;}
  await audit(env,request,user,'issue.update','issue',id,{fields:keys,workflow_reset_to_draft:reset});
  return env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
}

export async function setIssueArticles(env:Env,request:Request,user:AuthUser,id:string,input:any):Promise<any[]>{
  requireRole(user,'editor');
  const issue=await env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first<any>();
  if(!issue) throw new HttpError(404,'找不到刊物');
  if(issue.status==='published' && user.role==='editor') throw new HttpError(403,'已發布刊物需由 reviewer 以上權限修改');
  if(!Array.isArray(input.article_ids)) throw new HttpError(400,'article_ids 必須是陣列');
  const ids=[...new Set(input.article_ids.map((x:any)=>String(x).trim()).filter(Boolean))].slice(0,50);
  const coverId=input.cover_story_id?String(input.cover_story_id):null;
  if(coverId&&!ids.includes(coverId)) throw new HttpError(400,'封面故事必須包含在本期文章中');
  for(const articleId of ids){
    const a=await env.DB.prepare(`SELECT id FROM articles WHERE id=?`).bind(articleId).first<any>();
    if(!a) throw new HttpError(400,`找不到文章 ${articleId}`);
  }
  const stmts=[env.DB.prepare(`DELETE FROM issue_articles WHERE issue_id=?`).bind(id)];
  ids.forEach((articleId,index)=>stmts.push(env.DB.prepare(`INSERT INTO issue_articles (issue_id,article_id,position,is_cover_story) VALUES (?,?,?,?)`).bind(id,articleId,index,articleId===coverId?1:0)));
  if(stmts.length) await env.DB.batch(stmts);
  const reset=['in_review','approved','published'].includes(String(issue.status));
  if(reset) await env.DB.prepare(`UPDATE issues SET status='draft',published_at=NULL,updated_by=?,updated_at=? WHERE id=?`).bind(user.id,nowIso(),id).run();
  else await env.DB.prepare(`UPDATE issues SET updated_by=?,updated_at=? WHERE id=?`).bind(user.id,nowIso(),id).run();
  await audit(env,request,user,'issue.articles_update','issue',id,{article_ids:ids,cover_story_id:coverId,workflow_reset_to_draft:reset});
  return getIssueArticlesAdmin(env,user,id);
}

export async function transitionIssue(env:Env,request:Request,user:AuthUser,id:string,action:'submit'|'approve'|'reject'|'publish'|'archive',note=''):Promise<any>{
  const row=await env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first<any>();
  if(!row) throw new HttpError(404,'找不到刊物');
  let status=String(row.status);
  if(action==='submit'){
    requireRole(user,'editor');
    if(status!=='draft') throw new HttpError(409,'只有草稿刊物可送審');
    const count=await env.DB.prepare(`SELECT COUNT(*) AS n FROM issue_articles WHERE issue_id=?`).bind(id).first<any>();
    if(Number(count?.n||0)<1) throw new HttpError(409,'送審前請至少加入一篇文章');
    status='in_review';
  }else if(action==='approve'){
    requireRole(user,'reviewer');
    if(status!=='in_review') throw new HttpError(409,'只有待審刊物可核准');
    status='approved';
  }else if(action==='reject'){
    requireRole(user,'reviewer');
    if(!['in_review','approved'].includes(status)) throw new HttpError(409,'目前狀態無法退回');
    status='draft';
  }else if(action==='publish'){
    requireRole(user,'reviewer');
    if(status!=='approved') throw new HttpError(409,'刊物需先核准才能發布');
    const stats=await env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN a.status='published' THEN 0 ELSE 1 END) AS unpublished
      FROM issue_articles ia JOIN articles a ON a.id=ia.article_id WHERE ia.issue_id=?`).bind(id).first<any>();
    if(Number(stats?.total||0)<1) throw new HttpError(409,'刊物至少需要一篇文章');
    if(Number(stats?.unpublished||0)>0) throw new HttpError(409,'本期仍有未發布文章；請先發布文章再發布刊物');
    await validateIssueCover(env,row.cover_media_id);
    status='published';
  }else if(action==='archive'){
    requireRole(user,'admin'); status='archived';
  }
  const now=nowIso();
  await env.DB.prepare(`UPDATE issues SET status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,updated_by=?,updated_at=? WHERE id=?`)
    .bind(status,status,now,user.id,now,id).run();
  if(status==='published'&&row.cover_media_id){
    const publicUrl=`${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/media/${row.cover_media_id}`;
    await env.DB.prepare(`UPDATE media_assets SET visibility='public',public_url=? WHERE id=?`).bind(publicUrl,row.cover_media_id).run();
  }
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'issue',?,?,?,?,?)`)
    .bind(uuid(),id,action==='archive'?'unpublish':action,note,user.id,now).run();
  await audit(env,request,user,`issue.${action}`,'issue',id,{from:row.status,to:status,note});
  return env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first();
}

export async function listPublicIssues(env:Env):Promise<any[]>{
  const {results}=await env.DB.prepare(`SELECT i.id,i.volume,i.slug,i.title,i.subtitle,i.published_at,m.public_url AS cover_url,m.alt_text AS cover_alt,
    (SELECT COUNT(*) FROM issue_articles ia WHERE ia.issue_id=i.id) AS article_count
    FROM issues i LEFT JOIN media_assets m ON m.id=i.cover_media_id
    WHERE i.status='published' ORDER BY i.volume DESC LIMIT 50`).all<any>();
  return results||[];
}

export async function getPublicIssue(env:Env,slug?:string|null):Promise<any>{
  const issue=slug
    ? await env.DB.prepare(`SELECT i.*,m.public_url AS cover_url,m.alt_text AS cover_alt FROM issues i LEFT JOIN media_assets m ON m.id=i.cover_media_id WHERE i.slug=? AND i.status='published'`).bind(slug).first<any>()
    : await env.DB.prepare(`SELECT i.*,m.public_url AS cover_url,m.alt_text AS cover_alt FROM issues i LEFT JOIN media_assets m ON m.id=i.cover_media_id WHERE i.status='published' ORDER BY i.volume DESC LIMIT 1`).first<any>();
  if(!issue) throw new HttpError(404,'目前沒有已發布刊物');
  const {results}=await env.DB.prepare(`SELECT a.id,a.slug,a.title,a.subtitle,a.excerpt,a.category,a.read_time_minutes,a.published_at,m.public_url AS cover_url,m.alt_text AS cover_alt,ia.position,ia.is_cover_story
    FROM issue_articles ia JOIN articles a ON a.id=ia.article_id
    LEFT JOIN media_assets m ON m.id=a.cover_media_id
    WHERE ia.issue_id=? AND a.status='published' ORDER BY ia.position`).bind(issue.id).all<any>();
  return {...issue,articles:results||[]};
}
