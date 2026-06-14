<script setup lang="ts">
defineProps<{ data: { src?: string; alt?: string; caption?: string; width?: number; height?: number; focalX?: number; focalY?: number } }>()
</script>
<template>
  <figure class="my-4">
    <img :src="data.src" :alt="data.alt ?? ''" :width="data.width" :height="data.height" class="rounded-lg w-full object-cover" :style="{ objectPosition: `${data.focalX ?? 50}% ${data.focalY ?? 50}%` }" loading="lazy" />
    <figcaption v-if="data.caption" class="mt-2 text-center text-sm text-gray-400">{{ data.caption }}</figcaption>
  </figure>
</template>
