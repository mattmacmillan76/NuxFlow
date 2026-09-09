import { describe, it, expect, vi } from 'vitest'
import type { H3Event } from 'h3'

// Mock h3's createError global — this runs outside Nuxt/h3 context in a unit test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(globalThis as any).createError) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).createError = (err: { statusCode: number; message: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = new Error(err.message) as any
    error.statusCode = err.statusCode
    return error
  }
}

interface FakeTable {
  schema: string
  rows: Record<string, unknown>[]
}

// A minimal stand-in for the real D1Database binding — just enough of
// prepare(sql).all() to answer the four query shapes generateD1SqlDump() issues
// (sqlite_master, PRAGMA foreign_key_list, PRAGMA table_info, SELECT *).
function makeFakeD1(tables: Record<string, FakeTable>) {
  return {
    prepare(sql: string) {
      return {
        async all() {
          if (sql.startsWith('SELECT type, name, sql FROM sqlite_master')) {
            return {
              results: Object.entries(tables).map(([name, t]) => ({ type: 'table', name, sql: t.schema })),
              success: true,
              meta: {},
            }
          }
          const fk = sql.match(/PRAGMA foreign_key_list\("(.+)"\)/)
          if (fk) return { results: [], success: true, meta: {} }

          const info = sql.match(/PRAGMA table_info\("(.+)"\)/)
          if (info) {
            const rows = tables[info[1]!]?.rows ?? []
            const columnNames = rows.length ? Object.keys(rows[0]!) : []
            return { results: columnNames.map(name => ({ name })), success: true, meta: {} }
          }

          const select = sql.match(/SELECT \* FROM "(.+)"/)
          if (select) return { results: tables[select[1]!]?.rows ?? [], success: true, meta: {} }

          throw new Error(`Unexpected SQL against fake D1: ${sql}`)
        },
      }
    },
  }
}

function mkEvent() {
  return {} as unknown as H3Event
}

describe('generateD1SqlDump()', () => {
  it('emits schema and correctly-escaped INSERT statements for an ordinary table', async () => {
    vi.resetModules()
    vi.doMock('../../server/utils/db', () => ({
      getD1: () => makeFakeD1({
        sites: {
          schema: 'CREATE TABLE "sites" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "domain" TEXT)',
          rows: [
            { id: 'site-1', name: "O'Brien's Blog", domain: 'example.com' },
            { id: 'site-2', name: null, domain: 'test.localhost' },
          ],
        },
      }),
    }))
    const { generateD1SqlDump } = await import('../../server/utils/d1-export')

    const { sql, tableCount, rowCount } = await generateD1SqlDump(mkEvent())

    expect(tableCount).toBe(1)
    expect(rowCount).toBe(2)
    expect(sql).toContain('CREATE TABLE "sites"')
    expect(sql).toContain('PRAGMA defer_foreign_keys=TRUE;')
    expect(sql).toContain('BEGIN TRANSACTION;')
    expect(sql).toContain('COMMIT;')
    // Single quotes in string values are doubled, not left unescaped
    expect(sql).toContain("'O''Brien''s Blog'")
    // NULL columns come through as the literal NULL, not the string "null"
    expect(sql).toMatch(/\('site-2',NULL,'test\.localhost'\)/)
  })

  it('excludes FTS5 shadow tables and the virtual table itself from the data dump, but keeps their schema', async () => {
    vi.resetModules()
    vi.doMock('../../server/utils/db', () => ({
      getD1: () => makeFakeD1({
        search_index: {
          schema: "CREATE VIRTUAL TABLE search_index USING fts5(content_item_id UNINDEXED, title, body)",
          rows: [{ content_item_id: 'c1', title: 'Hello', body: 'World' }],
        },
        search_index_data: {
          schema: 'CREATE TABLE \'search_index_data\'(id INTEGER PRIMARY KEY, block BLOB)',
          rows: [{ id: 1, block: 'binary-ish' }],
        },
        search_index_config: {
          schema: 'CREATE TABLE \'search_index_config\'(k PRIMARY KEY, v) WITHOUT ROWID',
          rows: [{ k: 'version', v: 4 }],
        },
      }),
    }))
    const { generateD1SqlDump } = await import('../../server/utils/d1-export')

    const { sql, tableCount, rowCount } = await generateD1SqlDump(mkEvent())

    // Schema for the virtual table itself is kept (needed so its triggers/shadow
    // tables exist before any source-table data is restored)...
    expect(sql).toContain('CREATE VIRTUAL TABLE search_index USING fts5')
    // ...but none of it, nor its shadow tables, gets a data dump: the virtual table's
    // shadow tables are fts5-internal storage recreated by that CREATE statement, and
    // the virtual table's own logical rows come back via the triggers on their real
    // source table instead (see the comment in d1-export.ts).
    expect(sql).not.toContain('INSERT INTO "search_index"')
    expect(sql).not.toContain('INSERT INTO "search_index_data"')
    expect(sql).not.toContain('INSERT INTO "search_index_config"')
    expect(tableCount).toBe(0)
    expect(rowCount).toBe(0)
  })

  it('rejects a table/column name outside the safe-identifier pattern', async () => {
    vi.resetModules()
    vi.doMock('../../server/utils/db', () => ({
      getD1: () => makeFakeD1({
        'bad; drop table sites;--': {
          schema: 'CREATE TABLE "whatever" (id TEXT)',
          rows: [],
        },
      }),
    }))
    const { generateD1SqlDump } = await import('../../server/utils/d1-export')

    await expect(generateD1SqlDump(mkEvent())).rejects.toThrow(/unexpected identifier/i)
  })
})
