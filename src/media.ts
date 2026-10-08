import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { audit } from './audit';
import { nowIso, safeJson, uuid } from './utils';

const allowedImageTypes = new Set(['image/jpeg','image/png','image/webp','image/avif']);
const MAX_UPLOAD = 15 * 1024 * 1024;

export async function listMedia(env: Env): Promise<any[]> {
  const { results } = await env.DB.prepare(`SELECT id,filename,mime_type,byte_size,source,parent_media_id,visibility,alt_text,tags_json,ai_prompt,ai_model,public_url,metadata_json,created_at FROM media_assets ORDER BY created_at DESC LIMIT 300`).all();
  return (results || []).map((r:any) => ({...r, tags: safeJson(r.tags_json, []), metadata: safeJson(r.metadata_json,{})}));
}

export async function uploadMedia(env: Env, request: Request, user: AuthUser): Promise<any> {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, '請上傳圖片檔案');
  if (!allowedImageTypes.has(file.type)) throw new HttpError(415, '僅支援 JPEG、PNG、WebP、AVIF');
  if (file.size <= 0 || file.size > MAX_UPLOAD) throw new HttpError(413, '圖片大小需低於 15MB');
  const id = uuid();
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const key = `media/${new Date().toISOString().slice(0,10)}/${id}.${ext}`;
  const visibility = form.get('visibility') === 'public' ? 'public' : 'private';
  const alt = String(form.get('alt_text') || '').slice(0, 500);
  const tags = String(form.get('tags') || '').split(',').map(x=>x.trim()).filter(Boolean).slice(0,30);
  await env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: visibility === 'public' ? 'public,max-age=31536000,immutable' : 'private,no-store' },
    customMetadata: { source: 'upload', originalFilename: file.name.slice(0,200) }
  });
  const publicUrl = visibility === 'public' ? `${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/media/${id}` : null;
  await env.DB.prepare(`INSERT INTO media_assets (id,object_key,public_url,filename,mime_type,byte_size,source,visibility,alt_text,tags_json,created_by,created_at) VALUES (?,?,?,?,?,?,'upload',?,?,?,?,?)`)
    .bind(id,key,publicUrl,file.name,file.type,file.size,visibility,alt,JSON.stringify(tags),user.id,nowIso()).run();
  await audit(env, request, user, 'media.upload', 'media', id, { filename:file.name, bytes:file.size, visibility });
  return env.DB.prepare(`SELECT * FROM media_assets WHERE id=?`).bind(id).first();
}

export async function serveMedia(env: Env, request: Request, id: string, user: AuthUser | null): Promise<Response> {
  const asset = await env.DB.prepare(`SELECT * FROM media_assets WHERE id=?`).bind(id).first<any>();
  if (!asset) throw new HttpError(404, '找不到圖片');
  if (asset.visibility !== 'public' && !user) throw new HttpError(404, '找不到圖片');
  const object = await env.MEDIA.get(asset.object_key);
  if (!object) throw new HttpError(404, '圖片檔案不存在');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('x-content-type-options','nosniff');
  headers.set('cache-control', asset.visibility === 'public' ? 'public,max-age=31536000,immutable' : 'private,no-store');
  const inm=request.headers.get('if-none-match');
  if(inm && inm.split(',').map(x=>x.trim()).includes(object.httpEtag)) return new Response(null,{status:304,headers});
  if(request.method.toUpperCase()==='HEAD') return new Response(null,{status:200,headers});
  return new Response(object.body, { headers });
}

const editorialGuard = `VINCENT JOURNAL editorial image. European art journal meets modern scientific editorial. Warm neutral palette, natural light, restrained, refined, photographic realism. If a person is present, prefer cropped facial/body details, skin texture, profile contour, hands or silhouette; avoid a centered complete synthetic face unless explicitly requested. Avoid glossy beauty-ad aesthetics, plastic skin, exaggerated symmetry, cheap stock-photo styling, sales graphics, embedded logos and text.`;

async function storeAiResult(env: Env, user: AuthUser, request: Request, b64: string, prompt: string, model: string, parentId?: string, mime='image/webp'): Promise<any> {
  const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
  if (bytes.byteLength > 25*1024*1024) throw new HttpError(502, 'AI 圖片檔案過大');
  const id = uuid();
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
  const key = `ai/${new Date().toISOString().slice(0,10)}/${id}.${ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata:{contentType:mime,cacheControl:'private,no-store'}, customMetadata:{source: parentId ? 'ai_edit':'ai_generate', model} });
  await env.DB.prepare(`INSERT INTO media_assets (id,object_key,filename,mime_type,byte_size,source,parent_media_id,visibility,alt_text,tags_json,ai_prompt,ai_model,metadata_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,key,`${id}.${ext}`,mime,bytes.byteLength,parentId?'ai_edit':'ai_generate',parentId||null,'private','',JSON.stringify(['AI','VINCENT JOURNAL']),prompt,model,JSON.stringify({editorialGuard:true}),user.id,nowIso()).run();
  await audit(env, request, user, parentId ? 'media.ai_edit':'media.ai_generate','media',id,{model,parentId:parentId||null});
  return env.DB.prepare(`SELECT * FROM media_assets WHERE id=?`).bind(id).first();
}

