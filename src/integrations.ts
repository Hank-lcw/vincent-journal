import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { requireRole } from './auth';
import { audit } from './audit';
import { encryptSecret, decryptSecret } from './crypto';
import { base64Url, nowIso, randomToken, safeJson, uuid } from './utils';

type Provider = 'canva'|'facebook'|'instagram'|'threads'|'xiaohongshu'|'resend';

function expiresIn(seconds: unknown): string | null {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(Date.now() + n * 1000).toISOString() : null;
}

async function saveIntegration(env: Env, user: AuthUser, data: {
  provider: Provider; externalId: string; label?: string | null; accessToken?: string | null; refreshToken?: string | null;
  expiresAt?: string | null; scopes?: string[]; metadata?: any; status?: 'connected'|'limited'|'expired'|'error'|'disconnected';
}): Promise<string> {
  const existing = await env.DB.prepare(`SELECT id FROM integrations WHERE provider=? AND external_account_id=?`).bind(data.provider, data.externalId).first<any>();
  const id = existing?.id || uuid();
  const enc = data.accessToken ? await encryptSecret(env, data.accessToken) : { ciphertext: null as string|null, nonce: null as string|null };
  const refresh = data.refreshToken ? await encryptSecret(env, data.refreshToken) : { ciphertext: null as string|null, nonce: null as string|null };
  const now = nowIso();
  if (existing) {
    await env.DB.prepare(`UPDATE integrations SET account_label=?,status=?,encrypted_access_token=COALESCE(?,encrypted_access_token),token_nonce=COALESCE(?,token_nonce),encrypted_refresh_token=COALESCE(?,encrypted_refresh_token),refresh_nonce=COALESCE(?,refresh_nonce),token_expires_at=?,scopes_json=?,metadata_json=?,connected_by=?,connected_at=COALESCE(connected_at,?),updated_at=? WHERE id=?`)
      .bind(data.label || null, data.status || 'connected', enc.ciphertext, enc.nonce, refresh.ciphertext, refresh.nonce, data.expiresAt || null, JSON.stringify(data.scopes || []), JSON.stringify(data.metadata || {}), user.id, now, now, id).run();
  } else {
    await env.DB.prepare(`INSERT INTO integrations (id,provider,account_label,external_account_id,status,encrypted_access_token,encrypted_refresh_token,token_nonce,refresh_nonce,token_expires_at,scopes_json,metadata_json,connected_by,connected_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, data.provider, data.label || null, data.externalId, data.status || 'connected', enc.ciphertext, refresh.ciphertext, enc.nonce, refresh.nonce, data.expiresAt || null, JSON.stringify(data.scopes || []), JSON.stringify(data.metadata || {}), user.id, now, now).run();
  }
  return id;
}

export async function listIntegrations(env: Env, user: AuthUser): Promise<any[]> {
  requireRole(user, 'admin');
  const { results } = await env.DB.prepare(`SELECT id,provider,account_label,external_account_id,status,token_expires_at,scopes_json,metadata_json,connected_at,updated_at FROM integrations ORDER BY provider,connected_at DESC`).all<any>();
  return (results || []).map((r:any)=>({ ...r, scopes: safeJson(r.scopes_json, []), metadata: safeJson(r.metadata_json, {}) }));
}

export async function disconnectIntegration(env: Env, request: Request, user: AuthUser, id: string): Promise<void> {
  requireRole(user, 'admin');
  await env.DB.prepare(`UPDATE integrations SET status='disconnected',encrypted_access_token=NULL,encrypted_refresh_token=NULL,token_nonce=NULL,refresh_nonce=NULL,updated_at=? WHERE id=?`).bind(nowIso(), id).run();
  await audit(env, request, user, 'integration.disconnect', 'integration', id);
}

function oauthConfig(env: Env, provider: string): { authorize: string; redirect: string; clientId: string; scopes: string[] } {
  if (provider === 'canva') {
    if (!env.CANVA_CLIENT_ID) throw new HttpError(503, 'CANVA_CLIENT_ID 尚未設定');
    return { authorize:'https://www.canva.com/api/oauth/authorize', redirect:env.CANVA_REDIRECT_URI, clientId:env.CANVA_CLIENT_ID, scopes:['brandtemplate:meta:read','brandtemplate:content:read','design:meta:read','design:content:write','asset:read','asset:write','profile:read'] };
  }
  if (provider === 'facebook') {
    if (!env.META_APP_ID) throw new HttpError(503, 'META_APP_ID 尚未設定');
    return { authorize:`https://www.facebook.com/${env.META_GRAPH_VERSION || 'v24.0'}/dialog/oauth`, redirect:env.FACEBOOK_REDIRECT_URI, clientId:env.META_APP_ID, scopes:['pages_show_list','pages_read_engagement','pages_manage_posts','instagram_basic','instagram_content_publish'] };
  }
  if (provider === 'threads') {
    if (!env.THREADS_APP_ID) throw new HttpError(503, 'THREADS_APP_ID 尚未設定');
    return { authorize:'https://threads.net/oauth/authorize', redirect:env.THREADS_REDIRECT_URI, clientId:env.THREADS_APP_ID, scopes:['threads_basic','threads_content_publish'] };
  }
  if (provider === 'xiaohongshu') throw new HttpError(501, '小紅書一般內容帳號目前沒有與 Meta 相同的通用伺服器端授權／代發流程；本系統會先採 Ready to Publish 匯出交付模式。');
  throw new HttpError(400, '不支援的 OAuth 平台');
}

export async function startOAuth(env: Env, request: Request, user: AuthUser, provider: string, redirectAfter = '/studio'): Promise<string> {
  requireRole(user, 'admin');
  const cfg = oauthConfig(env, provider);
  const state = randomToken(24);
  let verifier: string | null = null;
  const params = new URLSearchParams({ client_id:cfg.clientId, redirect_uri:cfg.redirect, response_type:'code', state, scope:cfg.scopes.join(provider === 'canva' ? ' ' : ',') });
  if (provider === 'canva') {
    verifier = randomToken(48);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    params.set('code_challenge_method','S256');
    params.set('code_challenge',base64Url(new Uint8Array(digest)));
  }
  const expires = new Date(Date.now()+10*60*1000).toISOString();
  await env.DB.prepare(`INSERT INTO oauth_states (state,provider,code_verifier,staff_user_id,redirect_after,expires_at,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(state,provider,verifier,user.id,redirectAfter.slice(0,500),expires,nowIso()).run();
  await audit(env, request, user, 'integration.oauth_start', 'integration', provider, { provider });
  return `${cfg.authorize}?${params.toString()}`;
}

async function loadOAuthState(env: Env, state: string, provider: string): Promise<any> {
  const row = await env.DB.prepare(`SELECT * FROM oauth_states WHERE state=? AND provider=?`).bind(state,provider).first<any>();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) throw new HttpError(400, 'OAuth state 無效或已過期');
  return row;
}
async function callbackUser(env: Env, staffId: string): Promise<AuthUser> {
  const row = await env.DB.prepare(`SELECT id,email,display_name,role,is_active FROM staff_users WHERE id=?`).bind(staffId).first<any>();
  if (!row || !row.is_active) throw new HttpError(403,'管理員帳號已失效');
  return {id:row.id,email:row.email,displayName:row.display_name,role:row.role};
}
async function canvaToken(env:Env, body:URLSearchParams):Promise<any>{
  if(!env.CANVA_CLIENT_ID||!env.CANVA_CLIENT_SECRET) throw new HttpError(503,'Canva OAuth 尚未設定');
  const auth=btoa(`${env.CANVA_CLIENT_ID}:${env.CANVA_CLIENT_SECRET}`);
  const res=await fetch('https://api.canva.com/rest/v1/oauth/token',{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body});
  const data:any=await res.json().catch(()=>({}));
  if(!res.ok) throw new HttpError(502,`Canva OAuth 失敗：${data?.message||data?.error||res.status}`);
  return data;
}
async function canvaApi(token:string,path:string,init:RequestInit={}):Promise<any>{
  const res=await fetch(`https://api.canva.com/rest/v1${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init.headers||{})}});
  const data:any=await res.json().catch(()=>({}));
  if(!res.ok) throw new HttpError(502,`Canva API 失敗：${data?.message||data?.code||res.status}`);
  return data;
}

export async function refreshCanvaIntegration(env: Env, id: string): Promise<string> {
  const row=await env.DB.prepare(`SELECT * FROM integrations WHERE id=? AND provider='canva'`).bind(id).first<any>();
  if(!row) throw new HttpError(404,'找不到 Canva 整合');
  const current=await decryptSecret(env,row.encrypted_access_token,row.token_nonce);
  const expiry=row.token_expires_at?new Date(row.token_expires_at).getTime():0;
  if(current && expiry > Date.now()+5*60*1000) return current;
  const refresh=await decryptSecret(env,row.encrypted_refresh_token,row.refresh_nonce);
  if(!refresh) throw new HttpError(401,'Canva 授權已過期，請重新連線');
  const data=await canvaToken(env,new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh}));
  const enc=await encryptSecret(env,data.access_token); const encR=data.refresh_token?await encryptSecret(env,data.refresh_token):null;
  await env.DB.prepare(`UPDATE integrations SET encrypted_access_token=?,token_nonce=?,encrypted_refresh_token=COALESCE(?,encrypted_refresh_token),refresh_nonce=COALESCE(?,refresh_nonce),token_expires_at=?,status='connected',updated_at=? WHERE id=?`)
    .bind(enc.ciphertext,enc.nonce,encR?.ciphertext||null,encR?.nonce||null,expiresIn(data.expires_in),nowIso(),id).run();
  return data.access_token;
}

