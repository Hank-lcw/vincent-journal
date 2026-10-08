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

function responseText(data:any):string{
  if(typeof data?.output_text==='string' && data.output_text.trim()) return data.output_text.trim();
  const texts:string[]=[];
  for(const item of Array.isArray(data?.output)?data.output:[]){
    for(const part of Array.isArray(item?.content)?item.content:[]){
      if(typeof part?.text==='string') texts.push(part.text);
    }
  }
  return texts.join('\n').trim();
}
function cleanJsonText(text:string):string{
  return text.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
}
export async function generateSocialCopy(env:Env,user:AuthUser,input:any):Promise<any>{
  requireRole(user,'editor');
  if(!env.OPENAI_API_KEY) throw new HttpError(503,'OPENAI_API_KEY 尚未設定');
  const platform=String(input.platform||''); if(!platforms.has(platform)) throw new HttpError(400,'不支援的社群平台');
  const articleId=String(input.article_id||'').trim();
  let article:any=null;
  if(articleId) article=await env.DB.prepare(`SELECT title,subtitle,excerpt,body,category FROM articles WHERE id=?`).bind(articleId).first<any>();
  const title=String(article?.title||input.title||'').trim().slice(0,250);
  const excerpt=String(article?.excerpt||input.excerpt||'').trim().slice(0,1200);
  const body=String(article?.body||input.body||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,6500);
  if(!title && !excerpt && !body) throw new HttpError(400,'請先選擇來源文章或提供內容');
  const guides:Record<string,string>={
    instagram:'適合 Instagram：開頭一到兩行要能讓人停下來；段落短、留白多；以單一觀點為核心。結尾可以自然邀請閱讀，但不要催促。可附少量精準 hashtag。視覺建議可規劃成精品雜誌感單圖或輪播。',
    facebook:'適合 Facebook：可以比 Instagram 更完整地交代脈絡與判斷過程；重視可讀性與分享價值。避免大量 hashtag；若提到完整文章，用柔和的延伸閱讀語氣。',
    threads:'適合 Threads：像一個有專業背景的人在分享剛想到、但已經想清楚的觀點。短、自然、有一個值得回應的觀察；不要做成摘要報告，也不要堆 hashtag。',
    xiaohongshu:'適合小紅書：使用自然的簡體中文；標題精煉但不誇張；正文像高質感知識筆記，分段清楚、可收藏，但避免「必看、逆天、封神」等低質感流量詞。可附少量主題標籤。'
  };
  const instructions=`你是 VINCENT JOURNAL 的資深內容編輯。品牌主題是 AESTHETICS · HEALTHY AGING · LONGEVITY。
寫作原則：
1. 文字要有人味、克制、專業、穩重，不要有制式 AI 腔。
2. 不硬銷、不製造焦慮、不暗示「做了就會變更好的人」。
3. 高端、精品、可信任，但不是奢華形容詞堆砌。
4. 醫療／醫美內容避免保證療效、診斷個人、誇大安全性或效果。
5. 不要為了像人而故意口語失焦；保留明確觀點。
6. 少用「不是…而是…」「真正的…」「其實…」等常見 AI 套句，不要連續排比。
${guides[platform]}
只輸出合法 JSON，不要 markdown，格式：
{"title":"平台貼文標題或內部標題","copy":"可直接發布的文字","visual_brief":"一句到三句視覺／輪播建議","hashtags":["標籤1","標籤2"]}
hashtags 可為空陣列；copy 若需要 hashtag，請把適量標籤自然附在文末。`;
  const source=`來源文章：
標題：${title}
分類：${String(article?.category||input.category||'')}
摘要：${excerpt}
內文節錄：${body}`;
  const res=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},
    body:JSON.stringify({model:'gpt-6-luna',instructions,input:source,max_output_tokens:1400})
  });
  const data:any=await res.json().catch(()=>({}));
  if(!res.ok) throw new HttpError(502,`AI 文字生成失敗：${data?.error?.message||res.status}`);
  const raw=responseText(data); if(!raw) throw new HttpError(502,'AI 沒有回傳文字');
  let out:any; try{out=JSON.parse(cleanJsonText(raw));}catch{out={title:title||'社群貼文',copy:raw,visual_brief:'',hashtags:[]};}
  return {
    title:String(out?.title||title||'社群貼文').slice(0,250),
    copy:String(out?.copy||'').slice(0,12_000),
    visual_brief:String(out?.visual_brief||'').slice(0,1200),
    hashtags:Array.isArray(out?.hashtags)?out.hashtags.map((x:any)=>String(x).slice(0,80)).slice(0,10):[]
  };
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
  const platform=input.platform!==undefined?String(input.platform):row.platform;
  if(!platforms.has(platform)) throw new HttpError(400,'不支援的社群平台');
  if(input.media_ids!==undefined && !Array.isArray(input.media_ids)) throw new HttpError(400,'media_ids 必須是陣列');
  const nextStatus=row.status==='in_review'?'draft':row.status;
  await env.DB.prepare(`UPDATE social_drafts SET article_id=?,issue_id=?,platform=?,format=?,title=?,copy=?,media_ids_json=?,scheduled_at=?,status=?,approved_by=NULL,updated_at=? WHERE id=?`)
    .bind(
      input.article_id!==undefined?(input.article_id||null):row.article_id,
      input.issue_id!==undefined?(input.issue_id||null):row.issue_id,
      platform,
      input.format!==undefined?String(input.format).slice(0,80):row.format,
      input.title!==undefined?String(input.title).slice(0,250):row.title,
      input.copy!==undefined?String(input.copy).slice(0,12000):row.copy,
      input.media_ids!==undefined?JSON.stringify(input.media_ids):row.media_ids_json,
      input.scheduled_at!==undefined?(input.scheduled_at||null):row.scheduled_at,
      nextStatus,nowIso(),id
    ).run();
  await audit(env,request,user,'social.update','social',id,{previous_status:row.status,next_status:nextStatus});
  return env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first();
}
export async function submitSocialDraft(env:Env,request:Request,user:AuthUser,id:string,note=''):Promise<any>{
  requireRole(user,'editor'); const row=await env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first<any>(); if(!row) throw new HttpError(404,'找不到社群草稿');
  if(row.status!=='draft') throw new HttpError(409,'只有草稿可送審');
  if(!String(row.copy||row.title||'').trim()) throw new HttpError(409,'送審前請先完成貼文文字');
  const mediaIds=safeJson<string[]>(row.media_ids_json,[]);
  if(row.platform==='instagram' && !mediaIds.length) throw new HttpError(409,'Instagram 貼文送審前至少需要一張圖片');
  await env.DB.prepare(`UPDATE social_drafts SET status='in_review',updated_at=? WHERE id=?`).bind(nowIso(),id).run();
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'social',?,'submit',?,?,?)`).bind(uuid(),id,note,user.id,nowIso()).run();
  await audit(env,request,user,'social.submit','social',id,{note}); return env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first();
}
export async function rejectSocialDraft(env:Env,request:Request,user:AuthUser,id:string,note=''):Promise<any>{
  requireRole(user,'reviewer');
  const row=await env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first<any>();
  if(!row) throw new HttpError(404,'找不到社群草稿');
  if(!['in_review','approved'].includes(row.status)) throw new HttpError(409,'目前狀態無法退回');
  const now=nowIso();
  await env.DB.prepare(`UPDATE social_drafts SET status='draft',approved_by=NULL,updated_at=? WHERE id=?`).bind(now,id).run();
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'social',?,'reject',?,?,?)`).bind(uuid(),id,note,user.id,now).run();
  await audit(env,request,user,'social.reject','social',id,{note,previous_status:row.status});
  return env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first();
}

export async function approveSocialDraft(env:Env,request:Request,user:AuthUser,id:string,note=''):Promise<any>{
  requireRole(user,'reviewer'); const row=await env.DB.prepare(`SELECT * FROM social_drafts WHERE id=?`).bind(id).first<any>(); if(!row) throw new HttpError(404,'找不到社群草稿');
  if(row.status!=='in_review') throw new HttpError(409,'只有待審社群草稿可以核准');
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
  if(row.status!=='scheduled') throw new Error('social draft is not scheduled');
  let external=''; if(row.platform==='facebook') external=await publishFacebook(env,row); else if(row.platform==='instagram') external=await publishInstagram(env,row); else if(row.platform==='threads') external=await publishThreads(env,row); else { await env.DB.prepare(`UPDATE social_drafts SET status='ready_to_publish',updated_at=? WHERE id=?`).bind(nowIso(),id).run(); return; }
  await env.DB.prepare(`UPDATE social_drafts SET status='published',published_at=?,external_post_id=?,updated_at=? WHERE id=?`).bind(nowIso(),external,nowIso(),id).run();
}
