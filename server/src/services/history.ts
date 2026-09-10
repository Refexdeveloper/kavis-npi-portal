import { run, now } from '../db/index.js'
import type { AuthUser } from '../middleware/auth.js'

export async function logHistory(leadId: number, actor: AuthUser | { id: number; full_name: string } | null, action: string, detail: string) {
  await run(
    `INSERT INTO history (lead_id, actor_user_id, actor_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [leadId, actor?.id ?? null, actor?.full_name ?? 'System', action, detail, now()],
  )
}
