import { Router } from 'express'
import { get, run, now } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { requireAdmin, requireRole } from '../middleware/auth.js'
import { logHistory } from '../services/history.js'
import { findGate, nextGate, GATE_ORDER, GATE_LABELS, type GateKey } from '../config/stageGates.js'
import {
  createLead, getLead, getLeadFullForUser, getLeadItems, listLeadSummaries, canViewLead, activateReachedStep,
} from '../services/leads.js'

const router = Router()

router.get('/', async (req, res) => {
  const clientCompany = req.user!.role === 'client' ? req.user!.client_company || undefined : undefined
  const rows = await listLeadSummaries({ clientCompany: clientCompany || undefined })
  return okList(res, rows)
})

router.post('/', requireRole('business_development'), async (req, res) => {
  const product = String(req.body?.product || '').trim()
  const clientName = String(req.body?.clientName || '').trim()
  if (!product || !clientName) return fail(res, 'Product and client name are required')

  const leadId = await createLead({
    product,
    strength: req.body?.strength,
    dosageForm: req.body?.dosageForm,
    clientName,
    clientCountry: req.body?.clientCountry,
    priority: req.body?.priority,
    potentMolecule: !!req.body?.potentMolecule,
    notes: req.body?.notes ? String(req.body.notes) : undefined,
  }, req.user!)

  return okItem(res, await getLeadFullForUser(leadId, req.user!), 201)
})

router.get('/:id', async (req, res) => {
  const lead = await getLead(Number(req.params.id))
  if (!lead) return fail(res, 'Not found', 404)
  if (!canViewLead(req.user!, lead)) return fail(res, 'Forbidden', 403)
  return okItem(res, await getLeadFullForUser(lead.id, req.user!))
})

