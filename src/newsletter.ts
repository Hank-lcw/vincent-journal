import type { Env, AuthUser } from './types';
import { HttpError, html } from './http';
import { audit } from './audit';
import { decodeBase64, escapeHtml, hashIp, normalizeEmail, nowIso, randomToken, sha256, uuid, validEmail, toArrayBuffer } from './utils';
import { requireRole } from './auth';

async function verifyTurnstile(env: Env, request: Request, token?: string): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return;
  if (!token) throw new HttpError(400, '請完成人機驗證');
  const form = new URLSearchParams();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method:'POST', body:form });
  const data:any = await res.json();
  if (!data.success) throw new HttpError(400, '人機驗證失敗');
}

async function hasMailDns(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, { headers:{accept:'application/dns-json'} });
    const data:any = await res.json();
    if (Array.isArray(data.Answer) && data.Answer.some((x:any)=>x.type === 15)) return true;
    const a = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, { headers:{accept:'application/dns-json'} }).then(async r => await r.json() as any);
    if(Array.isArray(a.Answer) && a.Answer.some((x:any)=>x.type === 1)) return true;
    const aaaa = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=AAAA`, { headers:{accept:'application/dns-json'} }).then(async r => await r.json() as any);
    return Array.isArray(aaaa.Answer) && aaaa.Answer.some((x:any)=>x.type === 28);
  } catch { return true; }
}

async function resendFetch(env: Env, path: string, init: RequestInit = {}): Promise<any> {
  if (!env.RESEND_API_KEY) throw new HttpError(503, 'RESEND_API_KEY 尚未設定');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${env.RESEND_API_KEY}`);
  if (!(init.body instanceof FormData)) headers.set('content-type','application/json');
  const res = await fetch(`https://api.resend.com${path}`, {...init, headers});
  const data:any = await res.json().catch(()=>({}));
  if (!res.ok) throw new HttpError(502, `Resend API 失敗：${data?.message || data?.error?.message || res.status}`);
  return data;
}

