import { all, get, run, now, withTransaction } from '../db/index.js'
import { GATES, GATE_ORDER, findGate, findItem, nextGate, maxStep, ROLE_LABELS, TOTAL_ITEM_COUNT, type GateDef, type GateKey } from '../config/stageGates.js'
import { logHistory } from './history.js'
import type { AuthUser } from '../middleware/auth.js'
import { isAdmin } from '../middleware/auth.js'
import {
  itemVisibilityForUser,
  redactItemForVisibility,
  canSubmitItem,
  userHasWorkOnStep,
} from './permissions.js'

const DAY_MS = 24 * 60 * 60 * 1000
function parseTs(ts: string | null | undefined): number | null {
  if (!ts) return null
  // stored as 'YYYY-MM-DD HH:MM:SS' (see db/index.ts now()) — make it ISO-parseable
  const t = Date.parse(ts.replace(' ', 'T') + 'Z')
  return Number.isNaN(t) ? null : t
}

/**
 * The doc's own "#" column encodes real sequencing within a gate: items
 * sharing a step number open together (one per department); the next step
 * number is invisible to everyone until every item in the current step is
 * approved (or not_applicable). This finds the lowest step that isn't fully
 * done yet — that's the one currently open to the assigned departments.
 */
export function currentStepInGate(itemRows: Record<string, unknown>[], gateDef: GateDef): number {
  const top = maxStep(gateDef.key)
  const byKey = new Map(itemRows.filter((r) => r.gate === gateDef.key).map((r) => [String(r.item_key), r]))
  for (let s = 1; s <= top; s++) {
    const stepDefs = gateDef.items.filter((i) => i.step === s)
    const allDone = stepDefs.every((def) => {
      const status = byKey.get(def.key)?.status
      return status === 'approved' || status === 'not_applicable'
    })
    if (!allDone) return s
  }
  return top
}

export type LeadRow = {
  id: number
  ref_code: string
  product: string
  strength: string | null
  dosage_form: string | null
  client_name: string
  client_country: string | null
  priority: string
  potent_molecule: number
  current_gate: GateKey
  status: 'active' | 'on_hold' | 'dropped' | 'completed'
  hold_reason: string | null
  drop_reason: string | null
  created_by: number | null
  created_at: string
  updated_at: string
}

export async function getLead(id: number): Promise<LeadRow | undefined> {
  return get<LeadRow>('SELECT * FROM leads WHERE id = ?', [id])
}

export async function generateRefCode(): Promise<string> {
  const year = new Date().getFullYear()
  const row = await get<{ c: number }>(`SELECT COUNT(*) as c FROM leads WHERE ref_code LIKE ?`, [`KV-${year}-%`])
  const seq = String((row?.c ?? 0) + 1).padStart(3, '0')
  return `KV-${year}-${seq}`
}

