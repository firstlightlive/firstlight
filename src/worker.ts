// ═══════════════════════════════════════════════════════════════════════════
// FirstLight Cloudflare Worker
// Serves the static site (website/) via ASSETS binding + adds dynamic routes
// for the Accountability Engine: proof-image generation, R2 upload, status.
// ═══════════════════════════════════════════════════════════════════════════

import { initWasm, Resvg } from '@resvg/resvg-wasm'
// In Cloudflare Workers, .wasm imports resolve to a compiled WebAssembly.Module.
// Wrangler bundles the WASM as a separate asset and links it at deploy time.
// @ts-expect-error - WASM module type inferred by bundler
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm'
// Bundled font files (TTF). resvg-wasm needs explicit font buffers — it does not
// have system fonts available in the Workers runtime. ~250KB added to bundle.
// @ts-expect-error - binary import bundled as Uint8Array by wrangler
import robotoMonoBold from './fonts/RobotoMono-Bold.ttf'
// @ts-expect-error - binary import bundled as Uint8Array by wrangler
import robotoMonoRegular from './fonts/RobotoMono-Regular.ttf'

export interface Env {
  ASSETS: Fetcher
  PROOFS: R2Bucket
  RENDER_KEY?: string  // optional shared secret for /api/render
  ADMIN_KEY?: string   // required for /api/upload (admin-only photo uploads)
  MAPBOX_TOKEN?: string // for fetching basemap on WIN_ROUTE slides
}

let _wasmInited = false
async function ensureResvg(): Promise<void> {
  if (_wasmInited) return
  // resvg-wasm's initWasm accepts WebAssembly.Module | BufferSource | Promise<...>
  await initWasm(resvgWasm as WebAssembly.Module)
  _wasmInited = true
}

// ─────────────────────────────────────────────────────────────────────────────
// Public routes
// ─────────────────────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // ── ENGINE API ROUTES ────────────────────────────────────────────────
    try {
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', service: 'firstlight-worker', timestamp: new Date().toISOString() })
      }

      // Generate + upload a proof image, return public URL.
      // POST /api/render
      // body: { date, chapterDay, variant: 'WIN'|'MISS', orientation: 'post'|'story', payload: {...} }
      if (path === '/api/render' && request.method === 'POST') {
        if (env.RENDER_KEY) {
          const provided = request.headers.get('x-render-key') || ''
          if (provided !== env.RENDER_KEY) {
            return jsonResponse({ error: 'Unauthorized' }, 401)
          }
        }
        const body = await request.json() as RenderRequest
        const result = await renderAndStore(body, env)
        return jsonResponse(result)
      }

      // Serve an R2 object directly (fallback if public r2.dev not used)
      // GET /api/proofs/:key
      if (path.startsWith('/api/proofs/')) {
        const key = path.replace('/api/proofs/', '')
        const obj = await env.PROOFS.get(key)
        if (!obj) return new Response('Not Found', { status: 404 })
        const headers = new Headers()
        obj.writeHttpMetadata(headers)
        headers.set('etag', obj.httpEtag)
        headers.set('cache-control', 'public, max-age=31536000, immutable')
        return new Response(obj.body, { headers })
      }

      // CORS preflight for /api/upload
      if (path === '/api/upload' && request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Folder, X-Filename-Prefix',
            'Access-Control-Max-Age': '86400'
          }
        })
      }

      // Upload an image to R2 — admin-only.
      // POST /api/upload
      // Headers:  X-Admin-Key (required), X-Folder (e.g. "profile", "about", "races", "races/bib"),
      //           X-Filename-Prefix (optional — defaults to folder name)
      // Body:     raw image bytes (Content-Type: image/jpeg | image/png | image/webp)
      // Returns:  { success, url, key, bytes, contentType }
      if (path === '/api/upload' && request.method === 'POST') {
        const corsHeaders = { 'Access-Control-Allow-Origin': '*' }
        if (!env.ADMIN_KEY) {
          return jsonResponse({ error: 'Server misconfigured: ADMIN_KEY not set' }, 500, corsHeaders)
        }
        const provided = request.headers.get('x-admin-key') || ''
        if (provided !== env.ADMIN_KEY) {
          return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders)
        }

        // Validate content type — only images allowed
        const contentType = (request.headers.get('content-type') || '').toLowerCase()
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
        if (!allowed.some(t => contentType.startsWith(t))) {
          return jsonResponse({ error: `Unsupported content-type: ${contentType}. Allowed: ${allowed.join(', ')}` }, 415, corsHeaders)
        }

        // Folder must be whitelisted to prevent abuse / path traversal
        const folderRaw = (request.headers.get('x-folder') || '').toLowerCase().trim()
        const folderAllow = /^(profile|about|races|races\/bib|races\/[a-z0-9_-]{1,40})$/
        if (!folderAllow.test(folderRaw)) {
          return jsonResponse({ error: `Bad folder. Allowed: profile | about | races | races/bib | races/{slug}` }, 400, corsHeaders)
        }

        // Prefix slug — used in filename so each race etc. is identifiable
        const prefixRaw = (request.headers.get('x-filename-prefix') || folderRaw.split('/').pop() || 'img').toLowerCase()
        const prefix = prefixRaw.replace(/[^a-z0-9_-]/g, '_').slice(0, 40) || 'img'

        // Compute extension from content-type
        const ext =
          contentType.startsWith('image/png')   ? 'png'  :
          contentType.startsWith('image/webp')  ? 'webp' :
          contentType.startsWith('image/gif')   ? 'gif'  :
          contentType.startsWith('image/heif') || contentType.startsWith('image/heic') ? 'heic' :
          'jpg'

        // Read body as bytes; cap at 10 MB
        const buf = await request.arrayBuffer()
        if (buf.byteLength === 0) {
          return jsonResponse({ error: 'Empty body' }, 400, corsHeaders)
        }
        if (buf.byteLength > 10 * 1024 * 1024) {
          return jsonResponse({ error: 'File too large (max 10 MB)' }, 413, corsHeaders)
        }

        const ts = Number(request.headers.get('x-ts') || Date.now())
        const filename = `${prefix}_${ts}.${ext}`
        const r2Key = `photos/${folderRaw}/${filename}`

        await env.PROOFS.put(r2Key, buf, {
          httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
          customMetadata: { folder: folderRaw, prefix, uploadedAt: new Date(ts).toISOString() }
        })

        const publicUrl = `https://firstlight.live/api/proofs/${r2Key}`
        return jsonResponse({
          success: true,
          url: publicUrl,
          key: r2Key,
          bytes: buf.byteLength,
          contentType
        }, 200, corsHeaders)
      }
    } catch (err) {
      return jsonResponse({ error: (err as Error).message, stack: (err as Error).stack?.slice(0, 1000) }, 500)
    }

    // ── PWA SHELL — serve .html in-place (200) instead of 307-redirecting ──
    //    Cloudflare's default html_handling redirects /punch.html → /punch.
    //    A *redirected* response can't be replayed from the service-worker
    //    cache to a navigation request, so the SW's offline precache of these
    //    shell pages silently fails and a cold offline launch shows a blank
    //    screen. Mapping the request to the clean URL here returns the asset
    //    200 in-place, so the SW can cache + replay it offline. Public
    //    marketing pages keep their canonical clean-URL redirect untouched.
    const SHELL_HTML = new Set(['/punch.html', '/admin.html', '/install.html', '/login.html', '/index.html'])
    if (SHELL_HTML.has(path)) {
      const clean = new URL(request.url)
      clean.pathname = path === '/index.html' ? '/' : path.slice(0, -5)
      return env.ASSETS.fetch(new Request(clean, request))
    }

    // ── STATIC ASSETS — pass-through ─────────────────────────────────────
    return env.ASSETS.fetch(request)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render request types
// ─────────────────────────────────────────────────────────────────────────────
interface MultiActivityItem {
  bucket: 'walk' | 'run' | 'cycle' | 'swim' | 'hrSession'
  type: string                          // raw Strava type
  name: string
  distanceKm?: number
  durationMin: number
  polyline?: string                     // optional — GPS sports have this
  averageHr?: number
  caloriesKcal?: number
}

interface RenderRequest {
  date: string                          // YYYY-MM-DD
  chapterDay: number
  variant: 'WIN' | 'MISS' | 'WIN_ROUTE' | 'WIN_MULTI_HERO' | 'WIN_MULTI_MAP' | 'WIN_MULTI_GRID' | 'WIN_MULTI_SUMMARY' | 'MONTHLY_RECAP' | 'CHAPTER_KICKOFF_HERO' | 'CHAPTER_KICKOFF_PROMISE' | 'CHAPTER_KICKOFF_MENU'
  orientation: 'post' | 'story'
  payload: {
    // WIN-specific (single activity)
    activityType?: string               // 'Run' | 'Walk' | 'Ride' | 'Swim' | 'Workout' | ...
    activityName?: string
    distanceKm?: number
    durationMin?: number
    pace?: string                       // formatted "5:42 /km" or similar
    averageHr?: number
    elevationM?: number
    caloriesKcal?: number
    // GPS route (encoded Google polyline) — for WIN_ROUTE variant
    polyline?: string
    activityDateIso?: string            // start_date_local for the timestamp
    // Multi-activity (for WIN_MULTI_* variants)
    activities?: MultiActivityItem[]
    totalKm?: number
    totalMin?: number
    totalKcal?: number
    // MISS-specific
    charity?: string                    // 'Akshaya Patra'
    reason?: string                     // short failure reason
    // Monthly recap
    monthly?: MonthlyRecapPayload
    monthlySlide?: 1 | 2 | 3 | 4 | 5 | 6 | 7
    // Theme name — bucket-based palette rotation (see THEMES const)
    theme?: 'strava' | 'earth' | 'arctic' | 'gradient' | 'infrared' | 'neon'
  }
}