function mailShell(title:string, body:string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f5f0;color:#242522;font-family:Arial,'Noto Sans TC',sans-serif"><div style="max-width:640px;margin:0 auto;padding:48px 28px"><div style="font-family:Georgia,serif;font-size:30px;letter-spacing:.04em">VINCENT JOURNAL</div><div style="font-size:10px;letter-spacing:.28em;margin-top:8px;color:#777E68">AESTHETICS · HEALTHY AGING · LONGEVITY</div><hr style="border:0;border-top:1px solid #dedbd3;margin:28px 0"><h1 style="font-family:Georgia,'Noto Serif TC',serif;font-weight:400;font-size:28px">${escapeHtml(title)}</h1>${body}<p style="margin-top:42px;font-size:12px;color:#777">這封信來自 VINCENT JOURNAL 的訂閱系統。</p></div></body></html>`;
}
function stripHtml(value:string):string{
  return String(value||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p>/gi,'\n\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();
}
function articleUrl(env:Env,slug:string):string{
  return `${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/article.html?id=${encodeURIComponent(slug)}`;
}
function articleAnnouncementHtml(env:Env,article:any,isUpdate:boolean):string{
  const url=articleUrl(env,article.slug);
  const cover=article.cover_media_id?`<p style="margin:26px 0"><img src="${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/media/${encodeURIComponent(article.cover_media_id)}" alt="" style="display:block;width:100%;max-height:420px;object-fit:cover"></p>`:'';
  const label=isUpdate?'ARTICLE UPDATED':'NEW ARTICLE';
  const intro=isUpdate?'這篇文章已完成更新，新的版本已經上線。':'VINCENT JOURNAL 有一篇新的文章上線。';
  return mailShell(article.title,`<div style="font-size:10px;letter-spacing:.18em;color:#777E68;margin-bottom:18px">${label}</div>${cover}<p style="line-height:1.9;color:#555">${escapeHtml(intro)}</p><p style="line-height:1.95;font-size:16px">${escapeHtml(article.excerpt||'')}</p><p style="margin:30px 0"><a href="${url}" style="display:inline-block;background:#69715d;color:#fff;text-decoration:none;padding:13px 22px;letter-spacing:.08em">閱讀完整文章 ↗</a></p><p style="font-size:12px;color:#777">不想再收到文章更新？<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#5f6853">取消訂閱</a></p>`);
}
function responseText(data:any):string{
  if(typeof data?.output_text==='string'&&data.output_text.trim()) return data.output_text.trim();
  const out:string[]=[];
  for(const item of Array.isArray(data?.output)?data.output:[]) for(const part of Array.isArray(item?.content)?item.content:[]) if(typeof part?.text==='string') out.push(part.text);
  return out.join('\n').trim();
}
function cleanJsonText(text:string):string{return text.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();}

export async function subscribe(env: Env, request: Request, input: any): Promise<{ok:boolean; message:string}> {
  await verifyTurnstile(env, request, input.turnstile_token);
  const email = normalizeEmail(String(input.email || ''));
  if (!validEmail(email)) throw new HttpError(400, '電子郵件格式不正確');
  if (!(await hasMailDns(email))) throw new HttpError(400, '這個電子郵件網域似乎無法接收郵件');
  const ipHash = await hashIp(request);
  if(ipHash){
    const since=new Date(Date.now()-10*60_000).toISOString();
    const rate=await env.DB.prepare(`SELECT COUNT(*) AS n FROM subscribers WHERE consent_ip_hash=? AND updated_at>=?`).bind(ipHash,since).first<any>();
    if(Number(rate?.n||0)>=12) throw new HttpError(429,'訂閱請求過於頻繁，請稍後再試');
  }
  const suppression = await env.DB.prepare(`SELECT id FROM suppressions WHERE email=? COLLATE NOCASE LIMIT 1`).bind(email).first();
  if (suppression) return {ok:true,message:'如果這個信箱可以訂閱，我們會寄送確認信。'};
  const existing = await env.DB.prepare(`SELECT * FROM subscribers WHERE email=? COLLATE NOCASE`).bind(email).first<any>();
  if (existing?.status === 'active') return {ok:true,message:'如果這個信箱可以訂閱，我們會寄送確認信。'};
  if(existing?.status === 'pending' && existing.updated_at && Date.now()-new Date(existing.updated_at).getTime()<120_000)
    return {ok:true,message:'如果這個信箱可以訂閱，我們會寄送確認信。'};

  const verifyToken = randomToken(32), unsubToken = randomToken(32);
  const verifyHash = await sha256(verifyToken), unsubHash = await sha256(unsubToken);
  const expires = new Date(Date.now()+24*60*60*1000).toISOString();
  const ua = (request.headers.get('user-agent')||'').slice(0,500);
  const id = existing?.id || uuid();
  if (existing) {
    await env.DB.prepare(`UPDATE subscribers SET status='pending',verification_token_hash=?,verification_expires_at=?,unsubscribe_token_hash=COALESCE(unsubscribe_token_hash,?),consent_ip_hash=?,consent_user_agent=?,consent_at=?,updated_at=? WHERE id=?`)
      .bind(verifyHash,expires,unsubHash,ipHash,ua,nowIso(),nowIso(),id).run();
  } else {
    await env.DB.prepare(`INSERT INTO subscribers (id,email,status,verification_token_hash,verification_expires_at,unsubscribe_token_hash,source,consent_ip_hash,consent_user_agent,consent_at,created_at,updated_at) VALUES (?,?,'pending',?,?,?,?,?,?,?,?,?)`)
      .bind(id,email,verifyHash,expires,unsubHash,String(input.source||'website').slice(0,80),ipHash,ua,nowIso(),nowIso(),nowIso()).run();
  }
  const verifyUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/api/newsletter/verify?token=${encodeURIComponent(verifyToken)}`;
  const emailHtml = mailShell('確認你的訂閱', `<p style="line-height:1.9">謝謝你願意留下來閱讀。為了確認這個信箱確實屬於你，請點一下下面的按鈕。</p><p style="margin:30px 0"><a href="${verifyUrl}" style="display:inline-block;background:#69715d;color:white;text-decoration:none;padding:13px 22px;letter-spacing:.08em">確認訂閱</a></p><p style="font-size:13px;color:#777;line-height:1.8">此連結 24 小時內有效。若你沒有提出訂閱，不需要做任何事。</p>`);
  await resendFetch(env,'/emails',{method:'POST',headers:{'Idempotency-Key':`subscribe-${id}-${verifyHash.slice(0,12)}`},body:JSON.stringify({from:env.MAIL_FROM,to:[email],subject:'確認訂閱 VINCENT JOURNAL',html:emailHtml,tags:[{name:'category',value:'confirm_subscription'}]})});
  return {ok:true,message:'確認信已寄出。請到信箱完成訂閱。'};
}

async function syncResendContact(env: Env, email: string): Promise<string | null> {
  if (!env.RESEND_API_KEY) return null;
  const payload:any = { email, unsubscribed:false };
  if (env.RESEND_SEGMENT_ID && !env.RESEND_SEGMENT_ID.includes('REPLACE_')) payload.segments = [{id:env.RESEND_SEGMENT_ID}];
  const data = await resendFetch(env,'/contacts',{method:'POST',body:JSON.stringify(payload)});
  return data?.id || null;
}

export async function verifySubscription(env: Env, token: string, confirm = false): Promise<Response> {
  if (!token) return html(mailShell('確認連結無效','<p>缺少確認資訊。</p>'),400);
  const hash = await sha256(token);
  const row = await env.DB.prepare(`SELECT * FROM subscribers WHERE verification_token_hash=? AND status='pending'`).bind(hash).first<any>();
  if (!row || !row.verification_expires_at || new Date(row.verification_expires_at).getTime() < Date.now()) {
    return html(mailShell('確認連結無效', `<p style="line-height:1.9">這個確認連結已失效或已使用。你可以回到 VINCENT JOURNAL 再輸入一次電子郵件。</p><p><a href="${env.PUBLIC_BASE_URL}" style="color:#5f6853">返回 VINCENT JOURNAL →</a></p>`),400);
  }
  if (!confirm) {
    return html(mailShell('確認你的訂閱', `<p style="line-height:1.9">請再確認一次，你希望使用 <strong>${escapeHtml(row.email)}</strong> 訂閱 VINCENT JOURNAL。</p><form method="post" action="/api/newsletter/verify"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit" style="border:0;background:#69715d;color:white;padding:13px 22px;letter-spacing:.08em;cursor:pointer">確認訂閱</button></form><p style="font-size:12px;color:#777;margin-top:24px">這一步也可避免郵件安全掃描器自動完成訂閱。</p>`));
  }
  const contactId = await syncResendContact(env,row.email).catch(e=>{console.error('resend_contact_sync',e); return null;});
  await env.DB.prepare(`UPDATE subscribers SET status='active',verified_at=?,verification_token_hash=NULL,verification_expires_at=NULL,resend_contact_id=COALESCE(?,resend_contact_id),updated_at=? WHERE id=?`)
    .bind(nowIso(),contactId,nowIso(),row.id).run();
  return html(mailShell('訂閱完成', `<p style="line-height:1.9">你已完成 VINCENT JOURNAL 的訂閱。之後有新一期刊物時，我們會把它送到這個信箱。</p><p style="margin-top:28px"><a href="${env.PUBLIC_BASE_URL}" style="color:#5f6853">回到 VINCENT JOURNAL →</a></p>`));
}

