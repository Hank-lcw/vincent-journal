import type { Env, AuthUser } from './types';
import { requireRole } from './auth';
import { audit } from './audit';
import { nowIso, uuid } from './utils';

const tables=['staff_users','articles','article_revisions','media_assets','issues','issue_articles','subscribers','suppressions','newsletter_campaigns','integrations','social_drafts','approvals','publish_jobs','audit_log'] as const;

export async function createBackup(env:Env):Promise<{id:string;object_key:string;counts:Record<string,number>}>{
  const id=uuid(),started=nowIso();
  await env.DB.prepare(`INSERT INTO backup_runs (id,status,started_at) VALUES (?,'started',?)`).bind(id,started).run();
  try{
    const data:any={schema:'vincent-journal-backup-v1',created_at:started,tables:{}}; const counts:Record<string,number>={};
    for(const table of tables){ const sql=table==='integrations' ? `SELECT id,provider,account_label,external_account_id,status,token_expires_at,scopes_json,metadata_json,connected_by,connected_at,updated_at FROM integrations` : `SELECT * FROM ${table}`; const {results}=await env.DB.prepare(sql).all(); data.tables[table]=results||[]; counts[table]=(results||[]).length; }
    const key=`d1-json/${started.slice(0,10)}/${started.replace(/[:.]/g,'-')}-${id}.json`;
    await env.BACKUPS.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'},customMetadata:{backupId:id,createdAt:started}});
    await env.DB.prepare(`UPDATE backup_runs SET object_key=?,status='completed',row_counts_json=?,completed_at=? WHERE id=?`).bind(key,JSON.stringify(counts),nowIso(),id).run();
    return {id,object_key:key,counts};
  }catch(e:any){ await env.DB.prepare(`UPDATE backup_runs SET status='failed',error=?,completed_at=? WHERE id=?`).bind(String(e?.message||e).slice(0,2000),nowIso(),id).run(); throw e; }
}

export async function manualBackup(env:Env,request:Request,user:AuthUser):Promise<any>{
  requireRole(user,'admin'); const result=await createBackup(env); await audit(env,request,user,'backup.create','backup',result.id,{object_key:result.object_key}); return result;
}

export async function listBackups(env:Env,user:AuthUser):Promise<any[]> { requireRole(user,'admin'); const {results}=await env.DB.prepare(`SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 100`).all(); return results||[]; }