interface MonthlyRecapPayload {
  monthLabel: string                  // "JUNE 2026"
  monthShort: string                  // "JUN"
  year: number
  monthNum: number                    // 1..12
  monthIndex: number                  // sequence in chapter (Month 1, Month 2...)
  daysInWindow: number                // total days in the chapter that overlap with this month
  hitDays: number
  missDays: number
  pendingDays: number                 // missed but not yet acted (live or future days)
  dayResults: Array<{ day: number; status: 'WIN' | 'MISS_PENDING' | 'MISS_PAID' | 'PRE_CHAPTER' | 'FUTURE' }>
  totalKm: number
  totalMin: number
  totalKcal: number
  donatedTotal: number                // rupees donated this month
  childrenFedYears: number            // total "1-child × 1-year" sponsorships
  sportBreakdown: Array<{
    bucket: 'walk' | 'run' | 'cycle' | 'swim' | 'hrSession'
    label: string
    color: string
    km: number
    minutes: number
    count: number
  }>
  uniqueSports: number
  longestActivity?: { name: string; km: number; minutes: number; type: string }
  avgPerDay: { km: number; min: number }
}

interface RenderResult {
  success: boolean
  publicUrl: string
  r2Key: string
  bytesGenerated: number
}

async function renderAndStore(req: RenderRequest, env: Env): Promise<RenderResult> {
  await ensureResvg()

  const svg = req.variant === 'WIN'                       ? renderWinSvg(req)
            : req.variant === 'WIN_ROUTE'                 ? await renderWinRouteSvg(req, env)
            : req.variant === 'WIN_MULTI_HERO'            ? renderMultiHeroSvg(req)
            : req.variant === 'WIN_MULTI_MAP'             ? await renderMultiMapSvg(req, env)
            : req.variant === 'WIN_MULTI_GRID'            ? renderMultiGridSvg(req)
            : req.variant === 'WIN_MULTI_SUMMARY'         ? renderMultiSummarySvg(req)
            : req.variant === 'MONTHLY_RECAP'             ? renderMonthlyRecapSvg(req)
            : req.variant === 'CHAPTER_KICKOFF_HERO'      ? renderKickoffHeroSvg(req)
            : req.variant === 'CHAPTER_KICKOFF_PROMISE'   ? renderKickoffPromiseSvg(req)
            : req.variant === 'CHAPTER_KICKOFF_MENU'      ? renderKickoffMenuSvg(req)
            : renderMissSvg(req)

  // Rasterize SVG → PNG via resvg-wasm. Fonts are passed as Uint8Array buffers
  // because the Workers runtime has no system fonts. loadSystemFonts is disabled.
  const isStory = req.orientation === 'story'
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
    font: {
      fontBuffers: [
        new Uint8Array(robotoMonoRegular as ArrayBuffer),
        new Uint8Array(robotoMonoBold as ArrayBuffer)
      ],
      loadSystemFonts: false,
      defaultFontFamily: 'Roboto Mono'
    }
  })
  // isStory is unused here but kept for future story-specific options
  void isStory
  const png = r.render().asPng()

  // R2 key: day-N/YYYY-MM-DD/{variant}_{orientation}.png
  // Monthly recap slides need a slide-number suffix so all 7 don't overwrite.
  const variantSlug = req.variant.toLowerCase()
  const slideSuffix = req.variant === 'MONTHLY_RECAP' && req.payload.monthlySlide ? `_s${req.payload.monthlySlide}` : ''
  const r2Key = `day-${req.chapterDay}/${req.date}/${variantSlug}${slideSuffix}_${req.orientation}.png`

  await env.PROOFS.put(r2Key, png, {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { date: req.date, variant: req.variant, orientation: req.orientation, day: String(req.chapterDay) }
  })

  // Public URL — always served through the Worker's /api/proofs route.
  // This avoids needing R2 public-access setup in the dashboard, gives us
  // Cloudflare edge caching, and keeps everything on firstlight.live for IG.
  const publicUrl = `https://firstlight.live/api/proofs/${r2Key}`

  return { success: true, publicUrl, r2Key, bytesGenerated: png.byteLength }
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG templates — dark theme, minimal, mono fonts
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0A0C10',
  text: '#FFFFFF',
  dim: '#5A6B80',
  gold: '#F5A623',
  cyan: '#00D4FF',
  green: '#00E676',
  red: '#FF5252',
  strava: '#FC4C02'
}

// ─────────────────────────────────────────────────────────────────────────────
// THEMES — bucket-based palette rotation for daily WIN posts.
// Engine maps the matched activity bucket to a theme:
//   run → strava, walk → earth, cycle → arctic, swim → gradient,
//   hrSession → infrared, multi-activity → neon
// Each theme carries: bg / text / dim / accent (brand) / accent2 (secondary).
// Slot semantics preserved across renderers — accent replaces the cyan/green
// brand color; accent2 replaces the gradient-end color on the big day number.
// ─────────────────────────────────────────────────────────────────────────────
type ThemeName = 'strava' | 'earth' | 'arctic' | 'gradient' | 'infrared' | 'neon'

interface Theme {
  bg:      string
  text:    string
  dim:     string
  accent:  string
  accent2: string
  halo:    string  // for radial gradient halo behind hero
}

const THEMES: Record<ThemeName, Theme> = {
  strava:   { bg: '#000000', text: '#FFFFFF', dim: '#5A6B80', accent: '#FC4C02', accent2: '#FF6F00', halo: 'rgba(252,76,2,0.06)' },
  earth:    { bg: '#1A1410', text: '#E8DCC8', dim: '#5C4A3E', accent: '#A1887F', accent2: '#7CB342', halo: 'rgba(161,136,127,0.08)' },
  arctic:   { bg: '#0A1628', text: '#E8EDF5', dim: '#3B5998', accent: '#93C5FD', accent2: '#60A5FA', halo: 'rgba(147,197,253,0.08)' },
  gradient: { bg: '#0A0C1A', text: '#FFFFFF', dim: '#6B7DB8', accent: '#00D4FF', accent2: '#A855F7', halo: 'rgba(0,212,255,0.08)' },
  infrared: { bg: '#0A0000', text: '#FFFFFF', dim: '#6B2020', accent: '#FF1744', accent2: '#FF5252', halo: 'rgba(255,23,68,0.08)' },
  neon:     { bg: '#0A0A14', text: '#FFFFFF', dim: '#6A2D8C', accent: '#E040FB', accent2: '#00E5FF', halo: 'rgba(224,64,251,0.08)' }
}

// Resolve theme from payload — fall back to a sensible default for each variant.
function resolveTheme(req: RenderRequest, defaultName: ThemeName): Theme {
  const requested = (req.payload.theme || '').toLowerCase() as ThemeName
  return THEMES[requested] || THEMES[defaultName]
}

function renderWinSvg(req: RenderRequest): string {
  const W = 1080
  const H = req.orientation === 'story' ? 1920 : 1080
  const day = req.chapterDay
  const p = req.payload

  // Theme — defaults to strava (matches old palette: orange accents). Engine
  // passes bucket-mapped theme (run=strava / walk=earth / cycle=arctic /
  // swim=gradient / hrSession=infrared / multi=neon).
  const t = resolveTheme(req, 'strava')

  // Stat row: activity type, distance/duration, pace/HR
  const statLine1 = p.activityName || (p.activityType || 'TRAINING').toUpperCase()
  const distStr = p.distanceKm ? `${p.distanceKm.toFixed(1)} KM` : ''
  const durStr = p.durationMin ? `${Math.round(p.durationMin)} MIN` : ''
  const paceStr = p.pace || ''
  const hrStr = p.averageHr ? `${Math.round(p.averageHr)} BPM` : ''

  // Orientation-aware layout. Story (1080×1920): scale text ~1.3x + distribute vertically.
  // Post (1080×1080): tight centered cluster.
  const isStory = req.orientation === 'story'
  const cy = isStory ? H * 0.45 : H / 2
  const s = isStory ? 1.3 : 1            // text/size scale factor
  const fz = (n: number) => Math.round(n * s)
  const off = (n: number) => Math.round(n * (isStory ? 1.15 : 1))  // vertical offsets stretched in story

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="halo" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="${t.halo}"/>
      <stop offset="100%" stop-color="${t.bg}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="day-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${t.text}"/>
      <stop offset="100%" stop-color="${t.accent2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#halo)"/>

  <!-- Brand bar -->
  <text x="${W / 2}" y="${cy - off(360)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(28)}" font-weight="700"
        fill="${t.accent}" letter-spacing="6">◆ FIRST LIGHT</text>
  <text x="${W / 2}" y="${cy - off(310)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(20)}" font-weight="500"
        fill="${t.dim}" letter-spacing="6">CHAPTER 02 · ENDURANCE</text>

  <!-- Day number -->
  <text x="${W / 2}" y="${cy + off(80)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(day >= 100 ? 360 : 440)}" font-weight="700"
        fill="url(#day-grad)" letter-spacing="-8">${day}</text>

  <!-- Accent rule -->
  <line x1="${W / 2 - 60}" y1="${cy + off(130)}" x2="${W / 2 + 60}" y2="${cy + off(130)}"
        stroke="${t.accent}" stroke-width="3"/>

  <!-- WIN seal -->
  <text x="${W / 2}" y="${cy + off(210)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(42)}" font-weight="700"
        fill="${t.text}" letter-spacing="4">DAY DONE</text>

  <!-- Stats row 1: activity name -->
  <text x="${W / 2}" y="${cy + off(295)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(28)}" font-weight="500"
        fill="${t.dim}" letter-spacing="3">${escapeXml(statLine1)}</text>

  <!-- Stats row 2: numbers -->
  ${distStr || durStr || paceStr || hrStr ? `
  <text x="${W / 2}" y="${cy + off(365)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(32)}" font-weight="700"
        fill="${t.text}" letter-spacing="2">${[distStr, durStr, paceStr, hrStr].filter(Boolean).join('  ·  ')}</text>
  ` : ''}

  <!-- URL -->
  <text x="${W / 2}" y="${H - (isStory ? 140 : 80)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(24)}" font-weight="500"
        fill="${t.dim}" letter-spacing="6">firstlight.live</text>
</svg>`
}

function renderMissSvg(req: RenderRequest): string {
  const W = 1080
  const H = req.orientation === 'story' ? 1920 : 1080
  const day = req.chapterDay
  const charity = (req.payload.charity || 'Akshaya Patra').toUpperCase()

  // Orientation-aware layout (same approach as WIN)
  const isStory = req.orientation === 'story'
  const cy = isStory ? H * 0.45 : H / 2
  const s = isStory ? 1.3 : 1
  const fz = (n: number) => Math.round(n * s)
  const off = (n: number) => Math.round(n * (isStory ? 1.15 : 1))

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="halo" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="${COLORS.gold}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${COLORS.bg}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="day-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${COLORS.text}"/>
      <stop offset="100%" stop-color="${COLORS.gold}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${COLORS.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#halo)"/>

  <!-- Brand bar -->
  <text x="${W / 2}" y="${cy - off(360)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(28)}" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="6">◆ FIRST LIGHT</text>
  <text x="${W / 2}" y="${cy - off(310)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(20)}" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="6">CHAPTER 02 · ENDURANCE</text>

  <!-- Day number -->
  <text x="${W / 2}" y="${cy + off(80)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(day >= 100 ? 360 : 440)}" font-weight="700"
        fill="url(#day-grad)" letter-spacing="-8">${day}</text>

  <line x1="${W / 2 - 60}" y1="${cy + off(130)}" x2="${W / 2 + 60}" y2="${cy + off(130)}"
        stroke="${COLORS.gold}" stroke-width="3"/>

  <!-- Charity-led headline — Akshaya Patra's exact ₹1,500 sponsorship unit -->
  <text x="${W / 2}" y="${cy + off(195)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(38)}" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="2">1 CHILD · 1 SCHOOL YEAR</text>

  <!-- Sub-line: ~200 meals -->
  <text x="${W / 2}" y="${cy + off(245)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(22)}" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="3">200 MID-DAY MEALS SPONSORED</text>

  <!-- Charity name -->
  <text x="${W / 2}" y="${cy + off(300)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(24)}" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="4">${escapeXml(charity).toUpperCase()}</text>

  <!-- Quiet honesty line — no ₹ amount on image -->
  <text x="${W / 2}" y="${cy + off(355)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(20)}" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="3">BECAUSE I DIDN'T TRAIN</text>

  <!-- URL -->
  <text x="${W / 2}" y="${H - (isStory ? 140 : 80)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(24)}" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="6">firstlight.live</text>
</svg>`
}