export async function unsubscribe(env: Env, token: string, confirm = false): Promise<Response> {
  if (!token) return html(mailShell('退訂連結無效','<p>缺少退訂資訊。</p>'),400);
  const hash = await sha256(token);
  const row = await env.DB.prepare(`SELECT * FROM subscribers WHERE unsubscribe_token_hash=?`).bind(hash).first<any>();
  if (!row) return html(mailShell('退訂連結無效','<p>找不到這個訂閱紀錄。</p>'),404);
  if (!confirm) {
    return html(mailShell('確認取消訂閱', `<p style="line-height:1.9">確認停止寄送 VINCENT JOURNAL 到 <strong>${escapeHtml(row.email)}</strong>？</p><form method="post" action="/api/newsletter/unsubscribe"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit" style="border:1px solid #777;background:white;color:#242522;padding:12px 20px;cursor:pointer">確認退訂</button></form>`));
  }
  await env.DB.prepare(`UPDATE subscribers SET status='unsubscribed',unsubscribed_at=?,updated_at=? WHERE id=?`).bind(nowIso(),nowIso(),row.id).run();
  if (env.RESEND_API_KEY) await resendFetch(env,`/contacts/${encodeURIComponent(row.email)}`,{method:'PATCH',body:JSON.stringify({unsubscribed:true})}).catch(e=>console.error('resend_unsubscribe_sync',e));
  return html(mailShell('已取消訂閱', `<p style="line-height:1.9">已停止寄送 VINCENT JOURNAL 電子報到 ${escapeHtml(row.email)}。謝謝你曾經閱讀。</p>`));
}

