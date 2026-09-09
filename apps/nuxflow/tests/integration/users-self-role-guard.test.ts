/**
 * Regression coverage for the self-role-change guard on PATCH /api/v1/users/:id.
 *
 * Removal (DELETE) already blocked targeting yourself; role changes (PATCH) did
 * not, so an admin could demote themselves via the role dropdown with no
 * confirmation step — and if they were the site's last admin, no recovery path
 * short of a super admin stepping in from another site. Mirrors the existing
 * DELETE guard.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { H3Event } from 'h3'
import { initTestDb, teardownTestDb, getCurrentTestDb } from '../helpers/db'
import { createMockEvent } from '../helpers/event'
import { seedSite, seedUser, seedRole } from '../helpers/seed'
import { userSiteRoles } from '@nuxflow/db/schema'
import { and, eq } from 'drizzle-orm'
import updateUserHandler from '../../server/api/v1/users/[id].patch'

vi.mock('../../server/utils/db', () => ({
  useDb: () => getCurrentTestDb(),
  getD1: () => null,
}))

const SITE = 'site-user-self-guard-01'
let adminId: string
let otherAdminId: string

type HandlerFn = (e: H3Event) => Promise<unknown>

function mkEvent(callerId: string, targetId: string, role: string) {
  return createMockEvent({
    siteId: SITE,
    session: { user: { id: callerId, name: 'Test', email: 'test@user-self-guard.test' } },
    params: { id: targetId },
    body: { role },
  }) as unknown as H3Event
}

beforeAll(async () => {
  await initTestDb()
  const db = getCurrentTestDb()

  await seedSite(db, { id: SITE, domain: 'user-self-guard.localhost' })
  adminId = await seedUser(db, { email: 'admin@user-self-guard.test' })
  await seedRole(db, adminId, SITE, 'admin')
  otherAdminId = await seedUser(db, { email: 'other-admin@user-self-guard.test' })
  await seedRole(db, otherAdminId, SITE, 'admin')
})

afterAll(teardownTestDb)

describe('PATCH /api/v1/users/:id — self-role-change guard', () => {
  it('rejects an admin changing their own role', async () => {
    await expect(
      (updateUserHandler as HandlerFn)(mkEvent(adminId, adminId, 'viewer')),
    ).rejects.toMatchObject({ statusCode: 400 })

    const db = getCurrentTestDb()
    const row = await db.query.userSiteRoles.findFirst({
      where: and(eq(userSiteRoles.userId, adminId), eq(userSiteRoles.siteId, SITE)),
    })
    expect(row?.role).toBe('admin') // untouched
  })

  it('still allows an admin to change a different admin\'s role', async () => {
    await (updateUserHandler as HandlerFn)(mkEvent(adminId, otherAdminId, 'editor'))

    const db = getCurrentTestDb()
    const row = await db.query.userSiteRoles.findFirst({
      where: and(eq(userSiteRoles.userId, otherAdminId), eq(userSiteRoles.siteId, SITE)),
    })
    expect(row?.role).toBe('editor')
  })
})
