import { requireSuperAdmin } from '../../../utils/permissions'
import { getD1SizeStats, D1_PAID_PLAN_SIZE_CAP_BYTES } from '../../../utils/d1-stats'

// Whole-instance size visibility — same requireSuperAdmin gate as db-export.get.ts,
// since this reports every site's data, not just the caller's current one. See
// server/utils/d1-stats.ts for what's measured and why.
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const stats = await getD1SizeStats(event)

  return { ...stats, paidPlanSizeCapBytes: D1_PAID_PLAN_SIZE_CAP_BYTES }
})
