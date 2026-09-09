/**
 * Coverage for POST/DELETE /api/v1/users/:id/super-admin — the previously-missing
 * lightweight path to promote/revoke a super admin without running someone through
 * the full site-setup wizard (which also reseeds the site's content as a side effect).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { H3Event } from 'h3'
import { initTestDb, teardownTestDb, getCurrentTestDb } from '../helpers/db'
import { createMockEvent } from '../helpers/event'
import { seedSite, seedUser, seedRole } from '../helpers/seed'
import { userSiteRoles } from '@nuxflow/db/schema'
import { and, eq } from 'drizzle-orm'
import grantHandler from '../../server/api/v1/users/[id]/super-admin.post'
import revokeHandler from '../../server/api/v1/users/[id]/super-admin.delete'

vi.mock('../../server/utils/db', () => ({
  useDb: () => getCurrentTestDb(),
  getD1: () => null,
}))

const SITE = 'site-super-admin-grant-01'
let superAdminId: string
let plainAdminId: string
let targetId: string

type HandlerFn = (e: H3Event) => Promise<unknown>

function mkEvent(callerId: string, targetUserId: string) {
  return createMockEvent({
    siteId: SITE,
    session: { user: { id: callerId, name: 'Test', email: 'test@super-grant.test' } },
    params: { id: targetUserId },
  }) as unknown as H3Event
}

beforeAll(async () => {
  await initTestDb()
  const db = getCurrentTestDb()

  await seedSite(db, { id: SITE, domain: 'super-grant.localhost' })
  superAdminId = await seedUser(db, { email: 'superadmin@super-grant.test' })
  await seedRole(db, superAdminId, SITE, 'super_admin')
  plainAdminId = await seedUser(db, { email: 'plainadmin@super-grant.test' })
  await seedRole(db, plainAdminId, SITE, 'admin')
  targetId = await seedUser(db, { email: 'target@super-grant.test' })
  await seedRole(db, targetId, SITE, 'editor')
})

afterAll(teardownTestDb)

describe('POST /api/v1/users/:id/super-admin (grant)', () => {
  it('rejects a caller who is not a super admin', async () => {
    await expect(
      (grantHandler as HandlerFn)(mkEvent(plainAdminId, targetId)),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('404s for a user that does not exist', async () => {
    await expect(
      (grantHandler as HandlerFn)(mkEvent(superAdminId, 'nonexistent-user-id')),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('grants super_admin to an existing editor', async () => {
    const result = await (grantHandler as HandlerFn)(mkEvent(superAdminId, targetId)) as { success: boolean; alreadySuperAdmin: boolean }
    expect(result.success).toBe(true)
    expect(result.alreadySuperAdmin).toBe(false)

    const db = getCurrentTestDb()
    const row = await db.query.userSiteRoles.findFirst({
      where: and(eq(userSiteRoles.userId, targetId), eq(userSiteRoles.siteId, SITE)),
    })
    expect(row?.role).toBe('super_admin')
  })

  it('is idempotent when the target is already a super admin', async () => {
    const result = await (grantHandler as HandlerFn)(mkEvent(superAdminId, targetId)) as { success: boolean; alreadySuperAdmin: boolean }
    expect(result.alreadySuperAdmin).toBe(true)
  })
})

describe('DELETE /api/v1/users/:id/super-admin (revoke)', () => {
  it('rejects revoking your own super admin status', async () => {
    await expect(
      (revokeHandler as HandlerFn)(mkEvent(superAdminId, superAdminId)),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a caller who is not a super admin', async () => {
    await expect(
      (revokeHandler as HandlerFn)(mkEvent(plainAdminId, targetId)),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('404s when the target is not currently a super admin on this site', async () => {
    await expect(
      (revokeHandler as HandlerFn)(mkEvent(superAdminId, plainAdminId)),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('downgrades a super admin to admin', async () => {
    const result = await (revokeHandler as HandlerFn)(mkEvent(superAdminId, targetId)) as { success: boolean }
    expect(result.success).toBe(true)

    const db = getCurrentTestDb()
    const row = await db.query.userSiteRoles.findFirst({
      where: and(eq(userSiteRoles.userId, targetId), eq(userSiteRoles.siteId, SITE)),
    })
    expect(row?.role).toBe('admin')
  })
})
