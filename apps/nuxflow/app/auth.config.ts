import { defineClientAuth } from '@onmax/nuxt-better-auth/config'
import { passkeyClient } from '@better-auth/passkey/client'

export default defineClientAuth((ctx) => {
  // Use the active request origin dynamically to support multi-site tenancy custom domains.
  // Falls back to runtimeConfig.public.siteUrl if called outside a Nuxt request context.
  let origin = ctx.siteUrl
  try {
    const activeOrigin = useRequestURL().origin
    if (activeOrigin && activeOrigin.startsWith('http')) {
      origin = activeOrigin
    }
  } catch {
    /* keep fallback */
  }

  try { origin = new URL(origin).origin } catch { /* keep as-is */ }
  return {
    baseURL: `${origin}/api/auth`,
    plugins: [
      passkeyClient(),
    ],
  }
})
