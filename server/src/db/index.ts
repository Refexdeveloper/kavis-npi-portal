import { DatabaseSync, type StatementSync, type SQLInputValue } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../../data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

export const DB_FILE = process.env.DB_FILE || path.join(dataDir, 'kavis_npi.sqlite')

export type Row = Record<string, unknown>

let db: DatabaseSync | null = null
const stmtCache = new Map<string, StatementSync>()

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_FILE)
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA journal_mode = WAL')
  }
  return db
}

function stmt(sql: string): StatementSync {
  let s = stmtCache.get(sql)
  if (!s) {
    s = getDb().prepare(sql)
    stmtCache.set(sql, s)
  }
  return s
}

// node:sqlite rejects `undefined` bind values — normalise to null so callers
// can pass optional fields straight through without special-casing them.
function clean(params: unknown[]): SQLInputValue[] {
  return params.map((p) => (p === undefined ? null : p)) as SQLInputValue[]
}

export function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

export async function all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return stmt(sql).all(...clean(params)) as unknown as T[]
}

export async function get<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const row = stmt(sql).get(...clean(params))
  return row as T | undefined
}

export async function run(sql: string, params: unknown[] = []) {
  const info = stmt(sql).run(...clean(params))
  return {
    insertId: Number(info.lastInsertRowid),
    affectedRows: Number(info.changes),
    lastInsertRowid: Number(info.lastInsertRowid),
    changes: Number(info.changes),
  }
}

// SQLite on Node is single-threaded/synchronous under the hood, so a
// transaction is just BEGIN/COMMIT/ROLLBACK around the callback — no
// separate connection object is needed the way mysql2's pool requires one.
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const database = getDb()
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = await fn()
    database.exec('COMMIT')
    return result
  } catch (e) {
    try { database.exec('ROLLBACK') } catch { /* transaction may already be closed */ }
    throw e
  }
}
