import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { all, get, run, now } from '../db/index.js'
import { plainTextFromDetails, wrapMailHtml, type MailDetail } from './mailTemplates.js'

export type MailAttachment = {
  filename: string
  content: Buffer
  contentType?: string
}

export type SendMailInput = {
  eventType: string
  to: string[]
  subject: string
  title: string
  intro: string
  details?: MailDetail[]
  ctaLabel?: string
  ctaUrl?: string
  note?: string
  leadId?: number | null
  refCode?: string | null
  dedupeKey?: string | null
  attachments?: MailAttachment[]
  meta?: Record<string, unknown>
}

export type EmailLogRow = {
  id: number
  event_type: string
  lead_id: number | null
  ref_code: string | null
  recipients: string
  subject: string
  status: string
  error_message: string | null
  dedupe_key: string | null
  attachment_names: string | null
  meta_json: string | null
  created_at: string
}

let transporter: Transporter | null = null

function env(name: string, fallback = '') {
  return process.env[name] ?? fallback
}

export function mailConfigured() {
  return Boolean(env('SMTP_HOST').trim())
}

export function appBaseUrl() {
  return (env('APP_BASE_URL') || env('CLIENT_ORIGIN') || 'http://localhost:4300').split(',')[0].trim().replace(/\/$/, '')
}

export function stageSlaDays() {
  const n = Number(env('STAGE_SLA_DAYS', '2'))
  return Number.isFinite(n) && n > 0 ? n : 2
}

function getTransporter() {
  if (!mailConfigured()) return null
  if (transporter) return transporter
  const port = Number(env('SMTP_PORT', '587'))
  const secure = env('SMTP_SECURE', '').toLowerCase() === 'true' || port === 465
  transporter = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    secure,
    auth: env('SMTP_USER')
      ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') }
      : undefined,
  })
  return transporter
}

export function fromAddress() {
  return env('SMTP_FROM', 'Kavis Pharma NPI <noreply@kavispharma.com>')
}

function isMissingLeadFk(err: unknown) {
  const e = err as { code?: string; errno?: number }
  return e?.code === 'ER_NO_REFERENCED_ROW_2' || e?.errno === 1452
}

async function writeLog(row: {
  eventType: string
  leadId?: number | null
  refCode?: string | null
  recipients: string[]
  subject: string
  status: string
  errorMessage?: string | null
  dedupeKey?: string | null
  attachmentNames?: string[]
  meta?: Record<string, unknown>
}) {
  const params = [
    row.eventType,
    row.leadId ?? null,
    row.refCode ?? null,
    row.recipients.join(', '),
    row.subject,
    row.status,
    row.errorMessage ?? null,
    row.dedupeKey ?? null,
    (row.attachmentNames || []).join(', ') || null,
    row.meta ? JSON.stringify(row.meta) : null,
    now(),
  ]
  const sql = `INSERT INTO email_logs
      (event_type, lead_id, ref_code, recipients, subject, status, error_message, dedupe_key, attachment_names, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  try {
    await run(sql, params)
  } catch (err) {
    // Lead may already be deleted by the time async mail finishes — keep the log with null lead_id.
    if (row.leadId != null && isMissingLeadFk(err)) {
      params[1] = null
      await run(sql, params)
      return
    }
    throw err
  }
}

export async function alreadySent(dedupeKey: string | null | undefined) {
  if (!dedupeKey) return false
  // Once SMTP works, only a successful send blocks retries (skipped/failed can go out later).
  // Before SMTP is configured, any prior log for the key blocks so the failure log is not flooded.
  if (mailConfigured()) {
    const row = await get<{ id: number }>(
      `SELECT id FROM email_logs WHERE dedupe_key = ? AND status = 'sent' LIMIT 1`,
      [dedupeKey],
    )
    return !!row
  }
  const row = await get<{ id: number }>(
    `SELECT id FROM email_logs WHERE dedupe_key = ? LIMIT 1`,
    [dedupeKey],
  )
  return !!row
}

/** Send one notification email. Logs every attempt. Safe when SMTP is not set yet. */
export async function sendNotificationMail(input: SendMailInput) {
  const recipients = [...new Set(input.to.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  const attachmentNames = (input.attachments || []).map((a) => a.filename)

  if (!recipients.length) {
    await writeLog({
      eventType: input.eventType,
      leadId: input.leadId,
      refCode: input.refCode,
      recipients: [],
      subject: input.subject,
      status: 'failed',
      errorMessage: 'No recipient email addresses on file for this event',
      dedupeKey: input.dedupeKey,
      attachmentNames,
      meta: input.meta,
    })
    return { ok: false as const, status: 'failed' as const }
  }

  if (await alreadySent(input.dedupeKey)) {
    return { ok: true as const, status: 'deduped' as const }
  }

  const html = wrapMailHtml({
    title: input.title,
    intro: input.intro,
    details: input.details,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    note: input.note,
    preheader: input.intro,
  })
  const text = plainTextFromDetails(input.intro, input.details, input.ctaUrl)

  if (!mailConfigured()) {
    await writeLog({
      eventType: input.eventType,
      leadId: input.leadId,
      refCode: input.refCode,
      recipients,
      subject: input.subject,
      status: 'skipped',
      errorMessage: 'SMTP not configured — set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM later',
      dedupeKey: input.dedupeKey,
      attachmentNames,
      meta: input.meta,
    })
    return { ok: true as const, status: 'skipped' as const }
  }

  try {
    const tx = getTransporter()
    if (!tx) throw new Error('SMTP transporter unavailable')
    await tx.sendMail({
      from: fromAddress(),
      to: recipients.join(', '),
      subject: input.subject,
      text,
      html,
      attachments: (input.attachments || []).map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    })
    await writeLog({
      eventType: input.eventType,
      leadId: input.leadId,
      refCode: input.refCode,
      recipients,
      subject: input.subject,
      status: 'sent',
      dedupeKey: input.dedupeKey,
      attachmentNames,
      meta: input.meta,
    })
    return { ok: true as const, status: 'sent' as const }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await writeLog({
      eventType: input.eventType,
      leadId: input.leadId,
      refCode: input.refCode,
      recipients,
      subject: input.subject,
      status: 'failed',
      errorMessage: message,
      dedupeKey: input.dedupeKey,
      attachmentNames,
      meta: input.meta,
    })
    return { ok: false as const, status: 'failed' as const, error: message }
  }
}

export async function listEmailLogs(opts: { status?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500)
  if (opts.status && opts.status !== 'all') {
    return all<EmailLogRow>(
      `SELECT * FROM email_logs WHERE status = ? ORDER BY id DESC LIMIT ${limit}`,
      [opts.status],
    )
  }
  return all<EmailLogRow>(`SELECT * FROM email_logs ORDER BY id DESC LIMIT ${limit}`)
}

export async function emailLogStats() {
  const rows = await all<{ status: string; c: number }>(
    `SELECT status, COUNT(*) AS c FROM email_logs GROUP BY status`,
  )
  const stats = { sent: 0, failed: 0, skipped: 0, total: 0 }
  for (const r of rows) {
    const n = Number(r.c) || 0
    stats.total += n
    if (r.status === 'sent') stats.sent = n
    else if (r.status === 'failed') stats.failed = n
    else if (r.status === 'skipped') stats.skipped = n
  }
  return stats
}
