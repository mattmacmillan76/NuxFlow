function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function usePushNotifications() {
  const isSupported = computed(() =>
    import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window,
  )

  const permission = ref<NotificationPermission>('default')
  const isSubscribed = ref(false)
  const isLoading = ref(false)

  if (import.meta.client) {
    permission.value = Notification.permission
  }

  async function refreshStatus() {
    if (!isSupported.value) return
    try {
      const { subscribed } = await $fetch<{ subscribed: boolean }>('/api/v1/push/status')
      isSubscribed.value = subscribed
    } catch { /* not logged in or push not configured */ }
  }

  async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    return reg
  }

  async function subscribe(): Promise<boolean> {
    if (!isSupported.value || isLoading.value) return false
    isLoading.value = true
    try {
      const result = await Notification.requestPermission()
      permission.value = result
      if (result !== 'granted') return false

      const { publicKey } = await $fetch<{ publicKey: string | null }>('/api/v1/push/vapid-public-key')
      if (!publicKey) return false

      const reg = await ensureServiceWorker()
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(publicKey),
      })

      const keys = subscription.toJSON().keys ?? {}
      await $fetch('/api/v1/push/subscribe', {
        method: 'POST',
        body: {
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh ?? '',
          auth: keys.auth ?? '',
        },
      })

      isSubscribed.value = true
      return true
    } catch (err) {
      console.error('[push] Subscribe failed:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function unsubscribe(): Promise<void> {
    if (!isSupported.value || isLoading.value) return
    isLoading.value = true
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()

      if (sub) {
        await $fetch('/api/v1/push/unsubscribe', {
          method: 'DELETE',
          body: { endpoint: sub.endpoint },
        })
        await sub.unsubscribe()
      }

      isSubscribed.value = false
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err)
    } finally {
      isLoading.value = false
    }
  }

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe, refreshStatus }
}
