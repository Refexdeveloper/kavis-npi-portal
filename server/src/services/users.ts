import { get } from '../db/index.js'
import { isAdmin, type AuthUser } from '../middleware/auth.js'
import { ROLE_LABELS, type Role } from '../config/stageGates.js'

export async function transformUser(id: number) {
  const row = await get<Record<string, unknown>>(`
    SELECT id, username, full_name, email, role, client_company, is_admin,
           COALESCE(is_team_head, 0) as is_team_head, activated,
           must_change_password, created_at, last_login
    FROM users WHERE id = ? AND deleted_at IS NULL
  `, [id])
  if (!row) return null
  const role = row.role as Role
  return {
    id: Number(row.id),
    username: row.username,
    full_name: row.full_name,
    email: row.email,
    role,
    role_label: ROLE_LABELS[role] || role,
    client_company: row.client_company,
    is_admin: isAdmin({ ...row, id: Number(row.id) } as AuthUser),
    is_team_head: !!row.is_team_head,
    activated: !!row.activated,
    must_change_password: !!row.must_change_password,
    created_at: row.created_at,
    last_login: row.last_login,
  }
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    role_label: ROLE_LABELS[user.role] || user.role,
    client_company: user.client_company,
    is_admin: isAdmin(user),
    is_team_head: !!user.is_team_head,
    must_change_password: !!user.must_change_password,
  }
}