// ─────────────────────────────────────────────────────────────────────────────
// WIN_ROUTE — GPS-verified route slide (slide 2 of the carousel)
// Strava-themed: orange polyline on near-black, glow, stats grid, GPS stamp.
// ─────────────────────────────────────────────────────────────────────────────
const STRAVA_ORANGE = '#FC4C02'

// Google polyline decoder — returns [lat, lng] array.
function decodePolyline(str: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0, lat = 0, lng = 0
  while (index < str.length) {
    let b: number, shift = 0, result = 0
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1)); lat += dlat
    shift = 0; result = 0
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1)); lng += dlng
    points.push([lat * 1e-5, lng * 1e-5])
  }
  return points
}

// Project lat/lng points to SVG coordinates fitted into a bounding box,
// preserving aspect ratio and orienting north-up (lower latitude = higher Y).
function projectPoints(points: [number, number][], boxX: number, boxY: number, boxW: number, boxH: number): { d: string } {
  if (points.length < 2) return { d: '' }
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const [la, ln] of points) {
    if (la < minLat) minLat = la; if (la > maxLat) maxLat = la
    if (ln < minLng) minLng = ln; if (ln > maxLng) maxLng = ln
  }
  const latSpan = Math.max(maxLat - minLat, 1e-6)
  const lngSpan = Math.max(maxLng - minLng, 1e-6)
  // Adjust for longitude squish at the latitude (Mercator-lite)
  const latMid = (minLat + maxLat) / 2
  const lngScale = Math.cos(latMid * Math.PI / 180)
  const dataAspect = (lngSpan * lngScale) / latSpan        // width/height in geo-units
  const boxAspect = boxW / boxH
  let drawW = boxW, drawH = boxH
  if (dataAspect > boxAspect) { drawH = boxW / dataAspect } else { drawW = boxH * dataAspect }
  const ox = boxX + (boxW - drawW) / 2
  const oy = boxY + (boxH - drawH) / 2
  const parts: string[] = []
  for (let i = 0; i < points.length; i++) {
    const [la, ln] = points[i]
    const x = ox + ((ln - minLng) * lngScale / (lngSpan * lngScale)) * drawW
    const y = oy + drawH - ((la - minLat) / latSpan) * drawH    // invert Y so north is up
    parts.push((i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1))
  }
  return { d: parts.join(' ') }
}

async function renderWinRouteSvg(req: RenderRequest, env: Env): Promise<string> {
  const W = 1080
  const H = req.orientation === 'story' ? 1920 : 1080
  const p = req.payload
  const day = req.chapterDay

  // Theme — defaults to strava (matches old route slide). Engine resolves the
  // bucket-mapped theme and threads it into the payload.
  const t = resolveTheme(req, 'strava')
  // Mapbox polyline color must be a 6-digit hex without "#" — derive once.
  const polyHex = t.accent.replace('#', '').slice(0, 6)

  // Stats
  const distStr = p.distanceKm ? `${p.distanceKm.toFixed(2)} KM` : '—'
  const durStr  = p.durationMin ? `${Math.round(p.durationMin)} MIN` : '—'
  const paceStr = (p.distanceKm && p.durationMin && p.distanceKm > 0)
    ? `${Math.floor(p.durationMin / p.distanceKm)}'${String(Math.round((p.durationMin / p.distanceKm % 1) * 60)).padStart(2, '0')}"/KM`
    : (p.pace || '—')
  const hrStr   = p.averageHr ? `${Math.round(p.averageHr)} BPM` : '—'
  const elevStr = (typeof p.elevationM === 'number') ? `${Math.round(p.elevationM)} M` : '—'
  const calStr  = (typeof p.caloriesKcal === 'number') ? `${Math.round(p.caloriesKcal)} KCAL` : '—'

  // Date stamp
  const dateIso = (p.activityDateIso || req.date).slice(0, 10)
  const dateLabel = _prettyDateLabel(dateIso)

  // ── Map area (top half of canvas) ──
  // Map size carefully sized so the bottom panel fits:
  //   activity name → date → stats row 1 → stats row 2 → Strava CTA → footer
  // without overlaps in either post (1080) or story (1920) heights.
  const MAP_X = 40, MAP_Y = 180
  const MAP_W = W - 80
  const MAP_H = req.orientation === 'story' ? 1040 : 510

  // Try to fetch a Mapbox basemap with the polyline drawn on it.
  // Fallback to dark+polyline if no token or fetch fails.
  // STORY orientation: skip Mapbox entirely — resvg-WASM CPU budget can't
  // rasterize 1080×1920 with an embedded base64 Mapbox PNG at @2x OR @1x.
  // The polyline-on-dark fallback below is fast, native SVG, and looks clean.
  let mapDataUrl: string | null = null
  if (req.orientation === 'post' && p.polyline && env.MAPBOX_TOKEN) {
    try {
      // Mapbox path overlay format: path-{stroke}+{rgb}-{opacity}(polyline)
      // We DOUBLE-encode the polyline so Mapbox's path parser sees the right chars.
      const encodedPoly = encodeURIComponent(p.polyline)
      // dark-v11 has neutral greys; we draw the theme-accent polyline on top.
      const path = `path-6+${polyHex}(${encodedPoly})`
      // auto-fit zoom with 60px padding. @2x for post (sharper square thumb),
      // @1x for story (1080x1920 canvas + @2x = CPU timeout in resvg-WASM).
      const retina = req.orientation === 'story' ? '' : '@2x'
      const url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${path}/auto/${Math.round(MAP_W)}x${Math.round(MAP_H)}${retina}?access_token=${env.MAPBOX_TOKEN}&padding=60&logo=false&attribution=false`
      const r = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit)
      if (r.ok) {
        const buf = await r.arrayBuffer()
        const b64 = arrayBufferToBase64(buf)
        mapDataUrl = `data:image/png;base64,${b64}`
      }
    } catch (_e) { /* fallback to polyline-on-dark */ }
  }

  // Fallback: render polyline on dark if Mapbox missing
  let fallbackPath = ''
  if (!mapDataUrl && p.polyline) {
    const points = decodePolyline(p.polyline)
    const proj = projectPoints(points, MAP_X + 40, MAP_Y + 40, MAP_W - 80, MAP_H - 80)
    fallbackPath = proj.d
  }

  // ── Stats panel (bottom 30%) ──
  // Vertical rhythm (post mode, panel = 1080 - 700 = 380px tall):
  //   PANEL_Y       → solid black band starts
  //   PANEL_Y + 50  → activity name (MORNING RUN)
  //   PANEL_Y + 80  → date · type
  //   PANEL_Y + 170 → stats row 1 (+26px label)
  //   PANEL_Y + 250 → stats row 2 (+26px label)
  //   H - 60        → VIEW ON STRAVA → (44px gap from row 2 label)
  //   H - 22        → footer firstlight.live
  const PANEL_Y = req.orientation === 'story' ? 1240 : 700
  const colX = [W * 0.18, W * 0.50, W * 0.82]
  const rowY1 = PANEL_Y + 170
  const rowY2 = PANEL_Y + 250
  void elevStr  // elevation removed from layout per user feedback (overlapped CTA)
  const stats = [
    { label: 'DISTANCE', value: distStr },
    { label: 'TIME',     value: durStr  },
    { label: 'AVG PACE', value: paceStr },
    { label: 'AVG HR',   value: hrStr   },
    { label: 'CALORIES', value: calStr  },
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="dim-top" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="dim-bot" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="1"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Base: themed background -->
  <rect width="${W}" height="${H}" fill="${t.bg}"/>

  <!-- Map area: either Mapbox image, or fallback polyline-on-dark -->
  ${mapDataUrl ? `
  <image x="${MAP_X}" y="${MAP_Y}" width="${MAP_W}" height="${MAP_H}" href="${mapDataUrl}" preserveAspectRatio="xMidYMid slice"/>
  <!-- Subtle vignette at top + bottom of map for header/stats readability -->
  <rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_W}" height="120" fill="url(#dim-top)"/>
  <rect x="${MAP_X}" y="${MAP_Y + MAP_H - 80}" width="${MAP_W}" height="80" fill="url(#dim-bot)"/>
  ` : (fallbackPath ? `
  <rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_W}" height="${MAP_H}" fill="#0A0A0A"/>
  ${req.orientation === 'story' ? `
  <path d="${fallbackPath}" fill="none" stroke="${t.accent}" stroke-width="14" stroke-opacity="0.20" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${fallbackPath}" fill="none" stroke="${t.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` : `
  <path d="${fallbackPath}" fill="none" stroke="${t.accent}" stroke-width="12" stroke-opacity="0.35" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
  <path d="${fallbackPath}" fill="none" stroke="${t.accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`}
  ` : `
  <text x="${W / 2}" y="${MAP_Y + MAP_H / 2}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="22" fill="${t.dim}">No GPS trace available</text>
  `)}

  <!-- Header (top, over dim vignette) -->
  <text x="${W / 2}" y="100" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 32 : 26}" font-weight="700"
        fill="${t.accent}" letter-spacing="6">GPS VERIFIED</text>
  <text x="${W / 2}" y="${req.orientation === 'story' ? 150 : 138}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 22 : 18}" font-weight="500"
        fill="${t.dim}" letter-spacing="4">CHAPTER 02 · ENDURANCE · DAY ${day}</text>

  <!-- Stats panel — solid black band -->
  <rect x="0" y="${PANEL_Y}" width="${W}" height="${H - PANEL_Y}" fill="#000000"/>

  <!-- Activity name + date inside panel -->
  <text x="${W / 2}" y="${PANEL_Y + 50}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 30 : 24}" font-weight="700"
        fill="${t.text}" letter-spacing="2">${escapeXml((p.activityName || 'Activity').toUpperCase())}</text>
  <text x="${W / 2}" y="${PANEL_Y + 82}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 16 : 13}" font-weight="500"
        fill="${t.dim}" letter-spacing="3">${escapeXml(dateLabel)}  ·  ${escapeXml((p.activityType || 'RUN').toUpperCase())}</text>

  <!-- Stats grid — 3 in row 1 (distance / time / pace), 2 in row 2 outer cols (HR / calories) -->
  ${stats.map((s, i) => {
    let cx: number, cy: number
    if (i < 3) {
      cx = colX[i]
      cy = rowY1
    } else {
      // Row 2 — outer columns only, middle column intentionally left empty
      cx = i === 3 ? colX[0] : colX[2]
      cy = rowY2
    }
    return `
  <text x="${cx}" y="${cy}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 30 : 26}" font-weight="700" fill="${t.text}" letter-spacing="1">${escapeXml(s.value)}</text>
  <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 14 : 11}" font-weight="500" fill="${t.accent}" letter-spacing="3">${escapeXml(s.label)}</text>
    `
  }).join('')}

  <!-- VIEW ON STRAVA CTA — text + SVG polygon arrow (Roboto Mono lacks → glyph) -->
  ${(() => {
    const isStory = req.orientation === 'story'
    const fontSize = isStory ? 22 : 16
    const textShift = isStory ? -30 : -20      // shift text left to make room for arrow
    const arrowOffsetX = isStory ? 130 : 95    // arrow base distance from horizontal center
    const arrowSize = isStory ? 16 : 11        // triangle half-size
    const baseX = W / 2 + arrowOffsetX
    const tipX = baseX + arrowSize
    const ctaY = H - 60
    return `
  <text x="${W / 2 + textShift}" y="${ctaY}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fontSize}" font-weight="700"
        fill="${t.accent}" letter-spacing="6">VIEW ON STRAVA</text>
  <polygon points="${baseX},${ctaY - arrowSize + 2} ${tipX},${ctaY - 4} ${baseX},${ctaY + 2}" fill="${t.accent}"/>`
  })()}

  <!-- Footer brand -->
  <text x="${W / 2}" y="${H - 22}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 16 : 12}" font-weight="500"
        fill="${t.dim}" letter-spacing="5">◆ FIRST LIGHT  ·  firstlight.live</text>
</svg>`
}

