// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CombatStepper } from './CombatParts'

afterEach(cleanup)

describe('the fight window stepper', () => {
  it('marks the steps before the current one done', () => {
    const { container } = render(<CombatStepper steps={['Movement', 'Declare', 'Attack']} now={1} />)
    expect([...container.querySelectorAll('li')].map((step) => step.className)).toEqual(['done', 'now', ''])
  })
})
