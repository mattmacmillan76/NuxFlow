import { findNavRule, canAccessNavItem } from '~/utils/admin-nav'
import { fetchAdminAccess } from '~/composables/useAdminAccess'

// Bounces direct navigation to an /admin section the current user's role can't use
// (e.g. a 'viewer' typing /admin/users into the address bar) to a friendly "access
// denied" page instead of letting the page render and silently fail its own $fetch
// calls. Presentation-layer only — server-side requireRole()/requireSuperAdmin() is
// still the real boundary; see app/utils/admin-nav.ts for the shared rule table.
//
// Deliberately does NOT gate on useUserSession().loggedIn: that reads the useState
// session.global.ts populates, and global middleware files run in filename order —
// this one ('admin-role-guard') sorts before 'session', so that state is still the
// unset sentinel the first time this runs, making loggedIn.value read as false on
// every fresh SSR request regardless of the real session. fetchAdminAccess() below
// does its own independent authenticated fetch instead, so it isn't affected by that
// ordering — a null result already means "no session" (GET /api/v1/users/me 401s),
// so there's no separate loggedIn check to get out of sync in the first place.
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/admin')) return
  if (to.path === '/admin/forbidden') return

  const rule = findNavRule(to.path)
  if (!rule) return // no configured rule for this path — allow; server still enforces the real boundary

  const access = await fetchAdminAccess()
  if (!access) return // no session — app/middleware/auth.ts (page-level) handles the /login redirect

  if (!canAccessNavItem(rule, access)) {
    return navigateTo('/admin/forbidden')
  }
})