// Base64 encoder for the Mapbox PNG bytes
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  // btoa is available in Workers runtime
  return btoa(binary)
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY RECAP — 7-slide carousel published on the 1st of each month
// Slides: 1) Cover/Hero  2) Calendar Heatmap  3) Total KM  4) Sport Bars
//         5) Time & Effort  6) Charity Impact  7) Closing CTA
// ─────────────────────────────────────────────────────────────────────────────

function renderMonthlyRecapSvg(req: RenderRequest): string {
  const slide = req.payload.monthlySlide || 1
  const m = req.payload.monthly
  if (!m) {
    // Fallback empty slate
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080"><rect width="1080" height="1080" fill="#000"/><text x="540" y="540" text-anchor="middle" font-family="'Roboto Mono'" font-size="32" fill="#5A6B80">Monthly recap data not provided</text></svg>`
  }
  switch (slide) {
    case 1: return _recapSlide1Cover(req, m)
    case 2: return _recapSlide2Heatmap(req, m)
    case 3: return _recapSlide3TotalKm(req, m)
    case 4: return _recapSlide4SportBars(req, m)
    case 5: return _recapSlide5TimeEffort(req, m)
    case 6: return _recapSlide6CharityImpact(req, m)
    case 7: return _recapSlide7Closing(req, m)
    default: return _recapSlide1Cover(req, m)
  }
}

const W_REC = 1080
const H_REC = 1080

function _recapBg(extra: string = ''): string {
  return `
  <defs>
    <radialGradient id="halo" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#00D4FF" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${COLORS.bg}" stop-opacity="0"/>
    </radialGradient>
    ${extra}
  </defs>
  <rect width="${W_REC}" height="${H_REC}" fill="${COLORS.bg}"/>
  <rect width="${W_REC}" height="${H_REC}" fill="url(#halo)"/>`
}

function _recapHeader(monthLabel: string, slideLabel: string): string {
  return `
  <text x="${W_REC / 2}" y="100" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="28" font-weight="700"
        fill="${COLORS.cyan}" letter-spacing="6">${escapeXml(monthLabel)}</text>
  <text x="${W_REC / 2}" y="138" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="18" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="4">CHAPTER 02 · ENDURANCE · ${escapeXml(slideLabel)}</text>`
}

function _recapFooter(): string {
  return `
  <text x="${W_REC / 2}" y="${H_REC - 50}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="18" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="5">◆ FIRST LIGHT  ·  firstlight.live</text>`
}

// SLIDE 1 — Cover/Hero
function _recapSlide1Cover(_req: RenderRequest, m: MonthlyRecapPayload): string {
  const heroPct = m.daysInWindow > 0 ? Math.round((m.hitDays / m.daysInWindow) * 100) : 0
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W_REC} ${H_REC}" width="${W_REC}" height="${H_REC}">
  ${_recapBg(`<linearGradient id="big" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${COLORS.text}"/><stop offset="100%" stop-color="${COLORS.cyan}"/></linearGradient>`)}

  <text x="${W_REC / 2}" y="160" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="32" font-weight="700"
        fill="${COLORS.cyan}" letter-spacing="8">◆ FIRST LIGHT</text>
  <text x="${W_REC / 2}" y="210" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="20" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="6">CHAPTER 02 · ENDURANCE</text>

  <text x="${W_REC / 2}" y="340" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="42" font-weight="700"
        fill="${COLORS.text}" letter-spacing="6">${escapeXml(m.monthLabel)}</text>
  <text x="${W_REC / 2}" y="380" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="6">MONTH ${m.monthIndex} RECAP</text>

  <text x="${W_REC / 2}" y="630" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="260" font-weight="700"
        fill="url(#big)" letter-spacing="-6">${m.hitDays}</text>
  <text x="${W_REC / 2}" y="700" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="40" font-weight="700"
        fill="${COLORS.text}" letter-spacing="4">/ ${m.daysInWindow}  DAYS HELD</text>
  <text x="${W_REC / 2}" y="750" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="4">${heroPct}% · ${m.missDays} MISSED · ${m.uniqueSports} SPORTS</text>

  <text x="${W_REC / 2}" y="870" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="24" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="4">SWIPE →</text>

  ${_recapFooter()}
</svg>`
}

// SLIDE 2 — Calendar Heatmap
function _recapSlide2Heatmap(_req: RenderRequest, m: MonthlyRecapPayload): string {
  // Build a 7-col grid of 30/31 days. Cell size auto-sized.
  const days = m.dayResults
  const cols = 7
  const rows = Math.ceil(days.length / cols)
  const gridArea = { x: 100, y: 240, w: W_REC - 200, h: 580 }
  const cellGap = 14
  const cellW = (gridArea.w - (cols - 1) * cellGap) / cols
  const cellH = Math.min(cellW, (gridArea.h - (rows - 1) * cellGap) / rows)
  const colorFor = (s: string) =>
    s === 'WIN'         ? '#00E676' :
    s === 'MISS_PAID'   ? '#F5A623' :
    s === 'MISS_PENDING'? '#FF5252' :
    s === 'FUTURE'      ? 'rgba(255,255,255,0.04)' :
                          'rgba(255,255,255,0.02)'  // PRE_CHAPTER
  const opacityFor = (s: string) => (s === 'PRE_CHAPTER' || s === 'FUTURE') ? 0.4 : 1
  const cells = days.map((d, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = gridArea.x + col * (cellW + cellGap)
    const y = gridArea.y + row * (cellH + cellGap)
    return `
  <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="6" fill="${colorFor(d.status)}" opacity="${opacityFor(d.status)}"/>
  <text x="${x + cellW/2}" y="${y + cellH/2 + 8}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${Math.round(cellW * 0.28)}" font-weight="700" fill="${d.status === 'PRE_CHAPTER' || d.status === 'FUTURE' ? COLORS.dim : '#000000'}" opacity="${opacityFor(d.status)}">${d.day}</text>`
  }).join('')

  const monthShort = m.monthShort
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W_REC} ${H_REC}" width="${W_REC}" height="${H_REC}">
  ${_recapBg()}
  ${_recapHeader(m.monthLabel, 'CALENDAR HEATMAP')}

  <text x="${W_REC / 2}" y="200" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="28" font-weight="700"
        fill="${COLORS.text}" letter-spacing="3">${monthShort} · ${m.hitDays}/${m.daysInWindow} DAYS</text>

  ${cells}

  <!-- Legend -->
  <g transform="translate(${W_REC / 2 - 280}, 880)">
    <rect x="0"   y="0" width="18" height="18" rx="4" fill="#00E676"/>
    <text x="28"  y="14" font-family="'Roboto Mono', monospace" font-size="14" font-weight="500" fill="${COLORS.text}" letter-spacing="2">HIT</text>
    <rect x="80"  y="0" width="18" height="18" rx="4" fill="#F5A623"/>
    <text x="108" y="14" font-family="'Roboto Mono', monospace" font-size="14" font-weight="500" fill="${COLORS.text}" letter-spacing="2">MISS · PAID</text>
    <rect x="240" y="0" width="18" height="18" rx="4" fill="#FF5252"/>
    <text x="268" y="14" font-family="'Roboto Mono', monospace" font-size="14" font-weight="500" fill="${COLORS.text}" letter-spacing="2">MISS · PENDING</text>
  </g>

  ${_recapFooter()}
</svg>`
}

