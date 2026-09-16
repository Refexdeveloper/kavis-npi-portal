import { Router } from 'express'
import { get } from '../db/index.js'
import { fail } from '../utils/response.js'
import { getObjectStream } from '../services/storage.js'
import { getLead, canViewLead } from '../services/leads.js'
import { findItem } from '../config/stageGates.js'
import { canDownloadItemDocs } from '../services/permissions.js'

const router = Router()

// Protected file download — never public URLs. Confidential CDMO documents
// (specs, agreements, MSDS, DMF references) stream through the API after ACL.
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

  try {
    const { stream, contentType, size } = await getObjectStream(String(doc.stored_filename))
    const original = String(doc.original_filename)
    const inline = String(req.query.inline || '') === '1'
    res.setHeader('Content-Type', contentType || String(doc.mime_type || 'application/octet-stream'))
    const disposition = inline ? 'inline' : 'attachment'
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(original)}`)
    if (size != null) res.setHeader('Content-Length', String(size))
    // Allow same-origin iframe/object preview of PDFs
    res.setHeader('X-Content-Type-Options', 'nosniff')
    stream.on('error', (err) => {
      console.error('[documents] stream error', err)
      if (!res.headersSent) fail(res, 'Download failed', 500)
      else res.end()
    })
    stream.pipe(res)
  } catch (err) {
    console.error(err)
    return fail(res, 'File not found in storage', 404)
  }
})

export default router
