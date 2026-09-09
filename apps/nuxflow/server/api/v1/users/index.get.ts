import { useDb } from '../../../utils/db'
import { requireRole } from '../../../utils/permissions'
import { userSiteRoles, sessions } from '@nuxflow/db/schema'
import { eq, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const db = useDb(event)
  const siteId = event.context.siteId as string

  const roles = await db.query.userSiteRoles.findMany({
    where: eq(userSiteRoles.siteId, siteId),
    with: { user: { columns: { id: true, name: true, email: true, image: true, createdAt: true } } },
    limit: 1000,
  })

  const userRows = roles.filter(r => r.user)

  // "Pending" == invited but never completed a sign-in. There's no separate invitations
  // table (see server/api/v1/users/index.post.ts) — a user is indistinguishable from a
  // fully active member except by whether they've ever established a real session.
  const everLoggedIn = userRows.length > 0
    ? new Set(
        (await db.query.sessions.findMany({
          where: inArray(sessions.userId, userRows.map(r => r.user!.id)),
          columns: { userId: true },
        })).map(s => s.userId),
      )
    : new Set<string>()

  type UserRow = { id: string; name: string; email: string; image: string | null; createdAt: string }
  return {
    users: userRows.map((r) => ({
      ...(r.user as UserRow),
      role: r.role,
      pending: !everLoggedIn.has(r.user!.id),
    })),
  }
})
