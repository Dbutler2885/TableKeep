import { expect, it } from 'vitest'
import type { LubecEffect } from './effects'
import { lubecUnconsciousCards } from './stageRestrictions'

it('reads only current explicit unconscious restrictions, keeping separate cards independent', () => {
  const step = { modifiers: [], labels: [], restrictions: [{ kind: 'unconscious' as const }] }
  const card: LubecEffect = { id: 'one', name: 'Unconscious', cause: '', steps: [step] }
  const future = { ...card, id: 'future', steps: [{ modifiers: [], labels: ['Unconscious later'] }, step] }
  const converted = { ...card, id: 'converted', afterCombat: {} }
  expect(lubecUnconsciousCards([card, { ...card, id: 'two' }, future, converted, { ...card, steps: [] }]).map((entry) => entry.id)).toEqual(['one', 'two'])
})
