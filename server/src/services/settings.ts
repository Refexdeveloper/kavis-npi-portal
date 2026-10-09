import { all, run } from '../db/index.js'
import { GATES, ROLE_LIST, ROLE_LABELS, findItem, type Role } from '../config/stageGates.js'

export type RolePerm = {
  role: Role
  can_see_full_workflow: boolean
  can_create_lead: boolean
  can_submit_any: boolean
  can_approve: boolean
  can_manage_users: boolean
  can_delete_leads: boolean
}

const FLAGS = [
  'can_see_full_workflow',
  'can_create_lead',
  'can_submit_any',
  'can_approve',
  'can_manage_users',
  'can_delete_leads',
] as const

type Flag = (typeof FLAGS)[number]

const permCache = new Map<string, RolePerm>()

function defaultsFor(role: Role): RolePerm {
  const allOn = role === 'senior_management'
  const bd = role === 'business_development'
  return {
    role,
    can_see_full_workflow: allOn || bd,
    can_create_lead: allOn || bd,
    can_submit_any: allOn,
    can_approve: allOn,
    can_manage_users: allOn,
    can_delete_leads: allOn,
  }
}

function emptyPerm(role: Role): RolePerm {
  return {
    role,
    can_see_full_workflow: false,
    can_create_lead: false,
    can_submit_any: false,
    can_approve: false,
    can_manage_users: false,
    can_delete_leads: false,
  }
}

export function rolePerm(role: string): RolePerm {
  return permCache.get(role) || defaultsFor((ROLE_LIST.includes(role as Role) ? role : 'client') as Role)
}

export function roleCan(role: string, flag: Flag): boolean {
  return !!rolePerm(role)[flag]
}

function applyWorkflowRow(row: { gate_key: string; item_key: string; owner_role: string; support_roles: string; step: number }) {
  const item = findItem(row.gate_key, row.item_key)
  if (!item) return
  if (ROLE_LIST.includes(row.owner_role as Role)) item.role = row.owner_role as Role
  item.supportRoles = String(row.support_roles || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is Role => ROLE_LIST.includes(s as Role) && s !== item.role)
  const step = Number(row.step)
  if (Number.isFinite(step) && step >= 1) item.step = step
}

export async function ensureSettings(): Promise<void> {
  for (const gate of GATES) {
    for (const item of gate.items) {
      await run(
        `INSERT IGNORE INTO workflow_items (gate_key, item_key, owner_role, support_roles, step)
         VALUES (?, ?, ?, ?, ?)`,
        [gate.key, item.key, item.role, (item.supportRoles || []).join(','), item.step],
      )
    }
  }
  for (const role of ROLE_LIST) {
    const d = defaultsFor(role)
    await run(
      `INSERT IGNORE INTO role_permissions
        (role, can_see_full_workflow, can_create_lead, can_submit_any, can_approve, can_manage_users, can_delete_leads)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        role,
        d.can_see_full_workflow ? 1 : 0,
        d.can_create_lead ? 1 : 0,
        d.can_submit_any ? 1 : 0,
        d.can_approve ? 1 : 0,
        d.can_manage_users ? 1 : 0,
        d.can_delete_leads ? 1 : 0,
      ],
    )
  }
  await reloadSettings()
}

export async function reloadSettings(): Promise<void> {
  const workflow = await all<{ gate_key: string; item_key: string; owner_role: string; support_roles: string; step: number }>(
    'SELECT gate_key, item_key, owner_role, support_roles, step FROM workflow_items',
  )
  for (const row of workflow) applyWorkflowRow(row)

  permCache.clear()
  const perms = await all<Record<string, unknown>>('SELECT * FROM role_permissions')
  for (const row of perms) {
    const role = String(row.role) as Role
    const perm = emptyPerm(role)
    for (const flag of FLAGS) perm[flag] = Number(row[flag]) === 1
    permCache.set(role, perm)
  }
}

export function workflowPayload() {
  return GATES.map((gate) => ({
    key: gate.key,
    name: gate.name,
    items: gate.items.map((item) => ({
      key: item.key,
      label: item.label,
      role: item.role,
      supportRoles: item.supportRoles || [],
      step: item.step,
    })),
  }))
}

export function rolePermissionPayload() {
  return ROLE_LIST.map((role) => ({
    ...rolePerm(role),
    role_label: ROLE_LABELS[role],
  }))
}

export async function saveWorkflow(items: { gate: string; key: string; role: string; supportRoles?: string[]; step?: number }[]) {
  for (const item of items) {
    if (!findItem(item.gate, item.key)) continue
    if (!ROLE_LIST.includes(item.role as Role)) continue
    const support = (item.supportRoles || [])
      .filter((r) => ROLE_LIST.includes(r as Role) && r !== item.role)
    const step = Math.max(1, Number(item.step) || 1)
    await run(
      `INSERT INTO workflow_items (gate_key, item_key, owner_role, support_roles, step)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE owner_role = VALUES(owner_role), support_roles = VALUES(support_roles), step = VALUES(step)`,
      [item.gate, item.key, item.role, support.join(','), step],
    )
  }
  await reloadSettings()
}

export async function saveRolePermissions(rows: Record<string, unknown>[]) {
  for (const row of rows) {
    const role = String(row.role || '')
    if (!ROLE_LIST.includes(role as Role)) continue
    const current = rolePerm(role)
    const next = { ...current }
    for (const flag of FLAGS) {
      if (row[flag] !== undefined) next[flag] = !!row[flag]
    }
    await run(
      `INSERT INTO role_permissions
        (role, can_see_full_workflow, can_create_lead, can_submit_any, can_approve, can_manage_users, can_delete_leads)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         can_see_full_workflow = VALUES(can_see_full_workflow),
         can_create_lead = VALUES(can_create_lead),
         can_submit_any = VALUES(can_submit_any),
         can_approve = VALUES(can_approve),
         can_manage_users = VALUES(can_manage_users),
         can_delete_leads = VALUES(can_delete_leads)`,
      [
        role,
        next.can_see_full_workflow ? 1 : 0,
        next.can_create_lead ? 1 : 0,
        next.can_submit_any ? 1 : 0,
        next.can_approve ? 1 : 0,
        next.can_manage_users ? 1 : 0,
        next.can_delete_leads ? 1 : 0,
      ],
    )
  }
  await reloadSettings()
}

/** Personal can_act_all and Admin always keep every capability. Role flags apply to everyone else in that role. */
export function capsFor(user: { role: string; is_admin?: number | boolean; can_act_all?: number | boolean }) {
  const elevated = Number(user.is_admin) === 1 || user.is_admin === true || user.role === 'senior_management' || Number(user.can_act_all) === 1 || user.can_act_all === true
  const perm = rolePerm(user.role)
  return {
    can_see_full_workflow: elevated || perm.can_see_full_workflow,
    can_create_lead: elevated || perm.can_create_lead,
    can_submit_any: elevated || perm.can_submit_any,
    can_approve: elevated || perm.can_approve,
    can_manage_users: elevated || perm.can_manage_users,
    can_delete_leads: elevated || perm.can_delete_leads,
  }
}
