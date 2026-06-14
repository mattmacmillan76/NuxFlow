import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { H3Event } from 'h3'
import { initTestDb, teardownTestDb, getCurrentTestDb } from '../helpers/db'
import { createMockEvent } from '../helpers/event'
import { seedSite, seedUser, seedTier, seedSetting } from '../helpers/seed'
import checkoutHandler from '../../server/api/v1/memberships/checkout.post'
import { subscriptions } from '@nuxflow/db/schema'
import { and, eq } from 'drizzle-orm'

vi.mock('../../server/utils/db', () => ({
  useDb: () => getCurrentTestDb(),
  getD1: () => null,
}))

const SITE = 'site-checkout-01'
let userId: string
let freeTierId: string
let paidTierId: string

beforeAll(async () => {
  await initTestDb()
  const db = getCurrentTestDb()

  await seedSite(db, { id: SITE, domain: 'checkout.localhost' })
  await seedSetting(db, SITE, 'payments.stripe_secret_key', 'sk_test_123')
  userId = await seedUser(db, { email: 'checkout-user@sub.test' })
  freeTierId = await seedTier(db, SITE, { name: 'Free Plan', price: 0, currency: 'USD', interval: 'month' })
  paidTierId = await seedTier(db, SITE, { name: 'Paid Plan', price: 10, currency: 'USD', interval: 'month' })
})

afterAll(teardownTestDb)

type HandlerFn = (e: H3Event) => Promise<unknown>

function mkEvent(uid: string | null = userId, body: unknown = {}) {
  return createMockEvent({
    siteId: SITE,
    session: uid ? { user: { id: uid, name: 'Checkout User', email: 'checkout-user@sub.test' } } : null,
    body,
  }) as unknown as H3Event
}

describe('POST /api/v1/memberships/checkout', () => {
  it('throws 401 when not authenticated', async () => {
    const event = mkEvent(null, { tierId: freeTierId, returnUrl: 'http://localhost/success' })
    await expect(
      (checkoutHandler as HandlerFn)(event),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('subscribes to a free tier directly and redirects', async () => {
    const event = mkEvent(userId, { tierId: freeTierId, returnUrl: 'http://localhost/success' })
    const result = await (checkoutHandler as HandlerFn)(event) as { url: string }

    expect(result.url).toBe('http://localhost/success')

    // Verify subscription created in DB
    const db = getCurrentTestDb()
    const sub = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.siteId, SITE),
        eq(subscriptions.tierId, freeTierId),
      ),
    })

    expect(sub).toBeDefined()
    expect(sub!.status).toBe('active')
    expect(sub!.provider).toBe('stripe')
    expect(sub!.providerSubscriptionId.startsWith('free_')).toBe(true)
  })

  it('throws 409 for unsynced paid tier', async () => {
    const event = mkEvent(userId, { tierId: paidTierId, returnUrl: 'http://localhost/success' })
    await expect(
      (checkoutHandler as HandlerFn)(event),
    ).rejects.toMatchObject({ statusCode: 409, message: 'This tier has not been synced to Stripe' })
  })
})
