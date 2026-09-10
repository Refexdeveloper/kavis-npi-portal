// =============================================================================
// Team / step visibility for the CDMO NPI stage-gate CRM.
//
// Rules (from BRD + stakeholder requirements):
// 1. Future steps beyond "current + next" stay hidden unless Senior Management.
// 2. Complete item details (remarks, documents, approvals) are only for:
//    - the owning role, support roles on that item, that role's Team Head, or SM.
// 3. Everyone else may see a summary of the current step (label + status) and,
//    if they own work on the immediate next step, a next-step teaser — not the
//    full upcoming workflow.
// 4. Clients only see their own client-owned items (existing rule).
// =============================================================================

import type { AuthUser } from '../middleware/auth.js'
import { isAdmin } from '../middleware/auth.js'
import type { GateItemDef, Role } from '../config/stageGates.js'

export type VisibilityLevel = 'full' | 'summary' | 'hidden'

/** Roles that participate as internal function teams (have Team Heads). */
export const TEAM_ROLES: Role[] = [
  'business_development',
  'safety',
  'manufacturing',
  'analytical',
  'quality',
  'costing',
  'regulatory',
  'legal',
  'supply_chain',
  'rd',
  'engineering',
]

export function itemOwnerRoles(item: Pick<GateItemDef, 'role' | 'supportRoles'>): Role[] {
  return [item.role, ...(item.supportRoles || [])]
}

/** True when the user may act on / fully view this checklist item. */
export function canAccessItemDetails(user: AuthUser, item: Pick<GateItemDef, 'role' | 'supportRoles'>): boolean {
  if (isAdmin(user)) return true
  if (user.role === 'client') return item.role === 'client'
  const owners = itemOwnerRoles(item)
  if (owners.includes(user.role)) return true
  // Team Head of the primary owning function also gets complete details
  // (e.g. Step 1 CDA → Vinay + BD Team Head).
  if (Number(user.is_team_head) === 1 && user.role === item.role) return true
  return false
}

/** True when the user may submit this item (owner role, support role, or admin). */
export function canSubmitItem(user: AuthUser, item: Pick<GateItemDef, 'role' | 'supportRoles'>): boolean {
  if (isAdmin(user)) return true
  return itemOwnerRoles(item).includes(user.role)
}

/** True when the user may download documents attached to this item. */
export function canDownloadItemDocs(user: AuthUser, item: Pick<GateItemDef, 'role' | 'supportRoles'>): boolean {
  return canAccessItemDetails(user, item)
}

/**
 * Does this user have any work on a given step (as owner, support, or that
 * team's head)? Used to decide whether the immediate next step is previewed.
 */
export function userHasWorkOnStep(user: AuthUser, stepItems: GateItemDef[]): boolean {
  if (isAdmin(user)) return true
  return stepItems.some((item) => canAccessItemDetails(user, item))
}

/**
 * Decide how much of an item this user may see, given where we are in the
 * gate's step sequence.
 */
export function itemVisibilityForUser(
  user: AuthUser,
  item: GateItemDef,
  opts: {
    gateLocked: boolean
    gateComplete: boolean
    currentStep: number
    isCurrentGate: boolean
  },
): VisibilityLevel {
  if (user.role === 'client') {
    if (item.role !== 'client') return 'hidden'
    if (opts.gateLocked) return 'hidden'
    if (opts.gateComplete || item.step <= opts.currentStep) return 'full'
    if (opts.isCurrentGate && item.step === opts.currentStep + 1) return 'summary'
    return 'hidden'
  }

  if (isAdmin(user)) {
    if (opts.gateLocked) {
      // SM still sees locked gates as empty of detail — progress strip covers them.
      return 'hidden'
    }
    return 'full'
  }

  if (opts.gateLocked) return 'hidden'

  // Completed earlier gates: owners keep full audit of their own items;
  // everyone else gets a summary only (no docs / remarks).
  if (opts.gateComplete) {
    return canAccessItemDetails(user, item) ? 'full' : 'summary'
  }

  // Current gate sequencing
  if (item.step < opts.currentStep) {
    return canAccessItemDetails(user, item) ? 'full' : 'summary'
  }
  if (item.step === opts.currentStep) {
    return canAccessItemDetails(user, item) ? 'full' : 'summary'
  }
  // Immediate next step — only revealed to the teams who will work it (or SM).
  if (item.step === opts.currentStep + 1) {
    return canAccessItemDetails(user, item) ? 'summary' : 'hidden'
  }
  return 'hidden'
}

export function redactItemForVisibility<T extends Record<string, unknown>>(
  item: T,
  level: VisibilityLevel,
): T & { visibility: VisibilityLevel; detailLocked: boolean } {
  if (level === 'full') {
    return { ...item, visibility: 'full', detailLocked: false }
  }
  if (level === 'hidden') {
    return {
      key: item.key,
      label: item.label,
      step: item.step,
      role: item.role,
      roleLabel: item.roleLabel,
      status: item.status === 'not_applicable' ? 'not_applicable' : 'pending',
      visibility: 'hidden',
      detailLocked: true,
      documents: [],
      remarks: null,
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      approvalComments: null,
      outputCaptured: null,
      note: null,
    } as unknown as T & { visibility: VisibilityLevel; detailLocked: boolean }
  }
  // summary — status + ownership visible, confidential payload stripped
  return {
    ...item,
    visibility: 'summary',
    detailLocked: true,
    documents: [],
    remarks: null,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    approvalComments: null,
    // Keep outputCaptured as a high-level hint of what the step produces
  } as T & { visibility: VisibilityLevel; detailLocked: boolean }
}