// SLIDE 3 — Total KM
function _recapSlide3TotalKm(_req: RenderRequest, m: MonthlyRecapPayload): string {
  const sportsRow = m.sportBreakdown
    .filter(s => s.km > 0 || s.minutes > 0)
    .map(s => s.label)
    .slice(0, 5)
    .join('  ·  ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W_REC} ${H_REC}" width="${W_REC}" height="${H_REC}">
  ${_recapBg(`<linearGradient id="km" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${COLORS.text}"/><stop offset="100%" stop-color="${COLORS.cyan}"/></linearGradient>`)}
  ${_recapHeader(m.monthLabel, 'DISTANCE')}

  <text x="${W_REC / 2}" y="280" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="6">TOTAL DISTANCE</text>

  <text x="${W_REC / 2}" y="560" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="240" font-weight="700"
        fill="url(#km)" letter-spacing="-4">${m.totalKm.toFixed(1)}</text>
  <text x="${W_REC / 2}" y="630" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="48" font-weight="700"
        fill="${COLORS.text}" letter-spacing="6">KILOMETRES</text>

  <text x="${W_REC / 2}" y="780" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="4">ACROSS ${m.uniqueSports} DISCIPLINES</text>
  <text x="${W_REC / 2}" y="820" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="20" font-weight="700"
        fill="${COLORS.cyan}" letter-spacing="3">${escapeXml(sportsRow)}</text>

  <text x="${W_REC / 2}" y="900" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="20" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="3">AVG ${m.avgPerDay.km.toFixed(1)} KM / DAY</text>

  ${_recapFooter()}
</svg>`
}

// SLIDE 4 — Sport bars (km per sport)
function _recapSlide4SportBars(_req: RenderRequest, m: MonthlyRecapPayload): string {
  const sports = m.sportBreakdown.filter(s => s.km > 0 || s.minutes > 0).sort((a, b) => (b.km + b.minutes / 10) - (a.km + a.minutes / 10))
  const maxVal = Math.max(...sports.map(s => s.km + s.minutes / 10), 1)
  const chartX = 80, labelW = 160, valueW = 130
  const chartW = W_REC - 160
  const barAreaX = chartX + labelW
  const barAreaW = chartW - labelW - valueW
  const barH = 64
  const barGap = 20
  const startY = 280
  const bars = sports.map((s, i) => {
    const y = startY + i * (barH + barGap)
    const v = s.km + s.minutes / 10
    const w = Math.max(20, (v / maxVal) * barAreaW)
    const display = s.km > 0 ? `${s.km.toFixed(1)} KM` : `${Math.round(s.minutes)} MIN`
    return `
  <text x="${chartX}" y="${y + barH * 0.65}" font-family="'Roboto Mono', monospace" font-size="26" font-weight="700" fill="${s.color}" letter-spacing="3">${s.label}</text>
  <rect x="${barAreaX}" y="${y}" width="${barAreaW}" height="${barH}" rx="8" fill="rgba(255,255,255,0.04)"/>
  <rect x="${barAreaX}" y="${y}" width="${w}" height="${barH}" rx="8" fill="${s.color}" fill-opacity="0.85"/>
  <text x="${W_REC - 80}" y="${y + barH * 0.65}" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="22" font-weight="700" fill="${COLORS.text}" letter-spacing="1">${display}</text>
  <text x="${W_REC - 80}" y="${y + barH * 0.65 + 22}" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="13" font-weight="500" fill="${COLORS.dim}" letter-spacing="2">${s.count} SESSION${s.count === 1 ? '' : 'S'}</text>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W_REC} ${H_REC}" width="${W_REC}" height="${H_REC}">
  ${_recapBg()}
  ${_recapHeader(m.monthLabel, 'SPORT SPLIT')}

  ${bars}

  ${_recapFooter()}
</svg>`
}

// SLIDE 5 — Time & effort
function _recapSlide5TimeEffort(_req: RenderRequest, m: MonthlyRecapPayload): string {
  const h = Math.floor(m.totalMin / 60)
  const mm = m.totalMin % 60
  const timeStr = h > 0 ? `${h}h ${mm}m` : `${mm}m`
  const longest = m.longestActivity
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W_REC} ${H_REC}" width="${W_REC}" height="${H_REC}">
  ${_recapBg()}
  ${_recapHeader(m.monthLabel, 'TIME & EFFORT')}

  <!-- Three big stat cards -->
  <g transform="translate(40, 240)">
    <rect x="0" y="0" width="${W_REC - 80}" height="200" rx="14" fill="rgba(0,212,255,0.05)" stroke="rgba(0,212,255,0.25)" stroke-width="2"/>
    <text x="50" y="60" font-family="'Roboto Mono', monospace" font-size="18" font-weight="700" fill="${COLORS.cyan}" letter-spacing="4">TOTAL TIME</text>
    <text x="50" y="160" font-family="'Roboto Mono', monospace" font-size="96" font-weight="700" fill="${COLORS.text}" letter-spacing="2">${timeStr}</text>
    <text x="${W_REC - 130}" y="160" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="22" font-weight="500" fill="${COLORS.dim}" letter-spacing="3">AVG ${m.avgPerDay.min} MIN/DAY</text>
  </g>

  <g transform="translate(40, 470)">
    <rect x="0" y="0" width="${W_REC - 80}" height="200" rx="14" fill="rgba(0,230,118,0.04)" stroke="rgba(0,230,118,0.2)" stroke-width="2"/>
    <text x="50" y="60" font-family="'Roboto Mono', monospace" font-size="18" font-weight="700" fill="#00E676" letter-spacing="4">TOTAL CALORIES</text>
    <text x="50" y="160" font-family="'Roboto Mono', monospace" font-size="96" font-weight="700" fill="${COLORS.text}" letter-spacing="2">${m.totalKcal.toLocaleString('en-IN')}</text>
    <text x="${W_REC - 130}" y="160" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="22" font-weight="500" fill="${COLORS.dim}" letter-spacing="3">KCAL</text>
  </g>

  ${longest ? `
  <g transform="translate(40, 700)">
    <rect x="0" y="0" width="${W_REC - 80}" height="180" rx="14" fill="rgba(245,166,35,0.04)" stroke="rgba(245,166,35,0.2)" stroke-width="2"/>
    <text x="50" y="48" font-family="'Roboto Mono', monospace" font-size="18" font-weight="700" fill="${COLORS.gold}" letter-spacing="4">LONGEST · ${escapeXml(longest.type.toUpperCase())}</text>
    <text x="50" y="128" font-family="'Roboto Mono', monospace" font-size="56" font-weight="700" fill="${COLORS.text}" letter-spacing="2">${longest.km > 0 ? longest.km.toFixed(1) + ' KM' : Math.round(longest.minutes) + ' MIN'}</text>
    <text x="${W_REC - 130}" y="128" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="20" font-weight="500" fill="${COLORS.dim}" letter-spacing="2">${escapeXml(longest.name).slice(0, 32)}</text>
  </g>` : ''}

  ${_recapFooter()}
</svg>`
}

// SLIDE 6 — Charity impact (the unique angle — failure = funded)
function _recapSlide6CharityImpact(_req: RenderRequest, m: MonthlyRecapPayload): string {
  const noMisses = m.donatedTotal === 0
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W_REC} ${H_REC}" width="${W_REC}" height="${H_REC}">
  ${_recapBg(`<linearGradient id="gold-grad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${COLORS.text}"/><stop offset="100%" stop-color="${COLORS.gold}"/></linearGradient>`)}
  ${_recapHeader(m.monthLabel, 'IMPACT')}

  ${noMisses ? `
  <text x="${W_REC / 2}" y="380" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="32" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="5">ZERO MISSES</text>
  <text x="${W_REC / 2}" y="580" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="280" font-weight="700"
        fill="url(#gold-grad)" letter-spacing="-4">0</text>
  <text x="${W_REC / 2}" y="700" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="32" font-weight="700"
        fill="${COLORS.text}" letter-spacing="3">RUPEES OWED</text>
  <text x="${W_REC / 2}" y="770" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="3">THE STREAK HELD ALL MONTH</text>
  ` : `
  <text x="${W_REC / 2}" y="320" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="4">${m.missDays} MISS${m.missDays === 1 ? '' : 'ES'} → DONATED</text>

  <text x="${W_REC / 2}" y="540" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="220" font-weight="700"
        fill="url(#gold-grad)" letter-spacing="-4">${m.childrenFedYears}</text>
  <text x="${W_REC / 2}" y="610" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="34" font-weight="700"
        fill="${COLORS.text}" letter-spacing="3">CHILD${m.childrenFedYears === 1 ? '' : 'REN'} · 1 SCHOOL YEAR</text>
  <text x="${W_REC / 2}" y="660" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="3">AKSHAYA PATRA · 200 MEALS EACH</text>

  <text x="${W_REC / 2}" y="800" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="28" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="3">Rs ${m.donatedTotal.toLocaleString('en-IN')} · PAID</text>
  <text x="${W_REC / 2}" y="850" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="20" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="3">MISS COST CONVERTED INTO MEALS</text>
  `}

  ${_recapFooter()}
