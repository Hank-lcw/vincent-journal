import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { audit } from './audit';
import { nowIso } from './utils';

/** Fixed, published non-article image placements. The value stored in site_settings is an R2 media UUID. */
export const visualSlots = [
  { key:'portal_portrait', title:'首頁穿透人物', fallback:'assets/vj-portal-warm-portrait.svg', note:'首頁開場；建議直幅或 4:5' },
  { key:'editor_portrait', title:'首頁編輯者形象', fallback:'assets/vincent-editorial.webp', note:'From the Editor 左側圖片' },
  { key:'editor_stilllife', title:'首頁編輯者靜物', fallback:'assets/cover-botanical.webp', note:'From the Editor 右側圖片' },
  { key:'about_portrait', title:'關於我文章封面', fallback:'assets/vincent-editorial.webp', note:'ABOUT 頁介紹圖片' }
] as const;
type VisualKey = typeof visualSlots[number]['key'];
const settingKey=(key:string)=>'site_visual_'+key;
const safePath=(key:string):VisualKey=>{
  if(!visualSlots.some(s=>s.key===key)) throw new HttpError(400,'無效的網站圖片位置');
  return key as VisualKey;
};
export async function getSiteVisuals(env:Env,admin=false):Promise<any[]> {
  const {results}=await env.DB.prepare(`
    SELECT s.key,s.value,m.filename,m.public_url,m.visibility,m.alt_text
    FROM site_settings s
    LEFT JOIN media_assets m ON s.value=m.id
    WHERE s.key LIKE 'site_visual_%'
  `).all<any>();
  const values=new Map((results||[]).map((r:any)=>[r.key,r]));
  return visualSlots.map(slot=>{
    const row:any=values.get(settingKey(slot.key));
    const valid=Boolean(row?.value&&row?.visibility==='public'&&row?.public_url);
    return {
      key:slot.key,title:slot.title,note:slot.note,fallback:slot.fallback,
      url:valid?row.public_url:slot.fallback,
      media_id:valid?row.value:null,
      ...(admin?{filename:valid?row.filename:null,alt_text:valid?row.alt_text:null}:{}),
    };
  });
}
export async function assignSiteVisual(env:Env,request:Request,user:AuthUser,key:string,input:any):Promise<any[]> {
  if(!['owner','admin'].includes(user.role)) throw new HttpError(403,'只有 Owner／Admin 可管理網站圖片');
  safePath(key);
  const id=input?.media_id===null||input?.media_id===''?null:String(input?.media_id||'');
  if(id&&(!/^[\da-f-]{36}$/i.test(id))) throw new HttpError(400,'圖片識別碼格式錯誤');
  if(id){
    const media=await env.DB.prepare('SELECT id,mime_type FROM media_assets WHERE id=?').bind(id).first<any>();
    if(!media||!String(media.mime_type).startsWith('image/')) throw new HttpError(404,'找不到可使用的圖片素材');
    const url=`${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/media/${id}`;
    await env.DB.prepare('UPDATE media_assets SET visibility=?,public_url=? WHERE id=?').bind('public',url,id).run();
  }
  if(id){
    await env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
      .bind(settingKey(key),id,nowIso()).run();
  }else{
    await env.DB.prepare('DELETE FROM site_settings WHERE key=?').bind(settingKey(key)).run();
  }
  await audit(env,request,user,'site.visual.assign','site_settings',key,{media_id:id});
  return getSiteVisuals(env,true);
}