function timingSafeEqual(a: Uint8Array,b: Uint8Array): boolean { if (a.length !== b.length) return false; let diff=0; for(let i=0;i<a.length;i++) diff |= a[i]^b[i]; return diff===0; }
async function verifySvix(secret: string, payload: string, headers: Headers): Promise<boolean> {
  const id=headers.get('svix-id'), ts=headers.get('svix-timestamp'), sig=headers.get('svix-signature');
  if(!id||!ts||!sig) return false;
  const tsNum=Number(ts); if(!Number.isFinite(tsNum)||Math.abs(Date.now()/1000-tsNum)>300) return false;
  const rawSecret=secret.startsWith('whsec_')?secret.slice(6):secret;
  let keyBytes:Uint8Array; try{keyBytes=decodeBase64(rawSecret);}catch{return false;}
  const key=await crypto.subtle.importKey('raw',toArrayBuffer(keyBytes),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${id}.${ts}.${payload}`)));
  for(const item of sig.split(' ')){ const [version,value]=item.split(','); if(version!=='v1'||!value) continue; try{if(timingSafeEqual(mac,decodeBase64(value))) return true;}catch{} }
  return false;
}

export async function handleResendWebhook(env: Env, request: Request): Promise<{ok:boolean}> {
  const payload = await request.text();
  if (!env.RESEND_WEBHOOK_SECRET) throw new HttpError(503,'RESEND_WEBHOOK_SECRET 尚未設定');
  if (!(await verifySvix(env.RESEND_WEBHOOK_SECRET,payload,request.headers))) throw new HttpError(401,'Webhook 簽章無效');
  const event:any=JSON.parse(payload), providerId=request.headers.get('svix-id') || event?.data?.email_id || uuid();
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO webhook_events (id,provider,provider_event_id,event_type,payload_json,created_at) VALUES (?,'resend',?,?,?,?)`).bind(uuid(),providerId,String(event.type||'unknown'),payload,nowIso()).run();
  if (!inserted.meta.changes) return {ok:true};
  const broadcastId=String(event?.data?.broadcast_id||'').trim();
  if(broadcastId && ['email.sent','email.delivered','email.bounced','email.complained','email.failed'].includes(String(event.type||''))){
    const sentAt=String(event?.created_at||event?.data?.created_at||nowIso());
    await env.DB.prepare(`UPDATE newsletter_campaigns SET status='sent',sent_at=COALESCE(sent_at,?),updated_at=? WHERE provider_broadcast_id=? AND status IN ('scheduled','sending','sent')`)
      .bind(sentAt,nowIso(),broadcastId).run();
  }
  const email=normalizeEmail(String(event?.data?.to?.[0] || event?.data?.contact?.email || event?.data?.email || ''));
  if(email && validEmail(email)){
    if(['email.bounced','email.complained','email.suppressed','suppression.added'].includes(event.type)){
      const reason=event.type==='email.complained'?'complaint':event.type==='email.bounced'?'bounce':'provider';
      await env.DB.prepare(`INSERT OR IGNORE INTO suppressions (id,email,reason,provider,provider_event_id,created_at) VALUES (?,?,?,'resend',?,?)`).bind(uuid(),email,reason,providerId,nowIso()).run();
      await env.DB.prepare(`UPDATE subscribers SET status='suppressed',updated_at=? WHERE email=? COLLATE NOCASE`).bind(nowIso(),email).run();
    }
    if(event.type==='contact.unsubscribed' || event.type==='email.unsubscribed') await env.DB.prepare(`UPDATE subscribers SET status='unsubscribed',unsubscribed_at=COALESCE(unsubscribed_at,?),updated_at=? WHERE email=? COLLATE NOCASE`).bind(nowIso(),nowIso(),email).run();
  }
  await env.DB.prepare(`UPDATE webhook_events SET processed_at=? WHERE provider='resend' AND provider_event_id=?`).bind(nowIso(),providerId).run();
  return {ok:true};
}

