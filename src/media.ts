import type { Env, AuthUser } from './types';
import { HttpError } from './http';
import { audit } from './audit';
import { nowIso, safeJson, uuid } from './utils';

const allowedImageTypes = new Set(['image/jpeg','image/png','image/webp','image/avif']);
const MAX_UPLOAD = 15 * 1024 * 1024;

export async function listMedia(env: Env): Promise<any[]> {
  const { results } = await env.DB.prepare(`
    SELECT m.id,m.filename,m.mime_type,m.byte_size,m.width,m.height,m.source,m.parent_media_id,
      m.visibility,m.alt_text,m.tags_json,m.ai_prompt,m.ai_model,m.public_url,m.metadata_json,m.created_at,
      (SELECT COUNT(*) FROM media_assets c WHERE c.parent_media_id=m.id) AS child_count,
      (SELECT COUNT(*) FROM articles a WHERE a.cover_media_id=m.id) AS article_refs,
      (SELECT COUNT(*) FROM issues i WHERE i.cover_media_id=m.id) AS issue_refs,
      (SELECT COUNT(*) FROM social_drafts s WHERE s.media_ids_json LIKE '%"' || m.id || '"%') AS social_refs
    FROM media_assets m
    ORDER BY m.created_at DESC
    LIMIT 500
  `).all();
  return (results || []).map((r:any) => ({
    ...r,
    tags: safeJson(r.tags_json, []),
    metadata: safeJson(r.metadata_json,{}),
    child_count: Number(r.child_count || 0),
    article_refs: Number(r.article_refs || 0),
    issue_refs: Number(r.issue_refs || 0),
    social_refs: Number(r.social_refs || 0)
  }));
}

export async function uploadMedia(env: Env, request: Request, user: AuthUser): Promise<any> {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, '請上傳圖片檔案');
  if (!allowedImageTypes.has(file.type)) throw new HttpError(415, '僅支援 JPEG、PNG、WebP、AVIF');
  if (file.size <= 0 || file.size > MAX_UPLOAD) throw new HttpError(413, '圖片大小需低於 15MB');

  const parentId = String(form.get('parent_media_id') || '').trim() || null;
  const preset = String(form.get('preset') || '').trim().slice(0,80);
  const crop = safeJson(String(form.get('crop_json') || '{}'), {});
  let parent:any = null;
  if (parentId) {
    parent = await env.DB.prepare(`SELECT id,filename FROM media_assets WHERE id=?`).bind(parentId).first<any>();
    if (!parent) throw new HttpError(404, '找不到衍生版本的來源圖片');
  }

  const id = uuid();
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const key = `${parentId ? 'derived' : 'media'}/${new Date().toISOString().slice(0,10)}/${id}.${ext}`;
  const visibility = form.get('visibility') === 'public' ? 'public' : 'private';
  const alt = String(form.get('alt_text') || '').slice(0, 500);
  const tags = String(form.get('tags') || '').split(',').map(x=>x.trim()).filter(Boolean).slice(0,30);
  const metadata = parentId ? {
    derivative: true,
    preset: preset || 'custom',
    crop,
    source_filename: parent?.filename || null
  } : {};

  await env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: visibility === 'public' ? 'public,max-age=31536000,immutable' : 'private,no-store' },
    customMetadata: { source: parentId ? 'derived' : 'upload', originalFilename: file.name.slice(0,200), ...(preset ? {preset} : {}) }
  });
  const publicUrl = visibility === 'public' ? `${env.PUBLIC_BASE_URL.replace(/\/$/,'')}/media/${id}` : null;
  await env.DB.prepare(`INSERT INTO media_assets (id,object_key,public_url,filename,mime_type,byte_size,source,parent_media_id,visibility,alt_text,tags_json,metadata_json,created_by,created_at) VALUES (?,?,?,?,?,?,'${parentId ? 'import' : 'upload'}',?,?,?,?,?,?,?)`)
    .bind(id,key,publicUrl,file.name,file.type,file.size,parentId,visibility,alt,JSON.stringify(tags),JSON.stringify(metadata),user.id,nowIso()).run();
  await audit(env, request, user, parentId ? 'media.derive' : 'media.upload', 'media', id, { filename:file.name, bytes:file.size, visibility, parentId, preset: preset || null, crop });
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
  const allowedModels=new Set(['gpt-image-2','gpt-image-2.5-flare','gpt-image-2.5-sunburst']);
  const configured=env.OPENAI_IMAGE_MODEL||'gpt-image-2.5-flare';
  const requested=String(input.model||configured);
  const model=allowedModels.has(requested)?requested:configured;
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
  const editModel=env.OPENAI_IMAGE_EDIT_MODEL||'gpt-image-2.5-sunburst';
  body.set('model',editModel);
  body.set('prompt', `${editorialGuard}\n\nEdit request: ${prompt}`);
  body.set('image', new File([await object.arrayBuffer()], source.filename || 'source.webp', {type:source.mime_type || 'image/webp'}));
  body.set('output_format','webp');
  const res = await fetch('https://api.openai.com/v1/images/edits', { method:'POST', headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`}, body });
  const data:any = await res.json().catch(()=>({}));
  if (!res.ok) throw new HttpError(502, `AI 圖片修改失敗：${data?.error?.message || res.status}`);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new HttpError(502, 'AI 沒有回傳修改圖片');
  return storeAiResult(env,user,request,b64,prompt,editModel,mediaId,'image/webp');
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


export async function deleteMedia(env: Env, request: Request, user: AuthUser, id: string): Promise<any> {
  if (!['owner','admin'].includes(user.role)) throw new HttpError(403, '只有 Owner／Admin 可以刪除媒體素材');
  const asset = await env.DB.prepare(`SELECT * FROM media_assets WHERE id=?`).bind(id).first<any>();
  if (!asset) throw new HttpError(404, '找不到圖片');

  const child = await env.DB.prepare(`SELECT id,filename FROM media_assets WHERE parent_media_id=? ORDER BY created_at DESC LIMIT 1`).bind(id).first<any>();
  if (child) throw new HttpError(409, `這張素材仍有衍生版本「${child.filename}」，請先刪除衍生版本`);

  const article = await env.DB.prepare(`SELECT id,title FROM articles WHERE cover_media_id=? LIMIT 1`).bind(id).first<any>();
  if (article) throw new HttpError(409, `這張素材正被文章「${article.title}」使用，不能刪除`);

  const issue = await env.DB.prepare(`SELECT id,title,volume FROM issues WHERE cover_media_id=? LIMIT 1`).bind(id).first<any>();
  if (issue) throw new HttpError(409, `這張素材正被刊物 VOL. ${String(issue.volume).padStart(3,'0')}「${issue.title}」使用，不能刪除`);

  const social = await env.DB.prepare(`SELECT id,title,platform FROM social_drafts WHERE media_ids_json LIKE ? LIMIT 1`).bind(`%"${id}"%`).first<any>();
  if (social) throw new HttpError(409, `這張素材正被 ${social.platform} 社群草稿「${social.title || social.id}」使用，不能刪除`);

  await env.MEDIA.delete(asset.object_key);
  await env.DB.prepare(`DELETE FROM media_assets WHERE id=?`).bind(id).run();
  await audit(env, request, user, 'media.delete', 'media', id, { filename:asset.filename, parentId:asset.parent_media_id || null });
  return { ok:true, id };
}
