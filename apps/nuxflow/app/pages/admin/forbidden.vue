<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['auth'] })
useHead({ title: 'Access Denied' })
</script>

<template>
  <div class="max-w-md mx-auto text-center space-y-4 py-16">
    <div class="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto">
      <UIcon name="i-lucide-shield-x" class="w-7 h-7 text-red-500" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">You don't have access to this</h1>
      <p class="text-sm text-gray-500 mt-1">
        Your role on this site doesn't include this section. If you think that's wrong, ask a site admin to check your role under Users.
      </p>
    </div>
    <UButton to="/admin" icon="i-lucide-arrow-left" variant="soft">
      Back to dashboard
    </UButton>
  </div>
</template>
