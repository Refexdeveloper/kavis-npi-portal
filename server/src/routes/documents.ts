import { Router } from 'express'
import path from 'node:path'
import { get } from '../db/index.js'
import { fail } from '../utils/response.js'
import { UPLOAD_DIR } from '../middleware/upload.js'
import { getLead, canViewLead } from '../services/leads.js'
import { findItem } from '../config/stageGates.js'
import { canDownloadItemDocs } from '../services/permissions.js'

const router = Router()

// Protected file download — never served as plain static files, since these
// are confidential CDMO documents (specs, agreements, MSDS, DMF references).
// Only the owning team (incl. support roles / team head) and Senior Management
// may download; other functions that can open the lead still cannot pull files.
router.get('/:docId/download', async (req, res) => {
  const doc = await get<Record<string, unknown>>(`
    SELECT ld.*, li.lead_id, li.item_key, li.gate
    FROM lead_documents ld
    JOIN lead_items li ON li.id = ld.lead_item_id
    WHERE ld.id = ?
  `, [Number(req.params.docId)])
  if (!doc) return fail(res, 'Not found', 404)

  const lead = await getLead(Number(doc.lead_id))
  if (!lead || !canViewLead(req.user!, lead)) return fail(res, 'Forbidden', 403)

  const itemDef = findItem(String(doc.gate), String(doc.item_key))
  if (!itemDef || !canDownloadItemDocs(req.user!, itemDef)) {
    return fail(res, 'Forbidden: document access is limited to the assigned team and Senior Management', 403)
  }

  const filePath = path.join(UPLOAD_DIR, String(doc.stored_filename))
  return res.download(filePath, String(doc.original_filename))
})

export default router
