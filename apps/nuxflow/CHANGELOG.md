# @nuxflow/app

## 2.0.0-beta.1

### Minor Changes

- bd1d5bd: Add web push notifications (VAPID) for real-time in-app alerts.

  **Server**
  - `server/utils/webpush.ts`: full VAPID implementation using Web Crypto API (no Node.js dependencies) — key generation, subscription management, and RFC 8291 encrypted payload delivery.
  - `server/api/v1/push/`: eight new endpoints: `vapid-public-key.get`, `vapid-keys.post` (generate/rotate keys), `subscribe.post`, `unsubscribe.delete`, `status.get`, `subscribers.get`, `broadcast.post`, `test.post`.
  - `server/utils/notify.ts`: `sendNotification()` now broadcasts a web push alongside the in-app notification when the site has VAPID keys configured.
  - `server/utils/settings.ts`: add `push.vapid_public_key` and `push.vapid_private_key` to `SENSITIVE_SETTING_KEYS` for encrypted-at-rest storage.
  - Push triggers wired into `contact/submit.post.ts`, `content/[id].patch.ts`, and `memberships/webhooks/[provider].post.ts`.

  **Frontend**
  - `app/composables/usePushNotifications.ts`: composable that wraps the Push API, handles permission requests, subscribes/unsubscribes, and tracks state.
  - `app/components/public/PushNotificationBanner.vue`: opt-in banner rendered on public pages.
  - `app/layouts/default.vue`: mount the banner in the default layout.
  - `app/pages/account.vue`: push notification toggle in the user account settings.
  - `app/pages/admin/settings/index.vue`: VAPID key management and broadcast UI in Admin → Settings → Notifications.
  - `public/sw.js`: service worker that handles `push` events and renders notifications via the Notifications API.

  **Database**
  - `packages/db/src/schema/system.ts`: new `push_subscriptions` table (`id`, `siteId`, `userId`, `endpoint`, `p256dh`, `auth`, `createdAt`).
  - Migration `0001_simple_sprite.sql`: `CREATE TABLE push_subscriptions` applied automatically on next deploy.

- 058ca48: Add Cloudflare Stream video support, membership tier management, canvas block improvements, and wrangler dev build automation.

  **Cloudflare Stream / video**
  - `app/pages/admin/media/videos.vue`: dedicated Videos tab in the media library with TUS resumable upload support.
  - `server/api/v1/media/video/`: new video API endpoints for upload URL generation, list, and delete via the Cloudflare Stream API.
  - `packages/db/src/schema/media.ts`: add `videoAssets` table for tracking Stream-hosted videos.
  - Migrations `0002` and `0003`: schema additions applied automatically on next deploy.

  **Membership / billing**
  - `server/api/v1/memberships/index.post.ts`: create membership tiers with Stripe product and price creation.
  - `server/api/v1/memberships/[id].patch.ts`: update tier metadata and sync changes to Stripe.
  - `server/api/v1/memberships/checkout.post.ts`: Stripe Checkout session creation with configurable success/cancel URLs.
  - `server/api/v1/memberships/billing-portal.post.ts`: Stripe Customer Portal session creation.
  - `server/api/v1/memberships/webhooks/[provider].post.ts`: full Stripe webhook handling for subscription lifecycle events.
  - `packages/plugins/payments/src/providers/stripe.ts`: shared Stripe client helpers.
  - `packages/plugins/payments/src/components/MembershipsAdmin.vue`: tier CRUD UI with Stripe sync status.
  - `packages/plugins/payments/src/components/Paywall.vue`: subscription-aware paywall with portal link.

  **Canvas blocks**
  - `CanvasBlockGdpr.vue`: complete overhaul — consent state machine, cookie categories, granular accept/reject controls.
  - `CanvasBlockImage.vue`: lazy loading, aspect-ratio preservation, and Cloudflare Images URL transformation.
  - `CanvasBlockVideo.vue`: Stream iframe embed with poster and autoplay controls.
  - `definitions.ts`: updated block schemas for GDPR, image, and video blocks.
  - `themes/default/components/blocks/Image.vue`: matching image block improvements in the default theme.

  **Content editor**
  - `ContentEditor.client.vue`: image insertion from the media library, link editing, and table support.

  **Admin UI**
  - `app/pages/admin/settings/index.vue`: expanded settings page with Stream, Stripe, and email provider sections.
  - `app/components/admin/Sidebar.vue`: Videos link in the media section.
  - `app/pages/admin/media/index.vue`: media library layout and filter improvements.

  **Tests**
  - New integration test suite: `billing-portal`, `checkout`, `media-patch`, `memberships-tiers`, `video-assets`, `webhooks`.
  - New unit test: `canvas-blocks.test.ts` covering all block definition schemas.
  - Test helpers (`event.ts`, `globals.ts`, `seed.ts`): expanded fixtures for membership and media scenarios.

  **Developer experience**
  - `wrangler.toml` / `wrangler.toml.example`: add `[build] command = "pnpm run build"` so `wrangler dev` compiles the Nuxt app automatically on first run — no separate build step required.
  - `docs/installation.md`: document the auto-build behaviour and note that source changes require a restart.

### Patch Changes

- 9f7fbbd: Fix `state_mismatch` error on social login for secondary custom domains.

  **Root cause:** The Better Auth instance was created once at module load time with a hardcoded `baseURL` from `NUXT_PUBLIC_SITE_URL`. OAuth callbacks on secondary domains (e.g. `customerdomain.com`) had their `redirect_uri` set to the primary domain, causing Google/GitHub to reject the state token.

  **Auth fixes**
  - `server/utils/better-auth.ts`: new shared utility that builds a Better Auth instance per isolate with a 5-minute TTL. In production it loads all site domains from the DB and passes `{ allowedHosts, protocol: 'https', fallback }` as `baseURL` so Better Auth resolves the correct `redirect_uri` from the incoming `Host` header on every OAuth request.
  - `server/middleware/04.auth-override.ts`: new middleware that intercepts all `/api/auth/**` requests before any route handler runs, guaranteeing our instance (not the module's hardcoded one) handles every auth request.
  - `server/api/auth/[...all].ts`: updated to delegate to the shared utility.
  - `app/auth.config.ts`: fixed client-side `baseURL` resolution — `window.location.origin` is now checked first on the browser so the auth client on a secondary domain sends requests to that domain rather than the baked-in `NUXT_PUBLIC_SITE_URL`.

  **Docs**
  - `docs/installation.md`: clarify that `NUXT_PUBLIC_SITE_URL` is a `[vars]` entry in `wrangler.toml`, not a `wrangler secret put` secret; add multi-domain note to Google OAuth callback URI setup.
  - `docs/multi-site.md`: new "Social login on custom domains" section explaining per-domain callback URI registration for Google and the limitation of GitHub OAuth (single callback URL per app).

- Updated dependencies [bd1d5bd]
- Updated dependencies [058ca48]
  - @nuxflow/db@2.0.0-beta.1
  - @nuxflow/plugin-canvas@2.0.0-beta.1
  - @nuxflow/plugin-payments@2.0.0-beta.1
  - @nuxflow/plugin-sdk@2.0.0-beta.1
  - @nuxflow/plugin-contact-form@2.0.0-beta.1
  - @nuxflow/plugin-html-block@2.0.0-beta.1

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
