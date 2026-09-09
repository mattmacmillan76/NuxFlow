import type { H3Event } from 'h3'
import { getD1 } from './db'

// Whole-D1-instance SQL dump — not the per-site JSON backup in backup.ts. `wrangler d1
// export` is a CLI-only tool (it shells out to Cloudflare's API from the developer's
// machine, not something a live Worker can invoke), so this reimplements the same idea
// from inside a request: introspect the database's actual schema via sqlite_master/PRAGMA
// and emit a portable, restorable .sql file. Every site's data comes back in one file —
// this is a database-level backup, not a site-level one — which is why the only caller
// (server/api/v1/admin/db-export.get.ts) gates it behind requireSuperAdmin, not the
// site-scoped requireRole() the per-site backup route uses.

interface SqliteMasterRow {
  type: string
  name: string
  sql: string | null
}

const IDENTIFIER_PATTERN = /^[a-z_]\w*$/i

// Table/column names here always come from sqlite_master or PRAGMA table_info — trusted
// system catalogs, not user input — but they still get interpolated directly into SQL
// (identifiers can't be bound as query parameters), so this is defense in depth against
// ever silently exporting something unexpected rather than a real injection vector.
function assertSafeIdentifier(name: string): void {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw createError({ statusCode: 500, message: `D1 export: unexpected identifier "${name}" in database schema` })
  }
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof ArrayBuffer) return `X'${Buffer.from(value).toString('hex')}'`
  if (ArrayBuffer.isView(value)) {
    const view = value as Uint8Array
    return `X'${Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('hex')}'`
  }
  return `'${String(value).replace(/'/g, '\'\'')}'`
}

function asStatement(sql: string): string {
  const trimmed = sql.trim()
  return trimmed.endsWith(';') ? trimmed : `${trimmed};`
}

const ROWS_PER_INSERT = 200
// Safety cap, same spirit as backup.get.ts's MAX_RAW_IMAGE_BYTES — bail with a clear
// error rather than risk an isolate OOM/timeout on a runaway export. A deployment past
// this size should use `wrangler d1 export` from the CLI instead (no Worker request
// duration/memory limit there).
const MAX_DUMP_BYTES = 200 * 1024 * 1024

export interface D1DumpResult {
  sql: string
  tableCount: number
  rowCount: number
}

