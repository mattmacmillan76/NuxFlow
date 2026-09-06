/**
 * Integration tests for the NuxFlow backup/restore utilities:
 *   buildBackup()  — server/utils/backup.ts (used by GET /api/v1/backup)
 *   applyBackup()  — server/utils/backup.ts (used by POST /api/v1/restore and
 *                    the theme demo-import route)
 *
 * These exercise the core export/import logic directly rather than the HTTP
 * handlers, since the HTTP layer's multipart/zip parsing isn't covered by the
 * mock-event test harness. That's where the actual data-shape bugs live.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { H3Event } from 'h3'
import { initTestDb, teardownTestDb, getCurrentTestDb } from '../helpers/db'
import { createMockEvent } from '../helpers/event'
import { seedSite, seedUser, seedContentType, seedContentItem } from '../helpers/seed'
import { taxonomies, taxonomyTerms, contentTaxonomyTerms, contentItems, menus, forms, siteSettings } from '@nuxflow/db/schema'
import { eq, and } from 'drizzle-orm'
import { ulid } from 'ulid'
import { buildBackup, applyBackup } from '../../server/utils/backup'
import { resolveSetting, saveSetting } from '../../server/utils/settings'

vi.mock('../../server/utils/db', () => ({
  useDb: () => getCurrentTestDb(),
  getD1: () => null,
}))

const SOURCE_SITE = 'site-backup-src-01'
const TARGET_SITE = 'site-backup-dst-01'

let sourceTypeId: string
let newsTermId: string
let updatesTermId: string
let postId: string

function mkEvent(siteId: string) {
  return createMockEvent({ siteId }) as unknown as H3Event
}

beforeAll(async () => {
  await initTestDb()
  const db = getCurrentTestDb()

  await seedSite(db, { id: SOURCE_SITE, domain: 'backup-src.localhost' })
  await seedSite(db, { id: TARGET_SITE, domain: 'backup-dst.localhost' })
  await seedUser(db, { id: 'user-backup-01', email: 'backup@test.com' })

  sourceTypeId = await seedContentType(db, SOURCE_SITE, { slug: 'post', name: 'Posts', singularName: 'Post' })

  const taxId = ulid()
  await db.insert(taxonomies).values({ id: taxId, siteId: SOURCE_SITE, slug: 'category', name: 'Category' })
  newsTermId = ulid()
  updatesTermId = ulid()
  await db.insert(taxonomyTerms).values([
    { id: newsTermId, taxonomyId: taxId, slug: 'news', name: 'News' },
    { id: updatesTermId, taxonomyId: taxId, slug: 'updates', name: 'Updates' },
  ])

  postId = await seedContentItem(db, SOURCE_SITE, sourceTypeId, {
    slug: 'hello-world',
    title: 'Hello World',
    status: 'published',
    excerpt: 'An excerpt',
  })
  await db.insert(contentTaxonomyTerms).values({ contentItemId: postId, termId: newsTermId })

  await db.insert(menus).values({
    id: ulid(), siteId: SOURCE_SITE, name: 'Main Menu', location: 'header',
    items: [{ label: 'Home', url: '/' }],
  })

  await db.insert(forms).values({
    id: ulid(), siteId: SOURCE_SITE, slug: 'contact', name: 'Contact Us',
    fields: [{ key: 'email', type: 'email', label: 'Email' }],
    logic: [], notifications: {}, redirectUrl: null, status: 'active',
  })

  // A plain setting and a sensitive one — saveSetting() encrypts the sensitive one.
  await saveSetting(mkEvent(SOURCE_SITE), 'seo.meta_title', 'My Site')
  await saveSetting(mkEvent(SOURCE_SITE), 'payments.stripe_secret_key', 'sk_test_supersecret123')
})

afterAll(teardownTestDb)

describe('buildBackup()', () => {
  it('exports content with its taxonomy term assignments as slug paths', async () => {
    const backup = await buildBackup(mkEvent(SOURCE_SITE), SOURCE_SITE)
    const item = backup.content.find(c => c.slug === 'hello-world')
    expect(item).toBeTruthy()
    expect(item!.termSlugs).toEqual(['category/news'])
    expect(item!.excerpt).toBe('An excerpt')
  })

  it('exports menus and forms', async () => {
    const backup = await buildBackup(mkEvent(SOURCE_SITE), SOURCE_SITE)
    expect(backup.menus.map(m => m.name)).toContain('Main Menu')
    expect(backup.forms.map(f => f.slug)).toContain('contact')
  })

  it('decrypts sensitive settings back to plaintext for portability', async () => {
    const backup = await buildBackup(mkEvent(SOURCE_SITE), SOURCE_SITE)
    expect(backup.settings['seo.meta_title']).toBe('My Site')
    expect(backup.settings['payments.stripe_secret_key']).toBe('sk_test_supersecret123')
  })
})

describe('applyBackup() — first restore onto an empty site', () => {
  it('creates content, taxonomies/terms, menus, forms, and re-encrypts settings', async () => {
    const backup = await buildBackup(mkEvent(SOURCE_SITE), SOURCE_SITE)
    const result = await applyBackup(mkEvent(TARGET_SITE), TARGET_SITE, backup, {
      what: ['content', 'taxonomies', 'menus', 'forms', 'settings'],
      conflictMode: 'skip',
    })

    expect(result.content.created).toBe(1)
    expect(result.taxonomies.created).toBe(1)
    expect(result.terms.created).toBe(2)
    expect(result.menus.created).toBe(1)
    expect(result.forms.created).toBe(1)
    expect(result.settings.updated).toBe(2)

    const db = getCurrentTestDb()
    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.siteId, TARGET_SITE), eq(contentItems.slug, 'hello-world')),
    })
    expect(item).toBeTruthy()

    const assignments = await db.query.contentTaxonomyTerms.findMany({
      where: eq(contentTaxonomyTerms.contentItemId, item!.id),
    })
    expect(assignments).toHaveLength(1)

    const secret = await resolveSetting(mkEvent(TARGET_SITE), 'payments.stripe_secret_key')
    expect(secret).toBe('sk_test_supersecret123')

    // Stored ciphertext must not be the plaintext value (round-tripped through
    // saveSetting()'s encryption, not written raw).
    const row = await db.query.siteSettings.findFirst({
      where: and(eq(siteSettings.siteId, TARGET_SITE), eq(siteSettings.key, 'payments.stripe_secret_key')),
    })
    expect(row!.value).not.toBe('sk_test_supersecret123')
  })
})

describe('applyBackup() — conflictMode "overwrite" reapplies taxonomy term assignments', () => {
  it('replaces existing term assignments with the backup\'s, not just item fields', async () => {
    const db = getCurrentTestDb()

    // Simulate drift on the target site: the restored item now has "updates"
    // instead of "news" (e.g. an editor recategorized it after the first restore).
    const targetItem = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.siteId, TARGET_SITE), eq(contentItems.slug, 'hello-world')),
    })
    const targetTax = await db.query.taxonomies.findFirst({
      where: and(eq(taxonomies.siteId, TARGET_SITE), eq(taxonomies.slug, 'category')),
    })
    const targetUpdatesTerm = await db.query.taxonomyTerms.findFirst({
      where: and(eq(taxonomyTerms.taxonomyId, targetTax!.id), eq(taxonomyTerms.slug, 'updates')),
    })
    await db.delete(contentTaxonomyTerms).where(eq(contentTaxonomyTerms.contentItemId, targetItem!.id))
    await db.insert(contentTaxonomyTerms).values({ contentItemId: targetItem!.id, termId: targetUpdatesTerm!.id })

    // Restore the original backup (termSlugs: ["category/news"]) with overwrite mode.
    const backup = await buildBackup(mkEvent(SOURCE_SITE), SOURCE_SITE)
    const result = await applyBackup(mkEvent(TARGET_SITE), TARGET_SITE, backup, {
      what: ['content', 'taxonomies'],
      conflictMode: 'overwrite',
    })

    expect(result.content.updated).toBe(1)
    expect(result.content.created).toBe(0)

    const assignments = await db.query.taxonomyTerms.findMany({
      where: eq(taxonomyTerms.taxonomyId, targetTax!.id),
    })
    const termById = new Map(assignments.map(t => [t.id, t.slug]))

    const finalAssignments = await db.query.contentTaxonomyTerms.findMany({
      where: eq(contentTaxonomyTerms.contentItemId, targetItem!.id),
    })
    const finalSlugs = finalAssignments.map(a => termById.get(a.termId))
    expect(finalSlugs).toEqual(['news'])
  })
})

describe('applyBackup() — conflictMode "archive" keeps both copies', () => {
  it('renames the existing item as a draft backup and inserts the backup content fresh', async () => {
    const db = getCurrentTestDb()
    const backup = await buildBackup(mkEvent(SOURCE_SITE), SOURCE_SITE)

    const result = await applyBackup(mkEvent(TARGET_SITE), TARGET_SITE, backup, {
      what: ['content', 'taxonomies'],
      conflictMode: 'archive',
    })

    expect(result.content.created).toBe(1)

    const items = await db.query.contentItems.findMany({
      where: eq(contentItems.siteId, TARGET_SITE),
    })
    const archived = items.find(i => i.slug.startsWith('hello-world-backup-'))
    const fresh = items.find(i => i.slug === 'hello-world')

    expect(archived).toBeTruthy()
    expect(archived!.status).toBe('draft')
    expect(fresh).toBeTruthy()

    const freshAssignments = await db.query.contentTaxonomyTerms.findMany({
      where: eq(contentTaxonomyTerms.contentItemId, fresh!.id),
    })
    expect(freshAssignments).toHaveLength(1)
  })
})
