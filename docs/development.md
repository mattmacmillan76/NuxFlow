# Development Guide

This guide is for contributors and developers working on NuxFlow itself — modifying the source code, changing the database schema, writing tests, or building new features. If you want to deploy NuxFlow for your own site, see the [Installation Guide](./installation.md).

## Prerequisites

Install the following tools before you begin:

- **Node.js** 20 or higher
- **pnpm** 9 or higher — `npm install -g pnpm`
- **Wrangler** v4 (Cloudflare CLI) — `pnpm add -g wrangler`
- **Turso CLI** (optional, for remote database development) — `curl -sSfL https://get.tur.so/install.sh | bash`

---

## Monorepo Structure

NuxFlow is a pnpm monorepo managed with [Turborepo](https://turbo.build). The workspace is organised as follows:

```
nuxflow/
├── apps/
│   └── nuxflow/          # Main Nuxt 4 application (the CMS)
├── packages/
│   ├── db/               # Drizzle schema, migrations, and DB client
│   ├── plugin-sdk/       # SDK for building NuxFlow plugins
│   ├── plugins/          # Built-in plugins (canvas, contact-form, etc.)
│   └── cli/              # NuxFlow CLI tool
├── themes/
│   └── default/          # Default CSS theme
├── examples/             # Example themes and plugins
└── docs/                 # Documentation source
```

Most day-to-day development happens in `apps/nuxflow` and `packages/db`. The packages are linked via workspace references — changes to `packages/db/src/schema` are immediately reflected in `apps/nuxflow` without a build step.

---

## Getting Started

Clone the repository and install dependencies from the repo root:

```bash
git clone https://github.com/nuxflow/nuxflow.git
cd nuxflow
pnpm install
```

### Choose a Local Database

**Option A — Cloudflare D1 via `wrangler dev` (recommended):**

This is the closest to production. `wrangler dev` provisions a local D1 SQLite database automatically. Run from the `apps/nuxflow` directory:

```bash
cd apps/nuxflow
wrangler dev
```

Database migrations run automatically on the first request. Visit `http://localhost:8787/setup`.

**Option B — Local SQLite file:**

Copy the example env file and point the URL at a local file:

```bash
cp apps/nuxflow/.env.example apps/nuxflow/.env
```

```
NUXT_TURSO_URL=file:local.db
NUXT_TURSO_AUTH_TOKEN=
NUXT_BETTER_AUTH_SECRET=any-32-char-dev-secret-here!!
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```

```bash
pnpm dev
```

Visit `http://localhost:3000/setup`. The SQLite file is created automatically on first run.

**Option C — Turso remote database:**

Use this if you prefer a persistent cloud database that survives local machine restarts.

```bash
turso db create nuxflow-dev
turso db show nuxflow-dev --url
turso db tokens create nuxflow-dev
```

Add the credentials to `apps/nuxflow/.env`:

```
NUXT_TURSO_URL=libsql://your-db.turso.io
NUXT_TURSO_AUTH_TOKEN=your-token
NUXT_BETTER_AUTH_SECRET=any-32-char-dev-secret-here!!
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```

```bash
pnpm dev
```

---

## Root Scripts

The following scripts are available from the repo root and run across all packages via Turborepo:

| Command | Description |
|---|---|
| `pnpm dev` | Start the Nuxt dev server |
| `pnpm build` | Build all packages and the app |
| `pnpm lint` | Run ESLint across the monorepo |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run unit tests |
| `pnpm test:e2e` | Run Playwright end-to-end tests |

You can also run these commands scoped to a single package using the `--filter` flag:

```bash
pnpm --filter @nuxflow/app lint
pnpm --filter @nuxflow/db generate
```

---

## Database Schema and Migrations

NuxFlow uses [Drizzle ORM](https://orm.drizzle.team) with a SQLite dialect that works across both Cloudflare D1 and Turso.

### Schema files

The database schema lives in `packages/db/src/schema/`. Each file groups related tables:

| File | Contents |
|---|---|
| `sites.ts` | Sites, settings, redirects |
| `users.ts` | Users, sessions, accounts, roles |
| `content.ts` | Content types, items, revisions, taxonomies |
| `media.ts` | Media library, folders |
| `forms.ts` | Forms, submissions |
| `payments.ts` | Membership tiers, subscriptions |
| `system.ts` | Plugins, themes, audit logs, webhooks |

All schema files are re-exported from `packages/db/src/schema/index.ts`.

### Adding a schema change

When you need to add a table, add a column, or create an index, follow these steps:

**1 — Edit the schema.** Modify the relevant file in `packages/db/src/schema/`.

**2 — Generate the migration.** Run Drizzle Kit from the `packages/db` directory. It diffs your schema against the stored snapshot and produces a new SQL file:

```bash
pnpm --filter @nuxflow/db generate
```

This creates a new numbered file in `packages/db/migrations/` (e.g. `0002_your_description.sql`) and updates `meta/_journal.json`.

**3 — Review the generated SQL.** Open the new file and confirm it contains exactly what you expect before committing.

**4 — Commit the migration alongside the schema change.** Migration files are source code. Every schema change should be committed with its corresponding migration in the same commit so the two are always in sync.

### How migrations are applied

NuxFlow applies migrations automatically — no manual `wrangler d1 execute` or `migrate` commands are needed.

When a Worker receives its first request after a deploy (or cold start), the migration middleware in `apps/nuxflow/server/middleware/00.migrate.ts` runs the following logic:

1. Reads all `.sql` files from `packages/db/migrations/` (bundled into the Worker as server assets at build time)
2. Creates a `_nuxflow_migrations` tracking table if it does not exist
3. Checks which files have already been applied
4. Executes any new files in alphabetical order
5. Records each applied file in the tracking table

All subsequent requests skip this entirely — the result is cached in a module-level promise for the lifetime of the Worker isolate.

::note
**Existing installs are handled gracefully.** If the tracking table is empty but the `sites` table already exists (indicating a prior manual installation), the middleware seeds the tracking table without re-running any SQL. No data is lost.
::

### Drizzle Studio

To browse your database visually, run Drizzle Studio against your configured database:

```bash
pnpm --filter @nuxflow/db studio
```

This opens a local web UI at `https://local.drizzle.studio`.

---

## Testing

### Unit tests

Unit tests live in `apps/nuxflow/tests/unit/` and use [Vitest](https://vitest.dev).

```bash
pnpm --filter @nuxflow/app test
```

To run in watch mode during development:

```bash
pnpm --filter @nuxflow/app test:watch
```

### End-to-end tests

End-to-end tests use [Playwright](https://playwright.dev) and live in `apps/nuxflow/tests/`.

```bash
pnpm --filter @nuxflow/app test:e2e
```

### Lint and type checking

Run ESLint and TypeScript checks before opening a pull request:

```bash
pnpm lint
pnpm typecheck
```

Both checks run in CI on every push and pull request. A failing lint or typecheck will block the merge.

---

## Versioning and Releases

NuxFlow uses [Changesets](https://github.com/changesets/changesets) to manage versioning across the monorepo. All packages in the workspace are versioned together — a single release bumps every package to the same version.

### Adding a changeset

When your work is ready to ship, add a changeset describing what changed:

```bash
pnpm changeset
```

The CLI prompts you to select a bump type (`patch`, `minor`, or `major`) and write a summary. This creates a file in `.changeset/` that you commit alongside your code changes.

### Creating a release

When it is time to cut a release, a maintainer runs:

```bash
pnpm version   # consumes all pending changesets and bumps package.json versions
pnpm release   # builds everything and publishes to npm
```

### Commit message convention

This project follows [Conventional Commits](https://www.conventionalcommits.org). The commit prefix determines how changes appear in the changelog:

| Prefix | When to use |
|---|---|
| `feat:` | New user-facing feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change with no behaviour change |
| `test:` | Adding or updating tests |
| `chore:` | Build scripts, tooling, dependencies |

Commit messages are linted by commitlint in CI.

---

## Plugin Development

Plugins extend NuxFlow with new Canvas blocks, admin pages, API routes, and background tasks. The `packages/plugin-sdk` package provides the types and utilities for building them.

For a complete guide covering plugin structure, Canvas block registration, signing, and publishing, see the [External Plugin Development Guide](./plugins.md).

---

## Theme Development

A NuxFlow theme is a CSS file that overrides design tokens. Themes can optionally include a `theme.json` metadata file and a `demo.json` file containing starter content.

The default theme lives in `themes/default/`. Use it as a reference for the available CSS custom properties.

The `examples/hello-theme/` directory contains a minimal theme with annotations explaining each section. It is the recommended starting point for a new theme.

### Testing a theme locally

Build your theme into a zip package and upload it through the admin:

1. Create a zip containing `theme.css` and optionally `theme.json` and `demo.json`
2. Go to **Admin → Themes → Upload theme**
3. Activate the theme and inspect the result

To include starter content images in `demo.json`, place them in an `images/` folder inside the zip. NuxFlow uploads them to your configured media provider and rewrites the references automatically.
