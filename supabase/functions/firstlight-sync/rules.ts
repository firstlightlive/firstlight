export type RulesCheckin = {
  screens?: string
  food?: string
  night?: string
  screensKm?: number
}

export type RuleViolation = { rule: string; km: number; note: string }

// A missing mark is unknown, never evidence that a rule was broken.
export function evaluateRulesCheckin(chk: RulesCheckin): {
  violations: RuleViolation[]
  unconfirmed: Array<'screens' | 'food' | 'night'>
} {
  const unconfirmed = (['screens', 'food', 'night'] as const)
    .filter(k => chk[k] !== 'clean' && chk[k] !== 'broken')
  const violations: RuleViolation[] = []
  if (chk.screens === 'broken') {
    const screensKm = Math.max(1, Math.min(999, Math.round(Number(chk.screensKm) || 50)))
    violations.push({ rule: 'SCREENS — RULE 01', km: screensKm, note: 'Marked broken.' })
  }
  if (chk.food === 'broken') violations.push({ rule: 'FOOD CODE — RULE 02', km: 50, note: 'Marked broken.' })
  if (chk.night === 'broken') violations.push({ rule: 'NIGHT FOOD — RULE 03', km: 50, note: 'Marked broken.' })
  return { violations, unconfirmed }
}
