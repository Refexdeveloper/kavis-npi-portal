import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket, PoolOptions } from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

export type Row = Record<string, unknown>

type Queryable = Pool | PoolConnection

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

/**
 * Cloud SQL (Unix socket) when INSTANCE_CONNECTION_NAME or DB_SOCKET_PATH is set.
 * Local / public IP uses DB_HOST + DB_PORT.
 */
function buildPoolOptions(): PoolOptions {
  const database = env('DB_NAME', 'kavis_npi')
  const user = env('DB_USER', 'root')
  const password = env('DB_PASSWORD', '')
  const socketPath =
    env('DB_SOCKET_PATH') ||
    (env('INSTANCE_CONNECTION_NAME')
      ? `/cloudsql/${env('INSTANCE_CONNECTION_NAME')}`
      : '')

  const base: PoolOptions = {
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: Number(env('DB_POOL_SIZE', '10')),
    dateStrings: true,
    multipleStatements: true,
  }

  if (socketPath) {
    return { ...base, socketPath }
  }

  return {
    ...base,
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', '3306')),
  }
}

export const dbConfig = buildPoolOptions()

let pool: Pool | null = null
const txStore = new AsyncLocalStorage<PoolConnection>()

export function getPool(): Pool {
  if (!pool) pool = mysql.createPool(dbConfig)
  return pool
}

function active(): Queryable {
  return txStore.getStore() || getPool()
}

export function dbLabel(): string {
  const database = env('DB_NAME', 'kavis_npi')
  const user = env('DB_USER', 'root')
  if (dbConfig.socketPath) {
    return `mysql://${user}@${dbConfig.socketPath}/${database}`
  }
  return `mysql://${user}@${dbConfig.host}:${dbConfig.port}/${database}`
}

/** Create the database if missing (connects without selecting a DB). */
export async function ensureDatabase(): Promise<void> {
  const database = env('DB_NAME', 'kavis_npi')
  const { database: _db, ...rest } = dbConfig as PoolOptions & { database?: string }
  const conn = await mysql.createConnection({ ...rest, multipleStatements: true })
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
  } finally {
    await conn.end()
  }
}

export function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function clean(params: unknown[]): (string | number | boolean | Date | Buffer | null)[] {
  return params.map((p) => {
    if (p === undefined) return null
    if (p === null || typeof p === 'string' || typeof p === 'number' || typeof p === 'boolean') return p
    if (p instanceof Date || Buffer.isBuffer(p)) return p
    return String(p)
  })
}

export async function all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await active().execute<RowDataPacket[]>(sql, clean(params))
  return rows as unknown as T[]
}

export async function get<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await all<T>(sql, params)
  return rows[0]
}

export async function run(sql: string, params: unknown[] = []) {
  const [result] = await active().execute<ResultSetHeader>(sql, clean(params))
  return {
    insertId: Number(result.insertId),
    affectedRows: Number(result.affectedRows),
    lastInsertRowid: Number(result.insertId),
    changes: Number(result.affectedRows),
  }
}

export async function exec(sql: string): Promise<void> {
  await active().query(sql)
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await txStore.run(conn, fn)
    await conn.commit()
    return result
  } catch (e) {
    try { await conn.rollback() } catch { /* ignore */ }
    throw e
  } finally {
    conn.release()
  }
}

export async function migrate(): Promise<void> {
  await ensureDatabase()
  const here = dirname(fileURLToPath(import.meta.url))
  const schema = readFileSync(join(here, 'schema.sql'), 'utf8')
  await exec(schema)
  // Additive columns for existing Cloud SQL databases (CREATE IF NOT EXISTS won't alter)
  try {
    await exec('ALTER TABLE users ADD COLUMN can_act_all TINYINT(1) NOT NULL DEFAULT 0')
  } catch {
    /* already present */
  }
  console.log(`[db] MySQL ready → ${dbLabel()}`)
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
