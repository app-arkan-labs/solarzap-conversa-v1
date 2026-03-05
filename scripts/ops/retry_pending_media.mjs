#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env')
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath))
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const INTERNAL_SECRET = process.env.MEDIA_RESOLVER_INTERNAL_SECRET || process.env.ARKAN_WEBHOOK_SECRET || ''

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('[retry-pending-media] Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const idx = args.indexOf(name)
  if (idx === -1 || idx + 1 >= args.length) return fallback
  return args[idx + 1]
}

const maxBatch = Math.max(1, Math.min(Number(arg('--max-batch', '25')) || 25, 100))
const minAgeSeconds = Math.max(5, Math.min(Number(arg('--min-age-seconds', '30')) || 30, 3600))
const maxAttempts = Math.max(1, Math.min(Number(arg('--max-attempts', '5')) || 5, 15))
const cycles = Math.max(1, Math.min(Number(arg('--cycles', '20')) || 20, 300))
const orgId = arg('--org-id', '').trim()

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

async function invokeRetryPending() {
  const { data, error } = await supabase.functions.invoke('media-resolver', {
    ...(INTERNAL_SECRET ? { headers: { 'x-internal-secret': INTERNAL_SECRET } } : {}),
    body: {
      action: 'retryPending',
      maxBatch,
      minAgeSeconds,
      maxAttempts,
      ...(orgId ? { orgId } : {}),
    },
  })

  if (error) {
    const status = error?.context?.status || 'unknown'
    let raw = ''
    try {
      raw = error?.context?.clone ? await error.context.clone().text() : ''
    } catch {
      raw = ''
    }
    throw new Error(`invoke failed (status=${status}): ${error.message}${raw ? ` | body=${raw}` : ''}`)
  }

  return data
}

async function main() {
  console.log('[retry-pending-media] start', {
    maxBatch,
    minAgeSeconds,
    maxAttempts,
    cycles,
    orgId: orgId || null,
    hasInternalSecret: Boolean(INTERNAL_SECRET),
  })

  let totalScanned = 0
  let totalResolved = 0
  let totalFailed = 0
  let totalSkipped = 0

  for (let cycle = 1; cycle <= cycles; cycle++) {
    const data = await invokeRetryPending()
    const scanned = Number(data?.scanned || 0)
    const resolved = Number(data?.resolved || 0)
    const failed = Number(data?.failed || 0)
    const skipped = Number(data?.skipped || 0)

    totalScanned += scanned
    totalResolved += resolved
    totalFailed += failed
    totalSkipped += skipped

    console.log(`[retry-pending-media] cycle=${cycle}`, {
      scanned,
      resolved,
      failed,
      skipped,
      elapsedMs: data?.elapsedMs || null,
    })

    if (scanned === 0) break
  }

  console.log('[retry-pending-media] done', {
    totalScanned,
    totalResolved,
    totalFailed,
    totalSkipped,
  })
}

main().catch((error) => {
  console.error('[retry-pending-media] fatal', error)
  process.exit(1)
})