export async function generateD1SqlDump(event: H3Event): Promise<D1DumpResult> {
  const d1 = getD1(event)

  const master = await d1.prepare(
    `SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  ).all<SqliteMasterRow>()
  const entries = master.results
  for (const e of entries) assertSafeIdentifier(e.name)

  // FTS5 virtual tables (e.g. search_index, see migrations/0002_search_index.sql) own a
  // set of auto-created shadow tables (name_data/_idx/_docsize/_content/_config). Those
  // shadow tables aren't ordinary rows — they're fts5's internal storage, recreated
  // automatically by the virtual table's own CREATE statement and not meaningfully
  // hand-populated via plain INSERT — so both they and the virtual table itself are
  // excluded from the data dump. The virtual table's logical rows come back for free
  // once its own AFTER INSERT/UPDATE/DELETE triggers fire again as their source table's
  // data is restored (that's the same mechanism that keeps it in sync live, per
  // CLAUDE.md's Search section), so dumping its rows directly would just risk duplicates.
  const virtualTableNames = new Set(
    entries.filter(e => e.type === 'table' && /^CREATE VIRTUAL TABLE/i.test(e.sql ?? '')).map(e => e.name),
  )
  const shadowSuffixes = ['_data', '_idx', '_docsize', '_content', '_config']
  const shadowTableNames = new Set<string>()
  for (const vt of virtualTableNames) {
    for (const suffix of shadowSuffixes) shadowTableNames.add(`${vt}${suffix}`)
  }

  const realTables = entries.filter(e => e.type === 'table' && !shadowTableNames.has(e.name))
  const dataTables = realTables.filter(e => !virtualTableNames.has(e.name))

  // ── Dependency order (best-effort) ──────────────────────────────────────────
  // Correctness doesn't depend on this — the whole dump runs inside one transaction
  // with PRAGMA defer_foreign_keys=TRUE, which defers every FK check (including
  // self-references within the same table, e.g. taxonomy_terms.parent_id) to COMMIT —
  // but ordering parent tables first keeps the file readable and is a second line of
  // defense if a restore tool doesn't honor that pragma.
  const fkLists = await Promise.all(
    dataTables.map(t => d1.prepare(`PRAGMA foreign_key_list("${t.name}")`).all<{ table: string }>()),
  )
  const dependsOn = new Map<string, Set<string>>()
  for (const t of dataTables) dependsOn.set(t.name, new Set())
  dataTables.forEach((t, i) => {
    for (const fk of fkLists[i]!.results) {
      if (fk.table !== t.name && dependsOn.has(fk.table)) dependsOn.get(t.name)!.add(fk.table)
    }
  })
  const ordered: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  function visit(name: string) {
    if (visited.has(name) || visiting.has(name)) return // cycle guard — defer_foreign_keys covers correctness
    visiting.add(name)
    for (const dep of dependsOn.get(name) ?? []) visit(dep)
    visiting.delete(name)
    visited.add(name)
    ordered.push(name)
  }
  for (const t of dataTables) visit(t.name)

  // ── Fetch columns + rows for every data table concurrently ─────────────────────
  const dataTableByName = new Map(dataTables.map(t => [t.name, t]))
  const fetched = await Promise.all(
    ordered.map(async (name) => {
      const cols = await d1.prepare(`PRAGMA table_info("${name}")`).all<{ name: string }>()
      const columnNames = cols.results.map(c => c.name)
      for (const c of columnNames) assertSafeIdentifier(c)
      const data = await d1.prepare(`SELECT * FROM "${name}"`).all<Record<string, unknown>>()
      return { name, columnNames, rows: data.results }
    }),
  )

  // ── Assemble the file ────────────────────────────────────────────────────────
  const parts: string[] = []
  parts.push('-- NuxFlow D1 export — every site in this database instance')
  parts.push(`-- Generated ${new Date().toISOString()}`)
  parts.push('-- Restore: wrangler d1 execute <database-name> --remote --file=<this file>')
  parts.push('PRAGMA defer_foreign_keys=TRUE;')
  parts.push('BEGIN TRANSACTION;')

  // Schema: real tables (including virtual tables, excluding their shadow tables) first,
  // then indexes/triggers/views — DDL that references a table needs it to exist first.
  for (const e of realTables) parts.push(asStatement(e.sql!))
  for (const e of entries) {
    if (e.type === 'table') continue
    parts.push(asStatement(e.sql!))
  }

  let totalRows = 0
  let totalBytes = parts.reduce((n, p) => n + p.length, 0)

  for (const { name, columnNames, rows } of fetched) {
    if (rows.length === 0) continue
    const table = dataTableByName.get(name)
    if (!table) continue

    parts.push(`-- Table: ${name} (${rows.length} row${rows.length === 1 ? '' : 's'})`)
    const columnList = columnNames.map(c => `"${c}"`).join(',')

    for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
      const chunk = rows.slice(i, i + ROWS_PER_INSERT)
      const valuesList = chunk.map(row => `(${columnNames.map(c => sqlLiteral(row[c])).join(',')})`).join(',\n')
      const stmt = `INSERT INTO "${name}" (${columnList}) VALUES\n${valuesList};`
      parts.push(stmt)
      totalBytes += stmt.length
      if (totalBytes > MAX_DUMP_BYTES) {
        throw createError({
          statusCode: 413,
          message: `D1 export exceeds the ${MAX_DUMP_BYTES / (1024 * 1024)} MB safety limit for an in-Worker export — this database is too large to export from the admin UI. Use \`wrangler d1 export\` from the CLI instead (no request size/duration limit there).`,
        })
      }
    }
    totalRows += rows.length
  }

  parts.push('COMMIT;')

  return { sql: parts.join('\n\n'), tableCount: dataTables.length, rowCount: totalRows }
}
