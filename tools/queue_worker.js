/**
 * Lightweight queue worker for Supabase Edge Functions.
 *
 * Polls `claim_next_job` to discover job type, then invokes the matching
 * Edge Function URL so the existing Deno worker logic handles processing.
 *
 * Env:
 *   SUPABASE_URL            - Supabase project URL
 *   SUPABASE_ANON_KEY       - Anon/public key (used for RPC + Edge Function calls)
 *   PROCESS_DOCUMENT_URL    - Edge Function URL for process-document
 *   PROCESS_BRIEFING_URL    - Edge Function URL for process-briefing
 *   WORKER_POLL_INTERVAL_MS - Delay between polls (default 5000)
 */

import { createClient } from '@supabase/supabase-js'
import https from 'node:https'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROCESS_DOCUMENT_URL = process.env.PROCESS_DOCUMENT_URL
const PROCESS_BRIEFING_URL = process.env.PROCESS_BRIEFING_URL
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || '5000')
const WORKER_NAME = process.env.WORKER_NAME || 'render-worker-1'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing required env: SUPABASE_URL / SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function postJson(url: string, body: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let raw = ''
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        if (res.statusUrl && res.statusUrl && res.statusUrl !== '200' && res.statusUrl !== '202') {
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`))
        }
        resolve()
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function claimNextJob() {
  const { data, error } = await supabase.rpc('claim_next_job', { worker_name: WORKER_NAME })
  if (error) {
    console.error('claim_next_job error:', error.message)
    return null
  }
  return data
}

async function dispatch(job: Record<string, unknown>) {
  const jobType = job.job_type as string
  try {
    if (jobType === 'process_document') {
      if (!PROCESS_DOCUMENT_URL) {
        console.warn('PROCESS_DOCUMENT_URL not set; skipping', job.id)
        return
      }
      await postJson(PROCESS_DOCUMENT_URL, { worker_name: WORKER_NAME })
      console.log(`[OK] process_document ${job.id}`)
    } else if (jobType === 'generate_briefing') {
      if (!PROCESS_BRIEFING_URL) {
        console.warn('PROCESS_BRIEFING_URL not set; skipping', job.id)
        return
      }
      await postJson(PROCESS_BRIEFING_URL, { worker_name: WORKER_NAME })
      console.log(`[OK] generate_briefing ${job.id}`)
    } else {
      console.warn(`Unsupported job type: ${jobType}`)
    }
  } catch (err) {
    console.error(`Worker dispatch failed for ${job.id}:`, err)
  }
}

async function poll() {
  const job = await claimNextJob()
  if (!job) {
    console.log(`[${new Date().toISOString()}] No queued jobs`)
    return
  }
  console.log(`[${new Date().toISOString()}] Claimed ${job.job_type} ${job.id}`)
  await dispatch(job)
}

async function main() {
  console.log(`Worker started: ${WORKER_NAME} (poll every ${POLL_INTERVAL_MS}ms)`)
  while (true) {
    try {
      await poll()
    } catch (err) {
      console.error('Poll loop error:', err)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

main().catch((err) => {
  console.error('Fatal worker error:', err)
  process.exit(1)
})
