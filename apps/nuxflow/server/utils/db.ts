import type { H3Event } from 'h3'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@nuxflow/db/schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>

// Module-level D1 binding cache — stable within a CF Workers isolate.
// Populated by useDb(event) on first request (via the 01.d1-cache middleware)
// so later calls (e.g. from scheduled tasks with no live event) can still
// find a binding via the globalThis fallback below.
let _d1: unknown = null

// Pass the H3Event explicitly so Cloudflare D1 binding is always accessible —
// useEvent() does not reliably propagate event context in CF Workers utility functions.
export function useDb(event?: H3Event): Db {
  // useEvent() throws when called outside a request context (e.g. scheduled tasks).
  // Isolate it so the globalThis.__env__ fallback is always reachable.
  let eventD1: unknown
  // eslint-disable-next-line no-empty
  try { eventD1 = (event ?? useEvent())?.context?.cloudflare?.env?.DB } catch {}

  // In scheduled tasks Nitro sets globalThis.__env__ to the Cloudflare bindings
  // object before firing the cloudflare:scheduled hook, so DB is available there.
  const cfGlobal = globalThis as { __env__?: { DB?: unknown } }
  const d1 = eventD1 ?? cfGlobal.__env__?.DB ?? _d1

  if (!d1) {
    throw createError({
      statusCode: 500,
      message: 'No D1 database bound. Add a [[d1_databases]] block to wrangler.toml and run via `wrangler dev` (local) or a real deploy — D1 is provisioned automatically either way.',
    })
  }

  _d1 ??= d1
  // d1 is read from several untyped sources above (event context, globalThis fallback,
  // module cache) — TS can't prove it's a real D1Database through that chain, but the
  // caller-facing guarantee (throw above if absent) is the actual safety check.
  return drizzle(d1 as D1Database, { schema })
}

// Raw D1Database binding, bypassing Drizzle — for code that needs direct SQL access
// Drizzle's query builder doesn't expose (schema introspection via sqlite_master/PRAGMA,
// e.g. the whole-database SQL export in d1-export.ts). Shares useDb()'s binding
// resolution (event context, then the scheduled-task globalThis fallback) rather than
// duplicating it.
export function getD1(event?: H3Event): D1Database {
  useDb(event) // populates _d1 via the resolution chain above; throws the same clear error if unbound
  return _d1 as D1Database
}
