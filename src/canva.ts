import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { requireRole } from './auth';
import { getIntegrationToken } from './integrations';
import { audit } from './audit';
import { nowIso } from './utils';

async function api(token:string,path:string,init:RequestInit={}):Promise<any>{
  const res=await fetch(`https://api.canva.com/rest/v1${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init.headers||{})}});
  const data:any=await res.json().catch(()=>({}));
  if(!res.ok) throw new HttpError(502,`Canva API 失敗：${data?.message||data?.code||res.status}`);
  return data;
}

export async function listBrandTemplates(env:Env,user:AuthUser,query=''):Promise<any>{
  requireRole(user,'editor');
  const {token}=await getIntegrationToken(env,'canva');
  const qs=new URLSearchParams({dataset:'non_empty',limit:'100',sort_by:'modified_descending'}); if(query) qs.set('query',query.slice(0,120));
  return api(token,`/brand-templates?${qs}`);
}
export async function brandTemplateDataset(env:Env,user:AuthUser,id:string):Promise<any>{
  requireRole(user,'editor'); const {token}=await getIntegrationToken(env,'canva');
  return api(token,`/brand-templates/${encodeURIComponent(id)}/dataset`);
}
export async function createAutofill(env:Env,request:Request,user:AuthUser,input:any):Promise<any>{
  requireRole(user,'editor');
  const templateId=String(input.brand_template_id||''); if(!templateId) throw new HttpError(400,'缺少 brand_template_id');
  const {token}=await getIntegrationToken(env,'canva');
  const dataset=await api(token,`/brand-templates/${encodeURIComponent(templateId)}/dataset`);
  const validFields=new Set(Object.keys(dataset?.dataset||{}));
  const data:any={}; for(const [k,v] of Object.entries(input.data||{})){ if(validFields.has(k)) data[k]=v; }
  if(!Object.keys(data).length) throw new HttpError(400,'沒有可填入的 Canva 欄位；請先檢查 Brand Template 的 Autofill 欄位名稱');
  const job=await api(token,'/autofills',{method:'POST',body:JSON.stringify({type:'create_from_brand_template',brand_template_id:templateId,data})});
  await audit(env,request,user,'canva.autofill_create','canva_design',job?.job?.id||job?.id||templateId,{templateId,fields:Object.keys(data)});
  return {job,dataset:dataset?.dataset||{}};
}
export async function getAutofillJob(env:Env,user:AuthUser,jobId:string):Promise<any>{
  requireRole(user,'editor'); const {token}=await getIntegrationToken(env,'canva'); return api(token,`/autofills/${encodeURIComponent(jobId)}`);
}
export async function attachCanvaDesign(env:Env,request:Request,user:AuthUser,socialDraftId:string,designId:string):Promise<void>{
  requireRole(user,'editor'); await env.DB.prepare(`UPDATE social_drafts SET canva_design_id=?,updated_at=? WHERE id=?`).bind(designId,nowIso(),socialDraftId).run();
  await audit(env,request,user,'social.canva_attach','social',socialDraftId,{designId});
}
export async function uploadPublicAssetToCanva(env:Env,request:Request,user:AuthUser,input:any):Promise<any>{
  requireRole(user,'editor');
  const mediaId=String(input.media_id||''); if(!mediaId) throw new HttpError(400,'缺少 media_id');
  const media=await env.DB.prepare(`SELECT id,filename,visibility,public_url FROM media_assets WHERE id=?`).bind(mediaId).first<any>();
  if(!media) throw new HttpError(404,'找不到媒體素材');
  if(media.visibility!=='public' || !media.public_url) throw new HttpError(409,'要交給 Canva 抓取的素材必須先設為公開');
  const {token}=await getIntegrationToken(env,'canva');
  const job=await api(token,'/url-asset-uploads',{method:'POST',body:JSON.stringify({name:String(media.filename||'VINCENT JOURNAL').slice(0,255),url:media.public_url})});
  await audit(env,request,user,'canva.asset_upload','media',mediaId,{jobId:job?.job?.id||null});
  return job;
}
export async function getCanvaAssetUploadJob(env:Env,user:AuthUser,jobId:string):Promise<any>{
  requireRole(user,'editor'); const {token}=await getIntegrationToken(env,'canva'); return api(token,`/url-asset-uploads/${encodeURIComponent(jobId)}`);
}
