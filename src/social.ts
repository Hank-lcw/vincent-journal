import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { requireRole } from './auth';
import { audit } from './audit';
import { getIntegrationToken } from './integrations';
import { nowIso, safeJson, uuid } from './utils';

const platforms=new Set(['instagram','facebook','threads','xiaohongshu']);

export async function listSocialDrafts(env:Env,user:AuthUser):Promise<any[]> {
  requireRole(user,'editor');
  const {results}=await env.DB.prepare(`SELECT s.*,a.title article_title FROM social_drafts s LEFT JOIN articles a ON a.id=s.article_id ORDER BY s.updated_at DESC LIMIT 500`).all<any>();
  return (results||[]).map((x:any)=>({...x,media_ids:safeJson(x.media_ids_json,[])}));
}
export async function createSocialDraft(env:Env,request:Request,user:AuthUser,input:any):Promise<any>{
  requireRole(user,'editor');
  const platform=String(input.platform||''); if(!platforms.has(platform)) throw new HttpError(400,'不支援的社群平台');
  const id=uuid(),now=nowIso(),status=input.submit_for_review?'in_review':'draft';
  await env.DB.prepare(`INSERT INTO social_drafts (id,article_id,issue_id,platform,format,title,copy,media_ids_json,canva_design_id,status,scheduled_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,input.article_id||null,input.issue_id||null,platform,String(input.format||'post').slice(0,80),String(input.title||'').slice(0,250),String(input.copy||''),JSON.stringify(Array.isArray(input.media_ids)?input.media_ids:[]),input.canva_design_id||null,status,input.scheduled_at||null,user.id,now,now).run();
  if(status==='in_review') await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'social',?,'submit',?,?,?)`).bind(uuid(),id,String(input.note||''),user.id,now).run();
  await audit(env,request,user,'social.create','social',id,{platform,status});
  return env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first();
}
export async function updateSocialDraft(env:Env,request:Request,user:AuthUser,id:string,input:any):Promise<any>{
  requireRole(user,'editor'); const row=await env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first<any>(); if(!row) throw new HttpError(404,'找不到社群草稿');
  if(!['draft','in_review'].includes(row.status)) throw new HttpError(409,'只有草稿或審核中的貼文可編輯');
  await env.DB.prepare(`UPDATE social_drafts SET format=?,title=?,copy=?,media_ids_json=?,scheduled_at=?,updated_at=? WHERE id=?`)
    .bind(input.format!==undefined?String(input.format).slice(0,80):row.format,input.title!==undefined?String(input.title).slice(0,250):row.title,input.copy!==undefined?String(input.copy):row.copy,input.media_ids!==undefined?JSON.stringify(input.media_ids):row.media_ids_json,input.scheduled_at!==undefined?input.scheduled_at:row.scheduled_at,nowIso(),id).run();
  await audit(env,request,user,'social.update','social',id); return env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first();
}
export async function submitSocialDraft(env:Env,request:Request,user:AuthUser,id:string,note=''):Promise<any>{
  requireRole(user,'editor'); const row=await env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first<any>(); if(!row) throw new HttpError(404,'找不到社群草稿');
  if(row.status!=='draft') throw new HttpError(409,'只有草稿可送審');
  await env.DB.prepare(`UPDATE social_drafts SET status='in_review',updated_at=? WHERE id=?`).bind(nowIso(),id).run();
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'social',?,'submit',?,?,?)`).bind(uuid(),id,note,user.id,nowIso()).run();
  await audit(env,request,user,'social.submit','social',id,{note}); return env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first();
}
export async function approveSocialDraft(env:Env,request:Request,user:AuthUser,id:string,note=''):Promise<any>{
  requireRole(user,'reviewer'); const row=await env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first<any>(); if(!row) throw new HttpError(404,'找不到社群草稿');
  await env.DB.prepare(`UPDATE social_drafts SET status='approved',approved_by=?,updated_at=? WHERE id=?`).bind(user.id,nowIso(),id).run();
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'social',?,'approve',?,?,?)`).bind(uuid(),id,note,user.id,nowIso()).run();
  await audit(env,request,user,'social.approve','social',id,{note}); return env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first();
}
async function publicMediaUrls(env:Env,ids:string[]):Promise<{id:string;url:string;mime:string}[]> {
  const out=[] as {id:string;url:string;mime:string}[];
  for(const id of ids){
    const row=await env.DB.prepare(`SELECT id,mime_type,visibility FROM media_assets WHERE id=?`).bind(id).first<any>();
    if(!row) throw new HttpError(400,`找不到媒體 ${id}`);
    if(row.visibility!=='public') throw new HttpError(409,`媒體 ${id} 尚未設為公開；社群平台必須能從公開 URL 抓取圖片`);
    out.push({id,url:`${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/media/${encodeURIComponent(id)}`,mime:row.mime_type});
  }
  return out;
}
async function metaJson(url:string,init:RequestInit={}):Promise<any>{
  const res=await fetch(url,init); const data:any=await res.json().catch(()=>({}));
  if(!res.ok||data?.error) throw new HttpError(502,`Meta API 失敗：${data?.error?.message||res.status}`);
  return data;
}
async function publishFacebook(env:Env,row:any):Promise<string>{
  const {row:intg,token}=await getIntegrationToken(env,'facebook');
  const pageId=intg.external_account_id; const v=env.META_GRAPH_VERSION||'v24.0';
  const mediaIds=safeJson<string[]>(row.media_ids_json,[]), media=await publicMediaUrls(env,mediaIds);
  if(media.length){ const form=new URLSearchParams({url:media[0].url,caption:row.copy||row.title||'',published:'true',access_token:token}); const data=await metaJson(`https://graph.facebook.com/${v}/${pageId}/photos`,{method:'POST',body:form}); return String(data.post_id||data.id); }
  const form=new URLSearchParams({message:row.copy||row.title||'',access_token:token}); const data=await metaJson(`https://graph.facebook.com/${v}/${pageId}/feed`,{method:'POST',body:form}); return String(data.id);
}
async function publishInstagram(env:Env,row:any):Promise<string>{
  const {row:intg,token}=await getIntegrationToken(env,'instagram'); const igId=intg.external_account_id; const v=env.META_GRAPH_VERSION||'v24.0';
  const mediaIds=safeJson<string[]>(row.media_ids_json,[]), media=await publicMediaUrls(env,mediaIds);
  if(!media.length) throw new HttpError(409,'Instagram 貼文至少需要一張公開圖片');
  let creationId='';
  if(media.length===1){ const form=new URLSearchParams({image_url:media[0].url,caption:row.copy||row.title||'',access_token:token}); const d=await metaJson(`https://graph.facebook.com/${v}/${igId}/media`,{method:'POST',body:form}); creationId=String(d.id); }
  else {
    if(media.length>10) throw new HttpError(400,'Instagram Carousel 最多使用 10 個媒體');
    const children:string[]=[]; for(const m of media){ const f=new URLSearchParams({image_url:m.url,is_carousel_item:'true',access_token:token}); const d=await metaJson(`https://graph.facebook.com/${v}/${igId}/media`,{method:'POST',body:f}); children.push(String(d.id)); }
    const f=new URLSearchParams({media_type:'CAROUSEL',children:children.join(','),caption:row.copy||row.title||'',access_token:token}); const d=await metaJson(`https://graph.facebook.com/${v}/${igId}/media`,{method:'POST',body:f}); creationId=String(d.id);
  }
  const pub=await metaJson(`https://graph.facebook.com/${v}/${igId}/media_publish`,{method:'POST',body:new URLSearchParams({creation_id:creationId,access_token:token})}); return String(pub.id);
}
async function publishThreads(env:Env,row:any):Promise<string>{
  const {token}=await getIntegrationToken(env,'threads'); const mediaIds=safeJson<string[]>(row.media_ids_json,[]), media=await publicMediaUrls(env,mediaIds);
  const text=(row.copy||row.title||'').slice(0,10000), f=new URLSearchParams({text,access_token:token});
  if(media.length){ f.set('media_type','IMAGE'); f.set('image_url',media[0].url); } else f.set('media_type','TEXT');
  const c=await metaJson('https://graph.threads.net/me/threads',{method:'POST',body:f});
  const p=await metaJson('https://graph.threads.net/me/threads_publish',{method:'POST',body:new URLSearchParams({creation_id:String(c.id),access_token:token})}); return String(p.id);
}
export async function publishSocialDraft(env:Env,request:Request,user:AuthUser,id:string):Promise<any>{
  requireRole(user,'reviewer'); const row=await env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first<any>(); if(!row) throw new HttpError(404,'找不到社群草稿');
  if(row.status!=='approved') throw new HttpError(409,'社群貼文必須先完成審核');
  if(row.scheduled_at && new Date(row.scheduled_at).getTime()>Date.now()+30_000){
    const jobId=uuid(); await env.DB.prepare(`INSERT INTO publish_jobs (id,job_type,entity_id,platform,run_at,status,payload_json,created_by,created_at,updated_at) VALUES (?,'social_publish',?,?,?,'pending','{}',?,?,?)`).bind(jobId,id,row.platform,row.scheduled_at,user.id,nowIso(),nowIso()).run();
    await env.DB.prepare(`UPDATE social_drafts SET status='scheduled',updated_at=? WHERE id=?`).bind(nowIso(),id).run(); return {queued:true,job_id:jobId,scheduled_at:row.scheduled_at};
  }
  let external='';
  if(row.platform==='facebook') external=await publishFacebook(env,row);
  else if(row.platform==='instagram') external=await publishInstagram(env,row);
  else if(row.platform==='threads') external=await publishThreads(env,row);
  else if(row.platform==='xiaohongshu'){
    await env.DB.prepare(`UPDATE social_drafts SET status='ready_to_publish',updated_at=? WHERE id=?`).bind(nowIso(),id).run();
    await audit(env,request,user,'social.ready_to_publish','social',id,{platform:'xiaohongshu'});
    return {ready_to_publish:true,reason:'小紅書目前採匯出／官方分享交付流程，不假設具備通用伺服器端代發權限。'};
  }
  await env.DB.prepare(`UPDATE social_drafts SET status='published',published_at=?,external_post_id=?,updated_at=? WHERE id=?`).bind(nowIso(),external,nowIso(),id).run();
  await audit(env,request,user,'social.publish','social',id,{platform:row.platform,external}); return env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first();
}
export async function publishSocialDraftSystem(env:Env,id:string):Promise<void>{
  const row=await env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first<any>(); if(!row) throw new Error('social draft not found');
  let external=''; if(row.platform==='facebook') external=await publishFacebook(env,row); else if(row.platform==='instagram') external=await publishInstagram(env,row); else if(row.platform==='threads') external=await publishThreads(env,row); else { await env.DB.prepare(`UPDATE social_drafts SET status='ready_to_publish',updated_at=? WHERE id=?`).bind(nowIso(),id).run(); return; }
  await env.DB.prepare(`UPDATE social_drafts SET status='published',published_at=?,external_post_id=?,updated_at=? WHERE id=?`).bind(nowIso(),external,nowIso(),id).run();
}
