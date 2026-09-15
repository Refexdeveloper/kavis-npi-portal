import multer from 'multer'
import path from 'node:path'
import crypto from 'node:crypto'
import { ensureLocalUploadDir, UPLOAD_DIR } from '../services/storage.js'

ensureLocalUploadDir()

/** Re-export for callers that still import UPLOAD_DIR from this module. */
export { UPLOAD_DIR }

export function makeStoredFilename(originalname: string): string {
  const ext = path.extname(originalname).slice(0, 20)
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`
}

/**
 * Memory storage so the same route can write to local disk or GCS
 * via services/storage.ts (Cloud Run has ephemeral disk).
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — CDMO documents can run large
})
