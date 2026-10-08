import type { Env } from './types';
import { nowIso } from './utils';
import { createBackup } from './backup';
import { publishSocialDraftSystem } from './social';
import { sendPendingAutoNewsletters } from './newsletter';

export async function runDueJobs(env:Env):Promise<void>{
  const {results}=await env.DB.prepare(`SELECT * FROM publish_jobs WHERE status='pending' AND run_at<=? ORDER BY run_at LIMIT 20`).bind(nowIso()).all<any>();
  for(const job of results||[]){
    const claimed=await env.DB.prepare(`UPDATE publish_jobs SET status='running',attempts=attempts+1,updated_at=? WHERE id=? AND status='pending'`).bind(nowIso(),job.id).run(); if(!claimed.meta.changes) continue;
    try{
      if(job.job_type==='social_publish' && job.entity_id) await publishSocialDraftSystem(env,job.entity_id);
      else if(job.job_type==='backup') await createBackup(env);
      else throw new Error(`Unsupported scheduled job: ${job.job_type}`);
      await env.DB.prepare(`UPDATE publish_jobs SET status='completed',last_error=NULL,updated_at=? WHERE id=?`).bind(nowIso(),job.id).run();
    }catch(e:any){ const attempts=Number(job.attempts||0)+1; const status=attempts>=5?'failed':'pending'; const retry=new Date(Date.now()+Math.min(60,2**attempts)*60_000).toISOString(); await env.DB.prepare(`UPDATE publish_jobs SET status=?,run_at=?,last_error=?,updated_at=? WHERE id=?`).bind(status,retry,String(e?.message||e).slice(0,2000),nowIso(),job.id).run(); }
  }
  await sendPendingAutoNewsletters(env);
}