</svg>`
}

// SLIDE 7 — Closing CTA
function _recapSlide7Closing(_req: RenderRequest, m: MonthlyRecapPayload): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W_REC} ${H_REC}" width="${W_REC}" height="${H_REC}">
  ${_recapBg(`<linearGradient id="next" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${COLORS.text}"/><stop offset="100%" stop-color="${COLORS.cyan}"/></linearGradient>`)}

  <text x="${W_REC / 2}" y="200" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="32" font-weight="700"
        fill="${COLORS.cyan}" letter-spacing="8">◆ FIRST LIGHT</text>
  <text x="${W_REC / 2}" y="250" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="20" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="6">CHAPTER 02 · ENDURANCE</text>

  <text x="${W_REC / 2}" y="450" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="42" font-weight="700"
        fill="${COLORS.text}" letter-spacing="6">MONTH ${m.monthIndex} · COMPLETE</text>

  <text x="${W_REC / 2}" y="660" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="120" font-weight="700"
        fill="url(#next)" letter-spacing="-2">MONTH ${m.monthIndex + 1}</text>
  <text x="${W_REC / 2}" y="730" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="32" font-weight="700"
        fill="${COLORS.text}" letter-spacing="4">LOADING ·  TOMORROW</text>

  <text x="${W_REC / 2}" y="840" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="24" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="5">5 AM · NO NEGOTIATIONS</text>

  ${_recapFooter()}
</svg>`
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAPTER 02 KICK-OFF CAROUSEL — 3 slides
// HERO · PROMISE · RULES  with India tricolor accent
// ─────────────────────────────────────────────────────────────────────────────

const SAFFRON = '#FF9933'
const INDIA_WHITE = '#FFFFFF'
const INDIA_GREEN = '#138808'
const AKSHAYA_SAFFRON = '#F26522'

// Tricolor band: 3 stacked thin rounded rectangles, centered horizontally.
function _tricolorBand(cx: number, cy: number, w = 300, h = 6, gap = 4): string {
  const bandW = (w - gap * 2) / 3
  const x0 = cx - w / 2
  return `
  <g transform="translate(0, ${cy})">
    <rect x="${x0}"                            y="0" width="${bandW}" height="${h}" rx="3" fill="${SAFFRON}"/>
    <rect x="${x0 + bandW + gap}"              y="0" width="${bandW}" height="${h}" rx="3" fill="${INDIA_WHITE}"/>
    <rect x="${x0 + 2 * (bandW + gap)}"        y="0" width="${bandW}" height="${h}" rx="3" fill="${INDIA_GREEN}"/>
  </g>`
}

function _kickoffBg(extra: string = ''): string {
  return `
  <defs>
    <radialGradient id="halo" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#00D4FF" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${COLORS.bg}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo2" cx="50%" cy="80%" r="55%">
      <stop offset="0%" stop-color="${SAFFRON}" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="${COLORS.bg}" stop-opacity="0"/>
    </radialGradient>
    ${extra}
  </defs>
  <rect width="1080" height="1080" fill="${COLORS.bg}"/>
  <rect width="1080" height="1080" fill="url(#halo)"/>
  <rect width="1080" height="1080" fill="url(#halo2)"/>`
}

function _kickoffFooter(text = '◆ FIRST LIGHT  ·  firstlight.live'): string {
  return `
  <text x="540" y="1030" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="18" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="5">${escapeXml(text)}</text>`
}

// ── SLIDE 1 · HERO ── "DAY 01 BEGINS NOW"
function renderKickoffHeroSvg(_req: RenderRequest): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  ${_kickoffBg(`<linearGradient id="hero" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${COLORS.text}"/><stop offset="100%" stop-color="${COLORS.cyan}"/></linearGradient>`)}

  <!-- Brand header -->
  <text x="540" y="135" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="30" font-weight="700"
        fill="${COLORS.cyan}" letter-spacing="8">◆ FIRST LIGHT</text>

  <!-- Tricolor band -->
  ${_tricolorBand(540, 175, 320, 8, 6)}

  <!-- DAY 01 hero -->
  <text x="540" y="540" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="240" font-weight="700"
        fill="url(#hero)" letter-spacing="6">DAY 01</text>

  <!-- BEGINS NOW -->
  <text x="540" y="640" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="56" font-weight="700"
        fill="${COLORS.text}" letter-spacing="10">BEGINS NOW</text>

  <!-- Chapter subtitle -->
  <text x="540" y="780" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="6">CHAPTER 02  ·  ENDURANCE</text>

  <!-- Swipe prompt -->
  <text x="540" y="900" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="26" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="6">SWIPE  →</text>

  ${_kickoffFooter('firstlight.live')}
</svg>`
}

// ── SLIDE 2 · PROMISE ── "for every day i don't move, 1 indian child eats for 1 full school year"
function renderKickoffPromiseSvg(_req: RenderRequest): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  ${_kickoffBg()}

  <!-- Brand header -->
  <text x="540" y="100" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="24" font-weight="700"
        fill="${COLORS.cyan}" letter-spacing="6">◆ FIRST LIGHT</text>

  <!-- Tricolor band -->
  ${_tricolorBand(540, 140, 280, 7, 5)}

  <!-- The promise — top stanza -->
  <text x="540" y="290" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="38" font-weight="500"
        fill="${COLORS.text}" letter-spacing="3">FOR EVERY DAY</text>
  <text x="540" y="345" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="38" font-weight="500"
        fill="${COLORS.text}" letter-spacing="3">I DON'T MOVE,</text>

  <!-- Middle stanza — emphasis -->
  <text x="540" y="475" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="52" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="4">1 INDIAN CHILD</text>
  <text x="540" y="540" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="38" font-weight="500"
        fill="${COLORS.text}" letter-spacing="3">EATS FOR</text>
  <text x="540" y="610" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="52" font-weight="700"
        fill="${COLORS.text}" letter-spacing="4">1 FULL SCHOOL YEAR</text>

  <!-- The cost — bottom stanza -->
  <text x="540" y="800" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="120" font-weight="700"
        fill="${AKSHAYA_SAFFRON}" letter-spacing="2">Rs 1,500</text>
  <text x="540" y="870" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="28" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="8">AKSHAYA  PATRA</text>

  ${_kickoffFooter('firstlight.live')}
</svg>`
}

