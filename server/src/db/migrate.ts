import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb, DB_FILE } from './index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  const db = getDb()
  db.exec(sql)
  // CREATE TABLE IF NOT EXISTS won't add columns to a table that already
  // existed before this column was introduced — patch it in defensively.
  try { db.exec('ALTER TABLE lead_items ADD COLUMN activated_at TEXT') } catch { /* already present */ }
  try { db.exec('ALTER TABLE users ADD COLUMN is_team_head INTEGER NOT NULL DEFAULT 0') } catch { /* already present */ }
  console.log('Migrated schema ->', DB_FILE)
}

const isDirect = process.argv[1]?.includes('migrate')
if (isDirect) {
  migrate()
}