export async function listSubscribers(env: Env, user: AuthUser): Promise<any[]> {
  requireRole(user,'admin');
  const {results}=await env.DB.prepare(`SELECT id,email,status,verified_at,unsubscribed_at,source,consent_at,created_at,updated_at FROM subscribers ORDER BY created_at DESC LIMIT 1000`).all();
  return results||[];
}
function normalizeCampaignSchedule(value:any):string|null{
  if(value===undefined||value===null||value==='') return null;
  const d=new Date(String(value));
  if(Number.isNaN(d.getTime())) throw new HttpError(400,'scheduled_at 格式無效');
  return d.toISOString();
}

export async function listNewsletterCampaigns(env:Env,user:AuthUser):Promise<any[]> {
  requireRole(user,'editor');
  const {results}=await env.DB.prepare(`SELECT id,issue_id,article_id,auto_send,auto_event_key,subject,preview_text,html,text_body,status,provider_broadcast_id,scheduled_at,sent_at,created_at,updated_at FROM newsletter_campaigns ORDER BY created_at DESC LIMIT 100`).all();
  return results||[];
}
export async function createNewsletterCampaign(env: Env, request: Request, user: AuthUser, input:any): Promise<any> {
  requireRole(user,'editor');
  const subject=String(input.subject||'').trim();
  const htmlBody=String(input.html||'').trim();
  if(!subject) throw new HttpError(400,'電子報主旨不可空白');
  if(input.submit_for_review && !htmlBody) throw new HttpError(400,'送審前請先完成電子報內容');
  const scheduledAt=normalizeCampaignSchedule(input.scheduled_at);
  const id=uuid(), now=nowIso(), status=input.submit_for_review?'in_review':'draft';
  await env.DB.prepare(`INSERT INTO newsletter_campaigns (id,issue_id,article_id,subject,preview_text,html,text_body,status,scheduled_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,input.issue_id||null,input.article_id||null,subject.slice(0,200),String(input.preview_text||'').slice(0,300),htmlBody,String(input.text_body||''),status,scheduledAt,user.id,now,now).run();
  if(status==='in_review') await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'newsletter',?,'submit','',?,?)`).bind(uuid(),id,user.id,now).run();
  await audit(env,request,user,'newsletter.create','newsletter',id,{status});
  return env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first();
}

export async function updateNewsletterCampaign(env:Env,request:Request,user:AuthUser,id:string,input:any):Promise<any>{
  requireRole(user,'editor');
  const row=await env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first<any>();
  if(!row) throw new HttpError(404,'找不到電子報');
  if(!['draft','in_review'].includes(row.status)) throw new HttpError(409,'只有草稿或待審電子報可以修改');
  const subject=input.subject!==undefined?String(input.subject).trim().slice(0,200):row.subject;
  const preview=input.preview_text!==undefined?String(input.preview_text).slice(0,300):row.preview_text;
  const htmlBody=input.html!==undefined?String(input.html):row.html;
  const textBody=input.text_body!==undefined?String(input.text_body):row.text_body;
  const scheduledAt=input.scheduled_at!==undefined?normalizeCampaignSchedule(input.scheduled_at):row.scheduled_at;
  if(!subject) throw new HttpError(400,'電子報主旨不可空白');
  const nextStatus=row.status==='in_review'?'draft':row.status;
  await env.DB.prepare(`UPDATE newsletter_campaigns SET article_id=?,subject=?,preview_text=?,html=?,text_body=?,scheduled_at=?,status=?,approved_by=NULL,updated_at=? WHERE id=?`)
    .bind(input.article_id!==undefined?(input.article_id||null):row.article_id,subject,preview,htmlBody,textBody,scheduledAt,nextStatus,nowIso(),id).run();
  await audit(env,request,user,'newsletter.update','newsletter',id,{previous_status:row.status,next_status:nextStatus});
  return env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first();
}

