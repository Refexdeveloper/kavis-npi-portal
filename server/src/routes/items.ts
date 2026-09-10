import { Router } from 'express'
import { all, get, run, now } from '../db/index.js'
import { fail, okItem } from '../utils/response.js'
import { isAdmin, requireAdmin } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { findGate, findItem, GATE_LABELS } from '../config/stageGates.js'
import { logHistory } from '../services/history.js'
import { getLead, getLeadFullForUser, getLeadItems, nextVersionForItem, canViewLead, currentStepInGate, activateReachedStep } from '../services/leads.js'
import { canSubmitItem } from '../services/permissions.js'

const router = Router()

async function getLeadItemRow(leadId: number, itemKey: string) {
  return get<Record<string, unknown>>('SELECT * FROM lead_items WHERE lead_id = ? AND item_key = ?', [leadId, itemKey])
}

router.post('/:id/gates/:gate/items/:key/submit', upload.single('file'), async (req, res) => {
  const leadId = Number(req.params.id)
  const gate = String(req.params.gate)
  const key = String(req.params.key)
  const lead = await getLead(leadId)
  if (!lead) return fail(res, 'Not found', 404)

  const itemDef = findItem(gate, key)
  if (!itemDef) return fail(res, 'Unknown item', 404)
  if (!canSubmitItem(req.user!, itemDef)) {
    return fail(res, `Forbidden: this item belongs to ${itemDef.role}`, 403)
  }
  if (!canViewLead(req.user!, lead)) return fail(res, 'Forbidden', 403)
  if (lead.status !== 'active') return fail(res, `This lead is currently ${lead.status.replace('_', ' ')} — no actions can be taken`)
  if (gate !== lead.current_gate) return fail(res, `${GATE_LABELS[gate as keyof typeof GATE_LABELS] || gate} is not the currently open gate`)

  const row = await getLeadItemRow(leadId, key)
  if (!row) return fail(res, 'Item record missing for this lead', 500)
  if (row.status === 'not_applicable') return fail(res, 'This item does not apply to this lead')
  if (row.status === 'approved') return fail(res, 'This item is already approved. Ask Senior Management to reject the stage before resubmitting.')

  const gateDef = findGate(gate)!
  const itemRows = await getLeadItems(leadId)
  if (itemDef.step !== currentStepInGate(itemRows, gateDef)) {
    return fail(res, 'This item is not open yet — the step before it must be completed first')
  }

  // Mandatory docs from the BRD cannot be waived by the submitter.
  const docRequired = itemDef.docRequired ? true : (req.body?.docRequired === 'true' || req.body?.docRequired === true || !!row.doc_required)
  const file = (req as unknown as { file?: Express.Multer.File }).file
  if (docRequired && !file) return fail(res, 'A document is required for this item before it can be submitted')

  const remarks = req.body?.remarks ? String(req.body.remarks) : null
  const ts = now()
  await run(`
    UPDATE lead_items
    SET status = 'submitted', doc_required = ?, remarks = ?, submitted_by = ?, submitted_at = ?,
        approved_by = NULL, approved_at = NULL, approval_comments = NULL, updated_at = ?
    WHERE id = ?
  `, [docRequired ? 1 : 0, remarks, req.user!.id, ts, ts, row.id])

  if (file) {
    const version = await nextVersionForItem(Number(row.id))
    await run(`
      INSERT INTO lead_documents (lead_item_id, version, original_filename, stored_filename, mime_type, size_bytes, uploaded_by, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, version, file.originalname, file.filename, file.mimetype, file.size, req.user!.id, ts])
  }

  await logHistory(leadId, req.user!, 'Submitted', `"${itemDef.label}" (${GATE_LABELS[gate as keyof typeof GATE_LABELS]}) submitted by ${req.user!.full_name}.${file ? ` Document attached: ${file.originalname}.` : ''}`)
  return okItem(res, await getLeadFullForUser(leadId, req.user!))
})

router.post('/:id/gates/:gate/items/:key/approve', requireAdmin, async (req, res) => {
  const leadId = Number(req.params.id)
  const gate = String(req.params.gate)
  const key = String(req.params.key)
  const lead = await getLead(leadId)
  if (!lead) return fail(res, 'Not found', 404)
  const itemDef = findItem(gate, key)
  if (!itemDef) return fail(res, 'Unknown item', 404)
  if (gate !== lead.current_gate) return fail(res, `${GATE_LABELS[gate as keyof typeof GATE_LABELS] || gate} is not the currently open gate`)

  const row = await getLeadItemRow(leadId, key)
  if (!row || row.status !== 'submitted') return fail(res, 'Item must be submitted before it can be approved')

  const comments = req.body?.comments ? String(req.body.comments) : 'Approved.'
  const ts = now()
  await run(`
    UPDATE lead_items SET status = 'approved', approved_by = ?, approved_at = ?, approval_comments = ?, updated_at = ?
    WHERE id = ?
  `, [req.user!.id, ts, comments, ts, row.id])
  await activateReachedStep(leadId, gate)

  await logHistory(leadId, req.user!, 'Approved', `"${itemDef.label}" (${GATE_LABELS[gate as keyof typeof GATE_LABELS]}) approved by ${req.user!.full_name}. ${comments}`)
  return okItem(res, await getLeadFullForUser(leadId, req.user!))
})

router.get('/:id/history', async (req, res) => {
  const lead = await getLead(Number(req.params.id))
  if (!lead) return fail(res, 'Not found', 404)
  if (!canViewLead(req.user!, lead)) return fail(res, 'Forbidden', 403)
  // The internal audit trail (who on which internal team did what) isn't
  // for a client's eyes — matches the same restriction applied to getLeadFullForUser.
  if (req.user!.role === 'client') return okItem(res, [])
  const rows = await all('SELECT * FROM history WHERE lead_id = ? ORDER BY id DESC', [lead.id])
  return okItem(res, rows)
})

export default router
