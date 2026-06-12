import { requireRole } from '../../../utils/permissions'
import { useDb } from '../../../utils/db'
import { pushSubscriptions } from '@nuxflow/db/schema'
import { eq, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const siteId = event.context.siteId as string
  const db = useDb(event)

  const [row] = await db
    .select({ n: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.siteId, siteId))

  return { count: row?.n ?? 0 }
})
