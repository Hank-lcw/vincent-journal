import type { Env, AuthUser } from './types';
import { hashIp, nowIso, uuid } from './utils';

export async function audit(env: Env, request: Request | null, actor: AuthUser | null, action: string, entityType?: string, entityId?: string, metadata: unknown = {}): Promise<void> {
  try {
    const requestId = request?.headers.get('CF-Ray') || crypto.randomUUID();
    const ipHash = request ? await hashIp(request) : null;
    await env.DB.prepare(`INSERT INTO audit_log (id,actor_id,actor_email,action,entity_type,entity_id,request_id,ip_hash,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(uuid(), actor?.id || null, actor?.email || null, action, entityType || null, entityId || null, requestId, ipHash, JSON.stringify(metadata ?? {}), nowIso()).run();
  } catch (e) {
    console.error('audit_write_failed', e);
  }
}
