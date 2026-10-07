import type { Env, AuthUser, Role } from './types';
import { HttpError } from './http';
import { nowIso, uuid } from './utils';

const roleWeight: Record<Role, number> = { editor: 10, reviewer: 20, admin: 30, owner: 40 };
const jwksCache = new Map<string, { expires:number; keys:any[] }>();

function decodeB64UrlText(value:string):string{
  const padded=value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded),c=>c.charCodeAt(0)));
}
function decodeB64UrlBytes(value:string):Uint8Array{
  const padded=value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4);
  return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
}

async function getJwks(teamDomain:string):Promise<any[]>{
  const base=teamDomain.replace(/\/$/,''); const cached=jwksCache.get(base);
  if(cached && cached.expires>Date.now()) return cached.keys;
  const res=await fetch(`${base}/cdn-cgi/access/certs`,{headers:{accept:'application/json'}});
  if(!res.ok) throw new Error(`JWKS ${res.status}`);
  const data:any=await res.json(); const keys=Array.isArray(data?.keys)?data.keys:[];
  if(!keys.length) throw new Error('JWKS 沒有可用金鑰');
  jwksCache.set(base,{keys,expires:Date.now()+10*60_000}); return keys;
}

async function verifyAccessJwt(token:string,env:Env):Promise<any>{
  const chunks=token.split('.'); if(chunks.length!==3) throw new Error('JWT 格式錯誤');
  const header=JSON.parse(decodeB64UrlText(chunks[0])); const payload=JSON.parse(decodeB64UrlText(chunks[1]));
  const keys=await getJwks(env.TEAM_DOMAIN); const jwk=keys.find((k:any)=>k.kid===header.kid) || keys[0];
  let algorithm:AlgorithmIdentifier|RsaHashedImportParams|EcKeyImportParams; let verifyAlgo:AlgorithmIdentifier|RsaPssParams|EcdsaParams;
  if(header.alg==='RS256') { algorithm={name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'} as RsaHashedImportParams; verifyAlgo={name:'RSASSA-PKCS1-v1_5'}; }
  else if(header.alg==='ES256') { algorithm={name:'ECDSA',namedCurve:'P-256'} as EcKeyImportParams; verifyAlgo={name:'ECDSA',hash:'SHA-256'} as EcdsaParams; }
  else throw new Error(`不支援的 JWT 演算法：${header.alg}`);
  const key=await crypto.subtle.importKey('jwk',jwk,algorithm,false,['verify']);
  const ok=await crypto.subtle.verify(verifyAlgo,key,decodeB64UrlBytes(chunks[2]),new TextEncoder().encode(`${chunks[0]}.${chunks[1]}`));
  if(!ok) throw new Error('JWT 簽章無效');
  const now=Math.floor(Date.now()/1000); if(payload.exp && Number(payload.exp)<now-30) throw new Error('JWT 已過期'); if(payload.nbf && Number(payload.nbf)>now+30) throw new Error('JWT 尚未生效');
  const issuer=env.TEAM_DOMAIN.replace(/\/$/,''); if(payload.iss!==issuer) throw new Error('JWT issuer 不符');
  const aud=Array.isArray(payload.aud)?payload.aud:[payload.aud]; if(!aud.map(String).includes(env.POLICY_AUD)) throw new Error('JWT audience 不符');
  return payload;
}

export async function requireUser(request: Request, env: Env): Promise<AuthUser> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new HttpError(401, '需要管理員登入');
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) throw new HttpError(503, 'Cloudflare Access 尚未完成設定');

  let email = '';
  let name: string | null = null;
  try {
    const payload = await verifyAccessJwt(token, env);
    email = String(payload.email || '').trim().toLowerCase();
    name = payload.name ? String(payload.name) : null;
  } catch (e) {
    throw new HttpError(401, `管理員登入驗證失敗${e instanceof Error ? `：${e.message}` : ''}`);
  }
  if (!email) throw new HttpError(401, '登入憑證缺少 email');

  let row = await env.DB.prepare(`SELECT id,email,display_name,role,is_active FROM staff_users WHERE email=? COLLATE NOCASE`).bind(email).first<any>();
  if (!row && env.BOOTSTRAP_ADMIN_EMAIL && email === env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()) {
    const id = uuid();
    await env.DB.prepare(`INSERT INTO staff_users (id,email,display_name,role,is_active,created_at,updated_at,last_login_at) VALUES (?,?,?,?,1,?,?,?)`)
      .bind(id, email, name || 'Vincent', 'owner', nowIso(), nowIso(), nowIso()).run();
    row = { id, email, display_name: name || 'Vincent', role: 'owner', is_active: 1 };
  }
  if (!row || !row.is_active) throw new HttpError(403, '此帳號沒有 VINCENT STUDIO 權限');
  await env.DB.prepare(`UPDATE staff_users SET last_login_at=?, updated_at=? WHERE id=?`).bind(nowIso(), nowIso(), row.id).run();
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role as Role };
}

export function requireRole(user: AuthUser, minimum: Role): void {
  if (roleWeight[user.role] < roleWeight[minimum]) throw new HttpError(403, `此操作至少需要 ${minimum} 權限`);
}
export function canApprove(user: AuthUser): boolean { return roleWeight[user.role] >= roleWeight.reviewer; }
export function canAdmin(user: AuthUser): boolean { return roleWeight[user.role] >= roleWeight.admin; }
