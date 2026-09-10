import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { get } from '../db/index.js'
import { fail } from '../utils/response.js'
import type { Role } from '../config/stageGates.js'

export type AuthUser = {
  id: number
  username: string
  full_name: string
  email: string | null
  role: Role
  client_company: string | null
  is_admin: number
  is_team_head: number
  activated: number
  must_change_password: number
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const secret = () => process.env.JWT_SECRET || 'dev-secret-change-me'

export function signToken(user: { id: number; username: string }) {
  return jwt.sign({ sub: user.id, username: user.username }, secret(), { expiresIn: '7d' })
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return fail(res, 'Unauthorized', 401)
  }
  try {
    const decoded = jwt.verify(header.slice(7), secret()) as unknown as { sub: number }
    const row = await get<AuthUser>(`
      SELECT id, username, full_name, email, role, client_company, is_admin,
             COALESCE(is_team_head, 0) as is_team_head, activated, must_change_password
      FROM users WHERE id = ? AND deleted_at IS NULL
    `, [decoded.sub])

    if (!row || !row.activated) return fail(res, 'Unauthorized', 401)
    req.user = row
    next()
  } catch {
    return fail(res, 'Unauthorized', 401)
  }
}

/** Senior Management doubles as the system's Admin/CEO access level. */
export function isAdmin(user?: AuthUser | null) {
  return !!user && (Number(user.is_admin) === 1 || user.role === 'senior_management')
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (isAdmin(req.user)) return next()
  return fail(res, 'Forbidden: Senior Management / Admin only', 403)
}

/** Passes if the user holds one of the given roles, or is Admin/Senior Management. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isAdmin(req.user)) return next()
    if (req.user && roles.includes(req.user.role)) return next()
    return fail(res, `Forbidden: requires one of [${roles.join(', ')}]`, 403)
  }
}
