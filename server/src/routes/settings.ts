import { Router } from 'express'
import { fail, okItem } from '../utils/response.js'
import { requireSettingsEditor } from '../middleware/auth.js'
import { ROLE_LABELS, ROLE_LIST } from '../config/stageGates.js'
import {
  rolePermissionPayload,
  saveRolePermissions,
  saveWorkflow,
  workflowPayload,
} from '../services/settings.js'

const router = Router()

router.use(requireSettingsEditor)

router.get('/workflow', (_req, res) => {
  return okItem(res, { gates: workflowPayload(), roles: ROLE_LIST.map((role) => ({ role, label: ROLE_LABELS[role] })) })
})

router.put('/workflow', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null
  if (!items) return fail(res, 'Workflow items are required')
  await saveWorkflow(items)
  return okItem(res, { gates: workflowPayload() })
})

router.get('/role-permissions', (_req, res) => {
  return okItem(res, { roles: rolePermissionPayload() })
})

router.put('/role-permissions', async (req, res) => {
  const roles = Array.isArray(req.body?.roles) ? req.body.roles : null
  if (!roles) return fail(res, 'Role permissions are required')
  await saveRolePermissions(roles)
  return okItem(res, { roles: rolePermissionPayload() })
})

export default router
