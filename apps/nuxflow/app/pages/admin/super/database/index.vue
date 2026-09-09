<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['auth'] })
useHead({ title: 'Database Export' })

const downloading = ref(false)
const downloadError = ref('')
const lastExport = ref<{ tableCount: number; rowCount: number; at: string } | null>(null)

async function downloadExport() {
  downloading.value = true
  downloadError.value = ''
  try {
    const res = await fetch('/api/v1/admin/db-export')
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { message?: string } | null
      throw new Error(data?.message ?? `Export failed (${res.status})`)
    }
    const tableCount = Number(res.headers.get('X-NuxFlow-Table-Count') ?? 0)
    const rowCount = Number(res.headers.get('X-NuxFlow-Row-Count') ?? 0)

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nuxflow-d1-export-${new Date().toISOString().slice(0, 10)}.sql`
    a.click()
    URL.revokeObjectURL(url)

    lastExport.value = { tableCount, rowCount, at: new Date().toLocaleString() }
  } catch (e: unknown) {
    downloadError.value = e instanceof Error ? e.message : 'Export failed. Try again.'
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Database Export</h1>
      <p class="text-sm text-gray-500 mt-0.5">Download a raw SQL snapshot of the entire D1 database</p>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
            <UIcon name="i-lucide-database" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p class="font-semibold text-sm text-gray-900 dark:text-white">Export whole database</p>
            <p class="text-xs text-gray-400">Every site's data, in one restorable .sql file</p>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <UAlert icon="i-lucide-info" color="primary" variant="soft">
          <template #title>
            <span class="text-primary-900 dark:text-primary-200 font-semibold">What this is</span>
          </template>
          <template #description>
            <span class="text-gray-800 dark:text-gray-200">
              A plain SQL dump of every table in this D1 database — schema and data for
              <strong>all sites</strong>, not just the one you're currently viewing. This is the
              database-level equivalent of the offline backups you'd take of a VPS's own database;
              it's separate from the per-site .zip backup under Admin → Import & Backup, which only
              covers the current site and is meant for moving/restoring content, not full disaster recovery.
            </span>
          </template>
        </UAlert>

        <div class="grid grid-cols-1 gap-2 text-sm">
          <div class="flex items-start gap-2 text-gray-800 dark:text-gray-200">
            <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            <span>Sensitive settings (API keys, OAuth secrets) stay encrypted in this file — unlike the per-site .zip backup, nothing is decrypted to plaintext here.</span>
          </div>
          <div class="flex items-start gap-2 text-gray-800 dark:text-gray-200">
            <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            <span>Self-contained — restoring it recreates the exact schema (tables, indexes, triggers) alongside the data.</span>
          </div>
        </div>

        <UAlert icon="i-lucide-terminal" color="neutral" variant="soft">
          <template #title>
            <span class="font-semibold">Restoring this file</span>
          </template>
          <template #description>
            <span class="text-gray-800 dark:text-gray-200">
              NuxFlow doesn't restore raw SQL from the admin UI — use Cloudflare's own tooling:
            </span>
            <pre class="mt-2 text-xs bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto">wrangler d1 execute &lt;database-name&gt; --remote --file=nuxflow-d1-export-....sql</pre>
          </template>
        </UAlert>

        <UAlert icon="i-lucide-shield-alert" color="warning" variant="soft">
          <template #title>
            <span class="font-semibold">Every site's data, in one file</span>
          </template>
          <template #description>
            <span class="text-gray-800 dark:text-gray-200">
              This is why the option only exists here, for super admins — a regular site admin's own backup (Admin → Import & Backup) never includes other tenants' rows. Store this file as securely as you would a full database credential.
            </span>
          </template>
        </UAlert>

        <UAlert v-if="downloadError" icon="i-lucide-circle-x" color="error" variant="soft" :description="downloadError" />

        <UAlert
          v-if="lastExport"
          icon="i-lucide-circle-check"
          color="success"
          variant="soft"
          title="Export downloaded"
          :description="`${lastExport.tableCount} tables, ${lastExport.rowCount} rows — ${lastExport.at}`"
        />
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton icon="i-lucide-download" :loading="downloading" @click="downloadExport">
            Download .sql export
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
