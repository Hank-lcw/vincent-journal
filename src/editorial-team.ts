import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { requireRole } from './auth';
import { audit } from './audit';
import { nowIso, uuid } from './utils';

function clean(value:any,max:number):string{
  return String(value??'').trim().slice(0,max);
}
function normalize(input:any){
  const name=clean(input.name,120);
  if(!name) throw new HttpError(400,'姓名不可空白');
  return {
    name,
    english_name:clean(input.english_name,120),
    title:clean(input.title,160),
    education:clean(input.education,1500),
    experience:clean(input.experience,1500),
    bio:clean(input.bio,4000),
    photo_media_id:input.photo_media_id?String(input.photo_media_id):null,
    is_primary:input.is_primary?1:0,
    visible:input.visible===false||input.visible===0?0:1,
    sort_order:Number.isFinite(Number(input.sort_order))?Math.max(0,Math.min(9999,Math.trunc(Number(input.sort_order)))):100,
  };
}
async function validatePhoto(env:Env,id:string|null):Promise<void>{
  if(!id)return;
  const media=await env.DB.prepare('SELECT id,mime_type FROM media_assets WHERE id=?').bind(id).first<any>();
  if(!media||!String(media.mime_type||'').startsWith('image/')) throw new HttpError(400,'找不到指定的人像素材');
}
async function makePhotoPublic(env:Env,id:string|null):Promise<void>{
  if(!id)return;
  const url=`${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/media/${id}`;
  await env.DB.prepare(`UPDATE media_assets SET visibility='public',public_url=? WHERE id=?`).bind(url,id).run();
}

export async function listEditorialPeople(env:Env,admin=false):Promise<any[]>{
  const where=admin?'':'WHERE p.visible=1';
  const {results}=await env.DB.prepare(`
    SELECT p.*,m.public_url AS photo_url,m.alt_text AS photo_alt
    FROM editorial_people p
    LEFT JOIN media_assets m ON m.id=p.photo_media_id
    ${where}
    ORDER BY p.is_primary DESC,p.sort_order ASC,p.created_at ASC
  `).all<any>();
  return results||[];
}

export async function createEditorialPerson(env:Env,request:Request,user:AuthUser,input:any):Promise<any>{
  requireRole(user,'admin');
  const d=normalize(input);
  await validatePhoto(env,d.photo_media_id);
  const id=uuid(),now=nowIso();
  if(d.is_primary) await env.DB.prepare('UPDATE editorial_people SET is_primary=0,updated_at=? WHERE is_primary=1').bind(now).run();
  await env.DB.prepare(`INSERT INTO editorial_people
    (id,name,english_name,title,education,experience,bio,photo_media_id,is_primary,visible,sort_order,created_by,updated_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,d.name,d.english_name,d.title,d.education,d.experience,d.bio,d.photo_media_id,d.is_primary,d.visible,d.sort_order,user.id,user.id,now,now).run();
  await makePhotoPublic(env,d.photo_media_id);
  await audit(env,request,user,'editorial_person.create','editorial_person',id,{name:d.name,is_primary:Boolean(d.is_primary)});
  return env.DB.prepare('SELECT * FROM editorial_people WHERE id=?').bind(id).first();
}

export async function updateEditorialPerson(env:Env,request:Request,user:AuthUser,id:string,input:any):Promise<any>{
  requireRole(user,'admin');
  const current=await env.DB.prepare('SELECT * FROM editorial_people WHERE id=?').bind(id).first<any>();
  if(!current) throw new HttpError(404,'找不到編輯團隊成員');
  const d=normalize({...current,...input});
  await validatePhoto(env,d.photo_media_id);
  const now=nowIso();
  if(d.is_primary) await env.DB.prepare('UPDATE editorial_people SET is_primary=0,updated_at=? WHERE is_primary=1 AND id<>?').bind(now,id).run();
  if(current.is_primary && !d.is_primary){
    const other=await env.DB.prepare('SELECT id FROM editorial_people WHERE id<>? AND visible=1 ORDER BY sort_order LIMIT 1').bind(id).first<any>();
    if(!other) throw new HttpError(409,'至少需要保留一位主編；請先把另一位成員設為主編');
  }
  await env.DB.prepare(`UPDATE editorial_people SET
    name=?,english_name=?,title=?,education=?,experience=?,bio=?,photo_media_id=?,is_primary=?,visible=?,sort_order=?,updated_by=?,updated_at=?
    WHERE id=?`)
    .bind(d.name,d.english_name,d.title,d.education,d.experience,d.bio,d.photo_media_id,d.is_primary,d.visible,d.sort_order,user.id,now,id).run();
  await makePhotoPublic(env,d.photo_media_id);
  await audit(env,request,user,'editorial_person.update','editorial_person',id,{name:d.name,is_primary:Boolean(d.is_primary)});
  return env.DB.prepare('SELECT * FROM editorial_people WHERE id=?').bind(id).first();
}

export async function deleteEditorialPerson(env:Env,request:Request,user:AuthUser,id:string):Promise<{ok:true}>{
  requireRole(user,'admin');
  const current=await env.DB.prepare('SELECT * FROM editorial_people WHERE id=?').bind(id).first<any>();
  if(!current) throw new HttpError(404,'找不到編輯團隊成員');
  if(current.is_primary) throw new HttpError(409,'主編不可直接刪除；請先把另一位成員設為主編');
  await env.DB.prepare('DELETE FROM editorial_people WHERE id=?').bind(id).run();
  await audit(env,request,user,'editorial_person.delete','editorial_person',id,{name:current.name});
  return {ok:true};
}
