import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { all, get, now, run } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { transformUser } from '../services/users.js'
import { requireAdmin } from '../middleware/auth.js'
import { ROLE_LIST } from '../config/stageGates.js'

const router = Router()

router.get('/', requireAdmin, async (_req, res) => {
  const rows = await all<{ id: number }>('SELECT id FROM users WHERE deleted_at IS NULL ORDER BY id')
  const users = []
  for (const r of rows) users.push(await transformUser(r.id))
  return okList(res, users)
})

router.get('/roles', requireAdmin, async (_req, res) => okItem(res, ROLE_LIST))

router.post('/', requireAdmin, async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const fullName = String(req.body?.full_name || '').trim()
  const role = String(req.body?.role || '')
  const password = String(req.body?.password || '')
  const email = req.body?.email ? String(req.body.email).trim() : null
  const clientCompany = req.body?.client_company ? String(req.body.client_company).trim() : null

  if (!username || !fullName || !role) return fail(res, 'Username, full name and role are required')
  if (!ROLE_LIST.includes(role as any)) return fail(res, 'Unknown role')
  if (password.length < 8) return fail(res, 'Password must be at least 8 characters')
  if (role === 'client' && !clientCompany) return fail(res, 'Client company is required for the Client role, so their account only sees their own leads')

  const exists = await get('SELECT id FROM users WHERE LOWER(username) = ?', [username])
  if (exists) return fail(res, 'That username already exists')

  const ts = now()
  const isTeamHead = !!req.body?.is_team_head
  const info = await run(`
    INSERT INTO users (username, password, full_name, email, role, client_company, is_admin, is_team_head, activated, must_change_password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `, [
    username, bcrypt.hashSync(password, 10), fullName, email, role, clientCompany,
    role === 'senior_management' ? 1 : 0, isTeamHead ? 1 : 0, ts, ts,
  ])
  return okItem(res, await transformUser(info.insertId), 201)
})

router.patch('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  const existing = await get('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [id])
  if (!existing) return fail(res, 'Not found', 404)

  const fields: string[] = []
  const params: unknown[] = []
  const map: Record<string, string> = { full_name: 'full_name', email: 'email', client_company: 'client_company', activated: 'activated' }
  for (const [k, col] of Object.entries(map)) {
    if (req.body?.[k] !== undefined) { fields.push(`${col} = ?`); params.push(req.body[k]) }
  }
  if (req.body?.is_team_head !== undefined) {
    fields.push('is_team_head = ?'); params.push(req.body.is_team_head ? 1 : 0)
  }
  if (req.body?.role) {
    if (!ROLE_LIST.includes(req.body.role)) return fail(res, 'Unknown role')
    fields.push('role = ?'); params.push(req.body.role)
    fields.push('is_admin = ?'); params.push(req.body.role === 'senior_management' ? 1 : 0)
  }
  if (req.body?.password) {
    if (String(req.body.password).length < 8) return fail(res, 'Password must be at least 8 characters')
    fields.push('password = ?'); params.push(bcrypt.hashSync(String(req.body.password), 10))
    fields.push('must_change_password = 1')
  }
  if (!fields.length) return okItem(res, await transformUser(id))
  fields.push('updated_at = ?')
  params.push(now(), id)
  await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params)
  return okItem(res, await transformUser(id))
})

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user!.id) return fail(res, 'You cannot deactivate your own account')
  await run('UPDATE users SET deleted_at = ?, activated = 0 WHERE id = ?', [now(), id])
  return okMessage(res, 'User deactivated')
})

export default router
