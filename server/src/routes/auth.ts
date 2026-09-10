import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { get, run, now } from '../db/index.js'
import { authRequired, signToken } from '../middleware/auth.js'
import { fail, okItem, okMessage } from '../utils/response.js'
import { transformUser } from '../services/users.js'

const router = Router()

router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!username || !password) return fail(res, 'Username and password are required')

  const user = await get<Record<string, unknown>>(`
    SELECT * FROM users WHERE LOWER(username) = ? AND deleted_at IS NULL
  `, [username])

  if (!user || !user.activated) return fail(res, 'Invalid username or password', 401)
  if (!bcrypt.compareSync(password, String(user.password))) {
    return fail(res, 'Invalid username or password', 401)
  }

  const token = signToken({ id: Number(user.id), username: String(user.username) })
  await run('UPDATE users SET last_login = ? WHERE id = ?', [now(), user.id])

  return okItem(res, {
    status: 'success',
    token,
    token_type: 'Bearer',
    expires_in: 604800,
    user: await transformUser(Number(user.id)),
  })
})

router.get('/user', authRequired, async (req, res) => {
  return okItem(res, await transformUser(req.user!.id))
})

router.post('/logout', authRequired, (_req, res) => okMessage(res, 'Logged out'))

router.post('/password/change', authRequired, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')
  if (newPassword.length < 8) return fail(res, 'New password must be at least 8 characters')

  const row = await get<{ password: string }>('SELECT password FROM users WHERE id = ?', [req.user!.id])
  if (!row || !bcrypt.compareSync(currentPassword, row.password)) {
    return fail(res, 'Current password is incorrect', 401)
  }
  await run('UPDATE users SET password = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [
    bcrypt.hashSync(newPassword, 10), now(), req.user!.id,
  ])
  return okMessage(res, 'Password updated')
})

export default router
