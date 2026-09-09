import { useDb } from '../../../../utils/db'
import { users } from '@nuxflow/db/schema'
import { eq } from 'drizzle-orm'
import { requireRole, getUserSiteRole } from '../../../../utils/permissions'
import { rateLimit } from '../../../../utils/rate-limit'
import { getOrCreateBetterAuth } from '../../../../utils/better-auth'
import { writeAuditLog } from '../../../../utils/audit'

// Re-sends the same set-password email a brand-new invitee gets on first invite (see
// the requestPasswordReset call in index.post.ts) — for when the original link expired
// or the email never arrived. There's no separate invitations table, so "pending" is
// inferred client-side from GET /api/v1/users' `pending` flag (no session ever
// established); this endpoint doesn't gate on that itself; an admin resending it to an
// already-active user just gives them an extra way back into their account, which is
// harmless.
export default defineEventHandler(async (event) => {
  await rateLimit(event, { limit: 5, windowMs: 60_000, keyPrefix: 'user-resend-invite' })
  const { userId } = await requireRole(event, 'admin')
  const siteId = event.context.siteId!
  const targetId = getRouterParam(event, 'id')!

  const db = useDb(event)

  const membership = await getUserSiteRole(db, targetId, siteId)
  if (!membership) throw notFound('User not found in this site')

  const target = await db.query.users.findFirst({ where: eq(users.id, targetId), columns: { email: true } })
  if (!target) throw notFound('User not found')

  const auth = await getOrCreateBetterAuth(event)
  await auth.api.requestPasswordReset({ body: { email: target.email, redirectTo: '/reset-password' } })

  await writeAuditLog(event, userId, { action: 'resend_invite', resource: 'user', resourceId: targetId })

  return { success: true }
})
