import type { Env, AuthUser, Role } from './types';
import { HttpError } from './http';
import { requireRole } from './auth';
import { audit } from './audit';
import { nowIso, uuid } from './utils';

const validRoles = new Set<Role>(['owner','admin','reviewer','editor']);

export async function listStaff(env: Env, user: AuthUser): Promise<any[]> {
  requireRole(user, 'admin');
  const { results } = await env.DB.prepare(`SELECT id,email,display_name,role,is_active,created_at,updated_at,last_login_at FROM staff_users ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'reviewer' THEN 3 ELSE 4 END, created_at`).all();
  return results || [];
}

export async function upsertStaff(env: Env, request: Request, user: AuthUser, input: any): Promise<any> {
  requireRole(user, 'admin');
  const email = String(input.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new HttpError(400, '請提供有效的 Email');
  const role = String(input.role || 'editor') as Role;
  if (!validRoles.has(role)) throw new HttpError(400, '不支援的權限角色');
  if (role === 'owner' && user.role !== 'owner') throw new HttpError(403, '只有 owner 可以授予 owner 權限');

  const existing = await env.DB.prepare(`SELECT id,role FROM staff_users WHERE email=? COLLATE NOCASE`).bind(email).first<any>();
  const id = existing?.id || uuid();
  const now = nowIso();
  if (existing) {
    if (existing.role === 'owner' && user.role !== 'owner') throw new HttpError(403, '只有 owner 可以修改 owner');
    await env.DB.prepare(`UPDATE staff_users SET display_name=?,role=?,is_active=?,updated_at=? WHERE id=?`)
      .bind(input.display_name ? String(input.display_name).slice(0,120) : null, role, input.is_active === false ? 0 : 1, now, id).run();
  } else {
    await env.DB.prepare(`INSERT INTO staff_users (id,email,display_name,role,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(id, email, input.display_name ? String(input.display_name).slice(0,120) : null, role, input.is_active === false ? 0 : 1, now, now).run();
  }
  await audit(env, request, user, existing ? 'staff.update' : 'staff.create', 'staff_user', id, { email, role });
  return env.DB.prepare(`SELECT id,email,display_name,role,is_active,created_at,updated_at,last_login_at FROM staff_users WHERE id=?`).bind(id).first();
}

export async function updateStaff(env: Env, request: Request, user: AuthUser, id: string, input: any): Promise<any> {
  requireRole(user, 'admin');
  const row = await env.DB.prepare(`SELECT id,email,role,is_active FROM staff_users WHERE id=?`).bind(id).first<any>();
  if (!row) throw new HttpError(404, '找不到管理員');
  if (row.role === 'owner' && user.role !== 'owner') throw new HttpError(403, '只有 owner 可以修改 owner');
  if (id === user.id && input.is_active === false) throw new HttpError(409, '不能停用目前登入中的自己');
  const role = input.role ? String(input.role) as Role : row.role as Role;
  if (!validRoles.has(role)) throw new HttpError(400, '不支援的權限角色');
  if (role === 'owner' && user.role !== 'owner') throw new HttpError(403, '只有 owner 可以授予 owner 權限');
  await env.DB.prepare(`UPDATE staff_users SET display_name=COALESCE(?,display_name),role=?,is_active=?,updated_at=? WHERE id=?`)
    .bind(input.display_name !== undefined ? String(input.display_name || '').slice(0,120) || null : null, role, input.is_active === undefined ? row.is_active : (input.is_active ? 1 : 0), nowIso(), id).run();
  await audit(env, request, user, 'staff.update', 'staff_user', id, { role, is_active: input.is_active });
  return env.DB.prepare(`SELECT id,email,display_name,role,is_active,created_at,updated_at,last_login_at FROM staff_users WHERE id=?`).bind(id).first();
}