// ── SLIDE 3 · RULES ── menu + weekly target + miss penalty
function renderKickoffMenuSvg(_req: RenderRequest): string {
  const menu = [
    '5 KM   WALK',
    '5 KM   RUN',
    '10 KM  CYCLE',
    '1 KM   SWIM',
    '30 MIN BOXING / YOGA / GYM'
  ]
  const menuY = 290
  const lineH = 52
  const menuItems = menu.map((item, i) => `
  <text x="200" y="${menuY + i * lineH}"
        font-family="'Roboto Mono', monospace" font-size="26" font-weight="700"
        fill="${COLORS.cyan}" letter-spacing="2">•</text>
  <text x="240" y="${menuY + i * lineH}"
        font-family="'Roboto Mono', monospace" font-size="26" font-weight="700"
        fill="${COLORS.text}" letter-spacing="3">${item}</text>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  ${_kickoffBg()}

  <!-- Title -->
  <text x="540" y="115" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="34" font-weight="700"
        fill="${COLORS.cyan}" letter-spacing="10">THE RULES</text>

  <!-- Tricolor band -->
  ${_tricolorBand(540, 155, 280, 7, 5)}

  <!-- DAILY section -->
  <text x="200" y="235"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="6">DAILY</text>
  <line x1="320" y1="226" x2="880" y2="226" stroke="${COLORS.gold}" stroke-opacity="0.25" stroke-width="1"/>
  ${menuItems}
  <text x="200" y="${menuY + 5 * lineH + 16}"
        font-family="'Roboto Mono', monospace" font-size="16" font-weight="500" font-style="italic"
        fill="${COLORS.dim}" letter-spacing="2">one of these — every day</text>

  <!-- WEEKLY section -->
  <text x="200" y="690"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="700"
        fill="${COLORS.gold}" letter-spacing="6">WEEKLY</text>
  <line x1="340" y1="681" x2="880" y2="681" stroke="${COLORS.gold}" stroke-opacity="0.25" stroke-width="1"/>
  <text x="200" y="745"
        font-family="'Roboto Mono', monospace" font-size="26" font-weight="700"
        fill="${COLORS.cyan}" letter-spacing="2">•</text>
  <text x="240" y="745"
        font-family="'Roboto Mono', monospace" font-size="26" font-weight="700"
        fill="${COLORS.text}" letter-spacing="3">100 KM  TOTAL</text>

  <!-- MISS section -->
  <text x="200" y="830"
        font-family="'Roboto Mono', monospace" font-size="22" font-weight="700"
        fill="#FF5252" letter-spacing="6">MISS — daily OR weekly</text>
  <line x1="690" y1="821" x2="880" y2="821" stroke="#FF5252" stroke-opacity="0.25" stroke-width="1"/>
  <text x="200" y="890"
        font-family="'Roboto Mono', monospace" font-size="28" font-weight="700"
        fill="${AKSHAYA_SAFFRON}" letter-spacing="2">•  Rs 1,500</text>
  <text x="380" y="890"
        font-family="'Roboto Mono', monospace" font-size="28" font-weight="700"
        fill="${COLORS.text}" letter-spacing="3">→ AKSHAYA PATRA</text>

  <!-- Tricolor band bottom -->
  ${_tricolorBand(540, 960, 220, 6, 4)}

  <!-- Location + date -->
  <text x="540" y="1000" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="16" font-weight="500"
        fill="${COLORS.dim}" letter-spacing="5">BENGALURU  ·  20.06.2026</text>

  ${_kickoffFooter('firstlight.live')}
</svg>`
}

function _prettyDateLabel(iso: string): string {
  // '2026-06-18' → 'JUN 18 · 2026'
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const [y, m, d] = iso.split('-')
  const mi = parseInt(m, 10) - 1
  return `${months[mi] || m} ${parseInt(d, 10)} · ${y}`
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-ACTIVITY (Stack Day) — 3 slides shown for days with 2+ qualifying activities
// ─────────────────────────────────────────────────────────────────────────────

// Color mapping per sport bucket — used in the multi-route map and grid icons.
const BUCKET_COLOR: Record<string, string> = {
  run:       '#FC4C02',  // Strava orange
  walk:      '#F5A623',  // gold
  cycle:     '#00D4FF',  // cyan
  swim:      '#93C5FD',  // light blue
  hrSession: '#00E676',  // green
}
const BUCKET_LABEL: Record<string, string> = {
  run: 'RUN',
  walk: 'WALK',
  cycle: 'CYCLE',
  swim: 'SWIM',
  hrSession: 'HR',
}

// SLIDE 1 — Hero: "DAY N · M ACTIVITIES" + sport row + combined stats
function renderMultiHeroSvg(req: RenderRequest): string {
  const W = 1080
  const H = req.orientation === 'story' ? 1920 : 1080
  const p = req.payload
  const day = req.chapterDay
  const activities = p.activities || []
  const n = activities.length
  // Stack day signature theme — NEON (magenta + cyan) wraps the slide.
  // Per-activity chips/colors keep their bucket identity (BUCKET_COLOR).
  const t = resolveTheme(req, 'neon')

  const totalKm   = (p.totalKm   ?? activities.reduce((s, a) => s + (a.distanceKm || 0), 0)).toFixed(1)
  const totalMin  = Math.round(p.totalMin ?? activities.reduce((s, a) => s + (a.durationMin || 0), 0))
  const totalKcal = Math.round(p.totalKcal ?? activities.reduce((s, a) => s + (a.caloriesKcal || 0), 0))

  // Time formatted as Hh Mm
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`

  const isStory = req.orientation === 'story'
  const cy = isStory ? H * 0.45 : H / 2
  const s = isStory ? 1.3 : 1
  const fz = (v: number) => Math.round(v * s)
  const off = (v: number) => Math.round(v * (isStory ? 1.15 : 1))

  // Sport row chips
  const chipW = 130
  const chipGap = 18
  const rowWidth = activities.length * chipW + (activities.length - 1) * chipGap
  const rowStartX = (W - rowWidth) / 2
  const chips = activities.map((a, i) => {
    const cx = rowStartX + i * (chipW + chipGap) + chipW / 2
    const color = BUCKET_COLOR[a.bucket] || '#FFFFFF'
    const label = BUCKET_LABEL[a.bucket] || a.type.toUpperCase().slice(0, 4)
    return `
  <g transform="translate(${cx},${cy + off(165)})">
    <rect x="${-chipW/2}" y="0" width="${chipW}" height="56" rx="28" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="2"/>
    <text x="0" y="37" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${fz(20)}" font-weight="700" fill="${color}" letter-spacing="2">${label}</text>
  </g>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="halo" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="${t.halo}"/>
      <stop offset="100%" stop-color="${t.bg}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="day-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${t.accent2}"/>
      <stop offset="100%" stop-color="${t.accent}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#halo)"/>

  <!-- Brand bar -->
  <text x="${W / 2}" y="${cy - off(360)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(28)}" font-weight="700"
        fill="${t.accent}" letter-spacing="6">◆ FIRST LIGHT</text>
  <text x="${W / 2}" y="${cy - off(310)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(20)}" font-weight="500"
        fill="${t.dim}" letter-spacing="6">CHAPTER 02 · ENDURANCE · STACK DAY</text>

  <!-- Day number -->
  <text x="${W / 2}" y="${cy + off(60)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(day >= 100 ? 280 : 360)}" font-weight="700"
        fill="url(#day-grad)" letter-spacing="-8">${day}</text>

  <!-- Activity count -->
  <text x="${W / 2}" y="${cy + off(120)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(36)}" font-weight="700"
        fill="${t.text}" letter-spacing="4">${n} ACTIVITIES</text>

  <!-- Sport chips row -->
  ${chips}

  <!-- Combined stats row -->
  <text x="${W * 0.20}" y="${cy + off(290)}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${fz(32)}" font-weight="700" fill="${t.text}" letter-spacing="1">${totalKm} KM</text>
  <text x="${W * 0.20}" y="${cy + off(325)}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${fz(14)}" font-weight="500" fill="${t.dim}" letter-spacing="3">DISTANCE</text>

  <text x="${W * 0.50}" y="${cy + off(290)}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${fz(32)}" font-weight="700" fill="${t.text}" letter-spacing="1">${timeStr}</text>
  <text x="${W * 0.50}" y="${cy + off(325)}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${fz(14)}" font-weight="500" fill="${t.dim}" letter-spacing="3">TIME</text>

  <text x="${W * 0.80}" y="${cy + off(290)}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${fz(32)}" font-weight="700" fill="${t.text}" letter-spacing="1">${totalKcal}</text>
  <text x="${W * 0.80}" y="${cy + off(325)}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${fz(14)}" font-weight="500" fill="${t.dim}" letter-spacing="3">KCAL</text>

  <!-- URL -->
  <text x="${W / 2}" y="${H - (isStory ? 140 : 80)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${fz(24)}" font-weight="500"
        fill="${t.dim}" letter-spacing="6">firstlight.live</text>
</svg>`
}

// SLIDE 2 — Multi-polyline map (Mapbox basemap with all activity routes overlaid in sport colors)
async function renderMultiMapSvg(req: RenderRequest, env: Env): Promise<string> {
  const W = 1080
  const H = req.orientation === 'story' ? 1920 : 1080
  const p = req.payload
  const day = req.chapterDay
  const activities = (p.activities || []).filter(a => a.polyline && a.polyline.length > 0)
  // Stack day theme — polylines stay in BUCKET_COLOR (sport identity),
  // page chrome adopts NEON.
  const t = resolveTheme(req, 'neon')

  const MAP_X = 40, MAP_Y = 180
  const MAP_W = W - 80
  const MAP_H = req.orientation === 'story' ? 1100 : 620

  let mapDataUrl: string | null = null
  if (activities.length > 0 && env.MAPBOX_TOKEN) {
    try {
      // Build comma-separated path overlays — Mapbox accepts multiple
      const pathSegments = activities.map(a => {
        const color = (BUCKET_COLOR[a.bucket] || '#fc4c02').replace('#', '')
        return `path-6+${color}(${encodeURIComponent(a.polyline as string)})`
      })
      const path = pathSegments.join(',')
      const url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${path}/auto/${Math.round(MAP_W)}x${Math.round(MAP_H)}@2x?access_token=${env.MAPBOX_TOKEN}&padding=60&logo=false&attribution=false`
      const r = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit)
      if (r.ok) {
        const buf = await r.arrayBuffer()
        mapDataUrl = `data:image/png;base64,${arrayBufferToBase64(buf)}`
      }
    } catch (_e) { /* fallback below */ }
  }

  // Legend — show one swatch per sport bucket present
  const presentBuckets = Array.from(new Set(activities.map(a => a.bucket)))
  const PANEL_Y = req.orientation === 'story' ? 1320 : 820
  const legendStartX = 80
  const swatchSize = 18
  const legendGap = 28
  const legendItems = presentBuckets.map((b, i) => {
    const x = legendStartX + i * 180
    const color = BUCKET_COLOR[b] || '#FFFFFF'
    const label = BUCKET_LABEL[b] || b.toUpperCase()
    return `
  <rect x="${x}" y="${PANEL_Y + 70}" width="${swatchSize}" height="${swatchSize}" rx="3" fill="${color}"/>
  <text x="${x + swatchSize + 10}" y="${PANEL_Y + 85}" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 20 : 16}" font-weight="700" fill="${COLORS.text}" letter-spacing="2">${label}</text>`
  }).join('')

  // Per-activity mini-stats grid (under legend)
  const miniY = PANEL_Y + 130
  const miniRowH = 50
  const miniStats = activities.map((a, i) => {
    const y = miniY + i * miniRowH
    const color = BUCKET_COLOR[a.bucket] || '#FFFFFF'
    const stat = a.distanceKm ? `${a.distanceKm.toFixed(1)} km` : `${Math.round(a.durationMin)} min`
    const dur = `${Math.round(a.durationMin)} min`
    return `
  <circle cx="${legendStartX + 6}" cy="${y - 8}" r="6" fill="${color}"/>
  <text x="${legendStartX + 30}" y="${y}" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 22 : 18}" font-weight="500" fill="${t.text}" letter-spacing="1">${escapeXml(a.name).slice(0,40)}</text>
  <text x="${W - 80}" y="${y}" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 22 : 18}" font-weight="700" fill="${t.text}" letter-spacing="1">${stat} · ${dur}</text>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="dim-top" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${t.bg}"/>

  ${mapDataUrl ? `
  <image x="${MAP_X}" y="${MAP_Y}" width="${MAP_W}" height="${MAP_H}" href="${mapDataUrl}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_W}" height="120" fill="url(#dim-top)"/>
  ` : `
  <rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_W}" height="${MAP_H}" fill="#0A0A0A"/>
  <text x="${W / 2}" y="${MAP_Y + MAP_H / 2}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="22" fill="${t.dim}">${activities.length === 0 ? 'No GPS sports today (HR sessions only)' : 'Map unavailable'}</text>
  `}

  <!-- Header -->
  <text x="${W / 2}" y="100" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 32 : 26}" font-weight="700"
        fill="${t.accent}" letter-spacing="6">GPS · ALL ROUTES</text>
  <text x="${W / 2}" y="${req.orientation === 'story' ? 150 : 138}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 22 : 18}" font-weight="500"
        fill="${t.dim}" letter-spacing="4">CHAPTER 02 · ENDURANCE · DAY ${day}</text>

  <!-- Stats panel -->
  <rect x="0" y="${PANEL_Y}" width="${W}" height="${H - PANEL_Y}" fill="${t.bg}"/>

  <!-- Legend label -->
  <text x="80" y="${PANEL_Y + 36}" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 18 : 14}" font-weight="700" fill="${t.dim}" letter-spacing="3">LEGEND</text>
  ${legendItems}

  <!-- Per-activity list -->
  ${miniStats}

  <!-- Footer -->
  <text x="${W / 2}" y="${H - 28}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 18 : 14}" font-weight="500"
        fill="${t.dim}" letter-spacing="5">◆ FIRST LIGHT  ·  firstlight.live</text>
</svg>`
}

