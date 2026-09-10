import { Router } from 'express'
import { all } from '../db/index.js'
import { okItem } from '../utils/response.js'
import { isAdmin } from '../middleware/auth.js'
import { pendingItemsForRole, pendingForSeniorManagement, listLeadSummaries, getNotifications } from '../services/leads.js'

const router = Router()

router.get('/pending', async (req, res) => {
  if (isAdmin(req.user)) {
    return okItem(res, { role: 'senior_management', ...(await pendingForSeniorManagement()) })
  }
  const clientCompany = req.user!.role === 'client' ? req.user!.client_company : null
  const items = await pendingItemsForRole(req.user!.role, clientCompany)
  return okItem(res, { role: req.user!.role, itemsToAction: items })
})

router.get('/kpis', async (req, res) => {
  const clientCompany = req.user!.role === 'client' ? req.user!.client_company || undefined : undefined
  const leads = await listLeadSummaries({ clientCompany })
  const kpis = {
    total: leads.length,
    active: leads.filter((l) => l!.status === 'active' && !l!.gateAwaitingApproval).length,
    gateAwaitingApproval: leads.filter((l) => l!.gateAwaitingApproval).length,
    onHold: leads.filter((l) => l!.status === 'on_hold').length,
    completed: leads.filter((l) => l!.status === 'completed').length,
    dropped: leads.filter((l) => l!.status === 'dropped').length,
    byGate: {
      rfi: leads.filter((l) => l!.currentGate === 'rfi' && l!.status === 'active').length,
      rfp: leads.filter((l) => l!.currentGate === 'rfp' && l!.status === 'active').length,
      agreement: leads.filter((l) => l!.currentGate === 'agreement' && l!.status === 'active').length,
    },
  }
  return okItem(res, kpis)
})

router.get('/notifications', async (req, res) => {
  const clientCompany = req.user!.role === 'client' ? req.user!.client_company : null
  const alerts = await getNotifications(req.user!.role, clientCompany)
  return okItem(res, alerts)
})

router.get('/action-log', async (req, res) => {
  if (!isAdmin(req.user)) return okItem(res, [])
  const rows = await all(`
    SELECT h.*, l.ref_code, l.product FROM history h
    JOIN leads l ON l.id = h.lead_id
    ORDER BY h.id DESC LIMIT 40
  `)
  return okItem(res, rows)
})

export default router