router.patch('/:id', requireRole('business_development'), async (req, res) => {
  const lead = await getLead(Number(req.params.id))
  if (!lead) return fail(res, 'Not found', 404)

  const fields: string[] = []
  const params: unknown[] = []
  const map: Record<string, string> = {
    product: 'product', strength: 'strength', dosageForm: 'dosage_form',
    clientName: 'client_name', clientCountry: 'client_country', priority: 'priority',
  }
  for (const [k, col] of Object.entries(map)) {
    if (req.body?.[k] !== undefined) { fields.push(`${col} = ?`); params.push(req.body[k]) }
  }
  if (!fields.length) return okItem(res, await getLeadFullForUser(lead.id, req.user!))
  fields.push('updated_at = ?')
  params.push(now(), lead.id)
  await run(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`, params)
  await logHistory(lead.id, req.user!, 'Details Updated', 'Lead details were edited.')
  return okItem(res, await getLeadFullForUser(lead.id, req.user!))
})

router.post('/:id/hold', requireAdmin, async (req, res) => {
  const lead = await getLead(Number(req.params.id))
  if (!lead) return fail(res, 'Not found', 404)
  if (lead.status !== 'active') return fail(res, `Lead is currently ${lead.status}, not active`)
  const reason = String(req.body?.reason || 'Placed on hold by Admin.')
  await run(`UPDATE leads SET status = 'on_hold', hold_reason = ?, updated_at = ? WHERE id = ?`, [reason, now(), lead.id])
  await logHistory(lead.id, req.user!, 'Placed On Hold', reason)
  return okItem(res, await getLeadFullForUser(lead.id, req.user!))
})

router.post('/:id/resume', requireAdmin, async (req, res) => {
  const lead = await getLead(Number(req.params.id))
  if (!lead) return fail(res, 'Not found', 404)
  if (lead.status !== 'on_hold') return fail(res, 'Lead is not on hold')
  await run(`UPDATE leads SET status = 'active', hold_reason = NULL, updated_at = ? WHERE id = ?`, [now(), lead.id])
  await logHistory(lead.id, req.user!, 'Resumed', 'Lead resumed from hold.')
  return okItem(res, await getLeadFullForUser(lead.id, req.user!))
})

router.post('/:id/drop', requireRole('business_development'), async (req, res) => {
  const lead = await getLead(Number(req.params.id))
  if (!lead) return fail(res, 'Not found', 404)
  if (lead.status === 'dropped' || lead.status === 'completed') return fail(res, `Lead is already ${lead.status}`)
  const reason = String(req.body?.reason || '').trim()
  if (!reason) return fail(res, 'A reason is required to drop a lead')
  await run(`UPDATE leads SET status = 'dropped', drop_reason = ?, updated_at = ? WHERE id = ?`, [reason, now(), lead.id])
  await logHistory(lead.id, req.user!, 'Dropped', `Lead dropped at ${GATE_LABELS[lead.current_gate]} — ${reason}`)
  return okItem(res, await getLeadFullForUser(lead.id, req.user!))
})

router.post('/:id/move', requireAdmin, async (req, res) => {
  const lead = await getLead(Number(req.params.id))
  if (!lead) return fail(res, 'Not found', 404)
  const gate = String(req.body?.gate || '')
  if (!findGate(gate)) return fail(res, 'Unknown gate')
  const status = lead.status === 'dropped' || lead.status === 'completed' ? 'active' : lead.status
  await run(`UPDATE leads SET current_gate = ?, status = ?, updated_at = ? WHERE id = ?`, [gate, status, now(), lead.id])
  await activateReachedStep(lead.id, gate)
  await logHistory(lead.id, req.user!, 'Moved', `Admin moved the lead pointer to ${GATE_LABELS[gate as keyof typeof GATE_LABELS]}.`)
  return okItem(res, await getLeadFullForUser(lead.id, req.user!))
})

router.post('/:id/gates/:gate/approve', requireAdmin, async (req, res) => {
  const lead = await getLead(Number(req.params.id))
  if (!lead) return fail(res, 'Not found', 404)
  const gate = String(req.params.gate)
  const gateDef = findGate(gate)
  if (!gateDef) return fail(res, 'Unknown gate')
  if (gate !== lead.current_gate) return fail(res, 'Only the currently open gate can be approved')
  if (lead.status !== 'active') return fail(res, `Lead is currently ${lead.status.replace('_', ' ')}`)

  const items = await getLeadItems(lead.id)
  const applicable = items.filter((i) => i.gate === gate && i.status !== 'not_applicable')
  const notApproved = applicable.filter((i) => i.status !== 'approved')
  if (applicable.length === 0 || notApproved.length > 0) {
    return fail(res, `${notApproved.length} item(s) in this gate are not yet approved. Every mandatory item must be approved before the gate can close.`)
  }

  const comments = req.body?.comments ? String(req.body.comments) : 'All mandatory items verified — gate approved.'
  const ts = now()
  await run(`INSERT INTO gate_approvals (lead_id, gate, approved_by, approved_at, comments) VALUES (?, ?, ?, ?, ?)`, [
    lead.id, gate, req.user!.id, ts, comments,
  ])

  const next = nextGate(gate as any)
  if (next) {
    await run(`UPDATE leads SET current_gate = ?, updated_at = ? WHERE id = ?`, [next, ts, lead.id])
    await activateReachedStep(lead.id, next)
  } else {
    await run(`UPDATE leads SET status = 'completed', updated_at = ? WHERE id = ?`, [ts, lead.id])
  }

  await logHistory(lead.id, req.user!, 'Gate Approved', `${gateDef.name} approved by ${req.user!.full_name}. ${comments}${next ? ` Advanced to ${GATE_LABELS[next]}.` : ' All 3 gates complete — lead marked Completed.'}`)
  return okItem(res, await getLeadFullForUser(lead.id, req.user!))
})

// Reject / revise: Senior Management picks which stage the lead should go
// back to (the current stage or any earlier one). Every gate from that stage
// through the current one has its gate-approval superseded and its approved
// items reopened for resubmission — nothing is deleted, it's all preserved
// in lead_documents/history exactly like a single-item send-back, just
// applied across every gate in the revised range in one governed action.
router.post('/:id/reject', requireAdmin, async (req, res) => {
  const lead = await getLead(Number(req.params.id))
  if (!lead) return fail(res, 'Not found', 404)
  if (lead.status === 'dropped') return fail(res, 'This lead is already dropped')
  if (lead.status === 'on_hold') return fail(res, 'Resume the lead from hold before rejecting a stage')

  const targetGate = String(req.body?.targetGate || '')
  const targetDef = findGate(targetGate)
  if (!targetDef) return fail(res, 'Choose which stage this should revise to')
  const reason = String(req.body?.reason || '').trim()
  if (!reason) return fail(res, 'A reason is required to reject and revise a stage')

  const currentOrder = findGate(lead.current_gate)!.order
  if (targetDef.order > currentOrder) return fail(res, 'You can only revise back to the current stage or an earlier one')

  const ts = now()
  const items = await getLeadItems(lead.id)
  for (const gateKey of GATE_ORDER) {
    const gDef = findGate(gateKey)!
    if (gDef.order < targetDef.order || gDef.order > currentOrder) continue
    await run(`UPDATE gate_approvals SET superseded = 1 WHERE lead_id = ? AND gate = ? AND superseded = 0`, [lead.id, gateKey])
    for (const item of items) {
      if (item.gate === gateKey && item.status === 'approved') {
        // Clear activated_at rather than stamping "now" here — activateReachedStep
        // below re-stamps it only for the step that's actually current after the
        // revert, so a later step's TAT clock doesn't start ticking prematurely.
        await run(`UPDATE lead_items SET status = 'sent_back', approved_by = NULL, approved_at = NULL, approval_comments = NULL, activated_at = NULL, updated_at = ? WHERE id = ?`, [ts, item.id])
      }
    }
  }

  await run(`UPDATE leads SET current_gate = ?, status = 'active', updated_at = ? WHERE id = ?`, [targetGate, ts, lead.id])
  await activateReachedStep(lead.id, targetGate)
  await logHistory(lead.id, req.user!, 'Rejected', `Revised back to ${targetDef.name} by ${req.user!.full_name} — ${reason}`)
  return okItem(res, await getLeadFullForUser(lead.id, req.user!))
})

export default router
