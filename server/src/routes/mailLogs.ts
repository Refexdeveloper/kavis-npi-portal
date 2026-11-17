import { Router } from 'express'
import { fail, okItem } from '../utils/response.js'
import { requireUserManager } from '../middleware/auth.js'
import { emailLogStats, listEmailLogs } from '../services/mail.js'
import { runSlaEmailSweep } from '../services/notifications.js'

const router = Router()

router.use(requireUserManager)

router.get('/', async (req, res) => {
  const status = String(req.query.status || 'all')
  const limit = Number(req.query.limit) || 150
  const [rows, stats] = await Promise.all([
    listEmailLogs({ status, limit }),
    emailLogStats(),
  ])
  return okItem(res, { rows, stats })
})

router.post('/sla-sweep', async (_req, res) => {
  await runSlaEmailSweep()
  return okItem(res, { ok: true, message: 'SLA email sweep completed' })
})

router.get('/:id', async (req, res) => {
  const rows = await listEmailLogs({ limit: 500 })
  const row = rows.find((r) => r.id === Number(req.params.id))
  if (!row) return fail(res, 'Not found', 404)
  return okItem(res, row)
})

export default router