export async function submitNewsletter(env:Env,request:Request,user:AuthUser,id:string):Promise<any>{
  requireRole(user,'editor');
  const row=await env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first<any>();
  if(!row) throw new HttpError(404,'找不到電子報');
  if(row.status!=='draft') throw new HttpError(409,'只有草稿可以送審');
  if(!String(row.subject||'').trim() || !String(row.html||'').trim()) throw new HttpError(409,'送審前請完成主旨與 HTML 內容');
  const now=nowIso();
  await env.DB.prepare(`UPDATE newsletter_campaigns SET status='in_review',approved_by=NULL,updated_at=? WHERE id=?`).bind(now,id).run();
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'newsletter',?,'submit','',?,?)`).bind(uuid(),id,user.id,now).run();
  await audit(env,request,user,'newsletter.submit','newsletter',id);
  return env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first();
}

export async function rejectNewsletter(env:Env,request:Request,user:AuthUser,id:string):Promise<any>{
  requireRole(user,'reviewer');
  const row=await env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first<any>();
  if(!row) throw new HttpError(404,'找不到電子報');
  if(!['in_review','approved'].includes(row.status)) throw new HttpError(409,'目前狀態無法退回');
  const now=nowIso();
  await env.DB.prepare(`UPDATE newsletter_campaigns SET status='draft',approved_by=NULL,updated_at=? WHERE id=?`).bind(now,id).run();
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'newsletter',?,'reject','',?,?)`).bind(uuid(),id,user.id,now).run();
  await audit(env,request,user,'newsletter.reject','newsletter',id,{previous_status:row.status});
  return env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first();
}

export async function generateNewsletterContent(env:Env,user:AuthUser,input:any):Promise<any>{
  requireRole(user,'editor');
  if(!env.OPENAI_API_KEY) throw new HttpError(503,'OPENAI_API_KEY 尚未設定');
  const articleId=String(input.article_id||'').trim();
  let article:any=null;
  if(articleId) article=await env.DB.prepare(`SELECT id,slug,title,subtitle,excerpt,body,category FROM articles WHERE id=?`).bind(articleId).first<any>();
  const brief=String(input.brief||'').trim().slice(0,5000);
  if(!article&&!brief) throw new HttpError(400,'請先選擇文章或輸入電子報方向');
  const source=article?`文章標題：${article.title}
副標：${article.subtitle||''}
摘要：${article.excerpt||''}
內文節錄：${stripHtml(article.body||'').slice(0,6500)}
分類：${article.category||''}`:`編輯方向：${brief}`;
  const instructions=`你是 VINCENT JOURNAL 的電子報編輯。請根據來源內容產生一封克制、專業、有溫度的電子報草稿。
不要像廣告，不要製造焦慮，不要保證醫療效果，不使用浮誇標題。
只輸出合法 JSON，不要 markdown：
{"subject":"45字內主旨","preview_text":"80字內預覽文字","intro":"1段開場","paragraphs":["2到4段正文，每段可獨立閱讀"],"cta":"簡短 CTA"}
使用繁體中文。`;
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:env.OPENAI_TEXT_MODEL||'gpt-6-luna',instructions,input:source,max_output_tokens:1400})});
  const data:any=await res.json().catch(()=>({}));
  if(!res.ok) throw new HttpError(502,`AI 電子報生成失敗：${data?.error?.message||res.status}`);
  const raw=responseText(data); if(!raw) throw new HttpError(502,'AI 沒有回傳電子報內容');
  let out:any;try{out=JSON.parse(cleanJsonText(raw));}catch{throw new HttpError(502,'AI 電子報格式不正確');}
  const subject=String(out?.subject||article?.title||'VINCENT JOURNAL').slice(0,200);
  const preview=String(out?.preview_text||article?.excerpt||'').slice(0,300);
  const intro=String(out?.intro||'').trim();
  const paragraphs=(Array.isArray(out?.paragraphs)?out.paragraphs:[]).map((x:any)=>String(x).trim()).filter(Boolean).slice(0,6);
  const cta=String(out?.cta||'閱讀完整文章').trim().slice(0,60);
  const url=article?articleUrl(env,article.slug):env.PUBLIC_BASE_URL;
  const body=[intro,...paragraphs].filter(Boolean);
  const html=mailShell(subject,`${body.map(p=>`<p style="line-height:1.95;font-size:15px;color:#444">${escapeHtml(p)}</p>`).join('')}<p style="margin:30px 0"><a href="${url}" style="display:inline-block;background:#69715d;color:#fff;text-decoration:none;padding:13px 22px;letter-spacing:.08em">${escapeHtml(cta)} ↗</a></p><p style="font-size:12px;color:#777">不想再收到電子報？<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#5f6853">取消訂閱</a></p>`);
  const textBody=body.join('\n\n')+`\n\n${cta}: ${url}`;
  return {subject,preview_text:preview,html,text_body:textBody,article_id:article?.id||null};
}