export async function createLead(input: {
  product: string
  strength?: string
  dosageForm?: string
  clientName: string
  clientCountry?: string
  priority?: string
  potentMolecule?: boolean
  notes?: string
}, actor: AuthUser) {
  const ts = now()
  const refCode = await generateRefCode()

  return withTransaction(async () => {
    const info = await run(`
      INSERT INTO leads (ref_code, product, strength, dosage_form, client_name, client_country, priority, potent_molecule, current_gate, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rfi', 'active', ?, ?, ?)
    `, [
      refCode, input.product, input.strength || null, input.dosageForm || null,
      input.clientName, input.clientCountry || null, input.priority || 'Standard',
      input.potentMolecule ? 1 : 0, actor.id, ts, ts,
    ])
    const leadId = info.insertId

    for (const gate of GATES) {
      for (const item of gate.items) {
        const notApplicable = item.mandatory === 'conditional' && item.key === 'safety_info' && !input.potentMolecule
        // Only the very first step of the very first gate starts its TAT
        // clock immediately; everything else activates as its turn comes.
        const activatedAt = gate.key === 'rfi' && item.step === 1 ? ts : null
        await run(`
          INSERT INTO lead_items (lead_id, gate, item_key, status, doc_required, activated_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [leadId, gate.key, item.key, notApplicable ? 'not_applicable' : 'pending', item.docRequired ? 1 : 0, activatedAt, ts, ts])
      }
    }

    const noteSuffix = input.notes ? ` Charter notes: ${input.notes}` : ''
    await logHistory(leadId, actor, 'Created', `Lead ${refCode} created for ${input.clientName} (${input.product}).${noteSuffix}`)
    return leadId
  })
}

/**
 * Idempotently starts the TAT clock for whatever step is now current in a
 * gate — call this after any approval, gate-approval, or reject. Items that
 * already have an activated_at are left untouched, so this is safe to call
 * defensively from multiple places without resetting an in-flight clock.
 */
export async function activateReachedStep(leadId: number, gateKey: string) {
  const gateDef = findGate(gateKey)
  if (!gateDef) return
  const itemRows = await getLeadItems(leadId)
  const step = currentStepInGate(itemRows, gateDef)
  const ts = now()
  for (const def of gateDef.items.filter((i) => i.step === step)) {
    const row = itemRows.find((r) => r.item_key === def.key)
    if (row && !row.activated_at && row.status !== 'not_applicable') {
      await run('UPDATE lead_items SET activated_at = ? WHERE id = ?', [ts, row.id])
    }
  }
}

export async function getLeadItems(leadId: number) {
  return all<Record<string, unknown>>(`
    SELECT li.*, u1.full_name as submitted_by_name, u2.full_name as approved_by_name
    FROM lead_items li
    LEFT JOIN users u1 ON u1.id = li.submitted_by
    LEFT JOIN users u2 ON u2.id = li.approved_by
    WHERE li.lead_id = ?
  `, [leadId])
}

export async function getLeadDocuments(leadId: number) {
  return all<Record<string, unknown>>(`
    SELECT ld.*, li.item_key as item_key, u.full_name as uploaded_by_name
    FROM lead_documents ld
    JOIN lead_items li ON li.id = ld.lead_item_id
    LEFT JOIN users u ON u.id = ld.uploaded_by
    WHERE li.lead_id = ?
    ORDER BY ld.version ASC
  `, [leadId])
}

export async function getGateApprovals(leadId: number) {
  return all<Record<string, unknown>>(`
    SELECT ga.*, u.full_name as approved_by_name
    FROM gate_approvals ga
    LEFT JOIN users u ON u.id = ga.approved_by
    WHERE ga.lead_id = ? AND ga.superseded = 0
  `, [leadId])
}

export async function getHistory(leadId: number) {
  return all<Record<string, unknown>>('SELECT * FROM history WHERE lead_id = ? ORDER BY id DESC', [leadId])
}

/** Full nested view of a lead: gates -> items -> documents, plus gate approvals and history. */
export async function getLeadFull(leadId: number) {
  const lead = await getLead(leadId)
  if (!lead) return null
  const [itemRows, docRows, approvals, history] = await Promise.all([
    getLeadItems(leadId),
    getLeadDocuments(leadId),
    getGateApprovals(leadId),
    getHistory(leadId),
  ])

  const docsByItemKey = new Map<string, Record<string, unknown>[]>()
  for (const d of docRows) {
    const k = String(d.item_key)
    if (!docsByItemKey.has(k)) docsByItemKey.set(k, [])
    docsByItemKey.get(k)!.push(d)
  }
  const approvalByGate = new Map<string, Record<string, unknown>>()
  for (const a of approvals) approvalByGate.set(String(a.gate), a)
  const itemByKey = new Map<string, Record<string, unknown>>()
  for (const r of itemRows) itemByKey.set(String(r.item_key), r)

  const currentGateOrder = findGate(lead.current_gate)?.order ?? 1
  const nowMs = Date.now()

  const gates = GATES.map((gateDef) => {
    const isLocked = gateDef.order > currentGateOrder
    const isCurrent = gateDef.key === lead.current_gate
    const isComplete = gateDef.order < currentGateOrder || (isCurrent && lead.status === 'completed')
    const currentStep = currentStepInGate(itemRows, gateDef)

    const allItems = gateDef.items.map((itemDef) => {
      const row = itemByKey.get(itemDef.key) || {}
      const activatedAtMs = parseTs((row.activated_at as string) || null)
      const dueAtMs = activatedAtMs && itemDef.tatDays ? activatedAtMs + itemDef.tatDays * DAY_MS : null
      const isDone = row.status === 'approved' || row.status === 'not_applicable'
      return {
        ...itemDef,
        roleLabel: ROLE_LABELS[itemDef.role],
        supportRoleLabels: (itemDef.supportRoles || []).map((r) => ROLE_LABELS[r]),
        status: row.status || 'pending',
        docRequiredActual: !!row.doc_required,
        remarks: row.remarks || null,
        submittedBy: row.submitted_by_name || null,
        submittedAt: row.submitted_at || null,
        approvedBy: row.approved_by_name || null,
        approvedAt: row.approved_at || null,
        approvalComments: row.approval_comments || null,
        activatedAt: row.activated_at || null,
        dueAt: dueAtMs ? new Date(dueAtMs).toISOString() : null,
        overdue: !isDone && dueAtMs !== null && nowMs > dueAtMs,
        documents: (docsByItemKey.get(itemDef.key) || []).map((d) => ({
          id: d.id,
          version: d.version,
          originalFilename: d.original_filename,
          uploadedBy: d.uploaded_by_name,
          uploadedAt: d.uploaded_at,
        })),
      }
    })

    const applicable = allItems.filter((i) => i.status !== 'not_applicable')
    const approvedCount = applicable.filter((i) => i.status === 'approved').length
    const allApproved = applicable.length > 0 && approvedCount === applicable.length

    // Visibility: a locked (not-yet-reached) gate shows nothing; a completed
    // gate shows everything (it's the audit record); the current gate reveals
    // steps up to current + 1 (next-step teaser). Per-user redaction of
    // confidential detail happens in getLeadFullForUser.
    const items = isLocked
      ? []
      : isComplete
        ? allItems
        : allItems.filter((i) => i.step <= currentStep + 1)

    // Step strip for the common progress indicator (labels only — no secrets).
    const totalSteps = maxStep(gateDef.key)
    const stepStrip = Array.from({ length: totalSteps }, (_, idx) => {
      const step = idx + 1
      const stepDefs = gateDef.items.filter((i) => i.step === step)
      const stepRows = stepDefs.map((d) => itemByKey.get(d.key)).filter(Boolean)
      let state: 'completed' | 'current' | 'next' | 'locked' | 'pending' = 'pending'
      if (isLocked) state = 'locked'
      else if (isComplete) state = 'completed'
      else if (isCurrent && step < currentStep) state = 'completed'
      else if (isCurrent && step === currentStep) state = 'current'
      else if (isCurrent && step === currentStep + 1) state = 'next'
      else if (isCurrent && step > currentStep + 1) state = 'locked'
      else if (!isCurrent && gateDef.order < currentGateOrder) state = 'completed'
      return {
        step,
        state,
        itemCount: stepDefs.filter((d) => {
          const st = itemByKey.get(d.key)?.status
          return st !== 'not_applicable'
        }).length,
        approvedCount: stepRows.filter((r) => r && r.status === 'approved').length,
        labels: stepDefs.map((d) => d.label),
        roles: [...new Set(stepDefs.map((d) => ROLE_LABELS[d.role]))],
      }
    })

    return {
      key: gateDef.key,
      order: gateDef.order,
      name: gateDef.name,
      trigger: gateDef.trigger,
      crossFunctions: gateDef.crossFunctions,
      crossFunctionLabels: gateDef.crossFunctions.map((r) => ROLE_LABELS[r]),
      exitCriteria: gateDef.exitCriteria,
      outputs: gateDef.outputs,
      items,
      currentStep,
      totalSteps,
      stepStrip,
      itemCount: applicable.length,
      approvedCount,
      allMandatoryApproved: allApproved,
      isCurrent,
      isLocked,
      isComplete,
      gateApproval: approvalByGate.get(gateDef.key) || null,
    }
  })

  const totalApplicable = gates.reduce((n, g) => n + g.itemCount, 0)
  const totalApproved = gates.reduce((n, g) => n + g.approvedCount, 0)
  const currentGateObj = gates.find((g) => g.isCurrent) || gates[0]
  const nextStepNum = currentGateObj && !currentGateObj.isComplete
    ? Math.min(currentGateObj.currentStep + 1, currentGateObj.totalSteps)
    : null
  const nextGateKey = nextGate(lead.current_gate)

  return {
    ...lead,
    gates,
    progress: {
      totalItems: totalApplicable,
      approvedItems: totalApproved,
      percent: totalApplicable ? Math.round((totalApproved / totalApplicable) * 100) : 0,
    },
    workflow: {
      currentGate: lead.current_gate,
      currentGateName: currentGateObj?.name || null,
      currentStep: currentGateObj?.currentStep ?? 1,
      totalStepsInGate: currentGateObj?.totalSteps ?? 1,
      nextStep: nextStepNum && nextStepNum > (currentGateObj?.currentStep ?? 1) ? nextStepNum : null,
      nextGate: lead.status === 'completed' ? null : nextGateKey,
      nextGateName: nextGateKey ? findGate(nextGateKey)?.name || null : null,
      status: lead.status,
    },
    history,
  }
}

/**
 * Applies team-based detail ACL on top of getLeadFull:
 * - Senior Management: full detail for every revealed item
 * - Owning team + Team Head + support roles: full detail for their items
 * - Others: summary of current/past steps; next-step teaser only if they own it
 * - Clients: only their client-owned items
 * - Gate trigger/exit/outputs hidden for non-SM when the gate is locked or
 *   when the user has no work on the current gate (keeps the full workflow
 *   from being browsable by every department)
 */
export async function getLeadFullForUser(leadId: number, user: AuthUser) {
  const full = await getLeadFull(leadId)
  if (!full) return null

  if (user.role === 'client') {
    return {
      ...full,
      gates: full.gates.map((g) => {
        const filtered = g.items
          .map((item) => {
            const level = itemVisibilityForUser(user, item as any, {
              gateLocked: g.isLocked,
              gateComplete: g.isComplete,
              currentStep: g.currentStep,
              isCurrentGate: g.isCurrent,
            })
            if (level === 'hidden') return null
            return redactItemForVisibility(item as any, level)
          })
          .filter(Boolean)
        return {
          ...g,
          items: filtered,
          // Clients don't need internal cross-function / exit criteria text
          trigger: g.isCurrent || g.isComplete ? g.trigger : null,
          exitCriteria: g.isComplete ? g.exitCriteria : null,
          outputs: g.isComplete || g.isCurrent ? g.outputs : [],
          crossFunctionLabels: [],
          detailRestricted: true,
        }
      }),
      history: [] as typeof full.history,
    }
  }

  if (isAdmin(user)) return full

  return {
    ...full,
    gates: full.gates.map((g) => {
      const visibleItems = g.items
        .map((item) => {
          const level = itemVisibilityForUser(user, item as any, {
            gateLocked: g.isLocked,
            gateComplete: g.isComplete,
            currentStep: g.currentStep,
            isCurrentGate: g.isCurrent,
          })
          if (level === 'hidden') return null
          const redacted = redactItemForVisibility(item as any, level)
          return {
            ...redacted,
            canSubmit: canSubmitItem(user, item as any) && g.isCurrent && item.step === g.currentStep,
          }
        })
        .filter(Boolean)

      const hasWorkHere = userHasWorkOnStep(
        user,
        (g.items as any[]).filter((i) => i.step === g.currentStep || i.step === g.currentStep + 1),
      )
      const showGateMeta = g.isComplete || (g.isCurrent && hasWorkHere)

      return {
        ...g,
        items: visibleItems,
        // Hide full workflow narrative for teams that aren't on this stage yet
        trigger: showGateMeta ? g.trigger : (g.isCurrent ? 'In progress with the assigned function(s).' : null),
        exitCriteria: g.isComplete || isAdmin(user) ? g.exitCriteria : null,
        outputs: g.isComplete ? g.outputs : (g.isCurrent ? g.outputs : []),
        detailRestricted: true,
      }
    }),
  }
}

export async function summarizeLead(leadId: number) {
  const lead = await getLead(leadId)
  if (!lead) return null
  const items = await getLeadItems(leadId)
  const applicable = items.filter((i) => i.status !== 'not_applicable')
  const approved = applicable.filter((i) => i.status === 'approved').length
  const currentGateDef = findGate(lead.current_gate)
  const currentGateItems = items.filter((i) => i.gate === lead.current_gate && i.status !== 'not_applicable')
  const gateAwaitingApproval = currentGateItems.length > 0 && currentGateItems.every((i) => i.status === 'approved')
  return {
    id: lead.id,
    refCode: lead.ref_code,
    product: lead.product,
    strength: lead.strength,
    clientName: lead.client_name,
    clientCountry: lead.client_country,
    priority: lead.priority,
    currentGate: lead.current_gate,
    currentGateName: currentGateDef?.name,
    status: lead.status,
    holdReason: lead.hold_reason,
    dropReason: lead.drop_reason,
    progressPercent: applicable.length ? Math.round((approved / applicable.length) * 100) : 0,
    totalItems: applicable.length,
    approvedItems: approved,
    gateAwaitingApproval: lead.status === 'active' && gateAwaitingApproval,
    updatedAt: lead.updated_at,
  }
}

export async function listLeadSummaries(filter?: { clientCompany?: string }) {
  let rows: LeadRow[]
  if (filter?.clientCompany) {
    rows = await all<LeadRow>('SELECT * FROM leads WHERE client_name = ? ORDER BY id DESC', [filter.clientCompany])
  } else {
    rows = await all<LeadRow>('SELECT * FROM leads ORDER BY id DESC')
  }
  const summaries = []
  for (const r of rows) summaries.push(await summarizeLead(r.id))
  return summaries
}

/**
 * The set of currently-*visible* items across every active lead's current
 * gate — i.e. items whose step has actually been reached. Shared by the
 * pending queues and notifications so "what's actionable" and "what's
 * overdue" always agree with what a lead's workspace itself reveals.
 */
async function visibleCurrentStepItems() {
  const leads = await all<LeadRow>(`SELECT * FROM leads WHERE status = 'active'`)
  const out: { lead: LeadRow; row: Record<string, unknown>; def: NonNullable<ReturnType<typeof findItem>> }[] = []
  for (const lead of leads) {
    const gateDef = findGate(lead.current_gate)
    if (!gateDef) continue
    const itemRows = await getLeadItems(lead.id)
    const step = currentStepInGate(itemRows, gateDef)
    for (const def of gateDef.items.filter((i) => i.step === step)) {
      const row = itemRows.find((r) => r.item_key === def.key)
      if (row && row.status !== 'not_applicable') out.push({ lead, row, def })
    }
  }
  return out
}

/** Items assigned to `role` (as owner or support) that are actionable right now. */
export async function pendingItemsForRole(role: string, clientCompany?: string | null) {
  const visible = await visibleCurrentStepItems()
  return visible
    .filter(({ def }) => def.role === role || (def.supportRoles || []).includes(role as any))
    .filter(({ row }) => row.status === 'pending' || row.status === 'sent_back')
    .filter(({ lead }) => !clientCompany || lead.client_name === clientCompany)
    .map(({ lead, row, def }) => ({
      leadId: lead.id,
      refCode: lead.ref_code,
      product: lead.product,
      clientName: lead.client_name,
      priority: lead.priority,
      gate: lead.current_gate,
      gateName: findGate(lead.current_gate)?.name,
      itemKey: def.key,
      itemLabel: def.label,
      status: row.status,
      tatDays: def.tatDays ?? null,
      step: def.step,
      isSupport: def.role !== role,
    }))
}

/** For Senior Management: items awaiting their approval + gates awaiting gate-approval. */
export async function pendingForSeniorManagement() {
  const visible = await visibleCurrentStepItems()
  const itemsAwaitingApproval = visible
    .filter(({ row }) => row.status === 'submitted')
    .map(({ lead, row, def }) => ({
      leadId: lead.id,
      refCode: lead.ref_code,
      product: lead.product,
      clientName: lead.client_name,
      priority: lead.priority,
      gate: lead.current_gate,
      gateName: findGate(lead.current_gate)?.name,
      itemKey: def.key,
      itemLabel: def.label,
      submittedAt: row.submitted_at,
    }))

  const leads = await all<LeadRow>(`SELECT * FROM leads WHERE status = 'active'`)
  const gatesAwaitingApproval: Record<string, unknown>[] = []
  for (const lead of leads) {
    const items = await getLeadItems(lead.id)
    const currentItems = items.filter((i) => i.gate === lead.current_gate && i.status !== 'not_applicable')
    if (currentItems.length > 0 && currentItems.every((i) => i.status === 'approved')) {
      gatesAwaitingApproval.push({
        leadId: lead.id,
        refCode: lead.ref_code,
        product: lead.product,
        clientName: lead.client_name,
        gate: lead.current_gate,
        gateName: findGate(lead.current_gate)?.name,
      })
    }
  }

  return { itemsAwaitingApproval, gatesAwaitingApproval }
}

/**
 * TAT-based alerts: an item is overdue once its step has been open longer
 * than its TAT and the assigned function still hasn't submitted. Scoped the
 * same way the pending queues are — a role only sees its own, Senior
 * Management sees everything, a Client only sees its own leads' Client item.
 */
export async function getNotifications(role: string, clientCompany?: string | null) {
  const visible = await visibleCurrentStepItems()
  const isAdmin = role === 'senior_management'
  const candidates = visible
    .filter(({ row }) => row.status === 'pending' || row.status === 'sent_back')
    .filter(({ def }) => isAdmin || def.role === role || (def.supportRoles || []).includes(role as any))
    .filter(({ lead }) => !clientCompany || lead.client_name === clientCompany)
    .filter(({ def }) => def.tatDays)

  const nowMs = Date.now()
  const alerts = candidates.map(({ lead, row, def }) => {
    const activatedMs = parseTs((row.activated_at as string) || null) ?? nowMs
    const dueAtMs = activatedMs + (def.tatDays as number) * DAY_MS
    const overdueByMs = nowMs - dueAtMs
    return {
      leadId: lead.id,
      refCode: lead.ref_code,
      product: lead.product,
      clientName: lead.client_name,
      gate: lead.current_gate,
      gateName: findGate(lead.current_gate)?.name,
      itemKey: def.key,
      itemLabel: def.label,
      roleLabel: ROLE_LABELS[def.role],
      tatDays: def.tatDays,
      dueAt: new Date(dueAtMs).toISOString(),
      overdue: overdueByMs > 0,
      overdueDays: overdueByMs > 0 ? Math.ceil(overdueByMs / DAY_MS) : 0,
      dueSoon: overdueByMs <= 0 && overdueByMs > -DAY_MS,
    }
  }).filter((a) => a.overdue || a.dueSoon)

  alerts.sort((a, b) => (b.overdueDays - a.overdueDays) || (a.dueAt < b.dueAt ? -1 : 1))
  return alerts
}

export function isItemGateUnlocked(lead: LeadRow, gateKey: string) {
  return gateKey === lead.current_gate && lead.status === 'active'
}

export async function nextVersionForItem(leadItemId: number) {
  const row = await get<{ m: number | null }>('SELECT MAX(version) as m FROM lead_documents WHERE lead_item_id = ?', [leadItemId])
  return (row?.m || 0) + 1
}

/** Internal roles see the full pipeline; a Client login only sees its own company's leads. */
export function canViewLead(user: AuthUser, lead: Pick<LeadRow, 'client_name'>) {
  if (user.role !== 'client') return true
  return user.client_company === lead.client_name
}
