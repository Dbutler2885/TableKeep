// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { ruleSets } from '../ruleSets/registry'
import { MapRuleSetContext, useMapRuleSet } from './mapRuleSet'

afterEach(() => {
  cleanup()
})

describe('the map rule set', () => {
  it.each(['ose', 'vtm'] as const)('reads the %s rule set the Maps panel provides', (id) => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MapRuleSetContext value={ruleSets[id]}>{children}</MapRuleSetContext>
    )
    expect(renderHook(() => useMapRuleSet(), { wrapper }).result.current).toBe(ruleSets[id])
  })

  it('refuses to guess a rule set outside the Maps panel', () => {
    expect(() => renderHook(() => useMapRuleSet())).toThrow('useMapRuleSet must be used inside the Maps panel')
  })
})