export async function queueArticleNewsletter(env:Env,request:Request,user:AuthUser,article:any,isUpdate:boolean):Promise<void>{
  if(!article?.id||!article?.slug) return;
  const eventKey=`article:${article.id}:${article.updated_at||nowIso()}`;
  const existing=await env.DB.prepare(`SELECT id FROM newsletter_campaigns WHERE auto_event_key=? LIMIT 1`).bind(eventKey).first<any>();
  if(existing) return;
  const id=uuid(),now=nowIso();
  const subject=`${isUpdate?'更新｜':'新文章｜'}${String(article.title||'VINCENT JOURNAL').slice(0,180)}`;
  const preview=String(article.excerpt||article.subtitle||'').slice(0,300);
  const html=articleAnnouncementHtml(env,article,isUpdate);
  const textBody=`${isUpdate?'文章更新':'新文章'}：${article.title}\n\n${article.excerpt||''}\n\n閱讀完整文章：${articleUrl(env,article.slug)}`;
  await env.DB.prepare(`INSERT INTO newsletter_campaigns (id,article_id,subject,preview_text,html,text_body,status,auto_send,auto_event_key,approved_by,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'approved',1,?,?,?,?,?)`)
    .bind(id,article.id,subject,preview,html,textBody,eventKey,user.id,user.id,now,now).run();
  await audit(env,request,user,'newsletter.auto_create','newsletter',id,{article_id:article.id,is_update:isUpdate,event_key:eventKey});
}

async function sendCampaignViaResend(env:Env,row:any,scheduledAt?:string):Promise<any>{
  if(!env.RESEND_SEGMENT_ID||env.RESEND_SEGMENT_ID.includes('REPLACE_')) throw new HttpError(503,'RESEND_SEGMENT_ID 尚未設定');
  const domain=await getResendDomainStatus(env);
  if(!domain.configured||String(domain.status).toLowerCase()!=='verified') throw new HttpError(503,'寄件網域尚未在 Resend 完成驗證');
  const htmlBody=String(row.html||'').includes('RESEND_UNSUBSCRIBE_URL')?row.html:`${row.html}<p style="margin-top:48px;font-size:12px;color:#777">不想再收到這類內容？<a href="{{{RESEND_UNSUBSCRIBE_URL}}}">取消訂閱</a></p>`;
  return resendFetch(env,'/broadcasts',{method:'POST',body:JSON.stringify({segment_id:env.RESEND_SEGMENT_ID,from:env.MAIL_FROM,subject:row.subject,html:htmlBody,text:row.text_body||undefined,send:true,scheduled_at:scheduledAt})});
}