export async function generateImage(env: Env, request: Request, user: AuthUser, input: any): Promise<any> {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, 'OPENAI_API_KEY 尚未設定');
  const prompt = String(input.prompt || '').trim();
  if (prompt.length < 8 || prompt.length > 3500) throw new HttpError(400, '圖片描述需介於 8–3500 字元');
  const size = ['1024x1024','1536x1024','1024x1536'].includes(input.size) ? input.size : '1536x1024';
  const model = input.model === 'gpt-image-2.5-sunburst' ? 'gpt-image-2.5-sunburst' : 'gpt-image-2.5-flare';
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method:'POST',
    headers:{'authorization':`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},
    body:JSON.stringify({ model, prompt:`${editorialGuard}\n\nEditorial brief: ${prompt}`, size, output_format:'webp', n:1 })
  });
  const data:any = await res.json().catch(()=>({}));
  if (!res.ok) throw new HttpError(502, `AI 圖片生成失敗：${data?.error?.message || res.status}`);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new HttpError(502, 'AI 沒有回傳圖片資料');
  return storeAiResult(env,user,request,b64,prompt,model,undefined,'image/webp');
}

export async function editImage(env: Env, request: Request, user: AuthUser, input: any): Promise<any> {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, 'OPENAI_API_KEY 尚未設定');
  const mediaId = String(input.media_id || '');
  const prompt = String(input.prompt || '').trim();
  if (!mediaId || prompt.length < 4) throw new HttpError(400, '需要原始圖片與修改指令');
  const source = await env.DB.prepare(`SELECT * FROM media_assets WHERE id=?`).bind(mediaId).first<any>();
  if (!source) throw new HttpError(404, '找不到原始圖片');
  const object = await env.MEDIA.get(source.object_key);
  if (!object) throw new HttpError(404, '原始圖片檔案不存在');
  const body = new FormData();
  body.set('model','gpt-image-2.5-sunburst');
  body.set('prompt', `${editorialGuard}\n\nEdit request: ${prompt}`);
  body.set('image', new File([await object.arrayBuffer()], source.filename || 'source.webp', {type:source.mime_type || 'image/webp'}));
  body.set('output_format','webp');
  const res = await fetch('https://api.openai.com/v1/images/edits', { method:'POST', headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`}, body });
  const data:any = await res.json().catch(()=>({}));
  if (!res.ok) throw new HttpError(502, `AI 圖片修改失敗：${data?.error?.message || res.status}`);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new HttpError(502, 'AI 沒有回傳修改圖片');
  return storeAiResult(env,user,request,b64,prompt,'gpt-image-2.5-sunburst',mediaId,'image/webp');
}

export async function setMediaVisibility(env: Env, request: Request, user: AuthUser, id: string, visibility: 'private'|'public'): Promise<any> {
  const asset = await env.DB.prepare(`SELECT * FROM media_assets WHERE id=?`).bind(id).first<any>();
  if (!asset) throw new HttpError(404,'找不到圖片');
  if (visibility === 'private') {
    const articleUse = await env.DB.prepare(`SELECT id,title FROM articles WHERE cover_media_id=? AND status='published' LIMIT 1`).bind(id).first<any>();
    if (articleUse) throw new HttpError(409,`這張圖片正被已發布文章「${articleUse.title}」使用，不能改為私人`);
    const issueUse = await env.DB.prepare(`SELECT id,title,volume FROM issues WHERE cover_media_id=? AND status='published' LIMIT 1`).bind(id).first<any>();
    if (issueUse) throw new HttpError(409,`這張圖片正被已發布刊物 VOL. ${String(issueUse.volume).padStart(3,'0')}「${issueUse.title}」使用，不能改為私人`);
  }
  const publicUrl = visibility === 'public' ? `${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/media/${id}` : null;
  await env.DB.prepare(`UPDATE media_assets SET visibility=?, public_url=? WHERE id=?`).bind(visibility,publicUrl,id).run();
  await audit(env,request,user,'media.visibility','media',id,{visibility});
  return env.DB.prepare(`SELECT * FROM media_assets WHERE id=?`).bind(id).first();
}
