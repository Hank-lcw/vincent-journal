import type { Env, AuthUser } from './types';
import { HttpError, json, readJson, securityHeaders } from './http';
import { requireUser } from './auth';
import { listStaff, upsertStaff, updateStaff } from './staff';
import { listAdminArticles, listPublicArticles, getPublicArticle, createArticle, updateArticle, transitionArticle, listArticleRevisions, restoreArticleRevision, deleteArticle, areArticlesManaged } from './articles';
import { listMedia, uploadMedia, serveMedia, generateImage, editImage, analyzeMedia, setMediaVisibility, deleteMedia } from './media';
import { subscribe, verifySubscription, unsubscribe, handleResendWebhook, listSubscribers, listNewsletterCampaigns, createNewsletterCampaign, updateNewsletterCampaign, submitNewsletter, rejectNewsletter, approveNewsletter, sendNewsletter, getResendDomainStatus } from './newsletter';
import { listIntegrations, startOAuth, handleOAuthCallback, disconnectIntegration, systemIntegrationStatus } from './integrations';
import { listBrandTemplates, brandTemplateDataset, createAutofill, getAutofillJob, attachCanvaDesign, uploadPublicAssetToCanva, getCanvaAssetUploadJob } from './canva';
import { listSocialDrafts, createSocialDraft, updateSocialDraft, submitSocialDraft, rejectSocialDraft, approveSocialDraft, publishSocialDraft, generateSocialCopy } from './social';
import { listBackups, manualBackup, createBackup } from './backup';
import { listAdminIssues, getIssueArticlesAdmin, createIssue, updateIssue, setIssueArticles, transitionIssue, listPublicIssues, getPublicIssue } from './issues';
import { runDueJobs } from './jobs';
import { checkOpenAI } from './openai';
import { getSiteVisuals, assignSiteVisual } from './site-visuals';

function parts(pathname:string):string[]{ return pathname.split('/').filter(Boolean).map(decodeURIComponent); }
function isStudioPath(path:string):boolean { return path==='/studio' || path.startsWith('/api/admin/'); }
async function maybeUser(request:Request,env:Env):Promise<AuthUser|null>{ if(!request.headers.get('Cf-Access-Jwt-Assertion')) return null; try{return await requireUser(request,env);}catch{return null;} }
function safeRedirect(base:string,path:string):string{ try{const u=new URL(path,base),b=new URL(base); return u.origin===b.origin?u.toString():new URL('/studio',base).toString();}catch{return new URL('/studio',base).toString();} }

