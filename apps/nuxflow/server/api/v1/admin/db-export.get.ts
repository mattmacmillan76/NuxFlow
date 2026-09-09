import { requireSuperAdmin } from '../../../utils/permissions'
import { generateD1SqlDump } from '../../../utils/d1-export'
import { writeAuditLog } from '../../../utils/audit'

// Whole-D1-instance raw SQL export — every site's data in one file. Gated on
// requireSuperAdmin (cross-site), not the site-scoped requireRole() the per-site
// /api/v1/backup route uses, since a regular site admin has no business downloading
// every other tenant's rows. See server/utils/d1-export.ts for how the dump itself
// is built and why (wrangler d1 export is CLI-only, unreachable from a live Worker).
export default defineEventHandler(async (event) => {
  const { userId } = await requireSuperAdmin(event)

  const { sql, tableCount, rowCount } = await generateD1SqlDump(event)

  // Not site-scoped (auditLogs.siteId is NOT NULL and this action spans every site), so
  // this lands against whichever site's domain the super admin happened to be on —
  // matches how other cross-site super-admin actions in this codebase already log.
  await writeAuditLog(event, userId, {
    action: 'export',
    resource: 'd1_database',
    resourceId: 'all-sites',
    after: { tableCount, rowCount },
  })

  const filename = `nuxflow-d1-export-${new Date().toISOString().slice(0, 10)}.sql`
  setHeader(event, 'Content-Type', 'application/sql; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setHeader(event, 'X-NuxFlow-Table-Count', String(tableCount))
  setHeader(event, 'X-NuxFlow-Row-Count', String(rowCount))
  // Exposed so the browser's fetch() can read these two custom headers cross-origin —
  // harmless same-origin admin UI call today, but without this a CDN/proxy in front of
  // the Worker could otherwise strip access to them for a future cross-origin caller.
  setHeader(event, 'Access-Control-Expose-Headers', 'X-NuxFlow-Table-Count, X-NuxFlow-Row-Count')
  return sql
})
