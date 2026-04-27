// ═══════════════════════════════════════════════════════
// FIRST LIGHT — Auto-Archive to Google Cloud Storage
// Triggered daily by pg_cron at 2:00 AM IST
// Exports all Supabase tables as NDJSON to GCS bucket
// ═══════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GCS_BUCKET = Deno.env.get('GCS_BUCKET') || 'firstlightlive_archive'
const GCS_SA_KEY_RAW = Deno.env.get('GCS_SERVICE_ACCOUNT_KEY')!

const TABLES = [
  'daily_rituals', 'journal_entries', 'daily_logs', 'races',
  'weekly_metrics', 'monthly_grids', 'deep_work_sessions',
  'engagement_counters', 'ritual_definitions', 'ritual_completions',
  'stories_completions', 'weekly_schedule', 'mastery_daily',
  'mastery_weekly', 'mastery_monthly_scores', 'mastery_ideas',
  'brahma_daily', 'brahma_weekly', 'comments', 'comment_reactions',
  'config'
]

// Generate GCS OAuth2 access token from service account key
async function getGcsAccessToken(): Promise<string> {
  const saKey = JSON.parse(GCS_SA_KEY_RAW)
  const now = Math.floor(Date.now() / 1000)

  // Import the private key
  const pemContent = saKey.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )

  // Create JWT
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: saKey.client_email,
      scope: 'https://www.googleapis.com/auth/devstorage.read_write',
      aud: 'https://oauth2.googleapis.com/token',
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
    },
    cryptoKey
  )

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })
  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

// Upload NDJSON to GCS
async function uploadToGcs(accessToken: string, path: string, data: string): Promise<boolean> {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-ndjson'
    },
    body: data
  })
  return res.ok
}

serve(async (req) => {
  const startTime = Date.now()
  const body = await req.json().catch(() => ({}))
  const archiveDate = body.date || new Date().toISOString().split('T')[0]

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  let tablesArchived = 0
  let rowsArchived = 0
  let errors: string[] = []

  try {
    // Get GCS access token
    const accessToken = await getGcsAccessToken()

    // Date parts for GCS path
    const [year, month, day] = archiveDate.split('-')
    const basePath = `firstlight/${year}/${month}/${day}`

    // Export each table
    for (const table of TABLES) {
      try {
        // Fetch ALL rows from the table
        const { data, error } = await supabase.from(table).select('*')

        if (error) {
          errors.push(`${table}: ${error.message}`)
          continue
        }

        if (!data || data.length === 0) {
          continue // Skip empty tables
        }

        // Convert to NDJSON (one JSON object per line)
        const ndjson = data.map((row: Record<string, unknown>) => JSON.stringify(row)).join('\n')

        // Upload to GCS
        const gcsPath = `${basePath}/${table}.ndjson`
        const uploaded = await uploadToGcs(accessToken, gcsPath, ndjson)

        if (uploaded) {
          tablesArchived++
          rowsArchived += data.length
        } else {
          errors.push(`${table}: GCS upload failed`)
        }
      } catch (tableErr) {
        errors.push(`${table}: ${(tableErr as Error).message}`)
      }
    }

    // Log the archive run
    const duration = Date.now() - startTime
    const status = errors.length === 0 ? 'success' : tablesArchived > 0 ? 'partial' : 'failed'

    await supabase.from('archive_log').insert({
      archive_date: archiveDate,
      tables_archived: tablesArchived,
      rows_archived: rowsArchived,
      gcs_path: `gs://${GCS_BUCKET}/firstlight/${year}/${month}/${day}/`,
      status,
      error_message: errors.length > 0 ? errors.join('; ') : null,
      duration_ms: duration
    })

    return new Response(JSON.stringify({
      success: true,
      status,
      archive_date: archiveDate,
      tables_archived: tablesArchived,
      rows_archived: rowsArchived,
      duration_ms: duration,
      errors: errors.length > 0 ? errors : undefined,
      gcs_path: `gs://${GCS_BUCKET}/firstlight/${year}/${month}/${day}/`
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err) {
    const duration = Date.now() - startTime

    // Log failure
    await supabase.from('archive_log').insert({
      archive_date: archiveDate,
      tables_archived: tablesArchived,
      rows_archived: rowsArchived,
      gcs_path: null,
      status: 'failed',
      error_message: (err as Error).message,
      duration_ms: duration
    }).catch(() => {}) // Don't fail if logging fails

    return new Response(JSON.stringify({
      success: false,
      error: (err as Error).message,
      duration_ms: duration
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
