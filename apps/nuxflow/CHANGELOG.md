# @nuxflow/app

## 2.0.0-beta.0

### Minor Changes

- 428031e: feat: add AI content generation and translation suite
  - Integrated OpenAI, Anthropic, and DeepSeek AI providers.
  - Added AI content tools for grammar correction, translation, SEO suggestions, and bulk alt-text generation.
  - Added AI generation modals in the Canvas Editor.
  - Updated settings UI for configuring AI provider API keys.
  - Handled UI updates for media library alt text generation.

- 4698a81: Add membership, auth, and public-facing pages; introduce 3-layer test suite; fix Cloudflare 522 registration timeout.

  **New pages:** `/register`, `/forgot-password`, `/reset-password`, `/pricing`, `/account` — all using the `auth` layout with glass-card styling.

  **Registration fix:** The `POST /api/public/auth/register` handler previously made a self-referencing HTTP call to Better Auth's sign-up endpoint, which causes a Cloudflare 522 connection-timeout when a Worker tries to fetch itself. The handler now creates the user and credential account directly in the database using `hashPassword` from `better-auth/crypto`, matching the setup wizard's approach. A new `GET /api/public/auth/registration-status` endpoint lets the register page check whether public registration is enabled before showing the form, so users are not presented with a form they cannot submit.

  **Content gating:** `GET /api/public/pages/[slug]` now enforces visibility rules (`public`, `members`, `private`, `tier:<id>`) and returns structured 402 payloads with available tier data.

  **Test suite:** Added a 3-layer test infrastructure — 10 unit test files (Vitest, pure logic), 5 integration test files (real in-memory SQLite via libSQL), and 3 Playwright E2E specs with a global setup that seeds a test site. New scripts: `test:integration`, `test:all`, `test:e2e`.

- 4f1621b: Add social login (Google/GitHub) with account linking, fix OAuth account-insert schema gap, and apply security hardening.

  **Social login & account linking**
  - `auth.config.ts`: fix `accountLinking` config key path (`accountLinking` → `account.accountLinking`) so `trustedProviders` is actually read by Better Auth; add `requireLocalEmailVerified: false` so onboarding-created admins can auto-link without email verification
  - `setup/complete.post.ts`: set `emailVerified: true` for the onboarding admin user (they proved ownership by running the wizard)
  - New `AdminLinkedAccountsManager.vue` component: shows email/password and OAuth provider rows, connect/disconnect buttons, safety guard against removing last auth method
  - `admin/settings/index.vue`: add LinkedAccountsManager to Security tab; deep-link to tab via `?tab=` query param after OAuth callback
  - `login.vue` and `register.vue`: handle `?error=` query params from Better Auth OAuth callbacks with user-friendly messages; add Google/GitHub buttons to register page

  **DB schema fix**
  - `packages/db/src/schema/users.ts`: add `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope` columns to the `accounts` table — Better Auth v1.6.14 inserts these on every OAuth account creation; their absence caused `unable_to_link_account` on first Google sign-in
  - Migration `0004_faithful_centennial.sql`: three nullable `ALTER TABLE ADD COLUMN` statements applied automatically on next deploy

  **Security hardening**
  - `theme-resolver.ts`: strip `</style>` tags from KV-stored CSS before SSR injection
  - `site-settings-resolver.ts`: validate primary colour against CSS allowlist regex; restrict font to known-good allowlist before injecting Google Fonts link
  - `03.api-key-auth.ts`: scope API key lookup to `event.context.siteId` so keys from one site cannot authenticate against another
  - `mcp.ts`: add role checks to `create_content` and `update_content` tools (author+ to create, editor+ to publish)
  - `comments.get.ts`: strip `guestEmail` from public comment responses
  - `preview/[token].get.ts`: query by `previewToken` column instead of `id`; add `siteId` scope and expiry check
  - `seed-test-pages.get.ts`: restrict to `NODE_ENV=development` and require super admin auth

  **Docs**
  - `docs/installation.md`: Social Login section with step-by-step Google and GitHub OAuth setup, required secrets, callback URIs, build-time env var reminder
  - `docs/user-guide.md`: Social Login & Account Linking section covering new-user signup, post-onboarding auto-linking, manual linking from Settings, and error message reference

### Patch Changes

- a03f004: fix: resolve pnpm hoisting issues for ESLint and Better Auth
  - Set `shamefully-hoist=true` in `.npmrc` to guarantee strict module resolution for Nuxt ESLint config.
  - Pinned `kysely` to `0.28.5` via `pnpm.overrides` in `package.json` to prevent `@better-auth` from crashing during the Cloudflare Nitro build process when `kysely` v0.29 is improperly hoisted.

- dc90543: Fix SSR relative fetch host context issue inside the setup guard route middleware to ensure onboarding setup is loaded successfully on secondary site custom domains. Clean up explicit any type-casts in super admin sites dashboard forms.
- bdb5f1e: Implement security enhancements (SSRF protection for backups/imports, Zip bomb/slip validation for restore operations) and edge rate-limiting optimizations using Cloudflare KV/Memory cache. Add new interactive Canvas blocks (Accordion, Button, Pricing) and update Contact Form block dependencies.
- Updated dependencies [0613cf7]
- Updated dependencies [4f1621b]
- Updated dependencies [bdb5f1e]
  - @nuxflow/plugin-canvas@2.0.0-beta.0
  - @nuxflow/db@2.0.0-beta.0
  - @nuxflow/plugin-contact-form@2.0.0-beta.0
  - @nuxflow/plugin-html-block@2.0.0-beta.0
  - @nuxflow/plugin-sdk@2.0.0-beta.0
  - @nuxflow/plugin-payments@2.0.0-beta.0

## 1.0.0

### Minor Changes

- Added state-of-the-art passwordless Passkeys (WebAuthn) biometric authentication, fully integrated a secure media-ingesting WordPress WXR Importer with Edge media upload and SSRF protection, added a native edge-compatible Model Context Protocol (MCP) server for AI agent content management, and resolved client-side authentication composable regressions.

### Patch Changes

- 4133bc3: Resolved Nitro router sibling dynamic conflicts by restructuring dynamic form endpoints under a unified `[formIdentifier]` directory. Fixed import page visibility contrast issues in light mode, integrated global `<UNotifications />` in app.vue, and added a fully comprehensive administrative E2E playwright test suite.
- 4133bc3: Resolved layout bugs in the Canvas testimonial blockquote by suppressing default browser quotes and optimizing z-index layering. Added a high-contrast dark space glassmorphic features card theme and a responsive 2-column open-source quick-start grid on the homepage.
- 4133bc3: Added site settings resolver server plugin to automatically resolve and cache site configuration at boot, updated settings and themes administrative panels, and refined styling assets for responsive alignment.
- Updated dependencies [4133bc3]
- Updated dependencies
  - @nuxflow/plugin-canvas@1.0.0
  - @nuxflow/db@1.0.0
  - @nuxflow/plugin-html-block@1.0.0
  - @nuxflow/plugin-sdk@1.0.0
  - @nuxflow/plugin-payments@1.0.0
  - @nuxflow/plugin-contact-form@1.0.0