// SLIDE 3 — Activity breakdown grid (clean per-activity cards)
function renderMultiGridSvg(req: RenderRequest): string {
  const W = 1080
  const H = req.orientation === 'story' ? 1920 : 1080
  const p = req.payload
  const day = req.chapterDay
  const activities = p.activities || []
  const t = resolveTheme(req, 'neon')

  // 2-col grid for up to 6 activities
  const cols = Math.min(2, activities.length)
  const cardW = (W - 80 - (cols - 1) * 20) / cols
  const cardH = req.orientation === 'story' ? 280 : 220
  const gridStartY = req.orientation === 'story' ? 280 : 220

  const cards = activities.map((a, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = 40 + col * (cardW + 20)
    const y = gridStartY + row * (cardH + 20)
    const color = BUCKET_COLOR[a.bucket] || '#FFFFFF'
    const label = BUCKET_LABEL[a.bucket] || a.type.toUpperCase()
    const stat = a.distanceKm ? `${a.distanceKm.toFixed(1)} KM` : `${Math.round(a.durationMin)} MIN`
    const subStat = a.distanceKm ? `${Math.round(a.durationMin)} MIN` : a.type.toUpperCase()
    const hrLabel = a.averageHr ? `${Math.round(a.averageHr)} BPM` : ''
    const calLabel = a.caloriesKcal ? `${Math.round(a.caloriesKcal)} KCAL` : ''

    return `
  <g>
    <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="14" fill="rgba(255,255,255,0.03)" stroke="${color}" stroke-width="2" stroke-opacity="0.4"/>
    <!-- sport label -->
    <text x="${x + 24}" y="${y + 36}" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 22 : 18}" font-weight="700" fill="${color}" letter-spacing="3">${label}</text>
    <!-- big stat -->
    <text x="${x + cardW/2}" y="${y + 110}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 56 : 44}" font-weight="700" fill="${t.text}" letter-spacing="1">${stat}</text>
    <!-- sub -->
    <text x="${x + cardW/2}" y="${y + 150}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 20 : 16}" font-weight="500" fill="${t.dim}" letter-spacing="3">${subStat}</text>
    <!-- HR + cal at bottom -->
    <text x="${x + 24}" y="${y + cardH - 24}" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 16 : 13}" font-weight="500" fill="${t.dim}" letter-spacing="2">${escapeXml(hrLabel)}</text>
    <text x="${x + cardW - 24}" y="${y + cardH - 24}" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 16 : 13}" font-weight="500" fill="${t.dim}" letter-spacing="2">${escapeXml(calLabel)}</text>
    <!-- name (truncated) -->
    <text x="${x + cardW/2}" y="${y + 180}" text-anchor="middle" font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 16 : 13}" font-weight="500" fill="${t.dim}" letter-spacing="1">${escapeXml(a.name).slice(0,32)}</text>
  </g>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>

  <!-- Header -->
  <text x="${W / 2}" y="100" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 32 : 26}" font-weight="700"
        fill="${t.accent}" letter-spacing="6">THE BREAKDOWN</text>
  <text x="${W / 2}" y="${req.orientation === 'story' ? 150 : 138}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 22 : 18}" font-weight="500"
        fill="${t.dim}" letter-spacing="4">CHAPTER 02 · ENDURANCE · DAY ${day} · ${activities.length} ACTIVITIES</text>

  <!-- Grid -->
  ${cards}

  <!-- Footer -->
  <text x="${W / 2}" y="${H - 50}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${req.orientation === 'story' ? 22 : 18}" font-weight="500"
        fill="${t.dim}" letter-spacing="5">◆ FIRST LIGHT  ·  firstlight.live</text>
</svg>`
}

// SLIDE 4 — Stack Day Summary (only for 5+ activities)
// Big day-complete seal + horizontal sport-time bar chart + closing line.
function renderMultiSummarySvg(req: RenderRequest): string {
  const W = 1080
  const H = req.orientation === 'story' ? 1920 : 1080
  const p = req.payload
  const day = req.chapterDay
  const activities = p.activities || []
  const n = activities.length
  const t = resolveTheme(req, 'neon')

  const totalKm   = (p.totalKm   ?? activities.reduce((s, a) => s + (a.distanceKm || 0), 0)).toFixed(1)
  const totalMin  = Math.round(p.totalMin ?? activities.reduce((s, a) => s + a.durationMin, 0))
  const totalKcal = Math.round(p.totalKcal ?? activities.reduce((s, a) => s + (a.caloriesKcal || 0), 0))
  const h = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  const timeStr = h > 0 ? `${h}h ${mm}m` : `${mm}m`

  // Distinct sport types
  const sportSet = new Set(activities.map(a => a.bucket))

  // Bar chart — one row per sport, width proportional to total minutes in that sport.
  // Aggregate minutes per bucket.
  const bucketMins: Record<string, { mins: number; label: string; color: string }> = {}
  for (const a of activities) {
    const k = a.bucket
    if (!bucketMins[k]) {
      bucketMins[k] = { mins: 0, label: BUCKET_LABEL[k] || k.toUpperCase(), color: BUCKET_COLOR[k] || '#FFFFFF' }
    }
    bucketMins[k].mins += a.durationMin
  }
  const buckets = Object.entries(bucketMins).sort((a, b) => b[1].mins - a[1].mins)
  const maxMin = Math.max(...buckets.map(b => b[1].mins), 1)

  const chartX = 80
  const chartW = W - 160
  const labelW = 180
  const barAreaX = chartX + labelW
  const barAreaW = chartW - labelW - 130   // leave room on right for min count
  const isStory = req.orientation === 'story'
  const barH = isStory ? 56 : 44
  const barGap = isStory ? 22 : 18
  const chartStartY = isStory ? 720 : 470

  const bars = buckets.map(([key, b], i) => {
    const y = chartStartY + i * (barH + barGap)
    const w = Math.max(20, (b.mins / maxMin) * barAreaW)
    return `
  <text x="${chartX}" y="${y + barH * 0.65}" font-family="'Roboto Mono', monospace" font-size="${isStory ? 26 : 22}" font-weight="700" fill="${b.color}" letter-spacing="3">${b.label}</text>
  <rect x="${barAreaX}" y="${y}" width="${barAreaW}" height="${barH}" rx="6" fill="rgba(255,255,255,0.04)"/>
  <rect x="${barAreaX}" y="${y}" width="${w}" height="${barH}" rx="6" fill="${b.color}" fill-opacity="0.85"/>
  <text x="${W - 80}" y="${y + barH * 0.65}" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="${isStory ? 24 : 20}" font-weight="700" fill="${t.text}" letter-spacing="1">${Math.round(b.mins)} MIN</text>`
  }).join('')

  // Day-complete seal: big check inside a glowing circle
  const sealCx = W / 2
  const sealCy = isStory ? 360 : 240
  const sealR = isStory ? 110 : 90

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="halo" cx="50%" cy="20%" r="60%">
      <stop offset="0%" stop-color="${t.halo}"/>
      <stop offset="100%" stop-color="${t.bg}" stop-opacity="0"/>
    </radialGradient>
    <filter id="seal-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#halo)"/>

  <!-- Header -->
  <text x="${W / 2}" y="${isStory ? 130 : 100}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${isStory ? 32 : 26}" font-weight="700"
        fill="${t.accent}" letter-spacing="6">STACK DAY · COMPLETE</text>
  <text x="${W / 2}" y="${isStory ? 180 : 138}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${isStory ? 22 : 18}" font-weight="500"
        fill="${t.dim}" letter-spacing="4">CHAPTER 02 · ENDURANCE · DAY ${day}</text>

  <!-- Seal -->
  <g filter="url(#seal-glow)">
    <circle cx="${sealCx}" cy="${sealCy}" r="${sealR}" fill="none" stroke="${t.accent2}" stroke-width="6"/>
    <path d="M${sealCx - sealR * 0.45},${sealCy + sealR * 0.05} L${sealCx - sealR * 0.10},${sealCy + sealR * 0.40} L${sealCx + sealR * 0.55},${sealCy - sealR * 0.40}" fill="none" stroke="${t.accent2}" stroke-width="${isStory ? 14 : 11}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- Combined totals -->
  <text x="${W / 2}" y="${sealCy + sealR + 80}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${isStory ? 36 : 30}" font-weight="700"
        fill="${t.text}" letter-spacing="2">${n} ACTIVITIES  ·  ${totalKm} KM  ·  ${timeStr}</text>
  <text x="${W / 2}" y="${sealCy + sealR + 120}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${isStory ? 22 : 18}" font-weight="500"
        fill="${t.dim}" letter-spacing="4">${totalKcal} KCAL  ·  ${sportSet.size} DISCIPLINES</text>

  <!-- Bar chart label -->
  <text x="${chartX}" y="${chartStartY - 30}" font-family="'Roboto Mono', monospace" font-size="${isStory ? 18 : 14}" font-weight="700" fill="${t.dim}" letter-spacing="3">TIME PER SPORT</text>

  <!-- Bars -->
  ${bars}

  <!-- Closing line -->
  <text x="${W / 2}" y="${H - (isStory ? 180 : 140)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${isStory ? 28 : 22}" font-weight="700"
        fill="${t.accent}" letter-spacing="3">THE BODY ANSWERED.</text>
  <text x="${W / 2}" y="${H - (isStory ? 130 : 102)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${isStory ? 18 : 15}" font-weight="500"
        fill="${t.dim}" letter-spacing="3">Rs 1,500 STAYS · STREAK CONTINUES · DAY ${day + 1} LOADING</text>

  <!-- Footer brand -->
  <text x="${W / 2}" y="${H - (isStory ? 60 : 50)}" text-anchor="middle"
        font-family="'Roboto Mono', monospace" font-size="${isStory ? 22 : 18}" font-weight="500"
        fill="${t.dim}" letter-spacing="5">◆ FIRST LIGHT  ·  firstlight.live</text>
</svg>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(), ...extraHeaders }
  })
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-render-key, x-admin-key, x-folder, x-filename-prefix, x-ts'
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