async function route(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url); let p=url.pathname; const method=request.method.toUpperCase();
  if(method==='GET' && (p==='/studio/' || p==='/studio.html')) return Response.redirect(new URL('/studio',url).toString(),302);
  if(p.startsWith('/studio/api/admin/')) p='/api/admin/'+p.slice('/studio/api/admin/'.length); const seg=parts(p);

  const publicHtmlAliases:Record<string,string>={'/':'/index.html','/discover':'/discover.html','/article':'/article.html','/issue':'/issue.html'};
  if(method==='GET' && publicHtmlAliases[p]){ const assetUrl=new URL(request.url); assetUrl.pathname=publicHtmlAliases[p]; return env.ASSETS.fetch(new Request(assetUrl.toString(),request)); }

  if(method==='GET' && p==='/api/public/site-visuals') return json({visuals:await getSiteVisuals(env)});
  if(method==='GET' && p==='/api/public/config') return json({turnstile_site_key:env.TURNSTILE_SECRET_KEY&&env.TURNSTILE_SITE_KEY?env.TURNSTILE_SITE_KEY:null});
  if(method==='GET' && p==='/api/public/articles') return json({articles:await listPublicArticles(env,url),managed:await areArticlesManaged(env)});
  if(method==='GET' && seg[0]==='api' && seg[1]==='public' && seg[2]==='articles' && seg[3]) return json({article:await getPublicArticle(env,seg[3])});
  if(method==='GET' && p==='/api/public/issues') return json({issues:await listPublicIssues(env)});
  if(method==='GET' && p==='/api/public/issues/current') return json({issue:await getPublicIssue(env)});
  if(method==='GET' && seg[0]==='api' && seg[1]==='public' && seg[2]==='issues' && seg[3]) return json({issue:await getPublicIssue(env,seg[3])});

  if(method==='POST' && p==='/api/newsletter/subscribe') return json(await subscribe(env,request,await readJson(request)),202);
  if(method==='GET' && p==='/api/newsletter/verify') return verifySubscription(env,url.searchParams.get('token')||'',false);
  if(method==='POST' && p==='/api/newsletter/verify'){
    const form=await request.formData(); return verifySubscription(env,String(form.get('token')||''),true);
  }
  if(method==='GET' && p==='/api/newsletter/unsubscribe') return unsubscribe(env,url.searchParams.get('token')||'',false);
  if(method==='POST' && p==='/api/newsletter/unsubscribe'){
    const form=await request.formData(); return unsubscribe(env,String(form.get('token')||''),true);
  }
  if(method==='POST' && p==='/api/webhooks/resend') return json(await handleResendWebhook(env,request));

  if(method==='GET' && seg[0]==='api' && seg[1]==='oauth' && seg[2] && seg[3]==='callback'){
    const redirect=await handleOAuthCallback(env,request,seg[2]); return Response.redirect(safeRedirect(env.PUBLIC_BASE_URL,redirect),302);
  }

  if((method==='GET' || method==='HEAD') && seg[0]==='studio' && seg[1]==='media' && seg[2]){
    const user=await requireUser(request,env);
    return serveMedia(env,request,seg[2],user);
  }

  if((method==='GET' || method==='HEAD') && seg[0]==='media' && seg[1]) return serveMedia(env,request,seg[1],await maybeUser(request,env));

  if(p.startsWith('/api/admin/')){
    const user=await requireUser(request,env);
    if(method==='GET' && p==='/api/admin/me') return json({user});
    if(method==='GET' && p==='/api/admin/system/status'){
      const status=await systemIntegrationStatus(env);
      const emailDomain=await getResendDomainStatus(env).catch(e=>({configured:false,reason:e instanceof Error?e.message:String(e)}));
      const db=await env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM articles) articles_total,
        (SELECT COUNT(*) FROM articles WHERE status='published') articles,
        (SELECT COUNT(*) FROM media_assets) media,
        (SELECT COUNT(*) FROM subscribers WHERE status='active') subscribers
      `).first<any>();
      return json({user,cloudflare:{d1:true,r2_media:true,r2_backups:true,access:Boolean(env.TEAM_DOMAIN&&env.POLICY_AUD)},...status,email_domain:emailDomain,counts:db||{}});
    }

    if(method==='GET' && p==='/api/admin/system/openai/check') return json(await checkOpenAI(env,user));

    if(method==='GET' && p==='/api/admin/staff') return json({staff:await listStaff(env,user)});
    if(method==='POST' && p==='/api/admin/staff') return json({staff:await upsertStaff(env,request,user,await readJson(request))},201);
    if(method==='PATCH' && seg[2]==='staff' && seg[3]) return json({staff:await updateStaff(env,request,user,seg[3],await readJson(request))});

    if(method==='GET' && p==='/api/admin/articles') return json({articles:await listAdminArticles(env,user)});
    if(method==='POST' && p==='/api/admin/articles') return json({article:await createArticle(env,request,user,await readJson(request))},201);
    if(seg[2]==='articles' && seg[3]){
      const id=seg[3];
      if(method==='PATCH' && seg.length===4) return json({article:await updateArticle(env,request,user,id,await readJson(request))});
      if(method==='DELETE' && seg.length===4) return json(await deleteArticle(env,request,user,id));
      if(method==='GET' && seg[4]==='revisions') return json({revisions:await listArticleRevisions(env,id)});
      if(method==='POST' && seg[4]==='revisions' && seg[5] && seg[6]==='restore') return json({article:await restoreArticleRevision(env,request,user,id,seg[5])});
      if(method==='POST' && seg[4] && ['submit','approve','reject','publish','archive'].includes(seg[4])){
        const input=await readJson(request).catch(()=>({})); return json({article:await transitionArticle(env,request,user,id,seg[4] as any,String((input as any)?.note||''))});
      }
    }

    if(method==='GET' && p==='/api/admin/issues') return json({issues:await listAdminIssues(env,user)});
    if(method==='POST' && p==='/api/admin/issues') return json({issue:await createIssue(env,request,user,await readJson(request))},201);
    if(seg[2]==='issues' && seg[3]){
      const id=seg[3];
      if(method==='PATCH' && seg.length===4) return json({issue:await updateIssue(env,request,user,id,await readJson(request))});
      if(method==='GET' && seg[4]==='articles') return json({articles:await getIssueArticlesAdmin(env,user,id)});
      if(method==='PUT' && seg[4]==='articles') return json({articles:await setIssueArticles(env,request,user,id,await readJson(request))});
      if(method==='POST' && seg[4] && ['submit','approve','reject','publish','archive'].includes(seg[4])){
        const input:any=await readJson(request).catch(()=>({}));
        return json({issue:await transitionIssue(env,request,user,id,seg[4] as any,String(input.note||''))});
      }
    }

    if(method==='GET' && p==='/api/admin/site-visuals') return json({visuals:await getSiteVisuals(env,true)});
    if(method==='PUT' && seg[2]==='site-visuals' && seg[3] && seg.length===4) return json({visuals:await assignSiteVisual(env,request,user,seg[3],await readJson(request))});
    if(method==='GET' && p==='/api/admin/media') return json({media:await listMedia(env)});
    if(method==='POST' && p==='/api/admin/media/upload') return json({media:await uploadMedia(env,request,user)},201);
    if(method==='POST' && p==='/api/admin/media/generate') return json({media:await generateImage(env,request,user,await readJson(request))},201);
    if(method==='POST' && p==='/api/admin/media/edit') return json({media:await editImage(env,request,user,await readJson(request))},201);
    if(method==='POST' && seg[2]==='media' && seg[3] && seg[4]==='analyze') return json({media:await analyzeMedia(env,request,user,seg[3])});
    if(method==='PATCH' && seg[2]==='media' && seg[3] && seg[4]==='visibility'){
      const input:any=await readJson(request); if(!['private','public'].includes(input.visibility)) throw new HttpError(400,'visibility 必須為 private 或 public');
      return json({media:await setMediaVisibility(env,request,user,seg[3],input.visibility)});
    }
    if(method==='DELETE' && seg[2]==='media' && seg[3] && seg.length===4) return json(await deleteMedia(env,request,user,seg[3]));

    if(method==='GET' && p==='/api/admin/newsletter/subscribers') return json({subscribers:await listSubscribers(env,user)});
    if(method==='GET' && p==='/api/admin/newsletter/campaigns') return json({campaigns:await listNewsletterCampaigns(env,user)});
    if(method==='POST' && p==='/api/admin/newsletter/campaigns') return json({campaign:await createNewsletterCampaign(env,request,user,await readJson(request))},201);
    if(method==='PATCH' && seg[2]==='newsletter' && seg[3]==='campaigns' && seg[4] && seg.length===5) return json({campaign:await updateNewsletterCampaign(env,request,user,seg[4],await readJson(request))});
    if(method==='POST' && seg[2]==='newsletter' && seg[3]==='campaigns' && seg[4] && seg[5]==='submit') return json({campaign:await submitNewsletter(env,request,user,seg[4])});
    if(method==='POST' && seg[2]==='newsletter' && seg[3]==='campaigns' && seg[4] && seg[5]==='reject') return json({campaign:await rejectNewsletter(env,request,user,seg[4])});
    if(method==='POST' && seg[2]==='newsletter' && seg[3]==='campaigns' && seg[4] && seg[5]==='approve') return json({campaign:await approveNewsletter(env,request,user,seg[4])});
    if(method==='POST' && seg[2]==='newsletter' && seg[3]==='campaigns' && seg[4] && seg[5]==='send') return json({campaign:await sendNewsletter(env,request,user,seg[4],await readJson(request).catch(()=>({})))});

    if(method==='GET' && p==='/api/admin/integrations') return json({integrations:await listIntegrations(env,user)});
    if(method==='POST' && seg[2]==='integrations' && seg[3] && seg[4]==='connect'){
      const input:any=await readJson(request).catch(()=>({})); return json({authorize_url:await startOAuth(env,request,user,seg[3],String(input.redirect_after||'/studio'))});
    }
    if(method==='POST' && seg[2]==='integrations' && seg[3] && seg[4]==='disconnect'){ await disconnectIntegration(env,request,user,seg[3]); return json({ok:true}); }

    if(method==='GET' && p==='/api/admin/canva/templates') return json(await listBrandTemplates(env,user,url.searchParams.get('q')||''));
    if(method==='GET' && seg[2]==='canva' && seg[3]==='templates' && seg[4] && seg[5]==='dataset') return json(await brandTemplateDataset(env,user,seg[4]));
    if(method==='POST' && p==='/api/admin/canva/autofill') return json(await createAutofill(env,request,user,await readJson(request)),202);
    if(method==='GET' && seg[2]==='canva' && seg[3]==='autofill' && seg[4]) return json(await getAutofillJob(env,user,seg[4]));
    if(method==='POST' && p==='/api/admin/canva/assets/from-media') return json(await uploadPublicAssetToCanva(env,request,user,await readJson(request)),202);
    if(method==='GET' && seg[2]==='canva' && seg[3]==='assets' && seg[4]) return json(await getCanvaAssetUploadJob(env,user,seg[4]));
    if(method==='POST' && seg[2]==='social' && seg[3] && seg[4]==='canva') { const input:any=await readJson(request); await attachCanvaDesign(env,request,user,seg[3],String(input.design_id||'')); return json({ok:true}); }

    if(method==='GET' && p==='/api/admin/social') return json({drafts:await listSocialDrafts(env,user)});
    if(method==='POST' && p==='/api/admin/social/generate') return json(await generateSocialCopy(env,user,await readJson(request)));
    if(method==='POST' && p==='/api/admin/social') return json({draft:await createSocialDraft(env,request,user,await readJson(request))},201);
    if(seg[2]==='social' && seg[3]){
      if(method==='PATCH' && seg.length===4) return json({draft:await updateSocialDraft(env,request,user,seg[3],await readJson(request))});
      if(method==='POST' && seg[4]==='submit'){ const input:any=await readJson(request).catch(()=>({})); return json({draft:await submitSocialDraft(env,request,user,seg[3],String(input.note||''))}); }
      if(method==='POST' && seg[4]==='reject'){ const input:any=await readJson(request).catch(()=>({})); return json({draft:await rejectSocialDraft(env,request,user,seg[3],String(input.note||''))}); }
      if(method==='POST' && seg[4]==='approve'){ const input:any=await readJson(request).catch(()=>({})); return json({draft:await approveSocialDraft(env,request,user,seg[3],String(input.note||''))}); }
      if(method==='POST' && seg[4]==='publish') return json({draft:await publishSocialDraft(env,request,user,seg[3])});
    }

    if(method==='GET' && p==='/api/admin/backups') return json({backups:await listBackups(env,user)});
    if(method==='POST' && p==='/api/admin/backups') return json({backup:await manualBackup(env,request,user)},201);
    throw new HttpError(404,'找不到管理 API');
  }

  if(isStudioPath(p)){
    await requireUser(request,env);
    const assetUrl=new URL(request.url); if(p==='/studio') assetUrl.pathname='/studio.html';
    return env.ASSETS.fetch(new Request(assetUrl.toString(),request));
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    try{return securityHeaders(await route(request,env,ctx));}
    catch(e:any){
      const requestId=crypto.randomUUID();
      console.error('request_error',requestId,e);
      if(e instanceof HttpError) return securityHeaders(json({error:e.message,request_id:requestId},e.status));
      return securityHeaders(json({error:'伺服器發生未預期錯誤',request_id:requestId},500));
    }
  },
  async scheduled(controller:ScheduledController,env:Env,ctx:ExecutionContext):Promise<void>{
    if(controller.cron==='17 3 * * *') ctx.waitUntil(createBackup(env).then(()=>undefined));
    else ctx.waitUntil(runDueJobs(env));
  }
};