export async function getIntegrationToken(env:Env,provider:Provider,externalId?:string|null):Promise<{row:any;token:string}> {
  const row=externalId
    ? await env.DB.prepare(`SELECT * FROM integrations WHERE provider=? AND external_account_id=? AND status IN ('connected','limited') ORDER BY connected_at DESC LIMIT 1`).bind(provider,externalId).first<any>()
    : await env.DB.prepare(`SELECT * FROM integrations WHERE provider=? AND status IN ('connected','limited') ORDER BY connected_at DESC LIMIT 1`).bind(provider).first<any>();
  if(!row) throw new HttpError(409,`${provider} 尚未完成帳號授權`);
  if(provider==='canva') return {row,token:await refreshCanvaIntegration(env,row.id)};
  if(row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()+60_000){
    await env.DB.prepare(`UPDATE integrations SET status='expired',updated_at=? WHERE id=?`).bind(nowIso(),row.id).run();
    throw new HttpError(401,`${provider} 授權已過期，請重新連線`);
  }
  const token=await decryptSecret(env,row.encrypted_access_token,row.token_nonce);
  if(!token) throw new HttpError(401,`${provider} 缺少存取權杖`);
  return {row,token};
}

export async function handleOAuthCallback(env: Env, request: Request, provider: string): Promise<string> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '', code = url.searchParams.get('code') || '';
  const error = url.searchParams.get('error') || url.searchParams.get('error_reason');
  if(error) throw new HttpError(400,`${provider} 授權取消或失敗：${error}`);
  if(!state||!code) throw new HttpError(400,'OAuth callback 缺少 code/state');
  const stateRow=await loadOAuthState(env,state,provider), user=await callbackUser(env,stateRow.staff_user_id);

  if(provider==='canva'){
    const data=await canvaToken(env,new URLSearchParams({grant_type:'authorization_code',code,code_verifier:stateRow.code_verifier||'',redirect_uri:env.CANVA_REDIRECT_URI}));
    const profile=await canvaApi(data.access_token,'/users/me/profile').catch(()=>({profile:{display_name:'Canva'}}));
    const externalId=String(profile?.profile?.user_id || profile?.user?.id || 'me');
    await saveIntegration(env,user,{provider:'canva',externalId,label:profile?.profile?.display_name||'Canva',accessToken:data.access_token,refreshToken:data.refresh_token||null,expiresAt:expiresIn(data.expires_in),scopes:String(data.scope||'').split(/\s+/).filter(Boolean),metadata:{profile}});
  } else if(provider==='facebook'){
    if(!env.META_APP_ID||!env.META_APP_SECRET) throw new HttpError(503,'Meta OAuth 尚未設定');
    const v=env.META_GRAPH_VERSION||'v24.0';
    const tokenUrl=new URL(`https://graph.facebook.com/${v}/oauth/access_token`);
    tokenUrl.search=new URLSearchParams({client_id:env.META_APP_ID,client_secret:env.META_APP_SECRET,redirect_uri:env.FACEBOOK_REDIRECT_URI,code}).toString();
    let tokenRes=await fetch(tokenUrl); let td:any=await tokenRes.json();
    if(!tokenRes.ok) throw new HttpError(502,`Facebook OAuth 失敗：${td?.error?.message||tokenRes.status}`);
    const longUrl=new URL(`https://graph.facebook.com/${v}/oauth/access_token`);
    longUrl.search=new URLSearchParams({grant_type:'fb_exchange_token',client_id:env.META_APP_ID,client_secret:env.META_APP_SECRET,fb_exchange_token:td.access_token}).toString();
    const longRes=await fetch(longUrl); if(longRes.ok) td=await longRes.json();
    const pagesRes=await fetch(`https://graph.facebook.com/${v}/me/accounts?fields=id,name,access_token,tasks,instagram_business_account&access_token=${encodeURIComponent(td.access_token)}`);
    const pages:any=await pagesRes.json();
    if(!pagesRes.ok) throw new HttpError(502,`無法取得 Facebook Pages：${pages?.error?.message||pagesRes.status}`);
    if(!pages?.data?.length) throw new HttpError(409,'沒有找到可管理的 Facebook Page。Instagram 自動發布也需要連結到可管理的專業帳號。');
    for(const p of pages.data){
      await saveIntegration(env,user,{provider:'facebook',externalId:String(p.id),label:p.name||'Facebook Page',accessToken:p.access_token,scopes:['pages_show_list','pages_read_engagement','pages_manage_posts'],metadata:{tasks:p.tasks||[]}});
      if(p.instagram_business_account?.id){
        const igId=String(p.instagram_business_account.id);
        const igRes=await fetch(`https://graph.facebook.com/${v}/${igId}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(p.access_token)}`);
        const ig:any=await igRes.json().catch(()=>({id:igId}));
        await saveIntegration(env,user,{provider:'instagram',externalId:igId,label:ig.username?`@${ig.username}`:'Instagram',accessToken:p.access_token,scopes:['instagram_basic','instagram_content_publish'],metadata:{page_id:p.id,page_name:p.name,profile:ig}});
      }
    }
  } else if(provider==='threads'){
    if(!env.THREADS_APP_ID||!env.THREADS_APP_SECRET) throw new HttpError(503,'Threads OAuth 尚未設定');
    const form=new URLSearchParams({client_id:env.THREADS_APP_ID,client_secret:env.THREADS_APP_SECRET,grant_type:'authorization_code',redirect_uri:env.THREADS_REDIRECT_URI,code});
    const tokenRes=await fetch('https://graph.threads.net/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
    let td:any=await tokenRes.json(); if(!tokenRes.ok) throw new HttpError(502,`Threads OAuth 失敗：${td?.error_message||td?.error?.message||tokenRes.status}`);
    const longUrl=new URL('https://graph.threads.net/access_token'); longUrl.search=new URLSearchParams({grant_type:'th_exchange_token',client_secret:env.THREADS_APP_SECRET,access_token:td.access_token}).toString();
    const lr=await fetch(longUrl); if(lr.ok) td={...td,...await lr.json()};
    const profileRes=await fetch(`https://graph.threads.net/me?fields=id,username,threads_profile_picture_url,threads_biography&access_token=${encodeURIComponent(td.access_token)}`);
    const profile:any=await profileRes.json(); if(!profileRes.ok) throw new HttpError(502,`Threads profile 取得失敗：${profile?.error?.message||profileRes.status}`);
    await saveIntegration(env,user,{provider:'threads',externalId:String(profile.id),label:profile.username?`@${profile.username}`:'Threads',accessToken:td.access_token,expiresAt:expiresIn(td.expires_in),scopes:['threads_basic','threads_content_publish'],metadata:{profile}});
  } else throw new HttpError(501,'此平台目前採人工交付模式');

  await env.DB.prepare(`DELETE FROM oauth_states WHERE state=?`).bind(state).run();
  return stateRow.redirect_after || '/studio';
}

export async function systemIntegrationStatus(env:Env):Promise<any>{
  const {results}=await env.DB.prepare(`SELECT provider,status,account_label,external_account_id,token_expires_at,updated_at FROM integrations ORDER BY provider,updated_at DESC`).all();
  return { integrations:results||[], configured:{
    openai:Boolean(env.OPENAI_API_KEY), resend:Boolean(env.RESEND_API_KEY&&env.RESEND_WEBHOOK_SECRET), canva:Boolean(env.CANVA_CLIENT_ID&&env.CANVA_CLIENT_SECRET),
    meta:Boolean(env.META_APP_ID&&env.META_APP_SECRET), threads:Boolean(env.THREADS_APP_ID&&env.THREADS_APP_SECRET), xiaohongshu:Boolean(env.XHS_CLIENT_ID&&env.XHS_CLIENT_SECRET),
    encryption:Boolean(env.TOKEN_ENCRYPTION_KEY_B64), access:Boolean(env.TEAM_DOMAIN&&env.POLICY_AUD), turnstile:Boolean(env.TURNSTILE_SECRET_KEY)
  }};
}
