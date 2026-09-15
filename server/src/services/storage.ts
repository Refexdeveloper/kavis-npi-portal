import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import type { Readable as ReadableType } from 'node:stream'

export type StorageBackend = 'local' | 'gcs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

export function storageBackend(): StorageBackend {
  const v = env('STORAGE_BACKEND', 'local').toLowerCase()
  return v === 'gcs' ? 'gcs' : 'local'
}

/** Local disk root (dev / fallback). Not used when STORAGE_BACKEND=gcs. */
export const UPLOAD_DIR = path.resolve(
  env('UPLOAD_DIR') || path.join(__dirname, '../../uploads'),
)

function gcsPrefix(): string {
  const p = env('GCS_PREFIX', 'npi-docs/').replace(/^\/+/, '')
  return p.endsWith('/') || p === '' ? p : `${p}/`
}

function objectPath(key: string): string {
  return `${gcsPrefix()}${key.replace(/^\/+/, '')}`
}

let gcsBucket: import('@google-cloud/storage').Bucket | null = null

async function getGcsBucket() {
  if (gcsBucket) return gcsBucket
  const bucketName = env('GCS_BUCKET')
  if (!bucketName) {
    throw new Error('STORAGE_BACKEND=gcs requires GCS_BUCKET')
  }
  const { Storage } = await import('@google-cloud/storage')
  const storage = new Storage() // Application Default Credentials on Cloud Run
  gcsBucket = storage.bucket(bucketName)
  return gcsBucket
}

export async function putObject(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  if (storageBackend() === 'gcs') {
    const bucket = await getGcsBucket()
    const file = bucket.file(objectPath(key))
    await file.save(Buffer.isBuffer(data) ? data : Buffer.from(data), {
      contentType: contentType || 'application/octet-stream',
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0' },
    })
    return
  }

  await fsp.mkdir(UPLOAD_DIR, { recursive: true })
  await fsp.writeFile(path.join(UPLOAD_DIR, key), data)
}

export async function getObjectStream(key: string): Promise<{
  stream: ReadableType
  contentType?: string
  size?: number
}> {
  if (storageBackend() === 'gcs') {
    const bucket = await getGcsBucket()
    const file = bucket.file(objectPath(key))
    const [exists] = await file.exists()
    if (!exists) throw new Error(`Object not found: ${key}`)
    const [metadata] = await file.getMetadata()
    return {
      stream: file.createReadStream(),
      contentType: metadata.contentType,
      size: metadata.size != null ? Number(metadata.size) : undefined,
    }
  }

  const filePath = path.join(UPLOAD_DIR, key)
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${key}`)
  const stat = await fsp.stat(filePath)
  return {
    stream: fs.createReadStream(filePath),
    size: stat.size,
  }
}

export async function objectExists(key: string): Promise<boolean> {
  if (storageBackend() === 'gcs') {
    const bucket = await getGcsBucket()
    const [exists] = await bucket.file(objectPath(key)).exists()
    return exists
  }
  return fs.existsSync(path.join(UPLOAD_DIR, key))
}

export function storageLabel(): string {
  if (storageBackend() === 'gcs') {
    return `gcs://${env('GCS_BUCKET')}/${gcsPrefix()}`
  }
  return `local://${UPLOAD_DIR}`
}

/** Ensure local upload dir exists when using disk backend. */
export function ensureLocalUploadDir(): void {
  if (storageBackend() === 'local' && !fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  }
}

export { Readable }