export async function sendPendingAutoNewsletters(env:Env):Promise<void>{
  if(!env.RESEND_API_KEY||!env.RESEND_SEGMENT_ID||env.RESEND_SEGMENT_ID.includes('REPLACE_')) return;
  let domain:any;try{domain=await getResendDomainStatus(env)}catch{return}
  if(!domain.configured||String(domain.status).toLowerCase()!=='verified') return;
  const {results}=await env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE auto_send=1 AND status='approved' ORDER BY created_at LIMIT 5`).all<any>();
  for(const row of results||[]){
    try{
      const data=await sendCampaignViaResend(env,row);
      const now=nowIso();
      await env.DB.prepare(`UPDATE newsletter_campaigns SET status='sending',provider_broadcast_id=?,updated_at=? WHERE id=? AND status='approved'`).bind(data?.id||null,now,row.id).run();
      await audit(env,null,null,'newsletter.auto_send','newsletter',row.id,{provider_broadcast_id:data?.id||null,article_id:row.article_id||null});
    }catch(err){console.error('newsletter_auto_send_failed',row.id,err)}
  }
}

export async function approveNewsletter(env:Env,request:Request,user:AuthUser,id:string):Promise<any>{
  requireRole(user,'reviewer');
  const row=await env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first<any>();
  if(!row) throw new HttpError(404,'找不到電子報');
  if(row.status!=='in_review') throw new HttpError(409,'只有待審電子報可以核准');
  const now=nowIso();
  await env.DB.prepare(`UPDATE newsletter_campaigns SET status='approved',approved_by=?,updated_at=? WHERE id=?`).bind(user.id,now,id).run();
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'newsletter',?,'approve','',?,?)`).bind(uuid(),id,user.id,now).run();
  await audit(env,request,user,'newsletter.approve','newsletter',id);
  return env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first();
}
export async function sendNewsletter(env:Env,request:Request,user:AuthUser,id:string,input:any):Promise<any>{
  requireRole(user,'reviewer');
  const row=await env.DB.prepare(`SELECT * FROM newsletter_campaigns WHERE id=?`).bind(id).first<any>();
  if(!row) throw new HttpError(404,'找不到電子報');
  if(row.status!=='approved') throw new HttpError(409,'電子報必須先完成審核');
  if(!env.RESEND_SEGMENT_ID || env.RESEND_SEGMENT_ID.includes('REPLACE_')) throw new HttpError(503,'RESEND_SEGMENT_ID 尚未設定');
  const requestedSchedule=input?.scheduled_at?normalizeCampaignSchedule(input.scheduled_at):null;
  const scheduledAt=requestedSchedule && new Date(requestedSchedule).getTime()>Date.now()+60_000 ? requestedSchedule : undefined;
  const data=await sendCampaignViaResend(env,row,scheduledAt);
  const status=scheduledAt?'scheduled':'sending';
  const now=nowIso();
  await env.DB.prepare(`UPDATE newsletter_campaigns SET status=?,provider_broadcast_id=?,scheduled_at=?,updated_at=? WHERE id=?`).bind(status,data?.id||null,scheduledAt||null,now,id).run();
  await env.DB.prepare(`INSERT INTO approvals (id,entity_type,entity_id,action,note,actor_id,created_at) VALUES (?,'newsletter',?,'publish','',?,?)`).bind(uuid(),id,user.id,now).run();
  await audit(env,request,user,'newsletter.send','newsletter',id,{providerBroadcastId:data?.id||null,scheduledAt});
  return {...row,status,provider_broadcast_id:data?.id||null,scheduled_at:scheduledAt||null};
}
function mailFromDomain(value:string):string|null{ const m=value.match(/<[^@<>]+@([^<>]+)>/) || value.match(/^[^@\s]+@([^\s]+)$/); return m?.[1]?.trim().toLowerCase() || null; }
export async function getResendDomainStatus(env:Env):Promise<any>{
  const domain=mailFromDomain(env.MAIL_FROM||'');
  if(!domain) return {configured:false,reason:'MAIL_FROM 尚未使用有效網域'};
  if(!env.RESEND_API_KEY) return {configured:false,domain,reason:'RESEND_API_KEY 尚未設定'};
  const data=await resendFetch(env,'/domains?limit=100',{method:'GET'});
  const list=Array.isArray(data?.data)?data.data:Array.isArray(data)?data:[];
  const match=list.find((d:any)=>String(d.name||'').toLowerCase()===domain);
  return match ? {configured:true,domain,status:match.status,capabilities:match.capabilities||null,id:match.id,region:match.region||null} : {configured:false,domain,status:'not_found'};
}
