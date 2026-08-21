// Runs the VERBATIM emailResetReminder logic (copied from firstlight-sync/index.ts)
// against mocked supaAdmin + _sendEmail + a faked IST clock. Run: deno run --no-check
// A separate Node check asserts this copy still matches index.ts (anti-drift).

// ── test doubles (assigned per scenario) ──
// deno-lint-ignore no-explicit-any
let supaAdmin: any;
let sentEmails: Array<{ subject: string; html: string; text: string }> = [];
async function _sendEmail(subject: string, html: string, text: string) { sentEmails.push({ subject, html, text }); return { id: 'mock' }; }

// ══════════ VERBATIM from index.ts (do not edit) ══════════
function _istDateStr(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
function _istHour(): number {
  return parseInt(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }).slice(0, 2), 10)
}
async function emailResetReminder() {
  const { data: stRows } = await supaAdmin.from('reset_state').select('start_date').eq('id', 'me').limit(1)
  const start = ((stRows && stRows[0] && stRows[0].start_date) as string) || _istDateStr(0)
  const today = _istDateStr(0)
  const yesterday = _istDateStr(-1)
  if (yesterday < start) return { sent: false, reason: 'before protocol start', today }

  const { data: dayRows } = await supaAdmin.from('reset_days').select('d,clean').gte('d', start).lte('d', yesterday)
  const { data: relRows } = await supaAdmin.from('reset_relapses').select('occurred_on').gte('occurred_on', start).lte('occurred_on', yesterday)
  const cleanSet = new Set<string>(((dayRows || []) as Array<{ d: string; clean: boolean }>).filter(r => r.clean).map(r => r.d))
  const relSet = new Set<string>(((relRows || []) as Array<{ occurred_on: string }>).map(r => r.occurred_on))

  const atRisk: string[] = []
  let d = start, guard = 0
  while (d <= yesterday && guard < 800) {
    if (!cleanSet.has(d) && !relSet.has(d)) atRisk.push(d)
    d = new Date(new Date(d + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
    guard++
  }
  if (atRisk.length === 0) return { sent: false, reason: 'nothing at risk — all days confirmed or logged', today }

  const final = _istHour() >= 11
  const imminent = atRisk[atRisk.length - 1]   // closest to today — its deadline is noon today
  const older = atRisk.length - 1
  const when = final ? 'in ~30 minutes (12:00 noon IST)' : 'at 12:00 noon IST today'
  const subject = final
    ? `[RESET] ⚠ Noon deadline — confirm ${imminent} clean now`
    : `[RESET] Confirm ${imminent} clean before noon`
  const olderLine = older > 0
    ? `<p style="color:#FF8A8A;font-size:13px;margin:0 0 12px">Plus ${older} earlier day${older > 1 ? 's' : ''} still unconfirmed — already overdue.</p>` : ''

  const html = `<!DOCTYPE html>...${imminent}...${olderLine}...<a href="https://firstlight.live/reset.html">CONFIRM</a>`
  const text = `RESET — ${imminent} isn't confirmed clean. Auto-logs as a relapse ${when} (streak → 0, 50 km walk + 200 km cycle in 7 days, one starts tonight). Confirm: https://firstlight.live/reset.html`

  await _sendEmail(subject, html, text)
  return { sent: true, stage: final ? 'final' : 'early', imminent, atRisk: atRisk.length }
}
// ══════════ end verbatim ══════════

// ── clock control ──
// deno-lint-ignore no-explicit-any
const RealDate: any = Date
function istEpoch(y: number, m: number, d: number, H: number, M: number) { return RealDate.UTC(y, m - 1, d, H, M) - 5.5 * 3600 * 1000 }
function setClock(ms: number) {
  // deno-lint-ignore no-explicit-any
  const FD: any = function (...a: any[]) { return a.length === 0 ? new RealDate(ms) : new RealDate(...a) }
  FD.now = () => ms; FD.UTC = RealDate.UTC; FD.parse = RealDate.parse; FD.prototype = RealDate.prototype
  ;(globalThis as any).Date = FD
}
function istStr(ms: number, off = 0) { return new RealDate(ms + off * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }

// ── mock supaAdmin over a per-scenario dataset ──
// deno-lint-ignore no-explicit-any
function makeSupa(data: any) {
  return {
    from(table: string) {
      const f: any = {}
      const api: any = {
        select() { return api }, eq(k: string, v: any) { f[k] = v; return api },
        gte(k: string, v: any) { f['gte_' + k] = v; return api }, lte(k: string, v: any) { f['lte_' + k] = v; return api },
        limit() { return api },
        then(res: any) {
          let rows: any[] = []
          if (table === 'reset_state') rows = data.start_date ? [{ start_date: data.start_date }] : []
          else if (table === 'reset_days') rows = (data.days || []).filter((r: any) => r.d >= f.gte_d && r.d <= f.lte_d)
          else if (table === 'reset_relapses') rows = (data.relapses || []).filter((r: any) => r.occurred_on >= f.gte_occurred_on && r.occurred_on <= f.lte_occurred_on)
          res({ data: rows })
        },
      }
      return api
    },
  }
}

const results: Array<{ name: string; pass: boolean; detail?: string }> = []
const check = (name: string, cond: boolean, detail = '') => results.push({ name, pass: !!cond, detail })

async function run() {
  // ── UNIT — _istDateStr / _istHour boundaries (isolated) ──
  {
    setClock(istEpoch(2026, 8, 16, 8, 30))
    check('U1 _istDateStr(0) = today', _istDateStr(0) === '2026-08-16', _istDateStr(0))
    check('U2 _istDateStr(-1) = yesterday', _istDateStr(-1) === '2026-08-15', _istDateStr(-1))
    check('U3 _istHour @08:30 = 8', _istHour() === 8, String(_istHour()))
    setClock(RealDate.UTC(2026, 7, 16, 20, 0))   // UTC Aug-16 20:00 == IST Aug-17 01:30
    check('U4 _istDateStr rollover UTC→IST = Aug 17', _istDateStr(0) === '2026-08-17', _istDateStr(0))
    check('U5 _istHour rollover = 1', _istHour() === 1, String(_istHour()))
    setClock(istEpoch(2026, 8, 16, 11, 0)); check('U6 _istHour 11:00 = 11 (stage cutoff)', _istHour() === 11, String(_istHour()))
    setClock(istEpoch(2026, 8, 16, 10, 59)); check('U7 _istHour 10:59 = 10', _istHour() === 10, String(_istHour()))
  }
  // ── S7 — stage boundary is exactly 11:00 ──
  {
    const a = istEpoch(2026, 8, 16, 11, 0); setClock(a)
    supaAdmin = makeSupa({ start_date: istStr(a, -1), days: [], relapses: [] }); sentEmails = []
    const r: any = await emailResetReminder(); check('S7a 11:00 → stage=final', r.stage === 'final', r.stage)
    const b = istEpoch(2026, 8, 16, 10, 59); setClock(b)
    supaAdmin = makeSupa({ start_date: istStr(b, -1), days: [], relapses: [] }); sentEmails = []
    const r2: any = await emailResetReminder(); check('S7b 10:59 → stage=early', r2.stage === 'early', r2.stage)
  }
  // S1 — nothing at risk (yesterday confirmed clean) → no email
  {
    const ms = istEpoch(2026, 8, 16, 8, 0); setClock(ms)
    const start = istStr(ms, -6), y = istStr(ms, -1)
    const days = []; for (let i = -6; i <= -1; i++) days.push({ d: istStr(ms, i), clean: true })
    supaAdmin = makeSupa({ start_date: start, days, relapses: [] }); sentEmails = []
    const r: any = await emailResetReminder()
    check('S1 safe: sent=false', r.sent === false, JSON.stringify(r))
    check('S1 safe: reason nothing-at-risk', /nothing at risk/.test(r.reason || ''), r.reason)
    check('S1 safe: NO email sent', sentEmails.length === 0, 'emails=' + sentEmails.length)
  }
  // S2 — yesterday at risk, before noon → early stage email
  {
    const ms = istEpoch(2026, 8, 16, 8, 0); setClock(ms)
    const start = istStr(ms, -1), y = istStr(ms, -1)
    supaAdmin = makeSupa({ start_date: start, days: [], relapses: [] }); sentEmails = []
    const r: any = await emailResetReminder()
    check('S2 risk: sent=true', r.sent === true, JSON.stringify(r))
    check('S2 risk: stage=early (before noon)', r.stage === 'early', r.stage)
    check('S2 risk: imminent=yesterday', r.imminent === y, r.imminent + ' vs ' + y)
    check('S2 risk: atRisk=1', r.atRisk === 1, String(r.atRisk))
    check('S2 risk: one email', sentEmails.length === 1, '')
    check('S2 risk: subject names the day', (sentEmails[0]?.subject || '').includes(y), sentEmails[0]?.subject)
    check('S2 risk: text says noon today', /noon IST today/.test(sentEmails[0]?.text || ''), '')
  }
  // S3 — same, after 11:00 → final stage
  {
    const ms = istEpoch(2026, 8, 16, 11, 30); setClock(ms)
    supaAdmin = makeSupa({ start_date: istStr(ms, -1), days: [], relapses: [] }); sentEmails = []
    const r: any = await emailResetReminder()
    check('S3 final: stage=final (hour>=11)', r.stage === 'final', r.stage)
    check('S3 final: subject has warning ⚠', (sentEmails[0]?.subject || '').includes('⚠'), sentEmails[0]?.subject)
    check('S3 final: text says ~30 minutes', /~30 minutes/.test(sentEmails[0]?.text || ''), '')
  }
  // S4 — before protocol start (start=today) → no email
  {
    const ms = istEpoch(2026, 8, 16, 8, 0); setClock(ms)
    supaAdmin = makeSupa({ start_date: istStr(ms, 0), days: [], relapses: [] }); sentEmails = []
    const r: any = await emailResetReminder()
    check('S4 pre-start: sent=false', r.sent === false, JSON.stringify(r))
    check('S4 pre-start: reason before-start', /before protocol start/.test(r.reason || ''), r.reason)
    check('S4 pre-start: NO email', sentEmails.length === 0, '')
  }
  // S5 — multiple gaps → imminent=yesterday, older count reported
  {
    const ms = istEpoch(2026, 8, 16, 9, 0); setClock(ms)
    const start = istStr(ms, -4), y = istStr(ms, -1)   // 4 days: -4..-1
    supaAdmin = makeSupa({ start_date: start, days: [], relapses: [] }); sentEmails = []
    const r: any = await emailResetReminder()
    check('S5 gaps: atRisk=4', r.atRisk === 4, String(r.atRisk))
    check('S5 gaps: imminent=yesterday', r.imminent === y, r.imminent)
    check('S5 gaps: html mentions "Plus 3 earlier"', /Plus 3 earlier day/.test(sentEmails[0]?.html || ''), '')
  }
  // S6 — yesterday already has a relapse logged → not at risk
  {
    const ms = istEpoch(2026, 8, 16, 8, 0); setClock(ms)
    const start = istStr(ms, -1), y = istStr(ms, -1)
    supaAdmin = makeSupa({ start_date: start, days: [], relapses: [{ occurred_on: y }] }); sentEmails = []
    const r: any = await emailResetReminder()
    check('S6 already-logged: sent=false', r.sent === false, JSON.stringify(r))
    check('S6 already-logged: NO email', sentEmails.length === 0, '')
  }

  console.log('\n===== emailResetReminder — Deno (verbatim logic) tests =====')
  results.forEach(r => console.log((r.pass ? '  ✅ ' : '  ❌ ') + r.name + (r.pass ? '' : '   → ' + r.detail)))
  const pass = results.filter(r => r.pass).length, fail = results.length - pass
  console.log(`\n  ${pass}/${results.length} passed, ${fail} failed`)
  ;(globalThis as any).Date = RealDate
  if (fail) Deno.exit(1)
}
run()
