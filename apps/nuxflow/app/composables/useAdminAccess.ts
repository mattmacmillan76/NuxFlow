import type { Role } from '~/utils/admin-nav'

export interface AdminAccess {
  role: Role | null
  isSuperAdmin: boolean
}

// Same useState null-sentinel pattern as session.global.ts's auth:user — fetched once
// per app lifetime (SSR render or first client boot) and shared between AdminSidebar.vue
// (nav filtering) and admin-role-guard.global.ts (route gating) so navigating around the
// admin doesn't refetch /api/v1/users/me on every single page.
export function useAdminAccessState() {
  return useState<AdminAccess | null | undefined>('admin:access', () => undefined)
}

export async function fetchAdminAccess(): Promise<AdminAccess | null> {
  const state = useAdminAccessState()
  if (state.value === undefined) {
    try {
      state.value = await $fetch<AdminAccess>('/api/v1/users/me', {
        headers: import.meta.server ? useRequestHeaders(['cookie', 'host']) : undefined,
      })
    } catch {
      state.value = null
    }
  }
  return state.value ?? null
}
