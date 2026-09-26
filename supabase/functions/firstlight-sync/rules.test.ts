import { evaluateRulesCheckin } from './rules.ts'

Deno.test('missing food check-in creates no violation or debt', () => {
  const result = evaluateRulesCheckin({})
  if (result.violations.length !== 0) throw new Error('Missing marks became violations')
  if (result.unconfirmed.join(',') !== 'screens,food,night') throw new Error('Missing marks were not reported')
})

Deno.test('only an explicitly broken food rule creates a 50 km violation', () => {
  const result = evaluateRulesCheckin({ screens: 'clean', food: 'broken' })
  if (result.violations.length !== 1 || result.violations[0].km !== 50 ||
      result.violations[0].rule !== 'FOOD CODE — RULE 02') {
    throw new Error('Food classification or penalty is wrong')
  }
  if (result.unconfirmed.join(',') !== 'night') throw new Error('Night rule should stay unknown')
})

Deno.test('an explicit screens break keeps its selected distance', () => {
  const result = evaluateRulesCheckin({ screens: 'broken', screensKm: 200, food: 'clean', night: 'clean' })
  if (result.violations.length !== 1 || result.violations[0].km !== 200) {
    throw new Error('Screens penalty changed')
  }
})
