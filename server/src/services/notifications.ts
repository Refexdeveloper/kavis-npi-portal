import { all, get } from '../db/index.js'
import {
  findGate,
  findItem,
  GATE_LABELS,
  ROLE_LABELS,
  type GateKey,
  type Role,
} from '../config/stageGates.js'
import { getLead, getLeadItems, pendingForSeniorManagement, pendingItemsForRole, type LeadRow } from './leads.js'
import { alreadySent, appBaseUrl, sendNotificationMail, stageSlaDays, type MailAttachment } from './mail.js'
import { getObjectBuffer } from './storage.js'
import type { AuthUser } from '../middleware/auth.js'

type MailUser = {
  id: number
  full_name: string
  email: string
  role: string
  can_act_all: number
  is_admin: number
  is_team_head: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function leadUrl(leadId: number) {
  return `${appBaseUrl()}/leads/${leadId}`
}

function gateLabel(gate: string) {
  return GATE_LABELS[gate as GateKey] || gate
}

async function usersWithEmail(whereSql: string, params: unknown[] = []) {
  return all<MailUser>(
    `SELECT id, full_name, email, role,
            COALESCE(can_act_all, 0) AS can_act_all,
            COALESCE(is_admin, 0) AS is_admin,
            COALESCE(is_team_head, 0) AS is_team_head
     FROM users
     WHERE deleted_at IS NULL AND activated = 1
       AND email IS NOT NULL AND TRIM(email) <> ''
       AND (${whereSql})`,
    params,
  )
}

async function usersByRoles(roles: string[]) {
  const unique = [...new Set(roles.filter(Boolean))]
  if (!unique.length) return [] as MailUser[]
  const placeholders = unique.map(() => '?').join(',')
  return usersWithEmail(`role IN (${placeholders})`, unique)
}

async function approverUsers() {
  return usersWithEmail(
    `role = 'senior_management' OR is_admin = 1 OR can_act_all = 1 OR role IN (
      SELECT role FROM role_permissions WHERE can_approve = 1
    )`,
  )
}

async function bdAndElevated() {
  return usersWithEmail(`role = 'business_development' OR role = 'senior_management' OR is_admin = 1 OR can_act_all = 1`)
}

async function userById(id: number | null | undefined) {
  if (!id) return null
  const row = await get<MailUser>(
    `SELECT id, full_name, email, role,
            COALESCE(can_act_all, 0) AS can_act_all,
            COALESCE(is_admin, 0) AS is_admin,
            COALESCE(is_team_head, 0) AS is_team_head
     FROM users WHERE id = ? AND deleted_at IS NULL AND activated = 1
       AND email IS NOT NULL AND TRIM(email) <> ''`,
    [id],
  )
  return row || null
}

function todayKeyInTz(timeZone = process.env.MAIL_TIMEZONE || 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function currentHourInTz(timeZone = process.env.MAIL_TIMEZONE || 'Asia/Kolkata') {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(new Date()),
  )
  return Number.isFinite(hour) ? hour : new Date().getUTCHours()
}

/** Team heads (and elevated/SM accounts) get one daily digest of their open pending work. */
export async function runDailyTeamHeadPendingDigests(opts?: { force?: boolean }) {
  const hour = Number(process.env.MAIL_DAILY_HOUR || 9)
  if (!opts?.force && currentHourInTz() !== hour) return { sent: 0, skippedHour: true as const }

  const day = todayKeyInTz()
  const recipients = await usersWithEmail(
    `is_team_head = 1 OR can_act_all = 1 OR is_admin = 1 OR role = 'senior_management'`,
  )

  let sent = 0
  for (const user of recipients) {
    const dedupeKey = `daily_pending_digest:${user.id}:${day}`
    if (!opts?.force && (await alreadySent(dedupeKey))) continue

    const details: { label: string; value: string }[] = []
    if (user.role === 'senior_management' || Number(user.is_admin) === 1) {
      const sm = await pendingForSeniorManagement()
      for (const item of sm.itemsAwaitingApproval.slice(0, 25)) {
        details.push({
          label: String(item.refCode),
          value: `Approve: ${item.itemLabel} · ${item.gateName}`,
        })
      }
      for (const gate of sm.gatesAwaitingApproval.slice(0, 10)) {
        details.push({
          label: String(gate.refCode),
          value: `Close stage: ${gate.gateName}`,
        })
      }
    } else {
      const items = await pendingItemsForRole(user.role, null, {
        canActAll: Number(user.can_act_all) === 1,
      })
      for (const item of items.slice(0, 30)) {
        details.push({
          label: item.refCode,
          value: `${item.itemLabel} · ${item.gateName} · ${item.status}${item.isSupport ? ' (support)' : ''}`,
        })
      }
    }

    if (!details.length) continue

    await notify({
      eventType: 'daily_pending_digest',
      to: [user.email],
      subject: `[Kavis NPI] Daily reminder — ${details.length} pending action(s) (${day})`,
      title: 'Daily pending activities',
      intro: `Good morning ${user.full_name}. Here are the open NPI checklist items for your team today. Please action or escalate as needed.`,
      details: [
        { label: 'Date', value: day },
        { label: 'Role', value: ROLE_LABELS[user.role as Role] || user.role },
        { label: 'Open items', value: String(details.length) },
        ...details,
      ],
      ctaUrl: `${appBaseUrl()}/`,
      ctaLabel: 'Open my tasks',
      note: 'This reminder is sent once per day to Team Heads and pipeline owners. Item/stage SLA alerts continue separately when deadlines are missed.',
      dedupeKey,
      meta: { userId: user.id, count: details.length },
    })
    sent += 1
  }

  return { sent, day }
}

function emailsOf(users: MailUser[]) {
  return users.map((u) => u.email)
}

async function attachmentsForItem(leadItemId: number): Promise<MailAttachment[]> {
  const docs = await all<{
    original_filename: string
    stored_filename: string
    mime_type: string | null
  }>(
    `SELECT original_filename, stored_filename, mime_type FROM lead_documents WHERE lead_item_id = ? ORDER BY version DESC LIMIT 3`,
    [leadItemId],
  )
  const out: MailAttachment[] = []
  for (const doc of docs) {
    try {
      const { buffer, contentType } = await getObjectBuffer(doc.stored_filename)
      out.push({
        filename: doc.original_filename,
        content: buffer,
        contentType: contentType || doc.mime_type || undefined,
      })
    } catch {
      /* missing file — still send mail without that attachment */
    }
  }
  return out
}

async function notify(opts: Parameters<typeof sendNotificationMail>[0]) {
  try {
    await sendNotificationMail(opts)
  } catch (err) {
    console.error('[mail]', opts.eventType, err)
  }
}

export async function notifyLeadCreated(leadId: number, actor: AuthUser) {
  const lead = await getLead(leadId)
  if (!lead) return
  const gate = findGate(lead.current_gate)
  const step1Roles = (gate?.items || []).filter((i) => i.step === 1).map((i) => i.role)
  const recipients = [
    ...emailsOf(await bdAndElevated()),
    ...emailsOf(await usersByRoles(step1Roles)),
  ]
  await notify({
    eventType: 'lead_created',
    to: recipients,
    subject: `[Kavis NPI] New lead ${lead.ref_code} — ${lead.product}`,
    title: 'New NPI lead created',
    intro: `${actor.full_name} created a new lead. Stage 1 (RFI) is open — complete the first checklist step within ${stageSlaDays()} days.`,
    details: [
      { label: 'Reference', value: lead.ref_code },
      { label: 'Product', value: lead.product },
      { label: 'Client', value: lead.client_name },
      { label: 'Stage', value: gateLabel(lead.current_gate) },
      { label: 'Priority', value: lead.priority },
      { label: 'Stage SLA', value: `${stageSlaDays()} days` },
      { label: 'Created by', value: actor.full_name },
    ],
    ctaUrl: leadUrl(lead.id),
    leadId: lead.id,
    refCode: lead.ref_code,
    meta: { actor: actor.username },
  })
}

export async function notifyItemSubmitted(leadId: number, gate: string, itemKey: string, actor: AuthUser, leadItemId: number) {
  const lead = await getLead(leadId)
  const item = findItem(gate, itemKey)
  if (!lead || !item) return
  const attachments = await attachmentsForItem(leadItemId)
  const recipients = emailsOf(await approverUsers())
  await notify({
    eventType: 'item_submitted',
    to: recipients,
    subject: `[Kavis NPI] Approval needed — ${lead.ref_code} · ${item.label}`,
    title: 'Checklist item submitted for approval',
    intro: `${actor.full_name} submitted "${item.label}". Please review and approve or send the stage back for revision.`,
    details: [
      { label: 'Reference', value: lead.ref_code },
      { label: 'Product', value: lead.product },
      { label: 'Client', value: lead.client_name },
      { label: 'Stage', value: gateLabel(gate) },
      { label: 'Item', value: item.label },
      { label: 'Owning role', value: ROLE_LABELS[item.role] },
      { label: 'Submitted by', value: actor.full_name },
      { label: 'Attachment', value: attachments.length ? attachments.map((a) => a.filename).join(', ') : 'None' },
    ],
    ctaUrl: leadUrl(lead.id),
    ctaLabel: 'Review & approve',
    note: attachments.length ? 'The latest uploaded document(s) are attached to this email.' : undefined,
    leadId: lead.id,
    refCode: lead.ref_code,
    attachments,
    meta: { gate, itemKey, actor: actor.username },
  })
}

export async function notifyItemApproved(leadId: number, gate: string, itemKey: string, actor: AuthUser, submittedBy?: number | null) {
  const lead = await getLead(leadId)
  const item = findItem(gate, itemKey)
  if (!lead || !item) return

  const submitter = await userById(submittedBy)
  const items = await getLeadItems(leadId)
  const gateDef = findGate(gate)
  const currentStep = gateDef
    ? Math.min(
      ...gateDef.items
        .filter((d) => {
          const row = items.find((r) => String(r.item_key) === d.key)
          const status = row ? String(row.status) : ''
          return row && status !== 'approved' && status !== 'not_applicable'
        })
        .map((d) => d.step)
        .concat([999]),
    )
    : 1
  const nextOwners = gateDef
    ? gateDef.items.filter((d) => d.step === currentStep).map((d) => d.role)
    : []

  const recipients = [
    ...(submitter ? [submitter.email] : []),
    ...emailsOf(await usersByRoles(nextOwners)),
    ...emailsOf(await bdAndElevated()),
  ]

  await notify({
    eventType: 'item_approved',
    to: recipients,
    subject: `[Kavis NPI] Approved — ${lead.ref_code} · ${item.label}`,
    title: 'Checklist item approved',
    intro: `"${item.label}" was approved by ${actor.full_name}. Continue with the next open step for this stage.`,
    details: [
      { label: 'Reference', value: lead.ref_code },
      { label: 'Product', value: lead.product },
      { label: 'Stage', value: gateLabel(gate) },
      { label: 'Item', value: item.label },
      { label: 'Approved by', value: actor.full_name },
    ],
    ctaUrl: leadUrl(lead.id),
    leadId: lead.id,
    refCode: lead.ref_code,
    meta: { gate, itemKey, actor: actor.username },
  })
}

export async function notifyGateApproved(leadId: number, gate: string, actor: AuthUser, nextGateKey: string | null, completed: boolean) {
  const lead = await getLead(leadId)
  if (!lead) return
  const next = nextGateKey ? findGate(nextGateKey) : null
  const nextRoles = next ? next.items.filter((i) => i.step === 1).map((i) => i.role) : []
  const recipients = [
    ...emailsOf(await bdAndElevated()),
    ...emailsOf(await usersByRoles(nextRoles)),
  ]

  await notify({
    eventType: completed ? 'lead_completed' : 'gate_approved',
    to: recipients,
    subject: completed
      ? `[Kavis NPI] Lead completed — ${lead.ref_code}`
      : `[Kavis NPI] Stage closed — ${lead.ref_code} · ${gateLabel(gate)}`,
    title: completed ? 'NPI lead completed' : 'Stage approved and closed',
    intro: completed
      ? `${gateLabel(gate)} was approved by ${actor.full_name}. All three stages are complete.`
      : `${gateLabel(gate)} was approved by ${actor.full_name}. The next stage is now open — finish it within ${stageSlaDays()} days.`,
    details: [
      { label: 'Reference', value: lead.ref_code },
      { label: 'Product', value: lead.product },
      { label: 'Client', value: lead.client_name },
      { label: 'Closed stage', value: gateLabel(gate) },
      { label: 'Next stage', value: next ? next.name : 'Completed' },
      { label: 'Stage SLA', value: completed ? 'n/a' : `${stageSlaDays()} days` },
      { label: 'Approved by', value: actor.full_name },
    ],
    ctaUrl: leadUrl(lead.id),
    leadId: lead.id,
    refCode: lead.ref_code,
    meta: { gate, nextGateKey, actor: actor.username },
  })
}

export async function notifyLeadRejected(leadId: number, targetGate: string, actor: AuthUser, reason: string) {
  const lead = await getLead(leadId)
  if (!lead) return
  const gate = findGate(targetGate)
  const roles = (gate?.items || []).map((i) => i.role)
  const recipients = [
    ...emailsOf(await bdAndElevated()),
    ...emailsOf(await usersByRoles(roles)),
  ]
  await notify({
    eventType: 'lead_rejected',
    to: recipients,
    subject: `[Kavis NPI] Stage revised — ${lead.ref_code} back to ${gateLabel(targetGate)}`,
    title: 'Stage sent back for revision',
    intro: `${actor.full_name} revised this lead back to ${gateLabel(targetGate)}. Re-work the open checklist items.`,
    details: [
      { label: 'Reference', value: lead.ref_code },
      { label: 'Product', value: lead.product },
      { label: 'Revised to', value: gateLabel(targetGate) },
      { label: 'Reason', value: reason },
      { label: 'By', value: actor.full_name },
      { label: 'Stage SLA', value: `${stageSlaDays()} days from reopen` },
    ],
    ctaUrl: leadUrl(lead.id),
    leadId: lead.id,
    refCode: lead.ref_code,
    meta: { targetGate, actor: actor.username },
  })
}

export async function notifyLeadStatus(leadId: number, eventType: 'lead_hold' | 'lead_resume' | 'lead_drop', actor: AuthUser, reason?: string) {
  const lead = await getLead(leadId)
  if (!lead) return
  const titles = {
    lead_hold: 'Lead placed on hold',
    lead_resume: 'Lead resumed',
    lead_drop: 'Lead dropped',
  }
  await notify({
    eventType,
    to: emailsOf(await bdAndElevated()),
    subject: `[Kavis NPI] ${titles[eventType]} — ${lead.ref_code}`,
    title: titles[eventType],
    intro: `${actor.full_name} changed the status of ${lead.ref_code}.`,
    details: [
      { label: 'Reference', value: lead.ref_code },
      { label: 'Product', value: lead.product },
      { label: 'Client', value: lead.client_name },
      { label: 'Stage', value: gateLabel(lead.current_gate) },
      { label: 'Status', value: lead.status },
      ...(reason ? [{ label: 'Reason', value: reason }] : []),
      { label: 'By', value: actor.full_name },
    ],
    ctaUrl: leadUrl(lead.id),
    leadId: lead.id,
    refCode: lead.ref_code,
    meta: { actor: actor.username },
  })
}

function parseTs(value: string | null | undefined) {
  if (!value) return null
  const ms = Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  return Number.isFinite(ms) ? ms : null
}

/** Stage-level 2-day SLA emails + item TAT overdue emails. Leaves in-app TAT bell logic unchanged. */
export async function runSlaEmailSweep() {
  const leads = await all<LeadRow>(`SELECT * FROM leads WHERE status = 'active'`)
  const slaDays = stageSlaDays()
  const nowMs = Date.now()

  for (const lead of leads) {
    const items = await getLeadItems(lead.id)
    const current = items.filter((i) => String(i.gate) === lead.current_gate && String(i.status) !== 'not_applicable')
    const openedMs = current
      .map((i) => parseTs(i.activated_at != null ? String(i.activated_at) : null))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)[0]
    if (openedMs) {
      const dueMs = openedMs + slaDays * DAY_MS
      const dayLeftMs = dueMs - nowMs
      const gateOwners = (findGate(lead.current_gate)?.items || []).map((i) => i.role)
      const recipients = [
        ...emailsOf(await bdAndElevated()),
        ...emailsOf(await usersByRoles(gateOwners)),
      ]

      if (dayLeftMs <= DAY_MS && dayLeftMs > 0) {
        await notify({
          eventType: 'sla_stage_due_soon',
          to: recipients,
          subject: `[Kavis NPI] Stage due tomorrow — ${lead.ref_code}`,
          title: 'Stage SLA reminder',
          intro: `${gateLabel(lead.current_gate)} for ${lead.ref_code} is due within 24 hours (stage SLA ${slaDays} days).`,
          details: [
            { label: 'Reference', value: lead.ref_code },
            { label: 'Product', value: lead.product },
            { label: 'Stage', value: gateLabel(lead.current_gate) },
            { label: 'Stage SLA', value: `${slaDays} days` },
            { label: 'Due at', value: new Date(dueMs).toISOString() },
          ],
          ctaUrl: leadUrl(lead.id),
          leadId: lead.id,
          refCode: lead.ref_code,
          dedupeKey: `sla_stage_due:${lead.id}:${lead.current_gate}:${new Date(dueMs).toISOString().slice(0, 10)}`,
        })
      }

      if (nowMs > dueMs) {
        const overdueDays = Math.ceil((nowMs - dueMs) / DAY_MS)
        await notify({
          eventType: 'sla_stage_overdue',
          to: recipients,
          subject: `[Kavis NPI] Stage overdue — ${lead.ref_code}`,
          title: 'Stage SLA overdue',
          intro: `${gateLabel(lead.current_gate)} for ${lead.ref_code} is overdue by ${overdueDays} day(s). Stage SLA is ${slaDays} days.`,
          details: [
            { label: 'Reference', value: lead.ref_code },
            { label: 'Product', value: lead.product },
            { label: 'Stage', value: gateLabel(lead.current_gate) },
            { label: 'Overdue by', value: `${overdueDays} day(s)` },
            { label: 'Stage SLA', value: `${slaDays} days` },
          ],
          ctaUrl: leadUrl(lead.id),
          leadId: lead.id,
          refCode: lead.ref_code,
          dedupeKey: `sla_stage_overdue:${lead.id}:${lead.current_gate}:${overdueDays}`,
        })
      }
    }

    // Item TAT emails — same thresholds as the existing in-app bell; do not change that logic.
    for (const row of current) {
      const status = String(row.status)
      if (status !== 'pending' && status !== 'sent_back') continue
      const gateKey = String(row.gate)
      const itemKey = String(row.item_key)
      const def = findItem(gateKey, itemKey)
      if (!def?.tatDays || row.activated_at == null) continue
      const activatedMs = parseTs(String(row.activated_at))
      if (!activatedMs) continue
      const itemDue = activatedMs + def.tatDays * DAY_MS
      if (nowMs <= itemDue) continue
      const overdueDays = Math.ceil((nowMs - itemDue) / DAY_MS)
      const recipients = [
        ...emailsOf(await usersByRoles([def.role, ...(def.supportRoles || [])])),
        ...emailsOf(await bdAndElevated()),
      ]
      await notify({
        eventType: 'sla_item_overdue',
        to: recipients,
        subject: `[Kavis NPI] Item TAT overdue — ${lead.ref_code} · ${def.label}`,
        title: 'Checklist TAT overdue',
        intro: `"${def.label}" is overdue against its existing TAT of ${def.tatDays} day(s).`,
        details: [
          { label: 'Reference', value: lead.ref_code },
          { label: 'Product', value: lead.product },
          { label: 'Stage', value: gateLabel(gateKey) },
          { label: 'Item', value: def.label },
          { label: 'Role', value: ROLE_LABELS[def.role as Role] || def.role },
          { label: 'TAT', value: `${def.tatDays} day(s)` },
          { label: 'Overdue by', value: `${overdueDays} day(s)` },
        ],
        ctaUrl: leadUrl(lead.id),
        leadId: lead.id,
        refCode: lead.ref_code,
        dedupeKey: `sla_item_overdue:${lead.id}:${itemKey}:${overdueDays}`,
      })
    }
  }
}

let sweepTimer: ReturnType<typeof setInterval> | null = null

export function startNotificationScheduler() {
  if (sweepTimer) return
  const minutes = Math.max(5, Number(process.env.MAIL_SLA_SWEEP_MINUTES || 30))
  const run = () => {
    runSlaEmailSweep().catch((err) => console.error('[mail] SLA sweep failed', err))
    runDailyTeamHeadPendingDigests().catch((err) => console.error('[mail] daily digest failed', err))
  }
  // First pass a minute after boot so migrate/seed finish and Cloud Run is warm.
  setTimeout(run, 60_000)
  sweepTimer = setInterval(run, minutes * 60_000)
  const dailyHour = process.env.MAIL_DAILY_HOUR || '9'
  const tz = process.env.MAIL_TIMEZONE || 'Asia/Kolkata'
  console.log(`[mail] SLA email sweep every ${minutes} minutes (stage SLA ${stageSlaDays()} days); daily team-head digests at ${dailyHour}:00 ${tz}`)
}
