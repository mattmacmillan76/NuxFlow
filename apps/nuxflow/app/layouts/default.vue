<template>
  <div class="mesh-bg min-h-screen">
    <PublicSiteHeader />
    <main>
      <slot />
    </main>
    <ClientOnly><PublicCookieConsent /></ClientOnly>
    <ClientOnly><PublicPushNotificationBanner /></ClientOnly>
  </div>
</template>
